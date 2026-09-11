import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EXCLUIDAS, TABLES } from './backup.mjs';
import { ORDEN } from './restore.mjs';

/**
 * Que lo que se COPIA se pueda RESTAURAR.
 *
 * ══ El fallo que motiva este archivo ════════════════════════════════════════
 *
 * `supabase/tests/copia.test.js` ya vigila que la copia cubra todas las tablas
 * del esquema, y funciona: encontró `client_folders` y `client_calendar_feeds`.
 * Pero vigila UNA de las dos listas.
 *
 * La restauración tiene la suya —`ORDEN`, en otro archivo— y nadie las ataba.
 * Habían divergido: `client_conditions`, `client_equipment`,
 * `platform_snapshots` y `platform_acceptances` se copiaban y no se
 * restauraban. Sus archivos se escribían en la copia y nadie volvía a
 * leerlos, así que la restauración terminaba en verde y devolvía a cada
 * cliente sin sus lesiones, sus patologías ni sus alergias.
 *
 * Es el mismo fallo que la prueba hermana describe —una copia con aspecto de
 * haber funcionado— movido un paso más allá: ahora es una RESTAURACIÓN con
 * aspecto de haber funcionado, que se descubre aún más tarde y duele más.
 *
 * ══ Por qué aquí y no en `supabase/tests/` ═════════════════════════════════
 *
 * Porque no hace falta ninguna base de datos: las dos listas están en git y las
 * claves foráneas también, escritas en las migraciones. Sin credenciales y sin
 * red, así que entra en `npm run check` y falla en la máquina de quien rompe
 * las listas, el día que las rompe — en vez de esperar a que alguien se acuerde
 * de levantar un Supabase.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACIONES = join(AQUI, '..', 'supabase', 'migrations');

/**
 * Qué tabla depende de qué, leído de las migraciones.
 *
 * Se recorre cada bloque `CREATE TABLE public.X (…)` y se apuntan las
 * `REFERENCES public.Y` que lleva dentro. Es deliberadamente simple: no
 * interpreta SQL, busca las dos formas en que este repositorio declara una
 * clave foránea —en la columna y como `CONSTRAINT … FOREIGN KEY`—, que son las
 * únicas que usa.
 *
 * Las auto-referencias se descartan: una tabla que se apunta a sí misma
 * (`retira` en `platform_acceptances`) no impone ningún orden entre tablas.
 */
const dependencias = () => {
  const deps = new Map();

  for (const archivo of readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRACIONES, archivo), 'utf8');
    const bloques = sql.matchAll(
      /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi
    );

    for (const [, tabla, cuerpo] of bloques) {
      const previas = deps.get(tabla) || new Set();
      for (const [, destino] of cuerpo.matchAll(/REFERENCES\s+(?:public\.)?(\w+)/gi)) {
        if (destino !== tabla) previas.add(destino);
      }
      deps.set(tabla, previas);
    }
  }

  return deps;
};

describe('la copia y la restauración hablan de las mismas tablas', () => {
  it('todo lo que se copia se restaura', () => {
    const restaurables = new Set(ORDEN);
    const perdidas = TABLES.filter((t) => !restaurables.has(t));

    expect(
      perdidas,
      'Tablas que la copia guarda y la restauración nunca vuelve a leer. Su archivo se ' +
        'escribe, nadie lo abre, y la restauración termina en verde sin ellas. Añádelas a ' +
        'ORDEN en scripts/restore.mjs, después de aquellas de las que dependan.'
    ).toEqual([]);
  });

  it('no se restaura nada que la copia haya excluido a propósito', () => {
    /* `videos` es la excepción escrita: la 0057 borra la tabla, y hasta que se
       aplique una copia antigua puede traer su archivo. Cualquier OTRA tabla
       excluida que aparezca en ORDEN es una contradicción entre los dos
       archivos, y la que manda es la exclusión: se decidió por escrito. */
    const contradicciones = ORDEN.filter((t) => t in EXCLUIDAS && t !== 'videos');

    expect(
      contradicciones,
      'Tablas excluidas de la copia que la restauración pretende escribir.'
    ).toEqual([]);
  });

  it('cada tabla se restaura después de aquellas de las que depende', () => {
    const deps = dependencias();
    const posicion = new Map(ORDEN.map((t, i) => [t, i]));
    const invertidas = [];

    for (const [i, tabla] of ORDEN.entries()) {
      for (const destino of deps.get(tabla) || []) {
        const antes = posicion.get(destino);
        /* Una dependencia que no se restaura no es asunto de esta prueba: o es
           una tabla del esquema de autenticación (`auth.users`), o es una
           exclusión deliberada, y de lo que falte ya se queja la prueba de
           arriba. Aquí solo importa el ORDEN de lo que sí entra. */
        if (antes !== undefined && antes > i) {
          invertidas.push(`${tabla} (${i}) se restaura antes que ${destino} (${antes})`);
        }
      }
    }

    expect(
      invertidas,
      'Claves foráneas restauradas al revés. La primera fila que llegue abortará con una ' +
        'violación de clave ajena, a media base y el día que menos conviene.'
    ).toEqual([]);
  });

  it('las migraciones se leen de verdad', () => {
    /* La prueba de arriba pasa sola si el lector de migraciones deja de
       encontrar nada — un cambio de formato en el SQL, una carpeta movida—. Sin
       este ancla, la red se caería en silencio, que es el fallo que este archivo
       entero existe para no repetir. */
    const deps = dependencias();
    expect(deps.size, 'no se ha leído ninguna tabla de supabase/migrations').toBeGreaterThan(20);
    expect(deps.get('client_payments'), 'client_payments depende de integrations').toContain(
      'integrations'
    );
  });
});
