import { describe, expect, it } from 'vitest';

import { CONSENT_POINTS, consentFromRow } from './privacy';

/**
 * ══ Qué se prueba aquí, y qué NO ═══════════════════════════════════════════
 *
 * Estas pruebas cubrían la lógica del consentimiento entera: si cubría, si
 * estaba retirado, si la versión valía. Ya no, y no porque se haya dejado de
 * comprobar: es que **esa decisión ya no se toma en el navegador**.
 *
 * Había dos sistemas de consentimiento a la vez —uno en `clients.preferences` y
 * otro en la tabla `client_consents`— con dos constantes de versión de tipos
 * distintos y que no se miraban entre sí. Se quedó la tabla, que es la única que
 * vale como prueba, y con ella la decisión se tomó donde no se puede saltar:
 * `needs_consent` (migración 0050).
 *
 * Así que quién puede pasar y quién no lo fija **`supabase/tests/`**, contra una
 * base de datos de verdad. Es el sitio correcto: un consentimiento que decide el
 * cliente es un consentimiento que se salta abriendo las herramientas de
 * desarrollo.
 *
 * Lo que queda aquí es lo que sigue siendo de este lado: leer la fila sin
 * romperse, y que el texto que se acepta no se quede vacío por accidente.
 */

describe('consentFromRow — normalizar lo que devuelve la base', () => {
  it('sin fila no hay consentimiento', () => {
    expect(consentFromRow(null)).toBeNull();
    expect(consentFromRow(undefined)).toBeNull();
    expect(consentFromRow({})).toBeNull();
  });

  it('una concesión se lee como concedida, con su versión y su fecha', () => {
    const fila = { kind: 'granted', version: '2026-08', at: '2026-08-12T09:00:00Z' };
    expect(consentFromRow(fila)).toEqual({
      granted: true,
      version: '2026-08',
      at: '2026-08-12T09:00:00Z',
    });
  });

  it('una retirada NO se lee como concedida, y sigue constando con su fecha', () => {
    /*
      Que la retirada conserve la fecha no es un detalle: «retiró el
      consentimiento el 3 de marzo» es lo que el entrenador tiene que ver para
      saber que debe parar, y es lo que hay que poder demostrar después.
    */
    const fila = { kind: 'withdrawn', version: '2026-08', at: '2026-03-03T10:00:00Z' };
    expect(consentFromRow(fila)).toEqual({
      granted: false,
      version: '2026-08',
      at: '2026-03-03T10:00:00Z',
    });
  });

  it('no decide si la versión vale: eso lo hace la base de datos', () => {
    /*
      Devuelve la versión tal cual y no la compara con nada. Comparar aquí sería
      volver a tener dos jueces del mismo hecho, que es justo lo que se acaba de
      quitar.
    */
    const vieja = consentFromRow({ kind: 'granted', version: '2025-01', at: '2025-01-01T00:00:00Z' });
    expect(vieja.granted).toBe(true);
    expect(vieja.version).toBe('2025-01');
  });
});

describe('CONSENT_POINTS — el contenido de lo que se acepta', () => {
  it('dice las cuatro cosas que tiene que decir', () => {
    /*
      Lo que se guarda es «aceptó esta versión», y esta versión es este texto. Si
      alguien lo vacía sin querer, lo que quedaría archivado sería la prueba de
      haber aceptado nada.
    */
    expect(CONSENT_POINTS.length).toBeGreaterThanOrEqual(4);
    for (const punto of CONSENT_POINTS) expect(punto.trim().length).toBeGreaterThan(20);
  });

  it('menciona que se puede retirar, porque es la condición para que sea libre', () => {
    expect(CONSENT_POINTS.some((p) => /retirar/i.test(p))).toBe(true);
  });
});
