// GitHub sign-in (OAuth popup through the Scratchpad server) and sync.
// A push writes one commit containing readable files per problem plus a
// full backup that "pull" restores from.
import { slugify } from './data/problems';
import { LANG_BY_ID, LANGUAGES } from './languages';
import { apiBase } from './runners';
import { isBackup, normalizeWorkspace, type Backup } from './storage';
import { SCRATCH_ID } from './store';
import type { LangId } from './types';

const TOKEN_KEY = 'algodesk.github.token';
const BACKUP_PATH = '.algodesk/backup.json';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export interface GitHubUser {
  login: string;
  avatar_url: string;
}

/** Opens the GitHub authorisation popup and resolves once access is granted. */
export function connect(backendUrl: string): Promise<void> {
  const base = apiBase(backendUrl);
  const serverOrigin = base ? new URL(base).origin : location.origin;
  const w = 560;
  const h = 720;
  const popup = window.open(
    `${base}/api/github/login?origin=${encodeURIComponent(location.origin)}`,
    'algodesk-github',
    `width=${w},height=${h},left=${Math.max(0, (screen.width - w) / 2)},top=${Math.max(0, (screen.height - h) / 2)}`,
  );
  return new Promise((resolve, reject) => {
    if (!popup) return reject(new Error('The sign-in window was blocked. Allow pop-ups for this site and try again.'));
    const done = (fn: () => void) => {
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      fn();
    };
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== serverOrigin || ev.data?.source !== 'algodesk-github' || typeof ev.data.token !== 'string') return;
      localStorage.setItem(TOKEN_KEY, ev.data.token);
      done(resolve);
    };
    const poll = setInterval(() => {
      if (popup.closed) done(() => reject(new Error('Sign-in was cancelled.')));
    }, 500);
    window.addEventListener('message', onMessage);
  });
}

class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function gh<T>(path: string, init: RequestInit = {}, accept = 'application/vnd.github+json'): Promise<T> {
  const token = getToken();
  if (!token) throw new GitHubError(401, 'Not connected to GitHub.');
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Accept: accept, Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (r.status === 401) {
    clearToken();
    throw new GitHubError(401, 'GitHub access expired or was revoked. Connect again.');
  }
  if (!r.ok) {
    let msg = `GitHub responded with ${r.status}`;
    try {
      msg = (await r.json()).message || msg;
    } catch {
      /* keep the generic message */
    }
    throw new GitHubError(r.status, msg);
  }
  return (accept.includes('raw') ? r.text() : r.json()) as Promise<T>;
}

export const getUser = () => gh<GitHubUser>('/user');

const validRepo = (name: string) => /^[A-Za-z0-9._-]{1,100}$/.test(name);

/** Human-readable files for the repository, keyed by path. */
export function buildFiles(backup: Backup): Record<string, string> {
  const files: Record<string, string> = {};
  const byId = new Map(backup.problems.map((p) => [p.id, p]));
  for (const raw of backup.workspaces) {
    const ws = normalizeWorkspace(raw);
    const p = byId.get(ws.id);
    if (!p && ws.id !== SCRATCH_ID) continue;
    const dir = p ? `problems/${slugify(p.topic) || 'misc'}/${p.number ? `${String(p.number).padStart(4, '0')}-` : ''}${slugify(p.title) || p.id}` : 'scratchpad';
    const used = new Set<string>();
    const unique = (base: string, ext: string) => {
      let name = `${base}.${ext}`;
      for (let n = 2; used.has(name); n++) name = `${base}-${n}.${ext}`;
      used.add(name);
      return `${dir}/${name}`;
    };
    const title = p ? p.title : 'Free practice';
    for (const f of ws.files) {
      const single = ws.files.length === 1;
      const base = single ? 'solution' : slugify(f.name) || 'file';
      for (const [lang, code] of Object.entries(f.code)) {
        const def = LANG_BY_ID[lang as LangId];
        if (def && code && code.trim() && code !== def.template) files[unique(base, def.ext)] = code;
      }
      if (f.notes.trim()) {
        files[unique(single ? 'notes' : `${slugify(f.name) || 'file'}.notes`, 'md')] = `# ${single ? title : `${title} · ${f.name}`}\n\n${f.notes}\n`;
      }
    }
    for (const c of ws.canvases) {
      if (!c.scene || !c.scene.elements.length) continue;
      const base = ws.canvases.length === 1 ? 'drawing' : slugify(c.name) || 'canvas';
      files[unique(base, 'excalidraw')] = JSON.stringify(
        { type: 'excalidraw', version: 2, source: 'scratchpad', elements: c.scene.elements, appState: { viewBackgroundColor: c.scene.appState.viewBackgroundColor ?? '#ffffff' }, files: c.scene.files },
        null,
        1,
      );
    }
  }

  const topics = [...new Set(backup.problems.map((p) => p.topic))];
  const solved = backup.problems.filter((p) => p.status === 'solved');
  let readme = `# DSA practice\n\n**${solved.length} / ${backup.problems.length}** problems solved.\n\n| Topic | Solved |\n| --- | --- |\n`;
  for (const t of topics) {
    const list = backup.problems.filter((p) => p.topic === t);
    readme += `| ${t} | ${list.filter((p) => p.status === 'solved').length} / ${list.length} |\n`;
  }
  for (const t of topics) {
    const list = backup.problems.filter((p) => p.topic === t);
    readme += `\n## ${t}\n\n`;
    for (const p of list) {
      const mark = p.status === 'solved' ? 'x' : ' ';
      const name = p.url ? `[${p.title}](${p.url})` : p.title;
      readme += `- [${mark}] ${p.number ? `${p.number}. ` : ''}${name} · ${p.difficulty}${p.status === 'attempted' ? ' · in progress' : ''}\n`;
    }
  }
  readme += `\nEach problem folder holds the solution files (${LANGUAGES.slice(0, 4).map((l) => l.label).join(', ')}, ...), notes and Excalidraw drawings. \`${BACKUP_PATH}\` is the full backup Scratchpad restores from.\n`;
  files['README.md'] = readme;
  // Stable content so that an unchanged workspace produces no new commit.
  const stable: Backup = { ...backup, exportedAt: new Date(Math.max(0, ...backup.workspaces.map((w) => w.updatedAt))).toISOString() };
  files[BACKUP_PATH] = JSON.stringify(stable);
  return files;
}

interface Repo {
  default_branch: string;
  html_url: string;
}

export interface PushResult {
  url: string;
  changed: boolean;
  files: number;
}

export async function push(repoName: string, backup: Backup): Promise<PushResult> {
  if (!validRepo(repoName)) throw new Error('Repository names may only contain letters, numbers, dots, dashes and underscores.');
  const user = await getUser();
  const repoPath = `/repos/${user.login}/${repoName}`;
  let repo: Repo;
  try {
    repo = await gh<Repo>(repoPath);
  } catch (e) {
    if (!(e instanceof GitHubError) || e.status !== 404) throw e;
    repo = await gh<Repo>('/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name: repoName, private: true, auto_init: true, description: 'DSA practice: solutions, notes and drawings synced from Scratchpad' }),
    });
  }
  const branch = repo.default_branch || 'main';
  let parent: { sha: string; treeSha: string } | null = null;
  try {
    const ref = await gh<{ object: { sha: string } }>(`${repoPath}/git/ref/heads/${branch}`);
    const commit = await gh<{ tree: { sha: string } }>(`${repoPath}/git/commits/${ref.object.sha}`);
    parent = { sha: ref.object.sha, treeSha: commit.tree.sha };
  } catch (e) {
    // 404/409: the repository exists but has no commits yet.
    if (!(e instanceof GitHubError) || (e.status !== 404 && e.status !== 409)) throw e;
    await gh(`${repoPath}/contents/README.md`, { method: 'PUT', body: JSON.stringify({ message: 'Initial commit', content: btoa('# DSA practice\n') }) });
    const ref = await gh<{ object: { sha: string } }>(`${repoPath}/git/ref/heads/${branch}`);
    const commit = await gh<{ tree: { sha: string } }>(`${repoPath}/git/commits/${ref.object.sha}`);
    parent = { sha: ref.object.sha, treeSha: commit.tree.sha };
  }

  const files = buildFiles(backup);
  const tree = [];
  for (const [path, content] of Object.entries(files)) {
    if (content.length > 200_000) {
      const blob = await gh<{ sha: string }>(`${repoPath}/git/blobs`, { method: 'POST', body: JSON.stringify({ content, encoding: 'utf-8' }) });
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    } else {
      tree.push({ path, mode: '100644', type: 'blob', content });
    }
  }
  const created = await gh<{ sha: string }>(`${repoPath}/git/trees`, { method: 'POST', body: JSON.stringify({ tree }) });
  if (created.sha === parent.treeSha) return { url: repo.html_url, changed: false, files: tree.length };
  const solved = backup.problems.filter((p) => p.status === 'solved').length;
  const commit = await gh<{ sha: string }>(`${repoPath}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: `Sync from Scratchpad (${solved}/${backup.problems.length} solved)`, tree: created.sha, parents: [parent.sha] }),
  });
  await gh(`${repoPath}/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
  return { url: repo.html_url, changed: true, files: tree.length };
}

export async function pull(repoName: string): Promise<Backup> {
  if (!validRepo(repoName)) throw new Error('Enter a valid repository name.');
  const user = await getUser();
  let text: string;
  try {
    text = await gh<string>(`/repos/${user.login}/${repoName}/contents/${BACKUP_PATH}`, {}, 'application/vnd.github.raw+json');
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) throw new Error(`No Scratchpad backup found in ${user.login}/${repoName}. Push from a device that has your work first.`);
    throw e;
  }
  const data = JSON.parse(text);
  if (!isBackup(data)) throw new Error('The backup file in that repository is not valid.');
  return { ...data, workspaces: data.workspaces.map(normalizeWorkspace) };
}
