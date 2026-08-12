import { CalendarPlus, Trash2 } from 'lucide-react';

import { sessionCompletion, sessionLabel, sessionSetCount, sessionTonnage } from '@/domain/sessions';
import { shortDate, todayISO } from '@/lib/dates';
import { useConfirm } from '@/components/ui/ConfirmProvider';

/**
 * Cuándo se entrenó este día.
 *
 * ══ Para qué sirve la fecha ═════════════════════════════════════════════════
 *
 * Es lo ÚNICO que sitúa un entrenamiento en el tiempo. `weekNumber` es un índice
 * del programa —la semana 12 del bloque—, no una fecha: dos clientes en su semana
 * 12 pueden estar a tres meses de distancia, y un mismo cliente puede pasarse dos
 * semanas naturales en su semana 12 si se va de viaje.
 *
 * Toda la analítica agrupa por `weekStart(session.date)`: el tonelaje por semana,
 * la progresión por ejercicio, el peso corporal y las series de sensaciones. Es lo
 * que permite poner «subió el tonelaje» y «bajó el peso» en el mismo eje. Sin
 * fecha, un bloque de entrenamiento no se puede cruzar con un pesaje ni con una
 * foto, y el proyecto ya tuvo ese fallo: lo que registraba el cliente se fechaba
 * con la fecha del MICROCICLO y la progresión salía movida.
 *
 * Por eso la fecha se rellena sola —la de hoy, al escribir el primer kilo— y es
 * corregible: casi nadie apunta el entrenamiento en el momento, se hace por la
 * noche o al día siguiente.
 *
 * ══ Lo que estaba mal ═══════════════════════════════════════════════════════
 *
 * No la fecha: su presentación. Aquí había un carril de chips con todas las
 * sesiones del día y un botón «Nueva» permanente, y eso comunica que registrar
 * VARIAS sesiones del mismo día es parte del trabajo semanal. No lo es: el modelo
 * lo permite —un cliente puede repetir «Empuje A» dos veces en una semana— pero es
 * la excepción, y ofrecerlo como control principal invita a crear sesiones vacías
 * que después cuentan como entrenos en la adherencia.
 *
 * Ahora la barra dice UNA cosa —cuándo entrenó y cuánto hizo— y el carril solo
 * aparece si de verdad hay más de una sesión que elegir, que es la misma regla que
 * ya seguía el portal del cliente. Registrar otra queda como una acción secundaria
 * y con su explicación.
 */
export const SessionBar = ({ sessions, activeId, day, onSelect, onCreate, onChangeDate, onRemove }) => {
  const confirm = useConfirm();
  const active = sessions.find((s) => s.id === activeId) || null;
  const completion = active ? sessionCompletion(active, day) : null;

  const askRemove = async () => {
    const ok = await confirm({
      title: `¿Eliminar la sesión del ${shortDate(active.date)}?`,
      message: `Se borrarán los ${sessionSetCount(active)} registros de esa sesión. El plan del día no se toca.`,
      confirmLabel: 'Eliminar sesión',
      tone: 'danger',
    });
    if (ok) onRemove(active.id);
  };

  return (
    <div className="session-bar">
      <div className="row wrap gap-4">
        {/* Solo cuando hay algo que elegir. Con una sesión —el caso normal— un
            selector de un elemento es una decisión que no existe. */}
        {sessions.length > 1 && (
          <div className="col gap-1">
            <span className="section-label">Sesión</span>
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
                  <span className="chip-count">{sessionSetCount(session)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {active && !active.isLegacy ? (
          <label className="col gap-1">
            <span className="section-label">Entrenado el</span>
            <input
              type="date"
              className="input input-sm"
              style={{ width: 150 }}
              value={active.date || ''}
              max={todayISO()}
              onChange={(e) => onChangeDate(active.id, e.target.value)}
              title="La fecha real del entrenamiento. Es la que usa toda la analítica."
            />
          </label>
        ) : (
          <div className="col gap-1">
            <span className="section-label">Entrenado el</span>
            <span className="t-sm t-tertiary">
              {active?.isLegacy ? 'Registro anterior, sin fecha propia' : 'Al anotar el primer kilo se fecha hoy'}
            </span>
          </div>
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

        {/*
          Secundaria y con su explicación: es para el caso raro de repetir el mismo
          día dentro de la misma semana. Como botón principal invitaba a crear
          sesiones vacías, que después cuentan como entrenos en la adherencia.
        */}
        <button
          type="button"
          className="btn btn-plain btn-sm"
          onClick={() => onCreate(todayISO())}
          title="Solo si tu cliente ha repetido este día dentro de la misma semana"
        >
          <CalendarPlus size={14} /> Otra sesión
        </button>

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
