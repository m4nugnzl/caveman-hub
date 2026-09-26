import { describe, expect, it } from 'vitest';

import { diaCorto, estadoDeLaProgramada, primerDiaProgramable, problemaDelDia, proximaProgramada } from './dietaProgramada';
import { mapDietaProgramadaToDb, mapProgramadaFromDb } from '@/lib/mappers';

describe('la dieta programada', () => {
  it('se programa para mañana o después, y un día por cambio', () => {
    const hoy = '2026-09-25';
    expect(primerDiaProgramable(hoy)).toBe('2026-09-26');
    expect(problemaDelDia('2026-09-25', { hoy })).toMatch(/mañana o después/);
    expect(problemaDelDia('2026-10-01', { hoy, ocupados: ['2026-10-01'] })).toBe('Ya hay un cambio programado para el 1 oct.');
    expect(problemaDelDia('2026-10-01', { hoy })).toBeNull();
  });

  it('la próxima es la pendiente más cercana', () => {
    const lista = [
      { id: 'a', empieza: '2026-10-15', estado: 'pendiente' },
      { id: 'b', empieza: '2026-09-20', estado: 'aplicada' },
      { id: 'c', empieza: '2026-10-01', estado: 'pendiente' },
    ];
    expect(proximaProgramada(lista).id).toBe('c');
    expect(proximaProgramada([])).toBeNull();
  });

  it('dice cómo entró: pendiente, aplicada sobre un retoque de menú, o no aplicada', () => {
    expect(estadoDeLaProgramada({ estado: 'pendiente', empieza: '2026-10-01' })).toBe(
      'Cambio programado para el 1 oct · el cliente no lo ve'
    );
    const aplicada = { estado: 'aplicada', empieza: '2026-10-01', aplicadaEl: '2026-10-03T08:00:00', retoqueDel: '2026-10-02T12:00:00' };
    expect(estadoDeLaProgramada(aplicada)).toBe('Se aplicó el 3 oct; sustituyó un retoque de menú del 2 oct');
    expect(estadoDeLaProgramada({ ...aplicada, retoqueDel: null })).toBe('Se aplicó el 3 oct');
    expect(
      estadoDeLaProgramada({ estado: 'no_aplicada', porQueNo: 'La pauta se cambió a mano el 02/10, después de que empezara este cambio.' })
    ).toBe('No se aplicó: la pauta se cambió a mano el 02/10, después de que empezara este cambio.');
    expect(diaCorto('2026-12-31')).toBe('31 dic');
  });

  it('la dieta viaja con las columnas de la de ahora, entera, y vuelve igual', () => {
    const plan = {
      type: 'closed',
      targetKcals: 2400,
      proteinGrams: 180,
      carbsGrams: 250,
      fatsGrams: 70,
      stepsGoal: 10000,
      cardioGoal: null,
      habitsNotes: [],
      days: [{ id: 'd1', name: 'Entreno', targets: { targetKcals: 2400 }, meals: [] }],
      week: {},
    };
    const fila = mapDietaProgramadaToDb('c1', plan);
    expect(fila).not.toHaveProperty('client_id');
    expect(fila).not.toHaveProperty('updated_at');
    expect(fila.days).toHaveLength(1);
    const leida = mapProgramadaFromDb({ id: 'p', client_id: 'c1', empieza: '2026-10-01', estado: 'pendiente', dieta: fila });
    expect(leida.plan.days[0].name).toBe('Entreno');
    expect(mapDietaProgramadaToDb('c1', leida.plan)).toEqual(fila);
    /* Sin días, `days` va nulo a propósito: al aplicarse no se queda el de antes. */
    expect(mapDietaProgramadaToDb('c1', { ...plan, days: [] }).days).toBeNull();
  });
});
