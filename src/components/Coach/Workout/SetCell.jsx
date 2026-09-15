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
 * Salta al campo siguiente de la tabla del ejercicio, y en el último suelta el
 * teclado. Lo usan la tecla «Siguiente» del teclado y el botón de la pastilla
 * del pulgar: es el mismo gesto pedido por dos caminos, así que es una función
 * y no dos copias.
 */
export const saltarAlSiguiente = (desde) => {
  const tabla = desde?.closest?.('.set-table');
  const campos = [...(tabla?.querySelectorAll('input') || [])];
  const siguiente = campos[campos.indexOf(desde) + 1];
  if (siguiente) siguiente.focus();
  else desde?.blur?.();
};

/**
 * Lo que el plan pauta para un campo de una serie, como cifra escribible.
 *
 * Devuelve `null` cuando no hay nada que ofrecer, y ahí entra el rango: «8-10»
 * es un objetivo, no un valor. Escribirlo en la casilla de repeticiones lo
 * rechaza la propia función de guardado (`log_session_set` exige un número), así
 * que un botón que lo ofreciera prometería algo que falla.
 */
const planDelCampo = (set, field) => {
  const pautado = {
    kg: set?.targetKg,
    reps: set?.targetReps,
    rir: set?.targetRir,
  }[field];
  const texto = String(pautado ?? '').trim();
  if (!texto) return null;
  return /^[0-9]+([.,][0-9]+)?$/.test(texto) ? texto : null;
};

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
export const SetRow = ({
  index,
  set,
  onChange,
  exerciseName,
  showRir = false,
  previous = null,
  record = false,
  onConfirm = null,
  /*
    ── Quién tiene el foco, para la pastilla del pulgar ──────────────────────
    Se avisa con `{ field, plan, antes, antesDice }` al entrar en un campo y con
    `null` al salir. Lo pasa solo el portal del cliente (`ClientDay`): en la
    pantalla del entrenador no hay pastilla, así que sin esta prop la fila es
    exactamente lo que era.

    Lo que NO se hace aquí es decidir cuándo se cierra: al saltar de kg a reps
    hay un `blur` antes del `focus` siguiente, y cerrar en el `blur` haría
    parpadear la pastilla entre campo y campo. Eso lo resuelve quien la pinta.
  */
  onFoco = null,
  /* Las cuatro series de este ejercicio piden lo mismo, así que el pie no
     repite la pauta: ya la dice el galón del ejercicio. Ver `pauta` abajo. */
  sinPauta = false,
}) => {
  const label = `${exerciseName}, serie ${index + 1}`;
  const done = isSetLogged(set);
  /* Se puede repetir lo de la vez anterior de un toque: hay referencia y la
     serie está vacía. Es el gesto de Hevy —la mayoría de las series son «lo
     mismo que la última vez»— y ahorra escribir dos cifras por serie. */
  const puedeRepetir = !done && previous?.kg && previous?.reps && onConfirm;

  /*
    ── LO QUE TE PIDEN Y LO QUE HICISTE, en una línea ────────────────────────
    Solo en el teléfono, y debajo de las casillas. Ahí la columna «obj» mide 52
    px para decir «100 kg · 6-8» en dos renglones, y esos 52 px salen de las
    tres casillas donde de verdad se escribe con el dedo. Bajarlo a un pie deja
    los campos anchos y de paso permite decir la referencia entera —«la vez
    anterior 80 × 8»— en vez de una cifra apagada dentro del hueco.

    Se compone aquí y no en el CSS porque es texto, y porque las dos mitades
    pueden faltar por separado: sin pauta y sin referencia no hay línea.
  */
  /*
    ══ Y LA PAUTA SOLO CUANDO ES DE ESTA SERIE (13 sep 2026) ═════════════════

    Aquí decía: *«el rango sigue diciéndose ADEMÁS en cada serie, a propósito:
    una pirámide tiene un objetivo por serie, y para cuando vas por la cuarta el
    galón hace rato que se fue por arriba»*. La razón es buena para una pirámide
    y falsa para lo normal: con las cuatro series pautadas igual —que es el caso
    de casi todos los ejercicios— el galón del ejercicio ya dice «4 series · 6-8
    reps · RIR 2» y debajo venían cuatro renglones repitiendo «6-8 reps».

    Medido en la app real a 392 px: un ejercicio de cuatro series gastaba cuatro
    renglones en decir lo mismo que el de arriba, y con seis ejercicios eran
    veinticuatro. El dueño: *«siento que hay demasiado texto que sobra… elimina
    información redundante»*.

    `sinPauta` lo decide quien tiene las series delante (`ExerciseList`), que es
    el único que puede saber si las cuatro piden lo mismo. La pirámide sigue
    diciendo la suya en cada serie, que es donde el argumento viejo acierta.
  */
  const pauta = sinPauta ? null : [
    set.targetKg !== '' && set.targetKg != null ? `${set.targetKg} kg` : null,
    set.targetReps ? `${set.targetReps} reps` : null,
    showRir && set.targetRir !== '' && set.targetRir != null ? `RIR ${set.targetRir}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const referencia =
    previous?.kg && previous?.reps
      ? `la vez anterior ${previous.kg} × ${previous.reps}${
          previous.weekNumber ? ` · semana ${previous.weekNumber}` : ''
        }`
      : null;

  return (
    <div className={`set-row${done ? ' is-done' : ''}${record ? ' is-record' : ''}`}>
      {/*
        ── El número de la serie, y solo en el teléfono ────────────────────────
        En la tabla ancha la marca hace los dos trabajos —número mientras falta,
        visto cuando está hecha— y eso está bien cuando vive a la izquierda. En
        el teléfono la marca se va al otro extremo para ser el objetivo táctil
        de 44 px que pide el pulgar, y una fila que empieza por una casilla no
        dice por cuál serie vas. El número se queda en su sitio.
      */}
      <span className="set-row-n" aria-hidden="true">
        {index + 1}
      </span>

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
          /*
            ── La casilla y su rótulo son UNA pieza ──────────────────────────
            En la tabla ancha el rótulo vive una sola vez, en la cabecera del
            ejercicio (`SetRowHead`), y esta envoltura no se ve: es un
            `display: contents` que deja el campo donde estaba.

            En el teléfono la cabecera desaparece —cinco columnas de 9 px no son
            una cabecera, son un borrón— y el rótulo baja DENTRO de la caja, que
            es lo que hace que «80» se lea como kilos sin tener que subir la
            vista. No es repetirlo cuatro veces por ejercicio, que fue lo que se
            retiró de la tarjeta: es que sin cabecera hay que decirlo en alguna
            parte, y dentro de la caja no gasta ni un renglón.
          */
          <label className="set-campo" key={field.key}>
            <span className="set-campo-k" aria-hidden="true">
              {field.unit}
            </span>
            <input
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
              saltarAlSiguiente(e.currentTarget);
            }}
            onFocus={
              onFoco
                ? () =>
                    onFoco({
                      field: field.key,
                      /* Lo pautado para ESTA serie y este campo. El rango de
                         repeticiones («8-10») no vale: no es un número que se
                         pueda escribir, y ofrecerlo escribiría «8-10» en una
                         casilla que la base de datos rechaza. */
                      plan: planDelCampo(set, field.key),
                      antes: antes ? String(antes) : null,
                      antesDice: previous?.kg && previous?.reps
                        ? `${previous.kg} × ${previous.reps}`
                        : null,
                    })
                : undefined
            }
            onBlur={onFoco ? () => onFoco(null) : undefined}
            aria-label={
              antes
                ? `${label}: ${field.label}. La vez anterior, ${antes}`
                : `${label}: ${field.label}`
            }
            />
          </label>
        );
      })}

      {/* El pie de la serie: lo que te piden y lo que hiciste. Solo se pinta en
          el teléfono (lo decide el CSS); en la tabla ancha esas dos cosas están
          en la columna «obj» y en el hueco apagado de cada casilla. */}
      {(pauta || referencia) && (
        <span className="set-row-pie">{[pauta, referencia].filter(Boolean).join(' · ')}</span>
      )}
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
    <span className="set-row-n" aria-hidden="true" />
    <span className="set-row-tag" aria-hidden="true" />
    <span className="set-row-target">{nombre}</span>
    {FIELDS.filter((f) => f.key !== 'rir').map((field) => (
      /* La misma envoltura que la serie, y por lo mismo: en el teléfono las
         columnas de la tanda tienen que caer donde las de su serie, y una fila
         con campos desnudos y otra con campos envueltos no cuadra. El rótulo no
         se repite aquí —la tanda cuelga de la serie de arriba, que ya lo dice—,
         así que la envoltura va vacía. */
      <label className="set-campo" key={field.key}>
        <input
          type="text"
          inputMode={field.mode}
          className="input input-center"
          placeholder="—"
          value={extra?.[field.key] ?? ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          enterKeyHint="next"
          aria-label={`${label}: ${field.label}`}
        />
      </label>
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
