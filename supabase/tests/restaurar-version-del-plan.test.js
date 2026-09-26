import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anon, compruebaQueNoEsProduccion, configurado, limpia, nuevoCliente, nuevoEntrenador } from './harness';

/**
 * RESTAURAR UNA VERSIÓN DEL PLAN (0147), contra la base de verdad.
 *
 * Lo que solo contesta Postgres: que las fases vuelven con sus id sin chocar
 * con el EXCLUDE de la 0028, que el destino vuelve, que deja UNA versión nueva
 * con su nota (no varias a medias ni agrupada con la anterior), con el peso
 * objetivo de la versión, cerrada (el siguiente cambio abre otra aunque
 * llegue dentro de los 15 minutos), y que otro entrenador no puede.
 */
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe.skipIf(!configurado)('0147: restaurar una versión del plan', () => {
  let ana;
  let beto;
  let cliente;
  let original;
  let ancla;

  const versiones = async () => {
    const { data, error } = await admin()
      .from('client_plan_versions')
      .select('id, nota, created_by, fases, destino')
      .eq('client_id', cliente)
      .order('created_at')
      .order('id');
    if (error) throw error;
    return data;
  };
  const fases = async () => {
    const { data } = await ana.db.from('client_phases').select('id, title, starts_on, ends_on').eq('client_id', cliente).order('starts_on');
    return data.map((f) => `${f.title} ${f.starts_on}→${f.ends_on}`);
  };
  /* Cierra la tanda de ediciones de la última versión (0140: 15 minutos). */
  const cierraLaTanda = async () => {
    const vs = await versiones();
    const r = await admin()
      .from('client_plan_versions')
      .update({ tocada_en: new Date(Date.now() - 3600000).toISOString() })
      .eq('id', vs[vs.length - 1].id);
    if (r.error) throw r.error;
  };

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    ana = await nuevoEntrenador('ana-0147');
    beto = await nuevoEntrenador('beto-0147');
    cliente = await nuevoCliente(ana, 'Cliente 0147');
    for (const f of [
      { title: 'Definición', direction: 'cut', starts_on: dia(-14), ends_on: dia(41) },
      { title: 'Mantenimiento', direction: 'maintain', starts_on: dia(42), ends_on: dia(69) },
    ]) {
      const { error } = await ana.db.from('client_phases').insert({ ...f, client_id: cliente, rate_pct: 0.5, created_by: ana.id });
      if (error) throw error;
    }
    const a = await ana.db
      .from('client_events')
      .insert({ client_id: cliente, created_by: ana.id, date: dia(70), kind: 'race', title: 'Campeonato', ancla: true })
      .select('id')
      .single();
    if (a.error) throw a.error;
    ancla = a.data.id;
    const p = await ana.db.from('clients').update({ preferences: { goal: { targetWeightKg: 72 } } }).eq('id', cliente);
    if (p.error) throw p.error;
    const vs = await versiones();
    original = vs[0];
  });

  afterAll(async () => {
    await limpia({ entrenadores: [ana, beto], clientes: [cliente] });
  });

  it('el plan montado de seguido es UNA versión: la original', async () => {
    const vs = await versiones();
    expect(vs).toHaveLength(1);
    expect(original.fases).toHaveLength(2);
    expect(original.destino).toMatchObject({ fecha: dia(70), titulo: 'Campeonato', pesoObjetivoKg: 72 });
  });

  it('restaurar devuelve fases y destino, y deja una versión con su nota', async () => {
    await cierraLaTanda();
    /* Otro plan: la definición se alarga, el mantenimiento se va, cambia el destino. */
    const { data: suyas } = await ana.db.from('client_phases').select('id, title').eq('client_id', cliente);
    const mant = suyas.find((f) => f.title === 'Mantenimiento');
    const def = suyas.find((f) => f.title === 'Definición');
    expect((await ana.db.from('client_phases').delete().eq('id', mant.id)).error).toBeNull();
    expect((await ana.db.from('client_phases').update({ ends_on: dia(83) }).eq('id', def.id)).error).toBeNull();
    expect((await ana.db.from('client_events').update({ date: dia(90), title: 'Nacional' }).eq('id', ancla)).error).toBeNull();
    expect((await ana.db.from('clients').update({ preferences: { goal: { targetWeightKg: 70, otra: 'se queda' } } }).eq('id', cliente)).error).toBeNull();
    const antes = await versiones();
    expect(antes).toHaveLength(2);
    await cierraLaTanda();

    const r = await ana.db.rpc('restaurar_version_del_plan', { p_version: original.id, p_nota: 'Restaurada la de prueba' });
    expect(r.error).toBeNull();

    expect(await fases()).toEqual([`Definición ${dia(-14)}→${dia(41)}`, `Mantenimiento ${dia(42)}→${dia(69)}`]);
    const { data: mantVuelta } = await ana.db.from('client_phases').select('id').eq('id', mant.id).maybeSingle();
    expect(mantVuelta?.id).toBe(mant.id);
    const { data: ev } = await ana.db.from('client_events').select('date, title, ancla').eq('id', ancla).single();
    expect(ev).toMatchObject({ date: dia(70), title: 'Campeonato', ancla: true });
    /* El peso vuelve, y solo esa clave: lo demás de las preferencias se queda. */
    const { data: cl } = await ana.db.from('clients').select('preferences').eq('id', cliente).single();
    expect(cl.preferences.goal).toEqual({ targetWeightKg: 72, otra: 'se queda' });

    const despues = await versiones();
    expect(despues).toHaveLength(3);
    const ultima = despues[2];
    expect(ultima.id).toBe(r.data);
    expect(ultima.nota).toBe('Restaurada la de prueba');
    expect(ultima.created_by).toBe(ana.id);
    expect(ultima.fases).toEqual(original.fases);
    expect(ultima.destino).toEqual(original.destino);
  });

  it('el mismo peso que escribe la app después no deja versión', async () => {
    expect((await ana.db.from('clients').update({ preferences: { goal: { targetWeightKg: 72, otra: 'se queda' } } }).eq('id', cliente)).error).toBeNull();
    expect(await versiones()).toHaveLength(3);
  });

  it('la restaurada queda cerrada: el siguiente cambio, aunque sea enseguida, abre otra', async () => {
    const { data: suyas } = await ana.db.from('client_phases').select('id, title').eq('client_id', cliente);
    const def = suyas.find((f) => f.title === 'Definición');
    expect((await ana.db.from('client_phases').update({ ends_on: dia(40) }).eq('id', def.id)).error).toBeNull();
    const vs = await versiones();
    expect(vs).toHaveLength(4);
    expect(vs[2].nota).toBe('Restaurada la de prueba');
    expect(vs[2].fases).toEqual(original.fases);
    expect(vs[3].nota).toBeNull();
    /* Y esa nueva sí agrupa lo que venga detrás, como siempre. */
    expect((await ana.db.from('client_phases').update({ ends_on: dia(39) }).eq('id', def.id)).error).toBeNull();
    expect(await versiones()).toHaveLength(4);
  });

  it('otro entrenador no puede, y sin sesión tampoco', async () => {
    const r = await beto.db.rpc('restaurar_version_del_plan', { p_version: original.id, p_nota: null });
    expect(r.error?.message).toMatch(/no puedes cambiar el plan/);
    const s = await anon().rpc('restaurar_version_del_plan', { p_version: original.id, p_nota: null });
    expect(s.error).not.toBeNull();
    expect(await versiones()).toHaveLength(4);
  });
});
