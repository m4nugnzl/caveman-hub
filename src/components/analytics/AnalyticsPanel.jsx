import { useMemo, useState } from 'react';
import { BarChart3, Dumbbell, Flame, Gauge, Percent, Repeat, Ruler, Target, TrendingUp } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  MRV_GOALS,
  MUSCLE_COLORS,
  exerciseNames,
  exerciseProgression,
  muscleFrequency,
  muscleVolumeOverTime,
  rirDistribution,
  trainedMuscles,
  unitLabel,
  weekMuscleVolume,
} from '@/domain/training';
import {
  buildWeeklySeries,
  lastWeeks,
  macroShareBands,
  metricById,
  metricPoints,
} from '@/domain/analytics';
import { PERIMETER_LABELS, perimeterSeries } from '@/domain/anthropometry';
import { MACRO_COLORS } from '@/domain/nutrition';
import { shortDate } from '@/lib/dates';
import { MeterList } from '@/components/ui/charts';
import { BarTrendChart, LineChart, StackedShareChart } from '@/components/ui/LineChart';
import { ChartCard, ChartSelect, ChartToggle, RangeChips } from '@/components/ui/ChartCard';
import { EmptyState, Panel } from '@/components/ui/primitives';

const RANGES = [
  { id: '8', label: '8 sem' },
  { id: '12', label: '12 sem' },
  { id: '0', label: 'Todo' },
];

const EXERCISE_METRICS = [
  { value: 'e1rm', label: '1RM estimado', unit: ' kg', color: 'var(--accent-emerald)', decimals: 0 },
  { value: 'bestKg', label: 'Mejor serie (kg)', unit: ' kg', color: 'var(--accent-cyan)', decimals: 1 },
  { value: 'tonnage', label: 'Tonelaje del ejercicio', unit: ' kg', color: 'var(--accent-amber)', decimals: 0 },
  { value: 'sets', label: 'Series efectivas', unit: '', color: 'var(--accent-purple)', decimals: 0 },
];

const MACRO_BANDS = [
  { key: 'protein', label: 'Proteína', color: MACRO_COLORS.protein },
  { key: 'carbs', label: 'Carbos', color: MACRO_COLORS.carbs },
  { key: 'fats', label: 'Grasas', color: MACRO_COLORS.fats },
];

/**
 * Analítica. Aquí vive todo lo que se explora, y **cada gráfico trae sus propios
 * filtros**: el de progresión se filtra por ejercicio, el de volumen por
 * músculo, el de intensidad por semana. Un mando global no podía representar eso.
 *
 * El panel de Resumen se queda con lo accionable; esto es la herramienta.
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

  // Cada gráfico guarda su propia selección.
  const [exercise, setExercise] = useState('');
  const [exerciseMetric, setExerciseMetric] = useState('e1rm');
  const [muscle, setMuscle] = useState('');
  const [volumeWeek, setVolumeWeek] = useState('');
  const [intensityWeek, setIntensityWeek] = useState('');
  const [bodyRange, setBodyRange] = useState('12');
  const [bodySmooth, setBodySmooth] = useState(true);
  const [perimeter, setPerimeter] = useState('ombligo');
  const [muscleSmooth, setMuscleSmooth] = useState(false);

  // Valores efectivos: si la selección ya no existe, se cae al primero válido.
  const activeExercise = exercises.includes(exercise) ? exercise : exercises[0] || '';
  const activeMuscle = muscles.includes(muscle) ? muscle : muscles[0] || '';
  const lastWeek = weeks[weeks.length - 1];
  const activeVolumeWeek = weeks.includes(Number(volumeWeek)) ? Number(volumeWeek) : lastWeek;
  const activeIntensityWeek = weeks.includes(Number(intensityWeek)) ? Number(intensityWeek) : lastWeek;

  const progression = useMemo(
    () => (activeExercise ? exerciseProgression(microcycles, activeExercise) : []),
    [microcycles, activeExercise]
  );
  const metricMeta = EXERCISE_METRICS.find((m) => m.value === exerciseMetric) || EXERCISE_METRICS[0];

  const muscleOverTime = useMemo(
    () => (activeMuscle ? muscleVolumeOverTime(microcycles, activeMuscle) : []),
    [microcycles, activeMuscle]
  );

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
  const maxFrequency = Math.max(1, ...frequencyEntries.map(([, v]) => v));

  const intensity = useMemo(
    () => (activeIntensityWeek ? rirDistribution(microcycles, activeIntensityWeek) : []),
    [microcycles, activeIntensityWeek]
  );

  const fullSeries = useMemo(
    () => buildWeeklySeries({ microcycles, history, gender: activeClient.gender }),
    [microcycles, history, activeClient.gender]
  );
  const bodySeries = useMemo(
    () => lastWeeks(fullSeries, Number(bodyRange) || null),
    [fullSeries, bodyRange]
  );
  const bodyLabels = bodySeries.map((row) => row.label);

  const perimeterPoints = useMemo(
    () => perimeterSeries(history, perimeter).map((p) => ({ ...p, label: shortDate(p.date) })),
    [history, perimeter]
  );
  const macroRows = useMemo(() => macroShareBands(history), [history]);

  const hasProgram = microcycles.length > 0;
  const hasBody = history.length > 0;

  if (!hasProgram && !hasBody) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Todavía no hay nada que analizar"
        message={
          isClient
            ? 'Cuando registres pesos y tu entrenador te programe semanas, aquí aparecerá tu progresión ejercicio a ejercicio.'
            : 'Programa al menos una semana y registra un peso: a partir de ahí esta pestaña se llena sola.'
        }
      />
    );
  }

  return (
    <div className="stack">
      {/* ── ENTRENAMIENTO ── */}
      {hasProgram && (
        <>
          <ChartCard
            icon={Dumbbell}
            color="var(--accent-emerald)"
            title="Progresión por ejercicio"
            subtitle="Cómo evoluciona un ejercicio concreto a lo largo del programa."
            controls={
              <>
                <ChartSelect
                  value={activeExercise}
                  onChange={setExercise}
                  options={exercises}
                  label="Ejercicio"
                  width={210}
                />
                <ChartSelect
                  value={exerciseMetric}
                  onChange={setExerciseMetric}
                  options={EXERCISE_METRICS}
                  label="Métrica"
                  width={190}
                />
              </>
            }
            note={
              exerciseMetric === 'e1rm'
                ? '1RM estimado con la fórmula de Epley: permite comparar series de rangos distintos, porque 100 kg × 5 y 85 kg × 10 son esfuerzos parecidos.'
                : null
            }
          >
            {exercises.length === 0 ? (
              <p className="text-sm text-muted">Sin ejercicios en el programa todavía.</p>
            ) : (
              <LineChart
                labels={progression.map((row) => row.label)}
                series={[
                  {
                    id: exerciseMetric,
                    label: metricMeta.label,
                    color: metricMeta.color,
                    unit: metricMeta.unit,
                    decimals: metricMeta.decimals,
                    axis: 'left',
                    points: progression
                      .map((row) => ({ label: row.label, value: row[exerciseMetric] }))
                      .filter((p) => p.value !== null),
                  },
                ]}
                height={250}
                emptyMessage={`Sin series registradas de «${activeExercise}» todavía. Los datos aparecen cuando se anotan kilos y repeticiones.`}
              />
            )}
          </ChartCard>

          <div className="grid-auto-lg">
            <ChartCard
              icon={BarChart3}
              color="var(--accent-coral)"
              title="Volumen por músculo"
              subtitle={`Series efectivas en la ${unit.toLowerCase()} elegida, con su MEV–MRV.`}
              controls={
                <ChartSelect
                  value={String(activeVolumeWeek ?? '')}
                  onChange={setVolumeWeek}
                  options={weeks.map((w) => ({ value: String(w), label: `${unit} ${w}` }))}
                  label={unit}
                  width={130}
                />
              }
              note="La línea roja marca el MRV, el máximo volumen recuperable estimado."
            >
              {volumeEntries.length === 0 ? (
                <p className="text-sm text-muted">
                  Sin series registradas en esta {unit.toLowerCase()}.
                </p>
              ) : (
                <MeterList
                  items={volumeEntries.map(([name, count]) => {
                    const goals = MRV_GOALS[name];
                    return {
                      label: name,
                      value: count,
                      pct: (count / maxVolume) * 100,
                      color: MUSCLE_COLORS[name] || '#94a3b8',
                      markerPct: goals ? (goals.mrv / maxVolume) * 100 : null,
                      markerTitle: goals ? `MRV: ${goals.mrv} series` : undefined,
                    };
                  })}
                />
              )}
            </ChartCard>

            <ChartCard
              icon={Repeat}
              color="var(--accent-cyan)"
              title="Frecuencia semanal"
              subtitle={`En cuántos días distintos se entrena cada músculo en la ${unit.toLowerCase()} ${activeVolumeWeek}.`}
              note="Con el mismo volumen total, repartirlo en dos sesiones suele rendir más que concentrarlo en una."
            >
              {frequencyEntries.length === 0 ? (
                <p className="text-sm text-muted">Sin datos en esta {unit.toLowerCase()}.</p>
              ) : (
                <MeterList
                  items={frequencyEntries.map(([name, days]) => ({
                    label: name,
                    value: days,
                    pct: (days / maxFrequency) * 100,
                    color: MUSCLE_COLORS[name] || '#94a3b8',
                  }))}
                />
              )}
            </ChartCard>
          </div>

          <ChartCard
            icon={TrendingUp}
            color="var(--accent-purple)"
            title="Volumen de un músculo en el tiempo"
            subtitle="Series efectivas de un grupo muscular, microciclo a microciclo."
            controls={
              <>
                <ChartToggle checked={muscleSmooth} onChange={setMuscleSmooth}>
                  Media de 3
                </ChartToggle>
                <ChartSelect
                  value={activeMuscle}
                  onChange={setMuscle}
                  options={muscles}
                  label="Músculo"
                  width={180}
                />
              </>
            }
          >
            {muscles.length === 0 ? (
              <p className="text-sm text-muted">Sin músculos registrados todavía.</p>
            ) : (
              <BarTrendChart
                bars={muscleOverTime.map((row) => ({
                  label: row.label,
                  value: row.value,
                  highlight: row.week === lastWeek,
                }))}
                color={MUSCLE_COLORS[activeMuscle] || 'var(--accent-purple)'}
                unit=" series"
                showLine
                showSmooth={muscleSmooth}
                height={230}
              />
            )}
          </ChartCard>

          <ChartCard
            icon={Gauge}
            color="var(--accent-amber)"
            title="Intensidad — reparto de RIR"
            subtitle="Cuántas series se han hecho a cada nivel de repeticiones en reserva."
            controls={
              <ChartSelect
                value={String(activeIntensityWeek ?? '')}
                onChange={setIntensityWeek}
                options={weeks.map((w) => ({ value: String(w), label: `${unit} ${w}` }))}
                label={unit}
                width={130}
              />
            }
            note="Un RIR bajo significa entrenar cerca del fallo. Si casi todas las series salen sin dato, conviene insistir en que se anote."
          >
            {intensity.length === 0 ? (
              <p className="text-sm text-muted">
                Sin series registradas en esta {unit.toLowerCase()}.
              </p>
            ) : (
              <BarTrendChart
                bars={intensity}
                color="var(--accent-amber)"
                unit=" series"
                showLine={false}
                height={200}
                fromZero
              />
            )}
          </ChartCard>
        </>
      )}

      {/* ── COMPOSICIÓN CORPORAL Y NUTRICIÓN ── */}
      {hasBody && (
        <>
          <ChartCard
            icon={Flame}
            color="var(--accent-amber)"
            title="Kcal frente a peso"
            subtitle="Dos ejes, porque las kcal van en miles y el peso en decenas."
            controls={
              <>
                <ChartToggle checked={bodySmooth} onChange={setBodySmooth}>
                  Suavizar
                </ChartToggle>
                <RangeChips value={bodyRange} onChange={setBodyRange} options={RANGES} />
              </>
            }
            note="Si el peso no se mueve en la dirección buscada, aquí se ve si las kcal han acompañado."
          >
            <LineChart
              labels={bodyLabels}
              series={[
                {
                  id: 'kcals',
                  label: 'Kcal',
                  ...metricById('kcals'),
                  axis: 'left',
                  points: metricPoints(bodySeries, 'kcals'),
                },
                {
                  id: 'weight',
                  label: 'Peso',
                  ...metricById('weight'),
                  axis: 'right',
                  points: metricPoints(bodySeries, 'weight'),
                },
              ]}
              smoothWindow={bodySmooth ? 3 : 0}
              height={260}
              emptyMessage="Hacen falta revisiones con peso y con macros configurados para cruzar las dos series."
            />
          </ChartCard>

          <div className="grid-auto-lg">
            <ChartCard
              icon={Target}
              color="var(--accent-coral)"
              title="Reparto de macros en el tiempo"
              subtitle="Cada barra es una revisión. Siempre suman 100%."
              note="El histórico se construye a medida que se registran pesos: cada revisión guarda los macros vigentes."
            >
              <StackedShareChart rows={macroRows} bands={MACRO_BANDS} />
            </ChartCard>

            <ChartCard
              icon={Ruler}
              color="#fb923c"
              title="Perímetros"
              subtitle="Evolución de una medida concreta."
              controls={
                <ChartSelect
                  value={perimeter}
                  onChange={setPerimeter}
                  options={Object.entries(PERIMETER_LABELS).map(([value, label]) => ({ value, label }))}
                  label="Perímetro"
                  width={150}
                />
              }
            >
              <LineChart
                labels={perimeterPoints.map((p) => p.label)}
                series={[
                  {
                    id: perimeter,
                    label: PERIMETER_LABELS[perimeter],
                    color: '#fb923c',
                    unit: ' cm',
                    decimals: 1,
                    axis: 'left',
                    points: perimeterPoints,
                  },
                ]}
                height={230}
                emptyMessage="Sin medidas de este perímetro. Se registran en «Peso y medidas», en el apartado opcional."
              />
            </ChartCard>
          </div>

          {metricPoints(fullSeries, 'fat').length >= 2 && (
            <ChartCard
              icon={Percent}
              color="var(--accent-coral)"
              title="Evolución del % graso"
              subtitle="Calculado por la suma de 6 pliegues según el sexo registrado."
            >
              <LineChart
                labels={bodyLabels}
                series={[
                  {
                    id: 'fat',
                    label: '% graso',
                    ...metricById('fat'),
                    axis: 'left',
                    points: metricPoints(bodySeries, 'fat'),
                  },
                ]}
                smoothWindow={bodySmooth ? 3 : 0}
                height={230}
              />
            </ChartCard>
          )}
        </>
      )}

      {!hasBody && (
        <Panel tight>
          <p className="text-sm text-muted">
            {isClient
              ? 'Registra tu peso en «Peso y medidas» y aquí aparecerán tu evolución, tus perímetros y la comparativa con las calorías.'
              : 'Sin registros de peso todavía: la parte de composición corporal y nutrición aparecerá cuando el cliente empiece a registrar.'}
          </p>
        </Panel>
      )}

      {!plan && hasBody && (
        <Panel tight>
          <p className="text-sm text-muted">
            Sin plan nutricional configurado, la comparativa de kcal y el reparto de macros se quedan
            vacíos.
          </p>
        </Panel>
      )}
    </div>
  );
};
