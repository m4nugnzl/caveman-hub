import { Eye } from 'lucide-react';

import { useActions, useData } from '@/context/AppContext';

/**
 * La barra del modo preview: el entrenador está viendo el portal de un cliente
 * y tiene que saberlo en todo momento y poder salir desde cualquier pantalla.
 *
 * ── Por qué se monta en `App.jsx` y no en `ClientLayout` ────────────────────
 * `ClientLayout` no se pinta cuando no hay cliente activo (enseña su vacío), y
 * ese es justo un caso en el que hace falta la salida: un coach recién entrado
 * en preview sin cliente seleccionado. La barra cuelga del MODO, no de una
 * pantalla, así que vive junto a la cabecera, que es del mismo plano.
 *
 * ── Por qué el botón no navega ──────────────────────────────────────────────
 * Solo cambia el modo; la ruta la traduce el comodín del árbol de destino
 * (`OtherViewFallback`). Navegar desde aquí pierde la carrera contra ese
 * comodín: React Router navega en una transición de prioridad baja y el cambio
 * de modo es una actualización normal. Ver el mismo aviso en `CoachLayout`.
 */
export const PreviewBar = () => {
  const { activeClient } = useData();
  const { setViewMode } = useActions();

  return (
    <div className="preview-bar" role="status">
      <Eye size={14} aria-hidden="true" />
      <span className="preview-label">
        Estás viendo el portal de{' '}
        <span className="t-strong">{activeClient?.name || 'tu cliente'}</span>
      </span>
      <button type="button" className="preview-exit" onClick={() => setViewMode('coach')}>
        Volver a mi panel
      </button>
    </div>
  );
};
