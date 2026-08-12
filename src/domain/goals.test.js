import { describe, expect, it } from 'vitest';

import { clientGoal, goalFromDirection, rateVerdict, targetRateKg } from './goals';

/**
 * ══ El caso que motiva este archivo ════════════════════════════════════════
 *
 * La primera versión de `rateVerdict` comparaba la pendiente contra la banda de
 * ruido, y un volumen de 0,25 % semanal sobre 80 kg son 0,2 kg — exactamente el
 * ancho de esa banda. Resultado: un cliente subiendo justo a su objetivo se leía
 * como «estancado», y le pasaba a TODO volumen lento, que es como se hace bien.
 *
 * El error de fondo era comparar una pendiente de ocho semanas con el ruido de una
 * sola medición. La tabla de abajo es la que lo habría cazado en el momento.
 */

const goal = (direction, ratePct) => ({ direction, ratePct, note: '' });
const verdict = (g, actualKg, weight = 80) => rateVerdict({ goal: g, actualKg, weight }).state;

describe('rateVerdict', () => {
  // 80 kg al 0,6 % → objetivo −0,48 kg/semana, margen ±0,24.
  describe('definición', () => {
    const cut = goal('cut', 0.6);

    it.each([
      [-0.5, 'on_track', 'clava el objetivo'],
      [-0.3, 'on_track', 'dentro del margen'],
      [-0.15, 'slow', 'se mueve, pero por debajo del ritmo'],
      [0, 'stalled', 'no se mueve'],
      [-0.05, 'stalled', 'apenas se mueve respecto a lo pedido'],
      [0.4, 'reversed', 'sube cuando debería bajar'],
      [-1.4, 'too_fast', 'baja demasiado rápido'],
    ])('%s kg/semana → %s (%s)', (actual, expected) => {
      expect(verdict(cut, actual)).toBe(expected);
    });
  });

  // 80 kg al 0,25 % → objetivo +0,20 kg/semana, margen ±0,10.
  describe('volumen', () => {
    const bulk = goal('bulk', 0.25);

    it.each([
      [0.2, 'on_track', 'clava el objetivo — el caso que fallaba'],
      [0.1, 'on_track', 'dentro del margen'],
      [0, 'stalled', 'no se mueve'],
      [0.9, 'too_fast', 'sube demasiado rápido: eso es grasa'],
      [-0.3, 'reversed', 'baja cuando debería subir'],
    ])('%s kg/semana → %s (%s)', (actual, expected) => {
      expect(verdict(bulk, actual)).toBe(expected);
    });
  });

  describe('mantenimiento', () => {
    // Sin ritmo que alcanzar: solo una banda de la que no salirse. Aquí la banda
    // de ruido SÍ es la herramienta correcta, porque el objetivo es cero.
    const maintain = goal('maintain', 0);

    it.each([
      [0.02, 'on_track'],
      [-0.15, 'on_track'],
      [-0.5, 'reversed'],
      [0.6, 'reversed'],
    ])('%s kg/semana → %s', (actual, expected) => {
      expect(verdict(maintain, actual)).toBe(expected);
    });
  });

  it('el veredicto es simétrico: subir en definición y bajar en volumen son lo mismo', () => {
    expect(verdict(goal('cut', 0.6), +0.4)).toBe('reversed');
    expect(verdict(goal('bulk', 0.6), -0.4)).toBe('reversed');
  });

  it('sin peso no se puede convertir el porcentaje a kilos, y no se inventa', () => {
    expect(targetRateKg(goal('cut', 0.6), null)).toBeNull();
    expect(rateVerdict({ goal: goal('cut', 0.6), actualKg: -0.5, weight: null })).toBeNull();
  });

  it('el mismo porcentaje son kilos distintos según el peso', () => {
    // El motivo de guardar el objetivo en porcentaje y no en kilos.
    expect(targetRateKg(goal('cut', 0.6), 55)).toBe(-0.33);
    expect(targetRateKg(goal('cut', 0.6), 110)).toBe(-0.66);
  });
});

describe('clientGoal', () => {
  it('devuelve null sin objetivo, para que la pantalla lo pida en vez de inventarlo', () => {
    expect(clientGoal({ preferences: {} })).toBeNull();
    expect(clientGoal({})).toBeNull();
    expect(clientGoal(null)).toBeNull();
  });

  it('una dirección desconocida se lee como «sin objetivo»', () => {
    // Es lo que permite «desmarcar»: se guarda `direction: null` porque las
    // preferencias se fusionan por sección y no se pueden quitar claves.
    expect(clientGoal({ preferences: { goal: { direction: null } } })).toBeNull();
    expect(clientGoal({ preferences: { goal: { direction: 'perder-grasa-ya' } } })).toBeNull();
  });

  it('acota un ritmo absurdo guardado a mano', () => {
    expect(clientGoal({ preferences: { goal: { direction: 'cut', ratePct: 99 } } }).ratePct).toBe(2);
    expect(clientGoal({ preferences: { goal: { direction: 'cut', ratePct: -1 } } }).ratePct).toBe(1);
  });

  it('mantenimiento ignora cualquier ritmo', () => {
    expect(clientGoal({ preferences: { goal: { direction: 'maintain', ratePct: 5 } } }).ratePct).toBe(0);
  });

  it('usa el ritmo por defecto de la dirección si no hay ninguno', () => {
    expect(goalFromDirection('cut')).toEqual({ direction: 'cut', ratePct: 0.6, note: '' });
    expect(goalFromDirection('bulk').ratePct).toBe(0.25);
    expect(goalFromDirection('nada')).toBeNull();
  });
});
