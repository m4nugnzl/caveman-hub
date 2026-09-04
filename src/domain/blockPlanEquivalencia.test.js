import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  blockOfWeek,
  blockPlan,
  blockPlannedVolume,
  blockSummary,
  blocksOf,
  overridePlanExerciseIn,
  overridesAt,
  planOfDay,
  planOfWeek,
  promoteOverrideIn,
  removeBlockSessionFrom,
  resolvedMicrocycles,
  updatePlanExerciseIn,
  weeksOfBlock,
} from './blocks';
import { migrateBlockPlans } from './blocksMigration';
import { weekAdherence, buildWeeklySeries } from './analytics';
import { strengthByExercise } from './reading';
import { allSessions, executedSessions, sessionTonnage, trainingSummary } from './sessions';
import {
  exerciseNames,
  exerciseProgression,
  muscleFrequency,
  tonnageByWeek,
  weekMuscleVolume,
  weekSummary,
  weekTonnage,
} from './training';

/**
 * ══ LA PRUEBA QUE DECIDE SI ESTO SE PUEDE LANZAR ═══════════════════════════
 *
 * Subir el plan al bloque solo vale si NADA de lo que el entrenador ve cambia
 * de número. Así que aquí no se comprueba una función: se hace un RETRATO del
 * programa entero —todo lo que alimenta las pantallas— antes y después de
 * migrar, y se exige que sea idéntico.
 *
 * Y se hace sobre los programas de verdad que hay en el repositorio: la copia
 * de Javier López con sus dos bloques, y los cuatro clientes del respaldo del
 * 13 de agosto. No sobre programas inventados, que es donde uno se acuerda de
 * los casos que ya tenía en la cabeza.
 *
 * ── Lo que el retrato NO mira, y por qué ──────────────────────────────────
 * · Los IDENTIFICADORES. Cambian a propósito: el plan pasa a ser uno solo y
 *   los registros se reapuntan a él (ver `blocksMigration`). Que sigan
 *   apuntando a su ejercicio se comprueba en su propia prueba.
 * · `blockPlan.reference`. Ya no hay semana de la que deducir el plan.
 * · `difieren`. Cambia de significado —de «no coincide con la plantilla» a
 *   «tiene una excepción»— y eso se comprueba aparte, aquí abajo.
 */

/* Las excepciones vigentes en una semana. Viven en el BLOQUE —`block.overrides`,
   cada una con su tramo— y no en el microciclo, así que para preguntar por una
   semana hay que pasar por su bloque. */
const excepcionesDe = (program, weekNumber, dayName) =>
  overridesAt(blockOfWeek(program, weekNumber), weekNumber, dayName);

const retrato = (program) => {
  /* La proyección que necesita todo lo que recibe `microcycles` y lee el plan
     de `micro.days`. Sin bloques migrados devuelve los mismos objetos. */
  const micros = resolvedMicrocycles(program);
  const semanas = micros.map((m) => m.weekNumber).sort((a, b) => a - b);

  const porBloque = blocksOf(program).map((b) => {
    const plan = blockPlan(program, b);
    return {
      name: b.name,
      hojas: plan.sessions.map((s) => ({
        dayName: s.dayName,
        series: s.series,
        volumen: s.volumen,
        ejercicios: s.exercises.map((e) => `${e.name}·${e.series}·${e.targetReps ?? ''}`),
      })),
      volumen: blockPlannedVolume(program, b),
      /* `abierto` fuera: es del rango, no del plan, y no lo toca esta obra. */
      resumen: (({ abierto: _abierto, ...resto }) => resto)(blockSummary(program, b)),
    };
  });

  const porSemana = semanas.map((w) => ({
    w,
    hojas: planOfWeek(program, w).map((d) => ({
      dayName: d.dayName,
      ejercicios: (d.exercises || []).map((e) => `${e.name}·${(e.sets || []).length}`),
    })),
    volumen: weekMuscleVolume(micros, w),
    tonelaje: weekTonnage(micros, w),
    frecuencia: muscleFrequency(micros, w),
    resumen: weekSummary(micros, w),
    adherencia: weekAdherence(micros, w),
    sesiones: executedSessions(micros.find((m) => m.weekNumber === w) || {}).map((s) => ({
      dayName: s.dayName,
      date: s.date ?? null,
      kg: sessionTonnage(s),
      series: (s.entries || []).map((e) => `${e.name}·${(e.sets || []).length}`),
    })),
  }));

  const nombres = exerciseNames(micros);

  return {
    porBloque,
    porSemana,
    nombres,
    progresion: nombres.map((n) => ({ n, filas: exerciseProgression(micros, n) })),
    fuerza: strengthByExercise(micros),
    tonelajePorSemana: tonnageByWeek(micros),
    serie: buildWeeklySeries({ microcycles: micros, history: [] }),
    cartera: trainingSummary({ microcycles: micros }, { today: '2026-09-04' }),
    registros: allSessions(micros).length,
  };
};

/* ── Los programas reales del repositorio ──────────────────────────────────
   `_copia-javier.json` es la copia con dos bloques; el respaldo del 13 de
   agosto trae cuatro clientes más, uno de ellos el propio Javier en un estado
   anterior y otro con un microciclo de seis hojas. */

const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));

const programasReales = () => {
  const out = [{ quien: 'Javier López · copia con bloques', program: leer('../../_copia-javier.json').workout_data['0'] }];

  const clientes = leer('../../copias/2026-08-13T09-43-05/datos/clients.json');
  for (const w of leer('../../copias/2026-08-13T09-43-05/datos/workout_data.json')) {
    const cliente = clientes.find((c) => c.id === w.client_id);
    out.push({ quien: `${cliente?.name || w.client_id} · respaldo 13 ago`, program: w });
  }
  return out;
};

describe('el retrato del programa no cambia al subir el plan al bloque', () => {
  for (const { quien, program } of programasReales()) {
    it(quien, () => {
      const antes = retrato(program);
      const { program: despues } = migrateBlockPlans(program);
      expect(retrato(despues)).toEqual(antes);
    });
  }
});

describe('sobre el programa de Javier López, con detalle', () => {
  const javier = () => leer('../../_copia-javier.json').workout_data['0'];

  it('tiene lo que hace falta para que la prueba signifique algo', () => {
    const p = javier();
    expect(blocksOf(p)).toHaveLength(2);
    expect(p.microcycles).toHaveLength(3);
    /* Kilos anotados DENTRO del plan: los datos de antes de separar plan y
       ejecución, que son los que esta migración puede romper sin avisar. */
    const conKilosEnElPlan = p.microcycles.some((m) =>
      (m.days || []).some((d) => (d.exercises || []).some((e) => (e.sets || []).some((s) => s.kg)))
    );
    expect(conKilosEnElPlan).toBe(true);
    expect(p.microcycles.reduce((n, m) => n + (m.sessions || []).length, 0)).toBeGreaterThan(0);
  });

  it('el registro anterior guardado dentro del plan sigue saliendo', () => {
    const antes = javier();
    const { program } = migrateBlockPlans(antes);

    const kgAntes = (antes.microcycles || []).flatMap((m) => executedSessions(m).map(sessionTonnage));
    const micros = resolvedMicrocycles(program);
    const kgDespues = micros.flatMap((m) => executedSessions(m).map(sessionTonnage));

    expect(kgDespues).toEqual(kgAntes);
    expect(kgDespues.some((v) => v > 0)).toBe(true);
  });

  it('todo microciclo que se salía de la plantilla tiene su excepción', () => {
    const antes = javier();
    const { program } = migrateBlockPlans(antes);

    /*
      La comparación vieja (`difieren`) miraba NOMBRE y NÚMERO DE SERIES, y a
      propósito: como era un aviso, meter dentro las repeticiones lo habría
      hecho saltar en casi todas las semanas.

      La migración no puede permitirse esa tolerancia. Si una semana pedía
      «6-8» donde el bloque pide «8-10» y no se anota como excepción, esa
      semana pasa a pedir otra cosa — sin que nadie lo haya decidido. Así que
      hay excepción en todas las que `difieren` señalaba, y además en las que
      solo cambiaban de repeticiones.
    */
    for (const bloque of blocksOf(antes)) {
      for (const hoja of blockPlan(antes, bloque).sessions) {
        const conExcepcion = new Set(
          (program.microcycles || [])
            .filter((m) => excepcionesDe(program, m.weekNumber, hoja.dayName).length > 0)
            .map((m) => m.weekNumber)
        );
        for (const w of hoja.difieren) expect(conExcepcion.has(w)).toBe(true);
      }
    }
  });

  it('y las de más son justo las que cambiaban de repeticiones', () => {
    const antes = javier();
    const { program } = migrateBlockPlans(antes);
    const objetivos = (day) =>
      (day?.exercises || []).map((e) => `${e.name}·${(e.sets || []).map((s) => s.targetReps ?? '').join(',')}`).join('|');

    for (const bloque of blocksOf(antes)) {
      const plan = blockPlan(antes, bloque);
      const referencia = (antes.microcycles || []).find((m) => m.weekNumber === plan.reference);
      for (const hoja of plan.sessions) {
        const suyaEn = (m) => (m.days || []).find((d) => d.dayName === hoja.dayName);
        const patron = objetivos(suyaEn(referencia));

        for (const micro of program.microcycles || []) {
          if (excepcionesDe(program, micro.weekNumber, hoja.dayName).length === 0) continue;
          const original = suyaEn((antes.microcycles || []).find((m) => m.weekNumber === micro.weekNumber));
          /* Si tiene excepción, algo tenía distinto: la firma vieja, o los
             objetivos. Nunca «nada». */
          expect(hoja.difieren.includes(micro.weekNumber) || objetivos(original) !== patron).toBe(true);
        }
      }
    }
  });

  it('cada hoja del bloque conserva su calentamiento propio si lo tenía', () => {
    const antes = javier();
    const { program } = migrateBlockPlans(antes);

    for (const micro of antes.microcycles) {
      for (const day of micro.days || []) {
        if (!Array.isArray(day.mobilityDrills)) continue;
        const enElBloque = blocksOf(program)
          .flatMap((b) => b.sessions || [])
          .find((h) => h.dayName === day.dayName);
        expect(enElBloque?.mobilityDrills).toEqual(day.mobilityDrills);
      }
    }
  });
});

describe('escribir sobre el programa real de Javier, ya migrado', () => {
  const migrado = () => migrateBlockPlans(leer('../../_copia-javier.json').workout_data['0']).program;

  /** La primera hoja con ejercicios, y su primer ejercicio. */
  const primero = (program) => {
    const w = program.microcycles.find((m) => planOfWeek(program, m.weekNumber).some((d) => (d.exercises || []).length > 0))
      .weekNumber;
    const hoja = planOfWeek(program, w).find((d) => (d.exercises || []).length > 0);
    return { w, dayName: hoja.dayName, ex: hoja.exercises[0] };
  };

  it('un cambio desde la hoja lo ven TODOS los microciclos del bloque', () => {
    const p = migrado();
    const { w, dayName, ex } = primero(p);
    const semanas = weeksOfBlock(p, blockOfWeek(p, w));

    const despues = updatePlanExerciseIn(p, w, dayName, ex.id, (suyo) => ({
      ...suyo,
      sets: [...suyo.sets, { kg: '', reps: '', rir: '', targetReps: '8-10', targetRir: '' }],
    }));

    /* Un gesto, una escritura: la serie de más está en todas las semanas del
       bloque que no tuvieran una excepción sobre ese ejercicio. */
    for (const semana of semanas) {
      const suyo = planOfDay(despues, semana, dayName)?.exercises.find((e) => e.name === ex.name);
      if (!suyo || suyo.id !== ex.id) continue;
      expect(suyo.sets).toHaveLength(ex.sets.length + 1);
    }
  });

  it('y «solo este microciclo» no toca a los demás', () => {
    const p = migrado();
    const { w, dayName, ex } = primero(p);
    const otras = weeksOfBlock(p, blockOfWeek(p, w)).filter((x) => x !== w);

    const despues = overridePlanExerciseIn(p, w, dayName, ex.id, (suyo) => ({ ...suyo, name: 'Press inclinado' }), {
      at: '2026-09-04T10:00:00.000Z',
    });

    expect(planOfDay(despues, w, dayName).exercises.map((e) => e.name)).toContain('Press inclinado');
    for (const semana of otras) {
      expect(planOfDay(despues, semana, dayName).exercises.map((e) => e.name)).not.toContain('Press inclinado');
    }
  });

  it('la excepción lleva id propio: no cruza sus registros con los del bloque', () => {
    const p = migrado();
    const { w, dayName, ex } = primero(p);
    const despues = overridePlanExerciseIn(p, w, dayName, ex.id, (suyo) => ({ ...suyo, name: 'Otro' }));
    const suyo = planOfDay(despues, w, dayName).exercises.find((e) => e.name === 'Otro');
    expect(suyo.id).not.toBe(ex.id);
  });

  it('ascenderla la convierte en el plan de todos', () => {
    const p = migrado();
    const { w, dayName, ex } = primero(p);
    const conExcepcion = overridePlanExerciseIn(p, w, dayName, ex.id, (suyo) => ({ ...suyo, name: 'Press inclinado' }));
    /* La SUYA, no la primera: ese microciclo ya traía una excepción de la
       migración —cambiaba las repeticiones— y ascender aquella devolvería otra
       cosa. Es justo el caso que hay que distinguir. */
    const o = excepcionesDe(conExcepcion, w, dayName).find((x) => x.exercise?.name === 'Press inclinado');

    /* Ascender es del BLOQUE: mete el cambio en la línea base, que es lo que
       ven todos sus microciclos. */
    const despues = promoteOverrideIn(conExcepcion, blockOfWeek(p, w).id, o.id);
    for (const semana of weeksOfBlock(p, blockOfWeek(p, w))) {
      expect(planOfDay(despues, semana, dayName).exercises.map((e) => e.name)).toContain('Press inclinado');
    }
    /* La ascendida desaparece de la lista; las demás de ese microciclo siguen
       donde estaban. Ascender una excepción no es limpiar el microciclo. */
    const quedan = excepcionesDe(despues, w, dayName);
    expect(quedan.map((x) => x.id)).not.toContain(o.id);
  });

  it('quitar una hoja del bloque no borra lo que se entrenó de ella', () => {
    const p = migrado();
    const { w, dayName } = primero(p);
    const antes = executedSessions(p.microcycles.find((m) => m.weekNumber === w)).filter((s) => s.dayName === dayName);

    const despues = removeBlockSessionFrom(p, blockOfWeek(p, w).id, dayName);
    expect(planOfDay(despues, w, dayName)).toBeNull();
    const ahora = executedSessions(despues.microcycles.find((m) => m.weekNumber === w)).filter((s) => s.dayName === dayName);
    expect(ahora).toEqual(antes);
  });
});
