import { Suspense, useMemo, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { buildWeeklySeries, metricPoints, weekOverWeek } from '@/domain/analytics';
import { weeklyCheckIn, weightSeries } from '@/domain/anthropometry';
import { clientCycleSlots } from '@/domain/blocks';
import { allSessions } from '@/domain/sessions';
import { cycleFoto } from '@/domain/nutrition';
import { clientProtocol, isServiceOn, weighInsTarget } from '@/domain/protocol';
import { goalFromDirection } from '@/domain/goals';
import { effectiveGoal, roadmapState } from '@/domain/roadmap';
import { weeklyReading, weightTrend } from '@/domain/reading';
import { todayISO } from '@/lib/dates';
import { clientPath } from '@/routes';
import { useReviewRows } from '@/components/review/useReviewRows';
import { useReviewTrack } from '@/components/review/useReviewTrack';
import { lazyRoute } from '@/lib/lazyRoute';

import { TarjetaArranque } from './TarjetaArranque';
import { TarjetaProgreso } from './TarjetaProgreso';
import { TarjetaTonelaje } from './TarjetaTonelaje';
import { TarjetaVolumen } from './TarjetaVolumen';
import { TarjetaPlan } from './TarjetaPlan';
import { TarjetaSensaciones } from './TarjetaSensaciones';
import { TarjetaHilo } from './TarjetaHilo';

/*
  ══ Las ventanas, diferidas ═══════════════════════════════════════════════

  Las tres —el roadmap, el cuerpo a fondo y el entreno a fondo— se abren un
  día y se consultan muchos. Van con `lazyRoute` —el mismo cargador de las
  rutas, con su reintento contra el despliegue que cambia los hashes— y con
  su propia frontera de `Suspense`, y se montan solo abiertas: cerradas no
  calculan nada.
*/
const FasesPopup = lazyRoute(() => import('./FasesPopup').then((m) => ({ default: m.FasesPopup })));
const PanelCuerpo = lazyRoute(() => import('./PanelCuerpo').then((m) => ({ default: m.PanelCuerpo })));
const PanelEntreno = lazyRoute(() => import('./PanelEntreno').then((m) => ({ default: m.PanelEntreno })));

/**
 * RESUMEN — lo que pasa a la izquierda, lo que le has puesto a la derecha.
 *
 * ══ La forma ═══════════════════════════════════════════════════════════════
 *
 *     ┌── EL PROGRESO ───── [En rumbo] [kcal|pasos] a fondo ┐ ┌ EL PLAN ─── ✎┐
 *     │  82 ┼············│BLOQUE 2···┌──────────┐            │ │ Objetivo     │
 *     │     │      ●───●─│──●───●────│ HOY      │            │ │ Macros ▓▓▓░  │
 *     │  80 ┼─●──●───────│···········│ 76,9 kg  │            │ │ 2.300 kcal   │
 *     │     │ ▓  ▓  ▓  ▓ │▓  ▓  ▓  ▓ └──────────┘            │ │ 11.000 pasos │
 *     │  78 ┼[80,7 EMPEZÓ]▓  ▓  ▓  ▓  [76,1 OBJETIVO]        │ │ cardio · días│
 *     │     S1  S2  S3  S4  S5  S6  S7  S8                   │ └──────────────┘
 *     │ ───────────────────────────────────────────────────  │ ┌ CÓMO LO LLEVA┐
 *     │ PESO −3,8 kg  CINTURA −2,8 cm  ENTRENOS 47  FASE …   │ │ dieta ▓▓▓▓ 7 │
 *     └──────────────────────────────────────────────────────┘ │ fatiga ▓▓▓▓ 9│
 *     ┌── TONELAJE ─────────┐ ┌── VOLUMEN POR GRUPO ────────┐ └──────────────┘
 *     │ ▃▄▅▆▇█  M3 … M10    │ │ pecho ▓▓▓▓▓░░  11 de 20     │ ┌ LO ÚLTIMO ───┐
 *     └─────────────────────┘ └─────────────────────────────┘ │ ◍ Pull A  2 h│
 *                                                             └──────────────┘
 *
 * ══ Por qué esta forma (frame de Figma 50:81, 17 sep 2026) ═════════════════
 *
 * La anterior eran SEIS tarjetas y tres de ellas contaban el peso: «Cómo va»
 * (la cuenta y el veredicto), «Desde que empezó» (el cambio total) y «El
 * cuerpo» (la curva). El prototipo las funde en una sola —ver `TarjetaProgreso`,
 * donde está la razón entera— y, a cambio, parte «El entreno» en las DOS que
 * siempre fue: el tonelaje y el volumen.
 *
 *   · A la IZQUIERDA, lo que PASA: el progreso en una caja, y debajo el entreno
 *     en dos de media fila. Cada caja, UNA pregunta.
 *   · A la DERECHA, lo que le has PUESTO para que pase —la receta—, lo que él
 *     cuenta de cómo lo lleva, y lo último que hizo. Es lo que se mira antes de
 *     escribirle. Tres cajas sueltas y no un panel fundido: el frame las dibuja
 *     con su canto y su hueco, igual que el costado de la Dieta desde el 17 sep.
 *   · La PROFUNDIDAD, en ventanas: el cuerpo y el entreno se abren «a fondo» en
 *     la misma ventana grande que el bloque de Entreno, con las tablas semana
 *     a semana que en la página no caben ni deben caber.
 *
 * Ninguna tarjeta cuenta lo que se da por hecho: las series anotadas y los
 * pesajes de la semana no son un dato, son una obligación, y de que falten ya
 * avisa la cabecera.
 *
 * ── El cliente ve lo mismo, menos tus decisiones ────────────────────────────
 * Su portal monta este mismo panel (`Client/ClientStart`). Cambian dos cosas:
 * en el peso ve su curva y no la escalera de lo que le fuiste poniendo, y el
 * plan lo mira sin enlaces para tocarlo.
 */
export const Dashboard = ({ audience = 'coach' }) => {
  const { activeClient, workoutData, anthropometry, nutrition, phases, progressPhotos, updateClientPreferences } = useApp();
  const isClient = audience === 'client';
  /*
    ══ Lo que su entrenador le oculta A ÉL ════════════════════════════════════

    La decisión ya no se toma aquí. Eran dos tarjetas enteras las que se
    retiraban —la trayectoria y la curva—, y con la fusión del 17 sep son una
    MITAD de «El progreso»: la de arriba. Quitarla o no lo decide la propia
    tarjeta, que es la que sabe qué parte suya es el peso; el panel solo dice
    qué monta. Ver `TarjetaProgreso` y `Oculto.jsx`.
  */

  const [ventana, setVentana] = useState(null);
  /* Con qué pregunta se llegó: una fila de «Cómo lo lleva» abre su ventana con
     la curva de ESA pregunta a la vista (los paneles la buscan y se colocan).
     Se fija en CADA apertura —también a null en las que no vienen de una
     fila—, porque si se quedara la anterior, abrir la ventana desde su puerta
     normal aterrizaría en la curva de la última fila pulsada. */
  const [preguntaVentana, setPreguntaVentana] = useState(null);
  const abrirVentana = (id, pregunta = null) => {
    setPreguntaVentana(pregunta);
    setVentana(id);
  };
  /*
    Contra qué se dibuja el peso. Vive aquí y no en la tarjeta porque la ventana
    no lo hereda: dentro se mira el peso solo, con su recta y su banda.

    ── Y el cliente abre en PASOS ────────────────────────────────────────────
    El entrenador abre en calorías porque cada peldaño de esa escalera es una
    decisión suya y lo que quiere ver es si funcionó. Al cliente le pasa lo
    contrario: su plan lleva cinco semanas igual, así que la escalera de kcal le
    sale plana —una serie que no se mueve, que en una gráfica no es un dato, es
    un adorno—. Lo que sí se mueve semana a semana son sus pasos, que además son
    lo único de las dos bandas que depende de él.

    El conmutador sigue ahí: esto es por dónde se abre, no qué se puede mirar.
    Y por eso el estado arranca sin elegir (`null`) en vez de arrancar en
    «steps»: a quien no le han puesto pasos, abrir por ellos sería una banda
    vacía. La preferencia se aplica donde se sabe si hay pasos, más abajo.
  */
  const [bandaElegida, setBanda] = useState(null);

  /*
    ══ El histórico de check-ins, que alimenta DOS cosas ══════════════════════

    La ESCALERA de lo que le fuiste poniendo (`useReviewTrack`, solo para el
    entrenador: el cliente ya lee tus cambios en su semana) y lo que CONTESTA
    cada semana, que sí es suyo y lo ve. Es una sola consulta para las dos.
  */
  const { rows: revisiones, checkIns, cargando: cargandoRevisiones } = useReviewRows(activeClient?.id);
  /*
    ══ Y LA ESCALERA TAMBIÉN ES SUYA ═════════════════════════════════════════

    Aquí se le pasaba una lista vacía al cliente, con el argumento de que «el
    cliente ya lee tus cambios en su semana». El argumento confundía dos cosas:
    leer un cambio —«te subo 100 g de carbos»— no es ver la gráfica de dos
    bandas, que es la única pieza del producto que contesta *si esto está
    funcionando*: su peso arriba y, debajo y con el mismo eje de semanas,
    contra qué se compara.

    Sin track, `conAjustes` era falso para él y su curva salía sola. Y es SU
    peso contra SU plan: ni una consulta nueva —`revisiones` ya las lee— ni una
    política nueva. Lo que su entrenador no quiera enseñarle sigue fuera por
    donde ya lo estaba (`Oculto`), que es de donde tiene que salir.
  */
  const track = useReviewTrack(revisiones);

  /* Aquí se medía el ancho de la tarjeta del peso para dibujar la gráfica a
     píxel real. Ya no hace falta: `GraficaDelProgreso` se mide a sí misma, que
     es donde tiene que medirse — así la pieza sirve igual en una tarjeta, en una
     ventana o en el portal, sin que quien la monta tenga que saber su relleno
     (aquel `ancho - 44` era exactamente eso: el relleno de la tarjeta,
     escrito en la pantalla que la montaba). */

  const program = workoutData[activeClient.id];
  const microcycles = useMemo(() => program?.microcycles || [], [program]);
  const anthro = anthropometry[activeClient.id];
  const history = useMemo(() => anthro?.history || [], [anthro]);
  const plan = nutrition[activeClient.id];
  /* Lo que come de media en una vuelta de su ciclo, para que la fila de
     calorías no enseñe el primer día del plan como si fuera el plan. Ver
     `cycleFoto` y la cabecera de esa fila en `TarjetaPlan`. */
  const fotoDelCiclo = useMemo(
    () => cycleFoto(plan, clientCycleSlots(activeClient, workoutData?.[activeClient.id])),
    [plan, activeClient, workoutData]
  );
  const hoy = todayISO();

  const serie = useMemo(
    () => buildWeeklySeries({ microcycles, history, gender: activeClient.gender }),
    [microcycles, history, activeClient.gender]
  );
  const pesoActual = metricPoints(serie, 'weight').slice(-1)[0]?.value ?? null;
  const pesoWow = weekOverWeek(serie, 'weight');
  /* El protocolo decide también CUÁNTOS pesajes se cuentan: sin número pedido,
     la tarjeta de peso no habla de pesajes que falten. Se calcula aquí arriba
     porque `checkIn` lo necesita antes de que el protocolo se use más abajo. */
  const protocol = useMemo(() => clientProtocol(activeClient.preferences), [activeClient.preferences]);

  const checkIn = useMemo(
    () => weeklyCheckIn(history, hoy, { target: weighInsTarget(protocol) }),
    [history, hoy, protocol]
  );

  const weeks = useMemo(() => microcycles.map((m) => m.weekNumber).sort((a, b) => a - b), [microcycles]);
  const latestWeek = weeks.length > 0 ? weeks[weeks.length - 1] : null;

  /*
    El protocolo decide qué secciones existen para este cliente. A quien solo le
    llevas el entrenamiento no le sobra el objetivo de kcal: es que no tiene
    nutrición, y una tarjeta con «sin plan» promete una pantalla que no existe.
  */
  const conEntreno = isServiceOn(protocol, 'training');
  const conDieta = isServiceOn(protocol, 'nutrition');

  /*
    ══ LA LECTURA, calculada una vez y repartida ═════════════════════════════

    `domain/reading.js` devuelve los hallazgos de las cuatro preguntas. El de
    DIRECCIÓN es el veredicto de «Cómo va»; los demás viven dentro de la ventana
    que los demuestra, y su gravedad marca con un punto la tarjeta que lleva
    hasta ella. Va sobre el histórico ENTERO: un veredicto que cambia con el
    zoom no es un veredicto.
  */
  const lectura = useMemo(
    () => weeklyReading({ client: activeClient, series: serie, microcycles, history, today: hoy, latestWeek, phases }),
    [activeClient, serie, microcycles, history, hoy, latestWeek, phases]
  );
  const direccion = lectura.find((f) => f.evidence === 'direction') || null;
  const trend = useMemo(() => weightTrend(serie), [serie]);

  const goal = useMemo(() => effectiveGoal(activeClient, phases, hoy), [activeClient, phases, hoy]);
  const fases = useMemo(() => roadmapState(phases, hoy), [phases, hoy]);

  /*
    ══ AQUÍ VIVIÓ EL MANDO DEL RESUMEN ═══════════════════════════════════════
    Una línea de contexto —«Trimestral · 240 € · desde 18 may»— entre la
    cabecera y las tarjetas. Primero se le quitó al portal (lo que paga no es
    asunto del progreso) y el 6 sep se retiró del todo, por orden del dueño:
    «el que ponga el plan justo debajo antes de empezar la hoja no me gusta».
    No se pierde nada — la tarifa la dice la chapa del cobro en la cabecera y
    la ficha; la antigüedad, «Desde que empezó», dos centímetros más abajo. El
    mando de Entreno y Dieta no cambia: allí lleva acciones.
  */

  /* La escalera de lo que le fuiste poniendo necesita al menos dos semanas de
     historia; si no, la curva del peso sola dice lo mismo sin fingir una
     escalera de un solo escalón. */
  const conAjustes = track.length > 1;
  /* Los pasos se ofrecen cuando hay DOS semanas con dato: con una sola, la
     escalera es una raya y el conmutador promete una lectura que no existe. */
  const hayPasos = track.filter((f) => f.steps !== null && f.steps !== undefined).length > 1;
  /* Lo elegido manda; sin elegir, el cliente abre en pasos si los tiene y el
     entrenador siempre en calorías. Ver el comentario del estado, arriba. */
  const banda = bandaElegida || (isClient && hayPasos ? 'steps' : 'kcals');

  const aDieta = isClient ? '/mi/dieta' : clientPath(activeClient.id, 'nutricion');
  const aEntreno = isClient ? '/mi/rutina' : clientPath(activeClient.id, 'rutina');
  const aFotos = isClient ? '/mi/evolucion/fotos' : clientPath(activeClient.id, 'revision/fotos');
  /* Donde el coach anota un pesaje: la revisión, con su alta de registros.
     Solo coach — el vacío del portal habla del check-in, no de esta puerta. */
  const aPesaje = isClient ? null : clientPath(activeClient.id, 'revision');

  const ventanas = (
    <Suspense fallback={null}>
      {ventana === 'fases' && <FasesPopup open onClose={() => setVentana(null)} audience={audience} />}
      {ventana === 'cuerpo' && (
        <PanelCuerpo
          open
          onClose={() => setVentana(null)}
          serie={serie}
          track={track}
          checkIns={checkIns}
          protocol={protocol}
          history={history}
          pesoActual={pesoActual}
          trend={trend}
          goal={goal}
          isClient={isClient}
          pregunta={preguntaVentana}
        />
      )}
      {ventana === 'entreno' && (
        <PanelEntreno
          open
          onClose={() => setVentana(null)}
          program={program}
          microcycles={microcycles}
          cycleType={activeClient.cycleType}
          latestWeek={latestWeek}
          protocol={protocol}
          isClient={isClient}
          pregunta={preguntaVentana}
        />
      )}
    </Suspense>
  );

  /*
    ══ SIN NADA QUE RESUMIR, EL RESUMEN ES LO QUE FALTA POR MONTAR ═══════════

    A un cliente recién dado de alta no le ha pasado nada: el mosaico eran siete
    cajas vacías. Mientras no haya sesiones, check-ins entregados, fotos ni dos
    pesajes —con uno solo no hay curva ni cambio que contar—, la página es la
    lista de «Para empezar». Ver `TarjetaArranque`.

    Solo el entrenador: el portal monta este panel en «Mi progreso», que es una
    lectura, y a él no se le pide montar nada.

    Mientras el programa o los check-ins no han llegado no se sabe, y no se
    pinta nada: si no, un cliente con historia vería la lista un instante antes
    de sus tarjetas, y uno nuevo las tarjetas vacías antes de la lista.
  */
  const sinHistoria =
    !isClient &&
    allSessions(microcycles).length === 0 &&
    weightSeries(history).length < 2 &&
    !checkIns.some((c) => c.submittedAt) &&
    !(progressPhotos || []).some((p) => p.clientId === activeClient.id);

  if (sinHistoria) {
    if (program === undefined || cargandoRevisiones) return null;
    return (
      <>
        <div className="resumen-pagina">
          <TarjetaArranque
            client={activeClient}
            phases={phases}
            plan={plan}
            ciclo={fotoDelCiclo}
            program={program}
            conEntreno={conEntreno}
            conDieta={conDieta}
            onAbrirFases={() => abrirVentana('fases')}
          />
        </div>
        {ventanas}
      </>
    );
  }

  return (
    /*
      Las ventanas van FUERA de la página y no dentro.

      `.resumen-pagina` es un CONTENEDOR de consulta (ver `index.css`), y eso
      implica `contain: layout`: cualquier `position: fixed` de dentro deja de
      medirse contra la ventana del navegador y pasa a medirse contra la caja
      del panel. El velo del modal es `fixed`, así que las tres ventanas «a
      fondo» se habrían encogido al ancho de la columna de trabajo. Fuera del
      contenedor, siguen tapando la pantalla entera como cualquier otra.
    */
    <>
    <div className={`resumen-pagina${isClient ? ' is-portal' : ''}`}>
      <div className="resumen">
        {/*
          Aquí vivió `es-hoja` un día (movimiento 02 del estudio del 5 sep):
          el mosaico como UNA hoja de bandas separadas por filetes. El dueño
          lo deshizo el 6, con el chasis nuevo delante — «sigo viendo 2 boxes,
          la del centro y la de la derecha unificadas»: sobre la hoja del
          expediente, fundir las tarjetas en una banda deja la pantalla en dos
          masas. Cada elemento vuelve a su caja, que es como se cuentan cosas
          distintas. El aviso que llevaba escrito aquel comentario —«seis
          tarjetas encima son cajas sobre una caja»— lo contesta la escala:
          hoja en papel/noche del lienzo, tarjeta con su canto encima.
        */}
        <div className="mosaico cascada">
          {/* EL PROGRESO: la caja que manda. Lleva dentro lo que antes eran tres
              —el veredicto, la curva y el cambio total—, y a quien tiene el peso
              oculto se le queda en su tira de cifras (ver `TarjetaProgreso`). */}
          <TarjetaProgreso
            serie={serie}
            track={track}
            conAjustes={conAjustes}
            program={program}
            banda={banda}
            onBanda={setBanda}
            hayPasos={hayPasos}
            pesoWow={pesoWow}
            checkIn={checkIn}
            trend={trend}
            veredicto={direccion}
            goal={goal}
            canEditGoal={!isClient}
            /* El peso objetivo se fija en la ventana de fases, que es donde se
               decide el proceso: la tarjeta lee, no configura. */
            onSetGoal={(direction) =>
              updateClientPreferences(
                activeClient.id,
                'goal',
                /* Al desmarcar se escribe `direction: null` en vez de borrar la
                   clave: `updateClientPreferences` fusiona por sección y no puede
                   quitar claves, y `clientGoal` ya lee un `direction` inválido
                   como «sin objetivo». Un camino, sin excepciones. */
                goalFromDirection(direction) || { direction: null }
              )
            }
            fases={fases}
            hoy={hoy}
            history={history}
            microcycles={microcycles}
            startDate={activeClient.startDate}
            isClient={isClient}
            onAbrir={() => abrirVentana('cuerpo')}
            onAbrirFases={() => abrirVentana('fases')}
            aFotos={aFotos}
            aPesaje={aPesaje}
          />

          {/* El entreno, en las dos cajas que siempre fue: cuánto movió y dónde
              se lo pusiste. Media fila cada una. */}
          {conEntreno && (
            <TarjetaTonelaje
              program={program}
              microcycles={microcycles}
              cycleType={activeClient.cycleType}
              isClient={isClient}
              onAbrir={() => abrirVentana('entreno')}
            />
          )}
          {conEntreno && (
            <TarjetaVolumen
              program={program}
              cycleType={activeClient.cycleType}
              isClient={isClient}
              aRutina={isClient ? null : aEntreno}
            />
          )}

          {/* «Lo último», la última fila del mosaico y a todo lo ancho. Vivía
              al pie de la columna de al lado, como en el frame, y colgaba por
              debajo del trabajo, suelto («el lo último debajo apartado»): la
              columna ya mide lo que el centro con «El plan» y «Cómo lo lleva».
              El cliente no lo ve —su portal ya cuenta su semana en cada
              sección— y sus respuestas tuyas las lee en la revisión. */}
          {!isClient && (
            <TarjetaHilo
              client={activeClient}
              program={program}
              anthro={anthro}
              photos={(progressPhotos || []).filter((p) => p.clientId === activeClient.id)}
              checkIns={checkIns}
              revisiones={revisiones}
              hoy={hoy}
            />
          )}
        </div>

        {/* ── LA COLUMNA DEJA DE SER UN PANEL (frame 50:277, 17 sep) ────────
            Llevaba `es-panel`: una sola caja con los apartados separados por
            filete, con el argumento de que ahí dentro hay una sola cosa —con
            qué se juzga a esta persona—. El frame la dibuja como TRES cajas de
            canto con 20 px de papel entre ellas, y es la misma corrección que
            se le hizo al costado de la Dieta ese mismo día: el argumento era
            falso porque ahí no hay una cosa, hay tres —lo que le pusiste, lo
            que él contesta y lo que ha hecho—, y cada una se lee por separado.
            Con las cajas, además, las dos columnas vuelven a hablar igual. */}
        <aside className="resumen-lado">
          <TarjetaPlan
            goal={goal}
            pesoActual={pesoActual}
            plan={plan}
            ciclo={fotoDelCiclo}
            program={program}
            conDieta={conDieta}
            conEntreno={conEntreno}
            aDieta={aDieta}
            aEntreno={aEntreno}
            /* El objetivo no vive en otra pantalla: se decide en las fases, y
               esa ventana es la misma que abre «Cómo va». */
            onAbrirFases={() => abrirVentana('fases')}
            isClient={isClient}
          />
          {/* Cada fila del subjetivo es una puerta a la ventana donde ya vive
              su curva: las del check-in en el «a fondo» del cuerpo, las de
              sesión en el del entreno. Ver `TarjetaSensaciones`. */}
          <TarjetaSensaciones
            checkIns={checkIns}
            microcycles={microcycles}
            protocol={protocol}
            span={12}
            isClient={isClient}
            onAbrirCuerpo={(q) => abrirVentana('cuerpo', q?.id ?? null)}
            onAbrirEntreno={conEntreno ? (q) => abrirVentana('entreno', q?.id ?? null) : null}
          />
        </aside>
      </div>
      </div>

      {ventanas}
    </>
  );
};
