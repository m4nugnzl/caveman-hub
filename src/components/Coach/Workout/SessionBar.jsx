import { CalendarPlus, Trash2 } from 'lucide-react';

import { sessionCompletion, sessionLabel, sessionSetCount, sessionTonnage } from '@/domain/sessions';
import { todayISO } from '@/lib/dates';
import { useConfirm } from '@/components/ui/ConfirmProvider';

/**
 * Selector de sesión de un día.
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 * Hasta ahora los kilos se escribían dentro del plan, así que no había forma de
 * saber **cuándo** se entrenó ni de registrar dos veces el mismo día de la
 * semana. Aquí cada registro es una sesión con su fecha: se puede añadir la de
 * hoy, corregir una pasada, o llevar dos sesiones del mismo día en una semana.
 *
 * La fecha es editable porque casi nunca se apunta el entrenamiento en el
 * momento: se rellena por la noche, o al día siguiente.
 */
export const SessionBar = ({ sessions, activeId, day, onSelect, onCreate, onChangeDate, onRemove }) => {
  const confirm = useConfirm();
  const active = sessions.find((s) => s.id === activeId) || null;
  const completion = active ? sessionCompletion(active, day) : null;

  const askRemove = async () => {
    const ok = await confirm({
      title: `¿Eliminar la sesión del ${active.date}?`,
      message: `Se borrarán los ${sessionSetCount(active)} registros de esa sesión. El plan del día no se toca.`,
      confirmLabel: 'Eliminar sesión',
      tone: 'danger',
    });
    if (ok) onRemove(active.id);
  };

  return (
    <div className="session-bar">
      <div className="row wrap gap-3">
        <div className="col gap-1">
          <span className="section-label">Sesión registrada</span>
          <div className="rail">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className="chip"
                aria-pressed={session.id === activeId}
                onClick={() => onSelect(session.id)}
              >
                {sessionLabel(session)}
                <span className="t-xs" style={{ opacity: 0.75 }}>
                  {sessionSetCount(session)}
                </span>
              </button>
            ))}

            <button
              type="button"
              className="chip chip-dashed"
              onClick={() => onCreate(todayISO())}
              title="Registrar una sesión nueva con la fecha de hoy"
            >
              <CalendarPlus size={13} /> Nueva
            </button>
          </div>
        </div>

        {active && !active.isLegacy && (
          <label className="col gap-1">
            <span className="section-label">Fecha</span>
            <input
              type="date"
              className="input input-sm"
              style={{ width: 148 }}
              value={active.date || ''}
              max={todayISO()}
              onChange={(e) => onChangeDate(active.id, e.target.value)}
            />
          </label>
        )}
      </div>

      <div className="row wrap gap-4">
        {completion && (
          <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
            <span className="section-label">Completado</span>
            <span
              className="row-value"
              style={{ color: completion.pct >= 100 ? 'var(--positive)' : 'var(--text)' }}
            >
              {completion.logged}/{completion.planned}
            </span>
          </div>
        )}

        {active && (
          <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
            <span className="section-label">Tonelaje</span>
            <span className="row-value">{sessionTonnage(active)} kg</span>
          </div>
        )}

        {active && !active.isLegacy && (
          <button
            type="button"
            className="btn btn-icon btn-icon-danger"
            onClick={askRemove}
            aria-label="Eliminar sesión"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
};
