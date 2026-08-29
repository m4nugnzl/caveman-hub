import { useMemo } from 'react';

import { metricPoints } from '@/domain/analytics';
import { PERIMETER_LABELS, perimeterSeries, seriesDelta } from '@/domain/anthropometry';
import { targetRateKg } from '@/domain/goals';
import { metricColor } from '@/domain/metrics';
import { checkinQuestions } from '@/domain/protocol';
import { answerTrend } from '@/domain/reviews';
import { shortDate } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { BandChart, Sparkline } from '@/components/ui/charts';
import { Delta } from '@/components/ui/metrics';
import { Modal } from '@/components/ui/Modal';
import { TarjetaVacia } from './Tarjeta';

/**
 * EL CUERPO, A FONDO — la ventana con la prueba.
 *
 * ══ Lo que hay dentro, y en qué orden ══════════════════════════════════════
 *
 *   1. La TABLA SEMANA A SEMANA —peso, kcal, pasos y lo que contestó, una fila
 *      por semana—: la hoja de series de Entreno aplicada al cuerpo. «Bajó 600 g
 *      la semana que le subí los pasos y con el hambre en 3» se lee en una fila.
 *   2. La recta de tendencia con la banda del objetivo, y el % graso.
 *   3. Los perímetros, cada uno con su curva.
 *   4. Las escalas del check-in, una fila por pregunta.
 *
 * Es una ventana grande y no un panel lateral porque lo que enseña son tablas
 * de siete columnas: a 460 px no caben.
 */
export const PanelCuerpo = ({
  open,
  onClose,
  serie,
  track,
  checkIns,
  protocol,
  history,
  pesoActual,
  trend,
  goal,
  isClient = false,
}) => {
  const weightPts = metricPoints(serie, 'weight');
  const fatPts = metricPoints(serie, 'fat');

  const medidas = useMemo(
    () =>
      Object.entries(PERIMETER_LABELS)
        .map(([id, label]) => {
          const pts = perimeterSeries(history, id);
          if (pts.length === 0) return null;
          return {
            id,
            label,
            valor: pts[pts.length - 1].value,
            delta: seriesDelta(pts)?.delta ?? null,
            puntos: pts.map((p) => ({ label: shortDate(p.date), value: p.value })),
          };
        })
        .filter(Boolean),
    [history]
  );

  const preguntas = useMemo(() => checkinQuestions(protocol), [protocol]);
  const escalas = useMemo(
    () => answerTrend({ checkIns, questions: preguntas, weeks: 52 }),
    [checkIns, preguntas]
  );

  const respuestasPorSemana = useMemo(
    () => new Map((checkIns || []).filter((c) => c?.weekStart).map((c) => [c.weekStart, c.answers || {}])),
    [checkIns]
  );
  const pasosPorSemana = useMemo(
    () => new Map((track || []).map((f) => [f.weekStart, f.steps])),
    [track]
  );

  const filas = useMemo(() => {
    const orden = [...serie].sort((a, b) => String(a.week).localeCompare(String(b.week)));
    return orden.map((row, i) => ({
      semana: row.programWeeks?.[0] ?? null,
      weekStart: row.week,
      etiqueta: row.label,
      peso: row.weight,
      /* Contra la semana anterior CON dato: comparar con un hueco daría un salto
         que no ha existido. */
      delta:
        row.weight === null
          ? null
          : (() => {
              const previa = [...orden.slice(0, i)].reverse().find((r) => r.weight !== null);
              return previa ? Math.round((row.weight - previa.weight) * 10) / 10 : null;
            })(),
      kcals: row.kcals,
      pasos: pasosPorSemana.get(row.week) ?? null,
      answers: respuestasPorSemana.get(row.week) || null,
    }));
  }, [serie, pasosPorSemana, respuestasPorSemana]);

  /* Solo las escalas: una respuesta de texto no cabe en una celda. */
  const columnas = useMemo(() => preguntas.filter((q) => q.kind !== 'text').slice(0, 4), [preguntas]);

  /*
    ── Las columnas del PLAN existen solo si tienen algo dentro ───────────────

    «Kcal» y «Pasos» se pintaban siempre, y a quien no le llevas la dieta —o a
    quien todavía no le has puesto un objetivo— la tabla le salía con una
    columna entera de puntos: quince filas diciendo «no hay dato» y ocupando un
    quinto del ancho que necesitan las que sí lo tienen.

    Una columna vacía no es información, es un hueco con rótulo. Y como el
    reparto de la rejilla se calcula con cuántas hay (`--planes`), lo que
    sobraba se reparte entre el peso y las escalas en vez de quedarse en blanco.
  */
  const planes = useMemo(
    () =>
      [
        { id: 'kcals', label: 'Kcal' },
        { id: 'pasos', label: 'Pasos' },
      ].filter((col) => filas.some((f) => f[col.id] !== null && f[col.id] !== undefined)),
    [filas]
  );

  /* La banda del objetivo sobre el peso: dónde debería estar al final de la
     ventana de tendencia. Sin tendencia no se dibuja. */
  const bandaObjetivo = useMemo(() => {
    const ritmo = targetRateKg(goal, pesoActual);
    if (ritmo === null || !trend.ok || weightPts.length < 2) return null;
    const desde = weightPts[weightPts.length - trend.weeks]?.value ?? weightPts[0].value;
    const esperado = desde + ritmo * (trend.weeks - 1);
    const margen = Math.max(Math.abs(ritmo) * (trend.weeks - 1) * 0.5, 0.4);
    return { from: esperado - margen, to: esperado + margen };
  }, [goal, pesoActual, trend, weightPts]);

  return (
    <Modal open={open} size="lg" title={isClient ? 'Tu cuerpo, a fondo' : 'El cuerpo, a fondo'} onClose={onClose}>
      <div className="afondo is-ventana">
        <section className="afondo-tramo">
          <h3 className="bloque-titulo">Semana a semana</h3>
          <div className="semanas-tabla" style={{ '--cols': columnas.length, '--planes': planes.length }}>
            <div className="semanas-fila is-head">
              <span>Semana</span>
              <span>Peso</span>
              {planes.map((col) => (
                <span key={col.id}>{col.label}</span>
              ))}
              {columnas.map((q) => (
                <span key={q.id} title={q.label}>
                  {q.short || q.label}
                </span>
              ))}
            </div>

            {filas.map((f) => (
              <div className="semanas-fila" key={f.weekStart}>
                <span className="semanas-sem">
                  {f.semana ? `S${f.semana}` : f.etiqueta}
                  <small>{f.etiqueta}</small>
                </span>
                <span className="semanas-celda is-peso">
                  <b>{fmt(f.peso, { decimals: 1 })}</b>
                  {f.delta !== null && f.delta !== 0 && (
                    <small className={f.delta < 0 ? 'is-baja' : 'is-sube'}>
                      {f.delta > 0 ? '+' : ''}
                      {f.delta}
                    </small>
                  )}
                </span>
                {planes.map((col) => (
                  <span className="semanas-celda" key={col.id}>
                    {f[col.id] === null || f[col.id] === undefined ? '·' : fmt(f[col.id])}
                  </span>
                ))}
                {columnas.map((q) => {
                  const v = f.answers?.[q.id];
                  const vacio = v === null || v === undefined || String(v).trim() === '';
                  return (
                    <span className={`semanas-celda${vacio ? ' is-vacia' : ''}`} key={q.id}>
                      {vacio ? '·' : v}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="tarjeta-pie">
            {/* El pie nombra las columnas que de verdad hay: con la dieta
                apagada, «lo que tenía puesto de comer» señalaba a una columna
                que ya no está. */}
            El promedio de peso de cada semana
            {planes.length > 0 ? `, lo que tenía puesto ${planes.some((c) => c.id === 'kcals') ? 'de comer' : ''}${planes.length === 2 ? ' y ' : ''}${planes.some((c) => c.id === 'pasos') ? 'de andar' : ''}` : ''}
            {columnas.length > 0 ? ', y lo que contestó al cerrarla' : ''}. Un punto es una semana
            sin ese dato.
          </p>
        </section>

        <section className="afondo-tramo">
          <div className="hoja-par">
            <div className="hoja-tramo">
              <h3 className="bloque-titulo">La tendencia, y contra qué</h3>
              <BandChart
                labels={serie.map((row) => row.label)}
                series={[
                  { id: 'weight', label: 'Peso', color: metricColor('weight'), unit: ' kg', decimals: 1, points: weightPts },
                ]}
                height={150}
                smooth
                trend={trend.ok ? trend : null}
                band={bandaObjetivo}
                emptyMessage="Sin pesajes registrados."
              />
              <p className="tarjeta-pie">
                {trend.ok
                  ? `Pendiente de las últimas ${trend.weeks} semanas (r² ${trend.r2})${trend.weak ? ', poco fiable: los pesajes están muy dispersos y por eso la recta va discontinua' : ''}.${bandaObjetivo ? ' La banda es dónde debería estar según el objetivo.' : ''}`
                  : `Se necesitan ${trend.needed} semanas con pesajes para calcular una tendencia; hay ${trend.weeks}.`}
              </p>
            </div>

            <div className="hoja-tramo">
              <h3 className="bloque-titulo">% graso</h3>
              {fatPts.length === 0 ? (
                <TarjetaVacia>
                  {isClient
                    ? 'Registra pliegues en tu revisión para ver el % graso.'
                    : 'Sin pliegues registrados. Hacen falta plicómetro y buena mano, y se activan en su protocolo.'}
                </TarjetaVacia>
              ) : (
                <>
                  <BandChart
                    labels={serie.map((row) => row.label)}
                    series={[
                      { id: 'fat', label: '% graso', color: metricColor('fat'), unit: '%', decimals: 1, points: fatPts },
                    ]}
                    height={150}
                    emptyMessage="Sin pliegues registrados."
                  />
                  <p className="tarjeta-pie">
                    Medido con plicómetro: el error entre dos mediciones es de 1-2 puntos, así que solo
                    son fiables los cambios sostenidos.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="afondo-tramo">
          <h3 className="bloque-titulo">{isClient ? 'Tus medidas' : 'Las medidas'}</h3>
          {medidas.length === 0 ? (
            <TarjetaVacia>
              {isClient
                ? 'Cuando midas algún perímetro en tu revisión, aparecerá aquí.'
                : 'Sin perímetros registrados. Se miden en su check-in, y son lo que distingue perder grasa de perder músculo.'}
            </TarjetaVacia>
          ) : (
            <ul className="tendencias">
              {medidas.map((m) => (
                <li className="tendencia" key={m.id}>
                  <span className="tendencia-k">{m.label}</span>
                  <span className="tendencia-linea">
                    <Sparkline points={m.puntos} color={metricColor('waist')} height={30} />
                  </span>
                  <span className="tendencia-v">
                    {fmt(m.valor, { decimals: 1 })}
                    <small> cm</small>
                  </span>
                  <Delta value={m.delta} unit=" cm" lowerIsBetter={m.id === 'ombligo'} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {escalas.length > 0 && (
          <section className="afondo-tramo">
            <h3 className="bloque-titulo">{isClient ? 'Lo que cuentas cada semana' : 'Lo que cuenta cada semana'}</h3>
            <ul className="tendencias">
              {escalas.map((fila) => {
                const ahora = fila.points[fila.points.length - 1]?.value ?? null;
                const primera = fila.points[0]?.value ?? null;
                const delta = ahora !== null && primera !== null ? ahora - primera : null;
                return (
                  <li className="tendencia" key={fila.id}>
                    <span className="tendencia-k">{fila.label}</span>
                    <span className="tendencia-linea">
                      <Sparkline points={fila.points} color={fila.color} height={30} />
                    </span>
                    <span className="tendencia-v" style={{ color: fila.color }}>
                      {ahora ?? '—'}
                      <small>/{fila.max}</small>
                    </span>
                    <Delta value={delta} lowerIsBetter={fila.id === 'hunger' || fila.id === 'week_stress'} />
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
};
