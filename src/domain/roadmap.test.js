import { describe, expect, it } from 'vitest';

import {
  coversDate,
  effectiveGoal,
  nextPhaseAfter,
  nextPhaseDraft,
  overlapping,
  phaseAt,
  phaseGoal,
  phaseProgress,
  phaseWeeks,
  roadmapState,
  validatePhase,
} from './roadmap';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Dos cosas que se rompen en silencio si nadie las mira:
 *
 *   1. **Los bordes de las fechas.** Una fase que acaba «el 20» incluye el 20. Un
 *      `<` en vez de un `<=` deja al cliente un día sin objetivo cada vez que
 *      cambia de tramo, y ese día la analítica le juzga contra otra cosa. Es un
 *      fallo de un solo día que nadie va a reproducir a mano.
 *
 *   2. **La preferencia de `effectiveGoal`.** Es el punto por el que toda la
 *      analítica se entera de que existen las fases. Si la precedencia se invierte
 *      —el objetivo suelto ganando a la fase— los gráficos siguen dibujándose
 *      perfectamente y todos los veredictos son mentira.
 */

const fase = (over = {}) => ({
  id: over.id || 'f1',
  title: 'Definición',
  direction: 'cut',
  ratePct: 0.6,
  startsOn: '2026-03-01',
  endsOn: '2026-04-20',
  note: '',
  ...over,
});

// Un roadmap encadenado como se hace de verdad: cada fase empieza el día
// siguiente al final de la anterior, y la última queda abierta.
const roadmap = [
  fase({ id: 'a', title: 'Definición', direction: 'cut', startsOn: '2026-03-01', endsOn: '2026-04-20' }),
  fase({ id: 'b', title: 'Mantenimiento', direction: 'maintain', ratePct: 0, startsOn: '2026-04-21', endsOn: '2026-05-18' }),
  fase({ id: 'c', title: 'Volumen', direction: 'bulk', ratePct: 0.25, startsOn: '2026-05-19', endsOn: null }),
];

describe('coversDate — los extremos entran', () => {
  const f = fase();

  it.each([
    ['2026-02-28', false, 'el día antes de empezar'],
    ['2026-03-01', true, 'el día que empieza'],
    ['2026-03-15', true, 'en mitad'],
    ['2026-04-20', true, 'el último día'],
    ['2026-04-21', false, 'el día después de acabar'],
  ])('%s → %s (%s)', (day, expected) => {
    expect(coversDate(f, day)).toBe(expected);
  });

  it('una fase abierta cubre cualquier día posterior', () => {
    const abierta = fase({ endsOn: null });
    expect(coversDate(abierta, '2029-12-31')).toBe(true);
    expect(coversDate(abierta, '2026-02-28')).toBe(false);
  });
});

describe('phaseWeeks — qué atajo de duración corresponde', () => {
  it.each([
    ['2026-03-01', '2026-03-28', 4],
    ['2026-03-01', '2026-04-25', 8],
    ['2026-03-01', '2026-05-23', 12],
    ['2026-03-01', '2026-03-07', 1],
  ])('%s → %s son %s semanas', (from, to, expected) => {
    expect(phaseWeeks(from, to)).toBe(expected);
  });

  /*
    Ambos extremos cuentan, igual que en `phaseProgress` y que en el rango de la
    base. Del 1 al 28 son 28 días —cuatro semanas—, no 27: el desfase de un día
    aquí marcaría el atajo equivocado en el formulario.
  */
  it('cuenta los dos extremos', () => {
    expect(phaseWeeks('2026-03-01', '2026-03-27')).toBeNull(); // 27 días
  });

  it('lo que no son semanas exactas no lo describe ningún atajo', () => {
    expect(phaseWeeks('2026-03-01', '2026-03-17')).toBeNull();
  });

  it('una fase abierta no tiene duración', () => {
    expect(phaseWeeks('2026-03-01', null)).toBeNull();
    expect(phaseWeeks('2026-03-01', '')).toBeNull();
  });
});

describe('phaseAt', () => {
  it('devuelve la fase del día, y solo esa', () => {
    expect(phaseAt(roadmap, '2026-03-10')?.id).toBe('a');
    expect(phaseAt(roadmap, '2026-04-21')?.id).toBe('b');
    expect(phaseAt(roadmap, '2026-09-01')?.id).toBe('c');
  });

  /*
    `null` no es un fallo: es «ese día no está planificado». La pantalla se ofrece
    a rellenarlo. Devolver la fase más cercana en su lugar sería inventarse un
    objetivo que nadie ha decidido, que es justo lo que `goals.js` evita.
  */
  it('devuelve null antes de que empiece el plan', () => {
    expect(phaseAt(roadmap, '2026-01-01')).toBeNull();
  });

  it('devuelve null en un hueco entre fases', () => {
    const conHueco = [
      fase({ id: 'a', startsOn: '2026-03-01', endsOn: '2026-03-31' }),
      fase({ id: 'b', startsOn: '2026-05-01', endsOn: '2026-05-31' }),
    ];
    expect(phaseAt(conHueco, '2026-04-15')).toBeNull();
  });

  it('sin roadmap devuelve null sin explotar', () => {
    expect(phaseAt([], '2026-03-10')).toBeNull();
    expect(phaseAt(undefined, '2026-03-10')).toBeNull();
  });
});

describe('effectiveGoal — la precedencia que hace que la analítica entienda de fases', () => {
  const cliente = { preferences: { goal: { direction: 'cut', ratePct: 0.6, note: 'lo de siempre' } } };

  /*
    El caso que motiva todo el roadmap: el cliente tiene declarado «bajar» desde
    hace meses y hoy le toca volumen. Sin esto, subir de peso —que es lo que toca—
    se lee como «en dirección contraria» y el entrenador recibe una alarma falsa.
  */
  it('la fase de hoy gana al objetivo declarado', () => {
    const goal = effectiveGoal(cliente, roadmap, '2026-06-01');
    expect(goal.direction).toBe('bulk');
    expect(goal.ratePct).toBe(0.25);
  });

  it('sin fase que cubra hoy, cae al objetivo declarado', () => {
    expect(effectiveGoal(cliente, roadmap, '2026-01-01').direction).toBe('cut');
    expect(effectiveGoal(cliente, roadmap, '2026-01-01').note).toBe('lo de siempre');
  });

  it('sin roadmap se comporta exactamente como antes', () => {
    expect(effectiveGoal(cliente, [], '2026-06-01')).toEqual(cliente.preferences.goal);
  });

  it('sin nada declarado devuelve null, no un objetivo por defecto', () => {
    expect(effectiveGoal({}, [], '2026-06-01')).toBeNull();
  });
});

describe('phaseGoal', () => {
  it('devuelve la misma forma que clientGoal', () => {
    expect(phaseGoal(fase())).toEqual({ direction: 'cut', ratePct: 0.6, note: '' });
  });

  it('el mantenimiento no tiene ritmo, aunque se le haya guardado uno', () => {
    expect(phaseGoal(fase({ direction: 'maintain', ratePct: 0.5 })).ratePct).toBe(0);
  });

  it('una dirección inválida no es una fase', () => {
    expect(phaseGoal(fase({ direction: 'engordar' }))).toBeNull();
    expect(phaseGoal(null)).toBeNull();
  });
});

describe('phaseProgress', () => {
  // Del 1 de marzo al 20 de abril son 51 días contando ambos.
  it('cuenta los dos extremos', () => {
    const p = phaseProgress(fase(), '2026-03-01');
    expect(p.elapsed).toBe(1);
    expect(p.total).toBe(51);

    const fin = phaseProgress(fase(), '2026-04-20');
    expect(fin.elapsed).toBe(51);
    expect(fin.remaining).toBe(0);
    expect(fin.pct).toBe(100);
  });

  /*
    Hacia arriba a propósito: quedando nueve días quedan «2 semanas» de trabajo que
    planificar. Redondeando hacia abajo se diría «1» y el aviso llegaría tarde.
  */
  it('las semanas que quedan se redondean hacia arriba', () => {
    expect(phaseProgress(fase({ endsOn: '2026-03-10' }), '2026-03-01').weeksLeft).toBe(2);
  });

  it('una fase abierta no tiene porcentaje inventado', () => {
    const p = phaseProgress(fase({ endsOn: null }), '2026-03-15');
    expect(p.open).toBe(true);
    expect(p.pct).toBeNull();
    expect(p.total).toBeNull();
    expect(p.elapsed).toBe(15);
  });
});

describe('overlapping — el mensaje, no la seguridad', () => {
  it('detecta que se pisa por un solo día', () => {
    const choques = overlapping(roadmap, { startsOn: '2026-04-20', endsOn: '2026-04-25' });
    expect(choques.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('encadenar al día siguiente no se pisa', () => {
    expect(overlapping([roadmap[0]], { startsOn: '2026-04-21', endsOn: '2026-05-01' })).toEqual([]);
  });

  it('una fase no choca consigo misma al editarla', () => {
    const editada = { startsOn: '2026-03-01', endsOn: '2026-04-30' };
    expect(overlapping(roadmap, editada, 'a').map((f) => f.id)).toEqual(['b']);
  });

  it('cualquier cosa posterior choca con una fase abierta', () => {
    expect(overlapping([fase({ id: 'x', endsOn: null })], { startsOn: '2030-01-01' })).toHaveLength(1);
  });
});

describe('validatePhase', () => {
  it.each([
    [{ title: '', direction: 'cut', startsOn: '2026-06-01' }, /nombre/i],
    [{ title: 'X', direction: 'nope', startsOn: '2026-06-01' }, /definición/i],
    [{ title: 'X', direction: 'cut', startsOn: null }, /inicio/i],
    [{ title: 'X', direction: 'cut', startsOn: '2026-06-10', endsOn: '2026-06-01' }, /anterior/i],
    [{ title: 'X', direction: 'cut', startsOn: '2026-06-01', endsOn: '2026-06-03' }, /tendencia/i],
  ])('rechaza y explica: %o', (candidate, pattern) => {
    expect(validatePhase([], candidate)).toMatch(pattern);
  });

  it('el solape se explica diciendo con cuál', () => {
    const error = validatePhase(roadmap, {
      title: 'Nueva',
      direction: 'cut',
      startsOn: '2026-03-10',
      endsOn: '2026-03-30',
    });
    expect(error).toContain('Definición');
  });

  it('un tramo correcto no devuelve nada', () => {
    expect(
      validatePhase([roadmap[0]], {
        title: 'Mantenimiento',
        direction: 'maintain',
        startsOn: '2026-04-21',
        endsOn: '2026-05-18',
      })
    ).toBeNull();
  });
});

describe('nextPhaseDraft', () => {
  it('encadena al día siguiente de lo último planificado', () => {
    const draft = nextPhaseDraft([roadmap[0]], 'maintain', 4);
    expect(draft.startsOn).toBe('2026-04-21');
    expect(draft.endsOn).toBe('2026-05-18'); // 4 semanas = 28 días contando ambos
    expect(draft.direction).toBe('maintain');
    expect(draft.ratePct).toBe(0);
  });

  it('sin roadmap empieza hoy', () => {
    expect(nextPhaseDraft([], 'cut', 12, '2026-07-01').startsOn).toBe('2026-07-01');
  });

  /*
    Detrás de una fase abierta no cabe nada: el solape sería inevitable porque la
    anterior no acaba nunca. Se devuelve `null` para que la pantalla pida cerrarla
    primero en lugar de ofrecer un formulario que va a fallar al guardar.
  */
  it('no propone nada detrás de una fase abierta', () => {
    expect(nextPhaseDraft(roadmap, 'cut', 8)).toBeNull();
  });
});

describe('roadmapState', () => {
  it('reparte pasado, presente y futuro desde un día', () => {
    const state = roadmapState(roadmap, '2026-05-01');
    expect(state.current.id).toBe('b');
    expect(state.past.map((f) => f.id)).toEqual(['a']);
    expect(state.future.map((f) => f.id)).toEqual(['c']);
    expect(state.next.id).toBe('c');
    expect(state.gapToday).toBe(false);
  });

  it('señala el agujero cuando hay plan pero no cubre hoy', () => {
    const conHueco = [
      fase({ id: 'a', startsOn: '2026-03-01', endsOn: '2026-03-31' }),
      fase({ id: 'b', startsOn: '2026-05-01', endsOn: '2026-05-31' }),
    ];
    expect(roadmapState(conHueco, '2026-04-15').gapToday).toBe(true);
  });

  it('sin fases no hay agujero: no hay plan que tenga huecos', () => {
    expect(roadmapState([], '2026-04-15').gapToday).toBe(false);
  });

  it('ordena aunque lleguen desordenadas', () => {
    const desordenadas = [roadmap[2], roadmap[0], roadmap[1]];
    expect(roadmapState(desordenadas, '2026-05-01').all.map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('nextPhaseAfter', () => {
  it('encuentra la siguiente por fecha de inicio', () => {
    expect(nextPhaseAfter(roadmap, '2026-03-10')?.id).toBe('b');
  });

  it('en la última no hay siguiente', () => {
    expect(nextPhaseAfter(roadmap, '2026-09-01')).toBeNull();
  });
});
