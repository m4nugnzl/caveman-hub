import { describe, expect, it } from 'vitest';

import { openNextBlock } from './blocks';
import { anadirBorrador, borradoresDe, datosParaEmpezar } from './borradores';
import {
  cantosDeLaFunda,
  cascadaDeLaTemporada,
  ponerCarpetaIn,
  sucesionDeBloques,
  temporadaConNombre,
  temporadasDe,
  tirasDeLasTemporadas,
} from './temporadas';

const micro = (weekNumber, date) => ({ weekNumber, date, days: [] });

/* Cuatro bloques semanales que cruzan el año: B1 (M1-M2) en diciembre de 2025,
   B2 (M3-M5) en enero, B3 (M6-M7) en febrero y B4 (M8, abierto, 3 previstos). */
const program = {
  cycleType: 'weekly',
  blocks: [
    { id: 'b1', name: 'Base', fromWeek: 1, toWeek: 2 },
    { id: 'b2', name: 'Volumen', fromWeek: 3, toWeek: 5, intent: 'acumulacion' },
    { id: 'b3', name: 'Fuerza', fromWeek: 6, toWeek: 7, intent: 'intensificacion' },
    { id: 'b4', name: 'Pico', fromWeek: 8, toWeek: null, plannedWeeks: 3 },
  ],
  microcycles: [
    micro(1, '2025-12-08'),
    micro(2, '2025-12-15'),
    micro(3, '2026-01-05'),
    micro(4, '2026-01-12'),
    micro(5, '2026-01-19'),
    micro(6, '2026-02-02'),
    micro(7, '2026-02-09'),
    micro(8, '2026-02-16'),
  ],
  draftBlocks: [
    { id: 'd1', name: 'Descarga', plannedWeeks: 1, intent: 'descarga' },
    { id: 'd2', name: 'Siguiente', plannedWeeks: 4 },
  ],
};

const HOY = '2026-02-20';
const ids = (lista) => lista.map((p) => p.id);
const fundas = (p) => temporadasDe(sucesionDeBloques(p, { hoy: HOY }), { hoy: HOY });

describe('sucesionDeBloques — el orden en el tiempo', () => {
  it('de lo más antiguo a lo más nuevo: cerrados, abierto y previstos detrás', () => {
    expect(ids(sucesionDeBloques(program, { hoy: HOY }))).toEqual(['b1', 'b2', 'b3', 'b4', 'd1', 'd2']);
  });

  it('ordena por microciclo aunque los bloques lleguen desordenados', () => {
    const revuelto = { ...program, blocks: [program.blocks[2], program.blocks[0], program.blocks[1], program.blocks[3]] };
    expect(ids(sucesionDeBloques(revuelto, { hoy: HOY, borradores: false }))).toEqual(['b1', 'b2', 'b3', 'b4']);
  });

  it('encadena los previstos detrás del final previsto del abierto, con fechas estimadas', () => {
    const s = sucesionDeBloques(program, { hoy: HOY });
    const pico = s.find((p) => p.id === 'b4');
    const descarga = s.find((p) => p.id === 'd1');
    const siguiente = s.find((p) => p.id === 'd2');
    /* Pico: M8 del 16 feb + dos semanas previstas → acaba el 8 de marzo. */
    expect(pico.hasta).toBe('2026-03-08');
    expect(pico.largo).toBe(3);
    expect(descarga).toMatchObject({ desde: '2026-03-09', hasta: '2026-03-15', estimado: true });
    expect(siguiente).toMatchObject({ desde: '2026-03-16', hasta: '2026-04-12' });
  });
});

describe('temporadasDe — la agrupación', () => {
  it('sin carpetas, una funda por año, de la más reciente a la más antigua', () => {
    const t = fundas(program);
    expect(t.map((f) => f.nombre)).toEqual(['2026', '2025']);
    expect(t.map((f) => ids(f.pases))).toEqual([['b2', 'b3', 'b4', 'd1', 'd2'], ['b1']]);
    expect(t.every((f) => !f.propia)).toBe(true);
  });

  it('con carpeta, la funda es la del nombre y el resto sigue en su año', () => {
    const p = ponerCarpetaIn(program, ['b1', 'b2'], 'Volumen de invierno');
    const t = fundas(p);
    expect(t.map((f) => f.nombre)).toEqual(['2026', 'Volumen de invierno']);
    expect(ids(t[1].pases)).toEqual(['b1', 'b2']);
    expect(t[1].propia).toBe(true);
  });

  it('el nombre no distingue mayúsculas ni espacios de más', () => {
    const p = ponerCarpetaIn(ponerCarpetaIn(program, ['b1'], 'Volumen'), ['b2'], '  volumen ');
    expect(fundas(p).filter((f) => f.propia).map((f) => ids(f.pases))).toEqual([['b1', 'b2']]);
  });

  it('cuenta bloques, microciclos y semanas de calendario, y marca la del abierto', () => {
    const [actual, pasada] = fundas(program);
    /* 3 + 2 + 3 (abierto con previstos) + 1 + 4. */
    expect(actual.largo).toBe(13);
    expect(actual).toMatchObject({ desde: '2026-01-05', hasta: '2026-04-12', ahora: true });
    expect(actual.semanas).toBe(14);
    expect(pasada).toMatchObject({ largo: 2, semanas: 2, ahora: false });
  });

  it('una funda de nombre que se queda sin bloques desaparece', () => {
    const p = ponerCarpetaIn(ponerCarpetaIn(program, ['b1'], 'Volumen'), ['b1'], null);
    expect(fundas(p).some((f) => f.propia)).toBe(false);
  });

  it('encuentra una temporada por su nombre', () => {
    const t = fundas(ponerCarpetaIn(program, ['b1'], 'Volumen'));
    expect(temporadaConNombre(t, 'VOLUMEN')?.nombre).toBe('Volumen');
    expect(temporadaConNombre(t, '2026')).toBeNull();
  });
});

describe('cascadaDeLaTemporada — el orden de la cascada', () => {
  const [actual] = fundas(program);

  it('del más antiguo arriba al más reciente abajo, y entero el último', () => {
    const c = cascadaDeLaTemporada(actual);
    expect(ids(c)).toEqual(['b2', 'b3', 'b4', 'd1', 'd2']);
    expect(c.filter((p) => p.entero).map((p) => p.id)).toEqual(['d2']);
  });

  it('entero el que se elige, y solo uno', () => {
    const c = cascadaDeLaTemporada(actual, 'b3');
    expect(ids(c)).toEqual(['b2', 'b3', 'b4', 'd1', 'd2']);
    expect(c.filter((p) => p.entero).map((p) => p.id)).toEqual(['b3']);
  });

  it('si el elegido no es de esta funda, entero el último', () => {
    expect(cascadaDeLaTemporada(actual, 'b1').find((p) => p.entero).id).toBe('d2');
  });

  it('los cantos de la funda: los tres últimos, el más nuevo delante', () => {
    expect(ids(cantosDeLaFunda(actual))).toEqual(['d2', 'd1', 'b4']);
  });
});

describe('tirasDeLasTemporadas — la escala común', () => {
  it('la funda más larga ocupa todo el ancho y las demás, en proporción', () => {
    const t = fundas(program);
    const tiras = tirasDeLasTemporadas(t);
    expect(tiras.get(t[0].clave).ancho).toBe(1);
    expect(tiras.get(t[1].clave).ancho).toBeCloseTo(2 / 13);
  });

  it('un segmento por pase, proporcional a sus microciclos, que suman la tira entera', () => {
    const t = fundas(program);
    const { segmentos } = tirasDeLasTemporadas(t).get(t[0].clave);
    expect(segmentos.map((s) => s.id)).toEqual(['b2', 'b3', 'b4', 'd1', 'd2']);
    expect(segmentos.map((s) => Math.round(s.fraccion * 13))).toEqual([3, 2, 3, 1, 4]);
    expect(segmentos.reduce((n, s) => n + s.fraccion, 0)).toBeCloseTo(1);
    expect(segmentos[0].color).toBe('var(--data-teal)');
  });

  it('dos fundas del mismo largo, la misma tira', () => {
    const t = fundas(ponerCarpetaIn(program, ['b2', 'b3'], 'Otra'));
    const tiras = tirasDeLasTemporadas(t);
    const otra = t.find((f) => f.nombre === 'Otra');
    const invierno = t.find((f) => f.nombre === '2025');
    /* «Otra» mide 5 y la más larga (2026: b4 + d1 + d2) 8. */
    expect(tiras.get(otra.clave).ancho).toBeCloseTo(5 / 8);
    expect(tiras.get(invierno.clave).ancho).toBeCloseTo(2 / 8);
  });

  it('sin nada que medir no divide entre cero', () => {
    expect(tirasDeLasTemporadas([]).size).toBe(0);
  });
});

describe('las escrituras de la temporada', () => {
  it('ponerCarpetaIn toca bloques y previstos, y nada si no cambia', () => {
    const p = ponerCarpetaIn(program, ['b4', 'd1'], 'Pico');
    expect(p.blocks.find((b) => b.id === 'b4').folder).toBe('Pico');
    expect(borradoresDe(p).find((b) => b.id === 'd1').folder).toBe('Pico');
    expect(ponerCarpetaIn(p, ['b4', 'd1'], 'Pico')).toBe(p);
  });

  it('quitarla borra la clave, no la deja vacía', () => {
    const p = ponerCarpetaIn(ponerCarpetaIn(program, ['b1'], 'Volumen'), ['b1'], '');
    expect('folder' in p.blocks[0]).toBe(false);
  });

  it('un bloque nuevo hereda la temporada del que cierra', () => {
    const p = ponerCarpetaIn(program, ['b4'], 'Pico');
    const { block } = openNextBlock(p);
    expect(block.folder).toBe('Pico');
  });

  it('un previsto nuevo hereda la del último previsto, o la del abierto', () => {
    const conAbierto = ponerCarpetaIn({ ...program, draftBlocks: [] }, ['b4'], 'Pico');
    expect(anadirBorrador(conAbierto, { plannedWeeks: 2 }).borrador.folder).toBe('Pico');
    const conPrevisto = ponerCarpetaIn(program, ['d2'], 'Verano');
    expect(anadirBorrador(conPrevisto, { plannedWeeks: 2 }).borrador.folder).toBe('Verano');
  });

  it('un previsto conserva su temporada al empezarlo', () => {
    const p = ponerCarpetaIn(program, ['d1'], 'Verano');
    expect(datosParaEmpezar(borradoresDe(p)[0]).folder).toBe('Verano');
  });
});
