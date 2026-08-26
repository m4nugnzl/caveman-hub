import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { metricColor } from '@/domain/metrics';
import { useElementWidth } from '@/lib/useElementWidth';
import { makeScale, smoothPath } from '@/components/ui/charts';

/**
 * UN EJERCICIO: la recta de su carga, y las cifras de la semana que señales.
 *
 * ══ Por qué una gráfica y no una fila de tabla ══════════════════════════════
 *
 * Porque la pregunta del entrenador no es «¿qué levantó?» sino «¿esto va a
 * alguna parte?», y eso es una FORMA. Una tabla con dos sesiones al lado
 * contesta la mitad —si subió respecto de la última vez— y esconde la otra
 * mitad: alguien que sube, baja y vuelve a subir está estancado aunque la última
 * flecha diga que subió, y en una tabla de dos columnas eso no se ve nunca.
 *
 *     ┌──────────────────────────────────────┐
 *     │ Press Banca                       ›  │
 *     │ 45 kg × 8      ↑ 2,5 vs S2           │  ← la cifra de la semana señalada
 *     │           ╭────────●  45             │
 *     │      ╭────╯                          │  ← la recta: de dónde viene
 *     │  40 ●                                │
 *     │  S1                    S3            │
 *     │  45×8   45×8   45×6                  │  ← lo que anotó esa semana
 *     └──────────────────────────────────────┘
 *
 * ── Y se DESLIZA ───────────────────────────────────────────────────────────
 * Pasar el dedo o el ratón por la recta mueve la semana señalada, y con ella la
 * cifra de arriba, el salto respecto de la anterior y las series de abajo. Es la
 * diferencia entre un dibujo y un instrumento: se recorre el bloque entero sin
 * abrir nada, comparando la sesión que quieras con la de al lado.
 *
 * Al soltar vuelve a la última, que es donde se está revisando. Un cursor que se
 * queda donde lo dejaste hace que ocho tarjetas acaben hablando de ocho semanas
 * distintas, y entonces la rejilla deja de poderse leer en diagonal.
 *
 * ── Los dos extremos van rotulados, y nada más ─────────────────────────────
 * El primero y el último punto llevan sus kilos escritos: son «de dónde viene» y
 * «dónde está», que es la comparación que se busca al mirar de reojo. Los de en
 * medio no, porque para eso está el deslizar — y ocho cifras sobre una recta de
 * doscientos píxeles son una mancha, no una escala.
 *
 * ══ Qué se dibuja: los KILOS de la serie tope ══════════════════════════════
 *
 * El dato en crudo, sin ninguna fórmula por medio. El 1RM estimado no se enseña
 * —tiene varios kilos de margen y decidiría por el entrenador— y el tonelaje
 * sube por ponerle un día más. Aquí se dibuja lo que levantó.
 *
 * La única cifra derivada es el salto contra la sesión anterior, y usa la regla
 * del producto: más kilos, o los mismos kilos con más repeticiones. Ver
 * `compara` en `domain/week.js`.
 */

const ALTO = 78;
const CEJA = 16; /* aire de arriba para el rótulo del último punto */
const PIE = 14; /* y de abajo para el del primero y las semanas */

/** `42,5` y no `42.5`. */
const kg = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-ES'));

/* Cuántas series caben antes de que la tarjeta deje de leerse de un vistazo. */
const MAX_SERIES = 6;

const SALTO = {
  up: { className: 'delta delta-good', text: '↑' },
  down: { className: 'delta delta-bad', text: '↓' },
  flat: { className: 'delta delta-flat', text: '=' },
};

export const ExerciseCard = ({ ejercicio, trend, semana, onOpen }) => {
  const [ref, ancho] = useElementWidth();
  /* Qué semana se está señalando con el dedo. `null` es «la última», que es
     donde se está revisando. */
  const [mirando, setMirando] = useState(null);

  /* El `|| []` va dentro de un `useMemo`: un literal nuevo en cada render
     invalidaría la geometría de abajo, y esto se vuelve a dibujar a cada píxel
     que recorre el dedo por la recta. */
  const sesiones = useMemo(() => trend?.sessions || [], [trend]);
  const ultima = sesiones.length - 1;
  const i = mirando === null ? ultima : mirando;
  const foco = sesiones[i] || null;

  const geo = useMemo(() => {
    const n = sesiones.length;
    if (n === 0 || ancho < 80) return null;

    const W = Math.max(120, ancho);
    const x = (k) => (n === 1 ? W / 2 : 6 + (k / (n - 1)) * (W - 12));

    const escala = makeScale(
      sesiones.map((s) => s.topKg).filter((v) => v !== null && v !== undefined),
      { padRatio: 0.3 }
    );
    const y = (v) => {
      if (!escala) return (CEJA + ALTO - PIE) / 2;
      const t = (v - escala.min) / (escala.max - escala.min || 1);
      return ALTO - PIE - t * (ALTO - PIE - CEJA);
    };

    const puntos = sesiones
      .map((s, k) => (s.topKg === null || s.topKg === undefined ? null : { k, x: x(k), y: y(s.topKg) }))
      .filter(Boolean);

    const trazo = puntos.length > 1 ? smoothPath(puntos) : '';
    /* El área cierra contra el suelo de la caja, no contra cero: lo que apoya la
       recta es su propia caja, y cero está a cuarenta kilos de aquí abajo. */
    const area =
      puntos.length > 1
        ? `${trazo} L ${puntos[puntos.length - 1].x.toFixed(1)} ${ALTO - PIE} L ${puntos[0].x.toFixed(1)} ${ALTO - PIE} Z`
        : '';

    return { W, x, puntos, trazo, area };
  }, [sesiones, ancho]);

  /* Deslizar. La misma cuenta para el ratón y para el dedo, como en el resto de
     los gráficos del producto. */
  const leer = (event) => {
    if (sesiones.length < 2) return;
    const r = event.currentTarget.getBoundingClientRect();
    const k = Math.round(((event.clientX - r.left) / (r.width || 1)) * (sesiones.length - 1));
    setMirando(Math.min(sesiones.length - 1, Math.max(0, k)));
  };

  const salto = foco?.trend ? SALTO[foco.trend] : null;
  const previa = sesiones[i - 1] || null;
  const series = foco?.sets || [];
  const sobran = Math.max(0, series.length - MAX_SERIES);

  /* Programado y no hecho. Es media revisión, así que ocupa el sitio de la cifra:
     ES la cifra de esta semana. */
  const saltado = !ejercicio.done;

  return (
    <article className={`ejerc-tarjeta${saltado ? ' is-saltado' : ''}`}>
      <button type="button" className="ejerc-tarjeta-head" onClick={onOpen} disabled={!trend}>
        <span className="nombre">{ejercicio.name}</span>
        {trend && <ChevronRight size={15} className="chevron" aria-hidden="true" />}
      </button>

      {/* ── La cifra de la semana señalada ──────────────────────────────── */}
      <div className="ejerc-kpi">
        {saltado && mirando === null ? (
          <span className="ejerc-kpi-nada">No lo hizo esta semana</span>
        ) : (
          <>
            <span className="v">
              {kg(foco?.top?.kg)}
              <span className="u">kg</span>
            </span>
            {foco?.top?.reps ? <span className="reps">× {foco.top.reps}</span> : null}
            {salto && previa && (
              <span className={salto.className}>
                {salto.text} vs S{previa.week}
              </span>
            )}
          </>
        )}
        {/* De qué semana habla lo que se está leyendo. Sin esto, deslizar cambia
            los números y no dice de cuándo son. */}
        {foco && (
          <span className={`ejerc-kpi-sem${foco.week === semana ? ' is-now' : ''}`}>
            S{foco.week}
          </span>
        )}
      </div>

      {/* ── La recta ────────────────────────────────────────────────────── */}
      <div
        /* Sin dos puntos no hay nada que recorrer, y una zona con cursor de mira
           que no reacciona es peor que una que no lo tiene. */
        className={`ejerc-recta${sesiones.length > 1 ? ' is-viva' : ''}`}
        ref={ref}
        title={sesiones.length > 1 ? 'Desliza para ver otras semanas' : undefined}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          leer(e);
        }}
        onPointerMove={(e) => (e.buttons === 1 || e.pointerType === 'mouse') && leer(e)}
        onPointerLeave={() => setMirando(null)}
        onPointerUp={() => setMirando(null)}
      >
        {geo && geo.puntos.length > 0 ? (
          <svg
            width={geo.W}
            height={ALTO}
            viewBox={`0 0 ${geo.W} ${ALTO}`}
            role="img"
            aria-label={`Los kilos de su serie más pesada, de la semana ${sesiones[0].week} a la ${sesiones[ultima].week}`}
          >
            {geo.area && <path className="recta-area" d={geo.area} fill={metricColor('topKg')} />}
            {geo.trazo && (
              <path className="recta-trazo" d={geo.trazo} fill="none" stroke={metricColor('topKg')} />
            )}

            {geo.puntos.map((p) => (
              <circle
                key={p.k}
                className={`recta-punto${p.k === i ? ' is-now' : ''}`}
                cx={p.x}
                cy={p.y}
                r={p.k === i ? 4.5 : 2}
                fill={metricColor('topKg')}
              />
            ))}

            {/* Los dos extremos rotulados: de dónde viene y dónde está. */}
            {geo.puntos.length > 1 && (
              <>
                <text
                  className="recta-cifra"
                  x={geo.puntos[0].x}
                  y={geo.puntos[0].y + 13}
                  textAnchor="start"
                >
                  {kg(sesiones[geo.puntos[0].k].topKg)}
                </text>
                <text
                  className="recta-cifra"
                  x={geo.puntos[geo.puntos.length - 1].x}
                  y={geo.puntos[geo.puntos.length - 1].y - 8}
                  textAnchor="end"
                >
                  {kg(sesiones[geo.puntos[geo.puntos.length - 1].k].topKg)}
                </text>
              </>
            )}
          </svg>
        ) : (
          <p className="ejerc-kpi-nada">Sin registro todavía.</p>
        )}

        {sesiones.length > 1 && (
          <span className="ejerc-recta-pie" aria-hidden="true">
            <span>S{sesiones[0].week}</span>
            <span>S{sesiones[ultima].week}</span>
          </span>
        )}
      </div>

      {/* ── Lo que anotó esa semana ─────────────────────────────────────── */}
      <div className="ejerc-series">
        {series.length === 0 ? (
          <span className="t-2xs t-tertiary">sin series anotadas</span>
        ) : (
          <>
            {series.slice(0, MAX_SERIES).map((set, k) => (
              <span key={k} className={`serie${set === foco.top ? ' is-tope' : ''}`}>
                {set.kg === null ? '—' : set.kg}
                <span className="x" aria-hidden="true">
                  ×
                </span>
                {set.reps}
              </span>
            ))}
            {sobran > 0 && <span className="serie-mas">+{sobran}</span>}
          </>
        )}
      </div>
    </article>
  );
};
