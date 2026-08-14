/**
 * El alta de un cliente: los pasos que cada entrenador da al empezar con alguien.
 *
 * ══ Por qué esto existe ═════════════════════════════════════════════════════
 *
 * La aplicación traía dos pasos clavados para todo el mundo —«onboarding» y
 * «revisión postural inicial»— con su columna propia en `clients`, su alerta en
 * el tablero y su botón en la ficha.
 *
 * Pero esos dos pasos no son del oficio: son la forma de trabajar de UNA persona.
 * Quien lo montó manda un vídeo al cliente, analiza su postura y con eso da el
 * alta por cerrada. Otro entrenador hace una anamnesis, otro una prueba de
 * fuerza, otro nada. A los tres se les estaba pidiendo lo mismo, y a los que
 * trabajan distinto la aplicación les preguntaba por algo que no hacen —o peor,
 * les avisaba en rojo de que no lo habían hecho—.
 *
 * Es exactamente la tesis que ya defiende `protocol.js`: **el entrenador decide
 * qué existe en su app**. Estos dos pasos eran lo único que se había saltado esa
 * regla, así que esto no es un sistema nuevo, es traerlos al que ya había.
 *
 * ══ Un paso no es solo una casilla ══════════════════════════════════════════
 *
 * Marcar «vídeo de bienvenida: hecho» no le sirve de nada al cliente, que es
 * quien tiene que verlo. Por eso un paso puede llevar CONTENIDO: un enlace que el
 * entrenador pega —YouTube, Loom, Drive, lo que use— y que al cliente le aparece
 * en su portal. Así el paso deja de ser el recordatorio privado del entrenador y
 * pasa a ser la cosa que se entrega.
 *
 * ══ Dónde vive ═════════════════════════════════════════════════════════════
 *
 * En `clients.preferences.intake`, que ya tiene su función de guardado
 * (`set_client_preferences`, migración 0008). **No hace falta migración.** Y como
 * esa columna está capada a 8 KB, todo aquí está acotado: número de pasos
 * propios, largo de la etiqueta y largo del enlace.
 *
 * Va como sección HERMANA del protocolo y no dentro de él. `clientProtocol()`
 * sanea y descarta lo que no conoce, así que un `protocol.intake` desaparecería
 * en el primer cambio que alguien hiciera en Ajustes → Protocolo.
 *
 * ── Los dos pasos viejos siguen en sus columnas ─────────────────────────────
 * `onboardingComplete` y `postureReviewed` NO se tocan. Los dos pasos que los
 * usan declaran su `column` y leen y escriben ahí. Eso mantiene intactas las
 * alertas del tablero y los datos de todos los clientes que ya existen, y evita
 * una migración de estado que no aporta nada: el sitio donde se guarda un booleano
 * da igual mientras solo lo lea este módulo.
 */

// ── El catálogo ────────────────────────────────────────────────────────────

/**
 * Pasos sugeridos. Salen de lo que se hace de verdad al empezar con alguien, no
 * de una lista bonita, y ninguno está encendido por obligación.
 *
 * `link: true` marca los que entregan algo al cliente. No todos lo hacen: «primer
 * cobro» es una casilla del entrenador y pedirle un enlace sería ruido.
 */
export const INTAKE_CATALOG = [
  {
    id: 'welcome',
    label: 'Vídeo de bienvenida',
    hint: 'Cómo funciona esto y qué espera de él. Se lo enseñas una vez y le queda guardado.',
    link: true,
  },
  {
    id: 'routineVideo',
    label: 'Vídeo explicando la rutina',
    hint: 'Le explicas su rutina en vídeo. Lo tendrá a mano cada vez que entrene.',
    link: true,
  },
  {
    id: 'postureVideo',
    label: 'Vídeo de postura recibido',
    hint: 'El cliente te manda su vídeo. Márcalo cuando lo tengas.',
  },
  {
    /*
      Los dos siguientes son los que existían clavados. Conservan su columna, así
      que quien ya los tuviera marcados sigue teniéndolos.
    */
    id: 'postureReview',
    label: 'Análisis postural hecho',
    hint: 'Tu análisis de su postura. Si lo grabas o lo escribes, enlázalo y lo verá.',
    column: 'postureReviewed',
    link: true,
  },
  {
    id: 'onboarding',
    label: 'Onboarding cerrado',
    hint: 'El paso que da por terminada la puesta en marcha.',
    column: 'onboardingComplete',
  },
  {
    id: 'anamnesis',
    label: 'Anamnesis / historial',
    hint: 'Lesiones, patologías, horarios, lo que condiciona el plan.',
    link: true,
  },
  { id: 'goals', label: 'Objetivos acordados', hint: 'Qué busca y en cuánto tiempo.' },
  {
    id: 'measures',
    label: 'Primera medición',
    hint: 'Peso, perímetros y pliegues de partida.',
  },
  { id: 'payment', label: 'Cobro configurado', hint: 'Su plan y su forma de pago.' },
];

export const catalogStep = (id) => INTAKE_CATALOG.find((s) => s.id === id) || null;

/**
 * Tope de pasos propios. Mismo motivo que en `protocol.js`: la columna
 * `preferences` está capada a 8 KB y la comparten el protocolo, el panel y esto.
 */
export const MAX_CUSTOM_STEPS = 6;

/** Un enlace más largo que esto no es un enlace, es alguien llenando la fila. */
export const MAX_LINK = 300;

/**
 * Lo que ve un entrenador que no ha tocado nada.
 *
 * Son los dos pasos que la aplicación traía clavados, y están aquí por una razón
 * concreta: quien ya estaba usando esto no puede notar el cambio. Lo que antes
 * era obligatorio ahora es el valor por defecto — que es justo la diferencia
 * entre imponer una forma de trabajar y proponerla.
 */
export const defaultIntake = () => ({
  steps: ['onboarding', 'postureReview'],
  custom: [],
  done: [],
  links: {},
});

// ── Saneado ────────────────────────────────────────────────────────────────

/**
 * Un enlace que va a acabar en un `href` que pulsa el CLIENTE.
 *
 * Lo escribe el entrenador, así que es dato de usuario y no se puede pintar tal
 * cual: `javascript:…` en un `href` ejecuta código en la sesión de quien lo pulsa.
 * Solo pasan http y https, y se resuelve con el parser del navegador en vez de
 * con una expresión regular propia, que es donde se cuelan los casos raros.
 */
export const safeLink = (raw) => {
  const text = String(raw || '').trim().slice(0, MAX_LINK);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

const sanitizeCustom = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '');
    const label = String(item.label || '').trim().slice(0, 60);
    /* Un id que choque con el catálogo dejaría el paso propio inalcanzable:
       `stepById` resuelve primero el catálogo y el entrenador vería el de serie
       en su sitio sin entender por qué. */
    if (!id || !label || catalogStep(id)) continue;
    if (out.some((s) => s.id === id)) continue;

    out.push({ id, label, hint: String(item.hint || '').trim().slice(0, 120), link: true });
    if (out.length >= MAX_CUSTOM_STEPS) break;
  }
  return out;
};

/**
 * El alta efectiva de un cliente: lo configurado, completado con los valores por
 * defecto y limpio de lo que la aplicación no conoce.
 *
 * Que un id desconocido se caiga en silencio es lo que permite retirar un paso
 * del catálogo en una versión futura sin dejar clientes rotos.
 */
export const clientIntake = (preferences) => {
  const raw = preferences?.intake;
  if (!raw || typeof raw !== 'object') return defaultIntake();

  const custom = sanitizeCustom(raw.custom);
  const known = new Set([...INTAKE_CATALOG.map((s) => s.id), ...custom.map((s) => s.id)]);

  const steps = Array.isArray(raw.steps)
    ? [...new Set(raw.steps.filter((id) => known.has(id)))]
    : defaultIntake().steps;

  const done = Array.isArray(raw.done) ? [...new Set(raw.done.filter((id) => steps.includes(id)))] : [];

  const links = {};
  if (raw.links && typeof raw.links === 'object') {
    for (const id of steps) {
      const link = safeLink(raw.links[id]);
      if (link) links[id] = link;
    }
  }

  return { steps, custom, done, links };
};

// ── Leer ───────────────────────────────────────────────────────────────────

/** Un paso por su id, mire donde mire: catálogo primero, propios después. */
export const stepById = (intake, id) =>
  catalogStep(id) || intake.custom.find((s) => s.id === id) || null;

/** Los pasos de este cliente, resueltos y en el orden que puso el entrenador. */
export const intakeSteps = (intake) =>
  intake.steps.map((id) => stepById(intake, id)).filter(Boolean);

/**
 * Si un paso está hecho.
 *
 * Los dos pasos viejos viven en su columna de `clients` y el resto en las
 * preferencias. Quien pregunte por aquí no tiene que saber cuál es cuál.
 */
export const stepDone = (step, client, intake) =>
  step.column ? Boolean(client?.[step.column]) : intake.done.includes(step.id);

/** El enlace de un paso, ya saneado, o null. */
export const stepLink = (intake, id) => intake.links[id] || null;

/** Cuánto queda del alta. `total` 0 significa que el entrenador no pide nada. */
export const intakeProgress = (client, intake) => {
  const steps = intakeSteps(intake);
  const done = steps.filter((step) => stepDone(step, client, intake)).length;
  return { done, total: steps.length, complete: done === steps.length };
};

/** Lo que el cliente puede abrir: pasos con contenido enlazado. */
export const intakeDeliverables = (intake) =>
  intakeSteps(intake)
    .filter((step) => intake.links[step.id])
    .map((step) => ({ ...step, url: intake.links[step.id] }));

// ── Escribir ───────────────────────────────────────────────────────────────
//
// Todas devuelven un alta NUEVA y no tocan la que reciben: quien llama decide
// cuándo guardarla, y el estado de React no se puede mutar en el sitio.

/** Enciende o apaga un paso. Al apagarlo se lleva su enlace y su marca. */
export const toggleStep = (intake, id) => {
  if (!stepById(intake, id)) return intake;
  if (!intake.steps.includes(id)) return { ...intake, steps: [...intake.steps, id] };

  const links = { ...intake.links };
  delete links[id];
  return {
    ...intake,
    steps: intake.steps.filter((s) => s !== id),
    done: intake.done.filter((s) => s !== id),
    links,
  };
};

/** Mueve un paso. El orden es el del alta, así que se puede seguir de arriba abajo. */
export const moveStep = (intake, id, delta) => {
  const from = intake.steps.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= intake.steps.length) return intake;

  const steps = [...intake.steps];
  [steps[from], steps[to]] = [steps[to], steps[from]];
  return { ...intake, steps };
};

/** Un paso propio, con el id ya hecho por quien llama (`lib/ids`). */
export const addCustomStep = (intake, id, label) => {
  const limpio = String(label || '').trim().slice(0, 60);
  if (!limpio || !id || catalogStep(id)) return intake;
  if (intake.custom.length >= MAX_CUSTOM_STEPS) return intake;
  if (intake.custom.some((s) => s.id === id)) return intake;

  return {
    ...intake,
    custom: [...intake.custom, { id, label: limpio, hint: '', link: true }],
    steps: [...intake.steps, id],
  };
};

export const removeCustomStep = (intake, id) => {
  if (!intake.custom.some((s) => s.id === id)) return intake;
  const links = { ...intake.links };
  delete links[id];
  return {
    ...intake,
    custom: intake.custom.filter((s) => s.id !== id),
    steps: intake.steps.filter((s) => s !== id),
    done: intake.done.filter((s) => s !== id),
    links,
  };
};

/**
 * Marcar un paso hecho.
 *
 * Devuelve las DOS cosas que hay que guardar y deja que quien llama use la que
 * toque: los pasos con columna se guardan en `clients` y el resto en las
 * preferencias. Devolver siempre las dos evita que cada pantalla tenga que
 * recordar cuál de los dos caminos le corresponde a cada paso.
 */
export const markStep = (intake, step, done) => {
  if (step.column) return { fields: { [step.column]: done }, intake };
  const yaEsta = intake.done.includes(step.id);
  if (yaEsta === done) return { fields: null, intake };
  return {
    fields: null,
    intake: {
      ...intake,
      done: done ? [...intake.done, step.id] : intake.done.filter((s) => s !== step.id),
    },
  };
};

/** Pega o quita el contenido de un paso. Un enlace que no vale se trata como quitarlo. */
export const setStepLink = (intake, id, url) => {
  const link = safeLink(url);
  const links = { ...intake.links };
  if (link) links[id] = link;
  else delete links[id];
  return { ...intake, links };
};

/**
 * Lo que se guarda en `preferences.intake`.
 *
 * Se escriben las CUATRO claves siempre, aunque vayan vacías, porque
 * `updateClientPreferences` fusiona por sección: una clave ausente conservaría
 * el valor viejo, y entonces quitar el último paso o borrar el último enlace no
 * llegaría a guardarse nunca.
 *
 * De los pasos propios solo se persisten `id` y `label`. `hint` y `link` los
 * pone `sanitizeCustom` al leer, y guardar un valor que se recalcula es tener
 * dos verdades esperando a discrepar.
 */
export const intakeToPreferences = (intake) => ({
  steps: intake.steps,
  custom: intake.custom.map(({ id, label }) => ({ id, label })),
  done: intake.done,
  links: intake.links,
});
