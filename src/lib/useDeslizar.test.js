import { describe, expect, it } from 'vitest';

import { UMBRAL, decidirGesto } from './useDeslizar';

/*
  El gesto que pasa hoja, sin navegador de por medio.

  Lo que se prueba aquí es la decisión, que es donde está el riesgo: en esta
  pantalla el gesto que se hace mil veces es BAJAR por los ejercicios, y una
  bajada torcida que se leyera como «siguiente» te sacaría de la sesión a mitad
  de serie. Por eso no basta con superar el umbral: hay que ir claramente a lo
  ancho.
*/

describe('decidirGesto', () => {
  it('un arrastre largo hacia la izquierda pasa a la hoja siguiente', () => {
    expect(decidirGesto({ dx: -120, dy: 4 })).toBe('siguiente');
  });

  it('hacia la derecha vuelve a la anterior', () => {
    expect(decidirGesto({ dx: 120, dy: -4 })).toBe('anterior');
  });

  it('un toque no es un gesto', () => {
    expect(decidirGesto({ dx: 0, dy: 0 })).toBe(null);
    expect(decidirGesto({ dx: UMBRAL - 1, dy: 0 })).toBe(null);
  });

  it('bajar por los ejercicios NO cambia de hoja, ni torcido', () => {
    /* 80 px a lo ancho son de sobra para el umbral; con 300 hacia abajo es
       alguien haciendo scroll con el pulgar, no pasando página. */
    expect(decidirGesto({ dx: -80, dy: 300 })).toBe(null);
    expect(decidirGesto({ dx: 80, dy: -300 })).toBe(null);
  });

  it('en diagonal manda lo horizontal solo si lo dobla', () => {
    expect(decidirGesto({ dx: -100, dy: 60 })).toBe('siguiente');
    expect(decidirGesto({ dx: -100, dy: 90 })).toBe(null);
  });
});
