import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withChunkRetry } from './lazyRoute';

/**
 * `sessionStorage` no existe en Node. Se sustituye por un Map, que es lo que la
 * implementación espera: `getItem`, `setItem`, `removeItem` y nada más.
 */
const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
};

beforeEach(() => {
  globalThis.sessionStorage = fakeStorage();
});

afterEach(() => {
  delete globalThis.sessionStorage;
});

describe('withChunkRetry', () => {
  it('deja pasar la carga normal sin tocar nada', async () => {
    const reload = vi.fn();
    const module = { default: 'Pantalla' };

    await expect(withChunkRetry(() => Promise.resolve(module), reload)()).resolves.toBe(module);
    expect(reload).not.toHaveBeenCalled();
  });

  it('recarga cuando el fragmento ya no existe', async () => {
    /*
      El caso real: se despliega una versión nueva, los fragmentos de la anterior
      desaparecen, y una pestaña abierta desde antes pide un archivo que ya no
      está. Recargar trae el index nuevo con las referencias nuevas.
    */
    const reload = vi.fn();
    const fail = () => Promise.reject(new Error('Failed to fetch dynamically imported module'));

    const pending = withChunkRetry(fail, reload)();
    // La promesa no se resuelve nunca a propósito: la página se está recargando.
    const settled = await Promise.race([pending.then(() => 'resuelta'), Promise.resolve('pendiente')]);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(settled).toBe('pendiente');
  });

  it('NO recarga una segunda vez: propaga el error', async () => {
    /*
      El seguro contra el bucle. Si el archivo falta por otro motivo —un CDN roto,
      un bloqueador, un despliegue a medias— recargar no lo arregla, y hacerlo en
      bucle además impide leer el error. A la segunda se deja subir hasta
      `ErrorBoundary`.
    */
    const reload = vi.fn();
    const boom = new Error('Failed to fetch dynamically imported module');
    const fail = () => Promise.reject(boom);

    withChunkRetry(fail, reload)(); // primera: recarga
    await expect(withChunkRetry(fail, reload)()).rejects.toThrow(boom);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('una carga correcta rearma el seguro', async () => {
    /*
      Y este es el motivo de que el seguro se quite AL CARGAR BIEN y no al
      arrancar: si se quitara en el arranque, la propia recarga lo desarmaría y el
      siguiente fallo volvería a recargar, para siempre.
    */
    const reload = vi.fn();
    sessionStorage.setItem('caveman-chunk-reload', '1');

    await withChunkRetry(() => Promise.resolve({ default: 'ok' }), reload)();
    expect(sessionStorage.getItem('caveman-chunk-reload')).toBeNull();

    // Con el seguro rearmado, un fallo posterior vuelve a poder recargar.
    await Promise.race([
      withChunkRetry(() => Promise.reject(new Error('x')), reload)(),
      Promise.resolve(),
    ]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sin almacenamiento disponible no recarga nunca', async () => {
    /*
      Modo privado o almacenamiento bloqueado: sin sitio donde anotar que ya se
      recargó, recargar sería arriesgarse al bucle sin red. Mejor enseñar el error.
    */
    delete globalThis.sessionStorage;
    const reload = vi.fn();

    await expect(
      withChunkRetry(() => Promise.reject(new Error('sin chunk')), reload)()
    ).rejects.toThrow('sin chunk');
    expect(reload).not.toHaveBeenCalled();
  });
});
