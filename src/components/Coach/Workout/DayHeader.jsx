import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Dumbbell,
  Edit2,
  MoreVertical,
  Save,
  Trash2,
  X,
} from 'lucide-react';

import { countSets, muscleColor, weekdayForDay } from '@/domain/training';
import { useClickOutside } from '@/lib/useClickOutside';
import { useConfirm } from '@/components/ui/ConfirmProvider';

export const DayHeader = ({
  day,
  weeklySplit,
  onRename,
  onDuplicate,
  onRemove,
  onMove,
  firstDay = false,
  lastDay = false,
  canRemove,
  volume = {},
  doneSets = 0,
}) => {
  const confirm = useConfirm();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(day.dayName);
  const menuRef = useRef(null);

  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const weekday = weekdayForDay(weeklySplit, day.dayName);
  const exerciseCount = day.exercises?.length || 0;
  const setCount = countSets(day);

  /* De más a menos: así el músculo dominante del día se lee sin buscarlo, y la
     barra se ordena igual que la leyenda. */
  const reparto = Object.entries(volume).sort((a, b) => b[1] - a[1]);

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
            <h3 className="day-name">{day.dayName}</h3>
          )}

          {/*
            ── El reparto del día, bajo su nombre ────────────────────────────
            Esto estaba como una fila de distintivos FLOTANDO encima del panel,
            y ahí no significaba nada: no se sabía si hablaba del día, de la
            semana o del cliente, y repetía el contador de series que ya está
            aquí al lado.

            Debajo del nombre del día es donde se lee como lo que es —cómo está
            repartido ESTE día— y ya no compite con nada: es la tercera línea de
            una cabecera que va de más general a más concreto.
          */}
          {reparto.length > 0 && (
            <div className="day-volume">
              {/*
                Una barra proporcional y su leyenda, con los colores de músculo
                que ya usa la analítica. La barra contesta de un vistazo lo que
                una fila de distintivos obligaba a leer y sumar: si el día está
                equilibrado o si se ha ido a un solo grupo.
              */}
              <div className="bar" role="img" aria-label={`Reparto de ${setCount} series`}>
                {reparto.map(([muscle, count]) => (
                  <span
                    key={muscle}
                    style={{
                      width: `${(count / setCount) * 100}%`,
                      background: muscleColor(muscle),
                    }}
                  />
                ))}
              </div>

              <div className="row gap-3 wrap">
                {reparto.map(([muscle, count]) => (
                  <span className="day-vol-item" key={muscle}>
                    <span
                      className="dot"
                      style={{ background: muscleColor(muscle) }}
                    />
                    {muscle}
                    <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>
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
            {/* Lo hecho, debajo y en pequeño: al programar importa lo que pones;
                lo que lleva registrado es referencia, no el dato principal. */}
            {doneSets > 0 && <span className="t-2xs t-tertiary">{doneSets} hechas</span>}
          </div>
        </div>

        {/*
          ══ Mover el día, fuera del menú ═══════════════════════════════════════

          Por lo mismo que subir y bajar una comida están fuera del suyo: es un
          gesto de MONTAR, y montar la semana es reordenar. Escondido detrás de
          tres puntos serían dos clics cada vez que se cambia una posición, y una
          reordenación son varias seguidas.

          Van en horizontal —antes y después— porque el carril de días es
          horizontal: el orden que estas dos flechas cambian es exactamente el que
          se está viendo ahí arriba.
        */}
        {onMove && (
          <div className="row gap-1">
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => onMove(-1)}
              disabled={firstDay}
              aria-label={`Mover ${day.dayName} antes`}
              title="Mover antes"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => onMove(1)}
              disabled={lastDay}
              aria-label={`Mover ${day.dayName} después`}
              title="Mover después"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        )}

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
