/**
 * El service worker, y el plugin de Vite que lo emite en cada build.
 *
 * ══ Para qué existe ═════════════════════════════════════════════════════════
 *
 * Para que la aplicación ABRA sin cobertura. El caso de uso está escrito por
 * todo el proyecto: el cliente registra sus series en un gimnasio, muchas veces
 * un sótano sin señal. La cola de guardado (`lib/saveQueue`) y su copia en el
 * navegador (`lib/pendingSaves`) ya aguantan el hueco entre «no hay red» y
 * «vuelve a haberla» — pero solo si la aplicación llega a pintarse. Sin esto,
 * abrir el icono de la pantalla de inicio sin señal era una pantalla en blanco:
 * el único eslabón del camino offline que faltaba.
 *
 * `main.jsx` registra `/sw.js` desde hace tiempo; este archivo es el worker que
 * ese registro esperaba encontrar.
 *
 * ══ Por qué se genera en el build y no vive en `public/` ════════════════════
 *
 * Porque la lista de archivos que hay que precachear lleva hash en el nombre
 * (`index-CiKQu.js`) y cambia en cada build. Un worker escrito a mano en
 * `public/` solo podría cachear lo que va viendo pasar, y entonces la primera
 * visita SIN red a una pantalla perezosa (`React.lazy`) fallaría: su trozo de
 * código nunca se habría pedido. El plugin de abajo mete la lista real del
 * build, completa, y con ella cualquier pantalla abre offline.
 *
 * ══ Las tres reglas del worker ══════════════════════════════════════════════
 *
 *   1. NAVEGACIÓN (pedir una URL): red primero, y si no hay, el `index.html`
 *      cacheado. La red primero porque el index es el que apunta a los bundles
 *      con hash: servir uno viejo teniendo red daría la pantalla en blanco que
 *      describe `public/_headers`.
 *   2. `/assets/` y `/fonts/`: caché primero. Los nombres llevan hash (o casi
 *      nunca cambian, las fuentes) y `_headers` ya los declara inmutables.
 *   3. TODO LO DEMÁS —Supabase, otros orígenes, POST— ni se toca. Esto no es un
 *      «modo sin conexión» con datos locales: los datos viven en el servidor y
 *      la única copia local que existe es la de lo pendiente de guardar.
 */

import { createHash } from 'node:crypto';

/** El código del worker. Es una plantilla: __VERSION__ y __PRECACHE__ se inyectan. */
const PLANTILLA = `/* Generado en el build por scripts/sw.mjs — no editar a mano. */
const CACHE = 'caveman-__VERSION__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase y demás: ni tocarlos.

  // Navegar: red primero; sin red, el shell cacheado. El respaldo es app.html
  // —el shell VACÍO— y no '/', que desde el prerender lleva la portada dentro:
  // abrir la aplicación sin señal no puede pintar marketing.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/app.html')));
    return;
  }

  // Estáticos con hash: caché primero, y lo que falte se aprende al vuelo.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copia));
            }
            return res;
          })
      )
    );
    return;
  }

  // El resto de lo propio (manifest, iconos): caché con la red de respaldo.
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});
`;

/**
 * Lo de `public/` que hace falta para arrancar y que el build no conoce: el
 * shell ('/'), el manifest y los iconos de instalación, y las fuentes. Las
 * capturas de la portada y `og.png` se quedan fuera a propósito: pesan, son de
 * la página pública y sin red nadie está descubriendo el producto.
 */
const DE_PUBLIC = [
  '/app.html', // el shell vacío que emite scripts/prerender.mjs; es el respaldo de navegación
  '/manifest.webmanifest',
  '/icon-180.png',
  '/icon-512.png',
  '/icon.svg',
  '/fonts/archivo-latin.woff2',
  '/fonts/archivo-latin-ext.woff2',
  '/fonts/archivo-italic-latin.woff2',
  '/fonts/archivo-italic-latin-ext.woff2',
];

/** Plugin de Vite: emite `dist/sw.js` con la lista real de archivos del build. */
export const serviceWorkerPlugin = () => ({
  name: 'caveman-sw',
  apply: 'build',
  generateBundle(_opciones, bundle) {
    const delBuild = Object.keys(bundle)
      .filter((f) => !f.endsWith('.map')) // los sourcemaps pesan más que la app entera
      .map((f) => `/${f}`);

    const precache = [...DE_PUBLIC, ...delBuild];

    /*
      La versión sale del CONTENIDO de la lista, no de la fecha: dos builds
      idénticos producen el mismo worker y el navegador no reinstala nada.
    */
    const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);

    this.emitFile({
      type: 'asset',
      fileName: 'sw.js',
      source: PLANTILLA.replace('__VERSION__', version).replace(
        '__PRECACHE__',
        JSON.stringify(precache, null, 2)
      ),
    });
  },
});
