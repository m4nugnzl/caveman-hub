/**
 * El protocolo: qué le pide este entrenador a sus clientes.
 *
 * ══ Por qué esto es UNA cosa y no cinco ═════════════════════════════════════
 *
 * Sobre la mesa había cinco peticiones que parecían funciones separadas: notas
 * del entrenador para el cliente, un logbook propio del cliente, un bloque de
 * calentamiento con vídeos, feedback de la sesión (fatiga, dolor, sensaciones) y
 * preguntas en el check-in. Construidas por separado serían cinco interruptores,
 * cinco formatos de dato y cinco sitios donde mirar.
 *
 * Son dos.
 *
 *   · PREGUNTAS CON RESPUESTA. El feedback de una sesión y el cuestionario del
 *     check-in son exactamente lo mismo con distinta frecuencia: una escala del
 *     1 al 10 contestada al acabar de entrenar y otra contestada el domingo. Si
 *     se modelan igual, «medirlo y trackearlo» deja de ser trabajo extra: toda
 *     respuesta numérica ES una serie temporal, y entra en la analítica por el
 *     mismo sitio que el peso o el tonelaje.
 *
 *   · CONTENIDO QUE BAJA DEL ENTRENADOR. El calentamiento con sus vídeos y la
 *     nota de una sesión son material que el entrenador adjunta y el cliente lee.
 *
 * Y encima de las dos, el marco: **el entrenador decide qué existe en su app**.
 * Uno que lleva atletas de fuerza querrá RPE y dolor articular; otro que lleva
 * recomposición corporal querrá hambre y adherencia; otro no querrá preguntar
 * nada. Ninguno de los tres debería ver los módulos de los otros dos.
 *
 * ── Dónde vive ──────────────────────────────────────────────────────────────
 * En `clients.preferences.protocol`, que ya tiene su función de guardado
 * (`set_client_preferences`, migración 0008) y por tanto NO necesita migración.
 * Esa columna tiene un tope de 8 KB; un protocolo completo con cuatro preguntas
 * propias ocupa unos 400 bytes, así que hay sitio de sobra — pero por eso las
 * preguntas propias están acotadas (ver `MAX_CUSTOM`).
 *
 * Las mismas reglas de formato que el resto de preferencias: lo que no está
 * configurado usa el valor por defecto, y **las claves desconocidas se ignoran**,
 * de modo que se pueden añadir módulos nuevos sin migrar nada.
 */

import { newId } from '@/lib/ids';

// ── Los módulos ────────────────────────────────────────────────────────────

/**
 * Cada módulo es una PARTE DEL PRODUCTO que el entrenador enciende o apaga.
 *
 * Todos van apagados salvo los que trae el perfil por defecto: una aplicación
 * que llega con todo encendido obliga a apagar, y apagar cosas que no entiendes
 * da más miedo que encender las que quieres.
 */
export const MODULES = [
  {
    id: 'warmup',
    label: 'Calentamiento y movilidad',
    hint: 'Una lista de ejercicios previos, con su vídeo y tus indicaciones, delante de cada sesión.',
  },
  {
    id: 'coachNote',
    label: 'Tu nota en cada sesión',
    hint: 'Puedes dejar una indicación en un día concreto. El cliente la ve al abrirlo.',
  },
  {
    id: 'clientNote',
    label: 'Logbook del cliente',
    hint: 'Un espacio propio donde tu cliente apunta lo que quiera de cada sesión. Tú lo lees.',
  },
  {
    id: 'sessionFeedback',
    label: 'Feedback al terminar de entrenar',
    hint: 'Las preguntas que elijas abajo. Cada respuesta numérica se convierte en una serie que puedes seguir.',
  },
  {
    /*
      Programar por RIR es una forma de entrenar, no la forma. Quien prescribe
      por porcentajes o por sensaciones no quiere una casilla más por serie —y
      antes la tenía igualmente, porque el RIR que anota el cliente existía desde
      el principio sin nada con que compararlo.

      Encendido, cada serie lleva su RIR objetivo y al cliente se le enseña
      cuánto se le pidió junto a lo que anotó.
    */
    id: 'rir',
    label: 'RIR objetivo por serie',
    hint: 'Programas cuántas repeticiones debe dejarse en cada serie, y ves lo que anotó frente a lo que le pediste.',
  },
];

export const moduleById = (id) => MODULES.find((m) => m.id === id) || null;

// ── El catálogo de preguntas ───────────────────────────────────────────────

/**
 * Tipos de pregunta. Dos, y con un motivo:
 *
 *   · `scale` es la que se puede MEDIR. Una escala numérica se promedia, se
 *     compara entre semanas y se dibuja. Es la que da valor a todo esto.
 *   · `text` es la que no. Sirve para lo que no cabe en un número —«me ha
 *     molestado el hombro al bajar»— y por eso no aparece en ningún gráfico.
 *
 * No hay «sí/no» a propósito: una respuesta binaria es una escala de dos
 * valores, y desdoblarla en un tipo aparte obligaría a que cada gráfico supiera
 * tratarla. Quien quiera preguntar algo binario pone una escala de 1 a 2.
 */
export const QUESTION_KINDS = ['scale', 'text'];

/**
 * Preguntas de serie. Salen de lo que se pregunta de verdad en una revisión, no
 * de una lista bonita:
 *
 *   · El RPE de sesión es el estándar del oficio y no tiene dirección buena o
 *     mala —un 9 puede ser lo previsto—, por eso `neutral`.
 *   · La fatiga, el dolor, las agujetas y el estrés van al revés que el resto:
 *     cuanto más bajo, mejor. `lowerIsBetter` es lo que hace que una subida se
 *     pinte como un problema y no como un logro.
 *   · El dolor y las agujetas empiezan en CERO, porque «no me duele nada» es una
 *     respuesta real y frecuente; forzar un mínimo de 1 la haría imposible de
 *     dar y ensuciaría todas las series con un uno que significa cero.
 */
export const SESSION_QUESTIONS = [
  {
    id: 'rpe',
    label: 'Esfuerzo de la sesión',
    short: 'RPE',
    hint: 'De 1 (muy suave) a 10 (no podía más)',
    kind: 'scale',
    min: 1,
    max: 10,
    neutral: true,
    color: 'var(--data-violet)',
  },
  {
    id: 'fatigue',
    label: 'Fatiga al acabar',
    short: 'Fatiga',
    hint: 'Cómo de vacío has terminado',
    kind: 'scale',
    min: 1,
    max: 10,
    lowerIsBetter: true,
    color: 'var(--data-orange)',
  },
  {
    id: 'pain',
    label: 'Dolor o molestias',
    short: 'Dolor',
    hint: '0 si no te ha dolido nada',
    kind: 'scale',
    min: 0,
    max: 10,
    lowerIsBetter: true,
    color: 'var(--data-rose)',
  },
  {
    id: 'painZone',
    label: '¿Dónde te ha molestado?',
    short: 'Zona',
    hint: 'Solo si has marcado dolor',
    kind: 'text',
  },
  {
    id: 'sleep',
    label: 'Cómo dormiste anoche',
    short: 'Sueño',
    kind: 'scale',
    min: 1,
    max: 10,
    color: 'var(--data-blue)',
  },
  {
    id: 'energy',
    label: 'Energía',
    short: 'Energía',
    kind: 'scale',
    min: 1,
    max: 10,
    color: 'var(--data-lime)',
  },
  {
    id: 'soreness',
    label: 'Agujetas antes de empezar',
    short: 'Agujetas',
    kind: 'scale',
    min: 0,
    max: 10,
    lowerIsBetter: true,
    color: 'var(--data-amber)',
  },
  {
    id: 'stress',
    label: 'Estrés del día',
    short: 'Estrés',
    kind: 'scale',
    min: 1,
    max: 10,
    lowerIsBetter: true,
    color: 'var(--data-pink)',
  },
  {
    id: 'mood',
    label: 'Sensaciones generales',
    short: 'Ánimo',
    kind: 'scale',
    min: 1,
    max: 10,
    color: 'var(--data-teal)',
  },
  {
    id: 'note',
    label: 'Algo que quieras contarme',
    short: 'Nota',
    kind: 'text',
  },
];

/**
 * Tope de preguntas propias.
 *
 * No es una limitación de producto, es la columna: `preferences` está capada a
 * 8 KB por la migración 0008 y ese tope protege la fila del cliente de que
 * cualquiera con la anon key la engorde. Seis preguntas propias con su etiqueta
 * son unos 500 bytes; el resto del margen es para las preferencias del panel,
 * que comparten la misma columna.
 */
export const MAX_CUSTOM = 6;

/** Color de las preguntas propias: rotan por la paleta de datos. */
const CUSTOM_COLORS = [
  'var(--data-slate)',
  'var(--data-teal)',
  'var(--data-blue)',
  'var(--data-violet)',
  'var(--data-lime)',
  'var(--data-pink)',
];

// ── Perfiles ───────────────────────────────────────────────────────────────

/**
 * Como los perfiles del panel: elegir de una lista es trabajo y casi nadie lo
 * hace. Cada uno responde a una forma real de llevar clientes.
 */
export const PROTOCOL_PRESETS = [
  {
    id: 'off',
    label: 'Nada',
    hint: 'Solo la rutina y los kilos. Sin notas ni preguntas.',
    protocol: { modules: [], questions: [] },
  },
  {
    id: 'basic',
    label: 'Lo básico',
    hint: 'Tus notas, el logbook del cliente y cómo de dura fue la sesión',
    protocol: {
      modules: ['coachNote', 'clientNote', 'sessionFeedback'],
      questions: ['rpe', 'note'],
    },
  },
  {
    id: 'performance',
    label: 'Rendimiento',
    hint: 'Para atletas: carga, fatiga acumulada y descanso',
    protocol: {
      modules: ['warmup', 'coachNote', 'clientNote', 'sessionFeedback'],
      questions: ['rpe', 'fatigue', 'soreness', 'sleep', 'note'],
    },
  },
  {
    id: 'clinical',
    label: 'Con seguimiento del dolor',
    hint: 'Para readaptación o clientes con molestias: dolor, zona y sensaciones',
    protocol: {
      modules: ['warmup', 'coachNote', 'clientNote', 'sessionFeedback'],
      questions: ['pain', 'painZone', 'rpe', 'mood', 'note'],
    },
  },
];

/**
 * Lo que ve un cliente cuyo entrenador no ha tocado nada.
 *
 * Deliberadamente corto. El valor por defecto de un producto configurable es la
 * opinión que da cuando nadie opina, y aquí la opinión es: pregunta poco y
 * pregunta lo que se usa. Tres campos al acabar de entrenar se rellenan; nueve
 * se abandonan a la tercera sesión, y una serie con huecos no se puede leer.
 */
export const defaultProtocol = () => ({
  modules: ['coachNote', 'clientNote', 'sessionFeedback'],
  questions: ['rpe', 'note'],
  custom: [],
});

// ── Saneado ────────────────────────────────────────────────────────────────

const isScale = (q) => q?.kind === 'scale';

const sanitizeCustom = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '');
    const label = String(item.label || '').trim().slice(0, 60);
    // Un id que choque con una pregunta de serie rompería `questionById`, que
    // resuelve primero el catálogo: la propia quedaría inalcanzable y el
    // entrenador vería la de serie en su sitio sin entender por qué.
    if (!id || !label || SESSION_QUESTIONS.some((q) => q.id === id)) continue;
    if (out.some((q) => q.id === id)) continue;

    const kind = QUESTION_KINDS.includes(item.kind) ? item.kind : 'scale';
    const max = Number(item.max);
    out.push({
      id,
      label,
      short: label.slice(0, 12),
      kind,
      ...(kind === 'scale'
        ? {
            min: item.min === 0 ? 0 : 1,
            max: Number.isFinite(max) && max >= 2 && max <= 10 ? Math.round(max) : 10,
            lowerIsBetter: Boolean(item.lowerIsBetter),
            color: CUSTOM_COLORS[out.length % CUSTOM_COLORS.length],
          }
        : {}),
    });
    if (out.length >= MAX_CUSTOM) break;
  }
  return out;
};

/**
 * El protocolo efectivo de un cliente: lo configurado, completado con los
 * valores por defecto y limpio de lo que la aplicación no conoce.
 *
 * Que un id desconocido se caiga en silencio es lo que permite quitar una
 * pregunta del catálogo en una versión futura sin dejar clientes rotos.
 */
export const clientProtocol = (preferences) => {
  const raw = preferences?.protocol;
  if (!raw || typeof raw !== 'object') return defaultProtocol();

  const custom = sanitizeCustom(raw.custom);
  const known = new Set([...SESSION_QUESTIONS.map((q) => q.id), ...custom.map((q) => q.id)]);
  const moduleIds = new Set(MODULES.map((m) => m.id));

  const dedupe = (list, valid, fallback) => {
    if (!Array.isArray(list)) return fallback;
    const out = [];
    for (const id of list) {
      if (valid.has(id) && !out.includes(id)) out.push(id);
    }
    return out;
  };

  return {
    modules: dedupe(raw.modules, moduleIds, defaultProtocol().modules),
    questions: dedupe(raw.questions, known, defaultProtocol().questions),
    custom,
  };
};

// ── Lectura ────────────────────────────────────────────────────────────────

export const isModuleOn = (protocol, id) => Boolean(protocol?.modules?.includes(id));

/** Una pregunta por su id, sea de serie o propia del entrenador. */
export const questionById = (protocol, id) =>
  SESSION_QUESTIONS.find((q) => q.id === id) ||
  (protocol?.custom || []).find((q) => q.id === id) ||
  null;

/**
 * Las preguntas activas, resueltas y EN EL ORDEN ELEGIDO.
 *
 * El orden importa más de lo que parece: es el orden en que se contestan de pie
 * en el gimnasio, y una pregunta de texto en medio de tres escalas corta el
 * ritmo. Por eso se conserva el del array y no se reordena por catálogo.
 */
export const activeQuestions = (protocol) =>
  (protocol?.questions || []).map((id) => questionById(protocol, id)).filter(Boolean);

/** Solo las medibles. Es lo que la analítica puede convertir en serie. */
export const scaleQuestions = (protocol) => activeQuestions(protocol).filter(isScale);

/** ¿Hay algo que preguntar de verdad al acabar de entrenar? */
export const asksFeedback = (protocol) =>
  isModuleOn(protocol, 'sessionFeedback') && activeQuestions(protocol).length > 0;

// ── Escritura ──────────────────────────────────────────────────────────────

export const toggleModule = (protocol, id) => {
  const on = isModuleOn(protocol, id);
  const order = MODULES.map((m) => m.id);
  const modules = on
    ? protocol.modules.filter((m) => m !== id)
    : [...protocol.modules, id].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return { ...protocol, modules };
};

/**
 * Añade o quita una pregunta. Al añadir se pone AL FINAL, no en el orden del
 * catálogo: el entrenador la acaba de elegir y espera verla donde ha pulsado, y
 * además el orden de las preguntas es suyo (ver `activeQuestions`).
 */
export const toggleQuestion = (protocol, id) => {
  const has = protocol.questions.includes(id);
  return {
    ...protocol,
    questions: has ? protocol.questions.filter((q) => q !== id) : [...protocol.questions, id],
  };
};

export const moveQuestion = (protocol, id, direction) => {
  const list = protocol.questions;
  const index = list.indexOf(id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= list.length) return protocol;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return { ...protocol, questions: next };
};

/** Una pregunta propia del entrenador. Nace activa: se acaba de escribir. */
export const addCustomQuestion = (protocol, { label, kind = 'scale', max = 10, lowerIsBetter = false }) => {
  const clean = String(label || '').trim();
  if (!clean || (protocol.custom || []).length >= MAX_CUSTOM) return protocol;

  const question = { id: newId('q'), label: clean, kind, max, lowerIsBetter };
  const custom = sanitizeCustom([...(protocol.custom || []), question]);
  const added = custom[custom.length - 1];

  return {
    ...protocol,
    custom,
    questions: added ? [...protocol.questions, added.id] : protocol.questions,
  };
};

export const removeCustomQuestion = (protocol, id) => ({
  ...protocol,
  custom: (protocol.custom || []).filter((q) => q.id !== id),
  questions: protocol.questions.filter((q) => q !== id),
});

/** El perfil que coincide exactamente con lo que hay puesto, si hay alguno. */
export const matchingPreset = (protocol) =>
  PROTOCOL_PRESETS.find(
    (preset) =>
      preset.protocol.modules.join() === protocol.modules.join() &&
      preset.protocol.questions.join() === protocol.questions.join()
  ) || null;
