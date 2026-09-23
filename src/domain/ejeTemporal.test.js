import { describe, expect, it } from 'vitest';

import { tramoDelBloque, tramosDeLosBloques } from './blocks';
import { competicionDe, competicionDicha } from './calendar';
import {
  anclaSiguiente,
  anclasDelPlan,
  cuentaAtras,
  effectiveGoal,
  llegadaAlAncla,
  temporadas,
} from './roadmap';

/**
 * ══ El eje temporal (prompt 6A, `docs/eje-temporal.md`) ═══════════════════
 *
 * Lo que protege este archivo, en el orden en que se rompería en silencio:
 *
 *   1. **El peso objetivo con fase en curso.** Se perdía y el portal dejaba de
 *      enseñarlo. Si vuelve a perderse, nada falla: simplemente desaparece.
 *   2. **Los bordes de la llegada.** Acabar la víspera o el día es llegar; un
 *      día de más o de menos cambia el dibujo entero.
 *   3. **El bloque en el calendario sale de `micro.date`**, no de la fecha de
 *      alta. Con la cuenta del alta, los carriles de la demo quedaban meses
 *      fuera de sitio.
 */

const fase = (over = {}) => ({
  id: over.id || 'f',
  title: 'Definición',
  direction: 'cut',
  ratePct: 0.6,
  startsOn: '2026-10-05',
  endsOn: '2026-12-27',
  note: '',
  ...over,
});

const ancla = (over = {}) => ({
  id: over.id || 'e',
  kind: 'race',
  title: 'Nacional',
  date: '2027-04-04',
  ancla: true,
  ...over,
});

describe('effectiveGoal — el peso objetivo viaja también con fase', () => {
  const cliente = {
    preferences: { goal: { direction: 'cut', ratePct: 0.5, targetWeightKg: 72 } },
  };

  it('con una fase en curso manda la fase y el destino se conserva', () => {
    const goal = effectiveGoal(cliente, [fase({ direction: 'bulk', ratePct: 0.25 })], '2026-11-01');
    expect(goal.direction).toBe('bulk');
    expect(goal.targetWeightKg).toBe(72);
  });

  it('sin destino declarado, null y no undefined', () => {
    const goal = effectiveGoal({ preferences: {} }, [fase()], '2026-11-01');
    expect(goal.direction).toBe('cut');
    expect(goal.targetWeightKg).toBeNull();
  });
});

describe('anclas y cuenta atrás', () => {
  const eventos = [
    ancla({ id: 'b', date: '2027-04-04' }),
    { id: 'x', kind: 'race', title: '10K', date: '2026-11-01', ancla: false },
    ancla({ id: 'a', title: 'Regional', date: '2026-12-13' }),
  ];

  it('solo cuentan los eventos marcados, por fecha', () => {
    expect(anclasDelPlan(eventos).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('la siguiente es la primera desde hoy, y la de hoy todavía cuenta', () => {
    expect(anclaSiguiente(eventos, '2026-12-13').id).toBe('a');
    expect(anclaSiguiente(eventos, '2026-12-14').id).toBe('b');
    expect(anclaSiguiente(eventos, '2027-05-01')).toBeNull();
  });

  it('en semanas hacia arriba, en días por debajo de dos semanas', () => {
    expect(cuentaAtras(ancla({ date: '2026-12-31' }), '2026-09-21').texto).toBe('faltan 15 semanas');
    expect(cuentaAtras(ancla({ date: '2026-09-30' }), '2026-09-21').texto).toBe('faltan 9 días');
    expect(cuentaAtras(ancla({ date: '2026-09-22' }), '2026-09-21').texto).toBe('falta 1 día');
    expect(cuentaAtras(ancla({ date: '2026-09-21' }), '2026-09-21').texto).toBe('es hoy');
  });

  it('un ancla pasada no tiene cuenta atrás: sería un reproche', () => {
    expect(cuentaAtras(ancla({ date: '2026-09-01' }), '2026-09-21')).toBeNull();
  });
});

describe('llegadaAlAncla — el plan medido contra la fecha', () => {
  const D = ancla({ date: '2027-04-04' });

  it('acabar la víspera o el mismo día es llegar', () => {
    expect(llegadaAlAncla([fase({ endsOn: '2027-04-03' })], D).estado).toBe('llega');
    expect(llegadaAlAncla([fase({ endsOn: '2027-04-04' })], D).estado).toBe('llega');
  });

  it('acabar antes deja un hueco de los días sin cubrir', () => {
    // Acaba el 21 de marzo: del 22 de marzo al 3 de abril quedan 13 días.
    expect(llegadaAlAncla([fase({ endsOn: '2027-03-21' })], D)).toMatchObject({ estado: 'hueco', dias: 13 });
  });

  it('acabar después es exceso, en días', () => {
    expect(llegadaAlAncla([fase({ endsOn: '2027-04-14' })], D)).toMatchObject({ estado: 'exceso', dias: 10 });
  });

  it('una fase abierta no dice si llega', () => {
    expect(llegadaAlAncla([fase({ endsOn: null })], D).estado).toBe('abierta');
  });

  it('sin fases el tramo está vacío, no roto', () => {
    expect(llegadaAlAncla([], D).estado).toBe('vacio');
  });

  it('con un cruce, cada camino se mide desde el día siguiente al final', () => {
    const conCruce = fase({
      endsOn: '2027-02-07',
      nextOptions: [
        { when: 'Si baja', title: 'Definición', direction: 'cut', weeks: 8 },
        { when: 'Si no', title: 'Volumen', direction: 'bulk', weeks: 12 },
      ],
    });
    const { caminos } = llegadaAlAncla([conCruce], D);
    // 8 semanas desde el 8 de febrero acaban el 4 de abril: llega.
    expect(caminos[0]).toMatchObject({ estado: 'llega' });
    // 12 semanas acaban el 2 de mayo: se pasa 28 días.
    expect(caminos[1]).toMatchObject({ estado: 'exceso', dias: 28 });
  });
});

describe('temporadas — el plan partido por sus anclas', () => {
  const fases = [
    fase({ id: 'v', direction: 'bulk', startsOn: '2026-10-05', endsOn: '2026-12-13' }),
    fase({ id: 'd', startsOn: '2026-12-14', endsOn: '2027-03-21' }),
    // Empieza el día de la competición: ya es de después.
    fase({ id: 'r', direction: 'maintain', startsOn: '2027-04-04', endsOn: null }),
  ];

  it('una fase que empieza el día del ancla es del tramo siguiente', () => {
    const { tramos, sinDestino } = temporadas(fases, [ancla()], '2026-11-01');
    expect(tramos).toHaveLength(1);
    expect(tramos[0].fases.map((f) => f.id)).toEqual(['v', 'd']);
    expect(tramos[0]).toMatchObject({ nombre: 'Nacional', desde: '2026-10-05', hasta: '2027-04-04', enCurso: true });
    expect(tramos[0].llegada).toMatchObject({ estado: 'hueco', dias: 13 });
    expect(sinDestino.map((f) => f.id)).toEqual(['r']);
  });

  it('dos anclas parten dos temporadas; el día de la primera sigue siendo suyo', () => {
    const eventos = [ancla({ id: 'a', title: 'Regional', date: '2026-12-14' }), ancla({ id: 'b' })];
    const { tramos } = temporadas(fases, eventos, '2026-12-14');
    expect(tramos.map((t) => t.fases.map((f) => f.id))).toEqual([['v'], ['d']]);
    expect(tramos.map((t) => t.enCurso)).toEqual([true, false]);
  });

  it('sin anclas todo es plan sin destino, como antes', () => {
    const { tramos, sinDestino } = temporadas(fases, [], '2026-11-01');
    expect(tramos).toEqual([]);
    expect(sinDestino).toHaveLength(3);
  });
});

describe('tramoDelBloque — el bloque en el calendario sale de micro.date', () => {
  const micro = (weekNumber, date, days = []) => ({ weekNumber, date, days });

  /* El caso de Iván en la demo: dado de alta en febrero, primer microciclo el
     12 de julio. La cuenta del alta lo ponía en febrero. */
  const program = {
    cycleType: 'weekly',
    blocks: [
      { id: 'b1', name: 'Acumulación', fromWeek: 1, toWeek: 2 },
      { id: 'b2', name: 'Intensificación', fromWeek: 3, toWeek: null, plannedWeeks: 4 },
    ],
    microcycles: [micro(1, '2026-07-12'), micro(2, '2026-07-19'), micro(3, '2026-07-26')],
  };

  it('usa la fecha del microciclo, no la del alta', () => {
    const tramo = tramoDelBloque(program, program.blocks[0], { startDate: '2026-02-22' });
    expect(tramo).toMatchObject({ desde: '2026-07-12', hasta: '2026-07-25', estimado: false });
  });

  it('el bloque abierto con duración prevista tiene un final previsto', () => {
    const tramo = tramoDelBloque(program, program.blocks[1]);
    expect(tramo).toMatchObject({ desde: '2026-07-26', hasta: '2026-08-01', previstoHasta: '2026-08-22' });
  });

  it('en un ciclo rotativo el microciclo mide lo que dure la vuelta', () => {
    const rotativo = {
      blocks: [],
      microcycles: [micro(1, '2026-09-07', [{ dayName: 'A' }, { dayName: 'B' }, { dayName: 'C' }])],
    };
    const tramo = tramoDelBloque(rotativo, { id: 'b_1', fromWeek: 1, toWeek: null }, {
      cycleType: 'rotating',
      cyclePattern: { train: 3, rest: 1 },
    });
    // Tres sesiones y un descanso: cuatro días, del 7 al 10.
    expect(tramo).toMatchObject({ desde: '2026-09-07', hasta: '2026-09-10' });
  });

  it('sin fecha cae a la cuenta del alta y lo dice', () => {
    const viejo = { microcycles: [{ weekNumber: 1 }, { weekNumber: 2 }] };
    const tramo = tramoDelBloque(viejo, { id: 'b_1', fromWeek: 1, toWeek: null }, { startDate: '2026-03-04' });
    expect(tramo).toMatchObject({ desde: '2026-03-02', estimado: true });
  });

  it('los bloques sin microciclos no se dibujan', () => {
    expect(tramosDeLosBloques({ microcycles: [] })).toEqual([]);
    expect(tramosDeLosBloques(program).map((t) => t.bloque.id)).toEqual(['b1', 'b2']);
  });
});

describe('competicionDe — la forma de la competición', () => {
  it('sanea textos y acota el peso límite', () => {
    expect(competicionDe({ federacion: '  AEFN ', categoria: '−83 kg', pesoLimiteKg: '83,5' })).toEqual({
      federacion: 'AEFN',
      categoria: '−83 kg',
      sede: null,
      pesoLimiteKg: 83.5,
    });
    expect(competicionDe({ pesoLimiteKg: 900 })).toBeNull();
  });

  it('sin nada que decir, null', () => {
    expect(competicionDe(null)).toBeNull();
    expect(competicionDe({ federacion: '  ' })).toBeNull();
    expect(competicionDe([])).toBeNull();
  });

  it('en una línea', () => {
    expect(competicionDicha({ federacion: 'AEFN', sede: 'Madrid' })).toBe('AEFN · Madrid');
  });
});
