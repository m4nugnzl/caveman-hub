import { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, UserPlus } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { dayMonthMaybeYear } from '@/lib/dates';
import {
  COACH_CLIENT,
  COACH_HOME,
  COACH_PRIMARY,
  SETTINGS_SECTIONS,
  clientPath,
  isSectionActive,
  sameSectionFor,
} from '@/routes';
import { EmptyState } from '@/components/ui/primitives';
import { BottomNav } from '@/components/ui/BottomNav';
import { ClientSwitcher } from './ClientSwitcher';
import { GettingStarted } from './GettingStarted';

/**
 * Marco del panel del entrenador: navegación de dos niveles y contenido.
 *
 * ── El problema que resuelve la estructura ──────────────────────────────────
 * Antes había once pestañas en una sola fila, mezclando planos distintos:
 * «Cartera» habla de todos los clientes, «Rutina» de uno, e «Integraciones» de
 * ninguno. Once opciones planas obligan a leerlas todas cada vez y en el móvil se
 * salían de la pantalla.
 *
 * Ahora la barra de arriba tiene DOS entradas —«Hoy» y «Clientes»— y el segundo
 * nivel aparece solo cuando estás dentro de algo: las secciones del cliente, o las
 * de ajustes. Nunca los dos a la vez. La configuración cuelga del avatar, que es
 * donde la busca todo el mundo (ver `AccountMenu`).
 *
 * El cliente activo lo manda la URL. El contexto lo sincroniza desde la ruta, no al
 * revés: una sola fuente de verdad, la de arriba.
 */
export const CoachLayout = () => {
  const { clients, selectedClientId, setSelectedClientId, activeClient } = useApp();
  const { clientId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const hasClients = clients.length > 0;
  const onClient = Boolean(clientId);
  const onSettings = location.pathname.startsWith('/ajustes');

  /*
    La ruta manda sobre el contexto. `clientId` puede venir de una URL pegada, de un
    marcador o del botón atrás, y en los tres casos el resto de la aplicación tiene
    que estar mirando a ese cliente.
  */
  useEffect(() => {
    if (clientId && clientId !== selectedClientId) setSelectedClientId(clientId);
  }, [clientId, selectedClientId, setSelectedClientId]);

  /*
    Un id que no existe —cliente borrado, enlace viejo, URL mal copiada— no puede
    dejar la pantalla en blanco leyendo `activeClient.id` sobre undefined, que es
    justo lo que tumbaba la aplicación antes.
  */
  if (onClient && hasClients && !clients.some((c) => c.id === clientId)) {
    return <Navigate to="/clientes" replace />;
  }
  if (onClient && !hasClients) return <Navigate to="/clientes" replace />;

  return (
    <div className="layout">
      {/* ── Nivel 1: dos entradas, siempre ──────────────────────────────── */}
      <nav className="tabs" aria-label="Secciones principales">
        {COACH_PRIMARY.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className="tab"
            /* «Clientes» no debe marcarse por estar dentro de un cliente. */
            end
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* ── Nivel 2a: dentro de un cliente ──────────────────────────────── */}
      {onClient && activeClient && (
        <div className="subnav">
          <div className="subnav-head">
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => navigate('/clientes')}
              aria-label="Volver a la lista de clientes"
              title="Volver a la lista de clientes"
            >
              <ArrowLeft size={16} />
            </button>

            <ClientSwitcher
              /*
                La cartera viva, más el cliente abierto si resulta estar
                archivado. Sin ese añadido, entrar por enlace directo a la ficha
                de alguien archivado enseñaría en el selector el nombre de OTRA
                persona —el primero de la lista— mientras debajo se ve la ficha
                del archivado. Aparecer no le desarchiva: sigue fuera de la
                cartera en cuanto se sale de su ficha.
              */
              clients={
                activeClient && !clients.some((c) => c.id === activeClient.id)
                  ? [activeClient, ...clients]
                  : clients
              }
              selectedClientId={selectedClientId}
              /* Cambiar de cliente conserva la sección: si estabas en su
                 nutrición, pasas a la nutrición del otro. */
              onSelect={(id) => navigate(sameSectionFor(location.pathname, id))}
            />

            <div className="row gap-2 wrap">
              <span
                className={`badge ${activeClient.paymentStatus === 'paid' ? 'badge-ok' : 'badge-bad'}`}
              >
                {activeClient.paymentStatus === 'paid' ? 'Pago al día' : 'Pago pendiente'}
              </span>
              {activeClient.startDate && (
                <span className="badge">Desde {dayMonthMaybeYear(activeClient.startDate)}</span>
              )}
            </div>
          </div>

          {/*
            La marca de «estás aquí» NO la decide `NavLink` por prefijo de URL.
            Desde que una sección tiene dos niveles —`revision` y
            `revision/fotos`, `resumen` y `analitica`— el prefijo se queda corto y
            bajar al segundo nivel dejaba el carril entero sin marcar. Los niveles
            se declaran en `also`, en `routes.jsx`.
          */}
          <nav className="rail" aria-label={`Secciones de ${activeClient.name}`}>
            {COACH_CLIENT.map((seccion) => {
              const { path, label, icon: Icon } = seccion;
              const activa = isSectionActive(location.pathname, seccion, '/c/[^/]+');
              return (
                <NavLink
                  key={path}
                  to={clientPath(clientId, path)}
                  className={`chip${activa ? ' active' : ''}`}
                  aria-current={activa ? 'page' : undefined}
                >
                  <Icon size={13} />
                  {label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      )}

      {/* ── Nivel 2b: dentro de ajustes ─────────────────────────────────── */}
      {onSettings && (
        <div className="subnav">
          <nav className="rail" aria-label="Secciones de ajustes">
            {SETTINGS_SECTIONS.map(({ path, label, icon: Icon, hint }) => (
              <NavLink key={path} to={`/ajustes/${path}`} className="chip" title={hint}>
                <Icon size={13} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* «Hoy» es la pantalla de entrada, así que es la primera que ve un
          entrenador recién registrado y no puede limitarse a estar vacía.
          «Clientes» ya trae su propio vacío —con el formulario de alta dentro—,
          por eso aquí solo se cubre la de inicio.

          La guía va delante del vacío y no dentro: sin clientes explica por dónde
          se empieza, y con clientes sigue contestando la pregunta que la trajo
          —dónde se hace la rutina— hasta que se cierra. */}
      {!hasClients && location.pathname === COACH_HOME ? (
        <div className="stack">
          <GettingStarted />
          <EmptyState
            icon={UserPlus}
            title="Todavía no tienes clientes"
            message="Da de alta a tu primer atleta en «Clientes» y aquí aparecerá lo que le falta por hacer cada semana."
            action={
              <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate('/clientes')}>
                <UserPlus size={17} /> Dar de alta un cliente
              </button>
            }
          />
        </div>
      ) : (
        <Outlet />
      )}

      {/*
        En móvil, la barra inferior lleva el PRIMER nivel —Hoy, Cartera,
        Clientes—, que es el que las pestañas de arriba dejan de mostrar en cuanto
        la pantalla es estrecha. El segundo nivel (las secciones del cliente, las
        de ajustes) se queda en su carril: son dos planos distintos y ponerlos los
        dos abajo volvería a mezclarlos, que es justo lo que esta navegación vino
        a arreglar.
      */}
      <BottomNav
        label="Secciones principales"
        items={COACH_PRIMARY.map(({ path, label, icon }) => ({ to: path, label, icon }))}
      />
    </div>
  );
};
