import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { compruebaQueNoEsProduccion, configurado, limpia, nuevoCliente, nuevoEntrenador } from './harness';

/**
 * LOS BLOQUES EN BORRADOR (0133), contra la base de verdad.
 *
 * La columna es hermana de `blocks` y el dominio la trata como una lista. Aquí
 * se comprueba lo que solo puede contestar Postgres: que existe con su valor
 * por defecto, que no admite algo que no sea una lista, y que el borrador de un
 * cliente no se lo puede leer ni escribir otro entrenador.
 */
describe.skipIf(!configurado)('0133: los bloques en borrador', () => {
  let ana;
  let beto;
  let cliente;
  const borrador = { id: 'b_borrador', name: 'Intensificación', plannedWeeks: 4, intent: 'intensificacion' };

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    ana = await nuevoEntrenador('ana-0133');
    beto = await nuevoEntrenador('beto-0133');
    cliente = await nuevoCliente(ana, 'Cliente 0133');
    await ana.db.from('workout_data').insert({ client_id: cliente, blocks: [{ id: 'b_1', name: 'Bloque 1' }], microcycles: [] });
  });

  afterAll(async () => {
    await limpia({ entrenadores: [ana, beto], clientes: [cliente] });
  });

  it('nace vacía: un programa sin previsión es el de siempre', async () => {
    const { data } = await ana.db.from('workout_data').select('draft_blocks').eq('client_id', cliente).single();
    expect(data.draft_blocks).toEqual([]);
  });

  it('guarda la lista de borradores y la devuelve tal cual', async () => {
    const puesto = await ana.db.from('workout_data').update({ draft_blocks: [borrador] }).eq('client_id', cliente).select('draft_blocks').single();
    expect(puesto.error).toBeNull();
    expect(puesto.data.draft_blocks).toEqual([borrador]);
  });

  it('lo que no es una lista no entra', async () => {
    const mal = await ana.db.from('workout_data').update({ draft_blocks: { id: 'b_x' } }).eq('client_id', cliente).select('client_id');
    expect(mal.error?.message).toMatch(/draft_blocks_es_lista/);
    /* Y lo de antes sigue ahí. */
    const { data } = await ana.db.from('workout_data').select('draft_blocks').eq('client_id', cliente).single();
    expect(data.draft_blocks).toEqual([borrador]);
  });

  it('otro entrenador ni lo lee ni lo escribe', async () => {
    const { data } = await beto.db.from('workout_data').select('draft_blocks').eq('client_id', cliente);
    expect(data).toEqual([]);
    const suyo = await beto.db.from('workout_data').update({ draft_blocks: [] }).eq('client_id', cliente).select('client_id');
    expect(suyo.data ?? []).toEqual([]);
  });
});
