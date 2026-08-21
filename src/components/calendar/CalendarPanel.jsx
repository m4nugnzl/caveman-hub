import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  CHECKIN_CADENCES,
  EVENT_KINDS,
  WEEKDAYS,
  checkInDates,
  checkInSchedule,
  eventsByDate,
  kindMeta,
  monthGrid,
  monthLabel,
  nextCheckIn,
  shiftMonth,
  weekCells,
  weekdayIndex,
} from '@/domain/calendar';
import { shortDate, todayISO, weekdayName } from '@/lib/dates';
import { traeALaVista } from '@/lib/motion';
import { Modal } from '@/components/ui/Modal';
import { Notice, PageHead, Panel, SegmentedControl } from '@/components/ui/primitives';

/** «jueves 20 de agosto» → «Jueves 20 de agosto». Es un título; se le pone mayúscula. */
const tituloDeDia = (date) => {
  const nombre = weekdayName(date, { conFecha: true });
  return nombre ? nombre[0].toUpperCase() + nombre.slice(1) : shortDate(date);
};

/**
 * La hoja de un día: lo que tiene y el sitio donde se le añade algo.
 *
 * ── Por qué una hoja y no un formulario bajo la rejilla ─────────────────────
 * Antes, tocar un día abría el formulario DEBAJO del calendario: el gesto
 * ocurría arriba y la respuesta aparecía fuera de la vista, sobre todo en el
 * móvil. La hoja se abre sobre el dedo, enseña lo que el día ya tiene —en la
 * rejilla los eventos son puntos sin nombre— y el añadir vive con ello.
 */
const DaySheet = ({ date, events, isCheckIn, checkInDone, canWrite, onAdd, onToggle, onRemove, onClose }) => {
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
            <strong>Check-in</strong>
            <span className="t-xs t-tertiary">
              {checkInDone ? 'Entregado esta semana' : kindMeta('checkin').hint}
            </span>
          </div>
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
 * ── Para qué sirve de verdad ────────────────────────────────────────────────
 * Para que el check-in tenga DÍA. «Pésate tres veces por semana» sin decir cuándo
 * acaba en «me peso cuando me acuerdo», y ahí se pierde la comparabilidad: el
 * promedio de tres pesajes de lunes a miércoles no es comparable con el de tres de
 * viernes a domingo.
 *
 * El cliente elige su día, el calendario lo repite, y además puede apuntar lo suyo
 * —una carrera, un viaje, una comida fuera—. Esas notas no son adorno: son lo que
 * explica los picos del peso que si no parecen inexplicables cuando los mira el
 * entrenador tres semanas después.
 *
 * ── El orden de los bloques es el del uso ───────────────────────────────────
 * «Esta semana» va primero porque es la pregunta con la que se abre un
 * calendario: ¿qué hay AHORA? Sus eventos llevan nombre —en el mes son puntos—.
 * Después el mes, para moverse por el tiempo; luego lo que viene; y al final el
 * día de check-in, que es configuración: se toca una vez y no cada visita.
 *
 * El mismo componente sirve a los dos: el cliente ve el suyo y el entrenador ve el
 * de su cliente activo. `audience` solo cambia los textos.
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
  const configRef = useRef(null);

  const isClient = audience === 'client';
  const clientId = activeClient.id;

  /** Día de check-in elegido. Vive en las preferencias: no necesita esquema. */
  const { weekday, everyWeeks } = checkInSchedule(activeClient.preferences);

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
    () => checkInDates(grid, weekday, everyWeeks, activeClient.startDate),
    [grid, weekday, everyWeeks, activeClient.startDate]
  );
  /* Los de la semana en curso, que puede cruzar dos meses y por eso no puede
     leerse de la rejilla del mes que se esté mirando. */
  const weekCheckIns = useMemo(
    () => checkInDates(week, weekday, everyWeeks, activeClient.startDate),
    [week, weekday, everyWeeks, activeClient.startDate]
  );
  /*
    El próximo que TOCA, no el próximo jueves: con cadencia quincenal son cosas
    distintas y la segunda es mentira la mitad de las veces. Sale de
    `nextCheckIn`, que conoce la cadencia y el alta.
  */
  const upcoming = useMemo(
    () => nextCheckIn(activeClient.preferences, activeClient.startDate, today),
    [activeClient.preferences, activeClient.startDate, today]
  );

  /* Semanas con check-in ya entregado, para no pedir otra vez lo que está hecho.
     `checkIns` solo trae el último, así que esto marca la semana en curso. */
  const submittedWeeks = useMemo(() => {
    const entry = checkIns[clientId];
    return new Set(entry?.submittedAt ? [entry.weekStart] : []);
  }, [checkIns, clientId]);

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

  return (
    <div className="stack">
      <PageHead
        title={isClient ? 'Mi calendario' : 'Calendario'}
        sub="Citas, competiciones, descansos y las fechas a las que llegar."
      />

      {unavailable && (
        <Notice tone="info">
          El calendario todavía no está activo en tu cuenta: puedes ver los días de check-in, pero
          no guardar citas ni recordatorios. Escríbenos desde Ajustes → Ayuda y lo activamos.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {/*
        ══ Esta semana ═══════════════════════════════════════════════════════
        La semana en curso con sus eventos CON NOMBRE. Es la pregunta con la que
        se abre un calendario y antes no la contestaba nadie: había que pescarla
        entre treinta y cinco celdas de puntos de colores.
      */}
      <Panel
        title="Esta semana"
        action={
          upcoming ? (
            <span className="t-xs t-tertiary">
              Próximo check-in: {upcoming === today ? 'hoy' : shortDate(upcoming)}
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => traeALaVista(configRef.current, { block: 'center' })}
            >
              Elegir día de check-in
            </button>
          )
        }
      >
        <div className="wk">
          {week.map((cell) => {
            const dayEvents = byDate.get(cell.date) || [];
            const isCheckIn = weekCheckIns.has(cell.date);
            const done = submittedWeeks.has(cell.weekStart);
            const vacio = dayEvents.length === 0 && !isCheckIn;

            return (
              <button
                type="button"
                key={cell.date}
                className={`wk-day${cell.isToday ? ' is-today' : ''}`}
                onClick={() => abrirDia(cell.date)}
                aria-label={`${tituloDeDia(cell.date)}${isCheckIn ? ', día de check-in' : ''}`}
              >
                <span className="wk-dow">
                  {WEEKDAYS[weekdayIndex(cell.date)]} <b>{cell.day}</b>
                </span>

                <span className="wk-cards">
                  {isCheckIn && (
                    <span
                      className={`wk-card${done ? ' is-done' : ''}`}
                      style={{ borderColor: kindMeta('checkin').color }}
                    >
                      {done ? 'Check-in ✓' : 'Check-in'}
                    </span>
                  )}
                  {dayEvents.map((event) => (
                    <span
                      key={event.id}
                      className={`wk-card${event.done ? ' is-done' : ''}`}
                      style={{ borderColor: kindMeta(event.kind).color }}
                    >
                      {event.title}
                    </span>
                  ))}
                  {vacio && !unavailable && (
                    <span className="wk-add" aria-hidden="true">
                      <Plus size={13} />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/*
        ══ El mes ════════════════════════════════════════════════════════════
        La forma del tiempo: dónde caen los check-ins y los eventos. El detalle
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
                aria-label={`${cell.date}${isCheckIn ? ', día de check-in' : ''}`}
              >
                <span className="n">{cell.day}</span>

                {isCheckIn && (
                  <span className={`cal-checkin${done ? ' is-done' : ''}`}>
                    {done ? 'hecho' : 'check-in'}
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

        {/*
          La leyenda: qué significa cada color. Antes solo existía como `title`
          al pasar el ratón —un canal que en táctil no existe— y una nota de
          texto en el móvil. El nombre completo de cada evento sigue estando a
          un toque, en la hoja del día.
        */}
        <div className="cal-key" aria-hidden="true">
          {EVENT_KINDS.map((k) => (
            <span className="cal-key-item" key={k.id}>
              <span className="cal-dot" style={{ background: k.color }} />
              {k.label}
            </span>
          ))}
        </div>
        <p className="cal-legend">Toca un día para ver sus eventos o añadir uno.</p>
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

      {/*
        ══ El día de check-in ════════════════════════════════════════════════
        Es la decisión que da sentido al resto, pero es CONFIGURACIÓN: se elige
        una vez y no se toca cada visita. Por eso cierra la pantalla en vez de
        abrirla — antes iba delante del calendario y cada visita empezaba por un
        formulario ya contestado.
      */}
      {/* El `div` de fuera existe solo para poder traer el bloque a la vista
          desde el botón de arriba: `Panel` no reenvía refs. */}
      <div ref={configRef}>
      <Panel
        title={isClient ? 'Mi día de check-in' : 'Día de check-in del cliente'}
        className="col gap-3"
      >
        <div className="rail-wrap" role="group" aria-label="Día de la semana del check-in">
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
        <span className="t-xs t-tertiary">
          {upcoming
            ? `El próximo cae el ${shortDate(upcoming)}${upcoming === today ? ' — hoy' : ''}.`
            : 'Sin día fijo. Elegir uno hace que los pesajes de cada semana sean comparables entre sí.'}
        </span>

        {/*
          Y cada cuánto. Va aquí, pegada al día, porque las dos contestan la
          misma pregunta —cuándo— y separarlas obligaría a buscar la mitad de la
          respuesta en otra pantalla. Solo se ofrece con día elegido: «cada dos
          semanas» sin decir qué día no significa nada.
        */}
        {weekday !== null && (
          <div className="col gap-2">
            <SegmentedControl
              value={String(everyWeeks)}
              onChange={(valor) =>
                updateClientPreferences(clientId, 'checkin', { everyWeeks: Number(valor) })
              }
              options={CHECKIN_CADENCES.map((c) => ({ id: String(c.weeks), label: c.label }))}
              label="Cada cuánto toca el check-in"
            />
            {everyWeeks > 1 && (
              <span className="t-xs t-tertiary">
                Se cuentan desde que {isClient ? 'empezaste' : 'empezó el cliente'}, así que
                siempre caen en las mismas semanas.
              </span>
            )}
          </div>
        )}
      </Panel>
      </div>

      {openDay && (
        <DaySheet
          date={openDay}
          events={byDate.get(openDay) || []}
          isCheckIn={checkInDays.has(openDay) || weekCheckIns.has(openDay)}
          checkInDone={submittedWeeks.has(weekCells(openDay)[0].weekStart)}
          canWrite={!unavailable}
          onAdd={(payload) => act(addClientEvent({ clientId, ...payload }))}
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
