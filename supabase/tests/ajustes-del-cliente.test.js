import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anon, compruebaQueNoEsProduccion, configurado, limpia, nuevoCliente, nuevoEntrenador } from './harness';

/**
 * LOS AJUSTES DEL CLIENTE Y SU NOTA DE SESIÓN (0139).
 *
 * Lo que tiene que quedar demostrado, con la sesión de cada uno y no con la
 * `service_role`:
 *
 *   1. El cliente crea, edita y borra sus ajustes.
 *   2. Su entrenador los lee y los borra, pero no los crea ni los edita.
 *   3. Otro entrenador no los ve.
 *   4. La nota de sesión la escribe el cliente aunque no haya ninguna serie:
 *      la función crea la sesión y la entrada.
 *   5. Su entrenador no escribe la nota (ver también `sesion-principio-y-fin`).
 */

const HOY = new Date().toISOString().slice(0, 10);
const serie = () => ({ kg: '', reps: '', rir: '', targetReps: '8', targetRir: '' });
const programa = () => [
  {
    id: 'mc_ajustes',
    weekNumber: 1,
    date: HOY,
    days: [
      {
        dayName: 'Torso A',
        exercises: [
          { id: 'ex_press', name: 'Press banca', muscle: 'Pecho', sets: [serie(), serie()] },
          { id: 'ex_remo', name: 'Remo', muscle: 'Espalda', sets: [serie()] },
        ],
      },
    ],
    sessions: [],
  },
];

describe.skipIf(!configurado)('los ajustes del cliente (0139)', () => {
  const creados = { entrenadores: [], clientes: [] };
  let coach;
  let clientId;
  let cliente;
  let cuenta;

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    coach = await nuevoEntrenador('ajustes');
    creados.entrenadores.push(coach);
    clientId = await nuevoCliente(coach, 'Quien fija ajustes');
    creados.clientes.push(clientId);

    const sa = admin();
    const ins = await sa.from('workout_data').insert({ client_id: clientId, microcycles: programa() });
    if (ins.error) throw new Error(`No se pudo sembrar el programa: ${ins.error.message}`);

    const email = `test-ajustes-cliente-${Date.now()}@ejemplo.invalid`;
    const password = `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const alta = await sa.auth.admin.createUser({ email, password, email_confirm: true });
    if (alta.error) throw new Error(`No se pudo crear la cuenta del cliente: ${alta.error.message}`);
    cuenta = alta.data.user.id;
    await sa.from('clients').update({ client_profile_id: cuenta }).eq('id', clientId);
    cliente = anon();
    const login = await cliente.auth.signInWithPassword({ email, password });
    if (login.error) throw new Error(`No se pudo entrar como cliente: ${login.error.message}`);
  }, 60000);

  afterAll(async () => {
    await cliente?.auth.signOut().catch(() => {});
    await limpia(creados);
    if (cuenta) await admin().auth.admin.deleteUser(cuenta).catch(() => {});
  });

  const fija = (db, texto, clave = 'press banca') =>
    db.from('exercise_settings').insert({ client_id: clientId, exercise_key: clave, text: texto }).select().single();

  it('el cliente fija, edita y quita un ajuste', async () => {
    const { data, error } = await fija(cliente, 'banco al 3');
    expect(error).toBeNull();
    expect(data.text).toBe('banco al 3');

    const edit = await cliente.from('exercise_settings').update({ text: 'banco al 4' }).eq('id', data.id).select().single();
    expect(edit.error).toBeNull();
    expect(edit.data.text).toBe('banco al 4');
    expect(Date.parse(edit.data.updated_at)).toBeGreaterThanOrEqual(Date.parse(data.updated_at));

    const fuera = await cliente.from('exercise_settings').delete().eq('id', data.id);
    expect(fuera.error).toBeNull();
  });

  it('una etiqueta vacía o larga se rechaza', async () => {
    expect((await fija(cliente, '   ')).error).not.toBeNull();
    expect((await fija(cliente, 'x'.repeat(81))).error).not.toBeNull();
  });

  it('su entrenador lo lee y lo borra, pero no lo crea ni lo edita', async () => {
    const { data } = await fija(cliente, 'multipower');

    const leido = await coach.db.from('exercise_settings').select('*').eq('client_id', clientId);
    expect(leido.error).toBeNull();
    expect(leido.data.map((f) => f.text)).toContain('multipower');

    expect((await fija(coach.db, 'agarre abierto')).error).not.toBeNull();

    /* RLS no da error en un UPDATE sin filas: simplemente no toca ninguna. */
    await coach.db.from('exercise_settings').update({ text: 'cambiado' }).eq('id', data.id);
    const tras = await admin().from('exercise_settings').select('text').eq('id', data.id).single();
    expect(tras.data.text).toBe('multipower');

    const borrado = await coach.db.from('exercise_settings').delete().eq('id', data.id).select();
    expect(borrado.error).toBeNull();
    expect(borrado.data).toHaveLength(1);
  });

  it('otro entrenador no los ve ni los borra', async () => {
    const { data } = await fija(cliente, 'asiento en el 4');
    const intruso = await nuevoEntrenador('intruso-ajustes');
    creados.entrenadores.push(intruso);

    const leido = await intruso.db.from('exercise_settings').select('*').eq('client_id', clientId);
    expect(leido.data || []).toHaveLength(0);
    const borrado = await intruso.db.from('exercise_settings').delete().eq('id', data.id).select();
    expect(borrado.data || []).toHaveLength(0);
  });

  const nota = (db, args) =>
    db.rpc('log_exercise_note', {
      p_client: clientId,
      p_week: 1,
      p_session_id: 'ses_nota',
      p_exercise_id: 'ex_remo',
      p_note: 'la polea de la izquierda',
      p_date: HOY,
      p_day_name: 'Torso A',
      ...args,
    });

  it('la nota de sesión se guarda sin ninguna serie: crea la sesión', async () => {
    const { data, error } = await nota(cliente, {});
    expect(error).toBeNull();
    expect(data).toBe('ses_nota');

    const { data: fila } = await admin().from('workout_data').select('microcycles').eq('client_id', clientId).single();
    const sesion = fila.microcycles[0].sessions.find((s) => s.id === 'ses_nota');
    expect(sesion.date).toBe(HOY);
    const remo = sesion.entries.find((e) => e.exerciseId === 'ex_remo');
    expect(remo.clientNote).toBe('la polea de la izquierda');
    /* Sin ninguna serie apuntada: la nota no se inventa kilos. */
    expect(remo.sets.every((s) => s.reps === '')).toBe(true);
  });

  it('un ejercicio que no está en el plan de ese día no entra', async () => {
    const { error } = await nota(cliente, { p_session_id: 'ses_otra', p_exercise_id: 'ex_inventado' });
    expect(error?.message).toMatch(/no está en esta sesión/i);
  });

  it('su entrenador no escribe la nota', async () => {
    const { error } = await nota(coach.db, { p_session_id: 'ses_coach' });
    expect(error?.message).toMatch(/Solo el cliente/i);
  });
});
