import { Excalidraw, getSceneVersion } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { Shapes } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { activeCanvas, useStore } from '../store';
import InsertStructure from './InsertStructure';
import TabStrip from './TabStrip';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function DrawPane() {
  const epoch = useStore((s) => s.wsEpoch);
  const wsId = useStore((s) => s.ws?.id);
  const canvases = useStore((s) => s.ws?.canvases ?? []);
  const canvasId = useStore((s) => (s.ws ? activeCanvas(s.ws).id : ''));
  const theme = useStore((s) => s.settings.theme);
  const last = useRef('');
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [inserting, setInserting] = useState(false);
  const s = useStore.getState();

  // Read the saved drawing once per canvas; later edits flow outwards only.
  const initialData = useMemo(() => {
    const ws = useStore.getState().ws;
    const scene = ws ? activeCanvas(ws).scene : null;
    last.current = '';
    return scene ? { elements: scene.elements as any, appState: { ...scene.appState }, files: scene.files as any } : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, wsId, canvasId]);

  return (
    <div className="drawpane">
      <TabStrip
        items={canvases.map((c) => ({ id: c.id, name: c.name, label: c.name }))}
        active={canvasId}
        addLabel="New canvas"
        onSelect={s.selectCanvas}
        onAdd={s.addCanvas}
        onRename={s.renameCanvas}
        onClose={(id) => {
          const c = canvases.find((x) => x.id === id);
          if (!c?.scene?.elements.length || confirm(`Delete "${c.name}"? Its drawing cannot be recovered.`)) s.deleteCanvas(id);
        }}
      />
      <div className="draw">
        <Excalidraw
          key={`${wsId}:${canvasId}:${epoch}`}
          excalidrawAPI={setApi}
          initialData={initialData}
          renderTopRightUI={() => (
            <button className={`insert-btn${inserting ? ' active' : ''}`} onClick={() => setInserting((v) => !v)} title="Insert an array, linked list, tree, graph…">
              <Shapes size={16} />
              <span>Insert</span>
            </button>
          )}
          theme={theme}
          UIOptions={{ canvasActions: { toggleTheme: false, loadScene: true, saveToActiveFile: false } }}
          onChange={(elements, appState, files) => {
            const sig = `${getSceneVersion(elements)}:${Object.keys(files).length}:${appState.scrollX | 0}:${appState.scrollY | 0}:${appState.zoom.value}:${appState.viewBackgroundColor}`;
            if (sig === last.current) return;
            const first = last.current === '';
            last.current = sig;
            if (first) return; // the initial render is not an edit
            useStore.getState().setScene(canvasId, {
              elements: elements.filter((e) => !e.isDeleted) as unknown[],
              appState: { viewBackgroundColor: appState.viewBackgroundColor, scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom },
              files: files as Record<string, unknown>,
            });
          }}
        />
        {inserting && <InsertStructure api={api} onClose={() => setInserting(false)} />}
      </div>
    </div>
  );
}
