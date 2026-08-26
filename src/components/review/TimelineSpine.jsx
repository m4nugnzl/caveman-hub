import { useMemo } from 'react';

import { useElementWidth } from '@/lib/useElementWidth';
import { metricColor } from '@/domain/metrics';
import { makeScale, smoothPath } from '@/components/ui/charts';

/**
 * LA ESPINA: todo su proceso, en el alto de dos líneas de texto.
 *
 * ══ Qué hace aquí, arriba del todo y fuera de los apartados ═════════════════
 *
 * Es LA pieza que sostiene la pantalla. La revisión tiene tres apartados —peso,
 * entreno, fotos— y los tres hablan de UNA semana; sin algo que diga cuál, la
 * pantalla vuelve a ser tres bloques sueltos que además ahora se tapan entre
 * ellos. Esto es ese algo, y hace tres cosas a la vez:
 *
 *   1. **Es el selector de semana** de toda la pantalla. Se pulsa o se arrastra.
 *   2. **Es el contexto histórico**, que es lo que impide leer la cifra de esta
 *      semana en el aire: 81,5 kg viniendo de 84 y 81,5 viniendo de 79 son dos
 *      decisiones contrarias.
 *   3. **Es el mapa**: la banda dice qué trozo del proceso está desplegado en el
 *      apartado de abajo, así que cambiar de apartado nunca es perder el sitio.
 *
 * Con la escala de TODO el historial —no la de la ventana—, que es justo lo que
 * la hace útil: la caída de los tres primeros meses se ve como una caída aunque
 * ahora mismo estés mirando una meseta de cuatro semanas.
 *
 * ── Lo que lleva encima ────────────────────────────────────────────────────
 * El trazo entero en voz baja, el trozo de la ventana a plena tinta, un cursor
 * en la semana elegida y unas marcas diminutas abajo en las semanas que ya
 * contestaste. Esas marcas son la respuesta a «¿por dónde iba con éste?» en una
 * línea de treinta semanas, y no cuestan ni una consulta: ya venían con la fila.
 *
 * ── Por qué no lleva eje de kilos ──────────────────────────────────────────
 * Porque no se lee un valor aquí: se lee una FORMA. El valor está tres
 * centímetros más abajo, grande, y repetirlo en un texto de diez píxeles a lo
 * largo de treinta semanas es cromo. Los dos extremos —«S1» y «S24»— sí van,
 * porque sin ellos la espina es una forma bonita sin escala.
 */

const ALTO = 52;

export const TimelineSpine = ({ weeks = [], selected = null, onSelect, desde = 0, hasta = 0 }) => {
  const [ref, ancho] = useElementWidth();

  const geo = useMemo(() => {
    const n = weeks.length;
    if (n === 0 || ancho < 120) return null;

    const W = Math.max(240, ancho);
    const x = (i) => ((i + 0.5) * W) / n;

    const escala = makeScale(
      weeks.map((s) => s.weight).filter((v) => v !== null),
      { padRatio: 0.2 }
    );
    const y = (v) => {
      if (!escala) return ALTO / 2;
      const t = (v - escala.min) / (escala.max - escala.min || 1);
      return ALTO - 12 - t * (ALTO - 22);
    };

    const puntos = weeks
      .map((s, i) => (s.weight === null ? null : { i, x: x(i), y: y(s.weight) }))
      .filter(Boolean);

    return {
      W,
      x,
      columna: W / n,
      puntos,
      /* El trozo de curva que cae dentro de la ventana. Se dibuja aparte y
         encima: el resto queda tenue, que es lo que dice «estás mirando aquí»
         sin necesidad de una caja de selección con tiradores. */
      dentro: puntos.filter((p) => p.i >= desde && p.i < hasta),
    };
  }, [weeks, ancho, desde, hasta]);

  /* Arrastrar por la espina recorre el historial. La misma cuenta sirve para el
     ratón y para el dedo, como en el resto de los gráficos del producto. */
  const leer = (event) => {
    if (!geo) return;
    const r = event.currentTarget.getBoundingClientRect();
    const i = Math.floor(((event.clientX - r.left) / (r.width || 1)) * weeks.length);
    const fila = weeks[Math.min(weeks.length - 1, Math.max(0, i))];
    if (fila && fila.week !== selected) onSelect?.(fila.week);
  };

  if (weeks.length === 0) return null;

  return (
    <div className="espina" ref={ref}>
      {geo && (
        <svg
          className="espina-grafico"
          width={geo.W}
          height={ALTO}
          viewBox={`0 0 ${geo.W} ${ALTO}`}
          role="img"
          aria-label={`Todo su proceso, de la semana ${weeks[0].week} a la ${weeks[weeks.length - 1].week}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            leer(e);
          }}
          onPointerMove={(e) => e.buttons === 1 && leer(e)}
        >
          {/* La ventana, como una banda de luz sobre el proceso. Solo cuando de
              verdad recorta algo: con la línea entera desplegada abajo, una
              banda que abarca los treinta puntos no señala nada. */}
          {hasta > desde && hasta - desde < weeks.length && (
            <rect
              className="espina-ventana"
              x={geo.x(desde) - geo.columna / 2}
              width={geo.columna * (hasta - desde)}
              y="0"
              height={ALTO}
            />
          )}

          {geo.puntos.length > 1 && (
            <path
              className="espina-trazo"
              d={smoothPath(geo.puntos)}
              fill="none"
              stroke={metricColor('weight')}
            />
          )}
          {geo.dentro.length > 1 && (
            <path
              className="espina-trazo is-now"
              d={smoothPath(geo.dentro)}
              fill="none"
              stroke={metricColor('weight')}
            />
          )}

          {/* Dónde ya hubo respuesta. Diminutas y al canto: son el rastro del
              trabajo hecho, no un dato del cliente. */}
          {weeks.map((s, i) =>
            s.reviewed ? (
              <rect
                className="espina-hito"
                key={`h-${s.week}`}
                x={geo.x(i) - 1}
                width="2"
                y={ALTO - 4}
                height="3"
                rx="1"
              />
            ) : null
          )}

          {/* El cursor: dónde cae, en el proceso entero, la semana que revisas. */}
          {weeks.map((s, i) =>
            s.week === selected ? (
              <g key="cursor">
                <line className="espina-cursor" x1={geo.x(i)} x2={geo.x(i)} y1="2" y2={ALTO - 6} />
                {s.weight !== null && (
                  <circle
                    className="espina-punto"
                    cx={geo.x(i)}
                    cy={geo.puntos.find((p) => p.i === i)?.y ?? ALTO / 2}
                    r="3.5"
                    fill={metricColor('weight')}
                  />
                )}
              </g>
            ) : null
          )}
        </svg>
      )}

      <div className="espina-pie" aria-hidden="true">
        <span>S{weeks[0]?.week}</span>
        <span>S{weeks[weeks.length - 1]?.week}</span>
      </div>
    </div>
  );
};
