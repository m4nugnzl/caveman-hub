import { useMemo, useState } from 'react';
import { Activity, Calendar, LineChart as LineChartIcon, Weight } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  buildWeeklySeries,
  lastWeeks,
  linearTrend,
  metricById,
  metricPoints,
  weekAdherence,
  weekOverWeek,
} from '@/domain/analytics';
import { WEEK_DAYS, tonnageByWeek, unitLabel } from '@/domain/training';
import { round } from '@/lib/num';
import { BarTrendChart, LineChart } from '@/components/ui/LineChart';
import { ChartCard, ChartToggle, RangeChips } from '@/components/ui/ChartCard';
import { Panel, SectionTitle, StatCard } from '@/components/ui/primitives';
import { NutritionHeadline } from './NutritionHeadline';

const RANGES = [
  { id: '8', label: '8 sem' },
  { id: '12', label: '12 sem' },
  { id: '0', label: 'Todo' },
];

/** KPI con su variación respecto a la semana anterior. */
const DeltaCard = ({ label, metricId, series, lowerIsBetter = false }) => {
  const metric = metricById(metricId);
  const points = metricPoints(series, metricId);
  const latest = points[points.length - 1];
  const wow = weekOverWeek(series, metricId);

  if (!latest) return <StatCard label={label} value="—" sub="sin datos todavía" />;

  const good = wow && (lowerIsBetter ? wow.delta < 0 : wow.delta > 0);
  const flat = !wow || wow.delta === 0;

  return (
    <StatCard
      label={label}
      value={`${round(latest.value, metric.decimals)}${metric.unit}`}
      color={metric.color}
      sub={
        wow ? (
          <span
            style={{
              color: flat ? 'var(--text-dark)' : good ? 'var(--accent-emerald)' : 'var(--accent-amber)',
            }}
          >
            {wow.delta > 0 ? '+' : ''}
            {wow.delta}
            {metric.unit} vs. semana anterior
          </span>
        ) : (
          'primera semana con datos'
        )
      }
    />
  );
};

/**
 * Resumen. Responde a una sola pregunta: **¿esto va bien o va mal?**
 *
 * Antes esta pantalla acumulaba nueve gráficos y una barra de controles
 * globales. Con tanto material dejaba de ser un resumen: había que leerla entera
 * para sacar una conclusión. Ahora se queda con los indicadores accionables y
 * dos gráficos, y toda la exploración —progresión por ejercicio, volumen por
 * músculo, intensidad, perímetros— vive en la pestaña «Analítica», donde cada
 * gráfico tiene sus propios filtros.
 */
export const Dashboard = ({ audience = 'coach' }) => {
  const { activeClient, workoutData, anthropometry, nutrition } = useApp();

  const program = workoutData[activeClient.id];
  const microcycles = useMemo(() => program?.microcycles || [], [program]);
  const anthro = anthropometry[activeClient.id];
  const history = useMemo(() => anthro?.history || [], [anthro]);
  const plan = nutrition[activeClient.id];
  const unit = unitLabel(activeClient.cycleType);
  const isClient = audience === 'client';

  const [weightRange, setWeightRange] = useState('12');
  const [weightSmooth, setWeightSmooth] = useState(true);
  const [tonnageSmooth, setTonnageSmooth] = useState(false);

  const fullSeries = useMemo(
    () => buildWeeklySeries({ microcycles, history, gender: activeClient.gender }),
    [microcycles, history, activeClient.gender]
  );

  const weightSeries = useMemo(
    () => lastWeeks(fullSeries, Number(weightRange) || null),
    [fullSeries, weightRange]
  );
  const weightPoints = metricPoints(weightSeries, 'weight');
  const weightTrend = linearTrend(weightPoints);

  const latestWeek = useMemo(() => {
    const weeks = microcycles.map((m) => m.weekNumber);
    return weeks.length > 0 ? Math.max(...weeks) : null;
  }, [microcycles]);

  const adherence = latestWeek ? weekAdherence(microcycles, latestWeek) : null;
  const tonnage = useMemo(() => tonnageByWeek(microcycles), [microcycles]);

  return (
    <div className="stack">
      <NutritionHeadline plan={plan} />

      {program && activeClient.cycleType !== 'rotating' && program.weeklySplit && (
        <Panel tight className="col gap-4">
          <SectionTitle icon={Calendar} color="var(--accent-coral)">
            {isClient ? 'Tu estructura semanal' : 'Estructura semanal'}
          </SectionTitle>
          <div className="split-grid">
            {WEEK_DAYS.map((day) => {
              const value = program.weeklySplit[day] ?? 'Descanso';
              const isRest = value.trim().toLowerCase() === 'descanso';
              return (
                <div className="col gap-1" key={day}>
                  <span className="uppercase-label" style={{ textAlign: 'center' }}>
                    {day.slice(0, 3)}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      background: isRest ? 'var(--bg-sunken)' : 'rgba(16,185,129,0.14)',
                      border: `1px solid ${isRest ? 'var(--border-color)' : 'var(--accent-emerald)'}`,
                      borderRadius: 10,
                      padding: '9px 4px',
                      fontWeight: 700,
                      textAlign: 'center',
                      color: isRest ? 'var(--text-muted)' : '#fff',
                    }}
                  >
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <div className="grid-auto">
        <DeltaCard label="Peso corporal" metricId="weight" series={fullSeries} lowerIsBetter />
        {weightTrend && (
          <StatCard
            label="Ritmo del peso"
            value={`${weightTrend.perWeek > 0 ? '+' : ''}${weightTrend.perWeek} kg`}
            color="var(--accent-amber)"
            sub={
              weightTrend.r2 < 0.4
                ? 'por semana · datos aún dispersos'
                : `por semana · fiabilidad ${Math.round(weightTrend.r2 * 100)}%`
            }
          />
        )}
        {adherence && (
          <StatCard
            label="Adherencia"
            value={`${adherence.pct}%`}
            color={adherence.pct >= 85 ? 'var(--accent-emerald)' : 'var(--accent-amber)'}
            sub={`${adherence.logged} de ${adherence.planned} series registradas`}
          />
        )}
        <DeltaCard label="Tonelaje" metricId="tonnage" series={fullSeries} />
        <DeltaCard label="Series efectivas" metricId="sets" series={fullSeries} />
        <StatCard label={`${unit}s programadas`} value={microcycles.length} color="var(--accent-purple)" />
      </div>

      <ChartCard
        icon={Weight}
        color="var(--accent-emerald)"
        title="Evolución del peso"
        subtitle="Promedio de cada semana, no pesajes sueltos."
        controls={
          <>
            <ChartToggle checked={weightSmooth} onChange={setWeightSmooth}>
              Suavizar
            </ChartToggle>
            <RangeChips value={weightRange} onChange={setWeightRange} options={RANGES} />
          </>
        }
        note={
          weightTrend
            ? `De media ${weightTrend.perWeek > 0 ? 'sube' : weightTrend.perWeek < 0 ? 'baja' : 'se mantiene'} ${Math.abs(weightTrend.perWeek)} kg por semana en el periodo mostrado.`
            : null
        }
      >
        <LineChart
          series={[
            {
              id: 'weight',
              label: 'Peso',
              color: 'var(--accent-emerald)',
              unit: ' kg',
              decimals: 1,
              axis: 'left',
              points: weightPoints,
            },
          ]}
          labels={weightSeries.map((row) => row.label)}
          smoothWindow={weightSmooth ? 3 : 0}
          showTrend={false}
          height={250}
          emptyMessage="Registra tu peso en «Peso y medidas» para empezar a ver la evolución."
        />
      </ChartCard>

      <ChartCard
        icon={Activity}
        color="var(--accent-cyan)"
        title={`Tonelaje por ${unit.toLowerCase()}`}
        subtitle="Kilos totales levantados en cada microciclo. La línea une el valor real de cada semana."
        controls={
          <ChartToggle checked={tonnageSmooth} onChange={setTonnageSmooth}>
            Media de 3 semanas
          </ChartToggle>
        }
      >
        <BarTrendChart
          bars={tonnage.map((t) => ({
            label: `${unit.charAt(0)}${t.week}`,
            value: t.tonnage,
            highlight: t.week === latestWeek,
          }))}
          unit=" kg"
          showLine
          showSmooth={tonnageSmooth}
          height={250}
        />
      </ChartCard>

      <Panel tight className="row gap-3">
        <LineChartIcon size={17} color="var(--accent-purple)" />
        <p className="text-sm text-muted grow">
          {isClient
            ? 'En la pestaña «Analítica» tienes la progresión de cada ejercicio, el volumen por músculo y tus perímetros.'
            : 'La pestaña «Analítica» tiene la progresión por ejercicio, el volumen y la frecuencia por músculo, la intensidad y los perímetros.'}
        </p>
      </Panel>
    </div>
  );
};
