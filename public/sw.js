/*
  El service worker: que la aplicación SIEMPRE abra.

  ══ Para qué existe ═══════════════════════════════════════════════════════════
  La app se usa en el gimnasio, donde la cobertura va y viene. Sin esto, abrirla
  sin red enseñaba la página de error del navegador — la peor pantalla posible
  para alguien que solo quiere apuntar una serie. Con esto, el CASCARÓN de la
  aplicación (el HTML, el JS, el CSS, las fuentes) se sirve de la caché y la app
  arranca; los datos siguen pidiéndose a Supabase, que es quien manda sobre su
  frescura.

  ══ Por qué la estrategia es tan corta ════════════════════════════════════════
  Vite pone un hash en el nombre de cada asset (`index-CrMWJOuv.js`): un asset
  nuevo es una URL nueva, así que la caché nunca puede quedarse con una versión
  vieja bajo el mismo nombre. Eso permite CACHÉ PRIMERO para los estáticos sin
  riesgo de servir código rancio.

  El HTML es lo contrario —siempre la misma URL con contenido que cambia— así
  que va RED PRIMERO: online se sirve el fresco (y se guarda de paso), y sin
  red se cae al último guardado.

  Lo que no es nuestro (Supabase, transformaciones de imagen) no se toca: los
  datos del entrenamiento no pueden venir de una caché que no sabe cuándo
  mienten.

  ── Versionado ────────────────────────────────────────────────────────────────
  Subir VERSION invalida todas las cachés anteriores en el `activate`. No hace
  falta subirla con cada deploy (los hashes ya renuevan los assets); solo si
  cambia la ESTRATEGIA de este archivo.
*/

const VERSION = 'caveman-v1';

/*
  ══ El instante ciego de la primera visita ════════════════════════════════════
  Un worker no controla la página que lo registró: sus peticiones (el JS, el
  CSS, las fuentes) NO pasan por el `fetch` de abajo, así que cachear solo `/`
  dejaba un cascarón sin músculos — sin red, la app servía su HTML y ni un
  asset. Se comprobó cortando la red con Playwright: raíz presente, pantalla en
  blanco.

  Por eso el `install` lee el propio HTML y precachea lo que referencia: Vite
  enlaza el JS de entrada, sus trozos (`modulepreload`), el CSS y las fuentes
  en el documento, así que la lista sale de ahí y no hay nada que mantener a
  mano. Los trozos de carga diferida (las rutas lazy) no están en el HTML: se
  cachean al usarse, en las visitas ya controladas.
*/
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      const respuesta = await fetch('/');
      const copia = respuesta.clone();
      const html = await respuesta.text();
      await cache.put('/', copia);

      const assets = [
        ...new Set(
          [...html.matchAll(/(?:src|href)="(\/(?:assets|fonts)\/[^"]+)"/g)].map((m) => m[1])
        ),
      ];
      /* Lo que el HTML no referencia pero la app pide en cuanto pinta: las
         variantes de fuente que el CSS trae bajo demanda, el icono del acceso
         con Google y los iconos del manifest. Son estáticos sin hash y
         estables; si alguno faltara, mejor instalarse sin él que no
         instalarse (por eso van uno a uno y no en el `addAll`). */
      const extras = [
        '/fonts/archivo-italic-latin.woff2',
        '/fonts/archivo-latin-ext.woff2',
        '/fonts/archivo-italic-latin-ext.woff2',
        '/brands/google.svg',
        '/icon.svg',
        '/icon-180.png',
        '/manifest.webmanifest',
      ];
      await cache.addAll(assets);
      await Promise.allSettled(extras.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  /* Solo lo nuestro. Supabase y cualquier otro origen van a la red directa. */
  if (url.origin !== self.location.origin) return;

  /* Navegaciones (el HTML): red primero, cascarón guardado como respaldo. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copia = response.clone();
          caches.open(VERSION).then((cache) => cache.put('/', copia));
          return response;
        })
        .catch(() => caches.match('/', { ignoreVary: true }))
    );
    return;
  }

  /* Estáticos: caché primero (el hash del nombre hace imposible lo rancio).

     `ignoreVary` es imprescindible, y se descubrió cortando la red: el
     servidor marca los assets con `Vary`, el emparejamiento del Cache API lo
     respeta, y la MISMA URL pedida con otras cabeceras (el `crossorigin` de la
     fuente, el CORS de los módulos) no encontraba lo precacheado — la caché
     estaba llena y aun así todo fallaba. Aquí la URL con hash identifica el
     contenido por sí sola, así que las cabeceras no aportan nada. */
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (guardada) =>
        guardada ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copia = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copia));
          }
          return response;
        })
    )
  );
});
