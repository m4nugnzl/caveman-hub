import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  admin,
  compruebaQueNoEsProduccion,
  configurado,
  limpia,
  nuevoCliente,
  nuevoEntrenador,
} from './harness';

/**
 * `exercise_sheets()`: la ficha del ejercicio que llega al cliente (0100).
 *
 * ══ Por qué esta función necesita una prueba de verdad ══════════════════════
 *
 * Porque es la pieza que **se salta la política de equipo a propósito**. Las de
 * `exercises` son de equipo (0027), y esta función existe justo para que un
 * cliente pueda leer tres columnas de esa tabla sin poder leer la tabla. Todo lo
 * que la acota —quién puede llamarla, con qué cliente, y qué filas devuelve— vive
 * dentro de un `SECURITY DEFINER`, o sea fuera del alcance de las pruebas del
 * dominio.
 *
 * Y el fallo que hay que descartar es el peor de los dos posibles: que devuelva
 * la biblioteca entera, o la de otra cartera.
 *
 * ── Qué se monta y con qué claves ──────────────────────────────────────────
 * El montaje va con la `service_role` a propósito: lo que se prueba es la
 * LECTURA, y hacer el alta con la sesión del entrenador ataría la prueba al
 * estado de su suscripción (`team_write_allowed`). Las comprobaciones, en
 * cambio, van con sesiones de verdad y clave anónima — con la `service_role` todo
 * pasaría siempre, porque esa clave se salta las políticas.
 */
describe.skipIf(!configurado)('la ficha del ejercicio del cliente', () => {
  const CON_FICHA = `Press de prueba ${Date.now()}`;
  const SIN_FICHA = `Prensa de prueba ${Date.now()}`;
  const FUERA_DEL_PLAN = `Curl de prueba ${Date.now()}`;

  let ana;
  let luis;
  let clienteDeAna;
  let equipoDeAna;

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    ana = await nuevoEntrenador('ana-ficha');
    luis = await nuevoEntrenador('luis-ficha');
    clienteDeAna = await nuevoCliente(ana, 'Cliente de Ana');

    const membresia = await ana.db.from('team_members').select('team_id').limit(1);
    equipoDeAna = membresia.data?.[0]?.team_id || null;

    const sa = admin();

    /* Tres ejercicios en la biblioteca de Ana, para poder distinguir los tres
       casos que la función tiene que separar. */
    await sa.from('exercises').insert([
      {
        coach_id: ana.id,
        team_id: equipoDeAna,
        name: CON_FICHA,
        muscle_group: 'Pecho',
        video_url: 'https://youtu.be/aaaaaaaaaaa',
        cue: 'Que no rebote',
      },
      // En el plan, pero sin vídeo y sin pautas: no hay ficha que abrir.
      { coach_id: ana.id, team_id: equipoDeAna, name: SIN_FICHA, muscle_group: 'Cuádriceps' },
      // Con ficha, pero este cliente no lo entrena.
      {
        coach_id: ana.id,
        team_id: equipoDeAna,
        name: FUERA_DEL_PLAN,
        muscle_group: 'Bíceps',
        video_url: 'https://youtu.be/bbbbbbbbbbb',
        cue: 'Sin balanceo',
      },
    ]);

    /* Y el plan del cliente, con la forma que guarda la aplicación: el ejercicio
       vive en `microcycles[].days[].exercises[]`. */
    await sa.from('workout_data').insert({
      client_id: clienteDeAna,
      microcycles: [
        {
          id: 'mc-prueba',
          weekNumber: 1,
          days: [
            {
              dayName: 'Empuje',
              exercises: [
                { id: 'ex-1', name: CON_FICHA, sets: [] },
                { id: 'ex-2', name: SIN_FICHA, sets: [] },
              ],
            },
          ],
          sessions: [],
        },
      ],
    });
  }, 60000);

  afterAll(async () => {
    const sa = admin();
    for (const name of [CON_FICHA, SIN_FICHA, FUERA_DEL_PLAN]) {
      await sa.from('exercises').delete().eq('name', name);
    }
    await limpia({ entrenadores: [ana, luis], clientes: [clienteDeAna] });
  }, 60000);

  it('devuelve la ficha de un ejercicio del plan, con su vídeo y sus pautas', async () => {
    const { data, error } = await ana.db.rpc('exercise_sheets', { target: clienteDeAna });

    expect(error).toBeNull();
    const fila = (data || []).find((f) => f.exercise === CON_FICHA);
    expect(fila).toBeTruthy();
    expect(fila.video_url).toBe('https://youtu.be/aaaaaaaaaaa');
    expect(fila.cue).toBe('Que no rebote');
  });

  /*
    Las dos exclusiones son lo que mantiene la respuesta pequeña, y son la
    diferencia entre esta función y ensanchar la política: sin ellas, el cliente
    recibiría la biblioteca entera.
  */
  it('no devuelve lo que no está en su plan', async () => {
    const { data, error } = await ana.db.rpc('exercise_sheets', { target: clienteDeAna });

    /* El `toBeNull` va ANTES del `not.toContain`, y no es ceremonia: sin
       función, `data` llega nulo y «no contiene» se cumple sola. La prueba
       pasaría en verde justamente cuando nada funciona. */
    expect(error).toBeNull();
    expect((data || []).map((f) => f.exercise)).not.toContain(FUERA_DEL_PLAN);
  });

  it('no devuelve lo que está en el plan pero no tiene nada que enseñar', async () => {
    const { data, error } = await ana.db.rpc('exercise_sheets', { target: clienteDeAna });

    expect(error).toBeNull();
    expect((data || []).map((f) => f.exercise)).not.toContain(SIN_FICHA);
  });

  /*
    Y aquí falla EN VOZ ALTA, que es una decisión: devolver la lista vacía sin
    permiso sería el «403 invisible» —la rutina aparecería sin fichas y nadie
    sabría si es que no hay vídeos o que no se puede leer—.
  */
  it('el cliente de otra cartera no se puede leer, y se dice', async () => {
    const { data, error } = await luis.db.rpc('exercise_sheets', { target: clienteDeAna });

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/permiso/i);
    expect(data).toBeNull();
  });

  /*
    Con el objetivo en NULO, la función resuelve «el cliente que soy» por
    `client_profile_id`. Un entrenador no es cliente de nadie, así que no le toca
    ninguna fila — y eso NO es un error: es un entrenador que todavía no ha
    abierto a nadie, y la pantalla se pinta igual.

    Y se manda `target: null` en vez de `{}` por lo mismo que lo hace la
    aplicación: PostgREST resuelve por nombre de parámetro y con `{}` busca una
    versión sin parámetros, que no existe.
  */
  it('con el objetivo en nulo y sin ser cliente, cero filas y ningún error', async () => {
    const { data, error } = await ana.db.rpc('exercise_sheets', { target: null });

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
