import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingStore } from './pendingSaves';
import { createSaveQueue } from './saveQueue';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * El único fallo de la aplicación que pierde datos de verdad: el cliente anota
 * sus series en el gimnasio, se cae la cobertura, y el navegador mata la pestaña
 * antes de que la cola consiga reenviarlas.
 *
 * La regla de la que depende todo lo demás está en el primer bloque: **la nota
 * se borra al CONFIRMAR, no al enviar**. Si alguna vez se borrara al enviar, un
 * fallo de red dejaría el payload solo en memoria, que es exactamente el estado
 * del que esto viene a rescatar.
 */

/** `localStorage` de mentira, porque vitest corre sin navegador. */
const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get size() {
      return map.size;
    },
  };
};

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

describe('pendingStore', () => {
  it('guarda, lista y borra', () => {
    const store = pendingStore('u1');
    store.save('workout:c1', { a: 1 });

    expect(store.list()).toEqual([{ key: 'workout:c1', payload: { a: 1 } }]);

    store.clear('workout:c1');
    expect(store.list()).toEqual([]);
  });

  it('la misma clave se sobrescribe, no se acumula', () => {
    const store = pendingStore('u1');
    store.save('workout:c1', { v: 1 });
    store.save('workout:c1', { v: 2 });

    expect(store.list()).toEqual([{ key: 'workout:c1', payload: { v: 2 } }]);
  });

  /* Dos entrenadores en el mismo ordenador: lo pendiente de uno no puede
     reenviarse con la sesión del otro. */
  it('cada usuario ve solo lo suyo', () => {
    pendingStore('u1').save('workout:c1', { a: 1 });
    expect(pendingStore('u2').list()).toEqual([]);
    expect(pendingStore('u1').list()).toHaveLength(1);
  });

  /* Un payload gigante llenaría `localStorage` y dejaría sin sitio a TODO lo
     demás, incluidas las series del gimnasio. Se pierde ese, no el resto. */
  it('un payload enorme no se apunta y no arrastra a los demás', () => {
    const store = pendingStore('u1');
    store.save('workout:c1', { texto: 'x'.repeat(600 * 1024) });
    store.save('anthro:c1', { peso: 80 });

    expect(store.list().map((p) => p.key)).toEqual(['anthro:c1']);
  });

  it('sin almacenamiento no explota', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {},
    });
    const store = pendingStore('u1');

    expect(() => store.save('workout:c1', { a: 1 })).not.toThrow();
    expect(store.list()).toEqual([]);
  });
});

describe('la cola apunta lo pendiente y lo suelta al confirmar', () => {
  const cola = (sender) => {
    const store = pendingStore('u1');
    const queue = createSaveQueue({ debounceMs: 0, store, onStatus: () => {} });
    return { queue, store, sender };
  };

  it('lo confirmado deja de estar pendiente', async () => {
    const { queue, store } = cola();
    queue.enqueue('workout:c1', { a: 1 }, async () => ({ error: null }), { immediate: true });

    await new Promise((r) => setTimeout(r, 0));
    expect(store.list()).toEqual([]);
  });

  /* LA prueba. Si esto se rompe, se pierden datos en silencio. */
  it('lo que falla SIGUE apuntado para el próximo arranque', async () => {
    const { queue, store } = cola();
    queue.enqueue('workout:c1', { a: 1 }, async () => ({ error: { message: 'sin red' } }), {
      immediate: true,
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(store.list()).toEqual([{ key: 'workout:c1', payload: { a: 1 } }]);
  });

  it('una excepción de red tampoco lo borra', async () => {
    const { queue, store } = cola();
    queue.enqueue(
      'set:c1:s1:e1:0:kg',
      { v: '100' },
      async () => {
        throw new Error('offline');
      },
      { immediate: true }
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(store.list()).toHaveLength(1);
  });

  /* Se apunta ANTES de enviar: lo que hay que sobrevivir es el hueco entre que
     el usuario lo escribe y el servidor lo confirma. */
  it('queda apuntado desde el mismo momento de encolarlo', () => {
    const { queue, store } = cola();
    queue.enqueue('nutrition:c1', { kcal: 2000 }, () => new Promise(() => {}), {
      immediate: true,
    });

    expect(store.list()).toHaveLength(1);
  });

  /*
    La otra cara de la prueba de arriba, y la que faltaba: «sigue apuntado» vale
    para lo que NO ha llegado, no para lo que el servidor ha mirado y ha dicho que
    no. Un cliente acabó arrastrando «No se guardó · Reintentar» en cada visita por
    un ejercicio que después de recargar ya no existía en ninguna parte.
  */
  it('lo que el servidor RECHAZA no se guarda para el próximo arranque', async () => {
    const { queue, store } = cola();
    queue.enqueue(
      'set:c1:s1:e1:0:kg',
      { v: '100' },
      async () => ({ error: { code: 'P0001', message: 'El ejercicio ex_1 no está programado en EMPUJES' } }),
      { immediate: true }
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(store.list()).toEqual([]);
  });

  it('pero se puede reintentar mientras la pestaña viva', async () => {
    const { queue, store } = cola();
    const sender = vi.fn(async () => ({ error: { code: 'P0001', message: 'no' } }));
    queue.enqueue('set:c1:s1:e1:0:kg', { v: '100' }, sender, { immediate: true });

    await new Promise((r) => setTimeout(r, 0));
    queue.retry('set:c1:s1:e1:0:kg');
    await new Promise((r) => setTimeout(r, 0));

    expect(sender).toHaveBeenCalledTimes(2);
    expect(store.list()).toEqual([]);
  });

  it('faltar una migración NO es un rechazo definitivo: se arregla desde el otro lado', async () => {
    const { queue, store } = cola();
    queue.enqueue(
      'set:c1:s1:e1:0:kg',
      { v: '100' },
      async () => ({ error: { code: 'PGRST202', message: 'Could not find the function' } }),
      { immediate: true }
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(store.list()).toHaveLength(1);
  });

  it('sin almacén, la cola se comporta igual que antes', async () => {
    const queue = createSaveQueue({ debounceMs: 0, onStatus: () => {} });
    const sender = vi.fn(async () => ({ error: null }));
    queue.enqueue('workout:c1', { a: 1 }, sender, { immediate: true });

    await new Promise((r) => setTimeout(r, 0));
    expect(sender).toHaveBeenCalledTimes(1);
  });
});
