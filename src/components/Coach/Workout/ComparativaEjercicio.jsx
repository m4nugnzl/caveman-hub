import { useMemo } from 'react';

import { exerciseTrend } from '@/domain/week';
import { metricColor } from '@/domain/metrics';
import { toNum } from '@/lib/num';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Sparkline } from '@/components/ui/charts';

/**
 * La progresión del ejercicio: semanas en filas, series en columnas.
 *
 * ── Por qué esta orientación ────────────────────────────────────────────────
 * Progresar es leer hacia abajo: la serie 1 de la semana 1, debajo la de la 2,
 * debajo la de la 3. Cada serie es un grupo de tres minicolumnas —kg · reps ·
 * rir— siempre en el mismo sitio, así que la vista baja por la columna de kilos
 * y ve si suben. Los kilos que superan la semana anterior van en positivo; los
 * que bajan, en negativo. La semana abierta lleva la marca de brasa.
 *
 * El ejercicio se elige pulsándolo en la hoja o desde el menú de arriba —el
 * mismo menú de la aplicación, no un desplegable del navegador—.
 */
const SEMANAS = 6;
const SERIES_MAX = 5;

const numero = toNum;

const CAMPOS = [
  { key: 'kg', label: 'kg' },
  { key: 'reps', label: 'reps' },
  { key: 'rir', label: 'rir' },
];

export const ComparativaEjercicio = ({ microcycles, ejercicios = [], name, weekNumber, onElegir, onAmpliar = null, etiqueta = (w) => `S${w}` }) => {
  /* Recorre el programa entero: no se rehace por cada tecla en una celda. */
  const indice = Math.max(0, ejercicios.findIndex((ex) => ex.name === name));
  const trend = useMemo(() => (name ? exerciseTrend({ microcycles, name, weekNumber }) : null), [microcycles, name, weekNumber]);
  const semanas = trend ? trend.sessions.slice(-SEMANAS) : [];
  const series = Math.min(SERIES_MAX, Math.max(0, ...semanas.map((s) => s.sets.length)));
  const columnas = `40px repeat(${series * CAMPOS.length}, minmax(0, 1fr))`;

  return (
    <aside className="comparativa" aria-label="Progresión del ejercicio">
      {/*
        La cabecera de las tarjetas laterales, siempre igual: el rótulo, el
        TÍTULO —que se pulsa para abrir su ventana— y, si hay entre qué elegir,
        un paso ‹ › a la derecha. Ni desplegables ni enlaces sueltos.
      */}
      <div className="lado-cab">
        <span className="section-label">Progresión</span>
        <div className="lado-cab-fila">
          <button type="button" className="lado-titulo" onClick={onAmpliar} disabled={!onAmpliar || !name} title="Ver toda la progresión">
            {name || 'Sin ejercicio'}
          </button>
          {ejercicios.length > 1 && (
            <span className="lado-paso">
              <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Ejercicio anterior" onClick={() => onElegir?.(ejercicios[(indice - 1 + ejercicios.length) % ejercicios.length].name)}>
                <ChevronLeft size={14} />
              </button>
              <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Ejercicio siguiente" onClick={() => onElegir?.(ejercicios[(indice + 1) % ejercicios.length].name)}>
                <ChevronRight size={14} />
              </button>
            </span>
          )}
        </div>
      </div>

      {!trend ? (
        <p className="t-sm t-tertiary">Todavía no hay ninguna serie anotada de este ejercicio.</p>
      ) : (
        <>
          <div className="comparativa-forma">
            <div className="comparativa-tope">
              <span className="v">{trend.to ?? '—'}</span>
              <span className="u">kg tope</span>
              {trend.from !== null && trend.to !== null && trend.from !== trend.to && (
                <span className={`delta ${trend.to > trend.from ? 'delta-good' : 'delta-bad'}`}>
                  {trend.to > trend.from ? '+' : ''}
                  {Math.round((trend.to - trend.from) * 10) / 10} desde {etiqueta(trend.sessions[0].week)}
                </span>
              )}
            </div>
            {trend.points.length > 1 && <Sparkline points={trend.points} color={metricColor('topKg')} height={34} />}
          </div>

          <div className="comparativa-tabla" role="table" aria-label={`${name}: kilos, repeticiones y RIR por serie, semana a semana`}>
            <div className="comparativa-fila is-series" role="row" style={{ gridTemplateColumns: columnas }}>
              <span />
              {Array.from({ length: series }, (_, i) => (
                <span key={i} className="comparativa-serie" style={{ gridColumn: `span ${CAMPOS.length}` }}>
                  Serie {i + 1}
                </span>
              ))}
            </div>
            <div className="comparativa-fila is-head" role="row" style={{ gridTemplateColumns: columnas }}>
              <span />
              {Array.from({ length: series }, (_, i) =>
                CAMPOS.map((c) => (
                  <span key={`${i}-${c.key}`}>{c.label}</span>
                ))
              )}
            </div>
            {semanas.map((s, fila) => (
              <div
                key={s.week}
                className={`comparativa-fila${s.week === weekNumber ? ' is-actual' : ''}`}
                role="row"
                style={{ gridTemplateColumns: columnas }}
              >
                <span className="comparativa-semana">{etiqueta(s.week)}</span>
                {Array.from({ length: series }, (_, i) => {
                  const set = s.sets[i];
                  const antes = numero(semanas[fila - 1]?.sets[i]?.kg);
                  const kg = numero(set?.kg);
                  const tono = kg !== null && antes !== null ? (kg > antes ? 'is-sube' : kg < antes ? 'is-baja' : '') : '';
                  return CAMPOS.map((c) => {
                    const v = set?.[c.key];
                    const vacio = v === null || v === undefined || v === '';
                    return (
                      <span
                        key={`${i}-${c.key}`}
                        className={`comparativa-celda${c.key === 'kg' && tono ? ` ${tono}` : ''}${c.key === 'kg' ? ' is-kg' : ''}${vacio ? ' is-vacia' : ''}`}
                      >
                        {vacio ? '·' : v}
                      </span>
                    );
                  });
                })}
              </div>
            ))}
          </div>
          {trend.stalled >= 3 && <p className="t-xs t-tertiary">{trend.stalled} semanas sin superar el tope.</p>}
        </>
      )}
    </aside>
  );
};
