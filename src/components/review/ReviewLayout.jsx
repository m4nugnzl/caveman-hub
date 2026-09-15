import { Outlet, useParams } from 'react-router-dom';
import { Camera, Columns2, Ruler } from 'lucide-react';

import { clientPath } from '@/routes';
import { Migas } from '@/components/ui/Migas';


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
 * ── Y el portal ya no lleva carril de chips, lleva MIGA ────────────────────
 * Llevaba `ReviewRail` con dos fichas —«Check-in» y «Fotos»— pegadas arriba del
 * todo. Eso tenía sentido mientras esto era una PESTAÑA del portal: dos niveles
 * de una sección que se elige. Desde el 12 de septiembre no lo es, y una pantalla
 * empujada necesita antes que nada el camino de vuelta —que es lo que las dos
 * fichas no daban—.
 *
 * Así que las dos ramas de este marco pasan a ser la misma pieza con distintos
 * eslabones, que es lo que siempre debieron ser: se vuelve por el primero y se
 * cambia de nivel por los de al lado.
 *
 * ── En el portal ya NO envuelve el índice ──────────────────────────────────
 * Con la revisión otra vez en la barra del pulgar, `/mi/evolucion` es un DESTINO:
 * un destino con miga de vuelta es un destino que finge ser una subpantalla, y
 * además la miga apuntaba a «Lo tuyo», que ya no es de donde se viene. Este marco
 * envuelve solo lo que de verdad se empuja —la báscula y el archivo de fotos— y
 * el primer eslabón vuelve a la propia revisión. Ver `App.jsx`.
 */
export const ReviewLayout = ({ audience = 'coach' }) => {
  const { clientId } = useParams();
  const isClient = audience === 'client';

  return (
    <div className="stack">
      <Migas
        volver={
          isClient
            ? { to: '/mi/evolucion', label: 'Tu revisión' }
            : { to: clientPath(clientId, 'semana'), label: 'Revisiones' }
        }
        hermanos={
          isClient
            ? [
                { to: '/mi/evolucion/medidas', label: 'Tu peso', icon: Ruler },
                { to: '/mi/evolucion/fotos', label: 'Fotos', icon: Camera },
              ]
            : [
                { to: clientPath(clientId, 'revision'), label: 'Check-in', icon: Ruler },
                { to: clientPath(clientId, 'revision/fotos'), label: 'Fotos', icon: Camera },
                /* El estudio no baja al portal: él no compara, entrega. */
                { to: clientPath(clientId, 'revision/estudio'), label: 'Estudio', icon: Columns2 },
              ]
        }
      />
      <Outlet />
    </div>
  );
};
