import { describe, expect, it } from 'vitest';

import { BUILD, comprobarVersion, firmaDeEscritura, hayVersionNueva } from './version';

describe('la versión del build', () => {
  /* El trigger de la 0131 rechaza un cambio del plan que deja la firma igual:
     dos guardados seguidos de la misma versión tienen que firmar distinto. */
  it('cada escritura firma distinto', () => {
    const firmas = new Set(Array.from({ length: 50 }, firmaDeEscritura));
    expect(firmas.size).toBe(50);
  });

  it('fuera de un build no hay id ni aviso, y no pregunta a nadie', async () => {
    expect(BUILD).toBeNull();
    expect(await comprobarVersion()).toBe(false);
    expect(hayVersionNueva()).toBe(false);
  });
});
