import { useEffect, useRef } from 'react';

import { metricColor } from '@/domain/metrics';
import { LOCALE } from '@/lib/dates';
import { traeALaVista } from '@/lib/motion';
import { Sparkline } from '@/components/ui/charts';
import { Modal } from '@/components/ui/Modal';

/**
 * EL HISTORIAL DE UN EJERCICIO, a pantalla completa.
 *
 * ══ De dónde sale esta forma ════════════════════════════════════════════════
 *
 * De la referencia que mandó el entrenador: un raíl de fechas a la izquierda y
 * una tarjeta por sesión a la derecha, con las series una debajo de otra. Es la
 * forma correcta y por un motivo que no es de gusto — **un historial de
 * entrenamiento es un registro, y un registro se lee hacia abajo**, con la fecha
 * al canto haciendo de índice.
 *
 *      AGO  ○┌──────────────────────────────────────┐
 *       10  ││ Semana 23 · Día 1                    │
 *           ││ 240   × 2  @7   tope                 │
 *           │└──────────────────────────────────────┘
 *      AGO  ●┌──────────────────────────────────────┐
 *       17  ││ Semana 24 · Día 1        ↑ 2,5 kg    │
 *           ││ 242,5 × 2  @7   tope                 │
 *           ││ 195   × 4  @3                        │
 *           │└──────────────────────────────────────┘
 *
 * ══ Y va de ANTIGUO a NUEVO, con lo último abajo ═══════════════════════════
 *
 * Estuvo al revés, con el argumento de que «un historial se lee desde hoy». No
 * es verdad de un registro de entrenamiento: **su eje es el tiempo, y el tiempo
 * va hacia abajo**. Con lo nuevo arriba, la flecha «↑ subió» de una sesión
 * apunta a la fila de DEBAJO —la anterior— y hay que leer el bloque hacia atrás
 * para entender una comparación que se explica hacia delante. Es además la misma
 * dirección que la recta de la tarjeta, donde lo viejo está a la izquierda: dos
 * piezas del mismo dato no pueden discrepar en hacia dónde crece el tiempo.
 *
 * Lo que sí hacía bien el orden invertido era aterrizar en la última sesión, y
 * eso se conserva sin invertir nada: al abrirse, la ficha se desplaza hasta el
 * final. Ver `traeALaVista`, que respeta a quien ha pedido menos movimiento.
 *
 * ══ Y las tres cosas que le faltaban a la referencia ════════════════════════
 *
 *   1. **La cabecera con la tendencia.** El registro cuenta qué pasó cada día;
 *      no contesta «¿esto va a alguna parte?». Arriba van el recorrido en kilos,
 *      el veredicto y la forma de la carga, que es la pregunta con la que se
 *      abre esta ficha.
 *   2. **La serie tope marcada, y dicho por qué.** Con cinco series por sesión,
 *      la que decide si progresó es una, y encontrarla obliga a comparar cinco
 *      números en cada tarjeta. Marcada y con su etiqueta, la comparación entre
 *      semanas se hace mirando una sola fila por bloque.
 *   3. **Qué cambió de una sesión a la siguiente.** La lista dice qué levantó
 *      cada día; la flecha de cada tarjeta dice si eso fue más o menos que la
 *      vez anterior, que es lo que se está buscando al bajar por el registro.
 *
 * ── Por qué esto SÍ es un diálogo ──────────────────────────────────────────
 * El resto de la revisión se despliega en la propia hoja: un diálogo en mitad de
 * una decisión tapa la curva justo cuando hace falta. Aquí no: mirar el
 * historial de un ejercicio es salirse un momento de la revisión para consultar
 * un archivo, y volver. Es la única pieza de la pantalla que hace eso.
 */

/** «17 AGO» partido en dos, para el canto del raíl. */
const canto = (iso) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    dia: d.toLocaleDateString(LOCALE, { day: 'numeric', timeZone: 'UTC' }),
    mes: d.toLocaleDateString(LOCALE, { month: 'short', timeZone: 'UTC' }).replace('.', ''),
  };
};

const VEREDICTO = {
  up: { className: 'delta delta-good', text: 'progresa' },
  down: { className: 'delta delta-bad', text: 'baja' },
  flat: { className: 'delta delta-flat', text: 'se mantiene' },
};

/* La flecha de una sesión contra la anterior SUYA. La calcula `exerciseTrack`
   con la regla del producto —más kilos, o los mismos kilos con más
   repeticiones— así que aquí solo se pinta. */
const PASO = {
  up: { className: 'delta delta-good', text: 'subió' },
  down: { className: 'delta delta-bad', text: 'bajó' },
  flat: { className: 'delta delta-flat', text: 'igual' },
};

export const ExerciseSheet = ({ trend, open, onClose }) => {
  /* La última sesión, para aterrizar en ella. El registro va de antiguo a nuevo
     —el tiempo baja— así que sin esto la ficha se abre en la primera semana del
     bloque, que es la que menos importa. */
  const ultima = useRef(null);
  const nombre = trend?.name || null;

  useEffect(() => {
    if (!open || !nombre) return;
    traeALaVista(ultima.current, { block: 'nearest' });
    /* `nombre` en las dependencias y no `trend`: abrir la ficha de otro
       ejercicio sin cerrar la anterior tiene que volver a bajar al final. */
  }, [open, nombre]);

  if (!trend) return null;

  /* De la más vieja a la más reciente: el eje de un registro es el tiempo, y el
     tiempo va hacia abajo. Ver la cabecera. */
  const sesiones = trend.sessions;
  const v = trend.verdict ? VEREDICTO[trend.verdict] : null;

  return (
    <Modal open={open} title={trend.name} onClose={onClose} size="md">
      <div className="col gap-4">
        {/* ── Lo que la referencia no tenía: ¿va a alguna parte? ────────── */}
        <header className="hist-cabecera">
          <div className="hist-cabecera-say">
            <span className="section-label">De dónde a dónde</span>
            <div className="hist-recorrido">
              <span className="v">
                {trend.from}
                <span className="a">→</span>
                {trend.to}
              </span>
              <span className="u">kg</span>
            </div>
            <div className="row gap-2 wrap">
              {trend.stalled >= 3 ? (
                <span className="delta delta-flat">{trend.stalled} semanas sin subir</span>
              ) : (
                v && <span className={v.className}>{v.text}</span>
              )}
              <span className="t-xs t-tertiary">
                {trend.weeks} {trend.weeks === 1 ? 'sesión registrada' : 'sesiones registradas'}
              </span>
            </div>
          </div>

          {/* La forma de la carga. Va en su propio recuadro y no suelta sobre el
              fondo: una línea a sangre en mitad de una cabecera se lee como un
              filete decorativo, que es como se veía. */}
          {trend.points.length > 1 && (
            <div className="hist-forma">
              <Sparkline points={trend.points} color={metricColor('topKg')} height={52} />
              <span className="hist-forma-pie">
                <span>S{trend.sessions[0]?.week}</span>
                <span>S{trend.sessions[trend.sessions.length - 1]?.week}</span>
              </span>
            </div>
          )}
        </header>

        {/* ── El registro ─────────────────────────────────────────────── */}
        <ol className="hist">
          {sesiones.map((sesion, i) => {
            const fecha = canto(sesion.date);
            const paso = sesion.trend ? PASO[sesion.trend] : null;

            return (
              <li
                className={`hist-alto${i === sesiones.length - 1 ? ' is-ultima' : ''}`}
                key={sesion.week}
                ref={i === sesiones.length - 1 ? ultima : null}
              >
                <div className="hist-canto">
                  {fecha && (
                    <>
                      <span className="mes">{fecha.mes}</span>
                      <span className="dia">{fecha.dia}</span>
                    </>
                  )}
                </div>

                <div className="hist-tarjeta">
                  <div className="hist-head">
                    <span className="s">Semana {sesion.week}</span>
                    <span className="row gap-2">
                      {sesion.reps ? (
                        <span className="r">{sesion.reps} repeticiones</span>
                      ) : null}
                      {paso && <span className={paso.className}>{paso.text}</span>}
                    </span>
                  </div>

                  <ul className="hist-series">
                    {sesion.sets.map((set, i) => (
                      <li
                        key={i}
                        /* La serie tope, marcada. Con cinco por sesión, la que
                           decide si progresó es una sola. */
                        className={`hist-serie${set === sesion.top ? ' is-tope' : ''}`}
                      >
                        <span className="kg">{set.kg === null ? '' : set.kg}</span>
                        <span className="x" aria-hidden="true">
                          ×
                        </span>
                        <span className="reps">{set.reps}</span>
                        <span className="rir">{set.rir === null ? '' : `@${set.rir}`}</span>
                        {/* Dicho con su nombre y no solo en negrita: en un
                            registro de cinco filas, «la que está más oscura» no
                            es una explicación de nada. */}
                        {set === sesion.top && <span className="tag">tope</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Modal>
  );
};
