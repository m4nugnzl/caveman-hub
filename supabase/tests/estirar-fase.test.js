import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { compruebaQueNoEsProduccion, configurado, limpia, nuevoCliente, nuevoEntrenador } from './harness';

/**
 * ESTIRAR UNA FASE (0136), contra la base de verdad.
 *
 * Lo que solo puede contestar Postgres: que alargar mueve primero las de
 * detrás (si no, el EXCLUDE de la 0028 lo rechaza), que acortar las trae, que
 * es todo o nada, que lo vivido no se toca y que otro entrenador no puede.
 * La misma regla en memoria está en `domain/creadorDelPlan` (`estirarFases`).
 */
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe.skipIf(!configurado)('0136: estirar una fase', () => {
  let ana;
  let beto;
  let cliente;
  const ids = {};

  const fases = async () => {
    const { data } = await ana.db
      .from('client_phases')
      .select('title, starts_on, ends_on')
      .eq('client_id', cliente)
      .order('starts_on');
    return data.map((f) => `${f.title} ${f.starts_on}→${f.ends_on}`);
  };

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    ana = await nuevoEntrenador('ana-0136');
    beto = await nuevoEntrenador('beto-0136');
    cliente = await nuevoCliente(ana, 'Cliente 0136');
    const filas = [
      { title: 'Pasada', direction: 'cut', starts_on: dia(-70), ends_on: dia(-15) },
      { title: 'En curso', direction: 'bulk', starts_on: dia(-14), ends_on: dia(27) },
      { title: 'Siguiente', direction: 'cut', starts_on: dia(28), ends_on: dia(83) },
      { title: 'Última', direction: 'maintain', starts_on: dia(84), ends_on: dia(111) },
    ];
    for (const f of filas) {
      const { data, error } = await ana.db
        .from('client_phases')
        .insert({ ...f, client_id: cliente, rate_pct: 0.5, created_by: ana.id })
        .select('id')
        .single();
      if (error) throw error;
      ids[f.title] = data.id;
    }
  });

  afterAll(async () => {
    await limpia({ entrenadores: [ana, beto], clientes: [cliente] });
  });

  it('alargar la de hoy empuja las de detrás, y no toca la pasada', async () => {
    const antes = await fases();
    const { data, error } = await ana.db.rpc('estirar_fase', { p_fase: ids['En curso'], p_dias: 14 });
    expect(error).toBeNull();
    expect(data).toBe(2);
    const ahora = await fases();
    expect(ahora[0]).toBe(antes[0]);
    expect(ahora[1]).toBe(`En curso ${dia(-14)}→${dia(41)}`);
    expect(ahora[2]).toBe(`Siguiente ${dia(42)}→${dia(97)}`);
    expect(ahora[3]).toBe(`Última ${dia(98)}→${dia(125)}`);
  });

  it('acortar lo mismo lo deja como estaba', async () => {
    const { error } = await ana.db.rpc('estirar_fase', { p_fase: ids['En curso'], p_dias: -14 });
    expect(error).toBeNull();
    expect(await fases()).toEqual([
      `Pasada ${dia(-70)}→${dia(-15)}`,
      `En curso ${dia(-14)}→${dia(27)}`,
      `Siguiente ${dia(28)}→${dia(83)}`,
      `Última ${dia(84)}→${dia(111)}`,
    ]);
  });

  it('una futura empuja solo las suyas', async () => {
    const { error } = await ana.db.rpc('estirar_fase', { p_fase: ids.Siguiente, p_dias: 7 });
    expect(error).toBeNull();
    const ahora = await fases();
    expect(ahora[1]).toBe(`En curso ${dia(-14)}→${dia(27)}`);
    expect(ahora[2]).toBe(`Siguiente ${dia(28)}→${dia(90)}`);
    expect(ahora[3]).toBe(`Última ${dia(91)}→${dia(118)}`);
    await ana.db.rpc('estirar_fase', { p_fase: ids.Siguiente, p_dias: -7 });
  });

  it('la de hoy no acaba antes de hoy, ninguna dura menos de una semana y la pasada no se estira', async () => {
    const hoy = await ana.db.rpc('estirar_fase', { p_fase: ids['En curso'], p_dias: -35 });
    expect(hoy.error?.message).toMatch(/antes de hoy|al menos una semana/);
    const corta = await ana.db.rpc('estirar_fase', { p_fase: ids.Última, p_dias: -28 });
    expect(corta.error?.message).toMatch(/al menos una semana/);
    const pasada = await ana.db.rpc('estirar_fase', { p_fase: ids.Pasada, p_dias: 7 });
    expect(pasada.error?.message).toMatch(/ya acabó/);
    expect((await fases())[1]).toBe(`En curso ${dia(-14)}→${dia(27)}`);
  });

  it('otro entrenador no mueve nada', async () => {
    const suyo = await beto.db.rpc('estirar_fase', { p_fase: ids['En curso'], p_dias: 7 });
    expect(suyo.error).not.toBeNull();
    expect((await fases())[1]).toBe(`En curso ${dia(-14)}→${dia(27)}`);
  });
});
