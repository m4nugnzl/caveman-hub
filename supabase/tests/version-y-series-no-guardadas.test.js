import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esRechazoDefinitivo } from '../../src/lib/dbErrors';
import { compruebaQueNoEsProduccion, configurado, limpia, nuevoCliente, nuevoEntrenador } from './harness';

/**
 * LA 0131 Y LA 0132, contra la base de verdad.
 *
 * Las dos viven en Postgres y ninguna prueba del dominio las ve. La 0132 salió
 * con un fallo que solo se ve aquí: su expresión regular pedía `{3,300}`, que
 * Postgres no admite (el tope es 255), así que `report_unsaved_set` fallaba en
 * CADA llamada y ninguna serie no guardada llegaba al entrenador. Lo cazó el
 * recorrido real del 22 sep, con el teléfono abierto y la hoja quitada.
 */
describe.skipIf(!configurado)('0131 y 0132: la versión que escribe y las series que no se guardaron', () => {
  let ana;
  let beto;
  let cliente;
  /* Una clave como las del teléfono: `set:<cliente>:<sesión>:<ejercicio>:<serie>:<campo>`. */
  const clave = () => `set:${cliente}:ses_${crypto.randomUUID()}:ex_${crypto.randomUUID()}:0:kg`;
  const datos = { weekNumber: 3, dayName: 'Empuje 2', exercise: { name: 'Press banca' }, setIndex: 0, field: 'kg', value: '62', date: '2026-09-22', motivo: 'El día Empuje 2 no está en el plan de la semana 3' };

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    ana = await nuevoEntrenador('ana-0132');
    beto = await nuevoEntrenador('beto-0132');
    cliente = await nuevoCliente(ana, 'Cliente 0132');
  });

  afterAll(async () => {
    await limpia({ entrenadores: [ana, beto], clientes: [cliente] });
  });

  it('una serie no guardada llega, se lee y se borra', async () => {
    const k = clave();
    const apunte = await ana.db.rpc('report_unsaved_set', { p_client: cliente, p_clave: k, p_datos: datos });
    expect(apunte.error).toBeNull();

    const { data } = await ana.db.from('series_no_guardadas').select('hoja, ejercicio, campo, valor, semana').eq('client_id', cliente);
    expect(data).toEqual([{ hoja: 'Empuje 2', ejercicio: 'Press banca', campo: 'kg', valor: '62', semana: 3 }]);

    const borrado = await ana.db.rpc('report_unsaved_set', { p_client: cliente, p_clave: k, p_datos: null });
    expect(borrado.error).toBeNull();
    const { data: quedan } = await ana.db.from('series_no_guardadas').select('id').eq('client_id', cliente);
    expect(quedan).toEqual([]);
  });

  it('una clave que no es de serie, o demasiado larga, no entra', async () => {
    const mala = await ana.db.rpc('report_unsaved_set', { p_client: cliente, p_clave: 'nota:x', p_datos: datos });
    expect(mala.error?.message).toMatch(/Clave de serie no válida/);
    const larga = await ana.db.rpc('report_unsaved_set', { p_client: cliente, p_clave: `set:${'x'.repeat(301)}`, p_datos: datos });
    expect(larga.error?.message).toMatch(/Clave de serie no válida/);
  });

  it('otro entrenador no puede apuntar ni leer las de este cliente', async () => {
    const ajeno = await beto.db.rpc('report_unsaved_set', { p_client: cliente, p_clave: clave(), p_datos: datos });
    expect(ajeno.error?.code).toBe('42501');
    await ana.db.rpc('report_unsaved_set', { p_client: cliente, p_clave: clave(), p_datos: datos });
    const { data } = await beto.db.from('series_no_guardadas').select('id').eq('client_id', cliente);
    expect(data).toEqual([]);
  });

  it('0131: cambiar el plan sin firma nueva se rechaza; con firma, o sin tocar el plan, pasa', async () => {
    const alta = await ana.db
      .from('workout_data')
      .insert({ client_id: cliente, blocks: [{ id: 'b_1', name: 'Bloque 1' }], microcycles: [], escrito_por: 'nueva:1' });
    expect(alta.error).toBeNull();

    const vieja = await ana.db.from('workout_data').update({ blocks: [{ id: 'b_1', name: 'Otro' }] }).eq('client_id', cliente).select('client_id');
    expect(vieja.error?.message).toMatch(/Hay una versión nueva/);
    /* No es P0001: la versión publicada antes trata P0001 como definitivo y borra
       la nota del navegador; con 55000 la guarda y la nueva la reaplica. */
    expect(vieja.error?.code).toBe('55000');
    expect(esRechazoDefinitivo(vieja.error)).toBe(false);

    const reparto = await ana.db.from('workout_data').update({ weekly_split: { Lunes: 'A' } }).eq('client_id', cliente).select('client_id');
    expect(reparto.error?.message).toMatch(/Hay una versión nueva/);

    const notas = await ana.db.from('workout_data').update({ notes: 'sin tocar el plan' }).eq('client_id', cliente).select('client_id');
    expect(notas.error).toBeNull();

    const nueva = await ana.db
      .from('workout_data')
      .update({ blocks: [{ id: 'b_1', name: 'Otro' }], escrito_por: 'nueva:2' })
      .eq('client_id', cliente)
      .select('client_id');
    expect(nueva.error).toBeNull();
  });
});
