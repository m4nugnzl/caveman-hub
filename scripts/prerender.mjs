/**
 * Prerender de las páginas públicas. Corre DESPUÉS de `vite build`.
 *
 * ══ El problema que cierra ══════════════════════════════════════════════════
 *
 * La portada dice «software para entrenadores online» en el `<title>` y en el
 * JSON-LD, pero el CONTENIDO —el titular, los precios, las cinco dudas— solo
 * existía después de ejecutar JavaScript: el HTML servido era `<div id="root">`
 * vacío. Google lo renderiza; el resto de rastreadores, las vistas previas y
 * cualquier lector sin JavaScript veían una página en blanco. Para un producto
 * cuyo canal orgánico es esa búsqueda, es tráfico regalado.
 *
 * ══ Cómo lo hace, y el reparto de archivos ══════════════════════════════════
 *
 *   dist/index.html      la portada, CON su contenido dentro del root.
 *   dist/privacidad.html las dos legales, igual (Stripe las pide públicas y
 *   dist/condiciones.html  conviene que se lean sin ejecutar nada).
 *   dist/app.html        el shell VACÍO de siempre, y el destino del comodín
 *                        (`worker.mjs`; en Pages/Netlify sería `_redirects`):
 *                        las rutas de la aplicación (`/hoy`, `/mi/rutina`…)
 *                        siguen arrancando sobre un root vacío. Sin esta
 *                        separación, cada apertura de la aplicación pintaría
 *                        la portada un instante antes de montar React — un
 *                        destello de marketing en una herramienta que se abre
 *                        veinte veces al día.
 *
 * React monta encima con `createRoot().render()`, que sustituye el contenido
 * del root: en la portada el resultado es visualmente idéntico, así que la
 * sustitución no se ve.
 *
 * ══ Por qué `ssrLoadModule` y no un import normal ═══════════════════════════
 *
 * Los componentes son JSX con alias `@/` e `import.meta.env`: Node no los puede
 * cargar solo. El servidor de Vite en modo middleware los transforma con la
 * MISMA configuración del build, sin depender de ningún paquete nuevo.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const DIST = new URL('../dist/', import.meta.url);
const leer = (archivo) => readFileSync(new URL(archivo, DIST), 'utf8');
const escribir = (archivo, texto) => writeFileSync(new URL(archivo, DIST), texto);

const HUECO = '<div id="root"></div>';

/* El shell es el index RECIÉN salido del build. Si este script se ejecuta dos
   veces seguidas —sin build en medio—, el index ya lleva la portada dentro y el
   shell limpio es la copia que se guardó en `app.html` la primera vez. */
let shell = leer('index.html');
if (!shell.includes(HUECO)) {
  try {
    shell = leer('app.html');
  } catch {
    /* sin app.html no hay shell limpio del que tirar */
  }
}
if (!shell.includes(HUECO)) {
  console.error('prerender: ni index.html ni app.html traen `<div id="root"></div>` vacío.');
  process.exit(1);
}

/* El shell vacío se guarda ANTES de tocar el index: es lo que sirve el comodín
   (`worker.mjs`) para todas las rutas de la aplicación. */
escribir('app.html', shell);

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  /*
    El router tiene que ser UNA sola copia: el `StaticRouter` que envuelve y los
    `Link`/`useParams` de dentro de los componentes comparten contexto por
    identidad de módulo. Y tiene que ser la copia ESM: la condición `node` del
    paquete apunta al CJS, que el transformador SSR de Vite no puede evaluar
    («module is not defined»). El alias fija el `.mjs` y `noExternal` hace que
    todo el mundo —este script y los componentes— pase por él. React se queda
    externo: todos acaban en el de Node y el contexto es uno.
  */
  resolve: {
    alias: {
      'react-router-dom': fileURLToPath(
        new URL('../node_modules/react-router-dom/dist/index.mjs', import.meta.url)
      ),
      /* El subcamino va ANTES que el paquete: el alias también reescribe por
         prefijo, y sin esta entrada `react-router/dom` acabaría en
         `index.mjs/dom`, que no existe. */
      'react-router/dom': fileURLToPath(
        new URL('../node_modules/react-router/dist/development/dom-export.mjs', import.meta.url)
      ),
      'react-router': fileURLToPath(
        new URL('../node_modules/react-router/dist/development/index.mjs', import.meta.url)
      ),
    },
  },
  ssr: { noExternal: ['react-router', 'react-router-dom'] },
});

try {
  const { LandingPage } = await vite.ssrLoadModule('/src/components/marketing/LandingPage.jsx');
  const { LegalPage } = await vite.ssrLoadModule('/src/components/legal/LegalPage.jsx');
  const { StaticRouter } = await vite.ssrLoadModule('react-router');
  const { Routes, Route } = await vite.ssrLoadModule('react-router-dom');

  const h = React.createElement;

  /*
    React avisa de que `useLayoutEffect` no corre en el servidor (el `useNoche`
    de la portada). Es exactamente lo que queremos —la clase de noche la pone el
    cliente al montar— así que ese aviso concreto se silencia para que el build
    no enseñe una advertencia en cada despliegue. Cualquier otro error sigue
    saliendo.
  */
  const errorReal = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server'))
      return;
    errorReal(...args);
  };

  /* La misma forma de ruta que `App.jsx`, para que `useParams` encuentre
     `documento`. Los efectos no corren en este render, y no hace falta que
     corran: lo que fetchean (los precios) ya está también en el JSON-LD. */
  const pinta = (location, elemento) =>
    renderToStaticMarkup(h(StaticRouter, { location }, elemento));

  const paginas = [
    ['index.html', pinta('/', h(LandingPage))],
    ...['privacidad', 'condiciones'].map((doc) => [
      `${doc}.html`,
      pinta(`/${doc}`, h(Routes, null, h(Route, { path: '/:documento', element: h(LegalPage) }))),
    ]),
  ];

  for (const [archivo, marcado] of paginas) {
    if (!marcado || marcado.length < 500) {
      console.error(`prerender: ${archivo} salió casi vacío (${marcado.length} bytes); revisa el render.`);
      process.exit(1);
    }
    escribir(archivo, shell.replace(HUECO, `<div id="root">${marcado}</div>`));
    console.log(`  prerender · ${archivo} (${(marcado.length / 1024).toFixed(0)} KB de contenido)`);
  }
} finally {
  await vite.close();
}
