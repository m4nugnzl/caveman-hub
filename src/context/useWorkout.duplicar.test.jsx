import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { BLOCK_CHANGE, blockSessionOf, blocksOf, planOfDay } from '@/domain/blocks';

/**
 * Duplicar una hoja y editar la copia, por las MISMAS acciones que pulsa la
 * pantalla de Entreno: `duplicateBlockSheet` y, sobre la copia, renombrarla,
 * cambiar un ejercicio por otro y tocar sus series.
 *
 * ── Por qué el gancho y no el componente ────────────────────────────────────
 * El repositorio no tiene jsdom ni una librería de pruebas de componentes, y lo
 * dejó escrito en `AppContext.test.jsx`: dos dependencias nuevas para comprobar
 * algo que se puede comprobar sin ellas. Aquí pasa lo mismo. La hoja «fija»
 * sería un fallo de la cadena de escritura —migración perezosa, proyección a
 * los días, el historial de ⌘Z—, y esa cadena vive entera en `useWorkout`. Se
 * monta con `renderToString` y se conduce por sus acciones: el estado vive en
 * un ref que se escribe sincrónicamente (`useMirroredState`), así que se puede
 * leer después de cada gesto sin un renderizador de verdad.
 */

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}));

const { useWorkout } = await import('./useWorkout');

const CLIENTE = 'c1';

const serie = (extra = {}) => ({ kg: '', reps: '', rir: '', targetKg: '', targetReps: '6-8', targetRir: '2', ...extra });

/* Un programa con el plan TODAVÍA en sus microciclos, que es como llegan casi
   todos: la migración al bloque la hace la primera escritura. */
const programaViejo = () => ({
  weeklySplit: {},
  mobilityDrills: [],
  notes: '',
  blocks: [],
  microcycles: [1, 2].map((weekNumber) => ({
    id: `m${weekNumber}`,
    weekNumber,
    days: [
      {
        dayName: 'Pull A',
        coachNote: 'Espalda primero',
        exercises: [
          { id: 'ex_dom', name: 'Dominadas', muscle: 'Espalda', coachNote: 'Escápulas abajo', sets: [serie(), serie(), serie()] },
          { id: 'ex_remo', name: 'Remo con barra', muscle: 'Espalda', restSeconds: 120, sets: [serie(), serie()] },
        ],
      },
    ],
  })),
});

const montar = () => {
  const workoutRef = { current: { [CLIENTE]: programaViejo() } };
  const persist = vi.fn();
  let acciones = null;

  const Sonda = () => {
    acciones = useWorkout({
      workoutRef,
      setWorkoutData: (next) => {
        workoutRef.current = typeof next === 'function' ? next(workoutRef.current) : next;
      },
      clientsRef: { current: [] },
      setClients: vi.fn(),
      nutritionRef: { current: {} },
      setNutrition: vi.fn(),
      persist,
      persistSet: vi.fn(),
      persistExerciseNote: vi.fn(),
      persistContinue: vi.fn(),
      queue: { enqueue: vi.fn(), retry: vi.fn() },
      ensureProgram: vi.fn(),
      ensureNutrition: vi.fn(),
      profileRole: 'coach',
    });
    return null;
  };
  renderToString(<Sonda />);

  const programa = () => workoutRef.current[CLIENTE];
  const bloque = () => blocksOf(programa())[0];
  const hoja = (nombre) => blockSessionOf(bloque(), nombre);
  /* Cada gesto es su turno: el historial agrupa lo escrito en el mismo. */
  const gesto = async (fn) => {
    const r = fn();
    await Promise.resolve();
    return r;
  };
  return { acciones, persist, programa, bloque, hoja, gesto };
};

describe('duplicar una hoja y montar Pull B encima', () => {
  it('la copia nace con todo el plan, en UN guardado', async () => {
    const { acciones, persist, bloque, hoja, gesto } = montar();
    const nombre = await gesto(() => acciones.duplicateBlockSheet(CLIENTE, bloque().id, 'Pull A'));

    expect(nombre).toBe('Pull A 2');
    expect(persist).toHaveBeenCalledTimes(1);
    const copia = hoja('Pull A 2');
    expect(copia.coachNote).toBe('Espalda primero');
    expect(copia.exercises.map((e) => e.name)).toEqual(['Dominadas', 'Remo con barra']);
    expect(copia.exercises[0].coachNote).toBe('Escápulas abajo');
    expect(copia.exercises[1].restSeconds).toBe(120);
    /* Ids propios: nada de lo que se anote en la copia cae en la original. */
    const deA = new Set(hoja('Pull A').exercises.map((e) => e.id));
    expect(copia.exercises.some((e) => deA.has(e.id))).toBe(false);
    /* Y la bitácora lo cuenta, dentro de la misma escritura. */
    expect(bloque().log.at(-1)).toMatchObject({ kind: BLOCK_CHANGE.HOJA_MAS, que: 'Pull A 2' });
  });

  it('se edita como cualquier otra: nombre, ejercicio y series, sin tocar Pull A', async () => {
    const { acciones, programa, bloque, hoja, gesto } = montar();
    const nombre = await gesto(() => acciones.duplicateBlockSheet(CLIENTE, bloque().id, 'Pull A'));
    const pullA = hoja('Pull A');
    const b = bloque().id;

    await gesto(() => acciones.renameBlockSheet(CLIENTE, b, nombre, 'Pull B'));
    await gesto(() => acciones.renameBlockExercise(CLIENTE, b, 'Pull B', 'Dominadas', 'Jalón al pecho'));
    await gesto(() => acciones.setBlockExerciseSets(CLIENTE, b, 'Pull B', 'Remo con barra', 4));
    await gesto(() => acciones.setBlockExerciseTarget(CLIENTE, b, 'Pull B', 'Remo con barra', '8-10'));

    const pullB = hoja('Pull B').exercises;
    expect(pullB.map((e) => e.name)).toEqual(['Jalón al pecho', 'Remo con barra']);
    expect(pullB[1].sets.map((s) => s.targetReps)).toEqual(['8-10', '8-10', '8-10', '8-10']);

    /* La original, la misma de antes, y lo que ve cada semana también. */
    expect(hoja('Pull A')).toBe(pullA);
    for (const w of [1, 2]) {
      expect(planOfDay(programa(), w, 'Pull A').exercises.map((e) => e.name)).toEqual(['Dominadas', 'Remo con barra']);
      expect(planOfDay(programa(), w, 'Pull B').exercises.map((e) => e.name)).toEqual(['Jalón al pecho', 'Remo con barra']);
    }
    /* Y está en los días de cada microciclo, que es donde el cliente registra. */
    const dias = programa().microcycles.map((m) => m.days.find((d) => d.dayName === 'Pull B'));
    expect(dias.every((d) => d?.exercises.length === 2)).toBe(true);
  });

  it('un solo ⌘Z se lleva la copia entera', async () => {
    const { acciones, bloque, gesto } = montar();
    /* Primero se migra, para que lo que se deshaga sea SOLO el duplicado. */
    await gesto(() => acciones.migratePlanToBlock(CLIENTE));
    await gesto(() => acciones.duplicateBlockSheet(CLIENTE, bloque().id, 'Pull A'));
    expect(bloque().sessions.map((s) => s.dayName)).toEqual(['Pull A', 'Pull A 2']);

    await gesto(() => acciones.deshacerPlan(CLIENTE));
    expect(bloque().sessions.map((s) => s.dayName)).toEqual(['Pull A']);
  });

  it('otra copia de la misma no pisa la primera', async () => {
    const { acciones, bloque, gesto } = montar();
    await gesto(() => acciones.duplicateBlockSheet(CLIENTE, bloque().id, 'Pull A'));
    const otra = await gesto(() => acciones.duplicateBlockSheet(CLIENTE, bloque().id, 'Pull A'));
    expect(otra).toBe('Pull A 3');
    expect(bloque().sessions.map((s) => s.dayName)).toEqual(['Pull A', 'Pull A 2', 'Pull A 3']);
  });
});
