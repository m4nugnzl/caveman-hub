import { beforeEach, describe, expect, it } from 'vitest';

import { clearIssues, recentIssues, recordIssue } from './diagnostics';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que el registro no se llene de basura y tape lo útil. Un fallo en bucle
 * —reintentos de guardado, un error que se repite en cada render— generaría
 * doce líneas idénticas en un segundo y borraría todo lo anterior, que es
 * justamente lo que explica por qué empezó.
 */

beforeEach(() => clearIssues());

describe('recordIssue', () => {
  it('guarda el mensaje, el origen y la ruta', () => {
    recordIssue('guardado', 'violates row-level security policy');

    const [fallo] = recentIssues();
    expect(fallo.source).toBe('guardado');
    expect(fallo.message).toContain('row-level security');
    expect(fallo.count).toBe(1);
  });

  it('acepta un Error, no solo texto', () => {
    recordIssue('js', new Error('boom'));
    expect(recentIssues()[0].message).toBe('boom');
  });

  it('ignora lo que no dice nada', () => {
    recordIssue('js', '');
    recordIssue('js', null);
    expect(recentIssues()).toHaveLength(0);
  });

  /*
    El caso que motiva el contador: sin él, un fallo que se repite llena los doce
    huecos con la misma línea y se lleva por delante el historial.
  */
  it('cuenta los repetidos en vez de acumularlos', () => {
    recordIssue('guardado', 'mismo error');
    recordIssue('guardado', 'mismo error');
    recordIssue('guardado', 'mismo error');

    expect(recentIssues()).toHaveLength(1);
    expect(recentIssues()[0].count).toBe(3);
  });

  it('dos errores distintos son dos entradas', () => {
    recordIssue('guardado', 'uno');
    recordIssue('guardado', 'dos');
    expect(recentIssues()).toHaveLength(2);
  });

  it('el mismo mensaje de distinto origen no se agrupa', () => {
    recordIssue('guardado', 'fallo');
    recordIssue('js', 'fallo');
    expect(recentIssues()).toHaveLength(2);
  });

  it('devuelve del más reciente al más antiguo', () => {
    recordIssue('js', 'primero');
    recordIssue('js', 'segundo');
    expect(recentIssues().map((f) => f.message)).toEqual(['segundo', 'primero']);
  });

  it('recorta los mensajes largos: una traza entera no aporta más que su inicio', () => {
    recordIssue('js', 'x'.repeat(1000));
    expect(recentIssues()[0].message.length).toBeLessThanOrEqual(301);
    expect(recentIssues()[0].message.endsWith('…')).toBe(true);
  });

  it('se queda con los últimos y suelta los viejos', () => {
    for (let i = 0; i < 30; i += 1) recordIssue('js', `error ${i}`);

    const fallos = recentIssues();
    expect(fallos.length).toBeLessThanOrEqual(12);
    expect(fallos[0].message).toBe('error 29');
  });
});
