// Local persistence. Everything lives in IndexedDB in this browser:
//   "meta"      -> problems, settings, which workspace is open
//   "ws:<id>"   -> code files (with their notes), canvases and input for one problem
import { del, get, keys, set } from 'idb-keyval';
import type { LegacyWorkspace, Problem, Settings, Workspace } from './types';

export interface Meta {
  version: 1;
  problems: Problem[];
  settings: Settings;
  activeId: string;
}

export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Upgrades a workspace saved by an older version (single file, single drawing). */
export function normalizeWorkspace(raw: Workspace | LegacyWorkspace): Workspace {
  const w = raw as Partial<Workspace> & Partial<LegacyWorkspace> & { id: string };
  let files = Array.isArray(w.files) ? w.files.map((f) => ({ ...f, notes: f.notes ?? '' })) : null;
  if (!files || !files.length) files = [{ id: 'f-main', name: 'main', language: w.language ?? 'python', code: w.code ?? {}, notes: '' }];
  let canvases = Array.isArray(w.canvases) ? w.canvases : null;
  if (!canvases || !canvases.length) canvases = [{ id: 'c-main', name: 'Canvas 1', scene: w.scene ?? null }];
  return {
    id: w.id,
    files,
    activeFile: files.some((f) => f.id === w.activeFile) ? w.activeFile! : files[0].id,
    canvases,
    activeCanvas: canvases.some((c) => c.id === w.activeCanvas) ? w.activeCanvas! : canvases[0].id,
    stdin: w.stdin ?? '',
    updatedAt: w.updatedAt ?? Date.now(),
  };
}

// ---- Keeping the data ----
// By default the browser may delete a site's storage when the disk runs low.
// Asking for persistent storage stops that. Chrome and Edge decide by
// themselves (no prompt), Firefox asks the user once, Safari mostly grants it
// to sites added to the Home Screen / Dock.

export interface StorageStatus {
  /** true: the browser won't clear it on its own. null: the browser can't tell us. */
  persisted: boolean | null;
  usage?: number;
  quota?: number;
}

export async function storageStatus(): Promise<StorageStatus> {
  const sm = navigator.storage;
  const persisted = sm?.persisted ? await sm.persisted().catch(() => null) : null;
  const est = sm?.estimate ? await sm.estimate().catch(() => undefined) : undefined;
  return { persisted, usage: est?.usage, quota: est?.quota };
}

/** Asks for persistent storage, unless it is already granted. Returns whether it is. */
export async function persistStorage(): Promise<boolean | null> {
  const sm = navigator.storage;
  if (!sm?.persist) return null;
  try {
    if (await sm.persisted()) return true;
    return await sm.persist();
  } catch {
    return null;
  }
}

export const loadMeta = () => get<Meta>('meta');
export const saveMeta = (meta: Meta) => set('meta', meta);
export const loadWorkspace = async (id: string) => {
  const ws = await get<Workspace | LegacyWorkspace>(`ws:${id}`);
  return ws ? normalizeWorkspace(ws) : undefined;
};
export const saveWorkspace = (ws: Workspace) => set(`ws:${ws.id}`, ws);
export const deleteWorkspace = (id: string) => del(`ws:${id}`);

export async function allWorkspaces(): Promise<Workspace[]> {
  const out: Workspace[] = [];
  for (const k of await keys()) {
    if (typeof k === 'string' && k.startsWith('ws:')) {
      const ws = await get<Workspace | LegacyWorkspace>(k);
      if (ws) out.push(normalizeWorkspace(ws));
    }
  }
  return out;
}

// The backup's "app" tag stays 'algodesk' so files exported before the
// rename to Scratchpad still restore.
export interface Backup {
  app: 'algodesk';
  version: 1;
  exportedAt: string;
  problems: Problem[];
  settings: Partial<Settings>;
  workspaces: Workspace[];
}

export function isBackup(x: unknown): x is Backup {
  const b = x as Backup;
  return Boolean(b && b.app === 'algodesk' && Array.isArray(b.problems) && Array.isArray(b.workspaces));
}
