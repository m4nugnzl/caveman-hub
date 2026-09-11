import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  compruebaQueNoEsProduccion,
  configurado,
  limpia,
  nuevoCliente,
  nuevoEntrenador,
} from './harness';

/**
 * EL MOTOR 2, contra la base de verdad.
 *
 * ══ Por qué esta prueba no se puede escribir en el dominio ═════════════════
 *
 * Porque el motor 2 **no está en JavaScript**. Lo que reparte cuando un cliente
 * contesta o se pesa es una función `SECURITY DEFINER` colgada de un disparador
 * de tabla (migración 0117), y de eso no hay ni una línea en `domain/`. Un fallo
 * ahí no lo ve el linter, ni el build, ni las 33 pruebas de
 * `domain/automatizaciones.test.js`: el síntoma sería que alguien contesta su
 * cuestionario y no le llega lo que el entrenador le prometió — en silencio, y
 * meses.
 *
 * Es el mismo hueco que abrió `supabase/tests/`: la capa donde viven la
 * autorización y las funciones de Postgres, que es la única que no tenía red.
 *
 * ══ Lo que se comprueba, y por qué cada una ════════════════════════════════
 *
 *   1. Que **dispara**: contestar escribe el apunte y la acción.
 *   2. Que **no dispara dos veces**: corregir lo contestado no vuelve a mandar.
 *      La `ocurrencia` es el id de la acción entregada, así que esto es cierto
 *      para siempre y sin ninguna cuenta.
 *   3. Que **acota**: una automatización apuntada a un formulario no salta con
 *      otra cosa. Sin esto, «cuando conteste su alta, mándale el vídeo» se lo
 *      mandaría también con cada check-in.
 *   4. Que **el pasado no se reparte**: un pesaje viejo —o anterior a la regla—
 *      no dispara nada. Es el §12.4, que ya costó ver seis vídeos salir
 *      fechados en marzo.
 *   5. Que **una entrega nunca se rompe por culpa de una automatización**: con
 *      un paso imposible, el cliente entrega igual.
 */
describe.skipIf(!configurado)('el motor 2: lo que dispara el cliente', () => {
  let ana;
  let cliente;

  /** Una automatización de Ana, en el protocolo que sus clientes llevan puesto. */
  const nuevaAutomatizacion = async (campos) => {
    const { data, error } = await ana.db
      .from('coach_automations')
      .insert({ coach_id: ana.id, protocolo_id: 'proto_general', ...campos })
      .select()
      .single();
    if (error) throw new Error(`No se pudo crear la automatización: ${error.message}`);
    return data.id;
  };

  /** Algo pendiente en la lista del cliente, como lo escribe «Mandar algo». */
  const nuevaAccion = async (extra = {}) => {
    const { data, error } = await ana.db
      .from('client_actions')
      .insert({
        envio_id: crypto.randomUUID(),
        client_id: cliente,
        tipo: 'form',
        title: 'Su alta',
        form_id: 'form_alta_x',
        schema: { elementos: [] },
        ...extra,
      })
      .select()
      .single();
    if (error) throw new Error(`No se pudo crear la acción: ${error.message}`);
    return data;
  };

  const corridas = async (ocurrencia) => {
    const { data, error } = await ana.db
      .from('automation_runs')
      .select('id, paso_id, action_id, event_id')
      .eq('ocurrencia', ocurrencia);
    expect(error).toBeNull();
    return data || [];
  };

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    ana = await nuevoEntrenador('ana-motor2');
    cliente = await nuevoCliente(ana, 'Cliente de Ana');
  }, 60000);

  afterAll(async () => {
    await limpia({ entrenadores: [ana], clientes: [cliente] });
  }, 60000);

  // ── 1. Que dispara ───────────────────────────────────────────────────────

  it('contestar algo escribe el apunte y lo que el paso diga', async () => {
    await nuevaAutomatizacion({
      disparador: 'contesta',
      pasos: [
        { id: 'p1', que: 'pide', dia: 0, titulo: 'La analítica' },
        { id: 'p2', que: 'video', dia: 3, titulo: 'Cómo medirte', enlace: 'https://x.test/v' },
        { id: 'p3', que: 'tarea', dia: 7, titulo: 'Repasar su primera semana' },
      ],
    });

    const accion = await nuevaAccion();
    const { error } = await ana.db.rpc('marcar_accion', { target: accion.id, answers: { q1: '7' } });
    expect(error).toBeNull();

    const libro = await corridas(accion.id);
    expect(libro).toHaveLength(3);

    /* Los dos que le llegan a él caen en `client_actions`; el «avísame» es tuyo
       y cae en tu agenda, marcado privado (0106). */
    expect(libro.filter((r) => r.action_id).length).toBe(2);
    expect(libro.filter((r) => r.event_id).length).toBe(1);

    /* Y ni uno a medias: aquí las tres escrituras van en la misma transacción,
       así que un apunte sin nada detrás no puede existir. */
    expect(libro.every((r) => r.action_id || r.event_id)).toBe(true);
  }, 60000);

  it('el desfase se cuenta desde el hecho, y en días', async () => {
    const { data } = await ana.db
      .from('client_actions')
      .select('title, due, tipo, link, schema')
      .eq('client_id', cliente)
      .eq('title', 'Cómo medirte')
      .single();

    const hoy = new Date();
    const esperado = new Date(hoy.getTime() + 3 * 86400000).toISOString().slice(0, 10);
    expect(data.due).toBe(esperado);
    expect(data.tipo).toBe('video');
    expect(data.link).toBe('https://x.test/v');
    /* La procedencia va congelada en el esquema: renombrar la automatización
       mañana no puede reescribir lo que salió hoy. */
    expect(data.schema.origen?.tipo).toBe('auto');
  }, 60000);

  it('la casilla que sale para ti es PRIVADA: el cliente no la ve', async () => {
    const { data } = await ana.db
      .from('client_events')
      .select('title, privada, kind')
      .eq('client_id', cliente)
      .eq('title', 'Repasar su primera semana')
      .single();
    expect(data.privada).toBe(true);
    expect(data.kind).toBe('note');
  }, 60000);

  // ── 2. Que no dispara dos veces ──────────────────────────────────────────

  it('corregir lo contestado NO vuelve a mandar nada', async () => {
    const accion = await nuevaAccion({ title: 'Otra cosa' });
    await ana.db.rpc('marcar_accion', { target: accion.id, answers: { q1: '1' } });
    const primera = await corridas(accion.id);

    await ana.db.rpc('marcar_accion', { target: accion.id, answers: { q1: '2' } });
    const segunda = await corridas(accion.id);

    /*
      `marcar_accion` conserva `submitted_at` con un COALESCE, así que la segunda
      vez `OLD` ya no está vacío y el disparador ni se asoma. Y aunque se asomara,
      la `ocurrencia` es el id de ESA acción: el índice único de la 0116 lo
      pararía igual. Dos cierres, y el de la base es el que cuenta.
    */
    expect(segunda).toHaveLength(primera.length);
  }, 60000);

  // ── 3. Que acota ─────────────────────────────────────────────────────────

  it('apuntada a un formulario, no salta con otro', async () => {
    await nuevaAutomatizacion({
      disparador: 'contesta',
      nombre: 'Solo con el alta',
      valor: { formId: 'form_alta_x' },
      pasos: [{ id: 'q1', que: 'pide', dia: 0, titulo: 'Solo tras el alta' }],
    });

    const suya = await nuevaAccion({ title: 'El alta', form_id: 'form_alta_x' });
    await ana.db.rpc('marcar_accion', { target: suya.id, answers: { a: '1' } });
    const conElAlta = await corridas(suya.id);
    expect(conElAlta.map((r) => r.paso_id)).toContain('q1');

    const otra = await nuevaAccion({ title: 'El check-in', form_id: 'form_semana_x' });
    await ana.db.rpc('marcar_accion', { target: otra.id, answers: { a: '1' } });
    const conOtra = await corridas(otra.id);
    expect(conOtra.map((r) => r.paso_id)).not.toContain('q1');
  }, 60000);

  it('y un vídeo abierto no es «te ha contestado»', async () => {
    const video = await nuevaAccion({
      title: 'Un vídeo cualquiera',
      tipo: 'video',
      link: 'https://x.test/otro',
      form_id: null,
    });
    await ana.db.rpc('marcar_accion', { target: video.id, answers: null });
    /* Abrirlo lo da por hecho —comparte columna y comparte función— pero es algo
       que le mandas tú, no algo que te entrega. Que el verbo diga la verdad es
       la mitad de este producto. */
    expect(await corridas(video.id)).toHaveLength(0);
  }, 60000);

  // ── 4. Que el pasado no se reparte ───────────────────────────────────────

  it('un pesaje de hoy dispara; uno de hace tres meses, no', async () => {
    await nuevaAutomatizacion({
      disparador: 'pesaje',
      pasos: [{ id: 'w1', que: 'pide', dia: 0, titulo: 'Mándame las fotos' }],
    });

    const hoy = new Date().toISOString().slice(0, 10);
    const viejo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

    const { error } = await ana.db.from('anthropometry').insert({
      client_id: cliente,
      history: [
        { id: 'anth_viejo', date: viejo, weight: 80 },
        { id: 'anth_hoy', date: hoy, weight: 79 },
      ],
    });
    expect(error).toBeNull();

    expect(await corridas('anth_hoy')).toHaveLength(1);
    /*
      El historial es un JSONB que se reescribe entero, así que cargar tres meses
      de golpe pasa por el disparador entero de una vez. Sin la ventana, eso
      serían noventa disparos — el §12.4 otra vez, y esta vez con el pasado de
      una persona convertido en deberes.
    */
    expect(await corridas('anth_viejo')).toHaveLength(0);
  }, 60000);

  it('volver a guardar el historial no dispara lo que ya estaba', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    await ana.db
      .from('anthropometry')
      .update({
        history: [
          { id: 'anth_hoy', date: hoy, weight: 78.5 },
          { id: 'anth_dos', date: hoy, weight: 78 },
        ],
      })
      .eq('client_id', cliente);

    /* Se compara contra `OLD.history` y no se cuenta el largo: un guardado puede
       añadir una entrada y corregir otra a la vez. */
    expect(await corridas('anth_hoy')).toHaveLength(1);
    expect(await corridas('anth_dos')).toHaveLength(1);
  }, 60000);

  // ── 5. Que nunca rompe la entrega ────────────────────────────────────────

  it('una automatización rota no impide que el cliente entregue', async () => {
    await nuevaAutomatizacion({
      disparador: 'contesta',
      nombre: 'La rota',
      pasos: [
        /* Un salto a algo que no es un uuid: revienta al convertirlo. */
        { id: 'r1', que: 'salta', dia: 0, saltaA: 'esto-no-es-un-uuid' },
      ],
    });

    const accion = await nuevaAccion({ title: 'Con una rota delante' });
    const { error } = await ana.db.rpc('marcar_accion', { target: accion.id, answers: { q: '1' } });

    /*
      Lo que se prueba no es que la rota corra: es que **el que está delante es
      el cliente**, y no puede quedarse sin poder entregar su check-in porque una
      regla del entrenador esté mal escrita.
    */
    expect(error).toBeNull();

    const { data } = await ana.db
      .from('client_actions')
      .select('submitted_at')
      .eq('id', accion.id)
      .single();
    expect(data.submitted_at).not.toBeNull();

    /* Y las sanas que había siguen corriendo con el mismo hecho. */
    expect((await corridas(accion.id)).length).toBeGreaterThan(0);
  }, 60000);
});
