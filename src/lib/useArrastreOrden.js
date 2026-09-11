import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reordenar una fila arrastrando — con ratón Y con el dedo.
 *
 * ══ Por qué no vale el arrastre de HTML5 ════════════════════════════════════
 *
 * El carril de días ya era `draggable`, y aun así reordenar se hacía con dos
 * flechas metidas en la cabecera del día. Por dos motivos, y los dos importan:
 *
 *   · `draggable` NO EXISTE EN TÁCTIL. No es que funcione peor: en un teléfono
 *     no ocurre nada. Así que las flechas no eran una alternativa para quien no
 *     tuviera ratón — eran la única forma, y por eso tenían que estar.
 *   · Y nadie sabía que el gesto existía. La única pista era el cursor de agarre,
 *     que hay que descubrir pasando por encima, y un `title` que tarda un segundo
 *     en salir. Una función que no se sospecha es una función que no está.
 *
 * Y hay un tercero, medido en la hoja de series el 11 sep 2026: **el soltar
 * tampoco llegaba**. El asa arrancaba el arrastre, pero la fila de destino son
 * la cabecera del ejercicio y una tabla de casillas, y soltar sobre una casilla
 * —que es el 90 % de la superficie de la fila— no disparaba ningún `drop`. O
 * sea: se agarraba, se arrastraba, se soltaba y no pasaba nada. Exactamente el
 * síntoma que reportó el dueño, «no puedo mover ejercicios de orden en la hoja».
 *
 * Con eventos de puntero el gesto es el mismo en las dos entradas, el destino se
 * decide por GEOMETRÍA —qué sitio de la rejilla hay bajo el puntero— y no por
 * quién recibe el evento, y las flechas dejan de ser la única forma.
 *
 * ── Cuándo empieza a arrastrar, que es todo el asunto ───────────────────────
 * Con RATÓN, a los 4 px de movimiento: el clic tiene que seguir seleccionando el
 * día, y un clic humano nunca es perfectamente inmóvil.
 * Con el DEDO, tras una pulsación mantenida (240 ms) y sin haberse movido: la
 * página se desplaza deslizando, así que arrancar al primer píxel convertiría
 * cada intento de bajar por la rutina en un día cambiado de sitio. Mantener
 * pulsado es el gesto que ya significa «he cogido esto» en cualquier teléfono.
 *
 * ── Lo que se ve ────────────────────────────────────────────────────────────
 * El que viaja sigue al puntero y los de en medio SE APARTAN dejando el hueco.
 * Eso es lo que enseña el gesto sin explicarlo: al ver el sitio abrirse ya sabes
 * qué va a pasar al soltar. El desplazamiento es exactamente el tamaño del que
 * viaja más el hueco entre piezas, que es lo que mide el sitio que deja.
 *
 * Las medidas se toman UNA VEZ al empezar y no se vuelven a mirar: la posición
 * de destino se calcula contra la rejilla original, que es la que el ojo está
 * usando de referencia. Recalcular sobre las posiciones ya desplazadas haría que
 * el destino saltara solo.
 *
 * ── Y se miden en la PÁGINA, no en la ventana ───────────────────────────────
 * En un carril de pastillas daba igual: cabe entero en la pantalla. Una hoja de
 * series no — cada ejercicio mide 250 px y seis no caben —, así que arrastrar
 * incluye DESPLAZAR: al acercarse al canto de arriba o de abajo, la página sigue
 * al puntero. Con las medidas en coordenadas de ventana eso las invalidaría en
 * cuanto el primer píxel se desplazara; en coordenadas de página siguen valiendo
 * y el destino se calcula igual esté donde esté el papel.
 *
 * ── Cómo se usa ─────────────────────────────────────────────────────────────
 *   const orden = useArrastreOrden({ onMove: moverDia });
 *   <div ref={orden.carrilRef}>
 *     {items.map((it, i) => <button key={it.id} {...orden.props(i)} onClick={…} />)}
 *   </div>
 *
 * `props(i)` trae los manejadores, la marca `data-orden` con la que se miden las
 * piezas y el `style` con su desplazamiento. Las clases las pone quien lo usa
 * —cada carril tiene el suyo— consultando `arrastrando` y `destino`.
 *
 * Cuando la pieza es grande y solo se agarra por un sitio —una fila de la hoja,
 * que se coge por su asa y no por sus casillas— las dos mitades se piden por
 * separado: `pieza(i)` va en la fila (es la que se mide y la que se mueve) y
 * `asa(i)` en el agarre. `props(i)` es exactamente las dos juntas.
 *
 * @param onMove  (desde, hasta) — mover de verdad. Se llama al soltar, solo si
 *   el destino es otro sitio.
 * @param eje  `'x'` si las piezas van en fila (el carril de días) o `'y'` si van
 *   apiladas (la hoja de series). Decide hacia dónde se apartan las de en medio.
 */

/** Píxeles de movimiento con ratón antes de dar el gesto por arrastre. */
const UMBRAL_RATON = 4;
/** Milisegundos de pulsación mantenida en táctil. */
const ESPERA_TACTIL = 240;
/** Cuánto puede temblar un dedo apoyado sin que deje de ser una pulsación. */
const TEMBLOR = 8;
/** A cuántos píxeles del canto empieza la página a seguir al puntero. */
const BORDE = 90;
/** Y a cuántos píxeles por fotograma, como mucho. */
const VELOCIDAD = 18;

/** El hueco entre dos piezas seguidas de la misma línea (o columna). */
const huecoEntre = (rects, eje) => {
  for (let i = 0; i < rects.length - 1; i += 1) {
    if (eje === 'y') {
      if (Math.abs(rects[i].left - rects[i + 1].left) < 2) {
        return Math.max(0, rects[i + 1].top - rects[i].bottom);
      }
    } else if (Math.abs(rects[i].top - rects[i + 1].top) < 2) {
      return Math.max(0, rects[i + 1].left - rects[i].right);
    }
  }
  return 0;
};

/** Quién se desplaza cuando esto se arrastra: el primer antepasado con scroll. */
const scrollerDe = (nodo) => {
  for (let el = nodo?.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return el;
    }
  }
  return null;
};

const desplazamientoDel = (scroller) =>
  scroller ? scroller.scrollTop : window.scrollY || document.documentElement.scrollTop || 0;

/* Dónde empieza, en la ventana, el papel que se desplaza. Se pregunta VIVO y no
   se guarda al empezar: la página de fuera puede moverse durante el gesto, y con
   un valor guardado el puntero se leería en un sitio en el que no está. */
const sueloDe = (scroller) => (scroller ? scroller.getBoundingClientRect().top : 0);

/** El puntero, en las mismas coordenadas en las que están medidas las piezas. */
const enElPapel = (g, clienteY) => clienteY + desplazamientoDel(g.scroller) - sueloDe(g.scroller);

export const useArrastreOrden = ({ onMove, eje = 'x' }) => {
  const carrilRef = useRef(null);

  /** Índice que viaja. `null` = no hay arrastre en curso. */
  const [origen, setOrigen] = useState(null);
  /** Índice sobre el que se soltaría ahora mismo. */
  const [destino, setDestino] = useState(null);
  /** Cuánto se ha movido el que viaja, para que siga al puntero. */
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  /*
    ══ El fotograma de aterrizaje ═════════════════════════════════════════════

    Al soltar pasan dos cosas en el MISMO repintado: las piezas pierden su
    desplazamiento y la lista cambia de orden de verdad. Sin cuidado, la
    transición que abría el hueco se reproduce ahora al revés —cada pieza sale
    de donde estaba y se desliza hasta donde ya está— y se ve un rebote hacia
    atrás justo al terminar el gesto.

    Un fotograma sin transiciones y el aterrizaje es instantáneo, que es lo
    correcto: la animación explica el hueco MIENTRAS se arrastra; al soltar, el
    resultado ya está.
  */
  const [asentando, setAsentando] = useState(false);

  /* Lo que no se pinta vive en una ref: cambiarlo no tiene que redibujar nada,
     y los manejadores necesitan leerlo sin volver a crearse. */
  const gesto = useRef(null);
  /* Un arrastre termina en un `click` del navegador sobre la pieza de origen.
     Sin esta marca, mover un día acabaría además seleccionándolo. */
  const arrastro = useRef(false);
  /* El destino vivo, para poder leerlo al soltar sin recrear los manejadores en
     cada movimiento del puntero. */
  const destinoRef = useRef(null);
  /* El bucle que desplaza la página mientras se arrastra pegado a un canto. */
  const seguimiento = useRef(0);

  const pararSeguimiento = useCallback(() => {
    if (seguimiento.current) cancelAnimationFrame(seguimiento.current);
    seguimiento.current = 0;
  }, []);

  const limpiar = useCallback(() => {
    const g = gesto.current;
    if (g) {
      clearTimeout(g.temporizador);
      try {
        g.el?.releasePointerCapture?.(g.pointerId);
      } catch {
        /* El puntero ya se había soltado: no hay nada que liberar. */
      }
    }
    pararSeguimiento();
    gesto.current = null;
    destinoRef.current = null;
    setOrigen(null);
    setDestino(null);
    setDelta({ x: 0, y: 0 });
  }, [pararSeguimiento]);

  /** De puntero a índice: sobre qué sitio de la rejilla original está. */
  const sitioBajo = (x, y) => {
    const rects = gesto.current?.rects || [];
    const i = rects.findIndex((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
    return i === -1 ? null : i;
  };

  const activar = useCallback(
    (index) => {
      const g = gesto.current;
      if (!g || g.activo) return;

      const nodos = carrilRef.current?.querySelectorAll('[data-orden]') || [];
      /* En coordenadas de PÁGINA: la ventana puede desplazarse durante el
         arrastre y estas medidas tienen que seguir valiendo. */
      const scroller = scrollerDe(carrilRef.current);
      const base = desplazamientoDel(scroller);
      const suelo = sueloDe(scroller);
      const rects = [...nodos].map((n) => {
        const r = n.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
          top: r.top + base - suelo,
          bottom: r.bottom + base - suelo,
        };
      });
      if (rects.length < 2) return;

      g.activo = true;
      g.scroller = scroller;
      g.scroll0 = base;
      g.rects = rects;
      g.paso = (eje === 'y' ? rects[index].height : rects[index].width) + huecoEntre(rects, eje);
      g.eje = eje;
      try {
        g.el?.setPointerCapture?.(g.pointerId);
      } catch {
        /* Sin captura el arrastre sigue funcionando mientras el puntero no salga
           de la pieza; no es motivo para abortar el gesto. */
      }
      /* El golpecito que dice «lo tienes cogido». Solo lo tienen los teléfonos, y
         es justo donde el gesto no se ve venir. */
      if (g.tipo === 'touch') navigator.vibrate?.(8);
      destinoRef.current = index;
      setOrigen(index);
      setDestino(index);
    },
    [eje]
  );

  /*
    ══ La página sigue al puntero ═════════════════════════════════════════════
    Una hoja de seis ejercicios mide el triple que la pantalla, así que llevar
    el primero al último sitio es imposible si el papel no se mueve. Mientras el
    puntero esté a menos de `BORDE` del canto, el carril se desplaza — más
    deprisa cuanto más pegado al borde, que es como se comporta esto en
    cualquier sitio donde ya funcione.
  */
  const seguir = useCallback(() => {
    const g = gesto.current;
    if (!g?.activo) return;
    const alto = g.scroller ? g.scroller.clientHeight : window.innerHeight;
    const arriba = g.clienteY - sueloDe(g.scroller);
    const abajo = alto - arriba;
    let paso = 0;
    if (arriba < BORDE) paso = -Math.ceil(((BORDE - arriba) / BORDE) * VELOCIDAD);
    else if (abajo < BORDE) paso = Math.ceil(((BORDE - abajo) / BORDE) * VELOCIDAD);

    if (paso !== 0) {
      if (g.scroller) g.scroller.scrollTop += paso;
      else window.scrollBy(0, paso);
      /* Desplazar mueve el papel bajo un puntero que no se ha movido: el que
         viaja tiene que seguir pegado al dedo y el destino puede ser otro. */
      const corrido = desplazamientoDel(g.scroller) - g.scroll0;
      setDelta({ x: g.dx, y: g.dy + corrido });
      const sitio = sitioBajo(g.clienteX, enElPapel(g, g.clienteY));
      if (sitio !== null && sitio !== destinoRef.current) {
        destinoRef.current = sitio;
        setDestino(sitio);
      }
    }
    seguimiento.current = requestAnimationFrame(seguir);
  }, []);

  /* Mientras se arrastra con el dedo, la página no se desplaza sola. El listener
     es NO pasivo a propósito: los de React lo son, y desde uno pasivo
     `preventDefault()` no hace nada. */
  useEffect(() => {
    if (origen === null) return undefined;
    const frenar = (e) => e.preventDefault();
    document.addEventListener('touchmove', frenar, { passive: false });
    return () => document.removeEventListener('touchmove', frenar);
  }, [origen]);

  /* Escape suelta sin mover: la salida de cualquier gesto que se ha empezado
     sin querer. */
  useEffect(() => {
    if (origen === null) return undefined;
    const alPulsar = (e) => {
      if (e.key === 'Escape') limpiar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [origen, limpiar]);

  /* Al desmontar con un gesto a medias —se cambia de hoja arrastrando— no puede
     quedarse un `requestAnimationFrame` desplazando una página que ya no está. */
  useEffect(() => pararSeguimiento, [pararSeguimiento]);

  /** El agarre: los manejadores del gesto. */
  const asa = (index) => ({
    onPointerDown: (e) => {
      /* Solo el botón principal: con el derecho se abre un menú, no se arrastra. */
      if (e.button !== 0 || gesto.current) return;
      /* La marca de «esto viene de un arrastre» se limpia al empezar cualquier
         gesto nuevo. Es lo que impide que un arrastre táctil —donde el `click`
         posterior a veces no llega— deje la marca puesta y se coma el siguiente
         clic legítimo sobre otro día. */
      arrastro.current = false;
      gesto.current = {
        index,
        el: e.currentTarget,
        pointerId: e.pointerId,
        tipo: e.pointerType,
        x: e.clientX,
        y: e.clientY,
        dx: 0,
        dy: 0,
        clienteX: e.clientX,
        clienteY: e.clientY,
        activo: false,
        rects: [],
        paso: 0,
        scroller: null,
        scroll0: 0,
        temporizador:
          e.pointerType === 'touch' ? setTimeout(() => activar(index), ESPERA_TACTIL) : 0,
      };
    },

    onPointerMove: (e) => {
      const g = gesto.current;
      if (!g || g.index !== index) return;

      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      g.clienteX = e.clientX;
      g.clienteY = e.clientY;

      if (!g.activo) {
        if (g.tipo === 'touch') {
          /* Se ha movido antes de que saltara el temporizador: no venía a
             arrastrar, venía a desplazar la página. */
          if (Math.hypot(dx, dy) > TEMBLOR) limpiar();
          return;
        }
        if (Math.hypot(dx, dy) < UMBRAL_RATON) return;
        activar(index);
        if (!gesto.current?.activo) return;
        if (!seguimiento.current) seguimiento.current = requestAnimationFrame(seguir);
      }

      const corrido = desplazamientoDel(g.scroller) - g.scroll0;
      g.dx = dx;
      g.dy = dy;
      setDelta({ x: dx, y: dy + corrido });
      if (!seguimiento.current) seguimiento.current = requestAnimationFrame(seguir);
      const sitio = sitioBajo(e.clientX, enElPapel(g, e.clientY));
      if (sitio !== null) {
        destinoRef.current = sitio;
        setDestino(sitio);
      }
    },

    onPointerUp: () => {
      const g = gesto.current;
      if (!g || g.index !== index) return;
      const activo = g.activo;
      const hasta = destinoRef.current;
      limpiar();
      if (!activo) return;

      arrastro.current = true;
      setAsentando(true);
      requestAnimationFrame(() => setAsentando(false));
      if (hasta !== null && hasta !== index) onMove(index, hasta);
    },

    /* El navegador retira el puntero —una llamada entrante, el gesto de volver
       atrás—: se suelta donde estaba, sin mover nada. */
    onPointerCancel: () => {
      if (gesto.current?.index === index) limpiar();
    },
  });

  /** La pieza: lo que se mide y lo que se mueve. */
  const pieza = (index) => ({
    'data-orden': index,

    /* En captura, para poder anular el `onClick` de la propia pieza: React
       reparte la lista completa en orden y `stopPropagation` corta el resto,
       incluido el manejador de burbuja de este mismo elemento. */
    onClickCapture: (e) => {
      if (!arrastro.current) return;
      arrastro.current = false;
      e.preventDefault();
      e.stopPropagation();
    },

    style: (() => {
      if (origen !== null) {
        const aparta = desplazamientoDe(index, origen, destino, gesto.current);
        return {
          transform:
            index === origen
              ? `translate(${delta.x}px, ${delta.y}px)`
              : `translate${eje === 'y' ? 'Y' : 'X'}(${aparta}px)`,
        };
      }
      return asentando ? { transition: 'none' } : undefined;
    })(),
  });

  return {
    carrilRef,
    /** El índice que viaja, para atenuarlo. */
    arrastrando: origen,
    /** El sitio donde caería, para señalarlo. */
    destino: origen === null ? null : destino,
    asa,
    pieza,
    /** Las dos mitades juntas: la pieza ES su propio agarre. */
    props: (index) => ({ ...pieza(index), ...asa(index) }),
  };
};

/**
 * Cuánto se aparta la pieza `index` para dejar el hueco.
 *
 * Solo se apartan las de la MISMA LÍNEA que el que viaja: el carril envuelve
 * cuando hay muchos días, y correr una pastilla hacia la izquierda cuando el
 * hueco que se abre está en la fila de arriba no describe nada. Ahí basta con
 * el canto que marca el destino. Apiladas (`eje: 'y'`) la pregunta es la misma
 * una cuarta de vuelta: se apartan las de su columna.
 *
 * Se exporta para poder probarla: es geometría pura —el resto del gancho son
 * eventos de puntero, que no se prueban sin un navegador— y es donde vive el
 * error de uno en el tramo que se desplaza.
 */
export const desplazamientoDe = (index, origen, destino, g) => {
  if (destino === null || !g?.rects?.length) return 0;
  const aqui = g.rects[index];
  const viajero = g.rects[origen];
  if (!aqui || !viajero) return 0;
  const fuera =
    g.eje === 'y' ? Math.abs(aqui.left - viajero.left) > 2 : Math.abs(aqui.top - viajero.top) > 2;
  if (fuera) return 0;

  if (destino > origen && index > origen && index <= destino) return -g.paso;
  if (destino < origen && index >= destino && index < origen) return g.paso;
  return 0;
};
