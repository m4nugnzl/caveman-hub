/**
 * Verificación del sistema visual.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * El proyecto no usa CSS-in-JS ni módulos: las clases son cadenas de texto en el
 * JSX y los colores son tokens `var(--x)`. Eso mantiene el CSS pequeño y legible,
 * pero significa que **una clase mal escrita no falla en ningún sitio**: el
 * elemento simplemente sale sin estilo. Una vez se renombró un bloque de clases
 * sin actualizar a sus 38 consumidores y la aplicación entera se descolocó sin
 * que ni el linter ni el build dijeran nada.
 *
 * Este script cierra ese hueco. Comprueba cuatro cosas:
 *   1. Toda clase usada en `className` existe en el CSS.
 *   2. Todo `var(--x)` usado existe como token — en el JSX **y en el CSS**.
 *   3. La paleta de datos no se usa como cromo.
 *   4. No hay literales de color en el JSX (salvo las excepciones declaradas:
 *      el logo de marca y las paletas de dibujo sobre canvas, que no pueden usar
 *      variables CSS).
 *
 * ── Por qué la 2 mira también el CSS ────────────────────────────────────────
 * Porque solo miraba el JSX, y por ahí se coló un `border: 1px solid var(--border)`
 * —token que no existe; se llama `--edge`— en dos reglas nuevas. Un `var()` sin
 * fallback que apunta a nada no es un color por defecto: invalida la declaración
 * ENTERA, así que los dos bordes simplemente no se pintaban. Y nada lo dijo.
 *
 * ── Por qué la 3 ────────────────────────────────────────────────────────────
 * Es la regla que ordena el producto: EL CROMO NO TIENE COLOR, el color es del
 * dato (ver `styles/tokens.css`). Estaba escrita en un comentario y por tanto se
 * degradaba sola: había diecisiete sitios pintando iconos de sección y enlaces
 * con tintas de la paleta de series. Ninguno era un error de token —`--data-blue`
 * existe— y por eso este script no los veía: lo que estaba mal era DÓNDE.
 *
 * Una regla que solo vive en un comentario dura lo que dure quien la escribió.
 *
 * Uso:  npm run verify
 * Salida: código 1 si hay clases, tokens o usos de la paleta de datos indebidos.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/**
 * Ficheros que dibujan sobre `<canvas>` o definen la marca. Ahí un color
 * literal es correcto: `ctx.fillStyle` no entiende `var(--x)`, y el logo tiene
 * que ser igual en tema claro y oscuro.
 */
const COLOR_EXCEPTIONS = [
  'components/ui/Logo.jsx',
  // Logotipos de terceros: el negro de Notion y el violeta de Stripe son SU marca.
  // Pasarlos por los tokens del tema dejaría de ser su logotipo.
  'components/ui/BrandMark.jsx',
  'components/ui/charts.jsx',
  'components/Coach/PhotoStudio/renderComposition.js',
  'components/Coach/PhotoStudio/StudioToolbar.jsx',
  'components/Coach/PhotoStudio/usePhotoStudio.js',
  // Compone la grabación sobre un canvas: `ctx.fillStyle` no entiende `var(--x)`,
  // y además el vídeo tiene que verse igual en tema claro y oscuro.
  'lib/useReviewRecorder.js',
  'domain/training.js',
  'domain/nutrition.js',
];

/**
 * Dónde SÍ puede aparecer la paleta de datos (`--data-*`).
 *
 * El criterio para entrar en esta lista es uno solo: **que el color signifique
 * algo**. Una serie de un gráfico, un grupo muscular, un macro, el delta de una
 * cifra. Si el color solo está para que la pieza se vea más bonita, es cromo, y
 * el cromo va en tinta —`--accent`, `--text`, `--text-tertiary`— o en la
 * semántica de estado, que para eso existe.
 *
 * `domain/` entra entero: ahí es donde se declaran los mapas de color de las
 * series (grupos musculares, macros, tipos de actividad), que es la definición
 * misma de «el color es del dato».
 *
 * ── Por qué esta lista tenía trece entradas y ahora tiene tres ──────────────
 * Porque la regla estaba a medio cumplir: el color era del dato, sí, pero **lo
 * elegía cada pantalla**, y por eso la misma métrica salía de colores distintos
 * según dónde se mirara — la adherencia era verde en el resumen, teal en la
 * lista de al lado y lima en la analítica—. Cada pantalla que pintaba una cifra
 * necesitaba entrar aquí, y la lista crecía con el producto.
 *
 * Ahora el color de una métrica sale de `domain/metrics.js` y el de un músculo
 * de `muscleColor`, así que una pantalla ya no tiene por qué nombrar un color:
 * lo pide por el identificador de lo que está enseñando. Lo que queda son los
 * tres sitios donde el color NO es de una métrica —las primitivas de gráfico,
 * los logotipos ajenos y la marca del cliente activo—.
 *
 * Si esta lista vuelve a crecer, la pregunta correcta no es «¿le añado este
 * archivo?» sino «¿por qué esta pantalla está eligiendo un color?».
 */
const DATA_COLOR_ALLOWED = [
  // Las primitivas de gráfico: rejilla, ejes y respaldos de serie.
  'components/ui/charts.jsx',
  // Logotipos de terceros: su color es su marca, no nuestra paleta.
  'components/ui/BrandMark.jsx',
  // La marca del cliente activo. Es identidad, no decoración de una sección.
  'components/Coach/ClientSwitcher.jsx',
];

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const files = walk(SRC);
const code = files.filter((f) => f.endsWith('.jsx') || f.endsWith('.js'));
const styles = files.filter((f) => f.endsWith('.css'));
const cssText = styles.map((f) => readFileSync(f, 'utf8')).join('\n');

const definedClasses = new Set([...cssText.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const definedTokens = new Set([...cssText.matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]));

const badClasses = [];
const badTokens = [];
const colorLiterals = [];
const dataAsChrome = [];

/*
  Los tokens que usa el propio CSS. Un `var(--noExiste)` sin fallback invalida la
  declaración entera, así que el borde, el color o el fondo no se pintan — y
  mirando el archivo no se ve nada raro.
*/
for (const file of styles) {
  const rel = relative(SRC, file).replace(/\\/g, '/');
  for (const match of readFileSync(file, 'utf8').matchAll(/var\(--([\w-]+)\)/g)) {
    if (!definedTokens.has(match[1])) badTokens.push(`${rel} → --${match[1]}`);
  }
}

for (const file of code) {
  const rel = relative(SRC, file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');

  // `className="a b"` y className={`a ${x}`} — las interpolaciones se sustituyen
  // por un espacio, porque su valor no se puede conocer sin ejecutar el código.
  for (const match of text.matchAll(/className\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const raw = (match[1] || match[2] || '').replace(/\$\{[^}]*\}/g, ' ');
    for (const cls of raw.split(/\s+/).filter(Boolean)) {
      // Los fragmentos que quedan de una interpolación (`is-`, `delta-`) no son
      // clases reales: acaban en guion porque el sufijo era dinámico.
      if (cls.endsWith('-')) continue;
      if (!definedClasses.has(cls)) badClasses.push(`${rel} → .${cls}`);
    }
  }

  for (const match of text.matchAll(/var\(--([\w-]+)\)/g)) {
    if (!definedTokens.has(match[1])) badTokens.push(`${rel} → --${match[1]}`);
  }

  /* La paleta de series, usada como cromo. Ver `DATA_COLOR_ALLOWED`. */
  if (!rel.startsWith('domain/') && !DATA_COLOR_ALLOWED.includes(rel)) {
    for (const match of text.matchAll(/var\(--data-[\w-]+\)/g)) {
      dataAsChrome.push(`${rel} → ${match[0]}`);
    }
  }

  if (!COLOR_EXCEPTIONS.includes(rel)) {
    for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
      colorLiterals.push(`${rel} → ${match[0]}`);
    }
  }
}

const report = (label, list, fatal) => {
  const unique = [...new Set(list)];
  console.log(`${unique.length === 0 ? 'OK  ' : fatal ? 'FALLO' : 'AVISO'} ${label}: ${unique.length}`);
  unique.slice(0, 30).forEach((line) => console.log(`        ${line}`));
  if (unique.length > 30) console.log(`        … y ${unique.length - 30} más`);
  return unique.length;
};

const classErrors = report('clases sin definir', badClasses, true);
const tokenErrors = report('tokens sin definir', badTokens, true);
const chromeErrors = report('paleta de datos usada como cromo', dataAsChrome, true);
report('literales de color fuera de las excepciones', colorLiterals, false);

process.exit(classErrors + tokenErrors + chromeErrors > 0 ? 1 : 0);
