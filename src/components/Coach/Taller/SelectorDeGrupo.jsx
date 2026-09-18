import { MenuAcciones } from '@/components/ui/MenuAcciones';

/**
 * EL EJE QUE NO CABE EN UNA LÍNEA, PLEGADO.
 *
 * ══ El fallo que esto arregla, y lo introduje yo ═══════════════════════════
 *
 * La barra de filtros de la Librería se partía en dos líneas —buscador arriba,
 * chapas abajo—, y la arreglé haciendo que el raíl ocupara lo que sobra y
 * rodara. Rodar es lo que `.rail` sabe hacer… en táctil. Con ratón no: lleva
 * `scrollbar-width: none` y no hay gesto horizontal, así que las categorías que
 * no cabían **dejaron de poder alcanzarse**. El dueño lo dijo mirándolo: «hay
 * tantos elementos que ocupan todo el ancho y no se puede deslizar».
 *
 * Cambiar el raíl por otro que sí ruede sería insistir en la forma equivocada.
 * Diez categorías con su cifra no son una tira que se recorre: son una lista de
 * la que se elige una. Y de una lista de la que se elige una se hace un
 * selector, que mide siempre lo mismo y no depende del ancho de la ventana ni
 * de cuántas categorías tengas.
 *
 * ── Es la decisión que el dueño ya tomó en `/clientes` ─────────────────────
 * Allí las etiquetas se plegaron en `SelectorEtiquetas` por el mismo motivo —su
 * lista crece sin techo y ocupaba un carril entero—. Esto es lo mismo un piso
 * más abajo, con `MenuAcciones` en vez de un componente propio porque aquí no
 * hay discos de color que enseñar: sólo un nombre y su cifra.
 *
 * ── Lo que NO se pliega ───────────────────────────────────────────────────
 * «Tuyos» y «Del catálogo» se quedan como chapas a la vista. Son dos, caben
 * siempre, y son el eje que de verdad se pulsa: esconder detrás de un menú algo
 * que sólo tiene dos estados es añadir un clic para no ganar nada.
 *
 * @param titulo   Cómo se llama el eje cuando no hay nada elegido.
 * @param opciones `[[valor, cuántos]]`, ya ordenadas por quien las cuenta.
 * @param valor    Lo elegido, o `null`.
 */
export const SelectorDeGrupo = ({ titulo, opciones = [], valor, onElegir }) => {
  if (opciones.length < 2) return null;

  return (
    <MenuAcciones
      /* Se cierra al elegir: aquí sólo se puede tener una categoría a la vez,
         así que dejarlo abierto invitaría a un segundo gesto que no existe.
         (En `/clientes` NO se cierra, y es correcto: allí se acumulan.) */
      clase={`chip lib-eje${valor ? ' is-on' : ''}`}
      alineado="izquierda"
      ariaLabel={`Filtrar por ${titulo.toLowerCase()}`}
      label={
        /* El eje y lo elegido, en dos voces (frame de Figma, 18 sep): «Músculo
           Dorsal». Lo elegido ES la información, y esconderlo obligaría a abrir
           el menú para saber por dónde estás mirando. Sin la cifra: la dice ya
           el título del grupo, debajo. */
        <>
          <span className="lib-eje-rot">{titulo}</span>
          <span className="lib-eje-valor">{valor || 'Todos'}</span>
        </>
      }
      items={opciones.map(([v, n]) => ({
        label: v,
        sub: String(n),
        on: valor === v,
        run: () => onElegir(valor === v ? null : v),
      }))}
    />
  );
};
