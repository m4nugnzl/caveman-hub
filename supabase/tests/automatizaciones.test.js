import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  compruebaQueNoEsProduccion,
  configurado,
  limpia,
  nuevoCliente,
  nuevoEntrenador,
} from './harness';

/**
 * LA LLAVE DE LA OCURRENCIA, contra la base de verdad.
 *
 * ══ Por qué esta prueba y no una del dominio ═══════════════════════════════
 *
 * Porque la regla que aquí se comprueba **no vive en JavaScript y no puede
 * vivir ahí**. `domain/automatizaciones.test.js` ya prueba que el cálculo de la
 * ocurrencia es el correcto; lo que no puede probar —ni ninguna prueba que corra
 * en un solo proceso— es lo que pasa cuando dos navegadores llegan a la vez.
 *
 * El navegador solo puede comprobar lo que sabe, y lo que sabe es de hace un
 * segundo. Con dos pestañas abiertas, un reintento de red o dos disparadores
 * encadenados, los dos miran el mismo libro vacío y los dos escriben. La única
 * pieza que impide el doble disparo es el índice único de la 0116, y un índice
 * único solo se puede probar pidiéndole a Postgres que lo viole.
 *
 * Es exactamente el hueco que abrió este archivo de pruebas: la capa donde vive
 * la autorización de verdad —y aquí, la unicidad de verdad—.
 *
 * ══ Y con la clave ANÓNIMA ═════════════════════════════════════════════════
 *
 * La que tiene el navegador. Con la `service_role` todo esto pasaría siempre,
 * porque esa clave se salta las políticas: sería escribir una prueba que no
 * puede fallar. Y de paso se comprueba lo otro que este proyecto se ha comido
 * cuatro veces —una política sin su `GRANT`—, que no da un error visible sino un
 * dato falso: «esto no ha corrido» cuando sí corrió.
 */
describe.skipIf(!configurado)('las automatizaciones: la llave y la frontera', () => {
  let ana;
  let luis;
  let cliente;
  let automatizacion;

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    ana = await nuevoEntrenador('ana-auto');
    luis = await nuevoEntrenador('luis-auto');
    cliente = await nuevoCliente(ana, 'Cliente de Ana');

    const { data, error } = await ana.db
      .from('coach_automations')
      .insert({
        coach_id: ana.id,
        protocolo_id: 'proto_general',
        disparador: 'alta',
        pasos: [{ id: 'paso_1', que: 'pide', dia: 0, titulo: 'Analítica' }],
      })
      .select()
      .single();
    if (error) throw new Error(`No se pudo crear la automatización: ${error.message}`);
    automatizacion = data.id;
  }, 60000);

  afterAll(async () => {
    await limpia({ entrenadores: [ana, luis], clientes: [cliente] });
  }, 60000);

  // ── La llave ─────────────────────────────────────────────────────────────

  const corrida = (extra = {}) => ({
    client_id: cliente,
    automation_id: automatizacion,
    paso_id: 'paso_1',
    ocurrencia: 'once',
    ...extra,
  });

  it('la misma ocurrencia dos veces NO entra', async () => {
    const primera = await ana.db.from('automation_runs').insert(corrida()).select();
    expect(primera.error).toBeNull();
    expect(primera.data).toHaveLength(1);

    const segunda = await ana.db.from('automation_runs').insert(corrida()).select();
    /* 23505: violación de unicidad. Es lo que tiene que pasar, y es el motivo
       entero de que la tabla exista. */
    expect(segunda.error?.code).toBe('23505');
  });

  it('y con ON CONFLICT DO NOTHING devuelve CERO filas, que es «lo hizo otro»', async () => {
    /*
      Es como escribe `useAutomatizaciones`: pide vez, y si no le toca se retira
      sin escribir nada. Que devuelva una lista vacía en vez de un error es lo
      que permite que el repaso no se pare ni avise por algo que está bien.
    */
    const { data, error } = await ana.db
      .from('automation_runs')
      .upsert(corrida(), {
        onConflict: 'client_id,automation_id,paso_id,ocurrencia',
        ignoreDuplicates: true,
      })
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('otra semana es otra vez: la misma automatización vuelve a correr', async () => {
    const w37 = await ana.db.from('automation_runs').insert(corrida({ ocurrencia: '2026-W37' })).select();
    const w38 = await ana.db.from('automation_runs').insert(corrida({ ocurrencia: '2026-W38' })).select();
    expect(w37.error).toBeNull();
    expect(w38.error).toBeNull();
    /* Si la llave fuera solo (cliente, automatización, paso), lo semanal correría
       una vez en la vida — que es el fallo simétrico del doble disparo y tan
       silencioso como él. */
    expect(w38.data).toHaveLength(1);
  });

  it('otro paso de la misma corrida entra, aunque sea la misma ocurrencia', async () => {
    const { data, error } = await ana.db
      .from('automation_runs')
      .insert(corrida({ paso_id: 'paso_2' }))
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  // ── La frontera ──────────────────────────────────────────────────────────

  it('la automatización de otro no se ve', async () => {
    const { data, error } = await luis.db.from('coach_automations').select('id');
    /* RLS no da error al leer: FILTRA. Lo que se comprueba es que la lista de
       Luis no la contiene, no que le prohíban mirar. */
    expect(error).toBeNull();
    expect((data || []).map((a) => a.id)).not.toContain(automatizacion);
  });

  it('el libro de un cliente ajeno no se lee ni se escribe', async () => {
    const leer = await luis.db.from('automation_runs').select('id').eq('client_id', cliente);
    expect(leer.error).toBeNull();
    expect(leer.data).toEqual([]);

    const escribir = await luis.db.from('automation_runs').insert(corrida({ ocurrencia: 'robada' }));
    expect(escribir.error).not.toBeNull();
  });

  it('y el GRANT está: la tabla se puede mirar, no solo sus filas', async () => {
    /*
      Sin `GRANT`, la política no llega a evaluarse y PostgREST devuelve 42501.
      Esta comprobación parece la misma que la de arriba y no lo es: allí se mira
      que el filtro funcione, aquí que la puerta esté abierta. Este proyecto se ha
      comido cuatro veces el 403 invisible, y el síntoma nunca fue un error: fue
      una lista vacía que parecía verdad.
    */
    const { error } = await ana.db.from('automation_runs').select('id').limit(1);
    expect(error?.code).not.toBe('42501');
    expect(error).toBeNull();
  });

  it('borrar la automatización se lleva su libro', async () => {
    await ana.db.from('coach_automations').delete().eq('id', automatizacion);
    const { data, error } = await ana.db
      .from('automation_runs')
      .select('id')
      .eq('automation_id', automatizacion);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
