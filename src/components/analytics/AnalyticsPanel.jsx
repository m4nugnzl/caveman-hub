import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  MRV_GOALS,
  MUSCLE_COLORS,
  exerciseNames,
  exerciseProgression,
  muscleFrequency,
  muscleVolumeOverTime,
  trainedMuscles,
  unitLabel,
  weekMuscleVolume,
} from '@/domain/training';
import { buildWeeklySeries, macroShareBands, metricPoints, weekOverWeek } from '@/domain/analytics';
import { PERIMETER_LABELS, perimeterSeries, seriesDelta } from '@/domain/anthropometry';
import { shortDate } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { BandChart, BarBandChart, MeterList, StackedShareChart } from '@/components/ui/charts';
import { Delta, MetricCard } from '@/components/ui/metrics';
import { EmptyState, Panel } from '@/components/ui/primitives';

/**
 * Métricas de un ejercicio, en el orden en que se consultan: primero el trabajo
 * total, luego cuántas series se hicieron y por último la fuerza estimada.
 *
 * Se ha quitado "mejor serie en kg": sin las repeticiones, los kilos solos no
 * comparan nada — 100×3 y 100×10 salían iguales.
 */
const EXERCISE_METRICS = [
  { value: 'tonnage', label: 'Tonelaje', unit: ' kg', color: 'var(--data-violet)', decimals: 0 },
  { value: 'sets', label: 'Volumen (series)', unit: '', color: 'var(--data-teal)', decimals: 0 },
  { value: 'e1rm', label: '1RM estimado', unit: ' kg', color: 'var(--accent)', decimals: 0 },
];

const VOLUME_SCOPES = [
  { value: 'total', label: 'Todos los músculos' },
  { value: 'muscle', label: 'Un músculo' },
];

const MACRO_BANDS = [
  { key: 'protein', label: 'Proteína', color: 'var(--data-pink)' },
  { key: 'carbs', label: 'Carbos', color: 'var(--data-amber)' },
  { key: 'fats', label: 'Grasas', color: 'var(--data-teal)' },
];

const Group = ({ title, description, children }) => (
  <section className="col gap-4">
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </div>
    {children}
  </section>
);

/** Selector compacto que vive dentro de la tarjeta que filtra. */
const Picker = ({ value, onChange, options, label, width = 160 }) => (
  <select
    className="select input-sm"
    style={{ width }}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    aria-label={label}
    title={label}
  >
    {options.map((option) => (
      <option key={option.value ?? option} value={option.value ?? option}>
        {option.label ?? option}
      </option>
    ))}
  </select>
);

/**
 * Analítica.
 *
 * Orden: nutrición, composición corporal, entrenamiento. Cada tarjeta lleva su
 * cifra actual, su variación y sus propios filtros.
 */
export const AnalyticsPanel = ({ audience = 'coach' }) => {
  const { activeClient, workoutData, anthropometry, nutrition } = useApp();

  const program = workoutData[activeClient.id];
  const microcycles = useMemo(() => program?.microcycles || [], [program]);
  const anthro = anthropometry[activeClient.id];
  const history = useMemo(() => anthro?.history || [], [anthro]);
  const plan = nutrition[activeClient.id];
  const unit = unitLabel(activeClient.cycleType);
  const isClient = audience === 'client';

  const weeks = useMemo(() => microcycles.map((m) => m.weekNumber).sort((a, b) => a - b), [microcycles]);
  const exercises = useMemo(() => exerciseNames(microcycles), [microcycles]);
  const muscles = useMemo(() => trainedMuscles(microcycles), [microcycles]);

  const [exercise, setExercise] = useState('');
  const [exerciseMetric, setExerciseMetric] = useState('tonnage');
  const [volumeScope, setVolumeScope] = useState('total');
  const [muscle, setMuscle] = useState('');
  const [volumeWeek, setVolumeWeek] = useState('');
  const [perimeter, setPerimeter] = useState('ombligo');

  const lastWeek = weeks[weeks.length - 1];
  const activeExercise = exercises.includes(exercise) ? exercise : exercises[0] || '';
  const activeMuscle = muscles.includes(muscle) ? muscle : muscles[0] || '';
  const activeVolumeWeek = weeks.includes(Number(volumeWeek)) ? Number(volumeWeek) : lastWeek;

  const series = useMemo(
    () => buildWeeklySeries({ microcycles, history, gender: activeClient.gender }),
    [microcycles, history, activeClient.gender]
  );
  const labels = series.map((row) => row.label);

  const kcalPts = metricPoints(series, 'kcals');
  const weightPts = metricPoints(series, 'weight');
  const fatPts = metricPoints(series, 'fat');
  const proteinSharePts = metricPoints(series, 'proteinShare');

  const kcalWow = weekOverWeek(series, 'kcals');
  const fatWow = weekOverWeek(series, 'fat');
  const weightWow = weekOverWeek(series, 'weight');

  const macroRows = useMemo(() => macroShareBands(history), [history]);
  const lastMacros = macroRows[macroRows.length - 1] || null;

  const perimeterPts = useMemo(
    () => perimeterSeries(history, perimeter).map((p) => ({ ...p, label: shortDate(p.date) })),
    [history, perimeter]
  );
  const perimeterDelta = seriesDelta(perimeterPts);

  const progression = useMemo(
    () => (activeExercise ? exerciseProgression(microcycles, activeExercise) : []),
    [microcycles, activeExercise]
  );
  const metricMeta = EXERCISE_METRICS.find((m) => m.value === exerciseMetric) || EXERCISE_METRICS[0];
  const progPoints = progression
    .map((row) => ({ label: row.label, value: row[exerciseMetric] }))
    .filter((p) => p.value !== null);
  const progDelta = seriesDelta(progPoints);

  const weekVolume = useMemo(
    () => (activeVolumeWeek ? weekMuscleVolume(microcycles, activeVolumeWeek) : {}),
    [microcycles, activeVolumeWeek]
  );
  const volumeEntries = Object.entries(weekVolume).sort((a, b) => b[1] - a[1]);
  const maxVolume = Math.max(1, ...volumeEntries.map(([, v]) => v));

  const frequency = useMemo(
    () => (activeVolumeWeek ? muscleFrequency(microcycles, activeVolumeWeek) : {}),
    [microcycles, activeVolumeWeek]
  );
  const frequencyEntries = Object.entries(frequency).sort((a, b) => b[1] - a[1]);

  /** Evolución del volumen: total del programa o de un músculo concreto. */
  const volumeOverTime = useMemo(() => {
    if (volumeScope === 'muscle') {
      return activeMuscle ? muscleVolumeOverTime(microcycles, activeMuscle) : [];
    }
    return [...microcycles]
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map((m) => ({
        week: m.weekNumber,
        label: `${unit.charAt(0)}${m.weekNumber}`,
        value: Object.values(weekMuscleVolume(microcycles, m.weekNumber)).reduce((a, v) => a + v, 0),
      }));
  }, [volumeScope, activeMuscle, microcycles, unit]);

  const volumeColor =
    volumeScope === 'muscle' ? MUSCLE_COLORS[activeMuscle] || 'var(--data-violet)' : 'var(--data-violet)';

  const hasProgram = microcycles.length > 0;
  const hasBody = history.length > 0;

  if (!hasProgram && !hasBody) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Todavía no hay nada que analizar"
        message={
          isClient
            ? 'Cuando registres pesos y tu entrenador te programe semanas, aquí aparecerá tu progresión.'
            : 'Programa una semana y registra un peso: a partir de ahí esta pestaña se llena sola.'
        }
      />
    );
  }

  return (
    <div className="stack">
      {/* ══ NUTRICIÓN ══ */}
      <Group title="Nutrición" description="Calorías y macros vigentes, y cómo han ido cambiando.">
        <div className="grid-2">
          <MetricCard
            title="Calorías objetivo"
            subtitle="Registradas en cada revisión"
            value={fmt(kcalPts[kcalPts.length - 1]?.value ?? plan?.targetKcals)}
            unit="kcal"
            delta={<Delta value={kcalWow?.delta} percent={kcalWow?.pct} />}
            foot="Cada revisión guarda las kcal vigentes, así que el histórico se construye a medida que se registran pesos."
          >
            <BandChart
              labels={labels}
              series={[
                {
                  id: 'kcals',
                  label: 'Kcal',
                  color: 'var(--data-amber)',
                  unit: ' kcal',
                  decimals: 0,
                  points: kcalPts,
                },
              ]}
              height={112}
              emptyMessage="Configura los macros y registra un peso para empezar el histórico."
            />
          </MetricCard>

          <MetricCard
            title="Reparto de macros"
            subtitle="Porcentaje de las kcal"
            value={lastMacros ? `${lastMacros.protein}/${lastMacros.carbs}/${lastMacros.fats}` : '—'}
            unit="P/C/G %"
            delta={
              proteinSharePts.length > 1 ? (
                <Delta
                  value={
                    proteinSharePts[proteinSharePts.length - 1].value -
                    proteinSharePts[proteinSharePts.length - 2].value
                  }
                  unit=" pts prot."
                />
              ) : null
            }
          >
            <StackedShareChart rows={macroRows} bands={MACRO_BANDS} height={118} />
          </MetricCard>
        </div>

        {/*
          Kcal y peso como DOS BANDAS APILADAS que comparten el eje de tiempo, no
          como un gráfico de doble eje.
          --------------------------------------------------------------------
          El doble eje distorsionaba: con dos escalas independientes, la distancia
          visual entre las líneas es arbitraria — se puede hacer que parezcan
          pegadas o divergentes solo cambiando los rangos. Apiladas, cada serie
          conserva su escala real y la comparación se hace donde debe: en si los
          cambios coinciden en el tiempo.
        */}
        <MetricCard
          title="Calorías frente a peso"
          subtitle="Mismo eje de tiempo, cada serie con su escala"
          value={fmt(weightPts[weightPts.length - 1]?.value, { decimals: 1 })}
          unit="kg"
          foot="Si el peso no se mueve en la dirección buscada, mira si las calorías cambiaron antes."
        >
          <div className="col gap-4">
            <div className="col gap-1">
              <span className="section-label">Calorías objetivo</span>
              <BandChart
                labels={labels}
                series={[
                  {
                    id: 'kcals-paired',
                    label: 'Kcal',
                    color: 'var(--data-amber)',
                    unit: ' kcal',
                    decimals: 0,
                    points: kcalPts,
                  },
                ]}
                height={92}
                emptyMessage="Configura los macros para empezar el histórico."
              />
            </div>

            <div className="col gap-1">
              <span className="section-label">Peso corporal</span>
              <BandChart
                labels={labels}
                series={[
                  {
                    id: 'weight-paired',
                    label: 'Peso',
                    color: 'var(--data-blue)',
                    unit: ' kg',
                    decimals: 1,
                    points: weightPts,
                  },
                ]}
                height={92}
                emptyMessage="Sin pesajes registrados."
              />
            </div>
          </div>
        </MetricCard>
      </Group>

      {/* ══ COMPOSICIÓN CORPORAL ══ */}
      <Group title="Composición corporal" description="Peso, grasa y perímetros.">
        <div className="grid-2">
          <MetricCard
            title="Peso corporal"
            subtitle="Promedio semanal"
            value={fmt(weightPts[weightPts.length - 1]?.value, { decimals: 1 })}
            unit="kg"
            delta={<Delta value={weightWow?.delta} unit=" kg" lowerIsBetter />}
          >
            <BandChart
              labels={labels}
              series={[
                {
                  id: 'weight',
                  label: 'Peso',
                  color: 'var(--data-blue)',
                  unit: ' kg',
                  decimals: 1,
                  points: weightPts,
                },
              ]}
              height={112}
              smooth
              emptyMessage="Sin pesajes registrados."
            />
          </MetricCard>

          <MetricCard
            title="% graso"
            subtitle="Suma de 6 pliegues"
            value={fatPts.length > 0 ? fmt(fatPts[fatPts.length - 1].value, { decimals: 1 }) : '—'}
            unit="%"
            delta={<Delta value={fatWow?.delta} unit=" pts" lowerIsBetter />}
          >
            <BandChart
              labels={labels}
              series={[
                {
                  id: 'fat',
                  label: '% graso',
                  color: 'var(--data-rose)',
                  unit: '%',
                  decimals: 1,
                  points: fatPts,
                },
              ]}
              height={112}
              emptyMessage="Registra pliegues en «Peso y medidas» para ver el % graso."
            />
          </MetricCard>
        </div>

        <MetricCard
          title="Perímetros"
          subtitle={PERIMETER_LABELS[perimeter]}
          value={
            perimeterPts.length > 0 ? fmt(perimeterPts[perimeterPts.length - 1].value, { decimals: 1 }) : '—'
          }
          unit="cm"
          delta={<Delta value={perimeterDelta?.delta} unit=" cm" lowerIsBetter={perimeter === 'ombligo'} />}
          action={
            <Picker
              value={perimeter}
              onChange={setPerimeter}
              options={Object.entries(PERIMETER_LABELS).map(([value, label]) => ({ value, label }))}
              label="Perímetro"
              width={148}
            />
          }
        >
          <BandChart
            labels={perimeterPts.map((p) => p.label)}
            series={[
              {
                id: perimeter,
                label: PERIMETER_LABELS[perimeter],
                color: 'var(--data-orange)',
                unit: ' cm',
                decimals: 1,
                points: perimeterPts,
              },
            ]}
            height={112}
            emptyMessage="Sin medidas de este perímetro. Se registran en el apartado opcional de «Peso y medidas»."
          />
        </MetricCard>
      </Group>

      {/* ══ ENTRENAMIENTO ══ */}
      {hasProgram && (
        <Group title="Entrenamiento" description="Progresión por ejercicio y volumen por grupo muscular.">
          <MetricCard
            title="Progresión por ejercicio"
            subtitle={activeExercise || 'sin ejercicios'}
            value={
              progPoints.length > 0
                ? fmt(progPoints[progPoints.length - 1].value, { decimals: metricMeta.decimals })
                : '—'
            }
            unit={metricMeta.unit.trim()}
            color={metricMeta.color}
            delta={<Delta value={progDelta?.delta} unit={metricMeta.unit} decimals={metricMeta.decimals} />}
            action={
              <div className="row gap-2 wrap">
                <Picker value={activeExercise} onChange={setExercise} options={exercises} label="Ejercicio" width={182} />
                <Picker value={exerciseMetric} onChange={setExerciseMetric} options={EXERCISE_METRICS} label="Métrica" width={162} />
              </div>
            }
            foot={
              exerciseMetric === 'e1rm'
                ? '1RM estimado por la fórmula de Epley: compara series de rangos distintos, porque 100 kg × 5 y 85 kg × 10 son esfuerzos parecidos.'
                : null
            }
          >
            <BandChart
              labels={progression.map((row) => row.label)}
              series={[
                {
                  id: exerciseMetric,
                  label: metricMeta.label,
                  color: metricMeta.color,
                  unit: metricMeta.unit,
                  decimals: metricMeta.decimals,
                  points: progPoints,
                },
              ]}
              height={116}
              emptyMessage={`Sin series registradas de «${activeExercise}». Los datos aparecen al anotar kilos y repeticiones.`}
            />
          </MetricCard>

          {/*
            El volumen se reparte en tres piezas que responden a tres preguntas
            distintas: cuánto lleva cada músculo esta semana, con qué frecuencia
            se toca, y cómo evoluciona en el tiempo. Antes estaban mezcladas, y
            había además un gráfico de intensidad por RIR que no se usaba para
            decidir nada.
          */}
          <MetricCard
            title="Series por grupo muscular"
            subtitle={`${unit} ${activeVolumeWeek ?? ''} · solo series con repeticiones registradas`}
            value={volumeEntries.reduce((acc, [, v]) => acc + v, 0)}
            unit="series"
            color="var(--data-rose)"
            action={
              <Picker
                value={String(activeVolumeWeek ?? '')}
                onChange={setVolumeWeek}
                options={weeks.map((w) => ({ value: String(w), label: `${unit} ${w}` }))}
                label={unit}
                width={116}
              />
            }
            foot="La marca roja señala el MRV, el máximo volumen recuperable estimado de cada grupo."
          >
            {volumeEntries.length === 0 ? (
              <p className="t-sm t-secondary">Sin series registradas en esta {unit.toLowerCase()}.</p>
            ) : (
              <MeterList
                items={volumeEntries.map(([name, count]) => {
                  const goals = MRV_GOALS[name];
                  return {
                    label: name,
                    value: count,
                    pct: (count / maxVolume) * 100,
                    color: MUSCLE_COLORS[name] || 'var(--data-slate)',
                    markerPct: goals ? (goals.mrv / maxVolume) * 100 : null,
                    markerTitle: goals ? `MRV: ${goals.mrv} series` : undefined,
                  };
                })}
              />
            )}
          </MetricCard>

          {/* Frecuencia como KPIs y no como barras: son enteros de 1 a 3, y una
              barra para representar "2" ocupa mucho y comunica poco. */}
          <section className="col gap-3">
            <span className="section-label">
              Frecuencia semanal · {unit.toLowerCase()} {activeVolumeWeek ?? ''}
            </span>

            {frequencyEntries.length === 0 ? (
              <Panel tight>
                <p className="t-sm t-secondary">Sin datos en esta {unit.toLowerCase()}.</p>
              </Panel>
            ) : (
              <>
                <div className="grid-auto">
                  {frequencyEntries.map(([name, days]) => (
                    <div className="stat" key={name}>
                      <span className="stat-label">{name}</span>
                      <span
                        className="stat-value"
                        style={{ color: MUSCLE_COLORS[name] || 'var(--data-slate)' }}
                      >
                        {days}
                        <span className="metric-unit"> {days === 1 ? 'día' : 'días'}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="t-xs t-tertiary">
                  Días distintos en que se entrena cada músculo. Con el mismo volumen total, repartirlo en
                  dos sesiones suele rendir más que concentrarlo en una.
                </p>
              </>
            )}
          </section>

          <MetricCard
            title="Evolución del volumen"
            subtitle={
              volumeScope === 'muscle'
                ? `${activeMuscle} · series por ${unit.toLowerCase()}`
                : `Todos los músculos · series por ${unit.toLowerCase()}`
            }
            value={volumeOverTime.length > 0 ? volumeOverTime[volumeOverTime.length - 1].value : '—'}
            unit="series"
            color={volumeColor}
            action={
              <div className="row gap-2 wrap">
                <Picker value={volumeScope} onChange={setVolumeScope} options={VOLUME_SCOPES} label="Ámbito" width={168} />
                {volumeScope === 'muscle' && (
                  <Picker value={activeMuscle} onChange={setMuscle} options={muscles} label="Músculo" width={150} />
                )}
              </div>
            }
          >
            <BarBandChart
              bars={volumeOverTime.map((row) => ({
                label: row.label,
                value: row.value,
                highlight: row.week === lastWeek,
              }))}
              color={volumeColor}
              unit=" series"
              height={132}
              emptyMessage="Sin series registradas todavía."
            />
          </MetricCard>
        </Group>
      )}

      {!hasBody && (
        <Panel tight>
          <p className="t-sm t-secondary">
            {isClient
              ? 'Registra tu peso en «Peso y medidas» y aquí aparecerán tu evolución, tus perímetros y la comparativa con las calorías.'
              : 'Sin registros de peso todavía: la composición corporal y la nutrición aparecerán cuando el cliente empiece a registrar.'}
          </p>
        </Panel>
      )}

      {!plan && (
        <Panel tight>
          <p className="t-sm t-secondary">
            Sin plan nutricional configurado, la comparativa de calorías y el reparto de macros se quedan
            vacíos.
          </p>
        </Panel>
      )}
    </div>
  );
};
