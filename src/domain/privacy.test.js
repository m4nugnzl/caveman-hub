import { describe, expect, it } from 'vitest';

import { CONSENT_VERSION, clientConsent, grantConsent, hasConsent, withdrawConsent } from './privacy';

describe('consentimiento', () => {
  it('sin nada guardado, no hay consentimiento', () => {
    expect(clientConsent(undefined)).toBeNull();
    expect(hasConsent({})).toBe(false);
  });

  it('una marca sin fecha no vale', () => {
    /*
      «Aceptó» sin cuándo no se puede demostrar si alguien lo reclama, que es la
      mitad del motivo por el que esto se guarda.
    */
    expect(clientConsent({ consent: { version: CONSENT_VERSION } })).toBeNull();
  });

  it('un consentimiento de una versión anterior NO cubre el tratamiento actual', () => {
    /*
      Es la razón de que exista el número. Si cambia qué se trata o quién lo ve
      —por ejemplo, que un segundo entrenador del equipo pueda ver sus fotos— lo
      que aceptó antes era sobre otra cosa, y hay que volver a preguntar.
    */
    const viejo = { consent: { acceptedAt: '2026-01-01T10:00:00Z', version: CONSENT_VERSION - 1 } };
    expect(clientConsent(viejo)).not.toBeNull();
    expect(hasConsent(viejo)).toBe(false);
  });

  it('el consentimiento de la versión vigente cubre', () => {
    const dado = { consent: grantConsent('2026-08-12T09:00:00Z') };
    expect(hasConsent(dado)).toBe(true);
    expect(clientConsent(dado).acceptedAt).toBe('2026-08-12T09:00:00Z');
  });
});

describe('retirada', () => {
  it('retirar deja de cubrir, pero SIGUE CONSTANDO', () => {
    /*
      La retirada tiene que quedar registrada por lo mismo que la aceptación: es
      la fecha a partir de la cual el entrenador debía parar. Borrarla del
      registro dejaría la retirada sin constancia.
    */
    const retirado = { consent: { ...grantConsent('2026-01-01T10:00:00Z'), ...withdrawConsent('2026-03-03T10:00:00Z') } };

    expect(hasConsent(retirado)).toBe(false);
    expect(clientConsent(retirado).withdrawnAt).toBe('2026-03-03T10:00:00Z');
  });

  it('volver a aceptar limpia la retirada', () => {
    /*
      `updateClientPreferences` FUSIONA por sección. Si `grantConsent` no pusiera
      `withdrawnAt: null` de forma explícita, la fecha de retirada anterior se
      quedaría puesta y quien vuelve a aceptar seguiría contando como retirado.
    */
    const previo = { ...grantConsent('2026-01-01T10:00:00Z'), ...withdrawConsent('2026-03-03T10:00:00Z') };
    const denuevo = { consent: { ...previo, ...grantConsent('2026-04-04T10:00:00Z') } };

    expect(hasConsent(denuevo)).toBe(true);
    expect(clientConsent(denuevo).withdrawnAt).toBeNull();
  });
});
