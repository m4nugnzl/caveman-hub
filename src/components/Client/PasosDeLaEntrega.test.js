import { describe, expect, it } from 'vitest';

import { weeklyCheckIn } from '@/domain/anthropometry';
import { ANGLE_IDS } from '@/domain/photos';
import { clientProtocol } from '@/domain/protocol';
import { pasosDeLaEntrega } from './PasosDeLaEntrega';

/**
 * LOS CUATRO RENGLONES HABLAN DE LA MISMA REVISIÓN.
 *
 * ══ De dónde sale esta prueba ══════════════════════════════════════════════
 *
 * Del aviso de un cliente, el 20 de septiembre de 2026: abrió su revisión de la
 * semana y se encontró «3 de 4 completadas» —medidas, fotos y cuestionario en
 * verde— sin haber tocado nada esa semana. Las tres cuentas miraban ventanas
 * distintas y ninguna era la del periodo que se entrega:
 *
 *   · las medidas, el historial ENTERO, así que una vez medido el paso ya no se
 *     apagaba nunca;
 *   · las fotos, la semana de HOY (y en la portada, ninguna: todas las del
 *     cliente desde su alta);
 *   · las respuestas, cualquier fila de `check_ins` de ese lunes EN ADELANTE,
 *     incluida la que crea el entrenador al cerrar una semana por delante.
 *
 * Lo que se fija aquí es que la ventana es una sola y la pone esta función: es
 * la única forma de que la portada y la pantalla de revisión no vuelvan a
 * contar cosas distintas. Ver `pasosDeLaEntrega`.
 */

const ALTA = '2026-08-24'; // lunes
const SEMANA = '2026-09-14'; // el lunes del periodo que se entrega
const ANTES = '2026-09-07'; // el lunes anterior

/* Un protocolo que pide las cuatro cosas: perímetros, fotos y una pregunta. */
const PROTOCOLO = clientProtocol({
  protocol: {
    checkin: { perimeters: ['chest'], photos: true },
    checkinQuestions: ['dietAdherence'],
  },
});

const medida = (date) => ({ id: date, date, weight: 80, perimeters: { chest: 102 } });
const foto = (week, angle) => ({ week, angle, date: '2026-09-01' });

const construir = (extra = {}) =>
  pasosDeLaEntrega({
    protocol: PROTOCOLO,
    resumen: weeklyCheckIn(extra.history || [], SEMANA, { target: 0, weeks: 1 }),
    history: extra.history || [],
    photos: extra.photos || [],
    startDate: ALTA,
    desde: SEMANA,
    semanas: 1,
    preguntas: [{ id: 'dietAdherence', label: '¿Cómo has llevado la dieta?', type: 'scale' }],
    entrega: extra.entrega ?? null,
  });

/* Los ángulos que se piden, del dominio: el día que cambien —como el 20 de
   septiembre, cuando la lateral se partió en izquierdo y derecho— estos
   fixtures no tienen que enterarse. */
const TODAS = ANGLE_IDS;

const paso = (pasos, id) => pasos.find((p) => p.id === id);

describe('pasosDeLaEntrega', () => {
  it('una revisión sin tocar no tiene ningún paso hecho', () => {
    const pasos = construir({
      /* Todo lo del periodo ANTERIOR: medidas tomadas, fotos hechas y la semana
         entregada con su cuestionario. Nada de eso entrega la de ahora. */
      history: [medida(ANTES)],
      photos: TODAS.map((angulo) => foto(3, angulo)),
      entrega: { weekStart: ANTES, submittedAt: '2026-09-13T10:00:00Z', answers: { dietAdherence: '4' } },
    });

    expect(pasos.filter((p) => p.hecho)).toHaveLength(0);
    expect(paso(pasos, 'medidas').estado).toBe('Sin tomar esta semana');
  });

  it('cuenta lo que sí es de este periodo', () => {
    const pasos = construir({
      history: [medida('2026-09-16')],
      photos: TODAS.map((angulo) => foto(4, angulo)),
      entrega: { weekStart: SEMANA, submittedAt: '2026-09-20T10:00:00Z', answers: { dietAdherence: '4' } },
    });

    expect(paso(pasos, 'medidas').hecho).toBe(true);
    expect(paso(pasos, 'fotos').hecho).toBe(true);
    expect(paso(pasos, 'cuestionario').hecho).toBe(true);
    expect(paso(pasos, 'cuestionario').estado).toBe('Contestado en tu entrega');
  });

  /*
    La fila que crea el entrenador al cerrar la semana QUE VIENE mientras el
    cliente todavía debe la anterior. `submit_check_in` le pone `submitted_at`,
    así que colada aquí daba por entregada una semana que él no había mandado.
  */
  it('la entrega de una semana posterior no cuenta como la de ahora', () => {
    const pasos = construir({
      entrega: { weekStart: '2026-09-21', submittedAt: '2026-09-21T09:00:00Z', answers: { dietAdherence: '5' } },
    });
    expect(paso(pasos, 'cuestionario').hecho).toBe(false);
  });

  /* Contestado y sin mandar todavía: el borrador del teléfono (migración 0121)
     se sigue leyendo como contestado, pero el renglón dice cuál de las dos es. */
  it('distingue el borrador de lo entregado', () => {
    const pasos = construir({
      entrega: { weekStart: SEMANA, submittedAt: null, answers: { dietAdherence: '4' } },
    });
    expect(paso(pasos, 'cuestionario').hecho).toBe(true);
    expect(paso(pasos, 'cuestionario').estado).toBe('Contestado · se manda al entregar');
  });

  /* Lo que llevaba la portada: las fotos SIN filtrar. Media entrega —una foto
     de las cuatro— no es la entrega hecha. */
  it('las fotos a medias no dan el paso por hecho', () => {
    const pasos = construir({ photos: [foto(4, 'frontal')] });
    expect(paso(pasos, 'fotos').hecho).toBe(false);
    expect(paso(pasos, 'fotos').estado).toContain(`Llevas 1 de ${TODAS.length}`);
  });

  /* Los dos perfiles se cuentan por separado: una lateral sin la otra deja el
     paso a medias. Es toda la razón de que el ángulo lleve el lado escrito —una
     izquierda contra una derecha no compara nada—, así que si esto vuelve a dar
     el paso por hecho, la separación se ha deshecho sin que nadie lo vea. */
  it('el lateral izquierdo no tapa al derecho', () => {
    const pasos = construir({
      photos: [foto(4, 'frontal'), foto(4, 'izquierdo'), foto(4, 'espalda')],
    });
    expect(paso(pasos, 'fotos').hecho).toBe(false);
    expect(paso(pasos, 'fotos').estado).toContain('te falta la de lateral derecho');
  });

  /* Y las laterales de antes de la separación no cuentan para lo de ahora: no
     se sabe de qué lado eran. Lo que se ve es que faltan las dos, no una. */
  it('una lateral antigua no cubre ninguno de los dos perfiles', () => {
    const pasos = construir({
      photos: [foto(4, 'frontal'), foto(4, 'lateral'), foto(4, 'espalda')],
    });
    expect(paso(pasos, 'fotos').hecho).toBe(false);
    expect(paso(pasos, 'fotos').estado).toContain(
      'te faltan la de lateral izquierdo y la de lateral derecho'
    );
  });
});

/**
 * LA ENTREGA TARDÍA: lo que se apunta desde una revisión abierta cuenta para
 * ella.
 *
 * ══ De dónde sale esta prueba ══════════════════════════════════════════════
 *
 * Del aviso de un entrenador el 22 de septiembre de 2026. Su cliente estaba
 * dentro de la ventana de gracia —hoy martes 22, entregando la revisión del
 * viernes 18— y se encontró esta pantalla:
 *
 *   · «Tu peso: te pide 1 pesaje y llevas 0», después de pesarse.
 *   · «Tus medidas: sin tomar esta semana», después de medirse.
 *   · «Entregar mi semana» rebotando contra un peso recién escrito.
 *
 * Todo se guardaba. Nada contaba: los registros iban fechados HOY, que es de la
 * semana siguiente, y la revisión abierta no mira ahí. Con la pauta los viernes
 * eso dura hasta seis días, y en ellos el cliente no tiene forma de entregar.
 *
 * Lo que se fija aquí es la regla entera y sus dos caras: que lo sellado cuenta
 * para la revisión que se entrega, y que NO cuenta además para la suya.
 */
describe('pasosDeLaEntrega con la entrega tardía abierta', () => {
  const HOY = '2026-09-22'; // martes; la revisión abierta es la del lunes 14
  const conSello = (date, extra) => ({ id: date, date, weight: 60.9, semana: SEMANA, ...extra });

  it('el pesaje de hoy, sellado, cuenta para la revisión que se entrega', () => {
    const history = [conSello(HOY)];
    const pasos = pasosDeLaEntrega({
      protocol: PROTOCOLO,
      resumen: weeklyCheckIn(history, SEMANA, { target: 1, weeks: 1 }),
      history,
      photos: [],
      startDate: ALTA,
      desde: SEMANA,
      semanas: 1,
      preguntas: [],
      entrega: null,
    });

    expect(paso(pasos, 'peso').hecho).toBe(true);
    expect(paso(pasos, 'peso').estado).toContain('llevas 1');
  });

  it('y las medidas de hoy, selladas, dejan de decir «sin tomar»', () => {
    const history = [conSello(HOY, { perimeters: { chest: 102 } })];
    const pasos = pasosDeLaEntrega({
      protocol: PROTOCOLO,
      resumen: weeklyCheckIn(history, SEMANA, { target: 1, weeks: 1 }),
      history,
      photos: [],
      startDate: ALTA,
      desde: SEMANA,
      semanas: 1,
      preguntas: [],
      entrega: null,
    });

    expect(paso(pasos, 'medidas').hecho).toBe(true);
    expect(paso(pasos, 'medidas').estado).toContain('tomadas el 22 sept');
  });

  /* La otra cara: entregar tarde la semana 4 no puede vaciar la 5. El registro
     está en una y solo en una, y eso es lo que hace que la cuenta cuadre. */
  it('lo sellado no cuenta además para la semana en la que está fechado', () => {
    const history = [conSello(HOY, { perimeters: { chest: 102 } })];
    const siguiente = '2026-09-21';
    const pasos = pasosDeLaEntrega({
      protocol: PROTOCOLO,
      resumen: weeklyCheckIn(history, siguiente, { target: 1, weeks: 1 }),
      history,
      photos: [],
      startDate: ALTA,
      desde: siguiente,
      semanas: 1,
      preguntas: [],
      entrega: null,
    });

    expect(paso(pasos, 'peso').hecho).toBe(false);
    expect(paso(pasos, 'peso').estado).toContain('llevas 0');
    expect(paso(pasos, 'medidas').hecho).toBe(false);
  });

  /* Los PLIEGUES, que se guardan en `skinFolds` y se leían en `folds`: a quien
     solo le piden pliegues, medirse no contaba como medirse. */
  it('unos pliegues tomados cuentan como medidas', () => {
    const history = [{ id: 'p', date: '2026-09-17', weight: 61, skinFolds: { abdominal: 12, muslo: 16 } }];
    const pasos = pasosDeLaEntrega({
      protocol: PROTOCOLO,
      resumen: weeklyCheckIn(history, SEMANA, { target: 1, weeks: 1 }),
      history,
      photos: [],
      startDate: ALTA,
      desde: SEMANA,
      semanas: 1,
      preguntas: [],
      entrega: null,
    });

    expect(paso(pasos, 'medidas').hecho).toBe(true);
    expect(paso(pasos, 'medidas').estado).toContain('pliegues 28 mm');
  });
});
