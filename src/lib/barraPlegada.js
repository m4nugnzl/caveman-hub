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
 * Hoy es un botón callado en la ESQUINA DE LA CINTA, la línea con la que
 * arranca toda pantalla, y lo que hace de verdad es ensanchar la hoja: plegada
 * la barra, `--max-w-trabajo` sube los 192 px que ella suelta (ver
 * `chasis.css`). El mando está donde está el trabajo y el trabajo crece.
 *
 * ── Por qué es un almacén y no un `useState` ────────────────────────────────
 * El mando ya no lo pinta quien pinta la barra: la cinta la montan tres piezas
 * distintas (`CoachLayout`, `ClientPortfolio`, `ui/Cinta`) y el `<aside>`
 * vive en la primera. Con un `useState` en `CoachLayout` habría que bajar el
 * gancho por contexto o por props hasta el fondo del árbol. Es una preferencia
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

/* El valor vivo y quién lo mira. Fuera del árbol a propósito: los tres montajes
   del mando y la barra tienen que ver el MISMO booleano, y ninguno es padre de
   los otros. */
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

/**
 * El atajo del ancho: `Ctrl + \` (`⌘ + \` en Apple).
 *
 * La barra que se abre y se cierra con la misma tecla en VS Code, en Linear y en
 * Notion. Es el gesto de quien pliega y devuelve diez veces al día, y no le
 * cuesta un píxel a la pantalla — el botón de la calle sigue estando para quien
 * no se sabe las teclas.
 *
 * Se monta UNA vez, y por eso no cuelga de `useBarraPlegada`: ese hook lo piden
 * los tres montajes del mando, y con el oyente dentro una sola pulsación
 * alternaría tres veces —o sea, ninguna—. Su sitio es `CoachLayout`, que es el
 * único que pinta la barra: sin barra no hay nada que plegar.
 *
 * Sin `preventDefault`: `Ctrl + \` no tiene función propia en los navegadores
 * (a diferencia de `Ctrl + K`, que en Firefox se lleva la búsqueda del
 * navegador). Y funciona también con un campo enfocado, como en VS Code: el
 * ancho de la ventana no es parte de lo que estás escribiendo.
 */
export const useAtajoDelAncho = () => {
  useEffect(() => {
    const alPulsar = (evento) => {
      if (!(evento.metaKey || evento.ctrlKey) || evento.key !== '\\') return;
      alternarBarra();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);
};

export const useBarraPlegada = () => {
  const estado = useSyncExternalStore(suscribir, leer, leerEnServidor);
  /* Estable entre renders: el mando lo recibe como `onClick` y no tiene por qué
     redibujarse porque su padre lo haga. */
  const alternar = useCallback(() => alternarBarra(), []);
  return [estado, alternar];
};
