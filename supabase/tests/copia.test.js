import { describe, expect, it } from 'vitest';

import { EXCLUIDAS, TABLES } from '../../scripts/backup.mjs';
import { URL_TEST, compruebaQueNoEsProduccion, configurado } from './harness';

const LLAVE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || '';

/**
 * Que la copia de seguridad cubra TODO lo que hay que cubrir.
 *
 * ══ El fallo que motiva este archivo ════════════════════════════════════════
 *
 * La lista de tablas de `scripts/backup.mjs` estaba escrita a mano y no se
 * actualizó con las migraciones posteriores. Al probar por primera vez una
 * restauración aparecieron cuatro tablas con datos reales que no se copiaban
 * —`client_phases`, `team_subscriptions`, `support_tickets` y
 * `support_messages`—.
 *
 * Y no daba ningún error. La copia terminaba bien, escribía su manifiesto, y
 * `--verificar` la daba por buena: verificar comprueba que lo copiado esté
 * íntegro, no que esté todo. Es exactamente el fallo que la cabecera del script
 * dice evitar —una copia con aspecto de haber funcionado— pero por tabla.
 *
 * ══ Por qué esta prueba y no revisar la lista de vez en cuando ═════════════
 *
 * Porque el olvido no se ve. Quien añade una migración con una tabla nueva no
 * tiene ningún motivo para acordarse de un script que vive en otra carpeta, y el
 * fallo no se manifiesta hasta el día de la restauración — que es el peor día
 * posible para descubrirlo.
 *
 * Esto lo convierte en imposible: se compara contra el esquema REAL, así que una
 * tabla nueva rompe la prueba hasta que alguien decida, por escrito, si entra en
 * la copia o se queda fuera y por qué.
 */
describe.skipIf(!configurado)('cobertura de la copia de seguridad', () => {
  /**
   * Las tablas que hay de verdad, preguntándoselas a PostgREST.
   *
   * Su raíz devuelve la descripción OpenAPI del esquema expuesto, con una entrada
   * por tabla. Es la misma lista que ve la aplicación, que es justo la que
   * importa: si algo no sale aquí, la copia tampoco podría leerlo.
   *
   * Preferible a preguntarle al catálogo de Postgres —`pg_class`—, que no se
   * expone por la API y obligaría a añadir una función a la base de datos solo
   * para poder ejecutar una prueba.
   */
  const tablasReales = async () => {
    compruebaQueNoEsProduccion();
    const res = await fetch(`${URL_TEST}/rest/v1/`, {
      headers: { apikey: LLAVE, Authorization: `Bearer ${LLAVE}` },
    });
    if (!res.ok) throw new Error(`PostgREST contestó ${res.status}`);
    const spec = await res.json();
    return Object.keys(spec.definitions || spec.components?.schemas || {});
  };

  it('todas las tablas están o copiadas o excluidas con motivo', async () => {
    const reales = await tablasReales();
    expect(reales.length, 'no se ha podido enumerar el esquema').toBeGreaterThan(10);

    const cubiertas = new Set([...TABLES, ...Object.keys(EXCLUIDAS)]);
    const huerfanas = reales.filter((t) => !cubiertas.has(t));

    expect(
      huerfanas,
      'Tablas que no se copian y que nadie ha decidido excluir. Añádelas a TABLES ' +
        'en scripts/backup.mjs, o a EXCLUIDAS con el motivo escrito.'
    ).toEqual([]);
  });

  it('ninguna tabla está a la vez copiada y excluida', () => {
    expect(TABLES.filter((t) => t in EXCLUIDAS)).toEqual([]);
  });

  it('cada exclusión dice por qué', () => {
    /* Un motivo de tres palabras no es un motivo: dentro de dos años, quien lea
       esa lista tiene que poder decidir si sigue siendo cierto. */
    for (const [tabla, motivo] of Object.entries(EXCLUIDAS)) {
      expect(typeof motivo, `${tabla} sin motivo`).toBe('string');
      expect(motivo.length, `el motivo de ${tabla} es demasiado corto`).toBeGreaterThan(40);
    }
  });

  it('no se copian los secretos de integraciones', () => {
    /* La decisión más importante de la lista, y la única cuyo incumplimiento
       convierte cada copia en un problema de seguridad en vez de en una red. */
    expect(TABLES).not.toContain('integration_secrets');
    expect(EXCLUIDAS).toHaveProperty('integration_secrets');
  });

  it('sí se copia lo que es trabajo del entrenador o del cliente', () => {
    /* Las cuatro que faltaban, fijadas por nombre para que quitarlas obligue a
       borrar una línea de aquí y explicarlo. */
    for (const tabla of [
      'clients',
      'workout_data',
      'anthropometry',
      'nutrition_plans',
      'progress_photos',
      'check_ins',
      'client_phases',
      'team_subscriptions',
      'support_tickets',
      'support_messages',
    ]) {
      expect(TABLES, `${tabla} tiene que entrar en la copia`).toContain(tabla);
    }
  });
});
