import { describe, expect, it } from 'vitest';

import {
  afterLastClose,
  answerTrend,
  deliverableWeeks,
  jsonbSize,
  pendingReviews,
  planSnapshot,
  readableStructure,
  reviewableWeeks,
  reviewHistory,
  snapshotChanges,
  queueWeek,
  structureChanges,
  weekToReview,
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

/*
  ══ El tope de la columna ═══════════════════════════════════════════════════

  Un entrenador escribió una nota de dos líneas y la revisión no se cerró: «La
  foto del plan es demasiado grande». No había tocado el programa — la foto se
  hace sola con el plan que tenga puesto, y el suyo era largo.

  La causa: se medía el texto JSON contra un tope que el servidor comprueba en
  bytes de jsonb (`pg_column_size`, migración 0042), y jsonb pesa aquí más de
  vez y media lo que el texto. Medido contra Postgres, la foto de 6.208
  caracteres que el recorte daba por buena ocupaba 10.172 bytes.
*/
describe('la foto cabe en la columna', () => {
  const TOPE = 8192; // el de la migración 0042

  const EJERCICIOS = [
    'Sentadilla trasera con barra',
    'Press de banca plano con barra',
    'Remo con barra a 45 grados',
    'Press militar de pie',
    'Peso muerto rumano con mancuernas',
    'Jalón al pecho agarre neutro',
    'Curl de bíceps con mancuernas',
    'Extensión de tríceps en polea alta',
  ];
  const DIAS = ['Pierna completa', 'Torso empuje', 'Torso tirón', 'Pierna posterior', 'Full body'];

  const programa = (semanas) => ({
    microcycles: Array.from({ length: semanas }, (_, i) => ({
      weekNumber: i + 1,
      days: DIAS.map((dayName) => ({
        dayName,
        exercises: EJERCICIOS.map((name) => ({ name, sets: [{}, {}, {}, {}] })),
      })),
    })),
  });

  const dieta = {
    targetKcals: 2400,
    proteinGrams: 180,
    carbsGrams: 280,
    fatsGrams: 70,
    stepsGoal: 10000,
    cardioGoal: '3 días de 25 minutos',
    closedMeals: ['Desayuno', 'Media mañana', 'Comida', 'Merienda', 'Cena'].map((name) => ({
      name,
      target: { kcals: 500 },
    })),
  };

  it('un programa largo no revienta la revisión', () => {
    const foto = planSnapshot({ nutrition: dieta, program: programa(20) });
    expect(jsonbSize(foto)).toBeLessThanOrEqual(TOPE);
  });

  /* Lo que se suelta es historia vieja, nunca las cifras del objetivo: son lo que
     se consulta dos meses después y ocupan unos cientos de bytes. */
  it('recortando conserva las cifras y las semanas recientes', () => {
    const foto = planSnapshot({ nutrition: dieta, program: programa(20) });
    expect(foto).toMatchObject({ kcals: 2400, protein: 180, carbs: 280, fats: 70, weeks: 20 });
    expect(foto.weeksPlan.length).toBeGreaterThan(0);
    /* Las últimas, no las primeras: se revisa lo que está por venir. */
    expect(foto.weeksPlan[foto.weeksPlan.length - 1].w).toBe(20);
  });

  /* Una sola semana desmesurada tampoco puede tumbarla: antes el recorte paraba
     en una semana y la mandaba igual. */
  it('una semana sola que no cabe se suelta entera', () => {
    const enorme = {
      microcycles: [
        {
          weekNumber: 1,
          days: Array.from({ length: 7 }, (_, i) => ({
            dayName: `Día ${i + 1}`,
            exercises: Array.from({ length: 40 }, (_, j) => ({
              name: `Ejercicio con nombre largo número ${j}`,
              sets: [{}, {}, {}],
            })),
          })),
        },
      ],
    };
    const foto = planSnapshot({ nutrition: dieta, program: enorme });
    expect(jsonbSize(foto)).toBeLessThanOrEqual(TOPE);
    expect(foto.kcals).toBe(2400);
  });

  /* Y un plan corriente no pierde nada: el recorte solo actúa cuando hace falta.
     Cuatro semanas de tres días, que es lo que tiene la mayoría. */
  it('un plan corriente se guarda entero', () => {
    const foto = planSnapshot({
      nutrition: dieta,
      program: {
        microcycles: Array.from({ length: 4 }, (_, i) => ({
          weekNumber: i + 1,
          days: DIAS.slice(0, 3).map((dayName) => ({
            dayName,
            exercises: EJERCICIOS.slice(0, 5).map((name) => ({ name, sets: [{}, {}, {}] })),
          })),
        })),
      },
    });
    expect(foto.weeksPlan).toHaveLength(4);
    expect(foto.meals).toHaveLength(5);
  });

  /*
    ══ Y la estimación medida contra Postgres de verdad ═══════════════════════

    El recorte se fía de `jsonbSize`, así que comprobar el recorte con `jsonbSize`
    no demuestra nada: si la cuenta está mal, las dos partes se equivocan igual.
    Estos son cuatro valores pesados con `pg_column_size` en Postgres 17, y lo que
    se exige es lo único que salva la revisión — que la estimación NUNCA quede por
    debajo del tamaño real.

    Faltaba el relleno de alineación: Postgres cuadra a cuatro bytes antes de cada
    objeto, cada lista y cada número, y una foto son cientos de `{n, s}`. Sin
    contarlo, un programa de veinte ejercicios por día se estimaba en 7.627 bytes,
    pesaba 8.296 y el servidor lo rechazaba con la foto ya recortada.
  */
  const MEDIDO = [
    [{ n: 'abc', s: null }, 29],
    [[{ n: 'abc', s: null }, { n: 'abc', s: null }, { n: 'abc', s: null }], 101],
    [{ kcals: 2400 }, 32],
    [{ w: 1, d: [{ n: 'Dia', e: [{ n: 'Sentadilla', s: 4 }] }] }, 120],
  ];

  it('la estimación nunca queda por debajo de lo que pesa en Postgres', () => {
    MEDIDO.forEach(([valor, real]) => {
      expect(jsonbSize(valor)).toBeGreaterThanOrEqual(real);
    });
  });

  /*
    El programa que se le cayó a un entrenador: muchos ejercicios por día, nombres
    cortos y sin series apuntadas todavía. Es la forma que peor sale —todo son
    objetos diminutos, y el relleno pesa más que el contenido—.
  */
  it('un programa de objetos diminutos también cabe', () => {
    const foto = planSnapshot({
      nutrition: dieta,
      program: {
        microcycles: Array.from({ length: 8 }, (_, i) => ({
          weekNumber: i + 1,
          days: Array.from({ length: 3 }, (_, d) => ({
            dayName: `D${d}`,
            exercises: Array.from({ length: 20 }, (_, j) => ({ name: `E${j}`, sets: [] })),
          })),
        })),
      },
    });
    expect(jsonbSize(foto)).toBeLessThanOrEqual(TOPE);
    expect(foto.kcals).toBe(2400);
  });
});

describe('qué cambió entre dos revisiones', () => {
  it('solo lo que se movió, con las dos cifras', () => {
    const cambios = snapshotChanges({ kcals: 2400, protein: 180 }, { kcals: 2200, protein: 180 });
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ key: 'kcals', from: 2400, to: 2200, up: false });
  });

  /*
    ══ Estrenar una cifra SÍ es un cambio, y era el fallo que más se notaba ═══

    Aquí se exigía que las dos fotos tuvieran la cifra puesta, así que ponerle
    10.000 pasos a alguien que no los tenía no producía ninguna línea: ni en el
    diff de la revisión, ni en lo que le llega al cliente, ni en el histórico.
    Y los pasos y el cardio son justo los dos campos que casi nadie rellena al
    dar de alta, o sea que el caso frecuente era el que se perdía.

    Lo que la regla protegía —el alta del plan leída como un ajuste— lo protege
    la prueba siguiente: sin foto anterior no se compara nada.
  */
  it('estrenar una cifra cuenta como cambio, con el hueco de antes', () => {
    const cambios = snapshotChanges({ kcals: 2400 }, { kcals: 2400, steps: 10000 });
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ key: 'steps', from: null, to: 10000, up: null });
  });

  /* Y quitársela también: «te retiro el cardio» es una decisión de revisión, y
     con `to: null` la pantalla pinta el hueco en vez de inventarse un cero. */
  it('quitar una cifra cuenta como cambio', () => {
    const cambios = snapshotChanges({ steps: 10000 }, {});
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ key: 'steps', from: 10000, to: null, up: null });
  });

  /* Lo que no estaba y sigue sin estar no es nada: son las cifras que este
     entrenador no usa, y sacarlas llenaría el diff de campos vacíos. */
  it('una cifra que nunca ha estado no genera línea', () => {
    expect(snapshotChanges({ kcals: 2400 }, { kcals: 2400 })).toEqual([]);
    expect(snapshotChanges({ cardio: '' }, {})).toEqual([]);
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

/**
 * La pasada del lunes.
 *
 * Lo que se fija: cuenta ENTREGAS sin contestar, en el orden en que llegaron, y
 * nunca a quien no ha entregado nada — parar la pasada en alguien con quien no se
 * puede hacer nada es lo que hace que se abandone a la tercera.
 */
describe('pendingReviews', () => {
  const clients = [
    { id: 'a', name: 'Ana' },
    { id: 'b', name: 'Berto' },
    { id: 'c', name: 'Cris' },
    { id: 'z', name: 'Zoe', status: 'archived' },
  ];

  const checkIns = {
    // Berto entregó antes que Ana: va primero aunque alfabéticamente vaya después.
    b: { submittedAt: '2026-08-24T09:00:00Z', reviewedAt: null },
    a: { submittedAt: '2026-08-24T18:00:00Z', reviewedAt: null },
    // Cris ya está contestada.
    c: { submittedAt: '2026-08-23T10:00:00Z', reviewedAt: '2026-08-23T11:00:00Z' },
    z: { submittedAt: '2026-08-20T10:00:00Z', reviewedAt: null },
  };

  it('son las entregadas sin contestar, en orden de entrega', () => {
    expect(pendingReviews({ clients, checkIns }).map((p) => p.client.id)).toEqual(['b', 'a']);
  });

  it('quien no ha entregado no está esperando por ti', () => {
    expect(pendingReviews({ clients, checkIns: {} })).toEqual([]);
    expect(
      pendingReviews({ clients, checkIns: { a: { submittedAt: null, reviewedAt: null } } })
    ).toEqual([]);
  });

  it('los archivados no entran en la pasada', () => {
    expect(pendingReviews({ clients, checkIns }).some((p) => p.client.id === 'z')).toBe(false);
  });

  it('sin nada que pasar devuelve una lista vacía, no revienta', () => {
    expect(pendingReviews()).toEqual([]);
  });
});

describe('cómo evoluciona lo que te cuenta', () => {
  const PREGUNTAS = [
    { id: 'sueño', label: 'Descanso', kind: 'scale', min: 1, max: 10 },
    { id: 'hambre', label: 'Hambre', kind: 'scale', min: 1, max: 10 },
    { id: 'nota', label: 'Algo más', kind: 'text' },
  ];
  const entrega = (weekStart, answers) => ({ id: weekStart, weekStart, answers });

  it('el valor de esta semana, el de la anterior y su diferencia', () => {
    const filas = answerTrend({
      checkIns: [
        entrega('2026-08-03', { sueño: '8', hambre: '3' }),
        entrega('2026-08-10', { sueño: '5', hambre: '3' }),
      ],
      questions: PREGUNTAS,
      weekStart: '2026-08-10',
    });

    expect(filas.map((f) => f.id)).toEqual(['sueño', 'hambre']);
    expect(filas[0]).toMatchObject({ value: 5, from: 8, delta: -3 });
    /* Sin movimiento, la diferencia es cero y no un hueco: «igual que la semana
       pasada» es una respuesta, no una ausencia. */
    expect(filas[1]).toMatchObject({ value: 3, from: 3, delta: 0 });
  });

  /* Las de texto no se comparan: lo que escribió se lee. */
  it('las preguntas de texto no entran', () => {
    const filas = answerTrend({
      checkIns: [entrega('2026-08-10', { nota: 'comí fuera el domingo' })],
      questions: PREGUNTAS,
      weekStart: '2026-08-10',
    });
    expect(filas).toEqual([]);
  });

  /*
    Revisando una semana pasada, lo que vino DESPUÉS todavía no ha ocurrido para
    quien revisa. Enseñarlo convertiría el histórico en una predicción.
  */
  it('no mira más allá de la semana que se revisa', () => {
    const filas = answerTrend({
      checkIns: [
        entrega('2026-08-03', { sueño: '8' }),
        entrega('2026-08-10', { sueño: '5' }),
        entrega('2026-08-17', { sueño: '9' }),
      ],
      questions: PREGUNTAS,
      weekStart: '2026-08-10',
    });
    expect(filas[0].points.map((p) => p.value)).toEqual([8, 5]);
    expect(filas[0].value).toBe(5);
  });

  /* No haber contestado ESTA semana es un hueco, y se dice: coger el valor de
     hace tres semanas y pintarlo como el de ahora sería inventarle una
     respuesta. */
  it('si no contestó esta semana, el valor es nulo pero la serie sigue', () => {
    const filas = answerTrend({
      checkIns: [entrega('2026-08-03', { sueño: '8' }), entrega('2026-08-10', {})],
      questions: PREGUNTAS,
      weekStart: '2026-08-10',
    });
    expect(filas[0]).toMatchObject({ value: null, from: 8, delta: null });
  });

  it('una pregunta que nunca ha contestado no genera fila', () => {
    const filas = answerTrend({
      checkIns: [entrega('2026-08-10', { sueño: '5' })],
      questions: PREGUNTAS,
      weekStart: '2026-08-10',
    });
    expect(filas.map((f) => f.id)).toEqual(['sueño']);
  });
});

/*
  ══ QUÉ SEMANA ABRE LA REVISIÓN ═══════════════════════════════════════════════

  Estas pruebas existen por un fallo que llegó a producción: se cerraba la semana
  y el cliente seguía en la pasada de «Hoy». La escritura era correcta —el
  histórico se actualizaba y el diff volvía a cero— pero se guardaba con la fecha
  de OTRA semana, porque la pantalla abría en la última con actividad y la pasada
  pregunta por el periodo de check-in vigente.

  La regla estaba escrita dentro de un componente de setecientas líneas, así que
  no había forma de probarla. Ahora está aquí.
*/
describe('weekToReview', () => {
  /* Alta en lunes, para que la semana 1 empiece el 2 de marzo. */
  const ALTA_W = '2026-03-02';
  const lunesW = (n) =>
    new Date(Date.parse(`${ALTA_W}T00:00:00Z`) + (n - 1) * 7 * 86400000).toISOString().slice(0, 10);

  const semanasW = [1, 2, 3, 4, 5];

  it('manda lo que entregó y espera respuesta', () => {
    expect(
      weekToReview({
        weeks: semanasW,
        startDate: ALTA_W,
        submitted: { weekStart: lunesW(2), submittedAt: '2026-03-15', reviewedAt: null },
        period: { start: lunesW(5), isDue: true },
        fallback: 1,
      })
    ).toBe(2);
  });

  /*
    Y sin entrega esperando, LA QUE PIDE LA PASADA — no la última con actividad.
    Éste es el caso que fallaba: cerrar la 3 no quita de «Hoy» a quien tiene
    pendiente la 5, porque `buildPortfolio` descarta toda entrega anterior al
    inicio del periodo vigente antes de mirar si está revisada.
  */
  it('sin entrega esperando, abre la semana que pide la pasada', () => {
    expect(
      weekToReview({
        weeks: semanasW,
        startDate: ALTA_W,
        submitted: { weekStart: lunesW(2), submittedAt: '2026-03-15', reviewedAt: '2026-03-16' },
        period: { start: lunesW(5), isDue: true },
        fallback: 3,
      })
    ).toBe(5);
  });

  /* Una semana que aún no le toca no se abre: no hay nada que cerrar todavía. */
  it('si el periodo no ha vencido, se cae a lo último que hizo', () => {
    expect(
      weekToReview({
        weeks: semanasW,
        startDate: ALTA_W,
        submitted: null,
        period: { start: lunesW(5), isDue: false },
        fallback: 3,
      })
    ).toBe(3);
  });

  /* Y una semana sin montar tampoco: la pantalla no tendría qué enseñar. */
  it('una semana que no existe en el programa no se abre', () => {
    expect(
      weekToReview({
        weeks: [1, 2, 3],
        startDate: ALTA_W,
        submitted: null,
        period: { start: lunesW(9), isDue: true },
        fallback: 3,
      })
    ).toBe(3);
  });

  it('sin nada de nada, lo que diga quien llama', () => {
    expect(weekToReview({ weeks: semanasW, startDate: ALTA_W, fallback: 4 })).toBe(4);
  });

  /* La semana por la que pregunta la pasada, para poder AVISAR cuando lo que se
     va a cerrar no es esa. */
  it('queueWeek dice por cuál pregunta la pasada', () => {
    expect(queueWeek({ startDate: ALTA_W, period: { start: lunesW(5), isDue: true } })).toBe(5);
    expect(queueWeek({ startDate: ALTA_W, period: { start: lunesW(5), isDue: false } })).toBe(null);
    expect(queueWeek({ startDate: ALTA_W, period: null })).toBe(null);
  });
});

/*
  ══ QUÉ SEMANAS SE PUEDEN ABRIR ═══════════════════════════════════════════════

  La segunda mitad del mismo fallo. Aunque la pantalla ya sepa que la pasada pide
  la semana 4, si la 4 no existe en la lista no se puede abrir — y la lista salía
  de los microciclos. Un cliente con el programa acabado en la 3 y cadencia
  semanal pedía la 4, se caía a la 3, y se cerraba la 3: callejón sin salida.
*/
describe('reviewableWeeks', () => {
  const ALTA_R = '2026-03-02';
  const lunesR = (n) =>
    new Date(Date.parse(`${ALTA_R}T00:00:00Z`) + (n - 1) * 7 * 86400000).toISOString().slice(0, 10);

  it('incluye la semana que pide la pasada aunque no tenga rutina montada', () => {
    expect(
      reviewableWeeks({
        programmed: [1, 2, 3],
        startDate: ALTA_R,
        submitted: null,
        period: { start: lunesR(4), isDue: true },
      })
    ).toEqual([1, 2, 3, 4]);
  });

  /* Y la que entregó, por el mismo motivo: puede entregar una semana que tú no
     montaste, y sin ella en la lista su entrega tampoco se podía abrir. */
  it('incluye la semana que entregó aunque no tenga rutina montada', () => {
    expect(
      reviewableWeeks({
        programmed: [1, 2],
        startDate: ALTA_R,
        submitted: { weekStart: lunesR(5), submittedAt: '2026-04-01', reviewedAt: null },
        period: null,
      })
    ).toEqual([1, 2, 5]);
  });

  it('no duplica lo que ya estaba montado, y sale ordenado', () => {
    expect(
      reviewableWeeks({
        programmed: [3, 1, 2],
        startDate: ALTA_R,
        submitted: { weekStart: lunesR(2), submittedAt: '2026-03-10', reviewedAt: null },
        period: { start: lunesR(3), isDue: true },
      })
    ).toEqual([1, 2, 3]);
  });

  /* Si no le toca revisión, no se inventa una semana: la lista es la del
     programa y nada más. */
  it('sin periodo vencido no añade nada', () => {
    expect(
      reviewableWeeks({
        programmed: [1, 2],
        startDate: ALTA_R,
        submitted: null,
        period: { start: lunesR(4), isDue: false },
      })
    ).toEqual([1, 2]);
  });

  it('sin nada devuelve una lista vacía, no un hueco', () => {
    expect(reviewableWeeks({})).toEqual([]);
  });
});

describe('lo que pasó con lo que cambiaste (afterLastClose)', () => {
  const linea = (filas) =>
    filas.map(([week, weekStart, weight]) => ({ week, weekStart, weight, kcals: null, photo: null, reviewed: false }));

  const cierre = (weekStart, changes = [], structure = []) => ({ weekStart, changes, structure });

  it('junta el diff del último cierre con la respuesta del peso', () => {
    const res = afterLastClose({
      rows: [cierre('2026-08-24', [{ key: 'kcals', from: 2400, to: 2250, unit: ' kcal', text: false }])],
      timeline: linea([
        [3, '2026-08-17', 80.4],
        [4, '2026-08-24', 80.0],
        [5, '2026-08-31', 79.5],
      ]),
    });
    expect(res).toMatchObject({ week: 4, delta: -0.5, weeksSince: 1, otherCount: 0 });
    expect(res.changes).toHaveLength(1);
  });

  it('calla sin cierre, sin cambios o sin semanas posteriores', () => {
    const filas = linea([
      [4, '2026-08-24', 80.0],
      [5, '2026-08-31', 79.5],
    ]);
    expect(afterLastClose({ rows: [], timeline: filas })).toBeNull();
    /* Cerrada sin tocar nada: no hubo experimento del que contar el resultado. */
    expect(afterLastClose({ rows: [cierre('2026-08-24')], timeline: filas })).toBeNull();
    /* El cierre es la última semana de la línea: todavía no ha pasado nada. */
    expect(
      afterLastClose({
        rows: [cierre('2026-08-31', [{ key: 'steps', from: 8000, to: 10000, text: false }])],
        timeline: filas,
      })
    ).toBeNull();
  });

  it('sin pesajes a un lado del cierre, delta es null y no un cero', () => {
    const res = afterLastClose({
      rows: [cierre('2026-08-24', [{ key: 'kcals', from: 2400, to: 2250, text: false }])],
      timeline: linea([
        [4, '2026-08-24', 80.0],
        [5, '2026-08-31', null],
      ]),
    });
    expect(res.delta).toBeNull();
    expect(res.weeksSince).toBe(1);
  });

  it('los cambios de texto no llevan delta: van al recuento', () => {
    const res = afterLastClose({
      rows: [
        cierre(
          '2026-08-24',
          [{ key: 'cardio', from: '2 días', to: '3 días', text: true }],
          [{ area: 'entreno', kind: 'add', label: 'Hack' }]
        ),
      ],
      timeline: linea([
        [4, '2026-08-24', 80.0],
        [5, '2026-08-31', 79.6],
      ]),
    });
    expect(res.changes).toHaveLength(0);
    expect(res.otherCount).toBe(2);
    expect(res.delta).toBe(-0.4);
  });
});
