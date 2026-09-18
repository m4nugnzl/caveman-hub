import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FolderOpen, Pencil, Trash2 } from 'lucide-react';

import { blockSummary, blocksOf, blockTraits, intentLabel, weeksOfBlock } from '@/domain/blocks';
import { executedSessions } from '@/domain/sessions';
import { findMicrocycle } from '@/domain/training';
import { shortDate, toISODate } from '@/lib/dates';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { RenombrarEnSitio } from '@/components/ui/primitives';

/**
 * LA TIRA DEL PROGRAMA: los bloques, y los microciclos del abierto.
 *
 * ══ De dónde sale ══════════════════════════════════════════════════════════
 *
 * Es la cabecera que Entreno tenía EN PRODUCCIÓN, que es la que el dueño pidió
 * recuperar: «parte a nivel visual de lo que está en producción y mejóralo».
 * Vuelve entera —la fila de bloques como carpetas del programa y, debajo, los
 * microciclos del abierto— y con ella se van la cabecera de dos pisos, la banda
 * de hojas y el carril, que eran tres intentos de decir lo mismo.
 *
 *     Bloques › B1 Adaptación  B2 Acumulación  ▌Intensificación  + bloque
 *     M1  ▌M2 · en curso  + microciclo                             + hoja
 *
 * Y con una hoja abierta, el bloque se recoge como MIGA y su sitio lo ocupan
 * las hojas —que es lo que más se cambia—; la fila 2 sigue siendo la del
 * microciclo y su sesión:
 *
 *     Bloques › Intensificación › Push A  Pull A  Pierna A     ⧉  ⇄  ···
 *     M1  ▌M2 · en curso  sesión del 5 sep
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
 *   el de bloques con los bloques, el de microciclos con los microciclos y el
 *   de hojas al final del renglón del microciclo, que es de quien son.
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
 * @param menuDelMicrociclo  Lo que BORRA el microciclo. Se llama «menú» por su
 *                    sitio, no por su forma: fue un «···» de dos ítems y hoy es
 *                    la papelera, como en el bloque y en la hoja. No queda un
 *                    solo menú en esta cabecera.
 * @param derecha     Lo que se sienta al final de la fila de hojas: «+ hoja».
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
  menuDelMicrociclo = null,
  derecha = null,
  mandosDeLaHoja = null,
  iconos = null,
  menuDeLaHoja = null,
  masBloque = null,
  masMicrociclo = null,
  onIrBloque,
  onVerLista,
  onRenombrarBloque,
  onQuitarBloque,
  onIrSemana,
  onAjustesDelMicrociclo,
  onAbrirHoja,
  onVerConjunto,
}) => {
  const [renombrando, setRenombrando] = useState(false);
  /*
    ── EL CARRIL DE MICROCICLOS SE PLIEGA ──────────────────────────────────
    `todosLosMicros` no vuelve a `false` sola: desplegar es una decisión de
    quien mira, y volver a plegarle el carril en cuanto cambia de microciclo
    sería deshacerle lo que acaba de pedir. El tramo visible se calcula abajo,
    con el bloque abierto ya resuelto.
  */
  const [todosLosMicros, setTodosLosMicros] = useState(false);
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
  const carril = useRef(null);
  useEffect(() => {
    const caja = carril.current;
    if (!caja || vista !== 'hoja') return undefined;
    const medir = () => {
      const izq = caja.scrollLeft > 1;
      const der = caja.scrollLeft < caja.scrollWidth - caja.clientWidth - 1;
      caja.dataset.desborde = izq && der ? 'ambos' : izq ? 'izq' : der ? 'der' : 'no';
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
    medir();
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
    observador?.observe(caja);
    caja.addEventListener('scroll', medir, { passive: true });
    caja.addEventListener('wheel', rueda, { passive: false });
    return () => {
      observador?.disconnect();
      caja.removeEventListener('scroll', medir);
      caja.removeEventListener('wheel', rueda);
    };
  }, [vista, hojas.length]);
  useEffect(() => {
    const caja = carril.current;
    if (!caja || vista !== 'hoja' || caja.scrollWidth <= caja.clientWidth) return;
    const on = caja.querySelector('.tira-eslabon.is-on');
    if (!on) return;
    const fuera = on.offsetLeft < caja.scrollLeft || on.offsetLeft + on.offsetWidth > caja.scrollLeft + caja.clientWidth;
    if (fuera) caja.scrollLeft = on.offsetLeft - (caja.clientWidth - on.offsetWidth) / 2;
  }, [vista, hojaAbierta]);
  /*
    ── AQUÍ ESTUVO «AMPLIAR» ─────────────────────────────────────────────────
    El mando que pliega la barra lateral pasó por esta cabecera: es la pantalla
    más ancha del producto y la que pide el sitio. Duró una vuelta —«no lo
    quiero en la cabecera de Entreno, ha de ser en el borde de la página para
    todas las páginas»— y el motivo de fondo es que un mando del CHASIS no
    puede vivir dentro de una pantalla: había que estar aquí para plegar y para
    devolver. Hoy es un asa en la costura entre la barra y la página, en las
    once (`.pliegue-borde`, ver `lib/barraPlegada`).
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
    Cuatro, que es lo que dibuja el frame, y no es un número de diseño sino de
    sitio: con el camino del bloque a la izquierda y los cuatro verbos a la
    derecha, la quinta pastilla ya parte la fila en un portátil de 1440. Un
    bloque de diez mandaba el microciclo EN CURSO —el único que se mira a
    diario— a un segundo renglón él solo.

    El tramo se cuenta desde el que MIRAS y no desde el final: abrir el M2 de
    un bloque de diez tiene que enseñar el M2.
  */
  const MICROS_A_LA_VISTA = 4;
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
  const menuDelBloque = onQuitarBloque ? (
    <button
      type="button"
      className="btn btn-icon btn-icon-compact btn-icon-danger tira-menu"
      disabled={unicoBloque}
      title={
        unicoBloque
          ? `«${bloque.name}» es el único bloque del programa: un bloque separa dos etapas y no hay ninguna de la que separarlo. Con «+ bloque» empiezas el siguiente.`
          : `Quitar «${bloque.name}»`
      }
      aria-label={unicoBloque ? `Quitar «${bloque.name}» (no se puede: es el único bloque)` : `Quitar «${bloque.name}»`}
      onClick={() => onQuitarBloque(bloque)}
    >
      <Trash2 size={15} />
    </button>
  ) : null;

  /*
    ══ Y CON EL BLOQUE DELANTE, LAS DOS FILAS SON UNA (17 sep · frame 32:100) ══
    El frame dibuja toda la cabecera en un renglón: el camino del bloque a la
    izquierda y, a la derecha, el carril de microciclos y los verbos separados
    por un filete vertical.

    La vuelta anterior lo dejó en dos pisos por una razón que sigue siendo
    buena —cada fila lleva SU nivel, y con una hoja abierta la de abajo lleva
    además qué sesión se mira—. Lo que la contesta es que esa razón solo se
    cumple con la hoja abierta: mirando el bloque entero, la fila de abajo no
    tiene sesión que llevar, así que sus dos únicas piezas —el carril y «+
    hoja»— estaban gastando una altura de cabecera entera para no decir nada
    que no cupiera arriba.

    Así que el reparto es por VISTA y no por nivel: con el bloque delante, un
    renglón; con una hoja abierta, los dos de siempre. El filete vertical es lo
    que mantiene la lectura por niveles dentro de la fila única — a la
    izquierda dónde estás, a la derecha qué puedes hacer.
  */
  /* ── LAS OPCIONES DEL DESPLEGABLE ────────────────────────────────────────
     Los hermanos primero, con la marca puesta en el que estás: eso es lo que
     hace de un menú un SELECTOR y no una lista de verbos. Debajo, tras el
     filete, lo que se le hace al abierto.

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
    onRenombrarBloque && null,
    onRenombrarBloque && {
      label: 'Renombrar este bloque',
      icon: Pencil,
      run: () => setRenombrando(true),
    },
  ];


  const unaFila = vista !== 'hoja' && Boolean(abierto);

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

  /* Y el «···» del nivel que se mira: el de la hoja cuando hay una abierta, el
     del bloque cuando no. Un solo menú por pantalla y siempre en el mismo
     sitio. Sale de `colaDelBloque` porque en la fila única va DETRÁS de su
     filete, con las otras papeleras (ver la regla del cierre, más abajo). */
  const menuDelNivel = vista === 'hoja' && menuDeLaHoja ? menuDeLaHoja : menuDelBloque;

  /* ══ EL NIVEL DEL MICROCICLO ═══════════════════════════════════════════════
     Sale del JSX de la fila 2 para poder sentarse en las dos composiciones —la
     de un renglón y la de dos— sin escribirlo dos veces. */
  const nivelDelMicro = abierto ? (
    <>
          {/*
            ── UNA SOLA CAJA QUE ENVUELVE, Y POR ESO NADA SE VA A LA DERECHA ──
            Las pastillas, «+ microciclo» y el selector de sesión son tres
            piezas del MISMO nivel, así que van en una sola caja que se parte en
            renglones cuando no caben. Con el selector fuera, la caja de las
            pastillas —que es la que envuelve— se quedaba todo el ancho libre y
            empujaba la sesión al canto derecho: exactamente el sitio del que el
            dueño la mandó quitar. `.tira-micros` es `display: contents` para
            que sus pastillas sean hijas de esta caja sin perder su `tablist`.
          */}
          <div className="tira-nivel">
          <div className="tira-micros" role="tablist" aria-label={`${unidades} de ${bloque.name}`}>
            {/*
              ══ Y LOS VIEJOS SE PLIEGAN (17 sep · rediseño de Figma) ═══════
              Un bloque de diez microciclos pintaba diez pastillas, y a 1440 px
              la décima —la que está EN CURSO, o sea la única que se mira a
              diario— caía a un segundo renglón ella sola. La fila del bloque
              medía dos alturas para enseñar un dato que ya no cabía donde se
              busca.

              El frame lo resuelve como lo resuelve cualquier paginador: los
              últimos a la vista y los anteriores detrás de «‹ N más». No se
              pierde nada —el botón los despliega y no vuelve a plegarlos— y lo
              que gana es que el microciclo en curso esté SIEMPRE en el renglón,
              que es de lo que se trata.

              El tramo visible se calcula desde el que MIRAS y no desde el
              final: abrir el M2 de un bloque de diez tiene que enseñar el M2.
            */}
            {ocultos > 0 && (
              <button
                type="button"
                className="hoja-semana is-mas"
                onClick={() => setTodosLosMicros(true)}
                title={`Ver los ${ocultos} ${ocultos === 1 ? unidadBaja : unidades.toLowerCase()} anteriores`}
              >
                <ChevronLeft size={13} aria-hidden="true" />
                <span className="hoja-semana-estado">{ocultos} más</span>
              </button>
            )}
            {microsALaVista.map((w) => {
              const micro = findMicrocycle(microcycles, w) || {};
              const iso = toISODate(micro.date);
              const hecha = executedSessions(micro).length > 0;
              /* Las dos marcas son distintas y pueden caer juntas: `is-on` dice
                 CUÁL MIRAS y `is-curso` cuál es el de hoy. Excluyentes, el
                 microciclo en curso perdía su punto azul justo cuando estabas
                 en él, que es cuando más se mira. */
              const estado = [w === semana ? 'is-on' : '', w === semanaEnCurso ? 'is-curso' : hecha ? 'is-hecha' : '']
                .filter(Boolean)
                .map((c) => ` ${c}`)
                .join('');
              const n = w - abierto.b.fromWeek + 1;
              return (
                <button
                  key={w}
                  type="button"
                  role="tab"
                  aria-selected={w === semana}
                  className={`hoja-semana${estado}`}
                  onClick={() => (w === semana ? onAjustesDelMicrociclo?.() : onIrSemana(w))}
                  title={
                    w === semana
                      ? `${unidad} ${n} · sus fechas y sus sesiones`
                      : `Abrir ${unidadBaja} ${n}${iso ? ` · empieza el ${shortDate(iso)}` : ''}${
                          w === semanaEnCurso ? ' · en curso' : hecha ? ' · entrenado' : ' · por hacer'
                        }`
                  }
                >
                  <span className="hoja-semana-n">
                    {inicial}
                    {n}
                  </span>
                  {w === semanaEnCurso && <span className="hoja-semana-estado">en curso</span>}
                </button>
              );
            })}
          </div>
            {/* Fuera del `tablist`, que es de las pastillas: añadir un
                microciclo no es elegir uno. Envuelve con ellas porque está en
                la misma caja, no porque comparta su lista. */}
            {masMicrociclo}

          </div>
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
      <div className={`tira-fila${unaFila ? ' is-una' : ''}`}>
        <div className="tira-camino">
          {/* La puerta al visor de carpetas: una palabra, y la primera del
              camino. Fue un chevron pelado y luego un ítem dentro del «···», y
              las dos veces el dueño dijo lo mismo: «no puedo acceder a la
              carpeta con los bloques». El icono se queda porque es lo que la
              hace reconocible como puerta y no como rótulo. */}
          {onVerLista && (
            <>
              <button type="button" className="tira-miga" onClick={onVerLista} title="Todos los bloques de esta persona">
                <FolderOpen size={13} aria-hidden="true" />
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
                title={`Ver «${bloque.name}» entero: sus hojas, su estructura y su información · Esc`}
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

            {vista === 'hoja' && (
              <div className="tira-tabs" role="tablist" aria-label={`Hojas de ${bloque.name}`}>
                {hojas.map((hoja, i) => {
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
                {/* Y «+ hoja» cierra la tira, fuera del `tablist` porque añadir
                    no es elegir. Es donde lo pinta el frame (`48:753`) y donde
                    manda la ley de la casa: cada «+» toca a lo que añade, y lo
                    que hay a su izquierda son exactamente las hojas. Con el
                    bloque entero delante sigue en su renglón de siempre, junto
                    a «+ microciclo». */}
                {derecha}
              </div>
            )}

            {/* Con el bloque delante, sus chapas van aquí: pegadas al nombre
                del que hablan y antes del «+», que es como las dibuja el
                frame. Con una hoja abierta no se pintan (son de otro nivel). */}
            {unaFila && chapasDelBloque}

            {/* Fuera del `tablist` y dentro de la lista: añadir un bloque no es
                elegir uno, pero va al final de sus hermanos porque cada «+»
                toca a lo que añade. */}
            {vista !== 'hoja' && masBloque}
          </div>
        </div>

        <span className="tira-hueco" />

        {/* En un renglón, a la derecha del hueco va el nivel del microciclo
            entero y el filete que lo separa de los verbos. En dos, aquí solo
            quedan las chapas del bloque, que es donde vivían. */}
        {unaFila ? (
          <>
            {nivelDelMicro}
            <span className="tira-divisor" aria-hidden="true" />
            {/* ── EL CIERRE VA POR NIVELES, Y SE VE EN EL FILETE ───────────
                «Has de poner separada la información de bloque respecto a la de
                microciclo», y antes: «el prototipo tiene dos papeleras, una del
                microciclo, DENTRO, y otra FUERA».

                Las dos frases piden lo mismo: que el corte de la fila sea el
                NIVEL y no otra cosa. Queda en tres grupos que se leen de
                izquierda a derecha como se piensa —dónde estás, qué le haces a
                esta semana, qué le haces al bloque—:

                    ‹6 más M7 M8 M9 M10 + microciclo │ + hoja ⌫ │ ⟲ ⧉ ⤓ ⚙ ⌫

                Cada papelera dentro de su grupo, que es lo que dice sobre qué
                actúa: la primera se lleva el microciclo abierto, la segunda el
                bloque entero. Antes iban mezcladas —los ajustes del microciclo,
                su papelera, y detrás los tres verbos del bloque y la suya—, así
                que la fila remataba con seis cuadraditos iguales entre los que
                dos BORRAN y nada lo decía hasta pasar el ratón por encima.

                Y la del microciclo va sin rojo, que también es del frame: allí
                solo va en rojo la que se lleva el bloque entero. Dos rojos
                seguidos no escalan nada; con uno, el que queda se ve. */}
            {colaDelMicro}
            {menuDelMicrociclo}
            <span className="tira-divisor" aria-hidden="true" />
            {colaDelBloque}
            {menuDelNivel}
          </>
        ) : (
          <>
            {chapasDelBloque}
            {colaDelBloque}
            {menuDelNivel}
          </>
        )}
      </div>


      {/*
        ══ FILA 2 · LOS MICROCICLOS DEL BLOQUE ABIERTO ═══════════════════════
        La MISMA pastilla con la que se cambia de microciclo mientras se
        escriben las series: es la misma pregunta en las dos pantallas de
        Entreno, así que no puede tener dos dibujos.
      */}
      {!unaFila && abierto && (
        <div className="tira-fila is-micros">
          {nivelDelMicro}

          <span className="tira-hueco" />

          {colaDelMicro}
          {/*
            ── QUÉ SESIÓN SE MIRA, AL CANTO DERECHO ──────────────────────────
            «La fecha de la sesión ha de ir a la derecha.» Es donde la dibuja el
            frame (`227:4`), en el mismo grupo que la papelera del microciclo y
            enfrentada a las pastillas que abren el renglón.

            Vivió dentro de la caja de las pastillas, pegada a ellas, y la razón
            era buena —una sesión es de ESTE microciclo, así que iba detrás de
            lo que la nombra—. Lo que la contesta es que ahí no se lee como un
            mando sino como el pie de la lista: con cinco pastillas delante, la
            sexta pieza del renglón parece la sexta opción. Al otro canto es lo
            que es —el único mando que dice QUÉ se está leyendo— y el renglón
            vuelve a partirse por donde se piensa: a la izquierda dónde estás,
            a la derecha qué miras y qué te llevas.

            Y no vuelve el defecto de la vez anterior —«la caja de las pastillas
            se quedaba todo el ancho libre y empujaba la sesión al canto»—,
            porque ahora la lleva ahí el hueco a propósito y no el
            desbordamiento de una caja que envuelve.
          */}
          {vista === 'hoja' && mandosDeLaHoja}
          {menuDelMicrociclo}
        </div>
      )}
    </nav>
  );
};
