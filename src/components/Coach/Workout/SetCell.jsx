import { useRef } from 'react';
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
 *
 * ── La marca es un interruptor: se pulsa, y se vuelve a pulsar ──────────────
 * El ✓ apuntaba lo de la vez anterior y, hecho el apunte, se convertía en un
 * adorno. Pero el gesto de un toque se da también sin querer —se rellena de
 * pie, con una mano y con el móvil sudado— y entonces la única salida era
 * borrar dos cifras a mano, con el teclado tapando la fila.
 *
 * Ahora la marca de una serie hecha VUELVE a ser un botón: lo borra y deja el
 * cursor en los kilos, que es donde se sigue corrigiendo. Pulsar otra vez
 * devuelve la serie al estado anterior —vacía y con su ✓ de repetir, si había
 * vez anterior—, así que el gesto es reversible por los dos lados y no hace
 * falta aprender ninguna otra cosa.
 */
export const SetRow = ({
  index,
  set,
  onChange,
  exerciseName,
  showRir = false,
  previous = null,
  record = false,
  onConfirm = null,
  /* Borrar lo apuntado en ESTA serie. Solo lo pasa quien registra (el portal
     del cliente); programando no hay nada que borrar aquí. */
  onClear = null,
}) => {
  const label = `${exerciseName}, serie ${index + 1}`;
  const done = isSetLogged(set);
  const fila = useRef(null);
  /* Se puede repetir lo de la vez anterior de un toque: hay referencia y la
     serie está vacía. Es el gesto de Hevy —la mayoría de las series son «lo
     mismo que la última vez»— y ahorra escribir dos cifras por serie. */
  const puedeRepetir = !done && previous?.kg && previous?.reps && onConfirm;
  const puedeBorrar = done && Boolean(onClear);

  /* Borrar y quedarse dentro: el sitio donde se sigue después de deshacer una
     equivocación es el primer campo de la misma fila. */
  const borrar = () => {
    onClear();
    fila.current?.querySelector('input')?.focus();
  };

  return (
    <div ref={fila} className={`set-row${done ? ' is-done' : ''}${record ? ' is-record' : ''}`}>
      {/*
        La marca de hecho sustituye al número, no lo acompaña: en una lista de
        cuatro series el orden ya lo da la posición, así que repetir «S3» al lado
        del visto es decir dos veces lo mismo. Lo que no se sabe de un vistazo es
        cuáles quedan. Y mientras no está hecha, si hay vez anterior, la marca es
        un BOTÓN: tocarlo apunta lo mismo que entonces.
      */}
      {puedeRepetir ? (
        <button
          type="button"
          className="set-row-tag is-boton"
          onClick={() => onConfirm(previous)}
          aria-label={`${label}: apuntar lo mismo que la vez anterior, ${previous.kg} kg por ${previous.reps}`}
          title="Igual que la vez anterior"
        >
          <Check size={13} strokeWidth={3} />
        </button>
      ) : puedeBorrar ? (
        <button
          type="button"
          className="set-row-tag is-boton"
          onClick={borrar}
          aria-label={`${label}: borrar lo apuntado y corregirlo`}
          title={record ? 'Récord. Toca para borrar lo apuntado' : 'Borrar lo apuntado'}
        >
          {record ? 'PR' : <Check size={13} strokeWidth={3} />}
        </button>
      ) : (
        <span className="set-row-tag" title={record ? 'Récord: tu mejor marca en este ejercicio' : undefined}>
          {record ? 'PR' : done ? <Check size={13} strokeWidth={3} /> : index + 1}
        </span>
      )}

      <span className="set-row-target">
        {/* El peso pautado, cuando lo hay, delante del rango: «100 kg · 6-8».
            Vacío es lo de siempre —el peso lo elige quien levanta— y entonces
            la columna dice solo las repeticiones, como hasta ahora. */}
        {set.targetKg !== '' && set.targetKg != null && <span className="tnum">{set.targetKg} kg · </span>}
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
              /*
                ── Y no se suelta tampoco entre ejercicio y ejercicio ─────────
                El recorrido era el de la tabla, o sea el del ejercicio: al
                llegar al último RIR del press se cerraba el teclado y había
                que apuntar con el dedo a la primera casilla del siguiente.
                Registrar una sesión es una sola tirada de treinta números, así
                que el recorrido es el de la SESIÓN (`.set-flow`, la lista
                entera) y solo se suelta al final de todo.
              */
              const ambito = e.currentTarget.closest('.set-flow') || e.currentTarget.closest('.set-table');
              const campos = [...(ambito?.querySelectorAll('input') || [])];
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

/**
 * LAS TANDAS DE UN REMATE, en el teléfono.
 *
 * Una bajada doble son dos tandas más después de la serie, y quien entrena
 * tiene que poder anotar las dos: sin esto, el plan dice «bajada ×2, −20 %» y
 * el registro solo guarda la serie principal, así que la mitad de lo que se
 * hizo no queda escrito en ninguna parte.
 *
 * Van DEBAJO de su serie y sangradas, no como series más: una serie con bajada
 * sigue siendo una serie —lo dice el volumen del microciclo— y numerarlas del
 * uno al seis diría lo contrario.
 */
export const SetSubRow = ({ nombre, extra, onChange, label }) => (
  <div className="set-row is-sub">
    <span className="set-row-tag" aria-hidden="true" />
    <span className="set-row-target">{nombre}</span>
    {FIELDS.filter((f) => f.key !== 'rir').map((field) => (
      <input
        key={field.key}
        type="text"
        inputMode={field.mode}
        className="input input-center"
        placeholder="—"
        value={extra?.[field.key] ?? ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        enterKeyHint="next"
        aria-label={`${label}: ${field.label}`}
      />
    ))}
    {/* La columna del RIR se queda vacía y no desaparece: si la fila tuviera dos
        campos donde las demás tienen tres, las columnas dejarían de cuadrar y
        la tabla se leería como dos tablas. Al fallo no hay RIR que anotar. */}
    <span aria-hidden="true" />
  </div>
);

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
            <X size={13} />
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
