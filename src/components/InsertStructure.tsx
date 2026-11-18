// "Insert" panel for the whiteboard: builds an array, linked list, tree,
// graph, ... from typed values and drops it, grouped and selected, in the
// middle of the current view. Everything inserted is ordinary Excalidraw
// shapes, so it can be moved, recoloured or edited afterwards.
import { CaptureUpdateAction, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TEMPLATES, type TemplateId } from '../drawTemplates';

/* eslint-disable @typescript-eslint/no-explicit-any */
const uid = () => Math.random().toString(36).slice(2, 12);

export default function InsertStructure({ api, onClose }: { api: ExcalidrawImperativeAPI | null; onClose: () => void }) {
  const [kind, setKind] = useState<TemplateId>('array');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tpl = TEMPLATES.find((t) => t.id === kind)!;
  const value = inputs[kind] ?? tpl.example;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [kind]);

  const insert = () => {
    if (!api) return;
    const skeleton = tpl.build(value, uid);
    if (!skeleton.length) {
      setError(`Nothing to draw. Try: ${tpl.example}`);
      return;
    }
    const els = convertToExcalidrawElements(skeleton as any, { regenerateIds: false });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of els) {
      minX = Math.min(minX, e.x);
      minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x + e.width);
      maxY = Math.max(maxY, e.y + e.height);
    }
    // Centre the structure in the visible part of the canvas.
    const st = api.getAppState();
    const zoom = st.zoom.value;
    const dx = st.width / 2 / zoom - st.scrollX - (minX + maxX) / 2;
    const dy = st.height / 2 / zoom - st.scrollY - (minY + maxY) / 2;
    const group = uid();
    const placed = els.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy, groupIds: [group] }));
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...placed],
      appState: { selectedElementIds: Object.fromEntries(placed.map((e) => [e.id, true])), selectedGroupIds: { [group]: true } } as any,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setError('');
    onClose();
  };

  return (
    <div className="insert-pop" role="dialog" aria-label="Insert a data structure">
      <div className="insert-head">
        <strong>Insert</strong>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>
      <div className="insert-kinds">
        {TEMPLATES.map((t) => (
          <button key={t.id} className={t.id === kind ? 'active' : ''} onClick={() => { setKind(t.id); setError(''); }}>
            {t.label}
          </button>
        ))}
      </div>
      <label className="field" style={{ marginBottom: 6 }}>
        <span>{tpl.hint}</span>
        <input
          ref={inputRef}
          className="input mono"
          value={value}
          onChange={(e) => setInputs({ ...inputs, [kind]: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') insert();
            if (e.key === 'Escape') onClose();
          }}
          spellCheck={false}
        />
      </label>
      {error && <div className="msg err" style={{ marginTop: 0, marginBottom: 8 }}>{error}</div>}
      <div className="insert-foot">
        <span className="muted small">Inserted as a group: double-click to edit a value.</span>
        <button className="btn btn-run" onClick={insert}>Insert</button>
      </div>
    </div>
  );
}
