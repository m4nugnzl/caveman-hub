import { useRef, useState } from 'react';
import { Copy, Dumbbell, Edit2, MoreVertical, Save, Trash2, X } from 'lucide-react';

import { countSets, weekdayForDay } from '@/domain/training';
import { useClickOutside } from '@/lib/useClickOutside';
import { useConfirm } from '@/components/ui/ConfirmProvider';

export const DayHeader = ({ day, weeklySplit, onRename, onDuplicate, onRemove, canRemove }) => {
  const confirm = useConfirm();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(day.dayName);
  const menuRef = useRef(null);

  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const weekday = weekdayForDay(weeklySplit, day.dayName);
  const exerciseCount = day.exercises?.length || 0;
  const setCount = countSets(day);

  const startEditing = () => {
    setDraft(day.dayName);
    setEditing(true);
    setMenuOpen(false);
  };

  const commit = () => {
    const name = draft.trim();
    if (name && name !== day.dayName) onRename(name);
    setEditing(false);
  };

  const askRemove = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: `¿Eliminar «${day.dayName}»?`,
      message: `Se borrarán sus ${exerciseCount} ejercicios y ${setCount} series.`,
      confirmLabel: 'Eliminar día',
      tone: 'danger',
    });
    if (ok) onRemove();
  };

  return (
    <header className="day-header">
      <div className="row gap-4" style={{ position: 'relative', zIndex: 1 }}>
        <span
          style={{
            background: 'rgba(34,211,238,0.15)',
            padding: 13,
            borderRadius: 16,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Dumbbell size={26} color="var(--accent-cyan)" />
        </span>

        <div className="col gap-1">
          <div className="row gap-2 wrap">
            <span className="uppercase-label" style={{ color: 'var(--accent-cyan)' }}>
              Día de entrenamiento
            </span>
            {weekday && <span className="badge badge-neutral">{weekday}</span>}
          </div>

          {editing ? (
            <div className="row gap-2">
              <input
                autoFocus
                className="input"
                style={{ fontSize: '1.2rem', fontWeight: 900, minWidth: 200 }}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setEditing(false);
                }}
                onBlur={commit}
                aria-label="Nombre del día"
              />
              <button type="button" className="btn btn-icon" onClick={commit} aria-label="Guardar nombre">
                <Save size={16} />
              </button>
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => setEditing(false)}
                aria-label="Cancelar"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <h2 style={{ fontSize: '1.4rem', fontWeight: 900 }}>{day.dayName}</h2>
          )}
        </div>
      </div>

      <div className="row gap-4 wrap" style={{ position: 'relative', zIndex: 1 }}>
        <div
          className="row gap-5"
          style={{
            background: 'rgba(0,0,0,0.25)',
            padding: '10px 18px',
            borderRadius: 16,
            border: '1px solid var(--border-color)',
          }}
        >
          <div className="col gap-1" style={{ alignItems: 'center' }}>
            <span className="stat-label">Ejercicios</span>
            <strong style={{ fontSize: '1.2rem' }}>{exerciseCount}</strong>
          </div>
          <span style={{ width: 1, height: 30, background: 'var(--border-color)' }} />
          <div className="col gap-1" style={{ alignItems: 'center' }}>
            <span className="stat-label">Series</span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--accent-emerald)' }}>{setCount}</strong>
          </div>
        </div>

        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Acciones del día"
          >
            <MoreVertical size={18} />
          </button>

          {menuOpen && (
            <div className="popover popover-right" style={{ top: '120%' }} role="menu">
              <button type="button" role="menuitem" className="menu-item" onClick={startEditing}>
                <Edit2 size={15} /> Editar nombre
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  onDuplicate();
                  setMenuOpen(false);
                }}
              >
                <Copy size={15} /> Duplicar día
              </button>
              <hr className="divider" />
              <button
                type="button"
                role="menuitem"
                className="menu-item menu-item-danger"
                onClick={askRemove}
                disabled={!canRemove}
                title={canRemove ? undefined : 'Un microciclo debe tener al menos un día'}
              >
                <Trash2 size={15} /> Eliminar día
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
