import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  compruebaQueNoEsProduccion,
  configurado,
  limpia,
  nuevoCliente,
  nuevoEntrenador,
} from './harness';

/**
 * La frontera de autorización: que un entrenador no pueda tocar al cliente de otro.
 *
 * ══ Por qué esto y no otra cosa ═════════════════════════════════════════════
 *
 * Es la única regla del producto cuyo fallo no se puede compensar después. Un
 * cálculo de tonelaje mal hecho se corrige y se recalcula; una fuga entre
 * carteras es una brecha de datos de salud —artículo 9 del RGPD— y ya ha
 * ocurrido.
 *
 * Y es justo la regla que NO tiene ninguna prueba, porque no vive en JavaScript:
 * vive en las políticas de RLS y en las funciones `SECURITY DEFINER`. El
 * proyecto decidió a propósito no duplicar los permisos en el cliente
 * (`auditoria.md` §4), lo cual es correcto — pero deja la regla entera fuera del
 * alcance de las pruebas del dominio.
 *
 * Se prueba con la clave ANÓNIMA y una sesión de verdad, que es exactamente lo
 * que tiene el navegador. Con la `service_role` todo esto pasaría siempre, porque
 * esa clave se salta las políticas: usarla aquí sería escribir una prueba que no
 * puede fallar.
 */
describe.skipIf(!configurado)('la frontera entre carteras', () => {
  let ana;
  let luis;
  let clienteDeAna;

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    ana = await nuevoEntrenador('ana');
    luis = await nuevoEntrenador('luis');
    clienteDeAna = await nuevoCliente(ana, 'Cliente de Ana');
  }, 60000);

  afterAll(async () => {
    await limpia({ entrenadores: [ana, luis], clientes: [clienteDeAna] });
  }, 60000);

  it('cada uno ve a los suyos', async () => {
    const mios = await ana.db.from('clients').select('id');
    expect(mios.error).toBeNull();
    expect(mios.data.map((c) => c.id)).toContain(clienteDeAna);
  });

  /*
    RLS no da un error al leer: FILTRA. Un `select` sobre la fila de otro no
    devuelve «prohibido», devuelve una lista vacía — y esa es exactamente la
    diferencia que hay que comprobar, porque un código que espere un error se
    creería a salvo mientras la fila viaja.
  */
  it('la cartera del otro no se lee: sale vacía, no da error', async () => {
    const ajenos = await luis.db.from('clients').select('id').eq('id', clienteDeAna);
    expect(ajenos.error).toBeNull();
    expect(ajenos.data).toEqual([]);
  });

  it('no se puede escribir en el cliente de otro', async () => {
    const intento = await luis.db
      .from('clients')
      .update({ name: 'Secuestrado' })
      .eq('id', clienteDeAna)
      .select('id');

    // O lo rechaza, o no afecta a ninguna fila. Lo que NO puede es cambiarlo.
    expect(intento.error ? true : intento.data.length === 0).toBe(true);

    const sigueIgual = await ana.db.from('clients').select('name').eq('id', clienteDeAna).single();
    expect(sigueIgual.data.name).toBe('Cliente de Ana');
  });

  it('no se puede borrar el cliente de otro', async () => {
    await luis.db.from('clients').delete().eq('id', clienteDeAna);
    const sigueAhi = await ana.db.from('clients').select('id').eq('id', clienteDeAna);
    expect(sigueAhi.data).toHaveLength(1);
  });

  it('los bloques de datos tampoco se cruzan', async () => {
    await ana.db.from('anthropometry').insert({ client_id: clienteDeAna, history: [] });
    const ajeno = await luis.db.from('anthropometry').select('client_id').eq('client_id', clienteDeAna);
    expect(ajeno.data).toEqual([]);
  });

  /*
    `app_can_write_client` es el portero de casi todas las `SECURITY DEFINER`
    —`create_review_link`, `create_review_url`, `mark_review_viewed`…—. Si esta
    contesta que sí a quien no debe, se cae la autorización de todas a la vez.
  */
  it('`app_can_write_client` dice que no sobre el cliente de otro', async () => {
    const mio = await ana.db.rpc('app_can_write_client', { target: clienteDeAna });
    const ajeno = await luis.db.rpc('app_can_write_client', { target: clienteDeAna });

    expect(mio.data).toBe(true);
    // O bien contesta `false`, o bien la función no es invocable desde fuera.
    expect(ajeno.error ? true : ajeno.data === false).toBe(true);
  });

  /*
    ══ La escalada de rol, que estuvo abierta ═════════════════════════════════

    La 0002 quiso cerrarla con `REVOKE UPDATE (role) ON profiles`, y eso **no
    hace nada** mientras exista el permiso de UPDATE sobre la TABLA: en Postgres
    el permiso de tabla cubre todas las columnas y un revoke de columna no puede
    restarle nada. No da error, no avisa, y queda escrito en la migración como si
    protegiera algo.

    Dejó de ser latente cuando `ensure_my_team` (0019/0037) empezó a mirar el
    rol: un cliente que se pusiera `coach` pasaba esa puerta y se auto-creaba un
    equipo con catorce días de prueba. Es exactamente lo que la 0002 escribió que
    pasaría —«en cuanto algo confíe en `role`, deja de serlo»— y nadie lo vio
    porque se daba por cerrado.

    Esta prueba mira la CONSECUENCIA y no el permiso: que el UPDATE no pase. Así
    da igual cómo se implemente la protección el día que se toque.
  */
  it('nadie puede ascenderse a entrenador escribiendo su propio rol', async () => {
    const intento = await ana.db
      .from('profiles')
      .update({ role: 'coach' })
      .eq('id', ana.id)
      .select('id');

    expect(intento.error, 'escribir `role` tiene que estar prohibido').not.toBeNull();
    expect(intento.error.code).toBe('42501'); // insufficient_privilege
  });

  it('pero sí puede escribir lo suyo que la aplicación usa', async () => {
    /* El contrapeso: si el arreglo se pasara de estricto, la plantilla del
       protocolo (0035) dejaría de guardarse y nadie lo notaría hasta usarla. */
    const guardado = await ana.db
      .from('profiles')
      .update({ preferences: { protocolo: { prueba: true } } })
      .eq('id', ana.id)
      .select('id');

    expect(guardado.error).toBeNull();
  });

  /*
    ══ Qué puede ejecutar alguien SIN SESIÓN ══════════════════════════════════

    Las migraciones protegen sus funciones con `REVOKE ALL ... FROM public`, y eso
    no le quita el permiso a `anon`: Supabase se lo concede explícitamente a toda
    función nueva con sus `ALTER DEFAULT PRIVILEGES`, y revocarle a PUBLIC no toca
    un permiso explícito. Durante mucho tiempo la lista de lo alcanzable sin
    sesión fue, en la práctica, «todas».

    No es una catástrofe porque las que importan se defienden solas —comprueban
    `auth.uid()` o llaman a `app_can_write_client`, y sin sesión eso es nulo—.
    Pero «no pasa nada porque además hay otra comprobación» es justo el
    razonamiento que conviene tener vigilado.

    Esta prueba fija las dos que NO se defendían solas y que la 0047 cerró. Si
    alguna vuelve a ser alcanzable, salta aquí y no en producción.
  */
  it('sin sesión no se puede sembrar la biblioteca de un equipo ajeno', async () => {
    const { anon } = await import('./harness');
    const sinSesion = anon();
    const { error } = await sinSesion.rpc('seed_team_library', {
      target_team: '00000000-0000-0000-0000-000000000000',
    });
    expect(error, 'escribir sin identificarse no debería ser posible').not.toBeNull();
  });

  it('sin sesión no se puede saber si un equipo está al corriente de pago', async () => {
    const { anon } = await import('./harness');
    const sinSesion = anon();
    const { error } = await sinSesion.rpc('team_write_allowed', {
      target_team: '00000000-0000-0000-0000-000000000000',
    });
    expect(error).not.toBeNull();
  });

  it('sin sesión no se ve absolutamente nada', async () => {
    const { anon } = await import('./harness');
    const sinSesion = anon();
    const nada = await sinSesion.from('clients').select('id');
    expect(nada.error ? true : nada.data.length === 0).toBe(true);
  });
});
