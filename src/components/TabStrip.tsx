import { Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface TabItem {
  id: string;
  label: string;
  /** Editable part of the label (e.g. the file name without its extension). */
  name: string;
  suffix?: string;
}

interface Props {
  items: TabItem[];
  active: string;
  addLabel: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onClose: (id: string) => void;
}

/** Horizontal tabs with add, close and double-click-to-rename. */
export default function TabStrip({ items, active, addLabel, onSelect, onAdd, onRename, onClose }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Keep the active tab in view when tabs overflow.
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>('.ftab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, items.length]);

  const commit = () => {
    if (editing && draft.trim()) onRename(editing, draft);
    setEditing(null);
  };

  return (
    <div className="ftabs" role="tablist">
      <div className="ftabs-scroll" ref={stripRef}>
        {items.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === active}
            className={`ftab${t.id === active ? ' active' : ''}`}
            onClick={() => onSelect(t.id)}
            onDoubleClick={() => {
              setDraft(t.name);
              setEditing(t.id);
            }}
            onAuxClick={(e) => {
              if (e.button === 1 && items.length > 1) onClose(t.id);
            }}
            title={`${t.label} — double-click to rename`}
          >
            {editing === t.id ? (
              <span className="ftab-edit">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') setEditing(null);
                    e.stopPropagation();
                  }}
                  size={Math.max(4, draft.length)}
                  aria-label="Tab name"
                />
                {t.suffix && <span className="muted">{t.suffix}</span>}
              </span>
            ) : (
              <span className="ftab-label">{t.label}</span>
            )}
            {items.length > 1 && (
              <button
                className="ftab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
                aria-label={`Close ${t.label}`}
                title="Delete"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="icon-btn ftab-add" onClick={onAdd} title={addLabel} aria-label={addLabel}>
        <Plus size={15} />
      </button>
    </div>
  );
}
