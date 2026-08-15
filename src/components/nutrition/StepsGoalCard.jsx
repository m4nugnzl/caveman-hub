import { useState } from 'react';
import { Check, Footprints, Pencil, X } from 'lucide-react';

/**
 * Los pasos diarios, en su sitio.
 *
 * ══ Por qué esto sale de la tarjeta de kcal ═════════════════════════════════
 *
 * Estaba dentro del objetivo de macros, y ahí no era del todo mentira —se decide
 * a la vez que las calorías, hablando del mismo gasto— pero traía un fallo que
 * solo aparece con dos dietas: **el objetivo de kcal es POR VARIANTE y los pasos
 * no**. Son una columna del plan (`steps_goal`), una sola para la persona.
 *
 * El resultado era que el campo solo existía en la tarjeta de los días de
 * entreno, y en la de descanso se escondía a mano. Quien montara primero el día
 * de descanso no encontraba dónde ponerlos, y quien los viera en «entreno» tenía
 * motivos para pensar que eran los pasos DE los días de entreno — que es lo que
 * la tarjeta estaba diciendo sin querer.
 *
 * Fuera de las dos tarjetas, la cifra dice lo que es: lo que esta persona camina
 * cada día, entrene o no.
 *
 * ── Y por qué sigue en la pantalla de nutrición ─────────────────────────────
 * Porque es donde se decide. La actividad diaria es la otra mitad del balance
 * energético: se ajusta mirando las calorías, no la rutina de fuerza. Llevarla a
 * la ficha del cliente la sacaría de la conversación en la que se toma.
 */
export const StepsGoalCard = ({ stepsGoal, editable = false, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const puesto = String(stepsGoal ?? '').trim();

  /* Al cliente no se le enseña un hueco vacío: sin objetivo puesto no hay nada
     que contarle, y una tarjeta que dice «sin definir» solo le hace preguntarse
     si tiene que hacer algo. */
  if (!editable && !puesto) return null;

  if (editing) {
    return (
      <form
        className="card row between wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft.trim());
          setEditing(false);
        }}
      >
        <label className="field grow" style={{ minWidth: 180 }}>
          <span className="field-label">
            <Footprints size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
            Pasos diarios
          </span>
          <input
            autoFocus
            className="input"
            inputMode="numeric"
            value={draft}
            placeholder="10000"
            onChange={(e) => setDraft(e.target.value)}
            /* Vaciar el campo es la forma de quitar el objetivo, y por eso no hay
               un botón «Quitar»: la casilla en blanco ya lo dice. */
            aria-label="Pasos diarios objetivo"
          />
        </label>

        <div className="row gap-1 shrink-0">
          <button type="submit" className="btn btn-primary btn-sm">
            <Check size={14} /> Guardar
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setEditing(false)}
            aria-label="Cancelar"
          >
            <X size={15} />
          </button>
        </div>
      </form>
    );
  }

  return (
    <article className="card row between wrap gap-3">
      <span className="col" style={{ gap: 2, minWidth: 0 }}>
        <span className="section-label">
          <Footprints size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
          Pasos diarios
        </span>
        {/* Con la cifra puesta no hace falta decir nada más: se explica sola. El
            texto solo aparece cuando NO hay objetivo, que es cuando hay que decir
            qué se puede poner ahí. */}
        {!puesto && <span className="t-sm t-secondary">Sin definir.</span>}
      </span>

      <span className="row gap-2 shrink-0">
        {puesto && (
          <strong style={{ fontSize: '1.25rem' }}>
            {puesto} <span className="t-sm t-tertiary">pasos</span>
          </strong>
        )}
        {editable && (
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => {
              setDraft(puesto);
              setEditing(true);
            }}
            aria-label="Editar los pasos diarios"
          >
            <Pencil size={14} />
          </button>
        )}
      </span>
    </article>
  );
};
