// Builds whiteboard shapes for common data structures from a short text
// input. The result is a list of Excalidraw "element skeletons" (rectangles,
// ellipses, text and arrows bound to shapes) laid out with the top-left at 0,0.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Skeleton = Record<string, any>;

export type TemplateId = 'array' | 'matrix' | 'linkedlist' | 'tree' | 'graph' | 'stack' | 'queue' | 'hashmap';

export interface Template {
  id: TemplateId;
  label: string;
  hint: string;
  example: string;
  build: (input: string, uid: () => string) => Skeleton[];
}

const CELL = 56;
const CELL_H = 48;
const NODE = 52;
const MUTED = '#868e96';
const BLUE = '#1971c2';
const FONT = 20;
const SMALL = 15;

/** "1, 2, 3" or "[1,2,3]" or "1 2 3" -> ["1","2","3"] */
export function splitValues(input: string): string[] {
  const s = input.trim().replace(/^\[|\]$/g, '');
  if (!s) return [];
  return (s.includes(',') ? s.split(',') : s.split(/\s+/)).map((x) => x.trim().replace(/^["']|["']$/g, '')).filter((x) => x !== '');
}

const box = (id: string, x: number, y: number, text: string, extra: Skeleton = {}): Skeleton => ({
  type: 'rectangle',
  id,
  x,
  y,
  width: CELL,
  height: CELL_H,
  label: { text, fontSize: FONT },
  ...extra,
});

const text = (id: string, x: number, y: number, t: string, extra: Skeleton = {}): Skeleton => ({
  type: 'text',
  id,
  x,
  y,
  text: t,
  fontSize: SMALL,
  strokeColor: MUTED,
  ...extra,
});

/** Text centred horizontally on cx (Excalidraw positions text by its left edge). */
const centredText = (id: string, cx: number, y: number, t: string, extra: Skeleton = {}) => text(id, cx - (t.length * SMALL * 0.55) / 2, y, t, extra);

const arrow = (id: string, from: string, to: string, extra: Skeleton = {}): Skeleton => ({
  type: 'arrow',
  id,
  x: 0,
  y: 0,
  start: { id: from },
  end: { id: to },
  ...extra,
});

function buildArray(input: string, uid: () => string): Skeleton[] {
  const vals = splitValues(input);
  const out: Skeleton[] = [];
  vals.forEach((v, i) => {
    out.push(box(uid(), i * CELL, 0, v));
    out.push(centredText(uid(), i * CELL + CELL / 2, CELL_H + 6, String(i)));
  });
  return out;
}

function buildMatrix(input: string, uid: () => string): Skeleton[] {
  const rows = input
    .split(/;|\n|\]\s*,\s*\[/)
    .map((r) => splitValues(r.replace(/[[\]]/g, '')))
    .filter((r) => r.length);
  const out: Skeleton[] = [];
  const left = 28;
  const top = 26;
  const width = Math.max(0, ...rows.map((r) => r.length));
  for (let j = 0; j < width; j++) out.push(centredText(uid(), left + j * CELL + CELL / 2, 0, String(j)));
  rows.forEach((r, i) => {
    out.push(text(uid(), 4, top + i * CELL_H + CELL_H / 2 - 10, String(i)));
    r.forEach((v, j) => out.push(box(uid(), left + j * CELL, top + i * CELL_H, v)));
  });
  return out;
}

function buildLinkedList(input: string, uid: () => string): Skeleton[] {
  const vals = splitValues(input);
  const out: Skeleton[] = [];
  const gap = 56;
  const ids = vals.map(() => uid());
  vals.forEach((v, i) => out.push(box(ids[i], i * (CELL + gap), 26, v, { roundness: { type: 3 } })));
  for (let i = 0; i + 1 < vals.length; i++) out.push(arrow(uid(), ids[i], ids[i + 1]));
  if (vals.length) {
    const nullId = uid();
    out.push(text(nullId, vals.length * (CELL + gap), 26 + CELL_H / 2 - 11, 'null', { fontSize: 18 }));
    out.push(arrow(uid(), ids[vals.length - 1], nullId));
    out.push(centredText(uid(), CELL / 2, 0, 'head', { strokeColor: BLUE }));
  }
  return out;
}

/** Level-order input as on LeetCode: "1, 2, 3, null, 4". */
function buildTree(input: string, uid: () => string): Skeleton[] {
  const vals = splitValues(input).map((v) => (/^(null|none|nil|#|-)$/i.test(v) ? null : v));
  if (!vals.length || vals[0] === null) return [];
  interface N { v: string; id: string; left?: N; right?: N; depth: number; x: number }
  const root: N = { v: vals[0]!, id: uid(), depth: 0, x: 0 };
  const queue: N[] = [root];
  let i = 1;
  while (queue.length && i < vals.length) {
    const n = queue.shift()!;
    for (const side of ['left', 'right'] as const) {
      if (i >= vals.length) break;
      const v = vals[i++];
      if (v !== null) {
        const child: N = { v, id: uid(), depth: n.depth + 1, x: 0 };
        n[side] = child;
        queue.push(child);
      }
    }
  }
  // In-order position gives each node its own column, so subtrees never overlap.
  let col = 0;
  const all: N[] = [];
  const walk = (n: N | undefined) => {
    if (!n) return;
    walk(n.left);
    n.x = col++ * NODE;
    all.push(n);
    walk(n.right);
  };
  walk(root);
  const out: Skeleton[] = [];
  for (const n of all) {
    out.push({ type: 'ellipse', id: n.id, x: n.x, y: n.depth * (NODE + 56), width: NODE, height: NODE, label: { text: n.v, fontSize: FONT } });
  }
  for (const n of all) {
    if (n.left) out.push(arrow(uid(), n.id, n.left.id, { endArrowhead: null }));
    if (n.right) out.push(arrow(uid(), n.id, n.right.id, { endArrowhead: null }));
  }
  return out;
}

/** Edges such as "A-B, B-C" (undirected), "A->B" (directed), "A-B:4" (weighted). Lone names are nodes. */
function buildGraph(input: string, uid: () => string): Skeleton[] {
  const parts = input.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const names: string[] = [];
  const addName = (n: string) => {
    if (!names.includes(n)) names.push(n);
  };
  const edges: { a: string; b: string; directed: boolean; w?: string }[] = [];
  for (const p of parts) {
    const m = p.match(/^(.+?)\s*(->|<-|--|-|→)\s*(.+?)(?:\s*[:=]\s*(.+))?$/);
    if (m) {
      const [a, op, b, w] = [m[1].trim(), m[2], m[3].trim(), m[4]?.trim()];
      addName(a);
      addName(b);
      if (op === '<-') edges.push({ a: b, b: a, directed: true, w });
      else edges.push({ a, b, directed: op === '->' || op === '→', w });
    } else {
      addName(p);
    }
  }
  const n = names.length;
  if (!n) return [];
  const radius = n === 1 ? 0 : Math.max(120, (n * (NODE + 80)) / (2 * Math.PI));
  const ids = new Map(names.map((name) => [name, uid()]));
  const out: Skeleton[] = [];
  names.forEach((name, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    out.push({
      type: 'ellipse',
      id: ids.get(name),
      x: radius + radius * Math.cos(angle),
      y: radius + radius * Math.sin(angle),
      width: NODE,
      height: NODE,
      label: { text: name, fontSize: FONT },
    });
  });
  for (const e of edges) {
    out.push(arrow(uid(), ids.get(e.a)!, ids.get(e.b)!, { ...(e.directed ? {} : { endArrowhead: null }), ...(e.w ? { label: { text: e.w, fontSize: SMALL } } : {}) }));
  }
  return out;
}

function buildStack(input: string, uid: () => string): Skeleton[] {
  const vals = splitValues(input); // bottom first
  const out: Skeleton[] = [];
  const w = CELL * 1.6;
  vals.forEach((v, i) => out.push(box(uid(), 0, (vals.length - 1 - i) * CELL_H, v, { width: w })));
  if (vals.length) out.push(text(uid(), w + 12, CELL_H / 2 - 10, '← top', { strokeColor: BLUE }));
  return out;
}

function buildQueue(input: string, uid: () => string): Skeleton[] {
  const vals = splitValues(input); // front first
  const out: Skeleton[] = [];
  vals.forEach((v, i) => out.push(box(uid(), i * CELL, 26, v)));
  if (vals.length) {
    out.push(centredText(uid(), CELL / 2, 0, 'front', { strokeColor: BLUE }));
    out.push(centredText(uid(), (vals.length - 1) * CELL + CELL / 2, 26 + CELL_H + 6, 'rear', { strokeColor: BLUE }));
  }
  return out;
}

/** "a: 1, b: 2" or "a=1 b=2" */
function buildHashMap(input: string, uid: () => string): Skeleton[] {
  const pairs = input
    .trim()
    .replace(/^\{|\}$/g, '')
    .split(input.includes(',') ? ',' : /\s+/)
    .map((p) => p.split(/:|=|→|->/).map((x) => x.trim().replace(/^["']|["']$/g, '')))
    .filter((p) => p[0]);
  const out: Skeleton[] = [];
  const kw = CELL * 1.5;
  const vw = CELL * 1.5;
  out.push(centredText(uid(), kw / 2, 0, 'key'));
  out.push(centredText(uid(), kw + vw / 2, 0, 'value'));
  pairs.forEach(([k, v], i) => {
    const y = 24 + i * CELL_H;
    out.push(box(uid(), 0, y, k, { width: kw, backgroundColor: '#e7f5ff', fillStyle: 'solid' }));
    out.push(box(uid(), kw, y, v ?? '', { width: vw }));
  });
  return out;
}

/**
 * Excalidraw's converter attaches an arrow to its shapes but does not route
 * it: the arrow keeps its own x/y and a default 100px length. So place each
 * arrow from the edge of its start shape to the edge of its end shape.
 */
function routeArrows(skeleton: Skeleton[]): Skeleton[] {
  const byId = new Map(skeleton.map((e) => [e.id, e]));
  const size = (e: Skeleton) =>
    e.type === 'text' ? { w: e.text.length * (e.fontSize ?? SMALL) * 0.6, h: (e.fontSize ?? SMALL) * 1.25 } : { w: e.width, h: e.height };
  const centre = (e: Skeleton) => {
    const { w, h } = size(e);
    return { x: e.x + w / 2, y: e.y + h / 2 };
  };
  /** Point where the ray from the shape's centre towards (dx, dy) leaves the shape, plus a small gap. */
  const edge = (e: Skeleton, dx: number, dy: number) => {
    const c = centre(e);
    const len = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [dx / len, dy / len];
    const { w, h } = size(e);
    let t: number;
    if (e.type === 'ellipse') {
      const [a, b] = [w / 2, h / 2];
      t = 1 / Math.sqrt((ux * ux) / (a * a) + (uy * uy) / (b * b));
    } else {
      t = Math.min(ux ? w / 2 / Math.abs(ux) : Infinity, uy ? h / 2 / Math.abs(uy) : Infinity);
    }
    t += 4;
    return { x: c.x + ux * t, y: c.y + uy * t };
  };
  return skeleton.map((e) => {
    if (e.type !== 'arrow') return e;
    const a = byId.get(e.start?.id);
    const b = byId.get(e.end?.id);
    if (!a || !b) return e;
    const [ca, cb] = [centre(a), centre(b)];
    const p1 = edge(a, cb.x - ca.x, cb.y - ca.y);
    const p2 = edge(b, ca.x - cb.x, ca.y - cb.y);
    return { ...e, x: p1.x, y: p1.y, points: [[0, 0], [p2.x - p1.x, p2.y - p1.y]] };
  });
}

const routed = (build: Template['build']): Template['build'] => (input, uid) => routeArrows(build(input, uid));

export const TEMPLATES: Template[] = [
  { id: 'array', label: 'Array', hint: 'Values separated by commas or spaces', example: '5, 3, 8, 1, 9', build: buildArray },
  { id: 'matrix', label: '2-D grid', hint: 'Rows separated by ; or new lines', example: '1 2 3; 4 5 6; 7 8 9', build: buildMatrix },
  { id: 'linkedlist', label: 'Linked list', hint: 'Node values in order', example: '1, 2, 3, 4', build: routed(buildLinkedList) },
  { id: 'tree', label: 'Binary tree', hint: 'Level order like LeetCode, null for gaps', example: '4, 2, 7, 1, 3, 6, 9', build: routed(buildTree) },
  { id: 'graph', label: 'Graph', hint: 'A-B undirected, A->B directed, A-B:4 weighted', example: 'A-B, A-C, B-D, C-D, D-E', build: routed(buildGraph) },
  { id: 'stack', label: 'Stack', hint: 'Bottom to top', example: '1, 2, 3', build: buildStack },
  { id: 'queue', label: 'Queue', hint: 'Front to rear', example: '1, 2, 3', build: buildQueue },
  { id: 'hashmap', label: 'Hash map', hint: 'key: value pairs', example: 'a: 1, b: 2, c: 3', build: buildHashMap },
];
