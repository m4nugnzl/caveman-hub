import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { buildPortfolio, portfolioInbox } from '@/domain/portfolio';
import { planSnapshot } from '@/domain/reviews';
import {
  ACTIVITY_KINDS,
  DEFAULT_WINDOW,
  agenda,
  buildActivity,
  groupByDay,
  activityScale,
} from '@/domain/today';
import { kindMeta } from '@/domain/calendar';
import { clientPath } from '@/routes';
import { traeALaVista } from '@/lib/motion';
import { addDays, shortDate, todayISO, weekdayName } from '@/lib/dates';
import { EmptyState, Notice, PageHead, Panel } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/ToastProvider';
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

/**
 * Una línea de la agenda: qué hay apuntado, de quién, y el botón de darlo por
 * hecho.
 *
 * El punto de color y la etiqueta salen de `kindMeta` —el mismo mapa que pinta
 * el calendario— y no de una tabla propia: una cita en ámbar aquí y en azul allí
 * son dos productos.
 *
 * Lo vencido no se puede desmarcar desde aquí, solo darlo por hecho. Es lo único
 * que se quiere hacer con algo que se pasó, y el interruptor completo vive en su
 * calendario, que es donde además se puede mover de fecha o borrar.
 */
const AgendaRow = ({ event, vencido = false, onToggle }) => {
  const kind = kindMeta(event.kind);
  return (
    <div className="list-row">
      <span className="cal-dot" style={{ background: kind.color, width: 10, height: 10 }} aria-hidden="true" />

      <span className="list-row-label">
        <Link
          className="title"
          to={clientPath(event.clientId, 'calendario')}
          style={event.done ? { textDecoration: 'line-through' } : undefined}
        >
          {event.title}
        </Link>
        <span className="sub">
          {event.clientName} · {vencido ? `se pasó el ${shortDate(event.date)}` : kind.label}
        </span>
      </span>

      <button type="button" className="chip" aria-pressed={event.done} onClick={onToggle}>
        {event.done ? 'Hecho' : 'Marcar hecho'}
      </button>
    </div>
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
    unreviewCheckIn,
    loadEvents,
    setEventDone,
  } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState(null);

  const today = todayISO();

  /*
    ══ La agenda del día, en UNA consulta ══════════════════════════════════════

    Los eventos son lo único de esta pantalla que no está ya en memoria: crecen
    sin techo, así que no se cargan al arrancar (`useCalendar.js`). Aquí se piden
    acotados a la ventana del hilo y para toda la cartera de una vez —RLS decide
    qué filas salen—, que es lo mismo que hace la agenda del entrenador.

    La ventana se comparte con el hilo a propósito: lo que se reclama como
    vencido es lo que cabe en la pantalla que lo enseña. Un evento de hace ocho
    meses sin marcar se queda en el calendario, que es donde se repasa.
  */
  const [agendaEvents, setAgendaEvents] = useState([]);

  useEffect(() => {
    let vivo = true;
    const desde = addDays(today, -(DEFAULT_WINDOW - 1));

    loadEvents(null, { from: desde, to: today }).then((res) => {
      /* Sin la migración 0009 la tabla no existe y `loadEvents` devuelve vacío
         con su motivo. No se pinta error: la agenda es una pieza de más en esta
         pantalla, y tumbar «Hoy» entera por ella sería desproporcionado. */
      if (vivo && res.ok) setAgendaEvents(res.events);
    });

    return () => {
      vivo = false;
    };
  }, [loadEvents, today]);

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
  const dia = useMemo(() => agenda(agendaEvents, clients, today), [agendaEvents, clients, today]);

  /* Marcar hecho es optimista y se corrige si el servidor dice que no: es un
     toque en una lista, y esperar a la ida y vuelta para tachar una línea se
     nota. El mismo criterio que `markClientPaid`. */
  const marcarEvento = async (event, done) => {
    setAgendaEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, done } : e)));
    const res = await setEventDone(event.id, done);
    if (!res.ok) {
      setAgendaEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, done: !done } : e)));
      setError(res.error);
    }
  };

  /*
    ══ En el móvil, el hilo empieza por lo reciente y el resto se pide ═════════
    Recorriendo esta pantalla a 390 px, la quincena entera eran ~60 filas y
    cinco pantallas de scroll para llegar al final. Lo que se viene a mirar por
    la mañana son los últimos días; los once anteriores siguen ahí, detrás de un
    botón que dice cuántos son. En escritorio no se acota: allí el hilo comparte
    fila con la bandeja y la quincena entera es la gracia del panel.

    Igual que en la bandeja (`TaskInbox`), el estado inicial se decide al montar.
  */
  const [hiloEntero, setHiloEntero] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches
  );
  const DIAS_VISIBLES = 3;
  const diasVisibles = hiloEntero ? days : days.slice(0, DIAS_VISIBLES);

  /* El salto desde el pulso a un día todavía plegado: primero se despliega el
     hilo y, cuando el día existe en el DOM, se baja hasta él. */
  const [saltoPendiente, setSaltoPendiente] = useState(null);
  useEffect(() => {
    if (!saltoPendiente || !hiloEntero) return;
    traeALaVista(document.getElementById(`dia-${saltoPendiente}`), {
      block: 'center',
      behavior: 'smooth',
    });
    setSaltoPendiente(null);
  }, [saltoPendiente, hiloEntero]);

  const irAlDia = (date) => {
    if (!hiloEntero && days.findIndex((d) => d.date === date) >= DIAS_VISIBLES) {
      setHiloEntero(true);
      setSaltoPendiente(date);
      return;
    }
    traeALaVista(document.getElementById(`dia-${date}`), { block: 'center', behavior: 'smooth' });
  };

  const maxCount = Math.max(1, ...scale.map((d) => d.count));
  const activeToday = scale[scale.length - 1]?.count || 0;

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
  const cerrarRevision = async (reviewId, clientId, notas = null) => {
    const res = await reviewCheckIn(
      reviewId,
      notas,
      planSnapshot({ nutrition: nutrition[clientId], program: workoutData[clientId] })
    );
    setError(res?.ok === false ? res.error : null);
    if (res?.ok === false) return;

    /*
      El aviso con su «Deshacer»: cerrar es un toque sin confirmación —así debe
      ser, es el gesto de cada lunes— y su pareja honesta es la vuelta atrás.
      El inverso limpia sello, nota y foto (migración 0063) y la fila vuelve a
      la cola.
    */
    const nombre = clients.find((c) => c.id === clientId)?.name || 'el cliente';
    toast({
      text: `Semana de ${nombre} cerrada.`,
      action: {
        label: 'Deshacer',
        onClick: async () => {
          const undo = await unreviewCheckIn(reviewId);
          if (undo?.ok === false) setError(undo.error);
        },
      },
    });
  };

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
      {/* La fecha es el REMATE del título, en cursiva y en minúscula, como los
          titulares de la portada: «Hoy, martes 19 de agosto». La línea de abajo
          se queda con lo único que cambia a lo largo del día. */}
      <PageHead
        title="Hoy,"
        remate={weekdayName(`${today}T00:00:00Z`, { conFecha: true })}
        sub={
          activeToday > 0
            ? `${activeToday} ${activeToday === 1 ? 'movimiento' : 'movimientos'} de tu cartera`
            : 'Sin movimiento todavía'
        }
      />

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

      {/* ── EL PULSO ────────────────────────────────────────────────────────
          Catorce días, uno por marca. La barra es cuántas cosas pasaron; la
          marca de abajo existe aunque el día esté vacío, porque una escala a la
          que le faltan las marcas vacías deja de ser una escala.

          Ya no es una tarjeta: es una FRANJA del lienzo, entre dos filetes,
          como las bandas de la portada. Un instrumento de medida no va dentro
          de una caja con título — la escala ES la pieza, y encajonarla la
          convertía en un panel más de la pila. */}
      <section className="pulso" aria-label="El pulso de la cartera">
        <div className="pulso-head">
          <span className="section-label">El pulso de la cartera</span>
          <span className="pulso-hint">
            {DEFAULT_WINDOW} días · {events.length} {events.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>
        {/*
          ══ La escala también es el ÍNDICE del hilo ════════════════════════════

          La información de cada día vivía solo en `title`, que en una pantalla
          táctil no existe — y el panel se usa también desde el móvil—. Ahora un
          día con actividad es un botón que lleva a ese día en el hilo de abajo:
          el instrumento que mide la quincena sirve además para recorrerla.

          Los días vacíos siguen siendo marcas mudas: no hay nada a lo que ir, y
          un botón que no lleva a ninguna parte es un control falso. Por lo
          mismo, el contenedor ya no es `role="img"` —eso volvería presentacional
          todo lo de dentro, botones incluidos— sino un grupo con nombre.
        */}
        <div
          className="scale"
          role="group"
          aria-label={`Actividad de los últimos ${DEFAULT_WINDOW} días: ${events.length} registros en total.`}
        >
          {scale.map((day) => {
            const etiqueta = `${shortDate(day.date)}: ${day.count} ${day.count === 1 ? 'registro' : 'registros'}`;
            const dentro = (
              <>
                <span className="scale-track">
                  <span
                    className="scale-bar"
                    style={{ height: `${day.count === 0 ? 0 : Math.max(9, (day.count / maxCount) * 100)}%` }}
                  />
                </span>
                <span className="scale-tick" aria-hidden="true" />
              </>
            );

            return day.count > 0 ? (
              <button
                key={day.date}
                type="button"
                className={`scale-day${day.isToday ? ' is-today' : ''}`}
                title={`${etiqueta} · ver ese día en el hilo`}
                aria-label={`${etiqueta}. Ver ese día en el hilo.`}
                onClick={() => irAlDia(day.date)}
              >
                {dentro}
              </button>
            ) : (
              <div
                key={day.date}
                className={`scale-day${day.isToday ? ' is-today' : ''}`}
                title={etiqueta}
                aria-hidden="true"
              >
                {dentro}
              </div>
            );
          })}
        </div>
        <div className="scale-legend">
          <span>{shortDate(scale[0]?.date)}</span>
          <span className="is-hoy">hoy</span>
        </div>
      </section>

      <div className="today">
        {/* ── EL HILO ──────────────────────────────────────────────────── */}
        <section className="col gap-5">
          {days.length === 0 ? (
            <Panel title="Dos semanas en silencio" className="col gap-2">
              <p className="t-sm t-secondary">
                Nadie ha registrado un entreno, un pesaje ni una foto en catorce días. Si tus
                clientes entrenan pero no lo anotan, revisa que tengan acceso a su portal desde
                «Clientes».
              </p>
            </Panel>
          ) : (
            diasVisibles.map((day) => (
              /* El `id` es el ancla a la que saltan las barras del pulso. */
              <section className="feed-day" id={`dia-${day.date}`} key={day.date}>
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

          {/* El resto de la quincena, con la cuenta delante: un «ver más» sin
              número no dice si esconde dos días o doce. */}
          {!hiloEntero && days.length > DIAS_VISIBLES && (
            <button type="button" className="btn btn-secondary" onClick={() => setHiloEntero(true)}>
              Ver los {days.length - DIAS_VISIBLES} días anteriores
            </button>
          )}
        </section>

        {/* ── LA BANDEJA ───────────────────────────────────────────────── */}
        <aside className="today-side">
          <Panel
            title="Te esperan"
            action={<span className="badge">{inbox.tasks.reduce((n, t) => n + t.rows.length, 0)}</span>}
            className="col gap-3"
          >
            <TaskInbox
              tasks={inbox.tasks}
              onOpen={(clientId) => open(clientId, 'resumen')}
              handlers={{
                /* Marcar cobrado adelanta también la fecha al ciclo siguiente.
                   Antes solo cambiaba el estado, así que el cobro volvía a
                   reclamarse al día siguiente con la fecha vieja puesta. Lo hace
                   `markClientPaid`, que es la misma acción que usa la ficha, y
                   que además lo apunta en el libro de cobros.

                   El «Deshacer» del aviso es su `undo`: revierte la ficha Y
                   borra el apunte. Que cada pantalla compusiera el inverso por su
                   cuenta es lo que esa acción vino a evitar. */
                paid: (clientId) => {
                  const res = markClientPaid(clientId);
                  setError(res?.ok === false ? res.error : null);
                  if (res?.ok === false) return;

                  const nombre = clients.find((c) => c.id === clientId)?.name || 'el cliente';
                  toast({
                    text: `Cobro de ${nombre} anotado y fecha adelantada.`,
                    action: {
                      label: 'Deshacer',
                      onClick: () => res.undo(),
                    },
                  });
                },
                review: (reviewId, clientId) => cerrarRevision(reviewId, clientId),
                invite: () => navigate('/clientes'),
              }}
              emptyMessage="Nada pendiente por tu parte. Cuando alguien entregue su check-in o venza un cobro, aparecerá aquí."
            />
          </Panel>

          {/*
            ── LA AGENDA ────────────────────────────────────────────────────
            Debajo de «Te esperan» y no encima: lo que otro ha entregado y
            espera respuesta manda sobre lo que te apuntaste tú.

            Solo se pinta si hay algo. Un panel permanentemente vacío en la
            columna de lo accionable enseña a saltársela, y esta columna es lo
            único de la pantalla que hay que mirar entero.
          */}
          {(dia.today.length > 0 || dia.overdue.length > 0) && (
            <Panel
              title="En la agenda"
              action={dia.count > 0 ? <span className="badge">{dia.count}</span> : null}
              className="col gap-3"
            >
              <div className="list">
                {dia.overdue.map((event) => (
                  <AgendaRow key={event.id} event={event} vencido onToggle={() => marcarEvento(event, true)} />
                ))}
                {dia.today.map((event) => (
                  <AgendaRow key={event.id} event={event} onToggle={() => marcarEvento(event, !event.done)} />
                ))}
              </div>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
};
