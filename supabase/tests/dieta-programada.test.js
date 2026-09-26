import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { URL_TEST, admin, compruebaQueNoEsProduccion, configurado, limpia, nuevoCliente, nuevoEntrenador } from './harness';

const ANON = process.env.SUPABASE_TEST_ANON_KEY || '';

/** Hoy en una zona, como `YYYY-MM-DD`. */
const hoyEn = (zona) => new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(new Date());
const masDias = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* Una zona a UTC+14: su día casi nunca es el de Madrid. */
const ZONA = 'Pacific/Kiritimati';

/**
 * La dieta programada (0146), por la API y con las dos personas de verdad.
 *
 *   · El entrenador la prepara para mañana del CLIENTE, no para hoy; el
 *     cliente no la ve.
 *   · El cliente, al abrir la aplicación, apunta su zona y aplica la que toca;
 *     se fecha en su día.
 *   · Un retoque de menú después de empezar no la para, y se dice; un cambio
 *     de pauta, sí.
 */
describe.skipIf(!configurado)('la dieta programada (0146)', () => {
  let entrenador;
  let clienteId;
  let cliente;
  let cuenta;

  const programadas = async () => {
    const { data, error } = await admin().from('nutrition_plan_programadas').select('*').eq('client_id', clienteId).order('empieza');
    if (error) throw new Error(error.message);
    return data;
  };
  /* La clave de servicio con la pausa de la restauración (`x-sin-versiones`):
     escribe sin dejar versión y sin las reglas de la programada. */
  const enPausa = () =>
    createClient(URL_TEST, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || '', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-sin-versiones': '1' } },
    });
  /* Adelanta el reloj: la fila empieza en `dia`, que ya pasó. */
  const vence = async (id, dia) => {
    const r = await enPausa().from('nutrition_plan_programadas').update({ empieza: dia }).eq('id', id);
    expect(r.error).toBeNull();
  };

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    entrenador = await nuevoEntrenador('programada');
    clienteId = await nuevoCliente(entrenador, 'Cliente de la dieta programada');
    /* Sin versión: las que haya después son solo las de la prueba. */
    const alta = await enPausa().from('nutrition_plans').insert({ client_id: clienteId, target_kcals: 2600, protein_grams: 170 });
    if (alta.error) throw new Error(alta.error.message);

    const sa = admin();
    const email = `test-programada-cliente-${Date.now()}@ejemplo.invalid`;
    const password = `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const u = await sa.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error) throw new Error(u.error.message);
    cuenta = u.data.user.id;
    await sa.from('clients').update({ client_profile_id: cuenta }).eq('id', clienteId);
    cliente = createClient(URL_TEST, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-zona-horaria': ZONA } },
    });
    const login = await cliente.auth.signInWithPassword({ email, password });
    if (login.error) throw new Error(login.error.message);
  }, 60000);

  afterAll(async () => {
    await cliente?.auth.signOut().catch(() => {});
    await admin().from('nutrition_plan_programadas').delete().eq('client_id', clienteId);
    await limpia({ entrenadores: [entrenador], clientes: [clienteId] });
    if (cuenta) await admin().auth.admin.deleteUser(cuenta).catch(() => {});
  });

  it('el cliente apunta su zona al abrir, y «mañana» pasa a ser el suyo', async () => {
    const r = await cliente.rpc('aplicar_dietas_programadas', { p_client: clienteId });
    expect(r.error).toBeNull();
    const { data } = await admin().from('clients').select('zona_horaria').eq('id', clienteId).single();
    expect(data.zona_horaria).toBe(ZONA);

    const hoy = hoyEn(ZONA);
    const paraHoy = await entrenador.db
      .from('nutrition_plan_programadas')
      .insert({ client_id: clienteId, empieza: hoy, dieta: { target_kcals: 2400 } });
    expect(paraHoy.error?.message).toMatch(/mañana o después/);

    const manana = await entrenador.db
      .from('nutrition_plan_programadas')
      .insert({ client_id: clienteId, empieza: masDias(hoy, 1), dieta: { target_kcals: 2400, protein_grams: 170 }, motivo: 'Bajamos' })
      .select()
      .single();
    expect(manana.error).toBeNull();
    expect(manana.data.estado).toBe('pendiente');

    const suya = await cliente.from('nutrition_plan_programadas').select('id').eq('client_id', clienteId);
    expect(suya.data ?? [], 'lo que aún no ha empezado no es suyo').toHaveLength(0);
  });

  it('al abrir el cliente se aplica la que ya toca, fechada en su día, con su motivo', async () => {
    const [p] = await programadas();
    const dia = masDias(hoyEn(ZONA), -1);
    /* La dieta quieta desde antes de su día. */
    await admin().from('nutrition_plans').update({ updated_at: '2020-01-01T00:00:00Z' }).eq('client_id', clienteId);
    await vence(p.id, dia);

    const r = await cliente.rpc('aplicar_dietas_programadas', { p_client: clienteId });
    expect(r.error).toBeNull();
    expect(r.data).toBe(1);

    const [ya] = await programadas();
    expect(ya.estado).toBe('aplicada');
    expect(ya.retoque_del).toBeNull();
    const { data: dieta } = await admin().from('nutrition_plans').select('target_kcals').eq('client_id', clienteId).single();
    expect(Number(dieta.target_kcals)).toBe(2400);
    const { data: v } = await admin().from('nutrition_plan_versions').select('dia').eq('client_id', clienteId).eq('dia', dia);
    expect(v).toHaveLength(1);
    const { data: i } = await admin().from('client_interventions').select('motivo').eq('client_id', clienteId).eq('dieta_dia', dia);
    expect(i?.[0]?.motivo).toBe('Bajamos');
  });

  it('un retoque de menú no la para (y se dice); un cambio de pauta sí', async () => {
    const hoy = hoyEn(ZONA);
    const nueva = async (dia, kcal) => {
      const { data, error } = await entrenador.db
        .from('nutrition_plan_programadas')
        .insert({ client_id: clienteId, empieza: masDias(hoy, dia), dieta: { target_kcals: kcal, protein_grams: 170 } })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    };

    /* Una que empezó hoy, y un menú tocado después. */
    const a = await nueva(3, 2300);
    await vence(a.id, hoy);
    const menu = await entrenador.db
      .from('nutrition_plans')
      .update({ closed_meals: [{ id: 'm1', name: 'Desayuno', options: [] }], updated_at: new Date().toISOString() })
      .eq('client_id', clienteId);
    expect(menu.error).toBeNull();
    const r1 = await entrenador.db.rpc('aplicar_dietas_programadas', { p_client: clienteId });
    expect(r1.error).toBeNull();
    const aplicada = (await programadas()).find((p) => p.id === a.id);
    expect(aplicada.estado).toBe('aplicada');
    expect(aplicada.retoque_del).not.toBeNull();

    /* Otra que empieza hoy, y la PAUTA tocada a mano después (el entrenador
       en la zona del cliente, para que la versión caiga en su día). Antes se
       quitan la aplicada y su versión: el día es el mismo. */
    await enPausa().from('nutrition_plan_programadas').delete().eq('id', a.id);
    await enPausa().from('nutrition_plan_versions').delete().eq('client_id', clienteId).gte('dia', hoy);
    const b = await nueva(4, 2000);
    await vence(b.id, hoy);
    const entrenadorEnSuZona = createClient(URL_TEST, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-zona-horaria': ZONA } },
    });
    const login = await entrenadorEnSuZona.auth.signInWithPassword({ email: entrenador.email, password: entrenador.password });
    expect(login.error).toBeNull();
    const pauta = await entrenadorEnSuZona.from('nutrition_plans').update({ target_kcals: 2222 }).eq('client_id', clienteId);
    expect(pauta.error).toBeNull();
    const r2 = await entrenador.db.rpc('aplicar_dietas_programadas', { p_client: clienteId });
    expect(r2.data).toBe(0);
    const noAplicada = (await programadas()).find((p) => p.id === b.id);
    expect(noAplicada.estado).toBe('no_aplicada');
    expect(noAplicada.por_que_no).toMatch(/pauta se cambió a mano/);
    const { data: dieta } = await admin().from('nutrition_plans').select('target_kcals').eq('client_id', clienteId).single();
    expect(Number(dieta.target_kcals), 'no pisa').toBe(2222);

    /* Lo que ya no está pendiente no se edita, y nadie de fuera puede aplicar para todos. */
    const editar = await entrenador.db.from('nutrition_plan_programadas').update({ motivo: 'x' }).eq('id', b.id).select('id');
    expect(editar.data ?? []).toHaveLength(0);
    const todos = await entrenador.db.rpc('aplicar_dietas_programadas', { p_client: null });
    expect(todos.error?.message).toMatch(/Sin permiso/);
    await entrenadorEnSuZona.auth.signOut().catch(() => {});
  });

  it('el latido de cada hora: a cada uno se le aplica al empezar SU día', async () => {
    /* Dos clientes con la misma fecha de inicio, a 25 horas uno del otro: en
       Kiritimati ya es ese día; en Pago Pago, todavía no. */
    const LEJOS = 'Pacific/Pago_Pago';
    const dia = hoyEn(ZONA);
    const ids = [];
    try {
      for (const zona of [ZONA, LEJOS]) {
        const id = await nuevoCliente(entrenador, `Cliente en ${zona}`);
        ids.push(id);
        const alta = await enPausa()
          .from('nutrition_plans')
          .insert({ client_id: id, target_kcals: 2600, protein_grams: 170, updated_at: '2020-01-01T00:00:00Z' });
        expect(alta.error).toBeNull();
        await admin().from('clients').update({ zona_horaria: zona }).eq('id', id);
        const { data, error } = await entrenador.db
          .from('nutrition_plan_programadas')
          .insert({ client_id: id, empieza: masDias(hoyEn(zona), 2), dieta: { target_kcals: 2100, protein_grams: 170 } })
          .select()
          .single();
        expect(error).toBeNull();
        await vence(data.id, dia);
      }

      /* Lo que hace el latido: la clave de servicio, para todos. */
      const r = await admin().rpc('aplicar_dietas_programadas', { p_client: null });
      expect(r.error).toBeNull();
      const { data: filas } = await admin().from('nutrition_plan_programadas').select('client_id, estado').in('client_id', ids);
      const estado = Object.fromEntries(filas.map((f) => [f.client_id, f.estado]));
      expect(estado[ids[0]], 'Kiritimati ya está en su día').toBe('aplicada');
      expect(estado[ids[1]], 'Pago Pago aún no').toBe('pendiente');
    } finally {
      await admin().from('nutrition_plan_programadas').delete().in('client_id', ids);
      await limpia({ entrenadores: [], clientes: ids });
    }
  });
});
