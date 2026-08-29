import { Fragment, useMemo, useState } from 'react';
import { Check, GitBranch, Pencil, Plus, Route, Trash2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { latestWeight } from '@/domain/anthropometry';
import {
  FORK_RANGE,
  forkDraft,
  forkState,
  forkablePhase,
  hasFork,
  optionDraft,
  validateFork,
} from '@/domain/fork';
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
/*
  ── `desnudo`: el mismo panel, sin su tarjeta ni su rótulo ────────────────
  Desde que el roadmap se abre en una ventana (`dashboard/FasesPopup`), pintar
  aquí su superficie y su sombra sería una tarjeta dentro de otra tarjeta —el
  defecto que el rediseño del resumen vino a quitar— y su «Roadmap» diría por
  segunda vez, con otra palabra, lo que ya dice el título de la ventana.

  Con `desnudo` el contenido sale a pelo y el marco lo pone quien lo abre. Sin
  él, se comporta exactamente como siempre.
*/
export const RoadmapPanel = ({ audience = 'coach', desnudo = false }) => {
  const {
    activeClient,
    phases,
    anthropometry,
    addPhase,
    updatePhase,
    removePhase,
    setPhaseFork,
    chooseFork,
    plan,
  } = useApp();

  /* Igual que en el portal: el peso sale del histórico, que es lo único que se
     mantiene al día. */
  const pesoActual = latestWeight(anthropometry[activeClient?.id]?.history);
  const [form, setForm] = useState(null); // null | {…draft, id?}
  const [forkForm, setForkForm] = useState(null); // null | {phaseId, options}
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const hoy = todayISO();
  const state = useMemo(() => roadmapState(phases, hoy), [phases, hoy]);
  const cruce = useMemo(() => forkState(phases, hoy), [phases, hoy]);
  /* La fase a la que se le podría colgar un cruce: la última, y solo si tiene
     final. `null` es lo que apaga el botón sin tener que repetir la regla. */
  const bifurcable = useMemo(() => forkablePhase(phases), [phases]);

  const isClient = audience === 'client';
  // Con la suscripción caducada la base rechaza la escritura (0027). Esconder los
  // botones evita ofrecer algo que va a fallar al guardar.
  const puedeEditar = !isClient && plan?.activo !== false;

  if (!activeClient) return null;

  /*
    Al cliente sin fases no se le pinta nada. Un panel fijo en su portada que
    dice «tu entrenador todavía no ha dividido tu proceso en fases» promete algo
    que puede no llegar nunca — la misma regla por la que una sección apagada no
    existe (`domain/protocol.js`). El vacío explicativo es para el ENTRENADOR,
    que sí puede crear la primera fase; al cliente el roadmap le aparece solo en
    cuanto exista.
  */
  if (isClient && state.all.length === 0) return null;

  const abrirNuevo = () => {
    const draft = nextPhaseDraft(phases, 'cut', 12, hoy);
    setError(
      draft
        ? ''
        : 'La última fase no tiene fecha de fin, así que no se puede encadenar otra detrás. Ponle un final primero.'
    );
    if (draft) {
      setForkForm(null);
      setForm(draft);
    }
  };

  /*
    ══ El cruce ══════════════════════════════════════════════════════════════

    Los cuatro gestos que existen, y ninguno más: plantearlo, retocarlo, elegir
    un camino y descartarlo. No hay «avanzar solo»: la decisión es del
    entrenador y esta pantalla no tiene por dónde tomarla por él.
  */
  const abrirCruce = (existente = null) => {
    const fase = existente?.phase || bifurcable;
    if (!fase) return;
    setForm(null);
    setError('');
    setForkForm({ phaseId: fase.id, options: existente?.options || forkDraft() });
  };

  const guardarCruce = async (event) => {
    event.preventDefault();
    const problema = validateFork(phases, forkForm.phaseId, forkForm.options);
    if (problema) {
      setError(problema);
      return;
    }

    setBusy(true);
    const res = await setPhaseFork(forkForm.phaseId, forkForm.options);
    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setForkForm(null);
    setError('');
  };

  /* Elegir crea la fase y borra los caminos. El porqué del orden —y de que un
     fallo a mitad sea inofensivo— está en `useRoadmap.js`. */
  const elegirCamino = async (option) => {
    setBusy(true);
    const res = await chooseFork(cruce.phase, option);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  /*
    Descartar es la salida cuando no vale ninguno de los caminos, que es lo que
    pasa cuando el cliente se lesiona o se va de viaje. Se quedan en nada y la
    fase siguiente se crea a mano: el cruce era una previsión, no un compromiso,
    y no deja rastro porque no lo merece.
  */
  const descartarCruce = async () => {
    setBusy(true);
    const res = await setPhaseFork(cruce.phase.id, null);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  const guardar = async (event) => {
    event.preventDefault();
    const problema = validatePhase(phases, form, form.id || null);
    if (problema) {
      setError(problema);
      return;
    }

    /*
      Quitarle el final a una fase que tiene un cruce planteado lo dejaría sin
      día en el que decidirse, y la base lo rechaza (`client_phases_fork_needs_end`,
      migración 0073). Se dice aquí, donde se puede corregir, en vez de dejar
      salir el error del CHECK — la misma razón por la que `overlapping` existe
      teniendo el constraint de exclusión.
    */
    if (!form.endsOn && hasFork(form)) {
      setError(
        'Esta fase tiene un cruce planteado y sin fecha de fin no habría día en el que decidir. Descarta el cruce o déjale un final.'
      );
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
  const Marco = desnudo ? 'div' : Panel;
  /*
    Sin fases, el hueco central ya ofrece «Crear la primera fase». Sacar además
    este arriba deja dos botones iguales peleando por el mismo clic, y el de la
    cabecera parece pegado encima del otro.
  */
  const anadir =
    puedeEditar && !form && !forkForm && state.all.length > 0 ? (
      <button type="button" className="btn btn-secondary btn-sm" onClick={abrirNuevo}>
        <Plus size={14} /> Añadir fase
      </button>
    ) : null;

  return (
    <Marco className="col gap-4">
      {desnudo ? (
        anadir && <div className="row between">{anadir}</div>
      ) : (
        <SectionTitle icon={Route} action={anadir}>
          Roadmap
        </SectionTitle>
      )}

      {error && !form && !forkForm && <Notice tone="error">{error}</Notice>}

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

      {state.all.length === 0 && !form && !forkForm && (
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
              error={error}
            />
          ))}

          {/*
            El cruce va al final del carril y no en una tarjeta aparte porque es
            parte del plan: lo que hay después de la última fase. Sacarlo fuera
            lo convertiría en un ajuste, y es justo lo contrario — es lo único de
            esta pantalla que hay que mirar cuando llega su fecha.
          */}
          {cruce && !forkForm && (
            <ForkRow
              fork={cruce}
              weight={pesoActual}
              onChoose={puedeEditar ? elegirCamino : null}
              onEdit={puedeEditar ? () => abrirCruce(cruce) : null}
              onDiscard={puedeEditar ? descartarCruce : null}
              busy={busy}
              error={error}
            />
          )}

          {/* Y si no hay ninguno, la invitación a plantearlo, en el mismo sitio
              en el que aparecería. Un botón en la cabecera no diría dónde va. */}
          {!cruce && !form && !forkForm && puedeEditar && bifurcable && (
            <button type="button" className="rmap-tail" onClick={() => abrirCruce()}>
              <GitBranch size={14} />
              <span>¿Y después? Plantea dos caminos</span>
            </button>
          )}
        </div>
      )}

      {forkForm && (
        <ForkForm
          value={forkForm}
          onChange={setForkForm}
          onSubmit={guardarCruce}
          onCancel={() => {
            setForkForm(null);
            setError('');
          }}
          busy={busy}
          error={error}
        />
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
          error={error}
        />
      )}
    </Marco>
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
            <div className="plan-bar is-fase">
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
const PhaseForm = ({ value, onChange, onSubmit, onCancel, busy, error = null }) => {
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

      {/* El error va aquí, pegado al botón que lo provoca: arriba del panel, con el
         formulario desplegado y la ventana desplazada, no se veía y parecía que
         guardar no hacía nada. */}
      {error && <Notice tone="error">{error}</Notice>}
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

/**
 * El cruce: la última parada del carril cuando lo que viene aún no está decidido.
 *
 * ══ Por qué el cliente lo ve ═══════════════════════════════════════════════
 *
 * Es lo mismo que justifica el roadmap entero, pero más fuerte. Un cliente que
 * lee «aguanta tres semanas más» aguanta o no aguanta. Uno que lee «el 29 de
 * marzo se decide, y hay dos caminos» sabe que su proceso depende de cómo
 * responda, y eso es lo único que sostiene una fase aburrida.
 *
 * Lo ve y no lo toca, igual que las fases: elegir es criterio profesional del
 * entrenador. Lo garantiza RLS (migración 0028, que la 0073 hereda); aquí solo
 * se decide qué botones salen.
 *
 * ── Por qué el nodo es un rombo y no un número ──────────────────────────────
 * Los nodos numerados cuentan un recorrido: uno, dos, tres. Un cruce no tiene
 * número porque no se sabe cuál va a ser: es un sitio donde el carril se abre,
 * y el rombo es lo que dice eso sin una palabra.
 */
const ForkRow = ({ fork, weight, onChoose, onEdit, onDiscard, busy }) => {
  const { options, decidesOn, daysLeft, due, overdue } = fork;

  return (
    <div className="rmap-item is-fork">
      <span className="rmap-node" aria-hidden="true">
        <GitBranch size={13} />
      </span>

      <div className="rmap-fork">
        {(onEdit || onDiscard) && (
          <div className="slot-tools" role="group" aria-label="Ajustar el cruce">
            {onEdit && (
              <button
                type="button"
                className="slot-btn"
                onClick={onEdit}
                aria-label="Editar los caminos"
                title="Editar"
              >
                <Pencil size={13} />
              </button>
            )}
            {onDiscard && (
              /* La salida cuando no vale ninguno: se descarta y la fase
                 siguiente se crea a mano. Un cruce es una previsión, no un
                 compromiso. */
              <button
                type="button"
                className="slot-btn is-danger"
                onClick={onDiscard}
                disabled={busy}
                aria-label="Descartar el cruce"
                title="Descartar"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}

        {/* Una sola línea. Antes eran dos —el estado arriba y la fecha debajo—
            y el bloque arrancaba con dos titulares antes de llegar a lo que hay
            que leer, que son los caminos. */}
        <div className="rmap-head">
          <strong>{due ? 'Toca decidir' : 'Se decide'}</strong>
          <span className="rmap-when tnum">
            {shortDate(decidesOn)}
            {/* Los días que faltan solo mientras faltan: junto a «se pasó»
                dirían dos veces lo mismo. */}
            {daysLeft !== null && daysLeft > 0 &&
              ` · en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`}
          </span>
          {overdue && <span className="badge badge-warn">Se pasó</span>}
        </div>

        <div className="rmap-roads">
          {options.map((camino, index) => (
            <Fragment key={index}>
              {/*
                La «o» entre caminos.

                Es lo único que se ha añadido para decir que son alternativas, y
                dice más que cualquier línea que los una: dos tarjetas separadas
                por una conjunción se leen «volumen O definición» sin explicar
                nada. Un corchete de árbol habría necesitado geometría que se
                rompe al envolver, y habría dicho lo mismo peor.
              */}
              {index > 0 && (
                <span className="rmap-or" aria-hidden="true">
                  o
                </span>
              )}
              <RoadCard
                option={camino}
                weight={weight}
                onChoose={onChoose ? () => onChoose(camino) : null}
                busy={busy}
              />
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Un camino: su «si», a dónde lleva, y el botón que lo convierte en fase.
 *
 * ── Por qué es un contorno y no una tarjeta ─────────────────────────────────
 * Porque no es nada todavía. Las fases tienen superficie —son cosas que
 * existen—; un camino es un borde punteado sobre el fondo hasta que alguien lo
 * elige, y entonces aparece arriba como una fase de verdad, con su relleno.
 * Esa diferencia de material dice «esto está decidido y esto no» antes de que
 * se lea una palabra, que es más de lo que consigue cualquier etiqueta.
 */
const RoadCard = ({ option, weight, onChoose, busy }) => {
  const meta = directionById(option.direction);
  /* El ritmo en kg/semana como en las fases: es como piensa el entrenador. Sin
     peso registrado no hay conversión y se dice el porcentaje. */
  const kg = targetRateKg(option, weight);

  return (
    <div className="rmap-road" style={{ '--fase': meta?.color }}>
      {/* El «si» arriba, como antetítulo. No es un adorno estructural: es
          literalmente lo que decide cuál se coge, así que es lo primero que hay
          que leer. Debajo del nombre se leería como un pie de foto del volumen. */}
      <span className="rmap-road-when">{option.when}</span>

      <strong className="rmap-road-name">{option.title}</strong>

      <div className="rmap-when row gap-2 wrap">
        <span className="tnum">{option.weeks} sem</span>
        <span style={{ color: meta?.color }}>· {meta?.label || option.direction}</span>
        {meta?.sign !== 0 && (
          <span className="tnum">
            {'· '}
            {kg === null
              ? `${fmt(option.ratePct, { decimals: 2 })} %/sem`
              : `${kg > 0 ? '+' : ''}${fmt(kg, { decimals: 2 })} kg/sem`}
          </span>
        )}
      </div>

      {onChoose && (
        /* «Elegir» a secas: al lado del nombre no hace falta repetirlo, y con
           dos botones idénticos en pantalla el lector de voz sí lo necesita. */
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onChoose}
          disabled={busy}
          aria-label={`Elegir ${option.title}`}
        >
          <Check size={14} /> Elegir
        </button>
      )}
    </div>
  );
};

/**
 * Plantear los caminos.
 *
 * ── Por qué cada camino pide menos que una fase ─────────────────────────────
 * No tiene fechas —se derivan del final de la fase anterior al elegirlo— ni
 * nota: lo que el cliente debe saber de un tramo se escribe cuando ese tramo
 * existe, no mientras es una de dos posibilidades.
 *
 * Y la duración va solo con los atajos, sin la barra fina de `PhaseForm`. Un
 * camino que a lo mejor no se coge no merece que nadie ajuste sus semanas de
 * una en una; si al elegirlo hay que retocarlas, se retoca la fase.
 */
const ForkForm = ({ value, onChange, onSubmit, onCancel, busy, error = null }) => {
  const { options } = value;

  const setOption = (index, patch) =>
    onChange({
      ...value,
      options: options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    });

  const addOption = () => onChange({ ...value, options: [...options, optionDraft('maintain', 4)] });

  const removeOption = (index) =>
    onChange({ ...value, options: options.filter((_, i) => i !== index) });

  return (
    <form className="card-inset col gap-4" onSubmit={onSubmit}>
      <div className="col gap-1">
        <span className="section-label">El cruce</span>
        <span className="t-xs t-secondary">
          Al acabar la fase habrá que elegir uno. Escribe de qué depende cada camino con tus
          palabras: nadie va a comprobarlo por ti, y esa frase es lo que tu cliente va a leer.
        </span>
      </div>

      {/* El formulario tiene la forma del resultado: bloque, «o», bloque. Antes
          cada uno se abría con un «Camino 1» que no decía nada que no dijera ya
          estar separados, y la conjunción lo dice mejor y ocupa una letra. */}
      {options.map((option, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <span className="rmap-or" aria-hidden="true">
              o
            </span>
          )}
          <RoadFields
            option={option}
            index={index}
            onChange={(patch) => setOption(index, patch)}
            onRemove={options.length > FORK_RANGE.min ? () => removeOption(index) : null}
          />
        </Fragment>
      ))}

      {options.length < FORK_RANGE.max && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={addOption}>
          <Plus size={14} /> Añadir un tercer camino
        </button>
      )}

      {/* El error va aquí, pegado al botón que lo provoca: arriba del panel, con el
         formulario desplegado y la ventana desplazada, no se veía y parecía que
         guardar no hacía nada. */}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="row gap-2 row-end">
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar el cruce'}
        </button>
      </div>
    </form>
  );
};

/** Los campos de un camino. Los mismos que una fase menos las fechas y la nota. */
const RoadFields = ({ option, index, onChange, onRemove }) => {
  const meta = directionById(option.direction);

  return (
    <div className="rmap-road-fields col gap-3">
      {/* Solo cuando se puede quitar, que es el tercer camino. Una fila de
          cabecera fija para colgar de ella un botón que casi nunca sale dejaba
          un hueco en blanco encima de cada bloque. */}
      {onRemove && (
        <div className="row gap-2 between">
          <span className="section-label">Camino {index + 1}</span>
          <button type="button" className="btn btn-sm" onClick={onRemove}>
            Quitar
          </button>
        </div>
      )}

      <Field label="Si…" hint="La condición, con tus palabras.">
        <input
          className="input"
          value={option.when}
          onChange={(e) => onChange({ when: e.target.value })}
          placeholder="Si el punto ha bajado lo suficiente"
        />
      </Field>

      <div className="rail-wrap" role="group" aria-label={`Dirección del camino ${index + 1}`}>
        {GOAL_DIRECTIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            className="chip"
            aria-pressed={option.direction === d.id}
            title={d.hint}
            /* Como en `PhaseForm`: al cambiar de dirección se arrastran su ritmo
               y su nombre por defecto. Dejar el anterior daría «Volumen» con el
               ritmo de una definición, que es el doble de lo razonable. */
            onClick={() => onChange({ direction: d.id, ratePct: d.defaultRate, title: d.label })}
          >
            {d.label}
          </button>
        ))}
      </div>

      <Field label="Nombre">
        <input
          className="input"
          value={option.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={meta?.label || 'Volumen'}
        />
      </Field>

      <Field label="Duración">
        <div className="row gap-2 wrap">
          {PHASE_PRESETS.map((semanas) => (
            <button
              key={semanas}
              type="button"
              className="chip"
              aria-pressed={option.weeks === semanas}
              onClick={() => onChange({ weeks: semanas })}
            >
              {semanas} sem
            </button>
          ))}
        </div>
      </Field>

      {meta?.sign !== 0 && (
        <Field label="Ritmo semanal (% del peso)" hint={meta?.hint}>
          <input
            type="number"
            className="input input-center"
            step="0.05"
            min="0"
            max="2"
            value={option.ratePct}
            onChange={(e) => onChange({ ratePct: Number(e.target.value) })}
          />
        </Field>
      )}
    </div>
  );
};
