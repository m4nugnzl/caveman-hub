import { Fragment, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, Quote, Trash2, X } from 'lucide-react';

import { isSetLogged } from '@/domain/sessions';
import {
  nombreDeSubserie,
  restLabel,
  subseriesDe,
  supersetLabels,
  tecnicaDeLaSerie,
  tecnicaFrase,
  tecnicaSpec,
} from '@/domain/training';
import { toNum } from '@/lib/num';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { RemateDeLaSerie } from './RemateDeLaSerie';

/**
 * La hoja de series: el día como TABLA, no como fichas.
 *
 * ── Por qué existe al lado de `ExerciseList` ────────────────────────────────
 * `ExerciseList` pinta cada serie como una tarjeta con tres cajas grandes, y
 * está bien en el móvil, donde se escribe con el pulgar. En el escritorio del
 * entrenador es lo contrario de lo que se necesita: programar es mirar de un
 * vistazo diez ejercicios con sus series, y comparar lo que se puso con lo que
 * hizo. Eso es una hoja —una fila por serie, las columnas siempre en el mismo
 * sitio— y es lo que se le enseñó al dueño en la maqueta.
 *
 * ── Qué es objetivo y qué es hecho ──────────────────────────────────────────
 * El entrenador programa por serie los kilos, las repeticiones y el RIR
 * (`targetKg`, `targetReps`, `targetRir`); el cliente anota kilos,
 * repeticiones y RIR reales (`kg`, `reps`, `rir`). Así que la tabla es
 * PIDES (kg · reps · RIR) | HIZO (kg · reps · RIR), y una repetición real por
 * debajo del mínimo objetivo se pinta en negativo: es lo único que hay que ver
 * sin leer.
 *
 * ══ POR QUÉ CADA EJERCICIO LLEVA SUS RÓTULOS ═══════════════════════════════
 *
 * Hubo una sola cabecera para toda la hoja —«Objetivo | Hizo» y debajo «# reps
 * rir kg reps rir»— y era mejor que las dieciocho de antes, pero seguía
 * fallando por lo mismo, solo que más abajo: en el ejercicio séptimo tienes
 * SEIS casillas idénticas de tres caracteres y el rótulo que las nombra a
 * seiscientos píxeles de desplazamiento. El dueño: «no se entiende del todo
 * qué va dónde».
 *
 * Ahora cada ejercicio lleva su propia línea de rótulos —una, de nueve
 * píxeles— y las dos mitades están separadas por una COSTURA que baja por toda
 * su tabla. No hay leyenda encima: la retiró el dueño («no tiene sentido cuando
 * no pautas tú los kg, sobra») y no hacía falta, porque la costura y los
 * rótulos de cada ejercicio ya dicen dónde va cada cosa.
 *
 * Lo pedido conserva su casilla siempre; lo hecho es un renglón hasta que hay
 * algo escrito. Esa diferencia de superficie es la que separa las dos mitades
 * sin gastar tinta.
 *
 * Recibe exactamente las mismas props que `ExerciseList`, para que el editor
 * elija una u otra según el ancho sin cambiar nada más.
 */
/** El mínimo del rango objetivo: «8-10» → 8. */
const minimoDe = (targetReps) => toNum(String(targetReps ?? '').split(/[-–]/)[0]);

/* Las dos mitades, y el mismo orden en las dos: kg, reps, rir. La simetría no
   es estética — es lo que deja comparar en horizontal sin contar columnas. */
/* `pautable` dice que la columna solo existe si esta hoja la usa (ver
   `conCampo`); `siempre` es la puerta por la que el protocolo del cliente puede
   dejar una puesta de entrada aunque esté vacía. Las repeticiones no llevan
   ninguna de las dos: son el objetivo que define una serie. */
const CAMPOS_PIDES = [
  { key: 'targetKg', label: 'kg', mode: 'decimal', pista: '', opcional: true, pautable: true },
  { key: 'targetReps', label: 'reps', mode: 'text', pista: '8-10' },
  { key: 'targetRir', label: 'rir', mode: 'numeric', pista: '2', pautable: true },
];
const CAMPOS_HECHO = [
  { key: 'kg', label: 'kg', mode: 'decimal' },
  { key: 'reps', label: 'reps', mode: 'numeric' },
  { key: 'rir', label: 'rir', mode: 'numeric' },
];
/* Y lo que se anota en una tanda de remate: kilos y repeticiones. RIR no: una
   bajada y un rest-pause van al fallo por definición, así que la columna solo
   podría llevar un cero repetido. */
const SUBCAMPOS = CAMPOS_HECHO.filter((c) => c.key !== 'rir');

/*
  ══ LOS DESCANSOS QUE SE PAUTAN ═══════════════════════════════════════════
  Un campo numérico en segundos obliga a saber que 2 min son 120 y a teclear
  tres cifras por ejercicio. Un entrenador pauta seis o siete descansos en toda
  su vida, así que es una ELECCIÓN y no una redacción: la lista de siempre, más
  «sin pautar» a la cabeza para poder quitarlo.

  Los valores son segundos porque así vive el dato (`exercise.restSeconds`) y
  así lo lee el portal del cliente para su cuenta atrás; lo que se enseña lo
  compone `restLabel`, que es quien sabe decir «90 s» y «2 min».
*/
const DESCANSOS = [45, 60, 75, 90, 120, 150, 180, 240];

/*
  La celda vacía se queda VACÍA. El relleno era una raya, y las tres columnas
  de «Hizo» de un microciclo sin registrar son doce rayas por ejercicio: sobre
  cinco ejercicios, sesenta guiones alineados en tres columnas que se leen como
  un dibujo antes que como una tabla. La casilla hundida ya dice que ahí se
  escribe y que ahí no hay nada; la raya solo lo repite en tinta.

  Los objetivos sí conservan su pista («8-10», «2»): ahí el relleno enseña el
  FORMATO de lo que se espera, que no es evidente.
*/
const Celda = ({ value, placeholder = '', mode = 'numeric', tone = '', label, onChange }) => (
  <input
    type="text"
    inputMode={mode}
    className={`hoja-celda${tone ? ` ${tone}` : ''}`}
    value={value ?? ''}
    placeholder={placeholder}
    aria-label={label}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const hoja = e.currentTarget.closest('.hoja');
      const campos = [...(hoja?.querySelectorAll('input.hoja-celda') || [])];
      const siguiente = campos[campos.indexOf(e.currentTarget) + 1];
      if (siguiente) siguiente.focus();
      else e.currentTarget.blur();
    }}
  />
);

export const HojaDeSeries = ({
  exercises,
  emptyMessage = 'Este día todavía no tiene ejercicios. Añade el primero abajo.',
  onMove,
  onRemove,
  onSetChange,
  onAddSet,
  onRemoveSet,
  onNoteChange,
  showRir = false,
  showNotes = false,
  focusedId = null,
  onFocusExercise = null,
  /* La excepción de este microciclo sobre un ejercicio, si la hay, y sus dos
     salidas. Como en toda la casa: cada cosa que se puede hacer aparece si —y
     solo si— llega su manejador. */
  excepcionDe = null,
  onRemoveOnly = null,
  onSacarDeLaPlantilla = null,
  tramoDe = null,
  onAlargar = null,
  onVolverAlBloque = null,
  onAplicarAlBloque = null,
  /* La gramática de serie —descanso entre series y remate de la última— desde
     la propia hoja. Vivía solo en la ventana «Descansos, técnicas y
     alternativas», dentro del «···»: el dato existía y se podía leer en el
     renglón del ejercicio, pero para cambiarlo había que salir de la hoja. El
     dueño: «has de incluir en este apartado la opción de poner tiempo de
     descanso». Como todo en esta casa: solo aparece si llega su manejador. */
  onGramatica = null,
  /* El remate de UNA serie: `(exerciseId, indiceDeLaSerie, tecnica | null)`.
     Sin él la hoja enseña los remates pautados y no deja tocarlos. */
  onTecnica = null,
}) => {
  const [notaAbierta, setNotaAbierta] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  /* Abrir a mano una columna de objetivo que esta hoja todavía no pauta. Es
     estado de PANTALLA y no dato: en cuanto se escribe el primer valor, la
     columna se sostiene sola y esto deja de importar. Ver `OBJETIVOS`. */
  const [aMano, setAMano] = useState({});

  if (exercises.length === 0) {
    return <p className="t-sm t-secondary hoja-vacia">{emptyMessage}</p>;
  }

  /*
    ══ CADA OBJETIVO SE PAUTA SI SE QUIERE, Y SU COLUMNA EXISTE SI SE PAUTA ══

    «Tanto kg como reps como rir se deberían poder pautar si se quiere.» Los
    tres eran tres reglas distintas y ninguna era esa:

      · kg   — columna fija en todas las hojas. Medido sobre un bloque entero:
               80 casillas y CERO escritas. De ahí «yo sigo viendo kg pautados».
      · reps — columna fija, y esta sí se usa siempre: es el objetivo normal.
      · rir  — encendido o apagado por el PROTOCOLO del cliente, o sea una
               decisión que se toma en otra pantalla, otro día, para todas sus
               hojas a la vez. Puesto, la columna salía vacía en las hojas donde
               no se pauta; quitado, no había forma de pautarlo en la que sí.

    Ahora la regla es una sola y la manda el CONTENIDO: la columna está si algo
    de esta hoja la usa. Basta una serie con valor para que la columna esté en
    todos sus ejercicios —han de cuadrar, es una tabla—, y para escribir el
    primero está `aMano`, que la abre sin guardar nada.

    `showRir` no desaparece: el protocolo sigue pudiendo dejar el RIR puesto de
    entrada para quien programa así siempre. Lo que ya no hace es IMPEDIRLO.

    `targetReps` no lleva `pautable`: el rango de repeticiones es el objetivo
    que define una serie, y una hoja sin él no es una hoja.
  */
  const pautado = (key) =>
    exercises.some((ex) => (ex.sets || []).some((s) => String(s?.[key] ?? '').trim() !== ''));
  const conCampo = (c) =>
    !c.pautable || (c.key === 'targetRir' && showRir) || pautado(c.key) || Boolean(aMano[c.key]);
  const campos = CAMPOS_PIDES.filter(conCampo);
  const conKg = campos.some((c) => c.key === 'targetKg');
  const conRir = campos.some((c) => c.key === 'targetRir');
  /* Los que faltan, para ofrecerlos: `+ kg`, `+ rir`. */
  const porPautar = CAMPOS_PIDES.filter((c) => c.pautable && !conCampo(c));
  const columnas = `${conRir ? 'is-rir' : 'is-sin-rir'}${conKg ? '' : ' is-sin-kg'}`;
  /* A1/A2, derivado de la posición. La superserie se decide al escribir el
     bloque; aquí —el plan de un microciclo— se lee. */
  const marcasSS = supersetLabels(exercises);

  return (
    <div className="hoja">
      {/*
        ══ NO HAY LEYENDA, Y ES A PROPÓSITO ══════════════════════════════════
        Aquí vivió un renglón —«lo que pides | lo que hizo»— sobre la retícula
        de la tabla. El dueño lo retiró el 9 sep: «no tiene mucho sentido
        cuando no pautas tú los kg, sobra». Y es exacto: pautar el peso es la
        excepción, así que la mitad izquierda no siempre es algo que se pida —
        muchas veces es solo el rango de repeticiones— y la palabra prometía
        una simetría que la hoja no tiene.

        Lo que separa las dos mitades sigue en pie y no gasta un renglón: la
        COSTURA que baja por toda la tabla, los rótulos de columna de cada
        ejercicio, y la diferencia de superficie —lo pedido conserva su casilla,
        lo hecho es un renglón hasta que hay algo escrito—.
      */}
      {exercises.map((ex, index) => {
        const sets = ex.sets || [];
        const nota = ex.coachNote ?? '';
        const conNota = showNotes && (nota.length > 0 || notaAbierta === ex.id);
        const enFoco = focusedId === ex.id;
        const excepcion = excepcionDe ? excepcionDe(ex) : null;
        const descanso = restLabel(ex.restSeconds);
        return (
          <section
            key={ex.id}
            className={`hoja-ej${enFoco ? ' is-focused' : ''}${overIndex === index && dragIndex !== index ? ' is-drop-target' : ''}${dragIndex === index ? ' is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((i) => (i === index ? null : i))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== index) onMove(dragIndex, index);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onClick={onFocusExercise ? () => onFocusExercise(ex.id) : undefined}
            onFocus={onFocusExercise ? () => onFocusExercise(ex.id) : undefined}
          >
            <header className="hoja-ej-head">
              <button
                type="button"
                className="hoja-asa"
                draggable
                onDragStart={(e) => {
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = 'move';
                  /* Firefox no arranca el arrastre sin datos: sin esto, el asa
                     se puede agarrar y no pasa nada. Es la misma línea que la
                     vista de bloque ya tenía y a esta hoja le faltaba. */
                  try {
                    e.dataTransfer.setData('text/plain', ex.name);
                  } catch {
                    /* Algún navegador puede negarse a escribir en el portapapeles
                       de arrastre; el reordenado no depende del dato, solo lo
                       necesita Firefox para arrancar el gesto. */
                  }
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                /* Y con el teclado, que es la otra mitad: el arrastre del ratón
                   deja fuera a quien no lo pueda usar, y además es el camino
                   fiable cuando el gesto no arranca. Igual que en la lista del
                   teléfono (`ExerciseList`). */
                onKeyDown={(e) => {
                  if (!e.altKey || !onMove) return;
                  if (e.key === 'ArrowUp' && index > 0) {
                    e.preventDefault();
                    onMove(index, index - 1);
                  } else if (e.key === 'ArrowDown' && index < exercises.length - 1) {
                    e.preventDefault();
                    onMove(index, index + 1);
                  }
                }}
                aria-label={`Reordenar ${ex.name}. Alt y flechas para moverlo.`}
                title="Arrastra para reordenar (o Alt + ↑/↓)"
              >
                <GripVertical size={15} />
              </button>
              {/* En superserie el número de orden ES la etiqueta: A1, A2. */}
              <span className={`hoja-ej-n${marcasSS[index] ? ' is-ss' : ''}`}>{marcasSS[index] || index + 1}</span>
              <span className="hoja-ej-nombre">{ex.name}</span>
              <span className="hoja-ej-meta">
                {/* Lo que el ejercicio ES: su músculo, su peso y su plan B.
                    Va PEGADO al nombre y antes que la excepción: con los tres
                    verbos de la excepción en medio, «Pecho · 4 series» aterrizaba
                    en un sitio distinto en cada fila —a 800 px del nombre que
                    describe en unas, a 500 en otras— y la hoja no tenía columna
                    que seguir con la vista. */}
                {[
                  ex.muscle,
                  `${sets.length} ${sets.length === 1 ? 'serie' : 'series'}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {/*
                ══ EL DESCANSO Y EL REMATE, EN LA HOJA Y COMO MANDOS ═════════
                Los dos son dato desde hace tiempo (`restSeconds`, `tecnica`) y
                la hoja los IMPRIMÍA —«última con myo-reps · descanso 90 s»—
                pero en tinta muerta: para tocarlos había que abrir el «···», y
                de ahí una ventana con el plan del bloque. Tres gestos y salir
                de la hoja para cambiar un número que se lee en la hoja.

                Ahora son dos chapas en el renglón del ejercicio, con la ley de
                siempre: puestas dicen lo que hay, vacías dicen lo que falta en
                tinta terciaria, y se pulsan para elegir. Nada de un campo
                numérico en segundos: un descanso se elige de una lista corta,
                no se redacta. Ver `DESCANSOS` y `TECNICAS`.
              */}
              {/*
                ══ EL DESCANSO SE QUEDA AQUÍ; EL REMATE SE HA IDO ABAJO ══════
                Los dos eran chapas en este renglón, y solo uno de los dos es
                del EJERCICIO. El descanso lo es —se descansa lo mismo entre
                todas sus series— y por eso sigue aquí. El remate no: es de UNA
                serie, y clavarlo en la última era una regla de la casa, no del
                entrenamiento. Ahora se pone en la fila que remata, con sus
                números. Ver `RemateDeLaSerie`.
              */}
              {onGramatica ? (
                <span className="hoja-ej-gramatica">
                  <MenuAcciones
                    clase={`hoja-chapa${descanso ? ' is-puesta' : ''}`}
                    ariaLabel={`Descanso entre series de ${ex.name}`}
                    sinFlecha
                    label={descanso ? `descanso ${descanso}` : 'descanso'}
                    items={[
                      { label: 'Sin pautar', on: !descanso, run: () => onGramatica(ex.id, { restSeconds: null }) },
                      null,
                      ...DESCANSOS.map((s) => ({
                        label: restLabel(s),
                        on: Number(ex.restSeconds) === s,
                        run: () => onGramatica(ex.id, { restSeconds: s }),
                      })),
                    ]}
                  />
                  {/*
                    ── Y EL VERBO QUE ABRE LOS KILOS ─────────────────────────
                    Solo mientras la hoja no pauta ninguno: en cuanto hay un
                    peso escrito la columna se sostiene sola y esta chapa
                    sobraría. Vive en el renglón del ejercicio, al lado del
                    descanso, porque es de la misma familia —lo que este
                    ejercicio pide aparte de sus repeticiones— y porque es
                    donde estás cuando decides pautarlo.

                    Y son `hoja-chapa` sin más, que ya hace justo lo que hace
                    falta: canto punteado —«esto es un hueco que puedes
                    llenar»— y en voz baja hasta que te acercas al ejercicio.
                  */}
                  {porPautar.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className="hoja-chapa"
                      title={`Pautar ${c.label === 'kg' ? 'el peso' : 'el RIR'} de cada serie en esta hoja`}
                      onClick={() => setAMano((v) => ({ ...v, [c.key]: true }))}
                    >
                      + {c.label}
                    </button>
                  ))}
                </span>
              ) : (
                descanso && <span className="hoja-ej-meta">descanso {descanso}</span>
              )}
              {/*
                ── La excepción se dice, no se pinta de rojo ──────────────────
                Este ejercicio no es el del bloque: es de esta semana. Se marca
                con el asterisco y la palabra, en tinta terciaria, y NUNCA con
                semáforo — en esta hoja el color ya significa «repeticiones por
                debajo del objetivo» y no puede tener un segundo trabajo. Además
                una excepción no es un fallo.

                ── Y sus salidas dejan de estar escritas en el renglón ────────
                Estaban las tres a la vista, en línea y detrás del nombre:
                «✱ solo B2·M9 · en lugar de Press banca  volver al bloque
                dejarlo más tiempo  aplicar al bloque». Con dos ejercicios
                cambiados eso son SEIS enlaces azules apilados en la misma
                franja, empujando cada fila a un ancho distinto.

                Es la ley que esta casa ya tiene escrita en `EscribirHoja`: lo
                que se ve siempre son las CIFRAS; los verbos que se usan en un
                ejercicio de cada diez viven en un menú. Y el menú es la propia
                chapa de la excepción, que es donde uno va a mirar cuando la ve:
                sigue diciendo qué pasa y ahora también qué hacer con ello.
              */}
              {excepcion &&
                (() => {
                  const dice = (
                    <>
                      <span className="ast" aria-hidden="true">
                        ✱
                      </span>
                      {tramoDe ? tramoDe(excepcion) : 'solo este microciclo'}
                      {excepcion.sobre && excepcion.sobre !== ex.name ? `, en lugar de ${excepcion.sobre}` : ''}
                    </>
                  );
                  /* Cada salida aparece si —y solo si— llega su manejador. El
                     `.filter(Boolean)` no es adorno: un `null` suelto en la
                     lista de `MenuAcciones` pinta un separador. */
                  const salidas = [
                    onVolverAlBloque && {
                      label: 'Volver al plan del bloque',
                      run: () => onVolverAlBloque(ex.id),
                    },
                    onAlargar && { label: 'Dejarlo más tiempo', run: () => onAlargar(ex.id) },
                    onAplicarAlBloque && {
                      label: 'Aplicarlo al bloque',
                      run: () => onAplicarAlBloque(ex.id),
                    },
                  ].filter(Boolean);

                  return salidas.length > 0 ? (
                    <MenuAcciones
                      clase="hoja-ej-excepcion"
                      ariaLabel={`Alcance del cambio en ${ex.name}`}
                      label={dice}
                      items={salidas}
                    />
                  ) : (
                    <span className="hoja-ej-excepcion is-mudo">{dice}</span>
                  );
                })()}
              <span className="hoja-ej-acciones">
                {showNotes && !conNota && (
                  <button type="button" className="btn btn-icon btn-icon-compact" title="Añadir una nota" aria-label={`Añadir una nota a ${ex.name}`} onClick={() => setNotaAbierta(ex.id)}>
                    <Quote size={13} />
                  </button>
                )}
                <button type="button" className="btn btn-icon btn-icon-compact" disabled={index === 0} aria-label={`Subir ${ex.name}`} onClick={() => onMove(index, index - 1)}>
                  <ArrowUp size={13} />
                </button>
                <button type="button" className="btn btn-icon btn-icon-compact" disabled={index === exercises.length - 1} aria-label={`Bajar ${ex.name}`} onClick={() => onMove(index, index + 1)}>
                  <ArrowDown size={13} />
                </button>
                {/*
                  ── Quitar, y hasta dónde llega ─────────────────────────────
                  Un cambio se hace para quedarse, así que quitarlo del BLOQUE
                  es lo primero y lo que se lee como la acción normal. Debajo,
                  lo puntual. Sin `onRemoveOnly` —o sobre algo que ya es una
                  excepción— no hay nada que elegir y vuelve a ser un botón.
                */}
                {onRemoveOnly && !excepcion ? (
                  <MenuAcciones
                    clase="btn btn-icon btn-icon-compact btn-icon-danger"
                    ariaLabel={`Alcance de los cambios en ${ex.name}`}
                    label={<Trash2 size={13} />}
                    items={[
                      /*
                        ── Aquí se CREA un cambio, y con su tramo ────────────
                        Faltaba la puerta: se podía quitar solo en un
                        microciclo, pero no cambiar solo en él. «Sacarlo de la
                        plantilla» copia el ejercicio tal y como está a este
                        microciclo, y a partir de ahí todo lo que se toque en
                        esta fila —series, repeticiones, el nombre— se queda
                        aquí. No cambia nada al pulsarlo: cambia dónde van a
                        caer los cambios de después, que es justo la decisión.
                      */
                      onSacarDeLaPlantilla && {
                        label: 'Cambiarlo solo este microciclo',
                        run: () => onSacarDeLaPlantilla(ex.id, { semanas: 1 }),
                      },
                      onSacarDeLaPlantilla && {
                        label: 'Cambiarlo unas semanas',
                        run: () => onSacarDeLaPlantilla(ex.id, { semanas: 3 }),
                      },
                      onSacarDeLaPlantilla && {
                        label: 'Cambiarlo de aquí en adelante',
                        run: () => onSacarDeLaPlantilla(ex.id, { semanas: null }),
                      },
                      onSacarDeLaPlantilla && null,
                      { label: 'Quitar del bloque', danger: true, run: () => onRemove(ex.id) },
                      { label: 'Quitar solo este microciclo', run: () => onRemoveOnly(ex.id) },
                    ]}
                    sinFlecha
                  />
                ) : (
                  <button type="button" className="btn btn-icon btn-icon-compact btn-icon-danger" aria-label={`Eliminar ${ex.name}`} onClick={() => onRemove(ex.id)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            </header>

            <div className={`hoja-tabla ${columnas}`} role="table" aria-label={`Series de ${ex.name}`}>
              {/*
                Los rótulos de ESTE ejercicio. Es la línea que el dueño pidió
                —«kg, reps y rir deberían ir en cada fila, no se entiende qué va
                dónde»— resuelta al nivel donde el dato deja de reconocerse: el
                ejercicio. Por serie sería repetirla cuatro veces seguidas.
              */}
              <div className="hoja-fila is-head" role="row">
                <span>#</span>
                {campos.map((c) => (
                  <span key={c.key}>{c.label}</span>
                ))}
                <span className="hoja-costura" aria-hidden="true" />
                {CAMPOS_HECHO.map((c) => (
                  <span key={c.key}>{c.label}</span>
                ))}
                <span />
                <span />
              </div>
              {sets.map((set, i) => {
                const etiqueta = `${ex.name}, serie ${i + 1}`;
                const minimo = minimoDe(set.targetReps);
                const hechas = toNum(set.reps);
                const corta = minimo !== null && hechas !== null && hechas < minimo;
                /* El remate de ESTA serie, y las tandas que cuelgan de él. */
                const remate = tecnicaDeLaSerie(ex, i);
                const subs = subseriesDe(remate);
                return (
                  <Fragment key={i}>
                  <div
                    className={`hoja-fila${isSetLogged(set) ? ' is-hecha' : ''}${remate ? ' is-remate' : ''}`}
                    role="row"
                  >
                    <span className="hoja-num">{i + 1}</span>
                    {campos.map((c) => (
                      <Celda
                        key={c.key}
                        value={set[c.key]}
                        placeholder={c.pista}
                        mode={c.mode}
                        /*
                          El peso es el único objetivo OPCIONAL —vacío significa
                          «a criterio del cliente», que es lo normal— así que
                          vacío se dibuja como un renglón y no como una casilla.
                          Con caja, una hoja donde nadie pauta pesos son cuatro
                          cajas grises vacías por ejercicio, que es la avería que
                          esta hoja ya arregló una vez en la mitad derecha.
                        */
                        tone={`is-pide${c.opcional && String(set[c.key] ?? '') === '' ? ' is-vacia' : ''}`}
                        label={`${etiqueta}: ${c.label} que pides`}
                        onChange={(v) => onSetChange(ex.id, i, c.key, v)}
                      />
                    ))}
                    {/*
                      LA COSTURA. Una columna de un píxel, presente en la
                      cabecera, en cada serie y en cada subserie, así que la
                      línea que parte lo pedido de lo hecho baja recta por toda
                      la tabla. Un `border-left` en la primera celda de la
                      derecha habría teñido el canto de un campo de escritura;
                      esto no es de ningún campo, es de la tabla.
                    */}
                    <span className="hoja-costura" aria-hidden="true" />
                    {/*
                      ── LO QUE HIZO NO SE PINTA COMO LO QUE SE PIDE ─────────
                      Las tres columnas de «Hizo» las escribe el CLIENTE desde
                      su teléfono; el entrenador las toca para corregir una vez
                      de cada veinte. Con la casilla hundida en las cinco
                      columnas, un microciclo sin registrar son sesenta cajas
                      grises por hoja y la pantalla entera se lee como un
                      formulario en blanco: «me da la sensación de ser una hoja
                      muy plana, sosa».

                      Vacías son un renglón —el sitio donde caerá el dato, con
                      su raya—; escritas o al pasar por encima recuperan la
                      caja. El plan, que es lo que el entrenador SÍ escribe,
                      conserva la suya en las dos columnas de la izquierda: la
                      diferencia de superficie es la que separa lo pedido de lo
                      hecho sin gastar un rótulo más.
                    */}
                    {CAMPOS_HECHO.map((c) => (
                      <Celda
                        key={c.key}
                        value={set[c.key]}
                        mode={c.mode}
                        tone={[
                          'is-hecho',
                          String(set[c.key] ?? '') === '' ? 'is-vacia' : '',
                          c.key === 'reps' && corta ? 'is-corta' : '',
                          c.key === 'reps' && !corta && isSetLogged(set) ? 'is-cumple' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        label={`${etiqueta}: ${c.label} hechos`}
                        onChange={(v) => onSetChange(ex.id, i, c.key, v)}
                      />
                    ))}
                    {/*
                      El remate, en la fila que remata. Solo se pauta donde se
                      escribe el plan: sin `onTecnica` —la hoja de solo lectura
                      del portal— la columna se queda vacía y las cifras siguen
                      cuadrando.
                    */}
                    {onTecnica ? (
                      <RemateDeLaSerie
                        tecnica={remate}
                        etiqueta={etiqueta}
                        onCambio={(t) => onTecnica(ex.id, i, t)}
                      />
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      className="hoja-x"
                      disabled={sets.length <= 1}
                      aria-label={`Quitar ${etiqueta}`}
                      title="Quitar serie"
                      onClick={() => onRemoveSet(ex.id, i)}
                    >
                      <X size={13} />
                    </button>
                  </div>

                  {/*
                    ══ EL REMATE SE DIBUJA DONDE PASA ══════════════════════════
                    «Que se vea bonito cuando pautas dropset o myoreps o cosas
                    así.» Estuvo en el renglón del ejercicio, a cinco filas de
                    la serie de la que hablaba, y luego al pie de la tabla. Las
                    dos veces había que acordarse de a cuál se refería.

                    Ahora cuelga de SU fila: el corchete, la pauta con sus
                    números, y debajo un renglón por tanda —«bajada 1», «bajada
                    2»— con sus casillas bajo las columnas de lo hecho. El
                    nombre de la tanda ocupa el sitio de lo pedido porque eso es
                    exactamente lo que es: lo pedido ya lo dice la pauta de
                    arriba, y aquí solo se anota lo que salió.

                    Tipografía de la hoja y no chapas de color: en esta tabla el
                    color ya significa «repeticiones por debajo del objetivo».
                  */}
                  {remate && (
                    <p className="hoja-remate" title={tecnicaSpec(remate.id)?.ayuda}>
                      <span className="hoja-remate-corchete" aria-hidden="true" />
                      {tecnicaFrase(remate)}
                    </p>
                  )}
                  {Array.from({ length: subs }, (_, j) => {
                    const extra = set.extras?.[j] || {};
                    const nombre = nombreDeSubserie(remate, j);
                    return (
                      <div className="hoja-fila is-sub" role="row" key={`sub-${j}`}>
                        <span className="hoja-num" aria-hidden="true" />
                        <span className="hoja-sub-nombre">{nombre}</span>
                        <span className="hoja-costura" aria-hidden="true" />
                        {SUBCAMPOS.map((c) => (
                          <Celda
                            key={c.key}
                            value={extra[c.key]}
                            mode={c.mode}
                            tone={`is-hecho${String(extra[c.key] ?? '') === '' ? ' is-vacia' : ''}`}
                            label={`${etiqueta}, ${nombre}: ${c.label}`}
                            onChange={(v) => onSetChange(ex.id, i, c.key, v, j)}
                          />
                        ))}
                        <span />
                        <span />
                        <span />
                      </div>
                    );
                  })}
                  </Fragment>
                );
              })}
              <button type="button" className="hoja-mas" onClick={() => onAddSet(ex.id)}>
                <Plus size={13} /> serie
              </button>
            </div>

            {conNota && (
              <label className="hoja-nota">
                <span className="section-label">
                  Nota para el cliente
                </span>
                <textarea
                  className="textarea"
                  rows={2}
                  autoFocus={notaAbierta === ex.id && nota.length === 0}
                  placeholder="La verá junto al ejercicio. Ej: el codo pegado al cuerpo."
                  value={nota}
                  onChange={(e) => onNoteChange(ex.id, e.target.value)}
                  onBlur={() => !nota.trim() && setNotaAbierta(null)}
                />
              </label>
            )}
          </section>
        );
      })}
    </div>
  );
};
