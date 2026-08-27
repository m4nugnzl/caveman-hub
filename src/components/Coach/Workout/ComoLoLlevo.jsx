import { Subjetivo } from './Subjetivo';

/**
 * Cómo lo llevó: lo que el cliente contó al acabar LA SESIÓN abierta.
 *
 * Es su propia tarjeta, debajo de la progresión y no dentro: la progresión
 * habla de un ejercicio; esto habla de la sesión entera. Si no hay sesión o
 * no contó nada, no se pinta una tarjeta vacía.
 */
export const ComoLoLlevo = ({ sesion, preguntas = [], fecha = null, onAmpliar = null }) => {
  if (!sesion?.feedback) return null;
  const hay = preguntas.some((q) => String(sesion.feedback[q.id] ?? '').trim() !== '');
  if (!hay && !sesion.clientNote?.trim()) return null;

  return (
    <aside className="comparativa como-lo-llevo" aria-label="Cómo lo llevó">
      <div className="lado-cab">
        <span className="section-label">Cómo lo llevó</span>
        <div className="lado-cab-fila">
          <button type="button" className="lado-titulo" onClick={onAmpliar} disabled={!onAmpliar} title="Ver cómo lo lleva, sesión a sesión">
            {fecha ? `Sesión del ${fecha}` : 'Esta sesión'}
          </button>
        </div>
      </div>
      <Subjetivo preguntas={preguntas} answers={sesion.feedback} />
      {sesion.clientNote?.trim() && <p className="semana-sesion-nota">«{sesion.clientNote.trim()}»</p>}
    </aside>
  );
};
