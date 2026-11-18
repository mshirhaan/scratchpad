// Launches the user's program under the Java Debug Interface, single-steps it
// line by line and writes a snapshot of the call stack and variables for each
// step, in the JSON shape the Scratchpad debugger reads.
//
// usage: java JavaTracer <classpath> <mainClass> <maxSteps> <stdinFile> <traceFile> <stdoutFile> <stderrFile>
import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public class JavaTracer {
    static final String[] EXCLUDE = {"java.", "javax.", "jdk.", "sun.", "com.sun."};
    static final int MAX_ITEMS = 60;
    static final int MAX_DEPTH = 4;
    static final int MAX_STR = 200;

    static final ByteArrayOutputStream out = new ByteArrayOutputStream();
    static final ByteArrayOutputStream err = new ByteArrayOutputStream();
    static InputStream pout;
    static InputStream perr;
    static final List<String> steps = new ArrayList<>();
    static String error = null;

    public static void main(String[] a) throws Exception {
        String cp = a[0];
        String mainClass = a[1];
        int maxSteps = Integer.parseInt(a[2]);
        byte[] stdin = Files.readAllBytes(Paths.get(a[3]));
        boolean truncated = false;

        LaunchingConnector connector = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> args = connector.defaultArguments();
        args.get("main").setValue(mainClass);
        args.get("options").setValue("-cp \"" + cp + "\"");
        VirtualMachine vm = connector.launch(args);
        Process proc = vm.process();
        pout = proc.getInputStream();
        perr = proc.getErrorStream();

        Thread feeder = new Thread(() -> {
            try (OutputStream os = proc.getOutputStream()) {
                os.write(stdin);
            } catch (IOException ignored) {
            }
        });
        feeder.setDaemon(true);
        feeder.start();

        EventRequestManager erm = vm.eventRequestManager();
        ClassPrepareRequest cpr = erm.createClassPrepareRequest();
        cpr.addClassFilter(mainClass);
        cpr.enable();
        ExceptionRequest er = erm.createExceptionRequest(null, false, true);
        er.enable();

        EventQueue queue = vm.eventQueue();
        boolean done = false;
        try {
            while (!done) {
                EventSet set = queue.remove(50);
                drain();
                if (set == null) continue;
                for (Event e : set) {
                    if (e instanceof ClassPrepareEvent) {
                        ReferenceType rt = ((ClassPrepareEvent) e).referenceType();
                        for (Method m : rt.methodsByName("main")) {
                            if (m.isStatic() && !m.isAbstract() && !m.isNative()) {
                                erm.createBreakpointRequest(m.location()).enable();
                            }
                        }
                    } else if (e instanceof BreakpointEvent) {
                        BreakpointEvent be = (BreakpointEvent) e;
                        be.request().disable();
                        record(be.thread(), null);
                        StepRequest sr = erm.createStepRequest(be.thread(), StepRequest.STEP_LINE, StepRequest.STEP_INTO);
                        for (String ex : EXCLUDE) sr.addClassExclusionFilter(ex + "*");
                        sr.enable();
                        // Return values of the user's own methods, for the call tree.
                        if (vm.canGetMethodReturnValues()) {
                            MethodExitRequest mx = erm.createMethodExitRequest();
                            mx.addThreadFilter(be.thread());
                            for (String ex : EXCLUDE) mx.addClassExclusionFilter(ex + "*");
                            mx.enable();
                        }
                    } else if (e instanceof StepEvent) {
                        if (steps.size() >= maxSteps) {
                            truncated = true;
                            done = true;
                        } else {
                            record(((StepEvent) e).thread(), null);
                        }
                    } else if (e instanceof MethodExitEvent) {
                        MethodExitEvent me = (MethodExitEvent) e;
                        Method m = me.method();
                        // void methods, constructors and main have nothing to show.
                        if (steps.size() < maxSteps && !m.isConstructor() && !m.isStaticInitializer() && !"void".equals(m.returnTypeName())
                                && !(m.isStatic() && m.name().equals("main"))) {
                            record(me.thread(), null, me.returnValue());
                        }
                    } else if (e instanceof ExceptionEvent) {
                        ExceptionEvent ee = (ExceptionEvent) e;
                        error = describe(ee.exception());
                        record(ee.thread(), error);
                    } else if (e instanceof VMDeathEvent || e instanceof VMDisconnectEvent) {
                        done = true;
                    }
                }
                if (done && truncated) {
                    vm.exit(1);
                } else if (!done) {
                    set.resume();
                }
            }
        } catch (VMDisconnectedException ignored) {
        }

        try {
            out.write(pout.readAllBytes());
            err.write(perr.readAllBytes());
        } catch (IOException ignored) {
        }
        int exit = 0;
        try {
            exit = proc.waitFor();
        } catch (InterruptedException ignored) {
        }

        StringBuilder sb = new StringBuilder();
        sb.append("{\"steps\":[");
        for (int i = 0; i < steps.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(steps.get(i));
        }
        sb.append("],\"stdout\":\"\",\"stderr\":\"\",\"truncated\":").append(truncated);
        sb.append(",\"exitCode\":").append(truncated ? 0 : exit);
        if (error != null) sb.append(",\"error\":").append(quote(error));
        sb.append('}');
        Files.write(Paths.get(a[5]), out.toByteArray());
        Files.write(Paths.get(a[6]), err.toByteArray());
        Files.write(Paths.get(a[4]), sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    static void drain() throws IOException {
        while (pout.available() > 0) {
            byte[] b = new byte[pout.available()];
            int n = pout.read(b);
            if (n <= 0) break;
            out.write(b, 0, n);
        }
        while (perr.available() > 0) {
            byte[] b = new byte[perr.available()];
            int n = perr.read(b);
            if (n <= 0) break;
            err.write(b, 0, n);
        }
    }

    static boolean excluded(String className) {
        for (String ex : EXCLUDE) if (className.startsWith(ex)) return true;
        return false;
    }

    static String simple(String className) {
        int lt = className.indexOf('<');
        String head = lt < 0 ? className : className.substring(0, lt);
        int dot = head.lastIndexOf('.');
        String s = className.substring(dot + 1);
        return s.replace('$', '.');
    }

    static String describe(ObjectReference ex) {
        String name = ex.referenceType().name();
        String msg = null;
        try {
            Value v = field(ex, "detailMessage");
            if (v instanceof StringReference) msg = ((StringReference) v).value();
        } catch (Exception ignored) {
        }
        return "Uncaught " + name + (msg == null ? "" : ": " + msg);
    }

    static void record(ThreadReference thread, String msg) {
        record(thread, msg, null);
    }

    /** One step. With a return value, a "return" step: it is added to the innermost frame's variables. */
    static void record(ThreadReference thread, String msg, Value ret) {
        try {
            // Output written just before this stop may still be in the pipe.
            drain();
            List<StackFrame> frames = thread.frames();
            StringBuilder stack = new StringBuilder();
            int line = 0;
            boolean first = true;
            for (int i = frames.size() - 1; i >= 0; i--) {
                StackFrame f = frames.get(i);
                Location loc = f.location();
                String cn = loc.declaringType().name();
                if (excluded(cn)) continue;
                line = loc.lineNumber();
                if (!first) stack.append(',');
                first = false;
                stack.append("{\"name\":").append(quote(simple(cn) + "." + loc.method().name()));
                stack.append(",\"line\":").append(line).append(",\"vars\":[");
                boolean firstVar = true;
                ObjectReference self = f.thisObject();
                if (self != null) {
                    stack.append("[\"this\",");
                    ser(self, MAX_DEPTH, stack);
                    stack.append(']');
                    firstVar = false;
                }
                try {
                    List<LocalVariable> vars = f.visibleVariables();
                    Map<LocalVariable, Value> values = f.getValues(vars);
                    for (LocalVariable lv : vars) {
                        if (!firstVar) stack.append(',');
                        firstVar = false;
                        stack.append('[').append(quote(lv.name())).append(',');
                        ser(values.get(lv), MAX_DEPTH, stack);
                        stack.append(']');
                    }
                } catch (AbsentInformationException ignored) {
                }
                if (ret != null && i == 0) {
                    if (!firstVar) stack.append(',');
                    stack.append("[\"⏎ return\",");
                    ser(ret, MAX_DEPTH, stack);
                    stack.append(']');
                }
                stack.append("]}");
            }
            if (first) return; // no user frames on the stack
            StringBuilder sb = new StringBuilder();
            sb.append("{\"line\":").append(line).append(",\"stack\":[").append(stack).append("],\"out\":").append(out.size());
            if (msg != null) sb.append(",\"ev\":\"exception\",\"msg\":").append(quote(msg));
            else if (ret != null) sb.append(",\"ev\":\"return\"");
            sb.append('}');
            steps.add(sb.toString());
        } catch (IncompatibleThreadStateException | IOException ignored) {
        }
    }

    // ---- value serialisation ----

    static Value field(ObjectReference o, String name) {
        Field f = o.referenceType().fieldByName(name);
        return f == null ? null : o.getValue(f);
    }

    static int intField(ObjectReference o, String name) {
        Value v = field(o, name);
        return v instanceof IntegerValue ? ((IntegerValue) v).value() : 0;
    }

    static void prim(String kind, String text, StringBuilder sb) {
        sb.append("{\"k\":\"").append(kind).append("\",\"v\":").append(quote(text)).append('}');
    }

    static String clip(String s) {
        return s.length() > MAX_STR ? s.substring(0, MAX_STR) + "…" : s;
    }

    /** Short text for a value used as a map key. */
    static String keyText(Value v) {
        if (v == null) return "null";
        if (v instanceof StringReference) return "\"" + clip(((StringReference) v).value()) + "\"";
        if (v instanceof PrimitiveValue) return v.toString();
        if (v instanceof ObjectReference) {
            ObjectReference o = (ObjectReference) v;
            String cn = o.referenceType().name();
            if (isBoxed(cn)) return keyText(field(o, "value"));
            if (v instanceof ArrayReference) return simple(cn);
            return simple(cn);
        }
        return v.toString();
    }

    static boolean isBoxed(String cn) {
        switch (cn) {
            case "java.lang.Integer": case "java.lang.Long": case "java.lang.Double": case "java.lang.Float":
            case "java.lang.Short": case "java.lang.Byte": case "java.lang.Character": case "java.lang.Boolean":
                return true;
            default:
                return false;
        }
    }

    static void stub(String label, StringBuilder sb) {
        sb.append("{\"k\":\"obj\",\"label\":").append(quote(label)).append(",\"e\":[],\"more\":1}");
    }

    /** Writes a list-like object: label plus indexed items. */
    static void list(String label, List<Value> items, int total, int depth, StringBuilder sb) {
        sb.append("{\"k\":\"obj\",\"label\":").append(quote(label + " (" + total + ")")).append(",\"e\":[");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append("[\"").append(i).append("\",");
            ser(items.get(i), depth - 1, sb);
            sb.append(']');
        }
        sb.append(']');
        if (total > items.size()) sb.append(",\"more\":").append(total - items.size());
        sb.append('}');
    }

    static void map(String label, List<Value[]> entries, int total, int depth, StringBuilder sb) {
        sb.append("{\"k\":\"obj\",\"label\":").append(quote(label + " (" + total + ")")).append(",\"e\":[");
        for (int i = 0; i < entries.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('[').append(quote(keyText(entries.get(i)[0]))).append(',');
            ser(entries.get(i)[1], depth - 1, sb);
            sb.append(']');
        }
        sb.append(']');
        if (total > entries.size()) sb.append(",\"more\":").append(total - entries.size());
        sb.append('}');
    }

    static List<Value> slice(Value arr, int from, int count) {
        if (!(arr instanceof ArrayReference) || count <= 0) return new ArrayList<>();
        ArrayReference a = (ArrayReference) arr;
        int n = Math.min(Math.min(count, MAX_ITEMS), a.length() - from);
        return n <= 0 ? new ArrayList<>() : a.getValues(from, n);
    }

    static List<Value[]> hashEntries(ObjectReference m) {
        List<Value[]> res = new ArrayList<>();
        Value head = field(m, "head"); // LinkedHashMap keeps insertion order
        if (m.referenceType().fieldByName("head") != null && m.referenceType().name().contains("LinkedHashMap")) {
            ObjectReference n = (ObjectReference) head;
            while (n != null && res.size() < MAX_ITEMS) {
                res.add(new Value[] {field(n, "key"), field(n, "value")});
                n = (ObjectReference) field(n, "after");
            }
            return res;
        }
        Value table = field(m, "table");
        if (!(table instanceof ArrayReference)) return res;
        for (Value bucket : ((ArrayReference) table).getValues()) {
            ObjectReference n = (ObjectReference) bucket;
            while (n != null && res.size() < MAX_ITEMS) {
                res.add(new Value[] {field(n, "key"), field(n, "value")});
                n = (ObjectReference) field(n, "next");
            }
            if (res.size() >= MAX_ITEMS) break;
        }
        return res;
    }

    static void treeEntries(ObjectReference node, List<Value[]> res) {
        // Iterative in-order walk of TreeMap.Entry nodes.
        Deque<ObjectReference> stack = new ArrayDeque<>();
        ObjectReference cur = node;
        while ((cur != null || !stack.isEmpty()) && res.size() < MAX_ITEMS) {
            while (cur != null) {
                stack.push(cur);
                cur = (ObjectReference) field(cur, "left");
            }
            cur = stack.pop();
            res.add(new Value[] {field(cur, "key"), field(cur, "value")});
            cur = (ObjectReference) field(cur, "right");
        }
    }

    static List<Value> keys(List<Value[]> entries) {
        List<Value> res = new ArrayList<>();
        for (Value[] e : entries) res.add(e[0]);
        return res;
    }

    static void ser(Value v, int depth, StringBuilder sb) {
        try {
            serInner(v, depth, sb);
        } catch (VMDisconnectedException e) {
            throw e;
        } catch (RuntimeException e) {
            prim("other", "<" + e.getClass().getSimpleName() + ">", sb);
        }
    }

    static void serInner(Value v, int depth, StringBuilder sb) {
        if (v == null) { prim("null", "null", sb); return; }
        if (v instanceof BooleanValue) { prim("bool", v.toString(), sb); return; }
        if (v instanceof CharValue) { prim("str", "'" + ((CharValue) v).value() + "'", sb); return; }
        if (v instanceof PrimitiveValue) { prim("num", v.toString(), sb); return; }
        if (v instanceof StringReference) { prim("str", "\"" + clip(((StringReference) v).value()) + "\"", sb); return; }
        if (v instanceof ArrayReference) {
            ArrayReference arr = (ArrayReference) v;
            int n = arr.length();
            String type = simple(arr.referenceType().name());
            String label = type.replaceFirst("\\[\\]", "[" + n + "]");
            if (type.equals("char[]")) {
                StringBuilder chars = new StringBuilder();
                for (Value c : arr.getValues(0, Math.min(n, MAX_STR))) chars.append(((CharValue) c).value());
                prim("str", label + " \"" + chars + (n > MAX_STR ? "…" : "") + "\"", sb);
                return;
            }
            if (depth <= 0) { stub(label, sb); return; }
            List<Value> items = slice(arr, 0, n);
            sb.append("{\"k\":\"obj\",\"label\":").append(quote(label)).append(",\"e\":[");
            for (int i = 0; i < items.size(); i++) {
                if (i > 0) sb.append(',');
                sb.append("[\"").append(i).append("\",");
                ser(items.get(i), depth - 1, sb);
                sb.append(']');
            }
            sb.append(']');
            if (n > items.size()) sb.append(",\"more\":").append(n - items.size());
            sb.append('}');
            return;
        }
        ObjectReference o = (ObjectReference) v;
        String cn = o.referenceType().name();
        String name = simple(cn);
        if (isBoxed(cn)) { serInner(field(o, "value"), depth, sb); return; }
        if (cn.equals("java.lang.StringBuilder") || cn.equals("java.lang.StringBuffer")) {
            int count = intField(o, "count");
            Value coder = field(o, "coder");
            int shift = coder instanceof ByteValue ? ((ByteValue) coder).value() : 0;
            ArrayReference bytes = (ArrayReference) field(o, "value");
            int chars = Math.min(count, MAX_STR);
            StringBuilder s = new StringBuilder();
            List<Value> raw = bytes.getValues(0, Math.min(bytes.length(), chars << shift));
            if (shift == 0) {
                for (Value b : raw) s.append((char) (((ByteValue) b).value() & 0xff));
            } else {
                for (int i = 0; i + 1 < raw.size(); i += 2) {
                    int lo = ((ByteValue) raw.get(i)).value() & 0xff;
                    int hi = ((ByteValue) raw.get(i + 1)).value() & 0xff;
                    s.append((char) (lo | (hi << 8)));
                }
            }
            prim("str", name + " \"" + s + (count > chars ? "…" : "") + "\"", sb);
            return;
        }
        if (o.referenceType() instanceof ClassType && ((ClassType) o.referenceType()).isEnum()) {
            Value n = field(o, "name");
            prim("other", name + "." + (n instanceof StringReference ? ((StringReference) n).value() : "?"), sb);
            return;
        }
        if (depth <= 0) { stub(name, sb); return; }

        switch (cn) {
            case "java.util.ArrayList": {
                int size = intField(o, "size");
                list(name, slice(field(o, "elementData"), 0, size), size, depth, sb);
                return;
            }
            case "java.util.Vector":
            case "java.util.Stack": {
                int size = intField(o, "elementCount");
                list(name, slice(field(o, "elementData"), 0, size), size, depth, sb);
                return;
            }
            case "java.util.Arrays$ArrayList": {
                Value arr = field(o, "a");
                int size = arr instanceof ArrayReference ? ((ArrayReference) arr).length() : 0;
                list("List", slice(arr, 0, size), size, depth, sb);
                return;
            }
            case "java.util.PriorityQueue": {
                int size = intField(o, "size");
                list("PriorityQueue · heap order", slice(field(o, "queue"), 0, size), size, depth, sb);
                return;
            }
            case "java.util.ArrayDeque": {
                Value els = field(o, "elements");
                int head = intField(o, "head");
                int tail = intField(o, "tail");
                List<Value> items = new ArrayList<>();
                int total = 0;
                if (els instanceof ArrayReference) {
                    ArrayReference arr = (ArrayReference) els;
                    int len = arr.length();
                    total = len == 0 ? 0 : ((tail - head) % len + len) % len;
                    for (int i = 0; i < Math.min(total, MAX_ITEMS); i++) items.add(arr.getValue((head + i) % len));
                }
                list("ArrayDeque · front first", items, total, depth, sb);
                return;
            }
            case "java.util.LinkedList": {
                int size = intField(o, "size");
                List<Value> items = new ArrayList<>();
                ObjectReference n = (ObjectReference) field(o, "first");
                while (n != null && items.size() < MAX_ITEMS) {
                    items.add(field(n, "item"));
                    n = (ObjectReference) field(n, "next");
                }
                list(name, items, size, depth, sb);
                return;
            }
            case "java.util.HashMap":
            case "java.util.LinkedHashMap": {
                map(name, hashEntries(o), intField(o, "size"), depth, sb);
                return;
            }
            case "java.util.HashSet":
            case "java.util.LinkedHashSet": {
                ObjectReference m = (ObjectReference) field(o, "map");
                list(name, keys(hashEntries(m)), intField(m, "size"), depth, sb);
                return;
            }
            case "java.util.TreeMap": {
                List<Value[]> entries = new ArrayList<>();
                treeEntries((ObjectReference) field(o, "root"), entries);
                map(name, entries, intField(o, "size"), depth, sb);
                return;
            }
            case "java.util.TreeSet": {
                Value m = field(o, "m");
                if (m instanceof ObjectReference && ((ObjectReference) m).referenceType().name().equals("java.util.TreeMap")) {
                    List<Value[]> entries = new ArrayList<>();
                    treeEntries((ObjectReference) field((ObjectReference) m, "root"), entries);
                    list(name, keys(entries), intField((ObjectReference) m, "size"), depth, sb);
                    return;
                }
                break;
            }
            case "java.util.ImmutableCollections$ListN": {
                Value arr = field(o, "elements");
                int size = arr instanceof ArrayReference ? ((ArrayReference) arr).length() : 0;
                list("List", slice(arr, 0, size), size, depth, sb);
                return;
            }
            case "java.util.ImmutableCollections$List12": {
                List<Value> items = new ArrayList<>();
                items.add(field(o, "e0"));
                Value e1 = field(o, "e1");
                if (e1 != null && !((ObjectReference) e1).referenceType().name().equals("java.lang.Object")) items.add(e1);
                list("List", items, items.size(), depth, sb);
                return;
            }
            default:
                break;
        }

        // JDK internals (Scanner, streams, ...) are noise in a variables view.
        if (excluded(cn)) { prim("other", name, sb); return; }

        // Any other object: show its instance fields.
        sb.append("{\"k\":\"obj\",\"label\":").append(quote(name)).append(",\"e\":[");
        boolean first = true;
        int shown = 0;
        for (Field f : o.referenceType().allFields()) {
            if (f.isStatic() || f.isSynthetic()) continue;
            if (shown++ >= MAX_ITEMS) break;
            if (!first) sb.append(',');
            first = false;
            sb.append('[').append(quote(f.name())).append(',');
            ser(o.getValue(f), depth - 1, sb);
            sb.append(']');
        }
        sb.append("]}");
    }

    static String quote(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20 || Character.isSurrogate(c)) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.append('"').toString();
    }
}
