import { Pencil, Plus, Trash2, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface TabItem {
  id: string;
  label: string;
  /** Editable part of the label (e.g. the file name without its extension). */
  name: string;
  suffix?: string;
}

export interface MenuItem {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

interface Props {
  items: TabItem[];
  active: string;
  addLabel: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onClose: (id: string) => void;
  /** Extra right-click menu entries for a tab, shown above Rename and Delete. */
  menuItems?: (id: string) => MenuItem[];
}

/** Right-click menu at the mouse; closes on a click elsewhere, Escape, scroll or resize. */
function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    // Keep the menu on screen near the right and bottom edges.
    const r = ref.current!.getBoundingClientRect();
    setPos({ left: Math.min(x, window.innerWidth - r.width - 4), top: Math.min(y, window.innerHeight - r.height - 4) });
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', down, true);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', down, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [x, y, onClose]);
  return (
    <div className="ctx-menu" ref={ref} style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map(({ label, icon: Icon, onClick }) => (
        <button
          key={label}
          className="ctx-item"
          role="menuitem"
          onClick={() => {
            onClose();
            onClick();
          }}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}

/** Horizontal tabs with add, close and double-click-to-rename. */
export default function TabStrip({ items, active, addLabel, onSelect, onAdd, onRename, onClose, menuItems }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
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
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: t.id, x: e.clientX, y: e.clientY });
            }}
            onAuxClick={(e) => {
              if (e.button === 1 && items.length > 1) onClose(t.id);
            }}
            title={`${t.label}: double-click to rename, right-click for more`}
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
      {menu && (() => {
        const t = items.find((x) => x.id === menu.id);
        if (!t) return null;
        const entries: MenuItem[] = [
          ...(menuItems?.(t.id) ?? []),
          {
            label: 'Rename',
            icon: Pencil,
            onClick: () => {
              setDraft(t.name);
              setEditing(t.id);
            },
          },
          ...(items.length > 1 ? [{ label: 'Delete', icon: Trash2, onClick: () => onClose(t.id) }] : []),
        ];
        return <ContextMenu x={menu.x} y={menu.y} items={entries} onClose={closeMenu} />;
      })()}
    </div>
  );
}
