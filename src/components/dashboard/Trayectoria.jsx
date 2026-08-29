import { useMemo } from 'react';

import { weeklyWeightAverages } from '@/domain/anthropometry';
import { daysBetween, weekStart } from '@/lib/dates';
import { useElementWidth } from '@/lib/useElementWidth';
import { makeScale, smoothPath } from '@/components/ui/charts';

const ALTO = 124;
const PAD = { top: 10, right: 62, bottom: 18, left: 36 };
const kg = (v) => (Math.round(v * 10) / 10).toLocaleString('es-ES');

/**
 * LA TRAYECTORIA DE LA FASE: de dónde viene, dónde está y adónde va.
 *
 * ══ Por qué existe, si ya están los tres números ═══════════════════════════
 *
 * «80,7 → 76,9 → 75,0» es la cuenta hecha. Lo que no dice es la FORMA: si bajó
 * de golpe las tres primeras semanas y lleva un mes plano, o si ha bajado a
 * ritmo constante, la proyección es la misma y la decisión, distinta. Y un
 * entrenador lee una curva antes que tres cifras.
 *
 *     81 ┼·····╲_
 *        │       ╲__
 *     78 ┼··········╲___●· · · · · ·○ 75,0
 *        │                          ┈ 74,9 obj.
 *     75 ┼···························
 *        S1            hoy         S12
 *
 * · Lo SÓLIDO es lo que ha pesado, semana a semana, desde que empezó la fase.
 * · Lo PUNTEADO es lo que pasará si sigue así: una recta hasta el final de la
 *   fase, que acaba en el peso proyectado.
 * · La MARCA del final es el objetivo de la fase. Si el punteado acaba encima
 *   de la marca, va en rumbo; la distancia entre los dos es el desvío.
 *
 * Tres cosas y ninguna más: sin rejilla de días, sin banda de tolerancia, sin
 * media móvil. Es un instrumento de UNA lectura —«¿llega?»— y todo lo que se
 * añada se la quita.
 *
 * ── Sin final decidido ──────────────────────────────────────────────────────
 * Con una fase abierta no hay adónde proyectar: se dibuja lo sólido y nada más.
 * Inventar un final sería peor que no darlo.
 */
export const Trayectoria = ({ fase, history, proyeccion = null, hoy, color, ariaLabel = 'Trayectoria de la fase' }) => {
  const [ref, medido] = useElementWidth(320);
  const W = Math.max(240, medido);
  const innerW = W - PAD.left - PAD.right;
  const innerH = ALTO - PAD.top - PAD.bottom;

  const datos = useMemo(() => {
    const inicio = weekStart(fase?.startsOn);
    if (!inicio) return null;
    const total = proyeccion?.semanas ?? null;
    const semanaHoy = Math.max(0, (daysBetween(inicio, weekStart(hoy)) ?? 0) / 7);

    const reales = weeklyWeightAverages(history)
      .filter((w) => w.date >= inicio && w.date <= hoy)
      .map((w) => ({ x: (daysBetween(inicio, w.date) ?? 0) / 7, y: w.value }));

    /* El largo del eje: la fase entera si tiene final; si no, lo andado más una
       semana de aire, para que el último punto no toque el borde. */
    const largo = total ?? Math.max(semanaHoy, reales[reales.length - 1]?.x ?? 0) + 1;
    return { reales, total, largo };
  }, [fase, history, proyeccion, hoy]);

  if (!datos || datos.reales.length === 0) return null;

  const { reales, total, largo } = datos;
  const conProyeccion = Boolean(proyeccion) && total !== null;

  const valores = [
    ...reales.map((p) => p.y),
    ...(conProyeccion ? [proyeccion.proyectado, proyeccion.objetivo].filter((v) => v !== null) : []),
  ];
  const escala = makeScale(valores, { padRatio: 0.22 });
  if (!escala) return null;

  const xAt = (semana) => PAD.left + (largo <= 0 ? 0 : (semana / largo) * innerW);
  const yAt = (v) => PAD.top + innerH - ((v - escala.min) / (escala.max - escala.min || 1)) * innerH;

  const coords = reales.map((p) => ({ x: xAt(p.x), y: yAt(p.y) }));
  const ultimo = coords[coords.length - 1];
  const camino = coords.length > 1 ? smoothPath(coords) : '';
  const suelo = PAD.top + innerH;
  const ticks = [escala.max, (escala.max + escala.min) / 2, escala.min];
  const xFin = total !== null ? xAt(total) : null;
  const objetivoArriba = conProyeccion && proyeccion.objetivo !== null && proyeccion.objetivo > proyeccion.proyectado;

  return (
    <figure className="trayecto" ref={ref}>
      <svg className="chart" width={W} height={ALTO} viewBox={`0 0 ${W} ${ALTO}`} role="img" aria-label={ariaLabel}>
        <g className="chart-grid">
          {ticks.map((t, i) => (
            <line key={i} x1={PAD.left} x2={W - PAD.right} y1={yAt(t)} y2={yAt(t)} />
          ))}
        </g>
        <g className="chart-axis">
          {ticks.map((t, i) => (
            <text key={i} x={PAD.left - 6} y={yAt(t)} textAnchor="end" dominantBaseline="middle">
              {Math.round(t * 10) / 10}
            </text>
          ))}
          <text x={PAD.left} y={ALTO - 4} textAnchor="start">
            S1
          </text>
          {xFin !== null && (
            <text x={xFin} y={ALTO - 4} textAnchor="end">
              S{total}
            </text>
          )}
        </g>

        {/* Hoy: la vertical que separa lo medido de lo previsto. */}
        <line className="trayecto-hoy" x1={ultimo.x} x2={ultimo.x} y1={PAD.top} y2={suelo} />
        {xFin === null || xFin - ultimo.x > 30 ? (
          <text className="chart-axis trayecto-hoy-k" x={ultimo.x} y={ALTO - 4} textAnchor="middle">
            hoy
          </text>
        ) : null}

        {camino && (
          <>
            <path
              className="trayecto-area"
              d={`${camino} L ${ultimo.x.toFixed(1)} ${suelo} L ${coords[0].x.toFixed(1)} ${suelo} Z`}
              fill={color}
            />
            <path className="chart-line" d={camino} stroke={color} />
          </>
        )}
        <circle cx={ultimo.x} cy={ultimo.y} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />

        {conProyeccion && (
          <>
            <line
              className="trayecto-prevista"
              x1={ultimo.x}
              y1={ultimo.y}
              x2={xFin}
              y2={yAt(proyeccion.proyectado)}
              stroke={color}
            />
            <circle className="trayecto-fin" cx={xFin} cy={yAt(proyeccion.proyectado)} r="4" stroke={color} />
            <text className="trayecto-v" x={xFin + 9} y={yAt(proyeccion.proyectado)} dominantBaseline="middle">
              {kg(proyeccion.proyectado)}
            </text>
            {proyeccion.objetivo !== null && (
              <>
                <line
                  className="trayecto-objetivo"
                  x1={xFin - 14}
                  x2={xFin + 4}
                  y1={yAt(proyeccion.objetivo)}
                  y2={yAt(proyeccion.objetivo)}
                />
                <text
                  className="trayecto-objetivo-k"
                  x={xFin + 9}
                  y={yAt(proyeccion.objetivo) + (objetivoArriba ? -9 : 9)}
                  dominantBaseline="middle"
                >
                  {kg(proyeccion.objetivo)} obj.
                </text>
              </>
            )}
          </>
        )}
      </svg>
    </figure>
  );
};
