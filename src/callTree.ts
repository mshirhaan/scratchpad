// Rebuilds the tree of function calls from a recorded debugger trace.
//
// Each step carries the whole call stack, so calls are found by comparing the
// stack with the previous step's: frames that disappeared have returned, new
// frames are new calls. Two calls at the same depth back to back (fib(n-1)
// then fib(n-2)) are told apart by the frame id (Python, JS), by Python's
// "return" event, or, for Java/C/C++, by the caller's line showing in between.
import type { Trace, Val } from './types';
import { isObj, preview } from './values';

export interface CallNode {
  /** Position in `nodes`, in call order. */
  index: number;
  name: string;
  /** Argument values as shown in the label, e.g. "4" or "2, 3". */
  args: string;
  /** Return value: every language records it except for void functions (and async ones in JS). */
  ret?: string;
  /** First and last step inside this call (including its children). */
  start: number;
  end: number;
  depth: number;
  parent: CallNode | null;
  children: CallNode[];
  /** How many earlier calls had the same name and arguments (0 = first time). */
  repeatOf: number;
}

export interface CallTree {
  root: CallNode;
  nodes: CallNode[];
  /** Calls other than the entry point (main). */
  calls: number;
  /** Calls that repeat an earlier call with the same arguments. */
  repeats: number;
}

const RET = '⏎ return';
const short = (v: Val) => {
  const s = isObj(v) ? preview(v, 24) : v.v;
  return s.length > 24 ? `${s.slice(0, 23)}…` : s;
};

function argText(vars: [string, Val][]): string {
  return vars
    .filter(([k, v]) => k !== RET && k !== 'self' && k !== 'this' && v.k !== 'fn' && !(v.k === 'null' && v.v === 'undefined'))
    .map(([, v]) => short(v))
    .join(', ');
}

const cache = new WeakMap<Trace, CallTree>();

export function buildCallTree(trace: Trace): CallTree | null {
  const hit = cache.get(trace);
  if (hit) return hit;
  const steps = trace.steps;
  if (!steps.length) return null;

  const nodes: CallNode[] = [];
  const open: CallNode[] = []; // open[i] is the live call at depth i + 1
  const seen = new Map<string, number>();
  let lastIds: (number | undefined)[] = [];
  let returnedDepth = 0; // depth whose frame ended with a "return" event on the previous step

  const close = (keep: number, at: number) => {
    while (open.length > keep) open.pop()!.end = at;
  };

  steps.forEach((st, k) => {
    const frames = st.stack;
    let keep = 0;
    while (
      keep < open.length &&
      keep < frames.length &&
      open[keep].name === frames[keep].name &&
      (frames[keep].id === undefined || lastIds[keep] === undefined || frames[keep].id === lastIds[keep]) &&
      keep + 1 !== returnedDepth
    ) {
      keep++;
    }
    close(keep, k - 1);
    for (let i = keep; i < frames.length; i++) {
      const f = frames[i];
      const args = i === 0 ? '' : argText(f.vars);
      const sig = `${f.name}(${args})`;
      const repeatOf = seen.get(sig) ?? 0;
      seen.set(sig, repeatOf + 1);
      const node: CallNode = { index: nodes.length, name: f.name, args, start: k, end: steps.length - 1, depth: i, parent: open[i - 1] ?? null, children: [], repeatOf };
      node.parent?.children.push(node);
      nodes.push(node);
      open.push(node);
    }
    lastIds = frames.map((f) => f.id);
    returnedDepth = 0;
    if (st.ev === 'return' && open.length) {
      const ret = frames[frames.length - 1].vars.find(([n]) => n === RET);
      if (ret) open[open.length - 1].ret = short(ret[1]);
      returnedDepth = frames.length;
    }
  });
  close(0, steps.length - 1);

  // The first frame is the program's entry point; everything else hangs off it.
  const root = nodes[0];
  const tree: CallTree = { root, nodes, calls: nodes.length - 1, repeats: nodes.filter((n) => n.repeatOf > 0).length };
  cache.set(trace, tree);
  return tree;
}

/** The innermost call running at a step. */
export function callAt(tree: CallTree, step: number): CallNode {
  let node = tree.root;
  for (;;) {
    const child = node.children.find((c) => c.start <= step && step <= c.end);
    if (!child) return node;
    node = child;
  }
}
