import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';

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
  weekdayIndex,
} from '@/domain/calendar';
import { shortDate, todayISO } from '@/lib/dates';
import { Notice, PageHead, Panel, SectionTitle, SegmentedControl } from '@/components/ui/primitives';

/** Formulario de evento para un día concreto. Aparece al pulsar el día. */
const DayForm = ({ date, onAdd, onClose }) => {
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
    setTitle('');
    onClose();
  };

  return (
    <form className="card-inset col gap-3" onSubmit={submit}>
      <span className="section-label">Añadir al {shortDate(date)}</span>

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

      <div className="row gap-2">
        <input
          autoFocus
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
  const byDate = useMemo(() => eventsByDate(events), [events]);
  const checkInDays = useMemo(
    () => checkInDates(grid, weekday, everyWeeks, activeClient.startDate),
    [grid, weekday, everyWeeks, activeClient.startDate]
  );
  /*
    El próximo que TOCA, no el próximo jueves: con cadencia quincenal son cosas
    distintas y la segunda es mentira la mitad de las veces.

    Sale de `nextCheckIn`, que ahora conoce la cadencia y el alta. Antes se
    buscaba dentro de la rejilla visible y solo se recurría a la función cuando
    no había ninguno — y como aquella versión no sabía de cadencia, al mirar un
    mes pasado o al final de un mes quincenal la etiqueta decía el próximo jueves
    natural. La rejilla es lo que se está mirando, no lo que le toca al cliente.
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
    setOpenDay(null);
  };

  return (
    <div className="stack">
      <PageHead
        title={isClient ? 'Mi calendario' : 'Calendario'}
        sub="Citas, competiciones, descansos y las fechas a las que llegar."
      />

      <Panel className="col gap-4">
        <div className="row between wrap gap-3">
          {/* El MES es el título del bloque, no el de la pantalla: cambia al
              pasar página y un título de pantalla que cambia al navegar dentro
              de ella deja de decir dónde estás. */}
          <SectionTitle icon={CalendarDays}>
            {monthLabel(cursor.year, cursor.month)}
          </SectionTitle>

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
        </div>

        {unavailable && (
          <Notice tone="info">
            El calendario todavía no está activo en tu cuenta: puedes ver los días de check-in, pero no guardar citas ni recordatorios. Escríbenos desde Ajustes → Ayuda y lo activamos.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        {/* Elegir el día del check-in. Es la decisión que da sentido al resto. */}
        <div className="col gap-2">
          <span className="section-label">
            {isClient ? 'Mi día de check-in' : 'Día de check-in del cliente'}
          </span>
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
            ══ Y cada cuánto ══════════════════════════════════════════════════

            Faltaba, y no era un detalle: sin cadencia la aplicación daba por
            hecho que TODAS las semanas tocaba, así que la lista de revisiones
            pendientes del entrenador enseñaba también a quien revisa cada dos
            semanas. Una lista que sale entera siempre se deja de mirar.

            Va aquí, pegada al día, porque las dos contestan la misma pregunta
            —cuándo— y separarlas obligaría a buscar la mitad de la respuesta en
            otra pantalla. Solo se ofrece con día elegido: «cada dos semanas» sin
            decir qué día no significa nada.
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
        </div>

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
                  openDay === cell.date ? 'is-open' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setOpenDay((prev) => (prev === cell.date ? null : cell.date))}
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

        {openDay && !unavailable && (
          <DayForm
            date={openDay}
            onAdd={(payload) => act(addClientEvent({ clientId, ...payload }))}
            onClose={() => setOpenDay(null)}
          />
        )}
      </Panel>

      {/* Lo que viene, en lista: el mes da la forma, la lista da el detalle. */}
      <Panel className="col gap-3">
        <SectionTitle>Próximos eventos</SectionTitle>

        {events.filter((e) => e.date >= today).length === 0 ? (
          <p className="t-sm t-secondary">
            Nada apuntado. Pulsa un día del calendario para añadir una cita, una competición o una
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
    </div>
  );
};

/** Índice del día de la semana de hoy, para el valor por defecto del selector. */
export const todayWeekday = () => weekdayIndex(todayISO());
