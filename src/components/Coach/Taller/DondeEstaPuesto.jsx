import { Link } from 'react-router-dom';

/**
 * DÓNDE ESTÁ PUESTO: lo primero que dice la ficha de una pieza de la Librería.
 *
 * ══ Por qué esto va ARRIBA y no al pie en gris ═════════════════════════════
 *
 * La ficha del carril empezaba repitiendo la fila que acabas de pulsar —«900
 * kcal · 0 P · 0 HC · 100 G», los mismos cuatro números que hay dos dedos a la
 * izquierda— y terminaba, en gris de 11 px y debajo de un formulario, con la
 * única frase que la tabla no puede dar: «se usa en 4 dietas».
 *
 * Estaba del revés. La tabla dice QUÉ ES una cosa; el carril tiene que decir
 * **dónde está puesta**, que es lo que decide todo lo demás: si esto se puede
 * borrar, a quién le cambias la dieta si corriges sus macros, y si el duplicado
 * que se coló es el que usas o el que sobra. Un panel que repite el renglón es
 * media pantalla gastada en no decir nada.
 *
 * ── Y con nombres, no con una cifra ───────────────────────────────────────
 * «4 dietas» obliga a abrir a los catorce clientes y buscar. Los nombres son
 * puertas: se pulsa y se llega a su dieta. No cuesta una consulta —los planes
 * de todos los clientes ya están en memoria y `foodClientsByName` los recorre
 * de todos modos—, así que la cifra sola era una pérdida gratuita.
 *
 * ── El cero también se dice, y es el dato más útil de los dos ─────────────
 * «Todavía no está en ninguna dieta» es lo que autoriza a podar. Un vacío que
 * se calla deja la pregunta abierta; éste la cierra.
 *
 * ── Dos clases de puerta, porque son dos destinos ────────────────────────
 * Un cliente está en OTRA pantalla, así que su cápsula es un enlace de verdad
 * —se puede abrir en otra pestaña, y el navegador sabe que lo es—. Un ejercicio
 * hermano está en ESTA lista, así que la suya sólo mueve la elección del banco:
 * navegar para quedarte donde estás sería mentirle al botón de atrás. La misma
 * distinción que separa un destino de un tramo en la cinta de arriba.
 *
 * @param titulo  Cómo se llama esta relación en esta mitad de la Librería.
 * @param gente   `[{ id, name, to }]` — cómo se llama y, si lleva a otra
 *   pantalla, a dónde. Sin `to`, se avisa a `onIr` y no se navega.
 * @param onIr    Qué hacer con los que no llevan a otra pantalla.
 * @param vacio   Qué se dice cuando no está puesto en ninguna parte.
 * @param tope    Cuántos nombres se enseñan antes de resumir en «y N más».
 */
export const DondeEstaPuesto = ({ titulo, gente = [], onIr, vacio, tope = 3 }) => {
  const primeros = gente.slice(0, tope);
  const resto = gente.length - primeros.length;

  return (
    <section className="ficha-puesto">
      <p className="ficha-capa-rot">{titulo}</p>

      {gente.length === 0 ? (
        <p className="ficha-capa-texto">{vacio}</p>
      ) : (
        <p className="ficha-puesto-gente">
          {primeros.map((quien) =>
            quien.to ? (
              <Link key={quien.id} className="chip" to={quien.to}>
                {quien.name}
              </Link>
            ) : (
              <button
                key={quien.id}
                type="button"
                className="chip"
                onClick={() => onIr?.(quien.name)}
              >
                {quien.name}
              </button>
            )
          )}
          {/* El resto en texto y no en otra cápsula: son los que NO se pueden
              pulsar, y vestirlos igual que los que sí prometería una puerta que
              no existe. */}
          {resto > 0 && <span className="t-xs t-tertiary">y {resto} más</span>}
        </p>
      )}
    </section>
  );
};
