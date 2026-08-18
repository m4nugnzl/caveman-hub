import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

/**
 * Un objetivo de actividad del plan: los pasos diarios, el cardio de alta
 * intensidad.
 *
 * ══ Por qué esto sale de la tarjeta de kcal ═════════════════════════════════
 *
 * Los pasos estaban dentro del objetivo de macros, y ahí no era del todo mentira
 * —se deciden a la vez que las calorías, hablando del mismo gasto— pero traía un
 * fallo que solo aparece con dos dietas: **el objetivo de kcal es POR VARIANTE y
 * la actividad no**. Es una columna del plan, una sola para la persona.
 *
 * El resultado era que el campo solo existía en la tarjeta de los días de
 * entreno, y en la de descanso se escondía a mano. Quien montara primero el día
 * de descanso no encontraba dónde ponerlo, y quien lo viera en «entreno» tenía
 * motivos para pensar que eran los pasos DE los días de entreno — que es lo que
 * la tarjeta estaba diciendo sin querer.
 *
 * Fuera de las dos tarjetas, la cifra dice lo que es: lo que esta persona hace
 * cada día, entrene o no.
 *
 * ── Y por qué sigue en la pantalla de nutrición ─────────────────────────────
 * Porque es donde se decide. La actividad es la otra mitad del balance
 * energético: se ajusta mirando las calorías, no la rutina de fuerza. Llevarla a
 * la ficha del cliente la sacaría de la conversación en la que se toma.
 *
 * ══ Por qué es genérica y no dos tarjetas ══════════════════════════════════
 *
 * Porque al añadir el cardio la alternativa era copiar este archivo entero y
 * cambiar dos cadenas. Dos copias de la misma tarjeta divergen: basta con que
 * alguien arregle el guardado con Enter en una de las dos. Lo que cambia entre
 * las dos —icono, nombre, unidad y ejemplo— son cuatro propiedades.
 *
 * ── Y por qué el cardio también es texto libre ──────────────────────────────
 * Porque se prescribe de mil maneras y ninguna cabe en dos casillas: «2 días,
 * 10 rondas de 30/30 en bici», «15 min de cinta al 80 % después de pierna», «lo
 * que te pida el cuerpo, sin pasar de tres». Partirlo en sesiones × minutos
 * obligaría a redondear la prescripción de todo el mundo a la forma que entiende
 * la aplicación, que es lo que hace inútil un campo.
 */
/**
 * @param numeric  El valor es UNA CIFRA («10000»), no una frase. Cambia dos
 *   cosas: el teclado del móvil sale numérico, y la cifra se pinta grande a la
 *   derecha del nombre. Una prescripción de cardio de doce palabras en ese hueco
 *   —a 1,25 rem y en negrita— parte la tarjeta en tres líneas y compite con todo
 *   lo que tiene alrededor, así que el texto largo va debajo y a tamaño normal.
 */
export const GoalCard = ({
  icon: Icon,
  label,
  value,
  unit = '',
  placeholder = '',
  hint = '',
  numeric = false,
  editable = false,
  onSave,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const puesto = String(value ?? '').trim();

  /* Al cliente no se le enseña un hueco vacío: sin objetivo puesto no hay nada
     que contarle, y una tarjeta que dice «sin definir» solo le hace preguntarse
     si tiene que hacer algo. */
  if (!editable && !puesto) return null;

  const Etiqueta = (
    <span className="section-label">
      <Icon size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
      {label}
    </span>
  );

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
            <Icon size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
            {label}
          </span>
          <input
            autoFocus
            className="input"
            inputMode={numeric ? 'numeric' : undefined}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            /* Vaciar el campo es la forma de quitar el objetivo, y por eso no hay
               un botón «Quitar»: la casilla en blanco ya lo dice. */
            aria-label={`${label} objetivo`}
          />
          {hint && <span className="field-hint">{hint}</span>}
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
      <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
        {Etiqueta}
        {/* Con el objetivo puesto no hace falta decir nada más: se explica solo.
            El texto solo aparece cuando NO hay nada, que es cuando hay que decir
            qué se puede poner ahí. */}
        {!puesto && <span className="t-sm t-secondary">Sin definir.</span>}
        {puesto && !numeric && (
          <span className="t-sm" style={{ whiteSpace: 'pre-wrap' }}>
            {puesto}
          </span>
        )}
      </span>

      <span className="row gap-2 shrink-0">
        {puesto && numeric && (
          <strong style={{ fontSize: '1.25rem' }}>
            {puesto} {unit && <span className="t-sm t-tertiary">{unit}</span>}
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
            aria-label={`Editar ${label.toLowerCase()}`}
          >
            <Pencil size={14} />
          </button>
        )}
      </span>
    </article>
  );
};
