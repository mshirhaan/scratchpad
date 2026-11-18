# Runs inside gdb (gdb -batch -x gdb_tracer.py ./main). Single-steps the
# program and writes one snapshot per executed source line: the call stack
# and every local variable, in the JSON shape the Scratchpad debugger reads.
import itertools
import json
import os

import gdb

SRC = os.path.realpath(os.environ["TRACE_SRC"])
OUT = os.environ["TRACE_OUT"]
STDOUT = os.environ["TRACE_STDOUT"]
STDERR = os.environ["TRACE_STDERR"]
STDIN = os.environ["TRACE_STDIN"]
MAX_STEPS = int(os.environ.get("TRACE_MAX", "3000"))
MAX_ITEMS = 60
MAX_DEPTH = 4

state = {"exit": None, "signal": None}


def prim(kind, text):
    return {"k": kind, "v": text}


def short_type(t):
    name = str(t)
    name = name.replace("std::__cxx11::", "std::").replace("std::", "")
    name = name.replace("basic_string<char, char_traits<char>, allocator<char> >", "string")
    # Drop default allocator / comparator template arguments.
    for junk in (", allocator<", ", less<", ", hash<", ", equal_to<"):
        i = name.find(junk)
        if i != -1:
            name = name[:i] + ">"
    return name if len(name) <= 48 else name[:45] + "..."


def text_of(v):
    try:
        return v.format_string(max_elements=200)
    except Exception as e:  # noqa: BLE001
        return "<%s>" % e


def ser(v, depth):
    try:
        return ser_inner(v, depth)
    except gdb.MemoryError:
        return prim("other", "<unreadable memory>")
    except Exception as e:  # noqa: BLE001
        return prim("other", "<%s>" % e)


def ser_inner(v, depth):
    t = v.type.strip_typedefs()
    code = t.code
    if code in (gdb.TYPE_CODE_REF, gdb.TYPE_CODE_RVALUE_REF):
        v = v.referenced_value()
        t = v.type.strip_typedefs()
        code = t.code

    if code == gdb.TYPE_CODE_BOOL:
        return prim("bool", "true" if bool(v) else "false")
    if code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_CHAR, gdb.TYPE_CODE_ENUM):
        if t.sizeof == 1 and code != gdb.TYPE_CODE_ENUM:
            return prim("str", text_of(v))
        return prim("num", text_of(v))
    if code == gdb.TYPE_CODE_FLT:
        return prim("num", text_of(v))

    if code == gdb.TYPE_CODE_PTR:
        if int(v) == 0:
            return prim("null", "nullptr")
        target = t.target().strip_typedefs()
        if target.code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_CHAR) and target.sizeof == 1:
            return prim("str", text_of(v))
        if target.code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION):
            if depth <= 0:
                return {"k": "obj", "label": short_type(t), "e": [], "more": 1}
            inner = ser(v.dereference(), depth)
            if inner.get("k") == "obj":
                inner["label"] = short_type(t)
            return inner
        return prim("other", text_of(v))

    pp = gdb.default_visualizer(v)
    if pp is not None:
        if hasattr(pp, "children"):
            label = short_type(v.type)
            if depth <= 0:
                return {"k": "obj", "label": label, "e": [], "more": 1}
            hint = pp.display_hint() if hasattr(pp, "display_hint") else None
            entries = []
            more = 0
            if hint == "map":
                kids = list(itertools.islice(pp.children(), MAX_ITEMS * 2 + 2))
                if len(kids) > MAX_ITEMS * 2:
                    more = 1
                    kids = kids[: MAX_ITEMS * 2]
                for i in range(0, len(kids) - 1, 2):
                    key = kids[i][1]
                    key_text = text_of(key) if isinstance(key, gdb.Value) else str(key)
                    entries.append([key_text, to_val(kids[i + 1][1], depth - 1)])
            else:
                kids = list(itertools.islice(pp.children(), MAX_ITEMS + 1))
                if len(kids) > MAX_ITEMS:
                    more = 1
                    kids = kids[:MAX_ITEMS]
                for name, child in kids:
                    name = str(name)
                    if name.startswith("[") and name.endswith("]"):
                        name = name[1:-1]
                    entries.append([name, to_val(child, depth - 1)])
            out = {"k": "obj", "label": "%s (%d%s)" % (label, len(entries), "+" if more else ""), "e": entries}
            if more:
                out["more"] = more
            return out
        return prim("str", text_of(v))

    if code == gdb.TYPE_CODE_ARRAY:
        lo, hi = t.range()
        n = hi - lo + 1
        label = "%s" % short_type(t)
        if depth <= 0:
            return {"k": "obj", "label": label, "e": [], "more": 1}
        target = t.target().strip_typedefs()
        if target.code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_CHAR) and target.sizeof == 1:
            return prim("str", text_of(v))
        entries = [[str(i), ser(v[i], depth - 1)] for i in range(lo, lo + min(n, MAX_ITEMS))]
        out = {"k": "obj", "label": label, "e": entries}
        if n > MAX_ITEMS:
            out["more"] = n - MAX_ITEMS
        return out

    if code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION):
        label = short_type(t)
        if depth <= 0:
            return {"k": "obj", "label": label, "e": [], "more": 1}
        entries = []
        for f in t.fields():
            if not hasattr(f, "bitpos"):
                continue  # static member
            if f.is_base_class:
                base = ser(v[f], depth)
                if base.get("k") == "obj":
                    entries.extend(base["e"])
                continue
            if f.name is None:
                continue
            entries.append([f.name, ser(v[f], depth - 1)])
        return {"k": "obj", "label": label, "e": entries}

    return prim("other", text_of(v))


def to_val(child, depth):
    if isinstance(child, gdb.Value):
        return ser(child, depth)
    return prim("other", str(child))


def in_user_code(frame):
    sal = frame.find_sal()
    return sal.symtab is not None and os.path.realpath(sal.symtab.fullname()) == SRC


def frame_vars(frame, innermost):
    line = frame.find_sal().line
    seen = set()
    out = []
    try:
        block = frame.block()
    except RuntimeError:
        return out
    while block is not None and not block.is_global and not block.is_static:
        for sym in block:
            if not (sym.is_variable or sym.is_argument) or sym.name in seen:
                continue
            if sym.name.startswith("__"):
                continue  # compiler temporaries such as __for_range
            # A local whose declaration has not executed yet holds garbage.
            if innermost and sym.is_variable and not sym.is_argument and sym.line >= line:
                continue
            seen.add(sym.name)
            try:
                out.append([sym.name, ser(sym.value(frame), MAX_DEPTH)])
            except Exception as e:  # noqa: BLE001
                out.append([sym.name, prim("other", "<%s>" % e)])
        if block.function is not None:
            break
        block = block.superblock
    return out


def user_frames():
    """The user's own frames, outermost (main) first."""
    out = []
    f = gdb.newest_frame()
    while f is not None:
        if in_user_code(f):
            out.append(f)
        f = f.older()
    out.reverse()
    return out


# ---- return values ----
# `step` never sees a function's return value, so every user function the
# program enters gets a FinishBreakpoint: gdb reports the value to it as the
# function returns, and execution carries on without stopping. The value is
# then shown as a "return" step, like Python's: the function's last recorded
# line plus a "⏎ return" entry.

returned = []  # (user-stack depth, serialised value or None), filled while the program runs
armed = {}  # user-stack depth -> its catcher (None if gdb could not set one)


class ReturnCatcher(gdb.FinishBreakpoint):
    def __init__(self, frame, depth):
        super().__init__(frame, internal=True)
        self.depth = depth

    def stop(self):
        rv = self.return_value
        returned.append((self.depth, None if rv is None else ser(rv, MAX_DEPTH)))
        return False  # keep going: this is not a place to pause

    def out_of_scope(self):
        pass  # left by an exception or longjmp: no value; disarm() cleans up


def disarm(depth):
    """Forget the catchers for frames at `depth` and deeper (those calls are over)."""
    for d in [d for d in armed if d >= depth]:
        bp = armed.pop(d)
        try:
            if bp is not None and bp.is_valid():
                bp.delete()
        except Exception:  # noqa: BLE001
            pass


def arm():
    """Give every user frame below main a catcher, if it has none yet."""
    frames = user_frames()
    disarm(len(frames))
    for depth in range(1, len(frames)):
        if depth not in armed:
            try:
                armed[depth] = ReturnCatcher(frames[depth], depth)
            except Exception:  # noqa: BLE001  (inlined frames, etc.)
                armed[depth] = None


def add_returns(steps, base):
    """Turn values caught since the last step into "return" steps, innermost first.

    `base` is the last line step's stack; each returning frame is shown as it
    was there, with the value added to its variables."""
    items = sorted(returned, key=lambda r: -r[0])
    del returned[:]
    for depth, val in items:
        disarm(depth)
        if val is None or base is None or depth >= len(base):
            continue
        stack = [dict(f) for f in base[: depth + 1]]
        stack[-1]["vars"] = list(stack[-1]["vars"]) + [["\u23ce return", val]]
        steps.append({"line": stack[-1]["line"], "stack": stack, "out": flushed_size(), "ev": "return"})


def snapshot():
    frames = []
    f = gdb.newest_frame()
    first = True
    while f is not None:
        if in_user_code(f):
            frames.append({"name": f.name() or "?", "line": f.find_sal().line, "vars": frame_vars(f, first)})
        first = False
        f = f.older()
    frames.reverse()
    return frames


def flushed_size():
    try:
        gdb.parse_and_eval("((int(*)(void*))fflush)(0)")
    except Exception:  # noqa: BLE001
        pass
    try:
        return os.path.getsize(STDOUT)
    except OSError:
        return 0


def on_exit(ev):
    state["exit"] = getattr(ev, "exit_code", 0)


def on_stop(ev):
    if isinstance(ev, gdb.SignalEvent):
        state["signal"] = ev.stop_signal


def alive():
    return gdb.selected_inferior().pid != 0


def main():
    for cmd in (
        "set pagination off",
        "set confirm off",
        "set debuginfod enabled off",
        "set print elements 200",
        "set print pretty off",
        "set step-mode off",
        "skip -gfi /usr/*",
        "skip -gfi /build/*",
    ):
        try:
            gdb.execute(cmd, to_string=True)
        except gdb.error:
            pass
    gdb.events.exited.connect(on_exit)
    gdb.events.stop.connect(on_stop)

    steps = []
    error = None
    truncated = False
    gdb.execute("break main", to_string=True)
    gdb.execute("run < '%s' > '%s' 2> '%s'" % (STDIN, STDOUT, STDERR), to_string=True)

    guard = 0
    base = None  # stack of the last line step, for return steps
    while alive():
        add_returns(steps, base)
        guard += 1
        if guard > MAX_STEPS * 20:
            truncated = True
            break
        frame = gdb.selected_frame()
        if state["signal"]:
            sig = state["signal"]
            f = frame
            while f is not None and not in_user_code(f):
                f = f.older()
            line = f.find_sal().line if f is not None else 0
            stack = snapshot()
            error = "Program received %s%s" % (sig, " (segmentation fault: bad pointer or out-of-bounds access)" if sig == "SIGSEGV" else "")
            steps.append({"line": line, "stack": stack, "out": flushed_size(), "ev": "exception", "msg": error})
            break
        if not in_user_code(frame):
            try:
                if frame.older() is None:
                    gdb.execute("continue", to_string=True)
                else:
                    gdb.execute("finish", to_string=True)
            except gdb.error:
                try:
                    gdb.execute("continue", to_string=True)
                except gdb.error:
                    break
            continue
        if len(steps) >= MAX_STEPS:
            truncated = True
            break
        base = snapshot()
        steps.append({"line": frame.find_sal().line, "stack": base, "out": flushed_size()})
        try:
            arm()
        except Exception:  # noqa: BLE001
            pass
        try:
            gdb.execute("step", to_string=True)
        except gdb.error:
            break

    if not truncated and not error:
        add_returns(steps, base)
    if alive():
        try:
            gdb.execute("kill", to_string=True)
        except gdb.error:
            pass

    result = {"steps": steps, "stdout": "", "stderr": "", "truncated": truncated, "exitCode": state["exit"]}
    if error:
        result["error"] = error
    with open(OUT, "w") as fh:
        json.dump(result, fh)


main()
