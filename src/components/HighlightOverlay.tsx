// Highlighter for presenting: sits over the code editor while switched on.
// Click a line to mark it yellow, drag down or up to mark several, and click
// or drag over marked lines to unmark them. Marks stay (and are saved with
// the file) until they are removed or cleared.
import type { OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';

type MonacoEditor = Parameters<OnMount>[0];
type Monaco = Parameters<OnMount>[1];

interface Props {
  editor: MonacoEditor;
  monaco: Monaco;
  lines: number[];
  onChange: (lines: number[]) => void;
  onExit: () => void;
}

export default function HighlightOverlay({ editor, monaco, lines, onChange, onExit }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [, redraw] = useState(0);
  // What the marks were when the drag began, the line it began on, and
  // whether it is marking or unmarking.
  const drag = useRef<{ base: number[]; from: number; add: boolean } | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', key);
    // Keep the hover bar on its line when the editor scrolls.
    const sub = editor.onDidScrollChange(() => redraw((n) => n + 1));
    return () => {
      window.removeEventListener('keydown', key);
      sub.dispose();
    };
  }, [editor, onExit]);

  /** Line under a mouse position, from the editor's own line positions (handles folded code). */
  const lineAt = (clientY: number) => {
    const model = editor.getModel();
    if (!model) return null;
    const y = clientY - box.current!.getBoundingClientRect().top + editor.getScrollTop();
    let lo = 1;
    let hi = model.getLineCount();
    if (y < editor.getTopForLineNumber(1)) return null;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (editor.getTopForLineNumber(mid) <= y) lo = mid;
      else hi = mid - 1;
    }
    // Past the end of the last line: no line.
    if (lo === model.getLineCount() && y >= editor.getTopForLineNumber(lo) + lineHeight()) return null;
    return lo;
  };
  const lineHeight = () => editor.getOption(monaco.editor.EditorOption.lineHeight);

  const apply = (to: number) => {
    const d = drag.current!;
    const [a, b] = d.from <= to ? [d.from, to] : [to, d.from];
    const range: number[] = [];
    for (let l = a; l <= b; l++) range.push(l);
    onChange(d.add ? [...d.base, ...range] : d.base.filter((l) => !range.includes(l)));
  };

  // The hover bar, positioned over the line under the mouse.
  let bar = null;
  if (hover !== null && !drag.current) {
    const top = editor.getTopForLineNumber(hover) - editor.getScrollTop();
    const layout = editor.getLayoutInfo();
    bar = <div className="hl-hover" style={{ top, height: lineHeight(), left: layout.contentLeft }} />;
  }

  return (
    <div
      ref={box}
      className="hl-overlay"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const line = lineAt(e.clientY);
        if (line === null) return;
        e.preventDefault();
        box.current!.setPointerCapture(e.pointerId);
        drag.current = { base: lines, from: line, add: !lines.includes(line) };
        apply(line);
      }}
      onPointerMove={(e) => {
        const line = lineAt(e.clientY);
        setHover(line);
        if (drag.current && line !== null) apply(line);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onPointerLeave={() => setHover(null)}
      onWheel={(e) => {
        editor.setScrollTop(editor.getScrollTop() + e.deltaY);
        editor.setScrollLeft(editor.getScrollLeft() + e.deltaX);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {bar}
    </div>
  );
}
