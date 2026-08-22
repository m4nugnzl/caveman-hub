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
 * Con eventos de puntero el gesto es el mismo en las dos entradas, así que las
 * flechas dejan de hacer falta y el orden se cambia donde se ve.
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
 * qué va a pasar al soltar. El desplazamiento es exactamente el ancho del que
 * viaja más el hueco entre pastillas, que es lo que mide el sitio que deja.
 *
 * Las medidas se toman UNA VEZ al empezar y no se vuelven a mirar: la posición
 * de destino se calcula contra la rejilla original, que es la que el ojo está
 * usando de referencia. Recalcular sobre las posiciones ya desplazadas haría que
 * el destino saltara solo.
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
 * @param onMove  (desde, hasta) — mover de verdad. Se llama al soltar, solo si
 *   el destino es otro sitio.
 */

/** Píxeles de movimiento con ratón antes de dar el gesto por arrastre. */
const UMBRAL_RATON = 4;
/** Milisegundos de pulsación mantenida en táctil. */
const ESPERA_TACTIL = 240;
/** Cuánto puede temblar un dedo apoyado sin que deje de ser una pulsación. */
const TEMBLOR = 8;

/** El hueco entre dos piezas seguidas de la misma línea. */
const huecoEntre = (rects) => {
  for (let i = 0; i < rects.length - 1; i += 1) {
    if (Math.abs(rects[i].top - rects[i + 1].top) < 2) {
      return Math.max(0, rects[i + 1].left - rects[i].right);
    }
  }
  return 0;
};

export const useArrastreOrden = ({ onMove }) => {
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
    gesto.current = null;
    setOrigen(null);
    setDestino(null);
    setDelta({ x: 0, y: 0 });
  }, []);

  /** De puntero a índice: sobre qué sitio de la rejilla original está. */
  const sitioBajo = (x, y) => {
    const rects = gesto.current?.rects || [];
    const i = rects.findIndex((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
    return i === -1 ? null : i;
  };

  const activar = useCallback((index) => {
    const g = gesto.current;
    if (!g || g.activo) return;

    const nodos = carrilRef.current?.querySelectorAll('[data-orden]') || [];
    const rects = [...nodos].map((n) => n.getBoundingClientRect());
    if (rects.length < 2) return;

    g.activo = true;
    g.rects = rects;
    g.paso = rects[index].width + huecoEntre(rects);
    try {
      g.el?.setPointerCapture?.(g.pointerId);
    } catch {
      /* Sin captura el arrastre sigue funcionando mientras el puntero no salga
         de la pieza; no es motivo para abortar el gesto. */
    }
    /* El golpecito que dice «lo tienes cogido». Solo lo tienen los teléfonos, y
       es justo donde el gesto no se ve venir. */
    if (g.tipo === 'touch') navigator.vibrate?.(8);
    setOrigen(index);
    setDestino(index);
  }, []);

  /* Mientras se arrastra con el dedo, la página no se desplaza. El listener es
     NO pasivo a propósito: los de React lo son, y desde uno pasivo
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

  const props = (index) => ({
    'data-orden': index,

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
        activo: false,
        rects: [],
        paso: 0,
        temporizador:
          e.pointerType === 'touch' ? setTimeout(() => activar(index), ESPERA_TACTIL) : 0,
      };
    },

    onPointerMove: (e) => {
      const g = gesto.current;
      if (!g || g.index !== index) return;

      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;

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
      }

      setDelta({ x: dx, y: dy });
      const sitio = sitioBajo(e.clientX, e.clientY);
      if (sitio !== null) setDestino(sitio);
    },

    onPointerUp: () => {
      const g = gesto.current;
      if (!g || g.index !== index) return;
      const activo = g.activo;
      const hasta = destino;
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
        return {
          transform:
            index === origen
              ? `translate(${delta.x}px, ${delta.y}px)`
              : `translateX(${desplazamientoDe(index, origen, destino, gesto.current)}px)`,
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
    props,
  };
};

/**
 * Cuánto se aparta la pieza `index` para dejar el hueco.
 *
 * Solo se apartan las de la MISMA LÍNEA que el que viaja: el carril envuelve
 * cuando hay muchos días, y correr una pastilla hacia la izquierda cuando el
 * hueco que se abre está en la fila de arriba no describe nada. Ahí basta con
 * el canto que marca el destino.
 *
 * Se exporta para poder probarla: es geometría pura —el resto del gancho son
 * eventos de puntero, que no se prueban sin un navegador— y es donde vive el
 * error de uno en el tramo que se desplaza.
 */
export const desplazamientoDe = (index, origen, destino, g) => {
  if (destino === null || !g?.rects?.length) return 0;
  const aqui = g.rects[index];
  const viajero = g.rects[origen];
  if (!aqui || !viajero || Math.abs(aqui.top - viajero.top) > 2) return 0;

  if (destino > origen && index > origen && index <= destino) return -g.paso;
  if (destino < origen && index >= destino && index < origen) return g.paso;
  return 0;
};
