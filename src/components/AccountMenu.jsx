import { useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut, Moon, Settings, Sun } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { useTheme } from '@/lib/useTheme.jsx';
import { useClickOutside } from '@/lib/useClickOutside';
import { SETTINGS_SECTIONS } from '@/routes';

/** Iniciales de la cuenta. Un avatar vacío se ve como un hueco. */
const initials = (value) =>
  String(value || '?')
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('');

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
  const { session, signOut, profileRole } = useApp();
  const { isDark, toggle } = useTheme();
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
