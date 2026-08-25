/**
 * El perfil: lo que el cliente cuenta y el entrenador registra.
 *
 * ══ Qué es y qué NO es ══════════════════════════════════════════════════════
 *
 * Es el REGISTRO de la persona: los hechos cortos que condicionan el plan y que
 * hasta ahora vivían en un cuestionario de Word que se lee una vez y se archiva.
 * Cuándo puede entrenar, dónde entrena y con qué máquinas, cuántas comidas hace
 * y a qué hora, cuánto duerme, qué otro deporte practica.
 *
 * **Ninguno decide nada solo.** Los lee el entrenador para montar el onboarding,
 * el análisis postural, la rutina y la dieta. Esa es la diferencia entre esto y
 * `conditions.js`, que sí sale por su cuenta en dos pantallas: un condicionante
 * AVISA, un dato del perfil se CONSULTA.
 *
 * ══ Lo que NO cabe aquí, y es la regla que ordena la ficha entera ══════════
 *
 * Nada que EVOLUCIONE:
 *
 *   · El peso es una serie (`anthropometry`), y ya costó una columna: la 0048
 *     tuvo que borrar `current_weight` por enseñar el valor congelado del día
 *     que alguien dejó de rellenarlo.
 *   · Las lesiones son varias, tienen fechas y se resuelven: son la 0077.
 *   · La historia larga —doce meses de peso, la dieta al decimal, la rutina
 *     entera— no se trocea en campos. Se queda en el PDF que cuelga del paso
 *     «Anamnesis» del alta, y sus dos partes importables ya tienen importador.
 *
 * Aquí va lo que es verdad hoy y sigue siéndolo dentro de seis meses.
 *
 * ══ Por qué un catálogo y no veinte propiedades sueltas ════════════════════
 *
 * Porque la pantalla se dibuja SOLA a partir de esta lista. Añadir un campo es
 * añadir una entrada aquí: ni un componente, ni una columna, ni una migración.
 * Es la misma decisión que toma `preferences.js` con los widgets del panel.
 *
 * Y porque el día que el entrenador defina los suyos, sus campos entran por el
 * mismo sitio con la misma forma. El nivel 1 —esto— y el nivel 2 —los suyos—
 * comparten catálogo, saneado y pintado.
 *
 * ── Dónde se guarda ────────────────────────────────────────────────────────
 * En `clients.profile` (migración 0078), una columna propia y no dentro de
 * `preferences`: esa la escribe el propio cliente por RPC y tiene un tope de
 * 8 KB compartido entre otros cuatro sistemas.
 */

import { toNum } from '@/lib/num';
/* El mismo filtro de enlaces que usan los pasos del alta. Dos comprobaciones de
   'esto es una URL segura' es una de más. */
import { safeLink } from './intake';

/**
 * Las dos tandas. El orden es el de la ficha.
 *
 * ══ Por qué DOS y no tres ══════════════════════════════════════════════════
 *
 * La primera versión tenía una tercera, «Su día», con la ocupación, el sueño,
 * los pasos y cómo pasa la jornada. Se retiró por dos motivos que apuntan al
 * mismo sitio:
 *
 *   · **No es un asunto, es contexto de los otros dos.** Cuántas horas duerme no
 *     se mira por sí mismo: se mira decidiendo cuánto volumen aguanta. Los pasos
 *     no se miran por sí mismos: se miran cuadrando su gasto. Cada uno de los
 *     cuatro tenía un dueño claro y ninguno se lo estaba quedando.
 *   · **Tres bloques dejan un hueco.** La rejilla de la ficha es de dos
 *     columnas, así que el tercero se queda solo en su fila con medio ancho
 *     vacío al lado — que es lo mismo que `docs/producto.md` §5.4 prohíbe para
 *     las filas de métricas, y por el mismo motivo: el ojo lo lee como un error.
 *
 * Con dos, la ficha tiene una fila limpia y cada dato está donde se consulta.
 */
export const PROFILE_GROUPS = [
  {
    id: 'training',
    label: 'Cómo entrena',
    sub: 'Con qué cuentas al montarle el programa.',
  },
  {
    id: 'nutrition',
    label: 'Cómo come',
    sub: 'Su día a día con la comida, antes de tocarle nada.',
  },
];

export const groupById = (id) => PROFILE_GROUPS.find((g) => g.id === id) || null;

const EXPERIENCE = [
  { id: 'novice', label: 'Menos de 1 año' },
  { id: 'inter', label: '1 a 3 años' },
  { id: 'adv', label: '3 a 5 años' },
  { id: 'expert', label: 'Más de 5 años' },
];

const ACTIVITY = [
  { id: 'desk', label: 'Sentado' },
  { id: 'standing', label: 'De pie' },
  { id: 'physical', label: 'Trabajo físico' },
];

/**
 * El catálogo.
 *
 * Sale de un cuestionario de alta REAL, no de una lista bonita: cada campo es
 * una pregunta que un entrenador hace de verdad antes de escribir la primera
 * serie. El único que no estaba en ese cuestionario es la suplementación, y está
 * porque su ausencia hace daño — pautar creatina a quien ya la toma es un error
 * que solo se ve preguntando.
 *
 * `kind` decide cómo se pinta y cómo se sanea:
 *   text   → una línea. Lo largo va al PDF de la anamnesis, no aquí.
 *   number → una cifra, con su unidad al lado.
 *   choice → una de las opciones declaradas, y ninguna otra.
 *   yesno  → sí, no, o sin contestar. Los tres son estados distintos.
 *   link   → una dirección que se abre. Se guarda solo si es `https://`.
 */
export const PROFILE_FIELDS = [
  // ── Cómo entrena ────────────────────────────────────────────────────────
  { id: 'experience', group: 'training', label: 'Experiencia', kind: 'choice', options: EXPERIENCE },
  {
    id: 'coachedBefore',
    group: 'training',
    label: '¿Ha tenido entrenador?',
    kind: 'yesno',
    hint: 'Cambia cuánto hay que explicarle, no lo que se le pone.',
  },
  {
    /*
      Los días que PUEDE, que no son los que se le programan. Esos viven en
      `cycle_pattern` y los decides tú. Aquí queda lo que él dijo que tenía, que
      es contra lo que se contrasta cuando la adherencia empieza a fallar.
    */
    id: 'daysAvailable',
    group: 'training',
    label: 'Días que puede entrenar',
    kind: 'number',
    unit: 'días',
    hint: 'Lo que él dice que tiene. Lo que le programas va en su rutina.',
  },
  {
    id: 'sessionMinutes',
    group: 'training',
    label: 'Duración de la sesión',
    kind: 'number',
    unit: 'min',
  },
  {
    id: 'trainingWindow',
    group: 'training',
    label: 'A qué hora puede',
    kind: 'text',
    placeholder: '6:00–7:45, o después de las 20:00',
  },
  {
    id: 'equipment',
    group: 'training',
    label: 'Material propio',
    kind: 'text',
    placeholder: 'Straps, cincha, tobilleras',
  },
  {
    id: 'otherSport',
    group: 'training',
    label: 'Otro deporte',
    kind: 'text',
    placeholder: 'Tenis, domingos por la mañana, 90 min',
    hint: 'Ocupa un día y se cobra en la recuperación, aunque no lo programes tú.',
  },
  {
    /* Va con el entrenamiento y no con la comida porque lo que decide es CUÁNDO
       puede: un horario de 9:30 a 14:30 y una preferencia de entrenar a las 6:00
       son la misma pregunta contestada por los dos lados. */
    id: 'occupation',
    group: 'training',
    label: 'Estudia o trabaja',
    kind: 'text',
    placeholder: 'Universidad, 9:30 a 14:30',
  },
  {
    /* Y el sueño también: es el techo de lo que se puede recuperar, así que se
       mira decidiendo volumen y frecuencia, no contando calorías. */
    id: 'sleepHours',
    group: 'training',
    label: 'Duerme',
    kind: 'number',
    unit: 'h',
    hint: 'El techo de lo que puede recuperar. Se mira antes de subirle el volumen.',
  },

  // ── Cómo come ───────────────────────────────────────────────────────────
  {
    id: 'mealsPerDay',
    group: 'nutrition',
    label: 'Comidas al día',
    kind: 'number',
    unit: 'comidas',
  },
  {
    id: 'mealTimes',
    group: 'nutrition',
    label: 'A qué horas come',
    kind: 'text',
    placeholder: '7:30 · 14:45 · 23:15',
  },
  {
    id: 'eatsOut',
    group: 'nutrition',
    label: 'Come fuera',
    kind: 'text',
    placeholder: 'Una o dos veces al mes; en vacaciones a diario',
  },
  { id: 'likes', group: 'nutrition', label: 'Le gusta', kind: 'text', placeholder: 'Toda la fruta' },
  {
    id: 'dislikes',
    group: 'nutrition',
    label: 'No le gusta',
    kind: 'text',
    hint: 'Distinto de una intolerancia: eso va en Condicionantes.',
  },
  {
    id: 'supplements',
    group: 'nutrition',
    label: 'Suplementación',
    kind: 'text',
    placeholder: 'Creatina 5 g, vitamina D',
  },
  { id: 'alcoholTobacco', group: 'nutrition', label: 'Alcohol y tabaco', kind: 'text' },
  {
    /* Con la comida y no con el entrenamiento: lo que decide es el GASTO. Ocho
       horas de pie y ocho sentado no comen lo mismo aunque entrenen igual. */
    id: 'activityLevel',
    group: 'nutrition',
    label: 'Cómo pasa el día',
    kind: 'choice',
    options: ACTIVITY,
    hint: 'Ocho horas de pie y ocho sentado no gastan lo mismo.',
  },
  {
    /*
      Los pasos que da HOY, que no son el objetivo. El objetivo vive en
      `nutrition_plans.steps_goal` y lo pones tú; esto es la línea de partida
      contra la que se decide si pedirle más tiene sentido.
    */
    id: 'dailySteps',
    group: 'nutrition',
    label: 'Pasos al día',
    kind: 'number',
    unit: 'pasos',
    hint: 'Los que da ahora. Su objetivo se pone en la nutrición.',
  },
];

/**
 * Lo que apunta el ENTRENADOR sobre este cliente, y que NO es una pregunta.
 *
 * ══ Por qué es un catálogo aparte y no una marca dentro del otro ═══════════
 *
 * Porque `PROFILE_FIELDS` no es «las claves que caben en la columna»: es **la
 * lista de lo que se le puede preguntar a una persona sobre sí misma**. De ahí
 * salen tres cosas a la vez —los bloques de la ficha, el catálogo de preguntas
 * del cuestionario y el formulario que ve el cliente— y todas dan por hecho eso.
 *
 * La carpeta de Drive estuvo dentro y se notó enseguida: aparecía como una
 * pregunta que el entrenador podía encender, y encendida le pedía a un cliente
 * que pegara un enlace a una carpeta que no es suya. No es un dato de la
 * persona: es una decisión de cómo trabaja su entrenador.
 *
 * Una marca `coachOnly` dentro del otro catálogo lo habría arreglado a medias:
 * habría que acordarse de filtrarla en los tres sitios, y el que se olvidara
 * volvería a preguntarlo. Separadas, la pregunta no existe.
 *
 * Se guardan en la MISMA columna (`clients.profile`) porque son del mismo
 * cliente y se leen a la vez; lo que cambia es quién las escribe y dónde salen.
 */
export const COACH_FIELDS = [
  {
    /*
      La carpeta de fuera, para quien ya la tenga montada.

      El flujo anterior a todo esto era: pedirle fotos al cliente, subirlas a
      Drive y montar la rutina mirándolas en otra pestaña. La aplicación ofrece
      traerlas dentro y NO exige moverlas — pegando aquí el enlace, esa carpeta
      se abre desde la ficha y desde la rutina.

      Es texto y no una conexión con Drive: eso sería OAuth, permisos sobre las
      carpetas de alguien y una integración entera (ver `domain/integrations.js`
      para lo que cuesta una). Un enlace pegado hace el 90 % del trabajo hoy.
    */
    id: 'gymFolder',
    label: 'Carpeta de sus fotos',
    kind: 'link',
    placeholder: 'https://drive.google.com/…',
    hint: 'Si las tienes en Drive o similar. Se abre desde aquí y desde su rutina.',
  },
];

/* Todas las claves que caben en la columna. NO se usa para pintar ni para
   preguntar: solo para sanear lo que llega y para traducir un valor a texto. */
const ALL_FIELDS = [...PROFILE_FIELDS, ...COACH_FIELDS];

/** Un campo, sea pregunta o ajuste del entrenador. */
export const fieldById = (id) => ALL_FIELDS.find((f) => f.id === id) || null;

/** Los de una tanda de la ficha. Solo preguntas: los ajustes salen en su sitio. */
export const fieldsOf = (group) => PROFILE_FIELDS.filter((f) => f.group === group);

/** Una línea es una línea. Lo que no cabe aquí va al PDF de la anamnesis. */
export const MAX_FIELD = 160;

/**
 * Lo guardado, saneado contra el catálogo.
 *
 * Las claves que no conoce se DESCARTAN, igual que hacen `clientProtocol` y
 * `dashboardPrefs`. Eso es lo que permite añadir campos mañana sin migrar y
 * retirarlos sin que queden restos pintándose en la ficha de alguien.
 *
 * Un valor vacío NO se guarda, en vez de guardarse como cadena vacía. La
 * diferencia importa: es lo que hace que borrar el contenido de un campo lo
 * quite de la ficha en lugar de dejar una fila con la etiqueta y nada al lado.
 * Misma decisión que `compact` en `anthropometry.js`.
 */
export const cleanProfile = (raw) => {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;

  for (const field of ALL_FIELDS) {
    const valor = raw[field.id];
    if (valor === null || valor === undefined || valor === '') continue;

    if (field.kind === 'number') {
      const n = toNum(valor);
      /* Ni negativos ni cero. «Duerme 0 horas» o «0 comidas al día» no son
         respuestas a estas preguntas: son un dedo en el teclado, y guardarlos
         los convertiría en un dato que alguien puede llegar a creerse. */
      if (n !== null && n > 0) out[field.id] = n;
      continue;
    }

    if (field.kind === 'yesno') {
      /* Las cadenas llegan del `<select>`, que no sabe de booleanos. Lo que no
         sea ninguna de las dos se descarta y queda «sin contestar», que es un
         tercer estado y no un «no». */
      if (typeof valor === 'boolean') out[field.id] = valor;
      else if (valor === 'true' || valor === 'false') out[field.id] = valor === 'true';
      continue;
    }

    if (field.kind === 'choice') {
      if (field.options.some((o) => o.id === valor)) out[field.id] = valor;
      continue;
    }

    if (field.kind === 'link') {
      /*
        El mismo filtro que los enlaces del alta (`safeLink`), y por el mismo
        motivo: lo que se guarde aquí acaba en el `href` de un enlace, y un
        `javascript:` o un `data:` ahí es una ejecución en la sesión de quien lo
        pulse. Se exige `https://` y no se intenta arreglar lo que no lo sea —
        adivinar un esquema es cómo se cuela lo que se quería filtrar.
      */
      const url = String(valor).trim().slice(0, MAX_FIELD);
      if (safeLink(url)) out[field.id] = url;
      continue;
    }

    const texto = String(valor).trim().slice(0, MAX_FIELD);
    if (texto) out[field.id] = texto;
  }

  /*
    ══ Las respuestas a las preguntas PROPIAS del entrenador ══════════════════

    Van anidadas en `custom` y no sueltas al lado de las del catálogo, por una
    razón concreta: esta función DESCARTA lo que no reconoce, y eso es lo que
    permite retirar un campo mañana sin que queden restos pintándose. Una
    pregunta propia tiene un id que este módulo no puede conocer —lo inventa el
    entrenador al crearla—, así que sueltas se caerían todas.

    Dentro del sobre, en cambio, se pueden sanear sin saber qué son: claves
    cortas, valores cortos, y un tope de cuántas caben. Quién las etiqueta es
    otro asunto y vive en `intakeForm.js`, que es donde están sus nombres.
  */
  const propias = raw.custom;
  if (propias && typeof propias === 'object' && !Array.isArray(propias)) {
    const sobre = {};
    for (const [id, valor] of Object.entries(propias).slice(0, MAX_CUSTOM_ANSWERS)) {
      if (valor === null || valor === undefined || valor === '') continue;
      if (typeof valor === 'boolean') {
        sobre[String(id).slice(0, 40)] = valor;
        continue;
      }
      const texto = String(valor).trim().slice(0, MAX_FIELD);
      if (texto) sobre[String(id).slice(0, 40)] = texto;
    }
    if (Object.keys(sobre).length > 0) out.custom = sobre;
  }

  return out;
};

/** Tope de respuestas propias guardadas. El de preguntas vive en `intakeForm`. */
export const MAX_CUSTOM_ANSWERS = 12;

/** Las respuestas a las preguntas propias, o un objeto vacío. */
export const customAnswers = (profile) =>
  profile?.custom && typeof profile.custom === 'object' ? profile.custom : {};

/**
 * Un valor, dicho como se lee.
 *
 * La conversión vive aquí y no en la pantalla porque la van a hacer dos —la
 * ficha lo pinta y la exportación lo escribirá— y dos redacciones del mismo dato
 * es cómo se acaba dudando de cuál es la buena.
 */
export const fieldText = (profile, id) => {
  const field = fieldById(id);
  const valor = profile?.[id];
  if (!field || valor === undefined || valor === null || valor === '') return null;

  if (field.kind === 'yesno') return valor ? 'Sí' : 'No';
  if (field.kind === 'choice') return field.options.find((o) => o.id === valor)?.label || null;
  if (field.kind === 'number') return field.unit ? `${valor} ${field.unit}` : String(valor);
  return String(valor);
};

/**
 * Las filas de un bloque: SOLO las que tienen valor.
 *
 * Es la regla de esta pantalla y la razón de que la ficha pueda crecer sin
 * volverse deprimente. Con diecinueve campos, pintar los huecos sería una
 * columna de «sin poner» en gris que nadie va a rellenar por leerla. El hueco se
 * ofrece una vez, en «Editar».
 */
export const profileRows = (profile, group) =>
  fieldsOf(group)
    .map((field) => ({ id: field.id, label: field.label, text: fieldText(profile, field.id) }))
    .filter((row) => row.text !== null);

/** Cuántos campos de un bloque están rellenos, para su chapa. */
export const filledCount = (profile, group) => profileRows(profile, group).length;

/**
 * ¿Está la ficha entera sin tocar?
 *
 * Lo usa la pantalla para decidir si enseña TRES estados vacíos seguidos o uno
 * solo que explique de qué van los tres. Tres tarjetas diciendo «no has puesto
 * nada» una detrás de otra son la peor primera impresión posible de un cliente
 * recién dado de alta.
 */
export const isProfileEmpty = (profile) =>
  PROFILE_GROUPS.every((g) => filledCount(profile, g.id) === 0);
