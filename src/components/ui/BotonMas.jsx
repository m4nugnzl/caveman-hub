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
export const BotonMas = ({
  palabra,
  onClick,
  title,
  items = null,
  ariaLabel = null,
  /* Los dos mandos del menú, para cuando los verbos hay que LEERLOS antes de
     elegir: la frase de cada uno debajo del rótulo (`descriptivo`) y el menú
     colgando del canto izquierdo, que es donde está el verbo. Se reenvían en
     vez de dejar que cada pantalla se monte su propio «+» con `MenuAcciones`,
     que es como llegaron a existir siete dibujos de lo mismo. */
  descriptivo = false,
  alineado = undefined,
  /* El «+» que se pulsa a diario en su pantalla, en tinta llena. Los tres de la
     barra del bloque son la misma pieza, pero no se usan igual: «+ hoja» se
     pulsa cada vez que se monta una semana y los otros dos, una vez por
     mesociclo. El frame lo dice así (`33:278`: tinta plena en 600, contra el
     gris a 500 de sus vecinos), y es la única jerarquía que la fila tiene entre
     verbos — sin ella los tres «+» pesan lo mismo y el que se busca hay que
     leerlo. Uno por pantalla, o deja de significar nada. */
  destacado = false,
}) => {
  const clase = `tira-mas${destacado ? ' is-destacado' : ''}`;
  const dentro = (
    <>
      <Plus size={13} aria-hidden="true" />
      {palabra}
    </>
  );
  return items ? (
    <MenuAcciones
      clase={clase}
      label={dentro}
      items={items}
      ariaLabel={ariaLabel || `Añadir ${palabra}`}
      descriptivo={descriptivo}
      alineado={alineado}
      sinFlecha
    />
  ) : (
    <button type="button" className={clase} onClick={onClick} title={title} aria-label={ariaLabel || undefined}>
      {dentro}
    </button>
  );
};
