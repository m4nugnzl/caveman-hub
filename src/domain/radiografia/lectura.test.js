import { describe, expect, it, vi } from 'vitest';

import { leerTabla, leerTodo, PAGINA } from './lectura.js';

/**
 * Un cliente de mentira que se comporta como PostgREST: nunca devuelve más de
 * `PAGINA` filas y no dice que haya más.
 */
const clienteCon = (porTabla) => ({
  from: (tabla) => ({
    select: () => {
      /* Como el de verdad: `range` y `gte` devuelven el constructor, y solo al
         esperarlo (`then`) se resuelve la consulta. Un doble que devolviera una
         promesa desde `range` no dejaría encadenar `gte` — y ese es justo el
         orden en que lo llama `leerTabla`. */
      const query = {
        _desde: null,
        _rango: [0, PAGINA - 1],
        gte(_columna, valor) {
          query._desde = valor;
          return query;
        },
        range(desde, hasta) {
          query._rango = [desde, hasta];
          return query;
        },
        then(resolve, reject) {
          const respuesta = porTabla[tabla];
          if (respuesta?.error) {
            return Promise.resolve({ data: null, error: respuesta.error }).then(resolve, reject);
          }

          let filas = respuesta || [];
          if (query._desde) filas = filas.filter((f) => f.at >= query._desde);

          const [desde, hasta] = query._rango;
          return Promise.resolve({ data: filas.slice(desde, hasta + 1), error: null }).then(
            resolve,
            reject
          );
        },
      };
      return query;
    },
  }),
});

const filas = (n) => Array.from({ length: n }, (_, i) => ({ i }));

describe('leerTabla', () => {
  it('devuelve las filas cuando caben en una página', async () => {
    const res = await leerTabla(clienteCon({ clients: filas(3) }), 'clients');
    expect(res.rows).toHaveLength(3);
  });

  /* ══ La prueba que justifica el archivo entero ═══════════════════════════
     PostgREST corta en 1000 y no avisa. Un informe truncado tiene el mismo
     aspecto que uno completo: las cifras salen y los porcentajes cuadran. */
  it('sigue pidiendo más allá del millar', async () => {
    const res = await leerTabla(clienteCon({ product_events: filas(2500) }), 'product_events');
    expect(res.rows).toHaveLength(2500);
  });

  it('con una página EXACTA vuelve a preguntar', async () => {
    /* Mil filas justas es indistinguible de «mil y hay más» desde aquí. Parar
       ahí sería quedarse corto justo en el caso que no se puede detectar. */
    const res = await leerTabla(clienteCon({ product_events: filas(PAGINA) }), 'product_events');
    expect(res.rows).toHaveLength(PAGINA);
  });

  it('distingue una tabla que no existe de una que no se ha podido leer', async () => {
    const noExiste = await leerTabla(
      clienteCon({ videos: { error: { message: 'relation "videos" does not exist' } } }),
      'videos'
    );
    expect(noExiste).toEqual({ falta: true });

    const noSePudo = await leerTabla(
      clienteCon({ clients: { error: { message: 'permission denied' } } }),
      'clients'
    );
    expect(noSePudo).toEqual({ error: 'permission denied' });
  });

  it('acota por fecha cuando se le da una ventana', async () => {
    const eventos = [{ at: '2026-08-01' }, { at: '2026-08-20' }];
    const res = await leerTabla(clienteCon({ product_events: eventos }), 'product_events', {
      desde: '2026-08-10',
    });
    expect(res.rows).toEqual([{ at: '2026-08-20' }]);
  });
});

describe('leerTodo', () => {
  it('un fallo en una tabla no impide leer las demás', async () => {
    /* Abortar el informe entero porque falta una tabla deja sin contestar las
       otras quince preguntas, que sí se podían contestar. */
    const { datos, avisos } = await leerTodo(
      clienteCon({
        clients: filas(2),
        videos: { error: { message: 'relation "videos" does not exist' } },
        teams: { error: { message: 'permission denied' } },
      }),
      {
        clientes: { tabla: 'clients' },
        viejo: { tabla: 'videos' },
        equipos: { tabla: 'teams' },
      }
    );

    expect(datos.clientes).toHaveLength(2);
    expect(datos.viejo).toEqual([]);
    expect(datos.equipos).toEqual([]);

    /* Y lo que no se pudo leer queda DICHO: sin el aviso, ese cero se lee como
       «no hay ninguno». */
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toMatch(/no existe/);
    expect(avisos[1]).toMatch(/permission denied/);
  });

  it('va contando por dónde va, para quien mire una terminal', async () => {
    const alLeer = vi.fn();
    await leerTodo(clienteCon({ clients: filas(2) }), { clientes: { tabla: 'clients' } }, { alLeer });
    expect(alLeer).toHaveBeenCalledWith({ tabla: 'clients', filas: 2 });
  });
});
