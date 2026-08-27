import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { Gauge, TrendingUp } from 'lucide-react';

import { clientPath } from '@/routes';
import { Migas } from '@/components/ui/Migas';

/**
 * El marco de «Resumen» y de lo que cuelga de él.
 *
 * Para el entrenador, el análisis a fondo (`/analitica`) no es una pestaña ni
 * un chip: se abre desde el resumen y vuelve con una miga. En el resumen mismo
 * no se pinta nada — la pestaña ya dice dónde estás.
 *
 * El portal del cliente conserva su carril de dos chips: se revisa aparte.
 */
export const ProgressLayout = ({ audience = 'coach' }) => {
  const { clientId } = useParams();
  const { pathname } = useLocation();
  const isClient = audience === 'client';

  if (!isClient) {
    const enAnalitica = /\/analitica\/?$/.test(pathname);
    return (
      <div className="stack">
        {enAnalitica && <Migas volver={{ to: clientPath(clientId, 'resumen'), label: 'Resumen' }} />}
        <Outlet />
      </div>
    );
  }

  return (
    <div className="stack">
      <nav className="rail" aria-label="Nivel de detalle">
        <NavLink to="/mi/inicio" className="chip" end>
          <Gauge size={13} />
          Mi progreso
        </NavLink>
        <NavLink to="/mi/analitica" className="chip" end>
          <TrendingUp size={13} />
          Análisis
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
};
