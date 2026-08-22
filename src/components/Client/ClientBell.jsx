import { useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useData, useSession } from '@/context/AppContext';
import { clientProtocol } from '@/domain/protocol';
import { pendingTasks, unseenUpdates } from '@/domain/updates';
import { todayISO } from '@/lib/dates';
import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';
import { useEsTelefono } from '@/lib/useMediaQuery';
import { Modal } from '@/components/ui/Modal';

/**
 * La campana: lo que ha cambiado y lo que te falta, sin ir a ninguna parte.
 *
 * ══ Por qué una campana y no una pantalla ══════════════════════════════════
 *
 * Esto era «Hoy», una sección entera del portal. Y una sección para avisos tiene
 * un problema que no se arregla mejorándola: **hay que acordarse de entrar**, y
 * la mayoría de los días no hay nada, así que se deja de entrar. El día que sí
 * hay algo —la respuesta de su entrenador— ya nadie la abre.
 *
 * En un móvil nadie va a una pantalla a comprobar si tiene notificaciones: se las
 * encuentra. Aquí igual. La campana solo aparece cuando tiene algo que decir, y
 * el punto se ve desde cualquier sección sin cambiar de sitio.
 *
 * ── Sigue estando también en su inicio ──────────────────────────────────────
 * Porque una campana se puede no ver, y porque el inicio es donde aterriza. Son
 * la misma lista en los dos sitios donde se mira, igual que las pestañas de
 * arriba y la barra de abajo son la misma navegación.
 *
 * ── Y por qué NO marca «visto» al abrirla ───────────────────────────────────
 * Porque el sello lo lleva `ClientUpdates`, que es quien pinta la lista en el
 * inicio: dos sitios sellando lo mismo acabarían dándose por vistos el uno al
 * otro. Aquí solo se mira.
 */
export const ClientBell = () => {
  const { profileRole } = useSession();
  const { clients, anthropometry, activeClient } = useData();
  const [open, setOpen] = useState(false);
  const esTelefono = useEsTelefono();
  const ref = useRef(null);

  useClickOutside(ref, () => setOpen(false), open && !esTelefono);
  const menu = useDismissable(open && !esTelefono);

  const preferences = activeClient?.preferences;
  const history = useMemo(
    () => anthropometry?.[activeClient?.id]?.history || [],
    [anthropometry, activeClient?.id]
  );

  const novedades = useMemo(() => unseenUpdates(preferences), [preferences]);
  const pendientes = useMemo(
    () =>
      activeClient
        ? pendingTasks({ history, protocol: clientProtocol(preferences), today: todayISO() })
        : [],
    [activeClient, history, preferences]
  );

  /* Solo para el cliente: al entrenador no le avisa de sus propias tareas, que
     para eso tiene «Hoy» y la cartera. */
  if (profileRole === 'coach' || !activeClient || clients.length === 0) return null;

  const todo = [...novedades, ...pendientes];
  if (todo.length === 0) return null;

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="account-btn bell"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${todo.length} ${todo.length === 1 ? 'aviso' : 'avisos'}`}
        title="Avisos"
      >
        <Bell size={17} />
        <span className="bell-dot" aria-hidden="true">
          {todo.length}
        </span>
      </button>

      {/*
        En el teléfono los avisos son una HOJA, no un menú colgado de la
        esquina: el menú de cuenta es geometría de ratón —columna estrecha
        anclada arriba— y esta es la superficie de notificaciones que un
        cliente abre con el pulgar. El mismo reparto que el selector de
        cliente del entrenador.
      */}
      {esTelefono && (
        <Modal open={open} title="Avisos" onClose={() => setOpen(false)}>
          <div className="col gap-2">
            <span className="t-xs t-tertiary">
              {novedades.length > 0 &&
                `${novedades.length} ${novedades.length === 1 ? 'novedad' : 'novedades'}`}
              {novedades.length > 0 && pendientes.length > 0 && ' · '}
              {pendientes.length > 0 && `${pendientes.length} por hacer`}
            </span>
            {todo.map((item) => (
              <Link
                key={item.id}
                to={item.href}
                className="account-item"
                onClick={() => setOpen(false)}
              >
                <span className="col" style={{ gap: 1, minWidth: 0 }}>
                  <span>{item.label}</span>
                  <span className="t-2xs t-tertiary">{item.hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </Modal>
      )}

      {menu.mounted && !esTelefono && (
        <div
          ref={menu.ref}
          className="account-menu"
          data-state={menu.closing ? 'closing' : 'open'}
          role="menu"
        >
          <div className="account-head">
            <span className="name">Avisos</span>
            <span className="sub">
              {novedades.length > 0 && `${novedades.length} ${novedades.length === 1 ? 'novedad' : 'novedades'}`}
              {novedades.length > 0 && pendientes.length > 0 && ' · '}
              {pendientes.length > 0 && `${pendientes.length} por hacer`}
            </span>
          </div>

          {todo.map((item) => (
            <Link
              key={item.id}
              to={item.href}
              role="menuitem"
              className="account-item"
              onClick={() => setOpen(false)}
            >
              <span className="col" style={{ gap: 1, minWidth: 0 }}>
                <span>{item.label}</span>
                <span className="t-2xs t-tertiary">{item.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
