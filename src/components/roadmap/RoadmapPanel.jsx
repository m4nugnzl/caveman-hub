import { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Route, Trash2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { latestWeight } from '@/domain/anthropometry';
import { GOAL_DIRECTIONS, directionById, targetRateKg } from '@/domain/goals';
import {
  PHASE_PRESETS,
  PHASE_WEEKS_RANGE,
  endFromWeeks,
  nextPhaseDraft,
  phaseProgress,
  phaseWeeks,
  roadmapState,
  validatePhase,
} from '@/domain/roadmap';
import { shortDate, todayISO } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { EmptyState, Field, Notice, Panel, SectionTitle, Switch } from '@/components/ui/primitives';

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
  const { activeClient, phases, anthropometry, addPhase, updatePhase, removePhase, plan } = useApp();

  /* Igual que en el portal: el peso sale del histórico, que es lo único que se
     mantiene al día. */
  const pesoActual = latestWeight(anthropometry[activeClient?.id]?.history);
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

  /*
    `col gap-4`: `Panel` pinta la tarjeta y su relleno, pero no separa a sus
    hijos entre sí. Sin esto, la cabecera queda tocando la primera fase. Mismo
    olvido que en el panel de Ayuda.
  */
  return (
    <Panel className="col gap-4">
      <SectionTitle
        icon={Route}
        action={
          /*
            Sin fases, el hueco central ya ofrece «Crear la primera fase». Sacar
            además este arriba deja dos botones iguales peleando por el mismo
            clic, y el de la cabecera parece pegado encima del otro.
          */
          puedeEditar && !form && state.all.length > 0 ? (
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
        <div className="rmap">
          {state.all.map((fase, index) => (
            <PhaseRow
              key={fase.id}
              phase={fase}
              index={index + 1}
              today={hoy}
              current={state.current?.id === fase.id}
              past={state.past.some((p) => p.id === fase.id)}
              weight={pesoActual}
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
 * Una parada del recorrido: su nodo en el carril y su tarjeta al lado.
 *
 * ── Por qué no reutiliza `.step` ────────────────────────────────────────────
 * `.step` es de los asistentes de integración y tiene dos estados —hecho y por
 * hacer—. Un recorrido tiene tres, y el que falta, **dónde estás hoy**, es el que
 * más importa. Allí además la línea que une es un separador gris; aquí es el
 * dato: lleva el color de la dirección, así que la secuencia entera
 * —definición, mantener, volumen— se lee sin leer una palabra.
 */
const PhaseRow = ({ phase, index, today, current, past, weight, onEdit, onRemove, busy }) => {
  const meta = directionById(phase.direction);
  const progress = phaseProgress(phase, today);
  const kg = targetRateKg(phase, weight);
  const semanas = phaseWeeks(phase.startsOn, phase.endsOn);

  const estado = past ? 'is-past' : current ? 'is-current' : 'is-future';

  return (
    /*
      El color va como variable CSS y no como estilo suelto porque lo leen tres
      reglas: el nodo, su halo y el tramo de carril que baja hasta la fase
      siguiente. Repartirlo en tres `style` obligaría a acordarse de los tres.
    */
    <div className={`rmap-item ${estado}`} style={{ '--fase': meta?.color }}>
      <span className="rmap-node" aria-hidden="true">
        {past ? <Check size={14} /> : index}
      </span>

      <div className="rmap-card">
        {/* Las acciones, en la píldora flotante que ya usan las piezas del
            resumen (`.slot-tools`). Antes eran dos botones fijos en cada fila,
            que convertían la lista en una barra de herramientas con datos al
            lado; ahora aparecen al acercarse o al enfocar con el teclado. */}
        {(onEdit || onRemove) && (
          <div className="slot-tools" role="group" aria-label={`Ajustar ${phase.title}`}>
            {onEdit && (
              <button
                type="button"
                className="slot-btn"
                onClick={onEdit}
                aria-label={`Editar ${phase.title}`}
                title="Editar"
              >
                <Pencil size={13} />
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                className="slot-btn is-danger"
                onClick={onRemove}
                disabled={busy}
                aria-label={`Borrar ${phase.title}`}
                title="Borrar"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}

        <div className="rmap-head">
          <strong>{phase.title}</strong>
          {current && <span className="badge badge-info">Ahora</span>}
        </div>

        <div className="rmap-when row gap-2 wrap">
          <span className="tnum">
            {shortDate(phase.startsOn)} – {phase.endsOn ? shortDate(phase.endsOn) : 'sin final'}
          </span>
          {semanas ? <span className="tnum">· {semanas} sem</span> : null}
          <span style={{ color: meta?.color }}>· {meta?.label || phase.direction}</span>
          {/* El ritmo en kg/semana y no en el % que se guarda, porque es como
              piensa el entrenador. Sin peso registrado no hay conversión posible
              y se dice el porcentaje, que es mejor que un hueco. */}
          {meta?.sign !== 0 && (
            <span className="tnum">
              {'· '}
              {kg === null
                ? `${fmt(phase.ratePct, { decimals: 2 })} %/sem`
                : `${kg > 0 ? '+' : ''}${fmt(kg, { decimals: 2 })} kg/sem`}
            </span>
          )}
        </div>

        {/* La barra solo en la fase en curso: en las pasadas marcaría siempre 100
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
    </div>
  );
};

/** Alta y edición. El mismo formulario para las dos: los campos son idénticos. */
const PhaseForm = ({ value, onChange, onSubmit, onCancel, busy }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  const meta = directionById(value.direction);
  // Sin fecha de fin, la fase queda abierta. Es un estado, no un campo vacío.
  const abierta = !value.endsOn;
  // Cuántas semanas dura lo que hay puesto. `null` si el rango no son semanas
  // exactas —una fase heredada de 17 días, por ejemplo—: entonces la barra se
  // planta en su valor por defecto y ningún atajo sale marcado, que es honesto.
  const semanasActuales = phaseWeeks(value.startsOn, value.endsOn);

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

      <Field label="Empieza">
        <input
          type="date"
          className="input"
          value={value.startsOn || ''}
          onChange={(e) => set({ startsOn: e.target.value })}
        />
      </Field>

      {/*
        ══ La duración manda, la fecha de fin se deduce ══════════════════════

        Antes había dos fechas y unos atajos de semanas al lado, y era el orden
        equivocado: nadie planifica «definición hasta el 23 de mayo», planifica
        «doce semanas de definición». Con dos calendarios había que hacer la
        cuenta mentalmente y comprobar que cuadraba.

        Ahora se elige la duración —barra para el ajuste fino, atajos para lo
        habitual— y el día en que termina se enseña como CONSECUENCIA, en texto.
        No hace falta escribirlo nunca.
      */}
      {value.startsOn && (
        <Field label="Duración">
          <div className="col gap-2">
            <div className="row gap-3">
              <input
                type="range"
                className="range"
                min={PHASE_WEEKS_RANGE.min}
                max={PHASE_WEEKS_RANGE.max}
                value={semanasActuales || 12}
                disabled={abierta}
                onChange={(e) => set({ endsOn: endFromWeeks(value.startsOn, e.target.value) })}
                aria-label="Semanas que dura la fase"
              />
              <span className="tnum shrink-0" style={{ minWidth: 84 }}>
                {abierta ? '—' : `${semanasActuales || 12} sem`}
              </span>
            </div>

            <div className="row gap-2 wrap">
              {PHASE_PRESETS.map((semanas) => (
                <button
                  key={semanas}
                  type="button"
                  className="chip"
                  aria-pressed={!abierta && semanasActuales === semanas}
                  onClick={() => set({ endsOn: endFromWeeks(value.startsOn, semanas) })}
                >
                  {semanas} sem
                </button>
              ))}
            </div>

            {/*
              La fase abierta es una decisión, no un campo en blanco: «todavía no
              sé cuánto va a durar». Dicho así lo dice; como fecha vacía en un
              calendario parecía que faltaba rellenar algo.

              Interruptor y no casilla: no es algo que se marque dentro de un
              formulario que luego se envía, es el estado en el que queda la fase.
              La consecuencia va en la pista, que es donde se estaba leyendo ya.
            */}
            <Switch
              label="Todavía no sé cuánto va a durar"
              hint={
                abierta
                  ? 'La fase se queda abierta hasta que le pongas un final.'
                  : `Termina el ${shortDate(value.endsOn)}.`
              }
              checked={abierta}
              onChange={(on) => set({ endsOn: on ? null : endFromWeeks(value.startsOn, 12) })}
            />
          </div>
        </Field>
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
