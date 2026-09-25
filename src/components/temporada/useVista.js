import { useCallback, useEffect, useRef, useState } from 'react';

import { prefiereMenosMovimiento } from '@/lib/motion';
import { acotar, ampliar, desplazar, DIA_MS } from './escalaDeTiempo';

/*
  Cuánto dura un paso de zoom. Corto: es para que el ojo siga a qué tramo se
  ha ido, no un efecto. Con menos movimiento pedido, salta.
*/
const DURACION = 250;
const suave = (t) => 1 - (1 - t) ** 3;
/* Lo que se mueve un puntero antes de que el gesto cuente como arrastre. */
const UMBRAL = 6;
/* Lo que hay que mantener el dedo quieto para empezar una franja. */
const PULSACION_LARGA = 380;

/**
 * EL ESTADO DE LA VISTA: `{ inicio, fin }` y los gestos que lo mueven.
 *
 * Es el único estado de zoom de la herramienta. Los carriles no lo tocan:
 * reciben la escala que sale de él. Lo que se ve ES el rango: no hay otra
 * selección en la gráfica (25 sep).
 *
 * ── Los gestos ─────────────────────────────────────────────────────────────
 *   · El ratón, al pasar: el cursor de lectura (`onCursor`).
 *   · El ratón, pulsando y arrastrando en horizontal: una FRANJA
 *     (`onFranja`); al soltarla, quien la recibe acerca la vista a ella.
 *     Arrastrar ya no desplaza.
 *   · Pellizco en el trackpad (llega como rueda con Ctrl) y Ctrl + rueda:
 *     acercar o alejar alrededor del cursor.
 *   · Rueda horizontal, o Mayús + rueda: desplazar.
 *   · Un dedo deslizando: el cursor, como en Salud. Al levantarlo, se va. En
 *     vertical la página sigue bajando (`touch-action: pan-y` en el CSS).
 *   · Un dedo que se queda quieto una pulsación larga y luego arrastra: la
 *     franja.
 *   · Dos dedos: desplazar y pellizcar alrededor de su punto medio.
 *   · Pulsar sin arrastrar sigue siendo pulsar (`seMovio`).
 *   · Teclado, con el lienzo enfocado: ← y → desplazan una semana; + y −
 *     acercan y alejan.
 *
 * La columna de los nombres de las filas no es lienzo: ahí no empieza ningún
 * gesto. La rueda vertical sin modificador NO se toca: es la de la página, y
 * robársela a quien baja leyendo sería una trampa.
 *
 * @param limites  de dónde a dónde se puede mover (`limitesDe`).
 * @param inicial  la vista con la que abre.
 * @param margen   los píxeles de la izquierda del lienzo que no son eje (la
 *                 columna de los nombres de los carriles).
 * @param margenDerecho los de la derecha (el sitio de la flecha del eje).
 * @param onFranja recibe `{ a, b, fin }` (en ms, sin ordenar) mientras se
 *                 arrastra una franja, con `fin` al soltar, o `null` si se
 *                 deshace. Quien la recibe la ajusta a semanas o días.
 * @param onCursor recibe el instante bajo el cursor (en ms), o `null` cuando
 *                 se va.
 */
export const useVista = ({ limites, inicial, margen = 0, margenDerecho = 0, onFranja = null, onCursor = null }) => {
  const [vista, setVistaCruda] = useState(() => acotar(inicial, limites));
  const vistaRef = useRef(vista);
  const animacion = useRef(null);
  /* A dónde va el paso en curso: una tecla pulsada a mitad de un paso parte de
     su destino, no de donde iba, o la semana acabaría empezando en jueves. */
  const destinoRef = useRef(null);
  const lienzoRef = useRef(null);

  /* La caja del eje dentro del lienzo: sin la columna de los nombres ni el
     sitio de la flecha. */
  const caja = useCallback(
    (el) => {
      const r = el?.getBoundingClientRect() || { left: 0, width: 1 };
      return { left: r.left + margen, width: Math.max(1, r.width - margen - margenDerecho) };
    },
    [margen, margenDerecho]
  );

  const poner = useCallback(
    (v) => {
      const siguiente = acotar(v, limites);
      vistaRef.current = siguiente;
      setVistaCruda(siguiente);
    },
    [limites]
  );

  /* Los límites cambian cuando cambia el plan (otra fase, otro destino, o
     porque acaban de llegar las revisiones): la vista se vuelve a acotar sin
     moverse más de lo necesario. Si enseñaba la temporada entera, sigue
     enseñándola: crecer los límites no puede sacarla del nivel. */
  const limitesPrevios = useRef(limites);
  useEffect(() => {
    const antes = limitesPrevios.current;
    limitesPrevios.current = limites;
    const v = vistaRef.current;
    const entera = v.inicio <= antes.inicio && v.fin >= antes.fin;
    poner(entera ? limites : v);
  }, [limites, poner]);

  const parar = () => {
    if (animacion.current) cancelAnimationFrame(animacion.current);
    animacion.current = null;
    destinoRef.current = null;
  };

  /** Ir a una vista con un paso corto, o de golpe si se pide menos movimiento. */
  const irA = useCallback(
    (destino) => {
      parar();
      const fin = acotar(destino, limites);
      const desde = vistaRef.current;
      if (prefiereMenosMovimiento() || typeof requestAnimationFrame === 'undefined') return poner(fin);
      destinoRef.current = fin;
      const t0 = performance.now();
      const paso = (ahora) => {
        const t = Math.min(1, (ahora - t0) / DURACION);
        const k = suave(t);
        poner({ inicio: desde.inicio + (fin.inicio - desde.inicio) * k, fin: desde.fin + (fin.fin - desde.fin) * k });
        animacion.current = t < 1 ? requestAnimationFrame(paso) : null;
        if (t >= 1) destinoRef.current = null;
      };
      animacion.current = requestAnimationFrame(paso);
      return undefined;
    },
    [limites, poner]
  );

  /** Poner una vista de golpe, sin paso (el minimapa, que va pegado al dedo). */
  const ponerYa = useCallback(
    (v) => {
      parar();
      poner(v);
    },
    [poner]
  );

  useEffect(() => parar, []);

  /* ── La rueda y el pellizco del trackpad ──────────────────────────────────
     Se engancha a mano porque React registra `wheel` como pasivo y entonces
     `preventDefault` no evita que el navegador haga zoom de la página. */
  useEffect(() => {
    const el = lienzoRef.current;
    if (!el) return undefined;
    const alGirar = (e) => {
      const r = caja(el);
      const v = vistaRef.current;
      const px = e.clientX - r.left;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        parar();
        const ancla = v.inicio + (px / (r.width || 1)) * (v.fin - v.inicio);
        poner(ampliar(v, Math.exp(-e.deltaY * 0.01), ancla, limites));
        return;
      }
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (Math.abs(dx) > Math.abs(e.shiftKey ? 0 : e.deltaY)) {
        e.preventDefault();
        parar();
        poner(desplazar(v, (dx / (r.width || 1)) * (v.fin - v.inicio), limites));
      }
    };
    el.addEventListener('wheel', alGirar, { passive: false });
    return () => el.removeEventListener('wheel', alGirar);
  }, [limites, poner, caja]);

  /* ── El dedo y el ratón ────────────────────────────────────────────────── */
  const punteros = useRef(new Map());
  const gesto = useRef(null);
  /* Si el último gesto hizo algo: entonces soltar no es pulsar. */
  const movido = useRef(false);
  const espera = useRef(null);
  const franja = useRef(onFranja);
  franja.current = onFranja;
  const cursor = useRef(onCursor);
  cursor.current = onCursor;

  const dejarDeEsperar = () => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
  };
  useEffect(() => dejarDeEsperar, []);

  /* El instante bajo un puntero, en ms: la franja se guarda así y la ajusta
     a semanas quien la recibe. */
  const tiempoEn = (clientX) => {
    const r = caja(lienzoRef.current);
    const v = vistaRef.current;
    const px = Math.max(0, Math.min(r.width, clientX - r.left));
    return v.inicio + (px / (r.width || 1)) * (v.fin - v.inicio);
  };
  /* Si un punto cae en el trazo (no en la columna de los nombres ni en el
     sitio de la flecha). */
  const enElTrazo = (clientX) => {
    const r = caja(lienzoRef.current);
    return clientX >= r.left && clientX <= r.left + r.width;
  };

  const estirar = (g, clientX, fin = false) => {
    g.b = tiempoEn(clientX);
    franja.current?.({ a: g.a, b: g.b, fin });
  };

  const alBajar = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!enElTrazo(e.clientX) && !punteros.current.size) return;
    parar();
    dejarDeEsperar();
    punteros.current.set(e.pointerId, e.clientX);
    movido.current = false;
    const xs = [...punteros.current.values()];
    /*
      Qué hará este gesto si se arrastra. El ratón: una franja. Un dedo: el
      cursor, y una franja si se queda quieto una pulsación larga. Dos:
      pellizcar y desplazar.
    */
    let modo = 'pellizco';
    if (xs.length === 1) modo = e.pointerType === 'mouse' ? 'franja' : 'cursor';
    if (modo === 'cursor') cursor.current?.(tiempoEn(e.clientX));
    else if (xs.length > 1) {
      cursor.current?.(null);
      /* Un segundo dedo deshace la franja que se estaba dibujando. */
      if (gesto.current?.modo === 'estirando') franja.current?.(null);
    }
    gesto.current = {
      vista: vistaRef.current,
      xs,
      medio: xs.reduce((a, b) => a + b, 0) / xs.length,
      separacion: xs.length > 1 ? Math.abs(xs[0] - xs[1]) : null,
      modo,
      a: tiempoEn(e.clientX),
      b: null,
    };
    if (modo === 'cursor' && franja.current) {
      const id = e.pointerId;
      const el = lienzoRef.current;
      espera.current = setTimeout(() => {
        espera.current = null;
        const g = gesto.current;
        if (!g || g.modo !== 'cursor' || punteros.current.size !== 1) return;
        g.modo = 'estirando';
        movido.current = true;
        el?.setPointerCapture?.(id);
        cursor.current?.(null);
        /* Un toque corto en la mano: la pulsación larga ya es otra cosa. */
        navigator.vibrate?.(8);
        estirar(g, punteros.current.get(id));
      }, PULSACION_LARGA);
    }
  };

  const alMover = (e) => {
    if (!punteros.current.has(e.pointerId) || !gesto.current) {
      /* El ratón que pasa sin apretar: el cursor. En la columna de los
         nombres no hay cursor. */
      if (e.pointerType === 'mouse' && !e.buttons) cursor.current?.(enElTrazo(e.clientX) ? tiempoEn(e.clientX) : null);
      return;
    }
    punteros.current.set(e.pointerId, e.clientX);
    const el = lienzoRef.current;
    const r = caja(el);
    const w = r.width || 1;
    const g = gesto.current;
    const xs = [...punteros.current.values()];

    if (g.modo === 'estirando') {
      estirar(g, e.clientX);
      return;
    }
    if (g.modo === 'franja') {
      if (Math.abs(e.clientX - g.medio) < UMBRAL) return;
      g.modo = 'estirando';
      movido.current = true;
      el?.setPointerCapture?.(e.pointerId);
      cursor.current?.(null);
      estirar(g, e.clientX);
      return;
    }
    if (g.modo === 'cursor') {
      if (!movido.current && Math.abs(e.clientX - g.medio) >= UMBRAL) {
        /* El dedo se movió antes de la pulsación larga: es el cursor. */
        dejarDeEsperar();
        movido.current = true;
        el?.setPointerCapture?.(e.pointerId);
      }
      cursor.current?.(tiempoEn(e.clientX));
      return;
    }

    if (xs.length > 1 && g.separacion) {
      const span = g.vista.fin - g.vista.inicio;
      const sep = Math.abs(xs[0] - xs[1]) || 1;
      const medio = (xs[0] + xs[1]) / 2;
      const ancla = g.vista.inicio + ((g.medio - r.left) / w) * span;
      let v = ampliar(g.vista, sep / g.separacion, ancla, limites);
      v = desplazar(v, -((medio - g.medio) / w) * (v.fin - v.inicio), limites);
      movido.current = true;
      poner(v);
    }
  };

  const alSoltar = (e) => {
    dejarDeEsperar();
    const g = gesto.current;
    /* Un `pointercancel` (el navegador se queda el gesto) no trae posición:
       la franja acaba donde iba. */
    if (g?.modo === 'estirando')
      estirar(g, e.type === 'pointercancel' ? punteros.current.get(e.pointerId) : e.clientX, true);
    /* Al levantar el dedo, el cursor se va, como en Salud. */
    if (g?.modo === 'cursor') cursor.current?.(null);
    punteros.current.delete(e.pointerId);
    const xs = [...punteros.current.values()];
    /* Al levantar un dedo de un pellizco, el otro sigue desde donde está, no
       desde donde empezó; solo, ya no pellizca. */
    gesto.current = xs.length ? { vista: vistaRef.current, xs, medio: xs[0], separacion: null, modo: 'quieto' } : null;
  };

  const alTeclear = (e) => {
    const v = destinoRef.current || vistaRef.current;
    const centro = (v.inicio + v.fin) / 2;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      irA(desplazar(v, (e.key === 'ArrowLeft' ? -7 : 7) * DIA_MS, limites));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      irA(ampliar(v, 1.5, centro, limites));
    } else if (e.key === '-') {
      e.preventDefault();
      irA(ampliar(v, 1 / 1.5, centro, limites));
    }
  };

  return {
    vista,
    irA,
    ponerYa,
    lienzoRef,
    /** Si el puntero que acaba de soltarse arrastró: el clic que sigue no cuenta. */
    seMovio: () => movido.current,
    /** Si un punto de la pantalla cae en el trazo de la gráfica. */
    enElTrazo: (clientX) => Boolean(lienzoRef.current) && enElTrazo(clientX),
    gestos: {
      onPointerDown: alBajar,
      onPointerMove: alMover,
      onPointerUp: alSoltar,
      onPointerCancel: alSoltar,
      onKeyDown: alTeclear,
    },
  };
};
