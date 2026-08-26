import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { ReviewChart } from './ReviewChart';
import { TrainingCard } from './TrainingCard';
import { NutritionCard } from './NutritionCard';
import { BodyCard } from './BodyCard';
import { ExerciseSheet } from './ExerciseSheet';
import { nutritionTrack, reviewTimeline } from '@/domain/timeline';
import { exerciseTrend } from '@/domain/week';

/*
  El plan de nutrición se lee del contexto: la tarjeta de nutrición es la que
  deja AJUSTARLO —el botón vivía en la barra de cierre y se ha ido a donde está
  lo que modifica— así que necesita `useApp`. Aquí se le da uno de mentira: lo
  que se prueba es qué se pinta, no de dónde salen los datos.
*/
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    nutrition: { c1: { stepsGoal: 12000, cardioGoal: null, hasDayVariants: false } },
    updateNutrition: () => {},
    updateNutritionTargets: () => {},
  }),
}));

/**
 * El tablero de la revisión, montado.
 *
 * ── Qué comprueban y qué no ────────────────────────────────────────────────
 * Que el árbol se construye y que lo que tiene que salir sale. Las reglas de
 * qué se ve —qué plan estuvo en vigor, si un ejercicio progresa, qué semanas
 * entran en la ventana— viven en `domain/` y se prueban allí; aquí lo que se
 * atrapa es la clase de fallo que ni el linter ni el build ven: una pieza que
 * revienta al renderizarse.
 *
 * Con `renderToStaticMarkup` y sin DOM. Los bloques llevan enlaces, así que
 * necesitan un router: `MemoryRouter` y no `BrowserRouter` porque no hay
 * ventana. Lo que no se puede probar así son los gestos —abrir la ficha de un
 * ejercicio, arrastrar la espina—, y por eso nada de eso decide qué datos
 * existen.
 */

const ALTA = '2026-03-02';
const CLIENTE = { id: 'c1', name: 'Javier Ruiz', gender: 'male' };

const monta = (nodo) => renderToStaticMarkup(<MemoryRouter>{nodo}</MemoryRouter>);

/*
  React Router usa `useLayoutEffect` dentro de `MemoryRouter` y de `Link`, y en
  el renderizador de servidor eso avisa una vez por componente: dos páginas de
  stderr por prueba, en una suite que por lo demás sale limpia. Se silencia SOLO
  ese mensaje y SOLO en este archivo — cualquier otro aviso de React sigue
  saliendo, que es el motivo por el que no se apaga la consola entera.
*/
const avisoOriginal = console.error;
beforeAll(() => {
  console.error = vi.fn((...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing')) return;
    avisoOriginal(...args);
  });
});
afterAll(() => {
  console.error = avisoOriginal;
});

const lunes = (n) =>
  new Date(Date.parse(`${ALTA}T00:00:00Z`) + (n - 1) * 7 * 86400000).toISOString().slice(0, 10);

const semanas = [1, 2, 3, 4, 5, 6];
const linea = reviewTimeline({
  weeks: semanas,
  startDate: ALTA,
  series: semanas.map((w) => ({ week: lunes(w), weight: 84 - w * 0.4 })),
});

const track = nutritionTrack({
  rows: linea,
  reviews: [
    { weekStart: lunes(1), snapshot: { kcals: 2400, protein: 180, carbs: 280, fats: 70, steps: 9000 } },
    {
      weekStart: lunes(4),
      snapshot: { kcals: 2200, protein: 190, carbs: 220, fats: 68, steps: 12000, cardio: '3 días de 25 min' },
    },
  ],
});

describe('ReviewChart', () => {
  const pinta = () => renderToStaticMarkup(<ReviewChart weeks={track} selected={6} ancho={900} />);

  /*
    La razón de que esta pieza exista: la misma curva salía DOS veces en la
    misma pantalla, una pulsable y otra no. Aquí hay una, y lleva las dos
    bandas rotuladas.
  */
  it('rotula las dos bandas y las separa', () => {
    const html = pinta();

    expect(html).toContain('PESO');
    expect(html).toContain('KCAL OBJETIVO');
    expect(html).toContain('banda-corte');
    /* Un solo dibujo. */
    expect(html.match(/grafica-svg/g)).toHaveLength(1);
  });

  /* Un objetivo no se mide: se pone y sigue puesto. El punto marca dónde TÚ lo
     cambiaste, que es lo que convierte el dibujo en el registro de tus
     decisiones. */
  it('marca el escalón donde cambiaste las calorías', () => {
    expect(pinta()).toContain('banda-escalon');
  });

  /*
    Y las dibuja como un instrumento, no como una forma: rejilla, números en el
    canal de la izquierda y área bajo la curva. Sin eso, un punto a media altura
    había que estimarlo interpolando de cabeza entre dos extremos escritos en una
    esquina — que es como estaba.
  */
  it('lleva rejilla, eje y área: se lee un valor, no una forma', () => {
    const html = pinta();

    expect(html).toContain('grafica-rejilla');
    expect(html).toContain('grafica-eje');
    expect(html).toContain('banda-area');
  });

  /* Y dice qué vale la semana elegida: sin esto, elegir una semana movía una
     raya y no decía nada. */
  it('lee en palabras la semana elegida', () => {
    const html = pinta();

    expect(html).toContain('grafica-lectura');
    expect(html).toContain('Semana 6');
    expect(html).toContain('2200 kcal');
  });

  /* Y es el mando: la tira son marcas pequeñas, no cajas anchas. */
  it('la tira de semanas es el selector', () => {
    const html = pinta();

    expect(html).toContain('grafica-semana');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('>S6<');
  });

  it('sin semanas no pinta nada', () => {
    expect(renderToStaticMarkup(<ReviewChart weeks={[]} selected={1} ancho={900} />)).toBe('');
  });
});

describe('TrainingCard', () => {
  /*
    Un microciclo con la sentadilla siempre y el face pull solo las dos primeras
    semanas: así una tarjeta enseña un ejercicio que se hizo y la otra uno que se
    dejó de hacer, que son los dos casos que el bloque tiene que sostener.
  */
  const micro = (weekNumber, kg, conFacePull = false) => ({
    id: `m${weekNumber}`,
    weekNumber,
    days: [
      {
        dayName: 'Día 1',
        exercises: [{ id: 'e1', name: 'Sentadilla', sets: [{ kg: '', reps: '', rir: '' }] }],
      },
    ],
    sessions: [
      {
        id: `s${weekNumber}`,
        dayName: 'Día 1',
        date: `2026-04-0${weekNumber}`,
        entries: [
          {
            exerciseId: 'e1',
            name: 'Sentadilla',
            sets: [
              { kg: String(kg), reps: '5', rir: '2' },
              { kg: String(kg), reps: '5', rir: '2' },
            ],
          },
          ...(conFacePull
            ? [{ exerciseId: 'e2', name: 'Face pull', sets: [{ kg: '20', reps: '15', rir: '1' }] }]
            : []),
        ],
      },
    ],
  });

  const microcycles = [micro(1, 100, true), micro(2, 105, true), micro(3, 110), micro(4, 115)];

  /* Como los devuelve `exerciseHistory`. Lo único que la tarjeta le pide a esta
     fila es el nombre y si lo hizo ESTA semana; el resto sale de `exerciseTrend`,
     que trae el seguimiento entero. */
  const ejercicio = { name: 'Sentadilla', dayName: 'Día 1', done: true, trend: 'up', sessions: [] };
  const saltado = { name: 'Face pull', dayName: 'Día 1', done: false, trend: null, sessions: [] };

  const pinta = (props = {}) =>
    monta(
      <TrainingCard
        dias={[
          { dayName: 'Día 1', done: true, date: '2026-04-04', loggedSets: 3, plannedSets: 4 },
        ]}
        porDia={new Map([['Día 1', [ejercicio, saltado]]])}
        semana={4}
        microcycles={microcycles}
        sesiones={{ done: 3, planned: 4 }}
        client={CLIENTE}
        {...props}
      />
    );

  /*
    ══ Lo que este bloque vino a arreglar, a la tercera ══════════════════════

    Fue una fila de cifras derivadas —un dibujito, «45 → 45» y una palabra— y
    luego una tabla con las dos últimas sesiones al lado. La primera no traía ni
    un dato del registro; la segunda sí, pero ocho ejercicios eran ochenta cifras
    en una rejilla de cinco columnas, y en dos columnas la FORMA no se ve: quien
    sube, baja y vuelve a subir está estancado aunque la última flecha diga que
    subió.

    Lo primero que se ve ahora es la recta.
  */
  it('lo primero es la recta, con sus dos extremos rotulados', () => {
    const html = pinta();

    expect(html).toContain('ejerc-recta');
    expect(html).toContain('recta-trazo');
    /* De dónde viene y dónde está, escritos sobre el dibujo. */
    expect(html).toContain('>100<');
    expect(html).toContain('>115<');
  });

  /* Y la cifra grande es la de la semana señalada, con su salto contra la
     anterior SUYA y el número de semana al canto — sin él, deslizar cambia los
     números y no dice de cuándo son. */
  it('la cifra es la de la semana señalada, con su salto y su semana', () => {
    const html = pinta();

    expect(html).toContain('ejerc-kpi');
    expect(html).toContain('115');
    expect(html).toContain('vs S3');
    expect(html).toContain('ejerc-kpi-sem is-now');
  });

  /* El que no hizo conserva su recta: qué le tocaba y por dónde iba. Es lo que
     permite decidir si se reprograma o se le pregunta qué pasó. */
  it('el ejercicio que no hizo conserva su recta y lo dice', () => {
    const html = pinta();

    expect(html).toContain('Face pull');
    expect(html).toContain('No lo hizo esta semana');
    expect(html).toContain('ejerc-tarjeta is-saltado');
    /* Su historial sigue ahí: dejó de hacerlo en la semana 2. */
    expect(html).toContain('>S2<');
  });

  /* Y el reparto del día: dice si el problema es de un ejercicio o de todos. */
  it('resume cómo va el día entero', () => {
    expect(pinta()).toContain('sube en 1');
  });

  /* El registro en crudo vive en un diálogo, no desplegado aquí: con ocho
     ejercicios de cinco series serían cuarenta renglones en mitad del tablero. */
  it('el registro completo no se pinta hasta que se pide', () => {
    const html = pinta();

    expect(html).not.toContain('hist-serie');
    expect(html).toContain('ejerc-tarjeta-head');
  });

  /*
    Un día con sesión abierta y NINGUNA serie anotada es haber pulsado «empezar»
    y no haber entrenado. Leerlo como «día hecho» era lo que hacía que el bloque
    dijera «0 de 9 series» debajo de un día que se daba por bueno.
  */
  it('una sesión sin ninguna serie anotada no es un día entrenado', () => {
    const html = pinta({
      dias: [{ dayName: 'Día 1', done: true, date: '2026-04-04', loggedSets: 0, plannedSets: 9 }],
    });

    expect(html).toContain('no entrenado');
    expect(html).toContain('0 de 9 series');
  });

  it('sin días montados lo dice en vez de quedarse en blanco', () => {
    expect(monta(<TrainingCard dias={[]} porDia={new Map()} semana={4} client={CLIENTE} />)).toContain(
      'no tiene días montados'
    );
  });
});

describe('NutritionCard', () => {
  const pinta = (selected = 6) =>
    monta(<NutritionCard track={track} selected={selected} client={CLIENTE} />);

  /*
    De toda la nutrición, la revisión enseñaba unas barras sin rótulo. Los
    macros, los pasos y el cardio no aparecían por ninguna parte, cuando son la
    mitad de lo que se ajusta en una revisión.
  */
  it('enseña el plan entero, no solo las calorías', () => {
    const html = pinta();

    expect(html).toContain('2200');
    expect(html).toContain('Proteína');
    expect(html).toContain('Hidratos');
    expect(html).toContain('Grasas');
    expect(html).toContain('Pasos');
    expect(html).toContain('3 días de 25 min');
  });

  /* Entre dos revisiones no hay cambio, así que comparar con la semana de al
     lado daría «sin cambios» siempre. Se busca el último plan DISTINTO. */
  it('compara contra el último plan distinto, no contra la semana anterior', () => {
    expect(pinta()).toContain('desde la semana 4');
  });

  /*
    El botón de ajustar vivía en la barra de cierre, al lado del de ir a su
    entreno. Los dos sobraban allí: una acción va donde está lo que modifica, y
    éste es el bloque que enseña las calorías, los macros y los pasos.
  */
  it('deja ajustar aquí, que es donde están las cifras que se ajustan', () => {
    expect(pinta()).toContain('Ajustar');
  });

  it('una semana sin plan registrado lo dice', () => {
    const sinPlan = nutritionTrack({ rows: linea, reviews: [{ weekStart: lunes(5), snapshot: { kcals: 2400 } }] });
    expect(monta(<NutritionCard track={sinPlan} selected={1} client={CLIENTE} />)).toContain(
      'no hay constancia'
    );
  });
});

describe('BodyCard', () => {
  const pinta = (props = {}) =>
    monta(
      <BodyCard
        weeks={linea}
        selected={6}
        comparativa={null}
        history={[]}
        groups={[]}
        preguntas={[
          { id: 'sueno', label: 'Sueño', kind: 'scale' },
          { id: 'notas', label: 'Cómo ha ido la semana', kind: 'text' },
        ]}
        respuestas={{ notas: 'He dormido fatal y el martes no pude entrenar.' }}
        tendencia={[{ id: 'sueno', label: 'Sueño', value: 3, max: 5, from: 4, delta: -1 }]}
        textos={[{ id: 'notas', label: 'Cómo ha ido la semana', kind: 'text' }]}
        client={CLIENTE}
        {...props}
      />
    );

  it('reúne los tres instrumentos que no son la báscula', () => {
    const html = pinta();

    expect(html).toContain('Qué te cuenta');
    expect(html).toContain('Cómo se ve');
    expect(html).toContain('Sus medidas');
  });

  /*
    ══ Lo que escribe es una CITA, y está a la vista ═════════════════════════
    Salía como una fila de menú con una flecha, plegada junto a las otras dos.
    Es lo único de toda la revisión escrito por una persona y lo que más cambia
    la respuesta: pesa más que medio kilo de báscula.
  */
  it('lo que el cliente escribe va como cita, sin plegar', () => {
    const html = pinta();

    expect(html).toContain('citas');
    expect(html).toContain('He dormido fatal');
    /* Con su pregunta de pie: primero lo que dijo, luego a qué contestaba. */
    expect(html).toContain('Cómo ha ido la semana');
  });

  /* Y las escalas en fila, porque se comparan entre ellas. */
  it('las escalas van en fila, con su salto', () => {
    const html = pinta();

    expect(html).toContain('escalas');
    expect(html).toContain('de 5');
    expect(html).toContain('delta');
  });

  /* Lo que sí sigue plegado es lo que se consulta cuando ya sospechas algo, y
     lleva su resumen en el rótulo: plegar no es esconder. */
  it('solo se pliega lo que se consulta, y con su resumen', () => {
    expect(pinta()).toContain('sin medidas cerca');
  });

  /* Y ya no hay una segunda curva aquí dentro: la gráfica está arriba, una vez. */
  it('no repite la gráfica de arriba', () => {
    expect(pinta()).not.toContain('grafica-svg');
  });
});

describe('ExerciseSheet', () => {
  const microcycles = [1, 2, 3, 4].map((w) => ({
    id: `m${w}`,
    weekNumber: w,
    days: [{ dayName: 'Día 1', exercises: [{ id: 'e1', name: 'Sentadilla', sets: [] }] }],
    sessions: [
      {
        id: `s${w}`,
        dayName: 'Día 1',
        date: `2026-04-0${w}`,
        entries: [
          {
            exerciseId: 'e1',
            name: 'Sentadilla',
            sets: [
              { kg: String(95 + w * 5), reps: '5', rir: '2' },
              { kg: String(90 + w * 5), reps: '8', rir: '3' },
            ],
          },
        ],
      },
    ],
  }));

  const trend = exerciseTrend({ microcycles, name: 'Sentadilla', weekNumber: 4 });

  it('es un registro con la fecha al canto y la tendencia arriba', () => {
    const html = monta(<ExerciseSheet trend={trend} open onClose={() => {}} />);

    /* Lo que la referencia no tenía: ¿esto va a alguna parte? */
    expect(html).toContain('hist-recorrido');
    expect(html).toContain('progresa');
    /* Y el registro, de hoy hacia atrás. */
    expect(html).toContain('hist-canto');
    expect(html).toContain('Semana 4');
    expect(html).toContain('Semana 1');
  });

  /*
    ══ De ANTIGUO a NUEVO, con lo último abajo ═══════════════════════════════
    Estuvo al revés. El eje de un registro de entrenamiento es el tiempo y el
    tiempo va hacia abajo: con lo nuevo arriba, la flecha «subió» de una sesión
    apunta a la fila de DEBAJO y hay que leer el bloque hacia atrás. Es además la
    dirección de la recta de la tarjeta, donde lo viejo está a la izquierda.
  */
  it('el registro va de antiguo a nuevo, y marca la última', () => {
    const html = monta(<ExerciseSheet trend={trend} open onClose={() => {}} />);

    expect(html.indexOf('Semana 1')).toBeLessThan(html.indexOf('Semana 4'));
    expect(html).toContain('hist-alto is-ultima');
  });

  /* Con cinco series por sesión, la que decide si progresó es una sola. */
  it('marca la serie tope de cada sesión', () => {
    expect(monta(<ExerciseSheet trend={trend} open onClose={() => {}} />)).toContain('is-tope');
  });

  it('sin ejercicio no pinta nada', () => {
    expect(monta(<ExerciseSheet trend={null} open onClose={() => {}} />)).toBe('');
  });
});
