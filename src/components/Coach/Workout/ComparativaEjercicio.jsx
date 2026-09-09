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
/*
  ── Tres series, porque cinco NO caben ──────────────────────────────────────
  Eran cinco, y cinco series son quince minicolumnas de kg · reps · rir en los
  ~450 px de la tarjeta del costado: 25 px por columna para escribir «102.5».
  Medido sobre la aplicación con datos de verdad, el kilo de la última semana
  se salía de su celda y pisaba el rótulo de al lado — «B3·M2102.!». No era un
  fallo de estilo: era pedirle a la tarjeta el doble de lo que mide.

  La tarjeta enseña lo que cabe y la ventana que abre —«Ver toda la
  progresión»— tiene TODO: todas las semanas y todas las series. Es el reparto
  que su documentación ya decía tener.
*/
const SERIES_MAX = 3;

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
  const seriesTotales = Math.max(0, ...semanas.map((s) => s.sets.length));
  const series = Math.min(SERIES_MAX, seriesTotales);
  /*
    ── Las columnas tienen un suelo, y por eso la tabla puede desplazarse ─────
    Eran `minmax(0, 1fr)`: con cinco series son quince minicolumnas en unos 450
    px, treinta píxeles cada una, y «102.5» en la tipografía de datos mide más
    que eso. El texto no se recortaba dentro de su celda —se salía— y en la
    captura el kilo de la última semana se comía el rótulo de al lado:
    «B3·M2102.!». Un número que pisa a otro no es un dato, es un borrón.

    Con suelo, cuando de verdad no caben, la tabla se desplaza a lo ancho
    DENTRO de su tarjeta (ver `.comparativa-tabla`) y no se pierde ninguna
    cifra. Y 44 px para el rótulo, que «B2·M1» no cabía en 40.
  */
  const columnas = `44px repeat(${series * CAMPOS.length}, minmax(32px, 1fr))`;

  return (
    <aside className={`comparativa${onAmpliar && name ? ' tarjeta-puerta' : ''}`} aria-label="Progresión del ejercicio">
      {/*
        La cabecera de las tarjetas laterales, siempre igual: el rótulo, el
        título y, si hay entre qué elegir, un paso ‹ › a la derecha. Lo que abre
        la ventana es la TARJETA entera (ver «LA TARJETA-PUERTA»); el paso ‹ ›
        conserva su blanco propio.
      */}
      {onAmpliar && name && (
        <button type="button" className="task-hit" onClick={onAmpliar} aria-label={`${name}: ver toda la progresión`} title="Ver toda la progresión" />
      )}
      <div className="lado-cab">
        <span className="section-label">Progresión</span>
        <div className="lado-cab-fila">
          <span className="lado-titulo">{name || 'Sin ejercicio'}</span>
          {ejercicios.length > 1 && (
            <span className="lado-paso">
              <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Ejercicio anterior" onClick={() => onElegir?.(ejercicios[(indice - 1 + ejercicios.length) % ejercicios.length].name)}>
                <ChevronLeft size={15} />
              </button>
              <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Ejercicio siguiente" onClick={() => onElegir?.(ejercicios[(indice + 1) % ejercicios.length].name)}>
                <ChevronRight size={15} />
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

          <div className="comparativa-tabla" role="table" aria-label={`${name}: kilos, repeticiones y RIR por serie, microciclo a microciclo`}>
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
                  /* Tres estados y UN color: la bajada en rojo, lo que se
                     quedó igual en tinta baja y lo que subió en tinta plena.
                     Progresar se ve porque la columna va en negro y se corta
                     donde alguien se atascó (ver `.comparativa-celda.is-igual`). */
                  const tono =
                    kg === null || antes === null ? '' : kg < antes ? 'is-baja' : kg > antes ? '' : 'is-igual';
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
          {/* Lo que la tarjeta no enseña se dice, no se esconde: el resto de
              las series está en la ventana que abre la propia tarjeta. */}
          {seriesTotales > series && (
            <p className="t-xs t-tertiary">
              Las {series} primeras de {seriesTotales} series. Ábrelo para verlas todas.
            </p>
          )}
          {trend.stalled >= 3 && <p className="t-xs t-tertiary">{trend.stalled} microciclos sin superar el tope.</p>}
        </>
      )}
    </aside>
  );
};
