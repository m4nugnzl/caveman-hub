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
    area: 'training',
    label: 'Calentamiento y movilidad',
    hint: 'Una lista de ejercicios previos, con su vídeo y tus indicaciones, delante de cada sesión.',
  },
  {
    id: 'coachNote',
    area: 'training',
    label: 'Tu nota en cada sesión',
    hint: 'Puedes dejar una indicación en un día concreto. El cliente la ve al abrirlo.',
  },
  {
    id: 'clientNote',
    area: 'training',
    label: 'Logbook del cliente',
    hint: 'Un espacio propio donde tu cliente apunta lo que quiera de cada sesión. Tú lo lees.',
  },
  {
    id: 'sessionFeedback',
    area: 'training',
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
    area: 'training',
    label: 'RIR objetivo por serie',
    hint: 'Programas cuántas repeticiones debe dejarse en cada serie, y ves lo que anotó frente a lo que le pediste.',
  },
  {
    /*
      Como el RIR: una forma de pautar, no la forma. Hay quien quiere que su
      cliente cambie el plátano por fresas sin preguntar, y quien prescribe
      cerrado y no ofrece margen. Encendido, cada alimento del menú lleva su
      lista de intercambios («150 g de plátano ≈ 250 g de manzana») calculada
      sobre el macro de su grupo — y el entrenador puede quitársela a alimentos
      concretos desde la propia dieta.
    */
    id: 'dietSwaps',
    area: 'nutrition',
    label: 'Equivalencias en la dieta',
    hint: 'Tu cliente ve con qué puede cambiar cada alimento del menú sin descuadrar el macro de su grupo.',
  },
];

export const moduleById = (id) => MODULES.find((m) => m.id === id) || null;

/**
 * Los módulos de UNA parte del producto. Es lo que usan los interruptores «a
 * mano» —los de la pantalla donde el módulo se echa en falta—: la rutina ofrece
 * los de entrenamiento y la dieta los de nutrición, mientras que Ajustes →
 * Protocolo sigue enseñando la lista entera.
 */
export const modulesFor = (area) => MODULES.filter((m) => m.area === area);

// ── Qué le llevas a esta persona ───────────────────────────────────────────

/**
 * Entrenamiento, nutrición, o las dos cosas.
 *
 * ══ Por qué NO son dos módulos más de la lista de arriba ════════════════════
 *
 * Sería lo cómodo y rompería a todo el mundo. `clientProtocol` SANEA los módulos
 * guardados contra el catálogo, así que un cliente configurado hoy tiene
 * `modules: ['coachNote','clientNote','sessionFeedback']` y nada más. Añadir
 * `training` y `nutrition` al catálogo haría que ese cliente —y todos los demás—
 * apareciera de golpe sin las dos secciones principales de la aplicación.
 *
 * Y además no son la misma clase de cosa. Un módulo es una PIEZA dentro de una
 * sección (el calentamiento, la nota del día); esto es si la sección existe. La
 * diferencia se nota en el valor por defecto: los módulos nacen apagados —una
 * aplicación que llega con todo encendido obliga a apagar— y esto nace
 * ENCENDIDO, porque quitarle a alguien la mitad del producto no puede ser lo que
 * pasa cuando nadie ha dicho nada.
 *
 * ── La regla de siempre ─────────────────────────────────────────────────────
 * Lo que no está configurado son las dos. Es lo que hacía la aplicación antes de
 * que esto se pudiera elegir, así que quien no toque nada no puede notar el
 * cambio — ni él ni sus clientes.
 */
export const SERVICES = [
  {
    id: 'training',
    label: 'Entrenamiento',
    hint: 'Su programa, sus sesiones y todo lo que cuelga de ellas.',
  },
  {
    id: 'nutrition',
    label: 'Nutrición',
    hint: 'Su objetivo de kcal y macros, el menú cerrado y tus pautas.',
  },
];

const SERVICE_IDS = SERVICES.map((s) => s.id);

export const defaultServices = () => ({ training: true, nutrition: true });

/**
 * Lo guardado, completado y acotado.
 *
 * Los dos apagados vuelven a los dos encendidos: es un estado que la pantalla no
 * deja producir, y un cliente sin entrenamiento y sin nutrición no tiene
 * aplicación —solo le quedarían pantallas que hablan de un trabajo que no
 * existe—. Si llega desde una columna jsonb escrita a mano, se corrige aquí
 * antes de que nadie se quede mirando un portal vacío.
 */
const sanitizeServices = (raw) => {
  const out = {};
  for (const id of SERVICE_IDS) out[id] = raw?.[id] === undefined ? true : Boolean(raw[id]);
  return SERVICE_IDS.some((id) => out[id]) ? out : defaultServices();
};

// ── Lo que se mide en el check-in ──────────────────────────────────────────

/**
 * Pliegues y perímetros: **tres estados, no un interruptor**.
 *
 * ══ Por qué tres y no dos ═══════════════════════════════════════════════════
 *
 * Estaban clavados como «opcional» para todo el mundo: plegados detrás de un
 * botón que dice «(opcional)». Eso deja fuera a los dos extremos, que son
 * justamente las dos formas de trabajar de verdad:
 *
 *   · Quien mide de verdad —el que hace antropometría cada cuatro semanas— no
 *     tiene forma de PEDIRLO. Su cliente cierra el check-in con el peso y se le
 *     olvidan los pliegues, y el entrenador se entera al ir a mirarlos.
 *   · Quien no mide nunca —la mayoría del entrenamiento online— tiene a su
 *     cliente mirando un botón de seis pliegues cutáneos que no va a usar jamás,
 *     con el plicómetro que no tiene.
 *
 * Un interruptor de dos posiciones solo resuelve al segundo. El tercer estado es
 * el que convierte esto en una decisión del entrenador en lugar de una opinión de
 * la aplicación.
 *
 * ── Y por qué por BLOQUE y no uno para los dos ──────────────────────────────
 * Porque no cuestan lo mismo. Un perímetro se mide con una cinta de tres euros y
 * lo puede tomar cualquiera en su casa; un pliegue necesita plicómetro, práctica
 * y que lo tome siempre la misma mano. Pedir perímetros cada semana y pliegues
 * nunca es una configuración normal — y con un solo interruptor era imposible.
 */
export const CHECKIN_BLOCKS = [
  {
    id: 'perimeters',
    label: 'Perímetros corporales',
    hint: 'Cintura, cadera, brazo… Se miden con una cinta métrica.',
  },
  {
    id: 'folds',
    label: 'Pliegues cutáneos',
    hint: 'Los seis pliegues del % graso. Hace falta plicómetro y buena mano.',
  },
];

/**
 * Los tres estados.
 *
 * `required` no es «recordárselo»: es que el check-in **no se cierra** sin ese
 * bloque relleno. Un obligatorio que se puede saltar es un opcional con más
 * texto.
 */
export const CHECKIN_MODES = [
  { id: 'required', label: 'Obligatorio', hint: 'No podrá cerrar el check-in sin rellenarlo.' },
  { id: 'optional', label: 'Opcional', hint: 'Lo tiene a mano, plegado, y lo rellena si quiere.' },
  { id: 'off', label: 'Apagado', hint: 'No le aparece. Ni a ti al revisar su check-in.' },
];

const CHECKIN_MODE_IDS = CHECKIN_MODES.map((m) => m.id);

/**
 * Lo de siempre: los dos a mano y ninguno obligatorio.
 *
 * Es exactamente lo que hacía la aplicación antes de que esto se pudiera
 * configurar, y por eso es el valor por defecto: quien no toque nada no puede
 * notar el cambio.
 */
export const defaultCheckin = () => ({ perimeters: 'optional', folds: 'optional' });

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

/* ==========================================================================
   El cuestionario del check-in
   --------------------------------------------------------------------------
   ══ Por qué un catálogo aparte y no las mismas preguntas ════════════════════

   Las de arriba se contestan **al terminar de entrenar**, de pie en el gimnasio
   y con el móvil en la mano: hablan de UNA sesión. «¿Cómo de duro ha sido?»,
   «¿te ha dolido algo?». Son preguntas de dos segundos sobre lo que acaba de
   pasar.

   Las de aquí se contestan **el domingo**, sentado, cerrando la semana. Hablan de
   siete días: si ha podido seguir la dieta, si ha pasado hambre, si ha dormido,
   si le sigue apeteciendo. Nada de eso tiene sentido preguntarlo al bajar de la
   prensa, y el RPE de una sesión concreta no significa nada como resumen de la
   semana.

   Mezclarlas en una lista obligaría a que cada pregunta llevara una marca de
   dónde se hace, y a que el entrenador la leyera en cada una para no poner
   «¿dónde te ha molestado?» en el check-in. Dos catálogos y dos listas: cada
   pantalla ofrece lo que se contesta en ella.

   ── Lo que sí se comparte ───────────────────────────────────────────────────
   La FORMA (`kind`, `min`, `max`, `lowerIsBetter`, `color`), que es lo que hace
   que `SessionFeedback` las pinte sin tocar una línea, y las preguntas PROPIAS
   del entrenador: las suyas valen para las dos listas, porque las escribió él
   sabiendo para qué.
   ========================================================================== */

/**
 * Lo que se pregunta al cerrar una semana.
 *
 * Salen de lo que de verdad decide un ajuste en una revisión. La adherencia va
 * primera porque es la que explica casi todos los resultados: un plan que no se
 * ha seguido no es un plan que no funciona, y sin preguntarlo las dos cosas se
 * parecen mucho desde fuera.
 *
 * `lowerIsBetter` en hambre y estrés: cuanto más bajo, mejor. Es lo que hace que
 * una subida se pinte como un problema y no como un logro.
 *
 * El hambre empieza en CERO como el dolor de las sesiones: «no he pasado nada»
 * es una respuesta real y frecuente, y forzar un mínimo de 1 ensuciaría la serie
 * con un uno que significa cero.
 */
export const CHECKIN_QUESTIONS = [
  {
    id: 'adherence',
    label: 'Adherencia a la dieta',
    short: 'Dieta',
    hint: 'De 1 (nada) a 10 (clavada toda la semana)',
    kind: 'scale',
    min: 1,
    max: 10,
    color: 'var(--data-lime)',
  },
  {
    id: 'hunger',
    label: 'Hambre',
    short: 'Hambre',
    hint: '0 si no has pasado nada',
    kind: 'scale',
    min: 0,
    max: 10,
    lowerIsBetter: true,
    color: 'var(--data-orange)',
  },
  {
    id: 'training_done',
    label: 'Entrenamientos que has completado',
    short: 'Entrenos',
    hint: 'Cuántos de los que tocaban',
    kind: 'scale',
    min: 0,
    max: 10,
    color: 'var(--data-violet)',
  },
  {
    id: 'week_sleep',
    label: 'Cómo has dormido esta semana',
    short: 'Sueño',
    kind: 'scale',
    min: 1,
    max: 10,
    color: 'var(--data-blue)',
  },
  {
    id: 'week_energy',
    label: 'Energía durante el día',
    short: 'Energía',
    kind: 'scale',
    min: 1,
    max: 10,
    color: 'var(--data-teal)',
  },
  {
    id: 'week_stress',
    label: 'Estrés de la semana',
    short: 'Estrés',
    hint: 'Trabajo, familia, lo que sea',
    kind: 'scale',
    min: 1,
    max: 10,
    lowerIsBetter: true,
    color: 'var(--data-pink)',
  },
  {
    id: 'digestion',
    label: 'Digestiones',
    short: 'Digestión',
    kind: 'scale',
    min: 1,
    max: 10,
    color: 'var(--data-amber)',
  },
  {
    id: 'motivation',
    label: 'Ganas de seguir',
    short: 'Ganas',
    kind: 'scale',
    min: 1,
    max: 10,
    color: 'var(--data-slate)',
  },
  {
    id: 'obstacles',
    label: '¿Qué se te ha hecho más cuesta arriba?',
    short: 'Obstáculos',
    kind: 'text',
  },
  {
    id: 'week_note',
    label: 'Algo que quieras contarme de esta semana',
    short: 'Nota',
    kind: 'text',
  },
];

/** Todas las preguntas de catálogo, de los dos sitios. Para el saneado. */
const CATALOGO = [...SESSION_QUESTIONS, ...CHECKIN_QUESTIONS];

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
    protocol: { modules: [], questions: [], checkinQuestions: [] },
  },
  {
    id: 'basic',
    label: 'Lo básico',
    hint: 'Tus notas, el logbook del cliente, cómo fue la sesión y cómo fue la semana',
    protocol: {
      modules: ['coachNote', 'clientNote', 'sessionFeedback'],
      questions: ['rpe', 'note'],
      /* Dos preguntas y ninguna más. La adherencia explica casi todos los
         resultados, y la nota abierta recoge lo que no cabe en una escala. Con
         seis, la entrega semanal se abandona a la tercera. */
      checkinQuestions: ['adherence', 'week_note'],
    },
  },
  {
    id: 'performance',
    label: 'Rendimiento',
    hint: 'Para atletas: carga, fatiga acumulada y descanso',
    protocol: {
      modules: ['warmup', 'coachNote', 'clientNote', 'sessionFeedback'],
      questions: ['rpe', 'fatigue', 'soreness', 'sleep', 'note'],
      checkinQuestions: ['training_done', 'week_sleep', 'week_stress', 'motivation', 'week_note'],
    },
  },
  {
    id: 'clinical',
    label: 'Con seguimiento del dolor',
    hint: 'Para readaptación o clientes con molestias: dolor, zona y sensaciones',
    protocol: {
      modules: ['warmup', 'coachNote', 'clientNote', 'sessionFeedback'],
      questions: ['pain', 'painZone', 'rpe', 'mood', 'note'],
      checkinQuestions: ['week_sleep', 'week_energy', 'obstacles', 'week_note'],
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
  /* Las dos cosas, que es lo que hacía la aplicación cuando esto no se podía
     elegir. Ver `SERVICES`. */
  services: defaultServices(),
  modules: ['coachNote', 'clientNote', 'sessionFeedback'],
  questions: ['rpe', 'note'],
  /*
    ── Y el cuestionario de la semana, por defecto vacío ─────────────────────
    Sin interruptor propio: **la lista vacía ES el apagado**. Es la misma regla
    que sostiene el resto del producto —lo que no está configurado no existe— y
    ahorra un módulo más que encender antes de poder elegir preguntas.

    Vacío y no con dos preguntas de cortesía porque este paso alarga la entrega
    del cliente, que es el gesto que más cuesta que se haga cada semana. Lo
    añade quien lo quiere.
  */
  checkinQuestions: [],
  custom: [],
  checkin: defaultCheckin(),
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
    // Un id que choque con una pregunta de catálogo rompería `questionById`, que
    // resuelve primero el catálogo: la propia quedaría inalcanzable y el
    // entrenador vería la de serie en su sitio sin entender por qué. Se
    // comprueban LOS DOS catálogos —sesión y check-in—: con uno solo, una
    // pregunta propia llamada `hunger` sería invisible en el cuestionario.
    if (!id || !label || CATALOGO.some((q) => q.id === id)) continue;
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
  const customIds = custom.map((q) => q.id);
  /* Cada lista solo acepta ids de SU catálogo, más los propios del entrenador.
     Sin esto, `rpe` colado en el cuestionario del check-in pediría el esfuerzo
     de «la sesión» el domingo, cuando no hay ninguna sesión de la que hablar. */
  const deSesion = new Set([...SESSION_QUESTIONS.map((q) => q.id), ...customIds]);
  const deCheckin = new Set([...CHECKIN_QUESTIONS.map((q) => q.id), ...customIds]);
  const moduleIds = new Set(MODULES.map((m) => m.id));

  const dedupe = (list, valid, fallback) => {
    if (!Array.isArray(list)) return fallback;
    const out = [];
    for (const id of list) {
      if (valid.has(id) && !out.includes(id)) out.push(id);
    }
    return out;
  };

  /* Bloque a bloque y con el de siempre como respaldo: así un estado escrito a
     mano que no exista —o una clave que se retire en el futuro— vuelve a
     «opcional», que es lo que la aplicación hacía antes de poder configurarlo, en
     vez de apagarle a alguien un bloque sin haberlo pedido. */
  const porDefecto = defaultCheckin();
  const checkin = {};
  for (const { id } of CHECKIN_BLOCKS) {
    const modo = raw.checkin?.[id];
    checkin[id] = CHECKIN_MODE_IDS.includes(modo) ? modo : porDefecto[id];
  }

  return {
    services: sanitizeServices(raw.services),
    modules: dedupe(raw.modules, moduleIds, defaultProtocol().modules),
    questions: dedupe(raw.questions, deSesion, defaultProtocol().questions),
    /* Respaldo a lista VACÍA y no a la de por defecto —que también lo es—: aquí
       «no configurado» y «configurado sin ninguna» significan lo mismo, que es
       que no hay cuestionario. */
    checkinQuestions: dedupe(raw.checkinQuestions, deCheckin, []),
    custom,
    checkin,
  };
};

// ── Lectura ────────────────────────────────────────────────────────────────

export const isModuleOn = (protocol, id) => Boolean(protocol?.modules?.includes(id));

/**
 * ¿Le llevas esto a esta persona?
 *
 * Ausente cuenta como SÍ. Quien pregunte por un protocolo a medio sanear —o por
 * uno guardado antes de que esto existiera— tiene que recibir el comportamiento
 * de siempre, no una sección que desaparece por un valor que nadie escribió.
 */
export const isServiceOn = (protocol, id) => protocol?.services?.[id] !== false;

/** Los servicios activos, para contarlos o nombrarlos. */
export const activeServices = (protocol) => SERVICES.filter((s) => isServiceOn(protocol, s.id));

/**
 * Enciende o apaga uno. **El último no se puede apagar**: sin ninguno de los dos
 * no queda aplicación que enseñar, así que el gesto no hace nada y la pantalla lo
 * dice desactivando el control (ver `ProtocolPanel`). Devolver el mismo objeto
 * —y no uno nuevo igual— es lo que deja a quien llama saber que no ha cambiado
 * nada, como en `toggleQuestion`.
 */
export const toggleService = (protocol, id) => {
  if (!SERVICE_IDS.includes(id)) return protocol;

  const services = {
    ...defaultServices(),
    ...protocol.services,
    [id]: !isServiceOn(protocol, id),
  };
  if (!SERVICE_IDS.some((k) => services[k])) return protocol;

  return { ...protocol, services };
};

/** Una pregunta por su id, sea de cualquiera de los dos catálogos o propia. */
export const questionById = (protocol, id) =>
  CATALOGO.find((q) => q.id === id) ||
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

/**
 * Las preguntas del check-in, resueltas y en su orden.
 *
 * Sin módulo que las gobierne: la lista vacía ya significa que no hay
 * cuestionario, y entonces el paso del asistente no existe —igual que no existe
 * el de medidas cuando el entrenador apagó pliegues y perímetros—.
 */
export const checkinQuestions = (protocol) =>
  (protocol?.checkinQuestions || []).map((id) => questionById(protocol, id)).filter(Boolean);

/** ¿Se le pregunta algo al cerrar la semana? */
export const asksCheckinQuestions = (protocol) => checkinQuestions(protocol).length > 0;

/**
 * Un resumen corto de lo contestado, para la cola de revisiones.
 *
 * ── Por qué solo las escalas y solo tres ────────────────────────────────────
 * Porque es una sub-línea de una fila de lista, no un informe: lo que tiene que
 * hacer es que la cola diga algo NUEVO antes de entrar. Tres cifras se leen de
 * un vistazo; las diez se leen igual de mal que no ponerlas.
 *
 * Las de texto se cuentan pero no se citan: una respuesta de cuatro líneas
 * cortada a treinta caracteres no informa, engaña sobre lo que pone.
 */
export const answersSummary = (protocol, answers) => {
  if (!answers || typeof answers !== 'object') return '';

  const dadas = checkinQuestions(protocol).filter(
    (q) => String(answers[q.id] ?? '').trim() !== ''
  );
  if (dadas.length === 0) return '';

  const escalas = dadas.filter((q) => q.kind === 'scale');
  const textos = dadas.length - escalas.length;

  const partes = escalas.slice(0, 3).map((q) => `${q.short || q.label} ${answers[q.id]}`);
  if (escalas.length > 3) partes.push(`+${escalas.length - 3}`);
  if (textos > 0) partes.push(textos === 1 ? '1 nota' : `${textos} notas`);

  return partes.join(' · ');
};

/**
 * En qué estado está un bloque del check-in. Siempre uno de los tres, nunca
 * `undefined`: quien pregunta se ahorra el respaldo, que es donde se coló el
 * fallo la última vez que un valor por defecto vivía en cada consumidor.
 */
export const checkinMode = (protocol, block) =>
  protocol?.checkin?.[block] || defaultCheckin()[block] || 'optional';

/** Si el bloque se le enseña al cliente. */
export const asksBlock = (protocol, block) => checkinMode(protocol, block) !== 'off';

/** Si además no puede cerrar el check-in sin él. */
export const requiresBlock = (protocol, block) => checkinMode(protocol, block) === 'required';

/** Los bloques que se piden, en el orden en el que se enseñan. */
export const checkinBlocks = (protocol) =>
  CHECKIN_BLOCKS.filter((b) => asksBlock(protocol, b.id));

/** Y los que no se pueden dejar en blanco. */
export const requiredBlocks = (protocol) =>
  CHECKIN_BLOCKS.filter((b) => requiresBlock(protocol, b.id));

// ── Escritura ──────────────────────────────────────────────────────────────

/** Cambia el estado de un bloque del check-in. Un estado que no existe no hace nada. */
export const setCheckinMode = (protocol, block, mode) => {
  if (!CHECKIN_BLOCKS.some((b) => b.id === block)) return protocol;
  if (!CHECKIN_MODE_IDS.includes(mode)) return protocol;
  return {
    ...protocol,
    checkin: { ...defaultCheckin(), ...protocol.checkin, [block]: mode },
  };
};

export const toggleModule = (protocol, id) => {
  const on = isModuleOn(protocol, id);
  const order = MODULES.map((m) => m.id);
  const modules = on
    ? protocol.modules.filter((m) => m !== id)
    : [...protocol.modules, id].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return { ...protocol, modules };
};

/*
  ── Las dos listas se manipulan con las mismas funciones ────────────────────
  `list` dice sobre cuál se opera: `questions` (al terminar de entrenar) o
  `checkinQuestions` (al cerrar la semana). Duplicar las cuatro funciones para la
  lista nueva habría sido copiar cuarenta líneas para cambiar un nombre de clave,
  y garantizar que dentro de tres meses una de las dos copias tenga un arreglo
  que la otra no.

  Por defecto `questions`, así que todo lo que ya llamaba a estas funciones sigue
  llamándolas igual.
*/
const LISTS = ['questions', 'checkinQuestions'];
const listOf = (protocol, list) => (LISTS.includes(list) ? protocol[list] || [] : protocol.questions || []);

/**
 * Añade o quita una pregunta. Al añadir se pone AL FINAL, no en el orden del
 * catálogo: el entrenador la acaba de elegir y espera verla donde ha pulsado, y
 * además el orden de las preguntas es suyo (ver `activeQuestions`).
 */
export const toggleQuestion = (protocol, id, list = 'questions') => {
  const actual = listOf(protocol, list);
  const has = actual.includes(id);
  return {
    ...protocol,
    [list]: has ? actual.filter((q) => q !== id) : [...actual, id],
  };
};

export const moveQuestion = (protocol, id, direction, list = 'questions') => {
  const actual = listOf(protocol, list);
  const index = actual.indexOf(id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= actual.length) return protocol;
  const next = [...actual];
  [next[index], next[target]] = [next[target], next[index]];
  return { ...protocol, [list]: next };
};

/**
 * Una pregunta propia del entrenador. Nace activa EN LA LISTA DESDE LA QUE SE
 * escribió: se acaba de teclear en un sitio concreto y ahí es donde se espera
 * verla. Sigue estando disponible para la otra, que es de lo que sirve que las
 * propias se compartan.
 */
export const addCustomQuestion = (
  protocol,
  { label, kind = 'scale', max = 10, lowerIsBetter = false },
  list = 'questions'
) => {
  const clean = String(label || '').trim();
  if (!clean || (protocol.custom || []).length >= MAX_CUSTOM) return protocol;

  const question = { id: newId('q'), label: clean, kind, max, lowerIsBetter };
  const custom = sanitizeCustom([...(protocol.custom || []), question]);
  const added = custom[custom.length - 1];
  if (!added) return { ...protocol, custom };

  return { ...protocol, custom, [list]: [...listOf(protocol, list), added.id] };
};

/* Borrarla la quita de LAS DOS listas. Si solo saliera de una, la pregunta
   seguiría haciéndose en la otra sin existir en ningún catálogo, y
   `activeQuestions` la descartaría en silencio: un hueco que nadie sabría
   explicar. */
export const removeCustomQuestion = (protocol, id) => ({
  ...protocol,
  custom: (protocol.custom || []).filter((q) => q.id !== id),
  questions: (protocol.questions || []).filter((q) => q !== id),
  checkinQuestions: (protocol.checkinQuestions || []).filter((q) => q !== id),
});

/**
 * El perfil que coincide exactamente con lo que hay puesto, si hay alguno.
 *
 * Compara también el cuestionario del check-in: sin eso, quitar las preguntas de
 * la semana dejaba el perfil marcado como si nada hubiera cambiado, y volver a
 * pulsarlo —creyendo que no hacía nada— las devolvía todas.
 */
export const matchingPreset = (protocol) =>
  PROTOCOL_PRESETS.find(
    (preset) =>
      preset.protocol.modules.join() === protocol.modules.join() &&
      preset.protocol.questions.join() === protocol.questions.join() &&
      (preset.protocol.checkinQuestions || []).join() === (protocol.checkinQuestions || []).join()
  ) || null;
