import { Outlet, useLocation, useParams } from 'react-router-dom';

import { clientPath } from '@/routes';
import { Migas } from '@/components/ui/Migas';

/**
 * El marco de «Perfil» y de su calendario.
 *
 * El calendario de una persona son sus fechas, y sus fechas son del perfil:
 * se abre desde él («Su calendario») y vuelve con una miga. En el perfil mismo
 * no hay nada que pintar por encima.
 */
export const FichaLayout = () => {
  const { clientId } = useParams();
  const { pathname } = useLocation();
  const enCalendario = /\/calendario\/?$/.test(pathname);

  return (
    <div className="stack">
      {enCalendario && <Migas volver={{ to: clientPath(clientId, 'ficha'), label: 'Perfil' }} />}
      <Outlet />
    </div>
  );
};
