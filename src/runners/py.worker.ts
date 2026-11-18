/// <reference lib="webworker" />
// Runs Python in the browser with Pyodide (CPython compiled to WebAssembly).
// Debug mode uses sys.settrace to record every executed line.

/* eslint-disable @typescript-eslint/no-explicit-any */
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

const HARNESS = String.raw`
import sys, io, json, traceback, types, collections

_FILE = "main.py"
_MAX_ITEMS = 60
_MAX_STR = 200

class _Writer(io.TextIOBase):
    def __init__(self, cb):
        self.cb = cb
        self.total = 0
    def writable(self):
        return True
    def write(self, s):
        if not isinstance(s, str):
            s = str(s)
        self.total += len(s)
        if self.total > 512 * 1024:
            raise RuntimeError("Output limit exceeded")
        self.cb(s)
        return len(s)

def _user_tb(tb):
    while tb is not None and tb.tb_frame.f_code.co_filename != _FILE:
        tb = tb.tb_next
    return tb

def _report(err_writer):
    et, ev, tb = sys.exc_info()
    if isinstance(ev, SyntaxError) and ev.filename == _FILE:
        err_writer.write("".join(traceback.format_exception_only(et, ev)))
        return ev.lineno or 0, "%s: %s" % (et.__name__, ev.msg)
    utb = _user_tb(tb)
    err_writer.write("".join(traceback.format_exception(et, ev, utb or tb)))
    line = 0
    t = utb
    while t is not None:
        if t.tb_frame.f_code.co_filename == _FILE:
            line = t.tb_lineno
        t = t.tb_next
    return line, "%s: %s" % (et.__name__, ev)

def _prepare(stdin, on_out, on_err):
    out, err = _Writer(on_out), _Writer(on_err)
    sys.stdout, sys.stderr = out, err
    sys.stdin = io.StringIO(stdin)
    sys.setrecursionlimit(3000)
    return out, err

def run_code(src, stdin, on_out, on_err):
    out, err = _prepare(stdin, on_out, on_err)
    code = 0
    try:
        exec(compile(src, _FILE, "exec"), {"__name__": "__main__", "__file__": _FILE})
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else 0
    except BaseException:
        _report(err)
        code = 1
    return code

def _prim(kind, text):
    return {"k": kind, "v": text}

def _clip(s):
    return s if len(s) <= _MAX_STR else s[:_MAX_STR] + "…"

def _key(k):
    try:
        return _clip(repr(k))
    except Exception:
        return "<key>"

def _ser(v, depth):
    if v is None:
        return _prim("null", "None")
    if isinstance(v, bool):
        return _prim("bool", str(v))
    if isinstance(v, (int, float, complex)):
        return _prim("num", _clip(repr(v)))
    if isinstance(v, (str, bytes)):
        return _prim("str", _clip(repr(v)))
    name = type(v).__name__
    try:
        if isinstance(v, (list, tuple, set, frozenset, collections.deque)):
            n = len(v)
            label = "%s (%d)" % (name, n)
            if depth <= 0:
                return {"k": "obj", "label": label, "e": [], "more": n}
            items = list(v)[:_MAX_ITEMS] if not isinstance(v, (set, frozenset)) else sorted(v, key=repr)[:_MAX_ITEMS]
            out = {"k": "obj", "label": label, "e": [[str(i), _ser(x, depth - 1)] for i, x in enumerate(items)]}
            if n > _MAX_ITEMS:
                out["more"] = n - _MAX_ITEMS
            return out
        if isinstance(v, dict):
            n = len(v)
            label = "%s (%d)" % (name, n)
            if depth <= 0:
                return {"k": "obj", "label": label, "e": [], "more": n}
            e = []
            for k in v:
                if len(e) >= _MAX_ITEMS:
                    break
                e.append([_key(k), _ser(v[k], depth - 1)])
            out = {"k": "obj", "label": label, "e": e}
            if n > _MAX_ITEMS:
                out["more"] = n - _MAX_ITEMS
            return out
        if isinstance(v, (types.FunctionType, types.BuiltinFunctionType, types.MethodType)):
            return _prim("fn", "ƒ %s()" % getattr(v, "__name__", "?"))
        if isinstance(v, type):
            return _prim("other", "class %s" % v.__name__)
        attrs = None
        if hasattr(v, "__dict__") and isinstance(getattr(v, "__dict__", None), dict):
            attrs = dict(v.__dict__)
        slots = getattr(type(v), "__slots__", None)
        if slots:
            attrs = attrs or {}
            for s in ([slots] if isinstance(slots, str) else slots):
                if hasattr(v, s):
                    attrs[s] = getattr(v, s)
        if attrs is not None and type(v).__module__ in ("__main__", "builtins"):
            if depth <= 0:
                return {"k": "obj", "label": name, "e": [], "more": len(attrs)}
            return {"k": "obj", "label": name, "e": [[str(k), _ser(x, depth - 1)] for k, x in list(attrs.items())[:_MAX_ITEMS]]}
        return _prim("other", _clip(repr(v)))
    except Exception as e:
        return _prim("other", "<%s>" % type(e).__name__)

class _StepLimit(BaseException):
    pass

_SKIP = (types.ModuleType, types.FunctionType, type)

def _frame_vars(frame):
    out = []
    for k, v in list(frame.f_locals.items()):
        if k.startswith("__") and k.endswith("__"):
            continue
        if isinstance(v, _SKIP):
            continue
        out.append([k, _ser(v, 5)])
    return out

def debug_code(src, stdin, max_steps):
    chunks = []
    err_chunks = []
    out, err = _prepare(stdin, chunks.append, err_chunks.append)
    steps = []
    state = {"truncated": False}
    unwinding = set()
    call_ids = {}  # id(frame) -> call number; frame objects can be reused, calls cannot
    seq = [0]

    def snapshot(frame):
        stack = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == _FILE:
                name = f.f_code.co_name
                stack.append({"name": "<main>" if name == "<module>" else name, "line": f.f_lineno, "vars": _frame_vars(f), "id": call_ids.get(id(f), 0)})
            f = f.f_back
        stack.reverse()
        return stack

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != _FILE:
            return None
        if event == "call":
            # A class body runs like a call when the class is defined; it is not a
            # call the user made (CO_OPTIMIZED is set only for real functions).
            if not (frame.f_code.co_flags & 0x1) and frame.f_code.co_name != "<module>":
                return None
            seq[0] += 1
            call_ids[id(frame)] = seq[0]
        elif event == "exception":
            unwinding.add(id(frame))
        elif event == "line":
            unwinding.discard(id(frame))  # the exception was caught here
            if len(steps) >= max_steps:
                state["truncated"] = True
                raise _StepLimit()
            steps.append({"line": frame.f_lineno, "stack": snapshot(frame), "out": out.total})
        elif event == "return" and frame.f_code.co_name != "<module>":
            # A frame being unwound by an exception also reports "return".
            if id(frame) in unwinding:
                unwinding.discard(id(frame))
            elif len(steps) < max_steps:
                stack = snapshot(frame)
                stack[-1]["vars"].append(["⏎ return", _ser(arg, 5)])
                steps.append({"line": frame.f_lineno, "stack": stack, "out": out.total, "ev": "return"})
        return tracer

    error = None
    code = 0
    try:
        compiled = compile(src, _FILE, "exec")
        g = {"__name__": "__main__", "__file__": _FILE}
        sys.settrace(tracer)
        try:
            exec(compiled, g)
        finally:
            sys.settrace(None)
    except _StepLimit:
        pass
    except SystemExit:
        pass
    except BaseException:
        sys.settrace(None)
        line, error = _report(err)
        code = 1
        if steps:
            steps.append({"line": line or steps[-1]["line"], "stack": steps[-1]["stack"], "out": out.total, "ev": "exception", "msg": error})
    result = {"steps": steps, "stdout": "".join(chunks), "stderr": "".join(err_chunks), "truncated": state["truncated"], "exitCode": code}
    if error:
        result["error"] = error
    return json.dumps(result)
`;

let ready: Promise<any> | null = null;

function load(base: string) {
  if (!ready) {
    ready = (async () => {
      const mod = await import(/* @vite-ignore */ `${base}pyodide/pyodide.mjs`);
      const py = await mod.loadPyodide({ indexURL: `${base}pyodide/` });
      py.runPython(HARNESS);
      return py;
    })();
  }
  return ready;
}

self.onmessage = async (ev: MessageEvent) => {
  const { mode, code, stdin, maxSteps, base } = ev.data as { mode: 'load' | 'run' | 'debug'; code: string; stdin: string; maxSteps: number; base: string };
  let py: any;
  try {
    py = await load(base);
  } catch (e: any) {
    post({ type: 'fatal', error: `Could not load the Python runtime: ${e?.message ?? e}` });
    return;
  }
  if (mode === 'load') {
    post({ type: 'ready' });
    return;
  }
  const started = performance.now();
  try {
    if (mode === 'run') {
      let pending: { s: 'stdout' | 'stderr'; t: string }[] = [];
      let last = 0;
      const flush = () => {
        if (pending.length) post({ type: 'out', chunks: pending });
        pending = [];
        last = performance.now();
      };
      // Python blocks this thread, so flush on a time check instead of a timer.
      const push = (s: 'stdout' | 'stderr') => (t: string) => {
        pending.push({ s, t });
        if (performance.now() - last > 50) flush();
      };
      const exitCode = py.globals.get('run_code')(code, stdin, push('stdout'), push('stderr'));
      flush();
      post({ type: 'done', result: { stdout: '', stderr: '', exitCode, timeMs: Math.round(performance.now() - started) } });
    } else {
      const json = py.globals.get('debug_code')(code, stdin, maxSteps);
      post({ type: 'done', trace: JSON.parse(json) });
    }
  } catch (e: any) {
    post({ type: 'fatal', error: String(e?.message ?? e) });
  }
};
