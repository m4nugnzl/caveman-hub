import { Dumbbell } from 'lucide-react';

import { BotonMas } from '@/components/ui/BotonMas';
import { EmptyState } from '@/components/ui/primitives';
import { Fila, Grupo } from '@/components/ui/Grupo';
import { TiraDelPrograma } from '@/components/Coach/Workout/TiraDelPrograma';
import { ConjuntoDelBloque } from '@/components/Coach/Workout/ConjuntoDelBloque';
import { LecturasDelBloque } from '@/components/Coach/Workout/LecturasDelBloque';

/**
 * «ENTRENO» EN EL MONITOR — la mesa y su costado, con el mueble del taller.
 *
 * ══ Qué pedía el dueño, y de qué se quejaba ════════════════════════════════
 *
 *   *«Entreno no muestra la rutina, ni la progresión de forma cómoda, ni el
 *   bloque»*, *«debería ser más parecido a la visión del entrenador: mismas
 *   gráficas, similar estructura»*.
 *
 * Las tres cosas que faltaban existían ya, montadas y probadas, en el taller:
 *
 *   · **El bloque** → `TiraDelPrograma`. Los bloques del programa arriba y los
 *     microciclos del abierto debajo, con el disco de cuál está en curso. Es
 *     literalmente la cabecera con la que su entrenador navega su programa.
 *   · **La progresión** → `LecturasDelBloque`. «Este bloque» en cifras, la
 *     fuerza por ejercicio de este bloque (`strengthByExercise`) y el volumen
 *     por grupo, cada una con su ventana a fondo.
 *   · **La rutina** → la mesa: las hojas del microciclo y, abierta, la que se
 *     está mirando con sus ejercicios y lo que levantó la vez anterior.
 *
 * ══ Solo lectura, y sin un booleano que lo diga ════════════════════════════
 *
 * Ninguna de las dos piezas del taller recibe un `soloLectura`. No hace falta:
 * las dos siguen la ley que `TiraDelPrograma` tiene escrita —*«lo que se puede
 * hacer sale de lo que llega»*—, así que sin `masBloque` no hay «+ bloque», sin
 * `onRenombrarBloque` el nombre no se puede tocar y sin `onQuitarBloque` no hay
 * papelera. Lo que sí llega es la navegación (`onIrBloque`, `onIrSemana`),
 * porque mirar bloques anteriores es exactamente lo que el cliente venía a
 * hacer y hasta hoy no podía.
 *
 * Eso es lo que hace que esto sea reutilizar y no copiar: el día que la tira
 * cambie, cambia en los dos sitios, y ningún verbo del entrenador se cuela en
 * el portal por olvido.
 *
 * ══ Y la vista es «bloque», no «hoja» ══════════════════════════════════════
 *
 * A propósito. En la vista «hoja» la tira recoge el bloque como miga y pone las
 * hojas en la fila 1, y esa miga es el camino de vuelta al conjunto — una
 * pantalla que el cliente no tiene, porque el conjunto del taller es un editor.
 * Con la vista «bloque», la fila 1 son sus bloques y las hojas viven en la
 * mesa, que es donde se eligen. Ninguna pieza se queda con un mando muerto.
 *
 * ══ Ni un campo ════════════════════════════════════════════════════════════
 *
 * Sigue en pie la decisión del dueño del 14 por la mañana: aquí se MIRA y en
 * `/mi/rutina/sesion` se HACE. El único verbo lleno de la pantalla es el de
 * entrar a la sesión.
 */
export const EntrenoEnMonitor = ({ datos }) => {
  const {
    cliente,
    program,
    bloque,
    semana,
    semanaEnCurso,
    esActual,
    unidad,
    unidades,
    hoy,
    sesiones,
    onIrBloque,
    onIrSemana,
    onEntrenarHoja,
    nueva,
    logbook,
  } = datos;

  return (
    <div className="layout">
      <div className="entreno-pagina">
        {/* Sin título de página (15 sep 2026): «Bloque 1 · microciclo 10 de 10»
            lo dicen ya la cabecera de la mesa y «Dónde estás» en el carril, y el
            dueño lo quitó por repetido. Se queda el verbo, que es lo único que
            la cabecera traía y no está en otra parte de la pantalla.
            Por el manejador y no por un `Link` pelado: entrar a entrenar es
            apuntar QUÉ hoja —`seguir({semana, hoja})`—. */}
        {hoy ? (
          <div className="row entreno-verbo">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onEntrenarHoja(hoy.nombre)}
            >
              <Dumbbell size={15} />
              {hoy.verbo}
            </button>
          </div>
        ) : null}

        <div className="entreno is-conjunto">
          {/* Por encima de las DOS columnas, como en el taller: los bloques y
              los microciclos eligen lo que dicen las hojas Y las lecturas del
              costado, así que el costado empieza a la altura de las hojas y no
              de la tira (el dueño, 18 sep). Ver `WorkoutLogEditor`. */}
          {bloque ? (
            <TiraDelPrograma
              program={program}
              bloque={bloque}
              semana={semana}
              semanaEnCurso={semanaEnCurso}
              esActual={esActual}
              unidad={unidad}
              unidades={unidades}
              vista="bloque"
              onIrBloque={onIrBloque}
              onIrSemana={onIrSemana}
              /* El mismo «+» que usa su entrenador, pegado a los microciclos,
                 pero sin menú: el cliente solo tiene una salida, la copia en
                 blanco. Solo en el bloque en curso, que es donde cae. */
              masMicrociclo={
                nueva && esActual ? (
                  <BotonMas
                    palabra={unidad.toLowerCase()}
                    que="microciclo"
                    title={`Añadir el ${unidad.toLowerCase()} ${nueva.numero}: las mismas sesiones, sin tus números`}
                    onClick={nueva.onContinuar}
                  />
                ) : null
              }
            />
          ) : null}
          <section className="entreno-hoja mesa-panel" aria-label="Tu programa">

            <div className="mesa-cuerpo">
              {sesiones.length > 0 && bloque ? (
                <div className="col gap-4">
                  {/*
                    ══ EL BLOQUE ENTERO, LA MISMA REJILLA ═══════════════════

                    *«La vista de entrenamiento tiene que ser similar a la vista
                    del entrenador: ves el bloque entero y ves las hojas de
                    entreno, tal cual lo tiene el entrenador pero adaptado al
                    cliente.»*

                    Esto era una lista de filas —«Legs A Cueva · 7 ejercicios ·
                    18 series · sin empezar»— y debajo, en otra lista, los
                    ejercicios de la que estuviera elegida. O sea: el bloque no
                    se veía nunca entero y para comparar dos días había que
                    pulsar dos veces y acordarse del primero.

                    `ConjuntoDelBloque` es la rejilla con la que su entrenador
                    planifica: todas las hojas a la vez, con el día que le toca
                    a cada una, el semáforo de si está hecha, lo que levantó la
                    vez pasada bajo cada ejercicio, el volumen por grupo en la
                    cabecera y la marca del remate.

                    ── Llega sin un solo verbo de escritura ─────────────────
                    Ni `onSeries`, ni `onReps`, ni altas, ni papeleras, ni
                    renombrar, ni arrastrar. No hace falta un `soloLectura`:
                    la pieza cuelga cada verbo de su manejador. Lo único que
                    llega es `onAbrirHoja` —que aquí no abre un editor, sino
                    que entra a ENTRENAR ese día— y la navegación del programa.
                  */}
                  <ConjuntoDelBloque
                    program={program}
                    cliente={cliente}
                    bloque={bloque}
                    /* El de AHORA y no el que se está mirando, igual que en el
                       taller: de ahí salen el semáforo de cada hoja y el «hizo»
                       de cada ejercicio. Mirando un bloque cerrado se apagan
                       solos, que es lo correcto. */
                    semanaEnCurso={semanaEnCurso}
                    onAbrirHoja={onEntrenarHoja}
                    onIrSemana={onIrSemana}
                  />
                </div>
              ) : (
                <EmptyState
                  icon={Dumbbell}
                  title="Todavía no tienes rutina"
                  message="Cuando tu entrenador te la escriba, aparecerá aquí."
                />
              )}
            </div>
          </section>

          <div className="entreno-lado-derecho">
            {/*
              LAS TRES LECTURAS DEL BLOQUE, las mismas que mira su entrenador.
              Aquí estaba la avería: el portal tenía «Cómo va el bloque» con
              tres recuentos escritos a mano y ninguna gráfica, mientras esta
              pieza —con el historial de bloques, la fuerza por ejercicio y el
              volumen por grupo, cada una con su ventana— ya existía al lado.
            */}
            {bloque ? (
              <LecturasDelBloque
                program={program}
                cliente={cliente}
                bloque={bloque}
                semanaEnCurso={semanaEnCurso}
                onIrBloque={onIrBloque}
                onIrSemana={onIrSemana}
              />
            ) : null}

            {/*
              EL LOGBOOK: su mejor serie en cada ejercicio. Es la pieza que hace
              que la aplicación valga cuando se acabe el bloque, así que se queda
              aunque no sea del taller — allí no existe porque el entrenador no
              necesita el récord de nadie para escribir una hoja.
            */}
            {logbook.length > 0 ? (
              <Grupo title="Tu logbook">
                {logbook.map((e) => (
                  <Fila key={e.nombre} title={e.nombre} sub="tu marca" valor={e.marca} />
                ))}
                <Fila title="Verlo entero" to="/mi/progreso" verbo />
              </Grupo>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
