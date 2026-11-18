import { Minimize2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import CodePane from './components/CodePane';
import { GitHubDialog, SettingsDialog } from './components/Dialogs';
import Roadmap from './components/Roadmap';
import TopBar from './components/TopBar';
import { useStore } from './store';

const DrawPane = lazy(() => import('./components/DrawPane'));

export type DialogName = null | 'github' | 'settings';

export default function App() {
  const ready = useStore((s) => s.ready);
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.settings.theme);
  const split = useStore((s) => s.settings.split);
  const presenting = useStore((s) => s.presenting);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [dragSplit, setDragSplit] = useState<number | null>(null);
  const workRef = useRef<HTMLDivElement>(null);
  // The whiteboard is heavy; mount it the first time it is shown.
  const [drawSeen, setDrawSeen] = useState(false);

  useEffect(() => {
    void useStore.getState().init();
    const flush = () => void useStore.getState().flush();
    const onVis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (view === 'split' || view === 'draw') setDrawSeen(true);
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      // Alt/Option + P: presentation mode. e.code, because Option + P types π on a Mac.
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyP') {
        e.preventDefault();
        e.stopPropagation();
        s.setPresenting(!s.presenting);
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        s.setView((['split', 'code', 'draw', 'roadmap'] as const)[Number(e.key) - 1]);
        return;
      }
      if (!s.trace) return;
      const map: Record<string, Parameters<typeof s.step>[0]> = { F10: 'over', F11: 'into', F8: 'continue', F9: 'back' };
      let kind = map[e.key];
      if (e.key === 'F11' && e.shiftKey) kind = 'out';
      if (e.key === 'F8' && e.shiftKey) kind = 'rcontinue';
      if (kind) {
        e.preventDefault();
        s.step(kind);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = workRef.current!.getBoundingClientRect();
    let latest = split;
    const move = (ev: PointerEvent) => {
      latest = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width));
      setDragSplit(latest);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragSplit(null);
      useStore.getState().updateSettings({ split: latest });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (!ready) return <div className="boot">Loading your workspace…</div>;

  const ratio = dragSplit ?? split;
  const showCode = view === 'split' || view === 'code';
  const showDraw = view === 'split' || view === 'draw';

  return (
    <div className={`app${presenting ? ' presenting' : ''}`}>
      <TopBar openDialog={setDialog} />
      {view === 'roadmap' && <Roadmap />}
      <div className={`work${dragSplit !== null ? ' dragging' : ''}`} ref={workRef} hidden={view === 'roadmap'}>
        <section className="pane" style={{ flex: view === 'split' ? `0 0 calc(${ratio * 100}% - 3px)` : '1 1 auto' }} hidden={!showCode}>
          <CodePane />
        </section>
        {view === 'split' && <div className="divider" onPointerDown={startDrag} role="separator" aria-orientation="vertical" title="Drag to resize" />}
        <section className="pane" style={{ flex: '1 1 0' }} hidden={!showDraw}>
          {drawSeen && (
            <Suspense fallback={<div className="pane-loading">Loading whiteboard…</div>}>
              <DrawPane />
            </Suspense>
          )}
        </section>
      </div>
      {presenting && (
        <button className="present-exit" onClick={() => useStore.getState().setPresenting(false)} title="Leave presentation mode (Alt/Option + P)">
          <Minimize2 size={13} /> Exit presentation
        </button>
      )}
      {dialog === 'github' && <GitHubDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
