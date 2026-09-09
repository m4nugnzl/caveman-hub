import { metricColor } from '@/domain/metrics';

/**
 * Las series por grupo muscular, como barras.
 *
 * Una fila por grupo: el nombre, una barra contra su MRV estimado y la cifra.
 * Lo que se pasa del tope se dice en negativo —barra y cifra—, y sin MRV la
 * barra se escala contra el grupo más alto de la tanda, que es lo único
 * honesto cuando no hay tope con el que comparar.
 *
 * ── Vive en `ui/` porque el mismo volumen se mira en DOS sitios ─────────────
 * En el bloque abierto («Cómo va el bloque») y en la lista de bloques, donde
 * dos bloques se enfrentan grupo a grupo. Estaba dentro de `VistaBloque`, que
 * es lo que habría llevado a dibujar unas barras nuevas para la comparación.
 * El color es el de la serie «series» (`metricColor`), el mismo con el que el
 * volumen se pinta en las gráficas: la barra ata con su línea.
 */
export const BarrasDeVolumen = ({ grupos }) => {
  const tope = Math.max(1, ...grupos.map((m) => m.mrv || m.valor));
  return (
    <div className="subjetivo is-volumen">
      {grupos.map((m) => {
        const pasado = Boolean(m.mrv) && m.valor > m.mrv;
        return (
          <div
            className="subjetivo-fila"
            key={m.name}
            title={m.mrv ? `${m.name}: ${m.valor} series de un MRV estimado de ${m.mrv}` : m.name}
          >
            <span className="subjetivo-k">{m.name}</span>
            <span className="subjetivo-barra" aria-hidden="true">
              <span
                className="subjetivo-relleno"
                style={{
                  width: `${Math.min(100, (m.valor / (m.mrv || tope)) * 100)}%`,
                  background: pasado ? 'var(--negative)' : metricColor('sets'),
                }}
              />
            </span>
            <span className="subjetivo-v" style={pasado ? { color: 'var(--negative)' } : undefined}>
              {m.valor}
              {m.mrv && <small>/{m.mrv}</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
};
