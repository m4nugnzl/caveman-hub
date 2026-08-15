import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { SETTINGS_SECTIONS } from '@/routes';
import { useActions, useSession } from '@/context/AppContext';

/**
 * Configuración.
 *
 * ── Por qué así ─────────────────────────────────────────────────────────────
 * Antes «Equipo» e «Integraciones» eran dos pestañas más en la barra principal,
 * al mismo nivel que la cartera y los clientes. Quedaban impostadas porque no son
 * lo mismo: no se va a Integraciones a trabajar, se va una vez a dejar algo puesto.
 *
 * Es el patrón de cualquier aplicación con ajustes: una lista de apartados a la
 * izquierda y el contenido a la derecha. En móvil la lista pasa arriba en
 * horizontal, porque una columna de 200 px a 390 px de ancho no deja sitio para el
 * contenido.
 */
export const SettingsLayout = () => {
  const pendientes = useTicketsPendientes();

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Apartados de configuración">
        {SETTINGS_SECTIONS.map(({ path, label, icon: Icon, hint }) => (
          <NavLink key={path} to={`/ajustes/${path}`} className="settings-link">
            <Icon size={17} />
            <span className="who">
              <span className="name">
                {label}
                {/*
                  El contador de lo que espera respuesta.

                  Es la única notificación que NO depende de nada externo: sin
                  correo configurado, sin dominio y sin conexión a terceros, aquí
                  se ve que hay algo pendiente. El correo avisa cuando no estás
                  mirando; esto, cuando sí.
                */}
                {path === 'ayuda' && pendientes > 0 && (
                  <span className="badge badge-warn">{pendientes}</span>
                )}
              </span>
              <span className="sub">{hint}</span>
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="settings-body">
        <Outlet />
      </div>
    </div>
  );
};

/**
 * Cuántos hilos esperan respuesta MÍA.
 *
 * ── Qué cuenta según quién mira ─────────────────────────────────────────────
 * No es el mismo número para los dos lados, y por eso no se cuenta igual:
 *
 *   · Atendiendo la plataforma → los tickets `open`, que son los que están sin
 *     contestar. Es una bandeja de trabajo.
 *   · Siendo entrenador → los `answered`, que son los que TE han contestado y
 *     todavía no has leído. Enseñarle aquí los suyos sin contestar sería
 *     recordarle que está esperando, que no es una tarea suya.
 *
 * Se lee al entrar en Ajustes y no en bucle: es una consulta pequeña, pero
 * repetirla cada pocos segundos por si acaso es tráfico constante para algo que
 * cambia dos veces al día.
 */
const useTicketsPendientes = () => {
  const { isSupport, session } = useSession();
  const { loadTickets } = useActions();
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) {
      setPendientes(0);
      return undefined;
    }

    let cancelado = false;
    (async () => {
      const res = await loadTickets();
      if (cancelado || !res.ok) return;

      const esperado = isSupport ? 'open' : 'answered';
      setPendientes(res.tickets.filter((t) => t.status === esperado).length);
    })();

    return () => {
      cancelado = true;
    };
  }, [loadTickets, isSupport, session]);

  return pendientes;
};
