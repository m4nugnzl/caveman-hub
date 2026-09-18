import { NavLink, useLocation } from 'react-router-dom';
import { ClipboardCheck, Dumbbell, House, Utensils } from 'lucide-react';

import { isSectionActive } from '@/routes';
import { useAvisos } from '../useAvisos';

/**
 * LA BARRA DEL PULGAR — flotante, en tinta, y con CUATRO destinos:
 * **Hoy · Entreno · Comer · Revisión**.
 *
 * ══ Por qué así (18 sep 2026, frames de Figma `327:8`…) ════════════════════
 *
 * El dueño la dibujó como la barra lateral de la web del entrenador hecha
 * píldora: la misma tinta (`barra-tinta`), suelta del borde y con aire
 * alrededor. Es la pieza que dice que las dos aplicaciones son la misma casa.
 *
 * Y cambia quién está dentro, por cuarta vez (ver `CLIENT_SECTIONS`): vuelve
 * «Revisión», que es de las tres misiones del cliente la que le cuesta dinero
 * si no la hace, y sale «Tú», que se abre desde el avatar de arriba a la derecha
 * de «Hoy». Lo que se consulta de vez en cuando va detrás de una puerta; lo que
 * se hace cada semana, en la barra.
 *
 * ── Los puntos ────────────────────────────────────────────────────────────
 * Dos, y cada uno en su destino: el de «Hoy» es lo que su entrenador ha
 * cambiado o le ha mandado; el de «Revisión», que la semana espera. Es el
 * recordatorio que en la versión de cuatro destinos sin revisión llevaba la
 * fila de «Tú».
 */
const ICONO = {
  inicio: House,
  rutina: Dumbbell,
  dieta: Utensils,
  evolucion: ClipboardCheck,
};

export const BarraDelPulgar = ({ secciones }) => {
  const { pathname } = useLocation();
  const { todo, revisionEspera } = useAvisos();

  return (
    <nav className="tel-pulgar barra-tinta" aria-label="Secciones de mi portal">
      {secciones.map((seccion) => {
        const Icono = ICONO[seccion.path] || House;
        const aqui = isSectionActive(pathname, seccion, '/mi');
        const punto =
          (seccion.path === 'inicio' && todo.length > 0) ||
          (seccion.path === 'evolucion' && Boolean(revisionEspera));
        return (
          <NavLink
            key={seccion.path}
            to={`/mi/${seccion.path}`}
            className={aqui ? 'tel-aqui' : undefined}
            aria-current={aqui ? 'page' : undefined}
          >
            <span className="tel-pulgar-ico">
              <Icono size={20} strokeWidth={aqui ? 2.2 : 1.8} aria-hidden="true" />
              {punto ? <i className="tel-punto" aria-hidden="true" /> : null}
            </span>
            {seccion.corto || seccion.short || seccion.label}
          </NavLink>
        );
      })}
    </nav>
  );
};
