import Editor, { type OnMount } from '@monaco-editor/react';
import { Bug, Eraser, Highlighter, Laser, Minus, Play, Plus, RotateCcw, Square, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LANG_BY_ID, LANGUAGES } from '../languages';
import '../monaco';
import { warmPython } from '../runners';
import { activeFile, currentCode, fileBreakpoints, fileHighlights, useStore, type BottomTab } from '../store';
import type { LangId } from '../types';
import DebugPanel from './DebugPanel';
import HighlightOverlay from './HighlightOverlay';
import LaserOverlay from './LaserOverlay';
import TabStrip from './TabStrip';

type MonacoEditor = Parameters<OnMount>[0];
type Monaco = Parameters<OnMount>[1];

function Console() {
  const output = useStore((s) => s.output);
  const trace = useStore((s) => s.trace);
  const stepIndex = useStore((s) => s.stepIndex);
  const running = useStore((s) => s.running);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [output, stepIndex, trace]);

  if (trace) {
    const step = trace.steps[stepIndex];
    const atEnd = stepIndex === trace.steps.length - 1;
    return (
      <pre className="console" ref={ref}>
        <span className="c-info">Output up to step {stepIndex + 1}{'\n'}</span>
        <span>{atEnd ? trace.stdout : trace.stdout.slice(0, step.out)}</span>
        {atEnd && trace.stderr && <span className="c-stderr">{trace.stderr}</span>}
      </pre>
    );
  }
  return (
    <pre className="console" ref={ref}>
      {output.length === 0 && <span className="c-info">{running ? 'Running…' : 'Run your code to see output here. Ctrl/⌘ + Enter runs, Ctrl/⌘ + Shift + Enter debugs.'}</span>}
      {output.map((c, i) => (
        <span key={i} className={`c-${c.s}`}>{c.t}</span>
      ))}
    </pre>
  );
}

export default function CodePane() {
  const ws = useStore((s) => s.ws)!;
  const epoch = useStore((s) => s.wsEpoch);
  const settings = useStore((s) => s.settings);
  const running = useStore((s) => s.running);
  const trace = useStore((s) => s.trace);
  const stepIndex = useStore((s) => s.stepIndex);
  const frameIndex = useStore((s) => s.frameIndex);
  const bottomTab = useStore((s) => s.bottomTab);
  const server = useStore((s) => s.server);
  const breakpoints = useStore((s) => fileBreakpoints(activeFile(s.ws!)));
  const highlights = useStore((s) => fileHighlights(activeFile(s.ws!)));
  const presenting = useStore((s) => s.presenting);
  const file = activeFile(ws);
  const lang = LANG_BY_ID[file.language];
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  type Decorations = ReturnType<MonacoEditor['createDecorationsCollection']>;
  const bpDecorations = useRef<Decorations | null>(null);
  const debugDecorations = useRef<Decorations | null>(null);
  const hlDecorations = useRef<Decorations | null>(null);
  /** The model the breakpoint decorations were drawn on (cleared by Monaco on model switch). */
  const paintedModel = useRef<unknown>(null);
  const code = currentCode(ws);
  // Presenting tools over the editor: the laser pointer or the highlighter.
  const [pen, setPen] = useState<null | 'laser' | 'highlight'>(null);
  const exitPen = useCallback(() => setPen(null), []);
  const togglePen = (p: 'laser' | 'highlight') => setPen((cur) => (cur === p ? null : p));

  // Alt/Option + L toggles the laser and Alt/Option + H the highlighter, from
  // anywhere in the app. Listening in the capture phase stops Monaco from also
  // typing the key (¬ or ˙ on a Mac).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const p = e.code === 'KeyL' ? 'laser' : e.code === 'KeyH' ? 'highlight' : null;
      if (!p) return;
      e.preventDefault();
      e.stopPropagation();
      setPen((cur) => (cur === p ? null : p));
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);

  useEffect(() => {
    if (file.language === 'python') warmPython();
  }, [file.language]);

  const paint = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    bpDecorations.current?.set(
      (breakpoints || []).map((line) => ({ range: new monaco.Range(line, 1, line, 1), options: { glyphMarginClassName: 'bp-glyph', stickiness: 1 } })),
    );
    hlDecorations.current?.set(
      (highlights || []).map((line) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: 'hl-line', stickiness: 1, overviewRuler: { color: '#facc15', position: monaco.editor.OverviewRulerLane.Center } },
      })),
    );
    paintedModel.current = editor.getModel();
    const list = [];
    if (trace) {
      const step = trace.steps[stepIndex];
      const frame = frameIndex !== null ? step.stack[frameIndex] : undefined;
      const line = frame ? frame.line : step.line;
      if (line > 0) {
        const cls = step.ev === 'exception' ? 'debug-line debug-line-error' : frame && frameIndex !== step.stack.length - 1 ? 'debug-line debug-line-caller' : 'debug-line';
        list.push({ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, className: cls, glyphMarginClassName: 'debug-glyph' } });
        editor.revealLineInCenterIfOutsideViewport(line);
      }
    }
    debugDecorations.current?.set(list);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(paint, [breakpoints, highlights, trace, stepIndex, frameIndex, file.language, file.id, epoch]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    bpDecorations.current = editor.createDecorationsCollection([]);
    debugDecorations.current = editor.createDecorationsCollection([]);
    hlDecorations.current = editor.createDecorationsCollection([]);
    // Breakpoints and highlights follow their line when lines are inserted or removed above them.
    editor.onDidChangeModelContent(() => {
      if (!bpDecorations.current || editor.getModel() !== paintedModel.current) return;
      useStore.getState().setBreakpoints(bpDecorations.current.getRanges().map((r) => r.startLineNumber));
      if (hlDecorations.current) useStore.getState().setHighlights(hlDecorations.current.getRanges().map((r) => r.startLineNumber));
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => useStore.getState().runCode());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => useStore.getState().startDebug());
    editor.onMouseDown((e) => {
      const t = e.target.type;
      if ((t === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || t === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) && e.target.position) {
        useStore.getState().toggleBreakpoint(e.target.position.lineNumber);
      }
    });
    paint();
  };

  const options = useMemo(
    () => ({
      fontSize: settings.fontSize + (presenting ? 4 : 0),
      minimap: { enabled: false },
      glyphMargin: true,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      tabSize: ['python', 'java', 'cpp', 'c', 'rust', 'csharp', 'kotlin', 'swift', 'php'].includes(file.language) ? 4 : 2,
      padding: { top: 10 },
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      renderLineHighlight: 'line' as const,
      smoothScrolling: true,
      fixedOverflowWidgets: true,
    }),
    [settings.fontSize, file.language, presenting],
  );

  const s = useStore.getState();
  const needsServer = lang.runs === 'server';
  const serverLang = server?.languages[lang.id];
  const runBlocked = needsServer && server !== null && serverLang && !serverLang.run;
  const debugTitle = !lang.debug
    ? `Step debugging is not available for ${lang.label}`
    : 'Debug: record the run, then step through it (Ctrl/⌘ + Shift + Enter)';

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = settings.bottomHeight;
    const move = (ev: PointerEvent) => s.updateSettings({ bottomHeight: Math.min(window.innerHeight - 220, Math.max(90, startH + startY - ev.clientY)) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const tabs: { id: BottomTab; label: string }[] = [
    { id: 'console', label: 'Console' },
    { id: 'input', label: `Input${ws.stdin ? ' •' : ''}` },
    { id: 'debug', label: 'Debugger' },
    { id: 'notes', label: `Notes${file.notes ? ' •' : ''}` },
  ];

  return (
    <div className="code">
      <div className="toolbar">
        <select className="select" value={file.language} onChange={(e) => s.setLanguage(e.target.value as LangId)} aria-label="Language">
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        {running ? (
          <button className="btn btn-stop" onClick={s.stop}>
            <Square size={13} /> Stop
          </button>
        ) : (
          <>
            <button className="btn btn-run" onClick={s.runCode} title="Run (Ctrl/⌘ + Enter)">
              <Play size={14} /> Run
            </button>
            <button className="btn btn-debug" onClick={s.startDebug} disabled={!lang.debug} title={debugTitle}>
              <Bug size={14} /> Debug
            </button>
          </>
        )}
        {needsServer && server === null && <span className="hint warn" title='Start the server with "npm run server"'>server offline</span>}
        {runBlocked && <span className="hint warn">{lang.label} is not installed on the server</span>}
        <span className="spacer" />
        <button
          className={`icon-btn${pen === 'laser' ? ' laser-on' : ''}`}
          onClick={() => togglePen('laser')}
          title={pen === 'laser' ? 'Laser pointer on: drag to point at code. Esc or Alt/Option + L to stop' : 'Laser pointer for presenting (Alt/Option + L)'}
          aria-pressed={pen === 'laser'}
        >
          <Laser size={15} />
        </button>
        <button
          className={`icon-btn${pen === 'highlight' ? ' hl-on' : ''}`}
          onClick={() => togglePen('highlight')}
          title={pen === 'highlight' ? 'Highlighter on: click or drag over lines to mark them, again to unmark. Esc or Alt/Option + H to stop' : 'Highlight lines (Alt/Option + H)'}
          aria-pressed={pen === 'highlight'}
        >
          <Highlighter size={15} />
        </button>
        {highlights && highlights.length > 0 && (
          <button className="hl-clear" onClick={() => s.setHighlights([])} title="Remove all highlights in this file">
            <X size={12} /> {highlights.length} highlighted
          </button>
        )}
        <button
          className="icon-btn"
          title="Reset to the starter template"
          onClick={() => {
            if (code === lang.template || confirm(`Replace your ${lang.label} code with the starter template?`)) {
              s.setBreakpoints([]);
              s.setHighlights([]);
              s.setCode(lang.template);
            }
          }}
        >
          <RotateCcw size={15} />
        </button>
        <button className="icon-btn" onClick={() => s.updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) })} title="Smaller text">
          <Minus size={15} />
        </button>
        <span className="hint">{settings.fontSize}px</span>
        <button className="icon-btn" onClick={() => s.updateSettings({ fontSize: Math.min(28, settings.fontSize + 1) })} title="Larger text">
          <Plus size={15} />
        </button>
      </div>

      <TabStrip
        items={ws.files.map((f) => ({ id: f.id, name: f.name, label: `${f.name}.${LANG_BY_ID[f.language].ext}`, suffix: `.${LANG_BY_ID[f.language].ext}` }))}
        active={file.id}
        addLabel="New file"
        onSelect={s.selectFile}
        onAdd={s.addFile}
        onRename={s.renameFile}
        onClose={(id) => {
          const f = ws.files.find((x) => x.id === id);
          const hasCode = f && Object.entries(f.code).some(([l, c]) => c && c.trim() && c !== LANG_BY_ID[l as LangId].template);
          if ((!hasCode && !f?.notes.trim()) || confirm(`Delete ${f!.name}? Its code and notes cannot be recovered.`)) s.deleteFile(id);
        }}
      />

      <div className="editor">
        <Editor
          key={epoch}
          path={`${ws.id}/${file.id}.${lang.ext}`}
          language={lang.monaco}
          value={code}
          theme={settings.theme === 'dark' ? 'algodesk-dark' : 'algodesk-light'}
          onChange={(v) => s.setCode(v ?? '')}
          onMount={onMount}
          options={options}
          loading={<div className="pane-loading">Loading editor…</div>}
        />
        {pen === 'highlight' && editorRef.current && monacoRef.current && (
          <HighlightOverlay editor={editorRef.current} monaco={monacoRef.current} lines={highlights || []} onChange={s.setHighlights} onExit={exitPen} />
        )}
        {pen === 'laser' && (
          <LaserOverlay
            onExit={exitPen}
            onWheel={(dx, dy) => {
              const ed = editorRef.current;
              if (!ed) return;
              ed.setScrollTop(ed.getScrollTop() + dy);
              ed.setScrollLeft(ed.getScrollLeft() + dx);
            }}
          />
        )}
      </div>

      <div className="bottom" style={{ height: settings.bottomHeight }}>
        <div className="resize-h" onPointerDown={startResize} title="Drag to resize" />
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t.id} className={bottomTab === t.id ? 'active' : ''} onClick={() => s.setBottomTab(t.id)}>
              {t.label}
            </button>
          ))}
          <span className="spacer" />
          {bottomTab === 'console' && !trace && (
            <button className="icon-btn" onClick={s.clearOutput} title="Clear console">
              <Eraser size={14} />
            </button>
          )}
        </div>
        <div className="bottom-body">
          {bottomTab === 'console' && <Console />}
          {bottomTab === 'input' && (
            <textarea
              className="textarea mono"
              value={ws.stdin}
              onChange={(e) => s.setStdin(e.target.value)}
              placeholder={'Standard input for your program.\nRead it with input() in Python, Scanner in Java, cin in C++, readline() in JavaScript.'}
              spellCheck={false}
            />
          )}
          {bottomTab === 'debug' && <DebugPanel />}
          {bottomTab === 'notes' && (
            <textarea
              className="textarea"
              value={file.notes}
              onChange={(e) => s.setNotes(e.target.value)}
              placeholder={`Notes for ${file.name}.${lang.ext}: approach, complexity, mistakes to remember. Each file has its own notes (Markdown is fine).`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
