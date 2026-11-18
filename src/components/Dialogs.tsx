import { CloudDownload, CloudUpload, X } from 'lucide-react';
import GithubIcon from './GithubIcon';
import { useEffect, useState, type ReactNode } from 'react';
import * as github from '../github';
import { LANGUAGES } from '../languages';
import { persistStorage, storageStatus, type StorageStatus } from '../storage';
import { useStore } from '../store';
import type { LangId } from '../types';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function GitHubDialog({ onClose }: { onClose: () => void }) {
  const server = useStore((s) => s.server);
  const settings = useStore((s) => s.settings);
  const [user, setUser] = useState<github.GitHubUser | null>(null);
  const [connected, setConnected] = useState(Boolean(github.getToken()));
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: ReactNode } | null>(null);
  const s = useStore.getState();

  useEffect(() => {
    void s.refreshServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!connected) return setUser(null);
    github.getUser().then(setUser).catch((e) => {
      setConnected(Boolean(github.getToken()));
      setMsg({ ok: false, text: e.message });
    });
  }, [connected]);

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      setConnected(Boolean(github.getToken()));
    }
    setBusy('');
  };

  const doPush = () => act('push', async () => {
    const res = await github.push(settings.githubRepo, await s.exportBackup());
    s.updateSettings({ lastSync: Date.now() });
    setMsg({
      ok: true,
      text: (
        <>
          {res.changed ? `Pushed ${res.files} files to ` : 'Already up to date: '}
          <a href={res.url} target="_blank" rel="noreferrer">{res.url.replace('https://github.com/', '')}</a>
        </>
      ),
    });
  });
  const doPull = () => act('pull', async () => {
    const backup = await github.pull(settings.githubRepo);
    if (!confirm(`Replace everything in this browser with the copy on GitHub (${backup.problems.length} problems, saved ${backup.exportedAt.slice(0, 10)})?`)) return;
    await s.importBackup(backup);
    s.updateSettings({ lastSync: Date.now() });
    setMsg({ ok: true, text: 'Restored from GitHub.' });
  });

  const callback = `${settings.backendUrl ? settings.backendUrl.replace(/\/+$/, '') : location.origin}/api/github/callback`;

  return (
    <Modal title="GitHub sync" onClose={onClose}>
      {connected ? (
        <>
          <div className="gh-user">
            {user ? <img src={user.avatar_url} alt="" width={36} height={36} /> : <span className="avatar-ph" />}
            <div>
              <strong>{user ? user.login : 'Connected'}</strong>
              <div className="muted">{settings.lastSync ? `Last synced ${new Date(settings.lastSync).toLocaleString()}` : 'Not synced yet'}</div>
            </div>
            <span className="spacer" />
            <button className="btn" onClick={() => { github.clearToken(); setConnected(false); setMsg(null); }}>Disconnect</button>
          </div>
          <label className="field">
            <span>Repository (created as private if it does not exist)</span>
            <div className="repo-input">
              <span className="muted">{user ? `${user.login} /` : '… /'}</span>
              <input className="input" value={settings.githubRepo} onChange={(e) => s.updateSettings({ githubRepo: e.target.value.trim() })} spellCheck={false} />
            </div>
          </label>
          <p className="muted small">
            Push writes one commit with a folder per problem (solution files with their notes, and drawings), a README with your progress, and a full backup that
            Pull restores from on any device.
          </p>
          <div className="modal-actions">
            <button className="btn" disabled={Boolean(busy)} onClick={doPull}>
              <CloudDownload size={15} /> {busy === 'pull' ? 'Pulling…' : 'Pull from GitHub'}
            </button>
            <button className="btn btn-run" disabled={Boolean(busy)} onClick={doPush}>
              <CloudUpload size={15} /> {busy === 'push' ? 'Pushing…' : 'Push to GitHub'}
            </button>
          </div>
        </>
      ) : server === null ? (
        <>
          <p>GitHub sign-in goes through the Scratchpad server, which is not reachable right now.</p>
          <p className="muted">Start it with <code>npm run dev</code> (or <code>npm run server</code>), then reopen this dialog. If it runs somewhere else, set its address in Settings.</p>
        </>
      ) : !server.github ? (
        <>
          <p>One-time setup: the server needs a GitHub OAuth app so it can show the normal “Authorize” screen.</p>
          <ol className="steps">
            <li>Open <a href="https://github.com/settings/developers" target="_blank" rel="noreferrer">GitHub → Settings → Developer settings → OAuth Apps</a> and choose <em>New OAuth App</em>.</li>
            <li>Set <em>Authorization callback URL</em> to <code>{callback}</code> (any name and homepage URL work).</li>
            <li>Copy the Client ID, generate a client secret, and put both in the <code>.env</code> file next to <code>package.json</code>:
              <pre className="snippet">GITHUB_CLIENT_ID=…{'\n'}GITHUB_CLIENT_SECRET=…</pre>
            </li>
            <li>Restart the server and reopen this dialog.</li>
          </ol>
          <div className="modal-actions">
            <button className="btn" onClick={() => void s.refreshServer()}>Check again</button>
          </div>
        </>
      ) : (
        <>
          <p>Connect your GitHub account to back up your solutions, drawings, notes and progress to a repository, and restore them on another device.</p>
          <div className="modal-actions center">
            <button className="btn btn-gh" disabled={Boolean(busy)} onClick={() => act('connect', async () => { await github.connect(settings.backendUrl); setConnected(true); })}>
              <GithubIcon size={16} /> {busy === 'connect' ? 'Waiting for GitHub…' : 'Connect GitHub'}
            </button>
          </div>
        </>
      )}
      {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </Modal>
  );
}

const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/** Whether the browser may clear this site's data, and how much it uses. */
function SavedData() {
  const [st, setSt] = useState<StorageStatus | null>(null);
  const [asked, setAsked] = useState(false);
  const refresh = () => void storageStatus().then(setSt);
  useEffect(refresh, []);
  if (!st) return null;

  const ask = async () => {
    await persistStorage();
    setAsked(true);
    refresh();
  };
  const used = st.usage !== undefined ? ` Using ${size(st.usage)}.` : '';
  return (
    <div className="runtimes" style={{ marginBottom: 12 }}>
      <div className="debug-h">Saved data</div>
      <div className="runtime">
        <span className={`dot ${st.persisted ? 'ok' : 'off'}`} />
        <span className="muted" style={{ flex: 1 }}>
          {st.persisted === true
            ? `Protected: your problems, code and drawings are stored in this browser and it won't clear them to free up space.${used}`
            : st.persisted === false
              ? `Not protected: the browser may clear your work if the disk runs low.${used}${asked ? ' The browser declined; it usually agrees once you use the site more, bookmark it or install it as an app.' : ''}`
              : `This browser can't say whether it might clear your work.${used}`}
        </span>
        {st.persisted === false && (
          <button className="btn" onClick={ask}>Protect</button>
        )}
      </div>
      <div className="muted small" style={{ margin: '4px 12px 0' }}>
        Clearing this site's data in the browser still deletes everything. Download a backup (top bar) to keep a copy.
      </div>
    </div>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const server = useStore((s) => s.server);
  const [url, setUrl] = useState(settings.backendUrl);
  const s = useStore.getState();

  useEffect(() => {
    void s.refreshServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.backendUrl]);

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="field-row">
        <label className="field" style={{ flex: 1 }}>
          <span>Default language for new problems</span>
          <select className="select" value={settings.defaultLanguage} onChange={(e) => s.updateSettings({ defaultLanguage: e.target.value as LangId })}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '0 0 130px' }}>
          <span>Theme</span>
          <select className="select" value={settings.theme} onChange={(e) => s.updateSettings({ theme: e.target.value as 'dark' | 'light' })}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Server address (leave empty when the server serves this page)</span>
        <div className="repo-input">
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:8787" spellCheck={false} />
          <button className="btn" onClick={() => s.updateSettings({ backendUrl: url.trim() })} disabled={url.trim() === settings.backendUrl}>Apply</button>
        </div>
      </label>
      <SavedData />
      <div className="runtimes">
        <div className="debug-h">Where each language runs</div>
        {LANGUAGES.map((l) => {
          const info = server?.languages[l.id];
          const inBrowser = l.runs === 'browser';
          const ok = inBrowser || Boolean(info?.run);
          const text = inBrowser ? 'in this browser' : server === null ? 'server offline' : info?.run ? 'on the server' : 'not installed on the server';
          const dbg = !l.debug ? 'run only' : l.debug === 'browser' || info?.debug ? 'run + debug' : server === null ? 'run + debug when the server is up' : 'run only (debugger tools missing)';
          return (
            <div className="runtime" key={l.id}>
              <span className={`dot ${ok ? 'ok' : 'off'}`} />
              <span className="rt-name">{l.label}</span>
              <span className="muted">{text}</span>
              <span className="spacer" />
              <span className="muted">{dbg}</span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
