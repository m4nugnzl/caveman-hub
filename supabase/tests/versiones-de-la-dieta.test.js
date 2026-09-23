import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dumpTable } from '../../scripts/backup.mjs';
import { clienteDeRestauracion, restauraTabla } from '../../scripts/restore.mjs';
import {
  URL_TEST,
  admin,
  compruebaQueNoEsProduccion,
  configurado,
  limpia,
  nuevoCliente,
  nuevoEntrenador,
} from './harness';

const ANON = process.env.SUPABASE_TEST_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || '';

/**
 * La dieta se fecha al guardarla (0124), y una restauración no la fecha.
 *
 * ══ Lo que vigila ══════════════════════════════════════════════════════════
 *
 *   · Que un cambio de CIFRAS del entrenador deja una versión con el día de SU
 *     zona horaria, y que tocar un menú no deja ninguna.
 *   · Que nadie escribe en la tabla por la API: solo el disparador.
 *   · LA IDA Y VUELTA. Se copia con `dumpTable` de `backup.mjs` y se restaura
 *     con `restauraTabla` de `restore.mjs` —el código de verdad, no una copia—,
 *     y al volver están las versiones de la copia y NINGUNA fechada hoy.
 *   · Y el control: la misma escritura sin la pausa SÍ fecha hoy. Sin él, la
 *     prueba de arriba pasaría también con un disparador que no hiciera nada.
 */

/** El día de hoy en una zona, como `YYYY-MM-DD`. */
const hoyEn = (zona) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date()
  );

/*
  Una zona a UTC+14: su día es distinto del de UTC casi todo el día, así que si
  el disparador ignorara la cabecera la prueba lo vería.
*/
const ZONA = 'Pacific/Kiritimati';

describe.skipIf(!configurado)('las versiones de la dieta', () => {
  let entrenador;
  let clienteId;
  let suyo;

  const versiones = async () => {
    const { data, error } = await admin()
      .from('nutrition_plan_versions')
      .select('dia, pauta')
      .eq('client_id', clienteId)
      .order('dia');
    if (error) throw new Error(error.message);
    return data;
  };

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    entrenador = await nuevoEntrenador('versiones');
    clienteId = await nuevoCliente(entrenador, 'Cliente de las versiones');

    /* La misma sesión, con la cabecera que manda la aplicación
       (`lib/supabaseClient.js`). */
    suyo = createClient(URL_TEST, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-zona-horaria': ZONA } },
    });
    const login = await suyo.auth.signInWithPassword({
      email: entrenador.email,
      password: entrenador.password,
    });
    if (login.error) throw new Error(login.error.message);
  });

  afterAll(async () => {
    await suyo?.auth.signOut().catch(() => {});
    /* Las versiones se van con la ficha, por la cascada: es lo que se prueba
       también al limpiar. */
    await limpia({ entrenadores: [entrenador], clientes: [clienteId] });
  });

  it('un cambio de cifras se fecha en el día del entrenador; uno de menú no', async () => {
    const alta = await suyo
      .from('nutrition_plans')
      .insert({ client_id: clienteId, target_kcals: 2500, protein_grams: 160 });
    expect(alta.error).toBeNull();

    let filas = await versiones();
    expect(filas).toHaveLength(1);
    expect(filas[0].dia).toBe(hoyEn(ZONA));
    expect(Number(filas[0].pauta.target_kcals)).toBe(2500);

    const menu = await suyo
      .from('nutrition_plans')
      .update({ closed_meals: [{ id: 'm1', name: 'Desayuno', options: [] }] })
      .eq('client_id', clienteId);
    expect(menu.error).toBeNull();

    filas = await versiones();
    expect(filas, 'tocar un menú no es cambiar la pauta').toHaveLength(1);
    expect(filas[0].pauta, 'las comidas no viajan en la versión').not.toHaveProperty('closed_meals');
  });

  it('el entrenador lee las versiones y no puede escribirlas', async () => {
    const lee = await suyo.from('nutrition_plan_versions').select('dia').eq('client_id', clienteId);
    expect(lee.error).toBeNull();
    expect(lee.data).toHaveLength(1);

    const escribe = await suyo
      .from('nutrition_plan_versions')
      .insert({ client_id: clienteId, dia: '2026-01-01', pauta: {} });
    expect(escribe.error, 'una versión se genera, no se fabrica').not.toBeNull();
  });

  it('ida y vuelta: la restauración trae las versiones y no fecha nada hoy', async () => {
    const sa = admin();

    /* Una historia en el pasado, como la que tendría una copia de verdad. */
    await sa.from('nutrition_plan_versions').delete().eq('client_id', clienteId);
    const pasado = [
      { client_id: clienteId, dia: '2026-07-13', pauta: { target_kcals: 3100 } },
      { client_id: clienteId, dia: '2026-09-07', pauta: { target_kcals: 2600 } },
    ];
    expect((await sa.from('nutrition_plan_versions').insert(pasado)).error).toBeNull();

    // ── La ida: la copia, con el código de la copia ──
    const copiaV = (await dumpTable(sa, 'nutrition_plan_versions')).rows.filter((f) => f.client_id === clienteId);
    const copiaN = (await dumpTable(sa, 'nutrition_plans')).rows.filter((f) => f.client_id === clienteId);
    expect(copiaV).toHaveLength(2);
    expect(copiaN).toHaveLength(1);

    /* Lo que pasa después de la copia: se cambia la dieta (versión de hoy) y se
       pierden las versiones. */
    expect(
      (await suyo.from('nutrition_plans').update({ target_kcals: 1800 }).eq('client_id', clienteId)).error
    ).toBeNull();
    await sa.from('nutrition_plan_versions').delete().eq('client_id', clienteId);

    // ── La vuelta: la restauración, con el código de la restauración ──
    const db = clienteDeRestauracion(URL_TEST, SERVICE);
    for (const [tabla, filas] of [
      ['nutrition_plan_versions', copiaV],
      ['nutrition_plans', copiaN],
    ]) {
      expect(await restauraTabla(db, tabla, filas), tabla).toBeNull();
    }

    const vueltas = await versiones();
    expect(vueltas.map((f) => f.dia)).toEqual(['2026-07-13', '2026-09-07']);
    expect(vueltas.map((f) => Number(f.pauta.target_kcals))).toEqual([3100, 2600]);

    const { data: dieta } = await sa.from('nutrition_plans').select('target_kcals').eq('client_id', clienteId).single();
    expect(Number(dieta.target_kcals), 'la dieta vuelve a la de la copia').toBe(2500);
  });

  it('control: la misma escritura SIN la pausa sí se fecha hoy', async () => {
    const sinPausa = createClient(URL_TEST, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const antes = (await versiones()).length;

    expect(
      (await sinPausa.from('nutrition_plans').update({ target_kcals: 2222 }).eq('client_id', clienteId)).error
    ).toBeNull();

    const despues = await versiones();
    expect(despues.length, 'sin cabecera el disparador actúa').toBe(antes + 1);
  });
});
