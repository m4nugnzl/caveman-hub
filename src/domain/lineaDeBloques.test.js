import { describe, expect, it } from 'vitest';

import { lineaDeBloques, resumenDeLaLinea, semanasSinEntrenar } from './lineaDeBloques';

const micro = (weekNumber, date) => ({ weekNumber, date, days: [] });

/* Tres bloques semanales: B1 (M1-M2) del 1 al 14 de junio; B2 (M3-M4) empieza
   justo detrás; B3 (M5, abierto) vuelve tras cuatro semanas enteras sin nada (29 jun – 26 jul). */
const program = {
  cycleType: 'weekly',
  blocks: [
    { id: 'b1', name: 'Base', fromWeek: 1, toWeek: 2 },
    { id: 'b2', name: 'Fuerza', fromWeek: 3, toWeek: 4 },
    { id: 'b3', name: 'Pico', fromWeek: 5, toWeek: null },
  ],
  microcycles: [
    micro(1, '2026-06-01'),
    micro(2, '2026-06-08'),
    micro(3, '2026-06-15'),
    micro(4, '2026-06-22'),
    micro(5, '2026-07-27'),
  ],
};

const forma = (linea) => linea.map((i) => (i.tipo === 'pausa' ? `pausa:${i.semanas}` : `${i.tipo}:${i.bloque.id}`));

describe('lineaDeBloques — el orden', () => {
  it('previstos arriba, luego el abierto, luego los cerrados del más reciente al más antiguo', () => {
    const borradores = [{ id: 'd1', name: 'Siguiente' }, { id: 'd2', name: 'Después' }];
    expect(forma(lineaDeBloques(program, { borradores }))).toEqual([
      'borrador:d1',
      'borrador:d2',
      'bloque:b3',
      'pausa:4',
      'bloque:b2',
      'bloque:b1',
    ]);
  });

  it('ordena por microciclo aunque los bloques lleguen desordenados', () => {
    const desordenado = { ...program, blocks: [program.blocks[1], program.blocks[0], program.blocks[2]] };
    expect(forma(lineaDeBloques(desordenado)).filter((f) => f.startsWith('bloque'))).toEqual([
      'bloque:b3',
      'bloque:b2',
      'bloque:b1',
    ]);
  });

  it('marca cuál es el abierto', () => {
    const linea = lineaDeBloques(program);
    expect(linea.filter((i) => i.abierto).map((i) => i.bloque.id)).toEqual(['b3']);
  });
});

describe('semanasSinEntrenar — dónde se corta el raíl', () => {
  it('dos bloques seguidos no dejan hueco', () => {
    expect(semanasSinEntrenar({ hasta: '2026-06-14' }, { desde: '2026-06-15' })).toBe(0);
  });

  it('unos días de margen no son una semana', () => {
    expect(semanasSinEntrenar({ hasta: '2026-06-14' }, { desde: '2026-06-20' })).toBe(0);
  });

  it('cuenta solo semanas enteras', () => {
    expect(semanasSinEntrenar({ hasta: '2026-06-14' }, { desde: '2026-06-22' })).toBe(1);
    expect(semanasSinEntrenar({ hasta: '2026-06-28' }, { desde: '2026-07-27' })).toBe(4);
  });

  it('no inventa pausas con fechas estimadas ni sin tramo', () => {
    expect(semanasSinEntrenar({ hasta: '2026-06-14', estimado: true }, { desde: '2026-09-01' })).toBe(0);
    expect(semanasSinEntrenar(null, { desde: '2026-09-01' })).toBe(0);
  });

  it('un programa sin fechas no tiene pausas', () => {
    const sinFechas = { ...program, microcycles: program.microcycles.map((m) => ({ ...m, date: null })) };
    expect(lineaDeBloques(sinFechas).some((i) => i.tipo === 'pausa')).toBe(false);
  });
});

describe('resumenDeLaLinea — la cabecera', () => {
  it('con un bloque abierto cuenta hasta hoy', () => {
    expect(resumenDeLaLinea(lineaDeBloques(program), '2026-08-03')).toEqual({
      bloques: 3,
      desde: '2026-06-01',
      semanas: 9,
    });
  });

  it('los borradores no son bloques', () => {
    const linea = lineaDeBloques(program, { borradores: [{ id: 'd1' }] });
    expect(resumenDeLaLinea(linea, '2026-08-03').bloques).toBe(3);
  });
});
