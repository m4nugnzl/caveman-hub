import { NavLink, Outlet, useParams } from 'react-router-dom';
import { Camera, Ruler } from 'lucide-react';

import { clientPath } from '@/routes';

/**
 * Revisión: el check-in y las fotos, que son la misma tarea.
 *
 * ══ Por qué dejan de ser dos secciones ══════════════════════════════════════
 *
 * Revisar a alguien es mirar lo que ha subido —su peso de la semana y sus fotos—
 * y contestarle. Eso es UN trabajo, y estaba repartido en dos entradas del carril
 * porque son dos tablas distintas de la base de datos. La navegación estaba
 * dibujada desde el modelo de datos, no desde lo que se hace con él.
 *
 * La prueba de que el corte estaba mal es que hubo que inventar `ReviewSession`:
 * un MODO, con barra flotante, que te acompaña por encima de la navegación de
 * sección en sección hasta que puedes cerrar la revisión. Esa barra es una
 * costura, y existe porque la tarea no cabía en ninguna pantalla.
 *
 * Aquí caben las dos mitades en una sola sección con dos niveles, igual que
 * «Progreso» tiene resumen y análisis. La barra sigue existiendo —empezar una
 * revisión desde «Hoy» y cerrarla desde donde estés sigue siendo útil— pero ya no
 * es lo único que mantiene junta la tarea.
 *
 * ── Por qué el check-in va primero ──────────────────────────────────────────
 * Porque es el dato que decide. Las fotos cuentan lo que la báscula no ve, pero
 * lo primero que se mira al revisar una semana es cuánto pesa y cuántas veces se
 * ha pesado. El estudio de fotos, además, es la pieza más pesada del producto
 * —lienzo, caché de imágenes, grabador— y abrir la sección por ella significaría
 * descargarla siempre, incluso para mirar tres cifras.
 *
 * ── Siguen siendo dos RUTAS ─────────────────────────────────────────────────
 * `/c/:id/revision` y `/c/:id/revision/fotos`. Mantenerlas separadas conserva el
 * enlace directo al estudio de un cliente, el botón atrás y la carga en diferido
 * de la pieza pesada. Y las dos viejas —`/c/:id/checkins` y `/c/:id/fotos`—
 * redirigen, porque están en marcadores y en enlaces compartidos.
 */
export const ReviewLayout = ({ audience = 'coach' }) => {
  const { clientId } = useParams();
  const isClient = audience === 'client';

  /* El cliente vive en `/mi/…` y el entrenador en `/c/:id/…`. Nadie escribe
     estas cadenas a mano: salen de `clientPath`. */
  const to = (section = '') =>
    isClient ? `/mi/evolucion${section && `/${section}`}` : clientPath(clientId, `revision${section && `/${section}`}`);

  return (
    <div className="stack">
      <nav className="progress-switch" aria-label="Qué parte de la revisión">
        <NavLink to={to()} className="progress-level" end>
          <Ruler size={15} />
          <span className="l">Check-in</span>
          <span className="h">{isClient ? 'Tu peso de la semana' : 'Peso, medidas y entrega'}</span>
        </NavLink>

        <NavLink to={to('fotos')} className="progress-level" end>
          <Camera size={15} />
          <span className="l">Fotos</span>
          <span className="h">{isClient ? 'Cómo vas por fuera' : 'Comparar y montar'}</span>
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
};
