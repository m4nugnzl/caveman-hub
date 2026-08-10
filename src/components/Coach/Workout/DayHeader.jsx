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
    <header className="day-head">
      <div className="row gap-4" style={{ position: 'relative', zIndex: 1 }}>
        <span className="day-icon">
          <Dumbbell size={22} />
        </span>

        <div className="col gap-1">
          <div className="row gap-2 wrap">
            <span className="section-label" style={{ color: 'var(--accent)' }}>
              Día de entrenamiento
            </span>
            {weekday && <span className="badge">{weekday}</span>}
          </div>

          {editing ? (
            <div className="row gap-2">
              <input
                autoFocus
                className="input"
                style={{ fontSize: 'var(--fs-lg)', fontWeight: 680, minWidth: 200 }}
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
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>{day.dayName}</h2>
          )}
        </div>
      </div>

      <div className="row gap-4 wrap" style={{ position: 'relative', zIndex: 1 }}>
        <div className="day-stats">
          <div className="day-stat">
            <span className="section-label">Ejercicios</span>
            <span className="v">{exerciseCount}</span>
          </div>
          <div className="day-stat">
            <span className="section-label">Series</span>
            <span className="v" style={{ color: 'var(--accent)' }}>{setCount}</span>
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
