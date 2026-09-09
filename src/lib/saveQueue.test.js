import { describe, expect, it, vi } from 'vitest';

import { createSaveQueue } from './saveQueue';

/**
 * La cola de guardado, por donde pasa TODA la escritura de la aplicación.
 *
 * ══ Lo que protege este archivo ════════════════════════════════════════════
 *
 * El caso real: alguien anota 40 kg, ve que se ha equivocado y escribe 35. El
 * primer envío vuelve rechazado —el servidor tenía sus motivos, ver la
 * migración `0101`— y la cola se quedaba ahí: el 35 estaba en `latest`, nadie lo
 * mandaba, y en la base de datos se quedaba el 40. Desde fuera, «me equivoco al
 * poner un peso y ya no lo puedo arreglar».
 *
 * Un rechazo es del valor que se envió, no de la clave para siempre.
 */
const espera = () => new Promise((r) => setTimeout(r, 0));

describe('createSaveQueue', () => {
  const cola = (extra = {}) => {
    const estados = [];
    const q = createSaveQueue({
      onStatus: (key, s) => estados.push([key, s.status]),
      debounceMs: 0,
      ...extra,
    });
    return { q, estados };
  };

  it('un rechazo no se traga la corrección que llegó mientras se enviaba', async () => {
    const enviados = [];
    let sueltaElPrimero;
    const primero = new Promise((r) => {
      sueltaElPrimero = r;
    });

    const sender = (payload) => {
      enviados.push(payload);
      return enviados.length === 1 ? primero : Promise.resolve({ error: null });
    };

    const { q, estados } = cola();
    q.enqueue('set:kg', { value: '40' }, sender);
    // Se corrige mientras el primero sigue en vuelo.
    q.enqueue('set:kg', { value: '35' }, sender);

    sueltaElPrimero({ error: { code: 'P0001', message: 'La serie 3 no existe (hay 3)' } });
    await espera();
    await espera();

    expect(enviados).toEqual([{ value: '40' }, { value: '35' }]);
    expect(estados.at(-1)).toEqual(['set:kg', 'saved']);
    expect(q.hasUnsaved()).toBe(false);
  });

  it('un rechazo sin nada más nuevo sí queda en error, y se reintenta', async () => {
    const enviados = [];
    const sender = (payload) => {
      enviados.push(payload);
      return Promise.resolve(
        enviados.length === 1 ? { error: { message: 'no se pudo' } } : { error: null }
      );
    };

    const { q, estados } = cola();
    q.enqueue('set:kg', { value: '40' }, sender);
    await espera();

    expect(estados.at(-1)).toEqual(['set:kg', 'error']);
    expect(q.hasUnsaved()).toBe(true);

    q.retry('set:kg');
    await espera();

    expect(enviados).toHaveLength(2);
    expect(estados.at(-1)).toEqual(['set:kg', 'saved']);
  });

  it('una sola petición en vuelo por clave, y gana el último valor', async () => {
    const enviados = [];
    let suelta;
    const primero = new Promise((r) => {
      suelta = r;
    });
    const sender = (payload) => {
      enviados.push(payload);
      return enviados.length === 1 ? primero : Promise.resolve({ error: null });
    };

    const { q } = cola();
    q.enqueue('workout:1', { v: 1 }, sender);
    await espera(); // el envío arranca en un microtick, no en la llamada

    q.enqueue('workout:1', { v: 2 }, sender);
    q.enqueue('workout:1', { v: 3 }, sender);
    expect(enviados).toHaveLength(1);

    suelta({ error: null });
    await espera();
    await espera();

    expect(enviados).toEqual([{ v: 1 }, { v: 3 }]);
  });

  it('la nota del navegador se borra solo cuando el servidor confirma', async () => {
    const store = { save: vi.fn(), clear: vi.fn() };
    const { q } = cola({ store });

    q.enqueue('set:kg', { value: '40' }, () => Promise.resolve({ error: null }));
    expect(store.save).toHaveBeenCalledWith('set:kg', { value: '40' });
    expect(store.clear).not.toHaveBeenCalled();

    await espera();
    expect(store.clear).toHaveBeenCalledWith('set:kg');
  });
});
