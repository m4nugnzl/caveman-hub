import { describe, expect, it } from 'vitest';

import { enElExtremo, sensacionesDeLaSemana, sensacionesDeLaSesion, sentidoDe, textosDeLaSemana, tonoDeSensacion, valorDeRespuesta } from './sensaciones';

const HAMBRE = { id: 'hunger', label: 'Hambre', short: 'Hambre', kind: 'scale', min: 0, max: 10, lowerIsBetter: true };
const SUENO = { id: 'week_sleep', label: 'Cómo has dormido', short: 'Sueño', kind: 'scale', instrumento: 'estrellas', min: 1, max: 5 };
const ENTRENOS = { id: 'training_done', label: 'Entrenos', kind: 'scale', min: 0, max: 10 };
const NOTA = { id: 'week_note', label: 'Nota de la semana', kind: 'text' };

describe('valorDeRespuesta', () => {
  it('lee números y textos con coma o barra', () => {
    expect(valorDeRespuesta(7, HAMBRE)).toBe(7);
    expect(valorDeRespuesta(' 7,5 ', HAMBRE)).toBe(7.5);
    expect(valorDeRespuesta('7/10', HAMBRE)).toBe(7);
  });
  it('descarta lo que no es número o se sale de su escala', () => {
    expect(valorDeRespuesta('mucha', HAMBRE)).toBeNull();
    expect(valorDeRespuesta('', HAMBRE)).toBeNull();
    expect(valorDeRespuesta(null, HAMBRE)).toBeNull();
    expect(valorDeRespuesta({ a: 1 }, HAMBRE)).toBeNull();
    expect(valorDeRespuesta('8', SUENO)).toBeNull();
    expect(valorDeRespuesta(0, SUENO)).toBeNull();
  });
});

describe('sentido y extremos', () => {
  it('sigue la lista del dueño', () => {
    expect(sentidoDe(HAMBRE)).toBe('peor');
    expect(sentidoDe(SUENO)).toBe('mejor');
    expect(sentidoDe(ENTRENOS)).toBeNull();
  });
  it('marca solo el extremo que el sentido llama peor', () => {
    expect(enElExtremo(10, HAMBRE)).toBe(true);
    expect(enElExtremo(0, HAMBRE)).toBe(false);
    expect(enElExtremo(1, SUENO)).toBe(true);
    expect(enElExtremo(5, SUENO)).toBe(false);
    expect(enElExtremo(10, ENTRENOS)).toBe(false);
  });
});

describe('sensacionesDeLaSemana', () => {
  const preguntas = [SUENO, ENTRENOS, HAMBRE, NOTA];
  it('compara con la semana anterior y con la media de la fase, en su escala', () => {
    const filas = sensacionesDeLaSemana({
      preguntas,
      answers: { hunger: '8', week_sleep: '3', training_done: '10' },
      anteriores: { hunger: '6', week_sleep: '4' },
      deLaFase: [{ hunger: '5', week_sleep: '4' }, { hunger: '6', week_sleep: 'fatal' }],
    });
    expect(filas.map((f) => f.id)).toEqual(['hunger', 'week_sleep', 'training_done']);
    const hambre = filas[0];
    expect(hambre).toMatchObject({ valor: 8, anterior: 6, vsAnterior: 2, mediaFase: 5.5, vsFase: 2.5, min: 0, max: 10 });
    expect(filas[1]).toMatchObject({ valor: 3, vsAnterior: -1, mediaFase: 4, vsFase: -1 });
    expect(filas[2]).toMatchObject({ valor: 10, anterior: null, vsAnterior: null, mediaFase: null });
  });
  it('no compara una fila cuya respuesta anterior no cabe en la escala de hoy', () => {
    const [sueno] = sensacionesDeLaSemana({ preguntas: [SUENO], answers: { week_sleep: '4' }, anteriores: { week_sleep: '8' } });
    expect(sueno.vsAnterior).toBeNull();
  });
  it('sin respuestas, nada', () => {
    expect(sensacionesDeLaSemana({ preguntas, answers: null })).toEqual([]);
  });
  it('los textos se leen aparte', () => {
    expect(textosDeLaSemana({ preguntas, answers: { week_note: ' Boda el sábado ' } })).toEqual([
      { id: 'week_note', etiqueta: 'Nota de la semana', texto: 'Boda el sábado' },
    ]);
  });
});

describe('sensacionesDeLaSesion', () => {
  it('lee el parte y su nota', () => {
    const FATIGA = { id: 'fatigue', label: 'Fatiga', short: 'Fatiga', kind: 'scale', min: 1, max: 10, lowerIsBetter: true };
    const r = sensacionesDeLaSesion({ preguntas: [FATIGA], feedback: { fatigue: '10', note: ' Rodilla ' } });
    expect(r.filas[0]).toMatchObject({ valor: 10, extremo: true });
    expect(r.nota).toBe('Rodilla');
  });
});

describe('tonoDeSensacion', () => {
  const hambre = { id: 'hunger', kind: 'scale', min: 1, max: 5 };
  const energia = { id: 'week_energy', kind: 'scale', min: 0, max: 10 };
  const esfuerzo = { id: 'rpe', kind: 'scale', min: 1, max: 10, neutral: true };

  it('solo los extremos, según el sentido', () => {
    expect(tonoDeSensacion(5, hambre)).toBe('malo');
    expect(tonoDeSensacion(1, hambre)).toBe('bueno');
    expect(tonoDeSensacion(4, hambre)).toBe(null);
    expect(tonoDeSensacion(2, energia)).toBe('malo');
    expect(tonoDeSensacion(8, energia)).toBe('bueno');
    expect(tonoDeSensacion(5, energia)).toBe(null);
  });

  it('sin sentido o sin valor, neutro', () => {
    expect(tonoDeSensacion(10, esfuerzo)).toBe(null);
    expect(tonoDeSensacion(null, hambre)).toBe(null);
  });
});
