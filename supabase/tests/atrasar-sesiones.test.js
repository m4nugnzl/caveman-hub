import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anon, compruebaQueNoEsProduccion, configurado, limpia, nuevoCliente, nuevoEntrenador } from './harness';

/**
 * ATRASAR LAS SESIONES (0138), contra la base de verdad.
 *
 * Lo que solo puede contestar Postgres: que el cliente atrasa lo suyo y nada
 * más, que no se atrasa hacia atrás ni lo hecho, que deshacer devuelve las
 * fechas y borra el aviso, que el entrenador lo da por visto, y que renombrar
 * una hoja se lleva sus fechas. La cuenta del plan está en
 * `domain/planDeSesiones`.
 */
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();

describe.skipIf(!configurado)('0138: atrasar las sesiones', () => {
  let ana;
  let beto;
  let cliente;
  let yo;
  let cuenta;

  const programa = () => [
    {
      id: 'mc_1',
      weekNumber: 1,
      date: dia(-3),
      days: [{ dayName: 'Torso', exercises: [] }, { dayName: 'Pierna', exercises: [] }],
      sessions: [{ id: 's_torso', dayName: 'Torso', date: dia(-3), entries: [] }],
    },
  ];

  const planes = async () => {
    const { data } = await admin()
      .from('session_plans')
      .select('week_number, hoja, vez, planned_date')
      .eq('client_id', cliente)
      .order('hoja');
    return data;
  };

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    ana = await nuevoEntrenador('ana-0138');
    beto = await nuevoEntrenador('beto-0138');
    cliente = await nuevoCliente(ana, 'Cliente 0138');

    const sa = admin();
    const email = `test-cliente-0138-${Date.now()}@ejemplo.invalid`;
    const password = `Pw-${Math.random().toString(36).slice(2)}`;
    const { data, error } = await sa.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    cuenta = data.user.id;
    await sa.from('clients').update({ client_profile_id: cuenta }).eq('id', cliente);
    yo = anon();
    const login = await yo.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;

    const ins = await sa.from('workout_data').insert({
      client_id: cliente,
      microcycles: programa(),
      blocks: [{ id: 'b1', name: 'Bloque 1', fromWeek: 1, toWeek: null, sessions: [{ dayName: 'Torso' }, { dayName: 'Pierna' }] }],
    });
    if (ins.error) throw ins.error;
  }, 60000);

  afterAll(async () => {
    const sa = admin();
    await sa.from('session_delays').delete().eq('client_id', cliente);
    await sa.from('session_plans').delete().eq('client_id', cliente);
    await limpia({ entrenadores: [ana, beto], clientes: [cliente] });
    await sa.auth.admin.deleteUser(cuenta).catch(() => {});
  }, 60000);

  const atrasar = (db, { id = uuid(), desde = dia(1), dias = 2, movidas } = {}) =>
    db.rpc('atrasar_sesiones', {
      p_id: id,
      p_client: cliente,
      p_desde: desde,
      p_dias: dias,
      p_movidas: movidas ?? [{ semana: 1, hoja: 'Pierna', vez: 0, antes: desde, despues: dia(1 + dias) }],
    });

  it('el entrenador no atrasa por el cliente', async () => {
    const { error } = await atrasar(ana.db);
    expect(error).not.toBeNull();
  });

  it('ni hacia atrás, ni sobre días pasados, ni lo hecho', async () => {
    expect((await atrasar(yo, { movidas: [{ semana: 1, hoja: 'Pierna', vez: 0, antes: dia(1), despues: dia(0) }] })).error).not.toBeNull();
    expect((await atrasar(yo, { desde: dia(-5) })).error).not.toBeNull();
    expect(
      (await atrasar(yo, { movidas: [{ semana: 1, hoja: 'Torso', vez: 0, antes: dia(1), despues: dia(3) }] })).error
    ).not.toBeNull();
    expect(await planes()).toEqual([]);
  });

  it('atrasa, avisa una vez, y deshacer lo deja como estaba', async () => {
    const id = uuid();
    const { error } = await atrasar(yo, { id });
    expect(error).toBeNull();
    expect(await planes()).toEqual([{ week_number: 1, hoja: 'Pierna', vez: 0, planned_date: dia(3) }]);

    const avisos = await ana.db.from('session_delays').select('id, dias, seen_at').eq('client_id', cliente);
    expect(avisos.data).toHaveLength(1);
    expect(avisos.data[0].seen_at).toBeNull();

    const deshecho = await yo.rpc('deshacer_atraso', { p_id: id });
    expect(deshecho.error).toBeNull();
    expect(deshecho.data).toBe(true);
    expect(await planes()).toEqual([]);
    expect((await ana.db.from('session_delays').select('id').eq('client_id', cliente)).data).toEqual([]);

    /* Dos veces no rompe nada: puede que el atraso ni llegara. */
    expect((await yo.rpc('deshacer_atraso', { p_id: id })).data).toBe(false);
  });

  it('el entrenador lo da por visto; el de al lado no', async () => {
    await atrasar(yo);
    expect((await beto.db.rpc('ver_atrasos', { p_client: cliente })).error).not.toBeNull();
    const visto = await ana.db.rpc('ver_atrasos', { p_client: cliente });
    expect(visto.error).toBeNull();
    expect(visto.data).toBe(1);
    const { data } = await ana.db.from('session_delays').select('seen_at').eq('client_id', cliente);
    expect(data.every((f) => f.seen_at)).toBe(true);
    expect((await beto.db.from('session_delays').select('id').eq('client_id', cliente)).data).toEqual([]);
  });

  it('renombrar la hoja se lleva su fecha', async () => {
    const { error } = await admin()
      .from('workout_data')
      .update({
        blocks: [{ id: 'b1', name: 'Bloque 1', fromWeek: 1, toWeek: null, sessions: [{ dayName: 'Torso' }, { dayName: 'Piernas' }] }],
      })
      .eq('client_id', cliente);
    expect(error).toBeNull();
    expect((await planes()).map((p) => p.hoja)).toEqual(['Piernas']);
  });
});
