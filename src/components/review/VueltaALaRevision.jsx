import { ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { clientPath } from '@/routes';

/**
 * El camino de vuelta cuando has salido de una revisión a tocarle el plan.
 *
 * ══ El agujero que tapa ════════════════════════════════════════════════════
 *
 * Revisando a alguien decides subirle una serie, pulsas «El entreno», y
 * apareces en el editor de microciclos. Hasta aquí bien: rehacer una semana no
 * cabe en una pantalla de revisión y sacarte de ella es lo honesto. El problema
 * era el regreso: una vez ahí, nada decía de dónde venías ni cómo volver, y con
 * seis secciones en el carril había que acordarse de que era «Revisión».
 *
 * Eso es exactamente lo que la barra flotante hacía —mal, porque para
 * conseguirlo se quedaba pegada a TODA la aplicación con tres botones y ningún
 * dato—. Aquí es una línea, en la pantalla a la que has ido, y solo si has
 * llegado desde la revisión.
 *
 * ══ Por qué esto NO es un modo ═════════════════════════════════════════════
 *
 * Porque no guarda nada. Viaja en el `state` de la propia navegación de React
 * Router: lo pone el enlace que te trajo y desaparece en cuanto te mueves por tu
 * cuenta. No hay ninguna «revisión en curso» que pueda quedarse abierta, ni un
 * estado global que limpiar, ni forma de que te acompañe a donde no pinta nada.
 *
 * Y no sustituye al botón atrás del navegador: lo dobla en un sitio visible,
 * que es lo que hace falta cuando lo que estabas haciendo tenía un nombre.
 */
export const VueltaALaRevision = () => {
  const location = useLocation();
  const clientId = location.state?.revisionDe;
  const nombre = location.state?.revisionNombre;

  if (!clientId) return null;

  return (
    <Link className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} to={clientPath(clientId, 'semana')}>
      <ArrowLeft size={14} />
      Volver a la revisión{nombre ? ` de ${nombre.split(' ')[0]}` : ''}
    </Link>
  );
};
