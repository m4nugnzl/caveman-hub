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

  /*
    ── El sótano ─────────────────────────────────────────────────────────────
    Sin red, la cola intentaba el envío igualmente, fallaba, y publicaba 'error'
    — que en pantalla es «No se guardó» en rojo sobre algo que estaba a salvo en
    el navegador y que se iba a mandar solo. El aviso de pérdida más repetido de
    la aplicación era mentira, y en el sitio donde más falta hace que no lo sea.
  */
  it('sin red no se intenta el envío: queda en espera y no en error', async () => {
    const sender = vi.fn(() => Promise.resolve({ error: null }));
    const store = { save: vi.fn(), clear: vi.fn() };
    const { q, estados } = cola({ isOnline: () => false, store });

    q.enqueue('set:kg', { value: '40' }, sender);
    await espera();

    expect(sender).not.toHaveBeenCalled();
    expect(estados.at(-1)).toEqual(['set:kg', 'pending']);
    expect(q.hasUnsaved()).toBe(true);
    // La nota se apunta igual, y NO se borra: es lo único que hay hasta que salga.
    expect(store.save).toHaveBeenCalledWith('set:kg', { value: '40' });
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('al volver la red se manda lo que quedó esperando', async () => {
    const sender = vi.fn(() => Promise.resolve({ error: null }));
    let hayRed = false;
    const { q, estados } = cola({ isOnline: () => hayRed });

    q.enqueue('set:kg', { value: '40' }, sender);
    q.enqueue('set:reps', { value: '8' }, sender);
    await espera();
    expect(sender).not.toHaveBeenCalled();

    hayRed = true;
    q.reenviarTodo();
    await espera();

    expect(sender).toHaveBeenCalledTimes(2);
    expect(estados.at(-1)?.[1]).toBe('saved');
    expect(q.hasUnsaved()).toBe(false);
  });

  it('una caída de red a mitad de envío es espera, no fallo', async () => {
    let hayRed = true;
    const sender = () => {
      hayRed = false; // la petición no llega: se cae la conexión mientras iba
      return Promise.reject(new TypeError('Failed to fetch'));
    };
    const { q, estados } = cola({ isOnline: () => hayRed });

    q.enqueue('workout:1', { v: 1 }, sender);
    await espera();

    expect(estados.at(-1)).toEqual(['workout:1', 'pending']);
    expect(q.hasUnsaved()).toBe(true);
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
  it('un rechazo definitivo se entrega a quien lo quiera conservar, con su payload', async () => {
    const store = { save: vi.fn(), clear: vi.fn() };
    const onRechazo = vi.fn();
    const { q, estados } = cola({ store, onRechazo });
    const error = { code: 'P0001', message: 'El día Pull A no está en el plan de la semana 3' };

    q.enqueue('set:c1:s1:e1:0:kg', { value: '40' }, () => Promise.resolve({ error }));
    await espera();

    expect(store.clear).toHaveBeenCalledWith('set:c1:s1:e1:0:kg');
    expect(onRechazo).toHaveBeenCalledWith('set:c1:s1:e1:0:kg', { value: '40' }, error);
    expect(estados.at(-1)).toEqual(['set:c1:s1:e1:0:kg', 'error']);
  });

  it('un fallo que no es definitivo no se entrega: sigue en la nota', async () => {
    const onRechazo = vi.fn();
    const { q } = cola({ onRechazo });
    q.enqueue('set:kg', { value: '40' }, () => Promise.resolve({ error: { message: 'timeout' } }));
    await espera();
    expect(onRechazo).not.toHaveBeenCalled();
  });

  it('dice lo que queda sin confirmar, por prefijo', async () => {
    const { q } = cola({ isOnline: () => false });
    q.enqueue('set:c1:a', { v: 1 }, () => Promise.resolve({ error: null }));
    q.enqueue('workout:c1', { v: 2 }, () => Promise.resolve({ error: null }));
    expect(q.pendientes('set:')).toEqual([{ key: 'set:c1:a', payload: { v: 1 } }]);
    expect(q.pendientes()).toHaveLength(2);
  });
});
