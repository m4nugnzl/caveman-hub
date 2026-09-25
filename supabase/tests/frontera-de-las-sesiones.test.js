import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  admin,
  anon,
  compruebaQueNoEsProduccion,
  configurado,
  limpia,
  nuevoCliente,
  nuevoEntrenador,
} from './harness';

/**
 * LA FRONTERA DE LAS REVISIONES EN LAS SESIONES. (Migración 0137)
 *
 * El cliente corrige sus sesiones hasta que su entrenador revisa esa semana, y
 * después no; tampoco lo que queda fuera de plazo. Es la regla de la 0134
 * (pesajes, medidas, fotos) llevada a las series, y vive en un disparador sobre
 * `workout_data`, así que se prueba por los caminos de verdad —las funciones
 * con las que escribe el cliente— y con su sesión, no con la `service_role`.
 *
 * Lo que tiene que quedar demostrado:
 *
 *   1. Lo de esta semana se escribe, aunque en la fila haya sesiones viejas en
 *      semanas cerradas: el disparador mira lo que CAMBIA, no lo que hay.
 *   2. Una sesión de una semana revisada no la toca el cliente: ni una serie,
 *      ni una nota, ni cerrarla, ni borrarla.
 *   3. Tampoco puede CREAR una sesión fechada en esa semana (el registro suelto
 *      deja elegir el día antes de la primera serie).
 *   4. Fuera de plazo, lo mismo, aunque nadie la haya revisado.
 *   5. El entrenador no tiene frontera.
 */

/** El lunes de la semana de `d`, en ISO, más `semanas` semanas. */
const lunes = (semanas = 0) => {
  const d = new Date();
  const dia = (d.getUTCDay() + 6) % 7;
  const l = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dia + semanas * 7));
  return l.toISOString().slice(0, 10);
};
const masDias = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const HOY = new Date().toISOString().slice(0, 10);
const FUERA = lunes(-8);
const REVISADA = lunes(-2);
const AHORA = lunes(0);

const serie = () => ({ kg: '', reps: '', rir: '', targetReps: '8', targetRir: '' });
const dia = () => ({
  dayName: 'Torso A',
  exercises: [{ id: 'ex_press', name: 'Press banca', muscle: 'Pecho', sets: [serie(), serie()] }],
});
const sesion = (id, fecha) => ({
  id,
  date: fecha,
  dayName: 'Torso A',
  startedAt: `${fecha}T10:00:00Z`,
  notes: '',
  entries: [{ exerciseId: 'ex_press', name: 'Press banca', sets: [{ kg: '60', reps: '8', rir: '' }, { kg: '', reps: '', rir: '' }] }],
});

const programa = () => [
  { id: 'mc_1', weekNumber: 1, date: FUERA, days: [dia()], sessions: [sesion('ses_fuera', masDias(FUERA, 1))] },
  { id: 'mc_2', weekNumber: 2, date: REVISADA, days: [dia()], sessions: [sesion('ses_revisada', masDias(REVISADA, 1))] },
  { id: 'mc_3', weekNumber: 3, date: AHORA, days: [dia()], sessions: [] },
];

describe.skipIf(!configurado)('la frontera de las revisiones en las sesiones (0137)', () => {
  const creados = { entrenadores: [], clientes: [] };
  let coach;
  let clientId;
  let cliente;
  let cuenta;

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    coach = await nuevoEntrenador('frontera');
    creados.entrenadores.push(coach);
    clientId = await nuevoCliente(coach, 'Quien entrena en papel');
    creados.clientes.push(clientId);

    const sa = admin();
    /* Alta hace doce semanas y revisión semanal: el periodo en curso es esta
       semana, y la de hace dos está revisada. */
    await sa.from('clients').update({ start_date: lunes(-12) }).eq('id', clientId);
    const ins = await sa.from('workout_data').insert({ client_id: clientId, microcycles: programa() });
    if (ins.error) throw new Error(`No se pudo sembrar el programa: ${ins.error.message}`);
    const rev = await sa.from('check_ins').insert({
      client_id: clientId,
      week_start: REVISADA,
      submitted_at: `${REVISADA}T20:00:00Z`,
      reviewed_at: new Date().toISOString(),
    });
    if (rev.error) throw new Error(`No se pudo sembrar la revisión: ${rev.error.message}`);

    /* Su cuenta, enlazada con la `service_role`: lo que se prueba es lo que
       puede escribir, no el canje de la invitación. */
    const email = `test-frontera-cliente-${Date.now()}@ejemplo.invalid`;
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
  }, 60000);

  const anota = (quien, { week, sessionId, date, setIndex = 1, value = '8' }) =>
    quien.rpc('log_session_set', {
      p_client: clientId,
      p_week: week,
      p_session_id: sessionId,
      p_date: date,
      p_day_name: 'Torso A',
      p_exercise_id: 'ex_press',
      p_set_index: setIndex,
      p_field: 'reps',
      p_value: value,
    });

  const sesionDe = async (id) => {
    const { data } = await admin().from('workout_data').select('microcycles').eq('client_id', clientId).single();
    return data.microcycles.flatMap((m) => m.sessions || []).find((s) => s.id === id) || null;
  };

  it('el cliente apunta lo de esta semana aunque haya sesiones cerradas en la fila', async () => {
    const { error } = await anota(cliente, { week: 3, sessionId: 'ses_hoy', date: HOY });
    expect(error).toBeNull();
    expect((await sesionDe('ses_hoy'))?.entries?.[0]?.sets?.[1]?.reps).toBe('8');
  });

  it('el cliente no toca una serie de una semana revisada', async () => {
    const { error } = await anota(cliente, { week: 2, sessionId: 'ses_revisada', date: masDias(REVISADA, 1) });
    expect(error?.message).toMatch(/revisado/);
    expect((await sesionDe('ses_revisada')).entries[0].sets[1].reps).toBe('');
  });

  it('ni crea una sesión nueva fechada en esa semana', async () => {
    const { error } = await anota(cliente, { week: 2, sessionId: 'ses_nueva_revisada', date: masDias(REVISADA, 3) });
    expect(error?.message).toMatch(/revisado/);
    expect(await sesionDe('ses_nueva_revisada')).toBeNull();
  });

  it('ni le escribe una nota, ni la cierra, ni la borra', async () => {
    const nota = await cliente.rpc('log_exercise_note', {
      p_client: clientId,
      p_week: 2,
      p_session_id: 'ses_revisada',
      p_exercise_id: 'ex_press',
      p_note: 'me dolía el hombro',
    });
    expect(nota.error?.message).toMatch(/revisado/);

    const cierre = await cliente.rpc('log_session_close', { p_client: clientId, p_week: 2, p_session_id: 'ses_revisada' });
    expect(cierre.error?.message).toMatch(/revisado/);

    const borrado = await cliente.rpc('log_session_discard', { p_client: clientId, p_week: 2, p_session_id: 'ses_revisada' });
    expect(borrado.error?.message).toMatch(/revisado/);
    expect(await sesionDe('ses_revisada')).not.toBeNull();
  });

  it('fuera de plazo tampoco, aunque nadie la haya revisado', async () => {
    const { error } = await anota(cliente, { week: 1, sessionId: 'ses_fuera', date: masDias(FUERA, 1) });
    expect(error?.message).toMatch(/fuera de plazo/);
  });

  it('su entrenador sí corrige la semana revisada', async () => {
    const { error } = await anota(coach.db, { week: 2, sessionId: 'ses_revisada', date: masDias(REVISADA, 1), value: '7' });
    expect(error).toBeNull();
    expect((await sesionDe('ses_revisada')).entries[0].sets[1].reps).toBe('7');
  });
});
