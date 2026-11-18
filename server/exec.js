// Runs user code with locally installed runtimes and records debug traces.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const RUN_TIMEOUT = Number(process.env.RUN_TIMEOUT_MS || 10_000);
const COMPILE_TIMEOUT = Number(process.env.COMPILE_TIMEOUT_MS || 60_000);
const DEBUG_TIMEOUT = Number(process.env.DEBUG_TIMEOUT_MS || 30_000);
const MAX_OUTPUT = 512 * 1024;
const MAX_STEPS = Number(process.env.DEBUG_MAX_STEPS || 3000);

// `{main}` is replaced with the detected Java main class.
const LANGS = {
  python: { file: 'main.py', needs: ['python3'], run: ['python3', 'main.py'] },
  javascript: { file: 'main.js', needs: ['node'], run: ['node', 'main.js'] },
  typescript: { file: 'main.ts', needs: ['node'], run: ['node', '--experimental-strip-types', '--no-warnings', 'main.ts'] },
  java: { needs: ['javac', 'java'], compile: ['javac', '-g', '-nowarn', '{file}'], run: ['java', '-cp', '.', '{main}'], debugNeeds: ['javac', 'java'] },
  cpp: { file: 'main.cpp', needs: ['g++'], compile: ['g++', '-std=c++20', '-O1', '-o', 'main', 'main.cpp'], run: ['./main'], debugNeeds: ['g++', 'gdb'] },
  c: { file: 'main.c', needs: ['gcc'], compile: ['gcc', '-O1', '-o', 'main', 'main.c', '-lm'], run: ['./main'], debugNeeds: ['gcc', 'gdb'] },
  go: { file: 'main.go', needs: ['go'], compile: ['go', 'build', '-o', 'main', 'main.go'], run: ['./main'] },
  rust: { file: 'main.rs', needs: ['rustc'], compile: ['rustc', '-O', '-o', 'main', 'main.rs'], run: ['./main'] },
  csharp: { file: 'main.cs', needs: ['dotnet'], run: ['dotnet', 'run', 'main.cs'], runTimeout: 60_000 },
  kotlin: { file: 'main.kt', needs: ['kotlinc', 'java'], compile: ['kotlinc', 'main.kt', '-include-runtime', '-d', 'main.jar'], run: ['java', '-jar', 'main.jar'] },
  swift: { file: 'main.swift', needs: ['swiftc'], compile: ['swiftc', '-O', '-o', 'main', 'main.swift'], run: ['./main'] },
  ruby: { file: 'main.rb', needs: ['ruby'], run: ['ruby', 'main.rb'] },
  php: { file: 'main.php', needs: ['php'], run: ['php', 'main.php'] },
};

function onPath(bin) {
  return (process.env.PATH || '').split(delimiter).some((d) => d && existsSync(join(d, bin)));
}

let langCache;
export async function availableLanguages() {
  if (!langCache) {
    langCache = {};
    for (const [id, l] of Object.entries(LANGS)) {
      langCache[id] = { run: l.needs.every(onPath), debug: Boolean(l.debugNeeds && l.debugNeeds.every(onPath)) };
    }
  }
  return langCache;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

/** Spawn a process with a time limit and capped output. */
function exec(cmd, { cwd, stdin = '', timeout, env }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd[0], cmd.slice(1), { cwd, detached: true, env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let truncated = false;
    const kill = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeout);
    const collect = (which) => (chunk) => {
      const s = chunk.toString('utf8');
      if (stdout.length + stderr.length + s.length > MAX_OUTPUT) {
        truncated = true;
        kill();
        return;
      }
      if (which === 'out') stdout += s;
      else stderr += s;
    };
    child.stdout.on('data', collect('out'));
    child.stderr.on('data', collect('err'));
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(e.message), exitCode: 127, signal: null, timedOut, truncated, timeMs: Date.now() - started });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, signal, timedOut, truncated, timeMs: Date.now() - started });
    });
  });
}

// The JVM echoes JAVA_TOOL_OPTIONS on stderr; that is noise, not program output.
const cleanErr = (s) => s.replace(/^Picked up JAVA_TOOL_OPTIONS:.*\n?/gm, '');

/** Finds the class that declares `static void main` and the file name javac requires. */
export function javaLayout(code) {
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');
  const classRe = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g;
  const mainIdx = stripped.search(/\bstatic\s+(?:final\s+)?void\s+main\s*\(/);
  let mainClass = null;
  let m;
  // The main class is the nearest top-level-ish class declared before `main`
  // whose body is still open at that point.
  const open = [];
  let depth = 0;
  let next = classRe.exec(stripped);
  for (let i = 0; i < stripped.length; i++) {
    if (next && i === next.index) {
      open.push({ name: next[1], depth });
      next = classRe.exec(stripped);
    }
    if (i === mainIdx) {
      mainClass = open.length ? open[0].name : null;
      break;
    }
    const ch = stripped[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      while (open.length && open[open.length - 1].depth >= depth) open.pop();
    }
  }
  m = stripped.match(/\bpublic\s+(?:final\s+|abstract\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/);
  const pkg = stripped.match(/^\s*package\s+([\w.]+)\s*;/m);
  const file = `${m ? m[1] : mainClass || 'Main'}.java`;
  return { file, mainClass: mainClass ? (pkg ? `${pkg[1]}.${mainClass}` : mainClass) : null, hasPackage: Boolean(pkg) };
}

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'algodesk-'));
  try {
    return await fn(dir);
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function prepare(language, code) {
  const lang = LANGS[language];
  if (!lang) throw httpError(400, `Unknown language: ${language}`);
  if (!lang.needs.every(onPath)) throw httpError(400, `${language} is not installed on the server (needs: ${lang.needs.join(', ')}).`);
  let file = lang.file;
  let main = '';
  if (language === 'java') {
    const layout = javaLayout(code);
    if (!layout.mainClass) throw httpError(400, 'No `public static void main(String[] args)` method found.');
    file = layout.file;
    main = layout.mainClass;
  }
  const fill = (cmd) => cmd && cmd.map((a) => a.replace('{file}', file).replace('{main}', main));
  return { lang, file, main, compile: fill(lang.compile), run: fill(lang.run) };
}

function describeExit(r, limit) {
  if (r.timedOut) return `Time limit exceeded (${limit / 1000}s)`;
  if (r.truncated) return 'Output limit exceeded';
  if (r.signal) return `Terminated by ${r.signal}`;
  return null;
}

export async function runCode(language, code, stdin) {
  const p = prepare(language, code);
  return withTempDir(async (dir) => {
    await writeFile(join(dir, p.file), code);
    const env = { GOCACHE: join(tmpdir(), 'algodesk-gocache'), GOFLAGS: '-buildvcs=false' };
    if (p.compile) {
      const c = await exec(p.compile, { cwd: dir, timeout: COMPILE_TIMEOUT, env });
      if (c.exitCode !== 0) {
        return { phase: 'compile', stdout: '', stderr: cleanErr(c.stderr || c.stdout) || describeExit(c, COMPILE_TIMEOUT) || 'Compilation failed', exitCode: c.exitCode ?? 1, timeMs: c.timeMs };
      }
    }
    const limit = p.lang.runTimeout || RUN_TIMEOUT;
    const r = await exec(p.run, { cwd: dir, stdin, timeout: limit, env });
    return { phase: 'run', stdout: r.stdout, stderr: cleanErr(r.stderr), exitCode: r.exitCode, timeMs: r.timeMs, note: describeExit(r, limit) };
  });
}

// ---- Debug traces ----

let javaTracerReady;
function javaTracer() {
  // Compile the JDI tracer once per server start.
  if (!javaTracerReady) {
    javaTracerReady = (async () => {
      const out = join(tmpdir(), 'algodesk-javatracer');
      await mkdir(out, { recursive: true });
      const c = await exec(['javac', '-nowarn', '-d', out, join(here, 'tracers', 'JavaTracer.java')], { cwd: here, timeout: COMPILE_TIMEOUT });
      if (c.exitCode !== 0) {
        javaTracerReady = undefined;
        throw httpError(500, `Could not build the Java tracer: ${cleanErr(c.stderr)}`);
      }
      return out;
    })();
  }
  return javaTracerReady;
}

/** Step offsets come back in bytes; the UI slices the output by characters. */
function bytesToChars(trace, outBuf) {
  let ascii = true;
  for (const b of outBuf) if (b > 127) { ascii = false; break; }
  trace.stdout = outBuf.toString('utf8');
  if (ascii) return;
  const cache = new Map();
  for (const s of trace.steps) {
    if (!cache.has(s.out)) cache.set(s.out, outBuf.subarray(0, s.out).toString('utf8').length);
    s.out = cache.get(s.out);
  }
}

export async function debugCode(language, code, stdin) {
  const p = prepare(language, code);
  if (!p.lang.debugNeeds) throw httpError(400, `Step debugging is not available for ${language}.`);
  if (!p.lang.debugNeeds.every(onPath)) throw httpError(400, `Debugging ${language} needs these tools on the server: ${p.lang.debugNeeds.join(', ')}.`);
  return withTempDir(async (dir) => {
    await writeFile(join(dir, p.file), code);
    await writeFile(join(dir, 'stdin.txt'), stdin);
    const traceFile = join(dir, 'trace.json');
    const outFile = join(dir, 'stdout.txt');
    const errFile = join(dir, 'stderr.txt');
    let r;
    if (language === 'java') {
      const c = await exec(p.compile, { cwd: dir, timeout: COMPILE_TIMEOUT });
      if (c.exitCode !== 0) return { steps: [], stdout: '', stderr: cleanErr(c.stderr), truncated: false, error: 'Compilation failed' };
      const tracerDir = await javaTracer();
      r = await exec(['java', '-cp', tracerDir, 'JavaTracer', dir, p.main, String(MAX_STEPS), join(dir, 'stdin.txt'), traceFile, outFile, errFile], {
        cwd: dir,
        timeout: DEBUG_TIMEOUT,
        env: { JAVA_TOOL_OPTIONS: '' },
      });
    } else {
      const cc = language === 'c' ? ['gcc', '-g', '-O0', '-o', 'main', p.file, '-lm'] : ['g++', '-std=c++20', '-g', '-O0', '-o', 'main', p.file];
      const c = await exec(cc, { cwd: dir, timeout: COMPILE_TIMEOUT });
      if (c.exitCode !== 0) return { steps: [], stdout: '', stderr: c.stderr, truncated: false, error: 'Compilation failed' };
      r = await exec(['gdb', '-q', '-nx', '-batch', '-x', join(here, 'tracers', 'gdb_tracer.py'), './main'], {
        cwd: dir,
        timeout: DEBUG_TIMEOUT,
        env: { TRACE_SRC: join(dir, p.file), TRACE_OUT: traceFile, TRACE_STDOUT: outFile, TRACE_STDERR: errFile, TRACE_STDIN: join(dir, 'stdin.txt'), TRACE_MAX: String(MAX_STEPS) },
      });
    }
    let trace;
    try {
      trace = JSON.parse(await readFile(traceFile, 'utf8'));
    } catch {
      const why = r.timedOut ? `Debug session exceeded ${DEBUG_TIMEOUT / 1000}s (infinite loop?)` : 'The debugger did not produce a trace.';
      return { steps: [], stdout: '', stderr: cleanErr(r.stderr).slice(-4000), truncated: false, error: why };
    }
    // Stepping over inlined library calls can stop on one line several times
    // with nothing changed; those stops are not useful steps.
    let prev = '';
    trace.steps = trace.steps.filter((s) => {
      const key = JSON.stringify(s);
      const same = key === prev;
      prev = key;
      return !same;
    });
    const read = (f) => readFile(f).catch(() => Buffer.alloc(0));
    bytesToChars(trace, await read(outFile));
    trace.stderr = cleanErr((await read(errFile)).toString('utf8'));
    return trace;
  });
}
