import { NavLink, Outlet } from 'react-router-dom';

import { SETTINGS_SECTIONS } from '@/routes';

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
export const SettingsLayout = () => (
  <div className="settings">
    <nav className="settings-nav" aria-label="Apartados de configuración">
      {SETTINGS_SECTIONS.map(({ path, label, icon: Icon, hint }) => (
        <NavLink key={path} to={`/ajustes/${path}`} className="settings-link">
          <Icon size={17} />
          <span className="who">
            <span className="name">{label}</span>
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
