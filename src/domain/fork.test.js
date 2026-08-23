import { describe, expect, it } from 'vitest';

import {
  forkDraft,
  forkState,
  forkablePhase,
  hasFork,
  optionDraft,
  optionToPhaseDraft,
  staleForks,
  validateFork,
  validateOptions,
} from './fork';
import { effectiveGoal, validatePhase } from './roadmap';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Tres cosas que se rompen en silencio:
 *
 *   1. **Que el camino elegido encaje al día siguiente.** Un desfase de un día
 *      lo convierte en un solape, y entonces el INSERT lo rechaza la base con el
 *      error del constraint —que es correcto y no se le puede enseñar a nadie—.
 *      O peor, un día de más y el cliente se queda sin objetivo esa jornada.
 *
 *   2. **Que el cruce esté en la última fase.** Si `forkState` hiciera caso a
 *      los caminos de una fase que ya tiene otra detrás, la pantalla ofrecería
 *      elegir algo que ya se eligió.
 *
 *   3. **Que nada de esto toque la lectura.** Un cruce planteado no puede
 *      cambiar el objetivo de hoy. Si lo cambiara, la analítica juzgaría al
 *      cliente contra una fase que nadie ha decidido todavía.
 */

const fase = (over = {}) => ({
  id: 'f1',
  title: 'Recomposición',
  direction: 'maintain',
  ratePct: 0,
  startsOn: '2026-01-05',
  endsOn: '2026-03-29',
  note: '',
  nextOptions: null,
  ...over,
});

const caminos = [
  { when: 'Si el punto ha bajado lo suficiente', title: 'Volumen', direction: 'bulk', ratePct: 0.25, weeks: 16 },
  { when: 'Si todavía no', title: 'Definición', direction: 'cut', ratePct: 0.5, weeks: 6 },
];

describe('forkablePhase — dónde se puede plantear un cruce', () => {
  it('es la última fase del plan', () => {
    const plan = [
      fase({ id: 'a', startsOn: '2026-01-05', endsOn: '2026-02-01' }),
      fase({ id: 'b', startsOn: '2026-02-02', endsOn: '2026-03-29' }),
    ];
    expect(forkablePhase(plan)?.id).toBe('b');
  });

  /*
    Sin final no hay día en el que decidir. Se devuelve `null` para que la
    pantalla pida cerrarla —igual que hace `nextPhaseDraft`— en lugar de ofrecer
    un formulario que la base rechaza (`client_phases_fork_needs_end`, 0073).
  */
  it('no se puede colgar de una fase abierta', () => {
    expect(forkablePhase([fase({ endsOn: null })])).toBeNull();
  });

  it('sin plan no hay dónde', () => {
    expect(forkablePhase([])).toBeNull();
    expect(forkablePhase(undefined)).toBeNull();
  });
});

describe('forkState', () => {
  const plan = [fase({ nextOptions: caminos })];

  it('cuenta los días que quedan para decidir', () => {
    const state = forkState(plan, '2026-03-15');
    expect(state.decidesOn).toBe('2026-03-29');
    expect(state.daysLeft).toBe(14);
    expect(state.due).toBe(false);
    expect(state.overdue).toBe(false);
    expect(state.options).toHaveLength(2);
  });

  /* El último día de la fase todavía es suyo, así que ese día se decide, no se
     ha pasado. Un `<` en vez de un `<=` aquí adelanta el aviso una jornada. */
  it('el día que acaba la fase es el día de decidir, no uno tarde', () => {
    const hoy = forkState(plan, '2026-03-29');
    expect(hoy.due).toBe(true);
    expect(hoy.overdue).toBe(false);
  });

  it('pasada la fecha, el cruce está vencido', () => {
    const tarde = forkState(plan, '2026-04-02');
    expect(tarde.due).toBe(true);
    expect(tarde.overdue).toBe(true);
    expect(tarde.daysLeft).toBe(-4);
  });

  it('sin caminos no hay cruce', () => {
    expect(forkState([fase()], '2026-03-15')).toBeNull();
    expect(forkState([], '2026-03-15')).toBeNull();
  });

  /*
    El caso que evita ofrecer una decisión ya tomada: alguien creó la fase
    siguiente y los caminos se quedaron ahí. Mirando solo la última fase, el
    cruce desaparece solo.
  */
  it('ignora los caminos de una fase que ya tiene otra detrás', () => {
    const decidido = [
      fase({ id: 'a', nextOptions: caminos }),
      fase({ id: 'b', direction: 'bulk', startsOn: '2026-03-30', endsOn: '2026-07-19' }),
    ];
    expect(forkState(decidido, '2026-04-05')).toBeNull();
    expect(staleForks(decidido).map((f) => f.id)).toEqual(['a']);
  });

  it('los caminos de la última fase no son restos', () => {
    expect(staleForks(plan)).toEqual([]);
  });

  it('ordena aunque las fases lleguen desordenadas', () => {
    const desordenadas = [
      fase({ id: 'b', startsOn: '2026-03-30', endsOn: '2026-07-19', nextOptions: caminos }),
      fase({ id: 'a' }),
    ];
    expect(forkState(desordenadas, '2026-04-05')?.phase.id).toBe('b');
  });
});

describe('hasFork', () => {
  it.each([
    [null, false],
    [[], false],
    [caminos, true],
  ])('%o → %s', (nextOptions, expected) => {
    expect(hasFork(fase({ nextOptions }))).toBe(expected);
  });
});

describe('validateOptions', () => {
  it.each([
    [[caminos[0]], /dos caminos/i],
    [[...caminos, ...caminos], /decisión/i],
    [[{ ...caminos[0], when: '  ' }, caminos[1]], /«si»/i],
    [[{ ...caminos[0], title: '' }, caminos[1]], /nombre/i],
    [[{ ...caminos[0], direction: 'engordar' }, caminos[1]], /definición/i],
    [[{ ...caminos[0], weeks: 0 }, caminos[1]], /semanas/i],
    [[{ ...caminos[0], weeks: 40 }, caminos[1]], /semanas/i],
    [[{ ...caminos[0], weeks: 2.5 }, caminos[1]], /semanas/i],
  ])('rechaza y explica: %o', (options, pattern) => {
    expect(validateOptions(options)).toMatch(pattern);
  });

  /* Dos «si» iguales solo se descubren en el momento de elegir, que es tres
     meses después y delante del cliente. */
  it('rechaza dos caminos con la misma condición', () => {
    const repetido = [caminos[0], { ...caminos[1], when: 'SI EL PUNTO HA BAJADO LO SUFICIENTE ' }];
    expect(validateOptions(repetido)).toMatch(/misma condición/i);
  });

  it('un cruce correcto no devuelve nada', () => {
    expect(validateOptions(caminos)).toBeNull();
  });

  it('tres caminos también valen', () => {
    const tres = [...caminos, { when: 'Si viene lesionado', title: 'Mantenimiento', direction: 'maintain', ratePct: 0, weeks: 4 }];
    expect(validateOptions(tres)).toBeNull();
  });
});

describe('validateFork — dónde puede ir', () => {
  const plan = [
    fase({ id: 'a', startsOn: '2026-01-05', endsOn: '2026-02-01' }),
    fase({ id: 'b', startsOn: '2026-02-02', endsOn: '2026-03-29' }),
  ];

  it('en la última fase, con final, está bien', () => {
    expect(validateFork(plan, 'b', caminos)).toBeNull();
  });

  it('no en una fase que ya tiene otra detrás', () => {
    expect(validateFork(plan, 'a', caminos)).toMatch(/detrás/i);
  });

  it('no en una fase abierta', () => {
    expect(validateFork([fase({ id: 'x', endsOn: null })], 'x', caminos)).toMatch(/final/i);
  });

  it('en una fase que no existe', () => {
    expect(validateFork(plan, 'zzz', caminos)).toMatch(/ya no está/i);
  });

  it('y comprueba también los caminos', () => {
    expect(validateFork(plan, 'b', [caminos[0]])).toMatch(/dos caminos/i);
  });
});

describe('optionToPhaseDraft — el camino elegido se vuelve fase', () => {
  const phase = fase({ endsOn: '2026-03-29' });

  it('empieza el día siguiente al final de la fase anterior', () => {
    const draft = optionToPhaseDraft(phase, caminos[0]);
    expect(draft.startsOn).toBe('2026-03-30');
    // 16 semanas = 112 días contando ambos extremos.
    expect(draft.endsOn).toBe('2026-07-19');
    expect(draft.direction).toBe('bulk');
    expect(draft.ratePct).toBe(0.25);
    expect(draft.title).toBe('Volumen');
  });

  /*
    La prueba que de verdad importa: lo que sale de aquí tiene que pasar por la
    puerta de siempre. Si `startsOn` se fuera un día atrás, `validatePhase`
    diría que se pisa con la fase de la que salió.
  */
  it('lo que produce pasa `validatePhase` contra el plan del que sale', () => {
    const draft = optionToPhaseDraft(phase, caminos[0]);
    expect(validatePhase([phase], draft)).toBeNull();
  });

  it('el mantenimiento no arrastra ritmo aunque el camino lo traiga', () => {
    const draft = optionToPhaseDraft(phase, { ...caminos[0], direction: 'maintain', ratePct: 0.4 });
    expect(draft.ratePct).toBe(0);
  });

  it('sin ritmo escrito se usa el de por defecto de la dirección, no cero', () => {
    const draft = optionToPhaseDraft(phase, { ...caminos[0], ratePct: null });
    expect(draft.ratePct).toBe(0.25);
  });

  /* El «si» describía la duda, y elegido el camino la duda ya no existe. La
     nota es lo que el cliente lee de lo que le toca, no del pasado. */
  it('la nota nace vacía y el «si» no viaja', () => {
    const draft = optionToPhaseDraft(phase, caminos[0]);
    expect(draft.note).toBe('');
    expect(JSON.stringify(draft)).not.toContain('Si el punto');
  });

  it.each([
    [fase({ endsOn: null }), caminos[0], 'la fase no tiene final'],
    [phase, { ...caminos[0], direction: 'engordar' }, 'la dirección no existe'],
    [phase, { ...caminos[0], weeks: null }, 'no dice cuánto dura'],
  ])('devuelve null cuando %#: %s', (p, option) => {
    expect(optionToPhaseDraft(p, option)).toBeNull();
  });
});

describe('el cruce no toca la lectura', () => {
  const cliente = { preferences: { goal: { direction: 'cut', ratePct: 0.6, note: '' } } };

  /*
    Un camino no es una fase y no puede comportarse como tal. El día que
    `effectiveGoal` mirara dentro de `nextOptions`, la analítica estaría
    juzgando a alguien contra un tramo que nadie ha decidido.
  */
  it('un cruce planteado no cambia el objetivo de hoy', () => {
    const conCruce = [fase({ nextOptions: caminos })];
    const sinCruce = [fase()];
    expect(effectiveGoal(cliente, conCruce, '2026-03-15')).toEqual(
      effectiveGoal(cliente, sinCruce, '2026-03-15')
    );
    // Y es el de la fase que cubre hoy: mantenimiento, no el volumen del camino.
    expect(effectiveGoal(cliente, conCruce, '2026-03-15').direction).toBe('maintain');
  });

  it('pasada la fecha sin decidir, se cae al objetivo declarado', () => {
    const conCruce = [fase({ nextOptions: caminos })];
    expect(effectiveGoal(cliente, conCruce, '2026-04-02').direction).toBe('cut');
  });
});

describe('borradores para el formulario', () => {
  it('el camino en blanco no trae un «si» de ejemplo', () => {
    expect(optionDraft('bulk', 16).when).toBe('');
    expect(optionDraft('bulk', 16).weeks).toBe(16);
    expect(optionDraft('cut').ratePct).toBe(0.6);
  });

  it('acota las semanas al rango que admite una fase', () => {
    expect(optionDraft('bulk', 99).weeks).toBe(24);
    expect(optionDraft('bulk', 0).weeks).toBe(1);
  });

  it('el par por defecto son dos caminos a los que solo les falta el «si»', () => {
    const draft = forkDraft();
    expect(draft).toHaveLength(2);
    expect(validateOptions(draft)).toMatch(/«si»/i);
    const escrito = draft.map((o, i) => ({ ...o, when: `condición ${i}` }));
    expect(validateOptions(escrito)).toBeNull();
  });
});
