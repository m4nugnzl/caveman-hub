import { describe, expect, it } from 'vitest';

import { colocarPesos, etiquetaDelBloque, primeraPalabra, rotuloDeFase } from './rotulos';

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

  /* El caso que lo destapó: un borrador de 92 px llamado «Descarga y test», sin
     intención escrita, se quedaba en «D» teniendo sitio para una palabra. */
  it('sin intención, antes de la letra prueba la primera palabra', () => {
    expect(etiquetaDelBloque({ nombre: 'Descarga y test', ancho: 92 })).toEqual({
      texto: 'Descarga',
      letra: false,
    });
  });

  it('pero una palabra recortada no: o cabe entera o se cae al peldaño siguiente', () => {
    expect(etiquetaDelBloque({ nombre: 'Descarga y test', ancho: 40 })).toEqual({ texto: 'D', letra: true });
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

describe('los pesos de las uniones', () => {
  const kg = (t) => [[`${t} kg`], [t]];

  it('una unión lleva un solo número, centrado encima', () => {
    const [p] = colocarPesos([{ x: 300, ancla: 'centro', versiones: kg('85,8') }], 800);
    expect(p.partes).toEqual(['85,8 kg']);
    expect(p.left + p.ancho / 2).toBe(300);
  });

  it('pegado al borde de la tira no se sale', () => {
    const [a] = colocarPesos([{ x: 0, ancla: 'centro', versiones: kg('85,8') }], 800);
    const [b] = colocarPesos([{ x: 800, ancla: 'centro', versiones: kg('85,8') }], 800);
    expect(a.left).toBe(0);
    expect(b.left + b.ancho).toBe(800);
  });

  it('dos uniones cerca sueltan las unidades antes que el número', () => {
    const r = colocarPesos(
      [
        { x: 100, ancla: 'centro', versiones: kg('85,8') },
        { x: 150, ancla: 'centro', versiones: kg('84,1') },
      ],
      800
    );
    expect(r.map((p) => p.partes[0])).toEqual(['85,8 kg', '84,1']);
  });

  it('y si ni así cabe, se calla: lo dice el globo', () => {
    const r = colocarPesos(
      [
        { x: 100, ancla: 'centro', versiones: kg('85,8') },
        { x: 120, ancla: 'centro', versiones: kg('84,1') },
      ],
      800
    );
    expect(r).toHaveLength(1);
  });
});

describe('la primera palabra', () => {
  it('es la palabra, no el nombre entero', () => {
    expect(primeraPalabra('Descarga y test')).toBe('Descarga');
    expect(primeraPalabra('Seguir definiendo')).toBe('Seguir');
  });

  it('de un nombre de una sola palabra no hay peldaño que dar', () => {
    expect(primeraPalabra('Acumulación')).toBeNull();
    expect(primeraPalabra('  Volumen  ')).toBeNull();
  });

  it('y una inicial suelta no es una palabra', () => {
    expect(primeraPalabra('A tope')).toBeNull();
    expect(primeraPalabra('')).toBeNull();
  });
});
