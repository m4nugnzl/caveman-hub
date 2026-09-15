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
  modulesFor,
  moveQuestion,
  questionById,
  removeCustomQuestion,
  scaleQuestions,
  toggleModule,
  toggleQuestion,
  toggleService,
  activeServices,
  queLeLlevas,
  isServiceOn,
  asksWeighIns,
  setWeighIns,
  weighInsTarget,
  HIDDEN_INFO,
  hiddenFor,
  hidesFromClient,
  toggleHidden,
  QUESTION_KINDS,
  diceRespuesta,
  esRespuesta,
  esSerie,
  esTexto,
  hayRespuesta,
  seVe,
  zonaEscrita,
  zonasDe,
} from './protocol';
import {
  COMPARED_KEYS,
  NOT_COMPARED_KEYS,
  matchesTemplate,
  templateForClient,
} from '@/lib/protocolTemplate';

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

  it('una propia con el id de una del catálogo LA PISA, y conserva su color', () => {
    /*
      Es la invariante que convierte al catálogo en una ESTANTERÍA: insertas
      «Esfuerzo de la sesión» y a partir de ahí es tuya. Antes esto se caía —el
      catálogo mandaba y la propia quedaba inalcanzable—, y era exactamente lo que
      dejaba las preguntas del protocolo como interruptores intocables.

      El id se conserva a propósito: ES la serie de la analítica, y el color sale
      del catálogo para que la línea siga siendo la misma línea después de
      renombrarla.
    */
    const deSerie = SESSION_QUESTIONS.find((q) => q.id === 'rpe');
    const protocol = clientProtocol({
      protocol: { questions: ['rpe'], custom: [{ id: 'rpe', label: 'Cuánto has apretado' }] },
    });

    const rpe = questionById(protocol, 'rpe');
    expect(rpe.label).toBe('Cuánto has apretado');
    expect(rpe.color).toBe(deSerie.color);
    expect(rpe.short).toBe(deSerie.short);
    expect(protocol.questions).toEqual(['rpe']);
  });

  it('los retoques del catálogo no gastan el cupo de preguntas propias', () => {
    /*
      `MAX_CUSTOM` acota lo que el entrenador INVENTA, que es lo que puede crecer
      sin fin. Si los retoques contaran, quien haya ajustado el rango de tres
      preguntas de serie se quedaría sin poder escribir ninguna suya.
    */
    const retoques = SESSION_QUESTIONS.slice(0, 3).map((q) => ({ ...q, label: `Mi ${q.label}` }));
    const inventadas = Array.from({ length: MAX_CUSTOM }, (_, i) => ({
      id: `propia_${i}`,
      label: `La mía ${i}`,
      kind: 'scale',
    }));

    const protocol = clientProtocol({ protocol: { custom: [...retoques, ...inventadas] } });

    expect(protocol.custom).toHaveLength(retoques.length + MAX_CUSTOM);
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

  /*
    Las equivalencias de la dieta son un módulo más —«el entrenador decide qué
    existe en su app»— y nacen APAGADAS: dar margen al cliente es un acto, no
    algo que aparece solo con una versión nueva.
  */
  it('las equivalencias de la dieta existen como módulo y nacen apagadas', () => {
    expect(isModuleOn(defaultProtocol(), 'dietSwaps')).toBe(false);
    expect(isModuleOn(toggleModule(defaultProtocol(), 'dietSwaps'), 'dietSwaps')).toBe(true);
  });

  it('cada interruptor «a mano» recibe solo los módulos de su pantalla', () => {
    // La rutina no ofrece el de la dieta ni la dieta los de la rutina; la lista
    // completa sigue en Ajustes → Protocolo.
    expect(modulesFor('nutrition').map((m) => m.id)).toEqual(['dietSwaps']);
    expect(modulesFor('training').map((m) => m.id)).not.toContain('dietSwaps');
    expect(modulesFor('training').length + modulesFor('nutrition').length).toBe(6);
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

  it('un estado que no existe no cambia nada', () => {
    const protocol = clientProtocol(undefined);
    expect(setCheckinMode(protocol, 'folds', 'obligatorio')).toBe(protocol);
    expect(setCheckinMode(protocol, '', 'off')).toBe(protocol);
  });

  /* ══ Y la LISTA de bloques ya no es fija ═══════════════════════════════
     Desde que el entrenador tiene un vocabulario de medidas propio
     (`domain/medidas.js`), un id que este módulo no conoce no es un error:
     es una glucosa. Lo que se sigue saneando aquí es la FORMA —tres estados
     y nada más—, no el vocabulario. */
  it('acepta el estado de una medida que este módulo no conoce', () => {
    const conGlucosa = setCheckinMode(clientProtocol(undefined), 'glucose', 'required');
    expect(checkinMode(conGlucosa, 'glucose')).toBe('required');
    /* Y sobrevive al guardado, que es donde se caía antes. */
    expect(checkinMode(clientProtocol({ protocol: conGlucosa }), 'glucose')).toBe('required');
  });

  /* Una medida de la que nadie ha dicho nada está APAGADA, no «opcional»:
     encenderle una glucosa a toda la cartera el día que esto se publica sería
     la aplicación pidiéndole a la gente algo que su entrenador no ha pedido.
     Los dos bloques de siempre conservan su «opcional». */
  it('lo que no se ha configurado está apagado, salvo los dos de siempre', () => {
    const protocol = clientProtocol(undefined);
    expect(checkinMode(protocol, 'glucose')).toBe('off');
    expect(checkinMode(protocol, 'folds')).toBe('optional');
    expect(checkinMode(protocol, 'perimeters')).toBe('optional');
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
   Cuántos pesajes se piden a la semana

   Eran tres escritos en `weeklyCheckIn`, y desde ahí la aplicación reclamaba en
   ocho pantallas el incumplimiento de una norma que ningún entrenador había
   puesto. La norma es suya, y mientras no la ponga nadie dice nada.
   ========================================================================== */

describe('los pesajes de la semana', () => {
  it('sin configurar, no se piden', () => {
    const protocol = clientProtocol(undefined);
    expect(weighInsTarget(protocol)).toBe(0);
    expect(asksWeighIns(protocol)).toBe(false);
  });

  it('se pone un número y se lee', () => {
    const protocol = setWeighIns(clientProtocol(undefined), 3);
    expect(weighInsTarget(protocol)).toBe(3);
    expect(asksWeighIns(protocol)).toBe(true);
  });

  /* La columna es jsonb abierta: lo que llegue tiene que quedar en un entero
     usable, y nunca en un objetivo que la pantalla no deja poner. */
  it('lo que no sea un entero de 0 a 7 cae en un valor válido', () => {
    expect(weighInsTarget({ weighIns: 99 })).toBe(7);
    expect(weighInsTarget({ weighIns: -2 })).toBe(0);
    expect(weighInsTarget({ weighIns: 2.4 })).toBe(2);
    expect(weighInsTarget({ weighIns: 'tres' })).toBe(0);
    expect(weighInsTarget(null)).toBe(0);
  });

  it('sobrevive a la ida y vuelta por preferencias', () => {
    const puesto = setWeighIns(clientProtocol(undefined), 4);
    expect(weighInsTarget(clientProtocol({ protocol: puesto }))).toBe(4);
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
      expect(QUESTION_KINDS).toContain(q.kind);
      /* Una de elegir SIN opciones es un renglón con una pregunta y nada debajo
         con lo que contestarla. Si algún día entra una en el catálogo, tiene
         que traerlas. */
      if (q.kind === 'choice' || q.kind === 'multi') expect(q.ops?.length).toBeGreaterThan(1);
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

  it('retocar una del check-in la pisa igual que una de la sesión', () => {
    /* Se miran LOS DOS catálogos: con uno solo, un retoque de `hunger` se
       trataría como pregunta inventada y perdería su color de serie. */
    const deSerie = CHECKIN_QUESTIONS.find((q) => q.id === 'hunger');
    const protocol = clientProtocol({
      protocol: { custom: [{ id: 'hunger', label: 'Cuánta hambre has pasado', kind: 'scale' }] },
    });

    const hunger = questionById(protocol, 'hunger');
    expect(hunger.label).toBe('Cuánta hambre has pasado');
    expect(hunger.color).toBe(deSerie.color);
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
  /*
    Cada clave del protocolo tiene que estar EN una de las dos listas: comparada,
    o excluida con su motivo escrito. Lo que la prueba impide no es excluir —eso
    es una decisión legítima— sino excluir SIN DECIDIRLO: una clave nueva que se
    queda fuera por olvido apaga el botón y deja la pantalla afirmando que tus
    clientes tienen algo que no tienen.
  */
  it('toda clave del protocolo está comparada o excluida a propósito', () => {
    const cubiertas = [...COMPARED_KEYS, ...Object.keys(NOT_COMPARED_KEYS)];
    expect([...Object.keys(defaultProtocol())].sort()).toEqual([...cubiertas].sort());
  });

  it('cada exclusión dice por qué', () => {
    /* Un motivo de tres palabras no es un motivo: dentro de dos años, quien lea
       esa lista tiene que poder decidir si sigue siendo cierto. Es la misma
       regla que la lista de tablas excluidas de la copia de seguridad. */
    for (const [clave, motivo] of Object.entries(NOT_COMPARED_KEYS)) {
      expect(typeof motivo, `${clave} sin motivo`).toBe('string');
      expect(motivo.length, `el motivo de ${clave} es demasiado corto`).toBeGreaterThan(40);
    }
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
    ).toBe('Dieta 8 · 1 respuesta más');
  });

  /* Y lo mismo con lo que marcó: «Dieta 8 · Sí» no dice nada —¿sí a qué?— y el
     enunciado entero convierte la sub-línea en un párrafo. */
  it('cuenta lo marcado sin decirlo', () => {
    const con = clientProtocol({
      protocol: {
        checkinQuestions: ['adherence', 'week_pain_zone'],
      },
    });
    expect(answersSummary(con, { adherence: '8', week_pain_zone: ['hombroD'] })).toBe(
      'Dieta 8 · 1 respuesta más'
    );
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

/*
  ══ Qué le llevas a cada persona ════════════════════════════════════════════

  Entrenamiento, nutrición o las dos. Lo que se protege aquí es sobre todo el
  valor por defecto: esto se añadió con clientes ya configurados y guardados, y
  un saneado que se equivoque no da una pantalla rara — le quita a alguien la
  mitad de la aplicación sin que nadie lo haya pedido.
*/
describe('los servicios', () => {
  it('quien no ha configurado nada tiene las dos cosas', () => {
    expect(clientProtocol(undefined).services).toEqual({ training: true, nutrition: true });
    /* El caso de verdad: un protocolo guardado ANTES de que esto existiera. No
       lleva `services` por ninguna parte y no puede perder nada. */
    const antiguo = clientProtocol({ protocol: { modules: ['warmup'], questions: ['rpe'] } });
    expect(isServiceOn(antiguo, 'training')).toBe(true);
    expect(isServiceOn(antiguo, 'nutrition')).toBe(true);
  });

  it('se puede llevar solo el entrenamiento', () => {
    const solo = clientProtocol({ protocol: { services: { nutrition: false } } });
    expect(isServiceOn(solo, 'training')).toBe(true);
    expect(isServiceOn(solo, 'nutrition')).toBe(false);
    expect(activeServices(solo).map((s) => s.id)).toEqual(['training']);
  });

  it('y solo la nutrición', () => {
    const solo = clientProtocol({ protocol: { services: { training: false } } });
    expect(isServiceOn(solo, 'nutrition')).toBe(true);
    expect(isServiceOn(solo, 'training')).toBe(false);
  });

  it('los dos apagados vuelven a los dos encendidos', () => {
    /* No es un estado que la pantalla deje producir, pero la columna es jsonb
       abierto: un cliente sin ninguno de los dos no tendría aplicación. */
    const roto = clientProtocol({ protocol: { services: { training: false, nutrition: false } } });
    expect(roto.services).toEqual({ training: true, nutrition: true });
  });

  it('apagar el último no hace nada', () => {
    const solo = clientProtocol({ protocol: { services: { nutrition: false } } });
    expect(toggleService(solo, 'training')).toBe(solo);
  });

  it('encender y apagar es reversible', () => {
    const base = clientProtocol({});
    const sinDieta = toggleService(base, 'nutrition');
    expect(isServiceOn(sinDieta, 'nutrition')).toBe(false);
    expect(isServiceOn(toggleService(sinDieta, 'nutrition'), 'nutrition')).toBe(true);
  });

  it('un servicio que no existe se ignora', () => {
    const base = clientProtocol({});
    expect(toggleService(base, 'telepatia')).toBe(base);
  });

  /* La línea que resume lo que alguien lleva puesto, donde no cabe la etiqueta
     larga: la celda «Protocolo» de su ficha y el pie de los interruptores a
     mano. Ver `queLeLlevas`. */
  it('se dice en dos palabras', () => {
    expect(queLeLlevas(clientProtocol({}))).toBe('Entreno y dieta');
    expect(queLeLlevas(clientProtocol({ protocol: { services: { nutrition: false } } }))).toBe(
      'Entreno'
    );
    expect(queLeLlevas(clientProtocol({ protocol: { services: { training: false } } }))).toBe(
      'Dieta'
    );
  });

  /*
    ══ El fallo que costó el trabajo de un entrenador ═════════════════════════

    «Qué le llevas» estaba DENTRO de la comparación, así que a un cliente al que
    se le lleva solo el entrenamiento «poner al día» le devolvía la nutrición: su
    portal recuperaba una sección entera que nadie le está llevando.

    No es una preferencia de protocolo, es lo que le has vendido a esa persona.
    Ni cuenta como desvío ni se pisa al igualar.
  */
  it('llevar cosas distintas NO cuenta como desvío de la plantilla', () => {
    const plantilla = clientProtocol({});
    const soloEntreno = clientProtocol({ protocol: { services: { nutrition: false } } });
    expect(matchesTemplate(plantilla, soloEntreno)).toBe(true);
  });

  it('igualar a la plantilla le respeta lo que le llevas', () => {
    const plantilla = clientProtocol({});
    const suyas = { protocol: { services: { training: true, nutrition: false } } };

    const aplicado = templateForClient(plantilla, suyas);
    expect(isServiceOn(aplicado, 'nutrition')).toBe(false);
    expect(isServiceOn(aplicado, 'training')).toBe(true);
  });

  it('pero un cliente NUEVO sí nace con los servicios de la plantilla', () => {
    /* Es donde el argumento de meterlos en la comparación sí valía:
       `newClientPreferences` copia la plantilla entera al dar de alta. */
    const soloEntreno = clientProtocol({ protocol: { services: { nutrition: false } } });
    expect(isServiceOn(soloEntreno, 'nutrition')).toBe(false);
  });
});

describe('qué cifras no le vuelven al cliente', () => {
  it('de serie no se le oculta nada', () => {
    const base = clientProtocol({});
    expect(hiddenFor(base)).toEqual({ weight: false, nutrition: false, medidas: {} });
    expect(hidesFromClient(base, 'weight')).toBe(false);
  });

  it('solo el true literal oculta: nada raro deja a alguien sin sus cifras', () => {
    for (const raro of ['true', 1, {}, null, undefined, 'sí']) {
      const suyo = clientProtocol({ protocol: { hidden: { weight: raro } } });
      expect(hidesFromClient(suyo, 'weight'), String(raro)).toBe(false);
    }
    expect(hidesFromClient(clientProtocol({ protocol: { hidden: { weight: true } } }), 'weight')).toBe(
      true
    );
  });

  /* ══ Una MEDIDA puede ocultarse el primer día ═══════════════════════════
     Sin esperar a que su id entre en `HIDDEN_INFO`: hay gente a la que un
     número de glucosa en su portal le hace el mismo daño que la báscula, y una
     lista fija habría que ampliarla a mano por cada medida nueva. Lo que sigue
     cayéndose es cualquier cosa que no sea un `true` literal. */
  it('una medida oculta se conserva; lo que no es un sí explícito se cae', () => {
    const suyo = clientProtocol({
      protocol: { hidden: { glucose: true, telepatia: 'sí', weight: true } },
    });
    expect(suyo.hidden).toEqual({ weight: true, nutrition: false, glucose: true });
    expect(hiddenFor(suyo).medidas).toEqual({ glucose: true });
  });

  it('el interruptor va y vuelve sin tocar al otro', () => {
    const base = clientProtocol({});
    const sinPeso = toggleHidden(base, 'weight');
    expect(hiddenFor(sinPeso)).toEqual({ weight: true, nutrition: false, medidas: {} });
    expect(hiddenFor(toggleHidden(sinPeso, 'weight'))).toEqual({
      weight: false,
      nutrition: false,
      medidas: {},
    });
  });

  it('cada cifra ocultable dice qué es y qué implica', () => {
    for (const info of HIDDEN_INFO) {
      expect(typeof info.label).toBe('string');
      expect(info.hint.length, `${info.id} sin explicación`).toBeGreaterThan(40);
    }
  });

  /*
    ══ El peor botón posible ══════════════════════════════════════════════════

    «Poner al día» empuja la plantilla a un cliente. Si esto se comparara,
    ocultarle el peso a una persona la marcaría como desviada de la plantilla —y
    el primer «aplicar a todos» le devolvería su peso a la pantalla. Ver
    `NOT_COMPARED_KEYS`.
  */
  it('ocultarle el peso NO cuenta como desvío de la plantilla', () => {
    const plantilla = clientProtocol({});
    const suyo = clientProtocol({ protocol: { hidden: { weight: true } } });
    expect(matchesTemplate(plantilla, suyo)).toBe(true);
  });

  it('e igualar a la plantilla se lo respeta', () => {
    const plantilla = clientProtocol({});
    const suyas = { protocol: { hidden: { weight: true, nutrition: true } } };
    expect(templateForClient(plantilla, suyas).hidden).toEqual({ weight: true, nutrition: true });
  });
});

/* ══ LOS TIPOS NUEVOS ══════════════════════════════════════════════════════
   El cuestionario guardaba escalas y textos y nada más, y lo que se abre aquí
   es lo que el modelo sabe guardar. Lo que estas pruebas cuidan es el filo de
   esa apertura: que las opciones no se pierdan por el camino y que nada que no
   sea una cantidad acabe en un gráfico. */
describe('preguntas que no son escala ni texto', () => {
  it('una de elegir conserva sus opciones, sin repetidas y con tope', () => {
    const protocol = clientProtocol({
      protocol: {
        checkinQuestions: ['q1'],
        custom: [
          {
            id: 'q1',
            label: '¿Cómo has comido fuera?',
            kind: 'choice',
            ops: ['  Bien  ', 'Regular', 'Bien', '', 'a', 'b', 'c', 'd', 'e', 'f', 'g'],
          },
        ],
      },
    });

    const q = questionById(protocol, 'q1');
    expect(q.kind).toBe('choice');
    /* Recortadas, sin la vacía, sin la repetida y ocho como mucho. */
    expect(q.ops).toEqual(['Bien', 'Regular', 'a', 'b', 'c', 'd', 'e', 'f']);
  });

  /* Un «elegir una» sin opciones le llega al cliente como un enunciado con nada
     debajo, y eso no se puede contestar. Cae a texto, que es lo más parecido a
     lo que se quería preguntar y lo único contestable. */
  it('una de elegir sin opciones cae a texto', () => {
    const protocol = clientProtocol({
      protocol: {
        checkinQuestions: ['q1'],
        custom: [{ id: 'q1', label: 'Da igual', kind: 'multi', ops: ['   ', ''] }],
      },
    });
    const q = questionById(protocol, 'q1');
    expect(q.kind).toBe('text');
    expect(q.ops).toBeUndefined();
  });

  /* La división que de verdad manda: lo que se dibuja y lo que se lee. Media
     aplicación preguntaba `kind !== 'text'` y daba por hecho que lo demás era
     una cifra. */
  it('solo la escala es serie', () => {
    expect(esSerie({ kind: 'scale' })).toBe(true);
    for (const kind of QUESTION_KINDS.filter((k) => k !== 'scale')) {
      expect(esSerie({ kind })).toBe(false);
    }
    expect(esTexto({ kind: 'text' })).toBe(true);
    expect(esRespuesta({ kind: 'bool' })).toBe(true);
    expect(esRespuesta({ kind: 'text' })).toBe(false);
    expect(esRespuesta({ kind: 'scale' })).toBe(false);
  });

  /* Una lista vacía se convierte en `''` y una con dos zonas en «a,b», así que
     el `String(v).trim() !== ''` de toda la vida decía que sí por casualidad. */
  it('una respuesta dada se reconoce sea del tipo que sea', () => {
    expect(hayRespuesta(['hombroD'])).toBe(true);
    expect(hayRespuesta([])).toBe(false);
    expect(hayRespuesta('si')).toBe(true);
    expect(hayRespuesta(0)).toBe(true);
    expect(hayRespuesta('   ')).toBe(false);
    expect(hayRespuesta(null)).toBe(false);
    expect(hayRespuesta(undefined)).toBe(false);
  });
});

describe('lo que solo se pregunta si antes pasó algo', () => {
  const zona = CHECKIN_QUESTIONS.find((q) => q.id === 'week_pain_zone');
  const dolor = CHECKIN_QUESTIONS.find((q) => q.id === 'week_pain');

  it('el cuerpo no sale la semana que no ha dolido nada', () => {
    expect(seVe(zona, { week_pain: '0' }, [dolor, zona])).toBe(false);
    expect(seVe(zona, {}, [dolor, zona])).toBe(false);
    expect(seVe(zona, { week_pain: '1' }, [dolor, zona])).toBe(true);
    expect(seVe(zona, { week_pain: '7' }, [dolor, zona])).toBe(true);
  });

  /* Sin la pregunta de la que depende no hay condición que cumplir: una que no
     se pudiera contestar nunca sería peor que una de más. */
  it('si el entrenador quitó el dolor, la zona se pregunta siempre', () => {
    expect(seVe(zona, {}, [zona])).toBe(true);
  });

  it('lo que no depende de nada se ve siempre', () => {
    expect(seVe(dolor, {}, [dolor, zona])).toBe(true);
    expect(seVe({ id: 'x', kind: 'text' }, {})).toBe(true);
  });

  /* El retoque conserva la condición Y los extremos de la escala: cambiarle una
     palabra al enunciado no puede devolver el cuerpo entero a todas las
     semanas, ni dejar la rampa sin decir qué significan sus puntas. */
  it('retocar una del catálogo no pierde ni la condición ni las anclas', () => {
    const protocol = clientProtocol({
      protocol: {
        checkinQuestions: ['week_pain', 'week_pain_zone'],
        custom: [
          { id: 'week_pain_zone', label: '¿Dónde exactamente?', kind: 'zone' },
          { id: 'week_pain', label: 'Molestias', kind: 'scale', min: 0, max: 10 },
        ],
      },
    });
    expect(questionById(protocol, 'week_pain_zone').depende).toEqual({
      de: 'week_pain',
      desde: 1,
    });
    expect(questionById(protocol, 'week_pain').anclas).toEqual(['Nada', 'Mucho']);
  });

  /* Media pareja es peor que ninguna: un extremo rotulado y el otro en blanco se
     lee como un fallo, así que manda el del catálogo. */
  it('unas anclas a medias no pisan a las del catálogo', () => {
    const conMedia = clientProtocol({
      protocol: {
        checkinQuestions: ['hunger'],
        custom: [{ id: 'hunger', label: 'Hambre', kind: 'scale', anclas: ['Nada', '  '] }],
      },
    });
    expect(questionById(conMedia, 'hunger').anclas).toEqual(['Nada', 'Muchísima']);

    const suyas = clientProtocol({
      protocol: {
        checkinQuestions: ['hunger'],
        custom: [{ id: 'hunger', label: 'Hambre', kind: 'scale', anclas: ['Ni pizca', 'A todas horas'] }],
      },
    });
    expect(questionById(suyas, 'hunger').anclas).toEqual(['Ni pizca', 'A todas horas']);
  });

  /* Solo una escala tiene puntas. En un sí/no no significan nada y ocuparían
     sitio en la columna acotada de 8 KB. */
  it('las anclas son de las escalas y de nadie más', () => {
    const protocol = clientProtocol({
      protocol: {
        checkinQuestions: ['q1'],
        custom: [{ id: 'q1', label: '¿Has entrenado?', kind: 'bool', anclas: ['A', 'B'] }],
      },
    });
    expect(questionById(protocol, 'q1').anclas).toBeUndefined();
  });

  it('todas las escalas del catálogo dicen qué significan sus puntas', () => {
    for (const q of [...SESSION_QUESTIONS, ...CHECKIN_QUESTIONS]) {
      if (q.kind !== 'scale') continue;
      expect(q.anclas).toHaveLength(2);
      expect(q.anclas.every((a) => typeof a === 'string' && a.trim() !== '')).toBe(true);
    }
  });

  /* El instrumento va con la pregunta, y el retoque lo hereda igual que el
     color: sin esto, cambiarle una palabra al enunciado de «Adherencia» le
     devolvía al cliente una rampa de diez pasos en medio de un cuestionario de
     estrellas y caras. */
  it('retocar una del catálogo no pierde el instrumento', () => {
    const protocol = clientProtocol({
      protocol: {
        checkinQuestions: ['adherence'],
        custom: [{ id: 'adherence', label: '¿Has seguido la dieta?', kind: 'scale', min: 1, max: 10 }],
      },
    });
    expect(questionById(protocol, 'adherence').instrumento).toBe('estrellas');
  });

  /* Y EL RANGO LO MANDA EL INSTRUMENTO. Un protocolo guardado antes de que la
     adherencia bajara a 1-5 sigue diciendo `max: 10` —así llega el `custom` de
     arriba—, y sin esto el cliente se encontraría diez estrellas en fila y
     guardaría un 8 en una serie que ya está en escala de 5. */
  it('un max viejo no estira un instrumento de cinco', () => {
    const protocol = clientProtocol({
      protocol: {
        checkinQuestions: ['adherence'],
        custom: [{ id: 'adherence', label: 'Adherencia a la dieta', kind: 'scale', min: 1, max: 10 }],
      },
    });
    expect(questionById(protocol, 'adherence').max).toBe(5);
  });

  /* Y una pregunta inventada no estrena instrumento: sería decidir por el
     entrenador qué clase de cosa está preguntando. Sale en la rampa, y ahí su
     tope sí es el que él eligió. */
  it('una pregunta propia no lleva instrumento y conserva su tope', () => {
    const protocol = clientProtocol({
      protocol: {
        checkinQuestions: ['q1'],
        custom: [{ id: 'q1', label: '¿Cuántos días has andado?', kind: 'scale', min: 0, max: 10 }],
      },
    });
    expect(questionById(protocol, 'q1').instrumento).toBeUndefined();
    expect(questionById(protocol, 'q1').max).toBe(10);
  });

  /* Los tres instrumentos de cinco pasos son de cinco pasos. Escrito como prueba
     porque el rango y el instrumento son UNA decisión: unas estrellas de 1 a 10
     son diez medias estrellas, que es precisión falsa, y la migración 0120
     convirtió lo contestado contando con que el tope es cinco. */
  it('los instrumentos de cinco traen su rango puesto', () => {
    for (const q of [...SESSION_QUESTIONS, ...CHECKIN_QUESTIONS]) {
      if (!q.instrumento) continue;
      expect(['estrellas', 'caras', 'deposito']).toContain(q.instrumento);
      expect([q.min, q.max]).toEqual([1, 5]);
    }
  });

  /* Y la rampa se queda con las cantidades, que es donde el 0-10 significa algo:
     entre un dolor de 3 y uno de 5 hay una decisión de entrenamiento. */
  it('lo que no lleva instrumento sigue siendo una rampa de diez', () => {
    for (const q of [...SESSION_QUESTIONS, ...CHECKIN_QUESTIONS]) {
      if (q.kind !== 'scale' || q.instrumento) continue;
      expect(q.max).toBe(10);
    }
  });
});

describe('las zonas del cuerpo', () => {
  it('limpia los ids que no existen', () => {
    expect(zonasDe(['hombroD', 'inventada', 'lumbares'])).toEqual(['hombroD', 'lumbares']);
    expect(zonasDe(null)).toEqual([]);
  });

  /* `painZone` era texto libre y lleva meses guardando frases. No se pueden
     convertir en zonas —«el mismo de siempre» no es un id— pero se siguen
     leyendo: cambia el control, no lo que había escrito. */
  it('lo escrito cuando esto era texto libre no se pierde', () => {
    expect(zonaEscrita('el hombro, al empujar')).toBe('el hombro, al empujar');
    expect(zonasDe('el hombro, al empujar')).toEqual([]);
    expect(zonaEscrita(['hombroD'])).toBe('');
  });

  it('lo contestado se dice con palabras y no con ids', () => {
    const zona = { kind: 'zone' };
    expect(diceRespuesta(zona, ['hombroD', 'lumbares'])).toBe('Hombro dcho., Lumbares');
    expect(diceRespuesta(zona, 'me dolía todo')).toBe('me dolía todo');
    expect(diceRespuesta(zona, [])).toBe('');
    /* El sí/no se guarda como lo compara una regla y se lee como se contestó. */
    expect(diceRespuesta({ kind: 'bool' }, 'si')).toBe('Sí');
    expect(diceRespuesta({ kind: 'bool' }, 'no')).toBe('No');
  });
});
