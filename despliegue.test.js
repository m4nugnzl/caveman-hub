import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import worker from './worker.mjs';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Las dos piezas que deciden QUÉ se sirve: el comodín (`worker.mjs`) y las
 * cabeceras (`public/_headers`). No tienen pruebas en el navegador ni las va a
 * tener nadie —solo se ejecutan en el despliegue—, y cuando fallan lo hacen en
 * silencio: la página se pinta, no hay ningún error en consola, y lo que se ve
 * es una portada desnuda.
 *
 * ── El fallo que las motiva (23/08/2026) ────────────────────────────────────
 *
 * El comodín contestaba el shell a TODA ruta sin archivo, y ese «toda» incluía
 * `/assets/index-<hash>.css`. Una hoja que ya no estaba no daba 404: daba una
 * PÁGINA con un 200. El navegador la rechazaba por el tipo de contenido y la
 * portada salía con la hoja de estilos del navegador — el `<figure>` con su
 * sangrado de 40 px y las capturas a tamaño natural.
 *
 * Y no se quedaba ahí: el service worker veía un 200 y lo guardaba bajo la URL
 * del CSS. Su rama de `/assets/` es caché primero y no vuelve a mirar la red,
 * así que ese navegador —y solo ese, porque la caché es suya— servía HTML como
 * si fuera CSS en cada recarga. Roto en Safari, perfecto en Chrome, y sin forma
 * de verlo desde fuera.
 *
 * Lo que se fija abajo es la frontera: qué contesta 404 y qué contesta el shell.
 */

/** El almacén de archivos, de mentira: apunta lo que se le pide. */
const almacen = () => {
  const pedido = [];
  return {
    pedido,
    fetch: (url) => {
      pedido.push(new URL(url).pathname);
      return new Response('<!DOCTYPE html><div id="root"></div>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    },
  };
};

const pedir = async (ruta) => {
  const env = { ASSETS: almacen() };
  const res = await worker.fetch(new Request(`https://caveman.test${ruta}`), env);
  return { res, pedido: env.ASSETS.pedido };
};

/*
  Las rutas REALES de la aplicación (`src/App.jsx`). Ninguna existe como archivo,
  así que todas pasan por el comodín y todas tienen que acabar en el shell: si un
  día la lista de extensiones se abre de más, es aquí donde se ve.
*/
const RUTAS = [
  '/hoy',
  '/clientes',
  '/calendario',
  '/ingresos',
  '/ajustes',
  '/ajustes/protocolo',
  '/ajustes/integraciones',
  '/c/8f1c2b34-5a6d-4e7f-9012-3456789abcde/ficha',
  '/c/8f1c2b34-5a6d-4e7f-9012-3456789abcde/revision/fotos',
  '/mi/inicio',
  '/mi/rutina',
  '/mi/evolucion',
  '/r/aB3xY9kQ',
  '/invitacion/aB3xY9kQ',
  '/privacidad',
  '/condiciones',
  '/',
];

/*
  Archivos. Todos existen en un despliegue sano; la pregunta es qué pasa el día
  que uno NO está — a mitad de despliegue, o porque un documento viejo pide un
  hash que ya se fue. La respuesta correcta es 404, nunca una página.
*/
const ARCHIVOS = [
  '/assets/index-un8Z-46c.css',
  '/assets/index-lExrbSDs.js',
  '/assets/react-Byj44Z8-.js',
  '/assets/index-lExrbSDs.js.map',
  '/fonts/archivo-latin.woff2',
  '/fonts/archivo-italic-latin-ext.woff2',
  '/capturas/p-hoy.jpg',
  '/brands/notion.svg',
  '/og.png',
  '/icon-180.png',
  '/manifest.webmanifest',
  '/sw.js',
];

describe('el comodín', () => {
  it.each(RUTAS)('sirve el shell en %s', async (ruta) => {
    const { res, pedido } = await pedir(ruta);
    expect(res.status).toBe(200);
    /* `/app` y no `/app.html`: la forma canónica, que es la que no reintroduce
       la redirección en círculo del 21/08/2026. */
    expect(pedido).toEqual(['/app']);
  });

  it.each(ARCHIVOS)('contesta 404 —y no una página— en %s', async (ruta) => {
    const { res, pedido } = await pedir(ruta);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).not.toContain('text/html');
    /* Lo importante no es solo el código: es que el almacén ni se toca, así que
       no hay forma de que el cuerpo de la respuesta sea el shell. */
    expect(pedido).toEqual([]);
  });

  it('el 404 no se queda grabado en ninguna caché', async () => {
    /*
      Si esto pasa a mitad de un despliegue, el hueco tiene que durar lo que dura
      el despliegue. Con un 404 cacheable, un archivo que llega tarde se quedaría
      ausente para ese navegador mucho después de existir.
    */
    const { res } = await pedir('/assets/index-un8Z-46c.css');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('no distingue por `Sec-Fetch-Mode`, que Safari no siempre manda', async () => {
    /*
      La forma habitual de separar navegación de subrecurso es esa cabecera, y
      aquí no vale: los Safari anteriores al 16.4 no la mandan, y contestar 404 a
      una navegación sería mucho peor que el fallo que esto arregla. Sin ninguna
      cabecera de fetch, `/hoy` sigue siendo el shell.
    */
    const env = { ASSETS: almacen() };
    const res = await worker.fetch(new Request('https://caveman.test/hoy'), env);
    expect(res.status).toBe(200);
    expect(env.ASSETS.pedido).toEqual(['/app']);
  });
});

/** `public/_headers`, leído como lo lee Cloudflare: reglas y sus cabeceras. */
const CABECERAS = (() => {
  const texto = readFileSync(fileURLToPath(new URL('./public/_headers', import.meta.url)), 'utf8');
  const reglas = new Map();
  let actual = null;
  for (const linea of texto.split('\n')) {
    if (!linea.trim() || linea.trim().startsWith('#')) continue;
    if (!/^\s/.test(linea)) {
      actual = linea.trim();
      reglas.set(actual, reglas.get(actual) ?? []);
      continue;
    }
    const [nombre, ...resto] = linea.trim().split(':');
    if (actual) reglas.get(actual).push([nombre.toLowerCase(), resto.join(':').trim()]);
  }
  return reglas;
})();

describe('las cabeceras', () => {
  /*
    Los documentos son los que apuntan a los bundles con hash. Uno viejo pide
    archivos que ya no existen, y con el comodín arreglado eso es un 404: la
    página sale sin estilos igual. La única defensa es que no se cacheen.

    `/app` está en la lista porque es lo que el comodín pide al almacén para
    TODAS las rutas de la aplicación: las cabeceras casan con esa ruta, no con la
    que escribió el usuario. Y `/` porque la portada se pide así — la regla
    original decía `/index.html`, que es una ruta que no pide nadie.
  */
  it.each(['/', '/index.html', '/app', '/app.html', '/privacidad', '/condiciones'])(
    'declara `no-cache` en %s',
    (ruta) => {
      const declaradas = CABECERAS.get(ruta) ?? [];
      expect(declaradas).toContainEqual(['cache-control', 'no-cache']);
    }
  );

  it('ninguna regla ancha declara `Cache-Control`', () => {
    /*
      Cloudflare SUMA los valores de una misma cabecera cuando casan varias
      reglas —«los une con una coma»—, así que un `Cache-Control` en `/*` no
      sustituiría al de `/assets/*`: se le pegaría delante y dejaría los bundles
      en `no-cache, public, max-age=31536000, immutable`. Un año de caché
      convertido en ninguna, en todo el sitio, y sin nada que lo delate.
    */
    for (const ancha of ['/*', 'https://*/*']) {
      const nombres = (CABECERAS.get(ancha) ?? []).map(([nombre]) => nombre);
      expect(nombres).not.toContain('cache-control');
    }
  });

  it('los bundles con hash siguen siendo inmutables', () => {
    expect(CABECERAS.get('/assets/*')).toContainEqual([
      'cache-control',
      'public, max-age=31536000, immutable',
    ]);
  });
});
