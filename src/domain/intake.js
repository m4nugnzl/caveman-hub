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
 * ══ Enlace o archivo, y solo uno de los dos ═════════════════════════════════
 *
 * El enlace vale para lo que ya vive en algún sitio —el vídeo de bienvenida está
 * en YouTube o en Loom— y no vale para lo que no vive en ninguno: la anamnesis en
 * PDF, la hoja de la primera medición, el análisis postural escrito. Eso obligaba
 * a subirlo a Drive, hacerlo público y pegar aquí ese enlace: tres pasos fuera de
 * la aplicación, y los datos de salud de alguien colgando de una dirección sin
 * caducidad ni dueño.
 *
 * Subiéndolo, el archivo va al mismo bucket privado que sus fotos y se entrega
 * con una URL firmada que caduca (migración 0039).
 *
 * ── Por qué UNO y no los dos a la vez ───────────────────────────────────────
 * Porque el paso entrega UNA cosa. Con enlace y archivo a la vez, el portal del
 * cliente tendría que enseñar dos botones «Abrir» en la misma fila y explicar cuál
 * es cuál — y quien los puso tendría que acordarse de qué había en cada uno. Poner
 * uno quita el otro, que es lo que ya se esperaba al pulsar «Cambiar».
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
  /*
    ══ Los tres primeros son DEL CLIENTE, y se marcan solos ═══════════════════

    El resto del catálogo son cosas que hace el entrenador y que marca a mano:
    «he grabado el vídeo», «he hecho el análisis postural». Éstos no: los hace el
    cliente, y la aplicación SABE cuándo están hechos —tiene sus respuestas, sus
    fotos y su check-in—, así que pedirle al entrenador que los marque sería
    pedirle que copie a mano un dato que ya tiene delante.

    `owner: 'client'` es lo que hace que aparezcan en SU portal como lo que tiene
    que hacer; `auto` dice de dónde se saca si está hecho (ver `stepDone`).

    ── Por qué van en este catálogo y no en una lista aparte ──────────────────
    Porque son la primera mitad de la misma cosa. El alta de un entrenador es
    «que me mande esto, y con esto yo hago aquello»: partirla en dos listas
    —lo suyo y lo mío— obligaría a mirar en dos sitios para saber si ya se puede
    empezar, que es justo la pregunta que este bloque contesta.
  */
  /*
    ── Dos textos por paso, y no es cosmética ────────────────────────────────
    `label`/`hint` los lee el ENTRENADOR en su lista: hablan de una tercera
    persona («las sube él»). `youLabel`/`youHint` los lee el CLIENTE en su
    portal, y ahí esa misma frase es un texto sobre otro. Reutilizar uno solo
    obligaba a elegir a quién se le habla mal.
  */
  {
    id: 'form',
    label: 'Cuestionario contestado',
    hint: 'Lo que le preguntas al empezar. Las preguntas se eligen arriba.',
    youLabel: 'Cuéntanos de ti',
    youHint: 'Cuatro cosas sobre cómo entrenas y cómo comes. Aquí abajo.',
    owner: 'client',
    auto: 'form',
  },
  {
    id: 'gymPhotos',
    label: 'Fotos de su gimnasio',
    hint: 'Las máquinas que tiene delante. Las sube él desde el móvil y las ordenas tú.',
    youLabel: 'Las fotos de tu gimnasio',
    youHint: 'Una foto a cada máquina. Sirven para montarte la rutina con lo que de verdad tienes.',
    owner: 'client',
    auto: 'gym',
  },
  {
    id: 'firstCheckIn',
    label: 'Primer check-in entregado',
    hint: 'Su peso y sus fotos de partida. Es contra lo que se compara todo lo demás.',
    youLabel: 'Tu primer check-in',
    youHint: 'Tu peso y tus fotos de partida. Es contra lo que se compara todo lo que venga.',
    owner: 'client',
    auto: 'checkin',
  },
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
  /*
    ── Y ahora los dos del cliente van delante ────────────────────────────────
    Porque son lo PRIMERO que pasa: no hay onboarding que cerrar ni postura que
    analizar hasta que la persona ha contado quién es y ha mandado las fotos de
    su gimnasio. El orden de esta lista es el orden de su portal.

    Entran en el valor por defecto y los otros dos no cambiaron: son filas de
    ESTADO, se marcan solas y no le piden nada al entrenador. Quien ya tenga sus
    pasos guardados no nota nada —`clientIntake` solo cae aquí cuando no hay nada
    configurado— y quien empieza hoy tiene el circuito entero sin configurar.

    `firstCheckIn` se queda fuera a propósito: pedir el primer pesaje es una
    forma de trabajar, no la forma, y una fila que nunca se marca para quien no
    usa check-ins es peor que no tenerla. Está en el catálogo, a un clic.
  */
  steps: ['form', 'gymPhotos', 'onboarding', 'postureReview'],
  custom: [],
  done: [],
  links: {},
  files: {},
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

/**
 * Una ruta de Storage escrita por la aplicación, no por una persona.
 *
 * Se comprueba de todas formas porque llega desde `preferences`, que es una
 * columna que el propio entrenador puede escribir con la API: sin esto, ahí
 * cabría `../` o una ruta de otro cliente. Pedir que empiece por la carpeta del
 * alta es barato y deja fuera todo lo que no sea lo que escribe `buildIntakePath`.
 *
 * Quién puede leer el archivo lo decide Storage, no esto (0007). Esta
 * comprobación evita guardar basura, no un acceso indebido.
 */
export const safeFilePath = (raw) => {
  const text = String(raw || '').trim().slice(0, MAX_LINK);
  return /^[0-9a-f-]{36}\/intake\/[A-Za-z0-9._-]+$/i.test(text) ? text : null;
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

  /* Un paso entrega una cosa: si por lo que sea llegaran las dos —dos pestañas
     guardando a la vez, un plan tocado a mano— manda el archivo, que es el que
     está subido y por tanto el que alguien se molestó en poner. */
  const files = {};
  if (raw.files && typeof raw.files === 'object') {
    for (const id of steps) {
      const file = safeFilePath(raw.files[id]);
      if (file) {
        files[id] = file;
        delete links[id];
      }
    }
  }

  return { steps, custom, done, links, files };
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
export const stepDone = (step, client, intake, estado) => {
  /*
    Tres orígenes distintos, y quien pregunta no tiene que saber cuál es cuál:

      · `auto`   → lo sabe la aplicación. No hay casilla que marcar: o están las
                   respuestas, o están las fotos, o está el check-in.
      · `column` → los dos pasos viejos, que viven en su columna de `clients`.
      · el resto → una casilla en las preferencias.

    `estado` puede no llegar —lo pintan varias pantallas y no todas tienen a mano
    las tres cosas—, y entonces un paso automático se lee como NO hecho. Es el
    lado seguro: decir que falta algo que está hecho se corrige mirándolo; decir
    que está hecho algo que falta es lo que hace que nadie lo reclame.
  */
  if (step.auto) return Boolean(estado?.[step.auto]);
  if (step.column) return Boolean(client?.[step.column]);
  return intake.done.includes(step.id);
};

/** Los pasos que hace el CLIENTE. Es lo que se le pinta en su portal. */
export const clientSteps = (intake) => intakeSteps(intake).filter((s) => s.owner === 'client');

/** El enlace de un paso, ya saneado, o null. */
export const stepLink = (intake, id) => intake.links[id] || null;

/** El archivo subido de un paso: su RUTA en Storage, que hay que firmar. */
export const stepFile = (intake, id) => intake.files?.[id] || null;

/** Si el paso entrega algo, sea de la forma que sea. */
export const stepHasContent = (intake, id) => Boolean(stepLink(intake, id) || stepFile(intake, id));

/** Cuánto queda del alta. `total` 0 significa que el entrenador no pide nada. */
export const intakeProgress = (client, intake, estado) => {
  const steps = intakeSteps(intake);
  const done = steps.filter((step) => stepDone(step, client, intake, estado)).length;
  return { done, total: steps.length, complete: done === steps.length };
};

/**
 * Lo que el cliente puede abrir: pasos con contenido, venga de donde venga.
 *
 * `url` es una dirección de fuera lista para pinchar; `path` es un archivo del
 * bucket privado y **hay que firmarlo** antes de poder abrirlo. Van en la misma
 * lista y no en dos porque para quien lo lee son lo mismo —«lo que me dejó
 * preparado»— y separarlos obligaría a la pantalla a pintar dos secciones que
 * dicen lo mismo.
 */
export const intakeDeliverables = (intake) =>
  intakeSteps(intake)
    .filter((step) => stepHasContent(intake, step.id))
    .map((step) => ({
      ...step,
      url: stepLink(intake, step.id),
      path: stepFile(intake, step.id),
    }));

// ── Escribir ───────────────────────────────────────────────────────────────
//
// Todas devuelven un alta NUEVA y no tocan la que reciben: quien llama decide
// cuándo guardarla, y el estado de React no se puede mutar en el sitio.

/** Enciende o apaga un paso. Al apagarlo se lleva su contenido y su marca. */
export const toggleStep = (intake, id) => {
  if (!stepById(intake, id)) return intake;
  if (!intake.steps.includes(id)) return { ...intake, steps: [...intake.steps, id] };

  const links = { ...intake.links };
  const files = { ...intake.files };
  delete links[id];
  /* Se olvida la referencia, no se borra el objeto de Storage: quitar un paso es
     reversible y volver a encenderlo con el archivo perdido sería peor. Los
     huérfanos los limpia el borrado del cliente, que ya vacía su carpeta. */
  delete files[id];
  return {
    ...intake,
    steps: intake.steps.filter((s) => s !== id),
    done: intake.done.filter((s) => s !== id),
    links,
    files,
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
  const files = { ...intake.files };
  delete links[id];
  delete files[id];
  return {
    ...intake,
    custom: intake.custom.filter((s) => s.id !== id),
    steps: intake.steps.filter((s) => s !== id),
    done: intake.done.filter((s) => s !== id),
    links,
    files,
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

/**
 * Pega o quita el ENLACE de un paso. Un enlace que no vale se trata como quitarlo.
 *
 * Poner uno retira el archivo que hubiera: el paso entrega una cosa, y la que
 * vale es la última que se puso.
 */
export const setStepLink = (intake, id, url) => {
  const link = safeLink(url);
  const links = { ...intake.links };
  const files = { ...intake.files };
  if (link) {
    links[id] = link;
    delete files[id];
  } else {
    delete links[id];
  }
  return { ...intake, links, files };
};

/** Y lo mismo con el ARCHIVO subido, que se guarda por su ruta en el bucket. */
export const setStepFile = (intake, id, path) => {
  const file = safeFilePath(path);
  const links = { ...intake.links };
  const files = { ...intake.files };
  if (file) {
    files[id] = file;
    delete links[id];
  } else {
    delete files[id];
  }
  return { ...intake, links, files };
};

/**
 * Lo que se guarda en `preferences.intake`.
 *
 * Se escriben las CINCO claves siempre, aunque vayan vacías, porque
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
  files: intake.files || {},
});
