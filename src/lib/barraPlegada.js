import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Si la barra lateral está recogida a iconos.
 *
 * ══ Dónde se manda, y las tres vueltas que costó ════════════════════════════
 *
 * 1. Un interruptor en la fila de la marca, dentro de la barra. Cromo del
 *    chasis en la esquina donde el chasis no tiene que explicarse: «no me gusta
 *    del todo la implementación».
 * 2. Un botón «Ampliar» en la cabecera de Entreno, la pantalla que pide el
 *    ancho. Tampoco: «el ampliar no lo quiero en la cabecera de Entreno, en
 *    todo caso ha de ser en el borde de la página para todas las páginas».
 *    Y la queja tenía razón por donde no se ve: metido en UNA pantalla, el
 *    pliegue era una función de esa pantalla —había que estar en Entreno para
 *    plegar y para devolver—, así que el chasis dependía de dónde estuvieras.
 * 3. Una pastilla fija en la COSTURA, el canto entre la barra y la página.
 *    Cumplía lo de «en todas las páginas» y falló por otras dos: «ha de estar
 *    en el lienzo, no en el borde entre el lienzo y la barra lateral, queda
 *    impostado ahí», y —lo grave— «le das y no aumenta el tamaño, solo se
 *    desplaza». Era verdad: la hoja tiene tope fijo, así que los 192 px que
 *    devolvía la barra se quedaban en la mesa y el trabajo solo se corría a la
 *    izquierda. Un mando que promete ancho y entrega mudanza no vale.
 *
 * Y seis más después de esas tres (el historial entero, en `ui/Pliegue`).
 * Hoy es una capa sobre la esquina de la PROPIA BARRA, que solo aparece al
 * pasar por ella: pertenece a lo que pliega y no le quita al lienzo ni un
 * píxel. Lo que hace de verdad sigue siendo ensanchar la hoja: plegada la
 * barra, `--max-w-trabajo` sube los 192 px que ella suelta (ver `chasis.css`).
 *
 * ── Por qué es un almacén y no un `useState` ────────────────────────────────
 * El estado lo leen piezas que no son padre unas de otras —el mando, la barra
 * que se pinta plegada y el ancho de la hoja—, y con un `useState` en
 * `CoachLayout` habría que bajarlo por contexto o por props. Es una preferencia
 * del aparato guardada en `localStorage` —una sola verdad, fuera de React—, así
 * que se lee con `useSyncExternalStore` y quien la quiera la pide donde esté.
 *
 * ── En el navegador y no en el perfil ───────────────────────────────────────
 * Es una preferencia del APARATO, no de la persona: el mismo entrenador quiere
 * la barra abierta en el monitor del despacho y plegada en el portátil de
 * catorce pulgadas. Guardarla en `profiles.preferences` sincronizaría los dos,
 * que es justo lo que no se quiere. Mismo criterio que el tema (`lib/useTheme`).
 */

const CLAVE = 'caveman-barra-plegada';

const guardado = () => {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    // Modo privado o almacenamiento bloqueado: la barra sale abierta, que es el
    // estado en el que todo se lee.
    return false;
  }
};

/* El valor vivo y quién lo mira. Fuera del árbol a propósito: los montajes del
   mando y la barra tienen que ver el MISMO booleano, y ninguno es padre de los
   otros. */
let plegada = guardado();
const oyentes = new Set();

const suscribir = (avisar) => {
  oyentes.add(avisar);
  return () => oyentes.delete(avisar);
};

const leer = () => plegada;

/* En servidor no hay barra que plegar, y `useSyncExternalStore` exige una
   respuesta para el primer render. */
const leerEnServidor = () => false;

export const alternarBarra = () => {
  plegada = !plegada;
  try {
    localStorage.setItem(CLAVE, plegada ? '1' : '0');
  } catch {
    /* Sin almacenamiento el pliegue funciona igual, solo que no se recuerda en
       la siguiente visita. No es motivo para no dejar plegarla. */
  }
  oyentes.forEach((avisar) => avisar());
};

/* Aquí vivió `useMandoDescubierto`, la marca de «este aparato ya sabe que el
   mando existe». Hacía falta cuando el mando se escondía en el lienzo y solo se
   encendía al acercarse a una franja: había que enseñarlo una primera vez. Hoy
   también está escondido en reposo, pero lo que lo enciende es LA BARRA ENTERA
   —por donde se navega—, así que es imposible no verlo y no hay nada que
   recordar. Se borró la clave también: un `localStorage` con banderas que ya
   no lee nadie es basura que sobrevive al código. */

/**
 * El atajo del ancho: `Ctrl + B` (`⌘ + B` en Apple), y `Ctrl + \` de propina.
 *
 * La `B` la pide el dueño y es la de Slack, Xcode y el propio VS Code para su
 * barra primaria. La `\` estaba antes y se queda sin anunciarse: no cuesta un
 * byte y respeta el dedo de quien ya la tenía aprendida.
 *
 * ── `preventDefault`, y en cuál ────────────────────────────────────────────
 * Solo en la `B`, y hace falta: en Firefox `Ctrl + B` abre el panel de
 * marcadores, así que sin esto el atajo plegaría la barra Y sacaría un cajón
 * del navegador encima. La `\` no tiene función propia en ningún navegador y se
 * deja pasar.
 *
 * ── Y NO se dispara mientras se escribe ───────────────────────────────────
 * `Ctrl + B` es «negrita» en cualquier caja de texto enriquecido y es un gesto
 * que los dedos hacen solos. En un `input` o un `textarea` normales no hace
 * nada, pero el día que esta aplicación tenga un campo con formato, el atajo se
 * le comería la negrita. Con un campo enfocado, el ancho de la ventana no es lo
 * que se está tocando. (La `\` sí pasa siempre, como en VS Code.)
 *
 * Se monta UNA vez, y por eso no cuelga de `useBarraPlegada`: ese hook lo piden
 * los montajes del mando, y con el oyente dentro una sola pulsación alternaría
 * varias veces —o sea, ninguna—. Su sitio es `CoachLayout`, que es el único que
 * pinta la barra: sin barra no hay nada que plegar.
 */
const escribiendo = (el) =>
  !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export const useAtajoDelAncho = () => {
  useEffect(() => {
    const alPulsar = (evento) => {
      if (!(evento.metaKey || evento.ctrlKey) || evento.altKey) return;
      const tecla = String(evento.key).toLowerCase();
      if (tecla === 'b') {
        if (escribiendo(document.activeElement)) return;
        evento.preventDefault();
        alternarBarra();
        return;
      }
      if (tecla === '\\') alternarBarra();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);
};

/* ══ EL INTERRUPTOR DE PROTOTIPO ══════════════════════════════════════════
   TEMPORAL, y ya solo con UNA pregunta abierta: el dibujo del icono.

   La otra —DÓNDE va el mando— la cerró el dueño el 21 sep, y se cerró sacándolo
   del lienzo. Aquí vivió `?mando=0|1|2`, tres sitios dentro de la hoja
   comparados por lo que costaban de ancho (13 px, 13 px, cero). Los tres
   perdieron por lo mismo: «me sigue chirriando que esté ahí siempre». En la
   superficie donde se trabaja, lo permanente molesta cueste lo que cueste.
   Ahora vive en la barra, como capa que solo aparece al pasar por ella, y no
   hay posición que elegir. Se borra la clave también: un `localStorage` con
   ajustes que ya no lee nadie es basura que sobrevive al código.

     ?icono=panel   el de la casa de iconos (`PanelLeftClose` / `PanelLeftOpen`)
     ?icono=marca   una marca propia: la barra DIBUJADA, ancha o estrecha

   Se pone una vez y queda guardado en el aparato. */
const AJUSTES = {
  icono: { clave: 'caveman-mando-icono', valores: ['panel', 'marca'], porDefecto: 'panel' },
};

try {
  localStorage.removeItem('caveman-mando-sitio');
} catch {
  /* Sin almacenamiento no hay nada que limpiar. */
}

const ajusteGuardado = (nombre) => {
  const { clave, valores, porDefecto } = AJUSTES[nombre];
  try {
    const dela = new URLSearchParams(window.location.search).get(nombre);
    if (dela !== null) {
      const limpio = valores.includes(dela) ? dela : porDefecto;
      localStorage.setItem(clave, limpio);
      return limpio;
    }
    const puesto = localStorage.getItem(clave);
    return valores.includes(puesto) ? puesto : porDefecto;
  } catch {
    return porDefecto;
  }
};

/* Se leen UNA vez al arrancar: cambiar de prototipo es recargar, que es lo que
   se quiere — dos formas del mando vivas en la misma sesión no se comparan, se
   confunden. */
const elegido = {};
const leerAjuste = (nombre) => {
  if (elegido[nombre] === undefined) {
    elegido[nombre] =
      typeof window === 'undefined' ? AJUSTES[nombre].porDefecto : ajusteGuardado(nombre);
  }
  return elegido[nombre];
};
const sinCambios = () => () => {};

export const useMandoIcono = () =>
  useSyncExternalStore(sinCambios, () => leerAjuste('icono'), () => AJUSTES.icono.porDefecto);

export const useBarraPlegada = () => {
  const estado = useSyncExternalStore(suscribir, leer, leerEnServidor);
  /* Estable entre renders: el mando lo recibe como `onClick` y no tiene por qué
     redibujarse porque su padre lo haga. */
  const alternar = useCallback(() => alternarBarra(), []);
  return [estado, alternar];
};
