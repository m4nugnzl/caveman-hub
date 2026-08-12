import { describe, expect, it } from 'vitest';

import {
  buildFeedbackSeries,
  feedbackAdherence,
  feedbackLog,
  lastFeedback,
  questionSeries,
  questionStats,
} from './readiness';
import { SESSION_QUESTIONS } from './protocol';

const rpe = SESSION_QUESTIONS.find((q) => q.id === 'rpe');

/** Un microciclo con las sesiones que se le indiquen. */
const program = (sessions) => [{ id: 'm1', weekNumber: 1, days: [], sessions }];

const session = (id, date, feedback, sets = [{ kg: '100', reps: '5', rir: '2' }]) => ({
  id,
  date,
  dayName: 'Empuje A',
  feedback,
  entries: [{ exerciseId: 'e1', name: 'Press', muscle: 'Pecho', sets }],
});

describe('questionSeries', () => {
  it('promedia las sesiones de cada semana natural', () => {
    /*
      Una semana tiene varias sesiones y cada una su respuesta. Quedarse con la
      última haría que la serie dependiera de qué día se entrenó el último, que
      es ruido: el promedio es lo comparable, igual que con el peso.
    */
    const points = questionSeries(
      program([
        session('a', '2026-08-10', { rpe: '8' }), // lunes
        session('b', '2026-08-12', { rpe: '6' }), // miércoles, misma semana
        session('c', '2026-08-18', { rpe: '9' }), // semana siguiente
      ]),
      'rpe'
    );

    expect(points.map((p) => p.value)).toEqual([7, 9]);
    expect(points[0].week).toBe('2026-08-10');
  });

  it('descarta lo que no es un número', () => {
    const points = questionSeries(
      program([
        session('a', '2026-08-10', { rpe: '8' }),
        session('b', '2026-08-17', { rpe: '' }),
        session('c', '2026-08-24', { note: 'me dolió el hombro' }),
      ]),
      'rpe'
    );

    expect(points).toHaveLength(1);
  });

  it('sale ordenada aunque las sesiones no lo estén', () => {
    const points = questionSeries(
      program([session('a', '2026-08-24', { rpe: '9' }), session('b', '2026-08-10', { rpe: '5' })]),
      'rpe'
    );
    expect(points.map((p) => p.value)).toEqual([5, 9]);
  });
});

describe('buildFeedbackSeries', () => {
  it('deja fuera las preguntas sin un solo dato', () => {
    /*
      Una leyenda con cuatro nombres de los que solo uno dibuja algo hace pensar
      que faltan líneas por cargar.
    */
    const series = buildFeedbackSeries(
      program([session('a', '2026-08-10', { rpe: '8' })]),
      SESSION_QUESTIONS.filter((q) => ['rpe', 'pain', 'sleep'].includes(q.id))
    );

    expect(series.map((s) => s.id)).toEqual(['rpe']);
  });
});

describe('questionStats', () => {
  it('da la última semana, su variación y cuántas respuestas la sostienen', () => {
    const stats = questionStats(
      program([
        session('a', '2026-08-10', { rpe: '6' }),
        session('b', '2026-08-17', { rpe: '8' }),
        session('c', '2026-08-19', { rpe: '10' }),
      ]),
      rpe
    );

    expect(stats.value).toBe(9);
    expect(stats.delta).toBe(3);
    expect(stats.count).toBe(2);
  });

  it('es null cuando no hay nada contestado', () => {
    expect(questionStats(program([session('a', '2026-08-10', {})]), rpe)).toBeNull();
  });
});

describe('lastFeedback', () => {
  it('recorre el protocolo, no lo guardado', () => {
    /*
      Una pregunta que el entrenador ha retirado no debe reaparecer aunque su
      respuesta siga en el histórico.
    */
    const result = lastFeedback(
      program([session('a', '2026-08-10', { rpe: '8', stress: '9' })]),
      [rpe]
    );

    expect(result.values).toHaveLength(1);
    expect(result.values[0].value).toBe('8');
  });
});

describe('feedbackLog', () => {
  it('recoge también las sesiones que solo llevan nota del cliente', () => {
    /*
      Una sesión sin escalas contestadas pero con «me dolió el hombro» es
      exactamente lo que un entrenador quiere encontrar en el histórico. Filtrar
      por «tiene respuestas» la dejaría fuera.
    */
    const log = feedbackLog(
      program([
        { ...session('a', '2026-08-10', {}), clientNote: 'Me dolió el hombro al bajar' },
        session('b', '2026-08-12', { rpe: '7' }),
        session('c', '2026-08-14', {}),
      ]),
      [rpe]
    );

    expect(log).toHaveLength(2);
    // De lo más reciente a lo más antiguo.
    expect(log.map((e) => e.date)).toEqual(['2026-08-12', '2026-08-10']);
    expect(log[1].clientNote).toContain('hombro');
  });

  it('no devuelve respuestas de preguntas retiradas del protocolo', () => {
    const log = feedbackLog(program([session('a', '2026-08-10', { rpe: '8', stress: '9' })]), [rpe]);
    expect(log[0].values.map((v) => v.question.id)).toEqual(['rpe']);
  });
});

describe('feedbackAdherence', () => {
  it('mide sobre las sesiones ENTRENADAS, no sobre las abiertas', () => {
    /*
      Es la cifra que dice si el protocolo funciona. Contar sesiones vacías
      —plantillas que el entrenador abrió y nadie usó— daría un porcentaje bajo
      que no significa nada.
    */
    const result = feedbackAdherence(
      program([
        session('a', '2026-08-10', { rpe: '8' }),
        session('b', '2026-08-12', {}),
        session('c', '2026-08-14', {}, [{ kg: '', reps: '', rir: '' }]), // abierta y vacía
      ])
    );

    expect(result).toEqual({ sessions: 2, answered: 1, pct: 50 });
  });
});
