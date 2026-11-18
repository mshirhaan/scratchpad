import { Check, Columns2, Code2, Download, ExternalLink, Map as MapIcon, Moon, Pause, PenLine, Play, Presentation, RotateCcw, Settings as Cog, Sun, Upload } from 'lucide-react';
import GithubIcon from './GithubIcon';
import { useEffect, useRef, useState } from 'react';
import type { DialogName } from '../App';
import { isBackup } from '../storage';
import { useStore, type View } from '../store';

const VIEWS: { id: View; label: string; icon: typeof Code2 }[] = [
  { id: 'split', label: 'Split', icon: Columns2 },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'draw', label: 'Draw', icon: PenLine },
  { id: 'roadmap', label: 'Roadmap', icon: MapIcon },
];

function Timer() {
  const [ms, setMs] = useState(0);
  const [on, setOn] = useState(false);
  const base = useRef(0);
  useEffect(() => {
    if (!on) return;
    base.current = Date.now() - ms;
    const t = setInterval(() => setMs(Date.now() - base.current), 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  const total = Math.floor(ms / 1000);
  const text = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return (
    <div className="timer" title="Stopwatch for timing a solve">
      <button className="icon-btn" onClick={() => setOn(!on)} aria-label={on ? 'Pause timer' : 'Start timer'}>
        {on ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <span className={on ? 'timer-on' : ''}>{text}</span>
      <button className="icon-btn" onClick={() => { setOn(false); setMs(0); }} aria-label="Reset timer">
        <RotateCcw size={13} />
      </button>
    </div>
  );
}

export default function TopBar({ openDialog }: { openDialog: (d: DialogName) => void }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const problem = useStore((s) => s.problems.find((p) => p.id === s.activeId));
  const saveState = useStore((s) => s.saveState);
  const theme = useStore((s) => s.settings.theme);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState('');

  const doExport = async () => {
    const backup = await useStore.getState().exportBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `scratchpad-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!isBackup(data)) throw new Error('not a backup');
      if (!confirm(`Replace everything in this browser with the backup from ${data.exportedAt.slice(0, 10)} (${data.problems.length} problems)?`)) return;
      await useStore.getState().importBackup(data);
      setNotice('Backup restored');
    } catch {
      setNotice('That file is not a Scratchpad backup');
    }
    setTimeout(() => setNotice(''), 3000);
  };

  return (
    <header className="topbar">
      <div className="brand" onClick={() => setView('split')}>
        <span className="brand-mark">S</span>
        <span>Scratchpad</span>
      </div>

      <nav className="seg" aria-label="View">
        {VIEWS.map((v, i) => (
          <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)} title={`${v.label} (Alt+${i + 1})`}>
            <v.icon size={15} />
            <span>{v.label}</span>
          </button>
        ))}
      </nav>

      <div className="current">
        {problem && (
          <>
            <span className={`diff diff-${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span>
            <span className="current-title" title={problem.title}>
              {problem.number ? `${problem.number}. ` : ''}
              {problem.title}
            </span>
            {problem.url && (
              <a className="icon-btn" href={problem.url} target="_blank" rel="noreferrer" title="Open on LeetCode">
                <ExternalLink size={14} />
              </a>
            )}
            <button
              className={`solve-btn${problem.status === 'solved' ? ' solved' : ''}`}
              onClick={() => useStore.getState().setStatus(problem.id, problem.status === 'solved' ? 'attempted' : 'solved')}
            >
              <Check size={14} />
              {problem.status === 'solved' ? 'Solved' : 'Mark solved'}
            </button>
          </>
        )}
      </div>

      <div className="top-actions">
        {notice ? <span className="save-state">{notice}</span> : <span className="save-state">{saveState === 'saving' ? 'Saving…' : 'Saved locally'}</span>}
        <Timer />
        <button className="icon-btn" onClick={() => useStore.getState().setPresenting(true)} title="Presentation mode: hide the menus and enlarge the code (Alt/Option + P)">
          <Presentation size={16} />
        </button>
        <button className="btn" onClick={() => openDialog('github')} title="Sync with GitHub">
          <GithubIcon size={15} />
          <span>GitHub</span>
        </button>
        <button className="icon-btn" onClick={doExport} title="Download a backup file">
          <Download size={16} />
        </button>
        <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Restore from a backup file">
          <Upload size={16} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doImport(f);
            e.target.value = '';
          }}
        />
        <button className="icon-btn" onClick={() => useStore.getState().updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })} title="Switch theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="icon-btn" onClick={() => openDialog('settings')} title="Settings">
          <Cog size={16} />
        </button>
      </div>
    </header>
  );
}

