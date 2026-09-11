import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronsUpDown } from 'lucide-react';

import { MenuAcciones } from '@/components/ui/MenuAcciones';

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
    /**
     * Volver al orden con el que llegó la tabla.
     *
     * La cabecera no puede ofrecer esto: no hay ninguna columna que se llame
     * «como venía». Y sin ello el orden del dominio —el que cada tabla trae
     * porque es su criterio más importante— se pierde en el primer clic y no
     * vuelve hasta recargar la página. En la cartera eso es perder la pregunta
     * con la que se abre la pantalla, que es «¿por quién empiezo hoy?».
     */
    restablecer: () => {
      setCampo(campoInicial);
      setSentido(sentidoInicial);
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

/**
 * Una cabecera que ordena.
 *
 * `clase` es para las tablas que reparten sus columnas con clases propias —la
 * cartera y sus `.p-semana`, `.p-peso`…—: sin ella, hacer ordenable una columna
 * le quitaba su ancho y su ocultación en estrecho, que es justo lo que la
 * mantiene legible. Se suma a `num`, que sigue siendo la alineación de cifras.
 */
export const ThOrden = ({ orden, campo, num = false, clase = null, children }) => {
  const activo = orden.campo === campo;
  const Icono = !activo ? ChevronsUpDown : orden.sentido === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      className={[num ? 'num' : null, clase].filter(Boolean).join(' ') || undefined}
      aria-sort={activo ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="th-orden" onClick={() => orden.cambiar(campo, num)}>
        {children}
        <Icono size={13} aria-hidden="true" />
      </button>
    </th>
  );
};

/**
 * El orden, dicho fuera de la cabecera.
 *
 * ══ Por qué no bastaba con la cabecera ══════════════════════════════════════
 *
 * `ThOrden` pone el gesto donde se mira cuando surge la pregunta, y eso sigue
 * siendo lo correcto. Lo que no puede hacer una cabecera es CONTAR que existe:
 * la flecha va a `opacity: 0` hasta que se apunta con el ratón —trece flechas
 * fijas son trece cosas que no se van a pulsar—, así que en una pantalla táctil
 * no hay nada que delate que la tabla se ordena. Quien no lo sabe, no lo
 * descubre.
 *
 * Y hay dos cosas más que la cabecera no alcanza:
 *
 *   · **Las columnas que no están.** La cartera retira `Peso`, `Semana` y
 *     `Entrenó` conforme se estrecha (ver `superficies.css`), y con la columna
 *     se va su único mando: por debajo de 1038 px ya no se puede preguntar
 *     «quién ha bajado más» aunque el dato exista en todas las fichas.
 *   · **La vuelta al orden de casa**, que no es ninguna columna.
 *
 * Esto no sustituye a la cabecera: es el MISMO `useOrden`, así que lo que se
 * elige aquí enciende su flecha allí y al revés. Un estado, dos puertas.
 *
 * ══ Solo se ofrece lo que la tabla puede contestar ══════════════════════════
 *
 * `campos` lo decide quien llama, y en la cartera son las columnas que la
 * cartera puede llenar: ordenar por un peso que no tiene nadie devolvería la
 * misma lista y parecería roto. Es la regla de los chips a cero.
 *
 * @param orden    Lo que devuelve `useOrden`.
 * @param campos   `[{ id, label, num, sentidos }]`. `sentidos` es la frase de
 *   cada sentido EN EL VOCABULARIO DE ESA COLUMNA: «los que más llevan sin
 *   entrenar» dice lo que hace; «descendente» dice cómo está implementado.
 * @param defecto  Cómo se llama el orden del dominio («Urgencia»).
 * @param mudo     Solo el icono, sin el rótulo del orden puesto. Para el cromo
 *   de una lista estrecha (la cola de la barra), donde la frase es lo más ancho
 *   de la línea. El estado pasa al globo y al nombre accesible.
 */
const SENTIDOS = {
  texto: { asc: 'A → Z', desc: 'Z → A' },
  num: { asc: 'de menos a más', desc: 'de más a menos' },
};

export const MandoDeOrden = ({
  orden,
  campos,
  defecto = 'Como viene',
  clase = 'chip',
  ariaLabel = 'Ordenar la lista',
  mudo = false,
}) => {
  const activo = campos.find((c) => c.id === orden.campo) || null;
  const fraseDe = (campo, sentido) =>
    (campo.sentidos || SENTIDOS[campo.num ? 'num' : 'texto'])[sentido];

  /* «Por urgencia», «Por último entreno»: el estado dicho en palabras. Encima
     de una tabla es un rótulo más de la barra de herramientas; en una columna
     de 240 px es lo más ancho de su línea, y ahí deja de informar y estorba
     —el dueño, mirándolo: «menos intrusiva»—. Por eso el MUDO: mismo menú,
     misma marca dentro, pero al canto solo el icono, y la frase entera en el
     globo y en el nombre accesible. */
  const estado = activo
    ? `Por ${activo.label.toLowerCase()}: ${fraseDe(activo, orden.sentido)}`
    : `Por ${defecto.toLowerCase()}`;

  return (
    <MenuAcciones
      clase={clase}
      ariaLabel={`${ariaLabel}. ${estado}`}
      titulo={mudo ? estado : null}
      alineado="derecha"
      sinFlecha={mudo}
      label={
        <>
          <ArrowUpDown size={13} aria-hidden="true" />
          {!mudo && `Por ${(activo?.label || defecto).toLowerCase()}`}
        </>
      }
      items={[
        /* El de casa, arriba y rotulado: es el orden que la tabla trae y el
           único al que no se vuelve solo. */
        { label: defecto, on: activo === null, sub: 'por defecto', run: orden.restablecer },
        null,
        ...campos.map((campo) => ({
          label: campo.label,
          on: campo.id === orden.campo,
          /* El sentido se dice SOLO en el que está puesto. En los demás sería
             adivinar: el primer clic de una columna de cifras empieza por el
             extremo grande y el de una de nombres por la A (ver `cambiar`), y
             anunciarlo en los seis a la vez llena el menú de letra pequeña que
             no distingue nada. */
          sub: campo.id === orden.campo ? fraseDe(campo, orden.sentido) : undefined,
          /* Pulsar el que ya está puesto lo INVIERTE, exactamente como su
             cabecera. Dos gestos distintos para la misma columna serían dos
             respuestas distintas a la misma pregunta. */
          run: () => orden.cambiar(campo.id, campo.num),
        })),
      ]}
    />
  );
};
