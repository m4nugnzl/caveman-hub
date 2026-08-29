import { useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronsUpDown, LifeBuoy, LogOut, Moon, Settings, Stethoscope, Sun } from 'lucide-react';

import { useSession, useActions } from '@/context/AppContext';
import { useEsAdminPlataforma } from '@/context/useRadiografia';
import { useTour } from '@/components/WelcomeTour';
import { useTheme } from '@/lib/useTheme.jsx';
import { Avatar } from '@/components/ui/Avatar';
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
/**
 * @param variante  `avatar` (por defecto) es el círculo de la esquina, que es
 *   lo que pide una cabecera. `fila` es la pieza del pie de la barra lateral:
 *   una fila del ancho de la barra con quién eres escrito, porque ahí hay sitio
 *   y porque un círculo suelto al fondo de una columna no se lee como un botón
 *   —de hecho no se leía: pulsarlo no parecía hacer nada—.
 */
export const AccountMenu = ({ variante = 'avatar' }) => {
  const { session, profileRole, profileName, isCoach, view } = useSession();
  const { signOut } = useActions();
  const { isDark, toggle } = useTheme();
  const esAdmin = useEsAdminPlataforma();
  const tour = useTour();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useClickOutside(ref, () => setOpen(false), open);
  const menu = useDismissable(open);

  const email = session?.user?.email || '';
  /* Tu nombre si lo hay y, si no, el correo: es la identidad que sí tenemos. */
  const quien = profileName || email || 'Sesión activa';
  const rol = profileRole === 'coach' ? 'Entrenador' : 'Cliente';
  const fila = variante === 'fila';

  return (
    <div className={`account${fila ? ' is-fila' : ''}`} ref={ref}>
      <button
        type="button"
        className={fila ? 'account-fila' : 'account-btn'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        title="Cuenta y configuración"
      >
        <Avatar name={profileName || email} size="sm" className="account-avatar is-round" />
        {fila && (
          <>
            <span className="account-fila-quien">
              <span className="nm">{quien}</span>
              <span className="rol">{rol}</span>
            </span>
            <ChevronsUpDown size={14} aria-hidden="true" />
          </>
        )}
      </button>

      {menu.mounted && (
        <div
          ref={menu.ref}
          className="account-menu"
          data-state={menu.closing ? 'closing' : 'open'}
          role="menu"
        >
          <div className="account-head">
            <span className="name">{quien}</span>
            {/* Con nombre, el correo dice de qué cuenta se habla —hay quien
                tiene dos—; sin él, el nombre YA es el correo y repetirlo sobra. */}
            <span className="sub">{profileName && email ? `${rol} · ${email}` : rol}</span>
          </div>

          {/*
            La puerta de ajustes.
            ──────────────────────────────────────────────────────────────────
            Estuvo aquí, luego se sacó al pie de la barra lateral —y este ítem
            se escondía por CSS en escritorio para no tener dos puertas iguales
            a un palmo—. El resultado en la barra eran dos filas seguidas:
            «Ajustes» y, debajo, un círculo con tus iniciales que no llevaba a
            ninguna parte (su menú se abría hacia abajo, fuera de la pantalla, y
            encima la barra lo recortaba). Dos piezas para una sola idea, y una
            de ellas rota.

            Vuelve a estar donde se busca la configuración de uno: dentro de tu
            nombre, con el tema y el cierre de sesión. La condición es la misma
            que usa la paleta (`isCoach && view === 'coach'`): en modo preview
            este menú enseña lo del portal que se está mirando, no las puertas
            del panel.
          */}
          {isCoach && view === 'coach' && (
            <>
              <NavLink
                to="/ajustes"
                className="account-item"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <Settings size={15} />
                Ajustes
              </NavLink>
              <hr className="divider" />
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
