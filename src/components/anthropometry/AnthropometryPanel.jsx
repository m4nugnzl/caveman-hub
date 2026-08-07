import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Ruler, Scale, Save, Trash2, TrendingDown } from 'lucide-react';

import {
  FOLDS_LABELS,
  PERIMETER_LABELS,
  buildAnthropometryLog,
  emptyAnthropometry,
  emptyFolds,
  emptyPerimeters,
  fatPercent,
  foldsSum,
  hasMeasurements,
  reverseChronological,
  rollingWeightAverage,
  seriesDelta,
  weeklyRateOfChange,
  weeklyWeightAverages,
  weightSeries,
} from '@/domain/anthropometry';
import { todayISO } from '@/lib/dates';
import { fmt, toNum } from '@/lib/num';
import { TrendChart } from '@/components/ui/charts';
import {
  Field,
  Notice,
  Panel,
  SaveIndicator,
  SectionTitle,
  StatCard,
} from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';

/** Rejilla de campos numéricos etiquetados (pliegues y perímetros). */
const MeasureGrid = ({ labels, values, unit, onChange }) => (
  <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
    {Object.entries(labels).map(([key, label]) => (
      <div className="panel-sunken row between gap-2" key={key} style={{ padding: '8px 12px' }}>
        <label className="text-sm text-muted" htmlFor={`m-${key}`}>
          {label}
        </label>
        <input
          id={`m-${key}`}
          type="text"
          inputMode="decimal"
          className="input input-center input-bare"
          style={{ width: 58 }}
          value={values[key] ?? ''}
          onChange={(e) => onChange(key, e.target.value)}
          aria-label={`${label} en ${unit}`}
        />
      </div>
    ))}
  </div>
);

/**
 * Registro y seguimiento de peso y medidas.
 *
 * Lo usan el cliente (que es quien registra sus medidas) y el entrenador (que
 * consulta y puede corregir). Mismo componente para los dos: la única
 * diferencia son los textos, que cambian según `audience`.
 *
 * Regla de producto: **el peso es obligatorio en cada revisión**; pliegues y
 * perímetros son opcionales y van plegados para no estorbar, porque no se miden
 * todas las semanas.
 */
export const AnthropometryPanel = ({
  client,
  anthropometry,
  nutritionPlan,
  audience = 'client',
  save,
  onRetry,
  onAdd,
  onRemove,
}) => {
  const confirm = useConfirm();
  // Memoizado: `|| []` crearía un array nuevo en cada render e invalidaría los
  // seis cálculos derivados que dependen de él.
  const history = useMemo(() => anthropometry?.history || emptyAnthropometry().history, [anthropometry]);

  const [date, setDate] = useState(todayISO);
  const [weight, setWeight] = useState('');
  const [folds, setFolds] = useState(emptyFolds);
  const [perimeters, setPerimeters] = useState(emptyPerimeters);
  const [showMeasures, setShowMeasures] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const isClient = audience === 'client';

  const weights = useMemo(() => weightSeries(history), [history]);
  const weekly = useMemo(() => weeklyWeightAverages(history), [history]);
  const rolling = useMemo(() => rollingWeightAverage(history, 3), [history]);
  const delta = useMemo(() => seriesDelta(weekly), [weekly]);
  const rate = useMemo(() => weeklyRateOfChange(history), [history]);
  const rows = useMemo(() => reverseChronological(history), [history]);

  const sum = foldsSum(folds);
  const pct = fatPercent(folds, client.gender);

  const submit = (event) => {
    event.preventDefault();
    if (toNum(weight) === null) {
      setFeedback({ tone: 'error', text: 'El peso es obligatorio.' });
      return;
    }
    if (!date) {
      setFeedback({ tone: 'error', text: 'Indica la fecha del pesaje.' });
      return;
    }

    const existing = history.some((h) => h.date === date);

    onAdd(
      buildAnthropometryLog({
        date,
        weight,
        folds,
        perimeters,
        // Foto de las kcal y macros vigentes, para poder cruzar después dieta
        // con evolución de peso: la tabla de nutrición no guarda histórico.
        nutritionPlan,
      })
    );

    setWeight('');
    setFolds(emptyFolds());
    setPerimeters(emptyPerimeters());
    setDate(todayISO());
    setShowMeasures(false);
    setFeedback({
      tone: 'success',
      text: existing ? `Se ha actualizado el registro del ${date}.` : 'Registro guardado.',
    });
  };

  const askRemove = async (log) => {
    const ok = await confirm({
      title: '¿Eliminar este registro?',
      message: `Se borrará la medición del ${log.date}.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (ok) onRemove(log.id);
  };

  return (
    <div className="stack">
      {weights.length > 0 && (
        <div className="grid-auto">
          <StatCard
            label="Último peso"
            value={fmt(weights[weights.length - 1].value, { decimals: 1, unit: ' kg' })}
            color="var(--accent-emerald)"
            sub={weights[weights.length - 1].date}
          />
          <StatCard
            label="Media últimos 3"
            value={rolling ? `${rolling.average} kg` : '—'}
            color="var(--accent-amber)"
            sub={rolling ? `${rolling.count} ${rolling.count === 1 ? 'pesaje' : 'pesajes'}` : 'sin datos'}
          />
          {delta && (
            <StatCard
              label="Variación total"
              value={`${delta.delta > 0 ? '+' : ''}${delta.delta} kg`}
              color={delta.delta <= 0 ? 'var(--accent-emerald)' : 'var(--accent-coral)'}
              sub={`de ${delta.from} a ${delta.to} kg`}
            />
          )}
          {rate !== null && (
            <StatCard
              label="Ritmo semanal"
              value={`${rate > 0 ? '+' : ''}${rate} kg`}
              color="var(--accent-cyan)"
              sub="promedio por semana"
            />
          )}
        </div>
      )}

      <Panel as="form" className="col gap-5" onSubmit={submit}>
        <SectionTitle
          icon={Scale}
          color="var(--accent-amber)"
          action={<SaveIndicator status={save.status} error={save.error} onRetry={onRetry} />}
        >
          {isClient ? 'Registrar mi peso' : `Nueva revisión de ${client.name}`}
        </SectionTitle>

        <p className="text-sm text-muted">
          {isClient
            ? 'Pésate por la mañana, en ayunas y después de ir al baño. Lo ideal es registrar 3 días alternos por semana: el promedio filtra la variación diaria de agua y es lo que de verdad indica si tu peso sube o baja.'
            : 'El peso es el único dato obligatorio. Los pliegues y perímetros son opcionales; normalmente los registra el cliente, pero puedes añadirlos tú si mides en persona.'}
        </p>

        {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

        <div className="row-end wrap gap-4">
          <Field label="Fecha" className="grow">
            {(props) => (
              <input
                {...props}
                type="date"
                className="input"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            )}
          </Field>

          <Field label="Peso (kg) *" className="grow" hint="Obligatorio">
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                className="input input-center"
                style={{ fontSize: '1.1rem' }}
                placeholder="81.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                required
              />
            )}
          </Field>

          <button type="submit" className="btn btn-primary btn-lg shrink-0">
            <Save size={16} /> Guardar
          </button>
        </div>

        <div className="col gap-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: 'flex-start' }}
            aria-expanded={showMeasures}
            onClick={() => setShowMeasures((v) => !v)}
          >
            {showMeasures ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Ruler size={14} /> Añadir pliegues y perímetros (opcional)
          </button>

          {showMeasures && (
            <>
              <Notice tone="info">
                Fórmula de 6 pliegues ·{' '}
                {client.gender === 'Mujer'
                  ? '% graso = 3,5803 + (Σ mm × 0,1548)'
                  : '% graso = 2,59 + (Σ mm × 0,1051)'}{' '}
                · sexo registrado: {client.gender || 'sin definir'}
              </Notice>

              <div className="col gap-3">
                <h4 className="uppercase-label">Pliegues cutáneos (mm)</h4>
                <MeasureGrid
                  labels={FOLDS_LABELS}
                  values={folds}
                  unit="milímetros"
                  onChange={(k, v) => setFolds((f) => ({ ...f, [k]: v }))}
                />
                {sum > 0 && (
                  <div
                    className="row between wrap gap-3"
                    style={{
                      background: 'rgba(6,182,212,0.14)',
                      border: '1px solid rgba(6,182,212,0.3)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px',
                    }}
                  >
                    <span className="text-sm" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                      Suma: {sum} mm
                    </span>
                    <strong style={{ fontSize: '1.25rem' }}>% graso: {pct ?? '—'}%</strong>
                  </div>
                )}
              </div>

              <div className="col gap-3">
                <h4 className="uppercase-label">Perímetros corporales (cm)</h4>
                <MeasureGrid
                  labels={PERIMETER_LABELS}
                  values={perimeters}
                  unit="centímetros"
                  onChange={(k, v) => setPerimeters((p) => ({ ...p, [k]: v }))}
                />
              </div>
            </>
          )}
        </div>
      </Panel>

      {weekly.length >= 2 && (
        <Panel tight className="col gap-4">
          <SectionTitle icon={TrendingDown} color="var(--accent-emerald)">
            Tendencia de peso (promedio semanal)
          </SectionTitle>
          <TrendChart points={weekly} color="var(--accent-emerald)" unit=" kg" />
          <p className="text-xs text-dim">
            Cada punto es el promedio de la semana, no un pesaje suelto: así la línea refleja la
            tendencia real y no el ruido del día a día.
          </p>
        </Panel>
      )}

      {rows.length > 0 && (
        <Panel tight className="col gap-4">
          <SectionTitle>Historial de registros</SectionTitle>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col" className="num">Peso</th>
                  {hasMeasurements(history) && (
                    <>
                      <th scope="col" className="num">% Graso</th>
                      <th scope="col" className="num">Cintura</th>
                      <th scope="col" className="num">Σ Pliegues</th>
                    </>
                  )}
                  <th scope="col" className="num">Kcal</th>
                  <th scope="col" className="num">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => {
                  const logPct = fatPercent(log.skinFolds, client.gender);
                  return (
                    <tr key={log.id || log.date}>
                      <td style={{ fontWeight: 700 }}>{log.date}</td>
                      <td className="num" style={{ fontWeight: 800, color: 'var(--accent-amber)' }}>
                        {fmt(log.weight, { decimals: 1 })}
                      </td>
                      {hasMeasurements(history) && (
                        <>
                          <td className="num" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                            {logPct === null ? '—' : `${logPct}%`}
                          </td>
                          <td className="num text-muted">
                            {fmt(log.perimeters?.ombligo, { decimals: 1 })}
                          </td>
                          <td className="num text-muted">{foldsSum(log.skinFolds) || '—'}</td>
                        </>
                      )}
                      <td className="num text-muted">{fmt(log.nutrition?.kcals)}</td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn btn-icon btn-icon-danger"
                          onClick={() => askRemove(log)}
                          aria-label={`Eliminar el registro del ${log.date}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {rows.length === 0 && (
        <Panel>
          <div className="empty">
            <span className="empty-icon">
              <Plus size={24} />
            </span>
            <h3>Sin registros todavía</h3>
            <p>
              {isClient
                ? 'Registra tu primer peso arriba. Con dos o tres registros ya se empieza a ver la tendencia.'
                : 'Este cliente aún no tiene ningún pesaje registrado.'}
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
};
