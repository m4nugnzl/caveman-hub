import { Outlet, useParams } from 'react-router-dom';
import { Camera, Columns2, Ruler } from 'lucide-react';

import { clientPath } from '@/routes';
import { Migas } from '@/components/ui/Migas';
import { ReviewRail } from './ReviewRail';

/**
 * El marco de lo que cuelga de «Revisiones».
 *
 * ── Qué cuelga ──────────────────────────────────────────────────────────────
 *   · **Check-in** (`/revision`) — donde se meten los pesajes y las medidas.
 *   · **Fotos** (`/revision/fotos`) — el archivo, en carpetas por semana.
 *   · **Estudio** (`/revision/estudio`) — montar el collage y grabar el vídeo.
 *
 * Ninguna es una pestaña: son herramientas de la revisión, y se abren desde el
 * bloque de la revisión que enseña ese dato (`review/BodyCard`). Aquí lo único
 * que se añade es la miga para volver y pasar de una a otra.
 *
 * El portal del cliente conserva su carril de chips (`ReviewRail`): tiene otro
 * usuario, otro dispositivo y se revisa aparte.
 */
export const ReviewLayout = ({ audience = 'coach' }) => {
  const { clientId } = useParams();
  const isClient = audience === 'client';

  return (
    <div className="stack">
      {isClient ? (
        <ReviewRail audience="client" clientId={clientId} />
      ) : (
        <Migas
          volver={{ to: clientPath(clientId, 'semana'), label: 'Revisiones' }}
          hermanos={[
            { to: clientPath(clientId, 'revision'), label: 'Check-in', icon: Ruler },
            { to: clientPath(clientId, 'revision/fotos'), label: 'Fotos', icon: Camera },
            { to: clientPath(clientId, 'revision/estudio'), label: 'Estudio', icon: Columns2 },
          ]}
        />
      )}
      <Outlet />
    </div>
  );
};
