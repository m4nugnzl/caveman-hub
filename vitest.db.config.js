import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Las pruebas contra la base de datos, aparte de las demás.
 *
 * ══ Por qué un archivo propio y no un `include` más ═════════════════════════
 *
 * Porque las dos suites tienen requisitos incompatibles. Las de `src/` corren en
 * cualquier máquina recién clonada, sin red y en dos segundos, y por eso están
 * dentro de `npm run check`. Éstas necesitan un proyecto de Supabase con las
 * migraciones aplicadas.
 *
 * Mezclarlas tendría una consecuencia concreta y mala: `check` fallaría en
 * cualquier sitio sin credenciales, la gente se acostumbraría a verlo rojo, y el
 * día que se pusiera rojo de verdad no lo miraría nadie. Una comprobación que
 * falla por motivos que no importan deja de ser una comprobación.
 *
 *     npm test        → src/       (siempre, sin red)
 *     npm run test:db → supabase/  (solo con proyecto configurado)
 */

/*
  Se leen los `.env` a mano y no con una librería: es un archivo de `CLAVE=valor`
  y meter una dependencia para eso sería la clase de añadido que `CLAUDE.md` pide
  justificar. `--env-file` de Node no vale aquí porque quien arranca es vitest.

  `.env` va primero por el guardarraíl: de ahí sale `VITE_SUPABASE_URL`, que es
  contra la que se comprueba que las pruebas NO apunten a producción.
*/
const cargaEnv = (archivo) => {
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte < 0) continue;
    const clave = limpia.slice(0, corte).trim();
    const valor = limpia.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
    if (!(clave in process.env)) process.env[clave] = valor;
  }
};

cargaEnv('.env');
cargaEnv('.env.test');

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['supabase/tests/**/*.test.js'],
    /* Hablan con un servidor de verdad: dar de alta dos cuentas y limpiar
       después no cabe en los cinco segundos que vitest da por defecto. */
    testTimeout: 30000,
    hookTimeout: 60000,
    /* En serie. Las suites crean y borran cuentas contra el mismo proyecto, y en
       paralelo se pisarían los recuentos y la limpieza. */
    fileParallelism: false,
  },
});
