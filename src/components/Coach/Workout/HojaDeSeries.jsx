import { useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardPaste, Copy, GripVertical, Quote, Trash2 } from 'lucide-react';

import { restLabel, supersetLabels } from '@/domain/training';
import { useArrastreOrden } from '@/lib/useArrastreOrden';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { TablaDeSeries, camposDeLaHoja } from './TablaDeSeries';

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
 *
 * ── Y la TABLA de cada ejercicio no vive aquí ──────────────────────────────
 * Vivía, mientras esta fue la única superficie donde se escribía serie a serie.
 * Desde que el compositor también pauta kilos y RIR está en `TablaDeSeries`,
 * que es la misma pieza en los dos sitios: la de allí es esta sin la mitad de
 * lo hecho. Aquí queda lo que es DE LA HOJA —el renglón del ejercicio, sus
 * verbos, la excepción y el reordenar— y qué columnas pauta, que es una
 * decisión de la hoja entera y no de una tabla.
 */
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
  /* Copiar el ejercicio al portapapeles, con sus series y sus objetivos. Es lo
     que Efort llama «copy sets between exercises» y aquí es lo mismo un escalón
     más arriba: se copia el ejercicio entero y se pega donde haga falta, en
     esta hoja o en la de otra persona. Como todo aquí, solo aparece si llega su
     manejador — en el portal del cliente no llega. */
  onCopiar = null,
  /*
    ── PONERLE A ESTA FILA LA PAUTA DE LA QUE SE LLEVA ───────────────────────
    `pautaEnMano` es el ejercicio copiado (la pieza del portapapeles) y
    `onPegarPauta(ex)` le pone sus series a la fila, conservando su nombre. El
    verbo sale SOLO en la fila encendida, que es la misma regla que ⌘V: sin ella
    serían diez botones a la vez, uno por fila, para un gesto que va a uno.

    Y sale solo mientras se lleva algo, que es la ley del reposo de la casa: una
    oferta que no se puede aceptar es mobiliario.
  */
  pautaEnMano = null,
  onPegarPauta = null,
}) => {
  const [notaAbierta, setNotaAbierta] = useState(null);
  /*
    ══ REORDENAR ES UN GESTO DE PUNTERO, NO UN `draggable` ═══════════════════

    Aquí vivió el arrastre de HTML5 —asa `draggable`, `onDrop` en la fila— y
    estaba roto de una forma que no se ve: el gesto arrancaba, la fila se
    atenuaba, el destino se marcaba... y soltar sobre el CUERPO de la fila no
    disparaba ningún `drop`. Como el cuerpo de una fila son su tabla de series
    y sus casillas —el 90 % de su superficie—, lo normal era arrastrar, soltar
    y que no pasara nada. De ahí «no puedo mover ejercicios de orden».

    `useArrastreOrden` es el mecanismo que esta casa ya tenía escrito para esto
    (y que se quedó sin usar al morir el carril de días): el destino lo decide
    la GEOMETRÍA —qué sitio hay bajo el puntero— y no quién recibe el evento,
    funciona igual con el dedo, y la página sigue al puntero al llegar al canto,
    que en una hoja de 2.000 px de alto es la diferencia entre poder llevar el
    primero al último sitio y no poder.
  */
  const orden = useArrastreOrden({ onMove, eje: 'y' });
  /* Abrir a mano una columna de objetivo que esta hoja todavía no pauta. Es
     estado de PANTALLA y no dato: en cuanto se escribe el primer valor, la
     columna se sostiene sola y esto deja de importar. Ver `OBJETIVOS`. */
  const [aMano, setAMano] = useState({});

  if (exercises.length === 0) {
    return <p className="t-sm t-secondary hoja-vacia">{emptyMessage}</p>;
  }

  /* Qué objetivos pauta esta hoja —y por tanto qué columnas tiene su tabla—,
     con «+ kg» y «+ rir» para los que faltan. La regla entera, y por qué es del
     CONTENIDO y no del protocolo, está en `camposDeLaHoja`. */
  const { campos, porPautar, columnas } = camposDeLaHoja(exercises, { showRir, aMano });
  /* A1/A2, derivado de la posición. La superserie se decide al escribir el
     bloque; aquí —el plan de un microciclo— se lee. */
  const marcasSS = supersetLabels(exercises);

  return (
    <div className={`hoja${orden.arrastrando !== null ? ' is-ordenando' : ''}`} ref={orden.carrilRef}>
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
            className={`hoja-ej${enFoco ? ' is-focused' : ''}${orden.destino === index && orden.arrastrando !== index ? ' is-drop-target' : ''}${orden.arrastrando === index ? ' is-viajando' : ''}${orden.arrastrando !== null ? ' is-en-orden' : ''}`}
            {...orden.pieza(index)}
            onClick={onFocusExercise ? () => onFocusExercise(ex.id) : undefined}
            onFocus={onFocusExercise ? () => onFocusExercise(ex.id) : undefined}
          >
            <header className="hoja-ej-head">
              <button
                type="button"
                className="hoja-asa"
                {...orden.asa(index)}
                /* Y con el teclado, que es la otra mitad: arrastrar deja fuera a
                   quien no pueda hacerlo, y además es el camino exacto cuando se
                   sabe adónde va. Igual que en la lista del teléfono
                   (`ExerciseList`). */
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
                title="Arrastra para moverlo de sitio (o Alt + ↑/↓)"
              >
                <GripVertical size={15} />
              </button>
              {/* En superserie el número de orden ES la etiqueta: A1, A2. */}
              <span className={`hoja-ej-n${marcasSS[index] ? ' is-ss' : ''}`}>{marcasSS[index] || index + 1}</span>
              {/*
                ── EL NOMBRE SE LEE ENTERO ────────────────────────────────────
                «Que no quepan los nombres es un problema para entender lo
                pautado.» Nombre y dato eran dos piezas del renglón que se
                recortaban a puntos suspensivos —«PECK DECK REVER…»— para que
                cupieran los mandos. Ahora son UN título que envuelve como un
                párrafo: con sitio, todo en una línea; sin él, baja a la segunda,
                y los mandos se quedan quietos a la altura de la primera.
              */}
              <span className="hoja-ej-titulo">
                <span className="hoja-ej-nombre">{ex.name}</span>
                <span className="hoja-ej-meta">
                  {/* Lo que el ejercicio ES: su músculo y sus series. Va PEGADO
                      al nombre y antes que la excepción, para que la hoja tenga
                      una columna que seguir con la vista. */}
                  {[
                    ex.muscle,
                    `${sets.length} ${sets.length === 1 ? 'serie' : 'series'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
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
                {onCopiar && (
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-compact"
                    title={`Copiar «${ex.name}» al portapapeles, con sus series`}
                    aria-label={`Copiar «${ex.name}» al portapapeles`}
                    onClick={() => onCopiar(ex)}
                  >
                    <Copy size={13} />
                  </button>
                )}
                {/* La pauta de lo que se lleva, en esta fila. Solo en la
                    encendida y solo con algo en la mano: ver `pautaEnMano`. */}
                {onPegarPauta && pautaEnMano && enFoco && pautaEnMano.carga?.name !== ex.name && (
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-compact"
                    title={`Poner en «${ex.name}» las series de «${pautaEnMano.carga?.name || pautaEnMano.titulo}»`}
                    aria-label={`Poner en ${ex.name} las series de ${pautaEnMano.carga?.name || pautaEnMano.titulo}`}
                    onClick={() => onPegarPauta(ex)}
                  >
                    <ClipboardPaste size={13} />
                  </button>
                )}
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
                  <button type="button" className="btn btn-icon btn-icon-compact btn-icon-danger" aria-label={`Quitar ${ex.name}`} onClick={() => onRemove(ex.id)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            </header>

            <TablaDeSeries
              ex={ex}
              campos={campos}
              columnas={columnas}
              onSetChange={onSetChange}
              onAddSet={onAddSet}
              onRemoveSet={onRemoveSet}
              onTecnica={onTecnica}
            />

            {/*
              ══ Y LO QUE ÉL DIJO DE ESTE EJERCICIO ════════════════════════════

              La nota que escribe quien entrena, en la ficha del ejercicio
              (`M-03`). Va aquí, pegada a sus series, porque es lo que las
              explica: «bajé el peso, el hombro iba justo» leído al lado de un
              32 que bajó a 28 es la mitad de la conversación de la semana, y
              suelta en un cuaderno al final de la sesión no se sabe de qué
              ejercicio habla.

              De solo leer, y sin interruptor de protocolo: no es un módulo que
              se encienda, es algo que la persona ha dicho. Si no ha dicho nada
              no hay ni una línea.
            */}
            {String(ex.clientNote || '').trim() && (
              <div className="hoja-nota es-suya">
                <span className="section-label">Lo que dijo</span>
                <p>{ex.clientNote}</p>
              </div>
            )}

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
