/**
 * El contrato de las estructuras JSONB.
 *
 * ══ Por qué existe este archivo ═════════════════════════════════════════════
 *
 * El proyecto guarda árboles profundos en columnas `jsonb`: el programa entero de
 * un cliente vive en `workout_data.microcycles`. Postgres no valida su forma y
 * JavaScript tampoco, así que hasta ahora el contrato era **una convención**: lo
 * que unos ficheros escribían y otros leían, sin nada que comprobara que
 * coincidían.
 *
 * Ya se rompió una vez, y de la peor manera posible: `targetReps` pasó de estar
 * en el EJERCICIO a estar en cada SERIE, y una vista siguió leyendo el sitio
 * antiguo. No falló nada. Simplemente dejó de aparecer el objetivo, en silencio,
 * hasta que alguien se dio cuenta.
 *
 * ── Por qué tipos y no TypeScript entero ────────────────────────────────────
 * Migrar el proyecto a TypeScript son semanas y toca los ciento y pico archivos.
 * El 90 % del riesgo real está en un sitio muy pequeño: la FRONTERA entre la base
 * de datos y el dominio, o sea `lib/mappers.js` y las funciones de `domain/` que
 * recorren estos árboles. Ahí es donde una clave que cambia de sitio no da error.
 *
 * Los archivos que quieren la comprobación la piden con `// @ts-check` en su
 * primera línea, y `npm run types` la ejecuta. El resto del proyecto sigue siendo
 * JavaScript sin ceremonia. Se puede ir ampliando archivo a archivo sin una
 * migración.
 *
 * ── Los números son CADENAS, y es a propósito ───────────────────────────────
 * `kg`, `reps` y `rir` se declaran `string`. No es dejadez: lo que el usuario
 * teclea se guarda tal cual y se convierte con `toNum` (`lib/num.js`), que
 * devuelve `null` para «sin dato». `Number('')` es `0`, y confundir «no lo hice»
 * con «lo hice con cero kilos» falseaba los cálculos de volumen. El tipo refleja
 * la realidad del dato, no el ideal.
 */

/** Una serie. Los valores son texto: ver la nota de arriba. */
export interface SetEntry {
  /** Kilos levantados. Cadena vacía = sin registrar. */
  kg?: string;
  /** Repeticiones hechas. Es lo que decide si la serie cuenta como efectiva. */
  reps?: string;
  /** Repeticiones en reserva. */
  rir?: string;
  /**
   * Objetivo de repeticiones, POR SERIE.
   *
   * Aquí es donde el contrato se rompió: antes vivía en el ejercicio. Está en la
   * serie porque hay pirámides y descendentes, y un rango único para todo el
   * ejercicio pierde información real.
   *
   * Solo existe en el PLAN (`Day.exercises`), nunca en la ejecución
   * (`Session.entries`): es lo que programa el entrenador, no lo que se ejecuta.
   */
  targetReps?: string;
}

/** Un ejercicio programado, dentro del plan de un día. */
export interface Exercise {
  id: string;
  name: string;
  muscle?: string;
  sets?: SetEntry[];
  /**
   * La indicación del entrenador para ESTE ejercicio. La ve el cliente al lado
   * del ejercicio, no al principio del día.
   *
   * Es opcional de verdad: sin ella no hay campo, ni hueco, ni fila vacía. La
   * del día (`Day.coachNote`) enmarca la sesión; esta corrige un movimiento
   * concreto, y dicha en la del día habría que nombrar el ejercicio dentro del
   * texto y recordarla cuatro ejercicios después.
   */
  coachNote?: string;
}

/** Un día del PLAN: qué hay programado. */
export interface Day {
  dayName: string;
  exercises?: Exercise[];
  /**
   * La indicación del entrenador para este día. La ve el cliente al abrirlo.
   *
   * Está en el DÍA y no en la sesión porque es una instrucción para hacer el
   * entrenamiento, no un comentario sobre uno ya hecho: en la sesión no se podía
   * escribir hasta que el cliente hubiera entrenado.
   */
  coachNote?: string;
}

/** Un ejercicio dentro de una sesión ejecutada. Sin `targetReps`. */
export interface SessionEntry {
  exerciseId: string;
  name?: string;
  muscle?: string;
  sets?: SetEntry[];
}

/**
 * Una sesión: LA EJECUCIÓN, con su fecha real.
 *
 * Separada del plan a propósito. Antes los kilos se anotaban dentro del plan, así
 * que no quedaba constancia de cuándo se entrenó, no se podía repetir un día en
 * la misma semana, y cambiar el plan borraba el registro.
 */
export interface Session {
  id: string;
  /** Fecha real del entrenamiento, `YYYY-MM-DD`. La usa toda la analítica. */
  date: string;
  dayName: string;
  entries?: SessionEntry[];
  notes?: string;
  /** Indicación del entrenador para esta sesión. La ve el cliente. */
  coachNote?: string;
  /** El cuaderno del cliente. Lo escribe él (RPC `log_session_feedback`, 0016). */
  clientNote?: string;
  /** Respuestas del protocolo: `{ [preguntaId]: valor }`, siempre texto. */
  feedback?: Record<string, string>;
  /** Sesión reconstruida de datos antiguos que tenían los kilos en el plan. */
  isLegacy?: boolean;
  /** Lo añade `allSessions` al aplanar; no está en la base de datos. */
  weekNumber?: number;
}

/** Una semana (o sesión, en ciclos rotativos) del programa. */
export interface Microcycle {
  id: string;
  weekNumber: number;
  sessionNumber?: number;
  /** Fecha de referencia del microciclo. NO es la fecha en que se entrenó. */
  date?: string;
  days?: Day[];
  sessions?: Session[];
}

/** El bloque `workout_data`, ya mapeado a camelCase. */
export interface WorkoutData {
  /** Qué toca cada día de la semana natural: `{ Lunes: 'Empuje A', … }`. */
  weeklySplit: Record<string, string>;
  /** Calentamiento y movilidad del programa. */
  mobilityDrills: MobilityDrill[];
  notes: string;
  microcycles: Microcycle[];
  /** Los bloques, como rangos de semanas. Vacío = todo es el Bloque 1 (ver `domain/blocks`). */
  blocks: TrainingBlock[];
}

/** Un bloque de entreno: la estructura que no cambia y sus semanas. */
export interface TrainingBlock {
  id: string;
  name: string;
  fromWeek: number;
  /** `null` en el bloque abierto. */
  toWeek: number | null;
  /** Copia congelada al cerrarlo; el abierto usa los del programa. */
  weeklySplit?: Record<string, string>;
  mobilityDrills?: MobilityDrill[];
}

/** Un ejercicio de calentamiento. */
export interface MobilityDrill {
  id: string;
  name: string;
  /** Series, repeticiones o tiempo, como texto libre: «2 × 10», «30 s». */
  prescription?: string;
  videoUrl?: string;
  notes?: string;
}

/** Un registro del historial de antropometría. */
export interface AnthroLog {
  id: string;
  date: string;
  weight?: number | string | null;
  /** Pliegues en mm. Ausente si no se midieron: un cero no es «no medido». */
  skinFolds?: Record<string, number>;
  /** Perímetros en cm. */
  perimeters?: Record<string, number>;
  /** Foto de las kcal y macros vigentes en esa revisión. */
  nutrition?: { kcals?: number; protein?: number; carbs?: number; fats?: number };
}
