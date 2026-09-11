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
 *
 * ══ Y UNA PARTE DENTRO DEL TODO, para planificar con la hoja abierta ════════
 *
 * Con `m.parte`, la misma barra dice dos cosas en vez de una: el relleno claro
 * es el total del bloque contra el MRV —lo de siempre— y encima, a ras de
 * origen, un tramo macizo con lo que pone LA HOJA que se está escribiendo. Se
 * lee de un vistazo cuánto de ese grupo lo carga este día.
 *
 * No es una barra nueva: sin `parte` esto se comporta exactamente como antes,
 * que es lo que siguen haciendo el bloque abierto y la lista. Dibujar unas
 * barras aparte para la hoja habría sido tener dos escalas para el mismo dato,
 * y la primera vez que alguien tocara el MRV solo se enteraría una.
 */
export const BarrasDeVolumen = ({ grupos }) => {
  const tope = Math.max(1, ...grupos.map((m) => m.mrv || Math.max(m.valor, m.parte || 0)));
  return (
    <div className="subjetivo is-volumen">
      {grupos.map((m) => {
        const pasado = Boolean(m.mrv) && m.valor > m.mrv;
        const escala = m.mrv || tope;
        const hayParte = Number.isFinite(m.parte);
        const tinta = pasado ? 'var(--negative)' : metricColor('sets');

        /*
          Dos tramos SOLO si de verdad hay dos cifras. Un grupo que esta hoja se
          lleva entero daba «8 de 8» —que se lee como una fracción cumplida, o
          sea como otra cosa— y dos rellenos superpuestos del mismo ancho. Si la
          hoja ES todo el trabajo de ese grupo, la fila lo dice callándose.
        */
        const dosTramos = hayParte && m.parte !== m.valor;
        const grande = hayParte ? m.parte : m.valor;
        const pie = dosTramos ? ` de ${m.valor}` : m.mrv ? `/${m.mrv}` : null;

        return (
          <div
            className="subjetivo-fila"
            key={m.name}
            title={[
              dosTramos
                ? `${m.name}: ${m.parte} ${m.parte === 1 ? 'serie' : 'series'} en esta hoja, ${m.valor} en el bloque`
                : `${m.name}: ${grande} ${grande === 1 ? 'serie' : 'series'}`,
              m.mrv ? `de un MRV estimado de ${m.mrv}` : null,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="subjetivo-k">{m.name}</span>
            <span className="subjetivo-barra" aria-hidden="true">
              <span
                className="subjetivo-relleno"
                style={{
                  width: `${Math.min(100, (m.valor / escala) * 100)}%`,
                  background: tinta,
                  opacity: dosTramos ? 0.4 : undefined,
                }}
              />
              {dosTramos && (
                <span
                  className="subjetivo-parte"
                  style={{ width: `${Math.min(100, (m.parte / escala) * 100)}%`, background: tinta }}
                />
              )}
            </span>
            <span className="subjetivo-v" style={pasado ? { color: 'var(--negative)' } : undefined}>
              {grande}
              {pie && <small>{pie}</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
};
