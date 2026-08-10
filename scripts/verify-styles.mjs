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
 * Este script cierra ese hueco. Comprueba tres cosas:
 *   1. Toda clase usada en `className` existe en el CSS.
 *   2. Todo `var(--x)` usado existe como token.
 *   3. No hay literales de color en el JSX (salvo las excepciones declaradas:
 *      el logo de marca y las paletas de dibujo sobre canvas, que no pueden usar
 *      variables CSS).
 *
 * Uso:  npm run verify
 * Salida: código 1 si hay clases o tokens sin definir.
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
  'components/ui/charts.jsx',
  'components/Coach/PhotoStudio/renderComposition.js',
  'components/Coach/PhotoStudio/StudioToolbar.jsx',
  'components/Coach/PhotoStudio/usePhotoStudio.js',
  'domain/training.js',
  'domain/analytics.js',
  'domain/nutrition.js',
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
report('literales de color fuera de las excepciones', colorLiterals, false);

process.exit(classErrors + tokenErrors > 0 ? 1 : 0);
