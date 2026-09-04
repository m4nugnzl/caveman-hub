import { Subjetivo } from '@/components/ui/Subjetivo';

/**
 * Cómo lo llevó: lo que el cliente contó al acabar LA SESIÓN abierta.
 *
 * Es su propia tarjeta, debajo de la progresión y no dentro: la progresión
 * habla de un ejercicio; esto habla de la sesión entera. Si no hay sesión o
 * no contó nada, no se pinta una tarjeta vacía.
 */
/*
  `rotulo` y `pista` existen porque esta tarjeta la ven los dos lados y la
  persona de la que habla cambia: el entrenador lee «cómo lo llevó» y el
  cliente, «cómo lo llevas». Es lo único que cambia entre las dos, así que son
  dos textos con el valor del entrenador por defecto y no un `audience`.
*/
export const ComoLoLlevo = ({
  sesion,
  preguntas = [],
  fecha = null,
  onAmpliar = null,
  rotulo = 'Cómo lo llevó',
  pista = 'Ver cómo lo lleva, sesión a sesión',
}) => {
  if (!sesion?.feedback) return null;
  const hay = preguntas.some((q) => String(sesion.feedback[q.id] ?? '').trim() !== '');
  if (!hay && !sesion.clientNote?.trim()) return null;

  return (
    <aside className={`comparativa como-lo-llevo${onAmpliar ? ' tarjeta-puerta' : ''}`} aria-label={rotulo}>
      {/* La tarjeta entera abre su ventana. Ver «LA TARJETA-PUERTA». */}
      {onAmpliar && (
        <button type="button" className="task-hit" onClick={onAmpliar} aria-label={pista} title={pista} />
      )}
      <div className="lado-cab">
        <span className="section-label">{rotulo}</span>
        <div className="lado-cab-fila">
          <span className="lado-titulo">{fecha ? `Sesión del ${fecha}` : 'Esta sesión'}</span>
        </div>
      </div>
      <Subjetivo preguntas={preguntas} answers={sesion.feedback} />
      {sesion.clientNote?.trim() && <p className="semana-sesion-nota">«{sesion.clientNote.trim()}»</p>}
    </aside>
  );
};
