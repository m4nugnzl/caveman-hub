import { ChevronRight } from 'lucide-react';

import { metricColor } from '@/domain/metrics';
import { Sparkline } from '@/components/ui/charts';

/**
 * UN EJERCICIO, EN UNA FILA: su tope de esta semana, hacia dónde va y sus series.
 *
 * ══ Por qué una fila y no una tarjeta con su gráfica ════════════════════════
 *
 * Cada ejercicio era una tarjeta con cifra grande, recta deslizable y series
 * debajo, en una rejilla de cuatro. Con dos o tres ejercicios se leía; con los
 * seis u ocho de un día de verdad eran dos filas de tarjetas del mismo peso, y
 * el ojo iba de gráfica en gráfica sin poder comparar nada en vertical: el
 * nombre de uno quedaba al lado de la cifra de otro.
 *
 * Una revisión se lee POR COLUMNAS —«¿cuánto levantó?», «¿sube o baja?», «¿qué
 * anotó?»— y eso es una tabla, que es además la forma que ya tiene la hoja de
 * Entreno y la progresión de al lado: el producto dibuja lo mismo igual.
 *
 *     Press banca         109,5 kg × 8   ↑ vs S14   ╱╲╱‾   109,5×8 · 109,5×8 · …  ›
 *     Press inclinado      39 kg × 8     ↑ vs S14   ___╱    39×8 · 39×8 · 39×7    ›
 *
 * La recta se queda —como chispa, sin ejes ni deslizar—: sigue diciendo la
 * FORMA de un vistazo. El recorrido semana a semana, con sus series, está a un
 * toque en la ficha del ejercicio (`ExerciseSheet`), que es donde cabe.
 */

/** `42,5` y no `42.5`. */
const kg = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-ES'));

const SALTO = {
  up: { className: 'delta delta-good', text: '↑' },
  down: { className: 'delta delta-bad', text: '↓' },
  flat: { className: 'delta delta-flat', text: '=' },
};

/* Cuántas series caben en la fila antes de que se coma la columna. */
const MAX_SERIES = 5;

export const ExerciseRow = ({ ejercicio, trend, onOpen }) => {
  const sesiones = trend?.sessions || [];
  const foco = sesiones[sesiones.length - 1] || null;
  const previa = sesiones[sesiones.length - 2] || null;
  const salto = foco?.trend ? SALTO[foco.trend] : null;
  const series = foco?.sets || [];
  const sobran = Math.max(0, series.length - MAX_SERIES);
  const saltado = !ejercicio.done;

  return (
    <button
      type="button"
      className={`ejerc-fila${saltado ? ' is-saltado' : ''}`}
      onClick={onOpen}
      disabled={!trend}
    >
      <span className="ejerc-fila-nombre">{ejercicio.name}</span>

      {/* La cifra: su serie tope esta semana. Sin hacer es la cifra, no un hueco. */}
      <span className="ejerc-fila-tope">
        {saltado ? (
          <span className="t-tertiary">no lo hizo</span>
        ) : (
          <>
            <span className="v">{kg(foco?.top?.kg)}</span>
            <span className="u">kg</span>
            {foco?.top?.reps ? <span className="reps">× {foco.top.reps}</span> : null}
          </>
        )}
      </span>

      <span className="ejerc-fila-salto">
        {!saltado && salto && previa && (
          <span className={salto.className}>
            {salto.text} vs S{previa.week}
          </span>
        )}
      </span>

      {/* La chispa: los kilos de su tope, todas las semanas. Solo la forma. */}
      <span className="ejerc-fila-chispa" aria-hidden="true">
        <Sparkline
          points={sesiones.map((s) => s.topKg)}
          color={metricColor('topKg')}
          height={22}
        />
      </span>

      <span className="ejerc-fila-series">
        {!saltado && series.length === 0 && <span className="t-2xs t-tertiary">sin series</span>}
        {!saltado &&
          series.slice(0, MAX_SERIES).map((set, k) => (
            <span key={k} className={`serie${set === foco.top ? ' is-tope' : ''}`}>
              {set.kg === null ? '—' : kg(set.kg)}
              <span className="x" aria-hidden="true">
                ×
              </span>
              {set.reps}
            </span>
          ))}
        {sobran > 0 && <span className="serie-mas">+{sobran}</span>}
      </span>

      <ChevronRight size={14} className="ejerc-fila-chevron" aria-hidden="true" />
    </button>
  );
};
