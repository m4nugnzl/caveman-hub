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
 * EL MOTOR 3, contra la base de verdad.
 *
 * ══ Por qué esta prueba no se puede escribir en el dominio ═════════════════
 *
 * Por lo mismo que la del motor 2 y un poco más: aquí no hay ni una línea de
 * JavaScript. `correr_el_latido()` (migración 0118) lee de tres JSONB distintos,
 * resuelve el protocolo de cada cliente y reparte, y lo llama un cron desde
 * Cloudflare. El linter no lo ve, el build no lo ve y las pruebas de `domain/`
 * no lo ven.
 *
 * ══ Lo que se comprueba, y por qué cada una ════════════════════════════════
 *
 *   1. Que **dispara** a quien lleva callado más de la cuenta, y que cuando no
 *      hay rastro cuenta desde el alta —el que nunca arranca es justo el que hay
 *      que atender—.
 *   2. Que **no avisa todas las mañanas**, que es el fallo entero de este motor.
 *      La `ocurrencia` nombra el SILENCIO, no el día.
 *   3. Que **un silencio nuevo es otro aviso**: si vuelve y se vuelve a ir, se
 *      avisa otra vez. Es la otra mitad de lo mismo, y sin ella la regla solo
 *      valdría una vez en la vida.
 *   4. Que **cada regla mira lo suyo**: dos silencios distintos en el mismo
 *      protocolo no se mandan lo del otro. Es la razón de que el latido llame a
 *      `app_correr_una_automatizacion` y no al motor 2.
 *   5. Que **a quien está en pausa no se le manda nada**.
 *   6. Que **no lo puede llamar nadie con sesión**: reparte a la cartera de
 *      todos los entrenadores a la vez.
 */
describe.skipIf(!configurado)('el motor 3: el latido', () => {
  let ana;
  let cliente;
  let pausado;
  const sa = admin();

  /** Hace los días que sea que esta persona empezó. */
  const altaHace = async (id, dias) => {
    const fecha = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    const { error } = await ana.db.from('clients').update({ start_date: fecha }).eq('id', id);
    if (error) throw new Error(`No se pudo mover el alta: ${error.message}`);
    return fecha;
  };

  const nuevaAutomatizacion = async (campos) => {
    const { data, error } = await ana.db
      .from('coach_automations')
      .insert({ coach_id: ana.id, protocolo_id: 'proto_general', disparador: 'silencio', ...campos })
      .select()
      .single();
    if (error) throw new Error(`No se pudo crear la automatización: ${error.message}`);
    return data.id;
  };

  /** El latido lo llama el reloj con la clave de servicio, nunca un navegador. */
  const latir = async () => {
    const { data, error } = await sa.rpc('correr_el_latido');
    expect(error).toBeNull();
    return data;
  };

  /** Una sesión anotada hace N días, donde de verdad vive: su microciclo. */
  const entrenoHace = async (dias) => {
    const fecha = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    const microcycles = [
      { id: 'm1', weekNumber: 1, sessions: [{ id: 's1', date: fecha, entries: [] }] },
    ];
    const { error } = await ana.db
      .from('workout_data')
      .upsert({ client_id: cliente, microcycles }, { onConflict: 'client_id' });
    if (error) throw new Error(`No se pudo anotar la sesión: ${error.message}`);
    return fecha;
  };

  const corridas = async (ocurrencia) => {
    const { data, error } = await ana.db
      .from('automation_runs')
      .select('id, automation_id, paso_id, action_id')
      .eq('ocurrencia', ocurrencia);
    expect(error).toBeNull();
    return data || [];
  };

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    ana = await nuevoEntrenador('ana-latido');
    cliente = await nuevoCliente(ana, 'Cliente callado');
    pausado = await nuevoCliente(ana, 'Cliente en pausa');
  }, 60000);

  afterAll(async () => {
    await limpia({ entrenadores: [ana], clientes: [cliente, pausado] });
  }, 60000);

  // ── 1. Que dispara, y desde el alta cuando no hay rastro ─────────────────

  it('sin una sola sesión, la racha se cuenta desde su alta', async () => {
    const alta = await altaHace(cliente, 60);
    await altaHace(pausado, 60);
    await ana.db.from('clients').update({ status: 'paused' }).eq('id', pausado);

    await nuevaAutomatizacion({
      nombre: 'El que no arranca',
      valor: { que: 'entrenar', dias: 10 },
      pasos: [
        { id: 'e1', que: 'pide', dia: 0, titulo: '¿Ha pasado algo?' },
        { id: 'e2', que: 'tarea', dia: 2, titulo: 'Llamarle' },
      ],
    });

    await latir();

    const libro = await corridas(`sin:entrenar:${alta}`);
    expect(libro.map((r) => r.paso_id).sort()).toEqual(['e1', 'e2']);

    /* Y lo que le llega es de hoy: el disparo es la mañana en que se nota, no el
       día en que se cumplió el plazo. */
    const { data } = await ana.db
      .from('client_actions')
      .select('due, title, schema')
      .eq('client_id', cliente)
      .eq('title', '¿Ha pasado algo?')
      .single();
    expect(data.due).toBe(new Date().toISOString().slice(0, 10));
    expect(data.schema.origen?.nombre).toBe('El que no arranca');
  }, 60000);

  // ── 2. Que no avisa todas las mañanas ────────────────────────────────────

  it('el latido del día siguiente no vuelve a mandar lo mismo', async () => {
    const alta = await altaHace(cliente, 60);
    const antes = await corridas(`sin:entrenar:${alta}`);

    await latir();
    await latir();

    /*
      La ocurrencia nombra el SILENCIO —«la racha que empieza el día que entrenó
      por última vez»—, así que mientras siga callado la clave no cambia y el
      índice único de la 0116 rebota. Sin esto, quien lleva veinte días sin
      entrenar recibiría el mismo recado veinte mañanas seguidas.
    */
    expect(await corridas(`sin:entrenar:${alta}`)).toHaveLength(antes.length);
  }, 60000);

  // ── 3. Que un silencio nuevo sí es otro aviso ────────────────────────────

  it('si entrena y se vuelve a callar, se avisa otra vez', async () => {
    const fecha = await entrenoHace(12);

    await latir();

    /* Otra racha, otra clave, otro aviso: la referencia ya no es su alta sino su
       última sesión. */
    expect((await corridas(`sin:entrenar:${fecha}`)).length).toBe(2);
  }, 60000);

  it('y mientras entrene, no pasa nada', async () => {
    const fecha = await entrenoHace(1);
    await latir();
    expect(await corridas(`sin:entrenar:${fecha}`)).toHaveLength(0);
  }, 60000);

  // ── 4. Que cada regla mira lo suyo ───────────────────────────────────────

  it('dos silencios del mismo protocolo no se mandan lo del otro', async () => {
    const alta = await altaHace(cliente, 60);
    const suya = await nuevaAutomatizacion({
      nombre: 'Sin pesarse',
      valor: { que: 'pesarse', dias: 30 },
      pasos: [{ id: 'p1', que: 'pide', dia: 0, titulo: 'Súbete a la báscula' }],
    });

    await latir();

    /* El cliente entrenó ayer, así que la de «sin entrenar» no toca. La de
       «sin pesarse» sí: no tiene ni un peso, así que cuenta desde su alta. */
    const libro = await corridas(`sin:pesarse:${alta}`);
    expect(libro).toHaveLength(1);
    expect(libro[0].paso_id).toBe('p1');
    expect(libro[0].automation_id).toBe(suya);
  }, 60000);

  // ── 5. Que a quien está en pausa no se le manda nada ─────────────────────

  it('el que está en pausa no recibe nada', async () => {
    const { data, error } = await ana.db
      .from('automation_runs')
      .select('id')
      .eq('client_id', pausado);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  }, 60000);

  // ── 6. Que no lo puede llamar nadie con sesión ───────────────────────────

  it('un entrenador no puede hacer latir la base entera', async () => {
    const { error } = await ana.db.rpc('correr_el_latido');
    /*
      Esto reparte a la cartera de TODOS los entrenadores, y corre con
      `SECURITY DEFINER`. No es de un usuario: es del reloj. La llave la tiene la
      función `latido` y nadie más.
    */
    expect(error).not.toBeNull();
    expect(error.code).toBe('42501');
  }, 60000);
});
