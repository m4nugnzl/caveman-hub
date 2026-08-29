import { useMemo, useState } from 'react';

import { currentBlock, weekLabel } from '@/domain/blocks';
import { metricColor } from '@/domain/metrics';
import { activeQuestions } from '@/domain/protocol';
import { buildFeedbackSeries, feedbackAdherence } from '@/domain/readiness';
import { dayNames, dayProgression, exerciseNames, unitLabel } from '@/domain/training';
import { exerciseTrend } from '@/domain/week';
import { localeNumber } from '@/lib/dates';
import { BandChart, Sparkline } from '@/components/ui/charts';
import { ChartSelect } from '@/components/ui/ChartCard';
import { Delta } from '@/components/ui/metrics';
import { Modal } from '@/components/ui/Modal';
import { TarjetaVacia } from './Tarjeta';

/** Cuántos grupos musculares caben en la tabla de la rutina sin que sea ilegible. */
const MAX_COLUMNAS = 6;
/** Semanas de la carga de un ejercicio. Más atrás ya no se compara: se recuerda. */
const SEMANAS_EJERCICIO = 8;

/** Una serie escrita como se dice: «36×11», con el RIR solo si lo hay. */
const serie = (s) => {
  const kg = s?.kg === null || s?.kg === undefined || s?.kg === '' ? '—' : s.kg;
  const reps = s?.reps === null || s?.reps === undefined || s?.reps === '' ? '—' : s.reps;
  return `${kg}×${reps}`;
};

/**
 * EL ENTRENO, A FONDO — la ventana con la prueba.
 *
 *   1. LA RUTINA: los días como pestañas y, debajo, una fila por semana con las
 *      series hechas sobre las pautadas por grupo y el tonelaje con su barra.
 *      Un entrenador no progresa ejercicios sueltos: progresa sesiones.
 *   2. LA CARGA de un ejercicio: la curva de los kilos de su serie tope, semana
 *      a semana, y debajo cada semana escrita como se dice —«36×11 · 36×11 ·
 *      36×10»— con los kilos que superan la anterior en verde.
 *
 * ── Lo que había, y por qué se fue ──────────────────────────────────────────
 * Dos avisos de texto arriba y dos rejillas de números de nueve columnas: la
 * de kg · reps · rir por serie y la de series por músculo y semana. Se leían
 * como una hoja de cálculo. La curva dice en un vistazo lo que la rejilla
 * obligaba a leer celda a celda, y la rejilla de músculos ya está resumida en
 * el volumen del bloque, fuera.
 */
export const PanelEntreno = ({ open, onClose, program, microcycles, cycleType, latestWeek, protocol, isClient = false }) => {
  const unit = unitLabel(cycleType);

  /*
    ══ Lo que cuenta al acabar, semana a semana ═══════════════════════════════
    Una fila por pregunta —fatiga, dolor…— con su curva: el promedio de lo que
    contestó cada semana. Se lee en VERTICAL, que es la pregunta de verdad
    («¿la fatiga subió cuando subió el tonelaje, o antes?»), y es la misma
    forma que «Lo que cuenta cada semana» en la ventana del cuerpo.
  */
  const preguntas = useMemo(() => activeQuestions(protocol), [protocol]);
  const sensaciones = useMemo(() => buildFeedbackSeries(microcycles, preguntas), [microcycles, preguntas]);
  const respuestas = useMemo(() => feedbackAdherence(microcycles), [microcycles]);
  const bloque = useMemo(() => currentBlock(program), [program]);
  const etiqueta = (week) => weekLabel(program, week, unit.charAt(0));

  const rutinas = useMemo(() => dayNames(microcycles), [microcycles]);
  const [rutina, setRutina] = useState('');
  const rutinaActiva = rutinas.includes(rutina) ? rutina : rutinas[0] || '';
  const filas = useMemo(() => dayProgression(microcycles, rutinaActiva), [microcycles, rutinaActiva]);

  const columnas = useMemo(() => {
    const total = {};
    for (const fila of filas) {
      for (const [musculo, series] of Object.entries(fila.planned)) total[musculo] = (total[musculo] || 0) + series;
    }
    return Object.entries(total)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_COLUMNAS)
      .map(([musculo]) => musculo);
  }, [filas]);
  const topeTonelaje = Math.max(1, ...filas.map((f) => f.tonnage));

  /* Los ejercicios DEL DÍA que se está mirando, y no todos: viendo el Push no
     se enseña el curl femoral. El orden es el de la última semana montada. */
  const ejercicios = useMemo(() => {
    const vistos = new Set();
    const out = [];
    for (const micro of [...microcycles].sort((a, b) => b.weekNumber - a.weekNumber)) {
      for (const day of micro.days || []) {
        if (day.dayName !== rutinaActiva) continue;
        for (const ex of day.exercises || []) {
          if (ex.name && !vistos.has(ex.name)) {
            vistos.add(ex.name);
            out.push(ex.name);
          }
        }
      }
    }
    return out.length > 0 ? out : exerciseNames(microcycles);
  }, [microcycles, rutinaActiva]);
  const [ejercicio, setEjercicio] = useState('');
  const ejercicioActivo = ejercicios.includes(ejercicio) ? ejercicio : ejercicios[0] || '';
  const trend = useMemo(
    () => (ejercicioActivo ? exerciseTrend({ microcycles, name: ejercicioActivo, weekNumber: latestWeek }) : null),
    [microcycles, ejercicioActivo, latestWeek]
  );
  const sesiones = trend ? trend.sessions.slice(-SEMANAS_EJERCICIO) : [];

  return (
    <Modal open={open} size="lg" title={isClient ? 'Tu entreno, a fondo' : 'El entreno, a fondo'} onClose={onClose}>
      <div className="afondo is-ventana">
        <section className="afondo-tramo">
          <div className="entreno-barra">
            <div className="hoja-rutinas" role="tablist" aria-label="Rutina">
              {rutinas.map((nombre) => (
                <button
                  key={nombre}
                  type="button"
                  role="tab"
                  aria-selected={nombre === rutinaActiva}
                  className={`hoja-dia${nombre === rutinaActiva ? ' is-on' : ''}`}
                  onClick={() => setRutina(nombre)}
                >
                  {nombre}
                </button>
              ))}
            </div>
            <span className="tarjeta-meta">{bloque?.name || 'Bloque 1'}</span>
          </div>

          {rutinas.length === 0 ? (
            <TarjetaVacia>Sin días montados no hay rutina que seguir.</TarjetaVacia>
          ) : (
            <>
              <div className="rutina-tabla" style={{ '--cols': columnas.length }}>
                <div className="rutina-fila is-head">
                  <span>{unit}</span>
                  {columnas.map((m) => (
                    <span key={m} title={m}>
                      {m}
                    </span>
                  ))}
                  <span>Tonelaje</span>
                </div>
                {filas.map((f) => (
                  <div className={`rutina-fila${f.week === latestWeek ? ' is-actual' : ''}`} key={f.week}>
                    <span className="rutina-sem">{etiqueta(f.week)}</span>
                    {columnas.map((m) => {
                      const hecho = f.done[m] ?? 0;
                      const puesto = f.planned[m] ?? 0;
                      if (puesto === 0 && hecho === 0) {
                        return (
                          <span className="rutina-celda is-vacia" key={m} title={`${m}: no entraba`}>
                            <b>·</b>
                          </span>
                        );
                      }
                      return (
                        <span className="rutina-celda" key={m} title={`${m}: ${hecho} de ${puesto} series`}>
                          <b>{f.entrenado ? hecho : '—'}</b>
                          <small>/{puesto}</small>
                        </span>
                      );
                    })}
                    <span className="rutina-ton">
                      {f.tonnage > 0 && (
                        <span className="rutina-barra" style={{ width: `${(f.tonnage / topeTonelaje) * 100}%` }} aria-hidden="true" />
                      )}
                      <b>{f.tonnage > 0 ? localeNumber(f.tonnage) : '—'}</b>
                    </span>
                  </div>
                ))}
              </div>
              <p className="tarjeta-pie">
                Series hechas sobre las pautadas en {rutinaActiva}, y los kilos que movió ese día. Un guion es una{' '}
                {unit.toLowerCase()} sin sesión anotada, que no es lo mismo que cero.
              </p>
            </>
          )}
        </section>

        <section className="afondo-tramo">
          <div className="row between wrap gap-3">
            <h3 className="bloque-titulo">La carga, ejercicio a ejercicio</h3>
            {ejercicios.length > 1 && (
              <ChartSelect value={ejercicioActivo} onChange={setEjercicio} options={ejercicios} label="Ejercicio" width={220} />
            )}
          </div>

          {!trend || sesiones.length === 0 ? (
            <TarjetaVacia>Todavía no hay ninguna serie anotada de este ejercicio.</TarjetaVacia>
          ) : (
            <div className="carga">
              <BandChart
                labels={sesiones.map((s) => etiqueta(s.week))}
                series={[
                  {
                    id: 'top',
                    label: 'Serie tope',
                    color: metricColor('tonnage'),
                    unit: ' kg',
                    decimals: 1,
                    points: sesiones.map((s) => ({ label: etiqueta(s.week), value: s.topKg })),
                  },
                ]}
                height={150}
                emptyMessage="Sin kilos anotados."
              />
              <ol className="carga-lista">
                {sesiones.map((s, i) => {
                  const antes = sesiones[i - 1]?.topKg ?? null;
                  const tono =
                    s.topKg !== null && antes !== null ? (s.topKg > antes ? 'is-sube' : s.topKg < antes ? 'is-baja' : '') : '';
                  return (
                    <li className={`carga-fila${s.week === latestWeek ? ' is-actual' : ''}`} key={s.week}>
                      <span className="carga-sem">{etiqueta(s.week)}</span>
                      <span className="carga-series">{s.sets.map(serie).join(' · ')}</span>
                      <span className={`carga-tope ${tono}`}>
                        {s.topKg === null ? '—' : localeNumber(s.topKg)}
                        <small> kg</small>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="tarjeta-pie">
                La curva son los kilos de la serie tope de cada {unit.toLowerCase()}; debajo, cada serie como se dice, kilos
                por repeticiones. En verde los topes que superan la {unit.toLowerCase()} anterior, en rojo los que bajan.
                {trend.stalled >= 3 ? ` Lleva ${trend.stalled} sin superar su tope.` : ''}
              </p>
            </div>
          )}
        </section>

        <section className="afondo-tramo">
          <h3 className="bloque-titulo">{isClient ? 'Cómo llevas las sesiones' : 'Cómo lleva las sesiones'}</h3>
          {sensaciones.length === 0 ? (
            <TarjetaVacia>
              {preguntas.length === 0 ? 'Sus sesiones no preguntan nada. Se elige en Ajustes → Protocolo.' : 'Todavía no ha contestado ninguna sesión.'}
            </TarjetaVacia>
          ) : (
            <>
              <ul className="tendencias">
                {sensaciones.map((fila) => {
                  const pregunta = preguntas.find((q) => q.id === fila.id);
                  const max = pregunta?.max || 10;
                  const ahora = fila.points[fila.points.length - 1]?.value ?? null;
                  const primera = fila.points[0]?.value ?? null;
                  const delta = ahora !== null && primera !== null ? Math.round((ahora - primera) * 10) / 10 : null;
                  return (
                    <li className="tendencia" key={fila.id}>
                      <span className="tendencia-k">{fila.label}</span>
                      <span className="tendencia-linea">
                        <Sparkline points={fila.points} color={fila.color} height={30} />
                      </span>
                      <span className="tendencia-v" style={{ color: fila.color }}>
                        {ahora === null ? '—' : Math.round(ahora * 10) / 10}
                        <small>/{max}</small>
                      </span>
                      <Delta value={delta} lowerIsBetter={pregunta?.lowerIsBetter ?? (fila.id === 'fatigue' || fila.id === 'pain')} />
                    </li>
                  );
                })}
              </ul>
              <p className="tarjeta-pie">
                El promedio de lo que contestó cada semana al acabar de entrenar.
                {respuestas ? ` Contesta el ${respuestas.pct} % de sus sesiones (${respuestas.answered} de ${respuestas.sessions}).` : ''}
              </p>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
};
