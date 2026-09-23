import { describe, expect, it } from 'vitest';

import { etiquetaDelBloque, rotuloDeFase } from './rotulos';

/*
  Lo que protegen estas pruebas: que ningún bloque se quede mudo por estrecho
  —la regla que aprobó el dueño— y que al encoger un tramo de fase lo último
  que se pierda sean los pesos de los extremos, que son el dato.
*/

describe('la etiqueta de un bloque', () => {
  const acum = { nombre: 'Acumulación', intent: 'acumulacion' };

  it('escribe el nombre entero, con su cola, cuando cabe', () => {
    const { texto, letra } = etiquetaDelBloque({ ...acum, cola: ' · M3 de 5', ancho: 220 });
    expect(texto).toBe('Acumulación · M3 de 5');
    expect(letra).toBe(false);
  });

  it('suelta la cola antes que el nombre', () => {
    expect(etiquetaDelBloque({ ...acum, cola: ' · M3 de 5', ancho: 90 }).texto).toBe('Acumulación');
  });

  it('abrevia cuando el nombre ya no entra', () => {
    expect(etiquetaDelBloque({ ...acum, ancho: 55 }).texto).toBe('Acum.');
  });

  it('acaba en una letra, y la de adaptación no es la A', () => {
    expect(etiquetaDelBloque({ ...acum, ancho: 24 })).toEqual({ texto: 'A', letra: true });
    expect(etiquetaDelBloque({ nombre: 'Adaptación', intent: 'adaptacion', ancho: 24 })).toEqual({
      texto: 'Ad',
      letra: true,
    });
  });

  it('un bloque con nombre propio y sin intención usa su inicial', () => {
    expect(etiquetaDelBloque({ nombre: 'Puesta a punto', ancho: 24 })).toEqual({ texto: 'P', letra: true });
  });

  it('en un tramo de una semana estrecha no se escribe nada: manda el globo', () => {
    expect(etiquetaDelBloque({ ...acum, ancho: 8 })).toEqual({ texto: '', letra: false });
  });
});

describe('el rótulo de una fase', () => {
  const base = { titulo: 'Volumen', ritmo: '+0,25 %/sem', cuenta: '30 de 52', pesoEntrada: '76,0', pesoSalida: '86,5' };
  const textos = (r) => [...r.izq, ...r.der].map((x) => x.texto);

  it('con sitio de sobra lo dice todo, con las unidades', () => {
    expect(textos(rotuloDeFase({ ...base, ancho: 600 }))).toEqual([
      '76,0 kg',
      'Volumen',
      '+0,25 %/sem',
      '30 de 52',
      '86,5 kg',
    ]);
  });

  it('el ritmo cae antes que la cuenta', () => {
    const r = textos(rotuloDeFase({ ...base, ancho: 190 }));
    expect(r).toContain('30 de 52');
    expect(r).not.toContain('+0,25 %/sem');
  });

  it('las unidades caen antes que las cifras', () => {
    const r = textos(rotuloDeFase({ ...base, ancho: 150 }));
    expect(r).toContain('76,0');
    expect(r).not.toContain('76,0 kg');
  });

  it('lo último que queda son los dos pesos de los extremos', () => {
    expect(textos(rotuloDeFase({ ...base, ancho: 66 }))).toEqual(['76,0', '86,5']);
  });

  it('y sin sitio para los dos, el título solo', () => {
    expect(textos(rotuloDeFase({ ...base, ancho: 52 }))).toEqual(['Volumen']);
  });

  it('un tramo partido no inventa el peso del extremo que cae en otra tira', () => {
    const r = rotuloDeFase({ ...base, pesoEntrada: null, ancho: 600 });
    expect(r.izq.map((x) => x.texto)).toEqual(['Volumen', '+0,25 %/sem']);
    expect(r.der.map((x) => x.texto)).toEqual(['30 de 52', '86,5 kg']);
  });

  it('en una sola semana no cabe nada y no se escribe nada', () => {
    expect(textos(rotuloDeFase({ ...base, ancho: 18 }))).toEqual([]);
  });
});
