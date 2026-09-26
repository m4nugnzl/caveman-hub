import { Fragment } from 'react';
import { Plus } from 'lucide-react';

import { FORK_RANGE, PREGUNTA_MAX, optionDraft } from '@/domain/fork';
import { GOAL_DIRECTIONS, directionById, isDirectionLabel } from '@/domain/goals';
import { PHASE_PRESETS } from '@/domain/roadmap';
import { BotonAccion, Field, Notice, useAccionDeBoton } from '@/components/ui/primitives';

/*
  ── Viene de `RoadmapPanel` ─────────────────────────────────────────────────
  Era el formulario del cruce de la ventana «El plan». La ventana se retiró el
  26 sep 2026 (todo se crea desde la Temporada) y el formulario se quedó solo:
  lo usa la ventana del punto de decisión (`temporada/VentanasDelPlan`).
*/

/**
 * Plantear los caminos.
 *
 * ── Por qué cada camino pide menos que una fase ─────────────────────────────
 * No tiene fechas —se derivan del final de la fase anterior al elegirlo— ni
 * nota: lo que el cliente debe saber de un tramo se escribe cuando ese tramo
 * existe, no mientras es una de dos posibilidades.
 *
 * Y la duración va solo con los atajos, sin la barra fina de la ventana de una fase. Un
 * camino que a lo mejor no se coge no merece que nadie ajuste sus semanas de
 * una en una; si al elegirlo hay que retocarlas, se retoca la fase.
 *
 * `extra`: un campo más al final, antes del error (el «¿Por qué?» de la Temporada).
 */
export const ForkForm = ({ value, onChange, onSubmit, onCancel, busy, error = null, extra = null }) => {
  const envio = useAccionDeBoton();
  const { options } = value;

  const setOption = (index, patch) =>
    onChange({
      ...value,
      options: options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    });

  const addOption = () => onChange({ ...value, options: [...options, optionDraft('maintain', 4)] });

  const removeOption = (index) =>
    onChange({ ...value, options: options.filter((_, i) => i !== index) });

  return (
    <form
      className="card-inset col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        envio.lanzar(() => onSubmit(e));
      }}
    >
      <div className="col gap-1">
        <span className="section-label">El cruce</span>
        <span className="t-xs t-secondary">
          Al acabar la fase habrá que elegir un camino. Escribe la pregunta que lo decide y, en cada
          camino, la respuesta que lleva a él. Nadie va a comprobarlo por ti: es lo que tu cliente va
          a leer.
        </span>
      </div>

      <Field label="La pregunta" hint="Una frase. Se contesta el día del cruce.">
        <input
          autoFocus
          className="input"
          maxLength={PREGUNTA_MAX}
          value={value.pregunta || ''}
          onChange={(e) => onChange({ ...value, pregunta: e.target.value })}
          placeholder="¿Llega al Nacional con margen?"
        />
      </Field>

      {/* El formulario tiene la forma del resultado: bloque, «o», bloque. Antes
          cada uno se abría con un «Camino 1» que no decía nada que no dijera ya
          estar separados, y la conjunción lo dice mejor y ocupa una letra. */}
      {options.map((option, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <span className="rmap-or" aria-hidden="true">
              o
            </span>
          )}
          <RoadFields
            option={option}
            index={index}
            onChange={(patch) => setOption(index, patch)}
            onRemove={options.length > FORK_RANGE.min ? () => removeOption(index) : null}
          />
        </Fragment>
      ))}

      {options.length < FORK_RANGE.max && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={addOption}>
          <Plus size={15} /> Añadir un tercer camino
        </button>
      )}

      {/* El error va aquí, pegado al botón que lo provoca: arriba del panel, con el
         formulario desplegado y la ventana desplazada, no se veía y parecía que
         guardar no hacía nada. */}
      {extra}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="row gap-2 row-end">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <BotonAccion type="submit" className="btn btn-primary" estado={envio.estado} disabled={busy}>
          Guardar el cruce
        </BotonAccion>
      </div>
    </form>
  );
};

/** Los campos de un camino. Los mismos que una fase menos las fechas y la nota. */
const RoadFields = ({ option, index, onChange, onRemove }) => {
  const meta = directionById(option.direction);

  return (
    <div className="rmap-road-fields col gap-3">
      {/* Solo cuando se puede quitar, que es el tercer camino. Una fila de
          cabecera fija para colgar de ella un botón que casi nunca sale dejaba
          un hueco en blanco encima de cada bloque. */}
      {onRemove && (
        <div className="row gap-2 between">
          <span className="section-label">Camino {index + 1}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRemove}>
            Quitar
          </button>
        </div>
      )}

      <Field label="Respuesta" hint="Lo que contesta la pregunta para coger este camino.">
        <input
          className="input"
          value={option.when}
          onChange={(e) => onChange({ when: e.target.value })}
          placeholder={index === 0 ? 'Sí, con margen' : 'No, todavía le sobra'}
        />
      </Field>

      <div className="rail-wrap" role="group" aria-label={`Dirección del camino ${index + 1}`}>
        {GOAL_DIRECTIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            className="chip"
            aria-pressed={option.direction === d.id}
            title={d.hint}
            /* Como en `PhaseForm`: al cambiar de dirección se arrastran su ritmo
               y su nombre por defecto. Dejar el anterior daría «Volumen» con el
               ritmo de una definición, que es el doble de lo razonable. */
            onClick={() =>
              onChange({
                direction: d.id,
                ratePct: d.defaultRate,
                ...(isDirectionLabel(option.title) ? { title: d.label } : {}),
              })
            }
          >
            {d.label}
          </button>
        ))}
      </div>

      <Field label="Nombre">
        <input
          className="input"
          value={option.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={meta?.label || 'Volumen'}
        />
      </Field>

      <Field label="Duración">
        <div className="row gap-2 wrap">
          {PHASE_PRESETS.map((semanas) => (
            <button
              key={semanas}
              type="button"
              className="chip"
              aria-pressed={option.weeks === semanas}
              onClick={() => onChange({ weeks: semanas })}
            >
              {semanas} sem
            </button>
          ))}
        </div>
      </Field>

      {meta?.sign !== 0 && (
        <Field label="Ritmo semanal (% del peso)" hint={meta?.hint}>
          <input
            type="number"
            className="input input-center"
            step="0.05"
            min="0"
            max="2"
            value={option.ratePct}
            onChange={(e) => onChange({ ratePct: Number(e.target.value) })}
          />
        </Field>
      )}
    </div>
  );
};
