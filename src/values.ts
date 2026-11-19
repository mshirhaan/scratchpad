// Helpers for reading debugger values (Val) the same way across languages.
// Every tracer (Python, JS/TS, Java, C/C++) emits the same shape; only the
// type labels differ: list / Array(5) / int[5] / std::vector, dict / Map /
// HashMap / std::map, and so on.
import type { Val } from './types';

export type Obj = Extract<Val, { k: 'obj' }>;

/** One-line summary of a value, e.g. `[1, 2, 3]` or `{a: 1}`. */
export function preview(v: Val, budget = 56): string {
  if (v.k !== 'obj') return v.v;
  if (!v.e.length) return v.label;
  const keyed = v.e.some(([k], i) => k !== String(i));
  let out = '';
  for (const [k, child] of v.e) {
    const piece = (keyed ? `${k}: ` : '') + (child.k === 'obj' ? child.label : child.v);
    if (out.length + piece.length > budget) {
      out += '…';
      break;
    }
    out += (out ? ', ' : '') + piece;
  }
  if (v.more && !out.endsWith('…')) out += ', …';
  return keyed ? `{${out}}` : `[${out}]`;
}

export const isObj = (v: Val): v is Obj => v.k === 'obj';
const SET_LABEL = /set/i;
const MAP_LABEL = /dict|map|counter|^object$/i;
const SEQ_LABEL = /list|array|vector|deque|tuple|stack|queue|\[\d*\]/i;

/** A value cut off by the tracer's depth limit has a label but no items. */
const collapsed = (v: Obj) => v.e.length === 0 && Boolean(v.more);

export function isSet(v: Val): boolean {
  return isObj(v) && SET_LABEL.test(v.label) && !MAP_LABEL.test(v.label) && !collapsed(v);
}

export function isSeq(v: Val): boolean {
  if (!isObj(v) || isSet(v) || MAP_LABEL.test(v.label) || collapsed(v)) return false;
  // Empty: only a real container, whose label carries its size ("list (0)", "int[0]"),
  // not an object of a class that happens to be called e.g. ArrayList.
  if (v.e.length === 0) return SEQ_LABEL.test(v.label) && /\(\d+\)|\[\d*\]/.test(v.label);
  return v.e.every(([k], i) => k === String(i));
}

export function isMap(v: Val): boolean {
  return isObj(v) && MAP_LABEL.test(v.label) && !collapsed(v);
}

/** Total length, including items the tracer did not send. */
export const seqLength = (v: Obj) => v.e.length + (v.more ?? 0);

/** A 2-D array: a sequence whose items are all non-empty sequences of plain values. */
export function isGrid(v: Val): boolean {
  if (!isSeq(v)) return false;
  const rows = (v as Obj).e;
  return rows.length > 0 && rows.every(([, row]) => isSeq(row) && (row as Obj).e.length > 0 && (row as Obj).e.every(([, c]) => !isObj(c)));
}

/** Integer value of a number variable, or null. */
export function intOf(v: Val): number | null {
  return v.k === 'num' && /^-?\d+$/.test(v.v) ? Number(v.v) : null;
}

/**
 * The characters of a string value, or null when it was clipped by the tracer.
 * Handles Python repr ('abc'), JSON ("abc"), C++ ("abc") and Java char[] (char[3] "abc").
 */
export function charsOf(v: Val): string[] | null {
  if (v.k !== 'str') return null;
  const m = v.v.match(/^(?:\S+\s)?(['"])([\s\S]*)\1$/);
  if (!m) return null;
  const body = m[2].replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, e: string) => {
    if (e[0] === 'u' || e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ n: '\n', t: '\t', r: '\r', '0': '\0' } as Record<string, string>)[e] ?? e;
  });
  return [...body];
}

/** Text for one cell: plain values as-is, nested structures as a short preview. */
export const cellText = (v: Val) => (isObj(v) ? preview(v, 18) : v.v);

/** Variable names that usually index into an array or string. */
const POINTER_NAME =
  /^(?:[ijkpqlr]\d*|lo|hi|low|high|left|right|mid|start|end|begin|slow|fast|head|tail|top|front|rear|cur|curr|pos|ptr|idx|index)$|(?:idx|index|ptr|pos)$|^(?:left|right|lo|hi|low|high|start|end|slow|fast)[_A-Z0-9]/i;
export const isPointerName = (name: string) => POINTER_NAME.test(name);

/**
 * Which variables the code uses to index which arrays and strings: for every
 * `name[...]`, and every `name.charAt(...)`, `name.get(...)` and the like, the
 * identifiers inside the brackets. `key[i]`, `nums[mid + 1]`, `s[l:r]`,
 * `self.arr[self.count]` and `list.get(i)` all count. Names are without their
 * owner (`arr`, `count`), since Java code often leaves out `this.`.
 */
/** Keywords and type names, which appear in many statements and link nothing. */
const NOT_LINKS = new Set(
  'int long short byte char float double boolean bool void var let const auto unsigned signed size_t String string final static new return if else elif for while in not and or is None null nullptr undefined true false True False this self'.split(' '),
);

export function indexUses(code: string): Map<string, Set<string>> {
  const uses = new Map<string, Set<string>>();
  const open = /(?<![\w$])([A-Za-z_$][\w$]*)\s*(?:\[|\.\s*(?:charAt|codePointAt|get|set|at|substring|subList|slice|splice|remove|insert|pop|add)\s*\()/g;
  for (let m = open.exec(code); m; m = open.exec(code)) {
    // Read up to the matching close bracket.
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    for (; i < code.length && depth > 0; i++) {
      const c = code[i];
      if (c === '[' || c === '(') depth++;
      else if (c === ']' || c === ')') depth--;
    }
    const inside = code.slice(from, i - 1).match(/[A-Za-z_$][\w$]*/g) ?? [];
    if (!inside.length) continue;
    const set = uses.get(m[1]) ?? new Set<string>();
    for (const w of inside) set.add(w);
    uses.set(m[1], set);
  }
  // Variables assigned from or into those count too: mid = (lo + hi) // 2 and
  // lo = mid + 1 tie lo and hi to nums through mid. A plain counter (i += 1)
  // stays out.
  const assignments = code
    .replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""')
    .split(/[;\n{}]/)
    .filter((st) => /(?<![=!<>])=(?![=>])/.test(st))
    // Names of functions called (len, max, ...) don't link anything.
    .map((st) => [...st.matchAll(/([A-Za-z_$][\w$]*)(?!\s*\(|[\w$])/g)].map((x) => x[1]).filter((w) => !NOT_LINKS.has(w)));
  for (const [target, set] of uses) {
    for (let grew = true; grew; ) {
      grew = false;
      for (const ids of assignments) {
        // Linking through the array's own name would tie k = len(nums) to nums.
        if (!ids.some((w) => w !== target && set.has(w))) continue;
        for (const w of ids) if (!set.has(w)) (set.add(w), (grew = true));
      }
    }
  }
  return uses;
}

/** Names used for the row and column of a 2-D table such as dp[i][j]. */
export const ROW_NAMES = ['i', 'r', 'row', 'x'];
export const COL_NAMES = ['j', 'c', 'col', 'y'];
