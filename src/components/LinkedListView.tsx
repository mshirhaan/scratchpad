// Linked lists in the debugger's Visual view: nodes drawn as boxes joined by
// arrows, with every variable that points at a node (head, tail, curr,
// self.head, ...) labelled above it. Nodes are matched up by the object id
// the tracers send, so tail and curr land on the same box as the node they
// refer to, and a cycle is shown as an arrow back to where it closes.
import type { ReactElement } from 'react';
import type { Val } from '../types';
import { cellText, isObj, type Obj } from '../values';

type Vars = [string, Val][];

const NEXT_FIELD = /^(?:next|nxt|next_?node|link)$/i;
const PREV_FIELD = /^(?:prev|previous|prv|prev_?node)$/i;
const VALUE_FIELD = /^(?:val|value|data|key|item|elem|element|info|v|x|num|number|name)$/i;
const LIMIT = 60;
const COLORS = ['var(--accent)', 'var(--blue)', 'var(--amber)', '#c084fc', 'var(--red)', '#f472b6'];

/** Every fully sent object with an id, by id, found anywhere in these variables. */
export type Heap = Map<string, Obj>;
export function heapOf(vars: Vars): Heap {
  const heap: Heap = new Map();
  const walk = (v: Val) => {
    if (!isObj(v)) return;
    if (v.id && v.e.length && !heap.has(v.id)) heap.set(v.id, v);
    for (const [, x] of v.e) walk(x);
  };
  for (const [, v] of vars) walk(v);
  return heap;
}

/** The full object for a value that may be a reference (an id with no fields). */
const resolve = (v: Val, heap: Heap): Obj | null => {
  if (!isObj(v)) return null;
  if (v.e.length) return v;
  return (v.id && heap.get(v.id)) || null;
};

const field = (o: Obj, re: RegExp) => o.e.find(([k]) => re.test(k));

/** A linked-list node: an object of the user's own class with a next field holding a node or null. */
export function isNode(v: Val, heap: Heap): boolean {
  const o = resolve(v, heap);
  if (!o || !o.id) return false;
  const next = field(o, NEXT_FIELD);
  return Boolean(next && (next[1].k === 'null' || (isObj(next[1]) && Boolean(next[1].id))));
}

function nodeText(o: Obj): string {
  const f = field(o, VALUE_FIELD) ?? o.e.find(([k]) => !NEXT_FIELD.test(k) && !PREV_FIELD.test(k));
  return f ? cellText(f[1]) : '·';
}

interface Chain {
  ids: string[];
  /** How the chain ends: at null, by looping back to a node in it, or cut off. */
  end: { k: 'null' } | { k: 'cycle'; to: string } | { k: 'more' };
}

function chainFrom(start: Obj, heap: Heap): Chain {
  const ids: string[] = [];
  let o: Obj | null = start;
  while (o && o.id) {
    if (ids.includes(o.id)) return { ids, end: { k: 'cycle', to: o.id } };
    if (ids.length >= LIMIT) return { ids, end: { k: 'more' } };
    ids.push(o.id);
    const next = field(o, NEXT_FIELD);
    if (!next || next[1].k === 'null') return { ids, end: { k: 'null' } };
    o = resolve(next[1], heap);
  }
  return { ids, end: { k: 'more' } };
}

/**
 * Draws the linked lists reachable from these variables. Each list is drawn
 * once, from its earliest node any variable points at; variables pointing
 * further along it become labels on their node.
 */
export function linkedLists(vars: Vars, prevVars: Vars | null, heap: Heap): ReactElement[] {
  const prevHeap = prevVars ? heapOf(prevVars) : null;
  const refs: { name: string; id: string }[] = [];
  for (const [name, v] of vars) {
    const o = resolve(v, heap);
    if (o && o.id && isNode(o, heap)) refs.push({ name, id: o.id });
  }
  if (!refs.length) return [];

  // Chains keyed by their first node; a chain that turns out to be the tail of
  // another one is dropped in favour of the longer one.
  const chains: { start: string; name: string; chain: Chain }[] = [];
  for (const r of refs) {
    if (chains.some((c) => c.chain.ids.includes(r.id))) continue;
    const chain = chainFrom(heap.get(r.id)!, heap);
    for (let i = chains.length - 1; i >= 0; i--) if (chain.ids.includes(chains[i].start)) chains.splice(i, 1);
    chains.push({ start: r.id, name: r.name, chain });
  }

  const color = new Map(refs.map((r, i) => [r.name, COLORS[i % COLORS.length]]));
  const labels = new Map<string, string[]>();
  for (const r of refs) labels.set(r.id, [...(labels.get(r.id) || []), r.name]);

  const changed = (id: string) => {
    if (!prevHeap) return false;
    const before = prevHeap.get(id);
    const now = heap.get(id)!;
    if (!before) return true;
    const link = (o: Obj) => {
      const n = field(o, NEXT_FIELD);
      return n ? (isObj(n[1]) ? n[1].id : n[1].v) : '';
    };
    return nodeText(before) !== nodeText(now) || link(before) !== link(now);
  };

  return chains.map(({ start, name, chain }) => {
    const doubly = chain.ids.every((id) => field(heap.get(id)!, PREV_FIELD));
    const at = (id: string) => chain.ids.indexOf(id);
    return (
      <div className="viz-block" key={`ll-${start}`}>
        <div className="viz-title">
          <span className="var-name">{name}</span>{' '}
          <span className="v-type">
            {doubly ? 'doubly linked list' : 'linked list'} ({chain.ids.length}
            {chain.end.k === 'more' ? '+' : ''})
          </span>
        </div>
        <div className="viz-scroll">
          <div className="ll-row">
            {chain.ids.map((id, i) => {
              const node = heap.get(id)!;
              const names = labels.get(id) || [];
              const ring = names.length ? color.get(names[0]) : undefined;
              const fields = node.e.map(([k, x]) => `${k}: ${isObj(x) ? x.label : x.v}`).join('\n');
              return (
                <div className="ll-item" key={id}>
                  <div className="ll-node-col">
                    <div className="ll-ptrs">
                      {names.map((n) => (
                        <span key={n} className="viz-ptr" style={{ color: color.get(n) }}>
                          {n}
                          <span className="viz-arrow">▼</span>
                        </span>
                      ))}
                    </div>
                    <div
                      className={`ll-node${changed(id) ? ' changed' : ''}`}
                      style={ring ? { boxShadow: `inset 0 0 0 2px ${ring}` } : undefined}
                      title={`${node.label}\n${fields}`}
                    >
                      {nodeText(node)}
                    </div>
                  </div>
                  {i < chain.ids.length - 1 && <span className="ll-arrow">{doubly ? '⇄' : '→'}</span>}
                </div>
              );
            })}
            <span className="ll-arrow">→</span>
            {chain.end.k === 'null' && <span className="ll-end">null</span>}
            {chain.end.k === 'more' && <span className="viz-more">…</span>}
            {chain.end.k === 'cycle' && (
              <span className="ll-end ll-cycle" title="This node's next points back into the list">
                ↺ back to node {at(chain.end.to) + 1} ({nodeText(heap.get(chain.end.to)!)})
              </span>
            )}
          </div>
        </div>
      </div>
    );
  });
}
