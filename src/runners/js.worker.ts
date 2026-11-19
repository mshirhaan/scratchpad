/// <reference lib="webworker" />
// Runs JavaScript / TypeScript off the main thread. In debug mode the code is
// instrumented first and the worker returns a full execution trace.
import { parse } from 'acorn';
import { transform } from 'sucrase';
import type { Frame, Step, Trace, Val } from '../types';
import { instrument } from './instrument';

/* eslint-disable @typescript-eslint/no-explicit-any */
const MAX_ITEMS = 60;
const MAX_STR = 200;
const MAX_OUTPUT = 512 * 1024;

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

// ---- console formatting ----

function inspect(v: any, depth = 0, seen = new Set<any>()): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return depth === 0 ? v : JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'symbol') return String(v);
  if (t === 'bigint') return `${v}n`;
  if (t === 'function') return `[Function: ${v.name || 'anonymous'}]`;
  if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`;
  if (seen.has(v)) return '[Circular]';
  if (depth > 4) return Array.isArray(v) ? '[Array]' : '[Object]';
  seen.add(v);
  try {
    if (Array.isArray(v)) {
      const items = v.slice(0, 100).map((x) => inspect(x, depth + 1, seen));
      if (v.length > 100) items.push(`... ${v.length - 100} more`);
      return `[${items.join(', ')}]`;
    }
    if (v instanceof Map) return `Map(${v.size}) {${[...v].slice(0, 100).map(([k, x]) => `${inspect(k, depth + 1, seen)} => ${inspect(x, depth + 1, seen)}`).join(', ')}}`;
    if (v instanceof Set) return `Set(${v.size}) {${[...v].slice(0, 100).map((x) => inspect(x, depth + 1, seen)).join(', ')}}`;
    if (v instanceof Date) return v.toISOString();
    if (v instanceof RegExp) return String(v);
    const name = v.constructor && v.constructor.name !== 'Object' ? `${v.constructor.name} ` : '';
    const body = Object.keys(v).slice(0, 100).map((k) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${inspect(v[k], depth + 1, seen)}`);
    return `${name}{${body.length ? ` ${body.join(', ')} ` : ''}}`;
  } finally {
    seen.delete(v);
  }
}

// ---- debugger value snapshots ----

// Ids for objects of the user's classes, stable for the whole run, so the
// same node seen through head, tail and curr can be matched up.
const objIds = new WeakMap<object, string>();
let nextObjId = 1;
const idOf = (o: object) => {
  let id = objIds.get(o);
  if (!id) objIds.set(o, (id = String(nextObjId++)));
  return id;
};
// Objects already written within the current variable. A link to another
// object of the same class (next, prev) is followed without using up depth,
// up to CHAIN_MAX objects, so a whole linked list arrives; a repeat (a cycle,
// or tail after head) is sent as a reference to its id.
const seen = new Set<string>();
const CHAIN_MAX = 60;

function snapTop(v: any): Val {
  seen.clear();
  return snap(v, 5);
}

function snap(v: any, depth: number): Val {
  if (v === null) return { k: 'null', v: 'null' };
  if (v === undefined) return { k: 'null', v: 'undefined' };
  switch (typeof v) {
    case 'number': return { k: 'num', v: String(v) };
    case 'bigint': return { k: 'num', v: `${v}n` };
    case 'boolean': return { k: 'bool', v: String(v) };
    case 'string': return { k: 'str', v: JSON.stringify(v.length > MAX_STR ? `${v.slice(0, MAX_STR)}…` : v) };
    case 'symbol': return { k: 'other', v: String(v) };
    case 'function': return { k: 'fn', v: `ƒ ${v.name || 'anonymous'}()` };
  }
  const size = (n: number) => ` (${n})`;
  if (Array.isArray(v) || ArrayBuffer.isView(v)) {
    const arr = v as any[];
    const label = `${Array.isArray(v) ? 'Array' : v.constructor.name}${size(arr.length)}`;
    if (depth <= 0) return { k: 'obj', label, e: [], more: arr.length };
    const e: [string, Val][] = [];
    for (let i = 0; i < Math.min(arr.length, MAX_ITEMS); i++) e.push([String(i), snap(arr[i], depth - 1)]);
    return { k: 'obj', label, e, ...(arr.length > MAX_ITEMS ? { more: arr.length - MAX_ITEMS } : {}) };
  }
  if (v instanceof Map) {
    const label = `Map${size(v.size)}`;
    if (depth <= 0) return { k: 'obj', label, e: [], more: v.size };
    const e: [string, Val][] = [];
    for (const [key, val] of v) {
      if (e.length >= MAX_ITEMS) break;
      const ks = snap(key, 0);
      e.push([ks.k === 'obj' ? ks.label : ks.v, snap(val, depth - 1)]);
    }
    return { k: 'obj', label, e, ...(v.size > MAX_ITEMS ? { more: v.size - MAX_ITEMS } : {}) };
  }
  if (v instanceof Set) {
    const label = `Set${size(v.size)}`;
    if (depth <= 0) return { k: 'obj', label, e: [], more: v.size };
    const e: [string, Val][] = [];
    for (const val of v) {
      if (e.length >= MAX_ITEMS) break;
      e.push([String(e.length), snap(val, depth - 1)]);
    }
    return { k: 'obj', label, e, ...(v.size > MAX_ITEMS ? { more: v.size - MAX_ITEMS } : {}) };
  }
  if (v instanceof Error) return { k: 'other', v: `${v.name}: ${v.message}` };
  if (v instanceof Date || v instanceof RegExp) return { k: 'other', v: String(v) };
  const keys = Object.keys(v);
  const label = v.constructor && v.constructor.name ? v.constructor.name : 'Object';
  const id = idOf(v);
  if (depth <= 0 || seen.has(id)) return { k: 'obj', label, e: [], more: Math.max(keys.length, 1), id };
  seen.add(id);
  const e: [string, Val][] = [];
  for (const key of keys.slice(0, MAX_ITEMS)) {
    let val: Val;
    try {
      const x = v[key];
      const link = x !== null && typeof x === 'object' && Object.getPrototypeOf(x) === Object.getPrototypeOf(v) && seen.size < CHAIN_MAX;
      val = snap(x, link ? depth : depth - 1);
    } catch {
      val = { k: 'other', v: '<unreadable>' };
    }
    e.push([key, val]);
  }
  return { k: 'obj', label, e, id, ...(keys.length > MAX_ITEMS ? { more: keys.length - MAX_ITEMS } : {}) };
}

class StepLimit extends Error {}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function userLine(e: any): number | undefined {
  // new Function() adds two lines before the user's code.
  const m = /<anonymous>:(\d+):\d+/.exec(String(e?.stack || ''));
  return m ? Number(m[1]) - 2 : undefined;
}

self.onmessage = async (ev: MessageEvent) => {
  const { mode, language, stdin, maxSteps } = ev.data as { mode: 'run' | 'debug'; language: string; code: string; stdin: string; maxSteps: number };
  let code: string = ev.data.code;
  const started = performance.now();
  let stdout = '';
  let stderr = '';
  let pending: { s: 'stdout' | 'stderr'; t: string }[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    flushTimer = undefined;
    if (pending.length && mode === 'run') post({ type: 'out', chunks: pending });
    pending = [];
  };
  const write = (s: 'stdout' | 'stderr', t: string) => {
    if (stdout.length + stderr.length > MAX_OUTPUT) throw new Error('Output limit exceeded');
    if (s === 'stdout') stdout += t;
    else stderr += t;
    pending.push({ s, t });
    if (!flushTimer) flushTimer = setTimeout(flush, 30);
  };

  const fmt = (args: any[]) => `${args.map((a) => inspect(a)).join(' ')}\n`;
  const counts = new Map<string, number>();
  const sandboxConsole = {
    log: (...a: any[]) => write('stdout', fmt(a)),
    info: (...a: any[]) => write('stdout', fmt(a)),
    debug: (...a: any[]) => write('stdout', fmt(a)),
    warn: (...a: any[]) => write('stderr', fmt(a)),
    error: (...a: any[]) => write('stderr', fmt(a)),
    table: (...a: any[]) => write('stdout', fmt(a)),
    dir: (...a: any[]) => write('stdout', fmt(a)),
    assert: (ok: any, ...a: any[]) => { if (!ok) write('stderr', `Assertion failed${a.length ? `: ${fmt(a)}` : '\n'}`); },
    count: (label = 'default') => { counts.set(label, (counts.get(label) || 0) + 1); write('stdout', `${label}: ${counts.get(label)}\n`); },
    time() {}, timeEnd() {}, group() {}, groupEnd() {}, trace() {}, clear() {},
  };
  const lines = stdin.split('\n');
  let cursor = 0;
  const readline = () => (cursor < lines.length ? lines[cursor++] : null);

  const steps: Step[] = [];
  const stack: Frame[] = [{ name: '<main>', line: 0, vars: [], id: 0 }];
  let callSeq = 0;
  /** names string -> [all names, how many are the function's own (the rest are outer variables)] */
  const nameCache = new Map<string, [string[], number]>();
  let lastKey = '';
  let truncated = false;
  let lastLine = 0;

  const record = (line: number) => {
    steps.push({ line, stack: stack.map((f) => ({ name: f.name, line: f.line, vars: f.vars, id: f.id })), out: stdout.length });
  };
  const __t = (line: number, names?: string, get?: (k: number) => any) => {
    if (steps.length >= maxSteps) {
      truncated = true;
      throw new StepLimit('step limit');
    }
    const top = stack[stack.length - 1];
    top.line = line;
    lastLine = line;
    if (names) {
      let entry = nameCache.get(names);
      if (!entry) {
        const [own, outer] = names.split('|');
        const ownList = own ? own.split(',') : [];
        nameCache.set(names, (entry = [[...ownList, ...(outer ? outer.split(',') : [])], ownList.length]));
      }
      const [list, ownCount] = entry;
      const vars: [string, Val][] = [];
      for (let i = 0; i < list.length; i++) {
        let value;
        try {
          value = get!(i);
        } catch {
          continue; // declared later on (temporal dead zone)
        }
        if (typeof value === 'function' && /^class\s/.test(Function.prototype.toString.call(value))) continue;
        // Outer helper functions are noise; outer data (memo tables, shared arrays) is what matters.
        if (i >= ownCount && typeof value === 'function') continue;
        if (list[i] === 'this' && (value === undefined || value === globalThis)) continue;
        vars.push([list[i], snapTop(value)]);
      }
      top.vars = vars;
    }
    // A loop header is traced both as a statement and as a condition.
    const key = `${line}:${top.id}:${stack.length}:${stdout.length}:${JSON.stringify(top.vars)}`;
    if (key === lastKey) return;
    lastKey = key;
    record(line);
  };
  // Records the value a function returns as a "return" step, shown like
  // Python's: the frame as it was on its last line plus a "⏎ return" entry.
  const __r = (line: number, value?: any) => {
    if (stack.length <= 1 || steps.length >= maxSteps) return value;
    // An async function's value is only a promise here; there's nothing useful to show.
    if (value instanceof Promise) return value;
    const top = stack[stack.length - 1];
    top.line = line;
    record(line);
    const step = steps[steps.length - 1];
    const last = step.stack[step.stack.length - 1];
    step.stack[step.stack.length - 1] = { ...last, vars: [...last.vars, ['⏎ return', snapTop(value)]] };
    step.ev = 'return';
    lastKey = '';
    return value;
  };
  const __e = (name: string) => { stack.push({ name, line: 0, vars: [], id: ++callSeq }); };
  const __x = () => { if (stack.length > 1) stack.pop(); };
  const __w = (name: string, line: number, names: string, get: any, fn: () => any) => {
    __e(name);
    try {
      __t(line, names, get);
      return __r(line, fn());
    } finally {
      __x();
    }
  };

  let error: string | undefined;
  let errorLine: number | undefined;
  try {
    if (language === 'typescript') code = transform(code, { transforms: ['typescript'], disableESTransforms: true }).code;
    if (mode === 'debug') code = instrument(code);
    const fn = new AsyncFunction('console', 'readline', 'prompt', '__t', '__e', '__x', '__w', '__r', code);
    await fn(sandboxConsole, readline, readline, __t, __e, __x, __w, __r);
  } catch (e: any) {
    if (!(e instanceof StepLimit)) {
      const syntax = e instanceof SyntaxError;
      if (syntax && !(e as any).loc) {
        // The engine does not say where; the parser does.
        try {
          parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
        } catch (pe: any) {
          (e as any).loc = pe.loc;
        }
      }
      errorLine = syntax ? (e as any).loc?.line : mode === 'debug' ? lastLine : userLine(e);
      error = `${e?.name || 'Error'}: ${e?.message ?? e}`;
      stderr += `${error}${errorLine ? `\n    at line ${errorLine}` : ''}\n`;
      pending.push({ s: 'stderr', t: `${error}${errorLine ? `\n    at line ${errorLine}` : ''}\n` });
    }
  }
  if (flushTimer) clearTimeout(flushTimer);
  flush();

  if (mode === 'debug') {
    if (error && steps.length) steps.push({ line: errorLine || lastLine, stack: steps[steps.length - 1].stack, out: stdout.length, ev: 'exception', msg: error });
    const trace: Trace = { steps, stdout, stderr, truncated, error, exitCode: error ? 1 : 0 };
    post({ type: 'done', trace });
  } else {
    post({ type: 'done', result: { stdout, stderr, exitCode: error ? 1 : 0, timeMs: Math.round(performance.now() - started) } });
  }
};
