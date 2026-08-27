/**
 * Lo que contó el cliente al acabar, como barras.
 *
 * Una fila por pregunta: la palabra, una barra de 1 a 10 con el color de la
 * pregunta, y la cifra. Se lee sin comparar números: la fatiga alta es una
 * barra larga; el dolor bajo, una corta. Misma pieza en el panel de la semana
 * y bajo la progresión del ejercicio, para que «lo subjetivo» se vea siempre
 * igual y se reconozca.
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
