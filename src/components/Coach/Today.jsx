import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  Inbox,
  MessageCircle,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

import { useApp, useSession } from '@/context/AppContext';
import { TRAMITES_INICIO, buildPortfolio, colasDeInicio, portfolioInbox } from '@/domain/portfolio';
import { ACTIVITY_KINDS, buildActivity } from '@/domain/today';
import { kindMeta } from '@/domain/calendar';
import { answersSummary, clientProtocol } from '@/domain/protocol';
import { clientPath } from '@/routes';
import { addDays, shortDate, todayISO, weekdayName } from '@/lib/dates';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, Fold, Notice, PageHead, Panel } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/ToastProvider';
import { SIN_CAMBIOS, useCloseReview } from '@/components/review/useCloseReview';
import { taskAction } from './TaskInbox';
import { GettingStarted } from './GettingStarted';

/**
 * «Inicio»: qué tengo que hacer hoy.
 *
 * ══ Por qué ya no es un diario ══════════════════════════════════════════════
 *
 * Era un hilo de eventos por día —«Ayer 6 · Martes 2»: pesajes, fotos, entrenos—
 * con una columna al lado que sumaba un «36» mezclando responder check-ins con
 * dar acceso al portal. Contaba lo que HA PASADO, y el entrenador abre la
 * aplicación para saber qué TIENE QUE HACER; ninguna fila llevaba un verbo.
 * Dos entrenadores lo dijeron igual: «mucha información y no sé qué hacer con
 * ella».
 *
 * Ahora la pantalla son CUATRO COLAS, cada una una pregunta que un entrenador
 * se hace de verdad, con un número y un verbo:
 *
 *   Por revisar     ¿a quién le debo respuesta?         → Revisar
 *   Sin programar   ¿a quién le falta rutina?           → Programar
 *   Sin señales     ¿quién ha desaparecido?             → Escribir
 *   Cobros          ¿quién me debe?                     → Cobrar
 *
 * La cola elegida se despliega debajo con sus personas y la acción para
 * vaciarla. Lo que ha pasado no desaparece: baja a una columna de actividad, más
 * pequeña, al lado de la agenda de la semana. Y los TRÁMITES —dar acceso,
 * terminar un alta, recordar un check-in— dejan de sumar en la cifra grande:
 * no son trabajo del oficio, y sumados hacían que el número no dijera nada.
 *
 * Las colas salen de `portfolioInbox` y `reviewQueue`, que ya lo calculaban
 * todo. Esto es pintar de otra forma lo que había, no un motor nuevo.
 */

/** «miércoles, 26 de agosto» → «Miércoles, 26 de agosto»: es el titular. */
const capitalizar = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* El saludo con tu nombre de pila: la pantalla se abre hablándote a ti, no
   leyendo el calendario. La fecha sigue ahí, en la línea de debajo. */
const saludo = (nombre) => {
  const h = new Date().getHours();
  const franja = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const pila = String(nombre || '').trim().split(/\s+/)[0];
  return pila ? `${franja}, ${pila}` : franja;
};

const ESTADO_REVISION = {
  ready: { label: 'Te espera', tone: 'badge-warn' },
  missing: { label: 'Sin subir', tone: '' },
};

const recordarCheckIn = (client) => {
  const nombre = (client.name || '').trim().split(/\s+/)[0];
  const texto = `Hola${nombre ? ` ${nombre}` : ''}, te toca el check-in de esta semana: pésate, hazte las fotos y entrégalo desde tu portal cuando puedas.`;
  window.open(
    `https://wa.me/${client.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(texto)}`,
    '_blank',
    'noopener,noreferrer'
  );
};

/** De qué va la revisión de alguien, en una línea: sus respuestas, o su lectura. */
const resumenDe = (row) =>
  answersSummary(clientProtocol(row.client.preferences), row.review?.answers) ||
  row.headline?.text ||
  [
    `${row.checkIn.count}/${row.checkIn.target} pesajes`,
    row.sinceTraining === null ? 'sin entrenos' : `entrenó hace ${row.sinceTraining} d`,
  ].join(' · ');

/** Una persona de una cola, con lo que hay que hacer con ella. */
const Persona = ({ row, sub, badge, onOpen, children }) => (
  <div className="task-row">
    <button type="button" className="task-hit" onClick={onOpen} aria-label={`Abrir a ${row.client.name}`} />
    <Avatar name={row.client.name} src={row.client.avatar} className="mark" />
    <span className="who">
      <span className="name">
        {row.client.name}
        {badge && <span className={`badge ${badge.tone}`}>{badge.label}</span>}
      </span>
      <span className="sub">{sub}</span>
    </span>
    {children}
  </div>
);

const ColaRevisar = ({ lista, onOpen, onCerrar }) => {
  const [enCurso, setEnCurso] = useState(null);
  const [escribiendo, setEscribiendo] = useState(null);
  const [texto, setTexto] = useState('');

  return (
    <div className="task-rows">
      {lista.map((row) => {
        const id = row.client.id;
        const puedeCerrar = row.review_state === 'ready' && row.review.exact && row.review.id;
        return (
          <Persona
            key={id}
            row={row}
            sub={resumenDe(row)}
            badge={ESTADO_REVISION[row.review_state]}
            onOpen={() => onOpen(id, 'semana')}
          >
            {puedeCerrar && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={enCurso === id}
                  title="Cierra su semana sin cambios y le llega que está vista"
                  onClick={async () => {
                    setEnCurso(id);
                    await onCerrar(row.review.id, id, SIN_CAMBIOS);
                    setEnCurso(null);
                  }}
                >
                  <Check size={12} /> {enCurso === id ? 'Guardando…' : 'Seguimos igual'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  aria-expanded={escribiendo === id}
                  onClick={() => setEscribiendo(escribiendo === id ? null : id)}
                >
                  <MessageSquare size={12} /> Contestar
                </button>
              </>
            )}
            {row.review_state === 'missing' && row.client.phone && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                title="Abrir WhatsApp con el recordatorio escrito"
                onClick={() => recordarCheckIn(row.client)}
              >
                <MessageCircle size={12} /> Recordar
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpen(id, 'semana')}>
              Revisar
            </button>
            {escribiendo === id && (
              <form
                className="col gap-2 task-respuesta"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const limpio = texto.trim();
                  if (!limpio) return;
                  setEnCurso(id);
                  await onCerrar(row.review.id, id, limpio);
                  setEnCurso(null);
                  setTexto('');
                  setEscribiendo(null);
                }}
              >
                <textarea
                  autoFocus
                  className="textarea"
                  rows={2}
                  value={texto}
                  placeholder="Lo que le dirías de esta semana. Lo lee en su portal."
                  onChange={(e) => setTexto(e.target.value)}
                />
                <div className="row gap-2">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!texto.trim() || enCurso === id}>
                    Enviar y cerrar
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEscribiendo(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </Persona>
        );
      })}
    </div>
  );
};

const ColaTareas = ({ filas, seccion, onOpen, handlers }) => (
  <div className="task-rows">
    {filas.map(({ row, taskId }) => {
      const accion = taskAction(taskId, row, handlers);
      return (
        <Persona key={row.client.id} row={row} sub={row.why} onOpen={() => onOpen(row.client.id, seccion)}>
          {accion && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={accion.onClick} title={accion.title}>
              <accion.icon size={12} /> {accion.label}
            </button>
          )}
          <ChevronRight size={15} className="chevron" aria-hidden="true" />
        </Persona>
      );
    })}
  </div>
);

export const Today = () => {
  const {
    clients,
    training,
    anthropometry,
    progressPhotos,
    checkIns,
    equipmentCounts,
    markClientPaid,
    loadEvents,
    setEventDone,
  } = useApp();
  const { profileName } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const { close } = useCloseReview();
  const [error, setError] = useState(null);
  const today = todayISO();

  const rows = useMemo(
    () => buildPortfolio({ clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts }, today),
    [clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts, today]
  );
  const colas = useMemo(() => colasDeInicio(rows, today), [rows, today]);
  const tramites = useMemo(
    () => portfolioInbox(rows).tasks.filter((t) => TRAMITES_INICIO.includes(t.id)),
    [rows]
  );

  /* La cola abierta: la primera con algo dentro, y la que se pulse después. */
  const [elegida, setElegida] = useState(null);
  const tieneGente = (c) => c.n > 0 || (c.lista?.length || 0) > 0;
  const abierta = colas.find((c) => c.id === elegida && tieneGente(c)) || colas.find(tieneGente) || null;
  const pendientes = colas.reduce((n, c) => n + c.n, 0);

  /* ── La agenda de la semana y la actividad reciente ────────────────────── */
  const [agendaEvents, setAgendaEvents] = useState([]);
  useEffect(() => {
    let vivo = true;
    loadEvents(null, { from: addDays(today, -14), to: addDays(today, 6) }).then((res) => {
      if (vivo && res.ok) setAgendaEvents(res.events);
    });
    return () => {
      vivo = false;
    };
  }, [loadEvents, today]);

  const semana = useMemo(() => {
    const nombres = new Map(clients.map((c) => [c.id, c.name]));
    const fila = (e) => ({ ...e, clientName: nombres.get(e.clientId) || 'Cliente dado de baja' });
    const utiles = agendaEvents.filter((e) => e?.date && e.kind !== 'checkin');
    const vencidos = utiles
      .filter((e) => e.date < today && !e.done)
      .map(fila)
      .sort((a, b) => a.date.localeCompare(b.date));
    const porDia = new Map();
    for (const e of utiles.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))) {
      if (!porDia.has(e.date)) porDia.set(e.date, []);
      porDia.get(e.date).push(fila(e));
    }
    const etiqueta = (date) =>
      date === today ? 'Hoy' : date === addDays(today, 1) ? 'Mañana' : weekdayName(`${date}T00:00:00Z`);
    const dias = [...porDia.entries()].map(([date, eventos]) => ({ date, label: etiqueta(date), eventos }));
    return { vencidos, dias, total: vencidos.length + dias.reduce((n, d) => n + d.eventos.length, 0) };
  }, [agendaEvents, clients, today]);

  const actividad = useMemo(
    () => buildActivity({ clients, training, anthropometry, progressPhotos, checkIns }, today, 2).slice(0, 8),
    [clients, training, anthropometry, progressPhotos, checkIns, today]
  );

  /* ── Acciones ──────────────────────────────────────────────────────────── */
  const open = (clientId, section) => navigate(clientPath(clientId, section));

  const cerrarRevision = async (reviewId, clientId, notas = SIN_CAMBIOS) => {
    const cliente = clients.find((c) => c.id === clientId);
    const res = await close({
      clientId,
      name: cliente?.name || 'el cliente',
      checkInId: reviewId,
      weekStart: checkIns[clientId]?.weekStart,
      notes: notas,
    });
    setError(res?.ok === false ? res.error : null);
  };

  const handlers = {
    paid: (clientId) => {
      const res = markClientPaid(clientId);
      setError(res?.ok === false ? res.error : null);
      if (res?.ok === false) return;
      const nombre = clients.find((c) => c.id === clientId)?.name || 'el cliente';
      toast({
        text: `Cobro de ${nombre} anotado y fecha adelantada.`,
        action: { label: 'Deshacer', onClick: () => res.undo() },
      });
    },
    review: (reviewId, clientId) => cerrarRevision(reviewId, clientId),
    invite: () => navigate('/clientes'),
  };

  const marcarEvento = async (event, done) => {
    setAgendaEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, done } : e)));
    const res = await setEventDone(event.id, done);
    if (!res.ok) {
      setAgendaEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, done: !done } : e)));
      setError(res.error);
    }
  };

  if (clients.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Todavía no hay nada que hacer"
        message="En cuanto des de alta a tu primer cliente, aquí verás a quién le debes respuesta, a quién le falta rutina y quién te debe."
      />
    );
  }

  return (
    <div className="stack">
      <PageHead
        title={saludo(profileName)}
        sub={[
          capitalizar(weekdayName(`${today}T00:00:00Z`, { conFecha: true })),
          `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'}`,
          pendientes === 0 ? 'nada pendiente' : `${pendientes} ${pendientes === 1 ? 'cosa por hacer' : 'cosas por hacer'}`,
        ].join(' · ')}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <GettingStarted />

      {/* ── Las cuatro colas ──────────────────────────────────────────────── */}
      <div className="colas" role="tablist" aria-label="Qué tienes que hacer">
        {colas.map((cola) => {
          const activa = abierta?.id === cola.id;
          return (
            <button
              key={cola.id}
              type="button"
              role="tab"
              aria-selected={activa}
              className={`cola${activa ? ' is-on' : ''}${tieneGente(cola) ? '' : ' is-vacia'}`}
              disabled={!tieneGente(cola)}
              onClick={() => setElegida(cola.id)}
            >
              <span className="cola-k">{cola.label}</span>
              <span className="cola-n">
                {cola.n}
                <small>{cola.n === 0 ? 'nadie' : cola.sub}</small>
              </span>
              <span className="cola-verbo">{cola.n > 0 ? `${cola.verbo} →` : tieneGente(cola) ? 'Recordar →' : 'Al día'}</span>
            </button>
          );
        })}
      </div>

      <div className="inicio">
        <section className="col gap-5">
          {abierta ? (
            <Panel
              title={abierta.label}
              sub={abierta.id === 'revisar' ? 'Primero quien lleva más tiempo esperando' : abierta.sub}
              className="col gap-3"
            >
              {abierta.id === 'revisar' ? (
                <ColaRevisar lista={abierta.lista} onOpen={open} onCerrar={cerrarRevision} />
              ) : (
                <ColaTareas filas={abierta.filas} seccion={abierta.seccion} onOpen={open} handlers={handlers} />
              )}
            </Panel>
          ) : (
            <Panel className="card-lumbre">
              <div className="empty">
                <span className="empty-icon">
                  <Sparkles size={26} />
                </span>
                <h3>Todo al día</h3>
                <p>Nadie espera respuesta, todos tienen rutina y no hay cobros pendientes.</p>
              </div>
            </Panel>
          )}

          {tramites.length > 0 && (
            <Panel title="Trámites" sub="Lo administrativo, para cuando tengas un hueco" className="col gap-3">
              {tramites.map((task) => (
                <Fold
                  key={task.id}
                  title={task.label}
                  summary={`${task.rows.length} ${task.rows.length === 1 ? 'persona' : 'personas'}`}
                >
                  <ColaTareas filas={task.rows.map((row) => ({ row, taskId: task.id }))} seccion={task.seccion} onOpen={open} handlers={handlers} />
                </Fold>
              ))}
            </Panel>
          )}
        </section>

        {/* ── La semana y lo que ha pasado ───────────────────────────────── */}
        <aside className="inicio-lado">
          <Panel
            title="Esta semana"
            action={semana.total > 0 ? <span className="badge">{semana.total}</span> : null}
            className="col gap-3"
          >
            {semana.total === 0 ? (
              <p className="t-sm t-secondary">Nada apuntado en la agenda hasta el domingo.</p>
            ) : (
              <div className="agenda">
                {semana.vencidos.length > 0 && (
                  <div className="agenda-dia is-vencido">
                    <span className="agenda-k">Se pasó</span>
                    {semana.vencidos.map((e) => (
                      <AgendaFila key={e.id} event={e} fecha onToggle={() => marcarEvento(e, true)} />
                    ))}
                  </div>
                )}
                {semana.dias.map((dia) => (
                  <div key={dia.date} className={`agenda-dia${dia.date === today ? ' is-hoy' : ''}`}>
                    <span className="agenda-k">{dia.label}</span>
                    {dia.eventos.map((e) => (
                      <AgendaFila key={e.id} event={e} onToggle={() => marcarEvento(e, !e.done)} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Actividad" sub="Últimas 48 horas" className="col gap-3">
            {actividad.length === 0 ? (
              <p className="t-sm t-secondary">Nadie ha registrado nada en dos días.</p>
            ) : (
              <div className="actividad">
                {actividad.map((event) => {
                  const kind = ACTIVITY_KINDS[event.kind];
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className="actividad-fila"
                      onClick={() => open(event.clientId, kind.section)}
                    >
                      <span className="feed-dot" style={{ background: kind.color }} aria-hidden="true" />
                      <span className="who">{event.clientName}</span>
                      <span className="what">
                        {event.title}
                        {event.detail && <span className="detail"> · {event.detail}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
};

const AgendaFila = ({ event, fecha = false, onToggle }) => {
  const kind = kindMeta(event.kind);
  return (
    <div className="agenda-fila">
      <span className="cal-dot" style={{ background: kind.color }} aria-hidden="true" />
      <span className="agenda-que">
        <span className={`title${event.done ? ' is-hecho' : ''}`}>{event.title}</span>
        <span className="sub">
          {event.clientName}
          {fecha ? ` · ${shortDate(event.date)}` : ''}
        </span>
      </span>
      <button type="button" className="chip" aria-pressed={event.done} onClick={onToggle}>
        {event.done ? 'Hecho' : 'Marcar hecho'}
      </button>
    </div>
  );
};
