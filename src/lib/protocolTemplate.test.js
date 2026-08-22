import { describe, expect, it } from 'vitest';

import { clientDrifts, defaultProtocol } from '@/lib/protocolTemplate';
import { defaultIntake } from '@/lib/intakeTemplate';
import { toggleModule } from '@/domain/protocol';
import { INTAKE_CATALOG, intakeToPreferences, toggleStep } from '@/domain/intake';

/*
  De `clientDrifts` cuelgan dos cosas que no pueden discrepar: el recuento que
  enciende «Aplicar a todos» y la marca «propia» de cada cliente en el selector
  de Protocolo. Ver el porqué de cada parte en `matchesTemplate`.
*/
describe('clientDrifts', () => {
  const template = defaultProtocol();
  const intakeTemplate = defaultIntake();

  it('un cliente sin nada configurado coincide con las plantillas por defecto', () => {
    expect(clientDrifts(template, intakeTemplate, { preferences: {} })).toBe(false);
  });

  it('un protocolo distinto es desvío', () => {
    const suyo = toggleModule(defaultProtocol(), 'warmup');
    expect(clientDrifts(template, intakeTemplate, { preferences: { protocol: suyo } })).toBe(true);
  });

  it('los pasos del alta también cuentan: cambiar solo el alta es desvío', () => {
    const suyo = toggleStep(defaultIntake(), INTAKE_CATALOG[0].id);
    expect(
      clientDrifts(template, intakeTemplate, { preferences: { intake: intakeToPreferences(suyo) } })
    ).toBe(true);
  });

  it('la dirección importa: el desvío se mide contra LA PLANTILLA del entrenador', () => {
    const plantilla = toggleModule(defaultProtocol(), 'warmup');
    expect(clientDrifts(plantilla, intakeTemplate, { preferences: {} })).toBe(true);
    expect(
      clientDrifts(plantilla, intakeTemplate, { preferences: { protocol: plantilla } })
    ).toBe(false);
  });
});
