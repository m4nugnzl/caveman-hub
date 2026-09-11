import { describe, expect, it } from 'vitest';

import {
  MAX_FORMULARIOS,
  MOMENTOS,
  buildFormulario,
  catalogoDe,
  coachFormularios,
  cuentaPreguntas,
  defaultFormulario,
  formularioById,
  formulariosDe,
  formulariosMandables,
  formulariosToPreferences,
  anadirPropia,
  moverPregunta,
  preguntasDe,
  preguntasLibres,
  quitarPropia,
  resumenFormulario,
  togglePregunta,
  sanitizeFormulario,
  comoProtocoloDesdeElementos,
  desdeElementos,
  elementosDe,
  estanteria,
  tiposDeMomento,
} from './formularios';
import { DEFAULT_ASKED } from './intakeForm';
import { CHECKIN_QUESTIONS, SESSION_QUESTIONS, checkinQuestions, clientProtocol } from './protocol';
import { sanitizeElementos } from './formulario';

describe('formularios · la mudanza silenciosa', () => {
  it('sin lista guardada, los tres cuestionarios de siempre SON la lista', () => {
    const lista = coachFormularios({});
    expect(lista.filter((f) => f.momento === 'alta')).toHaveLength(1);
    expect(lista.find((f) => f.momento === 'sesion')).toBeTruthy();
    expect(lista.find((f) => f.momento === 'semana')).toBeTruthy();
  });

  it('el parte hereda las preguntas que el entrenador ya tenía en su plantilla', () => {
    const prefs = { protocolTemplate: { questions: ['rpe', 'fatigue', 'note'] } };
    const parte = coachFormularios(prefs).find((f) => f.momento === 'sesion');
    expect(parte.questions).toEqual(['rpe', 'fatigue', 'note']);
  });

  it('el check-in hereda preguntas, bloques y pesajes', () => {
    const prefs = {
      protocolTemplate: {
        checkinQuestions: ['adherence', 'week_note'],
        checkin: { perimeters: 'required', folds: 'off' },
        weighIns: 3,
      },
    };
    const semana = coachFormularios(prefs).find((f) => f.momento === 'semana');
    expect(semana.questions).toEqual(['adherence', 'week_note']);
    expect(semana.checkin).toEqual({ perimeters: 'required', folds: 'off' });
    expect(semana.weighIns).toBe(3);
  });

  it('las altas que ya tenía se conservan con su nombre', () => {
    const prefs = {
      intakeForms: {
        items: [
          { id: 'a', name: 'Pérdida de grasa', asked: ['mealsPerDay'] },
          { id: 'b', name: 'Fuerza', asked: ['experience'] },
        ],
      },
    };
    const altas = formulariosDe(prefs, 'alta');
    expect(altas.map((f) => f.name)).toEqual(['Pérdida de grasa', 'Fuerza']);
  });

  it('los ids heredados son FIJOS: un protocolo que los apunte no se queda huérfano', () => {
    const uno = coachFormularios({});
    const dos = coachFormularios({});
    expect(uno.map((f) => f.id)).toEqual(dos.map((f) => f.id));
  });

  it('con lista guardada, manda la lista', () => {
    const prefs = { formularios: { items: [{ id: 'x', name: 'Solo esto', momento: 'sesion' }] } };
    expect(coachFormularios(prefs)).toHaveLength(1);
    expect(coachFormularios(prefs)[0].name).toBe('Solo esto');
  });
});

describe('formularios · saneado', () => {
  it('sin id no hay formulario', () => {
    expect(sanitizeFormulario({ name: 'x' })).toBeNull();
    expect(sanitizeFormulario(null)).toBeNull();
  });

  it('un momento desconocido cae en el alta', () => {
    expect(sanitizeFormulario({ id: 'x', momento: 'marte' }).momento).toBe('alta');
  });

  it('el alta se sanea con las reglas del alta', () => {
    const f = sanitizeFormulario({ id: 'x', momento: 'alta', asked: ['noExiste', 'mealsPerDay'] });
    expect(f.asked).toEqual(['mealsPerDay']);
    expect(f.askBasics).toBe(true);
  });

  it('una pregunta del catálogo equivocado se cae', () => {
    /* `rpe` es de la sesión: colada en el check-in pediría el esfuerzo del
       domingo, cuando no hay ninguna sesión de la que hablar. */
    const f = sanitizeFormulario({ id: 'x', momento: 'semana', questions: ['rpe', 'adherence'] });
    expect(f.questions).toEqual(['adherence']);
  });

  it('el formulario de sesión vacío se queda vacío, no cae en el de serie', () => {
    const f = sanitizeFormulario({ id: 'x', momento: 'sesion', questions: [] });
    expect(f.questions).toEqual([]);
  });

  it('la semana trae bloques, pesajes y fotos; la sesión no', () => {
    const semana = sanitizeFormulario({ id: 'x', momento: 'semana', askPhotos: true });
    expect(semana.checkin).toBeTruthy();
    expect(semana.askPhotos).toBe(true);
    const sesion = sanitizeFormulario({ id: 'y', momento: 'sesion' });
    expect(sesion.checkin).toBeUndefined();
  });

  it('el nombre se acota y tiene respaldo por momento', () => {
    expect(sanitizeFormulario({ id: 'x', momento: 'sesion', name: '   ' }).name).toBe('El parte');
    expect(sanitizeFormulario({ id: 'x', momento: 'semana', name: '' }).name).toBe('El check-in');
  });

  it('la lista se acota al tope', () => {
    const items = Array.from({ length: MAX_FORMULARIOS + 4 }, (_, i) => ({ id: `f${i}`, momento: 'sesion' }));
    expect(coachFormularios({ formularios: { items } })).toHaveLength(MAX_FORMULARIOS);
  });

  it('guardar y volver a leer no pierde nada', () => {
    const lista = coachFormularios({ protocolTemplate: { checkinQuestions: ['adherence'] } });
    const vuelta = coachFormularios({ formularios: formulariosToPreferences(lista) });
    expect(vuelta.map((f) => f.id)).toEqual(lista.map((f) => f.id));
    expect(vuelta.find((f) => f.momento === 'semana').questions).toEqual(['adherence']);
  });
});

describe('formularios · lectura', () => {
  it('cuenta las tandas del alta como una cada una', () => {
    const f = { momento: 'alta', asked: ['a', 'b'], custom: [{ id: 'c' }], askBasics: true, askHealth: true };
    // 2 preguntas + 1 propia + 3 de «quién es» + 1 de salud
    expect(cuentaPreguntas(f)).toBe(7);
  });

  it('las medidas se dicen aparte de las preguntas', () => {
    const f = {
      momento: 'semana',
      questions: ['adherence', 'week_note'],
      checkin: { perimeters: 'optional', folds: 'off' },
      weighIns: 3,
      askPhotos: true,
    };
    expect(resumenFormulario(f)).toBe('2 preguntas + 3 medidas');
  });

  it('sin medidas, solo las preguntas', () => {
    const f = { momento: 'semana', questions: ['adherence'], checkin: { perimeters: 'off', folds: 'off' }, weighIns: 0 };
    expect(resumenFormulario(f)).toBe('1 pregunta');
  });

  it('cada momento tiene su catálogo', () => {
    expect(catalogoDe('sesion')).toBe(SESSION_QUESTIONS);
    expect(catalogoDe('semana')).toBe(CHECKIN_QUESTIONS);
    expect(catalogoDe('alta')).toEqual([]);
  });

  it('uno nuevo de alta nace con las diez de siempre; los otros dos, vacíos', () => {
    expect(buildFormulario({ name: 'X', momento: 'alta' }).asked).toEqual(DEFAULT_ASKED);
    expect(buildFormulario({ name: 'X', momento: 'sesion' }).questions).toEqual([]);
    expect(defaultFormulario('semana').questions).toEqual([]);
  });

  it('un id roto devuelve el primero de su momento, no null', () => {
    const prefs = {};
    expect(formularioById(prefs, 'no-existe', 'semana').momento).toBe('semana');
  });

  it('los momentos tienen su etiqueta, y el suelto va el último', () => {
    /* Los tres primeros son momentos del protocolo; el cuarto no es un momento
       —el suelto no sabe cuándo se pide— pero vive en la misma lista para que
       nadie tenga que recordar la excepción al sanear o al contar. */
    expect(MOMENTOS.map((m) => m.id)).toEqual(['alta', 'sesion', 'semana', 'libre']);
    expect(MOMENTOS.every((m) => m.label && m.corto)).toBe(true);
    expect(MOMENTOS.filter((m) => m.lista).map((m) => m.id)).toEqual(['sesion', 'semana']);
  });

  it('un formulario suelto se sanea por sus elementos y no por el protocolo', () => {
    const suelto = sanitizeFormulario({
      id: 'f1',
      momento: 'libre',
      name: 'Hábitos de sueño',
      elementos: [{ id: 'e1', tipo: 'numero', enun: 'Horas' }, { id: 'e2', tipo: 'inventado' }],
    });
    expect(suelto.momento).toBe('libre');
    expect(suelto.elementos).toHaveLength(1);
    expect(cuentaPreguntas(suelto)).toBe(1);
  });
});

describe('formularios · editar las preguntas de sesión y semana', () => {
  const base = { id: 'x', name: 'Parte', momento: 'sesion', questions: ['rpe'], custom: [] };

  it('encender y apagar una del catálogo', () => {
    const con = togglePregunta(base, 'fatigue');
    expect(con.questions).toEqual(['rpe', 'fatigue']);
    expect(togglePregunta(con, 'rpe').questions).toEqual(['fatigue']);
  });

  it('la nueva se pone AL FINAL, donde se ha pulsado', () => {
    const con = togglePregunta(togglePregunta(base, 'fatigue'), 'sleep');
    expect(con.questions).toEqual(['rpe', 'fatigue', 'sleep']);
  });

  it('mover respeta los bordes', () => {
    const con = togglePregunta(base, 'fatigue');
    expect(moverPregunta(con, 'fatigue', 'up').questions).toEqual(['fatigue', 'rpe']);
    expect(moverPregunta(con, 'rpe', 'up').questions).toEqual(['rpe', 'fatigue']);
  });

  it('una propia nace puesta en la lista de este formulario', () => {
    const con = anadirPropia(base, { label: 'Molestia en el hombro', kind: 'scale', max: 10 });
    expect(con.custom).toHaveLength(1);
    expect(con.questions).toHaveLength(2);
    expect(con.questions[1]).toBe(con.custom[0].id);
  });

  it('borrar una propia la saca también de la lista', () => {
    const con = anadirPropia(base, { label: 'Mía', kind: 'text' });
    const sin = quitarPropia(con, con.custom[0].id);
    expect(sin.custom).toEqual([]);
    expect(sin.questions).toEqual(['rpe']);
  });

  it('las preguntas se resuelven en el orden del entrenador', () => {
    const con = togglePregunta(base, 'sleep');
    expect(preguntasDe(con).map((q) => q.id)).toEqual(['rpe', 'sleep']);
    expect(preguntasDe({ momento: 'alta' })).toEqual([]);
  });

  it('las libres son las del catálogo que faltan', () => {
    const libres = preguntasLibres(base).map((q) => q.id);
    expect(libres).not.toContain('rpe');
    expect(libres.length).toBe(SESSION_QUESTIONS.length - 1);
  });

  it('la semana usa SU catálogo, no el de la sesión', () => {
    const semana = { id: 'y', momento: 'semana', questions: [], custom: [] };
    const libres = preguntasLibres(semana).map((q) => q.id);
    expect(libres).toEqual(CHECKIN_QUESTIONS.map((q) => q.id));
    expect(togglePregunta(semana, 'rpe').questions).toEqual([]);
  });
});

/*
  ══ LA ESTANTERÍA ═══════════════════════════════════════════════════════════

  Estas pruebas vigilan la promesa entera de la tanda: el catálogo se puede
  coger, tocar y devolver, y al otro lado NADIE se entera. «Nadie» son siete
  consumidores reales —el portal, la revisión semanal, el panel del cuerpo, la
  tarjeta de sensaciones, el historial, los ajustes del cliente y las acciones—
  y todos pasan por `checkinQuestions` / `activeQuestions`, así que basta con
  comprobar que la forma que sale por ahí sigue siendo la de siempre.
*/
describe('formularios · la estantería', () => {
  it('el catálogo se sirve como elementos con su origen puesto', () => {
    const balda = estanteria('semana');

    expect(balda).toHaveLength(CHECKIN_QUESTIONS.length);
    expect(balda.map((e) => e.origen)).toEqual(CHECKIN_QUESTIONS.map((q) => q.id));

    const adherencia = balda.find((e) => e.origen === 'adherence');
    const deSerie = CHECKIN_QUESTIONS.find((q) => q.id === 'adherence');
    expect(adherencia.tipo).toBe('escala');
    expect(adherencia.enun).toBe(deSerie.label);
    expect(adherencia.min).toBe(deSerie.min);
    expect(adherencia.max).toBe(deSerie.max);
  });

  it('cada llamada da ids nuevos: son plantillas, no objetos vivos', () => {
    const unos = estanteria('sesion').map((e) => e.id);
    const otros = estanteria('sesion').map((e) => e.id);
    expect(unos.some((id) => otros.includes(id))).toBe(false);
  });

  it('las de texto libre entran como párrafo y sin rango', () => {
    const texto = CHECKIN_QUESTIONS.find((q) => q.kind !== 'scale');
    const elem = estanteria('semana').find((e) => e.origen === texto.id);
    expect(elem.tipo).toBe('parrafo');
    expect(elem.min).toBeUndefined();
  });

  it('un formulario del modelo viejo se lee como elementos', () => {
    const semana = {
      momento: 'semana',
      questions: ['adherence', 'hunger'],
      custom: [],
      checkin: { perimeters: 'optional', folds: 'off' },
      weighIns: 3,
    };

    const elementos = elementosDe(sanitizeFormulario({ id: 'f1', ...semana }));

    /* El oficio va delante: primero te pesas y te mides, después cuentas. */
    expect(elementos.map((e) => e.tipo).slice(0, 2)).toEqual(['peso', 'perimetros']);
    expect(elementos.some((e) => e.tipo === 'pliegues')).toBe(false);
    expect(elementos.filter((e) => e.tipo === 'escala').map((e) => e.origen)).toEqual([
      'adherence',
      'hunger',
    ]);
  });

  it('las fotos son un elemento más, y quitarlo las apaga', () => {
    const conFotos = sanitizeFormulario({
      id: 'f1',
      momento: 'semana',
      questions: [],
      weighIns: 1,
      askPhotos: true,
    });

    const elementos = elementosDe(conFotos);
    expect(elementos.some((e) => e.tipo === 'fotos')).toBe(true);
    expect(comoProtocoloDesdeElementos(elementos, 'semana').askPhotos).toBe(true);

    /* Y al quitarlo del lienzo se apagan de verdad. `askPhotos` se emite
       siempre, puesto o no: si solo se emitiera al ponerlo, el campo viejo se
       quedaría encendido para siempre. */
    const sinFotos = elementos.filter((e) => e.tipo !== 'fotos');
    expect(comoProtocoloDesdeElementos(sinFotos, 'semana').askPhotos).toBe(false);
  });

  it('cada momento solo ofrece lo que sabe guardar', () => {
    /* El parte y el check-in guardan escala o texto, y nada más: ofrecer ahí
       «Elegir una» sería perder las opciones en silencio al guardar. */
    expect(tiposDeMomento('sesion')).toEqual(['escala', 'parrafo']);
    expect(tiposDeMomento('semana')).toContain('pliegues');
    expect(tiposDeMomento('semana')).not.toContain('una');
    /* Las fotos necesitan el asistente de la revisión, que un suelto no tiene. */
    expect(tiposDeMomento('libre')).not.toContain('fotos');
    expect(tiposDeMomento('libre')).toContain('una');
    expect(tiposDeMomento('alta')).toEqual([]);
  });

  it('el formulario entero va y vuelve por el lienzo sin perder nada', () => {
    const original = sanitizeFormulario({
      id: 'f1',
      name: 'El check-in',
      momento: 'semana',
      questions: ['adherence', 'hunger'],
      checkin: { perimeters: 'required', folds: 'optional' },
      weighIns: 2,
      askPhotos: true,
    });

    const vuelta = desdeElementos(original, elementosDe(original));

    expect(vuelta.name).toBe('El check-in');
    expect(vuelta.questions).toEqual(['adherence', 'hunger']);
    expect(vuelta.checkin).toEqual({ perimeters: 'required', folds: 'optional' });
    expect(vuelta.weighIns).toBe(2);
    expect(vuelta.askPhotos).toBe(true);
  });

  it('al parte no se le escriben medidas: no mide nada', () => {
    const parte = sanitizeFormulario({ id: 'f2', momento: 'sesion', questions: ['rpe'] });
    const vuelta = desdeElementos(parte, elementosDe(parte));
    expect(vuelta.questions).toEqual(['rpe']);
    expect(vuelta.checkin).toBeUndefined();
    expect(vuelta.weighIns).toBeUndefined();
  });

  it('el alta no pasa por el lienzo: su modelo son campos, no preguntas', () => {
    const alta = sanitizeFormulario({ id: 'f3', momento: 'alta', asked: ['mealsPerDay'] });
    expect(desdeElementos(alta, [])).toBe(alta);
  });

  it('ida y vuelta sin tocar nada: sale lo mismo que entró', () => {
    const original = sanitizeFormulario({
      id: 'f1',
      momento: 'semana',
      questions: ['adherence', 'hunger'],
      checkin: { perimeters: 'required', folds: 'optional' },
      weighIns: 2,
    });

    const vuelta = comoProtocoloDesdeElementos(elementosDe(original), 'semana');

    expect(vuelta.checkinQuestions).toEqual(['adherence', 'hunger']);
    expect(vuelta.checkin).toEqual({ perimeters: 'required', folds: 'optional' });
    /* Nada tocado, nada que guardar: el catálogo ya sirve estas dos. Es lo que
       protege los 8 KB de `preferences` del cliente (migración 0008). */
    expect(vuelta.custom).toEqual([]);
  });

  it('lo retocado se guarda, lo intacto no', () => {
    const elementos = sanitizeElementos([
      ...estanteria('semana')
        .filter((e) => ['adherence', 'hunger'].includes(e.origen))
        .map((e) => (e.origen === 'adherence' ? { ...e, enun: 'Cómo has comido' } : e)),
    ]);

    const { custom, checkinQuestions: ids } = comoProtocoloDesdeElementos(elementos, 'semana');

    expect(ids).toEqual(['adherence', 'hunger']);
    expect(custom.map((q) => q.id)).toEqual(['adherence']);
    expect(custom[0].label).toBe('Cómo has comido');
  });

  it('renombrar una del catálogo NO parte su serie: mismo id y mismo color', () => {
    const elementos = estanteria('semana')
      .filter((e) => e.origen === 'adherence')
      .map((e) => ({ ...e, enun: 'Cómo has comido', max: 5 }));

    const protocolo = clientProtocol({
      protocol: comoProtocoloDesdeElementos(sanitizeElementos(elementos), 'semana'),
    });
    const [pregunta] = checkinQuestions(protocolo);
    const deSerie = CHECKIN_QUESTIONS.find((q) => q.id === 'adherence');

    expect(pregunta.id).toBe('adherence');
    expect(pregunta.label).toBe('Cómo has comido');
    expect(pregunta.max).toBe(5);
    expect(pregunta.color).toBe(deSerie.color);
  });

  it('una pregunta escrita de cero viaja entera y sin origen', () => {
    const propia = {
      id: 'el_mia',
      tipo: 'escala',
      enun: '¿Cuánto te ha costado?',
      ayuda: 'Del 1 al 10',
      min: 1,
      max: 10,
      mejorAbajo: true,
      cae: 'serie',
      oblig: false,
    };

    const { checkinQuestions: ids, custom } = comoProtocoloDesdeElementos([propia], 'semana');

    expect(ids).toEqual(['el_mia']);
    expect(custom[0]).toMatchObject({
      id: 'el_mia',
      label: '¿Cuánto te ha costado?',
      kind: 'scale',
      lowerIsBetter: true,
    });
  });

  it('la misma pregunta del catálogo puesta dos veces se queda en una', () => {
    /* Dos elementos con el mismo `origen` producirían dos entradas con el mismo
       id, y la segunda se caería más tarde y en otro sitio: un renglón que se ve
       en el lienzo y no le llega al cliente. */
    const dos = estanteria('sesion').filter((e) => e.origen === 'rpe');
    const elementos = sanitizeElementos([...dos, ...dos.map((e) => ({ ...e, id: 'otro' }))]);

    expect(elementos).toHaveLength(1);
  });

  it('los apartados y las notas no cruzan al modelo viejo', () => {
    const elementos = sanitizeElementos([
      { id: 'a1', tipo: 'apartado', enun: 'Cómo ha ido' },
      ...estanteria('sesion').filter((e) => e.origen === 'rpe'),
    ]);

    const { questions } = comoProtocoloDesdeElementos(elementos, 'sesion');
    expect(questions).toEqual(['rpe']);
  });
});

/**
 * LOS QUE SE PUEDEN MANDAR, que no son todos.
 *
 * Esto no es una comodidad de la pantalla: `filasDeEnvio` congela las preguntas
 * en `schema.elementos`, y un formulario de alta o el check-in no tienen
 * `elementos` —sus preguntas viven en la forma de su momento—. Ofrecerlos como
 * paso de una automatización no daba ningún error: le mandaba al cliente **un
 * cuestionario en blanco**, y la lista lo decía en voz baja («0 preguntas») sin
 * que eso impidiera nada.
 */
describe('formulariosMandables', () => {
  const prefs = {
    formularios: {
      items: [
        { id: 'f_libre', momento: 'libre', name: 'Analítica', elementos: [{ id: 'e1', tipo: 'texto', enun: '¿Qué tal?' }] },
        { id: 'f_vacio', momento: 'libre', name: 'Sin nada', elementos: [] },
        { id: 'f_alta', momento: 'alta', name: 'Alta general' },
        { id: 'f_semana', momento: 'semana', name: 'El check-in' },
      ],
    },
  };

  it('solo los libres, y solo si tienen preguntas', () => {
    expect(formulariosMandables(prefs).map((f) => f.id)).toEqual(['f_libre']);
  });

  it('sin lista guardada no hay ninguno: los heredados no viajan sueltos', () => {
    /* Los tres de siempre —el alta, el parte y el check-in— salen del protocolo
       y se le piden por su premisa, no como acción suelta. */
    expect(formulariosMandables({})).toEqual([]);
  });
});
