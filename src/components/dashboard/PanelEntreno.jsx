import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CircleCheck, Info } from 'lucide-react';

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
export const PanelEntreno = ({ open, onClose, program, microcycles, cycleType, latestWeek, protocol, isClient = false, pregunta = null }) => {
  const unit = unitLabel(cycleType);

  /*
    ── Llegar con la curva a la vista ────────────────────────────────────────
    Cuando la ventana se abre desde una fila de «Cómo lo lleva» (el Resumen
    pasa su pregunta), la curva de ESA pregunta vive al fondo, bajo el pliegue:
    abrir y tener que buscarla deshacía la mitad de la puerta. La fila se trae
    al centro al montar —sin animar: la ventana acaba de abrirse y colocarse no
    es movimiento— y se señala un instante para atar el clic con su respuesta.
  */
  const buscada = useRef(null);
  useEffect(() => {
    buscada.current?.scrollIntoView({ block: 'center' });
  }, []);

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

  /* Las columnas de la tabla de la rutina, en el orden del frame `292:5`:
     el microciclo, un grupo por columna y el tonelaje —barra y cifra— al canto. */
  /* Sin grupos, `repeat(0, …)` tiraría la declaración entera: ver PanelCuerpo. */
  const rejilla = columnas.length > 0
    ? `minmax(72px, 0.8fr) repeat(${columnas.length}, minmax(64px, 1fr)) minmax(180px, 2fr)`
    : 'minmax(72px, 0.8fr) minmax(180px, 2fr)';
  const u = unit.toLowerCase();
  const colorTonelaje = metricColor('tonnage');

  return (
    <Modal
      open={open}
      size="lg"
      icono={Activity}
      title={isClient ? 'Tu entreno, a fondo' : 'El entreno, a fondo'}
      sub={`Cada sesión, ${u} a ${u}: las series, la carga y cómo ${isClient ? 'la llevas' : 'la lleva'}`}
      onClose={onClose}
    >
      <div className="afondo is-ventana">
        <section className="afondo-tramo">
          <div className="entreno-barra">
            {/* Las sesiones como pastillas con canto, las del frame: dentro de una
                ventana no hay tira de la hoja al lado con la que confundirlas. */}
            <div className="hoja-rutinas is-pastillas" role="tablist" aria-label="Sesión">
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
            <span className="entreno-bloque">{bloque?.name || 'Bloque 1'}</span>
          </div>

          {rutinas.length === 0 ? (
            <TarjetaVacia>Sin días montados no hay rutina que seguir.</TarjetaVacia>
          ) : (
            <>
              {/*
                ══ LA TABLA ES LA DEL VOLUMEN (frame 292:5) ═══════════════════════
                Era una rejilla propia —`.rutina-tabla`, celdas grises a todo lo
                ancho y cabecera sin banda— dentro de una ventana que ya tenía
                hermana: la del volumen del bloque, rediseñada el 17 sep como
                TABLA con canto, cabecera en banda, cebra y la cifra en una
                pastilla ceñida. El frame dibuja esta igual, y el dueño lo dijo
                con todas las letras: «no es nada nuevo, sigue la misma lógica
                que el resto de popups». Así que no se copia: se usa la misma.
              */}
              <div className="volumen-tabla is-rutina" role="table" aria-label={`Series y tonelaje de ${rutinaActiva}, ${u} a ${u}`}>
                <div className="volumen-fila is-head" role="row" style={{ gridTemplateColumns: rejilla }}>
                  <span role="columnheader">{unit}</span>
                  {columnas.map((m) => (
                    <span key={m} role="columnheader" title={m}>
                      {m}
                    </span>
                  ))}
                  <span role="columnheader">Tonelaje</span>
                </div>
                {filas.map((f) => (
                  <div
                    className={`volumen-fila${f.week === latestWeek ? ' is-actual' : ''}`}
                    role="row"
                    style={{ gridTemplateColumns: rejilla }}
                    key={f.week}
                  >
                    <span className="volumen-grupo rutina-sem" role="rowheader">
                      {etiqueta(f.week)}
                    </span>
                    {columnas.map((m) => {
                      const hecho = f.done[m] ?? 0;
                      const puesto = f.planned[m] ?? 0;
                      /* Un grupo que ese día no entraba, y un microciclo sin
                         sesión anotada: dos huecos distintos, y ninguno es cero. */
                      if (puesto === 0 && hecho === 0) {
                        return (
                          <span className="volumen-celda is-vacia" role="cell" key={m} title={`${m}: no entraba`}>
                            ·
                          </span>
                        );
                      }
                      if (!f.entrenado) {
                        return (
                          <span className="volumen-celda is-vacia" role="cell" key={m} title={`${m}: sin sesión anotada`}>
                            —
                          </span>
                        );
                      }
                      /* Hecho todo lo pautado se dice en verde: el semáforo
                         juzga, y «cumplió» es un juicio. Lo demás, en gris —
                         quedarse corto no es una alarma que dar desde aquí. */
                      return (
                        <span
                          className={`volumen-celda${hecho >= puesto ? ' is-completa' : ''}`}
                          role="cell"
                          key={m}
                          title={`${m}: ${hecho} de ${puesto} series`}
                        >
                          {hecho}/{puesto}
                        </span>
                      );
                    })}
                    <span className="rutina-ton" role="cell">
                      {f.tonnage > 0 ? (
                        <>
                          <span className="volumen-barra" aria-hidden="true">
                            <span
                              className="volumen-relleno"
                              style={{ width: `${(f.tonnage / topeTonelaje) * 100}%`, background: colorTonelaje }}
                            />
                          </span>
                          <b>{localeNumber(f.tonnage)}</b>
                        </>
                      ) : (
                        <span className="rutina-nada">—</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <p className="afondo-nota">
                <Info size={13} aria-hidden="true" />
                <span>
                  Series hechas sobre las pautadas en <b>{rutinaActiva}</b>, y los kilos que movió ese día. Un guion es
                  un {u} sin sesión anotada, que no es lo mismo que cero.
                </span>
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
              {/* La curva en su caja hundida: el frame la separa de la lista de
                  debajo, que es otra forma de leer lo mismo. La leyenda es la de
                  `BandChart` —dice el valor de la semana que se señala—, subida
                  arriba por CSS como la dibuja el frame. */}
              <div className="afondo-lienzo">
                <BandChart
                  labels={sesiones.map((s) => etiqueta(s.week))}
                  series={[
                    {
                      id: 'top',
                      label: 'Serie tope',
                      color: colorTonelaje,
                      unit: ' kg',
                      decimals: 1,
                      points: sesiones.map((s) => ({ label: etiqueta(s.week), value: s.topKg })),
                    },
                  ]}
                  height={150}
                  emptyMessage="Sin kilos anotados."
                />
              </div>
              <ol className="carga-lista">
                {sesiones.map((s, i) => {
                  const antes = sesiones[i - 1]?.topKg ?? null;
                  const tono =
                    s.topKg !== null && antes !== null ? (s.topKg > antes ? ' is-sube' : s.topKg < antes ? ' is-baja' : '') : '';
                  return (
                    <li className={`carga-fila${s.week === latestWeek ? ' is-actual' : ''}`} key={s.week}>
                      <span className="carga-sem">{etiqueta(s.week)}</span>
                      <span className="carga-series">{s.sets.map(serie).join(' · ')}</span>
                      <span className="carga-tope-caja">
                        <span className={`carga-tope${tono}`}>{s.topKg === null ? '—' : localeNumber(s.topKg)}</span>
                        <small>kg</small>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="afondo-nota">
                <Info size={13} aria-hidden="true" />
                <span>
                  La curva son los kilos de la serie tope de cada {u}; debajo, cada serie como se dio, kilos por
                  repeticiones. En <b className="is-sube">verde</b> los topes que superan el {u} anterior, en{' '}
                  <b className="is-baja">rojo</b> los que bajan.
                  {trend.stalled >= 3 ? ` Lleva ${trend.stalled} sin superar su tope.` : ''}
                </span>
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
              {/* Una caja por pregunta, dos por fila como en el frame, teñidas del
                  color de SU dato: fatiga y dolor se distinguen de un vistazo
                  sin leer el rótulo. */}
              <ul className="tendencias is-cajas">
                {sensaciones.map((fila) => {
                  /* `q`, no `pregunta`: ese nombre es de la prop —la fila con
                     la que se llegó— y aquí la sombreaba, dejando la búsqueda
                     siempre en falso. */
                  const q = preguntas.find((p) => p.id === fila.id);
                  const max = q?.max || 10;
                  const ahora = fila.points[fila.points.length - 1]?.value ?? null;
                  const primera = fila.points[0]?.value ?? null;
                  const delta = ahora !== null && primera !== null ? Math.round((ahora - primera) * 10) / 10 : null;
                  return (
                    <li
                      className={`tendencia${fila.id === pregunta ? ' is-buscada' : ''}`}
                      ref={fila.id === pregunta ? buscada : null}
                      style={{ '--dato': fila.color }}
                      key={fila.id}
                    >
                      <span className="tendencia-k">{fila.label}</span>
                      <span className="tendencia-linea">
                        <Sparkline points={fila.points} color={fila.color} height={56} />
                      </span>
                      <span className="tendencia-cifra">
                        <span className="tendencia-v">
                          {ahora === null ? '—' : localeNumber(Math.round(ahora * 10) / 10)}
                          <small>/{max}</small>
                        </span>
                        <Delta value={delta} lowerIsBetter={q?.lowerIsBetter ?? (fila.id === 'fatigue' || fila.id === 'pain')} />
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="afondo-nota">
                <CircleCheck size={13} aria-hidden="true" />
                <span>
                  El promedio de lo que contestó cada semana al acabar de entrenar.
                  {respuestas ? (
                    <>
                      {' '}
                      Contesta el <b>{respuestas.pct} % de sus sesiones</b> ({respuestas.answered} de {respuestas.sessions}).
                    </>
                  ) : null}
                </span>
              </p>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
};
