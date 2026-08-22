import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import {
  CHECKIN_CADENCES,
  EVENT_KINDS,
  MAX_CHECKIN_DATES,
  WEEKDAYS,
  checkInDates,
  checkInSchedule,
  currentCheckInPeriod,
  eventsByDate,
  kindMeta,
  monthGrid,
  monthLabel,
  moveCheckIn,
  nextCheckIn,
  shiftMonth,
  weekCells,
  weekdayIndex,
} from '@/domain/calendar';
import { clientProtocol, requiresBlock } from '@/domain/protocol';
import { addDays, daysBetween, shortDate, todayISO, weekdayName } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { Notice, PageHead, Panel, SegmentedControl } from '@/components/ui/primitives';
import { KindLegend, WeekBoard } from './WeekBoard';

/** «jueves 20 de agosto» → «Jueves 20 de agosto». Es un título; se le pone mayúscula. */
const tituloDeDia = (date) => {
  const nombre = weekdayName(date, { conFecha: true });
  return nombre ? nombre[0].toUpperCase() + nombre.slice(1) : shortDate(date);
};

/** «3 días» / «1 día». Se escribe en cuatro sitios de esta pantalla. */
const enDias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

/**
 * La hoja de un día: lo que tiene, dónde se le añade algo y —para el
 * entrenador— dónde se mueve la revisión.
 *
 * ── Por qué una hoja y no un formulario bajo la rejilla ─────────────────────
 * Antes, tocar un día abría el formulario DEBAJO del calendario: el gesto
 * ocurría arriba y la respuesta aparecía fuera de la vista, sobre todo en el
 * móvil. La hoja se abre sobre el dedo, enseña lo que el día ya tiene —en la
 * rejilla los eventos son puntos sin nombre— y el añadir vive con ello.
 *
 * ── Y por qué la revisión se mueve DESDE AQUÍ ──────────────────────────────
 * Porque mover una revisión es señalar un día, y el sitio donde se señalan los
 * días es el calendario. Un campo de fecha en el panel de arriba haría escribir
 * lo que el ojo ya está mirando, y además dejaría a quien la mueve sin ver
 * contra qué: el viaje, la competición, la revisión anterior.
 */
const DaySheet = ({
  date,
  events,
  isCheckIn,
  isMoved,
  checkInDone,
  canWrite,
  canSchedule,
  onAdd,
  onMove,
  onToggle,
  onRemove,
  onClose,
}) => {
  const [kind, setKind] = useState('appointment');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    setBusy(true);
    await onAdd({ date, kind, title: clean });
    setBusy(false);
    /* La hoja se queda abierta y el campo se vacía: el evento recién añadido
       aparece en la lista de arriba, que es la confirmación de verdad, y se
       puede apuntar el siguiente sin volver a abrir nada. */
    setTitle('');
  };

  return (
    <Modal title={tituloDeDia(date)} onClose={onClose}>
      <div className="col gap-4">
        {isCheckIn && (
          <div className="wk-card is-sheet" style={{ borderColor: kindMeta('checkin').color }}>
            <strong>Revisión{isMoved ? ' · movida a este día' : ''}</strong>
            <span className="t-xs t-tertiary">
              {checkInDone ? 'Entregada' : kindMeta('checkin').hint}
            </span>
          </div>
        )}

        {/*
          Mover la revisión. Solo con pauta puesta: una fecha suelta sin pauta no
          tiene periodo que la releve y se quedaría reclamada para siempre (ver
          `domain/calendar`).
        */}
        {canSchedule && (
          <button
            type="button"
            className={`btn ${isMoved ? 'btn-secondary' : 'btn-primary'} btn-sm`}
            onClick={() => onMove(date)}
          >
            {isMoved ? (
              <>
                <RotateCcw size={14} /> Devolver la revisión a su día
              </>
            ) : (
              <>
                <CalendarCheck size={14} /> Poner aquí la revisión
              </>
            )}
          </button>
        )}

        {events.length > 0 && (
          <div className="list">
            {events.map((event) => (
              <div className="list-row" key={event.id}>
                <span
                  className="cal-dot"
                  style={{ background: kindMeta(event.kind).color, width: 10, height: 10 }}
                />
                <span className="list-row-label">
                  <span
                    className="title"
                    style={event.done ? { textDecoration: 'line-through' } : undefined}
                  >
                    {event.title}
                  </span>
                  <span className="sub">{kindMeta(event.kind).label}</span>
                </span>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={event.done}
                  onClick={() => onToggle(event)}
                >
                  {event.done ? 'Hecho' : 'Marcar hecho'}
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-icon-danger"
                  onClick={() => onRemove(event)}
                  aria-label={`Borrar ${event.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {events.length === 0 && !isCheckIn && (
          <p className="t-sm t-secondary">Este día no tiene nada apuntado.</p>
        )}

        {canWrite && (
          <form className="col gap-3" onSubmit={submit}>
            <div className="rail-wrap" role="group" aria-label="Tipo de evento">
              {EVENT_KINDS.filter((k) => k.id !== 'checkin').map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className="chip"
                  aria-pressed={kind === k.id}
                  onClick={() => setKind(k.id)}
                  title={k.hint}
                >
                  {k.label}
                </button>
              ))}
            </div>

            {/* Sin `autoFocus`: en el móvil, enfocar al abrir levantaría el
                teclado encima de la hoja antes de poder leer qué pide. */}
            <div className="row gap-2">
              <input
                className="input grow"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: media maratón, viaje a Bilbao, revisión…"
                aria-label="Título del evento"
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !title.trim()}>
                <Plus size={14} /> Añadir
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};

/**
 * Calendario del cliente.
 *
 * ══ Para qué sirve, replanteado ═════════════════════════════════════════════
 *
 * Era un calendario de eventos con una casilla de configuración al final: el
 * bloque del día de check-in cerraba la pantalla, detrás del mes y de la lista.
 * Así, lo único que esta pantalla tiene que contestar —**cuándo toca la revisión
 * y qué hay que traer**— estaba al fondo y en forma de formulario, mientras
 * arriba había treinta y cinco celdas de puntos de colores.
 *
 * Ahora ese es el asunto y abre la pantalla: la fecha, en qué estado está, y qué
 * hay que subir. El mes y los eventos van debajo porque son lo que EXPLICA una
 * fecha —el viaje, la competición, la semana de descarga—, o sea el contexto de
 * la decisión y no otro tema.
 *
 * ── Lo que esto cambia respecto de lo que estaba escrito ───────────────────
 * El comentario anterior defendía que la configuración fuera la última: «se
 * elige una vez y no se toca cada visita». Sigue siendo verdad y por eso el
 * selector de día y de cadencia continúa siendo lo último del bloque. Lo que
 * cambia es que **el estado** de la revisión —que no es configuración, es la
 * respuesta— sube del todo. Y mover una fecha suelta deja de ser un formulario:
 * se toca el día en el mes, que es donde se señalan los días.
 *
 * El mismo componente sirve a los dos: el cliente ve el suyo y el entrenador ve
 * el de su cliente activo. La pauta la pueden tocar los dos —ver
 * `domain/calendar`—; `audience` solo cambia los textos y a dónde lleva la
 * acción de entregar.
 */
export const CalendarPanel = ({ audience = 'client' }) => {
  const {
    activeClient,
    checkIns,
    loadEvents,
    addClientEvent,
    setEventDone,
    removeClientEvent,
    updateClientPreferences,
  } = useApp();

  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const d = new Date(`${today}T00:00:00Z`);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
  const [events, setEvents] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [openDay, setOpenDay] = useState(null);
  const [error, setError] = useState(null);

  const isClient = audience === 'client';
  const clientId = activeClient.id;

  /** La pauta de revisión. Vive en las preferencias: no necesita esquema. */
  const pauta = useMemo(() => checkInSchedule(activeClient.preferences), [activeClient.preferences]);
  const { weekday, everyWeeks } = pauta;

  const refresh = useCallback(async () => {
    const result = await loadEvents(clientId);
    setUnavailable(!result.ok);
    setEvents(result.events);
  }, [clientId, loadEvents]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const week = useMemo(() => weekCells(today), [today]);
  const byDate = useMemo(() => eventsByDate(events), [events]);
  const checkInDays = useMemo(
    () => checkInDates(grid, pauta, activeClient.startDate, today),
    [grid, pauta, activeClient.startDate, today]
  );
  /* Los de la semana en curso, que puede cruzar dos meses y por eso no puede
     leerse de la rejilla del mes que se esté mirando. */
  const weekCheckIns = useMemo(
    () => checkInDates(week, pauta, activeClient.startDate, today),
    [week, pauta, activeClient.startDate, today]
  );

  /* El periodo vigente: de cuándo a cuándo, qué día vence y si ya venció. Es de
     donde sale todo lo que dice el panel de arriba. */
  const periodo = useMemo(
    () => currentCheckInPeriod(activeClient.preferences, activeClient.startDate, today),
    [activeClient.preferences, activeClient.startDate, today]
  );

  /* Semanas con revisión ya entregada, para no pedir otra vez lo que está hecho.
     `checkIns` solo trae la última, así que esto marca el periodo en curso. */
  const entrega = checkIns[clientId];
  const entregada = Boolean(
    periodo && entrega?.weekStart >= periodo.start && (entrega.submittedAt || entrega.reviewedAt)
  );
  const submittedWeeks = useMemo(() => {
    return new Set(entrega?.submittedAt ? [entrega.weekStart] : []);
  }, [entrega]);

  /*
    La fecha de la que habla la pantalla.

    Mientras esté por entregar es la de ESTE periodo —también si ya se pasó, que
    es cuando más falta hace decirlo—. Entregada, la que queda por delante es la
    del periodo siguiente, y se pide desde el día después del vencimiento para
    que entregar con antelación no devuelva la misma fecha otra vez.
  */
  const objetivo = useMemo(() => {
    if (!periodo) return null;
    if (!entregada) return periodo.dueOn;
    return nextCheckIn(activeClient.preferences, activeClient.startDate, addDays(periodo.dueOn, 1));
  }, [periodo, entregada, activeClient.preferences, activeClient.startDate]);

  const dias = objetivo ? daysBetween(today, objetivo) : null;

  /* Lo que hay que traer. El peso y las fotos siempre —son los dos pasos que el
     asistente da a todo el mundo— y las medidas solo si el protocolo las pone
     como obligatorias: lo opcional no se anuncia como una exigencia. */
  const pide = useMemo(() => {
    const protocol = clientProtocol(activeClient.preferences);
    return [
      'el peso',
      'las fotos',
      requiresBlock(protocol, 'perimeters') && 'los perímetros',
      requiresBlock(protocol, 'folds') && 'los pliegues',
    ].filter(Boolean);
  }, [activeClient.preferences]);

  /* Las fechas movidas que quedan por delante. El mes ya las dibuja, pero un
     entrenador que entra a comprobar «¿le moví la de octubre?» no debería tener
     que pasar tres meses para verlo. */
  const movidas = useMemo(() => pauta.dates.filter((d) => d >= today), [pauta.dates, today]);

  const act = async (promise) => {
    const result = await promise;
    if (result?.ok === false) setError(result.error);
    else {
      setError(null);
      await refresh();
    }
  };

  const move = (delta) => {
    setCursor((prev) => shiftMonth(prev.year, prev.month, delta));
  };

  const abrirDia = (date) => {
    if (!unavailable) setOpenDay(date);
  };

  /** Mover la revisión de un periodo a otro día, o devolverla al suyo. */
  const moverRevision = (date) => {
    const dates = moveCheckIn(activeClient.preferences, activeClient.startDate, date, today);
    if (!dates) {
      setError(
        `No se puede mover ahí: hace falta un día de pauta, y solo se guardan ${MAX_CHECKIN_DATES} fechas movidas a la vez. Devuelve alguna a su día antes de mover otra.`
      );
      return;
    }
    setError(null);
    updateClientPreferences(clientId, 'checkin', { dates });
    setOpenDay(null);
  };

  /* La lumbre solo cuando hay algo que decidir: le tocaba y no está entregada.
     Es el uso exacto que los tokens le reservan a esa luz, y ponerla siempre la
     convertiría en decoración. */
  const reclama = Boolean(periodo?.isDue) && !entregada;

  return (
    <div className="stack">
      <PageHead
        title={isClient ? 'Mi calendario' : 'Calendario'}
        sub="Cuándo toca la revisión, y lo que hay alrededor: citas, competiciones y descansos."
        action={
          isClient && reclama ? (
            <Link className="btn btn-primary btn-sm" to="/mi/evolucion">
              Entregar mi revisión
            </Link>
          ) : null
        }
      />

      {unavailable && (
        <Notice tone="info">
          El calendario todavía no está activo en tu cuenta: puedes ver los días de revisión, pero
          no guardar citas ni recordatorios. Escríbenos desde Ajustes → Ayuda y lo activamos.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {/*
        ══ La revisión ═══════════════════════════════════════════════════════
        Abre la pantalla porque es su asunto. Dice tres cosas y en este orden:
        cuándo, en qué estado está, y qué hay que traer.
      */}
      <Panel
        title="La revisión"
        className={`col gap-4${reclama ? ' card-lumbre' : ''}`}
        action={
          periodo ? (
            <span className="t-xs t-tertiary">
              {CHECKIN_CADENCES.find((c) => c.weeks === everyWeeks)?.label}
            </span>
          ) : null
        }
      >
        {objetivo ? (
          <div className="col gap-1">
            <span className="metric-value">{tituloDeDia(objetivo)}</span>
            <span className="t-sm t-secondary">
              {entregada
                ? 'Entregada. La siguiente es esa.'
                : dias === 0
                  ? `${isClient ? 'Te' : 'Le'} toca hoy.`
                  : dias > 0
                    ? `${isClient ? 'Te' : 'Le'} toca en ${enDias(dias)}.`
                    : `Venció hace ${enDias(-dias)} y sigue sin entregar.`}
              {periodo?.moved && !entregada ? ' Movida de su día de pauta.' : ''}
            </span>
            <span className="t-xs t-tertiary">
              Hay que subir {pide.slice(0, -1).join(', ')} y {pide[pide.length - 1]}.
            </span>
          </div>
        ) : (
          <p className="t-sm t-secondary">
            {isClient
              ? 'Todavía no tienes día. Elige uno abajo y a partir de ahí sabrás siempre cuándo te toca entregar el peso y las fotos.'
              : 'Sin pauta. Mientras no haya un día elegido, a este cliente no se le reclama ninguna revisión y no aparece en tu cola.'}
          </p>
        )}

        {/*
          ══ La pauta, y quién la toca ═════════════════════════════════════
          Los dos. El cliente elige el día que le encaja al entrar —él es quien
          sabe cuándo se puede pesar en ayunas y hacerse las fotos— y el
          entrenador puede ponérselo o cambiárselo desde su lado. Lo que hace
          falta para que la revisión signifique algo no es que la fecha sea
          inamovible, es que exista: sin día no se reclama nada, y ahí es donde
          el bucle se cae.

          Sigue debajo del estado, y no arriba, porque se cambia de tarde en
          tarde: quien entra a mirar cuándo le toca no debería empezar por un
          formulario ya contestado.
        */}
        <div className="col gap-3">
          <div className="rail-wrap" role="group" aria-label="Día de la semana de la revisión">
            {WEEKDAYS.map((label, index) => (
              <button
                key={label}
                type="button"
                className="chip"
                aria-pressed={weekday === index}
                onClick={() =>
                  updateClientPreferences(clientId, 'checkin', {
                    weekday: weekday === index ? null : index,
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/*
            Y cada cuánto. Va aquí, pegada al día, porque las dos contestan la
            misma pregunta —cuándo— y separarlas obligaría a buscar la mitad de
            la respuesta en otra pantalla. Solo se ofrece con día elegido:
            «cada dos semanas» sin decir qué día no significa nada.
          */}
          {weekday !== null && (
            <SegmentedControl
              value={String(everyWeeks)}
              onChange={(valor) =>
                updateClientPreferences(clientId, 'checkin', { everyWeeks: Number(valor) })
              }
              options={CHECKIN_CADENCES.map((c) => ({ id: String(c.weeks), label: c.label }))}
              label="Cada cuánto toca la revisión"
            />
          )}

          <span className="t-xs t-tertiary">
            {weekday === null
              ? `Elige el día ${isClient ? 'en el que te vas a pesar y hacer las fotos' : 'en el que quieres su peso y sus fotos'}. Sin él, los pesajes de cada semana no son comparables entre sí.`
              : `${
                  everyWeeks > 1
                    ? `Las semanas se cuentan desde que ${isClient ? 'empezaste' : 'empezó el cliente'}, así que siempre caen en las mismas. `
                    : ''
                }Para mover una fecha suelta sin cambiar la pauta, toca ese día en el mes.`}
          </span>

          {movidas.length > 0 && (
            <span className="t-xs t-tertiary">
              Movidas: {movidas.map((d) => shortDate(d)).join(' · ')}.
            </span>
          )}
        </div>
      </Panel>

      {/*
        ══ Esta semana ═══════════════════════════════════════════════════════
        La semana en curso con sus eventos CON NOMBRE. Es la pregunta con la que
        se abre un calendario y antes no la contestaba nadie: había que pescarla
        entre treinta y cinco celdas de puntos de colores.
      */}
      <WeekBoard
        title="Esta semana"
        action={<KindLegend kinds={EVENT_KINDS} />}
        cells={week}
        onOpenDay={abrirDia}
        emptyLabel={unavailable ? null : 'Libre'}
        labelFor={(cell) =>
          `${tituloDeDia(cell.date)}${weekCheckIns.has(cell.date) ? ', día de revisión' : ''}`
        }
        cardsFor={(cell) => {
          /* La revisión primero: es lo único del día que tiene fecha de
             entrega. Los eventos vienen ya ordenados por `eventsByDate`. */
          const done = submittedWeeks.has(cell.weekStart);
          return [
            weekCheckIns.has(cell.date) && {
              id: `revision-${cell.date}`,
              kind: 'checkin',
              when: 'Revisión',
              what: done ? 'Entregada' : 'Peso y fotos',
              done,
            },
            ...(byDate.get(cell.date) || []).map((event) => ({
              id: event.id,
              kind: event.kind,
              when: kindMeta(event.kind).label,
              what: event.title,
              done: event.done,
            })),
          ].filter(Boolean);
        }}
      />

      {/*
        ══ El mes ════════════════════════════════════════════════════════════
        La forma del tiempo: dónde caen las revisiones y los eventos. El detalle
        de un día se abre en su hoja, tocándolo — aquí los eventos son puntos.
      */}
      <Panel
        title={monthLabel(cursor.year, cursor.month)}
        action={
          <div className="row gap-2">
            <button type="button" className="btn btn-icon" onClick={() => move(-1)} aria-label="Mes anterior">
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const d = new Date(`${today}T00:00:00Z`);
                setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
              }}
            >
              Hoy
            </button>
            <button type="button" className="btn btn-icon" onClick={() => move(1)} aria-label="Mes siguiente">
              <ChevronRight size={16} />
            </button>
          </div>
        }
        className="col gap-4"
      >
        {/* La rejilla. Siempre semanas completas de lunes a domingo. */}
        <div className="cal">
          {WEEKDAYS.map((label) => (
            <span className="cal-dow" key={label}>
              {label}
            </span>
          ))}

          {grid.map((cell) => {
            const dayEvents = byDate.get(cell.date) || [];
            const isCheckIn = checkInDays.has(cell.date);
            const done = submittedWeeks.has(cell.weekStart);

            return (
              <button
                type="button"
                key={cell.date}
                className={[
                  'cal-day',
                  cell.inMonth ? '' : 'is-outside',
                  cell.isToday ? 'is-today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => abrirDia(cell.date)}
                aria-label={`${cell.date}${isCheckIn ? ', día de revisión' : ''}`}
              >
                <span className="n">{cell.day}</span>

                {isCheckIn && (
                  <span className={`cal-checkin${done ? ' is-done' : ''}`}>
                    {done ? 'hecha' : 'revisión'}
                  </span>
                )}

                <span className="cal-dots">
                  {dayEvents.slice(0, 4).map((event) => (
                    <span
                      key={event.id}
                      className={`cal-dot${event.done ? ' is-done' : ''}`}
                      style={{ background: kindMeta(event.kind).color }}
                      title={event.title}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        {/* La leyenda no se repite aquí: ya está en la cabecera del tablero de
            arriba, y los colores son los mismos. Dos veces en la misma pantalla
            la convertiría en textura. El nombre completo de cada evento sigue
            estando a un toque, en la hoja del día. */}
        <p className="cal-legend">Toca un día para ver sus eventos, añadir uno o mover ahí la revisión.</p>
      </Panel>

      {/* Lo que viene, en lista: el mes da la forma, la lista da el detalle. */}
      <Panel title="Próximos eventos" className="col gap-3">
        {events.filter((e) => e.date >= today).length === 0 ? (
          <p className="t-sm t-secondary">
            Nada apuntado. Toca un día del calendario para añadir una cita, una competición o una
            semana de descanso.
          </p>
        ) : (
          <div className="list">
            {events
              .filter((e) => e.date >= today)
              .slice(0, 12)
              .map((event) => (
                <div className="list-row" key={event.id}>
                  <span
                    className="cal-dot"
                    style={{ background: kindMeta(event.kind).color, width: 10, height: 10 }}
                  />
                  <span className="list-row-label">
                    <span className="title" style={event.done ? { textDecoration: 'line-through' } : undefined}>
                      {event.title}
                    </span>
                    <span className="sub">
                      {kindMeta(event.kind).label} · {shortDate(event.date)}
                    </span>
                  </span>

                  <button
                    type="button"
                    className="chip"
                    aria-pressed={event.done}
                    onClick={() => act(setEventDone(event.id, !event.done))}
                  >
                    {event.done ? 'Hecho' : 'Marcar hecho'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-danger"
                    onClick={() => act(removeClientEvent(event.id))}
                    aria-label={`Borrar ${event.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </Panel>

      {openDay && (
        <DaySheet
          date={openDay}
          events={byDate.get(openDay) || []}
          isCheckIn={checkInDays.has(openDay) || weekCheckIns.has(openDay)}
          isMoved={pauta.dates.includes(openDay)}
          checkInDone={submittedWeeks.has(weekCells(openDay)[0].weekStart)}
          canWrite={!unavailable}
          canSchedule={weekday !== null}
          onAdd={(payload) => act(addClientEvent({ clientId, ...payload }))}
          onMove={moverRevision}
          onToggle={(event) => act(setEventDone(event.id, !event.done))}
          onRemove={(event) => act(removeClientEvent(event.id))}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  );
};

/** Índice del día de la semana de hoy, para el valor por defecto del selector. */
export const todayWeekday = () => weekdayIndex(todayISO());
