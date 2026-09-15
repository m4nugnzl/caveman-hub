import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FolderOpen, Layers, Trash2 } from 'lucide-react';

import { blockSummary, blocksOf, blockTraits, intentLabel, weeksOfBlock } from '@/domain/blocks';
import { executedSessions } from '@/domain/sessions';
import { findMicrocycle } from '@/domain/training';
import { shortDate, toISODate } from '@/lib/dates';
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
 * @param mandosDelMicrociclo  Los verbos del MICROCICLO, como iconos y al final
 *                    de su propio renglón. Estuvieron en la fila de arriba, que
 *                    es la del bloque: duplicar el microciclo abierto no es una
 *                    acción del bloque, y ahí no se encontraba.
 * @param menuDelMicrociclo  Y lo que BORRA, al final y en rojo. Se llama «menú»
 *                    por su sitio, no por su forma: fue un «···» de dos ítems y
 *                    hoy es la papelera, como en el bloque y en la hoja. No
 *                    queda un solo menú en esta cabecera.
 * @param derecha     Lo que se sienta al final de la fila de hojas: «+ hoja».
 * @param mandosDeLaHoja  Qué sesión se mira y cuánto lleva escrito. Van en el
 *                    renglón del microciclo, que es el nivel del que hablan:
 *                    una sesión es un entrenamiento de ESTE microciclo.
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
  mandosDelMicrociclo = null,
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

      · Lo de DIARIO sale como botón, en el renglón de su nivel: traer
        ejercicios y los ajustes del programa arriba; duplicar el microciclo,
        abajo (`mandosDelMicrociclo`).
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
  */
  const menuDelBloque =
    onQuitarBloque && tramos.length > 1 ? (
      <button
        type="button"
        className="btn btn-icon btn-icon-compact btn-icon-danger tira-menu"
        title={`Quitar «${bloque.name}»`}
        aria-label={`Quitar «${bloque.name}»`}
        onClick={() => onQuitarBloque(bloque)}
      >
        <Trash2 size={15} />
      </button>
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
      <div className="tira-fila">
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
              {/* Con su icono, por lo mismo que «Bloques» lleva la carpeta: sin
                  él es el nombre del bloque en tinta terciaria —o sea, un
                  título apagado— y el camino de vuelta a la rejilla no se
                  encuentra. El teclado ya lo hacía (Esc); la vista, no. */}
              <button
                type="button"
                className="tira-miga"
                onClick={onVerConjunto}
                title={`Ver «${bloque.name}» entero: sus hojas, su estructura y su información · Esc`}
              >
                <Layers size={13} aria-hidden="true" />
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
            <div
              className="tira-tabs"
              role="tablist"
              aria-label={vista === 'hoja' ? `Hojas de ${bloque.name}` : 'Bloques del programa'}
            >
              {vista === 'hoja'
                ? hojas.map((hoja, i) => {
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
                  })
                : tramos.map(({ b, i, esEste, r, semanas }) => {
                    const cuandoBloque = r.desde
                      ? `${shortDate(r.desde)}${r.abierto ? ' · abierto' : r.hasta ? ` – ${shortDate(r.hasta)}` : ''}`
                      : 'sin fechas';
                    const aqui = semanaEnCurso != null && semanas.includes(semanaEnCurso);

                    /* El bloque abierto en renombrado: el campo ocupa el sitio
                       de su titular, para que el nombre se cambie donde se lee. */
                    if (esEste && renombrando) {
                      return (
                        <RenombrarEnSitio
                          key={b.id}
                          value={b.name}
                          label="Nuevo nombre del bloque"
                          onRename={(nombre) => onRenombrarBloque(b.id, nombre)}
                          onDone={() => setRenombrando(false)}
                        />
                      );
                    }

                    return (
                      <button
                        key={b.id}
                        type="button"
                        role="tab"
                        aria-selected={esEste}
                        className={`tira-eslabon${esEste ? ' is-on' : ''}`}
                        onClick={() => (esEste ? setRenombrando(Boolean(onRenombrarBloque)) : onIrBloque(b))}
                        title={
                          esEste
                            ? `${b.name}${onRenombrarBloque ? ' · púlsalo para renombrarlo' : ''}`
                            : `Abrir ${b.name} · ${semanas.length} ${semanas.length === 1 ? unidadBaja : unidadesBajas} · ${cuandoBloque}`
                        }
                      >
                        {/* ── LA CIFRA, SOLO CUANDO EL NOMBRE NO LA DICE ────
                            Con los bloques sin bautizar —que es como nacen— el
                            renglón decía «Bloques · B1 Bloque 1 · B2 Bloque 2 ·
                            + bloque»: la misma palabra cinco veces y la misma
                            cifra dos veces dentro de cada pastilla. El dorsal
                            existe para darle el ORDEN a un bloque con nombre
                            propio («B2 Acumulación»); cuando el nombre YA es su
                            número, sobra. */}
                        {!/^bloques?\s*\d+$/i.test(String(b.name || '').trim()) && (
                          <span className="tira-eslabon-n">B{i + 1}</span>
                        )}
                        <span className="tira-eslabon-nombre">{b.name}</span>
                        {/* El punto de «aquí está el hoy»: solo sale mirando
                            OTRO bloque, porque es el camino de vuelta. */}
                        {aqui && !esEste && <span className="tira-eslabon-aqui">estás aquí</span>}
                      </button>
                    );
                  })}
            </div>

            {/* Fuera del `tablist` y dentro de la lista: añadir un bloque no es
                elegir uno, pero va al final de sus hermanos porque cada «+»
                toca a lo que añade. */}
            {vista !== 'hoja' && masBloque}
          </div>
        </div>

        <span className="tira-hueco" />

        {/* Las chapas y la fecha, en voz baja y a la derecha: es lo que llena el
            hueco que antes llegaba a medir 830 px. Solo con el bloque delante —
            con una hoja abierta son datos de OTRO nivel, y eran la mitad de lo
            que atoraba esta fila. */}
        {vista !== 'hoja' && intent && <span className="bl-chapa">{intent}</span>}
        {vista !== 'hoja' && esActual && <span className="bl-chapa is-abierto">abierto</span>}
        {vista !== 'hoja' && cuando && <span className="tira-dato">{cuando}</span>}
        {acciones}
        {/* ── LOS VERBOS DE DIARIO, A LA VISTA ────────────────────────────
            «No muestras los iconos de opciones, muestras los ···.» Duplicar
            una hoja o abrir sus alternativas se hace a diario y estaba a dos
            gestos —abrir el menú, leer cinco líneas, elegir—; ahora es un
            icono que se pulsa. Al «···» se queda lo que se toca una vez al mes
            y lo que borra, que ahí está bien guardado. */}
        {iconos}
        {/* El «···» es el del nivel que se está mirando: el de la hoja cuando
            hay una abierta, el del bloque cuando no. Un solo menú por pantalla
            y siempre en el mismo sitio. */}
        {vista === 'hoja' && menuDeLaHoja ? menuDeLaHoja : menuDelBloque}
      </div>

      {/*
        ══ FILA 2 · LOS MICROCICLOS DEL BLOQUE ABIERTO ═══════════════════════
        La MISMA pastilla con la que se cambia de microciclo mientras se
        escriben las series: es la misma pregunta en las dos pantallas de
        Entreno, así que no puede tener dos dibujos.
      */}
      {abierto && (
        <div className="tira-fila is-micros">
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
            {abierto.semanas.map((w) => {
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

            {/*
              ── Y LA SESIÓN, PEGADA A SU MICROCICLO ─────────────────────────
              Qué sesión se mira es del ENTRENAMIENTO, y un entrenamiento es de
              este microciclo: su sitio es esta caja, detrás de las pastillas de
              las que depende. Subió a la fila 1 cuando allí estaba el nombre de
              la hoja; ahora esa fila es de las hojas y esto la volvía a atorar.

              La tira de hojas ya no está aquí: se ha ido a la fila 1, pegada a
              la vuelta al bloque. Con el bloque entero delante no se pinta en
              ninguna de las dos —la rejilla de debajo ES esa lista, y dibujarla
              dos veces es el error que ya se ha cometido cuatro veces aquí—.
            */}
            {vista === 'hoja' && mandosDeLaHoja}
          </div>

          <span className="tira-hueco" />

          {/* ── Y AQUÍ SÍ VA «+ hoja» ─────────────────────────────────────
              Estuvo prohibido en este renglón mientras el verbo existía también
              al final de la rejilla: el mismo verbo dos veces es la avería que
              esta pantalla lleva nueve vueltas cazando. Abajo ya no hay
              ninguno —caía a novecientos píxeles del titular, y como columna de
              la retícula se descolgaba a la fila de abajo en cuanto el ancho no
              daba para una pista más—, así que este es su sitio: el renglón del
              microciclo, que es de quien son las hojas, al lado de «+
              microciclo», que es el otro «uno más» de la pantalla. Lo pone
              `WorkoutLogEditor`. */}
          {derecha}

          {/* ── Y LOS VERBOS DEL MICROCICLO, EN EL RENGLÓN DEL MICROCICLO ──
              Duplicar el microciclo abierto vivía arriba, entre las acciones
              del BLOQUE, y eliminarlo dentro de aquel «···» de siete ítems:
              dos verbos de este renglón repartidos por el de encima. Aquí cada
              fila lleva lo suyo, y sobre qué se actúa se sabe por dónde está el
              botón y no por lo que diga su rótulo. */}
          {mandosDelMicrociclo}
          {menuDelMicrociclo}
        </div>
      )}
    </nav>
  );
};
