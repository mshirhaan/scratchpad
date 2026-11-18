import { ArrowDownToLine, Maximize2, X, ArrowUpFromLine, Bug, ChevronDown, ChevronRight, FastForward, Redo2, Rewind, SkipBack, Square, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LANG_BY_ID } from '../languages';
import { activeFile, useStore } from '../store';
import type { Frame, Val } from '../types';
import { preview } from '../values';
import CallTreeView from './CallTreeView';
import Visualizer from './Visualizer';

function VarRow({ name, val, path, depth, changed, open, toggle }: { name: string; val: Val; path: string; depth: number; changed: boolean; open: Set<string>; toggle: (p: string) => void }) {
  const isObj = val.k === 'obj' && (val.e.length > 0 || Boolean(val.more));
  const expanded = isObj && open.has(path);
  return (
    <>
      <div className={`var-row${changed ? ' changed' : ''}`} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => isObj && toggle(path)}>
        <span className="var-caret">{isObj ? expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}</span>
        <span className="var-name">{name}</span>
        <span className="var-eq">=</span>
        {val.k === 'obj' ? (
          <span className="var-val">
            <span className="v-type">{val.label}</span> {!expanded && val.e.length > 0 && <span className="v-prev">{preview(val)}</span>}
          </span>
        ) : (
          <span className={`var-val v-${val.k}`}>{val.v}</span>
        )}
      </div>
      {expanded && val.k === 'obj' && (
        <>
          {val.e.map(([k, child]) => (
            <VarRow key={k} name={k} val={child} path={`${path}/${k}`} depth={depth + 1} changed={false} open={open} toggle={toggle} />
          ))}
          {val.more ? (
            <div className="var-row muted" style={{ paddingLeft: 8 + (depth + 1) * 14 + 16 }}>
              {val.e.length ? `… ${val.more} more` : '… not expanded further'}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

export default function DebugPanel() {
  const trace = useStore((s) => s.trace);
  const stepIndex = useStore((s) => s.stepIndex);
  const frameIndex = useStore((s) => s.frameIndex);
  const running = useStore((s) => s.running);
  const debugNote = useStore((s) => s.debugNote);
  const view = useStore((s) => s.settings.debugView ?? 'visual');
  const language = useStore((s) => (s.ws ? activeFile(s.ws).language : undefined));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [bigTree, setBigTree] = useState(false);
  useEffect(() => {
    if (!bigTree) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setBigTree(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bigTree]);
  const s = useStore.getState();
  const lang = language ? LANG_BY_ID[language] : null;

  if (!trace) {
    return (
      <div className="debug-empty">
        {running === 'debug' ? (
          <p>Recording the run…</p>
        ) : (
          <>
            <Bug size={22} />
            <p>
              <strong>Debug</strong> runs your program once, records every line it executes, then lets you step forwards and backwards through it and inspect
              every variable.
            </p>
            <p className="muted">
              Without breakpoints it pauses on the first line. Click a line number to set a breakpoint and it runs straight to it.{' '}
              {lang && !lang.debug ? `Debugging is not available for ${lang.label} yet.` : ''}
            </p>
            <button className="btn btn-debug" onClick={s.startDebug} disabled={!lang?.debug}>
              <Bug size={14} /> Start debugging
            </button>
          </>
        )}
      </div>
    );
  }

  const steps = trace.steps;
  const step = steps[stepIndex];
  const prev = stepIndex > 0 ? steps[stepIndex - 1] : null;
  const fi = frameIndex ?? step.stack.length - 1;
  const frame: Frame | undefined = step.stack[fi];
  const prevFrame = prev && prev.stack.length === step.stack.length ? prev.stack[fi] : undefined;
  const comparable = Boolean(prevFrame && prevFrame.name === frame?.name && fi === step.stack.length - 1);
  const prevVars = new Map((comparable ? prevFrame!.vars : []).map(([k, v]) => [k, JSON.stringify(v)]));
  const last = stepIndex === steps.length - 1;
  const toggle = (p: string) => setOpen((cur) => {
    const next = new Set(cur);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    return next;
  });

  let status = `line ${step.line}`;
  let statusClass = '';
  if (step.ev === 'exception') {
    status = step.msg || 'Exception';
    statusClass = 'err';
  } else if (last && debugNote) {
    status = debugNote;
    statusClass = 'warn';
  } else if (last) {
    status = trace.truncated ? `Step limit reached (${steps.length} steps recorded). The program was stopped.` : 'Program finished';
    statusClass = trace.truncated ? 'warn' : 'ok';
  } else if (step.ev === 'return') {
    status = `returning from ${frame?.name ?? ''} (line ${step.line})`;
  }

  return (
    <div className="debug">
      <div className="debug-bar">
        <button className="icon-btn" onClick={() => s.step('restart')} title="Back to the first step"><SkipBack size={15} /></button>
        <button className="icon-btn" onClick={() => s.step('rcontinue')} title="Run backwards to the previous breakpoint (Shift+F8)"><Rewind size={15} /></button>
        <button className="icon-btn" onClick={() => s.step('back')} disabled={stepIndex === 0} title="Step back (F9)"><Undo2 size={15} /></button>
        <button className="icon-btn primary" onClick={() => s.step('over')} disabled={last} title="Step over (F10)"><Redo2 size={15} /></button>
        <button className="icon-btn" onClick={() => s.step('into')} disabled={last} title="Step into (F11)"><ArrowDownToLine size={15} /></button>
        <button className="icon-btn" onClick={() => s.step('out')} disabled={last} title="Step out (Shift+F11)"><ArrowUpFromLine size={15} /></button>
        <button className="icon-btn" onClick={() => s.step('continue')} disabled={last} title="Continue to the next breakpoint, or the end (F8)"><FastForward size={15} /></button>
        <button className="icon-btn danger" onClick={s.stopDebug} title="Stop debugging"><Square size={14} /></button>
        <input
          className="scrub"
          type="range"
          min={0}
          max={steps.length - 1}
          value={stepIndex}
          onChange={(e) => s.gotoStep(Number(e.target.value))}
          aria-label="Step"
        />
        <span className="step-count">
          {stepIndex + 1} / {steps.length}
        </span>
      </div>
      <div className={`debug-status ${statusClass}`}>{status}</div>
      <div className="debug-cols">
        <div className="debug-stack">
          <div className="debug-h">Call stack</div>
          {[...step.stack].reverse().map((f, ri) => {
            const i = step.stack.length - 1 - ri;
            return (
              <button key={i} className={`frame${i === fi ? ' active' : ''}`} onClick={() => s.selectFrame(i)}>
                <span>{f.name}</span>
                <span className="muted">:{f.line}</span>
              </button>
            );
          })}
        </div>
        <div className="debug-vars">
          <div className="debug-h debug-h-row">
            <span>{frame ? frame.name : 'Variables'}</span>
            <span className="debug-h-tools">
              {view === 'calls' && (
                <button className="icon-btn" onClick={() => setBigTree(true)} title="Open the call tree full size">
                  <Maximize2 size={13} />
                </button>
              )}
              <span className="mini-seg" role="tablist" aria-label="Variables view">
                {(['visual', 'calls', 'vars'] as const).map((v) => (
                  <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'active' : ''} onClick={() => s.updateSettings({ debugView: v })}>
                    {v === 'visual' ? 'Visual' : v === 'calls' ? 'Calls' : 'Variables'}
                  </button>
                ))}
              </span>
            </span>
          </div>
          {view === 'calls' && <CallTreeView trace={trace} stepIndex={stepIndex} />}
          {view !== 'calls' && frame && frame.vars.length === 0 && <div className="var-row muted" style={{ paddingLeft: 12 }}>No variables yet</div>}
          {frame && frame.vars.length > 0 && view === 'visual' && <Visualizer vars={frame.vars} prevVars={comparable ? prevFrame!.vars : null} />}
          {view === 'vars' &&
            frame?.vars.map(([k, v]) => (
              <VarRow key={k} name={k} val={v} path={`${frame.name}/${k}`} depth={0} changed={comparable && prevVars.get(k) !== JSON.stringify(v)} open={open} toggle={toggle} />
            ))}
        </div>
            </div>
      {bigTree && (
        <div className="ctree-overlay" role="dialog" aria-label="Call tree">
          <div className="ctree-overlay-head">
            <strong>Call tree</strong>
            <span className="muted small">Step with F10 / F11 / F9 while this is open. Click a call to jump to it.</span>
            <span className="spacer" />
            <button className="icon-btn" onClick={() => s.step('back')} disabled={stepIndex === 0} title="Step back (F9)"><Undo2 size={15} /></button>
            <button className="icon-btn" onClick={() => s.step('into')} disabled={last} title="Step into (F11)"><ArrowDownToLine size={15} /></button>
            <span className="step-count">{stepIndex + 1} / {steps.length}</span>
            <button className="icon-btn" onClick={() => setBigTree(false)} title="Close (Esc)"><X size={16} /></button>
          </div>
          <CallTreeView trace={trace} stepIndex={stepIndex} />
        </div>
      )}
    </div>
  );
}
