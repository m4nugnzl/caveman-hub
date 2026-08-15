import { useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Eye, LifeBuoy, LogOut, Moon, Settings, ShieldCheck, Sun } from 'lucide-react';

import { useActions, useSession } from '@/context/AppContext';
import { useTour } from '@/components/WelcomeTour';
import { useTheme } from '@/lib/useTheme.jsx';
import { initials } from '@/lib/initials';
import { useClickOutside } from '@/lib/useClickOutside';
import { SETTINGS_SECTIONS } from '@/routes';

/**
 * Menú de cuenta: ajustes, tema y salir.
 *
 * ── Por qué la configuración vive aquí ──────────────────────────────────────
 * Estaba como una pestaña más de la barra principal, al mismo nivel que la cartera
 * y los clientes. Ahí quedaba impostada por dos motivos: no es un sitio donde se
 * trabaja —se entra una vez a dejar algo puesto— y, sobre todo, **no es donde la
 * gente la busca**. En cualquier aplicación (móvil, Claude, Notion, Slack) la
 * configuración cuelga del avatar de la esquina, y ese hábito no se cambia por
 * mucho que la pestaña sea visible.
 *
 * Sacarla de ahí deja el primer nivel en DOS entradas, Cartera y Clientes, que es
 * lo que un entrenador hace todo el día.
 *
 * El interruptor de tema se queda a mano dentro del menú además de en Apariencia:
 * es lo único de configuración que se cambia al vuelo, según la luz de la
 * habitación.
 */
export const AccountMenu = () => {
  const { session, profileRole, isCoach, view } = useSession();
  const { signOut, setViewMode } = useActions();
  const { isDark, toggle } = useTheme();
  const tour = useTour();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useClickOutside(ref, () => setOpen(false), open);

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

      {open && (
        <div className="account-menu" role="menu">
          <div className="account-head">
            <span className="name">{email || 'Sesión activa'}</span>
            <span className="sub">{profileRole === 'coach' ? 'Entrenador' : 'Cliente'}</span>
          </div>

          {profileRole === 'coach' && (
            <>
              <span className="account-label">
                <Settings size={11} /> Configuración
              </span>
              {SETTINGS_SECTIONS.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={`/ajustes/${path}`}
                  className="account-item"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  <Icon size={15} />
                  {label}
                </NavLink>
              ))}
              <hr className="divider" />
            </>
          )}

          {/*
            Previsualizar el portal del cliente.
            ------------------------------------------------------------------
            Estaba en el centro de la cabecera, siempre visible, como un par de
            botones de rol. Ahí sobraba: es una función que se usa un minuto al
            mes —comprobar cómo le queda algo al cliente— y ocupaba el hueco de lo
            que se usa cincuenta veces al día, que es buscar.

            Aquí encaja porque el menú de cuenta es donde vive lo que se DEJA
            PUESTO: el tema, la configuración y ahora la vista. Y como es un modo
            y no una navegación, el texto dice a dónde te lleva, no cómo se llama
            el rol: nadie piensa «quiero el rol cliente», piensa «quiero ver cómo
            lo ve».
          */}
          {isCoach && (
            <>
              <button
                type="button"
                className="account-item"
                role="menuitem"
                onClick={() => {
                  /*
                    Aquí SOLO se cambia el modo. La ruta la traduce el comodín del
                    árbol de destino (`OtherViewFallback`, en `App.jsx`), que ve
                    llegar `/c/<id>/nutricion` y la manda a `/mi/dieta`.

                    Navegar también desde aquí fue el primer intento y no
                    funcionaba: React Router navega dentro de una transición
                    —prioridad baja— mientras que este cambio de modo es una
                    actualización normal, así que el árbol nuevo se pintaba antes
                    con la ruta vieja y su comodín redirigía al inicio ganándole
                    la carrera a la navegación buena.
                  */
                  setViewMode(view === 'coach' ? 'client' : 'coach');
                  setOpen(false);
                }}
              >
                {view === 'coach' ? <Eye size={15} /> : <ShieldCheck size={15} />}
                {view === 'coach' ? 'Ver como lo ve mi cliente' : 'Volver a mi panel'}
              </button>
              <hr className="divider" />
            </>
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
