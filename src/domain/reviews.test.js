import { describe, expect, it } from 'vitest';

import {
  deliverableWeeks,
  planSnapshot,
  readableStructure,
  reviewHistory,
  snapshotChanges,
  structureChanges,
} from './reviews';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que el histórico no INVENTE cambios. Es lo único que puede hacerle daño de
 * verdad: si dice «2400 → 2200» donde no hubo ajuste, o si cuenta como cambio
 * haber configurado el plan por primera vez, el entrenador deja de fiarse — y un
 * histórico del que no te fías es peor que ninguno.
 */

describe('la foto del plan', () => {
  it('guarda solo lo que existe', () => {
    const foto = planSnapshot({
      nutrition: { targetKcals: 2400, proteinGrams: 180, carbsGrams: null, fatsGrams: 70 },
      program: { microcycles: [{ weekNumber: 1 }, { weekNumber: 2 }] },
    });
    expect(foto).toMatchObject({ kcals: 2400, protein: 180, fats: 70, weeks: 2 });
    /* Y la estructura del programa, aunque los microciclos vengan sin días. */
    expect(foto.weeksPlan).toEqual([{ w: 1, d: [] }, { w: 2, d: [] }]);
  });

  it('un plan vacío no deja foto con huecos', () => {
    expect(planSnapshot({})).toEqual({});
  });

  /* El cardio entra en la foto igual que los pasos. Sin esto, cambiárselo en una
     revisión no aparecería en el histórico y este diría «sin cambios» delante de
     un cambio que sí se hizo. */
  it('guarda el cardio, que es texto', () => {
    const foto = planSnapshot({ nutrition: { stepsGoal: '10000', cardioGoal: '2 días 30/30' } });
    expect(foto).toMatchObject({ steps: 10000, cardio: '2 días 30/30' });
  });

  it('recorta un cardio largo para que la foto quepa en su tope', () => {
    const foto = planSnapshot({ nutrition: { cardioGoal: 'x'.repeat(400) } });
    expect(foto.cardio).toHaveLength(120);
  });

  it('sin cardio no deja la clave puesta', () => {
    expect(planSnapshot({ nutrition: { cardioGoal: '   ' } })).toEqual({});
  });
});

describe('qué cambió entre dos revisiones', () => {
  it('solo lo que se movió, con las dos cifras', () => {
    const cambios = snapshotChanges({ kcals: 2400, protein: 180 }, { kcals: 2200, protein: 180 });
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ key: 'kcals', from: 2400, to: 2200, up: false });
  });

  /* Configurar el plan por primera vez no es un ajuste. «Sin calorías → 2400»
     leído como cambio haría creer que hubo una decisión donde solo hubo un alta. */
  it('estrenar una cifra no cuenta como cambio', () => {
    expect(snapshotChanges({ kcals: null }, { kcals: 2400 })).toEqual([]);
    expect(snapshotChanges({}, { kcals: 2400 })).toEqual([]);
  });

  it('sin foto anterior no se compara nada', () => {
    expect(snapshotChanges(null, { kcals: 2400 })).toEqual([]);
  });

  /*
    El cardio cambia como cualquier otro campo, pero NO tiene dirección: «2 días»
    y «3 días de 15 min» no suben ni bajan. `up: null` es lo que impide que la
    pantalla lo pinte como una bajada —que es lo que haría con `false`—.
  */
  it('el cardio cambia sin flecha de subida o bajada', () => {
    const cambios = snapshotChanges({ cardio: '2 días 30/30' }, { cardio: '3 días 15 min' });
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ key: 'cardio', text: true, up: null });
  });

  it('un cardio que no se ha tocado no genera línea', () => {
    expect(snapshotChanges({ cardio: '2 días' }, { cardio: '2 días' })).toEqual([]);
  });
});

describe('el histórico', () => {
  const revision = (weekStart, snapshot, over = {}) => ({
    id: weekStart,
    weekStart,
    reviewedAt: `${weekStart}T10:00:00Z`,
    coachNotes: '',
    snapshot,
    ...over,
  });

  it('solo las revisiones cerradas, de la más nueva a la más vieja', () => {
    const filas = reviewHistory({
      checkIns: [
        revision('2026-08-03', { kcals: 2400 }),
        revision('2026-08-10', { kcals: 2200 }),
        { id: 'x', weekStart: '2026-08-17', reviewedAt: null, submittedAt: 'ya' },
      ],
    });
    expect(filas.map((f) => f.weekStart)).toEqual(['2026-08-10', '2026-08-03']);
  });

  it('el cambio se calcula contra la revisión ANTERIOR', () => {
    const filas = reviewHistory({
      checkIns: [revision('2026-08-03', { kcals: 2400 }), revision('2026-08-10', { kcals: 2200 })],
    });
    expect(filas[0].changes[0]).toMatchObject({ from: 2400, to: 2200 });
    expect(filas[1].changes).toEqual([]);
  });

  /* Las de antes de la 0042 no tienen foto: se distingue de «no cambió nada»
     porque son cosas distintas y la pantalla las dice distinto. */
  it('sin foto se marca, no se finge', () => {
    const [fila] = reviewHistory({ checkIns: [revision('2026-08-03', null)] });
    expect(fila.hasSnapshot).toBe(false);
    expect(fila.changes).toEqual([]);
  });

  /* El vídeo se empareja POR SEMANA, que es lo que permite enlazarlo días
     después de haber cerrado la revisión. */
  it('engancha el vídeo de su semana, y el más reciente si hay dos', () => {
    const filas = reviewHistory({
      checkIns: [revision('2026-08-03', {})],
      links: [
        { id: 'v1', weekStart: '2026-08-03', createdAt: '2026-08-04' },
        { id: 'v2', weekStart: '2026-08-03', createdAt: '2026-08-06' },
        { id: 'otro', weekStart: '2026-07-27', createdAt: '2026-07-28' },
      ],
    });
    expect(filas[0].video.id).toBe('v2');
  });

  it('un enlace revocado no cuenta', () => {
    const filas = reviewHistory({
      checkIns: [revision('2026-08-03', {})],
      links: [{ id: 'v1', weekStart: '2026-08-03', createdAt: '2026-08-04', revokedAt: 'ya' }],
    });
    expect(filas[0].video).toBeNull();
  });
});

/*
  ══ Los cambios de estructura ═══════════════════════════════════════════════

  Comparar POR NOMBRE y no por posición es lo que protege esto: mover la cena al
  segundo puesto no es un cambio de dieta, y comparando por orden lo parecería —
  el histórico se llenaría de cambios que nadie hizo.
*/
describe('cambios de estructura', () => {
  const conComidas = (meals) => ({ meals });
  /* En la forma nueva: todas las semanas. `w` es el número de microciclo. */
  const conDias = (days) => ({ weeksPlan: [{ w: 1, d: days }] });

  it('una comida que entra y otra que sale', () => {
    const cambios = structureChanges(
      conComidas([{ n: 'Desayuno', k: 500 }, { n: 'Media mañana', k: 300 }]),
      conComidas([{ n: 'Desayuno', k: 500 }, { n: 'Batido', k: 300 }])
    );
    expect(cambios).toEqual([
      { area: 'dieta', kind: 'add', label: 'Batido' },
      { area: 'dieta', kind: 'remove', label: 'Media mañana' },
    ]);
  });

  it('reordenar no es cambiar', () => {
    const meals = [{ n: 'Cena', k: 600 }, { n: 'Desayuno', k: 500 }];
    const alReves = [{ n: 'Desayuno', k: 500 }, { n: 'Cena', k: 600 }];
    expect(structureChanges(conComidas(meals), conComidas(alReves))).toEqual([]);
  });

  it('la misma comida con otro objetivo sale como cambio de cifra', () => {
    const [cambio] = structureChanges(
      conComidas([{ n: 'Cena', k: 600 }]),
      conComidas([{ n: 'Cena', k: 500 }])
    );
    expect(cambio).toMatchObject({ kind: 'change', label: 'Cena', from: 600, to: 500, up: false });
  });

  it('ejercicios que entran y salen, con su día', () => {
    const cambios = structureChanges(
      conDias([{ n: 'Pierna', e: [{ n: 'Sentadilla' }, { n: 'Prensa' }] }]),
      conDias([{ n: 'Pierna', e: [{ n: 'Sentadilla' }, { n: 'Hack' }] }])
    );
    expect(cambios).toEqual([
      { area: 'entreno', kind: 'add', label: 'Hack', in: 'S1 · Pierna' },
      { area: 'entreno', kind: 'remove', label: 'Prensa', in: 'S1 · Pierna' },
    ]);
  });

  it('un día entero que entra o desaparece', () => {
    expect(
      structureChanges(conDias([{ n: 'Pierna', e: [] }]), conDias([{ n: 'Pierna', e: [] }, { n: 'Empuje', e: [] }]))
    ).toEqual([{ area: 'entreno', kind: 'add', label: 'Día Empuje', in: 'S1' }]);

    expect(
      structureChanges(conDias([{ n: 'Pierna', e: [] }, { n: 'Empuje', e: [] }]), conDias([{ n: 'Pierna', e: [] }]))
    ).toEqual([{ area: 'entreno', kind: 'remove', label: 'Día Empuje', in: 'S1' }]);
  });

  /*
    EL CASO QUE FALLABA. La foto guardaba solo el último microciclo, así que
    tocar la semana 1 de un programa de tres no cambiaba nada y el histórico
    decía «sin cambios» delante de un cambio real.
  */
  it('coge el cambio aunque NO sea en la última semana', () => {
    const antes = {
      weeksPlan: [
        { w: 1, d: [{ n: 'Torso', e: [{ n: 'Abs colgado', s: 3 }] }] },
        { w: 2, d: [{ n: 'Torso', e: [{ n: 'Abs colgado', s: 3 }] }] },
      ],
    };
    const ahora = {
      weeksPlan: [
        { w: 1, d: [{ n: 'Torso', e: [{ n: 'Abs colgado', s: 4 }] }] },
        { w: 2, d: [{ n: 'Torso', e: [{ n: 'Abs colgado', s: 3 }] }] },
      ],
    };
    expect(structureChanges(antes, ahora)).toEqual([
      {
        area: 'entreno',
        kind: 'change',
        label: 'Abs colgado',
        in: 'S1 · Torso',
        from: 3,
        to: 4,
        unit: ' series',
        up: true,
      },
    ]);
  });

  it('sin foto anterior no se inventa nada', () => {
    expect(structureChanges(null, conComidas([{ n: 'Cena', k: 500 }]))).toEqual([]);
  });
});

/*
  ══ Las series ══════════════════════════════════════════════════════════════

  Añadir una serie a un ejercicio es el ajuste más frecuente de una revisión, y
  el histórico decía «sin cambios» porque la foto solo guardaba nombres. Estas
  pruebas son las que impiden que se vuelva a caer.
*/
describe('cambios de series', () => {
  it('una serie más sale como cambio de cifra', () => {
    const [cambio] = structureChanges(
      { weeksPlan: [{ w: 1, d: [{ n: 'Pierna', e: [{ n: 'Sentadilla', s: 3 }] }] }] },
      { weeksPlan: [{ w: 1, d: [{ n: 'Pierna', e: [{ n: 'Sentadilla', s: 4 }] }] }] }
    );
    expect(cambio).toMatchObject({
      area: 'entreno',
      kind: 'change',
      label: 'Sentadilla',
      in: 'S1 · Pierna',
      from: 3,
      to: 4,
      up: true,
    });
  });

  it('el mismo número de series no es un cambio', () => {
    expect(
      structureChanges(
        { weeksPlan: [{ w: 1, d: [{ n: 'Pierna', e: [{ n: 'Sentadilla', s: 3 }] }] }] },
        { weeksPlan: [{ w: 1, d: [{ n: 'Pierna', e: [{ n: 'Sentadilla', s: 3 }] }] }] }
      )
    ).toEqual([]);
  });

  /* Las primeras fotos guardaban los ejercicios como cadenas. El histórico no
     puede romperse en la frontera entre las dos versiones. */
  it('acepta las fotos viejas, con los ejercicios como texto', () => {
    const cambios = structureChanges(
      { days: [{ n: 'Pierna', e: ['Sentadilla', 'Prensa'] }] },
      { weeksPlan: [{ w: null, d: [{ n: 'Pierna', e: [{ n: 'Sentadilla', s: 4 }] }] }] }
    );
    expect(cambios).toEqual([{ area: 'entreno', kind: 'remove', label: 'Prensa', in: 'Pierna' }]);
  });

  it('la foto guarda cuántas series tiene cada ejercicio', () => {
    const foto = planSnapshot({
      program: {
        microcycles: [
          { weekNumber: 1, days: [{ dayName: 'Pierna', exercises: [{ name: 'Sentadilla', sets: [{}, {}, {}] }] }] },
        ],
      },
    });
    expect(foto.weeksPlan).toEqual([
      { w: 1, d: [{ n: 'Pierna', e: [{ n: 'Sentadilla', s: 3 }] }] },
    ]);
  });
});

/*
  ══ El campo del día ════════════════════════════════════════════════════════

  Un día del microciclo guarda su nombre en `dayName`, no en `name`. La foto leía
  `name`, así que TODOS los días salían con la cadena vacía, se emparejaban entre
  sí y el histórico escupía sesenta líneas de «+ / −» para un programa que no
  había cambiado. Esta prueba es la que faltaba.
*/
describe('los días del programa', () => {
  const programa = (dias) => ({ microcycles: [{ weekNumber: 1, days: dias }] });

  it('coge el nombre del día', () => {
    const foto = planSnapshot({ programa: null, program: programa([{ dayName: 'Torso', exercises: [] }]) });
    expect(foto.weeksPlan[0].d[0].n).toBe('Torso');
  });

  /* Sin nombre, la posición: dos días anónimos NO pueden ser el mismo. */
  it('un día sin nombre no se confunde con otro', () => {
    const foto = planSnapshot({ program: programa([{ exercises: [] }, { exercises: [] }]) });
    expect(foto.weeksPlan[0].d.map((d) => d.n)).toEqual(['Día 1', 'Día 2']);
  });

  /* El caso real: un programa idéntico no puede producir NI UN cambio. */
  it('un programa que no cambia no genera cambios', () => {
    const dias = [
      { dayName: 'Torso', exercises: [{ name: 'Press', sets: [{}, {}] }] },
      { dayName: 'Pierna', exercises: [{ name: 'Hack', sets: [{}, {}] }] },
    ];
    const foto = planSnapshot({ program: programa(dias) });
    expect(structureChanges(foto, planSnapshot({ program: programa(dias) }))).toEqual([]);
  });
});

/*
  ══ Fotos que no se pueden comparar ═════════════════════════════════════════

  Durante unos días la foto guardó los días sin nombre. Comparar contra una de
  esas producía «−37 ejercicios, +34» de un programa que apenas había cambiado,
  porque al llamarse todos igual cada día se emparejaba con el primero.

  Ante eso hay que callarse y decirlo, no adivinar.
*/
describe('fotos ilegibles', () => {
  const rota = { weeksPlan: [{ w: 1, d: [{ n: '', e: [{ n: 'A' }] }, { n: '', e: [{ n: 'B' }] }] }] };
  const buena = {
    weeksPlan: [{ w: 1, d: [{ n: 'Torso', e: [{ n: 'A' }] }, { n: 'Pierna', e: [{ n: 'B' }] }] }],
  };

  it('los días sin nombre hacen la foto incomparable', () => {
    expect(readableStructure(rota)).toBe(false);
    expect(readableStructure(buena)).toBe(true);
  });

  /* Dos días con el MISMO nombre tampoco valen: se emparejarían mal igual. */
  it('los días repetidos tampoco', () => {
    expect(
      readableStructure({ weeksPlan: [{ w: 1, d: [{ n: 'Torso' }, { n: 'Torso' }] }] })
    ).toBe(false);
  });

  it('contra una foto rota no se inventa ningún cambio', () => {
    expect(structureChanges(rota, buena)).toEqual([]);
    expect(structureChanges(buena, rota)).toEqual([]);
  });

  it('sin programa no hay nada ilegible', () => {
    expect(readableStructure({ kcals: 2400 })).toBe(true);
  });
});

/*
  ══ Semanas que se quedaron sin entregar ════════════════════════════════════

  Rellenar hacia atrás es del CLIENTE, no del entrenador: una revisión es la
  respuesta a algo que él entregó, y si no sube nada no hay nada que responder.
  Lo que estas pruebas protegen es que solo se le ofrezcan semanas con datos
  suyos — ofrecerle entregar una semana en blanco es ofrecerle mandar un sobre
  vacío.
*/
describe('semanas entregables', () => {
  const semanaDe = (fecha) => {
    const d = new Date(`${fecha}T00:00:00Z`);
    const lunes = new Date(d);
    lunes.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return lunes.toISOString().slice(0, 10);
  };

  const opciones = (over = {}) => ({
    history: [{ date: '2026-08-04' }, { date: '2026-08-12' }, { date: '2026-08-18' }],
    checkIns: [],
    currentStart: '2026-08-17',
    weekStartOf: semanaDe,
    ...over,
  });

  it('solo las semanas con datos y anteriores a la actual', () => {
    expect(deliverableWeeks(opciones())).toEqual(['2026-08-10', '2026-08-03']);
  });

  it('las ya entregadas no se vuelven a ofrecer', () => {
    const res = deliverableWeeks(
      opciones({ checkIns: [{ weekStart: '2026-08-10', submittedAt: 'ya' }] })
    );
    expect(res).toEqual(['2026-08-03']);
  });

  /* Una fila creada pero sin entregar no cuenta como entregada. */
  it('una fila sin entregar sigue ofreciéndose', () => {
    const res = deliverableWeeks(
      opciones({ checkIns: [{ weekStart: '2026-08-10', submittedAt: null }] })
    );
    expect(res).toContain('2026-08-10');
  });

  it('sin datos no se ofrece nada', () => {
    expect(deliverableWeeks(opciones({ history: [] }))).toEqual([]);
  });
});
