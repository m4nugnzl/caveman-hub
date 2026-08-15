import { NavLink, Outlet, useParams } from 'react-router-dom';
import { Gauge, TrendingUp } from 'lucide-react';

import { clientPath } from '@/routes';

/**
 * Progreso: el resumen y el análisis, como dos profundidades de lo mismo.
 *
 * ══ Por qué dejan de ser dos secciones ══════════════════════════════════════
 *
 * «Resumen» y «Analítica» eran dos entradas del carril del cliente, y las dos
 * contestan la misma pregunta —¿cómo va esto?— con distinto nivel de detalle. Eso
 * obliga a decidir cuál abrir ANTES de saber qué se quiere mirar, que es una
 * decisión que nadie puede tomar bien: se acaba abriendo una, no encontrando lo
 * que se busca, y saltando a la otra por el carril.
 *
 * Ahora es una sección con dos niveles: se entra por el resumen —las cifras y los
 * gráficos que cada cliente ha elegido ver— y se pasa al análisis cuando hace
 * falta la revisión a fondo, con la lectura de la semana y sus grupos de prueba.
 *
 * ── Siguen siendo dos RUTAS, y a propósito ──────────────────────────────────
 * `/c/:id/resumen` y `/c/:id/analitica` no desaparecen: lo que desaparece es la
 * segunda entrada del carril. Mantenerlas separadas conserva tres cosas que un
 * conmutador con estado local se cargaría —el enlace directo al análisis de un
 * cliente, el botón atrás del navegador y la posibilidad de cargar el análisis
 * aparte el día que se divida el código— y no cuesta nada: el conmutador son dos
 * enlaces.
 *
 * Por eso este componente es una ruta de layout sin path propio: envuelve a las
 * dos y solo aporta la barra.
 */
export const ProgressLayout = ({ audience = 'coach' }) => {
  const { clientId } = useParams();
  const isClient = audience === 'client';

  /* El cliente vive en `/mi/…` y el entrenador en `/c/:id/…`. La construcción de
     rutas pasa por `clientPath` para que nadie escriba estas cadenas a mano. */
  const to = (section) => (isClient ? `/mi/${section}` : clientPath(clientId, section));

  return (
    <div className="stack">
      <nav className="progress-switch" aria-label="Nivel de detalle">
        <NavLink to={to(isClient ? 'inicio' : 'resumen')} className="progress-level" end>
          <Gauge size={15} />
          <span className="l">{isClient ? 'Mi progreso' : 'Resumen'}</span>
          <span className="h">{isClient ? 'Cómo vas' : 'Las cifras de un vistazo'}</span>
        </NavLink>

        <NavLink to={to('analitica')} className="progress-level" end>
          <TrendingUp size={15} />
          <span className="l">Análisis</span>
          <span className="h">La revisión a fondo</span>
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
};
