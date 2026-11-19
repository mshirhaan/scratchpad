// Draws the selected frame's data structures for the current debugger step:
// arrays and strings as boxes with index variables pointing into them,
// 2-D arrays as a table, maps as key → value rows, sets as chips, and linked
// lists as nodes joined by arrows.
// Cells that changed since the previous step are highlighted.
import type { ReactElement } from 'react';
import type { Val } from '../types';
import { heapOf, isNode, linkedLists, type Heap } from './LinkedListView';
import { cellText, charsOf, COL_NAMES, intOf, isGrid, isMap, isObj, isPointerName, isSeq, isSet, preview, ROW_NAMES, seqLength, type Obj } from '../values';

const POINTER_COLORS = ['var(--accent)', 'var(--blue)', 'var(--amber)', '#c084fc', 'var(--red)', '#f472b6'];

interface Pointer {
  name: string;
  value: number;
  color: string;
}

type Vars = [string, Val][];

const same = (a: Val | undefined, b: Val | undefined) => (a && b ? JSON.stringify(a) === JSON.stringify(b) : a === b);

function entryMap(v: Val | undefined): Map<string, Val> {
  return new Map(v && isObj(v) ? v.e : []);
}

/** Pointer arrows under the cells; `len` is the array length, so `len` itself means "past the end". */
function PointerRow({ pointers, len, shown }: { pointers: Pointer[]; len: number; shown: number }) {
  const at = new Map<number, Pointer[]>();
  for (const p of pointers) if (p.value >= 0 && p.value <= Math.min(len, shown)) at.set(p.value, [...(at.get(p.value) || []), p]);
  if (!at.size) return null;
  const cols = shown + (at.has(shown) ? 1 : 0);
  return (
    <div className="viz-ptrs">
      {Array.from({ length: cols }, (_, i) => (
        <div key={i} className="viz-ptr-slot">
          {(at.get(i) || []).map((p) => (
            <span key={p.name} className="viz-ptr" style={{ color: p.color }}>
              <span className="viz-arrow">▲</span>
              {p.name}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function ArrayView({ name, label, cells, prevCells, len, pointers }: { name: string; label: string; cells: string[]; prevCells: string[] | null; len: number; pointers: Pointer[] }) {
  const ringOf = new Map<number, string>();
  for (const p of pointers) if (!ringOf.has(p.value)) ringOf.set(p.value, p.color);
  const pastEnd = pointers.some((p) => p.value === len && len === cells.length);
  return (
    <div className="viz-block">
      <div className="viz-title">
        <span className="var-name">{name}</span> <span className="v-type">{label}</span>
      </div>
      <div className="viz-scroll">
        <div className="viz-row">
          {cells.length === 0 && <div className="viz-empty">empty</div>}
          {cells.map((c, i) => {
            const changed = prevCells !== null && prevCells[i] !== c;
            const ring = ringOf.get(i);
            return (
              <div key={i} className="viz-col">
                <div className={`viz-cell${changed ? ' changed' : ''}`} style={ring ? { boxShadow: `inset 0 0 0 2px ${ring}` } : undefined} title={c}>
                  {c}
                </div>
                <div className="viz-idx">{i}</div>
              </div>
            );
          })}
          {pastEnd && (
            <div className="viz-col">
              <div className="viz-cell ghost" />
              <div className="viz-idx">{len}</div>
            </div>
          )}
          {len > cells.length && <div className="viz-more">… {len - cells.length} more</div>}
        </div>
        <PointerRow pointers={pointers} len={len} shown={cells.length} />
      </div>
    </div>
  );
}

function GridView({ name, v, prev, vars }: { name: string; v: Obj; prev: Val | undefined; vars: Vars }) {
  const find = (names: string[]) => {
    for (const n of names) {
      const hit = vars.find(([k]) => k === n);
      const x = hit ? intOf(hit[1]) : null;
      if (x !== null) return { name: n, value: x };
    }
    return null;
  };
  const row = find(ROW_NAMES);
  const col = find(COL_NAMES);
  const prevRows = entryMap(prev);
  const width = Math.max(...v.e.map(([, r]) => (isObj(r) ? r.e.length : 0)));
  return (
    <div className="viz-block">
      <div className="viz-title">
        <span className="var-name">{name}</span> <span className="v-type">{v.label}</span>
        {row && col && <span className="muted"> · [{row.name}][{col.name}] = [{row.value}][{col.value}]</span>}
      </div>
      <div className="viz-scroll">
        <table className="viz-grid">
          <thead>
            <tr>
              <th />
              {Array.from({ length: width }, (_, j) => (
                <th key={j} className={col?.value === j ? 'hot' : ''}>{j}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.e.map(([ri, r]) => {
              const i = Number(ri);
              const prevRow = entryMap(prevRows.get(ri));
              return (
                <tr key={ri}>
                  <th className={row?.value === i ? 'hot' : ''}>{i}</th>
                  {isObj(r) &&
                    r.e.map(([ci, c]) => {
                      const j = Number(ci);
                      const changed = prev !== undefined && !same(prevRow.get(ci), c);
                      const focus = row?.value === i && col?.value === j;
                      const band = row?.value === i || col?.value === j;
                      return (
                        <td key={ci} className={`${changed ? 'changed' : ''}${focus ? ' focus' : band ? ' band' : ''}`}>
                          {cellText(c)}
                        </td>
                      );
                    })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {v.more ? <div className="viz-more">… {v.more} more rows</div> : null}
      </div>
    </div>
  );
}

function MapView({ name, v, prev }: { name: string; v: Obj; prev: Val | undefined }) {
  const before = prev && isObj(prev) ? entryMap(prev) : null;
  const now = new Set(v.e.map(([k]) => k));
  const removed = before ? [...before.keys()].filter((k) => !now.has(k)) : [];
  return (
    <div className="viz-block">
      <div className="viz-title">
        <span className="var-name">{name}</span> <span className="v-type">{v.label}</span>
      </div>
      <div className="viz-map">
        {v.e.length === 0 && removed.length === 0 && <div className="viz-empty">empty</div>}
        {v.e.map(([k, val]) => {
          const state = !before ? '' : !before.has(k) ? ' added' : !same(before.get(k), val) ? ' changed' : '';
          return (
            <div key={k} className={`viz-kv${state}`}>
              <span className="viz-key">{k}</span>
              <span className="viz-to">→</span>
              <span className="viz-val">{isObj(val) ? preview(val, 40) : val.v}</span>
            </div>
          );
        })}
        {removed.map((k) => (
          <div key={`-${k}`} className="viz-kv removed" title="Removed in this step">
            <span className="viz-key">{k}</span>
            <span className="viz-to">→</span>
            <span className="viz-val">{cellText(before!.get(k)!)}</span>
          </div>
        ))}
        {v.more ? <div className="viz-more">… {v.more} more</div> : null}
      </div>
    </div>
  );
}

function SetView({ name, v, prev }: { name: string; v: Obj; prev: Val | undefined }) {
  const before = prev && isObj(prev) ? new Set(prev.e.map(([, x]) => cellText(x))) : null;
  const items = v.e.map(([, x]) => cellText(x));
  const now = new Set(items);
  const removed = before ? [...before].filter((x) => !now.has(x)) : [];
  return (
    <div className="viz-block">
      <div className="viz-title">
        <span className="var-name">{name}</span> <span className="v-type">{v.label}</span>
      </div>
      <div className="viz-chips">
        {items.length === 0 && removed.length === 0 && <div className="viz-empty">empty</div>}
        {items.map((x) => (
          <span key={x} className={`viz-chip${before && !before.has(x) ? ' added' : ''}`}>{x}</span>
        ))}
        {removed.map((x) => (
          <span key={`-${x}`} className="viz-chip removed" title="Removed in this step">{x}</span>
        ))}
        {v.more ? <span className="viz-more">… {v.more} more</span> : null}
      </div>
    </div>
  );
}

const isStructure = (v: Val) => isSeq(v) || isMap(v) || isSet(v);
/** Fields of an object that usually say how much of its array is in use. */
const SIZE_FIELD = /^(?:size|count|length|len|top)$/i;

/**
 * Objects such as self / this that hold arrays, maps, sets or linked-list
 * nodes are drawn through their fields, named like self.arr, self.head and
 * self.count. A node itself is drawn as part of its list.
 */
function expand(vars: Vars, heap: Heap): Vars {
  const out: Vars = [];
  const drawn = (x: Val) => isStructure(x) || isNode(x, heap);
  for (const [name, v] of vars) {
    if (isObj(v) && !drawn(v) && v.e.some(([, x]) => drawn(x))) {
      for (const [k, x] of v.e) if (isObj(x) ? drawn(x) : x.k !== 'fn') out.push([`${name}.${k}`, x]);
    } else {
      out.push([name, v]);
    }
  }
  return out;
}

const isPointer = (name: string) => {
  const field = name.slice(name.lastIndexOf('.') + 1);
  return isPointerName(field) || (field !== name && SIZE_FIELD.test(field));
};

export default function Visualizer({ vars: frameVars, prevVars: prevFrameVars }: { vars: Vars; prevVars: Vars | null }) {
  const heap = heapOf(frameVars);
  const vars = expand(frameVars, heap);
  const prevVars = prevFrameVars && expand(prevFrameVars, heapOf(prevFrameVars));
  const prev = new Map(prevVars ?? []);

  // Index variables: integer locals with pointer-like names, each with its own colour.
  const pointers: Pointer[] = [];
  for (const [name, v] of vars) {
    const n = intOf(v);
    if (n !== null && isPointer(name)) pointers.push({ name, value: n, color: POINTER_COLORS[pointers.length % POINTER_COLORS.length] });
  }
  const pointerColor = new Map(pointers.map((p) => [p.name, p.color]));
  // A field such as self.size only points into arrays of the same object (self.arr).
  const owner = (n: string) => n.slice(0, n.lastIndexOf('.'));
  const inRange = (len: number, target: string) =>
    pointers.filter((p) => p.value >= 0 && p.value <= len && (!p.name.includes('.') || owner(p.name) === owner(target)));

  const scalars: [string, Val][] = [];
  const blocks: ReactElement[] = [];
  for (const [name, v] of vars) {
    const pv = prev.get(name);
    if (isNode(v, heap)) {
      // drawn with its list below
    } else if (isObj(v)) {
      if (isGrid(v)) {
        blocks.push(<GridView key={name} name={name} v={v} prev={pv} vars={vars} />);
      } else if (isSeq(v)) {
        const cells = v.e.map(([, x]) => cellText(x));
        const prevCells = pv && isSeq(pv) ? (pv as Obj).e.map(([, x]) => cellText(x)) : null;
        blocks.push(<ArrayView key={name} name={name} label={v.label} cells={cells} prevCells={prevCells} len={seqLength(v)} pointers={inRange(seqLength(v), name)} />);
      } else if (isMap(v)) {
        blocks.push(<MapView key={name} name={name} v={v} prev={pv} />);
      } else if (isSet(v)) {
        blocks.push(<SetView key={name} name={name} v={v} prev={pv} />);
      }
    } else if (v.k !== 'fn') {
      // A string with an index variable inside it is drawn as boxes, one per character.
      const chars = charsOf(v);
      if (chars && chars.length > 1 && chars.length <= 80 && inRange(chars.length, name).length) {
        const prevChars = pv ? charsOf(pv) : null;
        blocks.push(<ArrayView key={name} name={name} label={`string (${chars.length})`} cells={chars} prevCells={prevChars} len={chars.length} pointers={inRange(chars.length, name)} />);
      }
      scalars.push([name, v]);
    }
  }

  const lists = linkedLists(vars, prevVars, heap);

  return (
    <div className="viz">
      {scalars.length > 0 && (
        <div className="viz-scalars">
          {scalars.map(([name, v]) => {
            const changed = prevVars !== null && !same(prev.get(name), v);
            const color = pointerColor.get(name);
            return (
              <span key={name} className={`viz-scalar${changed ? ' changed' : ''}`} style={color ? { borderColor: color } : undefined}>
                <span className="var-name" style={color ? { color } : undefined}>{name}</span>
                <span className="var-eq">=</span>
                <span className={`v-${v.k}`}>{isObj(v) ? v.label : v.v}</span>
              </span>
            );
          })}
        </div>
      )}
      {blocks}
      {lists}
      {blocks.length === 0 && lists.length === 0 && (
        <div className="viz-hint muted">
          Arrays, 2-D arrays, maps, sets and linked lists in this function are drawn here. Strings are drawn too once an index variable such as <code>i</code>,{' '}
          <code>left</code> or <code>right</code> points into them.
        </div>
      )}
    </div>
  );
}
