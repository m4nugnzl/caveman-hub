import { useLayoutEffect } from 'react';

/**
 * LAS BARRAS DEL PROPIO NAVEGADOR, TEÑIDAS con la tinta del modo. (`W-06`)
 *
 * ══ Por qué esto es lo único que una app instalada no hace mejor ═══════════
 *
 * Instalada en la pantalla de inicio, el cromo del navegador no existe. En una
 * pestaña existe —unos 90 px medidos entre las dos barras— y con esto además
 * OBEDECE: Safari en iOS y Chrome en Android pintan su barra con el valor de
 * `<meta name="theme-color">`, y se puede cambiar en caliente.
 *
 * Así que el marco que parecía una factura por no haber instalado nada acaba
 * siendo parte del modo: al abrir una sesión de entreno, el teléfono entero se
 * pone de tinta hasta los cantos.
 *
 * ══ Cómo se usa, y qué se le pasa ══════════════════════════════════════════
 *
 *     useCromoTenido(haySesion ? '--sesion-cromo' : null);
 *
 * Se le da el NOMBRE de un token, no un color: el valor se lee del token ya
 * aplicado (`getComputedStyle`), que es lo que evita que un cambio de paleta
 * deje la barra descuadrada. Es el mismo camino que sigue `useTheme` con
 * `--canvas`, y el mismo que `useNoche` para la portada; si algún día uno de
 * los tres cambia, cambia por el mismo motivo.
 *
 * ── Se deshace SIEMPRE ────────────────────────────────────────────────────
 * Al soltarlo se devuelve el valor que había. Un cromo que se queda de tinta
 * después de terminar el entreno diría que sigues dentro.
 *
 * ── Y va en `useLayoutEffect` ─────────────────────────────────────────────
 * Por lo mismo que en `useNoche`: con `useEffect` el navegador alcanza a
 * pintar un fotograma con el color anterior, y en una transición de 200 ms eso
 * se ve como un parpadeo de la barra del sistema.
 */
export const useCromoTenido = (token) => {
  useLayoutEffect(() => {
    if (!token) return undefined;
    if (typeof document === 'undefined') return undefined;

    /* Las dos: `index.html` declara una por esquema de color con `media`, y la
       que manda es la que encaja con el esquema actual. Cambiarlas a la vez es
       lo que hace que el teñido funcione en los dos temas sin preguntar en cuál
       estamos. */
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    if (metas.length === 0) return undefined;

    const antes = metas.map((meta) => meta.getAttribute('content'));
    const color = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (!color) return undefined;

    metas.forEach((meta) => meta.setAttribute('content', color));

    return () => {
      metas.forEach((meta, i) => {
        if (antes[i] === null) meta.removeAttribute('content');
        else meta.setAttribute('content', antes[i]);
      });
    };
  }, [token]);
};
