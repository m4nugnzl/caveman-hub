import { describe, expect, it, vi } from 'vitest';

/* Lo que se prueba es la cuenta, no de dónde salen las filas. */
vi.mock('@/context/AppContext', () => ({ useApp: () => ({}) }));

const { lineasNoGuardadas } = await import('./useSeriesNoGuardadas');

const fila = (mas) => ({
  semana: 3,
  hoja: 'Pull A',
  ejercicio: 'Remo',
  serie: 0,
  campo: 'kg',
  valor: '60',
  fecha: '2026-09-22',
  ...mas,
});

describe('lineasNoGuardadas', () => {
  it('cuenta series y no campos: kilos y reps de la misma serie son una', () => {
    const [l] = lineasNoGuardadas([fila(), fila({ campo: 'reps', valor: '8' }), fila({ serie: 1 })], 3);
    expect(l.texto).toMatch(/^2 series no se guardaron el 22 .+ · Pull A$/);
    expect(l.detalle).toBe('Remo, serie 1: 60 kg · 8 reps\nRemo, serie 2: 60 kg');
  });

  it('una línea por día y hoja, y solo de la semana que se revisa', () => {
    const lineas = lineasNoGuardadas([fila(), fila({ hoja: 'Push A' }), fila({ semana: 2 })], 3);
    expect(lineas.map((l) => l.texto.split(' · ')[1])).toEqual(['Pull A', 'Push A']);
    expect(lineas[0].texto.startsWith('1 serie no se guardó')).toBe(true);
  });

  it('sin filas no dice nada', () => {
    expect(lineasNoGuardadas([], 3)).toEqual([]);
  });
});
