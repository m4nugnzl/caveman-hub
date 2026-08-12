import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Eye, MessageCircle, Search, Send, TrendingUp, Users } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { THRESHOLDS, buildPortfolio, portfolioBoard } from '@/domain/portfolio';
import { memberName } from '@/domain/team';
import { clientPath } from '@/routes';
import { shortDate, todayISO } from '@/lib/dates';
import { EmptyState, Notice } from '@/components/ui/primitives';

const TONE = { alta: 'badge-bad', media: 'badge-warn', baja: 'badge-info' };

const initials = (name) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('');

/** «hace 3 días» dice más que una fecha cuando lo que importa es la antigüedad. */
const sinceLabel = (days, date) => {
  if (days === null || !date) return 'nunca';
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days <= 21) return `hace ${days} d`;
  return shortDate(date);
};

const Fact = ({ label, value, stale }) => (
  <span className="folio-fact">
    <span className="k">{label}</span>
    <span className={`v${stale ? ' is-stale' : ''}`}>{value}</span>
  </span>
);

/**
 * Un cliente, como ficha del tablero.
 *
 * ── Por qué la ficha entera abre el cliente ─────────────────────────────────
 * Un botón «Abrir» obliga a apuntar a un blanco de 60 px para hacer lo que se
 * quiere hacer nueve de cada diez veces. La ficha completa es el blanco, que
 * además es lo que uno espera de una tarjeta.
 *
 * Se implementa con una capa de clic que la cubre por debajo del contenido, no
 * envolviendo todo en un `<button>`: dentro hay acciones propias (WhatsApp, marcar
 * cobrado, marcar revisado) y un botón dentro de otro botón es HTML inválido y una
 * trampa con el teclado. Las zonas no interactivas dejan pasar el clic con
 * `pointer-events: none`, así que pulsar el nombre o las fechas funciona igual.
 */
const FolioCard = ({ row, trainer, onOpen, onUpdate, onReview, onInvite }) => {
  const { client, alerts, checkIn } = row;
  const severity = alerts.length === 0 ? 'clean' : row.severity;
  const needsPayment = alerts.some((a) => a.id === 'payment_overdue' || a.id === 'payment_pending');
  const needsOnboarding = alerts.some((a) => a.id === 'onboarding');
  const needsAccount = alerts.some((a) => a.id === 'no_account');

  return (
    <article className={`folio is-${severity}`}>
      <button
        type="button"
        className="folio-hit"
        onClick={onOpen}
        aria-label={`Abrir la ficha de ${client.name}`}
      />

      <header className="folio-head">
        <span className="folio-mark" aria-hidden="true">
          {initials(client.name)}
        </span>
        <span className="who">
          <span className="name">{client.name}</span>
          <span className="sub">
            {[
              client.plan || 'sin plan',
              row.weeksProgrammed > 0 ? `${row.weeksProgrammed} sem.` : 'sin rutina',
              /* El entrenador responsable solo aparece si hay equipo: en un equipo
                 de uno, escribir su propio nombre en cada ficha es ruido. */
              trainer !== null ? (trainer ? memberName(trainer) : 'sin asignar') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <ChevronRight size={17} color="var(--text-tertiary)" aria-hidden="true" />
      </header>

      {/*
        El veredicto, encima de los datos.
        ----------------------------------------------------------------------
        La ficha contaba cosas que FALTAN —días sin entrenar, check-in a medias— y
        ninguna decía lo único que se quiere saber de un vistazo: si el cliente está
        progresando. Un cliente puede tener cero alertas y llevar seis semanas
        estancado, y en el tablero se veía idéntico a uno que va perfecto.

        Sale del mismo `weeklyReading` que la analítica, así que las dos pantallas no
        pueden discrepar. Cuando no hay objetivo o faltan semanas es `null` y esta
        línea no aparece: mejor nada que un veredicto inventado.
      */}
      {row.headline && (
        <div className={`folio-verdict is-${row.headline.tone}`}>
          <TrendingUp size={13} />
          <span>{row.headline.text}</span>
        </div>
      )}

      <div className="folio-facts">
        <Fact
          label="Entreno"
          value={sinceLabel(row.sinceTraining, row.lastTraining)}
          stale={row.sinceTraining === null || row.sinceTraining >= THRESHOLDS.noTraining}
        />
        <Fact
          label="Peso"
          value={sinceLabel(row.sinceWeight, row.lastWeight)}
          stale={row.sinceWeight === null || row.sinceWeight >= THRESHOLDS.noWeight}
        />
        <Fact
          label="Check-in"
          value={
            checkIn.average !== null
              ? `${checkIn.count}/${checkIn.target} · ${checkIn.average} kg`
              : `${checkIn.count}/${checkIn.target}`
          }
          stale={!checkIn.complete}
        />
        <Fact
          label="Cobro"
          value={
            client.paymentStatus === 'paid'
              ? client.nextPaymentDate
                ? shortDate(client.nextPaymentDate)
                : 'al día'
              : 'pendiente'
          }
          stale={client.paymentStatus !== 'paid'}
        />
      </div>

      {alerts.length > 0 && (
        <div className="folio-tags">
          {alerts.map((alert) => (
            <span key={alert.id} className={`badge ${TONE[alert.severity]}`}>
              {alert.label}
            </span>
          ))}
        </div>
      )}

      {/*
        Acciones que resuelven la alerta sin salir de aquí. Son las cosas que el
        entrenador hace decenas de veces al mes y que antes exigían entrar en la
        ficha y buscar el interruptor. `stopPropagation` no hace falta: van por
        encima de la capa de clic, así que nunca la activan.
      */}
      <footer className="folio-foot">
        {/* Invitar va primero: mientras el cliente no pueda entrar, todo lo demás
            que se haga en esta ficha da igual. */}
        {needsAccount && (
          <button type="button" className="chip chip-dashed" onClick={onInvite}>
            <Send size={12} /> Invitar
          </button>
        )}
        {onReview && (
          <button type="button" className="chip" onClick={onReview}>
            <Eye size={12} /> Marcar revisado
          </button>
        )}
        {needsPayment && (
          <button type="button" className="chip" onClick={() => onUpdate({ paymentStatus: 'paid' })}>
            <Check size={12} /> Marcar cobrado
          </button>
        )}
        {needsOnboarding && (
          <button
            type="button"
            className="chip"
            onClick={() => onUpdate({ onboardingComplete: true })}
          >
            <Check size={12} /> Cerrar onboarding
          </button>
        )}
        {client.phone && (
          <a
            className="chip"
            href={`https://wa.me/${client.phone.replace(/[^\d]/g, '')}`}
            target="_blank"
            rel="noreferrer noopener"
            title="Escribir por WhatsApp"
          >
            <MessageCircle size={12} /> WhatsApp
          </a>
        )}
      </footer>
    </article>
  );
};

/**
 * Cartera de clientes, como TABLERO.
 *
 * ── Por qué un tablero y no una lista ───────────────────────────────────────
 * Una lista ordenada por urgencia responde «a quién atiendo primero». Un tablero
 * responde algo distinto y más útil cuando llevas veinte: **dónde está el cuello
 * de botella del grupo**. Ocho fichas en «por revisar» y dos en «en riesgo» dicen
 * qué clase de trabajo tienes hoy antes de leer un solo nombre.
 *
 * Las columnas son, de izquierda a derecha, el orden de prioridad, y cada cliente
 * está en UNA sola, así que los contadores suman el total de la cartera. Nada se
 * arrastra: el estado lo calculan los datos (ver `domain/portfolio.js`).
 *
 * Se conservan el buscador y el eje de entrenador; desaparecen las cinco cifras
 * pulsables, porque en un tablero la columna ES el filtro.
 */
export const ClientPortfolio = () => {
  const {
    clients,
    workoutData,
    anthropometry,
    progressPhotos,
    checkIns,
    updateClient,
    reviewCheckIn,
    createInvite,
    team,
    teamMembers,
  } = useApp();
  const navigate = useNavigate();

  const [trainer, setTrainer] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  const today = todayISO();
  const rows = useMemo(
    () => buildPortfolio({ clients, workoutData, anthropometry, progressPhotos, checkIns }, today),
    [clients, workoutData, anthropometry, progressPhotos, checkIns, today]
  );

  /* El eje de entrenador solo existe si hay equipo con más de una persona: con un
     entrenador único, un filtro de una sola opción es ruido. */
  const showTrainers = Boolean(team) && teamMembers.length > 1;
  const memberById = useMemo(() => new Map(teamMembers.map((m) => [m.profileId, m])), [teamMembers]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (showTrainers && trainer !== 'all') {
        const mine = trainer === 'none' ? !row.client.assignedTo : row.client.assignedTo === trainer;
        if (!mine) return false;
      }
      if (!term) return true;
      return (
        row.client.name.toLowerCase().includes(term) ||
        (row.client.email || '').toLowerCase().includes(term)
      );
    });
  }, [rows, showTrainers, trainer, search]);

  const board = useMemo(() => portfolioBoard(visible), [visible]);

  /* Abrir un cliente es NAVEGAR, no cambiar de pestaña: queda en el historial, el
     botón atrás vuelve a la cartera y el enlace se puede compartir. */
  const open = (clientId) => navigate(clientPath(clientId, 'resumen'));

  const act = async (promise) => {
    const result = await promise;
    setError(result?.ok === false ? result.error : null);
  };

  /*
    Invitar: se genera el enlace y se copia. No se abre un diálogo con el token para
    que el entrenador lo seleccione a mano — son 43 caracteres aleatorios y
    transcribirlos es garantizar una errata que luego se manifiesta como «el enlace
    no funciona» sin ninguna pista.

    Si el portapapeles no está disponible (sin HTTPS, o permiso denegado) se muestra
    la URL para poder copiarla a mano, en vez de fallar en silencio.
  */
  const [invite, setInvite] = useState(null);

  const sendInvite = async (client) => {
    const result = await createInvite(client.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    try {
      await navigator.clipboard.writeText(result.url);
      setInvite({ name: client.name, url: result.url, copied: true });
    } catch {
      setInvite({ name: client.name, url: result.url, copied: false });
    }
  };

  if (clients.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Tu cartera está vacía"
        message="En cuanto des de alta a tu primer cliente aparecerá aquí, con lo que le falta por hacer esta semana."
      />
    );
  }

  /* Si ningún cliente tiene un check-in cerrado de verdad, la columna «por
     revisar» está aproximando, y hay que decirlo en lugar de fingir precisión. */
  const approximate = visible.length > 0 && visible.every((r) => !r.review.exact);
  const pending = board.find((c) => c.id === 'to_review')?.rows.length || 0;

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Cartera</h2>
          <p>
            {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
            {pending > 0 && ` · ${pending} por revisar`}
          </p>
        </div>

        <div className="searchbox">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            className="input"
            placeholder="Buscar cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar cliente en la cartera"
          />
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {invite && (
        <Notice tone={invite.copied ? 'success' : 'info'}>
          {invite.copied
            ? `Enlace de invitación de ${invite.name} copiado. Mándaselo por WhatsApp: caduca en 14 días y sirve una vez.`
            : `Enlace de invitación de ${invite.name} (cópialo a mano): ${invite.url}`}
        </Notice>
      )}

      {approximate && (
        <Notice tone="info">
          «Por revisar» se está deduciendo de los pesajes y las fotos de la semana. Al aplicar la
          migración <code>0009_checkins_calendar.sql</code> el cliente entrega su check-in y podrás
          marcarlo como revisado, con lo que la columna pasa a ser exacta.
        </Notice>
      )}

      {showTrainers && (
        <div className="rail" role="group" aria-label="Filtrar por entrenador">
          <button
            type="button"
            className="chip"
            aria-pressed={trainer === 'all'}
            onClick={() => setTrainer('all')}
          >
            Todo el equipo
          </button>
          {teamMembers
            .filter((m) => m.role !== 'viewer')
            .map((member) => (
              <button
                key={member.profileId}
                type="button"
                className="chip"
                aria-pressed={trainer === member.profileId}
                onClick={() => setTrainer(member.profileId)}
              >
                {memberName(member)}
                <span className="chip-count">
                  {rows.filter((r) => r.client.assignedTo === member.profileId).length}
                </span>
              </button>
            ))}
          {rows.some((r) => !r.client.assignedTo) && (
            <button
              type="button"
              className="chip"
              aria-pressed={trainer === 'none'}
              onClick={() => setTrainer('none')}
            >
              Sin asignar
              <span className="chip-count">
                {rows.filter((r) => !r.client.assignedTo).length}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Las cuatro columnas siempre, aunque estén vacías: una columna que
          aparece y desaparece cambia el ancho de las demás y obliga a releer la
          pantalla en cada visita. */}
      <div className="board">
        {board.map((column) => (
          <section className={`board-col is-${column.tone}`} key={column.id}>
            <header className="board-head">
              <span className="k">{column.label}</span>
              <span className="n">{column.rows.length}</span>
            </header>
            <p className="board-hint">{column.hint}</p>

            <div className="board-cards">
              {column.rows.length === 0 ? (
                <p className="board-empty">Nadie aquí.</p>
              ) : (
                column.rows.map((row) => (
                  <FolioCard
                    key={row.client.id}
                    row={row}
                    trainer={showTrainers ? memberById.get(row.client.assignedTo) : null}
                    onOpen={() => open(row.client.id)}
                    onUpdate={(fields) => updateClient(row.client.id, fields)}
                    onInvite={() => sendInvite(row.client)}
                    /* Solo cuando hay un check-in de verdad que marcar: con la
                       aproximación no hay nada que escribir. */
                    onReview={
                      row.review.pending && row.review.id
                        ? () => act(reviewCheckIn(row.review.id))
                        : null
                    }
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
