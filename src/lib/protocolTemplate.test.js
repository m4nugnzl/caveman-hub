import { describe, expect, it } from 'vitest';

import {
  clientDrifts,
  defaultProtocol,
  isException,
  needsTemplate,
  newClientPreferences,
} from '@/lib/protocolTemplate';
import { defaultIntake, intakeTemplateToPreferences } from '@/lib/intakeTemplate';
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

/*
  De `needsTemplate` cuelga a quién se le ESCRIBE al poner al día. Lo que protege
  es el trabajo hecho a mano: una excepción que se colara aquí perdería su
  configuración en el siguiente cambio de plantilla, y sin aviso. Ver el porqué
  de los dos grupos en `isException`.
*/
describe('needsTemplate', () => {
  const template = defaultProtocol();
  const intakeTemplate = defaultIntake();
  const suyo = toggleModule(defaultProtocol(), 'warmup');

  const marcado = { on: true };
  /* Ya pasó por «poner al día» alguna vez: alguien decidió que sigue la
     plantilla. Es el único que se queda ATRÁS de verdad. */
  const alDia = { on: false };

  it('el que se quedó atrás sí recibe la plantilla', () => {
    const client = { preferences: { protocol: suyo, protocolException: alDia } };
    expect(clientDrifts(template, intakeTemplate, client)).toBe(true);
    expect(needsTemplate(template, intakeTemplate, client)).toBe(true);
  });

  /*
    ══ El caso que costó el trabajo de un entrenador ═══════════════════════════

    La marca tiene TRES estados y el tercero —ausente— se trataba como «no». Eso
    dejaba sin protección a todos los clientes anteriores a que existiera: a uno
    al que le habías quitado preguntas hace seis meses, el primer «poner al día»
    se las devolvía todas, sin aviso y sin vuelta atrás.

    Ahora lo no decidido se resuelve hacia el lado que no destruye nada.
  */
  it('el que nunca pasó por aquí Y se desvía queda protegido', () => {
    const client = { preferences: { protocol: suyo } };
    expect(clientDrifts(template, intakeTemplate, client)).toBe(true);
    expect(needsTemplate(template, intakeTemplate, client)).toBe(false);
  });

  /* Pero solo si se desvía: sin nada que proteger, nadie se queda fuera del
     alcance de su plantilla por no haber hecho nada. */
  it('el que nunca pasó por aquí y NO se desvía no queda fuera de nada', () => {
    const client = { preferences: {} };
    expect(clientDrifts(template, intakeTemplate, client)).toBe(false);
    expect(needsTemplate(template, intakeTemplate, client)).toBe(false);
  });

  it('la excepción se desvía pero NO se toca', () => {
    const client = { preferences: { protocol: suyo, protocolException: marcado } };
    expect(clientDrifts(template, intakeTemplate, client)).toBe(true);
    expect(needsTemplate(template, intakeTemplate, client)).toBe(false);
  });

  it('la excepción cuyo alta se desvía tampoco se toca', () => {
    const client = {
      preferences: {
        intake: intakeToPreferences(toggleStep(defaultIntake(), INTAKE_CATALOG[0].id)),
        protocolException: marcado,
      },
    };
    expect(needsTemplate(template, intakeTemplate, client)).toBe(false);
  });

  it('la marca soltada devuelve al cliente al alcance de la plantilla', () => {
    const client = { preferences: { protocol: suyo, protocolException: { on: false } } };
    expect(isException(client)).toBe(false);
    expect(needsTemplate(template, intakeTemplate, client)).toBe(true);
  });

  /* Los clientes de antes de que esto existiera. Si «ausente» contara como
     excepción, un entrenador se encontraría con que su plantilla ya no llega a
     nadie sin haber tocado nada. */
  it('sin marca es NO excepción: el comportamiento de siempre', () => {
    expect(isException({ preferences: {} })).toBe(false);
    expect(isException({ preferences: { protocolException: {} } })).toBe(false);
    expect(isException({})).toBe(false);
  });
});

/*
  Lo que decide con qué nace un cliente. Un fallo aquí es SILENCIOSO —el cliente
  se crea igual, solo que con el protocolo de serie— y solo se nota semanas
  después, cuando alguien mira por qué su plantilla no llegó. Por eso se prueba
  contra `needsTemplate`, que es la pregunta de verdad: ¿nace ya al día?
*/
describe('newClientPreferences', () => {
  const conPlantilla = toggleModule(defaultProtocol(), 'warmup');
  const conAlta = toggleStep(defaultIntake(), INTAKE_CATALOG[0].id);

  it('sin plantilla guardada no hay nada que sembrar', () => {
    expect(newClientPreferences({})).toBe(null);
    expect(newClientPreferences(undefined)).toBe(null);
    /* Y no hace falta: la columna vacía ya produce el protocolo de serie, que es
       la plantilla de quien no ha configurado ninguna. */
    expect(
      needsTemplate(defaultProtocol(), defaultIntake(), { preferences: {} })
    ).toBe(false);
  });

  it('el cliente nuevo nace CON la plantilla puesta, no atrasado', () => {
    const coachPrefs = {
      protocolTemplate: conPlantilla,
      intakeTemplate: intakeTemplateToPreferences(conAlta),
    };
    const client = { preferences: newClientPreferences(coachPrefs) };

    expect(needsTemplate(conPlantilla, conAlta, client)).toBe(false);
    /* Y sin marca: acaba de recibirla y tiene que seguir recibiendo lo que
       venga después. */
    expect(isException(client)).toBe(false);
  });

  it('sembrar solo una de las dos deja la otra por defecto', () => {
    const soloProtocolo = newClientPreferences({ protocolTemplate: conPlantilla });
    expect(soloProtocolo.protocol).toBeTruthy();
    expect(soloProtocolo.intake).toBeUndefined();
    expect(needsTemplate(conPlantilla, defaultIntake(), { preferences: soloProtocolo })).toBe(false);
  });

  /* Del alta va la DEFINICIÓN y nada más: sembrar `done` o `links` repartiría a
     cada cliente nuevo los pasos marcados y los vídeos de la plantilla. */
  it('del alta solo se siembra qué pasos hay', () => {
    const prefs = newClientPreferences({
      intakeTemplate: intakeTemplateToPreferences(conAlta),
    });
    expect(Object.keys(prefs.intake).sort()).toEqual(['custom', 'steps']);
  });
});
