/**
 * Reglas de entrenamiento. Funciones puras: no tocan React ni Supabase, así
 * que se pueden testear directamente y reutilizar desde coach y cliente.
 *
 * "Serie efectiva" = serie con repeticiones registradas (> 0). Una serie
 * programada pero sin ejecutar no cuenta como volumen.
 */

import { newId, deepClone } from '@/lib/ids';
import { toNum } from '@/lib/num';
import { addDays, localeNumber, toISODate } from '@/lib/dates';
// `sessions` no importa de aquí, así que no hay ciclo: es la capa de debajo.
import { executedSessions, sessionMuscleVolume, sessionTonnage } from './sessions';

export const MUSCLE_GROUPS = [
  'Pecho',
  'Dorsal',
  'Espalda Alta',
  'Tríceps',
  'Bíceps',
  'Deltoides Anterior',
  'Deltoides Lateral',
  'Deltoides Posterior',
  'Cuádriceps',
  'Isquiotibiales',
  'Glúteos',
  'Aductor',
  'Gemelo',
  'Abdominales',
  'Otros',
];

export const MUSCLE_COLORS = {
  Pecho: '#f43f5e',
  Dorsal: '#06b6d4',
  'Espalda Alta': '#3b82f6',
  Tríceps: '#8b5cf6',
  Bíceps: '#ec4899',
  'Deltoides Anterior': '#f59e0b',
  'Deltoides Lateral': '#10b981',
  'Deltoides Posterior': '#14b8a6',
  Cuádriceps: '#84cc16',
  Isquiotibiales: '#22d3ee',
  Glúteos: '#a855f7',
  Aductor: '#fb923c',
  Gemelo: '#6ee7b7',
  Abdominales: '#fbbf24',
  Otros: '#94a3b8',
};

/**
 * Cómo lo escribe el mundo → cómo lo llama esta aplicación.
 *
 * ══ Por qué hace falta ══════════════════════════════════════════════════════
 *
 * `MUSCLE_GROUPS` es el vocabulario de la aplicación, no el del oficio. Fuera de
 * aquí, «Pecho» se escribe **PECTORAL** en la hoja de un entrenador y
 * `Pectoral` en el catálogo común sembrado por la migración 0033. Son la misma
 * cosa dicha de tres formas, y sin una tabla que las junte cada una acaba siendo
 * un grupo muscular distinto: tres colores, tres filas en el volumen semanal y
 * un MRV que no cuenta lo que debería.
 *
 * ══ Lo que NO está aquí, y es lo importante ═════════════════════════════════
 *
 * «Hombros» no está. Es el caso que más se repite en las hojas reales y no tiene
 * respuesta: puede ser deltoides anterior, lateral o posterior, y elegir uno por
 * él sería inventarse un dato con toda la pinta de ser correcto. «Erectores» y
 * «antebrazos» tampoco: no existen en `MUSCLE_GROUPS`, y meterlos en «Otros» en
 * silencio es perder la información sin avisar.
 *
 * Por eso esto devuelve `sure`. Lo que no se sabe se dice.
 */
export const MUSCLE_ALIASES = {
  pectoral: 'Pecho', pectorales: 'Pecho', pecho: 'Pecho', chest: 'Pecho',
  dorsal: 'Dorsal', dorsales: 'Dorsal', espalda: 'Dorsal', lats: 'Dorsal', back: 'Dorsal',
  'espalda alta': 'Espalda Alta', trapecio: 'Espalda Alta', trapecios: 'Espalda Alta',
  'upper back': 'Espalda Alta',
  triceps: 'Tríceps', tricep: 'Tríceps',
  biceps: 'Bíceps', bicep: 'Bíceps', braquial: 'Bíceps', braquiorradial: 'Bíceps',
  'deltoides anterior': 'Deltoides Anterior', 'deltoide anterior': 'Deltoides Anterior',
  'delt anterior': 'Deltoides Anterior', 'hombro anterior': 'Deltoides Anterior',
  'deltoides lateral': 'Deltoides Lateral', 'deltoide lateral': 'Deltoides Lateral',
  'delt lateral': 'Deltoides Lateral', 'hombro lateral': 'Deltoides Lateral',
  'deltoides posterior': 'Deltoides Posterior', 'deltoide posterior': 'Deltoides Posterior',
  'delt posterior': 'Deltoides Posterior', 'hombro posterior': 'Deltoides Posterior',
  posterior: 'Deltoides Posterior',
  cuadriceps: 'Cuádriceps', cuadricep: 'Cuádriceps', cuadris: 'Cuádriceps', quads: 'Cuádriceps',
  isquiotibiales: 'Isquiotibiales', isquios: 'Isquiotibiales', isquio: 'Isquiotibiales',
  femoral: 'Isquiotibiales', femorales: 'Isquiotibiales', hamstrings: 'Isquiotibiales',
  gluteo: 'Glúteos', gluteos: 'Glúteos', glute: 'Glúteos', glutes: 'Glúteos',
  aductor: 'Aductor', aductores: 'Aductor', adductor: 'Aductor',
  gemelo: 'Gemelo', gemelos: 'Gemelo', soleo: 'Gemelo', calves: 'Gemelo', pantorrilla: 'Gemelo',
  abdominales: 'Abdominales', abdominal: 'Abdominales', abdomen: 'Abdominales',
  abs: 'Abdominales', core: 'Abdominales',
};

/** Sin tildes y en minúsculas, que es como se repiten los nombres escritos a mano. */
const claveMuscular = (name) =>
  String(name || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

/**
 * Un grupo muscular escrito por cualquiera, traducido al de la aplicación.
 *
 * Devuelve `null` si no había nada que traducir, y `{ muscle, sure }` si lo
 * había. Con `sure: false` el músculo es «Otros» pero el original se conserva
 * aparte, para que quien esté importando pueda colocarlo él en vez de tragarse
 * una suposición.
 */
export const normalizeMuscle = (raw) => {
  const k = claveMuscular(raw);
  if (!k) return null;

  const exacto = MUSCLE_GROUPS.find((m) => claveMuscular(m) === k);
  if (exacto) return { muscle: exacto, sure: true };

  const alias = MUSCLE_ALIASES[k];
  if (alias) return { muscle: alias, sure: true };

  return { muscle: 'Otros', sure: false };
};

/**
 * El color de un grupo muscular.
 *
 * Existe por el respaldo, que estaba copiado en tres sitios de dos archivos
 * —`MUSCLE_COLORS[name] || 'var(--data-slate)'`— y en uno de ellos el respaldo
 * era otro (violeta). Un músculo que no está en el mapa salía de un color en el
 * resumen y de otro en la analítica.
 */
export const muscleColor = (name) => MUSCLE_COLORS[name] || 'var(--data-slate)';

/** MEV = volumen mínimo efectivo · MRV = volumen máximo recuperable (series/semana). */
export const MRV_GOALS = {
  Pecho: { mev: 8, mrv: 20 },
  Dorsal: { mev: 10, mrv: 22 },
  'Espalda Alta': { mev: 10, mrv: 22 },
  Tríceps: { mev: 6, mrv: 18 },
  Bíceps: { mev: 6, mrv: 20 },
  'Deltoides Anterior': { mev: 6, mrv: 16 },
  'Deltoides Lateral': { mev: 6, mrv: 22 },
  'Deltoides Posterior': { mev: 6, mrv: 22 },
  Cuádriceps: { mev: 8, mrv: 20 },
  Isquiotibiales: { mev: 6, mrv: 16 },
  Glúteos: { mev: 4, mrv: 16 },
  Aductor: { mev: 4, mrv: 12 },
};

export const WEEK_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/*
  ══ Aquí vivía SET_COLORS, y era ocho colores por nada ═══════════════════════

  Una paleta de ocho hexadecimales literales que se repartía por ÍNDICE: el
  primer ejercicio verde, el segundo cian, el tercero violeta. Su único usuario
  era el numerito de `ExerciseList`, que es la lista con la que el cliente
  registra en el móvil, así que su pantalla principal salía con ocho tintes que
  no distinguían nada —el número ya decía el orden— y que competían con el
  acento, que es la única tinta que en esta casa significa algo.

  Y eran literales en el dominio, que es justo lo que `tokens.css` llama «un
  error, no una excepción». Si vuelve a hacer falta distinguir series DENTRO de
  un gráfico, esos discos ya existen y son tokens (`--data-*`).
*/

/**
 * 'weekly'   = estructura atada a los días de la semana natural.
 * 'rotating' = ciclo tipo "2 entreno / 1 descanso" que se repite sin fin.
 */
/*
  ── Se llama MICROCICLO, y se llama igual en los dos tipos de ciclo ─────────
  La unidad que se repite tuvo dos nombres a la vez: «sesión» aquí y «ciclo»
  en la vista del bloque, que además chocaba con el «tipo de ciclo» de los
  ajustes y con el macro/mesociclo de cualquier libro. Una vuelta al patrón es
  un MICROCICLO, y así lo llama ya la propia estructura de datos
  (`program.microcycles`).

  Y después tuvo DOS: «Semana» en ciclo natural y «Microciclo» en rotativo. La
  misma pieza cambiaba de nombre según un ajuste, así que la misma pantalla —el
  plan del bloque— se leía distinta en dos clientes; y la palabra «semana»
  aparecía además con su OTRO significado —la del calendario, la del check-in,
  la de las fotos— sin nada que las distinguiera. Ahora la unidad de
  entrenamiento se llama MICROCICLO siempre, y «semana» queda para el
  calendario, que es lo único que de verdad lo es.

  Las funciones siguen recibiendo `cycleType`: lo que cambia es el NOMBRE, no la
  mecánica —en 'weekly' el microciclo sigue atado a los días de la semana
  natural y en 'rotating' a la vuelta del patrón—, y el día que haya una unidad
  más no habrá que tocar sus cien sitios de llamada.
*/
/* eslint-disable no-unused-vars */
export const unitLabel = (cycleType) => 'Microciclo';
export const unitLabelPlural = (cycleType) => 'microciclos';
/** «este microciclo»: quien escriba una frase con la unidad dentro tiene que
    poder concordarla. Hoy siempre masculino; sigue siendo una pregunta y no una
    constante porque la frase la arma quien llama. */
export const unitIsFeminine = (cycleType) => false;
/** La inicial de la unidad para las etiquetas cortas: «M3». */
export const unitInitial = (cycleType) => 'M';
/* eslint-enable no-unused-vars */

/**
 * El patrón rotativo, saneado. Un patrón corrupto —texto, nulo, un cero— no
 * puede devolver un ciclo de cero días: dejaría todos los microciclos en la
 * misma fecha.
 */
export const normalizePattern = (pattern) => ({
  train: Math.max(1, Math.round(toNum(pattern?.train) ?? 2)),
  rest: Math.max(0, Math.round(toNum(pattern?.rest) ?? 1)),
});

/**
 * Cuántos días dura un ciclo del programa.
 *
 * Siete en el semanal, y en el rotativo lo que sume su patrón: un 3/1 dura
 * cuatro días, no siete. Es lo que permite fechar la siguiente sesión de un
 * programa rotativo sin inventarse una semana que ahí no existe.
 */
export const cycleLengthDays = (cycleType, pattern) => {
  if (cycleType !== 'rotating') return 7;
  const { train, rest } = normalizePattern(pattern);
  return train + rest;
};

/**
 * El ciclo rotativo, casilla a casilla: qué se entrena y cuándo se descansa.
 *
 * ══ Por qué existe ══════════════════════════════════════════════════════════
 *
 * Un cliente de semana natural ve su estructura —lunes empuje, martes tirón…—
 * en su panel de progreso. Uno de ciclo rotativo no la veía en NINGÚN sitio: ni
 * en progreso, donde la tarjeta se escondía por no haber semana a la que
 * atarse, ni en su rutina, donde las sesiones salen en fila pero los descansos
 * no aparecen. Su estructura existía solo en la cabeza del entrenador.
 *
 * ── Los entrenos salen de los DÍAS, el descanso del patrón ──────────────────
 * Nada obliga a que el número de días del microciclo case con el `train` del
 * patrón: el entrenador añade y quita días cuando quiere. Si se pintaran las
 * casillas del patrón, un ciclo con seis días programados y un patrón de dos
 * enseñaría dos sesiones al cliente mientras su rutina le enseña seis.
 *
 * Así que las sesiones son las que hay, con su nombre, y el descanso es lo que
 * dice el patrón — que es lo único que el patrón sabe de verdad. Sin días
 * todavía (el entrenador está montando) se cae a casillas genéricas, para que
 * la forma del ciclo se vea antes de tener nombres que poner.
 *
 * ── El descanso va INTERCALADO, que es lo que significa «2 y 1» ─────────────
 * «Dos de entreno y uno de descanso» no quiere decir «todos los entrenos y
 * luego un descanso»: quiere decir que se descansa CADA DOS sesiones. Con seis
 * días programados y un patrón 2/1, el ciclo son nueve días
 *
 *     Legs A · Push A · descanso · Pull A · Legs B · descanso · Push B · Pull B · descanso
 *
 * y no siete con el descanso al final. Ponerlo todo junto al final describía un
 * programa que nadie entrena — y era además el único sitio donde el cliente
 * podía leer su ritmo, así que se lo describía mal.
 *
 * El ciclo CIERRA descansando aunque la última tanda esté a medias: el descanso
 * separa tandas, y al volver a empezar hay una tanda nueva detrás.
 */
export const rotatingSlots = (pattern, days = []) => {
  const { train, rest } = normalizePattern(pattern);

  const sesiones =
    days.length > 0 ? days.map((day) => day.dayName) : Array.from({ length: train }, () => 'Entreno');

  const slots = [];
  let dia = 0;

  sesiones.forEach((name, i) => {
    dia += 1;
    slots.push({ key: `t${i}`, lead: `Día ${dia}`, name, rest: false });

    /* Se descansa al completar una tanda de `train`, y también al terminar la
       última aunque se haya quedado corta. Las dos condiciones en la misma
       comprobación: con un número de sesiones múltiplo del patrón, las dos son
       ciertas a la vez y por separado meterían el descanso dos veces. */
    const cierraTanda = (i + 1) % train === 0 || i === sesiones.length - 1;
    if (!cierraTanda) return;

    for (let r = 0; r < rest; r += 1) {
      dia += 1;
      slots.push({ key: `r${i}-${r}`, lead: `Día ${dia}`, name: 'Descanso', rest: true });
    }
  });

  return slots;
};

// ── Constructores ──────────────────────────────────────────────────────────

/**
 * Una serie.
 *
 * Los campos van en dos parejas, y la simetría no es casual:
 *
 *   · `targetReps` / `reps` — lo que se pidió y lo que se hizo.
 *   · `targetRir`  / `rir`  — lo mismo con el esfuerzo.
 *
 * `rir` existía desde el principio; `targetRir` es lo que faltaba para poder
 * comparar. Sin él, el RIR que anota el cliente es un número sin referencia:
 * «me sobraron 4» no dice si eso está bien o mal hasta que se sabe que se le
 * habían pedido 2.
 *
 * Va vacío por defecto y solo se ve si el entrenador enciende el módulo `rir`
 * de su protocolo. Quien no programe por RIR no tiene por qué verlo.
 */
/*
 * `targetKg` es el tercer objetivo y llegó el último. Hasta ahora los kilos eran
 * SOLO registro —«el peso lo elige quien levanta»—, y eso dejaba media
 * prescripción sin sitio: quien programa una fuerza de 5×5 al 80 % escribe un
 * peso, no un rango de repeticiones. Va vacío por defecto y vacío significa lo
 * de siempre: a criterio del cliente. Ver `HojaDeSeries`.
 */
export const emptySet = (targetReps = '') => ({
  kg: '',
  reps: '',
  rir: '',
  targetKg: '',
  targetReps,
  targetRir: '',
});
export const buildSets = (n, targetReps = '') => Array.from({ length: n }, () => emptySet(targetReps));

export const emptyWorkoutData = () => ({
  weeklySplit: {},
  mobilityDrills: [],
  notes: '',
  microcycles: [],
  blocks: [],
});

export const restWeekSplit = () => Object.fromEntries(WEEK_DAYS.map((d) => [d, 'Descanso']));

/**
 * ¿Esta casilla de la semana es descanso?
 *
 * La regla estaba escrita a mano en el editor de la estructura y otra vez en el
 * tablero, y ya habían divergido en el caso que más se da: **la casilla vacía**.
 * Al borrar el texto de un día, el editor lo seguía pintando como entreno (en
 * tinta de acento) y el contador lo sumaba, así que la semana decía «5 días de
 * entreno» con cuatro puestos. Vacío es descanso: no hay nada programado ahí.
 */
export const isRestDay = (value) => {
  const v = (value ?? '').trim().toLowerCase();
  return v === '' || v === 'descanso';
};

/**
 * LAS CASILLAS DE UN CICLO: los sitios a los que se le puede atar algo.
 *
 * ══ Por qué hacía falta, y qué avería tapaba ═══════════════════════════════
 *
 * «La semana» y «el ciclo» son la misma cosa solo para quien entrena de lunes a
 * domingo. Quien lleva un 2/1 no tiene lunes: tiene un ciclo de tres días que
 * cae cada vez en un sitio distinto del calendario. Y aun así, lo único que la
 * dieta sabía repartir eran días de la semana — así que a un cliente de ciclo
 * rotativo con un alto/bajo se le pedía decir qué come los martes, que es una
 * pregunta sin respuesta.
 *
 * Esto contesta la pregunta ANTERIOR: **cuáles son sus casillas**. Siete con
 * nombre de día en el ciclo natural; las del microciclo —con sus descansos
 * intercalados, que es donde vive media dieta— en el rotativo.
 *
 * ── `rest` es la mitad útil ────────────────────────────────────────────────
 * Saber qué casillas son de descanso es lo que permite rellenar un reparto de
 * un botón, y en el rotativo lo sabe el patrón (`rotatingSlots`) sin que nadie
 * escriba nada: ahí «repartir por el entreno» es exacto por construcción.
 *
 * @param sessions Los días del microciclo, `[{ dayName }]`. Solo se usan en el
 *   rotativo, para poner nombre a la casilla («D2 · Tirón»).
 * @returns `[{ key, corto, sesion, rest }]` — `key` es lo que se guarda.
 */
export const cycleSlots = ({
  cycleType = 'weekly',
  pattern = null,
  sessions = [],
  weeklySplit = null,
} = {}) => {
  if (cycleType === 'rotating') {
    /* La clave es la POSICIÓN dentro del ciclo y no el nombre de la sesión: un
       ciclado de hidratos puede pedir cosas distintas en dos días que se llaman
       parecido, y los tres descansos de un 2/1 con seis sesiones son tres
       casillas, no una. */
    return rotatingSlots(pattern, sessions).map((slot, i) => ({
      key: String(i + 1),
      corto: `D${i + 1}`,
      sesion: slot.rest ? null : slot.name,
      rest: slot.rest,
    }));
  }

  return WEEK_DAYS.map((dia) => ({
    key: dia,
    corto: dia.slice(0, 3),
    sesion: isRestDay(weeklySplit?.[dia]) ? null : (weeklySplit?.[dia] || '').trim(),
    rest: isRestDay(weeklySplit?.[dia]),
  }));
};

/** Cuántos días de la semana natural son de entreno. */
export const trainingDayCount = (weeklySplit) =>
  WEEK_DAYS.filter((day) => !isRestDay(weeklySplit?.[day])).length;

export const buildExercise = ({ name, muscle, numSets, targetReps }) => ({
  id: newId('ex'),
  name: name.trim(),
  muscle,
  sets: buildSets(numSets, targetReps),
});

/* ══════════════════════════════════════════════════════════════════════════
   LA GRAMÁTICA DE SERIE
   ══════════════════════════════════════════════════════════════════════════

   Superserie, técnicas, descanso, AMRAP y «por tiempo» eran texto en el mejor de
   los casos: el importador admitía «AMRAP» como objetivo (`routineSheet`) pero
   la aplicación no sabía qué significaba, y lo demás ni siquiera tenía dónde
   vivir. Ahora son dato, con el modelo MÁS PEQUEÑO que los dice:

     exercise.enlazado     en superserie CON EL ANTERIOR. Un booleano y ningún
                           id: las etiquetas A1/A2 se derivan de la posición,
                           así que reordenar rompe o junta cadenas a la vista
                           en vez de dejar punteros huérfanos.
     exercise.tecnica      cómo se remata la última serie —bajada, rest-pause,
                           myo-reps, parciales—, o nada. Ver `TECNICAS`.
     exercise.restSeconds  descanso entre series, en segundos.

   AMRAP y «30 s» NO se guardan aparte: ya están escritos en `targetReps`, y
   guardarlos dos veces es como se acaba con dos verdades. Se INTERPRETAN
   (`targetKind`), que es lo que les faltaba para significar algo.

   Y se imprime con la tipografía de la hoja —«última con bajada · descanso
   90 s»—, no con chips de colores: la hoja es la identidad. */

/** Qué pide de verdad el objetivo escrito: repeticiones, AMRAP o tiempo. */
export const targetKind = (targetReps) => {
  const v = String(targetReps || '').trim();
  if (!v) return 'reps';
  if (/^(amrap|fallo|al\s*fallo|m[aá]x(imo)?)$/i.test(v)) return 'amrap';
  if (/^\d{1,3}\s*(?:s|seg|sec|segundos?|min|minutos?|['"″′])\.?$/i.test(v)) return 'tiempo';
  return 'reps';
};

/** «90 s», «2 min». `null` sin descanso pautado: no se inventa un defecto. */
export const restLabel = (restSeconds) => {
  const s = Number(restSeconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  if (s >= 120 && s % 60 === 0) return `${s / 60} min`;
  return `${Math.round(s)} s`;
};

/**
 * Las etiquetas A1/A2 de las superseries de una hoja, derivadas de la posición.
 *
 * Una cadena son ejercicios CONSECUTIVOS donde cada uno va `enlazado` con su
 * anterior; la primera cadena es la A, la segunda la B. Un `enlazado` en el
 * primer ejercicio no dice nada (no hay anterior) y se ignora. Devuelve una
 * lista alineada con la de ejercicios: la etiqueta, o `null` si va suelto.
 */
export const supersetLabels = (exercises = []) => {
  const labels = new Array(exercises.length).fill(null);
  let cadena = 0;
  let i = 0;
  while (i < exercises.length) {
    let fin = i + 1;
    while (fin < exercises.length && exercises[fin]?.enlazado) fin += 1;
    if (fin - i > 1) {
      const letra = String.fromCharCode(65 + (cadena % 26));
      for (let j = i; j < fin; j += 1) labels[j] = `${letra}${j - i + 1}`;
      cadena += 1;
    }
    i = fin;
  }
  return labels;
};

/* ══ LAS TÉCNICAS DE INTENSIDAD ═══════════════════════════════════════════
   «La última al fallo y bajas el peso», «la última a rest-pause»: el remate
   se escribía en la nota del ejercicio cuando se escribía, y entonces no era
   dato — no se podía leer en la hoja, no viajaba con la plantilla y el cliente
   se lo encontraba dentro de un párrafo.

   ── Un VOCABULARIO cerrado, y CON NÚMEROS ───────────────────────────────
   Cerrado porque son las cuatro que un entrenador programa de verdad y porque
   texto libre aquí devuelve el problema: «RP», «rest pause» y «restpause»
   serían tres técnicas.

   Lo que sí cambió es que dejaron de ser UNA PALABRA. Durante un tiempo esto
   era `exercise.tecnica = 'bajada'` y nada más: ni cuántas bajadas, ni cuánto
   se recorta, ni cuántas tandas, ni cuántos segundos. El dueño lo dijo sin
   rodeos —«las dropset no se pueden planificar nada bien»— y tenía razón: no
   era un problema de dibujo, es que el dato no existía. Quien programaba una
   bajada doble al 20 % tenía que escribirlo en la nota, o decirlo de palabra.

   Ahora cada técnica lleva SUS CAMPOS (`campos`) con su valor por defecto, y de
   uno de ellos (`sub`) sale cuántas SUBSERIES tiene el remate: dos bajadas son
   dos renglones colgando de la serie, y cada uno se pauta y se registra.

   ── Y cuelgan de la SERIE, no del ejercicio ─────────────────────────────
   Estaban en el ejercicio y siempre en la última serie. Eso vale para el 90 %
   de los casos y es mentira en el resto: hay quien mete la bajada en la
   penúltima para no llegar al fallo en la última, y quien rematea las dos
   últimas. `set.tecnica` es el sitio correcto; `exercise.tecnica` se sigue
   LEYENDO para que lo escrito antes no se caiga (ver `tecnicaDeLaSerie`), pero
   ya no se escribe.

   Lo que NO está: cluster y series descendentes por bloques. No son un remate
   sino un esquema de todo el ejercicio, y meterlos aquí sería decir en el sitio
   de una serie algo que vale para todas. */
export const TECNICAS = [
  {
    id: 'bajada',
    verbo: 'bajada',
    dicho: 'con bajada',
    ayuda: 'Al llegar al fallo se baja el peso y se sigue sin descanso',
    /* `por` es el valor por defecto: el que se pone al elegir la técnica, para
       que nunca haya un remate a medio escribir. */
    campos: [
      { key: 'veces', label: 'bajadas', por: 1, min: 1, max: 5 },
      { key: 'corte', label: '% menos', por: 20, min: 5, max: 60 },
    ],
    sub: 'veces',
    nombreSub: (i, p) => (p.veces > 1 ? `bajada ${i + 1}` : 'bajada'),
    cifras: (p) =>
      [p.veces > 1 ? `×${p.veces}` : null, p.corte != null ? `−${p.corte} %` : null].filter(Boolean).join(', '),
  },
  {
    id: 'rest-pause',
    verbo: 'rest-pause',
    dicho: 'a rest-pause',
    ayuda: 'Se llega al fallo, se descansan unos segundos y se siguen sacando repeticiones',
    campos: [
      { key: 'veces', label: 'tandas', por: 2, min: 1, max: 5 },
      { key: 'pausa', label: 'segundos', por: 15, min: 5, max: 60 },
    ],
    sub: 'veces',
    nombreSub: (i) => `tanda ${i + 1}`,
    cifras: (p) =>
      [p.veces != null ? `×${p.veces}` : null, p.pausa != null ? `${p.pausa} s` : null].filter(Boolean).join(', '),
  },
  {
    id: 'myo-reps',
    verbo: 'myo-reps',
    dicho: 'con myo-reps',
    ayuda: 'Una serie activa y detrás miniseries de pocas repeticiones con descansos muy cortos',
    campos: [
      { key: 'veces', label: 'miniseries', por: 4, min: 1, max: 8 },
      { key: 'reps', label: 'reps cada una', por: 5, min: 1, max: 15 },
      { key: 'pausa', label: 'segundos', por: 15, min: 5, max: 60 },
    ],
    sub: 'veces',
    nombreSub: (i) => `mini ${i + 1}`,
    cifras: (p) =>
      [
        p.veces != null ? `×${p.veces}${p.reps != null ? ` de ${p.reps}` : ''}` : null,
        p.pausa != null ? `${p.pausa} s` : null,
      ]
        .filter(Boolean)
        .join(', '),
  },
  {
    id: 'parciales',
    verbo: 'parciales',
    dicho: 'con parciales',
    ayuda: 'Se termina con repeticiones parciales en el recorrido donde queda fuerza',
    campos: [{ key: 'reps', label: 'parciales', por: 8, min: 1, max: 30 }],
    /* Sin subserie: las parciales son el final de ESA serie, no otra tanda. */
    sub: null,
    cifras: (p) => (p.reps != null ? `×${p.reps}` : ''),
  },
];

/** La ficha de una técnica por su identificador. */
export const tecnicaSpec = (id) => TECNICAS.find((t) => t.id === id) || null;

/**
 * La técnica de un ejercicio, si lleva alguna.
 *
 * `bajada: true` es como se dijo esto mientras solo había una técnica: se sigue
 * leyendo para que lo escrito entonces no se caiga, pero ya no se escribe.
 */
export const tecnicaOf = (exercise) => {
  const id = String(exercise?.tecnica || '').trim();
  if (TECNICAS.some((t) => t.id === id)) return id;
  return exercise?.bajada ? 'bajada' : null;
};

/**
 * Una técnica saneada: sus números dentro de rango, y NADA MÁS.
 *
 * Lo que no está escrito no se rellena. Un `tecnica: 'bajada'` de los de antes
 * no sabe cuántas bajadas eran, y ponerle «×1, −20 %» sería que la aplicación
 * se inventara una pauta que nadie escribió y se la enseñara al cliente como
 * suya. Los valores por defecto son cosa de `tecnicaPorDefecto`, que es lo que
 * corre al ELEGIR la técnica: ahí sí hay alguien decidiendo.
 */
export const normalizaTecnica = (valor) => {
  const id = typeof valor === 'string' ? valor : String(valor?.id || '').trim();
  const spec = tecnicaSpec(id);
  if (!spec) return null;
  const salida = { id };
  for (const campo of spec.campos) {
    const n = typeof valor === 'object' ? toNum(valor?.[campo.key]) : null;
    if (n !== null) salida[campo.key] = Math.max(campo.min, Math.min(campo.max, Math.round(n)));
  }
  return salida;
};

/** La técnica recién elegida, con sus valores por defecto. */
export const tecnicaPorDefecto = (id) => {
  const spec = tecnicaSpec(id);
  if (!spec) return null;
  return { id, ...Object.fromEntries(spec.campos.map((c) => [c.key, c.por])) };
};

/**
 * Qué remate lleva ESTA serie.
 *
 * Primero el suyo. Y si el ejercicio es de antes de que las técnicas bajaran a
 * la serie, el suyo cae en la ÚLTIMA, que es donde estaba escrito que iba.
 */
export const tecnicaDeLaSerie = (exercise, index) => {
  const sets = exercise?.sets || [];
  const propia = normalizaTecnica(sets[index]?.tecnica);
  if (propia) return propia;
  /* El legado va PELADO —sin números—: nadie los escribió. Ver
     `normalizaTecnica`. */
  const legado = tecnicaOf(exercise);
  return legado && index === sets.length - 1 ? { id: legado } : null;
};

/** Cuántas subseries cuelgan de este remate. Cero si no cuelga ninguna. */
export const subseriesDe = (tecnica) => {
  const spec = tecnicaSpec(tecnica?.id);
  if (!spec?.sub) return 0;
  return Math.max(0, Number(tecnica?.[spec.sub]) || 0);
};

/** Solo los números: «×2, −20 %», o cadena vacía si no hay ninguno escrito. */
export const tecnicaCifras = (tecnica) => {
  const spec = tecnicaSpec(tecnica?.id);
  return spec ? spec.cifras(normalizaTecnica(tecnica)) || '' : '';
};

/** «bajada ×2, −20 %». `null` si no hay técnica. Es como se dice EN la serie. */
export const tecnicaFrase = (tecnica) => {
  const spec = tecnicaSpec(tecnica?.id);
  if (!spec) return null;
  const cifras = tecnicaCifras(tecnica);
  return cifras ? `${spec.verbo} ${cifras}` : spec.verbo;
};

/** Cómo se llama la subserie n de un remate: «bajada 2», «tanda 3». */
export const nombreDeSubserie = (tecnica, i) => {
  const spec = tecnicaSpec(tecnica?.id);
  if (!spec?.sub) return null;
  const p = normalizaTecnica(tecnica);
  return spec.nombreSub ? spec.nombreSub(i, p) : `${spec.verbo} ${i + 1}`;
};

/**
 * Los remates de un ejercicio, con la serie de la que cuelga cada uno.
 * Es lo que necesita quien tenga que IMPRIMIRLOS sin recorrer las series.
 */
export const rematesDe = (exercise) => {
  const sets = exercise?.sets || [];
  /* Un ejercicio sin series con técnica de las de antes: se dice igual, y en la
     última, que es donde vivía. Pasa con lo que aún no tiene series montadas. */
  if (sets.length === 0) {
    const legado = tecnicaOf(exercise);
    return legado ? [{ serie: 0, tecnica: { id: legado } }] : [];
  }
  return sets.map((_, i) => ({ serie: i + 1, tecnica: tecnicaDeLaSerie(exercise, i) })).filter((r) => r.tecnica);
};

/** Cómo se dice esa técnica en la hoja. `null` si no hay técnica. */
export const tecnicaSaid = (id) => TECNICAS.find((t) => t.id === id)?.dicho ?? null;

/**
 * EL PESO PAUTADO DE UN EJERCICIO, EN UNA CIFRA. `null` si no se pauta ninguno.
 *
 * Con todas las series al mismo peso dice «100 kg»; con pesos distintos, los
 * extremos («100–80 kg»), que es lo que hay que saber de un vistazo de una
 * pirámide. No es un campo: el peso es POR SERIE y se escribe en la tabla de
 * series; esto es cómo se resume donde no hay una fila por serie —la rejilla
 * del bloque y el renglón del banco—, que son los dos sitios desde los que se
 * mira un plan entero.
 */
export const pesoPautado = (exercise) => {
  const pesos = (exercise?.sets || []).map((s) => toNum(s?.targetKg)).filter((n) => n !== null);
  if (pesos.length === 0) return null;
  const min = Math.min(...pesos);
  const max = Math.max(...pesos);
  return min === max ? `${localeNumber(max)} kg` : `${localeNumber(max)}–${localeNumber(min)} kg`;
};

/**
 * «última con bajada ×2, −20 % · descanso 90 s», o `null` si no lleva nada.
 *
 * Dice DE QUÉ SERIE habla cada remate porque ya no tienen por qué estar en la
 * última: «3ª a rest-pause» es una pauta legítima y antes no se podía escribir.
 * La última se sigue llamando «última» —es como se dice— y solo cuando una
 * serie del medio lleva remate aparece su número.
 */
export const seriesGrammar = (exercise) => {
  const total = (exercise?.sets || []).length;
  const partes = rematesDe(exercise).map(({ serie, tecnica }) => {
    const spec = tecnicaSpec(tecnica.id);
    const donde = serie === total || serie === 0 ? 'última' : `${serie}ª`;
    const cifras = tecnicaCifras(tecnica);
    return `${donde} ${spec.dicho}${cifras ? ` ${cifras}` : ''}`;
  });
  const descanso = restLabel(exercise?.restSeconds);
  if (descanso) partes.push(`descanso ${descanso}`);
  return partes.length > 0 ? partes.join(' · ') : null;
};

/* ══ AQUÍ VIVÍAN LAS ALTERNATIVAS PREVISTAS ═════════════════════════════════
   «Si está ocupada: Hack squat.» El entrenador dejaba puesto un plan B por
   ejercicio (`exercise.alternatives`) y el cliente lo veía en su día.

   Retiradas del producto el 9 sep 2026 por decisión del dueño: «yo la retiraría
   del producto, no me gusta la idea de dar alternativas». Y es coherente con lo
   que esta casa ya tenía escrito —[[la-app-no-receta]]—: la aplicación resalta
   información y el criterio es del entrenador; una lista de sustitutos escrita
   de antemano es la aplicación decidiendo por él en el momento en que la
   máquina está ocupada, que es justo cuando hace falta criterio.

   Se han ido las funciones (`alternativesOf`, `MAX_ALTERNATIVES`) y todas las
   pantallas que las leían o escribían. **NO se ha tocado la base**: la columna
   `exercise_library.alternatives` (0098) y las claves `alternatives` que haya
   dentro de los planes guardados siguen ahí, sin leerse. Borrarlas es
   irreversible y no hace falta para que la idea desaparezca del producto. */

/**
 * Un ejercicio de otra persona, convertido en PLANTILLA para esta.
 *
 * Conserva lo que es programa —nombre, músculo, número de series y el objetivo
 * de cada una— y deja fuera lo que es de la otra persona: sus kilos y reps
 * anotados en series heredadas, su nota de entrenador. El id es nuevo porque el
 * ejercicio es nuevo; reutilizarlo cruzaría los registros de dos clientes.
 *
 * Es lo que usa «Traer un día de otro cliente»: el Legs de Marta como base del
 * de Luis, sin arrastrar lo que Marta levantó.
 */
/**
 * Las series de un ejercicio, en blanco y listas para otro sitio.
 *
 * Lo que queda es el OBJETIVO de cada serie —repeticiones, RIR, kilos pautados
 * y su remate— y lo que se va son los kilos y las reps anotados: eso es de quien
 * las levantó. Está aparte porque lo usan las dos formas de mover series: el
 * ejercicio entero (`cloneExerciseAsTemplate`) y solo su pauta (`conLaPauta`).
 */
const seriesComoPauta = (exercise) =>
  (exercise?.sets || []).map((set) => ({
    ...emptySet(set?.targetReps ?? ''),
    targetRir: set?.targetRir ?? '',
    targetKg: set?.targetKg ?? '',
    /* El remate de esa serie es plan, y con sus números: viaja igual que el
       objetivo de repeticiones. Lo que NO viaja son sus registros. */
    ...(normalizaTecnica(set?.tecnica) ? { tecnica: normalizaTecnica(set.tecnica) } : {}),
  }));

export const cloneExerciseAsTemplate = (exercise) => ({
  id: newId('ex'),
  name: exercise.name,
  muscle: exercise.muscle,
  /* La gramática de serie es programa, no registro: viaja con la plantilla.
     Solo las claves puestas — copiar `enlazado: false` a todo sería ruido. */
  ...(exercise.enlazado ? { enlazado: true } : {}),
  ...(tecnicaOf(exercise) ? { tecnica: tecnicaOf(exercise) } : {}),
  ...(exercise.restSeconds ? { restSeconds: exercise.restSeconds } : {}),
  sets: seriesComoPauta(exercise),
});

/**
 * LA PAUTA: este ejercicio, con las series de aquel otro.
 *
 * ══ Qué es una pauta y por qué no es una pieza más ══════════════════════════
 *
 * «Dale a este remo las cinco series del press» es el gesto más repetido de
 * programar, y hasta ahora costaba tres: pegar el press, renombrarlo a mano y
 * borrar el remo. Efort lo tiene como un verbo propio («copy sets»).
 *
 * Aquí NO es un sexto tipo del portapapeles, y la razón es la misma por la que
 * el tramo tampoco es un tipo: **obligaría a decidir al copiar algo que solo se
 * sabe al pegar**. Cuando se pulsa ⧉ sobre el press todavía no está decidido si
 * eso va a acabar siendo otra fila («el press también el jueves») o la pauta de
 * una fila que ya existe; quien lo sabe es el destino. Así que lo que se lleva
 * en la mano es siempre EL EJERCICIO, y «poner solo sus series» es otra forma
 * de soltarlo.
 *
 * ── Qué se queda de la fila que recibe ─────────────────────────────────────
 * Su identidad entera: id, nombre, músculo, nota y su sitio en la hoja
 * (`enlazado`, que es de la hoja y no del ejercicio). Por eso el ejercicio no
 * pierde sus registros: sigue siendo él.
 *
 * ── Y qué trae la pauta ────────────────────────────────────────────────────
 * Las series con sus objetivos y sus remates, y el descanso SI el origen lo
 * tenía puesto: una pauta que no dice nada del descanso no es motivo para
 * borrar el que ya había. Lo que sí se limpia es la técnica vieja a nivel de
 * ejercicio (`tecnica`/`bajada`, anteriores al remate por serie), porque los
 * remates entran ahora con las series y dejarla dejaría dos verdades.
 */
export const conLaPauta = (destino, origen) => ({
  ...destino,
  /* A `undefined` y no borradas: es como las limpia la hoja al escribir un
     remate en una serie, y así el guardado las deja fuera igual. */
  tecnica: undefined,
  bajada: undefined,
  ...(origen?.restSeconds ? { restSeconds: origen.restSeconds } : {}),
  sets: seriesComoPauta(origen),
});

export const buildMicrocycle = ({ weekNumber, days = [], date = today() }) => ({
  id: newId('mc'),
  weekNumber,
  sessionNumber: weekNumber,
  date,
  days,
});

export const today = () => new Date().toISOString().slice(0, 10);

/*
  ══ Cuándo empieza cada ciclo ═══════════════════════════════════════════════

  Todos los microciclos nacían con la fecha de HOY, que es la de cuando el
  entrenador los crea y casi nunca la de cuando se entrenan. Dos consecuencias
  reales:

    · Quien monta la rutina en agosto para una asesoría que arranca en
      septiembre tiene la semana 1 fechada dos semanas antes de existir.
    · Y quien programa cuatro semanas de golpe —el gesto normal— las tiene las
      cuatro el mismo día, así que la analítica, que agrupa por `micro.date`,
      las mete todas en el mismo cubo.

  Las dos funciones de aquí abajo son la respuesta: de dónde sale la fecha de la
  PRIMERA (la de empezar, que la decide el entrenador) y de dónde la de cada
  siguiente (la anterior más lo que dura un ciclo). La fecha sigue siendo
  editable microciclo a microciclo: esto es de dónde parte, no una atadura.
*/

/**
 * Cuándo empieza el primer ciclo de un cliente.
 *
 * Su fecha de inicio si todavía está por llegar, y hoy en cualquier otro caso.
 * No se usa una fecha de inicio pasada porque un programa nuevo montado en el
 * mes seis de una asesoría empieza hoy, no el día que esa persona entró: fechar
 * su semana 1 medio año atrás desordenaría toda la analítica.
 */
export const firstCycleDate = (startDate) => {
  const hoy = today();
  const inicio = toISODate(startDate);
  return inicio && inicio > hoy ? inicio : hoy;
};

/**
 * Cuánto dura un ciclo CONTANDO las sesiones que tiene dentro.
 *
 * ══ Por qué no basta con el patrón ══════════════════════════════════════════
 *
 * `cycleLengthDays` mide una tanda —«2 entreno + 1 descanso» son tres días— y
 * eso solo es el ciclo entero cuando el microciclo tiene exactamente `train`
 * sesiones. Con seis sesiones y un patrón 2/1, el ciclo son NUEVE días: tres
 * tandas con su descanso cada una.
 *
 * Fechando por la tanda, el ciclo siguiente nacía tres días después del
 * anterior cuando el cliente todavía tenía seis sesiones por delante. Y no es
 * cosmético: la analítica agrupa por `micro.date`, así que el tonelaje y la
 * adherencia de tres ciclos caían en la misma semana.
 */
export const cycleSpanDays = (cycleType, pattern, days = []) => {
  if (cycleType !== 'rotating') return 7;
  if (!days || days.length === 0) return cycleLengthDays(cycleType, pattern);
  return rotatingSlots(pattern, days).length;
};

/**
 * Cuándo empieza el ciclo siguiente a `previous`: su fecha más lo que dura ese
 * ciclo, sesiones incluidas. Sin fecha anterior de la que partir —datos
 * viejos—, hoy.
 */
export const nextCycleDate = (previous, cycleType, pattern) =>
  addDays(previous?.date, cycleSpanDays(cycleType, pattern, previous?.days)) || today();

/** Reasigna ids a un subárbol clonado para que no colisione con el original. */
export const reidExercises = (exercises) =>
  exercises.map((ex) => ({ ...ex, id: newId('ex') }));

export const cloneDays = (days) =>
  deepClone(days).map((d) => ({ ...d, exercises: reidExercises(d.exercises || []) }));

/**
 * Clona la ESTRUCTURA de unos días y vacía lo EJECUTADO.
 *
 * ── La distinción que hace falta y `cloneDays` no hace ──────────────────────
 * Un día tiene dos clases de información mezcladas en el mismo objeto:
 *
 *   · lo que el entrenador PROGRAMA — nombre del día, ejercicios, grupo
 *     muscular, cuántas series y el rango objetivo de cada una;
 *   · lo que se REGISTRA al entrenar — kg, reps y RIR.
 *
 * `cloneDays` copia las dos, que es lo correcto para «duplicar la semana 3» del
 * entrenador: quiere la semana entera tal cual para retocarla.
 *
 * Pero cuando lo que se quiere es la semana SIGUIENTE, arrastrar los kilos de la
 * anterior es peor que no traer nada. Los números aparecerían ya rellenos sin que
 * nadie los haya levantado, y a partir de ahí no hay forma de distinguir un peso
 * heredado de uno real: la analítica contaría como entrenada una semana que no se
 * ha hecho, y `weekAdherence` daría 100 % con cero series realizadas.
 *
 * Se conservan `targetReps` y `targetRir` porque no son registros sino parte del
 * plan: son el rango y el esfuerzo que el entrenador puso, y siguen vigentes la
 * semana siguiente. Lo que se borra es lo que levantó la persona.
 *
 * ── Cuándo NO hay que reasignar ids: `conservarIds` ────────────────────────
 * Reasignarlos es lo correcto mientras el plan viva en cada microciclo: dos
 * semanas son dos copias distintas y cada ejercicio necesita su etiqueta.
 *
 * Con el plan en el bloque deja de serlo. Ahí el ejercicio es UNO para todas
 * las semanas del bloque y su id es el mismo en todas: es lo que hace que la
 * pantalla y `log_session_set` hablen del mismo ejercicio. Darle uno nuevo a la
 * semana que se añade la deja imposible de registrar desde el primer número.
 */
export const blankDays = (days, { conservarIds = false } = {}) =>
  (conservarIds ? deepClone(days) : cloneDays(days)).map((day) => ({
    ...day,
    exercises: (day.exercises || []).map((exercise) => ({
      ...exercise,
      /*
        La serie ENTERA menos lo que se levantó, no una serie vacía con dos
        pautas encima. `emptySet` + `targetRir` dejaba fuera `targetKg`, que es
        la tercera pauta: vacío significa «a criterio del cliente» y eso es lo
        normal, pero cuando el entrenador SÍ escribe el kilo es una pauta como
        las otras dos y tiene que viajar igual. Y así lo que se pacte mañana
        viaja sin volver a tocar esto. Es la misma regla que el servidor (0109).
      */
      sets: (exercise.sets || []).map((set) => ({
        ...(set || {}),
        ...emptySet(set?.targetReps ?? ''),
        targetKg: set?.targetKg ?? '',
        targetRir: set?.targetRir ?? '',
      })),
    })),
  }));

/**
 * Los identificadores de un microciclo, para que el servidor construya EL MISMO.
 *
 * ══ Por qué hace falta decírselos ═══════════════════════════════════════════
 *
 * Al continuar el programa, la semana nueva se construye dos veces: aquí, para
 * que aparezca en pantalla al instante y sin conexión, y en el servidor, que es
 * quien la escribe de verdad (`continue_program`). Las dos con la misma regla,
 * pero cada una con sus propios `uuid`.
 *
 * Y el id del ejercicio es lo ÚNICO que `log_session_set` mira para localizar la
 * fila donde anotar. Dos semanas idénticas con ids distintos significan que todo
 * lo que esa persona registre hasta la siguiente recarga se rechaza con «el
 * ejercicio no está programado en …». Un entrenamiento entero, perdido en
 * silencio. Mandando los ids, las dos semanas son la misma desde el principio.
 *
 * El servidor los adopta solo si describen la semana que él va a construir; la
 * estructura la sigue decidiendo él. Ver la migración 0085.
 */
export const microcycleIds = (microcycle) => ({
  id: microcycle?.id ?? null,
  days: (microcycle?.days || []).map((day) => ({
    dayName: day.dayName,
    exerciseIds: (day.exercises || []).map((exercise) => exercise.id),
  })),
});

/**
 * Sustituye el microciclo que se pintó a la espera por el que escribió el
 * servidor.
 *
 * `localId` es el id que se propuso. Si se aceptó, el que vuelve es idéntico y
 * esto no cambia nada; si no —la copia del navegador estaba vieja—, el bueno es
 * el del servidor y el de aquí sobra.
 *
 * ── Las sesiones son del navegador ──────────────────────────────────────────
 * Una semana recién creada vuelve sin sesiones, y para entonces puede haber ya
 * series anotadas en ella —se crea sin conexión y se entrena a continuación—.
 * Esas van por su propio camino (`log_session_set`), así que se conservan las de
 * aquí salvo que el servidor mande las suyas, que es lo que ocurre cuando esta
 * respuesta es la de un reintento sobre una semana que ya existía.
 */
export const adoptMicrocycle = (data, localId, server) => {
  if (!server?.id) return data;

  const local = data.microcycles.find((m) => m.id === localId) || null;
  const sessions = server.sessions?.length ? server.sessions : local?.sessions || [];

  return {
    ...data,
    microcycles: [
      ...data.microcycles.filter((m) => m.id !== localId && m.id !== server.id),
      { ...server, sessions },
    ].sort((a, b) => a.weekNumber - b.weekNumber),
  };
};

// ── Consultas ──────────────────────────────────────────────────────────────

export const findMicrocycle = (microcycles, weekNumber) =>
  microcycles.find((m) => m.weekNumber === weekNumber) || null;

export const nextWeekNumber = (microcycles) =>
  microcycles.length === 0 ? 1 : Math.max(...microcycles.map((m) => m.weekNumber)) + 1;

/**
 * Dónde queda un elemento después de que OTRO se mueva por encima de él.
 *
 * ══ Para qué ═══════════════════════════════════════════════════════════════
 *
 * El carril de días se puede arrastrar, y el editor de abajo abre uno concreto
 * POR ÍNDICE. Mover cualquier otro día corre ese índice: arrastrar el cuarto día
 * delante del primero te dejaba, sin tocar nada más, editando el día de al lado
 * del que tenías abierto. Con el nombre cambiado en la cabecera, que es la forma
 * más rápida de escribirle series al día que no era.
 *
 * Es la aritmética del `splice`: quien se mueve va a `to`; quien queda dentro del
 * tramo recorrido se desplaza un puesto en sentido contrario; el resto no se
 * entera. Vive aquí y con prueba porque es exactamente donde se cuela un error de
 * uno, y ese error no da un fallo visible sino datos escritos en el sitio
 * equivocado.
 */
export const indexAfterMove = (index, from, to) => {
  if (index === from) return to;
  if (from < index && index <= to) return index - 1;
  if (to <= index && index < from) return index + 1;
  return index;
};

/** Nombre libre pero único dentro del microciclo: "Día 1 (copia)", "(copia 2)"… */
export const uniqueDayName = (days, base) => {
  if (!days.some((d) => d.dayName === base)) return base;
  let name = `${base} (copia)`;
  let n = 2;
  while (days.some((d) => d.dayName === name)) name = `${base} (copia ${n++})`;
  return name;
};

/** Series efectivas del día, agrupadas por grupo muscular. */
export const dayMuscleVolume = (day) => {
  const out = {};
  for (const ex of day?.exercises || []) {
    const muscle = ex.muscle || 'Otros';
    const effective = (ex.sets || []).filter((s) => (toNum(s?.reps) ?? 0) > 0).length;
    if (effective > 0) out[muscle] = (out[muscle] || 0) + effective;
  }
  return out;
};

/*
  ══ Todo lo que sigue lee LO EJECUTADO, no el plan ══════════════════════════

  Estas funciones leían `micro.days`, que es donde los kilos se guardaban ANTES de
  separar plan y ejecución. Desde que el registro va a `micro.sessions`, leer el
  plan significa leer un sitio donde ya nadie escribe: la pantalla de Analítica
  daba tonelaje 0, volumen vacío, adherencia 0 % y progresión sin puntos con las
  series correctamente guardadas al lado. Reproducido con un microciclo de tres
  series a 100×8: 2400 kg registrados, 0 kg en la analítica.

  `executedSessions` es la única puerta a esos datos y ya resuelve la
  compatibilidad: si un día no tiene sesión pero sí kilos dentro del plan (datos
  antiguos), los expone como sesión heredada. Así el histórico se sigue viendo sin
  necesidad de migrar nada.
*/

/** Series efectivas de una semana completa, agrupadas por grupo muscular. */
export const weekMuscleVolume = (microcycles, weekNumber) => {
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return {};

  const out = {};
  for (const session of executedSessions(micro)) {
    for (const [muscle, count] of Object.entries(sessionMuscleVolume(session))) {
      out[muscle] = (out[muscle] || 0) + count;
    }
  }
  return out;
};

/** Tonelaje = Σ (kg × reps) de la semana. Solo cuenta series con ambos datos. */
export const weekTonnage = (microcycles, weekNumber) => {
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return 0;

  let total = 0;
  for (const session of executedSessions(micro)) total += sessionTonnage(session);
  return Math.round(total);
};

export const tonnageByWeek = (microcycles) =>
  microcycles.map((m) => ({ week: m.weekNumber, tonnage: weekTonnage(microcycles, m.weekNumber) }));

export const countSets = (day) =>
  (day?.exercises || []).reduce((acc, ex) => acc + (ex.sets?.length || 0), 0);

/**
 * Qué día de la semana natural corresponde a un día del microciclo, si el
 * split semanal lo menciona. Solo aplica a cycleType 'weekly'.
 */
export const weekdayForDay = (weeklySplit, dayName) => {
  if (!weeklySplit || !dayName) return null;
  const target = dayName.toLowerCase();
  return Object.keys(weeklySplit).find((d) => weeklySplit[d]?.toLowerCase() === target) || null;
};

// ── Analítica de entrenamiento ─────────────────────────────────────────────
//
// Todo lo de aquí abajo existe para responder preguntas de entrenamiento que
// antes no se podían responder: ¿este ejercicio progresa? ¿cuánto volumen
// lleva cada músculo? ¿cuántas veces por semana se toca?

/**
 * 1RM estimado por la fórmula de Epley: kg × (1 + reps/30).
 *
 * Sirve para comparar series de rangos distintos: 100 kg × 5 y 85 kg × 10 son
 * esfuerzos parecidos, y mirando solo los kg parecería un retroceso. Pierde
 * precisión por encima de 12 repeticiones, así que ahí se descarta.
 */
export const estimatedOneRm = (kg, reps) => {
  const load = toNum(kg);
  const r = toNum(reps);
  if (load === null || r === null || load <= 0 || r <= 0 || r > 12) return null;
  return Math.round(load * (1 + r / 30));
};

/** Todos los nombres de ejercicio que aparecen en el programa, sin repetir. */
export const exerciseNames = (microcycles) => {
  const names = new Set();
  for (const micro of microcycles || []) {
    for (const day of micro.days || []) {
      for (const exercise of day.exercises || []) {
        if (exercise.name) names.add(exercise.name);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
};

/**
 * Progresión de UN ejercicio a lo largo del programa. Por cada semana en la que
 * aparece devuelve la mejor serie, el 1RM estimado, el tonelaje y las series
 * efectivas.
 *
 * "Mejor serie" es la de mayor 1RM estimado, no la de más kilos: es la que de
 * verdad representa el mejor rendimiento de esa sesión.
 */
export const exerciseProgression = (microcycles, name) => {
  const rows = [];

  for (const micro of [...(microcycles || [])].sort((a, b) => a.weekNumber - b.weekNumber)) {
    let best = null;
    let tonnage = 0;
    let sets = 0;

    // El ejercicio está PROGRAMADO en el plan y REGISTRADO en las sesiones. La
    // fila existe si está programado —así una semana planificada y no entrenada
    // aparece con un hueco en vez de desaparecer del eje— y los números salen de
    // lo ejecutado.
    const found = (micro.days || []).some((day) =>
      (day.exercises || []).some((exercise) => exercise.name === name)
    );

    for (const session of executedSessions(micro)) {
      for (const entry of session.entries || []) {
        if (entry.name !== name) continue;

        for (const set of entry.sets || []) {
          const kg = toNum(set?.kg);
          const reps = toNum(set?.reps);
          if (kg === null || reps === null || reps <= 0) continue;

          sets += 1;
          tonnage += kg * reps;

          const e1rm = estimatedOneRm(kg, reps);
          if (e1rm !== null && (best === null || e1rm > best.e1rm)) {
            best = { kg, reps, e1rm };
          }
        }
      }
    }

    if (!found && sets === 0) continue;
    rows.push({
      week: micro.weekNumber,
      label: `S${micro.weekNumber}`,
      date: micro.date,
      bestKg: best?.kg ?? null,
      bestReps: best?.reps ?? null,
      e1rm: best?.e1rm ?? null,
      tonnage: tonnage > 0 ? Math.round(tonnage) : null,
      sets: sets > 0 ? sets : null,
    });
  }

  return rows;
};

/** Series efectivas de un músculo concreto, semana a semana. */
export const muscleVolumeOverTime = (microcycles, muscle) =>
  [...(microcycles || [])]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((micro) => {
      const volume = weekMuscleVolume(microcycles, micro.weekNumber);
      return {
        week: micro.weekNumber,
        label: `S${micro.weekNumber}`,
        value: volume[muscle] ?? 0,
      };
    });

/** Músculos que aparecen en todo el programa, ordenados por volumen total. */
export const trainedMuscles = (microcycles) => {
  const totals = {};
  for (const micro of microcycles || []) {
    for (const [muscle, count] of Object.entries(weekMuscleVolume(microcycles, micro.weekNumber))) {
      totals[muscle] = (totals[muscle] || 0) + count;
    }
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([muscle]) => muscle);
};

/**
 * Frecuencia semanal: en cuántos días distintos se entrena cada músculo.
 *
 * Con el mismo volumen total, repartirlo en dos sesiones suele rendir más que
 * concentrarlo en una. Es un dato que no se ve mirando solo el total de series.
 */
export const muscleFrequency = (microcycles, weekNumber) => {
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return {};

  const frequency = {};
  for (const day of micro.days || []) {
    const inDay = new Set();
    for (const exercise of day.exercises || []) {
      const effective = (exercise.sets || []).some((s) => (toNum(s?.reps) ?? 0) > 0);
      if (effective) inDay.add(exercise.muscle || 'Otros');
    }
    for (const muscle of inDay) frequency[muscle] = (frequency[muscle] || 0) + 1;
  }
  return frequency;
};

/** Resumen de una semana: días, ejercicios, series y tonelaje. */
export const weekSummary = (microcycles, weekNumber) => {
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return null;

  const days = micro.days || [];
  return {
    days: days.length,
    exercises: days.reduce((acc, d) => acc + (d.exercises?.length || 0), 0),
    sets: days.reduce((acc, d) => acc + countSets(d), 0),
    tonnage: weekTonnage(microcycles, weekNumber),
  };
};

/**
 * Volumen PLANIFICADO de un día: series por grupo muscular, se hayan hecho o no.
 *
 * ── Por qué no vale `dayMuscleVolume` ───────────────────────────────────────
 * Esa cuenta series EFECTIVAS —las que tienen repeticiones anotadas—, que es lo
 * correcto para medir lo que se entrenó. Pero al PROGRAMAR no hay nada anotado
 * todavía, así que devuelve un objeto vacío justo cuando el entrenador está
 * repartiendo el volumen y es cuando más falta hace verlo.
 *
 * Son dos preguntas distintas sobre el mismo día —«¿cuánto le he puesto?» y
 * «¿cuánto ha hecho?»— y por eso son dos funciones y no un parámetro: mezclarlas
 * lleva a enseñar una cuando se preguntaba la otra.
 */
export const dayPlannedVolume = (day) => {
  const out = {};
  for (const ex of day?.exercises || []) {
    const muscle = ex.muscle || 'Otros';
    const sets = (ex.sets || []).length;
    if (sets > 0) out[muscle] = (out[muscle] || 0) + sets;
  }
  return out;
};

/** Series programadas del día, en total. */
export const dayPlannedSets = (day) =>
  (day?.exercises || []).reduce((n, ex) => n + (ex.sets || []).length, 0);

// ── Calentamiento: el del programa, o el de este día ───────────────────────

/**
 * El calentamiento que toca en un día concreto.
 *
 * ══ Por qué el día SUSTITUYE y no tiene el suyo desde el principio ══════════
 *
 * Un calentamiento se repite: es la rutina de movilidad de esta persona, no una
 * decisión que se tome cada lunes. Si cada día tuviera el suyo habría que
 * montarlo cinco veces y mantenerlo cinco veces, y en cuanto uno divergiera el
 * cliente haría cosas distintas según el día sin que nadie lo hubiera decidido.
 *
 * Pero hay días que sí piden lo suyo —el de pierna no se calienta como el de
 * empuje—, así que un día puede tener el suyo Y ENTONCES manda. El caso común
 * sigue costando cero y el específico es posible.
 *
 * ── `null` y `[]` no significan lo mismo ────────────────────────────────────
 * `undefined`/`null` es «este día no ha decidido nada, usa el del programa».
 * `[]` es «este día ha decidido que NO se calienta», y hay que respetarlo: un
 * día de descanso activo o una sesión de test no llevan movilidad, y caer al del
 * programa reaparecería el que el entrenador acaba de quitar.
 *
 * @param {{ mobilityDrills?: MobilityDrill[] }} program
 * @param {{ mobilityDrills?: MobilityDrill[]|null }} day
 */
export const drillsForDay = (program, day) => {
  const propios = day?.mobilityDrills;
  if (Array.isArray(propios)) return propios;
  return program?.mobilityDrills || [];
};

/** ¿Este día tiene calentamiento propio, o hereda el del programa? */
export const dayHasOwnDrills = (day) => Array.isArray(day?.mobilityDrills);

/**
 * LA PROGRESIÓN DE UNA RUTINA, semana a semana.
 *
 * ══ Por qué la unidad es el DÍA y no el ejercicio ══════════════════════════
 *
 * Porque un entrenador no progresa ejercicios sueltos: progresa sesiones. «¿Cómo
 * va el Push?» es la pregunta que se hace al montar la semana siguiente, y para
 * contestarla hacen falta las tres cosas a la vez —cuántas series de cada grupo
 * lleva ese día, cuántas se hicieron de verdad y cuánto peso movió—, que es
 * exactamente lo que no se podía ver: la progresión por ejercicio contesta otra
 * cosa, y el volumen por músculo mezcla los cinco días de la semana en un solo
 * montón.
 *
 * ── Pautado y hecho, los dos ────────────────────────────────────────────────
 * Una fila con «14 series de pecho» no dice si son las que le pusiste o las que
 * hizo. Van los dos números porque la diferencia ES el dato: 16 pautadas y 9
 * hechas no es un Push de 9 series, es un Push a medias.
 *
 * ── Solo las semanas en las que ese día EXISTE ─────────────────────────────
 * Si el día se llamaba «Push» en el bloque 1 y «Empuje» en el 2, la tabla del
 * primero acaba donde acaba el bloque. Es correcto: son dos rutinas distintas
 * aunque se parezcan, y encadenarlas por el nombre sería inventarse una
 * continuidad que no existe.
 */
export const dayProgression = (microcycles, dayName) => {
  if (!dayName) return [];

  return [...(microcycles || [])]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((micro) => {
      const day = (micro.days || []).find((d) => d.dayName === dayName);
      if (!day) return null;

      const sesiones = executedSessions(micro).filter((s) => s.dayName === dayName);

      const done = {};
      let tonnage = 0;
      for (const session of sesiones) {
        for (const [muscle, count] of Object.entries(sessionMuscleVolume(session))) {
          done[muscle] = (done[muscle] || 0) + count;
        }
        tonnage += sessionTonnage(session);
      }

      const planned = dayPlannedVolume(day);
      return {
        week: micro.weekNumber,
        label: `S${micro.weekNumber}`,
        date: micro.date || null,
        planned,
        done,
        plannedSets: dayPlannedSets(day),
        doneSets: Object.values(done).reduce((a, v) => a + v, 0),
        tonnage: Math.round(tonnage),
        /* Sin sesión anotada no es «cero kilos»: es una semana sin registrar, y
           pintar un cero diría que ese día se entrenó a vacío. */
        entrenado: sesiones.length > 0,
      };
    })
    .filter(Boolean);
};

/** Los nombres de día que existen en el programa, en el orden en que se montan. */
export const dayNames = (microcycles) => {
  const vistos = new Set();
  const out = [];
  for (const micro of [...(microcycles || [])].sort((a, b) => b.weekNumber - a.weekNumber)) {
    for (const day of micro.days || []) {
      if (day.dayName && !vistos.has(day.dayName)) {
        vistos.add(day.dayName);
        out.push(day.dayName);
      }
    }
  }
  return out;
};
