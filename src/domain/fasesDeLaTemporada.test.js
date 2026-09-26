import { describe, expect, it } from 'vitest';

import { microciclosDeLaSemana } from './blocks';
import { bordesDeFase, estirarFases, moverInicioDeFase } from './fasesDeLaTemporada';

/*
  Lo que protegen estas pruebas, en el orden en que se rompería sin avisar:

    1. Que estirar una fase empuje SOLO las de detrás, igual que `estirar_fase`
       (0136).
    2. Que los bordes arrastrados no dejen una fase en menos de una semana ni
       muevan lo ya vivido.
    3. Que la semana nombre el microciclo del JUEVES en un semanal, y todos
       los que toca en un rotativo.
*/

const volumen = {
  id: 'v',
  title: 'Volumen',
  direction: 'bulk',
  ratePct: 0.25,
  startsOn: '2026-03-02',
  endsOn: '2027-02-28', // 52 semanas
  note: '',
};
const minicut = {
  id: 'm',
  title: 'Minicut',
  direction: 'cut',
  ratePct: 0.8,
  startsOn: '2027-03-01',
  endsOn: '2027-04-25', // 8 semanas
  note: '',
  nextOptions: [
    { when: 'Sí, con margen', title: 'Mantenimiento', direction: 'maintain', ratePct: 0, weeks: 4 },
    { when: 'No, le sobra', title: 'Definición', direction: 'cut', ratePct: 0.6, weeks: 4 },
  ],
  nextQuestion: '¿Llega a 82 kg con margen?',
};

describe('estirar una fase', () => {
  const fases = [volumen, minicut];

  it('alargarla empuja las de detrás y no toca las de delante', () => {
    const r = estirarFases(fases, 'v', 14);
    expect(r[0].endsOn).toBe('2027-03-14');
    expect(r[1].startsOn).toBe('2027-03-15');
    expect(r[1].endsOn).toBe('2027-05-09');
    expect(estirarFases(fases, 'm', 7)[0]).toBe(volumen);
  });

  it('acortarla tira de las de detrás hacia atrás', () => {
    const r = estirarFases(fases, 'v', -7);
    expect(r[0].endsOn).toBe('2027-02-21');
    expect(r[1].startsOn).toBe('2027-02-22');
  });
});

describe('el microciclo de una semana', () => {
  it('en un semanal, el que contiene el jueves', () => {
    // Microciclos de miércoles a martes: la semana del 21 sep tiene su jueves en el M5.
    const t = { desde: '2026-08-26', vuelta: 7, total: 6 };
    expect(microciclosDeLaSemana(t, '2026-09-21')).toEqual({ primero: 5, ultimo: 5 });
    expect(microciclosDeLaSemana(t, '2026-08-24')).toEqual({ primero: 1, ultimo: 1 });
    expect(microciclosDeLaSemana(t, '2026-08-17')).toBeNull();
  });

  it('en un rotativo, todos los que toca', () => {
    const t = { desde: '2026-09-01', vuelta: 10, total: 5 };
    expect(microciclosDeLaSemana(t, '2026-09-07')).toEqual({ primero: 1, ultimo: 2 });
    expect(microciclosDeLaSemana(t, '2026-10-19')).toEqual({ primero: 5, ultimo: 5 });
    expect(microciclosDeLaSemana(t, '2026-10-26')).toBeNull();
    expect(microciclosDeLaSemana(t, '2026-11-09')).toBeNull();
  });
});

describe('los bordes de una fase en la Temporada', () => {
  const hoy = '2026-10-01';
  const def = { id: 'd', title: 'Definición', direction: 'cut', startsOn: '2026-09-01', endsOn: '2026-10-26' };
  const man = { id: 'm', title: 'Mantenimiento', direction: 'maintain', startsOn: '2026-10-27', endsOn: '2026-11-23' };
  const vol = { id: 'v', title: 'Volumen', direction: 'bulk', startsOn: '2026-12-01', endsOn: '2027-02-28' };
  const fases = [def, man, vol];

  it('el final de la fase en curso no baja de hoy; el inicio de lo vivido no se mueve', () => {
    const b = bordesDeFase(fases, 'd', hoy);
    expect(b.inicio).toBeNull();
    expect(b.fin.min).toBe(-25);
  });

  it('el inicio de una fase pegada comparte borde con la anterior', () => {
    const b = bordesDeFase(fases, 'm', hoy);
    /* La anterior puede acabar hoy como pronto: el borde, mañana. */
    expect(b.inicio.min).toBe(-25);
    expect(b.inicio.max).toBe(21);
    const r = moverInicioDeFase(fases, 'm', -7, hoy);
    expect(r.fases.find((f) => f.id === 'm').startsOn).toBe('2026-10-20');
    expect(r.fases.find((f) => f.id === 'd').endsOn).toBe('2026-10-19');
    /* Hacia atrás, primero se acorta la anterior; hacia delante, primero ésta. */
    expect(r.pasos.map((p) => p.id)).toEqual(['d', 'm']);
    expect(moverInicioDeFase(fases, 'm', 7, hoy).pasos.map((p) => p.id)).toEqual(['m', 'd']);
  });

  it('con hueco delante, el inicio no se lo come y no arrastra a nadie', () => {
    expect(bordesDeFase(fases, 'v', hoy).inicio.min).toBe(-7);
    const r = moverInicioDeFase(fases, 'v', -3, hoy);
    expect(r.pasos).toHaveLength(1);
    expect(r.fases.find((f) => f.id === 'm')).toBe(man);
    expect(moverInicioDeFase(fases, 'v', -8, hoy).error).toBeTruthy();
  });
});
