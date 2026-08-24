/**
 * Qué ofrece la aplicación, congelado en un JSON para quien no tiene el código
 * delante.
 *
 * ══ Por qué hace falta ══════════════════════════════════════════════════════
 *
 * `catalogoDe` saca del código fuente las dos listas que contestan las preguntas
 * negativas del informe: «estas pantallas no las ha abierto nadie» y «este
 * pliegue no lo ha medido nadie nunca». Para eso lee `src/routes.jsx` y
 * `src/domain/anthropometry.js` como texto.
 *
 * El script de la terminal los tiene ahí al lado. **La función edge no**: corre
 * en Deno, en un servidor, con solo lo que su despliegue empaquetó. Sin este
 * archivo, esas dos listas saldrían vacías desde el panel — y una lista vacía se
 * lee como «no falta nada», que es la manera silenciosa de mentir que toda la
 * cabecera de `catalogo.js` existe para evitar.
 *
 * ══ Por qué se compromete al repositorio ═══════════════════════════════════
 *
 * Porque `supabase functions deploy` empaqueta lo que hay en la carpeta, y no
 * ejecuta el build de la aplicación antes. Un archivo generado y no comprometido
 * llegaría vacío o no llegaría.
 *
 * Un archivo generado dentro del repositorio se puede quedar viejo, y por eso
 * **no se confía en que alguien se acuerde de regenerarlo**: `catalogo.test.js`
 * lo compara con lo que sale del código de verdad y se rompe si no coinciden. Es
 * la misma disciplina que ya protegía a `catalogoDe` de que le cambiaran los
 * archivos por debajo.
 *
 *   node scripts/generar-catalogo.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalogoDe } from '../src/domain/radiografia/catalogo.js';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const DESTINO = join(RAIZ, 'supabase', 'functions', 'radiografia', 'catalogo.json');

/** El catálogo tal y como sale del código de este repositorio, ahora mismo. */
export const catalogoDelCodigo = async () =>
  catalogoDe({
    rutas: await readFile(join(RAIZ, 'src', 'routes.jsx'), 'utf8'),
    antropometria: await readFile(join(RAIZ, 'src', 'domain', 'anthropometry.js'), 'utf8'),
  });

const main = async () => {
  const catalogo = await catalogoDelCodigo();

  /* Los avisos NO se guardan. Son sobre el proceso de extracción de ESTA
     ejecución —«la lista ha salido más corta de lo esperado»— y guardarlos haría
     que el panel repitiera dentro de un mes una queja sobre un build viejo. Si
     la extracción falla, lo que falla es la prueba. */
  const { avisos, ...listas } = catalogo;

  await writeFile(DESTINO, `${JSON.stringify(listas, null, 2)}\n`, 'utf8');

  console.log(`${DESTINO}`);
  console.log(
    `  ${listas.pantallas.length} pantallas · ${listas.pliegues.length} pliegues · ` +
      `${listas.perimetros.length} perímetros`
  );
  for (const aviso of avisos) console.warn(`  ⚠  ${aviso}`);
};

/* Solo cuando se ejecuta a mano: `catalogo.test.js` lo importa para comparar. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
