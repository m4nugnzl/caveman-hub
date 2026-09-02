import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import {
  EVENT_KINDS,
  WEEKDAYS,
  checkInDates,
  checkInSchedule,
  eventsByDate,
  kindMeta,
  monthGrid,
  monthLabel,
  shiftMonth,
  weekCells,
} from '@/domain/calendar';
import { clientPath } from '@/routes';
import { shortDate, todayISO, weekdayName } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Notice, PageHead, Panel } from '@/components/ui/primitives';
import { KindLegend } from './WeekBoard';

/** «jueves 20 de agosto» → «Jueves 20 de agosto». Es un título; se le pone mayúscula. */
const tituloDeDia = (date) => {
  const nombre = weekdayName(date, { conFecha: true });
  return nombre ? nombre[0].toUpperCase() + nombre.slice(1) : shortDate(date);
};

/** El nombre con el que cabe una persona en una tarjeta de 90 px. */
const nombreCorto = (name) => String(name || '').trim().split(/\s+/)[0] || 'Cliente';

/**
 * La hoja de un día de la agenda: quién tiene qué, y dónde se le agenda algo.
 *
 * Se parece a la del calendario de un cliente y no es la misma: aquí cada línea
 * pertenece a una persona distinta, así que el nombre manda sobre el tipo, y
 * añadir obliga a decir a quién. Un formulario que da por hecho el cliente sería
 * el de la otra pantalla con un desplegable pegado encima.
 */
const AgendaSheet = ({ date, cards, clients, canWrite, onAdd, onToggle, onRemove, onClose }) => {
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [kind, setKind] = useState('appointment');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const clean = title.trim();
    if (!clean || !clientId) return;
    setBusy(true);
    await onAdd({ clientId, date, kind, title: clean });
    setBusy(false);
    /* La hoja se queda abierta y solo se vacía el título: agendar la misma cosa
       a tres personas seguidas es el caso normal de un lunes, y volver a elegir
       el tipo cada vez sería trabajo inventado. */
    setTitle('');
  };

  return (
    <Modal title={tituloDeDia(date)} onClose={onClose}>
      <div className="col gap-4">
        {cards.length === 0 ? (
          <p className="t-sm t-secondary">Este día no tiene nada apuntado por nadie.</p>
        ) : (
          <div className="list">
            {cards.map((card) => (
              <div className="list-row" key={card.id}>
                <span
                  className="cal-dot"
                  style={{ background: kindMeta(card.kind).color, width: 10, height: 10 }}
                />
                <span className="list-row-label">
                  <span
                    className="title"
                    style={card.done ? { textDecoration: 'line-through' } : undefined}
                  >
                    {card.what}
                  </span>
                  <span className="sub">
                    {card.clientName} · {kindMeta(card.kind).label}
                  </span>
                </span>

                {/* La revisión no es un evento: no se marca hecha ni se borra
                    desde aquí. Se entrega, y lo hace el cliente. Lo único que
                    tiene sentido ofrecer es ir a su semana. */}
                {card.event ? (
                  <>
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={card.done}
                      onClick={() => onToggle(card.event)}
                    >
                      {card.done ? 'Hecho' : 'Marcar hecho'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-danger"
                      onClick={() => onRemove(card.event)}
                      aria-label={`Borrar ${card.what}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                ) : (
                  <Link className="chip" to={clientPath(card.clientId, 'semana')} onClick={onClose}>
                    Ver su semana
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {canWrite && clients.length > 0 && (
          <form className="col gap-3" onSubmit={submit}>
            <div className="row gap-2">
              <select
                className="select"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                aria-label="A quién se lo agendas"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

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
                className="input grow"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: videollamada, media maratón, semana de descarga…"
                aria-label="Título del evento"
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={busy || !title.trim() || !clientId}
              >
                <Plus size={14} /> Agendar
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};

/**
 * La agenda del entrenador: su cartera entera en un solo calendario.
 *
 * ══ Por qué esta pantalla no existía ════════════════════════════════════════
 *
 * El calendario era una sección DE un cliente, así que la pregunta con la que un
 * entrenador abre un calendario —«¿qué tengo esta semana?»— solo se podía
 * contestar entrando en veinte fichas y sumando de memoria. La aplicación tenía
 * veinte calendarios y ninguna agenda.
 *
 * ── Lo que la hace útil no son los eventos, son las revisiones ─────────────
 * Un entrenador apunta pocas citas. Lo que de verdad tiene repartido por la
 * semana son las ENTREGAS: quién le sube el peso y las fotos el martes y quién
 * el jueves. Eso ya estaba calculado por cliente (`checkInDates`) y no se veía
 * junto en ninguna parte, que es exactamente lo que convierte una lista de
 * pendientes en una carga de trabajo con forma.
 *
 * ── Y por qué no hace falta ni una política nueva ─────────────────────────
 * Porque `events_read` (migración 0009) ya limita las filas a los clientes que
 * quien pregunta puede leer. La consulta sin filtro de cliente devuelve la
 * cartera y nada más: quitar el `.eq()` no abre nada. Ver `useCalendar`.
 */
export const CoachCalendar = () => {
  const { clients, loadEvents, addClientEvent, setEventDone, removeClientEvent } = useApp();

  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const d = new Date(`${today}T00:00:00Z`);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
  const [events, setEvents] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [openDay, setOpenDay] = useState(null);
  const [error, setError] = useState(null);

  /* Los archivados no. Su calendario sigue existiendo en su ficha; lo que no
     tiene sentido es que la agenda de esta semana reclame entregas de alguien
     que ya no entrena aquí. */
  const activos = useMemo(() => clients.filter((c) => c.status !== 'archived'), [clients]);

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const week = useMemo(() => weekCells(today), [today]);

  /*
    Se cargan los eventos del mes en pantalla y de la semana en curso, no la
    historia entera: es la única tabla del proyecto que crece sin techo, y la
    agenda la abre alguien con veinte clientes.

    El rango se estira hasta cubrir las dos, porque la semana en curso puede caer
    fuera del mes que se esté mirando.
  */
  const desde = useMemo(() => (grid[0].date < week[0].date ? grid[0].date : week[0].date), [grid, week]);
  const hasta = useMemo(
    () => (grid[grid.length - 1].date > week[6].date ? grid[grid.length - 1].date : week[6].date),
    [grid, week]
  );

  const refresh = useCallback(async () => {
    const result = await loadEvents(null, { from: desde, to: hasta });
    setUnavailable(!result.ok);
    setEvents(result.events);
  }, [loadEvents, desde, hasta]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const byDate = useMemo(() => eventsByDate(events), [events]);
  const nombres = useMemo(() => new Map(activos.map((c) => [c.id, c.name])), [activos]);

  /**
   * Las revisiones de toda la cartera, por fecha.
   *
   * Cada cliente tiene su pauta —su día, su cadencia y sus fechas movidas— así
   * que esto es la unión de veinte calendarios distintos. Se calcula sobre las
   * celdas que hay en pantalla y no sobre el año, que es lo que lo hace barato.
   */
  const revisionesPor = useCallback(
    (cells) => {
      const mapa = new Map();
      for (const client of activos) {
        const dias = checkInDates(cells, checkInSchedule(client.preferences), client.startDate, today);
        for (const dia of dias) {
          if (!mapa.has(dia)) mapa.set(dia, []);
          mapa.get(dia).push(client);
        }
      }
      /* Por nombre dentro del día: el orden tiene que ser el mismo cada vez que
         se pinta, y el de la cartera cambia con la gravedad de cada uno. */
      for (const lista of mapa.values()) lista.sort((a, b) => a.name.localeCompare(b.name));
      return mapa;
    },
    [activos, today]
  );

  /* Las celdas que hay en pantalla, sin repetir: la semana en curso puede caer
     dentro del mes que se mira o fuera de él, y calcular las revisiones dos
     veces daría dos mapas que hay que elegir en cada uso. Uno solo, y no hay
     dónde equivocarse. */
  const celdas = useMemo(() => {
    const vistas = new Map();
    for (const cell of [...week, ...grid]) if (!vistas.has(cell.date)) vistas.set(cell.date, cell);
    return [...vistas.values()];
  }, [week, grid]);

  const revisiones = useMemo(() => revisionesPor(celdas), [revisionesPor, celdas]);

  /** Las tarjetas de un día: primero quién entrega, después lo agendado. */
  const cardsDe = useCallback(
    (date) => [
      ...(revisiones.get(date) || []).map((client) => ({
        id: `revision-${client.id}-${date}`,
        kind: 'checkin',
        clientId: client.id,
        clientName: client.name,
        when: nombreCorto(client.name),
        what: 'Revisión',
        done: false,
        event: null,
      })),
      ...(byDate.get(date) || []).map((event) => ({
        id: event.id,
        kind: event.kind,
        clientId: event.clientId,
        clientName: nombres.get(event.clientId) || 'Cliente',
        when: nombreCorto(nombres.get(event.clientId)),
        what: event.title,
        done: event.done,
        event,
      })),
    ],
    [byDate, nombres, revisiones]
  );

  /*
    ── «Lo próximo»: la semana, dicha en personas ─────────────────────────────
    Aquí hubo un tablero de siete casillas («Esta semana»), y su caso normal
    era enseñar siete cajas punteadas de «Libre» encima de un mes que ya
    enseñaba esa misma semana: el vacío decorando, dos veces. La agenda de un
    entrenador son personas que entregan y citas con fecha; eso se dice como
    lista —«Sáb 5 · Marta y Javier entregan su semana»— y cada fila abre la
    hoja de su día, el mismo gesto que pulsar la celda del mes.

    Sale de las celdas ya cargadas (el mes a la vista más la semana en curso):
    no pide nada nuevo, y por eso el alcance es «lo que hay a la vista», no un
    horizonte inventado.
  */
  const proximo = useMemo(() => {
    const dias = celdas
      .filter((cell) => cell.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const filas = [];
    for (const cell of dias) {
      const entregan = revisiones.get(cell.date) || [];
      if (entregan.length > 0) {
        const nombres2 = entregan.map((c) => nombreCorto(c.name));
        filas.push({
          id: `prox-rev-${cell.date}`,
          date: cell.date,
          quien:
            entregan.length === 1
              ? entregan[0].name
              : entregan.length === 2
                ? `${nombres2[0]} y ${nombres2[1]}`
                : `${entregan.length} entregas`,
          que:
            entregan.length === 1
              ? 'entrega su semana'
              : entregan.length === 2
                ? 'entregan su semana'
                : `${nombres2.slice(0, 2).join(', ')} y ${entregan.length - 2} más`,
        });
      }
      for (const event of byDate.get(cell.date) || []) {
        if (event.done) continue;
        filas.push({
          id: `prox-ev-${event.id}`,
          date: cell.date,
          quien: event.title,
          que: `${nombres.get(event.clientId) || 'Cliente'} · ${kindMeta(event.kind).label}`,
        });
      }
    }
    return filas;
  }, [celdas, revisiones, byDate, nombres, today]);
  /* Las seis primeras: es un costado, no un archivo. Si hay más, se dice. */
  const proximoVisible = proximo.slice(0, 6);

  const act = async (promise) => {
    const result = await promise;
    if (result?.ok === false) setError(result.error);
    else {
      setError(null);
      await refresh();
    }
  };

  const move = (delta) => setCursor((prev) => shiftMonth(prev.year, prev.month, delta));

  if (activos.length === 0) {
    return (
      <div className="stack">
        <PageHead title="Agenda" sub="Lo que tienes esta semana, con toda tu cartera junta." />
        <EmptyState
          title="Todavía no hay a quién agendar"
          message="Da de alta a tu primer cliente y su día de revisión aparecerá aquí, junto al de los demás."
          action={
            <Link className="btn btn-primary btn-sm" to="/clientes">
              Ir a Clientes
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead
        title="Agenda"
        sub="Quién te entrega y qué tienes agendado, con toda tu cartera junta."
      />

      {unavailable && (
        <Notice tone="info">
          El calendario todavía no está activo en tu cuenta: puedes ver los días de revisión, pero
          no guardar citas ni recordatorios. Escríbenos desde Ajustes → Ayuda y lo activamos.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="agenda-pagina">
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
        <div className="cal">
          {WEEKDAYS.map((label) => (
            <span className="cal-dow" key={label}>
              {label}
            </span>
          ))}

          {grid.map((cell) => {
            const entregan = revisiones.get(cell.date) || [];
            const dayEvents = byDate.get(cell.date) || [];

            return (
              <button
                type="button"
                key={cell.date}
                className={['cal-day', cell.inMonth ? '' : 'is-outside', cell.isToday ? 'is-today' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setOpenDay(cell.date)}
                aria-label={`${cell.date}, ${entregan.length} revisiones`}
              >
                <span className="n">{cell.day}</span>

                {/* La cifra y no la palabra: en la agenda lo que se busca en el
                    mes es cuántos te entregan ese día, no que haya alguno. */}
                {entregan.length > 0 && (
                  <span className="cal-checkin">
                    {entregan.length} {entregan.length === 1 ? 'entrega' : 'entregas'}
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

        <div className="cal-pie">
          <p className="cal-legend">Toca un día para ver quién entrega y agendar algo.</p>
          <KindLegend kinds={EVENT_KINDS} />
        </div>
      </Panel>

      {/*
        El costado: lo que viene, con nombre. Cada fila abre la hoja de su día
        — el mismo gesto que pulsar la celda del mes, dicho en legible.
      */}
      <aside className="agenda-lado" aria-label="Lo próximo en la agenda">
        <Panel tight title="Lo próximo" className="col gap-1">
          {proximoVisible.length === 0 ? (
            <div className="vacio-invita">
              <p>Nada por delante en este mes.</p>
              <button type="button" className="cab-accion is-puerta" onClick={() => setOpenDay(today)}>
                Apuntar algo
              </button>
            </div>
          ) : (
            <>
              <div className="list">
                {proximoVisible.map((fila) => (
                  <button
                    type="button"
                    key={fila.id}
                    className="list-row prox-fila"
                    onClick={() => setOpenDay(fila.date)}
                  >
                    <span className="prox-cuando">
                      <b>{Number(fila.date.slice(8, 10))}</b>
                      <span>{weekdayName(fila.date)?.slice(0, 3) || ''}</span>
                    </span>
                    <span className="list-row-label">
                      <span className="title">{fila.quien}</span>
                      <span className="sub">{fila.que}</span>
                    </span>
                  </button>
                ))}
              </div>
              {proximo.length > proximoVisible.length && (
                <p className="t-xs t-tertiary">Y {proximo.length - proximoVisible.length} más, en el mes.</p>
              )}
            </>
          )}
        </Panel>
      </aside>
      </div>

      {openDay && (
        <AgendaSheet
          date={openDay}
          cards={cardsDe(openDay)}
          clients={activos}
          canWrite={!unavailable}
          onAdd={(payload) => act(addClientEvent(payload))}
          onToggle={(event) => act(setEventDone(event.id, !event.done))}
          onRemove={(event) => act(removeClientEvent(event.id))}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  );
};
