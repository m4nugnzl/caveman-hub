import { Suspense, useMemo, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { buildWeeklySeries, metricPoints, weekOverWeek } from '@/domain/analytics';
import { weeklyCheckIn } from '@/domain/anthropometry';
import { clientProtocol, isServiceOn } from '@/domain/protocol';
import { goalFromDirection } from '@/domain/goals';
import { effectiveGoal, roadmapState } from '@/domain/roadmap';
import { weeklyReading, weightTrend } from '@/domain/reading';
import { shortDate, todayISO } from '@/lib/dates';
import { clientPath } from '@/routes';
import { Mando } from '@/components/ui/Mando';
import { useReviewRows } from '@/components/review/useReviewRows';
import { useReviewTrack } from '@/components/review/useReviewTrack';
import { useElementWidth } from '@/lib/useElementWidth';
import { lazyRoute } from '@/lib/lazyRoute';
import { TarjetaComoVa } from './TarjetaComoVa';
import { TarjetaDesde } from './TarjetaDesde';
import { TarjetaCuerpo } from './TarjetaCuerpo';
import { TarjetaEntreno } from './TarjetaEntreno';
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
 *     Trimestral · 240 € · desde 18 may
 *     ┌── CÓMO VA ──────────────────────┐ ┌ DESDE QUE ──┐  ┌── EL PLAN ─────┐
 *     │ 80,7 → 76,9 → 75   ╲__●· · ·○  │ │ −3,4 kg     │  │ Objetivo       │
 *     │ ✓ En rumbo          ▓▓▓▓░░ S8/12│ │ −2,8 cm     │  │ 2.300 kcal     │
 *     └─────────────────────────────────┘ │ +29,5 kg    │  │ 11.000 pasos   │
 *     ┌── EL CUERPO ───────────  a fondo →┐│ 15 semanas  │  │ cardio · días  │
 *     │ 77,3 kg ▼0,4                      │└─────────────┘  │ Ajustar →      │
 *     │ [curva + escalera de kcal]        │                 └────────────────┘
 *     └───────────────────────────────────┘                 ┌ CÓMO LO LLEVA ─┐
 *     ┌── EL ENTRENO ──────────  a fondo →┐                 │ dieta  ▓▓▓▓ 7  │
 *     │ la fuerza ╱ 109 ▲29 │ volumen ▓▓▏ │                 │ fatiga ▓▓▓▓ 9  │
 *     └───────────────────────────────────┘                 └────────────────┘
 *
 * ══ Por qué esta forma, después del mosaico de nueve ═══════════════════════
 *
 * El mosaico de nueve tarjetas se leía como una hoja llena: todo a la vista,
 * nada agrupado y ninguna profundidad que abrir. Entreno y Dieta ya habían
 * encontrado la forma —el trabajo a lo ancho y, al lado, lo que se decidió una
 * vez y se consulta muchas— y el Resumen la sigue:
 *
 *   · A la IZQUIERDA, lo que PASA: cómo va la fase (con su trayectoria), cuánto
 *     ha cambiado desde el primer día, el cuerpo y el entreno. Tres piezas y
 *     una tira de cifras, cada una con UNA forma.
 *   · A la DERECHA, lo que le has PUESTO para que pase —la receta— y lo que él
 *     cuenta de cómo lo lleva. Es lo que se mira antes de escribirle.
 *   · La PROFUNDIDAD, en ventanas: el cuerpo y el entreno se abren «a fondo» en
 *     la misma ventana grande que el bloque de Entreno, con las tablas semana
 *     a semana que en la página no caben ni deben caber.
 *
 * Ninguna tarjeta lleva icono decorativo, y ninguna cuenta lo que se da por
 * hecho: las series anotadas y los pesajes de la semana no son un dato, son
 * una obligación, y de que falten ya avisa la cabecera.
 *
 * ── El cliente ve lo mismo, menos tus decisiones ────────────────────────────
 * Su portal monta este mismo panel (`Client/ClientStart`). Cambian dos cosas:
 * en el peso ve su curva y no la escalera de lo que le fuiste poniendo, y el
 * plan lo mira sin enlaces para tocarlo.
 */
export const Dashboard = ({ audience = 'coach' }) => {
  const { activeClient, workoutData, anthropometry, nutrition, phases, progressPhotos, updateClientPreferences } = useApp();
  const isClient = audience === 'client';

  const [ventana, setVentana] = useState(null);
  /* Contra qué se dibuja el peso. Vive aquí y no en la tarjeta porque la ventana
     no lo hereda: dentro se mira el peso solo, con su recta y su banda. */
  const [banda, setBanda] = useState('kcals');

  /*
    ══ El histórico de check-ins, que alimenta DOS cosas ══════════════════════

    La ESCALERA de lo que le fuiste poniendo (`useReviewTrack`, solo para el
    entrenador: el cliente ya lee tus cambios en su semana) y lo que CONTESTA
    cada semana, que sí es suyo y lo ve. Es una sola consulta para las dos.
  */
  const { rows: revisiones, checkIns } = useReviewRows(activeClient?.id);
  const track = useReviewTrack(isClient ? [] : revisiones);

  /* El ancho de la tarjeta del peso, para dibujar la gráfica a píxel real. Se
     mide un contenedor SIEMPRE montado: el observador se engancha al montar, y
     uno condicional llega después y no se mide nunca. */
  const [refPeso, ancho] = useElementWidth();

  const program = workoutData[activeClient.id];
  const microcycles = useMemo(() => program?.microcycles || [], [program]);
  const anthro = anthropometry[activeClient.id];
  const history = useMemo(() => anthro?.history || [], [anthro]);
  const plan = nutrition[activeClient.id];
  const hoy = todayISO();

  const serie = useMemo(
    () => buildWeeklySeries({ microcycles, history, gender: activeClient.gender }),
    [microcycles, history, activeClient.gender]
  );
  const pesoActual = metricPoints(serie, 'weight').slice(-1)[0]?.value ?? null;
  const pesoWow = weekOverWeek(serie, 'weight');
  const checkIn = useMemo(() => weeklyCheckIn(history, hoy), [history, hoy]);

  const weeks = useMemo(() => microcycles.map((m) => m.weekNumber).sort((a, b) => a - b), [microcycles]);
  const latestWeek = weeks.length > 0 ? weeks[weeks.length - 1] : null;

  /*
    El protocolo decide qué secciones existen para este cliente. A quien solo le
    llevas el entrenamiento no le sobra el objetivo de kcal: es que no tiene
    nutrición, y una tarjeta con «sin plan» promete una pantalla que no existe.
  */
  const protocol = useMemo(() => clientProtocol(activeClient.preferences), [activeClient.preferences]);
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
    La tarifa y la antigüedad son del ENTRENADOR, no del cliente.

    Esta línea se pintaba igual en los dos lados, así que en «Mi progreso» la
    persona leía «Trimestral · 240 € · desde 18 may» debajo del título: lo que
    paga, recordado cada vez que entra a ver cómo va. Es información de la
    relación comercial —vive en su ficha, en Cobros y en el contrato—, no del
    progreso, y en su portal solo puede sonar a factura.

    Sin ella el portal no pierde nada: el mando del Resumen no lleva acciones,
    así que en el cliente la fila entera deja de existir y el panel sube.
  */
  const contexto =
    [activeClient.plan, activeClient.startDate && `desde ${shortDate(activeClient.startDate)}`].filter(Boolean).join(' · ') ||
    'Sin plan asignado';

  /* La escalera de lo que le fuiste poniendo es del entrenador y necesita al
     menos dos semanas de historia; si no, la curva del peso sola dice lo mismo
     sin fingir una escalera de un solo escalón. */
  const conAjustes = !isClient && track.length > 1;
  /* Los pasos se ofrecen cuando hay DOS semanas con dato: con una sola, la
     escalera es una raya y el conmutador promete una lectura que no existe. */
  const hayPasos = track.filter((f) => f.steps !== null && f.steps !== undefined).length > 1;

  const aDieta = isClient ? '/mi/dieta' : clientPath(activeClient.id, 'nutricion');
  const aEntreno = isClient ? '/mi/rutina' : clientPath(activeClient.id, 'rutina');
  const aFotos = isClient ? '/mi/evolucion/fotos' : clientPath(activeClient.id, 'revision/fotos');

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
      {!isClient && <Mando contexto={contexto} />}

      <div className="resumen">
        <div className="mosaico">
          <TarjetaComoVa
            goal={goal}
            canEditGoal={!isClient}
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
            pesoActual={pesoActual}
            trend={trend}
            veredicto={direccion}
            isClient={isClient}
            onAbrirFases={() => setVentana('fases')}
          />

          <TarjetaDesde
            history={history}
            microcycles={microcycles}
            program={program}
            startDate={activeClient.startDate}
            hoy={hoy}
            isClient={isClient}
          />

          {/* El medidor va en una celda propia y siempre montada: dentro, la
              tarjeta le quita su relleno a cada lado. */}
          <div className="mosaico-celda is-12" ref={refPeso}>
            <TarjetaCuerpo
              serie={serie}
              track={track}
              conAjustes={conAjustes}
              program={program}
              ancho={ancho - 44}
              banda={banda}
              onBanda={setBanda}
              hayPasos={hayPasos}
              pesoActual={pesoActual}
              pesoWow={pesoWow}
              checkIn={checkIn}
              isClient={isClient}
              onAbrir={() => setVentana('cuerpo')}
              aFotos={aFotos}
            />
          </div>

          {conEntreno && (
            <TarjetaEntreno
              program={program}
              microcycles={microcycles}
              cycleType={activeClient.cycleType}
              latestWeek={latestWeek}
              isClient={isClient}
              onAbrir={() => setVentana('entreno')}
            />
          )}
        </div>

        <aside className="resumen-lado">
          {/* El hilo va lo primero de la columna: es lo que se lee antes de
              escribirle. El cliente no lo ve —su portal ya cuenta su semana en
              cada sección— y sus respuestas tuyas las lee en la revisión. */}
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
          <TarjetaPlan
            goal={goal}
            pesoActual={pesoActual}
            plan={plan}
            program={program}
            conDieta={conDieta}
            conEntreno={conEntreno}
            aDieta={aDieta}
            aEntreno={aEntreno}
            /* El objetivo no vive en otra pantalla: se decide en las fases, y
               esa ventana es la misma que abre «Cómo va». */
            onAbrirFases={() => setVentana('fases')}
            isClient={isClient}
          />
          <TarjetaSensaciones checkIns={checkIns} microcycles={microcycles} protocol={protocol} span={12} isClient={isClient} />
        </aside>
      </div>
      </div>

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
          />
        )}
      </Suspense>
    </>
  );
};
