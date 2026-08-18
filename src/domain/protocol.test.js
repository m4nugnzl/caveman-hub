import { describe, expect, it } from 'vitest';

import {
  CHECKIN_QUESTIONS,
  MAX_CUSTOM,
  SESSION_QUESTIONS,
  activeQuestions,
  addCustomQuestion,
  answersSummary,
  asksBlock,
  asksCheckinQuestions,
  asksFeedback,
  checkinBlocks,
  checkinMode,
  checkinQuestions,
  requiredBlocks,
  requiresBlock,
  setCheckinMode,
  clientProtocol,
  defaultProtocol,
  isModuleOn,
  moveQuestion,
  questionById,
  removeCustomQuestion,
  scaleQuestions,
  toggleModule,
  toggleQuestion,
} from './protocol';
import { COMPARED_KEYS, matchesTemplate } from '@/lib/protocolTemplate';

describe('clientProtocol', () => {
  it('un cliente sin configurar recibe el protocolo por defecto', () => {
    expect(clientProtocol(undefined)).toEqual(defaultProtocol());
    expect(clientProtocol({})).toEqual(defaultProtocol());
  });

  it('ignora módulos y preguntas que no existen', () => {
    /*
      Es lo que permite retirar una pregunta del catálogo en una versión futura
      sin dejar clientes rotos: lo desconocido se cae en silencio en vez de
      llegar a la interfaz como un `undefined`.
    */
    const protocol = clientProtocol({
      protocol: { modules: ['warmup', 'telepatia'], questions: ['rpe', 'inventada'] },
    });

    expect(protocol.modules).toEqual(['warmup']);
    expect(protocol.questions).toEqual(['rpe']);
  });

  it('no deja que una pregunta propia suplante a una del catálogo', () => {
    /*
      `questionById` resuelve primero el catálogo. Una pregunta propia con el id
      `rpe` quedaría inalcanzable, y el entrenador vería la de serie en su sitio
      sin entender por qué su etiqueta no aparece.
    */
    const protocol = clientProtocol({
      protocol: { questions: ['rpe'], custom: [{ id: 'rpe', label: 'Mi RPE' }] },
    });

    expect(protocol.custom).toEqual([]);
    expect(questionById(protocol, 'rpe').label).toBe('Esfuerzo de la sesión');
  });

  it('descarta duplicados conservando el orden elegido', () => {
    const protocol = clientProtocol({
      protocol: { questions: ['note', 'rpe', 'note'], modules: ['warmup', 'warmup'] },
    });

    expect(protocol.questions).toEqual(['note', 'rpe']);
    expect(protocol.modules).toEqual(['warmup']);
  });
});

describe('preguntas propias', () => {
  it('nacen activas y al final de la lista', () => {
    const before = defaultProtocol();
    const after = addCustomQuestion(before, { label: 'Molestia de hombro', max: 5 });

    expect(after.custom).toHaveLength(1);
    expect(after.questions[after.questions.length - 1]).toBe(after.custom[0].id);
    expect(after.custom[0].max).toBe(5);
  });

  it('respeta el tope, que existe por el límite de 8 KB de la columna', () => {
    let protocol = defaultProtocol();
    for (let i = 0; i < MAX_CUSTOM + 3; i += 1) {
      protocol = addCustomQuestion(protocol, { label: `Pregunta ${i}` });
    }
    expect(protocol.custom).toHaveLength(MAX_CUSTOM);
  });

  it('quitarlas las saca también de la lista de activas', () => {
    const protocol = addCustomQuestion(defaultProtocol(), { label: 'Rodilla' });
    const id = protocol.custom[0].id;
    const after = removeCustomQuestion(protocol, id);

    expect(after.custom).toHaveLength(0);
    expect(after.questions).not.toContain(id);
  });

  it('una etiqueta vacía no crea nada', () => {
    expect(addCustomQuestion(defaultProtocol(), { label: '   ' })).toEqual(defaultProtocol());
  });
});

describe('orden y activación', () => {
  it('al añadir una pregunta va al final, no al orden del catálogo', () => {
    /*
      El orden de las preguntas es del entrenador: es el orden en que se
      contestan de pie en el gimnasio. Si al activarla saltara a su sitio del
      catálogo, la pantalla se reordenaría sola bajo el dedo.
    */
    const protocol = toggleQuestion({ ...defaultProtocol(), questions: ['rpe'] }, 'pain');
    expect(protocol.questions).toEqual(['rpe', 'pain']);
  });

  it('mover respeta los extremos', () => {
    const base = { ...defaultProtocol(), questions: ['rpe', 'pain', 'note'] };
    expect(moveQuestion(base, 'rpe', 'up').questions).toEqual(['rpe', 'pain', 'note']);
    expect(moveQuestion(base, 'rpe', 'down').questions).toEqual(['pain', 'rpe', 'note']);
    expect(moveQuestion(base, 'note', 'down').questions).toEqual(['rpe', 'pain', 'note']);
  });

  it('los módulos se ordenan por catálogo al encenderlos', () => {
    const protocol = toggleModule({ ...defaultProtocol(), modules: ['clientNote'] }, 'warmup');
    expect(protocol.modules).toEqual(['warmup', 'clientNote']);
  });
});

describe('lectura', () => {
  const protocol = clientProtocol({
    protocol: {
      modules: ['sessionFeedback'],
      questions: ['pain', 'painZone', 'rpe'],
    },
  });

  it('activeQuestions resuelve y conserva el orden', () => {
    expect(activeQuestions(protocol).map((q) => q.id)).toEqual(['pain', 'painZone', 'rpe']);
  });

  it('scaleQuestions deja fuera el texto, que no se puede medir', () => {
    expect(scaleQuestions(protocol).map((q) => q.id)).toEqual(['pain', 'rpe']);
  });

  it('asksFeedback pide las dos cosas: el módulo encendido Y alguna pregunta', () => {
    expect(asksFeedback(protocol)).toBe(true);
    expect(asksFeedback({ ...protocol, questions: [] })).toBe(false);
    expect(asksFeedback({ ...protocol, modules: [] })).toBe(false);
    expect(isModuleOn(protocol, 'warmup')).toBe(false);
  });
});

/*
  ══ Los tres estados del check-in ═══════════════════════════════════════════

  Lo que protege esto es el valor por defecto: un cliente sin configurar —o con
  un estado escrito a mano que no existe— tiene que seguir viendo los dos bloques
  como opcionales, que es lo que hacía la aplicación antes de que esto se pudiera
  configurar. Cualquier otro respaldo le apaga o le exige a alguien un bloque que
  no ha pedido.
*/
describe('qué se mide en el check-in', () => {
  it('sin configurar, los dos son opcionales y ninguno se exige', () => {
    const protocol = clientProtocol(undefined);
    expect(checkinMode(protocol, 'folds')).toBe('optional');
    expect(checkinMode(protocol, 'perimeters')).toBe('optional');
    expect(asksBlock(protocol, 'folds')).toBe(true);
    expect(requiresBlock(protocol, 'folds')).toBe(false);
    expect(requiredBlocks(protocol)).toEqual([]);
  });

  it('cada bloque va por su cuenta', () => {
    let protocol = clientProtocol(undefined);
    protocol = setCheckinMode(protocol, 'perimeters', 'required');
    protocol = setCheckinMode(protocol, 'folds', 'off');

    expect(requiredBlocks(protocol).map((b) => b.id)).toEqual(['perimeters']);
    expect(checkinBlocks(protocol).map((b) => b.id)).toEqual(['perimeters']);
    expect(asksBlock(protocol, 'folds')).toBe(false);
  });

  it('un estado o un bloque que no existen no cambian nada', () => {
    const protocol = clientProtocol(undefined);
    expect(setCheckinMode(protocol, 'folds', 'obligatorio')).toBe(protocol);
    expect(setCheckinMode(protocol, 'peso', 'off')).toBe(protocol);
  });

  it('lo guardado se lee, y lo que no se reconoce vuelve a opcional', () => {
    const protocol = clientProtocol({
      protocol: { checkin: { folds: 'required', perimeters: 'a saber' } },
    });
    expect(checkinMode(protocol, 'folds')).toBe('required');
    expect(checkinMode(protocol, 'perimeters')).toBe('optional');
  });

  /* Sobrevivir a la ida y vuelta importa más aquí que en otras claves: se guarda
     el objeto entero (`updateClientPreferences` fusiona por sección) y un
     `checkin` que se perdiera al leer volvería a «opcional» en silencio, con el
     entrenador convencido de que lo dejó exigido. */
  it('sobrevive a la ida y vuelta por preferencias', () => {
    const puesto = setCheckinMode(clientProtocol(undefined), 'folds', 'required');
    expect(checkinMode(clientProtocol({ protocol: puesto }), 'folds')).toBe('required');
  });
});

/* ==========================================================================
   El cuestionario del check-in
   ========================================================================== */

describe('preguntas del check-in', () => {
  it('por defecto no hay cuestionario', () => {
    /* La lista vacía ES el apagado: sin interruptor propio, y por tanto sin un
       módulo más que encender antes de poder elegir preguntas. */
    const protocol = clientProtocol(undefined);
    expect(protocol.checkinQuestions).toEqual([]);
    expect(checkinQuestions(protocol)).toEqual([]);
    expect(asksCheckinQuestions(protocol)).toBe(false);
  });

  it('las dos listas son independientes', () => {
    const protocol = clientProtocol({
      protocol: { questions: ['rpe'], checkinQuestions: ['adherence', 'hunger'] },
    });
    expect(protocol.questions).toEqual(['rpe']);
    expect(protocol.checkinQuestions).toEqual(['adherence', 'hunger']);
    expect(asksCheckinQuestions(protocol)).toBe(true);
  });

  /*
    Cada lista solo acepta ids de SU catálogo. Sin esto, `rpe` colado en el
    cuestionario pediría el esfuerzo de «la sesión» un domingo, cuando no hay
    ninguna sesión de la que hablar; y `adherence` en el feedback preguntaría por
    la adherencia de la semana al bajar de la prensa.
  */
  it('una lista no acepta preguntas de la otra', () => {
    const protocol = clientProtocol({
      protocol: { questions: ['rpe', 'adherence'], checkinQuestions: ['hunger', 'rpe'] },
    });
    expect(protocol.questions).toEqual(['rpe']);
    expect(protocol.checkinQuestions).toEqual(['hunger']);
  });

  it('resuelve las preguntas en el orden elegido', () => {
    const protocol = clientProtocol({
      protocol: { checkinQuestions: ['week_note', 'adherence'] },
    });
    expect(checkinQuestions(protocol).map((q) => q.id)).toEqual(['week_note', 'adherence']);
  });

  it('todas las del catálogo tienen la forma que espera SessionFeedback', () => {
    for (const q of CHECKIN_QUESTIONS) {
      expect(q.id).toBeTruthy();
      expect(q.label).toBeTruthy();
      expect(['scale', 'text']).toContain(q.kind);
      if (q.kind === 'scale') {
        expect(q.max).toBeGreaterThan(q.min ?? 1);
        expect(q.color).toMatch(/^var\(--data-/);
      }
    }
  });

  /* Un id repetido entre los dos catálogos haría que `questionById` resolviera
     el equivocado, y la pregunta de la otra pantalla saldría con una etiqueta
     que no es la suya. */
  it('ningún id se repite entre los dos catálogos', () => {
    const ids = [...SESSION_QUESTIONS, ...CHECKIN_QUESTIONS].map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('se pueden añadir, mover y quitar sin tocar la lista de sesión', () => {
    let protocol = clientProtocol({ protocol: { questions: ['rpe', 'note'] } });

    protocol = toggleQuestion(protocol, 'adherence', 'checkinQuestions');
    protocol = toggleQuestion(protocol, 'hunger', 'checkinQuestions');
    expect(protocol.checkinQuestions).toEqual(['adherence', 'hunger']);

    protocol = moveQuestion(protocol, 'hunger', 'up', 'checkinQuestions');
    expect(protocol.checkinQuestions).toEqual(['hunger', 'adherence']);

    protocol = toggleQuestion(protocol, 'hunger', 'checkinQuestions');
    expect(protocol.checkinQuestions).toEqual(['adherence']);
    expect(protocol.questions).toEqual(['rpe', 'note']);
  });

  it('sin decir lista se opera sobre la de la sesión, como siempre', () => {
    const protocol = toggleQuestion(clientProtocol(undefined), 'rpe');
    expect(protocol.questions).toEqual(['note']);
  });

  /* Las propias del entrenador valen para las dos listas: las escribió él
     sabiendo para qué, y obligarle a teclearlas dos veces acabaría en dos
     preguntas iguales con dos series distintas. */
  it('una pregunta propia se puede usar en el cuestionario', () => {
    let protocol = addCustomQuestion(
      clientProtocol(undefined),
      { label: 'Comidas fuera de casa' },
      'checkinQuestions'
    );
    const propia = protocol.custom[0];

    expect(protocol.checkinQuestions).toEqual([propia.id]);
    expect(protocol.questions).not.toContain(propia.id);

    protocol = toggleQuestion(protocol, propia.id, 'questions');
    expect(protocol.questions).toContain(propia.id);
    expect(checkinQuestions(protocol).map((q) => q.id)).toEqual([propia.id]);
  });

  /* Borrarla la saca de LAS DOS. Si solo saliera de una, la pregunta seguiría
     activa en la otra sin existir en ningún catálogo, y `activeQuestions` la
     descartaría en silencio: un hueco que nadie sabría explicar. */
  it('borrar una pregunta propia la quita de las dos listas', () => {
    let protocol = addCustomQuestion(clientProtocol(undefined), { label: 'Digestión rara' });
    const propia = protocol.custom[0];
    protocol = toggleQuestion(protocol, propia.id, 'checkinQuestions');

    protocol = removeCustomQuestion(protocol, propia.id);
    expect(protocol.questions).not.toContain(propia.id);
    expect(protocol.checkinQuestions).not.toContain(propia.id);
    expect(protocol.custom).toEqual([]);
  });

  it('una propia no puede llamarse como una del catálogo del check-in', () => {
    const protocol = clientProtocol({
      protocol: { custom: [{ id: 'hunger', label: 'La mía', kind: 'scale' }] },
    });
    expect(protocol.custom).toEqual([]);
  });

  it('sobrevive a la ida y vuelta por preferencias', () => {
    const puesto = toggleQuestion(clientProtocol(undefined), 'adherence', 'checkinQuestions');
    const leido = clientProtocol({ protocol: puesto });
    expect(leido.checkinQuestions).toEqual(['adherence']);
  });
});

/*
  ══ Por qué esta prueba vive aquí y no en un archivo de la plantilla ═════════

  Porque lo que vigila es una relación entre dos módulos: cada parte del
  protocolo tiene que entrar en la comparación con la plantilla del entrenador.
  De esa comparación cuelga el botón «Aplicar a todos», así que una parte que se
  quede fuera no da un resultado un poco peor: apaga el botón y deja la pantalla
  afirmando que los clientes ya tienen algo que no tienen.

  Ha fallado dos veces —con los bloques del check-in y con el cuestionario—, las
  dos por lo mismo: alguien añadió una clave al protocolo y no se enteró de que
  había un segundo sitio que enumerarlas.
*/
describe('la plantilla compara el protocolo ENTERO', () => {
  it('no hay ninguna clave del protocolo fuera de la comparación', () => {
    expect([...Object.keys(defaultProtocol())].sort()).toEqual([...COMPARED_KEYS].sort());
  });

  it('un cuestionario distinto cuenta como desvío', () => {
    const plantilla = clientProtocol({ protocol: { checkinQuestions: ['adherence'] } });
    const suyo = clientProtocol({ protocol: { checkinQuestions: [] } });

    expect(matchesTemplate(plantilla, suyo)).toBe(false);
    expect(matchesTemplate(plantilla, plantilla)).toBe(true);
  });

  it('también cuenta el ORDEN de las preguntas', () => {
    const a = clientProtocol({ protocol: { checkinQuestions: ['adherence', 'hunger'] } });
    const b = clientProtocol({ protocol: { checkinQuestions: ['hunger', 'adherence'] } });
    expect(matchesTemplate(a, b)).toBe(false);
  });
});

describe('answersSummary', () => {
  const protocol = clientProtocol({
    protocol: {
      checkinQuestions: ['adherence', 'hunger', 'week_sleep', 'motivation', 'week_note'],
    },
  });

  it('resume las escalas contestadas', () => {
    expect(answersSummary(protocol, { adherence: '8', hunger: '4' })).toBe('Dieta 8 · Hambre 4');
  });

  /* Tres cifras se leen de un vistazo en la sub-línea de una fila de lista; las
     cinco se leen igual de mal que no ponerlas. */
  it('corta en tres y cuenta el resto', () => {
    expect(
      answersSummary(protocol, { adherence: '8', hunger: '4', week_sleep: '6', motivation: '9' })
    ).toBe('Dieta 8 · Hambre 4 · Sueño 6 · +1');
  });

  /* Las de texto se cuentan pero no se citan: cuatro líneas cortadas a treinta
     caracteres no informan, engañan sobre lo que ponen. */
  it('cuenta las notas sin citarlas', () => {
    expect(
      answersSummary(protocol, { adherence: '8', week_note: 'Me fui de viaje el jueves' })
    ).toBe('Dieta 8 · 1 nota');
  });

  it('sin respuestas no dice nada', () => {
    expect(answersSummary(protocol, null)).toBe('');
    expect(answersSummary(protocol, {})).toBe('');
    expect(answersSummary(protocol, { adherence: '  ' })).toBe('');
  });

  /* Una respuesta de una pregunta que el entrenador ya quitó no se pinta: no hay
     forma de saber cómo se llamaba ni de qué escala era. */
  it('ignora respuestas de preguntas que ya no se hacen', () => {
    expect(answersSummary(protocol, { digestion: '7' })).toBe('');
  });
});
