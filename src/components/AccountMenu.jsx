import { useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LifeBuoy, LogOut, Moon, Settings, Stethoscope, Sun } from 'lucide-react';

import { useSession, useActions } from '@/context/AppContext';
import { useEsAdminPlataforma } from '@/context/useRadiografia';
import { useTour } from '@/components/WelcomeTour';
import { useTheme } from '@/lib/useTheme.jsx';
import { initials } from '@/lib/initials';
import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';

/**
 * Menú de cuenta: quién eres, la puerta de ajustes, el tema y salir.
 *
 * ── Qué se ha ido, y por qué ────────────────────────────────────────────────
 * Este menú llegó a ser el ÍNDICE de la configuración —las siete secciones de
 * ajustes, una a una— y además el interruptor de «ver como lo ve mi cliente».
 * Las dos cosas quedaban ocultas: nadie imagina la previsualización de un
 * cliente colgando del propio avatar, ni un índice entero detrás de un menú.
 *
 * Ahora cada cosa está donde se busca: ajustes tiene su puerta a la vista (el
 * pie de la barra lateral en escritorio; aquí queda el ATAJO, no el índice), y
 * la previsualización vive con el cliente al que pertenece (`CoachLayout`). El
 * menú vuelve a ser lo que es en cualquier aplicación: identidad, tema y salir.
 *
 * El interruptor de tema se queda a mano dentro del menú además de en
 * Apariencia: es lo único de configuración que se cambia al vuelo, según la luz
 * de la habitación.
 */
export const AccountMenu = () => {
  const { session, profileRole, isCoach, view } = useSession();
  const { signOut } = useActions();
  const { isDark, toggle } = useTheme();
  const esAdmin = useEsAdminPlataforma();
  const tour = useTour();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useClickOutside(ref, () => setOpen(false), open);
  const menu = useDismissable(open);

  const email = session?.user?.email || '';

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="account-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        title="Cuenta y configuración"
      >
        <span className="account-avatar" aria-hidden="true">
          {initials(email)}
        </span>
      </button>

      {menu.mounted && (
        <div
          ref={menu.ref}
          className="account-menu"
          data-state={menu.closing ? 'closing' : 'open'}
          role="menu"
        >
          <div className="account-head">
            <span className="name">{email || 'Sesión activa'}</span>
            <span className="sub">{profileRole === 'coach' ? 'Entrenador' : 'Cliente'}</span>
          </div>

          {/*
            La puerta de ajustes, SOLO donde no hay barra lateral: en escritorio
            la puerta es el pie de la barra, y dos puertas iguales a un palmo
            confunden — el CSS esconde esta con `body:has(.sidebar)` (ver EL
            CHASIS). Las siete secciones vivieron aquí enumeradas y era esconder
            la configuración detrás de un menú. La condición es la misma que usa
            la paleta (`isCoach && view === 'coach'`): en modo preview este menú
            enseña lo del portal que se está mirando, no las puertas del panel.
          */}
          {isCoach && view === 'coach' && (
            <>
              <NavLink
                to="/ajustes"
                className="account-item account-ajustes"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <Settings size={15} />
                Ajustes
              </NavLink>
              <hr className="divider account-ajustes" />
            </>
          )}

          {/*
            La radiografía, y solo para quien administra la plataforma.

            Va AQUÍ y no en el carril primario a propósito: ese carril es el
            trabajo de un entrenador —lo que ha pasado, lo que falta, cuánto y
            qué viene— y esto no es su trabajo, es el de quien lleva el producto.
            Una quinta entrada permanente que solo puede abrir una persona le
            quitaría sitio a las cuatro que abre todo el mundo cada día.

            `esAdmin` decide si se PINTA, no si se puede ver: la puerta de verdad
            está en la función edge, que lee `platform_admins` con la clave de
            servicio (ver `useRadiografia`). Quitar este `if` con la consola
            abierta no enseña un solo dato.
          */}
          {esAdmin && (
            <NavLink
              to="/plataforma"
              className="account-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <Stethoscope size={15} />
              Radiografía
            </NavLink>
          )}

          {/*
            La bienvenida sale sola la primera vez y luego no vuelve. Sin una
            forma de recuperarla, quien la cerró sin leerla —o quien la vio hace
            tres meses— no tiene dónde mirar cómo se hacía lo primero. Aquí, junto
            al resto de lo que se consulta de vez en cuando.
          */}
          <button
            type="button"
            className="account-item"
            role="menuitem"
            onClick={() => {
              tour.setOpen(true);
              setOpen(false);
            }}
          >
            <LifeBuoy size={15} /> Ver el tutorial
          </button>

          <button
            type="button"
            className="account-item"
            role="menuitem"
            onClick={() => {
              toggle();
              setOpen(false);
            }}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
            {isDark ? 'Tema claro' : 'Tema oscuro'}
          </button>

          <button
            type="button"
            className="account-item is-danger"
            role="menuitem"
            onClick={signOut}
          >
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
};
