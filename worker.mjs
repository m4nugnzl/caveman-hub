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
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(new URL('/app', request.url));
  },
};
