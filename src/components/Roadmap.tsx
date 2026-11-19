import { Check, ChevronDown, ChevronRight, ExternalLink, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { slugify } from '../data/problems';
import { SCRATCH_ID, useStore } from '../store';
import type { Difficulty, Problem, Status } from '../types';
import { Modal } from './Dialogs';

const titleFromUrl = (url: string) => {
  const m = /leetcode\.com\/problems\/([a-z0-9-]+)/i.exec(url);
  return m ? m[1].split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ') : '';
};

function ProblemDialog({ problem, topics, onClose }: { problem: Problem | null; topics: string[]; onClose: () => void }) {
  const [title, setTitle] = useState(problem?.title ?? '');
  const [url, setUrl] = useState(problem?.url ?? '');
  const [number, setNumber] = useState(problem?.number ? String(problem.number) : '');
  const [difficulty, setDifficulty] = useState<Difficulty>(problem?.difficulty ?? 'Medium');
  const [topic, setTopic] = useState(problem?.topic ?? topics[0] ?? 'My problems');
  const s = useStore.getState();
  const valid = title.trim() && topic.trim();

  const save = (open: boolean) => {
    if (!valid) return;
    const data = {
      title: title.trim(),
      url: url.trim() || (number ? `https://leetcode.com/problems/${slugify(title)}/` : undefined),
      number: number ? Number(number) : undefined,
      difficulty,
      topic: topic.trim(),
    };
    let id = problem?.id;
    if (id) s.updateProblem(id, data);
    else id = s.addProblem(data);
    onClose();
    if (open) void s.openWorkspace(id);
  };

  return (
    <Modal title={problem ? 'Edit question' : 'Add a question'} onClose={onClose}>
      <label className="field">
        <span>LeetCode link (optional)</span>
        <input
          className="input"
          value={url}
          placeholder="https://leetcode.com/problems/two-sum/"
          autoFocus={!problem}
          onChange={(e) => {
            setUrl(e.target.value);
            const guess = titleFromUrl(e.target.value);
            if (guess && !title.trim()) setTitle(guess);
          }}
        />
      </label>
      <div className="field-row">
        <label className="field" style={{ flex: '0 0 96px' }}>
          <span>Number</span>
          <input className="input" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="1" />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span>Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Two Sum" onKeyDown={(e) => e.key === 'Enter' && save(false)} />
        </label>
      </div>
      <div className="field-row">
        <label className="field" style={{ flex: 1 }}>
          <span>Topic</span>
          <input className="input" list="topic-list" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Pick one or type a new topic" />
          <datalist id="topic-list">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className="field" style={{ flex: '0 0 140px' }}>
          <span>Difficulty</span>
          <select className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
        </label>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        {!problem && <button className="btn" disabled={!valid} onClick={() => save(true)}>Add and open</button>}
        <button className="btn btn-run" disabled={!valid} onClick={() => save(false)}>{problem ? 'Save' : 'Add'}</button>
      </div>
    </Modal>
  );
}

const NEXT: Record<Status, Status> = { todo: 'solved', attempted: 'solved', solved: 'todo' };

// Which topics are collapsed and how far the list is scrolled, kept in this
// browser so the roadmap looks the same after a reload or coming back to it.
const CLOSED_KEY = 'scratchpad.roadmap.closed';
const SCROLL_KEY = 'scratchpad.roadmap.scroll';
const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: just don't remember */
  }
};

export default function Roadmap() {
  const problems = useStore((s) => s.problems);
  const activeId = useStore((s) => s.activeId);
  const [q, setQ] = useState('');
  const [diff, setDiff] = useState('');
  const [status, setStatus] = useState('');
  const [closed, setClosed] = useState<Set<string>>(() => new Set(load<string[]>(CLOSED_KEY, [])));
  const scroller = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const [dialog, setDialog] = useState<{ problem: Problem | null } | null>(null);
  const s = useStore.getState();

  const topics = useMemo(() => [...new Set(problems.map((p) => p.topic))], [problems]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return problems.filter(
      (p) =>
        (!diff || p.difficulty === diff) &&
        (!status || p.status === status) &&
        (!needle || p.title.toLowerCase().includes(needle) || String(p.number ?? '').includes(needle) || p.topic.toLowerCase().includes(needle)),
    );
  }, [problems, q, diff, status]);
  const solved = problems.filter((p) => p.status === 'solved').length;
  const pct = problems.length ? Math.round((solved / problems.length) * 100) : 0;
  const count = (d: Difficulty) => `${problems.filter((p) => p.difficulty === d && p.status === 'solved').length}/${problems.filter((p) => p.difficulty === d).length}`;
  const filtering = Boolean(q || diff || status);

  useEffect(() => save(CLOSED_KEY, [...closed]), [closed]);

  // Put the scroll back once the list has rendered (problems load after a reload).
  useLayoutEffect(() => {
    if (restored.current || !problems.length || !scroller.current) return;
    restored.current = true;
    scroller.current.scrollTop = load<number>(SCROLL_KEY, 0);
  }, [problems.length]);

  return (
    <div
      className="roadmap"
      ref={scroller}
      onScroll={(e) => {
        if (restored.current) save(SCROLL_KEY, Math.round(e.currentTarget.scrollTop));
      }}
    >
      <div className="roadmap-inner">
        <div className="rm-head">
          <div>
            <h1>Roadmap</h1>
            <p className="muted">Pick a question to open its code, drawing and notes. Everything is saved in this browser.</p>
          </div>
          <div className="rm-head-actions">
            <button className="btn" onClick={() => void s.openWorkspace(SCRATCH_ID)}>Free practice</button>
            <button className="btn btn-run" onClick={() => setDialog({ problem: null })}>
              <Plus size={15} /> Add question
            </button>
          </div>
        </div>

        <div className="rm-progress">
          <div className="rm-stat">
            <strong>{solved}</strong>
            <span className="muted">/ {problems.length} solved</span>
          </div>
          <div className="bar"><div style={{ width: `${pct}%` }} /></div>
          <div className="rm-split">
            <span className="diff diff-easy">Easy {count('Easy')}</span>
            <span className="diff diff-medium">Medium {count('Medium')}</span>
            <span className="diff diff-hard">Hard {count('Hard')}</span>
          </div>
        </div>

        <div className="rm-filters">
          <div className="search">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, number or topic" />
          </div>
          <select className="select" value={diff} onChange={(e) => setDiff(e.target.value)} aria-label="Difficulty">
            <option value="">All difficulties</option>
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            <option value="todo">Not started</option>
            <option value="attempted">In progress</option>
            <option value="solved">Solved</option>
          </select>
          <button
            className="btn"
            title="Mark every question as not started (your code and drawings are kept)"
            onClick={() => confirm('Mark every question as not started? Your code, drawings and notes are kept.') && s.resetProgress()}
          >
            <RotateCcw size={14} /> Reset progress
          </button>
        </div>

        {filtered.length === 0 && <div className="rm-empty">No questions match these filters.</div>}

        {topics.map((topic) => {
          const all = problems.filter((p) => p.topic === topic);
          const list = filtered.filter((p) => p.topic === topic);
          if (!list.length) return null;
          const done = all.filter((p) => p.status === 'solved').length;
          const isOpen = filtering || !closed.has(topic);
          return (
            <section className="topic" key={topic}>
              <button
                className="topic-head"
                onClick={() => setClosed((c) => {
                  const n = new Set(c);
                  if (n.has(topic)) n.delete(topic);
                  else n.add(topic);
                  return n;
                })}
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="topic-name">{topic}</span>
                <span className="muted">{done} / {all.length}</span>
                <span className="bar small"><span style={{ width: `${(done / all.length) * 100}%` }} /></span>
              </button>
              {isOpen &&
                list.map((p) => (
                  <div className={`prow${p.id === activeId ? ' current' : ''}${p.added ? ' added' : ''}`} key={p.id}>
                    <button
                      className={`check ${p.status}`}
                      onClick={() => s.setStatus(p.id, NEXT[p.status])}
                      title={p.status === 'solved' ? 'Solved. Click to undo' : p.status === 'attempted' ? 'In progress. Click to mark solved' : 'Mark solved'}
                      aria-label={`Mark ${p.title} ${p.status === 'solved' ? 'not solved' : 'solved'}`}
                    >
                      {p.status === 'solved' && <Check size={13} strokeWidth={3} />}
                    </button>
                    <button className="ptitle" onClick={() => void s.openWorkspace(p.id)}>
                      {p.number ? <span className="pnum">{p.number}.</span> : null} {p.title}
                    </button>
                    {p.added && <span className="added-tag" title="Not in your original list: added to fill a gap in the plan">added</span>}
                    {p.status === 'attempted' && <span className="tag">in progress</span>}
                    <span className={`diff diff-${p.difficulty.toLowerCase()}`}>{p.difficulty}</span>
                    <span className="prow-actions">
                      {p.url && (
                        <a className="icon-btn" href={p.url} target="_blank" rel="noreferrer" title="Open on LeetCode">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button className="icon-btn" onClick={() => setDialog({ problem: p })} title="Edit"><Pencil size={14} /></button>
                      <button
                        className="icon-btn"
                        title="Delete"
                        onClick={() => confirm(`Delete "${p.title}" and its saved code, drawing and notes?`) && void s.deleteProblem(p.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                ))}
            </section>
          );
        })}
      </div>
      {dialog && <ProblemDialog problem={dialog.problem} topics={topics} onClose={() => setDialog(null)} />}
    </div>
  );
}
