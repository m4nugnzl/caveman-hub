import { Fragment, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, Plus, Quote, Trash2 } from 'lucide-react';

import {
  nombreDeSubserie,
  restLabel,
  seriesGrammar,
  subseriesDe,
  supersetLabels,
  tecnicaDeLaSerie,
  tecnicaFrase,
  tecnicaSpec,
} from '@/domain/training';
import { e1rm, isRecord, isSetLogged, previousSetKey } from '@/domain/sessions';
import { MarcaFicha } from '@/components/ui/MarcaFicha';

/* `MarcaFicha` vive en `ui/MarcaFicha.jsx` desde el 13 de septiembre: la hoja
   de una columna del portal (`Client/HojaDelCliente`) pintaba el NOMBRE entero
   en azul para abrir lo mismo, y una marca con dos dibujos distintos en dos
   pantallas es dos gramáticas. El porqué del glifo está allí. */

/**
 * Qué serie del ejercicio es EL récord de hoy, si lo hay: la mejor de las que
 * superan el listón. Una sola por ejercicio y sesión — con una progresión
 * lineal cada serie bate a la de la semana pasada, y veinte «PR» seguidos
 * dejan de significar nada.
 */
const recordSetIndex = (exercise, bestSets) => {
  const best = bestSets?.get(exercise.name);
  if (!best) return -1;
  let idx = -1;
  let top = 0;
  (exercise.sets || []).forEach((set, i) => {
    if (!isSetLogged(set) || !isRecord(set, best)) return;
    const marca = e1rm(set.kg, set.reps);
    if (marca > top) { top = marca; idx = i; }
  });
  return idx;
};
import { useEsTelefono } from '@/lib/useMediaQuery';
import { Modal } from '@/components/ui/Modal';
import { SetCell, SetRow, SetRowHead, SetSubRow } from './SetCell';

/**
 * EL GALÓN: lo que te piden en este ejercicio, en una línea.
 *
 *     4 series · 6-8 reps · RIR 2
 *
 * Los objetivos distintos se enumeran, que es lo único que puede decirse de un
 * ejercicio entero sin mentir: una pirámide es «6-8 / 8-10», y un rango único
 * escrito para todas las series borraría esa información (ver `SetCell`).
 *
 * ── Un solo galón para los dos sitios ──────────────────────────────────────
 * Lo usan el índice del teléfono del entrenador y el renglón del cliente
 * mientras registra. Eran dos formatos —«4 series × 8-10 · RIR 2» y «4
 * series»— para la misma frase, y dos formas de decir lo mismo acaban
 * divergiendo el día que se añada el tempo.
 *
 * ── Y por qué dice «reps» ──────────────────────────────────────────────────
 * Porque en el renglón del cliente esta línea convive con «descanso 90 s» y
 * con los kilos de las casillas: un «6-8» suelto entre cifras con unidad se
 * puede leer como cualquier cosa. Es la misma palabra que llevan las casillas.
 */
/**
 * ¿PIDEN LO MISMO TODAS LAS SERIES DE ESTE EJERCICIO?
 *
 * Con un sí, el galón del ejercicio —«4 series · 6-8 reps · RIR 2»— ya lo ha
 * dicho entero y el pie de cada serie no tiene que repetirlo. Con un no —una
 * pirámide, una rampa de kilos— cada serie pide lo suyo y su pie es el único
 * sitio donde eso cabe.
 *
 * Mira los TRES campos que se pautan, y no solo las repeticiones: «100 kg · 6-8»
 * y «110 kg · 6-8» son dos pautas distintas aunque el rango coincida, y el
 * galón no dice los kilos.
 *
 * Ver `sinPauta` en `SetCell`.
 */
const pautaUniforme = (exercise) => {
  const sets = exercise.sets || [];
  if (sets.length < 2) return false;
  const firma = (s) => `${s.targetKg ?? ''}|${s.targetReps ?? ''}|${s.targetRir ?? ''}`;
  return sets.every((s) => firma(s) === firma(sets[0]));
};

const galonDeSeries = (exercise, showRir) => {
  const sets = exercise.sets || [];
  if (sets.length === 0) return null;
  const objetivos = [...new Set(sets.map((s) => String(s.targetReps ?? '').trim()).filter(Boolean))];
  const rirs = showRir
    ? [...new Set(sets.map((s) => String(s.targetRir ?? '').trim()).filter(Boolean))]
    : [];
  return [
    `${sets.length} ${sets.length === 1 ? 'serie' : 'series'}`,
    objetivos.length > 0 ? `${objetivos.join(' / ')} reps` : null,
    rirs.length > 0 ? `RIR ${rirs.join(' / ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
};

/**
 * Lista de ejercicios del día, reordenable.
 *
 * El drag & drop arranca SOLO desde el asa: cuando la fila entera era
 * arrastrable, el gesto competía con hacer clic en los inputs y en los botones,
 * y a veces no se podía escribir en un campo. Hay además reordenación por
 * teclado (Alt + flechas sobre el asa), porque el arrastre con ratón deja fuera
 * a quien no lo pueda usar.
 *
 * @param canEditStructure  true para el entrenador (reordenar, borrar, añadir
 *   series, definir objetivos). El cliente usa la MISMA lista con esto en false:
 *   registra sus kg, reps y RIR, pero no cambia el programa que le han montado.
 * @param previousSets  Mapa de `domain/sessions.previousSetsBefore`: lo que se
 *   levantó en cada serie la vez anterior. Solo se usa registrando — programando
 *   estorbaría, porque ahí las cifras son el plan y no la ejecución.
 * @param showNotes  Si el módulo de indicaciones está encendido para este
 *   cliente. Con él, el entrenador puede dejar una nota en un ejercicio suelto y
 *   quien entrena la lee ahí mismo. Es el MISMO interruptor que la indicación del
 *   día (`coachNote` del protocolo): las dos son lo mismo a distinta altura, y
 *   dos casillas para lo mismo solo harían pensar que son cosas distintas.
 */

export const ExerciseList = ({
  exercises,
  canEditStructure = true,
  emptyMessage = 'Este día todavía no tiene ejercicios. Añade el primero abajo.',
  onMove,
  onRemove,
  onSetChange,
  onAddSet,
  onRemoveSet,
  onNoteChange,
  showRir = false,
  showNotes = false,
  previousSets = null,
  /* La mejor marca de cada ejercicio (`domain/sessions.bestSetsBefore`) y el
     gesto de «igual que la vez anterior»: los dos solo registrando. */
  bestSets = null,
  onConfirmSet = null,
  /* El ejercicio «en foco»: el que enseña su histórico en la columna de al lado.
     Se marca al pulsar cualquier parte de su fila que no sea un control. */
  focusedId = null,
  onFocusExercise = null,
  /*
    ── La ficha del ejercicio, y quién la pasa ───────────────────────────────
    `sheetOf(name)` devuelve `{ videoUrl, cue }` o `null`, y es lo que decide si
    el renglón lleva marca. Los DOS son opcionales y solo los pasa el portal del
    cliente (`ClientRoutine`): en la hoja del entrenador no se pinta nada, que
    es una orden vigente —ni miniaturas ni fotos en las hojas— y aquí se cumple
    sola, sin una condición por audiencia que haya que acordarse de mantener.
  */
  sheetOf = null,
  onOpenSheet = null,
  /*
    ── El foco de un campo, para la pastilla del pulgar ────────────────────
    Solo lo pasa el portal del cliente. Llega con `{ field, plan, antes }` y se
    le añade de qué serie es, que es lo único que esta lista sabe y la fila no.
  */
  onCampoFoco = null,
}) => {
  const esTelefono = useEsTelefono();
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  /* Qué ejercicio tiene su hoja abierta (modo índice del teléfono). Se guarda
     el id y no el objeto: los datos frescos llegan por props en cada render. */
  const [abierto, setAbierto] = useState(null);
  /* Lo último que enseñó la hoja, retenido para su salida animada: al cerrar
     (o al eliminar el ejercicio) el dato vivo ya no está, y sin esta copia la
     hoja se iría vacía a mitad de animación. */
  const ultimaFicha = useRef(null);
  /*
    Qué ejercicio tiene el campo de nota abierto SIN tener nota todavía.

    Es lo único que hace falta guardar aquí: un ejercicio con nota escrita la
    enseña siempre —no se esconde lo que ya has dicho— y uno sin nota no ocupa
    una sola línea hasta que se pide. Así la nota es de verdad opcional: quien no
    las use no ve nada de más, y quien las use tiene el campo a un clic.
  */
  const [notaAbierta, setNotaAbierta] = useState(null);

  const handleDrop = (event, index) => {
    event.preventDefault();
    if (dragIndex !== null && dragIndex !== index) onMove(dragIndex, index);
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleKeyDown = (event, index) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      onMove(index, index - 1);
    } else if (event.key === 'ArrowDown' && index < exercises.length - 1) {
      event.preventDefault();
      onMove(index, index + 1);
    }
  };

  /* Sin confirmación: borrar un ejercicio tiene ahora inverso —el aviso con
     «Deshacer» que enseña quien nos pasa `onRemove`— y lo frecuente se deshace,
     no se confirma (la regla, en `ui/ToastProvider`). */
  const askRemove = (exercise) => onRemove(exercise.id);

  if (exercises.length === 0) {
    return (
      <p className="t-sm t-secondary" style={{ padding: 'var(--s4) 0' }}>
        {emptyMessage}
      </p>
    );
  }

  /* A1/A2, derivado de la posición: la superserie se decide en el bloque y
     aquí —donde se ejecuta o se registra— se lee. */
  const marcasSS = supersetLabels(exercises);

  /*
    ══ En el teléfono, programar es ÍNDICE + FICHA ═══════════════════════════
    El carril con todo abierto son ~30 casillas editables a la vez: en 390 px
    cada ejercicio ocupaba media pantalla y el día entero no se podía LEER.
    Aquí el día es una fila por ejercicio —nombre, músculo, «4 series × 8-10»—
    y tocar una abre su hoja con las series en grande, la nota y las acciones.
    Es el reparto de cualquier editor móvil que funciona: la lista para ver,
    la hoja para tocar.

    Solo programando y solo en el teléfono: el registro del cliente ya es una
    tabla pensada para el gimnasio, y en escritorio el carril completo es
    justo lo que permite comparar estructuras entre ejercicios.
  */
  if (canEditStructure && esTelefono) {
    const idxVivo = exercises.findIndex((e) => e.id === abierto);
    const vivo = idxVivo >= 0 ? exercises[idxVivo] : null;
    if (vivo) ultimaFicha.current = { ex: vivo, idx: idxVivo };
    /* Con la hoja abierta, el dato vivo; cerrándose, la copia retenida. */
    const abiertoEx = vivo || ultimaFicha.current?.ex || null;
    const idx = vivo ? idxVivo : (ultimaFicha.current?.idx ?? -1);

    return (
      <>
        <ul className="col gap-2" style={{ listStyle: 'none' }}>
          {exercises.map((exercise, index) => {
            return (
              <li key={exercise.id}>
                <button type="button" className="exercise-row" onClick={() => setAbierto(exercise.id)}>
                  <span className={`exercise-index${marcasSS[index] ? ' is-ss' : ''}`}>
                    {marcasSS[index] || index + 1}
                  </span>
                  <span className="exercise-row-name">
                    <span className="name">{exercise.name}</span>
                    <span className="sum">
                      {[exercise.muscle, galonDeSeries(exercise, showRir), seriesGrammar(exercise)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <ChevronRight size={15} className="chevron" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>

        {abiertoEx && (
          <Modal
            open={Boolean(vivo)}
            title={abiertoEx.name}
            onClose={() => setAbierto(null)}
            footer={
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={idx === 0}
                  onClick={() => onMove(idx, idx - 1)}
                >
                  <ArrowUp size={15} /> Subir
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={idx === exercises.length - 1}
                  onClick={() => onMove(idx, idx + 1)}
                >
                  <ArrowDown size={15} /> Bajar
                </button>
                {/* La hoja se cierra al borrar, y sin preguntar: el aviso con
                    «Deshacer» cubre la equivocación mejor que un diálogo. */}
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    const { id } = abiertoEx;
                    setAbierto(null);
                    onRemove(id);
                  }}
                >
                  <Trash2 size={15} /> Quitar
                </button>
              </>
            }
          >
            <div className="col gap-4">
              {/* `order: 0` en línea: la regla móvil de `.set-lane` (order 10,
                  pensada para la fila del escritorio que envuelve) la mandaba
                  detrás de la nota; en la ficha las series van primero. */}
              <div className="set-lane" style={{ order: 0, flexBasis: 'auto' }}>
                {(abiertoEx.sets || []).map((set, setIndex) => (
                  <SetCell
                    key={setIndex}
                    index={setIndex}
                    set={set}
                    exerciseName={abiertoEx.name}
                    canRemove={abiertoEx.sets.length > 1}
                    onChange={(field, value) => onSetChange(abiertoEx.id, setIndex, field, value)}
                    onRemove={() => onRemoveSet(abiertoEx.id, setIndex)}
                    showRir={showRir}
                  />
                ))}
                <button
                  type="button"
                  className="set-add"
                  onClick={() => onAddSet(abiertoEx.id)}
                  aria-label={`Añadir una serie a ${abiertoEx.name}`}
                  title="Añadir serie"
                >
                  <Plus size={15} />
                </button>
              </div>

              {showNotes && (
                <label className="exercise-note">
                  <span className="section-label">
                    <Quote size={13} className="icon-inline" />Nota de {abiertoEx.name}
                  </span>
                  <textarea
                    className="textarea"
                    rows={2}
                    placeholder="La verá tu cliente junto al ejercicio. Ej: el codo pegado al cuerpo."
                    value={abiertoEx.coachNote ?? ''}
                    onChange={(event) => onNoteChange(abiertoEx.id, event.target.value)}
                  />
                </label>
              )}
            </div>
          </Modal>
        )}
      </>
    );
  }

  return (
    <ul className="col gap-2" style={{ listStyle: 'none' }}>
      {exercises.map((exercise, index) => {
        /* La referencia de la primera serie sirve para saber SI hay vez
           anterior y de qué semana. Las cifras de cada serie van en su campo. */
        const antes = previousSets?.get(previousSetKey(exercise.name, 0)) || null;
        const nota = exercise.coachNote ?? '';
        /* El galón del teléfono: lo que te piden en este ejercicio. Registrando
           se lleva dentro el descanso; programando, el descanso sigue teniendo
           su pieza y esta línea no se pinta. */
        const galon = [
          galonDeSeries(exercise, showRir),
          canEditStructure ? null : restLabel(exercise.restSeconds),
        ]
          .filter(Boolean)
          .join(' · ');
        /* Si las series de este ejercicio piden todas lo mismo, el galón de
           arriba ya lo ha dicho y el pie de cada serie se lo ahorra. */
        const mismaPauta = pautaUniforme(exercise);
        /* Con texto se enseña siempre; vacía, solo si acaban de pedirla. */
        const editandoNota = notaAbierta === exercise.id || nota.length > 0;
        return (
          <li
            key={exercise.id}
            /* El ancla de la regla de la sesión: un tramo lleva a su ejercicio,
               y para eso hace falta que el renglón tenga un sitio al que ir. Ver
               `BarraDeSesion` y el efecto del objetivo en `ClientRoutine`. */
            id={`ej-${exercise.id}`}
            className={[
              'exercise',
              /* Registrando, el ejercicio es una FICHA en columna —nombre arriba,
                 tabla debajo— en cualquier ancho. Antes era la misma fila que usa
                 el entrenador y solo se convertía en columna por debajo de 640 px,
                 con `flex-wrap` y un `order: 10`: el resultado se sostenía por dos
                 apaños que había que leer para entender por qué el nombre acababa
                 encima. Si la forma correcta es la columna, se declara. */
              canEditStructure ? '' : 'is-log',
              focusedId === exercise.id ? 'is-focused' : '',
              overIndex === index && dragIndex !== index ? 'is-drop-target' : '',
              dragIndex === index ? 'is-dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((i) => (i === index ? null : i))}
            onDrop={(e) => handleDrop(e, index)}
            onClick={onFocusExercise ? () => onFocusExercise(exercise.id) : undefined}
            onFocus={onFocusExercise ? () => onFocusExercise(exercise.id) : undefined}
          >
            {canEditStructure && (
              <>
                <button
                  type="button"
                  className="drag-handle"
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  aria-label={`Reordenar ${exercise.name}. Alt y flechas para mover.`}
                  title="Arrastra para reordenar (o Alt + ↑/↓)"
                >
                  <GripVertical size={15} />
                </button>

                {/* En táctil el arrastre de HTML5 no dispara: estas flechas son
                    EL camino para reordenar, no una alternativa. Solo se pintan
                    ahí (ver `.touch-reorder`), donde además el asa se esconde. */}
                <span className="touch-reorder">
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-compact"
                    disabled={index === 0}
                    onClick={() => onMove(index, index - 1)}
                    aria-label={`Subir ${exercise.name}`}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-compact"
                    disabled={index === exercises.length - 1}
                    onClick={() => onMove(index, index + 1)}
                    aria-label={`Bajar ${exercise.name}`}
                  >
                    <ArrowDown size={15} />
                  </button>
                </span>
              </>
            )}

            {/*
              ══ El número del ejercicio ya no lleva ocho colores ══════════════

              Llevaba `setColor(index)`: una paleta de ocho tintes literales que
              se repartía por POSICIÓN en la lista. Verde el primero, cian el
              segundo, violeta el tercero. El color no distinguía nada que el
              propio número no dijera ya, y en el portal del cliente —que usa
              esta misma lista para registrar— convertía la pantalla principal
              en ocho tintes que no significan nada.

              Lo único que de verdad distingue a un renglón aquí es la
              SUPERSERIE, y eso ya lo dice su marca («A1», «A2»). Se le da peso,
              no color. Ver `ley del color` en tokens.css: el cromo no tiene
              color salvo el acento, y el acento solo va donde se toca.
            */}
            <span
              className={`exercise-index${marcasSS[index] ? ' is-ss' : ''}`}
              title={marcasSS[index] ? 'En superserie: se alterna con el ejercicio enlazado, sin descanso entre ellos' : undefined}
            >
              {marcasSS[index] || index + 1}
            </span>

            {/*
              Nombre y músculo. Nada más.
              --------------------------------------------------------------
              Aquí hubo un campo con el objetivo de repeticiones que parecía
              informativo y escribía en TODAS las series a la vez, y después un
              resumen de solo lectura. Los dos sobraban: el objetivo vive en cada
              serie —una pirámide es 6-8 / 8-10 / 8-10 y solo se puede decir celda
              a celda— y repetirlo aquí solo servía para confundir.
            */}
            <div className="exercise-name">
              {/* El nombre y su marca, en fila. El envoltorio existe porque
                  `.name` trunca con `text-overflow: ellipsis`: una marca metida
                  DENTRO de ese mismo elemento se recorta con el texto. */}
              <div className="name-linea">
                <div className="name" title={exercise.name}>
                  {exercise.name}
                </div>
                <MarcaFicha
                  ficha={sheetOf?.(exercise.name)}
                  /* El EJERCICIO entero y no su nombre: la nota del cliente
                     cuelga de esta entrada de la sesión, así que hace falta su
                     id. La ficha de su entrenador sí se busca por nombre (0100),
                     y eso no cambia. */
                  onOpen={() => onOpenSheet?.(exercise)}
                />
              </div>
              <div className="exercise-meta">
                <span className="muscle ej-musculo">{exercise.muscle}</span>
                {/*
                  ── EL GALÓN, y solo en el teléfono ─────────────────────────
                  «4 series · 6-8 reps · RIR 2»: lo que te piden en este
                  ejercicio, que en la tabla ancha se lee de un vistazo —están
                  las cinco filas a la vista, cada una con su columna «obj»— y
                  en 390 px no, porque ahí cada ejercicio ocupa más de una
                  pantalla y la columna del objetivo bajó al pie de cada serie.

                  Ocupa el hueco de «la vez anterior · semana 9», que ahora se
                  dice en ese mismo pie. Lo esconde el CSS.

                  Y el rango sigue diciéndose ADEMÁS en cada serie, a propósito:
                  una pirámide tiene un objetivo por serie, y para cuando vas
                  por la cuarta este renglón hace rato que se fue por arriba.
                */}
                {/* El descanso viaja DENTRO del galón cuando se registra, y no
                    en la pieza de al lado: es la cuarta cosa que te piden («4
                    series · 6-8 reps · RIR 2 · 90 s») y separarla dejaría dos
                    frases pegadas sin nada entre medias. En la tabla ancha el
                    galón no se pinta y el descanso sigue en su sitio. */}
                {galon && <span className="muscle ej-series">{galon}</span>}
                {/*
                  ── AQUÍ SOLO EL DESCANSO ─────────────────────────────────
                  Esta línea imprimía la gramática entera —«última con bajada
                  −20 % · descanso 90 s»— y desde que el remate se dibuja en su
                  propia serie, unas líneas más abajo, eso es decirlo dos veces.
                  Medido en un teléfono de 390 px: con las tres piezas («pecho»,
                  la gramática y «la vez anterior · semana 9») ninguna cabía y
                  las tres salían con puntos suspensivos.

                  El descanso se queda porque NO se dibuja en ninguna otra
                  parte de esta lista: es del ejercicio entero.
                */}
                {restLabel(exercise.restSeconds) && (
                  <span className="muscle ej-descanso">descanso {restLabel(exercise.restSeconds)}</span>
                )}
                {/* De cuándo son las cifras apagadas de los campos. Sin esto, un
                    número gris dentro de una casilla vacía no dice nada. */}
                {antes && (
                  <span className="prev-hint">
                    la vez anterior · semana {antes.weekNumber}
                  </span>
                )}
                {/*
                  Pedir la nota vive AQUÍ, con el nombre, y no entre los botones
                  de la derecha: esos son acciones sobre la estructura —reordenar,
                  borrar— y esto es decir algo sobre este ejercicio. Además así no
                  hay un icono más compitiendo con la papelera en cada fila.

                  Desaparece en cuanto hay nota, porque entonces el campo ya está
                  abierto debajo: un botón que no puede hacer nada es peor que no
                  tenerlo.
                */}
                {showNotes && canEditStructure && !editandoNota && (
                  <button
                    type="button"
                    className="note-add"
                    onClick={() => setNotaAbierta(exercise.id)}
                    aria-label={`Añadir una nota a ${exercise.name}`}
                  >
                    + nota
                  </button>
                )}
              </div>
            </div>

            {/*
              Las series cambian de FORMA según el trabajo, no según el ancho.
              ------------------------------------------------------------------
              Programar (entrenador) es comparar estructuras entre ejercicios y
              añadir o quitar piezas: cada serie es una tarjeta autónoma en un
              carril que envuelve.

              Registrar (cliente) es escribir doce números seguidos de un mismo
              ejercicio: eso es una tabla, con las etiquetas UNA vez arriba. Ver
              `SetRow` para el porqué largo.
            */}
            {canEditStructure ? (
              <div className="set-lane">
                {(exercise.sets || []).map((set, setIndex) => (
                  <SetCell
                    key={setIndex}
                    index={setIndex}
                    set={set}
                    exerciseName={exercise.name}
                    canRemove={exercise.sets.length > 1}
                    onChange={(field, value) => onSetChange(exercise.id, setIndex, field, value)}
                    onRemove={() => onRemoveSet(exercise.id, setIndex)}
                    showRir={showRir}
                  />
                ))}
                <button
                  type="button"
                  className="set-add"
                  onClick={() => onAddSet(exercise.id)}
                  title="Añadir serie"
                  aria-label={`Añadir una serie a ${exercise.name}`}
                >
                  <Plus size={15} />
                </button>
              </div>
            ) : (
              <div className="set-table">
                <SetRowHead />
                {(exercise.sets || []).map((set, setIndex) => {
                  /* El remate de ESTA serie y sus tandas. Ver `TECNICAS`: el
                     plan las pauta con sus números, así que aquí se sabe
                     cuántas casillas hacen falta. */
                  const remate = tecnicaDeLaSerie(exercise, setIndex);
                  const subs = subseriesDe(remate);
                  return (
                    <Fragment key={setIndex}>
                      <SetRow
                        index={setIndex}
                        set={set}
                        exerciseName={exercise.name}
                        onChange={(field, value) => onSetChange(exercise.id, setIndex, field, value)}
                        showRir={showRir}
                        previous={previousSets?.get(previousSetKey(exercise.name, setIndex))}
                        record={setIndex === recordSetIndex(exercise, bestSets)}
                        onConfirm={onConfirmSet ? (antes) => onConfirmSet(exercise.id, setIndex, antes) : null}
                        /* Con las cuatro series pidiendo lo mismo, el pie no
                           repite lo que el galón ya dice. Ver `pautaUniforme`. */
                        sinPauta={mismaPauta}
                        onFoco={
                          onCampoFoco
                            ? (info) =>
                                onCampoFoco(info && { ...info, exId: exercise.id, setIndex })
                            : null
                        }
                      />
                      {remate && (
                        <p className="set-remate" title={tecnicaSpec(remate.id)?.ayuda}>
                          {tecnicaFrase(remate)}
                        </p>
                      )}
                      {Array.from({ length: subs }, (_, j) => (
                        <SetSubRow
                          key={`sub-${j}`}
                          nombre={nombreDeSubserie(remate, j)}
                          extra={set.extras?.[j]}
                          label={`${exercise.name}, serie ${setIndex + 1}, ${nombreDeSubserie(remate, j)}`}
                          onChange={(field, value) => onSetChange(exercise.id, setIndex, field, value, j)}
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </div>
            )}

            {canEditStructure && (
              <button
                type="button"
                className="btn btn-icon btn-icon-danger shrink-0"
                onClick={() => askRemove(exercise)}
                aria-label={`Quitar ${exercise.name}`}
              >
                <Trash2 size={15} />
              </button>
            )}

            {/*
              ══ La nota, a lo ancho y DEBAJO ═══════════════════════════════

              Es texto para leer, y el hueco que queda en la fila —entre el
              nombre y las series— da para tres palabras. Ocupando la línea
              entera se lee de un vistazo y no le quita ancho a las celdas, que
              es lo que de verdad se usa aquí.

              Se guarda mientras se escribe, como la indicación del día: no hay
              botón de guardar en ningún sitio de esta pantalla.
            */}
            {showNotes && canEditStructure && editandoNota && (
              <label className="exercise-note">
                <span className="section-label">
                  <Quote size={13} className="icon-inline" />Nota de {exercise.name}
                </span>
                <textarea
                  className="textarea"
                  rows={2}
                  autoFocus={notaAbierta === exercise.id}
                  placeholder="La verá tu cliente junto al ejercicio. Ej: el codo pegado al cuerpo."
                  value={nota}
                  onChange={(event) => onNoteChange(exercise.id, event.target.value)}
                />
              </label>
            )}

            {/* Registrando no hay campo: se lee lo que te han dicho. */}
            {showNotes && !canEditStructure && nota.trim() && (
              <div className="exercise-note is-read">
                <Quote size={13} />
                <p>{nota}</p>
              </div>
            )}

            {/* Y en el teléfono del ENTRENADOR, lo que dijo él de este
                ejercicio (`M-03`). El porqué de que vaya pegado a las series
                está en `HojaDeSeries`, que es la otra geometría de lo mismo. */}
            {canEditStructure && String(exercise.clientNote || '').trim() && (
              <div className="exercise-note is-read es-suya">
                <Quote size={13} />
                <p>{exercise.clientNote}</p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
