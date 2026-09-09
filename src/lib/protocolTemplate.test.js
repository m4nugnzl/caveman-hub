import { describe, expect, it } from 'vitest';

import {
  clientDrifts,
  defaultProtocol,
  igualASuPlan,
  isException,
  matchesTemplate,
  necesitaSuPlan,
  needsTemplate,
  newClientPreferences,
  parchePara,
  planDe,
  planDeCliente,
  protegidoDeSuPlan,
  usaProtocolos,
} from '@/lib/protocolTemplate';
import { clientProtocol } from '@/domain/protocol';
import { defaultIntake, intakeTemplateToPreferences } from '@/lib/intakeTemplate';
import { toggleModule } from '@/domain/protocol';
import {
  INTAKE_CATALOG,
  clientIntake,
  clientSteps,
  intakeToPreferences,
  setStepOwner,
  toggleStep,
} from '@/domain/intake';

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
     cada cliente nuevo los pasos marcados y los vídeos de la plantilla.

     `owners` está DENTRO de la definición, y esta prueba decía lo contrario. El
     reparto —«esto me lo entrega él», «esto lo hago yo»— es la mitad de lo que se
     decide en el alta y se decide una vez para todos, igual que qué pasos hay. Al
     quedarse fuera, cambiarlo de lado en la plantilla no se guardaba: la fila se
     movía en pantalla, no había ningún error, y al recargar volvía a su sitio. */
  it('del alta se siembra la definición: qué pasos hay y de quién es cada uno', () => {
    const prefs = newClientPreferences({
      intakeTemplate: intakeTemplateToPreferences(conAlta),
    });
    expect(Object.keys(prefs.intake).sort()).toEqual(['custom', 'owners', 'steps']);
  });

  it('y el reparto que pusiste llega al cliente nuevo', () => {
    /* Un paso que el catálogo da por tuyo y que tú pasas a que lo entregue él.
       `postureVideo` vale porque no es automático — los tres que se marcan solos
       no se mueven de lado (`setStepOwner`). */
    const conReparto = setStepOwner(
      { ...defaultIntake(), steps: [...defaultIntake().steps, 'postureVideo'] },
      'postureVideo',
      'client'
    );

    const prefs = newClientPreferences({
      intakeTemplate: intakeTemplateToPreferences(conReparto),
    });

    expect(clientSteps(clientIntake(prefs)).map((s) => s.id)).toContain('postureVideo');
  });
});

/*
  ══ PROTOCOLOS CON NOMBRE ═══════════════════════════════════════════════════

  El riesgo declarado del replanteamiento: con varios protocolos, cada cliente
  se compara contra EL SUYO. Si eso se hace mal, la cartera empieza a decir
  «tiene excepciones» a todo el mundo — que es la clase de fallo que hace que
  nadie vuelva a fiarse de la pantalla. Va con pruebas antes que con pantalla.
*/
describe('protocolos con nombre', () => {
  const conRir = toggleModule(defaultProtocol(), 'rir');

  /* Dos protocolos de verdad: uno de serie y otro con una pieza más. */
  const coachPrefs = {
    protocolos: {
      items: [
        { id: 'p1', name: 'Asesoría completa' },
        { id: 'p2', name: 'Powerlifting', ...conRir },
      ],
    },
  };

  it('cada cliente se compara contra el protocolo que lleva puesto', () => {
    const semilla2 = newClientPreferences(coachPrefs, { protocoloId: 'p2' });
    const dePowerlifting = { preferences: semilla2 };

    /* Lleva `rir` porque su protocolo lo lleva: al día, no atrasado. */
    expect(dePowerlifting.preferences.protocolId).toBe('p2');
    expect(necesitaSuPlan(coachPrefs, dePowerlifting)).toBe(false);
    expect(igualASuPlan(coachPrefs, dePowerlifting)).toBe(true);
  });

  it('y NO contra el primero de la lista, que es el fallo que se teme', () => {
    const semilla2 = newClientPreferences(coachPrefs, { protocoloId: 'p2' });
    const dePowerlifting = { preferences: semilla2 };

    /* Comparado contra el protocolo equivocado saldría desviado. Comparado
       contra el suyo, no. Ésa es toda la prueba. */
    const { template: primero } = planDe(coachPrefs, 'p1');
    expect(matchesTemplate(primero, clientProtocol(dePowerlifting.preferences))).toBe(false);
    expect(igualASuPlan(coachPrefs, dePowerlifting)).toBe(true);
  });

  it('un cliente sin marca cuenta como del primero', () => {
    const semilla1 = newClientPreferences(coachPrefs, { protocoloId: 'p1' });
    const sinMarca = { preferences: { ...semilla1, protocolId: undefined } };
    expect(necesitaSuPlan(coachPrefs, sinMarca)).toBe(false);
  });

  /*
    ══ Mover a alguien de protocolo NO le reescribe nada por su cuenta ════════

    Un cliente al que se le apunta otro protocolo pero no se le escribe queda
    «sin decidir y desviado», que `isProtected` protege a propósito (el porqué,
    en su docblock). O sea que reasignar en frío NO empuja nada: hace falta el
    parche, y el parche va con el gesto.

    Es la protección bien puesta, no un fallo — pero conviene tenerla escrita,
    porque de aquí sale que «cambiar de protocolo» tenga que aplicar en el mismo
    gesto y soltar la marca (`applyProtocolToClient`), y no solo apuntar.
  */
  it('mover a alguien de protocolo sin aplicarlo no le toca nada', () => {
    const semilla1 = newClientPreferences(coachPrefs, { protocoloId: 'p1' });
    const movido = { preferences: { ...semilla1, protocolId: 'p2' } };
    expect(protegidoDeSuPlan(coachPrefs, movido)).toBe(true);
    expect(necesitaSuPlan(coachPrefs, movido)).toBe(false);
  });

  it('quien ya aceptó su protocolo y cambia de protocolo SÍ sale atrasado', () => {
    const semilla1 = newClientPreferences(coachPrefs, { protocoloId: 'p1' });
    /* `on: false` es «le pusiste el protocolo y lo aceptó»: es lo que deja
       `applyProtocolToClient` al igualar. Ése sí recibe lo que venga después. */
    const movido = {
      preferences: { ...semilla1, protocolId: 'p2', protocolException: { on: false } },
    };
    expect(necesitaSuPlan(coachPrefs, movido)).toBe(true);

    const parche = parchePara(coachPrefs, movido);
    const puesto = { preferences: { ...movido.preferences, ...parche } };
    expect(necesitaSuPlan(coachPrefs, puesto)).toBe(false);
    expect(puesto.preferences.protocolId).toBe('p2');
  });

  it('el parche respeta lo que es del cliente y no de la plantilla', () => {
    const semilla = newClientPreferences(coachPrefs, { protocoloId: 'p1' });
    const suyo = {
      preferences: {
        ...semilla,
        protocol: { ...semilla.protocol, hidden: { weight: true, nutrition: false } },
      },
    };
    /* Ponerle al día su protocolo NO puede devolverle el peso a quien se lo
       acabas de quitar. Ver `NOT_COMPARED_KEYS`. */
    expect(parchePara(coachPrefs, suyo).protocol.hidden).toEqual({ weight: true, nutrition: false });
  });

  it('el parche conserva los enlaces que el alta ya tenía', () => {
    const semilla = newClientPreferences(coachPrefs, { protocoloId: 'p1' });
    const conVideo = {
      preferences: {
        ...semilla,
        /* `postureReview` está en los pasos de serie y entrega algo: un enlace
           colgado de un paso apagado lo descarta `clientIntake`, y con razón. */
        intake: { ...semilla.intake, links: { postureReview: 'https://x.test/marta' } },
      },
    };
    expect(parchePara(coachPrefs, conVideo).intake.links.postureReview).toBe(
      'https://x.test/marta'
    );
  });

  it('sin protocolos guardados, todo sigue por el camino de siempre', () => {
    expect(usaProtocolos({})).toBe(false);
    expect(newClientPreferences({})).toBe(null);
    expect(usaProtocolos(coachPrefs)).toBe(true);
  });

  it('el plan trae el protocolo resuelto y su alta, listos para preguntar', () => {
    const plan = planDe(coachPrefs, 'p2');
    expect(plan.protocolo.name).toBe('Powerlifting');
    expect(plan.template.modules).toContain('rir');
    expect(Array.isArray(plan.intake.steps)).toBe(true);
  });

  it('un id roto no deja a nadie sin protocolo', () => {
    expect(planDe(coachPrefs, 'no-existe').protocolo.id).toBe('p1');
    expect(planDeCliente(coachPrefs, { preferences: { protocolId: 'zzz' } }).protocolo.id).toBe('p1');
  });
});
