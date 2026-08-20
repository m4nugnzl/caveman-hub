/**
 * Genera `public/og.png` — la miniatura que sale al pegar el enlace del sitio.
 *
 * ── Por qué esta imagen se saca aparte de `generar-iconos.mjs` ──────────────
 * Aquí la escribía ese script, a mano y sin dependencias, y por eso NO llevaba
 * texto: rasterizar tipografía con `zlib` y cuatro bucles no se puede. El
 * resultado era la marca centrada sobre hierro, que en la tarjeta de un
 * navegador o de WhatsApp se ve como un icono suelto en un rectángulo negro —
 * y una miniatura que no dice nada es una miniatura en la que no se pincha.
 *
 * Ese script se queda como está para los iconos, que sí son cuatro rectángulos.
 * Esta imagen es otra cosa: es un CARTEL —titular, remate en cursiva, y las dos
 * pantallas del producto—, y para eso hace falta un motor de texto de verdad.
 *
 * ── Y por qué un navegador y no una librería de imagen ─────────────────────
 * Porque ya hay uno instalado en cualquier máquina donde se desarrolle esto, y
 * porque así el cartel se compone con las MISMAS herramientas que la portada:
 * la Archivo autoalojada de `public/fonts`, las tintas de `styles/tokens.css` y
 * los recortes de `public/capturas`. Una librería de imagen sería una
 * dependencia de build entera —y su propio dialecto de tipografía— para escribir
 * ocho palabras.
 *
 * No se levanta un Chrome de npm: se usa el que hay (Chrome o Edge). Si no
 * aparece, se pasa la ruta en `CHROME_PATH`.
 *
 * ── Lo que dice, y por qué eso ─────────────────────────────────────────────
 * Lo mismo que el héroe de la portada, palabra por palabra: el rótulo con la
 * categoría —que es lo que se busca— y el titular con la postura. Si la portada
 * cambia de titular, este archivo tiene que cambiar con ella; son la misma
 * promesa vista en dos tamaños.
 *
 * Uso:  node scripts/generar-og.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const W = 1200;
const H = 630;

/** Un archivo del proyecto, como URL que el navegador pueda abrir. */
const url = (...partes) => pathToFileURL(join(PUBLIC, ...partes)).href;

/* ── El navegador ───────────────────────────────────────────────────────────
   El que haya. Se prueba Chrome antes que Edge sin más motivo que el orden de
   probabilidad; los dos son el mismo motor y dan el mismo píxel. */
const CANDIDATOS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const navegador = CANDIDATOS.find((ruta) => existsSync(ruta));

if (!navegador) {
  console.error(
    'No se ha encontrado Chrome ni Edge.\n' +
      'Pasa la ruta del ejecutable en CHROME_PATH y vuelve a ejecutar:\n' +
      '  CHROME_PATH="/ruta/al/chrome" node scripts/generar-og.mjs'
  );
  process.exit(1);
}

/* ══ EL CARTEL ═══════════════════════════════════════════════════════════════

   La misma escena del héroe, reencuadrada para un rectángulo de 1200×630 que se
   va a ver a 170 px de ancho en la tarjeta de un navegador. De ahí las tres
   reglas de esta composición, que no son las de la portada:

     · **El titular manda y es enorme.** A tamaño de miniatura solo sobreviven
       el titular y la silueta de las pantallas; todo lo demás es textura.
     · **Las capturas van a su tamaño natural y RECORTADAS por el marco**, no
       encogidas para que quepan enteras. Una captura de 2450 px metida en 500
       es ruido gris; medio panel legible se lee como producto.
     · **Nada toca los cantos por arriba ni por abajo.** Algunas tarjetas
       recortan el alto (Safari recorta a 16:10 largo), así que los 40 px de
       arriba y de abajo son zona de sacrificio: ahí no vive nada que haga falta.

   Las tintas son las de `.lp-noche` en `styles/tokens.css`. Están escritas y no
   importadas a propósito: aquí no hay cascada donde meter el archivo de tokens,
   y son cinco. Si cambia la noche, cambian estas cinco. */
const HIERRO = '#090b0d';
const TIZA = '#e8ecf1';
const APAGADO = '#a3acb8';
const BRASA = '#e2564a';

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  /* La Archivo del producto, autoalojada. La cursiva es la de verdad: el remate
     del titular va en ella y a 58 px el sesgo sintético se ve. */
  @font-face {
    font-family: 'Archivo';
    font-style: normal;
    font-weight: 400 800;
    src: url('${url('fonts', 'archivo-latin.woff2')}') format('woff2');
  }
  @font-face {
    font-family: 'Archivo';
    font-style: italic;
    font-weight: 400 800;
    src: url('${url('fonts', 'archivo-italic-latin.woff2')}') format('woff2');
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body {
    position: relative;
    background: ${HIERRO};
    color: ${TIZA};
    font-family: 'Archivo', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* LA LUMBRE. La misma pieza que .lp-fulgor: no se pinta la letra, se
     calienta el hueco donde están las pantallas. */
  .luz {
    position: absolute; inset: 0;
    background:
      radial-gradient(46% 58% at 78% 42%, rgba(226, 86, 74, 0.22) 0%, transparent 66%),
      radial-gradient(40% 50% at 96% 72%, rgba(111, 165, 238, 0.07) 0%, transparent 68%);
  }

  /* ── La columna de texto ────────────────────────────────────────────────── */
  .dicho {
    position: absolute; left: 70px; top: 78px; width: 622px;
    display: flex; flex-direction: column; align-items: flex-start;
  }

  .marca { display: flex; align-items: center; gap: 13px; }
  .marca > b {
    font-size: 25px; font-weight: 800; letter-spacing: -0.02em;
  }

  /* El rótulo, con su muesca de cinta métrica delante — igual que .lp-eyebrow. */
  .rotulo {
    display: inline-flex; align-items: center; gap: 11px;
    margin-top: 46px;
    font-size: 14px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.15em;
    color: ${APAGADO};
  }
  .rotulo::before {
    content: '';
    width: 28px; height: 10px;
    background: repeating-linear-gradient(90deg, rgba(232,236,241,0.5) 0 1px, transparent 1px 6px);
    -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 55%);
  }

  h1 {
    margin-top: 18px;
    font-size: 66px; font-weight: 800; line-height: 0.96; letter-spacing: -0.042em;
  }
  /* EL REMATE: cursiva y la lumbre detrás, no tinta encima. A este tamaño el
     color plano no acentúa una letra, la aplana (ver .lp-h1 em en index.css). */
  h1 em {
    position: relative; display: inline-block;
    font-style: italic; font-weight: 800;
  }
  h1 em::before {
    content: '';
    position: absolute; z-index: -1; inset: -34% -9%;
    background: radial-gradient(50% 50% at 50% 50%, rgba(226, 86, 74, 0.42) 0%, transparent 72%);
    filter: blur(16px);
  }

  .frase {
    margin-top: 22px; max-width: 520px;
    /* Dos líneas parejas. Sin esto la segunda se queda en «sitio.» a solas, que
       debajo de un titular de tres líneas se lee como una errata. */
    text-wrap: balance;
    font-size: 19px; line-height: 1.45; color: ${APAGADO};
  }

  /* La chapa del gratis. Tiza plena sobre hierro: el máximo contraste que da la
     pantalla, y lo único que tiene que sobrevivir al tamaño de miniatura junto
     al titular. */
  .chapa {
    margin-top: 30px;
    display: inline-flex; align-items: center; gap: 9px;
    padding: 11px 20px; border-radius: 999px;
    background: ${TIZA}; color: #14181c;
    font-size: 15px; font-weight: 700; letter-spacing: -0.005em;
  }
  .chapa > i {
    width: 7px; height: 7px; border-radius: 50%; background: ${BRASA};
  }

  /* ── LA ESCENA: tu pantalla y la suya ────────────────────────────────────
     La ventana se sale por el canto derecho y el teléfono por el de abajo: es
     el corte del héroe —el que dice que hay más producto del que cabe— traído
     a un rectángulo que mide la mitad.

     El teléfono se apoya en la esquina de ABAJO A LA DERECHA de la ventana, y
     no en la de la izquierda como en la portada. Aquí la ventana solo enseña su
     mitad izquierda, que es justo donde está la columna de nombres: con el
     aparato en ese lado, las filas se quedaban en «83,3 kg» sin nadie que las
     hubiera levantado.

     Las dos capturas se pintan a su tamaño CSS natural y el marco las recorta:
     son recortes, no reducciones (ver .lp-shot-vista en index.css). */
  .ventana {
    position: absolute; top: 72px; left: 704px;
    width: 580px; height: 428px;
    border-radius: 10px; overflow: hidden;
    background: #0e1115;
    box-shadow:
      0 0 0 1px rgba(232, 236, 241, 0.1),
      0 30px 60px -18px rgba(0, 0, 0, 0.8);
  }
  .barra {
    position: relative;
    display: flex; align-items: center; gap: 6px;
    height: 30px; padding-inline: 13px;
    background: linear-gradient(180deg, #14181e 0%, #0f1318 100%);
    border-bottom: 1px solid rgba(232, 236, 241, 0.06);
  }
  .barra > i { width: 7px; height: 7px; border-radius: 50%; background: rgba(232,236,241,0.15); }
  .barra > span {
    position: absolute; left: 50%; translate: -50% 0;
    padding: 3px 16px; border-radius: 999px;
    background: rgba(232, 236, 241, 0.05);
    box-shadow: inset 0 0 0 1px rgba(232, 236, 241, 0.06);
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.12em; color: #7b8592;
  }
  /* El recorte: la captura entera, anclada por su esquina de arriba a la
     izquierda, y el marco decide cuánta se ve. */
  .ventana img {
    display: block;
    width: 1225px;  /* 2450 px de archivo a densidad doble = su tamaño CSS */
    /* Un pelo de desplazamiento y ni uno más: los rótulos de las filas —«HOY»,
       «AYER»— empiezan a 16 px del canto de la captura, y con más de esto el
       marco se les come la primera letra. */
    margin: -6px 0 0 -2px;
  }
  /* El cristal: una diagonal de luz del 5 %. Es lo que separa una pantalla
     ENCENDIDA de una imagen pegada dentro de un marco. */
  .ventana::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(104deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.018) 26%, rgba(255,255,255,0) 48%);
  }

  /* EL APARATO. El de la portada (.lp-iphone) se dibuja entero —isla, barra de
     estado, botones del canto— y todo sale de UNA medida: el ancho. Aquí se
     conservan sus proporciones y se dejan los botones fuera: a este tamaño son
     dos marcas de dos píxeles que solo añaden peso al archivo.

     La captura del móvil viene a 430 px, o sea a densidad sencilla, así que se
     pinta a la mitad de ese ancho y no más: por encima de eso la letra se
     agranda sin ganar un solo detalle. */
  .movil {
    --tel: 232px;
    position: absolute; top: 232px; left: 940px;
    width: var(--tel);
    padding: calc(var(--tel) * 0.026);
    border-radius: calc(var(--tel) * 0.155);
    background: #1b2027;
    box-shadow:
      0 0 0 1px rgba(232, 236, 241, 0.12),
      0 26px 52px -14px rgba(0, 0, 0, 0.85);
  }
  .movil > span {
    display: block; overflow: hidden;
    border-radius: calc(var(--tel) * 0.129);
    background: #0e1115;
  }
  /* La barra de estado, con la isla. Es lo que hace que la captura se lea como
     una PANTALLA y no como una imagen pegada dentro de una pastilla. */
  .movil u {
    display: flex; align-items: center; justify-content: center;
    height: calc(var(--tel) * 0.135);
  }
  .movil u::before {
    content: '';
    width: calc(var(--tel) * 0.3); height: calc(var(--tel) * 0.085);
    border-radius: 999px; background: #05070a;
  }
  .movil img { display: block; width: calc(var(--tel) - var(--tel) * 0.052); }
  /* La barbilla: el hueco de la rayita de inicio. Sin ella el aparato acaba en
     seco justo debajo de la barra de pestañas de la captura. */
  .movil i { display: block; height: calc(var(--tel) * 0.06); }

  /* LA REGLA, en el canto de abajo: la cinta métrica que es la firma del
     producto y lo que ata esta imagen a la cabecera de la aplicación. */
  .regla {
    position: absolute; left: 74px; right: 0; bottom: 62px; height: 22px;
    background:
      repeating-linear-gradient(90deg, rgba(232,236,241,0.34) 0 1px, transparent 1px 90px) bottom / 100% 22px no-repeat,
      repeating-linear-gradient(90deg, rgba(232,236,241,0.16) 0 1px, transparent 1px 18px) bottom / 100% 12px no-repeat;
    -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 46%, transparent 84%);
  }
</style>
</head>
<body>
  <span class="luz"></span>

  <div class="dicho">
    <div class="marca">
      <!-- El mark: tres barras ascendentes y el disco de 25 en la más alta. La
           misma geometría que generar-iconos.mjs y el favicon de index.html. -->
      <svg width="42" height="42" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="8" fill="#14181c"/>
        <g fill="${TIZA}">
          <rect x="7" y="18" width="5" height="11" rx="1.5"/>
          <rect x="14.5" y="12" width="5" height="17" rx="1.5"/>
          <rect x="22" y="5" width="5" height="24" rx="1.5"/>
        </g>
        <rect x="22" y="5" width="5" height="3.5" rx="1.5" fill="${BRASA}"/>
      </svg>
      <b>Caveman Hub</b>
    </div>

    <span class="rotulo">Software para entrenadores online</span>

    <h1>La primera app para<br><em>entrenadores de&nbsp;verdad</em></h1>

    <p class="frase">Rutinas, dietas, check-ins, progreso y cobros en un solo sitio.</p>

    <span class="chapa"><i></i>Tres clientes gratis, sin tarjeta</span>
  </div>

  <div class="ventana">
    <div class="barra"><i></i><i></i><i></i><span>Hoy</span></div>
    <img src="${url('capturas', 'p-hoy.jpg')}" alt="">
  </div>

  <div class="movil">
    <span>
      <u></u>
      <img src="${url('capturas', 'm-rutina.jpg')}" alt="">
      <i></i>
    </span>
  </div>

  <span class="regla"></span>
</body>
</html>
`;

// ── El disparo ─────────────────────────────────────────────────────────────

const taller = mkdtempSync(join(tmpdir(), 'cavemanog-'));
const fuente = join(taller, 'og.html');
const destino = join(PUBLIC, 'og.png');

writeFileSync(fuente, html, 'utf8');

try {
  execFileSync(
    navegador,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      /* Perfil propio y desechable: si no, el Chrome que el desarrollador tiene
         abierto tiene el suyo bloqueado y esto no arranca. */
      `--user-data-dir=${join(taller, 'perfil')}`,
      `--window-size=${W},${H}`,
      '--force-device-scale-factor=1',
      /* Tiempo virtual para que lleguen las dos fuentes y las dos capturas antes
         del disparo. Es virtual: no son dos segundos de reloj. */
      '--virtual-time-budget=4000',
      `--screenshot=${destino}`,
      pathToFileURL(fuente).href,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
} catch (error) {
  console.error(`No se ha podido componer la imagen con ${navegador}:`);
  console.error(error.stderr?.toString() || error.message);
  process.exit(1);
} finally {
  rmSync(taller, { recursive: true, force: true });
}

if (!existsSync(destino)) {
  console.error('El navegador no ha escrito la imagen. Revisa la ruta de CHROME_PATH.');
  process.exit(1);
}

const cabecera = readFileSync(destino).subarray(16, 24);
const ancho = cabecera.readUInt32BE(0);
const alto = cabecera.readUInt32BE(4);
const kb = Math.round(statSync(destino).size / 1024);

console.log(`OK   og.png (${ancho}×${alto}, ${kb} kB)`);

/* El aviso del peso, y no es una manía: WhatsApp es EL canal de este producto y
   deja de pintar la tarjeta cuando la imagen se pasa. Si esto salta, lo que
   sobra suele ser captura —recorta más ventana, no bajes el titular—. */
if (kb > 600) {
  console.warn(
    `AVISO  ${kb} kB es mucho para una tarjeta de WhatsApp (se recomienda por debajo de 300 kB).`
  );
}
