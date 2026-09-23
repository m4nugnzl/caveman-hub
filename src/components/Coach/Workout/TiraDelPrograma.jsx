import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';

import { blockSummary, blocksOf, blockTraits, intentLabel, weeksOfBlock } from '@/domain/blocks';
import { executedSessions } from '@/domain/sessions';
import { findMicrocycle } from '@/domain/training';
import { shortDate, toISODate } from '@/lib/dates';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { RenombrarEnSitio } from '@/components/ui/primitives';

/**
 * UN CARRIL QUE SE DESLIZA, Y LOS DOS DE LA BARRA LO USAN.
 *
 * Nació para las hojas —«se ven los días de entrenamiento como en dos líneas,
 * lo cual afea mucho la vista»— y desde la fila única lo necesitan también los
 * microciclos, que antes crecían hacia abajo porque tenían un renglón propio.
 * Es lo único que se ha abstraído de esta barra, y se ha abstraído porque hay
 * dos consumidores de verdad: copiado dos veces acabaría con dos acabados,
 * que es el defecto que esta pantalla lleva nueve vueltas cazando.
 *
 * Deslizar esconde, así que se paga con tres cosas: el canto que tiene más se
 * desvanece (`data-desborde`, puesto a mano en el DOM y no en estado: es
 * pintura, no un dato que tenga que re-renderizar la cabecera), la rueda del
 * ratón lo mueve sin pedir Mayús, y lo que está abierto se trae a la vista si
 * ha quedado fuera. Se mueve el `scrollLeft` y no `scrollIntoView`, que
 * arrastraría también la página (lo mismo que `WeekPicker`).
 *
 * @param activo  Si el carril está en pantalla; apagado no mide ni escucha.
 * @param cuantos Cuántas piezas lleva: cambia el ancho y hay que remedir.
 * @param mirando Qué pieza está abierta; cuando cambia, se trae a la vista.
 * @param marca   El selector de esa pieza dentro del carril.
 */
const useDeslizador = (activo, cuantos, mirando, marca) => {
  const carril = useRef(null);
  /* Un solo efecto y no dos: `asomar` tiene que volver a correr cuando el
     carril CAMBIA DE TAMAÑO —al plegar la barra lateral, al abrir el inspector
     o, la primera vez, cuando termina de cargar la fuente y todas las pastillas
     se reajustan—, y no solo cuando cambia lo que miras. Con dos efectos, la
     primera medida se tomaba con la fuente de reserva y la pastilla abierta
     acababa medio tapada por el desvanecido del canto. Medido: 24 px fuera.

     Lo que NO dispara `asomar` es el desplazamiento a mano: si mueves el
     carril para ver un microciclo lejano y te devolviera al abierto, el gesto
     sería imposible. Por eso `scroll` solo repinta los cantos. */
  useEffect(() => {
    const caja = carril.current;
    if (!caja || !activo) return undefined;
    const medir = () => {
      const izq = caja.scrollLeft > 1;
      const der = caja.scrollLeft < caja.scrollWidth - caja.clientWidth - 1;
      caja.dataset.desborde = izq && der ? 'ambos' : izq ? 'izq' : der ? 'der' : 'no';
    };
    /* Se mide con rectángulos y no con `offsetLeft`: el microciclo abierto es
       un mando con menú y va envuelto en su propia caja (`.menu-acciones`), así
       que su `offsetParent` puede no ser el carril y la cuenta saldría movida.
       Los rectángulos no dependen de quién esté posicionado. */
    const asomar = () => {
      if (caja.scrollWidth <= caja.clientWidth) return;
      const on = caja.querySelector(marca);
      if (!on) return;
      const cajon = caja.getBoundingClientRect();
      const pieza = on.getBoundingClientRect();
      /* El margen es el ancho del desvanecido: dentro de la vista pero debajo
         de la máscara sigue estando medio tapado. */
      const AIRE = 28;
      if (pieza.left >= cajon.left + AIRE && pieza.right <= cajon.right - AIRE) return;
      caja.scrollLeft += pieza.left - cajon.left - (cajon.width - pieza.width) / 2;
    };
    const rueda = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const tope = caja.scrollWidth - caja.clientWidth;
      /* En el tope, la rueda vuelve a ser de la página: un carril que se traga
         el desplazamiento vertical sin moverse es una trampa. */
      if (tope <= 0 || (e.deltaY < 0 && caja.scrollLeft <= 0) || (e.deltaY > 0 && caja.scrollLeft >= tope)) return;
      e.preventDefault();
      caja.scrollLeft += e.deltaY;
    };
    asomar();
    medir();
    const observador =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            asomar();
            medir();
          });
    observador?.observe(caja);
    caja.addEventListener('scroll', medir, { passive: true });
    caja.addEventListener('wheel', rueda, { passive: false });
    return () => {
      observador?.disconnect();
      caja.removeEventListener('scroll', medir);
      caja.removeEventListener('wheel', rueda);
    };
  }, [activo, cuantos, mirando, marca]);
  return carril;
};

/**
 * LO QUE CEDE CUANDO LA FILA NO CABE, POR PASOS Y MIDIENDO.
 *
 * La fila no envuelve nunca por encima del teléfono (`lienzo.css`): lo que
 * cede es el carril de microciclos y, por tramos de ancho, las palabras de los
 * «+». El ritmo del microciclo (`RitmoDelMicrociclo`) entró después y su ancho
 * no es fijo —siete puntos, o diez con dos huecos entre tandas—, así que un
 * tramo de ancho no sabe cuándo sobra: se mide. Lo que cede:
 *
 *   1. «+ microciclo» se queda en «+», como ya hace cuando se escribe una hoja.
 *
 * El ritmo ya no tiene nada que ceder: son solo puntos desde que la cadena
 * escrita se fue al editor, y quitarlos sería quitar el dato.
 *
 * Se aprieta cuando la fila se sale o cuando el carril de microciclos tiene
 * que deslizar sin que quede aire en medio: antes que esconder un microciclo,
 * se esconde una palabra que el icono ya dice. Todo en la misma pasada de
 * maquetación —quitar, medir, poner—, así que no hay fotograma a medias ni
 * vaivén.
 */
const PASOS_DE_APRIETO = 1;
const useApriete = () => {
  const fila = useRef(null);
  const ajustar = useCallback(() => {
    const caja = fila.current;
    if (!caja) return;
    delete caja.dataset.aprieta;
    if (getComputedStyle(caja).flexWrap !== 'nowrap') return;
    const hueco = caja.querySelector(':scope > .tira-hueco');
    const micros = caja.querySelector('.tira-micros');
    const sinAire = () =>
      hueco && hueco.getBoundingClientRect().width <= (parseFloat(getComputedStyle(hueco).minWidth) || 0) + 0.5;
    const falta = () =>
      caja.scrollWidth > caja.clientWidth + 1 || (sinAire() && micros && micros.scrollWidth > micros.clientWidth + 1);
    for (let paso = 1; paso <= PASOS_DE_APRIETO && falta(); paso += 1) caja.dataset.aprieta = String(paso);
  }, []);
  /* En cada pintado, porque lo que cambia el ancho es el contenido —otro
     ritmo, un microciclo más— y no solo la ventana. */
  useLayoutEffect(ajustar);
  useEffect(() => {
    const caja = fila.current;
    if (!caja || typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(ajustar);
    observador.observe(caja);
    return () => observador.disconnect();
  }, [ajustar]);
  return fila;
};

/**
 * LA TIRA DEL PROGRAMA: los bloques, y los microciclos del abierto.
 *
 * ══ De dónde sale ══════════════════════════════════════════════════════════
 *
 * Es la cabecera que Entreno tenía EN PRODUCCIÓN, que es la que el dueño pidió
 * recuperar: «parte a nivel visual de lo que está en producción y mejóralo».
 * Vuelve entera —el bloque y los microciclos del abierto— y con ella se van la
 * banda de hojas y el carril de Efort, que eran dos intentos de decir lo mismo.
 *
 * ══ Y desde el 20 de septiembre es UN SOLO RENGLÓN ═════════════════════════
 *
 * «Me gusta el rediseño, pero me chirría que rompa en dos filas y que pese
 * tanto.» Los dos pisos costaban 100 px de chasis en la pantalla más alta del
 * producto, la mitad de ellos para enseñar cuatro pastillas. Los ámbitos ya no
 * se reparten por ALTURA sino por el eje horizontal, que es el que sobraba:
 *
 *     Bloques › Bloque 2 ⌄ ABIERTO │ ▒M7 M8 M9 [M10 ⌄]▒ + microciclo
 *                                          + hoja │ ⟲ ⟳ │ + bloque  ⚙
 *
 * A la izquierda, FIJO, lo que dice dónde estás. En medio, ELÁSTICO, lo único
 * que crece con el programa —y por tanto lo único que desborda, deslizando y
 * con el canto desvanecido—. A la derecha, FIJO, lo que se puede hacer.
 *
 * Y con una hoja abierta, el bloque se recoge como MIGA y su sitio lo ocupan
 * las hojas —que es lo que más se cambia—; los microciclos siguen en su carril,
 * en el mismo renglón:
 *
 *     Bloques › Bloque 2 › Push A  Pull A  Pierna A  + hoja │ ▒M7…M10 ⌄▒  ···
 *
 * ══ Las tres averías que sí se arreglan ════════════════════════════════════
 *
 * Medido sobre la captura de producción a 1600 × 950:
 *
 *   1. TRES BARRAS PARA DOS COSAS. Encima de la rejilla había la fila de
 *      bloques, la de microciclos y una tercera —«MICROCICLO · Ninguna hoja
 *      tiene día asignado · Repartirlas por días»— que era un aviso con su
 *      propia altura. 208 px de chasis antes del primer ejercicio. La tercera
 *      se va: el verbo de reparto se sienta a la derecha de los microciclos,
 *      que es la fila de la que habla.
 *
 *   2. LAS BARRAS IBAN AL 30 % DE SU ANCHO, y el hueco se llenó de lecturas —
 *      desde cuándo iba el bloque, cuántos entrenamientos, qué porcentaje de lo
 *      pautado—. Duró tres vueltas: «sigo viendo mucha información en la
 *      cabecera». Todas se han ido a la tarjeta «Este bloque» y el hueco se
 *      queda vacío a propósito. Una fila no se llena porque quepa.
 *
 *   3. NO SE LLEGABA A LA CARPETA DE BLOQUES. La puerta al visor llegó a ser un
 *      chevron pelado y luego un ítem dentro del «···»; las dos veces el dueño
 *      dijo que no la encontraba. Aquí es la primera palabra de la fila —
 *      «Bloques»— pegada a los bloques que abre, como el `‹ Blocks` de Efort.
 *
 * ══ Las leyes que respeta ══════════════════════════════════════════════════
 *
 * · LA TIRA DE HOJAS VIVE SOLO DONDE LA MESA ENSEÑA UNA HOJA. Con el bloque
 *   entero delante, la rejilla YA es el dibujo de sus hojas; ponerle encima una
 *   tira de nombres es el duplicado que mató al carril, a los lomos y a la
 *   banda. Por eso `hojas` solo se pinta con `vista === 'hoja'`.
 * · Y CUANDO SE PINTA, VA LA PRIMERA. Estuvo en la fila de abajo y detrás de
 *   los microciclos: «sigue siendo incómodo cambiar de una hoja a otra, está
 *   muy a la derecha, se hace antinatural». El gesto que más se repite empieza
 *   donde empieza la vista.
 * · CADA «+» TOCA A LO QUE AÑADE, y los tres se dibujan igual (`.tira-mas`):
 *   el de microciclos pegado a su carril, el de hojas detrás de las hojas y el
 *   de bloques al canto derecho, que es donde están sus hermanos —dentro del
 *   desplegable del nombre—.
 * · Y UN MENÚ CUELGA DE LA PIEZA QUE NOMBRA A SU OBJETO. Lo del bloque, del
 *   nombre del bloque; lo del microciclo, de su pastilla. Es lo que sustituye a
 *   las dos papeleras gemelas que vivían juntas al canto derecho: el ámbito lo
 *   dice el sitio del que sale el menú, no un rótulo que haya que leer.
 * · LO QUE SE PUEDE HACER SALE DE LO QUE LLEGA. Sin `masBloque` no hay «+
 *   bloque», sin `masMicrociclo` no hay «+ microciclo». No hay ningún booleano
 *   de sólo lectura que haya que acordarse de cruzar con cada verbo. Y los tres
 *   «+» llegan ya montados (`BotonMas`) porque, desde que preguntan de qué
 *   parten, sus opciones son del dominio de la pantalla y no de esta cabecera:
 *   qué hojas hay para copiar y qué hay en el portapapeles no lo sabe una tira.
 *
 * @param vista       `'bloque'` (la rejilla delante) o `'hoja'` (una abierta).
 * @param lecturas    La frase de marcha del bloque, ya compuesta por la
 *                    pantalla si quiere; si no llega, se compone aquí.
 * @param acciones    Lo que va antes del «···»: el indicador de guardado.
 * @param herramientasDelBloque  Lo que se le puede HACER al bloque y al
 *                    programa: copiar, traer de otro cliente, traer de un
 *                    fichero y los ajustes. Se dibujan como iconos A LA VISTA
 *                    —«los botones no han de esconderse»— en su propio grupo
 *                    del canto derecho. Llegan como datos y no como botones
 *                    porque el dibujo y el orden son de esta barra y lo que se
 *                    puede hacer lo sabe la pantalla; cada uno necesita su
 *                    `icon`, que es lo único que se ve, y su `label`, que es lo
 *                    que dicen el rótulo del ratón y el lector de pantalla.
 * @param accionesDelMicrociclo  Lo que se le hace al microciclo abierto: sus
 *                    fechas, duplicarlo y borrarlo. Llegan como DATOS, igual
 *                    que las herramientas del bloque, porque el menú cuelga de
 *                    la propia pastilla del microciclo —ahí lo dibuja esta
 *                    barra— y qué se puede hacer lo sabe la pantalla. Así el
 *                    ámbito lo dice el sitio y no hace falta un «···» por fila.
 * @param derecha     Lo que se sienta al final de la fila de hojas: «+ hoja».
 * @param ritmo       El ritmo del microciclo (`RitmoDelMicrociclo`): va justo
 *                    antes de «+ hoja», con el bloque entero delante.
 * @param mandosDeLaHoja  Qué sesión se mira y cuánto lleva escrito. Van en el
 *                    renglón del microciclo —una sesión es un entrenamiento de
 *                    ESTE microciclo— y al canto DERECHO, enfrentados a las
 *                    pastillas: «la fecha de la sesión ha de ir a la derecha».
 * @param iconos      Los verbos que salen del «···» y se quedan a la vista,
 *                    como iconos. «No muestras los iconos de opciones,
 *                    muestras los ···»: lo que se usa cada día se pulsa, no se
 *                    despliega. En el «···» se queda lo raro y lo que borra.
 * @param menuDeLaHoja    El «···» con una hoja abierta. Sustituye al del
 *                    bloque, que no es de este nivel.
 */
export const TiraDelPrograma = ({
  program,
  bloque,
  semanaEnCurso,
  semana,
  unidad,
  unidades,
  esActual,
  vista = 'bloque',
  hojas = [],
  hojaAbierta = null,
  estadoDeHoja = null,
  diaDe = null,
  lecturas = null,
  acciones = null,
  derecha = null,
  ritmo = null,
  mandosDeLaHoja = null,
  iconos = null,
  herramientasDelBloque = [],
  menuDeLaHoja = null,
  accionesDelMicrociclo = [],
  masBloque = null,
  masMicrociclo = null,
  onIrBloque,
  onVerLista,
  onRenombrarBloque,
  onQuitarBloque,
  onIrSemana,
  /* Aquí estuvo `onAjustesDelMicrociclo`: pulsar la pastilla encendida abría el
     panel de fechas del microciclo, y era la ÚNICA cosa que ese gesto hacía.
     Ahora el gesto abre el menú del microciclo y las fechas son uno de sus
     ítems, con su verbo escrito — que es más de lo que decía un clic sin
     rótulo. El manejador sigue existiendo, pero llega dentro de
     `accionesDelMicrociclo` como un ítem más. */
  onAbrirHoja,
  onVerConjunto,
}) => {
  const [renombrando, setRenombrando] = useState(false);
  /*
    ── EL PLEGADO DE LOS MICROCICLOS ───────────────────────────────────────
    De diez microciclos se pintan los últimos y los anteriores viven detrás de
    un «‹ 6 más» que los despliega.

    Se quitó al pasar a la fila única —con un carril que se desliza parecía que
    ya no hacía falta— y el dueño lo devolvió: «quitaste el esconder o
    minimizar bloques, que estaba bien». Y tiene razón de sitio, no de gusto:
    deslizar y plegar no resuelven lo mismo. Deslizar reparte el ancho ENTRE
    los microciclos y los verbos —con diez pastillas dentro, el carril se come
    la fila y son los botones los que tienen que encogerse—; plegar le pone
    TECHO a la lista, y con techo la fila entera cabe sin que nada más ceda.

    `todosLosMicros` no vuelve a `false` sola: desplegar es una decisión de
    quien mira, y volver a plegarle el carril en cuanto cambia de microciclo
    sería deshacerle lo que acaba de pedir. Y el deslizamiento se queda como
    red: desplegado, el carril sigue llevándolos todos y se mueve.
  */
  const [todosLosMicros, setTodosLosMicros] = useState(false);
  /* Y lo mismo con las hojas: «N más» las despliega en la fila y ya no se
     pliegan solas. */
  const [todasLasHojas, setTodasLasHojas] = useState(false);
  /*
    ── POR QUÉ CANTO ENTRA LA LISTA ──────────────────────────────────────────
    Deslizar solo se lee como deslizar si el sentido cuenta algo: bajando —del
    bloque a una de sus hojas— la lista nueva entra por la DERECHA, como si
    viniera de más adentro; subiendo, por la izquierda. Con un sentido único
    las dos direcciones se sienten iguales y el gesto vuelve a ser un parpadeo.

    Es el patrón de «ajustar el estado durante el render» de React, no un
    efecto: el sentido tiene que estar decidido en el mismo render en el que la
    lista se remonta, y un `useEffect` llega un fotograma tarde —justo el que
    dispara la animación—.
  */
  const [vistaPrevia, setVistaPrevia] = useState(vista);
  const [sentido, setSentido] = useState('baja');
  if (vistaPrevia !== vista) {
    setVistaPrevia(vista);
    setSentido(vista === 'hoja' ? 'baja' : 'sube');
  }
  /*
    ── LAS HOJAS, EN UN SOLO RENGLÓN ─────────────────────────────────────────
    «Se ven los días de entrenamiento como en dos líneas, lo cual afea mucho la
    vista.» La lista envolvía: con la mesa estrecha —el costado al lado— cinco
    hojas salían tres arriba y dos debajo, con el titular encendido a caballo
    entre las dos. Ahora el renglón es uno y, si no caben, se desliza.

    Deslizar esconde, así que se paga con tres cosas: el canto que tiene más
    se desvanece (`data-desborde`, puesto a mano en el DOM y no en estado: es
    pintura, no un dato que tenga que re-renderizar la cabecera), la rueda del
    ratón lo mueve sin pedir Mayús, y la hoja abierta se trae a la vista si ha
    quedado fuera. Se mueve el `scrollLeft` del carril y no `scrollIntoView`,
    que arrastraría también la página (lo mismo que `WeekPicker`).
  */
  const carril = useDeslizador(vista === 'hoja', hojas.length, hojaAbierta, '.tira-eslabon.is-on');
  /* Y el de los microciclos, que desde la fila única es el otro carril de la
     barra: se desliza igual, se desvanece igual y trae a la vista la pastilla
     abierta igual. Lo que cambia es la marca de «cuál miras», que en los
     microciclos la lleva el mando con menú y no un `<button>` pelado. */
  const carrilMicros = useDeslizador(true, weeksOfBlock(program, bloque).length, semana, '.hoja-semana.is-on');
  const filaRef = useApriete();
  /*
    ── AQUÍ ESTUVO «AMPLIAR» ─────────────────────────────────────────────────
    El mando que pliega la barra lateral pasó por esta cabecera: es la pantalla
    más ancha del producto y la que pide el sitio. Duró una vuelta —«no lo
    quiero en la cabecera de Entreno, ha de ser en el borde de la página para
    todas las páginas»— y el motivo de fondo es que un mando del CHASIS no
    puede vivir dentro de una pantalla: había que estar aquí para plegar y para
    devolver. Hoy es un asa fuera del flujo en el canto del lienzo, la misma en
    las once pantallas y sin calle reservada en ninguna (`ui/Pliegue`).
  */
  const bloques = blocksOf(program);
  const microcycles = program?.microcycles || [];
  const inicial = (unidad || 'Microciclo').charAt(0).toUpperCase();
  const unidadBaja = (unidad || 'Microciclo').toLowerCase();
  const unidadesBajas = (unidades || 'microciclos').toLowerCase();

  const tramos = bloques.map((b, i) => ({
    b,
    i,
    esEste: b.id === bloque.id,
    r: blockSummary(program, b),
    semanas: weeksOfBlock(program, b),
  }));
  const abierto = tramos.find((t) => t.esEste) || null;
  /*
    ── CUÁNTOS MICROCICLOS CABEN EN EL RENGLÓN ─────────────────────────────
    Cinco, y los anteriores detrás de «‹ N más». No es un número de diseño
    sino de sitio: con el camino del bloque a la izquierda y los cinco verbos a
    la derecha, la sexta pastilla empieza a comerse los botones en un portátil
    de 1440 con el inspector abierto.

    Sube de cuatro a cinco porque la fila única le devuelve a la lista el ancho
    que antes gastaba el renglón de al lado — el sitio que se gana no se deja
    vacío, se le da a lo que se mira.

    El tramo se cuenta desde el que MIRAS y no desde el final: abrir el M2 de
    un bloque de diez tiene que enseñar el M2.
  */
  const MICROS_A_LA_VISTA = 5;
  const semanasDelBloque = abierto?.semanas || [];
  const desdeMicro = todosLosMicros
    ? 0
    : Math.max(
        0,
        Math.min(
          Math.max(0, semanasDelBloque.indexOf(semana)),
          semanasDelBloque.length - MICROS_A_LA_VISTA,
        ),
      );
  const microsALaVista = semanasDelBloque.slice(desdeMicro);
  const ocultos = desdeMicro;
  /*
    ── Y CUÁNTAS HOJAS ──────────────────────────────────────────────────────
    El mismo techo que los microciclos, y por lo mismo: el renglón es uno y lo
    que crece sin techo se come los verbos. Seis porque «las sesiones de 6 días
    han de verse enteras»: un reparto de lunes a sábado es el caso largo normal
    y no puede esconder nada. Con más, las cinco primeras y detrás «N más», que
    las despliega en la fila como los microciclos —no un menú—. La abierta
    nunca se esconde: si cae fuera, ocupa el último sitio. Y nunca sale un
    «1 más», que ocuparía lo mismo que la hoja que esconde.
  */
  const HOJAS_A_LA_VISTA = 6;
  const indices = hojas.map((_, i) => i);
  const hojasALaVista =
    todasLasHojas || hojas.length <= HOJAS_A_LA_VISTA
      ? indices
      : hojaAbierta != null && hojaAbierta >= HOJAS_A_LA_VISTA - 1
        ? [...indices.slice(0, HOJAS_A_LA_VISTA - 2), hojaAbierta]
        : indices.slice(0, HOJAS_A_LA_VISTA - 1);
  const hojasOcultas = indices.filter((i) => !hojasALaVista.includes(i));
  const intent = intentLabel(blockTraits(bloque).intent);

  /*
    ── LA CABECERA YA NO LLEVA LA MARCHA DEL BLOQUE ──────────────────────────
    Aquí estuvieron, una detrás de otra, «7 de 8 entrenamientos · 88 % de lo
    pautado», «desde el 14 ago» y «le quedan dos microciclos». Cada vez que se
    quitaba una, entraba la siguiente: la fila tenía hueco y el hueco se
    llenaba. El dueño, tres veces seguidas: «sigo viendo mucha información en
    la cabecera».

    Así que la regla deja de ser «cabe» y pasa a ser: la cabecera IDENTIFICA
    —qué bloque es y en qué estado está— y las lecturas se leen en su tarjeta,
    «Este bloque», que es la que existe para eso y adonde ha ido «desde el 14
    ago» (ver `LecturasDelBloque`). El hueco que queda no se rellena: es el
    aire que separa lo que dice dónde estás de lo que puedes hacer.

    `lecturas` sigue siendo una puerta abierta —la pantalla puede decir aquí
    otra cosa si un día hace falta—, pero nadie la usa.
  */
  const cuando = [lecturas, esActual ? null : 'cerrado'].filter(Boolean).join(' · ');

  /*
    ══ UN MENÚ POR NIVEL, Y NADA MÁS QUE SU NIVEL ════════════════════════════

    «Los botones de opciones, no me gusta nada esconderlos todos ahí; deberíamos
    tener opciones sencillas y cómodas para trabajar a mano.»

    Aquí dentro había SIETE ítems de TRES niveles distintos: renombrar y quitar
    el bloque, componer el siguiente, traer el programa de otro cliente, traer
    de un fichero, los ajustes del programa y eliminar el microciclo abierto.
    Un menú así no se lee: se rebusca. Y encima repetía la pantalla —«componer
    el bloque siguiente» es literalmente el «+ bloque» que tiene a tres dedos a
    la izquierda, con el mismo manejador—, así que abrirlo era a veces
    encontrar lo que ya estaba a la vista.

    La cuenta nueva:

      · Lo de DIARIO sale como botón, en el grupo de su nivel: traer ejercicios
        y los ajustes del programa con el bloque; «+ hoja» con el microciclo.
      · Lo que se toca poco y lo que BORRA se queda en un «···» —el gesto de
        más ES la confirmación, que quitar no la pide en ninguna parte—, pero
        cada uno en SU renglón: este lleva lo del bloque y el de abajo lo del
        microciclo. Dos ítems cada uno, que se abarcan de una mirada.
      · Y lo que ya está en la pantalla no se repite dentro.
  */
  /*
    ── LA PAPELERA DEL BLOQUE, Y NADA MÁS ────────────────────────────────────
    El «···» tenía dos ítems y uno sobraba: «Renombrar «Bloque 2»» ya se hace
    pulsando el nombre, que está a dos dedos y encendido. El dueño: «renombrar
    (que ya renombras clicando el nombre) y eliminar» — o sea, una sola acción
    de verdad, y una acción sola no es un menú.

    Queda la papelera a la vista. Puede porque `onQuitarBloque` pregunta antes
    (`quitarBloque` en `WorkoutLogEditor` usa `useConfirm`); si algún día no
    preguntara, esto sería un clic que se lleva un bloque.

    ── Y SE QUEDA A LA VISTA CON UN SOLO BLOQUE, APAGADA (séptima vuelta) ────
    «Has de añadir borrar bloque.» No estaba porque con un solo bloque no se
    puede: un bloque es el CORTE entre dos etapas —«de aquí en adelante entrena
    otra cosa»—, quitarlo es deshacer ese corte y sus semanas pasan enteras al
    bloque de al lado. Con uno solo no hay corte que deshacer ni vecino a quien
    dárselas, y el dominio lo dice por escrito: `deleteBlockFrom` devuelve el
    programa intacto (`blocks.js`, «siempre queda al menos un bloque»).

    Lo que sí era un defecto es que DESAPARECIERA: el verbo existe, la fila del
    prototipo lo dibuja, y una barra que cambia de piezas según cuántos bloques
    tenga el programa es una barra que hay que volver a aprender. Así que se
    queda siempre y se apaga cuando no aplica, con el porqué en su título — que
    es lo que un botón apagado tiene que hacer para no ser un misterio.
  */
  const unicoBloque = tramos.length < 2;
  /*
    ══ Y VUELVE A SER UN «···», PORQUE LO QUE HAY DENTRO BORRA (19 sep) ══════
    La papelera estaba a la vista —el párrafo de arriba cuenta por qué— y el
    dueño la retira: «las acciones destructivas no deben ser botones directos».
    Es la regla de la casa para lo que no tiene vuelta atrás, y aquí se aplica
    aunque `quitarBloque` pregunte antes: un cuadradito rojo en la barra es una
    diana permanente para el codo.

    Lo que NO se pierde es lo que aquella vuelta arregló: el verbo sigue
    existiendo con un solo bloque y sigue diciendo por qué no se puede, ahora
    como ítem apagado con su título (`desactivado`, en `MenuAcciones`). Un menú
    que se queda vacío sería lo mismo que la desaparición que se corrigió.
  */
  /*
    ══ Y EL «···» PASA A SER EL ENGRANAJE DEL BLOQUE (19 sep, décima vuelta) ══
    «Un botón de engranaje/opciones con menú desplegable para renombrar o
    eliminar el bloque.»

    Lo que cambia no es el dibujo sino QUÉ CABE DENTRO. El «···» llevaba una
    sola cosa —quitar— y al lado, en la misma esquina, un botón «Acciones» con
    rótulo llevaba las otras cinco: copiar el bloque, traerlo de otro cliente,
    traerlo de un fichero, los ajustes del programa y quitar el microciclo. Dos
    menús pegados, y el reparto entre ellos no lo decidía el nivel del que
    hablan sino en qué vuelta se escribió cada uno.

    Ahora hay UNO por fila y cada uno lleva su nivel: este —el engranaje— lleva
    todo lo del bloque y del programa, y el de abajo lo del microciclo. Dentro,
    el orden de la casa: lo que NOMBRA primero, lo que trae y configura en
    medio, y lo que borra al final, detrás de un filete y en rojo.

    Renombrar entra aquí y sale del desplegable del nombre: allí era un verbo
    colado al final de una lista de HERMANOS —el menú que elige bloque— y se
    leía como un sexto bloque. El selector vuelve a ser solo un selector.
  */
  /*
    ══ LOS VERBOS DEL BLOQUE: TODOS JUNTOS Y TODOS A LA VISTA (20 sep) ═══════
    «Los botones son todos del bloque, no entiendo por qué separas y pones la
    papelera aparte.»

    Dentro del engranaje vivían seis ítems y ninguno se ganaba el escondite:
    copiar el bloque, traerlo de otro cliente, traerlo de un fichero, los
    ajustes del programa, renombrar y quitar. Se usan con las manos, no se
    buscan, y cada uno costaba dos gestos —abrir el menú, leer seis renglones,
    elegir—. Salen a la barra como iconos, en el orden de la casa: lo que
    NOMBRA, lo que SALE, lo que ENTRA (dos), lo que CONFIGURA y lo que QUITA.

    ── Y LA PAPELERA VA DENTRO DEL GRUPO, NO APARTE ────────────────────────
    Estuvo un rato sola al final del renglón, con el argumento de que lo que
    borra no se mezcla con lo que copia. Lo que ese argumento no miraba es que
    TODOS estos verbos son del mismo objeto, y el orden de la fila lo contaba
    al revés: «+ bloque» —que no actúa sobre este bloque, sino que empieza
    otro— quedaba en medio, partiendo en dos un grupo que es uno solo. Un
    mando pertenece al sitio del que habla, y el sitio de éste es el bloque.
    Lo que lo distingue de sus vecinos es que se enciende en ROJO al acercarse
    (`btn-icon-danger`), no su domicilio.

    ── Lo que hace que la papelera se pueda sostener a la vista ────────────
    Va contra una regla que el propio dueño escribió el 19 de septiembre —«las
    acciones destructivas no deben ser botones directos»— y que ha revocado
    dos veces desde entonces, así que manda la decisión nueva. Se sostiene
    porque el gesto NO ES el que borra: `quitarBloque` abre una confirmación
    que dice el nombre del bloque y a dónde se van sus microciclos (`useConfirm`
    en `WorkoutLogEditor`). El cuadradito rojo es la puerta de esa pregunta. Si
    algún día esa confirmación se quitara, esto pasaría a ser un clic que se
    lleva un bloque.

    Y se queda APAGADO con un solo bloque: no hay corte que deshacer ni vecino
    a quien darle sus microciclos, y `deleteBlockFrom` devolvería el programa
    intacto. No desaparece —una barra que cambia de piezas según cuántos
    bloques tenga el programa es una barra que hay que volver a aprender—; se
    apaga, con el porqué en su rótulo.

    ── Y la avería que hay que no volver a cometer ─────────────────────────
    Estos ya estuvieron a la vista y el dueño los mandó juntar: «la fila
    remataba con cuatro cuadraditos que se distinguían solo por el dibujo del
    icono». Lo que aquello no tenía era SEPARACIÓN: iban pegados entre sí y
    pegados a la papelera del MICROCICLO —otro ámbito— sin filete y sin orden.
    Aquí van en UNA caja cerrada por filetes, con el hueco de dentro más
    apretado que el de fuera: el ojo lee una cosa —lo que puedes hacerle a este
    bloque— y no seis.
  */
  const verbosDelBloque = [
    /* Lo que NOMBRA va primero: es el orden de la casa para un grupo de verbos,
       y es además el que menos se parece a sus vecinos —el único que actúa
       sobre el rótulo y no sobre el contenido—. */
    onRenombrarBloque && { icon: Pencil, label: 'Renombrar el bloque', run: () => setRenombrando(true) },
    ...herramientasDelBloque,
    onQuitarBloque && {
      icon: Trash2,
      /* El rótulo del ratón dice el PORQUÉ cuando está apagado: un botón
         desactivado sin explicación es una avería aparente. */
      label: unicoBloque
        ? `No se puede quitar el único bloque`
        : `Quitar «${bloque.name}»`,
      rotulo: `Quitar «${bloque.name}»`,
      destructivo: true,
      desactivado: unicoBloque,
      run: () => onQuitarBloque(bloque),
    },
  ].filter(Boolean);

  const grupoDelBloque =
    verbosDelBloque.length > 0 ? (
      <>
        <span className="tira-divisor" aria-hidden="true" />
        {/* UNA CAJA, y no seis botones sueltos. Es la diferencia exacta entre
            esto y los «cuatro cuadraditos» que el dueño mandó juntar en su día:
            entonces iban pegados a sus vecinos y sin nada que dijera dónde
            empezaban y dónde acababan, así que la fila remataba en una hilera
            de mandos intercambiables. */}
        <span className="tira-grupo" role="group" aria-label={`Acciones de «${bloque.name}»`}>
          {verbosDelBloque.map(({ icon: Icono, label, rotulo, run, destructivo, desactivado }) => (
            <button
              key={label}
              type="button"
              className={`btn btn-icon btn-icon-compact${destructivo ? ' btn-icon-danger' : ''}`}
              title={label}
              aria-label={rotulo || label}
              disabled={desactivado || undefined}
              onClick={run}
            >
              {Icono ? <Icono size={15} aria-hidden="true" /> : null}
            </button>
          ))}
        </span>
        <span className="tira-divisor" aria-hidden="true" />
      </>
    ) : null;

  /*
    ══ Y VUELVEN LOS DOS PISOS, UNO POR NIVEL (19 sep, décima vuelta) ════════
    «Rediseña la barra para reflejar la jerarquía real del entrenamiento: fila
    superior de gestión de bloque, fila inferior la línea de tiempo de
    microciclos.»

    El 17 de septiembre las dos filas se fundieron en una porque, con el bloque
    delante, la de abajo solo llevaba el carril y «+ hoja» y parecía una altura
    de cabecera gastada. El argumento era de SITIO y se pagó en LECTURA: en un
    renglón único, «Bloque 1», «ABIERTO», «M8», «+ microciclo» y «+ hoja»
    quedan a la misma altura y con el mismo peso, y lo único que decía cuál
    contiene a cuál era un filete vertical de 20 px. Un bloque contiene
    microciclos y un microciclo contiene hojas: la jerarquía existe, y una
    barra que la dibuja plana obliga a recordarla.

    Así que el reparto vuelve a ser por NIVEL y no por vista:

      fila 1   Bloques › [Bloque 2 ▾] [ABIERTO]          ⟲ ⟳ │ + bloque  ⚙
      fila 2   [ M7 ][ M8 · en curso ][ M9 ][ M10 ] + microciclo   + hoja  ···

    Cada fila lleva SU nombre a la izquierda, SU «+» pegado a lo que añade y SU
    menú de opciones al canto derecho. Lo que costó la fusión —una altura— se
    recupera con creces: las dos filas son más bajas que la única, porque
    ninguna tiene que caber junto a la otra.
  */
  /* ── LAS OPCIONES DEL DESPLEGABLE: SOLO LOS HERMANOS ─────────────────────
     Los hermanos, con la marca puesta en el que estás: eso es lo que hace de
     un menú un SELECTOR y no una lista de verbos. Y NADA MÁS que los hermanos
     desde la décima vuelta: «Renombrar este bloque» colgaba aquí al final,
     detrás de un filete, y era un verbo metido en una lista de sitios —se leía
     como un bloque más—. Se ha ido al engranaje, que es el sitio de los
     verbos del bloque.

     El `sub` de cada uno es lo que hacía falta para elegir y la hilera no
     decía: cuántos microciclos lleva, desde cuándo va y si el de en curso es
     suyo. Es el mismo menú-navegador que ya usa el microciclo — ver `sub` en
     `MenuAcciones`, que nació para esto. */
  const opcionesDelBloque = [
    ...tramos.map(({ b, esEste, r, semanas }) => {
      const cuando = r.desde
        ? `${shortDate(r.desde)}${r.abierto ? ' · abierto' : r.hasta ? ` – ${shortDate(r.hasta)}` : ''}`
        : 'sin fechas';
      const aqui = semanaEnCurso != null && semanas.includes(semanaEnCurso);
      return {
        label: b.name,
        sub: [
          `${semanas.length} ${semanas.length === 1 ? unidadBaja : unidadesBajas}`,
          cuando,
          aqui && !esEste ? 'estás aquí' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        on: esEste,
        /* El abierto no navega a ninguna parte: ya estás en él. Se queda en el
           menú porque un selector sin la opción puesta no dice dónde estás. */
        run: () => {
          if (!esEste) onIrBloque(b);
        },
      };
    }),
  ];

  /* Las chapas del bloque. Con el bloque delante se van con su nombre —que es
     de lo que hablan— y no al canto derecho; en el frame, «ABIERTO» va pegado
     a «Bloque 1». */
  const chapasDelBloque = (
    <>
      {vista !== 'hoja' && intent && <span className="bl-chapa">{intent}</span>}
      {vista !== 'hoja' && esActual && <span className="bl-chapa is-abierto">abierto</span>}
      {vista !== 'hoja' && cuando && <span className="tira-dato">{cuando}</span>}
    </>
  );

  /* Lo que cierra la fila del BLOQUE: el indicador de guardado y los verbos de
     diario como iconos. */
  const colaDelBloque = (
    <>
      {acciones}
      {/* ── LOS VERBOS DE DIARIO, A LA VISTA ────────────────────────────
          «No muestras los iconos de opciones, muestras los ···.» Duplicar una
          hoja o abrir sus alternativas se hace a diario y estaba a dos gestos
          —abrir el menú, leer cinco líneas, elegir—; ahora es un icono que se
          pulsa. Al «···» se queda lo que se toca una vez al mes y lo que
          borra, que ahí está bien guardado. */}
      {iconos}
    </>
  );

  /* Lo que cierra la fila: con una hoja abierta, su «···» —ahí sí quedan
     varias cosas y alguna borra—; con el bloque entero delante no cierra nada,
     porque lo del bloque ya está a la vista en su grupo y el último trazo del
     renglón es «+ bloque», el verbo de alta de todas las cintas de la casa. */
  const cierreDelNivel = vista === 'hoja' ? menuDeLaHoja : null;

  /* ══ EL NIVEL DEL MICROCICLO ═══════════════════════════════════════════════
     Sale del JSX para poder sentarse en la fila sin escribirlo dos veces. */
  const nivelDelMicro = abierto ? (
    <>
      {/*
        ══ EL CARRIL DE LOS MICROCICLOS (20 sep · la fila única) ═════════════
        «Me gusta el rediseño, pero me chirría que rompa en dos filas y que pese
        tanto.»

        La línea de microciclos ocupaba un renglón entero para ella sola, y un
        renglón de cabecera cuesta 50 px de rejilla en la pantalla más alta del
        producto. Sube a la fila del bloque y se queda con lo único elástico que
        hay en ella: a su izquierda el camino —que es fijo, dice dónde estás— y
        a su derecha los verbos —que son fijos, dicen qué puedes hacer—. Entre
        los dos, esto, que es lo que crece con el programa y por tanto lo único
        que puede desbordar.

        Y lo que hace que quepa son DOS cosas, no una: la lista tiene techo —los
        últimos a la vista y los anteriores detrás de «‹ N más»— y, por debajo
        de ese techo, el carril se desliza (`useDeslizador`) con el canto
        desvanecido y el abierto traído a la vista. El techo es lo que protege a
        los VERBOS: sin él, un bloque de veinte microciclos se come la fila y
        son los botones los que se quedan sin sitio. NUNCA envuelve, que es lo
        que movía la rejilla de abajo.
      */}
      <div
        className="tira-micros"
        ref={carrilMicros}
        data-desborde="no"
        role="group"
        aria-label={`${unidades} de ${bloque.name}`}
      >
        {/* ── LOS ANTERIORES, PLEGADOS ──────────────────────────────────────
            Se despliega y no se vuelve a plegar: desplegar es una decisión de
            quien mira. Va dentro del carril porque es el primer eslabón de la
            misma lista —«y antes de estos, seis más»— y fuera se leería como un
            verbo de la barra. */}
        {ocultos > 0 && (
          <button
            type="button"
            className="hoja-semana is-mas"
            onClick={() => setTodosLosMicros(true)}
            title={`Ver ${ocultos === 1 ? `el ${unidadBaja} anterior` : `los ${ocultos} ${unidadesBajas} anteriores`}`}
          >
            <ChevronLeft size={13} aria-hidden="true" />
            <span className="hoja-semana-estado">{ocultos} más</span>
          </button>
        )}
        {microsALaVista.map((w) => {
          const micro = findMicrocycle(microcycles, w) || {};
          const iso = toISODate(micro.date);
          const hecha = executedSessions(micro).length > 0;
          const n = w - abierto.b.fromWeek + 1;
          const nombre = `${unidad} ${n}`;
          const cuantasHojas = (micro.days || []).length;
          /*
            ══ SELECCIÓN Y ESTADO DEJAN DE COMPETIR ══════════════════════════
            «Hoy "M8 · en curso" y "M10" seleccionado compiten. Distingue
            selección (dónde estoy) de estado (qué está vivo).»

            Competían porque las dos se decían con lo mismo: la palabra «en
            curso» pintada en acento al lado del número engordaba la pastilla
            58 px y la hacía el objeto más llamativo del renglón, justo en la
            que NO estás. Dos acentos azules en una hilera de cuatro y ninguno
            dice cuál es cuál.

            La regla nueva es de dos canales y no admite empate:

              · SELECCIÓN — el relleno. Azul lleno, uno solo, siempre.
              · ESTADO    — el punto de delante. Verde entrenado, azul en
                curso, hueco por hacer.

            Cuando coinciden —estás en el que está en curso— el punto se vuelve
            blanco sobre el azul y se siguen leyendo los dos. La palabra se va
            al rótulo del ratón, que es donde cabe entera y donde además puede
            decir cuántas hojas lleva y cuándo empieza.
          */
          const marca = w === semanaEnCurso ? 'is-curso' : hecha ? 'is-hecha' : 'is-pendiente';
          const comoVa = w === semanaEnCurso ? 'en curso' : hecha ? 'entrenado' : 'por hacer';
          const ficha = [
            nombre,
            `${cuantasHojas} ${cuantasHojas === 1 ? 'hoja' : 'hojas'}`,
            iso ? `empieza el ${shortDate(iso)}` : null,
            comoVa,
          ]
            .filter(Boolean)
            .join(' · ');
          const punto = <span className="hoja-semana-punto" aria-hidden="true" />;
          const dorsal = (
            <span className="hoja-semana-n">
              {inicial}
              {n}
            </span>
          );

          /*
            ══ Y EL MICROCICLO ABIERTO LLEVA SU PROPIO MENÚ ══════════════════
            «La versión anterior tenía dos papeleras en la misma fila porque en
            esta página conviven los dos ámbitos. Era feo pero útil: podía
            borrar y manipular microciclos sin salir. No quiero volver a las
            dos papeleras; quiero una idea mejor.»

            La idea es que un menú CUELGUE DE LA PIEZA QUE NOMBRA A SU OBJETO.
            Las dos papeleras eran feas porque estaban las dos al canto derecho,
            idénticas, a novecientos píxeles de aquello de lo que hablaban: para
            saber cuál borraba el microciclo y cuál el bloque había que pasar el
            ratón y leer. Y quitar una de las dos no arreglaba eso, solo quitaba
            la mitad de la comodidad —que es lo que pasó en la vuelta anterior,
            cuando el borrado del microciclo se fue al «···» del bloque—.

            Ahora el ámbito lo dice el SITIO: lo del bloque cuelga del nombre
            del bloque (el engranaje, a su lado) y lo del microciclo cuelga de
            su pastilla. No hay ningún mando duplicado y no hace falta leer
            ningún rótulo para saber qué borra qué — lo dice de dónde sale.

            Y lo que borra lo dice además con el nombre puesto: «Borrar M10 y
            sus 4 hojas» (`accionesDelMicrociclo`, en `WorkoutLogEditor`).

            Solo la abierta: una pastilla apagada es un SITIO al que ir, y
            colgarle un menú a cada una convertiría la hilera en diez mandos
            desplegables. En la que ya estás no hay viaje que ofrecer, así que
            el gesto queda libre — es el mismo cambio que ya hizo el bloque
            cuando su titular pasó a ser desplegable.
          */
          if (w === semana) {
            return (
              <MenuAcciones
                key={w}
                clase={`hoja-semana is-on ${marca}`}
                label={
                  <>
                    {punto}
                    {dorsal}
                  </>
                }
                ariaLabel={`${nombre}, ${comoVa}. Opciones de este ${unidadBaja}`}
                titulo={`${ficha} · sus opciones`}
                alineado="izquierda"
                items={accionesDelMicrociclo}
              />
            );
          }
          return (
            <button
              key={w}
              type="button"
              className={`hoja-semana ${marca}`}
              onClick={() => onIrSemana(w)}
              title={`Abrir ${ficha.charAt(0).toLowerCase()}${ficha.slice(1)}`}
            >
              {punto}
              {dorsal}
            </button>
          );
        })}
      </div>
      {/* Fuera del carril, que es de las pastillas: añadir un microciclo no es
          elegir uno, y dentro se deslizaría con ellas hasta salirse de la
          vista. Pegado a ellas por la ley de la casa: cada «+» toca a lo que
          añade. */}
      {masMicrociclo}
    </>
  ) : null;

  /* Y lo que cierra su renglón: «+ hoja», los verbos del microciclo y su
     papelera. */
  const colaDelMicro = abierto ? (
    <>

          {/* ── Y AQUÍ SÍ VA «+ hoja» ─────────────────────────────────────
              Estuvo prohibido en este renglón mientras el verbo existía también
              al final de la rejilla: el mismo verbo dos veces es la avería que
              esta pantalla lleva nueve vueltas cazando. Abajo ya no hay
              ninguno —caía a novecientos píxeles del titular, y como columna de
              la retícula se descolgaba a la fila de abajo en cuanto el ancho no
              daba para una pista más—, así que este es su sitio: el renglón del
              microciclo, que es de quien son las hojas, al lado de «+
              microciclo», que es el otro «uno más» de la pantalla. Lo pone
              `WorkoutLogEditor`.

              Solo con el bloque entero delante: con una hoja abierta, la tira
              de hojas de la fila 1 ES la lista a la que añade, y el verbo se va
              con ella. Sigue habiendo UNO solo. */}
          {/* El ritmo del microciclo, delante: qué días se entrena en esta
              vuelta, y el editor entero al pulsarlo. Es del mismo nivel que
              «+ hoja» —las hojas y sus días son del microciclo— y por eso va
              en su grupo y no en el del bloque. */}
          {vista !== 'hoja' && ritmo}
          {vista !== 'hoja' && derecha}
    </>
  ) : null;


  return (
    <nav className="tira" aria-label="El programa de esta persona">
      {/*
        ══ FILA 1 · EL CAMINO, Y LA LISTA DEL NIVEL QUE MIRAS ════════════════

        ── AQUÍ ESTUVO LA FLECHA DE VOLVER ──────────────────────────────────
        «La flecha hacia atrás no me gusta, me gusta más estilo deslizar.»

        Y la flecha era el síntoma, no la avería: esta fila no deslizaba, se
        SUSTITUÍA. Con el bloque delante llevaba «Bloques · Bloque 1 · +
        bloque»; al abrir una hoja se tiraba entera y en su sitio aparecía
        «← Bloque 1 · sus hojas». Como el nivel de arriba desaparecía, hacía
        falta un mando que lo trajera de vuelta, y ese mando era la flecha.

        Ahora la fila es UNA y solo crece o encoge por la izquierda: el nivel
        que abres se recoge como miga y su lista entra deslizando desde el
        canto. Volver es pulsar la miga —el sitio al que ya estás mirando para
        saber dónde estás—, así que no hace falta ningún mando aparte.

            Bloques ›  Bloque 1    Bloque 2   + bloque
            Bloques ›  Bloque 1 ›  Lower A   Upper A   Lower B

        ── Y LA JERARQUÍA LA PONE EL CUERPO, NO LA CAJA ─────────────────────
        «La fuente y el diseño de los nombres de bloque y hoja no me gustan.»

        Lo que fallaba no era el acabado: era que el CONTENEDOR y su CONTENIDO
        pesaban lo mismo. Un bloque era una pastilla de 14/600 con marco y una
        hoja otra de 14/500, así que los dos renglones se leían como dos
        hileras de chips del mismo rango y ninguno decía qué contiene a qué.

        La regla nueva es una sola y vale para los dos niveles: EL TITULAR ES
        EL ÚLTIMO ESLABÓN. Lo que está encendido en la lista de delante lleva
        el nombre grande —tinta llena, sin caja—, sus hermanos van en voz baja
        y todo lo que queda a su izquierda son migas. Se van los recuadros:
        nada que sea texto lleva marco.

        Y por eso los dos niveles comparten pieza (`.tira-eslabon`): elegir un
        bloque y elegir una hoja son la misma pregunta hecha un escalón más
        adentro, y esta cabecera lleva diez vueltas pagando el haberla dibujado
        de dos maneras.

        Lo que NO se hace: cambiar de fuente. `--font-ancha` ya se probó para
        rótulos de pantalla y el dueño la tumbó —«chirría»—; queda reservada a
        las cifras y a la portada del producto (ver `.cartera-cab-titulo` en
        `chasis.css`). Aquí manda la misma Archivo del resto, y lo que separa a
        un titular de su hermano es el cuerpo, el peso y el interletrado.
      */}
      <div className="tira-fila is-una" ref={filaRef}>
        <div className="tira-camino">
          {/* La puerta al visor: una palabra, y la primera del camino. Fue un
              chevron pelado y luego un ítem dentro del «···», y las dos veces
              el dueño dijo lo mismo: «no puedo acceder a la carpeta con los
              bloques».

              ── Y SE VA LA CARPETA (20 sep) ──────────────────────────────────
              «El icono de carpeta no me convence del todo: no es una carpeta,
              es un bloque de entrenamiento.» Y es verdad por dos lados. Miente
              sobre lo que hay detrás —un bloque es un TRAMO del programa, no un
              contenedor de ficheros— y además es el único dibujo de una zona
              que por lo demás es texto: en un camino, lo que dice que hay más
              niveles es el chevron que viene detrás, no un glifo delante del
              primero.

              No se sustituye por otro. Se probó la pila de hojas y sigue siendo
              un segundo dibujo a cuarenta píxeles del nombre propio, que es lo
              que de verdad nombra lo que se abre. La palabra basta. */}
          {onVerLista && (
            <>
              <button type="button" className="tira-miga" onClick={onVerLista} title="Todos los bloques">
                Bloques
              </button>
              <ChevronRight size={13} className="tira-paso" aria-hidden="true" />
            </>
          )}

          {/* La miga del bloque SOLO existe con una hoja abierta: mientras se
              mira el bloque entero, el bloque no es una miga — es el titular
              de la lista que tiene al lado, y decirlo dos veces en el mismo
              renglón es el error que aquí ya se ha cometido cuatro veces. */}
          {vista === 'hoja' && (
            <>
              {/* ── Y VA SIN ICONO ──────────────────────────────────────────
                  Llevó unas capas, con el argumento de que sin glifo el nombre
                  del bloque es tinta terciaria —un título apagado— y no se ve
                  que sea la puerta de vuelta. El dueño: «lo único que no me
                  gusta es el icono de las capas en Bloque 1, quítalo».

                  Y tenía poco que defender: la carpeta de «Bloques» dice qué
                  hay DETRÁS de una palabra que no es el nombre de nada, y por
                  eso se gana el sitio. Aquí el nombre propio ya dice qué se
                  abre, y el chevron de al lado dice que hay camino. El glifo
                  solo añadía un segundo dibujo en un renglón que empieza con
                  otro a cuarenta píxeles. */}
              <button
                type="button"
                className="tira-miga"
                onClick={onVerConjunto}
                title={`Ver «${bloque.name}» entero (Esc)`}
              >
                {bloque.name}
              </button>
              <ChevronRight size={13} className="tira-paso" aria-hidden="true" />
            </>
          )}

          {/*
            ── LA LISTA QUE DESLIZA ──────────────────────────────────────────
            `key={vista}` la remonta al cambiar de nivel, que es lo que dispara
            la entrada, y `data-sentido` dice por qué canto entra: bajando, del
            derecho; subiendo, del izquierdo. El recorrido es corto a propósito
            —10 px— porque un deslizamiento largo en una cabecera que se usa
            cincuenta veces al día deja de ser un gesto y pasa a ser una espera.
            Con `prefers-reduced-motion` no se mueve nada.

            El `tablist` envuelve SOLO las pestañas y va en `display: contents`
            (el mismo apaño que `.tira-micros`): «+ bloque» no es una pestaña y
            estaba dentro de la lista, que es como se cuela un botón en el árbol
            de accesibilidad como si fuera una opción más.
          */}
          <div
            className={`tira-lista${vista === 'hoja' ? ' is-carril' : ''}`}
            key={vista}
            data-sentido={sentido}
            ref={carril}
          >
            {/* ── EL BLOQUE ES UN DESPLEGABLE, NO UNA HILERA ───────────────
                «Los bloques se ven como desplegable, de manera que bloque 1 se
                despliega y eliges bloque.» Es lo que dibuja el frame: UN mando
                con su flecha (`block-trigger`), no seis pastillas seguidas.

                Y no es solo copiar el dibujo. La hilera tenía dos averías que
                se ven en cuanto un programa lleva año y medio:

                  · CRECÍA SIN TECHO. Ocho bloques son ocho nombres propios
                    cruzando la fila, y la fila ya lleva los microciclos, los
                    dos «+» y los cuatro iconos. Era lo que obligaba a envolver
                    la barra entre 1440 y 1490 px.
                  · Y LO QUE SE MIRA PESABA LO MISMO QUE LO QUE NO. El bloque
                    abierto es uno; sus hermanos son sitios a los que se puede
                    saltar, y para eso no hacen falta a la vista — hacen falta
                    cuando se va a saltar.

                Lo que NO cambia es la lógica: saltar a un hermano sigue siendo
                `onIrBloque`, y renombrar sigue siendo `onRenombrarBloque` sobre
                el mismo campo en sitio. Lo único que se mueve es el GESTO de
                renombrar: pulsar el titular abría el campo y ahora abre el
                menú, así que renombrar pasa a ser un ítem CON SU VERBO ESCRITO
                — que es más de lo que decía un cursor de texto. */}
            {vista !== 'hoja' &&
              (renombrando ? (
                <RenombrarEnSitio
                  value={bloque.name}
                  label="Nuevo nombre del bloque"
                  onRename={(nombre) => onRenombrarBloque(bloque.id, nombre)}
                  onDone={() => setRenombrando(false)}
                />
              ) : (
                <MenuAcciones
                  clase="tira-eslabon is-on tira-desplegable"
                  label={<span className="tira-eslabon-nombre">{bloque.name}</span>}
                  ariaLabel={`Bloque abierto: ${bloque.name}. Cambiar de bloque`}
                  alineado="izquierda"
                  items={opcionesDelBloque}
                />
              ))}

            {/* ── LAS HOJAS, EN SU PISTA (21 sep) ─────────────────────────
                «Iguala la línea al como se ve en la página de bloques, y haz
                que las sesiones, si son muchas, ocurra igual que microciclo.»
                Eran pastillas sueltas con canto, cada una la suya, al lado de
                una pista de microciclos que ya era un segmentado: dos dibujos
                para la misma pregunta —«¿dónde trabajo?»— en el mismo
                renglón. Ahora las hojas van en una pista igual, y la abierta
                levanta papel blanco; el relleno azul se queda para el
                microciclo, que es DÓNDE ESTÁS en el tiempo (uno solo).

                Y con techo, como los microciclos: más de `HOJAS_A_LA_VISTA` y
                el resto va detrás de «N más», que las despliega EN LA FILA.
                Fue un menú una vuelta; el dueño: «cuando le des a más que
                amplíe, no que salte un popup, como ocurre con microciclo».
                Desplegadas, si no caben, desliza el carril (`is-carril`). La
                abierta está siempre a la vista. */}
            {vista === 'hoja' && (
              <div className={`tira-hojas${hojas.length >= HOJAS_A_LA_VISTA ? ' is-muchas' : ''}`}>
                <div className="tira-tabs" role="tablist" aria-label={`Hojas de ${bloque.name}`}>
                  {hojasALaVista.map((i) => {
                      const hoja = hojas[i];
                      const estado = estadoDeHoja ? estadoDeHoja(hoja) : null;
                      const dia = diaDe ? diaDe(hoja) : null;
                      return (
                        <button
                          key={hoja.dayName}
                          type="button"
                          role="tab"
                          aria-selected={i === hojaAbierta}
                          className={`tira-eslabon${i === hojaAbierta ? ' is-on' : ''}`}
                          onClick={() => onAbrirHoja(i)}
                          title={[hoja.dayName, dia, estado?.title].filter(Boolean).join(' · ')}
                        >
                          {/* El disco distingue y el color juzga: verde hecha,
                              ámbar a medias, hueco aún no. La ley del color de la
                              casa, y sin palabra — el nombre ya está al lado. */}
                          {estado && <span className={`tira-eslabon-disco is-${estado.tono}`} aria-hidden="true" />}
                          <span className="tira-eslabon-nombre">{hoja.dayName}</span>
                        </button>
                      );
                  })}
                </div>
                {hojasOcultas.length > 0 && (
                  <button
                    type="button"
                    className="tira-eslabon tira-hojas-mas"
                    onClick={() => setTodasLasHojas(true)}
                    title={`Ver las ${hojasOcultas.length} hojas que faltan`}
                  >
                    <span className="tira-eslabon-nombre">{hojasOcultas.length} más</span>
                    <ChevronRight size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
            {/* La chapa de estado va PEGADA al nombre del que habla: «Bloque 2
                ▾ ABIERTO», que es como lo dibuja el encargo y como se lee un
                estado —adjetivo detrás de su sustantivo—. Al canto derecho
                estuvo, y allí no se sabía de quién hablaba. Con una hoja
                abierta no se pinta: es de otro nivel. */}
            {vista !== 'hoja' && chapasDelBloque}
          </div>
          {/* Y «+ hoja» cierra la tira, FUERA de la pista porque añadir no es
              elegir —lo mismo que «+ microciclo» con la suya—, y fuera también
              del carril que desliza: con ocho hojas desplegadas se iba con
              ellas y dejaba de verse. Cada «+» toca a lo que añade, y lo que
              hay a su izquierda son las hojas. Con el bloque entero delante
              sigue en su renglón de siempre. */}
          {vista === 'hoja' && derecha}
        </div>

        {/* ══ Y AQUÍ EMPIEZA EL NIVEL DEL MICROCICLO ════════════════════════
            El filete es lo único que separa los dos ámbitos dentro de la fila,
            y por eso no puede haber más de uno por nivel: a su izquierda el
            bloque, a su derecha su línea de tiempo. Cuando la barra llevó tres
            filetes —uno antes de cada papelera— el dueño lo corrigió, y el
            motivo sigue valiendo: un filete que se repite deja de separar. */}
        {abierto && <span className="tira-divisor" aria-hidden="true" />}
        {nivelDelMicro}

        <span className="tira-hueco" />

        {/*
          ── QUÉ SESIÓN SE MIRA, Y «+ hoja» ────────────────────────────────
          «La fecha de la sesión ha de ir a la derecha.» Vivió dentro de la caja
          de las pastillas, pegada a ellas, y la razón era buena —una sesión es
          de ESTE microciclo—. Lo que la contesta es que ahí no se lee como un
          mando sino como el pie de la lista: con cinco pastillas delante, la
          sexta pieza del renglón parece la sexta opción. Al otro canto es lo
          que es: el único mando que dice QUÉ se está leyendo.
        */}
        {colaDelMicro}
        {vista === 'hoja' && mandosDeLaHoja}

        {/* ══ EL CANTO DERECHO: LOS VERBOS DEL BLOQUE ═══════════════════════
            Deshacer y rehacer primero —son del PLAN, no del bloque, y por eso
            van delante del filete—, y detrás lo que gestiona el bloque: uno
            nuevo y el engranaje con todo lo demás.

            «+ bloque» estuvo pegado a sus hermanos dentro de la lista, por la
            ley de que cada «+» toca a lo que añade. Está al canto derecho
            porque sus hermanos ya no están a la vista: desde que el bloque es
            un desplegable, a su izquierda solo hay UN nombre, y un «+» pegado
            a un nombre propio se lee como «añadir a este bloque». Arriba a la
            derecha es donde vive el verbo de alta de todas las cintas de la
            casa.

            ── Y AQUÍ ESTUVO EL «···» DEL MICROCICLO ────────────────────────
            Cerraba la fila 2 con un solo ítem, el que borra. Se ha ido a la
            pastilla del microciclo abierto: el ámbito lo dice el sitio del que
            sale el menú, no el rótulo que hay que leer al pasar el ratón. Lo
            que queda en esta esquina es de UN solo nivel —el bloque, o la hoja
            si hay una abierta—, que es lo que hace que una esquina se entienda
            sin mirarla. */}
        {colaDelBloque}
        {/* Las herramientas del bloque, a la vista y en su propio grupo: entran
            detrás de su filete y solo con el bloque entero delante —con una
            hoja abierta el canto derecho es de la hoja, y meter ahí cuatro
            verbos de otro nivel es lo que esta barra lleva diez vueltas
            corrigiendo—. */}
        {vista !== 'hoja' && grupoDelBloque}
        {vista !== 'hoja' && masBloque}
        {cierreDelNivel}
      </div>
    </nav>
  );
};
