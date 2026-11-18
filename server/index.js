// Scratchpad backend: runs code with the runtimes installed on this machine,
// records step-by-step debug traces for Java / C / C++, and brokers the
// GitHub OAuth sign-in. It executes arbitrary code, so by default it only
// listens on localhost. Put it behind a sandbox before exposing it publicly.
import express from 'express';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableLanguages, debugCode, runCode } from './exec.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Minimal .env loader (KEY=value lines), so no extra dependency is needed.
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const extraOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

function originAllowed(origin, req) {
  if (!origin) return false;
  if (extraOrigins.includes(origin)) return true;
  if (req && origin === `${req.protocol}://${req.get('host')}`) return true;
  try {
    const u = new URL(origin);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));

app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin) {
    if (!originAllowed(origin, req)) return res.status(403).json({ error: `Origin ${origin} is not allowed. Add it to ALLOWED_ORIGINS.` });
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, languages: await availableLanguages(), github: Boolean(CLIENT_ID && CLIENT_SECRET) });
});

// One execution at a time per kind keeps a laptop responsive.
let active = 0;
const MAX_ACTIVE = Number(process.env.MAX_CONCURRENT || 4);
function guarded(fn) {
  return async (req, res) => {
    const { language, code, stdin } = req.body || {};
    if (typeof language !== 'string' || typeof code !== 'string') return res.status(400).json({ error: 'language and code are required' });
    if (active >= MAX_ACTIVE) return res.status(429).json({ error: 'Too many runs in progress, try again in a moment.' });
    active++;
    try {
      res.json(await fn(language, code, typeof stdin === 'string' ? stdin : ''));
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    } finally {
      active--;
    }
  };
}
app.post('/api/run', guarded(runCode));
app.post('/api/debug', guarded(debugCode));

// ---- GitHub OAuth (standard web flow, popup based) ----
const pending = new Map(); // state -> { origin, expires }
function page(body) {
  return `<!doctype html><meta charset="utf-8"><title>Scratchpad · GitHub</title><body style="font:15px system-ui;background:#0f1218;color:#e6e9ef;padding:40px">${body}</body>`;
}

app.get('/api/github/login', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(501).send(page('GitHub sign-in is not configured on this server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env.'));
  const origin = String(req.query.origin || '');
  if (!originAllowed(origin, req)) return res.status(403).send(page('This origin is not allowed to sign in.'));
  for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k);
  const state = crypto.randomBytes(24).toString('hex');
  pending.set(state, { origin, expires: Date.now() + 10 * 60_000 });
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('scope', 'repo');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', `${base}/api/github/callback`);
  res.redirect(url.toString());
});

app.get('/api/github/callback', async (req, res) => {
  const entry = pending.get(String(req.query.state || ''));
  pending.delete(String(req.query.state || ''));
  if (!entry || entry.expires < Date.now()) return res.status(400).send(page('Sign-in expired. Close this window and try again.'));
  if (req.query.error) return res.send(page(`GitHub sign-in was cancelled (${String(req.query.error).replace(/[<>&]/g, '')}). You can close this window.`));
  try {
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: req.query.code }),
    });
    const data = await r.json();
    if (!data.access_token) throw new Error(data.error_description || data.error || 'no token returned');
    const msg = JSON.stringify({ source: 'algodesk-github', token: data.access_token }).replace(/</g, '\\u003c');
    res.send(page(`Connected. You can close this window.<script>
      if (window.opener) { window.opener.postMessage(${msg}, ${JSON.stringify(entry.origin)}); window.close(); }
    </script>`));
  } catch (e) {
    res.status(502).send(page(`Could not complete GitHub sign-in: ${String(e.message).replace(/[<>&]/g, '')}`));
  }
});

// ---- Static frontend (after `npm run build`) ----
const dist = join(root, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(PORT, HOST, () => {
  console.log(`Scratchpad server listening on http://${HOST}:${PORT}`);
  availableLanguages().then((l) => console.log('Runtimes found:', Object.keys(l).filter((k) => l[k].run).join(', ') || 'none'));
});
