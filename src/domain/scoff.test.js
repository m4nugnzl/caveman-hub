import { describe, expect, it } from 'vitest';

import { cleanProfile } from './profile';
import { SCOFF_QUESTIONS, scoffBool, scoffResult } from './scoff';

/**
 * ══ Lo que estas pruebas defienden ══════════════════════════════════════════
 *
 * Que un instrumento clínico no opine de más: sin respuestas no hay resultado,
 * a medias no hay señal, y el veredicto solo existe con el cuestionario entero.
 * Un cribado que se adelanta es un diagnóstico disfrazado, que es exactamente
 * lo que esta aplicación no hace.
 */

describe('scoffBool', () => {
  it('acepta booleanos y las cadenas del <select>, y nada más', () => {
    expect(scoffBool(true)).toBe(true);
    expect(scoffBool('true')).toBe(true);
    expect(scoffBool(false)).toBe(false);
    expect(scoffBool('false')).toBe(false);
    expect(scoffBool('')).toBeNull();
    expect(scoffBool(undefined)).toBeNull();
    expect(scoffBool('quizá')).toBeNull();
  });
});

describe('scoffResult', () => {
  const todas = (valor) => Object.fromEntries(SCOFF_QUESTIONS.map((q) => [q.id, valor]));

  it('sin contestar no hay resultado, no un cero', () => {
    expect(scoffResult({})).toBeNull();
    expect(scoffResult(null)).toBeNull();
    expect(scoffResult({ scoff: {} })).toBeNull();
  });

  it('dos o más síes con el cuestionario entero son la señal', () => {
    const r = scoffResult({ scoff: { ...todas(false), sick: true, food: true } });
    expect(r.yes).toBe(2);
    expect(r.senal).toBe(true);
  });

  it('un solo sí no la enciende', () => {
    expect(scoffResult({ scoff: { ...todas(false), food: true } }).senal).toBe(false);
  });

  it('a medias no hay veredicto: dos síes de dos contestadas no son dos de cinco', () => {
    const r = scoffResult({ scoff: { sick: true, food: true } });
    expect(r.completo).toBe(false);
    expect(r.senal).toBe(false);
    expect(r.answered).toBe(2);
  });
});

describe('el cribado sobrevive al saneo del perfil', () => {
  it('cleanProfile conserva la bolsa scoff, saneada', () => {
    const limpio = cleanProfile({
      sleepHours: 7,
      scoff: { sick: 'true', food: false, inventada: true, control: 'quizá' },
    });
    expect(limpio.scoff).toEqual({ sick: true, food: false });
  });

  it('y sin respuestas de verdad no deja una bolsa vacía', () => {
    expect(cleanProfile({ scoff: { control: 'quizá' } }).scoff).toBeUndefined();
    expect(cleanProfile({ scoff: 'basura' }).scoff).toBeUndefined();
  });
});
