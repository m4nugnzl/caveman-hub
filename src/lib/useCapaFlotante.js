import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * UNA CAPA NO SE RECORTA NUNCA.
 *
 * ══ La avería, que ya ha salido cuatro veces ═══════════════════════════════
 *
 * Todos los desplegables de la casa —el «···» de una fila, «+ bloque», el
 * selector de etiquetas, el autocompletar— son un `.popover` ABSOLUTO colgando
 * de su botón. Un absoluto lo recorta cualquier ancestro con `overflow`
 * distinto de `visible`, y la aplicación está llena de ellos por buenos
 * motivos: `.mesa-panel` lleva `overflow: clip` para que su banda llegue a
 * canto vivo dentro del radio, `.rail` lleva `overflow-x: auto` para poder
 * arrastrar sus chapas, y en CSS un `overflow` en un eje convierte el otro en
 * `auto`, o sea en recorte.
 *
 * El resultado medido (Entreno, 1600 × 950): el menú de «+ bloque» se abre a
 * x = 285 y `.entreno-hoja.mesa-panel` empieza en x = 337, así que 52 px del
 * menú —la «C» de «Componerlo»— quedan cortados. En el carril de la Librería
 * pasaba lo mismo y además el degradado de la máscara lo desvanecía: pulsar
 * «Categoría» «no hacía nada».
 *
 * Se ha ido parcheando sitio a sitio —subir un `min-width`, cambiar el
 * `alineado`, pasar un `.rail` a `rail-wrap`— y vuelve en cuanto aparece una
 * caja nueva con `overflow`. No es un fallo de cada pantalla: es que una capa
 * que flota sobre la página no puede vivir dentro del recorte de la página.
 *
 * ══ La cura ═══════════════════════════════════════════════════════════════
 *
 * La capa sube al TOP LAYER del navegador (`showPopover()`), que se pinta por
 * encima de todo el documento y al que NINGÚN `overflow` alcanza. Como el
 * elemento no se mueve del árbol —no hay portal—, siguen valiendo tal cual el
 * `contains()` con el que se cierra al pulsar fuera y los selectores que visten
 * cada menú por su sitio, que además son de HERMANO —`.linea-titulo + .popover`
 * en la rutina del cliente— y un portal los habría roto en silencio.
 *
 * Lo que el top layer NO da es el anclaje: ahí arriba las coordenadas son las
 * de la ventana, no las del botón. Eso lo pone este hook, y de paso lo que un
 * `position: absolute` tampoco daba nunca:
 *
 *   · VOLTEA cuando no cabe. Un menú al pie de la pantalla se abre hacia
 *     arriba en vez de salirse; `hacia` es la preferencia, no una orden.
 *   · SE CIÑE a la ventana por los cuatro cantos, con `MARGEN` de aire.
 *   · SIGUE a su botón al desplazar o redimensionar (`scroll` en captura, que
 *     es como se oyen los desplazamientos de las cajas interiores) y cuando la
 *     propia capa cambia de tamaño (el autocompletar mientras se teclea).
 *
 * ══ Y si el navegador no tiene top layer ═══════════════════════════════════
 *
 * Se devuelve `estilo: null` y `atributos: {}`: la capa se queda exactamente
 * como estaba —absoluta y vestida por sus clases—, que es el comportamiento de
 * hoy. Ningún navegador con `:has()`, que esta aplicación ya da por hecho, se
 * queda fuera; el respaldo existe por jsdom, donde `showPopover` no está y las
 * pruebas siguen midiendo el árbol de siempre.
 *
 * ── Cómo se usa ───────────────────────────────────────────────────────────
 *
 *     const vida = useDismissable(abierto);
 *     const capa = useCapaFlotante(vida.mounted, anclaRef, vida.ref, { alineado });
 *     …
 *     <div ref={vida.ref} className="popover" style={capa.estilo} {...capa.atributos}>
 *
 * Se le pasa `mounted` y no `abierto` a propósito: mientras dura la animación
 * de salida la capa sigue en el árbol, y una capa colocada que desaparece de
 * golpe del top layer se va sin despedirse.
 *
 * @param montada    Si la capa está en el árbol (el `mounted` de `useDismissable`).
 * @param anclaRef   El elemento al que se pega: el botón, o su envoltorio.
 * @param capaRef    La capa. Es el mismo `ref` que usa `useDismissable`.
 * @param alineado   Por qué canto se alinea con el ancla: `'derecha'` (el
 *                   canto derecho de los dos coincide) o `'izquierda'`.
 * @param hacia      `'abajo'` u `'arriba'`. Es la preferencia: si no cabe, se
 *                   prueba el otro lado antes de ceñirse.
 * @param igualarAncho  La capa mide lo que el ancla. Para el autocompletar,
 *                   donde la lista es la continuación del campo.
 */

/* El hueco entre el ancla y la capa, y lo que la capa nunca se acerca al canto
   de la ventana. Los mismos 4 px que ponía `top: calc(100% + 4px)`. */
const AIRE = 4;
const MARGEN = 8;

export const hayTopLayer = () =>
  typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

/* `:popover-open` es lo único que dice si una capa YA subió, y preguntarlo por
   `matches` revienta donde el selector no se conoce. Ante la duda, «no está
   abierta»: el peor caso es un `showPopover` de más, que se ignora. */
const estaArriba = (capa) => {
  try {
    return capa.matches(':popover-open');
  } catch {
    return false;
  }
};

/* `capaSuperior: false` coloca igual —fija, pegada a su botón, ceñida a la
   ventana— pero NO sube al top layer. Es para una capa que a su vez abre un
   diálogo de confirmación: en el top layer lo taparía, porque los diálogos de
   la casa son un portal con `z-index` y no llegan ahí. Quien la usa la saca del
   recorte con un portal y le pone su `z-index`, por debajo del diálogo. */
export const useCapaFlotante = (
  montada,
  anclaRef,
  capaRef,
  { alineado = 'derecha', hacia = 'abajo', igualarAncho = false, capaSuperior = true } = {}
) => {
  const [estilo, setEstilo] = useState(null);
  const arriba = hayTopLayer();

  const colocar = useCallback(() => {
    const capa = capaRef.current;
    const ancla = anclaRef.current;
    if (!capa || !ancla) return;

    const a = ancla.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    /* `offsetWidth`/`offsetHeight` y NO `getBoundingClientRect`: la capa entra
       con `@keyframes pop`, que arranca en `scale(0.97)`, y un rectángulo
       medido a mitad de esa animación viene un 3 % corto. Con la lista del
       autocompletar —414 px— eran 12 px de error, justo los que la metían por
       debajo del campo al voltear. La caja de maquetación no la tuerce ninguna
       transformación. */
    const w = capa.offsetWidth;
    const h = capa.offsetHeight;

    const izquierdo = alineado === 'derecha' ? a.right - w : a.left;
    const left = Math.min(Math.max(MARGEN, izquierdo), Math.max(MARGEN, vw - w - MARGEN));

    const debajo = a.bottom + AIRE;
    const encima = a.top - AIRE - h;
    const cabeDebajo = debajo + h <= vh - MARGEN;
    const cabeEncima = encima >= MARGEN;
    /* Volcar solo si el lado preferido NO cabe y el otro SÍ: un menú que se
       abre hacia arriba porque le sobran tres píxeles se lee como un fallo. */
    const preferido = hacia === 'arriba' ? encima : debajo;
    const otro = hacia === 'arriba' ? debajo : encima;
    const cabePreferido = hacia === 'arriba' ? cabeEncima : cabeDebajo;
    const cabeOtro = hacia === 'arriba' ? cabeDebajo : cabeEncima;
    const elegido = cabePreferido || !cabeOtro ? preferido : otro;
    const top = Math.min(Math.max(MARGEN, elegido), Math.max(MARGEN, vh - h - MARGEN));

    setEstilo((previo) => {
      const nuevo = {
        position: 'fixed',
        top,
        left,
        right: 'auto',
        bottom: 'auto',
        margin: 0,
        ...(igualarAncho ? { width: a.width } : null),
      };
      /* Sin esto, cada `scroll` reescribe un objeto nuevo y React vuelve a
         pintar la capa entera cuarenta veces por segundo. */
      const igual =
        previo &&
        previo.top === nuevo.top &&
        previo.left === nuevo.left &&
        previo.width === nuevo.width;
      return igual ? previo : nuevo;
    });
  }, [anclaRef, capaRef, alineado, hacia, igualarAncho]);

  /* `useLayoutEffect` y no `useEffect` en los dos: subir al top layer y colocar
     tienen que pasar antes de pintar, o la capa asoma un fotograma en la
     esquina. Y son DOS efectos porque el de subir solo puede depender de si la
     capa está montada: colgarlo también de `colocar` la bajaría y la volvería a
     subir cada vez que una prop cambia, y con ella la animación de entrada. */
  useLayoutEffect(() => {
    if (!arriba || !montada || !capaSuperior) return undefined;
    const capa = capaRef.current;
    if (!capa?.isConnected) return undefined;

    if (!estaArriba(capa)) {
      try {
        capa.showPopover();
      } catch {
        /* Un navegador que anuncia el método y luego lo rechaza deja la capa
           donde estaba: recortada, pero nunca invisible. */
      }
    }

    return () => {
      /* Quitar el nodo del árbol ya la baja del top layer; esto cubre el caso
         en que la capa se desmonta sin que React quite el elemento. */
      try {
        if (capa.isConnected && estaArriba(capa)) capa.hidePopover();
      } catch {
        /* Ya estaba cerrada. */
      }
    };
  }, [arriba, montada, capaRef, capaSuperior]);

  useLayoutEffect(() => {
    if (!arriba || !montada) return;
    colocar();
  }, [arriba, montada, colocar]);

  useEffect(() => {
    if (!arriba || !montada) return undefined;
    /* En captura: los desplazamientos de una caja interior —la mesa de Entreno,
       un carril— no burbujean hasta `window`. */
    window.addEventListener('scroll', colocar, true);
    window.addEventListener('resize', colocar);
    const observador =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(colocar);
    if (observador && capaRef.current) observador.observe(capaRef.current);
    return () => {
      window.removeEventListener('scroll', colocar, true);
      window.removeEventListener('resize', colocar);
      observador?.disconnect();
    };
  }, [arriba, montada, capaRef, colocar]);

  return {
    estilo: arriba ? estilo : null,
    /* `manual` y no `auto`: el cierre al pulsar fuera y con Escape ya lo lleva
       `useClickOutside`, y dos mecanismos de cierre sobre el mismo elemento se
       pelean por el estado de React. */
    atributos: arriba && capaSuperior ? { popover: 'manual' } : {},
  };
};
