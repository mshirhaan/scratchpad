// Draws the recursion / call tree up to the current debugger step. Calls
// appear as they are made, show their return value once finished, and calls
// repeating earlier arguments are flagged (the work memoisation would save).
import { useEffect, useMemo, useRef } from 'react';
import { buildCallTree, callAt, type CallNode } from '../callTree';
import { useStore } from '../store';
import type { Trace } from '../types';

const ROW_H = 58;
const BOX_H = 34;
const GAP = 12;
const CHAR_W = 7.2;
const MAX_NODES = 1500;

interface Placed {
  node: CallNode;
  x: number; // centre
  y: number; // top
  w: number;
}

const label = (n: CallNode) => (n.depth === 0 ? n.name : `${n.name}(${n.args})`);
const clip = (s: string, max = 26) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Simple tidy layout: each subtree gets the width of its children side by side. */
function layout(root: CallNode, step: number): { placed: Placed[]; width: number; height: number; hidden: number } {
  const placed: Placed[] = [];
  let count = 0;
  let hidden = 0;
  const visible = (n: CallNode) => n.children.filter((c) => c.start <= step);
  const boxW = (n: CallNode) => Math.max(clip(label(n)).length, n.ret !== undefined ? clip(`→ ${n.ret}`).length : 0) * CHAR_W + 18;

  const widths = new Map<CallNode, number>();
  const measure = (n: CallNode): number => {
    const kids = visible(n);
    const own = boxW(n);
    const sum = kids.reduce((a, c) => a + measure(c), 0) + Math.max(0, kids.length - 1) * GAP;
    const w = Math.max(own, sum);
    widths.set(n, w);
    return w;
  };
  const place = (n: CallNode, left: number, depth: number) => {
    if (count >= MAX_NODES) {
      hidden++;
      return;
    }
    count++;
    const w = widths.get(n)!;
    placed.push({ node: n, x: left + w / 2, y: depth * ROW_H, w: boxW(n) });
    const kids = visible(n);
    const sum = kids.reduce((a, c) => a + widths.get(c)!, 0) + Math.max(0, kids.length - 1) * GAP;
    let x = left + (w - sum) / 2;
    for (const c of kids) {
      place(c, x, depth + 1);
      x += widths.get(c)! + GAP;
    }
  };
  const width = measure(root);
  place(root, 0, 0);
  const height = Math.max(...placed.map((p) => p.y)) + BOX_H;
  return { placed, width, height, hidden };
}

export default function CallTreeView({ trace, stepIndex }: { trace: Trace; stepIndex: number }) {
  const tree = useMemo(() => buildCallTree(trace), [trace]);
  const wrap = useRef<HTMLDivElement>(null);
  const current = tree ? callAt(tree, stepIndex) : null;

  const { placed, width, height, hidden } = useMemo(
    () => (tree ? layout(tree.root, stepIndex) : { placed: [], width: 0, height: 0, hidden: 0 }),
    [tree, stepIndex],
  );

  // Keep the running call in view as the tree grows.
  useEffect(() => {
    wrap.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current, placed]);

  if (!tree || tree.calls === 0) {
    return <div className="viz-hint muted" style={{ padding: '4px 12px' }}>No function calls in this run. Call a function (recursive ones are the interesting case) to see its call tree here.</div>;
  }

  const onStack = new Set<CallNode>();
  for (let n: CallNode | null = current; n; n = n.parent) onStack.add(n);
  const byNode = new Map(placed.map((p) => [p.node, p]));
  const pad = 8;
  // Counts up to the current step, like the tree itself.
  const started = tree.nodes.filter((n) => n.start <= stepIndex);
  const shown = started.length - 1;
  const repeats = started.filter((n) => n.repeatOf > 0).length;

  return (
    <div className="ctree">
      <div className="ctree-legend">
        <span>
          {shown} of {tree.calls} call{tree.calls === 1 ? '' : 's'}
          {repeats > 0 && (
            <>
              {' · '}
              <span className="ctree-repeat-text">{repeats} repeated</span>
            </>
          )}
        </span>
        <span className="ctree-key"><i className="k-current" /> running</span>
        <span className="ctree-key"><i className="k-stack" /> waiting on a call</span>
        <span className="ctree-key"><i className="k-done" /> returned</span>
        {repeats > 0 && <span className="ctree-key"><i className="k-repeat" /> same arguments as an earlier call</span>}
      </div>
      <div className="ctree-scroll" ref={wrap}>
        <svg width={width + pad * 2} height={height + pad * 2} className="ctree-svg" role="img" aria-label="Call tree">
          <g transform={`translate(${pad},${pad})`}>
            {placed.map((p) => {
              const parent = p.node.parent && byNode.get(p.node.parent);
              if (!parent) return null;
              const done = p.node.end < stepIndex;
              return (
                <path
                  key={`e${p.node.index}`}
                  className={`ctree-edge${onStack.has(p.node) ? ' live' : done ? ' done' : ''}`}
                  d={`M${parent.x},${parent.y + BOX_H} C${parent.x},${parent.y + BOX_H + 14} ${p.x},${p.y - 14} ${p.x},${p.y}`}
                />
              );
            })}
            {placed.map((p) => {
              const n = p.node;
              const isCurrent = n === current;
              const state = isCurrent ? 'current' : onStack.has(n) ? 'stack' : n.end < stepIndex ? 'done' : '';
              const returning = isCurrent && trace.steps[stepIndex].ev === 'return';
              const showRet = n.ret !== undefined && (n.end < stepIndex || returning);
              return (
                <g
                  key={n.index}
                  className={`ctree-node ${state}${n.repeatOf > 0 ? ' repeat' : ''}`}
                  transform={`translate(${p.x - p.w / 2},${p.y})`}
                  data-current={isCurrent}
                  onClick={() => useStore.getState().gotoStep(n.start)}
                >
                  <title>
                    {`${label(n)}${n.ret !== undefined ? ` → ${n.ret}` : ''}\nCall #${n.index}${n.repeatOf > 0 ? `, repeat #${n.repeatOf} of this call` : ''}\nClick to jump to where it starts`}
                  </title>
                  <rect width={p.w} height={BOX_H} rx={7} />
                  <text x={p.w / 2} y={showRet ? 14 : BOX_H / 2 + 4} textAnchor="middle" className="ctree-label">
                    {clip(label(n))}
                  </text>
                  {showRet && (
                    <text x={p.w / 2} y={28} textAnchor="middle" className="ctree-ret">
                      {clip(`→ ${n.ret}`)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {hidden > 0 && <div className="viz-more">{hidden} more calls not drawn (the tree is very large).</div>}
      </div>
    </div>
  );
}
