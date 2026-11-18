import { create } from 'zustand';
import { seedProblems } from './data/problems';
import { LANG_BY_ID } from './languages';
import { debug as debugJob, run as runJob, RunError, serverInfo, type Job, type ServerInfo } from './runners';
import * as db from './storage';
import type { Canvas, CodeFile, LangId, Problem, RunResult, Scene, Settings, Status, Step, Trace, Workspace } from './types';

export type View = 'split' | 'code' | 'draw' | 'roadmap';
export type BottomTab = 'console' | 'input' | 'debug' | 'notes';
export interface OutChunk {
  s: 'stdout' | 'stderr' | 'info' | 'error';
  t: string;
}

export const SCRATCH_ID = 'scratch';

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  fontSize: 14,
  backendUrl: '',
  split: 0.5,
  bottomHeight: 240,
  defaultLanguage: 'python',
  githubRepo: 'algodesk-solutions',
};

interface State {
  ready: boolean;
  problems: Problem[];
  settings: Settings;
  activeId: string;
  ws: Workspace | null;
  /** Bumped when the workspace is replaced, so editors remount. */
  wsEpoch: number;
  view: View;
  saveState: 'saved' | 'saving';
  server: ServerInfo | null;

  running: null | 'run' | 'debug';
  output: OutChunk[];
  trace: Trace | null;
  stepIndex: number;
  frameIndex: number | null;
  /** Shown in the debugger status line until the next step. */
  debugNote: string | null;
  bottomTab: BottomTab;
  /** Presentation mode: chrome hidden, text enlarged. Not saved. */
  presenting: boolean;

  init: () => Promise<void>;
  setView: (v: View) => void;
  openWorkspace: (id: string, view?: View) => Promise<void>;
  setCode: (code: string) => void;
  setLanguage: (lang: LangId) => void;
  setStdin: (s: string) => void;
  setNotes: (s: string) => void;
  setScene: (canvasId: string, scene: Scene) => void;

  selectFile: (id: string) => void;
  addFile: () => void;
  renameFile: (id: string, name: string) => void;
  deleteFile: (id: string) => void;
  selectCanvas: (id: string) => void;
  addCanvas: () => void;
  renameCanvas: (id: string, name: string) => void;
  deleteCanvas: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setBottomTab: (t: BottomTab) => void;

  addProblem: (p: Omit<Problem, 'id' | 'status'>) => string;
  updateProblem: (id: string, patch: Partial<Problem>) => void;
  deleteProblem: (id: string) => Promise<void>;
  setStatus: (id: string, status: Status) => void;
  resetProgress: () => void;

  /** `auto`: started by auto-run. It doesn't switch tabs, and replaces or queues behind a run in progress. */
  runCode: (opts?: { auto?: boolean }) => void;
  startDebug: () => void;
  stop: () => void;
  stopDebug: () => void;
  gotoStep: (i: number) => void;
  step: (kind: 'into' | 'over' | 'out' | 'back' | 'continue' | 'rcontinue' | 'restart') => void;
  selectFrame: (i: number) => void;
  toggleBreakpoint: (line: number) => void;
  setBreakpoints: (lines: number[]) => void;
  setHighlights: (lines: number[]) => void;
  setPresenting: (on: boolean) => void;
  clearOutput: () => void;
  refreshServer: () => Promise<void>;

  exportBackup: () => Promise<db.Backup>;
  importBackup: (b: db.Backup) => Promise<void>;
  flush: () => Promise<void>;
}

let wsTimer: ReturnType<typeof setTimeout> | undefined;
let metaTimer: ReturnType<typeof setTimeout> | undefined;
let job: Job<RunResult> | Job<Trace> | null = null;
/** Bumped for every run; output from an older, replaced run is dropped. */
let runSeq = 0;
/** Auto-run asked for a run while one was going: start another when it ends. */
let autoPending = false;
let autoRecheck: ReturnType<typeof setTimeout> | undefined;
/** A run still going this long after it started executing is probably stuck (e.g. a half-written loop). */
const AUTO_REPLACE_MS = 1500;

const newWorkspace = (id: string, language: LangId): Workspace => {
  const file: CodeFile = { id: db.uid('f'), name: 'main', language, code: {}, notes: '' };
  const canvas: Canvas = { id: db.uid('c'), name: 'Canvas 1', scene: null };
  return { id, files: [file], activeFile: file.id, canvases: [canvas], activeCanvas: canvas.id, stdin: '', updatedAt: Date.now() };
};

/** Picks "<base> N" with the smallest N not already used. */
const nextName = (base: string, taken: string[], start = 1) => {
  let n = start;
  while (taken.includes(`${base}${n}`)) n++;
  return `${base}${n}`;
};

export const activeFile = (ws: Workspace) => ws.files.find((f) => f.id === ws.activeFile) ?? ws.files[0];
export const activeCanvas = (ws: Workspace) => ws.canvases.find((c) => c.id === ws.activeCanvas) ?? ws.canvases[0];
export const fileBreakpoints = (f: CodeFile) => f.breakpoints?.[f.language];
export const fileHighlights = (f: CodeFile) => f.highlights?.[f.language];
const sameLines = (a: number[], b: number[]) => a.length === b.length && a.every((l, i) => l === b[i]);
const cleanLines = (lines: number[]) => [...new Set(lines)].filter((l) => l > 0).sort((a, b) => a - b);

/**
 * For each step: is it a fresh arrival at its line (true), or the same
 * statement continuing (false)? Continuations are a line repeated in the same
 * frame, Python's "return" events, and, for Java/C/C++, the caller's line
 * shown again after a call returns. Breakpoints and "step over" only stop on
 * arrivals, so a breakpoint on `x = f()` does not fire twice.
 */
const arrivalCache = new WeakMap<Trace, boolean[]>();
export function arrivals(trace: Trace): boolean[] {
  let out = arrivalCache.get(trace);
  if (out) return out;
  out = [];
  const lastLine: number[] = []; // last line seen in the live frame at each depth
  for (const st of trace.steps) {
    const d = st.stack.length;
    lastLine.length = Math.min(lastLine.length, d + 1); // frames deeper than d have ended
    const fresh = st.ev !== 'return' && lastLine[d] !== st.line;
    out.push(fresh);
    lastLine[d] = st.line;
    if (st.ev === 'return') lastLine.length = d; // this frame ends; a new call at d starts fresh
  }
  arrivalCache.set(trace, out);
  return out;
}
export const fileCode = (f: CodeFile) => f.code[f.language] ?? LANG_BY_ID[f.language].template;
export const currentCode = (ws: Workspace) => fileCode(activeFile(ws));

export const useStore = create<State>((set, get) => {
  const saveMetaSoon = () => {
    clearTimeout(metaTimer);
    metaTimer = setTimeout(() => {
      const { problems, settings, activeId } = get();
      void db.saveMeta({ version: 1, problems, settings, activeId });
    }, 250);
  };
  const saveWsSoon = () => {
    if (get().saveState !== 'saving') set({ saveState: 'saving' });
    clearTimeout(wsTimer);
    wsTimer = setTimeout(async () => {
      wsTimer = undefined;
      const ws = get().ws;
      if (ws) await db.saveWorkspace(ws);
      set({ saveState: 'saved' });
    }, 400);
  };
  const patchWs = (patch: Partial<Workspace>) => {
    const ws = get().ws;
    if (!ws) return;
    set({ ws: { ...ws, ...patch, updatedAt: Date.now() } });
    saveWsSoon();
  };
  const patchActiveFile = (patch: Partial<CodeFile>) => {
    const ws = get().ws;
    if (!ws) return;
    const id = activeFile(ws).id;
    patchWs({ files: ws.files.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  };
  const endDebug = () => set({ trace: null, stepIndex: 0, frameIndex: null, debugNote: null });
  const breakpointsNow = () => {
    const ws = get().ws;
    return (ws && fileBreakpoints(activeFile(ws))) || [];
  };

  return {
    ready: false,
    problems: [],
    settings: DEFAULT_SETTINGS,
    activeId: SCRATCH_ID,
    ws: null,
    wsEpoch: 0,
    view: 'split',
    saveState: 'saved',
    server: null,
    running: null,
    output: [],
    trace: null,
    stepIndex: 0,
    frameIndex: null,
    debugNote: null,
    bottomTab: 'console',
    presenting: false,

    async init() {
      const meta = await db.loadMeta().catch(() => undefined);
      const settings = { ...DEFAULT_SETTINGS, ...(meta?.settings || {}) };
      const problems = meta?.problems ?? seedProblems();
      let activeId = meta?.activeId ?? SCRATCH_ID;
      if (activeId !== SCRATCH_ID && !problems.some((p) => p.id === activeId)) activeId = SCRATCH_ID;
      const ws = (await db.loadWorkspace(activeId).catch(() => undefined)) ?? newWorkspace(activeId, settings.defaultLanguage);
      set({ ready: true, problems, settings, activeId, ws });
      if (!meta) saveMetaSoon();
      void get().refreshServer();
      void db.persistStorage(); // ask the browser not to clear our data when disk space runs low
    },

    setView: (view) => set({ view }),

    async openWorkspace(id, view = 'split') {
      await get().flush();
      get().stop();
      const ws = (await db.loadWorkspace(id)) ?? newWorkspace(id, get().settings.defaultLanguage);
      set((s) => ({ activeId: id, ws, wsEpoch: s.wsEpoch + 1, view, output: [], trace: null, stepIndex: 0, frameIndex: null, bottomTab: 'console' }));
      saveMetaSoon();
    },

    setCode(code) {
      const { ws, problems, activeId } = get();
      if (!ws || currentCode(ws) === code) return;
      const f = activeFile(ws);
      patchActiveFile({ code: { ...f.code, [f.language]: code } });
      const p = problems.find((x) => x.id === activeId);
      if (p && p.status === 'todo') get().setStatus(p.id, 'attempted');
    },
    setLanguage(language) {
      get().stopDebug();
      patchActiveFile({ language });
      get().updateSettings({ defaultLanguage: language });
    },
    setStdin: (stdin) => patchWs({ stdin }),
    setNotes: (notes) => patchActiveFile({ notes }),
    setScene(canvasId, scene) {
      // Drawing changes arrive on every pointer move: update in place without
      // re-rendering React, and let the debounced save pick it up.
      const ws = get().ws;
      const canvas = ws?.canvases.find((c) => c.id === canvasId);
      if (!ws || !canvas) return;
      canvas.scene = scene;
      ws.updatedAt = Date.now();
      saveWsSoon();
    },

    selectFile(id) {
      const ws = get().ws;
      if (!ws || ws.activeFile === id || !ws.files.some((f) => f.id === id)) return;
      if (get().running === 'debug') get().stop();
      endDebug();
      patchWs({ activeFile: id });
    },
    addFile() {
      const ws = get().ws;
      if (!ws) return;
      const file: CodeFile = {
        id: db.uid('f'),
        name: nextName('file', ws.files.map((f) => f.name), 2),
        language: activeFile(ws).language,
        code: {},
        notes: '',
      };
      if (get().running === 'debug') get().stop();
      endDebug();
      patchWs({ files: [...ws.files, file], activeFile: file.id });
    },
    renameFile(id, name) {
      const ws = get().ws;
      const clean = name.trim().replace(/[\\/]/g, '-').slice(0, 60);
      if (!ws || !clean) return;
      patchWs({ files: ws.files.map((f) => (f.id === id ? { ...f, name: clean } : f)) });
    },
    deleteFile(id) {
      const ws = get().ws;
      if (!ws || ws.files.length <= 1) return;
      const i = ws.files.findIndex((f) => f.id === id);
      if (i < 0) return;
      const files = ws.files.filter((f) => f.id !== id);
      const wasActive = ws.activeFile === id;
      if (wasActive) {
        if (get().running === 'debug') get().stop();
        endDebug();
      }
      patchWs({ files, activeFile: wasActive ? files[Math.min(i, files.length - 1)].id : ws.activeFile });
    },

    selectCanvas(id) {
      const ws = get().ws;
      if (!ws || ws.activeCanvas === id || !ws.canvases.some((c) => c.id === id)) return;
      patchWs({ activeCanvas: id });
    },
    addCanvas() {
      const ws = get().ws;
      if (!ws) return;
      const canvas: Canvas = { id: db.uid('c'), name: nextName('Canvas ', ws.canvases.map((c) => c.name)), scene: null };
      patchWs({ canvases: [...ws.canvases, canvas], activeCanvas: canvas.id });
    },
    renameCanvas(id, name) {
      const ws = get().ws;
      const clean = name.trim().slice(0, 60);
      if (!ws || !clean) return;
      patchWs({ canvases: ws.canvases.map((c) => (c.id === id ? { ...c, name: clean } : c)) });
    },
    deleteCanvas(id) {
      const ws = get().ws;
      if (!ws || ws.canvases.length <= 1) return;
      const i = ws.canvases.findIndex((c) => c.id === id);
      if (i < 0) return;
      const canvases = ws.canvases.filter((c) => c.id !== id);
      patchWs({ canvases, activeCanvas: ws.activeCanvas === id ? canvases[Math.min(i, canvases.length - 1)].id : ws.activeCanvas });
    },
    updateSettings(patch) {
      set((s) => ({ settings: { ...s.settings, ...patch } }));
      saveMetaSoon();
    },
    setBottomTab: (bottomTab) => set({ bottomTab }),

    addProblem(p) {
      const id = `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      set((s) => ({ problems: [...s.problems, { ...p, id, status: 'todo', custom: true }] }));
      saveMetaSoon();
      return id;
    },
    updateProblem(id, patch) {
      set((s) => ({ problems: s.problems.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
      saveMetaSoon();
    },
    async deleteProblem(id) {
      if (get().activeId === id) await get().openWorkspace(SCRATCH_ID, 'roadmap');
      set((s) => ({ problems: s.problems.filter((p) => p.id !== id) }));
      await db.deleteWorkspace(id);
      saveMetaSoon();
    },
    setStatus(id, status) {
      get().updateProblem(id, { status, solvedAt: status === 'solved' ? Date.now() : undefined });
    },
    resetProgress() {
      set((s) => ({ problems: s.problems.map((p) => ({ ...p, status: 'todo' as Status, solvedAt: undefined })) }));
      saveMetaSoon();
    },

    runCode(opts) {
      const auto = Boolean(opts?.auto);
      const { ws, settings, running, trace } = get();
      if (!ws) return;
      if (auto) {
        // Never interrupt the debugger.
        if (running === 'debug' || trace) return;
        if (running === 'run') {
          // Let a normal run finish (stopping Python restarts its runtime, which
          // is slow); replace it only if it looks stuck.
          const started = job?.startedAt?.();
          if (started == null || performance.now() - started < AUTO_REPLACE_MS) {
            autoPending = true;
            // If it is still going once it counts as stuck, replace it then
            // rather than waiting for the time limit.
            clearTimeout(autoRecheck);
            const wait = started == null ? AUTO_REPLACE_MS : AUTO_REPLACE_MS - (performance.now() - started) + 50;
            autoRecheck = setTimeout(() => {
              if (autoPending && get().running === 'run') get().runCode({ auto: true });
            }, wait);
            return;
          }
          runSeq++; // drop the old run's output
          job?.cancel();
          job = null;
        }
      } else if (running === 'debug') {
        return;
      } else if (running === 'run') {
        // Run pressed while a run (usually an auto-run) is going: start over.
        runSeq++;
        job?.cancel();
        job = null;
      }
      autoPending = false;
      clearTimeout(autoRecheck);
      endDebug();
      const lang = LANG_BY_ID[activeFile(ws).language];
      const my = ++runSeq;
      // An auto-run keeps the previous output on screen until its own first
      // output (or its finish line) arrives, so the console doesn't flicker.
      let fresh = !auto;
      set(auto ? { running: 'run' } : { running: 'run', output: [], bottomTab: 'console' });
      const append = (c: OutChunk) => {
        if (my !== runSeq) return;
        if (!fresh) {
          fresh = true;
          set({ output: [c] });
        } else set((s) => ({ output: [...s.output, c] }));
      };
      const j = runJob(activeFile(ws).language, currentCode(ws), ws.stdin, settings.backendUrl, (s, t) => append({ s, t }));
      job = j;
      j.promise
        .then((res) => {
          const parts = [];
          if (res.phase === 'compile') parts.push('Compilation failed');
          else if (res.note) parts.push(res.note);
          else parts.push(res.exitCode === 0 ? 'Finished' : `Exited with code ${res.exitCode ?? '?'}`);
          parts.push(`${res.timeMs} ms`);
          append({ s: res.exitCode === 0 && !res.note ? 'info' : 'error', t: `\n[${lang.label}] ${parts.join(' · ')}\n` });
        })
        .catch((e) => append({ s: 'error', t: `${e instanceof RunError ? e.message : String(e)}\n` }))
        .finally(() => {
          if (job === j) job = null;
          if (my !== runSeq) return; // replaced by a newer run
          set({ running: null });
          if (autoPending) {
            autoPending = false;
            get().runCode({ auto: true });
          }
        });
    },

    startDebug() {
      const { ws, settings, running } = get();
      if (!ws || running === 'debug') return;
      if (running === 'run') {
        // Debug pressed during a run (usually an auto-run): drop the run.
        runSeq++;
        autoPending = false;
        job?.cancel();
        job = null;
      }
      endDebug();
      set({ running: 'debug', output: [], bottomTab: 'debug' });
      const j = debugJob(activeFile(ws).language, currentCode(ws), ws.stdin, settings.backendUrl);
      job = j;
      j.promise
        .then((trace) => {
          if (!trace.steps.length) {
            // Nothing executed: a compile or syntax error. Show it as output.
            const out: OutChunk[] = [];
            if (trace.stdout) out.push({ s: 'stdout', t: trace.stdout });
            if (trace.stderr) out.push({ s: 'stderr', t: trace.stderr });
            out.push({ s: 'error', t: `\n${trace.error || 'The program did not execute any line.'}\n` });
            set({ output: out, bottomTab: 'console' });
            return;
          }
          // No breakpoints: pause on the first line. With breakpoints: run to
          // the first one hit, or to the end if none is.
          const bps = breakpointsNow();
          const fresh = arrivals(trace);
          let start = 0;
          let debugNote: string | null = null;
          if (bps.length) {
            start = trace.steps.findIndex((st, k) => fresh[k] && bps.includes(st.line));
            if (start < 0) {
              start = trace.steps.length - 1;
              debugNote = 'No breakpoint was hit, so this is the end of the run. Breakpoints on blank lines, comments or code that never runs are skipped.';
            }
          }
          set({ trace, stepIndex: start, frameIndex: null, debugNote });
        })
        .catch((e) => set({ output: [{ s: 'error', t: `${e instanceof RunError ? e.message : String(e)}\n` }], bottomTab: 'console' }))
        .finally(() => {
          if (job === j) job = null;
          set({ running: null });
        });
    },

    stop() {
      autoPending = false;
      clearTimeout(autoRecheck);
      job?.cancel();
      job = null;
      endDebug();
    },
    stopDebug: endDebug,

    gotoStep(i) {
      const t = get().trace;
      if (!t) return;
      set({ stepIndex: Math.max(0, Math.min(t.steps.length - 1, i)), frameIndex: null, debugNote: null });
    },
    step(kind) {
      const { trace, stepIndex: i } = get();
      if (!trace) return;
      const steps: Step[] = trace.steps;
      const last = steps.length - 1;
      const depth = (k: number) => steps[k].stack.length;
      const bps = breakpointsNow();
      const fresh = arrivals(trace);
      const isStop = (k: number) => fresh[k] && bps.includes(steps[k].line);
      let j = i;
      if (kind === 'into') j = i + 1;
      else if (kind === 'back') j = i - 1;
      else if (kind === 'restart') j = 0;
      else if (kind === 'over') {
        // Next line in this frame (skipping calls made from it), or the caller
        // once this frame returns. A breakpoint inside a skipped call still stops.
        j = last;
        for (let k = i + 1; k <= last; k++) {
          if (depth(k) < depth(i) || (depth(k) === depth(i) && fresh[k]) || isStop(k)) { j = k; break; }
        }
      } else if (kind === 'out') {
        j = last;
        for (let k = i + 1; k <= last; k++) if (depth(k) < depth(i) || isStop(k)) { j = k; break; }
      } else if (kind === 'continue') {
        j = last;
        for (let k = i + 1; k <= last; k++) if (isStop(k)) { j = k; break; }
      } else if (kind === 'rcontinue') {
        j = 0;
        for (let k = i - 1; k >= 0; k--) if (isStop(k)) { j = k; break; }
      }
      get().gotoStep(j);
    },
    selectFrame: (frameIndex) => set({ frameIndex }),
    toggleBreakpoint(line) {
      const cur = breakpointsNow();
      get().setBreakpoints(cur.includes(line) ? cur.filter((l) => l !== line) : [...cur, line]);
    },
    setBreakpoints(lines) {
      const ws = get().ws;
      if (!ws) return;
      const f = activeFile(ws);
      const next = cleanLines(lines);
      if (sameLines(next, fileBreakpoints(f) || [])) return;
      patchActiveFile({ breakpoints: { ...f.breakpoints, [f.language]: next } });
    },
    setHighlights(lines) {
      const ws = get().ws;
      if (!ws) return;
      const f = activeFile(ws);
      const next = cleanLines(lines);
      if (sameLines(next, fileHighlights(f) || [])) return;
      patchActiveFile({ highlights: { ...f.highlights, [f.language]: next } });
    },
    setPresenting: (presenting) => set({ presenting }),
    clearOutput: () => set({ output: [] }),
    async refreshServer() {
      set({ server: await serverInfo(get().settings.backendUrl) });
    },

    async exportBackup() {
      await get().flush();
      const { problems, settings } = get();
      const { backendUrl: _b, ...portable } = settings;
      void _b;
      return { app: 'algodesk', version: 1, exportedAt: new Date().toISOString(), problems, settings: portable, workspaces: await db.allWorkspaces() };
    },
    async importBackup(b) {
      get().stop();
      clearTimeout(wsTimer);
      wsTimer = undefined;
      for (const ws of b.workspaces) await db.saveWorkspace(db.normalizeWorkspace(ws));
      const settings = { ...get().settings, ...b.settings, backendUrl: get().settings.backendUrl };
      const activeId = get().activeId === SCRATCH_ID || b.problems.some((p) => p.id === get().activeId) ? get().activeId : SCRATCH_ID;
      const ws = (await db.loadWorkspace(activeId)) ?? newWorkspace(activeId, settings.defaultLanguage);
      set((s) => ({ problems: b.problems, settings, activeId, ws, wsEpoch: s.wsEpoch + 1, saveState: 'saved' }));
      await db.saveMeta({ version: 1, problems: b.problems, settings, activeId });
    },
    async flush() {
      if (wsTimer) {
        clearTimeout(wsTimer);
        wsTimer = undefined;
        const ws = get().ws;
        if (ws) await db.saveWorkspace(ws);
        set({ saveState: 'saved' });
      }
    },
  };
});
