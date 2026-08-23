/**
 * El comodín de la aplicación, en Workers.
 *
 * ══ El problema que resuelve ════════════════════════════════════════════════
 *
 * Desde que la portada se prerenderiza (`scripts/prerender.mjs`), `index.html`
 * lleva DENTRO el contenido de la portada y el shell vacío de la aplicación
 * vive en `app.html`. Las rutas de la aplicación (`/hoy`, `/mi/rutina`,
 * `/c/<id>/…`) tienen que arrancar sobre ese shell: si cayeran en `index.html`,
 * cada apertura pintaría la portada un instante antes de montar React.
 *
 * En Pages o Netlify eso se dice con una línea de `_redirects`
 * (`/*  /app.html  200`). En un Worker NO: el archivo se procesa distinto y esa
 * regla producía un bucle de redirecciones que tumbó el sitio entero — todas
 * las rutas, incluida la portada, contestaban `307 → /app` en círculo
 * (21/08/2026). Este script es la forma correcta de decir lo mismo aquí.
 *
 * ══ Cómo funciona ═══════════════════════════════════════════════════════════
 *
 * Los archivos que existen de verdad —la portada, las legales prerenderizadas,
 * `/assets/…`, las fuentes, `sw.js`— los sirve Cloudflare ANTES de invocar este
 * código: el worker solo corre cuando ninguna ruta coincide con un archivo. Es
 * decir, exactamente cuando alguien abre una ruta de la aplicación. Se contesta
 * con el shell, con un 200 y sin tocar la URL: con una redirección se perdería
 * a dónde iba el usuario, que es lo que el router necesita leer.
 *
 * `/app` y no `/app.html`: el servidor de archivos canonicaliza los `.html`
 * (307 a la ruta sin extensión) y pedir la forma canónica evita reintroducir
 * la redirección que este script existe para eliminar.
 *
 * ══ Por qué un ARCHIVO que falta tiene que dar 404 ══════════════════════════
 *
 * Esto contestaba el shell a TODO lo que no fuera un archivo existente, y ese
 * «todo» incluye `/assets/index-<hash>.css`. O sea: una hoja de estilos que ya
 * no está no daba 404, daba una página HTML con un 200. Y eso rompe la portada
 * entera sin un solo error a la vista:
 *
 *   · El navegador rechaza la hoja por el tipo de contenido (`nosniff` en
 *     `public/_headers` lo hace obligatorio), así que la página se pinta con la
 *     hoja del navegador: el `<figure>` con su sangrado de 40 px, el `<body>`
 *     con su margen de 8 px y las capturas a tamaño natural.
 *   · Peor: el service worker veía un 200 y lo GUARDABA bajo la URL del CSS
 *     (`scripts/sw.mjs`). Su rama de `/assets/` es caché primero y no vuelve a
 *     mirar la red, así que a partir de ahí ese navegador —y solo ese, porque
 *     la caché es suya— servía HTML como si fuera CSS en cada recarga. De ahí
 *     el caso del 23/08/2026: roto en Safari, perfecto en Chrome.
 *
 * La regla va por EXTENSIÓN y no por `Sec-Fetch-Mode`, que es lo que se suele
 * usar para distinguir una navegación: esa cabecera no la mandan los Safari
 * anteriores al 16.4 y darles 404 en una navegación sería mucho peor que el
 * fallo que arregla. La lista es cerrada a propósito — lo que no está en ella
 * sigue cayendo en el shell, así que ninguna ruta de la aplicación cambia.
 */

/** Lo que es un archivo. Si acaba así y no existe, la respuesta es 404. */
const ARCHIVO = /\.(css|js|mjs|map|json|webmanifest|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|mp3|txt|xml|pdf)$/i;

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (ARCHIVO.test(pathname)) {
      /* `no-store`: si esto pasa a mitad de un despliegue, el hueco dura lo que
         dura el despliegue y no se queda grabado en ninguna caché. */
      return new Response('No encontrado', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        },
      });
    }

    return env.ASSETS.fetch(new URL('/app', request.url));
  },
};
