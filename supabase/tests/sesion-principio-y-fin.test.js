import { afterAll, describe, expect, it } from 'vitest';

import {
  admin,
  compruebaQueNoEsProduccion,
  configurado,
  limpia,
  nuevoCliente,
  nuevoEntrenador,
} from './harness';

/**
 * EL PRINCIPIO Y EL FIN DE UNA SESIÓN, y la nota del cliente. (Migración 0119)
 *
 * ══ Por qué esto se prueba contra la base y no en `domain/` ════════════════
 *
 * Porque lo que hay que comprobar son cuatro cosas que solo existen ahí:
 *
 *   1. Que `log_session_set` estampa `startedAt` al CREAR la sesión — y que no
 *      lo vuelve a estampar con cada serie, que borraría el principio con la
 *      última cifra escrita y dejaría toda sesión durando cero minutos.
 *   2. Que `log_session_close` pone el fin y se puede repetir.
 *   3. Que `log_session_discard` borra… y **solo lo que está sin cerrar**. Ese
 *      cerrojo es lo único que separa «limpiar un descuido» de «borrar
 *      histórico», y vive en una sola línea de PL/pgSQL.
 *   4. Que `log_exercise_note` no la escribe el entrenador (0139; lo que sí hace
 *      el cliente está en `ajustes-del-cliente.test.js`).
 *
 * Y hay un quinto motivo, que es el que más veces ha costado dinero en este
 * repositorio: **el GRANT**. Una función sin permiso falla con un 403 que la
 * aplicación no distingue de «no hay nada», y eso ya pasó dos veces. Aquí se
 * llama con la sesión de un usuario de verdad, así que si faltara el GRANT esto
 * se pondría rojo.
 */
describe.skipIf(!configurado)('la sesión tiene principio y fin (0119)', () => {
  const creados = { entrenadores: [], clientes: [] };

  afterAll(() => limpia(creados));

  const serie = () => ({ kg: '', reps: '', rir: '', targetReps: '8-10', targetRir: '' });

  const programa = () => [
    {
      id: 'mc_0119',
      weekNumber: 1,
      sessionNumber: 1,
      date: '2026-09-01',
      days: [
        {
          dayName: 'Torso A',
          exercises: [
            { id: 'ex_press', name: 'Press banca', muscle: 'Pecho', sets: [serie(), serie()] },
          ],
        },
      ],
      sessions: [],
    },
  ];

  const monta = async (etiqueta) => {
    compruebaQueNoEsProduccion();
    const coach = await nuevoEntrenador(etiqueta);
    creados.entrenadores.push(coach);
    const clientId = await nuevoCliente(coach, 'Quien entrena');
    creados.clientes.push(clientId);

    const { error } = await admin()
      .from('workout_data')
      .insert({ client_id: clientId, microcycles: programa() });
    if (error) throw new Error(`No se pudo sembrar el programa: ${error.message}`);

    return { coach, clientId };
  };

  const anota = (coach, clientId, { setIndex = 0, field = 'reps', value = '8' } = {}) =>
    coach.db.rpc('log_session_set', {
      p_client: clientId,
      p_week: 1,
      p_session_id: 'ses_0119',
      p_date: '2026-09-07',
      p_day_name: 'Torso A',
      p_exercise_id: 'ex_press',
      p_set_index: setIndex,
      p_field: field,
      p_value: value,
    });

  /** La sesión tal como quedó en la fila. `null` si ya no está. */
  const sesionDe = async (clientId) => {
    const { data } = await admin()
      .from('workout_data')
      .select('microcycles')
      .eq('client_id', clientId)
      .single();
    return (data.microcycles[0].sessions || []).find((s) => s.id === 'ses_0119') || null;
  };

  it('la sesión nace con `startedAt`, y no se vuelve a estampar', async () => {
    const { coach, clientId } = await monta('principio');

    expect((await anota(coach, clientId)).error).toBeNull();
    const primera = await sesionDe(clientId);
    expect(primera.startedAt).toBeTruthy();
    expect(primera.endedAt).toBeUndefined();

    /* Segunda serie: el principio tiene que ser el MISMO. Si se reescribiera,
       la duración de cualquier sesión sería el tiempo entre la última serie y
       «Terminar» — o sea, cero. */
    expect((await anota(coach, clientId, { setIndex: 1 })).error).toBeNull();
    expect((await sesionDe(clientId)).startedAt).toBe(primera.startedAt);
  });

  it('«Terminar» pone el fin, y volver a terminar lo mueve', async () => {
    const { coach, clientId } = await monta('fin');
    await anota(coach, clientId);

    const cerrar = () =>
      coach.db.rpc('log_session_close', {
        p_client: clientId,
        p_week: 1,
        p_session_id: 'ses_0119',
      });

    expect((await cerrar()).error).toBeNull();
    const cerrada = await sesionDe(clientId);
    expect(cerrada.endedAt).toBeTruthy();

    /* El caso real: se termina, se cae en la cuenta de que faltaba la última
       serie, se anota y se vuelve a terminar. El fin es cuándo se dejó de
       entrenar, así que manda el último. */
    await anota(coach, clientId, { setIndex: 1 });
    expect((await cerrar()).error).toBeNull();
    expect((await sesionDe(clientId)).endedAt >= cerrada.endedAt).toBe(true);
  });

  it('no se puede cerrar una sesión que no existe', async () => {
    const { coach, clientId } = await monta('fantasma');
    const { error } = await coach.db.rpc('log_session_close', {
      p_client: clientId,
      p_week: 1,
      p_session_id: 'ses_inventada',
    });
    expect(error?.message).toMatch(/ninguna sesión/i);
  });

  it('«Descartar» borra la sesión a medias', async () => {
    const { coach, clientId } = await monta('descarte');
    await anota(coach, clientId);
    expect(await sesionDe(clientId)).not.toBeNull();

    const { error } = await coach.db.rpc('log_session_discard', {
      p_client: clientId,
      p_week: 1,
      p_session_id: 'ses_0119',
    });
    expect(error).toBeNull();
    expect(await sesionDe(clientId)).toBeNull();
  });

  it('y NO borra una que ya está cerrada: eso es histórico', async () => {
    const { coach, clientId } = await monta('cerrojo');
    await anota(coach, clientId);
    await coach.db.rpc('log_session_close', {
      p_client: clientId,
      p_week: 1,
      p_session_id: 'ses_0119',
    });

    const { error } = await coach.db.rpc('log_session_discard', {
      p_client: clientId,
      p_week: 1,
      p_session_id: 'ses_0119',
    });
    expect(error?.message).toMatch(/ya está cerrada/i);
    expect(await sesionDe(clientId)).not.toBeNull();
  });

  /* La nota del ejercicio es SOLO del cliente desde la 0139: su entrenador la
     lee y no la escribe. Lo que el cliente puede hacer con ella se prueba en
     `ajustes-del-cliente.test.js`, con su propia cuenta. */
  it('su entrenador no escribe la nota del ejercicio (0139)', async () => {
    const { coach, clientId } = await monta('nota');
    await anota(coach, clientId);

    const { error } = await coach.db.rpc('log_exercise_note', {
      p_client: clientId,
      p_week: 1,
      p_session_id: 'ses_0119',
      p_exercise_id: 'ex_press',
      p_note: 'Bajé el peso: dormí fatal.',
    });
    expect(error?.message).toMatch(/Solo el cliente/i);
    expect((await sesionDe(clientId)).entries[0].clientNote).toBeUndefined();
  });

  it('y ninguna de las tres se puede llamar sobre el cliente de otro', async () => {
    const { clientId } = await monta('ajeno');
    const intruso = await nuevoEntrenador('intruso-0119');
    creados.entrenadores.push(intruso);

    for (const [fn, args] of [
      ['log_session_close', {}],
      ['log_session_discard', {}],
      ['log_exercise_note', { p_exercise_id: 'ex_press', p_note: 'hola' }],
    ]) {
      const { error } = await intruso.db.rpc(fn, {
        p_client: clientId,
        p_week: 1,
        p_session_id: 'ses_0119',
        ...args,
      });
      expect(error?.message, fn).toMatch(/Sin permiso|Solo el cliente/i);
    }
  });
});
