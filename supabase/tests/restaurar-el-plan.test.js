import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clienteDeRestauracion, notaDelOriginal, restauraTabla } from '../../scripts/restore.mjs';
import { URL_TEST, admin, compruebaQueNoEsProduccion, configurado, limpia, nuevoCliente, nuevoEntrenador } from './harness';

const ANON = process.env.SUPABASE_TEST_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || '';

/**
 * Restaurar una copia no deja rastro de hoy en el plan ni en los ajustes por
 * ejercicio (0145).
 *
 *   · Las fases restauradas no dejan versión del plan.
 *   · Al terminar, el cliente sin versiones recibe su original, con la nota de
 *     la copia; repetirlo no crea otro, y un entrenador no puede llamarlo.
 *   · Los ajustes por ejercicio conservan las fechas de la copia; sin la
 *     pausa, se fechan hoy (el control).
 */
describe.skipIf(!configurado)('restaurar el plan', () => {
  let entrenador;
  let clienteId;

  const versiones = async () => {
    const { data, error } = await admin()
      .from('client_plan_versions')
      .select('nota, created_by, fases')
      .eq('client_id', clienteId);
    if (error) throw new Error(error.message);
    return data;
  };

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    entrenador = await nuevoEntrenador('restaurar-plan');
    clienteId = await nuevoCliente(entrenador, 'Cliente de la restauración');
  });

  afterAll(async () => {
    await limpia({ entrenadores: [entrenador], clientes: [clienteId] });
  });

  it('las fases restauradas no dejan versión; el original llega al terminar', async () => {
    const db = clienteDeRestauracion(URL_TEST, SERVICE);
    const fase = {
      id: crypto.randomUUID(),
      client_id: clienteId,
      title: 'Volumen',
      direction: 'bulk',
      rate_pct: 0.25,
      starts_on: '2026-01-05',
      ends_on: '2026-03-29',
    };
    expect(await restauraTabla(db, 'client_phases', [fase])).toBeNull();
    expect(await versiones(), 'restaurar no es cambiar el plan').toHaveLength(0);

    const nota = notaDelOriginal('2026-09-25T10:00:00.000Z');
    expect(nota).toBe('Original tras restaurar la copia del 25 sep 2026');
    const { data: creados, error } = await db.rpc('crear_originales_del_plan', { p_nota: nota });
    expect(error).toBeNull();
    expect(creados).toBeGreaterThanOrEqual(1);

    const [original, ...resto] = await versiones();
    expect(resto).toHaveLength(0);
    expect(original.nota).toBe(nota);
    expect(original.created_by).toBeNull();
    expect(original.fases.map((f) => f.title)).toEqual(['Volumen']);

    const otraVez = await db.rpc('crear_originales_del_plan', { p_nota: nota });
    expect(otraVez.error).toBeNull();
    expect(await versiones(), 'quien ya tiene versiones no recibe otra').toHaveLength(1);
  });

  it('un entrenador no puede crear originales', async () => {
    const suyo = createClient(URL_TEST, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await suyo.auth.signInWithPassword({ email: entrenador.email, password: entrenador.password });
    expect(login.error).toBeNull();
    const { error } = await suyo.rpc('crear_originales_del_plan', { p_nota: 'x' });
    expect(error, 'es de la restauración, no de la app').not.toBeNull();
    await suyo.auth.signOut().catch(() => {});
  });

  it('los ajustes por ejercicio conservan sus fechas; sin la pausa, se fechan hoy', async () => {
    const db = clienteDeRestauracion(URL_TEST, SERVICE);
    const fila = {
      id: crypto.randomUUID(),
      client_id: clienteId,
      exercise_key: 'press banca',
      text: 'Asiento 3',
      created_at: '2026-02-01T09:00:00+00:00',
      updated_at: '2026-03-01T09:00:00+00:00',
    };
    expect(await restauraTabla(db, 'exercise_settings', [fila])).toBeNull();

    const lee = async (id) =>
      (await admin().from('exercise_settings').select('created_at, updated_at').eq('id', id).single()).data;
    const vuelta = await lee(fila.id);
    expect(new Date(vuelta.created_at).toISOString()).toBe('2026-02-01T09:00:00.000Z');
    expect(new Date(vuelta.updated_at).toISOString()).toBe('2026-03-01T09:00:00.000Z');

    const sinPausa = createClient(URL_TEST, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const otra = { ...fila, id: crypto.randomUUID(), text: 'Agarre neutro' };
    expect((await sinPausa.from('exercise_settings').insert(otra)).error).toBeNull();
    const hoy = await lee(otra.id);
    expect(Date.now() - new Date(hoy.created_at).getTime(), 'sin la cabecera el sello actúa').toBeLessThan(60_000);
  });
});
