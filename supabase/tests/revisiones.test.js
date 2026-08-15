import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  compruebaQueNoEsProduccion,
  configurado,
  limpia,
  nuevoCliente,
  nuevoEntrenador,
} from './harness';

/**
 * Los enlaces de revisión: la función que estuvo rota meses sin que nadie lo viera.
 *
 * ══ El fallo que motiva este archivo ════════════════════════════════════════
 *
 * La migración 0043 documenta que `create_review_link` y `create_review_url`
 * generaban su token con `gen_random_bytes`, que es de la extensión `pgcrypto` y
 * vive en el esquema `extensions`. Como las dos se declaran con
 * `SET search_path = public` —lo correcto para una `SECURITY DEFINER`—, Postgres
 * contestaba que la función no existe.
 *
 * Consecuencia: **no se pudo crear nunca un enlace de revisión**, ni de un vídeo
 * grabado en la aplicación ni de uno de YouTube. Desde la 0011.
 *
 * Nada lo detectó porque nada ejecuta las funciones de Postgres. Un solo caso
 * —«crear un enlace devuelve un token»— habría convertido meses de silencio en un
 * fallo en rojo el mismo día. Eso es lo que hay aquí.
 *
 * La 0043 incluso escribió la comprobación al final, en su sección «Comprobarlo».
 * Esto es esa comprobación, automatizada.
 */
describe.skipIf(!configurado)('enlaces de revisión', () => {
  let ana;
  let luis;
  let cliente;

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    ana = await nuevoEntrenador('ana-rev');
    luis = await nuevoEntrenador('luis-rev');
    cliente = await nuevoCliente(ana, 'Cliente con revisiones');
  }, 60000);

  afterAll(async () => {
    await limpia({ entrenadores: [ana, luis], clientes: [cliente] });
  }, 60000);

  /* El caso exacto que fallaba: que la función llegue a devolver un token. */
  it('crear un enlace de YouTube devuelve un token', async () => {
    const { data, error } = await ana.db.rpc('create_review_url', {
      target: cliente,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      link_title: 'Revisión de prueba',
    });

    expect(error).toBeNull();
    expect(typeof data).toBe('string');
    // Dos UUID sin guiones: 64 caracteres hexadecimales (migración 0043).
    expect(data).toMatch(/^[0-9a-f]{64}$/);
  });

  it('dos enlaces nunca comparten token', async () => {
    const uno = await ana.db.rpc('create_review_url', {
      target: cliente,
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    });
    const otro = await ana.db.rpc('create_review_url', {
      target: cliente,
      url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
    });
    expect(uno.data).not.toBe(otro.data);
  });

  /*
    El dominio se comprueba en el servidor y no solo en `domain/video.js`: la URL
    acaba dentro de un `<iframe>` en la pantalla del cliente, y la comprobación
    del navegador se salta llamando a la API a mano.
  */
  it('rechaza cualquier dirección que no sea YouTube o Loom', async () => {
    for (const url of [
      'https://malo.example/video',
      'http://www.youtube.com/watch?v=x',           // http, no https
      'https://malo.example/?x=youtube.com/watch',  // el `LIKE '%youtube%'` que colaba
      'javascript:alert(1)',
    ]) {
      const { error } = await ana.db.rpc('create_review_url', { target: cliente, url });
      expect(error, `debería rechazar ${url}`).not.toBeNull();
    }
  });

  it('rechaza un enlace absurdamente largo', async () => {
    const largo = `https://www.youtube.com/watch?v=${'a'.repeat(600)}`;
    const { error } = await ana.db.rpc('create_review_url', { target: cliente, url: largo });
    expect(error).not.toBeNull();
  });

  it('no se puede crear una revisión sobre el cliente de otro', async () => {
    const { error } = await luis.db.rpc('create_review_url', {
      target: cliente,
      url: 'https://www.youtube.com/watch?v=ccccccccccc',
    });
    expect(error).not.toBeNull();
  });

  /*
    `create_review_link` comprueba que la RUTA sea del cliente. Sin eso se podría
    crear un enlace público al archivo de otra persona — y esos enlaces se abren
    SIN sesión, así que sería una fuga de fotos corporales con URL permanente.
  */
  it('no se puede enlazar una ruta que no es de ese cliente', async () => {
    const { error } = await ana.db.rpc('create_review_link', {
      target: cliente,
      path: 'otro-cliente-id/photos/week-1/foto.jpg',
    });
    expect(error).not.toBeNull();
  });

  /*
    Esta prueba estuvo en verde sin protegerse de nada.

    La 0043 le hizo `REVOKE ALL ... FROM public` a esta función, y eso NO le quita
    el permiso a `anon` ni a `authenticated`: Supabase se lo concede
    explícitamente a los dos con sus `ALTER DEFAULT PRIVILEGES` sobre funciones,
    y revocarle a PUBLIC no toca un permiso explícito. Es el mismo patrón inerte
    que el `REVOKE UPDATE (role)` de la 0002.

    Lo cierra la 0047, revocando a los roles por su nombre.
  */
  it('`new_review_token` no es invocable desde el navegador', async () => {
    const { error } = await ana.db.rpc('new_review_token');
    expect(error, 'con sesión tampoco: la usan las otras dos por dentro').not.toBeNull();
  });

  it('el cliente marca su revisión como vista y sube el contador', async () => {
    const creada = await ana.db.rpc('create_review_url', {
      target: cliente,
      url: 'https://www.loom.com/share/0123456789abcdef0123456789abcdef',
    });
    expect(creada.error).toBeNull();

    const fila = await ana.db
      .from('review_links')
      .select('id, view_count')
      .eq('token', creada.data)
      .single();
    expect(fila.error).toBeNull();

    const marcada = await ana.db.rpc('mark_review_viewed', { link: fila.data.id });
    expect(marcada.error).toBeNull();

    const despues = await ana.db
      .from('review_links')
      .select('view_count, first_viewed_at')
      .eq('id', fila.data.id)
      .single();
    expect(despues.data.view_count).toBe((fila.data.view_count || 0) + 1);
    expect(despues.data.first_viewed_at).not.toBeNull();
  });

  it('un extraño no puede marcar como vista la revisión de otro', async () => {
    const creada = await ana.db.rpc('create_review_url', {
      target: cliente,
      url: 'https://www.youtube.com/watch?v=ddddddddddd',
    });
    const fila = await ana.db.from('review_links').select('id').eq('token', creada.data).single();

    const { error } = await luis.db.rpc('mark_review_viewed', { link: fila.data.id });
    expect(error).not.toBeNull();
  });
});
