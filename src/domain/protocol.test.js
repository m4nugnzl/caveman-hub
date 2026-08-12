import { describe, expect, it } from 'vitest';

import {
  MAX_CUSTOM,
  activeQuestions,
  addCustomQuestion,
  asksFeedback,
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
