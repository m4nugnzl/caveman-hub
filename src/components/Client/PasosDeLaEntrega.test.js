import { describe, expect, it } from 'vitest';

import { weeklyCheckIn } from '@/domain/anthropometry';
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

const paso = (pasos, id) => pasos.find((p) => p.id === id);

describe('pasosDeLaEntrega', () => {
  it('una revisión sin tocar no tiene ningún paso hecho', () => {
    const pasos = construir({
      /* Todo lo del periodo ANTERIOR: medidas tomadas, fotos hechas y la semana
         entregada con su cuestionario. Nada de eso entrega la de ahora. */
      history: [medida(ANTES)],
      photos: [foto(3, 'frontal'), foto(3, 'lateral'), foto(3, 'espalda')],
      entrega: { weekStart: ANTES, submittedAt: '2026-09-13T10:00:00Z', answers: { dietAdherence: '4' } },
    });

    expect(pasos.filter((p) => p.hecho)).toHaveLength(0);
    expect(paso(pasos, 'medidas').estado).toBe('Sin tomar esta semana');
  });

  it('cuenta lo que sí es de este periodo', () => {
    const pasos = construir({
      history: [medida('2026-09-16')],
      photos: [foto(4, 'frontal'), foto(4, 'lateral'), foto(4, 'espalda')],
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

  /* Lo que llevaba la portada: las fotos SIN filtrar. Media entrega —una foto de
     tres— no es la entrega hecha. */
  it('las fotos a medias no dan el paso por hecho', () => {
    const pasos = construir({ photos: [foto(4, 'frontal')] });
    expect(paso(pasos, 'fotos').hecho).toBe(false);
    expect(paso(pasos, 'fotos').estado).toContain('Llevas 1 de 3');
  });
});
