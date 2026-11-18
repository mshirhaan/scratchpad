// One entry point for running and debugging any language. JavaScript,
// TypeScript and Python execute in web workers; everything else goes to the
// Scratchpad server.
import { LANG_BY_ID } from '../languages';
import type { LangId, RunResult, Trace } from '../types';

export type OutFn = (stream: 'stdout' | 'stderr', text: string) => void;

export interface Job<T> {
  promise: Promise<T>;
  cancel: () => void;
}

const BROWSER_MAX_STEPS = 5000;
const BROWSER_TIMEOUT = 15_000;

export class RunError extends Error {}

let pyWorker: Worker | null = null;
function getPyWorker() {
  if (!pyWorker) pyWorker = new Worker(new URL('./py.worker.ts', import.meta.url), { type: 'module' });
  return pyWorker;
}

/** Start downloading the Python runtime before the first run. */
export function warmPython() {
  getPyWorker().postMessage({ mode: 'load', base: import.meta.env.BASE_URL });
}

function workerJob<T>(language: LangId, mode: 'run' | 'debug', code: string, stdin: string, onOut?: OutFn): Job<T> {
  const isPy = language === 'python';
  const worker = isPy ? getPyWorker() : new Worker(new URL('./js.worker.ts', import.meta.url), { type: 'module' });
  let finish: (fn: () => void) => void = () => {};
  let cancelFn: () => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kill = () => {
      worker.terminate();
      if (isPy) pyWorker = null; // a fresh interpreter is created on the next run
    };
    finish = (fn) => {
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      fn();
    };
    const arm = () => {
      timer = setTimeout(() => finish(() => {
        kill();
        reject(new RunError(`Time limit exceeded (${BROWSER_TIMEOUT / 1000}s). Is there an infinite loop?`));
      }), BROWSER_TIMEOUT);
    };
    // Python's first run includes downloading the runtime; only time the run itself.
    if (!isPy) arm();
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'ready') arm();
      else if (m.type === 'out') for (const c of m.chunks) onOut?.(c.s, c.t);
      else if (m.type === 'done') finish(() => {
        if (!isPy) worker.terminate();
        resolve((mode === 'run' ? m.result : m.trace) as T);
      });
      else if (m.type === 'fatal') finish(() => {
        kill();
        reject(new RunError(m.error));
      });
    };
    worker.onerror = (e) => finish(() => {
      kill();
      reject(new RunError(e.message || 'The runner crashed.'));
    });
    if (isPy) worker.postMessage({ mode: 'load', base: import.meta.env.BASE_URL });
    worker.postMessage({ mode, language, code, stdin, maxSteps: BROWSER_MAX_STEPS, base: import.meta.env.BASE_URL });
    cancelFn = () => finish(() => {
      kill();
      reject(new RunError('Stopped.'));
    });
  });
  return { promise, cancel: () => cancelFn() };
}

export interface ServerInfo {
  ok: boolean;
  languages: Record<string, { run: boolean; debug: boolean }>;
  github: boolean;
}

export const apiBase = (backendUrl: string) => backendUrl.replace(/\/+$/, '');

export async function serverInfo(backendUrl: string): Promise<ServerInfo | null> {
  try {
    const r = await fetch(`${apiBase(backendUrl)}/api/health`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    return (await r.json()) as ServerInfo;
  } catch {
    return null;
  }
}

function serverJob<T>(backendUrl: string, path: 'run' | 'debug', language: LangId, code: string, stdin: string): Job<T> {
  const ctl = new AbortController();
  const promise = (async () => {
    let r: Response;
    try {
      r = await fetch(`${apiBase(backendUrl)}/api/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, code, stdin }),
        signal: ctl.signal,
      });
    } catch {
      if (ctl.signal.aborted) throw new RunError('Stopped.');
      throw new RunError(
        `${LANG_BY_ID[language].label} runs on the Scratchpad server, which is not reachable${backendUrl ? ` at ${backendUrl}` : ''}. Start it with "npm run server" (or "npm run dev"), or set its address in Settings.`,
      );
    }
    const text = await r.text();
    let data: { error?: string };
    try {
      data = JSON.parse(text);
    } catch {
      throw new RunError(`The Scratchpad server is not reachable (HTTP ${r.status}). Start it with "npm run server".`);
    }
    if (!r.ok) throw new RunError(data.error || `Server error ${r.status}`);
    return data as T;
  })();
  return { promise, cancel: () => ctl.abort() };
}

export function run(language: LangId, code: string, stdin: string, backendUrl: string, onOut: OutFn): Job<RunResult> {
  if (LANG_BY_ID[language].runs === 'browser') return workerJob<RunResult>(language, 'run', code, stdin, onOut);
  const job = serverJob<RunResult>(backendUrl, 'run', language, code, stdin);
  return {
    cancel: job.cancel,
    promise: job.promise.then((res) => {
      if (res.stdout) onOut('stdout', res.stdout);
      if (res.stderr) onOut('stderr', res.stderr);
      return res;
    }),
  };
}

export function debug(language: LangId, code: string, stdin: string, backendUrl: string): Job<Trace> {
  const lang = LANG_BY_ID[language];
  if (!lang.debug) {
    return { cancel() {}, promise: Promise.reject(new RunError(`Step debugging is not available for ${lang.label} yet. It works for Python, JavaScript, TypeScript, Java, C++ and C.`)) };
  }
  if (lang.debug === 'browser') return workerJob<Trace>(language, 'debug', code, stdin);
  return serverJob<Trace>(backendUrl, 'debug', language, code, stdin);
}
