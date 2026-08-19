import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Layers, Plus, Search, Send, UserPlus, X } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { traeALaVista } from '@/lib/motion';
import { buildPortfolio } from '@/domain/portfolio';
import { memberName } from '@/domain/team';
import { clientPath } from '@/routes';
import { todayISO } from '@/lib/dates';
import { initials } from '@/lib/initials';
import { EmptyState, Notice, PageHead, Panel, SectionTitle } from '@/components/ui/primitives';
import { ArchivedClients } from './ArchivedClients';
import { NewClientForm } from './NewClientForm';
import { inviteMessage, useInvite } from './useInvite';

/**
 * Un cliente dentro de una tarea.
 *
 * ── Por qué una fila y no una ficha ─────────────────────────────────────────
 * La ficha del tablero contaba cuatro datos de cada cliente —entreno, peso,
 * check-in, cobro— porque el tablero no decía qué hacer y había que deducirlo
 * leyendo. Aquí el grupo YA dice qué hay que hacer, así que la fila solo tiene
 * que decir quién es y por qué está en esta lista. Cuatro cifras por persona,
 * repetidas en cinco grupos, serían la pantalla ilegible que había.
 *
 * ── La fila entera abre al cliente ──────────────────────────────────────────
 * Con una capa de clic por debajo del contenido, no envolviendo todo en un
 * `<button>`: dentro hay una acción propia, y un botón dentro de otro es HTML
 * inválido y una trampa con el teclado.
 */
const TaskRow = ({ row, trainer, onOpen, action }) => {
  const { client } = row;

  return (
    <div className="task-row">
      <button
        type="button"
        className="task-hit"
        onClick={onOpen}
        aria-label={`Abrir la ficha de ${client.name}`}
      />

      <span className="mark" aria-hidden="true">
        {initials(client.name)}
      </span>

      <span className="who">
        <span className="name">{client.name}</span>
        <span className="sub">
          {[
            row.why,
            /* El entrenador responsable solo aparece si hay equipo: en un equipo
               de uno, escribir su propio nombre en cada fila es ruido. */
            trainer !== null ? (trainer ? memberName(trainer) : 'sin asignar') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>

      {/* La acción que cierra ESTA tarea. Va por encima de la capa de clic, así
          que pulsarla no abre al cliente. */}
      {action && (
        <button type="button" className="chip" onClick={action.onClick} title={action.title}>
          <action.icon size={12} /> {action.label}
        </button>
      )}

      <ChevronRight size={15} className="chevron" aria-hidden="true" />
    </div>
  );
};

/**
 * Clientes: la única pantalla que habla de toda la cartera.
 *
 * ══ Por qué esto era DOS pantallas y ya no ══════════════════════════════════
 *
 * Había «Cartera» —este tablero— y «Clientes» —el alta, invitar, archivar y los
 * datos—. Dos entradas del menú principal que listaban a las mismas personas y
 * hacían cosas distintas al pulsarlas: en una entrabas al cliente, en la otra se
 * desplegaba administración.
 *
 * Eso no era una molestia estética. Un entrenador nuevo crea su primer cliente en
 * «Clientes», que es donde está el botón de alta; pulsa sobre él esperando entrar;
 * y lo que se abre es un panel de exportar datos. La pregunta que llegó a soporte
 * fue «¿dónde hago la rutina?» — y la respuesta era «en la OTRA pantalla que
 * también lista clientes».
 *
 * Ahora hay una: se da de alta aquí, se ve el estado aquí, y el clic entra en la
 * persona. Todo lo de un cliente —incluida su ficha administrativa— cuelga de
 * `/c/:id/…`, que es donde ya vivían su rutina y su nutrición.
 *
 * ══ Y por qué aquí ya no hay tareas ════════════════════════════════════════
 *
 * Hubo un tablero de cuatro columnas, y después una bandeja de tareas. Las dos
 * contestaban «¿qué hago ahora?» — que es la pregunta de «Hoy», la pantalla con
 * la que se abre el día, y no la de esta.
 *
 * Tenerlas en los dos sitios obligaba a mirar los dos por si acaso, y encima no
 * coincidían: «Hoy» calculaba su propia bandeja con tres tipos de aviso y aquí
 * había siete tareas. Ahora el reparto vive en `domain/portfolio.js`, lo enseña
 * «Hoy» a través de `TaskInbox`, y esto es lo que su nombre dice: tus clientes,
 * en orden de urgencia, con lo que le pasa a cada uno al lado.
 */
export const ClientPortfolio = () => {
  const {
    clients,
    training,
    anthropometry,
    progressPhotos,
    checkIns,
    addClient,
    team,
    teamMembers,
  } = useApp();
  const navigate = useNavigate();

  const [trainer, setTrainer] = useState('all');
  const [search, setSearch] = useState('');
  const [alta, setAlta] = useState(false);
  /* El que se acaba de crear, para poder seguir con él sin ir a buscarlo. */
  const [recien, setRecien] = useState(null);

  const today = todayISO();
  const rows = useMemo(
    () => buildPortfolio({ clients, training, anthropometry, progressPhotos, checkIns }, today),
    [clients, training, anthropometry, progressPhotos, checkIns, today]
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

  /* Abrir un cliente es NAVEGAR, no cambiar de pestaña: queda en el historial, el
     botón atrás vuelve a la cartera y el enlace se puede compartir. */
  const open = (clientId) => navigate(clientPath(clientId, 'resumen'));

  /* La lógica de invitar vive en `useInvite`: la comparten esta pantalla y la
     ficha del cliente, y las tres cosas que hay que hacer bien —pedir el token,
     copiarlo y tener plan si el portapapeles falla— son las mismas en las dos. */
  const { result: invite, busy: invitando, send: invitar } = useInvite();

  /*
    ══ Dar de alta e invitar son el mismo gesto ═══════════════════════════════

    Eran dos viajes. Se creaba al cliente, el formulario se cerraba y no pasaba
    nada más: para invitarle había que encontrarlo en la lista, entrar, llegar
    hasta «Ficha» —la última del carril de siete— y bajar a «Acceso y baja». Seis
    pasos para lo que la propia bienvenida enseña como los pasos 1 y 3.

    Y es un camino que no se puede saltar: hasta que no le llega el enlace, el
    cliente no puede entrar, así que la mitad de la aplicación se queda sin usar
    sin que nada avise.

    Ahora el alta deja aquí mismo lo que viene después, con los dos botones
    puestos. Sigue estando en su ficha para quien vuelva más tarde.
  */
  const crear = async (datos) => {
    const res = await addClient(datos);
    if (res?.ok) setRecien(res.client);
    return res;
  };

  /* El aviso de la invitación aparece arriba; sin esto, quien la pide desde la
     parte de abajo de una lista larga no llega a verlo nunca. */
  const noticeRef = useRef(null);
  useEffect(() => {
    if (invite) traeALaVista(noticeRef.current, { block: 'center', behavior: 'smooth' });
  }, [invite]);

  /* Sin clientes no hay tablero que enseñar, pero sí hay algo que hacer — y el
     botón para hacerlo tiene que estar aquí. Antes esta pantalla se limitaba a
     decir que estaba vacía y mandaba a buscar el alta a otro sitio. */
  if (clients.length === 0) {
    return (
      <div className="stack">
        {alta && <NewClientForm onCreate={crear} onCancel={() => setAlta(false)} />}
        {!alta && (
          <EmptyState
            icon={UserPlus}
            title="Empieza dando de alta a tu primer cliente"
            message="En cuanto exista podrás programarle la rutina, su plan nutricional y seguir su evolución. Aquí verás lo que le falta cada semana."
            action={
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setAlta(true)}>
                <Plus size={17} /> Nuevo cliente
              </button>
            }
          />
        )}
        <ArchivedClients />
      </div>
    );
  }

  /* Si ningún cliente tiene un check-in cerrado de verdad, «responder check-ins»
     está aproximando, y hay que decirlo en lugar de fingir precisión. */
  const approximate = visible.length > 0 && visible.every((r) => !r.review.exact);

  /* Cuántos necesitan algo. Las TAREAS están en «Hoy»; aquí solo se dice cuánta
     gente tiene algo abierto, para no obligar a contar la lista. */
  const tareas = visible.filter((r) => r.alerts.length > 0).length;

  return (
    <div className="stack">
      <PageHead
        title="Clientes"
        sub={`${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'} · ${
          tareas === 0
            ? 'nada pendiente'
            : `${tareas} ${tareas === 1 ? 'cosa por hacer' : 'cosas por hacer'}`
        }`}
        action={
          <div className="row wrap gap-3">
            <div className="searchbox">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                className="input"
                placeholder="Buscar cliente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar cliente"
              />
            </div>

            {/* UNA acción primaria por pantalla. La búsqueda no compite: es un
                campo, no un botón. */}
            <button type="button" className="btn btn-primary" onClick={() => setAlta((v) => !v)}>
              <Plus size={15} /> Nuevo cliente
            </button>
          </div>
        }
      />

      {alta && <NewClientForm onCreate={crear} onCancel={() => setAlta(false)} />}

      {/*
        Lo que viene DESPUÉS de crear a alguien, en el sitio donde se acaba de
        crear. Las dos cosas que hay que hacerle a un cliente nuevo, y ninguna
        más: darle acceso y programarle. Se cierra a mano porque hasta que no se
        hacen las dos sigue haciendo falta.
      */}
      {recien && (
        <Panel className="col gap-3">
          <div className="row between wrap gap-2">
            <SectionTitle icon={UserPlus}>{recien.name} ya está en tu cartera</SectionTitle>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => setRecien(null)}
              aria-label="Ocultar los siguientes pasos"
              title="Ocultar"
            >
              <X size={15} />
            </button>
          </div>

          <p className="t-sm t-secondary">
            Mándale su enlace de acceso —hasta que no lo tenga no puede entrar ni apuntar nada— y
            prográmale la primera semana.
          </p>

          <div className="row gap-2 wrap">
            <button
              type="button"
              className="btn btn-primary"
              disabled={invitando}
              onClick={() => invitar(recien)}
            >
              <Send size={15} /> {invitando ? 'Generando…' : 'Copiar su enlace de acceso'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(clientPath(recien.id, 'rutina'))}
            >
              <Layers size={15} /> Programarle la rutina
            </button>
          </div>
        </Panel>
      )}

      {/*
        ── Por qué esto se lleva la vista ─────────────────────────────────────
        El aviso de la invitación sale aquí arriba. Quien la pide desde la parte
        de abajo de una lista larga no vería nada — y el síntoma que reporta es
        «le doy y no hace nada», aunque el mensaje esté escrito dos pantallas más
        arriba. Se paga trayendo la vista hasta él.
      */}
      {invite && (
        <div ref={noticeRef}>
          {invite.ok ? (
            <Notice tone={invite.copied ? 'success' : 'info'}>{inviteMessage(invite)}</Notice>
          ) : (
            <Notice tone="error">{invite.error}</Notice>
          )}
        </div>
      )}

      {/* Se dice que la cifra es aproximada, no CÓMO se arregla: quien lee esto
          ha pagado por la aplicación y no puede aplicar nada en su base de
          datos. El detalle técnico va al registro del navegador y a soporte. */}
      {approximate && (
        <Notice tone="info">
          «Por revisar» se está deduciendo de los pesajes y las fotos de cada semana, así que es una
          aproximación. La entrega de check-ins todavía no está activa en tu cuenta; escríbenos desde
          Ajustes → Ayuda y la activamos.
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

      {/*
        ── La lista, y solo la lista ─────────────────────────────────────────
        Aquí hubo un tablero de cuatro columnas, y después la bandeja de tareas.
        Las dos contestaban «¿qué hago ahora?», que es la pregunta de «Hoy» —la
        pantalla con la que se abre el día— y no la de esta.

        Tener las tareas en los dos sitios obligaba a mirar las dos por si acaso,
        y las dos no coincidían. Ahora las tareas viven en «Hoy» y esto es lo que
        su nombre dice: tus clientes, en orden de urgencia, con lo que le pasa a
        cada uno escrito al lado. Se busca a alguien y se entra.
      */}
      <div className="task-rows">
        {visible.map((row) => (
          <TaskRow
            key={row.client.id}
            row={{ ...row, why: row.alerts[0]?.label || "Al día" }}
            trainer={showTrainers ? memberById.get(row.client.assignedTo) : null}
            onOpen={() => open(row.client.id)}
            action={null}
          />
        ))}
      </div>

      {visible.length === 0 && (

        <Panel>
          <p className="t-sm t-secondary">Ningún cliente coincide con la búsqueda.</p>
        </Panel>
      )}

      <ArchivedClients />
    </div>
  );
};
