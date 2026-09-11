import { Plus } from 'lucide-react';

import { MenuAcciones } from '@/components/ui/MenuAcciones';

/**
 * «UNO MÁS»: UNA SOLA PIEZA PARA TODOS.
 *
 * «Habría que mejorar el diseño de los botones + hoja y + microciclo.»
 *
 * Ya eran la misma clase (`.tira-mas`) pero el dibujo ha ido y vuelto dos
 * veces. Primero fueron un signo y una palabra del mismo peso que el texto de
 * al lado, y en un renglón de nombres «+ bloque» se leía como un nombre más.
 * Luego el signo se metió en una chapa de acento con su flecha detrás, y eso
 * arreglaba la confusión inventando un control que no existe en ninguna otra
 * pantalla: en el resto de la casa se añade con el botón de siempre, y en la
 * dieta el mismo gesto —un «+» que abre un menú— es «+ comida» y va sin chapa.
 *
 * Lo que separa este botón de sus vecinos no tiene que ser una forma nueva: es
 * el COLOR, que ya es ley aquí —la caja se enciende, el verbo va en azul—. Así
 * que se queda con la geometría exacta del eslabón que tiene al lado (12 px,
 * mismo relleno, mismo radio) y lo único que cambia es la tinta. Los nombres
 * son tinta llena o terciaria; esto es acento, y no hay nada más en la fila que
 * lo sea.
 *
 * ── Y por qué vive en `ui/` y no en Entreno ────────────────────────────────
 * Empezó siendo tres trozos de JSX copiados en tres ficheros —«+ bloque» y «+
 * microciclo» en la tira, «+ hoja» en `WorkoutLogEditor`— y acabaron con tres
 * dibujos distintos. Se juntaron en un componente que vivía dentro de la tira
 * del programa; cuando la dieta estrenó su propia cinta, ese domicilio obligaba
 * a que una pantalla de nutrición importara una pieza de Entreno. La cinta es
 * chasis de la casa, no de una pantalla: el «+» que la remata, también.
 *
 * `items` lo convierte en un menú: es lo que necesita «+ microciclo» para
 * preguntar de qué parte en vez de añadir en blanco sin decir nada. Sin flecha,
 * como «+ comida»: `aria-haspopup` se lo dice a quien navega a ciegas, y a la
 * vista una flecha sobre un rótulo de dos palabras es un tercer trazo para
 * decir lo que el propio menú enseña en cuanto se abre.
 */
export const BotonMas = ({ palabra, onClick, title, items = null, ariaLabel = null }) => {
  const dentro = (
    <>
      <Plus size={13} aria-hidden="true" />
      {palabra}
    </>
  );
  return items ? (
    <MenuAcciones clase="tira-mas" label={dentro} items={items} ariaLabel={ariaLabel || `Añadir ${palabra}`} sinFlecha />
  ) : (
    <button type="button" className="tira-mas" onClick={onClick} title={title} aria-label={ariaLabel || undefined}>
      {dentro}
    </button>
  );
};
