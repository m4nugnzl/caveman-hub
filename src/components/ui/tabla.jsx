import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

/**
 * Ordenar una tabla pulsando su cabecera.
 *
 * ══ Por qué hace falta, y por qué no existía ════════════════════════════════
 *
 * En todo el producto no había ni una tabla ordenable: las cinco que hay pintan
 * el array tal como llega del dominio, con el orden que decidió quien la
 * escribió. Para las cortas da igual. Para la hoja de cuentas de la radiografía
 * no: el orden ES la pregunta. «Quién lleva más sin entrar», «quién tiene más
 * clientes», «a quién se le acaba antes la prueba» son tres preguntas distintas
 * sobre la misma tabla, y sin poder ordenarla hay que leerse las veinte filas
 * tres veces.
 *
 * ── El orden por defecto lo sigue decidiendo el dominio ─────────────────────
 * Esto no lo cambia: cada tabla llega ordenada por lo que su análisis considera
 * más importante —los fallos por cuentas afectadas y no por veces, por ejemplo,
 * que es la regla más importante de esa sección—. Lo que se añade es poder
 * hacer OTRA pregunta, no sustituir la primera.
 *
 * ── Tres decisiones de accesibilidad ────────────────────────────────────────
 *
 *   1. **Un `<button>` DENTRO del `<th>`**, no un `onClick` en el `th`. Una
 *      celda con manejador no entra en el recorrido del tabulador y no se
 *      anuncia como algo que se pueda pulsar: con el ratón funciona y con el
 *      teclado la tabla no se puede ordenar en absoluto.
 *   2. **`aria-sort` en el `th`**, que es el atributo que existe para esto y que
 *      es el primero de su clase en este repositorio. No vale `aria-pressed`
 *      —la convención de la casa para «esto está seleccionado»—: aquí no hay dos
 *      estados sino tres (sin ordenar, ascendente, descendente).
 *   3. **La flecha se ve siempre en la columna activa**, no solo al pasar el
 *      ratón: en una pantalla táctil no hay `hover`, y sin la flecha no hay
 *      forma de saber por cuál está ordenada.
 */

/** El estado. Solo eso: ordenar es una función pura y va aparte. */
export const useOrden = (campoInicial = null, sentidoInicial = 'asc') => {
  const [campo, setCampo] = useState(campoInicial);
  const [sentido, setSentido] = useState(sentidoInicial);

  return {
    campo,
    sentido,
    /**
     * @param siguiente  La columna que se ha pulsado.
     * @param num  Si es una columna de cifras. Decide el sentido de la PRIMERA
     *   pulsación, y no es un capricho: de una columna de números se quiere ver
     *   el más grande —quién tiene más clientes, qué tabla ocupa más—, y de una
     *   de nombres se quiere la A. Empezar siempre ascendente obligaría a pulsar
     *   dos veces en la mitad de las columnas.
     */
    cambiar: (siguiente, num = false) => {
      if (siguiente === campo) {
        setSentido((s) => (s === 'asc' ? 'desc' : 'asc'));
        return;
      }
      setCampo(siguiente);
      setSentido(num ? 'desc' : 'asc');
    },
  };
};

/**
 * Las filas, ordenadas. Pura: el llamante la envuelve en `useMemo`.
 *
 * @param filas    Lo que llega del dominio. No se muta: se copia.
 * @param orden    Lo que devuelve `useOrden`.
 * @param valores  `{ campo: (fila) => valor comparable }`. Se pasa desde fuera
 *   porque la tabla sabe qué significa cada columna y esto no: «última entrada»
 *   se ordena por los DÍAS que hace, no por la frase «hace 9 días», que
 *   alfabéticamente pone el 10 antes que el 9.
 */
export const ordenar = (filas, { campo, sentido }, valores) => {
  const leer = valores?.[campo];
  if (!campo || !leer) return filas;

  const signo = sentido === 'desc' ? -1 : 1;
  /* Un hueco NO es un cero y no puede ordenarse como tal: una cuenta que no ha
     entrado nunca no es la que entró hace cero días. Los huecos van al final
     siempre, se ordene en el sentido que se ordene — si el sentido los moviera,
     invertir el orden llenaría la primera pantalla de filas vacías. */
  const falta = (v) => v === null || v === undefined || v === '' || Number.isNaN(v);

  return [...filas].sort((a, b) => {
    const x = leer(a);
    const y = leer(b);

    if (falta(x) && falta(y)) return 0;
    if (falta(x)) return 1;
    if (falta(y)) return -1;

    if (typeof x === 'number' && typeof y === 'number') return (x - y) * signo;
    if (typeof x === 'boolean' && typeof y === 'boolean') return (Number(x) - Number(y)) * signo;
    /* `numeric` para que «tabla 10» vaya después de «tabla 9», y el idioma para
       que la eñe y las tildes caigan donde una persona las busca. */
    return String(x).localeCompare(String(y), 'es', { numeric: true }) * signo;
  });
};

/** Una cabecera que ordena. */
export const ThOrden = ({ orden, campo, num = false, children }) => {
  const activo = orden.campo === campo;
  const Icono = !activo ? ChevronsUpDown : orden.sentido === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      className={num ? 'num' : undefined}
      aria-sort={activo ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="th-orden" onClick={() => orden.cambiar(campo, num)}>
        {children}
        <Icono size={12} aria-hidden="true" />
      </button>
    </th>
  );
};
