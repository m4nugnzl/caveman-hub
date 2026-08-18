import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Waves } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { buildPortfolio, portfolioInbox } from '@/domain/portfolio';
import { planSnapshot } from '@/domain/reviews';
import {
  ACTIVITY_KINDS,
  DEFAULT_WINDOW,
  buildActivity,
  groupByDay,
  activityScale,
} from '@/domain/today';
import { clientPath } from '@/routes';
import { shortDate, todayISO, weekdayName } from '@/lib/dates';
import { EmptyState, Notice, Panel } from '@/components/ui/primitives';
import { TaskInbox } from './TaskInbox';
import { GettingStarted } from './GettingStarted';
import { ReviewQueue } from './ReviewQueue';

/**
 * «Hoy»: la pantalla con la que abre el entrenador.
 *
 * Tres piezas, en el orden en que se necesitan:
 *
 *   1. LA REGLA — catorce días de actividad de toda la cartera. Es la firma
 *      visual del producto y, a la vez, un histograma: un hueco en mitad de la
 *      tira es la cartera parada, y se ve antes de leer una línea.
 *   2. LA BANDEJA — lo que espera respuesta tuya. Corta a propósito.
 *   3. EL HILO — lo que han hecho ellos, por días.
 *
 * En escritorio la bandeja va a la derecha y se queda fija mientras se recorre el
 * hilo; en móvil se apila ENCIMA, porque es lo accionable y ahí el orden de
 * lectura es el de la página.
 *
 * Toda la lógica está en `domain/today.js`. Aquí solo hay presentación.
 */

/** Título del día, con su recuento. */
const DayHead = ({ label, count }) => (
  <div className="feed-date">
    <span className="k">{label}</span>
    <span className="n">{count}</span>
  </div>
);

const ActivityRow = ({ event, onOpen }) => {
  const kind = ACTIVITY_KINDS[event.kind];
  return (
    <button type="button" className="feed-row" onClick={onOpen}>
      <span className="feed-dot" style={{ background: kind.color }} aria-hidden="true" />
      <span className="who">{event.clientName}</span>
      <span className="what">
        {event.title}
        {event.detail && <span className="detail"> · {event.detail}</span>}
      </span>
      <span className="feed-kind">{kind.label}</span>
    </button>
  );
};

export const Today = () => {
  const {
    clients,
    training,
    anthropometry,
    progressPhotos,
    checkIns,
    nutrition,
    workoutData,
    markClientPaid,
    reviewCheckIn,
  } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  const today = todayISO();

  const events = useMemo(
    () => buildActivity({ clients, training, anthropometry, progressPhotos, checkIns }, today),
    [clients, training, anthropometry, progressPhotos, checkIns, today]
  );

  const rows = useMemo(
    () => buildPortfolio({ clients, training, anthropometry, progressPhotos, checkIns }, today),
    [clients, training, anthropometry, progressPhotos, checkIns, today]
  );

  /* La MISMA bandeja que calcula el dominio. Antes «Hoy» tenía la suya —tres
     tipos de aviso contados aparte— y «Clientes» la de verdad, con siete tareas:
     dos listas de «lo que te espera» que no coincidían. */
  const inbox = useMemo(() => portfolioInbox(rows), [rows]);
  const days = useMemo(() => groupByDay(events, today), [events, today]);
  const scale = useMemo(() => activityScale(events, today, DEFAULT_WINDOW), [events, today]);

  const maxCount = Math.max(1, ...scale.map((d) => d.count));
  const activeToday = scale[scale.length - 1]?.count || 0;

  const act = async (promise) => {
    const result = await promise;
    setError(result?.ok === false ? result.error : null);
  };

  const open = (clientId, section) => navigate(clientPath(clientId, section));

  /*
    ══ Cerrar una revisión, en un solo sitio ══════════════════════════════════

    La misma fila pendiente se puede cerrar desde DOS piezas de esta pantalla: la
    cola de revisiones y la bandeja de tareas. Estaban llamando a `reviewCheckIn`
    por su cuenta, y la bandeja lo hacía sin la foto del plan —que es opcional en
    la firma— así que cerrar por un lado o por el otro dejaba rastros distintos:
    unas revisiones con su plan congelado y otras con `null`, según por dónde se
    hubiera pulsado.

    Eso es un hueco que no se puede rellenar después: la foto vale porque se toma
    EN EL MOMENTO de revisar. Ahora las dos piezas llaman aquí, y no hay ninguna
    forma de cerrar una revisión sin ella.
  */
  const cerrarRevision = (reviewId, clientId, notas = null) =>
    act(
      reviewCheckIn(
        reviewId,
        notas,
        planSnapshot({ nutrition: nutrition[clientId], program: workoutData[clientId] })
      )
    );

  if (clients.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Todavía no hay nada que contar"
        message="En cuanto des de alta a tu primer cliente, aquí aparecerá lo que va haciendo: sus entrenos, sus pesajes y sus fotos, en orden."
      />
    );
  }

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Hoy</h2>
          <p>
            {weekdayName(`${today}T00:00:00Z`, { conFecha: true }).replace(/^./, (c) =>
              c.toUpperCase()
            )}
            {activeToday > 0
              ? ` · ${activeToday} ${activeToday === 1 ? 'movimiento' : 'movimientos'}`
              : ' · sin movimiento todavía'}
          </p>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {/* La guía de las primeras veces. Se cierra y no vuelve. */}
      <GettingStarted />

      {/*
        ══ La pasada semanal, antes que el hilo ═══════════════════════════════

        El hilo de abajo cuenta lo que HA PASADO —es el pulso de la cartera— y
        eso se mira; la pasada es lo que hay que HACER, y eso se trabaja. Debajo
        de catorce días de actividad, la lista de a quién le debes una respuesta
        quedaba fuera de la primera pantalla.

        No sustituye a la bandeja de tareas: aquélla ordena por tipo de trabajo
        —cobrar, dar acceso, programar— y ésta recorre a las personas una por una,
        que es el gesto del lunes.
      */}
      <ReviewQueue
        rows={rows}
        /* La misma foto del plan que guarda la bandeja: cerrar desde aquí o desde
           allí tiene que dejar el mismo rastro, o el histórico saldría con huecos
           según por dónde se cerrara. Por eso las dos pasan por `cerrarRevision`. */
        onReview={(id, notas, clientId) => cerrarRevision(id, clientId, notas)}
      />

      {/* ── LA REGLA ────────────────────────────────────────────────────────
          Catorce días, uno por marca. La barra es cuántas cosas pasaron; la
          marca de abajo existe aunque el día esté vacío, porque una escala a la
          que le faltan las marcas vacías deja de ser una escala. */}
      <section className="scale-card">
        <span className="section-label">Últimas dos semanas</span>
        <div
          className="scale"
          role="img"
          aria-label={`Actividad de los últimos ${DEFAULT_WINDOW} días: ${events.length} registros en total.`}
        >
          {scale.map((day) => (
            <div
              key={day.date}
              className={`scale-day${day.isToday ? ' is-today' : ''}`}
              title={`${shortDate(day.date)}: ${day.count} ${day.count === 1 ? 'registro' : 'registros'}`}
            >
              <span className="scale-track">
                <span
                  className="scale-bar"
                  style={{ height: `${day.count === 0 ? 0 : Math.max(9, (day.count / maxCount) * 100)}%` }}
                />
              </span>
              <span className="scale-tick" aria-hidden="true" />
            </div>
          ))}
        </div>
        <div className="scale-legend">
          <span>{shortDate(scale[0]?.date)}</span>
          <span>hoy</span>
        </div>
      </section>

      <div className="today">
        {/* ── EL HILO ──────────────────────────────────────────────────── */}
        <section className="col gap-5">
          {days.length === 0 ? (
            <Panel className="col gap-2">
              <span className="section-title">
                <Waves size={17} /> Dos semanas en silencio
              </span>
              <p className="t-sm t-secondary">
                Nadie ha registrado un entreno, un pesaje ni una foto en catorce días. Si tus
                clientes entrenan pero no lo anotan, revisa que tengan acceso a su portal desde
                «Clientes».
              </p>
            </Panel>
          ) : (
            days.map((day) => (
              <section className="feed-day" key={day.date}>
                <DayHead label={day.label} count={day.events.length} />
                <div className="feed-rows">
                  {day.events.map((event) => (
                    <ActivityRow
                      key={event.id}
                      event={event}
                      onOpen={() => open(event.clientId, ACTIVITY_KINDS[event.kind].section)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </section>

        {/* ── LA BANDEJA ───────────────────────────────────────────────── */}
        <aside className="today-side">
          <section className="card col gap-3">
            <div className="row between gap-2">
              <span className="section-label">Te esperan</span>
              <span className="badge">{inbox.tasks.reduce((n, t) => n + t.rows.length, 0)}</span>
            </div>

            <TaskInbox
              tasks={inbox.tasks}
              onOpen={(clientId) => open(clientId, 'resumen')}
              handlers={{
                /* Marcar cobrado adelanta también la fecha al ciclo siguiente.
                   Antes solo cambiaba el estado, así que el cobro volvía a
                   reclamarse al día siguiente con la fecha vieja puesta. Lo hace
                   `markClientPaid`, que es la misma acción que usa la ficha. */
                paid: (clientId) => act(markClientPaid(clientId)),
                review: (reviewId, clientId) => cerrarRevision(reviewId, clientId),
                invite: () => navigate('/clientes'),
              }}
              emptyMessage="Nada pendiente por tu parte. Cuando alguien entregue su check-in o venza un cobro, aparecerá aquí."
            />
          </section>

        </aside>
      </div>
    </div>
  );
};
