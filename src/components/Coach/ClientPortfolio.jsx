import { useMemo, useState } from 'react';
import { Check, ChevronRight, MessageCircle, Search, Users } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { PORTFOLIO_FILTERS, THRESHOLDS, buildPortfolio, portfolioSummary } from '@/domain/portfolio';
import { memberName } from '@/domain/team';
import { shortDate, todayISO } from '@/lib/dates';
import { EmptyState, Panel } from '@/components/ui/primitives';

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

const Tile = ({ label, value, sub, active, onClick, color }) => (
  <button type="button" className="tile" aria-pressed={active} onClick={onClick}>
    <span className="k">{label}</span>
    <span className="v" style={color ? { color } : undefined}>
      {value}
    </span>
    <span className="sub">{sub}</span>
  </button>
);

const Fact = ({ label, value, stale }) => (
  <span className="folio-fact">
    <span className="k">{label}</span>
    <span className={`v${stale ? ' is-stale' : ''}`}>{value}</span>
  </span>
);

/**
 * Un cliente, como tarjeta.
 *
 * ── Por qué la tarjeta entera abre la ficha ─────────────────────────────────
 * Un botón «Abrir» a la derecha obliga a apuntar a un blanco de 60 px para hacer
 * lo que se quiere hacer nueve de cada diez veces. La tarjeta completa es el
 * blanco, que además es lo que uno espera de una tarjeta.
 *
 * Se implementa con una capa de clic que la cubre por debajo del contenido, no
 * envolviendo todo en un `<button>`: dentro hay acciones propias (WhatsApp,
 * marcar cobrado) y un botón dentro de otro botón es HTML inválido y una trampa
 * con el teclado. Las zonas no interactivas dejan pasar el clic con
 * `pointer-events: none`, así que se puede pulsar sobre el nombre o sobre las
 * fechas y funciona igual.
 */
const FolioCard = ({ row, trainer, onOpen, onUpdate }) => {
  const { client, alerts, checkIn } = row;
  const severity = alerts.length === 0 ? 'clean' : row.severity;
  const needsPayment = alerts.some((a) => a.id === 'payment_overdue' || a.id === 'payment_pending');
  const needsOnboarding = alerts.some((a) => a.id === 'onboarding');

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
              /* El entrenador responsable solo aparece si hay equipo: en un
                 equipo de uno, escribir su propio nombre en cada tarjeta es
                 ruido. */
              trainer !== null ? (trainer ? memberName(trainer) : 'sin asignar') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <ChevronRight size={17} color="var(--text-tertiary)" aria-hidden="true" />
      </header>

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
        Acciones que resuelven la alerta sin salir de aquí. Son las dos cosas que
        el entrenador hace decenas de veces al mes y que antes exigían entrar en
        la ficha y buscar el interruptor. `stopPropagation` no hace falta: van por
        encima de la capa de clic, así que nunca la activan.
      */}
      <footer className="folio-foot">
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
 * Cartera de clientes.
 *
 * ── Por qué esta pantalla y no otra ─────────────────────────────────────────
 * Es lo que convierte la aplicación de «ficha de un cliente» en «herramienta de
 * gestión». Todo lo demás sirve para TRABAJAR con alguien; esto sirve para
 * decidir CON QUIÉN trabajar hoy, que es la primera decisión de la mañana.
 *
 * Tres reglas de diseño:
 *  · Ordenado por urgencia, no por nombre. Una lista alfabética hay que leerla
 *    entera para encontrar los problemas; aquí están arriba.
 *  · Las cifras de cabecera son los filtros. Ver «4 sin entrenar» y filtrar por
 *    esos cuatro es el mismo gesto, no dos.
 *  · Cada alerta se puede resolver desde aquí cuando tiene sentido (cobrar,
 *    cerrar onboarding, escribir por WhatsApp) o se abre la ficha.
 *
 * No cuesta ni una consulta: la carga inicial ya trae la rutina, el historial y
 * las fotos de todos los clientes del entrenador.
 */
export const ClientPortfolio = ({ onOpenClient }) => {
  const {
    clients,
    workoutData,
    anthropometry,
    progressPhotos,
    updateClient,
    setSelectedClientId,
    team,
    teamMembers,
  } = useApp();

  const [filter, setFilter] = useState('attention');
  const [trainer, setTrainer] = useState('all');
  const [search, setSearch] = useState('');

  const today = todayISO();
  const rows = useMemo(
    () => buildPortfolio({ clients, workoutData, anthropometry, progressPhotos }, today),
    [clients, workoutData, anthropometry, progressPhotos, today]
  );

  /* El eje de entrenador solo existe si hay equipo con más de una persona. Con
     un entrenador único, un filtro «por entrenador» de una sola opción es ruido. */
  const showTrainers = Boolean(team) && teamMembers.length > 1;
  const memberById = useMemo(
    () => new Map(teamMembers.map((m) => [m.profileId, m])),
    [teamMembers]
  );

  const byTrainer = useMemo(() => {
    if (!showTrainers || trainer === 'all') return rows;
    if (trainer === 'none') return rows.filter((r) => !r.client.assignedTo);
    return rows.filter((r) => r.client.assignedTo === trainer);
  }, [rows, showTrainers, trainer]);

  // Las cifras se calculan sobre el entrenador elegido: si el dueño está mirando
  // la cartera de una persona, «3 sin entrenar» tiene que ser de esa persona.
  const summary = portfolioSummary(byTrainer);

  const active = PORTFOLIO_FILTERS.find((f) => f.id === filter) || PORTFOLIO_FILTERS[0];
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return byTrainer.filter(
      (row) =>
        active.test(row) &&
        (!term ||
          row.client.name.toLowerCase().includes(term) ||
          (row.client.email || '').toLowerCase().includes(term))
    );
  }, [byTrainer, active, search]);

  const open = (clientId) => {
    setSelectedClientId(clientId);
    onOpenClient?.(clientId);
  };

  /* Pulsar la cifra activa la desactiva. Sin esto, entrar en un filtro es
     un camino de ida: no había forma de volver a ver la cartera completa. */
  const pick = (id) => setFilter((prev) => (prev === id ? 'all' : id));

  if (clients.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Tu cartera está vacía"
        message="En cuanto des de alta a tu primer cliente aparecerá aquí, con lo que le falta por hacer esta semana."
      />
    );
  }

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Cartera</h2>
          <p>
            {summary.attention === 0
              ? `${summary.total} ${summary.total === 1 ? 'cliente' : 'clientes'}, sin nada urgente`
              : `${summary.attention} de ${summary.total} ${summary.attention === 1 ? 'cliente necesita' : 'clientes necesitan'} algo`}
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

      {/*
        Las cifras SON los filtros: ver «4 sin entrenar» y filtrar por esos cuatro
        es un gesto, no dos. Antes había además una fila de pestañas con los mismos
        cinco filtros debajo, que es lo que hacía la pantalla confusa: dos controles
        para lo mismo, uno encima del otro.
      */}
      <div className="tiles" role="group" aria-label="Filtrar la cartera">
        <Tile
          label="Atención"
          value={summary.attention}
          sub={`de ${summary.total}`}
          color={summary.attention > 0 ? 'var(--warning)' : 'var(--positive)'}
          active={filter === 'attention'}
          onClick={() => pick('attention')}
        />
        <Tile
          label="Sin entrenar"
          value={summary.inactive}
          sub="+7 días"
          color={summary.inactive > 0 ? 'var(--negative)' : undefined}
          active={filter === 'inactive'}
          onClick={() => pick('inactive')}
        />
        <Tile
          label="Check-in"
          value={summary.checkinPending}
          sub="pendiente"
          active={filter === 'checkin'}
          onClick={() => pick('checkin')}
        />
        <Tile
          label="Cobros"
          value={summary.paymentIssues}
          sub="pendientes"
          color={summary.paymentIssues > 0 ? 'var(--negative)' : undefined}
          active={filter === 'payment'}
          onClick={() => pick('payment')}
        />
        <Tile
          label="Al día"
          value={summary.clean}
          sub="sin avisos"
          color="var(--positive)"
          active={filter === 'ok'}
          onClick={() => pick('ok')}
        />
      </div>

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
                <span className="t-xs" style={{ opacity: 0.75 }}>
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
              <span className="t-xs" style={{ opacity: 0.75 }}>
                {rows.filter((r) => !r.client.assignedTo).length}
              </span>
            </button>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <Panel className="col gap-2">
          <span className="section-title">
            {search.trim() ? 'Ningún cliente coincide' : `Nada en «${active.label.toLowerCase()}»`}
          </span>
          <p className="t-sm t-secondary">
            {search.trim()
              ? 'Prueba con otro nombre.'
              : 'Vuelve a pulsar la cifra para ver la cartera completa.'}
          </p>
        </Panel>
      ) : (
        <div className="folio-grid">
          {visible.map((row) => (
            <FolioCard
              key={row.client.id}
              row={row}
              trainer={showTrainers ? memberById.get(row.client.assignedTo) : null}
              onOpen={() => open(row.client.id)}
              onUpdate={(fields) => updateClient(row.client.id, fields)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
