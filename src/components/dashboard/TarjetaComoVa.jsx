import { Check, CircleHelp, Target, TriangleAlert } from 'lucide-react';

import { GOAL_DIRECTIONS } from '@/domain/goals';
import { phaseProgress, phaseProjection } from '@/domain/roadmap';
import { metricColor } from '@/domain/metrics';
import { localeNumber, shortDate } from '@/lib/dates';
import { Tarjeta } from './Tarjeta';
import { Trayectoria } from './Trayectoria';

const MARCA = { good: Check, warn: TriangleAlert, bad: TriangleAlert, unknown: CircleHelp };
const kg = (v) => `${v > 0 ? '+' : ''}${Number(v).toLocaleString('es-ES', { maximumFractionDigits: 1 })}`;
/* Los tres hitos y el objetivo llegan del dominio como NÚMEROS —que es lo que
   tienen que ser— y se decían tal cual: «80.7 → 76.9». En la misma tarjeta, dos
   líneas más abajo, el veredicto ya decía «−0,45 kg/semana». Se dicen en
   español aquí, que es donde se pintan. */
const peso = (v) => localeNumber(v, { maximumFractionDigits: 1 });

/**
 * El veredicto, dicho para quien lo lee.
 *
 * `domain/reading.js` es el motor de lectura DEL ENTRENADOR: sus textos hablan
 * de decisiones que solo él puede tomar. Casi todos valen igual para el cliente
 * —«la tendencia es poco fiable», «faltan semanas»— porque describen los datos.
 * El de «no hay objetivo» no: dice «es lo primero que conviene fijar», y el
 * cliente no puede fijar nada. Lo veía en su portada, en la tarjeta grande y en
 * rojo: un reproche por algo que no está en su mano, en la pantalla que existe
 * para enseñarle que va bien.
 *
 * Se traduce aquí, que es donde se pinta, y no en el dominio: allí duplicaría
 * cada hallazgo en dos idiomas para una excepción. Lo que no está en la tabla
 * se dice tal cual.
 */
/*
  El peso objetivo NO se pone aquí. Vivió al pie de esta tarjeta —un formulario
  diminuto con su caja y su botón— y era un ajuste dentro de la pantalla que
  existe para LEER: la tarjeta cuenta dónde acaba, y debajo pedía teclear dónde
  tenía que acabar. Se fija una vez y se corrige poco; el sitio es la ventana de
  fases, que es donde se decide el proceso entero (ver `roadmap/RoadmapPanel`),
  y a la que se llega desde la puerta de esta misma cabecera.
*/
const PARA_EL_CLIENTE = {
  'no-goal': {
    title: 'Tu entrenador aún no ha fijado tu objetivo',
    detail: 'En cuanto lo fije, aquí verás cómo va tu peso semana a semana.',
  },
};

/**
 * EL RITMO, DICHO COMO UN HECHO. Lo que el cliente lee en vez del veredicto.
 *
 * ══ Por qué el cliente no ve el veredicto ══════════════════════════════════
 *
 * Porque está escrito en el prototipo que el dueño aprobó
 * (`docs/portal-dos-aparatos.html`, «mi progreso»): *«lo que sigue fuera es el
 * veredicto: ni nota de adherencia, ni "en rumbo". Las cifras son suyas; el
 * juicio es de su entrenador»*. Y en la app estaba dentro: su panel abría con
 * **«✓ En rumbo: −0,34 kg/semana»** en verde, con marca de aprobado.
 *
 * Son las dos leyes de la casa a la vez: el semáforo JUZGA (`ley-del-color`) y
 * la app RESALTA, no dictamina (`la-app-no-receta`). Un «en rumbo» en verde en
 * la pantalla del cliente es la aplicación poniéndole nota a su semana por
 * delante de la persona que le cobra por ponérsela.
 *
 * El dato no se le quita —es suyo—: se le da sin el juicio. «A tu ritmo de las
 * últimas ocho semanas, −0,34 kg por semana» es exactamente la misma cifra y es
 * la frase del prototipo.
 */
const ritmoDelCliente = (trend) => {
  if (!trend?.ok || !Number.isFinite(trend.perWeek)) return null;
  /* Con dos decimales y el signo menos de verdad (−, no el guion): es la cifra
     con la que su entrenador decide, y redondeada a uno «−0,34» sale «−0,3», que
     es otra. `kg()` de aquí arriba redondea a uno a propósito para el desvío del
     objetivo, que es otra cosa. */
  const n = `${trend.perWeek > 0 ? '+' : '−'}${localeNumber(Math.abs(trend.perWeek), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return {
    title: `A tu ritmo de las últimas ${trend.weeks} semanas`,
    detail: `${n} kg por semana`,
  };
};

/**
 * CÓMO VA — la tarjeta que manda en el panel.
 *
 * ══ Lo que dice: dónde va a acabar ═════════════════════════════════════════
 *
 * La cuenta que un entrenador NO puede hacer de cabeza —y la que decide si toca
 * algo esta semana— es la proyección: a este ritmo, y con las semanas que quedan
 * de fase, ¿dónde acaba? ¿Y coincide con dónde tenía que acabar?
 *
 *     80,8  →  77,3  →  75,4          ┌────────────────────────┐
 *     empezó   hoy    si sigue así    │ ╲__                    │
 *                                     │    ╲___●· · · ·○ 75,4  │
 *     ✓ En rumbo                      │                ┈ 74,9  │
 *       Acaba 0,4 kg por encima…      └────────────────────────┘
 *     ▓▓▓▓▓▓▓▓░░░░ Definición · semana 8 de 12 · después, Volumen
 *
 * A la izquierda, la cuenta en tres pesos —ninguno repetido— y el veredicto. A
 * la derecha, la misma cuenta DIBUJADA (`Trayectoria`): lo que ha pesado en la
 * fase, la recta a donde acaba y la marca del objetivo. Debajo, la fase, que es
 * el criterio con el que se juzga todo lo de arriba.
 *
 * ── Lo que ya no lleva ──────────────────────────────────────────────────────
 * Las palancas —calorías, pasos, cardio, días— vivían al pie de esta tarjeta y
 * la convertían en un informe de metro y medio. Son otra pregunta («¿con qué?»)
 * y tienen su tarjeta al lado (`TarjetaConQue`).
 *
 * ── Y cuando no se puede proyectar ──────────────────────────────────────────
 * Sin fase con final decidido, sin objetivo o sin semanas suficientes de
 * pesajes, no hay proyección que dar y se dice lo que sí se sabe: el veredicto
 * de `domain/reading.js` con su marca. Inventar un final sería peor que no
 * darlo.
 */
export const TarjetaComoVa = ({
  goal,
  canEditGoal = false,
  onSetGoal,
  fases,
  hoy,
  history,
  trend,
  veredicto,
  isClient = false,
  onAbrirFases,
}) => {
  /*
    Al cliente se le traduce lo que describe los DATOS —«faltan semanas», «la
    tendencia es poco fiable»— y se le retira lo que le pone nota. Ver
    `ritmoDelCliente`, que es lo que lee en su lugar.
  */
  const suRitmo = isClient ? ritmoDelCliente(trend) : null;
  const dicho = isClient
    ? PARA_EL_CLIENTE[veredicto?.id] || suRitmo || veredicto
    : veredicto;
  /* Sin tono para el cliente: la marca de aprobado y el verde son el juicio, y
     el juicio es de su entrenador. Lo que queda es la cifra. */
  const tono = isClient ? 'neutro' : veredicto?.tone || 'unknown';
  const Icono = MARCA[tono] || CircleHelp;

  const fase = fases?.current || null;
  const progreso = fase ? phaseProgress(fase, hoy) : null;
  const siguiente = fases?.next || null;

  const proyeccion = fase
    ? phaseProjection({ phase: fase, history, perWeek: trend.ok ? trend.perWeek : null, goal, date: hoy })
    : null;

  return (
    <Tarjeta
      rotulo={isClient ? 'Cómo vas' : 'Cómo va'}
      span={8}
      /* Aquí vivió `lumbre-dato` (la luz que sale del último dato, de noche).
         Con la rejilla de estantes, una caja iluminada entre seis apagadas
         dejó de leerse como firma — «¿por qué el cómo va está sombreado
         distinto?» (dueño, 6 sep) — y la luz pasó a ser del GESTO: cualquier
         tarjeta se alza al pasar (ver `.tarjeta:hover` en revision.css). La
         lumbre del dato queda solo en el hero de la Revisión, que es su
         pantalla firma. */
      className="comova"
      /* La puerta dice a DÓNDE lleva, no dónde estás. Ponía el nombre de la fase
         («Definición →») y eso fallaba dos veces: repetía por tercera vez una
         palabra que ya está en el pie de esta misma tarjeta, y no dejaba
         adivinar que abre el roadmap. Ahora se llama como la ventana que abre,
         que es la regla del resto de puertas del panel («Ver a fondo →»). */
      accion={
        <button type="button" className="cab-accion is-puerta" aria-haspopup="dialog" onClick={onAbrirFases}>
          {isClient ? 'Tus fases' : 'Sus fases'}
        </button>
      }
    >
      <div className={`comova-cuerpo${fase ? ' con-trayecto' : ''}`}>
        <div className="comova-lectura">
          {proyeccion && (
            <ol className="proyeccion">
              <li className="proyeccion-hito">
                <span className="proyeccion-v">{peso(proyeccion.desde)}</span>
                <span className="proyeccion-k">al empezar</span>
              </li>
              <li className="proyeccion-hito is-hoy">
                <span className="proyeccion-v" style={{ color: metricColor('weight') }}>
                  {peso(proyeccion.hoy)}
                </span>
                <span className="proyeccion-k">hoy</span>
              </li>
              <li className="proyeccion-hito">
                <span className="proyeccion-v">{peso(proyeccion.proyectado)}</span>
                <span className="proyeccion-k">
                  {proyeccion.restantes === 0
                    ? 'al acabar'
                    : `en ${proyeccion.restantes} ${proyeccion.restantes === 1 ? 'semana' : 'semanas'}, si sigue así`}
                </span>
              </li>
            </ol>
          )}

          {/*
            ── El veredicto — salvo cuando lo que falta es el objetivo ─────────
            «No hay un objetivo declarado», con su marca de aviso y sus dos
            frases, era la casa riñendo por algo que se arregla en los tres
            chips de aquí debajo. Cuando quien mira PUEDE ponerlo, el hueco se
            dice como pregunta con el gesto («¿Qué busca?») y el sermón sobra;
            el cliente, que no puede fijar nada, sigue leyendo su versión
            traducida.
          */}
          {!(canEditGoal && !goal && veredicto?.id === 'no-goal') && (
          <p className={`comova-juicio is-${tono}`}>
            {/* La marca es la del veredicto: un visto, un aviso. Al cliente no
                se le pone nota, así que no lleva ninguna. */}
            {!isClient && (
              <span className="comova-marca" aria-hidden="true">
                <Icono size={13} strokeWidth={2.5} />
              </span>
            )}
            <span className="comova-say">
              <strong>{dicho?.title || (proyeccion ? 'Sin veredicto' : 'Todavía no hay nada que leer')}</strong>
              {proyeccion && proyeccion.objetivo !== null ? (
                /* Corto a propósito: el ritmo ya lo dice el veredicto de al
                   lado y el objetivo ya está dibujado en la trayectoria — la
                   frase larga los repetía a ambos y el hero era un párrafo. */
                <span className="comova-detalle">
                  {proyeccion.desvio === 0
                    ? `acaba clavado en el objetivo (${peso(proyeccion.objetivo)} kg)`
                    : `acaba ${kg(Math.abs(proyeccion.desvio))} kg ${proyeccion.desvio > 0 ? 'sobre' : 'bajo'} el objetivo (${peso(proyeccion.objetivo)} kg)`}
                </span>
              ) : (
                dicho?.detail && <span className="comova-detalle">{dicho.detail}</span>
              )}
            </span>
          </p>
          )}

          {/*
            Sin objetivo, lo único que hay que hacer: ponerlo. Los tres chips aquí
            mismo y no en una pantalla de ajustes, porque es lo que desbloquea la
            lectura de todo el panel.
          */}
          {canEditGoal && !goal && (
            <div className="goal-set" role="group" aria-label="Objetivo del cliente">
              <Target size={13} />
              <span className="k">¿Qué busca?</span>
              {GOAL_DIRECTIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="chip"
                  aria-pressed={false}
                  title={d.hint}
                  onClick={() => onSetGoal(d.id)}
                >
                  {d.short}
                </button>
              ))}
            </div>
          )}
        </div>

        {fase && (
          <Trayectoria
            fase={fase}
            history={history}
            proyeccion={proyeccion}
            hoy={hoy}
            color={metricColor('weight')}
            ariaLabel={`Peso durante ${fase.title}`}
          />
        )}
      </div>

      {fase && (
        <div className="comova-fase">
          <div className="plan-bar is-fase">
            <span className="plan-bar-fill" style={{ width: `${progreso?.pct ?? 0}%` }} />
          </div>
          <span className="comova-fase-say">
            <strong>{fase.title}</strong>
            {progreso?.total ? (
              <>
                {' · '}semana {Math.ceil(progreso.elapsed / 7)} de {Math.ceil(progreso.total / 7)}
                {siguiente ? ` · después, ${siguiente.title}` : ''}
              </>
            ) : (
              <> · desde el {shortDate(fase.startsOn)}, sin final decidido</>
            )}
          </span>
        </div>
      )}
    </Tarjeta>
  );
};
