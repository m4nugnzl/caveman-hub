import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { useBarraPlegada, useMandoIcono } from '@/lib/barraPlegada';
import { modifierKey } from '@/lib/platform';

/**
 * PLEGAR LA BARRA: el mando del ancho, como capa sobre la esquina de la barra.
 *
 * ══ Nueve sitios ══════════════════════════════════════════════════════════
 *
 * 1. La fila de la marca, dentro de la barra. «No me gusta del todo.»
 * 2. «Ampliar», en la cabecera de Entreno. Metido en UNA pantalla, el pliegue
 *    era función de esa pantalla: había que estar allí para plegar y devolver.
 * 3. Una pastilla fija en la COSTURA. «Queda impostado ahí.» (Y «le das y no
 *    aumenta el tamaño, solo se desplaza»: se arregló subiendo
 *    `--max-w-trabajo` al plegar, ver `chasis.css`.)
 * 4. Otra vez la fila de la marca. «Ahí le resta presencia al logo.»
 * 5. Un asa suelta en el canalón, encendida al acercarse. «Un icono sin
 *    contenedor flotando en un hueco muerto. Lee como resto, no como control.»
 * 6. Una pestaña sobre el divisor. «A caballo entre la tarjeta del logo y el
 *    lienzo; no pertenece a ninguna de las dos superficies.»
 * 7. Una calle reservada en el lienzo, 28 px. «La barra se come siempre un
 *    montón de espacio, y queda siempre sin ese espacio.»
 * 8. La misma calle medida por la tinta, 13 px. «Sigue comiéndose espacio.»
 * 9. Dentro del sangrado de la hoja, coste cero. «Me sigue chirriando que
 *    esté ahí siempre y moleste para el resto de cosas. Además lo veo feo ahí
 *    comprimido.»
 *
 * ══ Las dos leyes que salen de ahí ═══════════════════════════════════════
 *
 * De la 1 a la 6: **un mando pertenece a una superficie**. Flotando entre dos
 * no es de ninguna.
 *
 * De la 7 a la 9, la que costó más: **en la superficie donde se trabaja, lo
 * permanente molesta, cueste lo que cueste**. La hoja es donde se pasa el día;
 * un signo que se pulsa dos veces al día no puede vivir ahí, ni gratis. El
 * error de las tres vueltas fue discutir CUÁNTO costaba en vez de DÓNDE estaba.
 *
 * ══ Hoy ═══════════════════════════════════════════════════════════════════
 *
 * En la BARRA, que es lo que pliega y la única superficie del chasis donde
 * sobra sitio. Pero no en el renglón de la marca (1 y 4): ENCIMA de su esquina,
 * fuera del flujo, y en reposo invisible. Aparece al pasar por la barra —la
 * barra entera es la zona que lo enciende— y se va al salir.
 *
 *   · En reposo no existe: la esquina es del mark y su rótulo, y la hoja está
 *     limpia hasta el canto.
 *   · No cuesta un píxel de trabajo, ni al aparecer.
 *   · Y no hay que enseñarlo: la barra es por donde se navega, así que no se
 *     puede usar la aplicación sin pasar por encima.
 *
 * Plegada, el mark y el mando no caben al lado y se relevan: al pasar, el mark
 * se apaga y el mando ocupa su sitio. La geometría, en `.pliegue` (chasis.css).
 *
 * Solo en escritorio: por debajo de 1024 px no hay barra lateral que plegar.
 */

/**
 * LA BARRA, DIBUJADA. El segundo icono.
 *
 * El de la casa de iconos (`PanelLeftClose` / `PanelLeftOpen`) es un rectángulo
 * con una raya y un chevrón dentro, y a 16 px ese chevrón mide tres píxeles:
 * se convierte en una mancha. O sea que a la talla a la que se usa de verdad,
 * los dos estados se distinguen por un detalle que no se ve — que es justo lo
 * que el dueño dice, «se lee regular a ese tamaño».
 *
 * Este dibuja lo que pasa en vez de señalarlo. Es la pantalla: un marco, y
 * dentro la barra en macizo. Desplegada, la barra es ANCHA; plegada, es una
 * tira fina. No hay flecha que interpretar y no hay estado que adivinar: el
 * icono ES el reparto de la pantalla en cada momento, y los dos dibujos se
 * distinguen de un vistazo porque lo que cambia es un bloque de tinta, no un
 * detalle de medio píxel.
 *
 * `currentColor` en todo: el mando cambia de tinta con el estado —apagado en
 * reposo, tinta plena al pasar por encima— y el icono tiene que ir con él.
 */
const MarcaDeLaBarra = ({ plegada, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    {/* El marco de la pantalla. 1,6 de trazo: el de la casa de iconos a esta
        talla, para que no cante al lado de los demás signos de la interfaz. */}
    <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
    {/* Y la barra, en macizo. Ocho de ancho desplegada, dos y medio plegada:
        la misma proporción que en la pantalla de verdad (256 contra 64). */}
    <rect
      x="4.6"
      y="5.6"
      width={plegada ? 2.6 : 7}
      height="12.8"
      rx="1.4"
      fill="currentColor"
      style={{ transition: 'width var(--micro)' }}
    />
  </svg>
);

/**
 * EL GLOBO: dos palabras y el atajo.
 *
 * El `title` del navegador decía «Ensanchar la hoja y plegar la barra a iconos
 * (Ctrl + B)»: una frase entera para explicar lo que el icono ya dibuja. Y no
 * se puede colocar — sale donde el sistema quiere, que en la fila de identidad
 * es justo encima de las pestañas.
 *
 * Así que es propio, y dice lo justo: el verbo, el sustantivo y la tecla.
 *
 * ── Dónde sale: donde no tape nada ────────────────────────────────────────
 * El encargo decía «si no cabe debajo, que salga a la derecha». Se montó así y
 * el resultado se vio a la primera: debajo están las pestañas, a la derecha la
 * cara y el nombre de la persona, y a la izquierda —que fue el arreglo— la
 * marca de la casa, que es lo que salía tapada en la captura del dueño.
 *
 * O sea que la pregunta no era «debajo o a la derecha», era «dónde no molesta».
 * Así que el sitio no se elige por variante ni por orden escrito a mano: se
 * miden los cuatro contra lo que hay debajo y gana el primero que no tape nada.
 * La misma pieza se monta en Inicio, Cobros y la cartera, donde la esquina está
 * vacía y la respuesta es otra; una regla que mira lo que hay acierta en las
 * dos sin que nadie mantenga una lista.
 */
/* Dónde se mira si hay algo. El globo sale siempre en la esquina de arriba a la
   izquierda, así que con la barra, la cabecera y la primera pieza de la página
   está cubierto todo lo que puede quedar debajo. */
const CERCA = ['.sidebar', '.cliente-cab', '.cartera-cab', '.layout > *:first-child'];

/* ── Y se mira la TINTA, no las cajas ──────────────────────────────────────
   Primero se midió contra el rectángulo de los contenedores y salió mal a la
   primera: `.cliente-cab-tabs` ocupa el ancho entero de la hoja, así que
   cualquier sitio de por allí «tapaba» miles de píxeles de una caja que está
   casi toda vacía, y el globo se fue a posarse justo encima de «Resumen».

   Un rectángulo no dice dónde hay algo escrito. Los renglones de texto sí: se
   sacan con `Range`, que devuelve la caja de las letras de verdad. Más las
   caras y los signos, que son dibujo. Con eso, el hueco encima del mando —canto
   de la tarjeta y hueco del chasis, donde no hay nada— por fin puntúa cero. */
const tintaDe = (raiz) => {
  const cajas = [];
  const paseo = document.createNodeIterator(raiz, NodeFilter.SHOW_TEXT);
  for (let n = paseo.nextNode(); n; n = paseo.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    for (const c of r.getClientRects()) if (c.width && c.height) cajas.push(c);
  }
  for (const el of raiz.querySelectorAll('img, svg, canvas, .avatar')) {
    const c = el.getBoundingClientRect();
    if (c.width && c.height) cajas.push(c);
  }
  return cajas;
};

const solapa = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const Globo = ({ texto, atajo, para }) => {
  const propia = useRef(null);
  const [sitio, setSitio] = useState(null);

  useLayoutEffect(() => {
    const boton = para.current;
    const globo = propia.current;
    if (!boton || !globo) return;
    const b = boton.getBoundingClientRect();
    const { offsetWidth: an, offsetHeight: al } = globo;
    const cx = b.left + b.width / 2 - an / 2;
    const cy = b.top + b.height / 2 - al / 2;
    const tope = (v, max) => Math.min(Math.max(v, 4), max - 4);

    /* Los cuatro sitios, en el orden en que un globo debería intentarlos aquí.
       ARRIBA va primero y no por capricho: el mando vive en la esquina superior
       de la barra, y justo encima no hay más que el canto de la tarjeta y el
       marco de la ventana. Es el único lado de los cuatro donde no se está
       leyendo nada: DEBAJO está el buscador, a la IZQUIERDA el rótulo de la
       marca —que es lo que tapaba el globo en la captura del dueño— y a la
       DERECHA, la cara y el nombre de la persona. */
    const sitios = [
      { x: cx, y: b.top - 6 - al },
      { x: cx, y: b.bottom + 6 },
      { x: b.left - 8 - an, y: cy },
      { x: b.right + 8, y: cy },
    ].map(({ x, y }) => ({ x: tope(x, window.innerWidth - an), y: tope(y, window.innerHeight - al) }));

    const tinta = CERCA.flatMap((sel) => [...document.querySelectorAll(sel)]).flatMap(tintaDe);

    /* Cuánto taparía cada sitio. Cero es «no molesta a nadie»; si ninguno da
       cero —pantalla estrecha, mando en otro sitio— gana el que tape menos, que
       es una respuesta peor pero nunca una posición absurda. */
    const coste = ({ x, y }) => {
      const caja = { left: x, top: y, right: x + an, bottom: y + al };
      return tinta.reduce((suma, r) => {
        if (!solapa(caja, r)) return suma;
        const ancho = Math.min(caja.right, r.right) - Math.max(caja.left, r.left);
        const alto = Math.min(caja.bottom, r.bottom) - Math.max(caja.top, r.top);
        return suma + ancho * alto;
      }, 0);
    };

    let mejor = sitios[0];
    let mejorCoste = Infinity;
    for (const s of sitios) {
      const c = coste(s);
      if (c < mejorCoste) { mejor = s; mejorCoste = c; }
      if (c === 0) break;   // el primero que no tapa nada gana; no se sigue
    }
    setSitio(mejor);
  }, [para, texto]);

  /* ── Y SE PINTA EN EL `body`, no donde vive el botón ───────────────────────
     Porque la cabecera del cliente es `position: sticky` con `z-index`, o sea
     su propio contexto de apilamiento, y la barra lateral va por encima de ella
     (130 contra 60). Dentro de la cabecera, un globo que sale hacia la
     izquierda se mete debajo de la barra y se ve cortado por su canto —medido,
     asomaban catorce píxeles— y ningún `z-index` lo arregla: desde dentro de un
     contexto no se puede saltar por encima de su padre.

     En el `body` no hay contexto que lo encierre, así que el sitio se calcula
     en coordenadas de ventana (`position: fixed`) y el globo se posa donde
     toca. Es lo que hace cualquier globo que pueda desbordar a su dueño. */
  return createPortal(
    <span
      ref={propia}
      className="mando-globo"
      role="tooltip"
      style={
        sitio
          ? { left: `${Math.round(sitio.x)}px`, top: `${Math.round(sitio.y)}px` }
          : /* Antes de medir se dibuja fuera de la vista: con `visibility` en vez
               de `display` para que tenga tamaño que medir, y sin ocupar sitio
               porque es fijo. */
            { visibility: 'hidden', left: 0, top: 0 }
      }
    >
      {texto}
      <kbd className="kbd">{atajo}</kbd>
    </span>,
    document.body
  );
};

/* LA ESPERA DEL GLOBO.
 *
 * «Al instante que pasas el ratón sale el mensaje.» Y salía: el globo estaba
 * atado a `pointerenter` a pelo, así que bastaba con CRUZAR la esquina de la
 * hoja para que apareciera un cartel encima de la barra. Un globo que se
 * dispara al cruzar no informa, interrumpe.
 *
 * Con la espera, el cartel es una respuesta a una pregunta: sale cuando el
 * ratón se queda quieto encima, que es cuando alguien está dudando qué es esto.
 * Si solo pasabas de largo, no ha pasado nada.
 *
 * Y se va SIN esperar —lo que se retrasa es la entrada, no la salida—, que es
 * la misma ley que las transiciones de la casa: entrar despacio, salir rápido.
 *
 * Por el teclado no hay espera: llegar con Tab no es cruzar por encima, es
 * haber ido a propósito, y ahí el rótulo es lo único que dice dónde estás. */
const ESPERA = 420;

export const Pliegue = () => {
  const icono = useMandoIcono();
  const [plegada, alternar] = useBarraPlegada();
  const [globo, setGlobo] = useState(false);
  const boton = useRef(null);
  const reloj = useRef(null);

  const parar = useCallback(() => {
    if (reloj.current) { clearTimeout(reloj.current); reloj.current = null; }
  }, []);
  /* Si el componente se va con el reloj puesto —al cambiar de cliente con el
     ratón encima—, el temporizador tocaría sobre un componente desmontado. */
  useEffect(() => parar, [parar]);

  const asomar = useCallback(() => {
    parar();
    reloj.current = setTimeout(() => setGlobo(true), ESPERA);
  }, [parar]);
  const esconder = useCallback(() => { parar(); setGlobo(false); }, [parar]);

  /* Dos palabras. El estado lo dice el icono; el rótulo solo nombra la acción
     que viene, que es lo que se necesita leer cuando ya tienes el ratón encima. */
  const dice = plegada ? 'Desplegar barra' : 'Plegar barra';
  const atajo = `${modifierKey()}B`;

  return (
    <button
      ref={boton}
      type="button"
      className="pliegue"
      /* Al pulsar se esconde: ya has hecho lo que el cartel explicaba, y si no
         se quita se queda un rótulo flotando sobre la pantalla que acabas de
         cambiar. */
      onClick={() => { esconder(); alternar(); }}
      onPointerEnter={asomar}
      onPointerLeave={esconder}
      onFocus={() => { parar(); setGlobo(true); }}
      onBlur={esconder}
      aria-pressed={plegada}
      /* El rótulo accesible CAMBIA con el estado: quien no ve el icono tiene que
         enterarse por la palabra de qué va a pasar al pulsar. Sin `title`: lo
         pone el globo, y dos rótulos a la vez se leen dos veces. */
      aria-label={dice}
    >
      {icono === 'marca' ? (
        <MarcaDeLaBarra plegada={plegada} />
      ) : /* 15 px, la medida de los signos de la casa. */
      plegada ? (
        <PanelLeftOpen size={15} aria-hidden="true" />
      ) : (
        <PanelLeftClose size={15} aria-hidden="true" />
      )}
      {globo && <Globo texto={dice} atajo={atajo} para={boton} />}
    </button>
  );
};
