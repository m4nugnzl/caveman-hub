import { kindMeta } from '@/domain/calendar';

/**
 * EL DÍA DE UN REFEED O UN DIET BREAK, en la dieta del cliente (25 sep 2026).
 *
 * Una caja encima de lo pautado: qué día es («Hoy, refeed», «día 2 de 3»),
 * sus cifras y la indicación que le dejó su entrenador. Las cifras de la
 * pantalla ya son las del refeed (las cambia `ClientDietRoute`); esto dice
 * POR QUÉ hoy no son las de siempre. La misma pieza en el teléfono y en el
 * monitor, teñida del color de su tipo de evento.
 *
 * @param especial `{ kind, titulo, cuando, cifras, nota }`: `cifras`, las
 *   líneas de kcal y macros, o `null` si no se enseñan o no hay.
 */
export const DiaEspecial = ({ especial }) => (
  <section className="dia-especial" aria-label={especial.titulo} style={{ '--tinta': kindMeta(especial.kind).color }}>
    <p className="dia-especial-cab">
      <span className="dia-especial-punto" aria-hidden="true" />
      <strong>{especial.titulo}</strong>
      {especial.cuando && <span className="dia-especial-cuando">{especial.cuando}</span>}
    </p>
    {especial.cifras && <p className="dia-especial-cifras tnum">{especial.cifras.join(', ')}</p>}
    {especial.nota && <p className="dia-especial-nota">{especial.nota}</p>}
  </section>
);

/**
 * LA VÍSPERA (26 sep 2026): «Mañana: refeed · día 1 de 3», para que pueda
 * organizarse (la compra, el táper). Una línea y no una caja: hoy manda la
 * dieta de hoy. Sin kcal si las tiene ocultas (lo resuelve quien la monta).
 *
 * @param manana `{ kind, texto }`.
 */
export const DiaDeManana = ({ manana }) => (
  <p className="dia-manana" style={{ '--tinta': kindMeta(manana.kind).color }}>
    <span className="dia-manana-punto" aria-hidden="true" />
    <span>
      <b>Mañana:</b> {manana.texto}
    </span>
  </p>
);
