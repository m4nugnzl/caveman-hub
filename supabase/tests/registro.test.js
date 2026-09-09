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
 * Anotar una serie CUANDO EL PLAN HA CAMBIADO POR DEBAJO.
 *
 * ══ El fallo que motiva este archivo ════════════════════════════════════════
 *
 * Una sesión se crea como una foto del plan de ese día: sus ejercicios y sus
 * series, en blanco. Y el plan cambia después —el entrenador añade un ejercicio
 * el martes, o una cuarta serie—, más aún desde que el plan vive en el bloque
 * (`0086`) y un solo gesto toca todas las semanas a la vez.
 *
 * `log_session_set` exigía que la sesión ya tuviera la entrada del ejercicio y
 * que la serie cupiera en las que esa foto trajo. El navegador, en cambio, crea
 * la entrada que falte y alarga las series. Resultado: el número aparecía en
 * pantalla, el servidor lo rechazaba con `P0001` —que ni se reintenta ni se
 * apunta— y al recargar volvía el valor viejo. Desde fuera: «lo cambio y se
 * queda como estaba».
 *
 * Esto es la frontera aplicación/base de datos, o sea justo donde el dominio
 * puro no llega: `withSessionSet` puede estar perfecto y la persona seguir sin
 * poder anotar. Ver la migración `0101`.
 */
describe.skipIf(!configurado)('registrar series contra un plan que cambia', () => {
  const creados = { entrenadores: [], clientes: [] };

  afterAll(() => limpia(creados));

  const serie = (targetReps = '8-10') => ({ kg: '', reps: '', rir: '', targetReps, targetRir: '' });

  const ejercicio = (id, name, series = 3) => ({
    id,
    name,
    muscle: 'Pecho',
    sets: Array.from({ length: series }, () => serie()),
  });

  /** El programa de partida: una semana, un día, un ejercicio de tres series. */
  const programa = (exercises) => [
    {
      id: 'mc_prueba',
      weekNumber: 1,
      sessionNumber: 1,
      date: '2026-09-01',
      days: [{ dayName: 'Torso A', exercises }],
      sessions: [],
    },
  ];

  const monta = async (etiqueta, exercises) => {
    compruebaQueNoEsProduccion();
    const coach = await nuevoEntrenador(etiqueta);
    creados.entrenadores.push(coach);
    const clientId = await nuevoCliente(coach, 'Quien entrena');
    creados.clientes.push(clientId);

    const { error } = await admin()
      .from('workout_data')
      .insert({ client_id: clientId, microcycles: programa(exercises) });
    if (error) throw new Error(`No se pudo sembrar el programa: ${error.message}`);

    return { coach, clientId };
  };

  const anota = (coach, clientId, { exerciseId, setIndex, field, value }) =>
    coach.db.rpc('log_session_set', {
      p_client: clientId,
      p_week: 1,
      p_session_id: 'ses_prueba',
      p_date: '2026-09-07',
      p_day_name: 'Torso A',
      p_exercise_id: exerciseId,
      p_set_index: setIndex,
      p_field: field,
      p_value: value,
    });

  /** Las series guardadas de un ejercicio, tal como quedaron en la fila. */
  const seriesDe = async (clientId, exerciseId) => {
    const { data } = await admin()
      .from('workout_data')
      .select('microcycles')
      .eq('client_id', clientId)
      .single();
    const sesion = (data.microcycles[0].sessions || []).find((s) => s.id === 'ses_prueba');
    return (sesion?.entries || []).find((e) => e.exerciseId === exerciseId)?.sets || null;
  };

  /** Cambia el PLAN del día sin tocar lo registrado, como hace el entrenador. */
  const cambiaElPlan = async (clientId, exercises) => {
    const sa = admin();
    const { data } = await sa
      .from('workout_data')
      .select('microcycles')
      .eq('client_id', clientId)
      .single();
    const micros = data.microcycles;
    micros[0].days[0].exercises = exercises;
    const { error } = await sa.from('workout_data').update({ microcycles: micros }).eq('client_id', clientId);
    if (error) throw new Error(`No se pudo cambiar el plan: ${error.message}`);
  };

  it('corregir un valor ya anotado lo deja corregido', async () => {
    const press = ejercicio('ex_press', 'Press banca');
    const { coach, clientId } = await monta('corrige', [press]);

    expect((await anota(coach, clientId, { exerciseId: 'ex_press', setIndex: 0, field: 'kg', value: '40' })).error).toBeNull();
    expect((await anota(coach, clientId, { exerciseId: 'ex_press', setIndex: 0, field: 'kg', value: '35' })).error).toBeNull();
    expect((await anota(coach, clientId, { exerciseId: 'ex_press', setIndex: 0, field: 'kg', value: '' })).error).toBeNull();

    const sets = await seriesDe(clientId, 'ex_press');
    expect(sets[0].kg).toBe('');
  });

  it('un ejercicio añadido al plan se puede anotar en una sesión ya empezada', async () => {
    const press = ejercicio('ex_press', 'Press banca');
    const { coach, clientId } = await monta('anadido', [press]);

    // La sesión nace aquí, con la foto del plan: solo el press.
    expect((await anota(coach, clientId, { exerciseId: 'ex_press', setIndex: 0, field: 'reps', value: '8' })).error).toBeNull();

    // El entrenador añade un ejercicio a la hoja, a mitad de bloque.
    await cambiaElPlan(clientId, [press, ejercicio('ex_fondos', 'Fondos')]);

    const res = await anota(coach, clientId, { exerciseId: 'ex_fondos', setIndex: 1, field: 'reps', value: '12' });
    expect(res.error, res.error?.message).toBeNull();

    expect((await seriesDe(clientId, 'ex_fondos'))[1].reps).toBe('12');
    // Y lo que ya estaba anotado sigue donde estaba.
    expect((await seriesDe(clientId, 'ex_press'))[0].reps).toBe('8');
  });

  it('una serie añadida al plan se puede anotar en una sesión ya empezada', async () => {
    const press = ejercicio('ex_press', 'Press banca', 3);
    const { coach, clientId } = await monta('serie', [press]);

    expect((await anota(coach, clientId, { exerciseId: 'ex_press', setIndex: 2, field: 'reps', value: '8' })).error).toBeNull();

    await cambiaElPlan(clientId, [ejercicio('ex_press', 'Press banca', 4)]);

    const res = await anota(coach, clientId, { exerciseId: 'ex_press', setIndex: 3, field: 'reps', value: '6' });
    expect(res.error, res.error?.message).toBeNull();

    const sets = await seriesDe(clientId, 'ex_press');
    expect(sets).toHaveLength(4);
    expect(sets[2].reps).toBe('8');
    expect(sets[3].reps).toBe('6');
  });

  it('sigue sin poderse anotar una serie que el plan no tiene', async () => {
    const press = ejercicio('ex_press', 'Press banca', 3);
    const { coach, clientId } = await monta('tope', [press]);

    const res = await anota(coach, clientId, { exerciseId: 'ex_press', setIndex: 3, field: 'reps', value: '8' });
    expect(res.error?.message || '').toContain('no existe');
  });

  it('sigue sin poderse anotar un ejercicio que no está en el plan', async () => {
    const press = ejercicio('ex_press', 'Press banca');
    const { coach, clientId } = await monta('ajeno', [press]);

    const res = await anota(coach, clientId, { exerciseId: 'ex_inventado', setIndex: 0, field: 'reps', value: '8' });
    expect(res.error?.message || '').toContain('no está programado');
  });

  it('renombrar el ejercicio actualiza el nombre que guarda la sesión', async () => {
    const press = ejercicio('ex_press', 'Press banca');
    const { coach, clientId } = await monta('renombra', [press]);

    expect((await anota(coach, clientId, { exerciseId: 'ex_press', setIndex: 0, field: 'reps', value: '8' })).error).toBeNull();

    await cambiaElPlan(clientId, [{ ...press, name: 'Press inclinado' }]);
    expect((await anota(coach, clientId, { exerciseId: 'ex_press', setIndex: 1, field: 'reps', value: '8' })).error).toBeNull();

    const { data } = await admin()
      .from('workout_data')
      .select('microcycles')
      .eq('client_id', clientId)
      .single();
    const entrada = data.microcycles[0].sessions[0].entries.find((e) => e.exerciseId === 'ex_press');
    expect(entrada.name).toBe('Press inclinado');
  });
});
