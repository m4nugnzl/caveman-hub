import { Check, X } from 'lucide-react';

import { isSetLogged } from '@/domain/sessions';

/**
 * Una serie.
 *
 *   S1              obj [8-10]
 *    KG    REPS   RIR
 *  [100]  [ 8 ]  [ 2 ]
 *
 * ── Sobre el objetivo de repeticiones ───────────────────────────────────────
 * Es POR SERIE, y tiene que serlo: hay pirámides, series descendentes y
 * aproximaciones, y forzar un rango único para todo el ejercicio quita
 * información real.
 *
 * Lo que estaba mal no era que existiera, sino su peso visual: ocupaba una
 * columna del mismo tamaño que los kilos y competía con ellos. Ahora vive en la
 * cabecera de la celda, pequeño y en cian —el color de lo que programa el
 * entrenador— claramente subordinado a los tres valores que se registran.
 */

const FIELDS = [
  { key: 'kg', unit: 'kg', label: 'kilos', mode: 'decimal' },
  { key: 'reps', unit: 'reps', label: 'repeticiones', mode: 'numeric' },
  { key: 'rir', unit: 'rir', label: 'RIR', mode: 'numeric' },
];

/**
 * La misma serie, como FILA de una tabla.
 *
 * ══ Por qué existen dos formas ══════════════════════════════════════════════
 *
 * Son dos trabajos distintos, no dos tamaños de pantalla.
 *
 * El entrenador PROGRAMA: recorre muchos ejercicios comparando estructuras, y
 * cada serie es una pieza que puede añadir, quitar y ajustar. La tarjeta —con su
 * `S1`, su objetivo y sus tres campos etiquetados— es autónoma y se puede mover.
 *
 * El cliente RELLENA: tiene delante cuatro series iguales de un mismo ejercicio y
 * escribe doce números seguidos. Ahí la tarjeta es la forma equivocada, y en el
 * móvil se veía por qué: apiladas una debajo de otra, cada tarjeta repetía
 * «KG REPS RIR», o sea las mismas tres etiquetas CUATRO veces por ejercicio. En
 * escritorio no cantaba porque las cuatro tarjetas iban en fila y esas etiquetas
 * se leían como una cabecera de columna. Al apilarlas dejaron de serlo.
 *
 * La fila lo arregla en el sitio correcto: las etiquetas salen de la serie y
 * suben a UNA cabecera del ejercicio, que es de quien son.
 *
 * `FIELDS` se comparte con la tarjeta a propósito: dos listas de campos acaban
 * divergiendo, y el día que se añada «tempo» tiene que aparecer en las dos.
 *
 * ── La vez anterior, dentro del propio campo ────────────────────────────────
 * `previous` es lo que se levantó en ESTA serie la última vez (ver
 * `domain/sessions.js`). Va como marcador de posición del campo y no en una
 * columna nueva por dos razones:
 *
 *   · Está donde se necesita. La pregunta «¿cuánto le metí?» se hace justo antes
 *     de escribir la cifra, y la respuesta aparece en el hueco donde se escribe.
 *   · No cuesta un milímetro. Una sexta columna en una fila que ya tiene cinco
 *     dejaría los campos por debajo del objetivo táctil en un móvil de 360 px, y
 *     esto se rellena de pie y con una mano.
 *
 * Y no rellena el valor: un marcador desaparece al escribir y NO se guarda. Unos
 * kilos heredados que nadie ha levantado son indistinguibles de los reales.
 */
export const SetRow = ({ index, set, onChange, exerciseName, showRir = false, previous = null }) => {
  const label = `${exerciseName}, serie ${index + 1}`;
  const done = isSetLogged(set);

  return (
    <div className={`set-row${done ? ' is-done' : ''}`}>
      <span className="set-row-tag">
        {/*
          La marca de hecho sustituye al número, no lo acompaña: en una lista de
          cuatro series el orden ya lo da la posición, así que repetir «S3» al lado
          del visto es decir dos veces lo mismo. Lo que no se sabe de un vistazo es
          cuáles quedan.
        */}
        {done ? <Check size={13} strokeWidth={3} /> : index + 1}
      </span>

      <span className="set-row-target">
        {set.targetReps || '—'}
        {/* El RIR pedido va pegado al rango de repeticiones y no en columna
            propia: las dos cosas son «lo que te pido en esta serie», y separarlas
            haría una columna que está vacía para casi todo el mundo. */}
        {showRir && set.targetRir !== '' && set.targetRir != null && (
          <span className="rir"> · RIR {set.targetRir}</span>
        )}
      </span>

      {FIELDS.map((field) => {
        /* Solo kg y reps tienen referencia: el RIR de la vez anterior no dice
           qué peso poner hoy, y ofrecerlo invitaría a copiarlo. */
        const antes = previous?.[field.key];
        return (
          <input
            key={field.key}
            type="text"
            inputMode={field.mode}
            className="input input-center"
            placeholder={antes || '—'}
            value={set[field.key] ?? ''}
            onChange={(e) => onChange(field.key, e.target.value)}
            /*
              ══ El teclado no se suelta entre campo y campo ══════════════════
              Registrar una serie son tres números seguidos, y en el móvil cada
              uno exigía re-apuntar con el dedo: campo, teclado, campo, teclado.
              «Siguiente» (enterKeyHint) salta al campo que viene —kg → reps →
              rir → la serie de abajo— recorriendo los inputs de la tabla del
              ejercicio; en el último, cierra el teclado. El dato ya está
              guardado: `onChange` escribe con cada tecla.
            */
            enterKeyHint="next"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const tabla = e.currentTarget.closest('.set-table');
              const campos = [...(tabla?.querySelectorAll('input') || [])];
              const siguiente = campos[campos.indexOf(e.currentTarget) + 1];
              if (siguiente) siguiente.focus();
              else e.currentTarget.blur();
            }}
            aria-label={
              antes
                ? `${label}: ${field.label}. La vez anterior, ${antes}`
                : `${label}: ${field.label}`
            }
          />
        );
      })}

    </div>
  );
};

/** La cabecera de la tabla: las etiquetas, una sola vez por ejercicio. */
export const SetRowHead = () => (
  <div className="set-row is-head" aria-hidden="true">
    <span>#</span>
    <span>obj</span>
    {FIELDS.map((field) => (
      <span key={field.key}>{field.unit}</span>
    ))}
  </div>
);

/**
 * Una serie, como TARJETA. La forma de PROGRAMAR: autónoma, movible, con su
 * objetivo editable. Solo la usa el entrenador — el cliente registra con
 * `SetRow`, así que ya no hace falta el interruptor `canEditTarget` que antes
 * apagaba medio componente.
 */
export const SetCell = ({
  index,
  set,
  canRemove,
  onChange,
  onRemove,
  exerciseName,
  showRir = false,
}) => {
  const label = `${exerciseName}, serie ${index + 1}`;

  return (
    <div className="set-cell">
      <div className="set-cell-head">
        <span className="set-cell-tag">S{index + 1}</span>

        <span className="set-cell-target">
          <span className="tag">obj</span>
          <input
            type="text"
            className="input"
            placeholder="8-10"
            value={set.targetReps ?? ''}
            onChange={(e) => onChange('targetReps', e.target.value)}
            aria-label={`${label}: repeticiones objetivo`}
            title="Repeticiones objetivo de esta serie"
          />
        </span>

        {/* El RIR objetivo, con el mismo tratamiento que el rango de reps: es lo
            otro que el entrenador PIDE, así que comparte su sitio y su color. */}
        {showRir && (
          <span className="set-cell-target">
            <span className="tag">rir</span>
            <input
              type="text"
              inputMode="numeric"
              className="input"
              placeholder="2"
              value={set.targetRir ?? ''}
              onChange={(e) => onChange('targetRir', e.target.value)}
              aria-label={`${label}: RIR objetivo`}
              title="Repeticiones que debe dejarse en el depósito"
            />
          </span>
        )}

        {/* La equis por clase (`.set-x`): con el tamaño en línea medía ~12 px
            de ancho y en táctil era imposible de acertar sin darle a un campo. */}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="btn set-x"
            aria-label={`Quitar ${label}`}
            title="Quitar serie"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="set-cell-grid">
        {FIELDS.map((field) => (
          <label className="set-cell-col" key={field.key}>
            <span className="unit">{field.unit}</span>
            <input
              type="text"
              inputMode={field.mode}
              className="input"
              value={set[field.key] ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              aria-label={`${label}: ${field.label}`}
            />
          </label>
        ))}
      </div>

    </div>
  );
};
