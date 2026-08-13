import { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Route, Trash2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { GOAL_DIRECTIONS, directionById, targetRateKg } from '@/domain/goals';
import {
  PHASE_PRESETS,
  nextPhaseDraft,
  phaseProgress,
  roadmapState,
  validatePhase,
} from '@/domain/roadmap';
import { shortDate, todayISO } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { EmptyState, Field, Notice, Panel, SectionTitle } from '@/components/ui/primitives';

/**
 * El roadmap del cliente: el plan por tramos, con el de hoy destacado.
 *
 * ══ Por qué el cliente ve esto ═════════════════════════════════════════════
 *
 * Porque es la mitad de la razón de que exista. Un cliente sabe qué le toca esta
 * semana y no sabe hacia dónde va, y eso es exactamente lo que hace que se caiga
 * en la fase aburrida: nadie aguanta cuatro semanas de mantenimiento si cree que
 * eso es todo lo que hay. Verlas en una lista, con la de después ya escrita,
 * convierte «esto no avanza» en «esto es el paso dos de tres».
 *
 * Lo ve y no lo toca. El roadmap es criterio profesional del entrenador; si el
 * cliente pudiera moverse de fase no habría plan que sostener. Lo garantiza RLS
 * (migración 0028), no este componente: aquí solo se decide qué botones salen.
 */
export const RoadmapPanel = ({ audience = 'coach' }) => {
  const { activeClient, phases, addPhase, updatePhase, removePhase, plan } = useApp();
  const [form, setForm] = useState(null); // null | {…draft, id?}
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const hoy = todayISO();
  const state = useMemo(() => roadmapState(phases, hoy), [phases, hoy]);

  const isClient = audience === 'client';
  // Con la suscripción caducada la base rechaza la escritura (0027). Esconder los
  // botones evita ofrecer algo que va a fallar al guardar.
  const puedeEditar = !isClient && plan?.activo !== false;

  if (!activeClient) return null;

  const abrirNuevo = () => {
    const draft = nextPhaseDraft(phases, 'cut', 12, hoy);
    setError(
      draft
        ? ''
        : 'La última fase no tiene fecha de fin, así que no se puede encadenar otra detrás. Ponle un final primero.'
    );
    if (draft) setForm(draft);
  };

  const guardar = async (event) => {
    event.preventDefault();
    const problema = validatePhase(phases, form, form.id || null);
    if (problema) {
      setError(problema);
      return;
    }

    setBusy(true);
    const res = form.id
      ? await updatePhase(form.id, form)
      : await addPhase(activeClient.id, form);
    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setForm(null);
    setError('');
  };

  const borrar = async (id) => {
    setBusy(true);
    const res = await removePhase(id);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <Panel>
      <SectionTitle
        icon={Route}
        action={
          puedeEditar && !form ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={abrirNuevo}>
              <Plus size={14} /> Añadir fase
            </button>
          ) : null
        }
      >
        Roadmap
      </SectionTitle>

      {error && <Notice tone="error">{error}</Notice>}

      {/*
        El agujero de hoy. Es el único aviso que da esta pantalla porque es el
        único que tiene consecuencias: sin fase que cubra hoy, la analítica se cae
        al objetivo suelto y el cliente no ve nada en curso.
      */}
      {state.gapToday && (
        <Notice tone="warn">
          Hoy no cae dentro de ninguna fase.{' '}
          {isClient
            ? 'Tu entrenador todavía no ha planificado este tramo.'
            : 'Mientras haya hueco, la lectura usa el objetivo suelto de la ficha.'}
        </Notice>
      )}

      {state.all.length === 0 && !form && (
        <EmptyState
          icon={Route}
          title="Sin roadmap"
          message={
            isClient
              ? 'Tu entrenador todavía no ha dividido tu proceso en fases.'
              : 'Divide el proceso en tramos con fechas —doce semanas de definición, cuatro de mantenimiento, dieciséis de volumen— y la analítica juzgará cada semana contra la fase que toque, no contra un objetivo eterno.'
          }
          action={
            puedeEditar ? (
              <button type="button" className="btn btn-primary" onClick={abrirNuevo}>
                <Plus size={16} /> Crear la primera fase
              </button>
            ) : null
          }
        />
      )}

      {state.all.length > 0 && (
        <div className="list">
          {state.all.map((fase, index) => (
            <PhaseRow
              key={fase.id}
              phase={fase}
              index={index + 1}
              today={hoy}
              current={state.current?.id === fase.id}
              past={state.past.some((p) => p.id === fase.id)}
              weight={activeClient.currentWeight}
              onEdit={puedeEditar ? () => setForm({ ...fase }) : null}
              onRemove={puedeEditar ? () => borrar(fase.id) : null}
              busy={busy}
            />
          ))}
        </div>
      )}

      {form && (
        <PhaseForm
          value={form}
          onChange={setForm}
          onSubmit={guardar}
          onCancel={() => {
            setForm(null);
            setError('');
          }}
          busy={busy}
        />
      )}
    </Panel>
  );
};

/**
 * Una fase de la lista.
 *
 * Se reutiliza el bloque `.step` de los asistentes de integración: es exactamente
 * la misma forma —una marca, un cuerpo y una línea que las une— y ya sabe pintar
 * lo hecho. Inventar un `.roadmap-item` paralelo sería un segundo sistema visual
 * para lo mismo.
 */
const PhaseRow = ({ phase, index, today, current, past, weight, onEdit, onRemove, busy }) => {
  const meta = directionById(phase.direction);
  const progress = phaseProgress(phase, today);
  const kg = targetRateKg(phase, weight);

  return (
    <div className={`step${past ? ' is-done' : ''}${current ? ' is-current' : ''}`}>
      <span className="step-mark" style={current ? { color: meta?.color } : undefined}>
        {past ? <Check size={13} /> : index}
      </span>

      <div className="step-body">
        <div className="step-head">
          <strong>{phase.title}</strong>
          <span className="tnum">
            {shortDate(phase.startsOn)} –{' '}
            {phase.endsOn ? shortDate(phase.endsOn) : 'sin fecha de fin'}
          </span>
          {current && <span className="badge badge-info">Ahora</span>}
        </div>

        <div className="row gap-2 t-xs t-secondary">
          <span className="chip" style={{ color: meta?.color }}>
            {meta?.label || phase.direction}
          </span>
          {/*
            El ritmo se enseña en kg/semana y no en el % que se guarda, porque es
            como piensa el entrenador. Sin peso registrado no hay conversión
            posible y se dice el porcentaje, que es mejor que un hueco.
          */}
          {meta?.sign !== 0 && (
            <span className="tnum">
              {kg === null
                ? `${fmt(phase.ratePct, { decimals: 2 })} %/semana`
                : `${kg > 0 ? '+' : ''}${fmt(kg, { decimals: 2 })} kg/semana`}
            </span>
          )}
        </div>

        {/* La barra solo en la fase en curso: en las pasadas siempre marcaría 100
            y en las futuras siempre 0, que no es información sino ruido. */}
        {current && progress && !progress.open && (
          <div className="col gap-1">
            <div className="plan-bar">
              <span className="plan-bar-fill" style={{ width: `${progress.pct}%` }} />
            </div>
            <span className="t-2xs t-tertiary tnum">
              Semana {Math.ceil(progress.elapsed / 7)} · {progress.weeksLeft}{' '}
              {progress.weeksLeft === 1 ? 'semana restante' : 'semanas restantes'}
            </span>
          </div>
        )}
        {current && progress?.open && (
          <span className="t-2xs t-tertiary">Fase abierta, sin final decidido.</span>
        )}

        {phase.note && <p className="t-xs t-secondary">{phase.note}</p>}
      </div>

      {(onEdit || onRemove) && (
        <span className="row gap-1 shrink-0">
          {onEdit && (
            <button type="button" className="btn-icon" onClick={onEdit} aria-label="Editar fase">
              <Pencil size={14} />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              className="btn-icon btn-icon-danger"
              onClick={onRemove}
              disabled={busy}
              aria-label="Borrar fase"
            >
              <Trash2 size={14} />
            </button>
          )}
        </span>
      )}
    </div>
  );
};

/** Alta y edición. El mismo formulario para las dos: los campos son idénticos. */
const PhaseForm = ({ value, onChange, onSubmit, onCancel, busy }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  const meta = directionById(value.direction);

  return (
    <form className="card-inset col gap-3" onSubmit={onSubmit}>
      <span className="section-label">{value.id ? 'Editar fase' : 'Nueva fase'}</span>

      <Field label="Nombre">
        <input
          autoFocus
          className="input"
          value={value.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Definición de verano"
        />
      </Field>

      <div className="rail-wrap" role="group" aria-label="Dirección">
        {GOAL_DIRECTIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            className="chip"
            aria-pressed={value.direction === d.id}
            title={d.hint}
            // Al cambiar de dirección se arrastra el ritmo por defecto de la nueva.
            // Dejar el anterior daría un mantenimiento con ritmo o un volumen al
            // 0,6 % —el de una definición—, que es el doble de lo razonable.
            onClick={() => set({ direction: d.id, ratePct: d.defaultRate })}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="grid-2 gap-3">
        <Field label="Empieza">
          <input
            type="date"
            className="input"
            value={value.startsOn || ''}
            onChange={(e) => set({ startsOn: e.target.value })}
          />
        </Field>
        <Field
          label="Termina"
          hint="Déjalo en blanco si todavía no sabes cuánto va a durar."
        >
          <input
            type="date"
            className="input"
            value={value.endsOn || ''}
            onChange={(e) => set({ endsOn: e.target.value || null })}
          />
        </Field>
      </div>

      {/* Los atajos de duración: lo que se usa de verdad, sin quitar la fecha
          libre de arriba. Ver PHASE_PRESETS. */}
      {value.startsOn && (
        <div className="row gap-2">
          <span className="t-2xs t-tertiary">Duración</span>
          {PHASE_PRESETS.map((semanas) => (
            <button
              key={semanas}
              type="button"
              className="chip"
              onClick={() =>
                set({
                  endsOn: nextPhaseDraft([], value.direction, semanas, value.startsOn).endsOn,
                })
              }
            >
              {semanas} sem
            </button>
          ))}
        </div>
      )}

      {meta?.sign !== 0 && (
        <Field label="Ritmo semanal (% del peso)" hint={meta?.hint}>
          <input
            type="number"
            className="input input-center"
            step="0.05"
            min="0"
            max="2"
            value={value.ratePct}
            onChange={(e) => set({ ratePct: Number(e.target.value) })}
          />
        </Field>
      )}

      <Field label="Nota" hint="Lo que el cliente debe saber de este tramo.">
        <textarea
          className="textarea"
          rows={2}
          value={value.note || ''}
          onChange={(e) => set({ note: e.target.value })}
        />
      </Field>

      <div className="row gap-2 row-end">
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar fase'}
        </button>
      </div>
    </form>
  );
};
