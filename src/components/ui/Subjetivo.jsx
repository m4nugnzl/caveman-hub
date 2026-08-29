/**
 * Una tanda de respuestas de escala, como barras.
 *
 * Una fila por pregunta: la palabra, una barra de 1 a 10 con el color de la
 * pregunta, y la cifra. Se lee sin comparar números: la fatiga alta es una
 * barra larga; el dolor bajo, una corta.
 *
 * ── Vive en `ui/` porque lo subjetivo se pregunta en DOS sitios ─────────────
 * Al acabar una sesión (`SESSION_QUESTIONS`) y al cerrar la semana en el
 * check-in (`CHECKIN_QUESTIONS`). Son dos catálogos distintos y la misma clase
 * de respuesta —una escala con su color y su tope—, así que se pintan igual: el
 * panel de la semana, la progresión de un ejercicio y el bloque de evolución
 * del resumen usan esta misma pieza. Estaba dentro de `Workout/`, que es lo que
 * habría llevado a dibujar unas barras nuevas para el check-in.
 */
export const Subjetivo = ({ preguntas = [], answers = {}, titulo = null }) => {
  const filas = preguntas
    .map((q) => ({ q, valor: Number(answers?.[q.id]) }))
    .filter(({ valor }) => Number.isFinite(valor));
  if (filas.length === 0) return null;

  return (
    <div className="subjetivo">
      {titulo && <span className="section-label">{titulo}</span>}
      {filas.map(({ q, valor }) => {
        const max = q.max || 10;
        const min = q.min ?? 0;
        const pct = Math.max(0, Math.min(100, ((valor - min) / (max - min)) * 100));
        return (
          <div key={q.id} className="subjetivo-fila" title={q.label}>
            <span className="subjetivo-k">{q.short || q.label}</span>
            <span className="subjetivo-barra" aria-hidden="true">
              <span className="subjetivo-relleno" style={{ width: `${pct}%`, background: q.color || 'var(--text-secondary)' }} />
            </span>
            <span className="subjetivo-v" style={q.color ? { color: q.color } : undefined}>
              {valor}
              <small>/{max}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
};
