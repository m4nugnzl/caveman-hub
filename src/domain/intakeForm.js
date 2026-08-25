/**
 * El cuestionario de alta: qué le pregunta este entrenador a un cliente nuevo.
 *
 * ══ Qué sustituye ══════════════════════════════════════════════════════════
 *
 * Un documento de Word de trece páginas que viaja por correo, se contesta a mano
 * y se archiva. Dentro va todo lo que decide el primer plan —cuándo puede
 * entrenar, cuántas comidas hace, qué le duele, qué se ha operado— y ni una sola
 * de esas respuestas llega hoy a la aplicación en una forma que pueda usar.
 *
 * ══ Por qué NO es un catálogo nuevo ════════════════════════════════════════
 *
 * Porque las preguntas ya existen: son los campos del perfil (`profile.js`) y los
 * condicionantes (`conditions.js`). Lo que faltaba no era qué preguntar, era
 * QUIÉN CONTESTA. Un catálogo aparte tendría que mantenerse en paralelo con el de
 * la ficha, y a la tercera semana preguntarían cosas distintas.
 *
 * Así que esto no define preguntas: **elige cuáles de las que ya existen se le
 * piden al cliente**, y añade las propias del entrenador. Es exactamente lo que
 * hacen `protocol.js` con las preguntas del check-in e `intake.js` con los pasos
 * del alta — el tercer sitio con el mismo patrón, y a propósito.
 *
 * ══ Dónde vive ═════════════════════════════════════════════════════════════
 *
 * En `profiles.preferences.intakeForm`, o sea en las preferencias del ENTRENADOR
 * (migración 0035). Es su forma de trabajar, no la de un cliente: la escribe una
 * vez y la contestan todos. Esa columna ya existe, es un objeto abierto y **no
 * hace falta migración**.
 *
 * Las RESPUESTAS sí son de cada cliente y van a `clients.profile` (0078), por
 * `set_client_profile` (0080) — que mezcla en vez de reemplazar, porque en esa
 * columna conviven lo que contesta el cliente y lo que apunta el entrenador.
 */

import { PROFILE_FIELDS, PROFILE_GROUPS, customAnswers, fieldById } from './profile';
import { newId } from '@/lib/ids';

/**
 * Lo que se pregunta si el entrenador no ha tocado nada.
 *
 * ══ Por qué no son los diecinueve ══════════════════════════════════════════
 *
 * Porque un formulario de diecinueve campos en el móvil de alguien que acaba de
 * pagar es donde se abandona un alta. Éstos son los que cambian el PRIMER plan
 * —cuándo puede, cuánto dura, qué come y cuándo— y el resto se pregunta cuando
 * haga falta o lo apunta el entrenador de lo que le cuenten.
 *
 * Quien quiera las diecinueve las enciende en un clic; quien quiera cuatro,
 * apaga. Lo que no puede pasar es que la aplicación llegue con todo encendido:
 * apagar cosas que no entiendes da más miedo que encender las que quieres, y es
 * el mismo criterio con el que nacen los módulos del protocolo.
 */
export const DEFAULT_ASKED = [
  'daysAvailable',
  'sessionMinutes',
  'trainingWindow',
  'experience',
  'occupation',
  'sleepHours',
  'mealsPerDay',
  'mealTimes',
  'dislikes',
  'dailySteps',
];

/**
 * Tope de preguntas propias.
 *
 * Mismo motivo que en `protocol.js` e `intake.js`: la columna `preferences` del
 * entrenador la comparten el panel, las plantillas y ahora esto. Ocho preguntas
 * propias con su etiqueta ocupan menos de 1 KB; el tope está para que nadie
 * convierta el formulario en un cuestionario de cuarenta y para que la columna no
 * se llene.
 */
export const MAX_CUSTOM = 8;
export const MAX_LABEL = 120;

/** Las clases de pregunta propia. Las mismas que entiende la ficha. */
export const CUSTOM_KINDS = [
  { id: 'text', label: 'Texto' },
  { id: 'number', label: 'Un número' },
  { id: 'yesno', label: 'Sí o no' },
];

const KIND_IDS = CUSTOM_KINDS.map((k) => k.id);

export const defaultIntakeForm = () => ({
  asked: [...DEFAULT_ASKED],
  custom: [],
  /*
    ── Preguntar por su salud, encendido de serie ────────────────────────────
    Es la única parte de este formulario que NACE encendida, y va contra la regla
    de «nada llega encendido» a propósito: un cuestionario de alta que pregunta a
    qué hora entrena y no pregunta por las lesiones no es una anamnesis, es una
    ficha de preferencias con nombre de historial.

    Quien no lo quiera lo apaga en un clic —hay quien hace la anamnesis hablando,
    y eso es legítimo—. Lo que no puede pasar es que se quede sin preguntar por
    no haberlo encontrado.
  */
  askHealth: true,
  /*
    Qué preguntas no cuentan como contestadas si están en blanco.

    NO bloquean el guardado, y esa es la decisión: un formulario que no deja
    guardar sin completarlo se abandona en la tercera pregunta y no llega nada.
    Lo que hacen es que su alta no se dé por terminada — su lista sigue diciendo
    que falta, y en la ficha del entrenador el paso sigue sin marcarse.

    Obligatorio, aquí, significa «sin esto no empezamos», no «sin esto no
    guardas». Es lo que de verdad se quiere decir.
  */
  required: [],
  /* La nota que ve el cliente encima del formulario. Vacía no se pinta: una
     cabecera de relleno —«Rellena estos datos, por favor»— es cromo. */
  intro: '',
});

/**
 * Lo guardado, completado y acotado.
 *
 * Las mismas reglas que el resto de preferencias del proyecto: lo que no está
 * configurado usa el valor por defecto y **las claves desconocidas se ignoran**,
 * de modo que se pueden añadir cosas mañana sin migrar nada.
 *
 * ── Lo que se cae aquí, y por qué importa ──────────────────────────────────
 * Un `asked` con un id que ya no está en el catálogo de la ficha se descarta. Sin
 * esto, retirar un campo del perfil dejaría al cliente con una pregunta que al
 * contestarla no se guarda en ninguna parte — un formulario que se traga las
 * respuestas es peor que uno que no las pide.
 */
export const coachIntakeForm = (preferences) => {
  const raw = preferences?.intakeForm;
  if (!raw || typeof raw !== 'object') return defaultIntakeForm();

  const validos = new Set(PROFILE_FIELDS.map((f) => f.id));
  const asked = Array.isArray(raw.asked)
    ? [...new Set(raw.asked.filter((id) => validos.has(id)))]
    : [...DEFAULT_ASKED];

  const custom = (Array.isArray(raw.custom) ? raw.custom : [])
    .map((q) => {
      const label = String(q?.label ?? '').trim().slice(0, MAX_LABEL);
      if (!label || !q?.id) return null;
      return {
        id: String(q.id),
        label,
        kind: KIND_IDS.includes(q.kind) ? q.kind : 'text',
      };
    })
    .filter(Boolean)
    .slice(0, MAX_CUSTOM);

  /* Obligatoria solo puede serlo algo que además se pregunte: si no, el alta se
     quedaría bloqueada por una pregunta que nadie ve. */
  const preguntadas = new Set([...asked, ...custom.map((q) => q.id)]);
  const required = Array.isArray(raw.required)
    ? [...new Set(raw.required.filter((id) => preguntadas.has(id)))]
    : [];

  return {
    asked,
    custom,
    required,
    askHealth: raw.askHealth !== false,
    intro: String(raw.intro ?? '').trim().slice(0, 500),
  };
};

/** ¿Esta pregunta es de las que hay que contestar para dar el alta por hecha? */
export const isRequired = (form, id) => (form?.required || []).includes(id);

/** Marcarla obligatoria, o dejar de hacerlo. */
export const toggleRequired = (form, id) => ({
  ...form,
  required: isRequired(form, id)
    ? form.required.filter((x) => x !== id)
    : [...(form.required || []), id],
});

/**
 * El formulario que ve UN cliente concreto.
 *
 * ══ Por qué se copia a cada cliente y no se lee del entrenador ═════════════
 *
 * Porque el cliente NO puede leer el perfil de su entrenador: `profiles` solo
 * deja ver la fila propia y las del equipo (0002 y 0006). Si el formulario
 * viviera únicamente en `profiles.preferences`, el portal se quedaría sin saber
 * qué preguntar.
 *
 * Así que se copia a `clients.preferences.intakeForm` al dar de alta, que es
 * exactamente lo que ya hace el protocolo con su plantilla
 * (`lib/protocolTemplate.js`). El cliente lee su propia fila y ya está.
 *
 * ── Y quien no tenga copia ve el formulario por defecto ────────────────────
 * Los clientes anteriores a esto no tienen nada guardado. Enseñarles una
 * pantalla vacía sería peor que enseñarles las diez preguntas de serie, que son
 * útiles para cualquier entrenador — y en cuanto el suyo toque su formulario,
 * pasa a ser el suyo.
 */
export const clientIntakeForm = (preferences) => coachIntakeForm(preferences);

/** Lo que se guarda: `coachIntakeForm` ya devuelve exactamente esa forma. */
export const intakeFormToPreferences = (form) => coachIntakeForm({ intakeForm: form });

// ── Construcción del formulario que ve el cliente ──────────────────────────

/**
 * Las preguntas a contestar, agrupadas y en el orden del catálogo.
 *
 * ── Por qué agrupadas y no en una lista ────────────────────────────────────
 * Porque son hasta diecinueve, y diecinueve controles seguidos en un móvil son
 * un rollo de papel. Con los rótulos de la ficha —«Cómo entrena», «Cómo come»—
 * el formulario se lee en tandas y, de paso, el cliente ve las mismas palabras
 * que su entrenador: eso hace que lo que contesta se parezca a lo que le van a
 * enseñar después.
 *
 * Las propias del entrenador van al final, en su propia tanda: no pertenecen a
 * ninguno de los dos asuntos y colarlas dentro haría que el orden del catálogo
 * dejara de ser el orden de la pantalla.
 */
export const formSections = (form) => {
  const preguntadas = new Set(form?.asked || []);

  const tandas = PROFILE_GROUPS.map((grupo) => ({
    id: grupo.id,
    label: grupo.label,
    fields: PROFILE_FIELDS.filter((f) => f.group === grupo.id && preguntadas.has(f.id)),
  })).filter((t) => t.fields.length > 0);

  const propias = (form?.custom || []).map((q) => ({ ...q, custom: true }));
  if (propias.length > 0) {
    tandas.push({ id: 'custom', label: 'Lo que te pregunta tu entrenador', fields: propias });
  }

  return tandas;
};

/** ¿Se le pide algo? Con el formulario vacío no hay pantalla que enseñar. */
export const isFormEmpty = (form) =>
  (form?.asked || []).length === 0 && (form?.custom || []).length === 0;

/**
 * Lo obligatorio que sigue en blanco.
 *
 * Es lo que impide que el alta se dé por terminada, y por eso se devuelve la
 * LISTA y no un booleano: al cliente hay que poder decirle cuáles son. «Te falta
 * algo obligatorio» sin decir qué es una pantalla que no se puede obedecer.
 */
export const missingRequired = (form, profile) => {
  const propias = customAnswers(profile);
  const puesto = (valor) => valor !== undefined && valor !== null && valor !== '';

  return (form?.required || [])
    .map((id) => {
      const propia = (form.custom || []).find((q) => q.id === id);
      const valor = propia ? propias[id] : profile?.[id];
      return puesto(valor) ? null : { id, label: propia ? propia.label : fieldById(id)?.label };
    })
    .filter((q) => q && q.label);
};

/**
 * Cuántas de las preguntas tiene ya contestadas.
 *
 * Cuenta sobre lo PREGUNTADO y no sobre el catálogo entero: si el entrenador
 * pide seis cosas y están las seis, el alta está completa aunque la ficha tenga
 * trece campos más en blanco. Lo contrario sería un progreso que no llega nunca
 * al final.
 */
export const formProgress = (form, profile) => {
  const propias = customAnswers(profile);
  const puesto = (valor) => valor !== undefined && valor !== null && valor !== '';

  const delCatalogo = (form?.asked || []).filter((id) => puesto(profile?.[id]));
  const suyas = (form?.custom || []).filter((q) => puesto(propias[q.id]));

  return {
    done: delCatalogo.length + suyas.length,
    total: (form?.asked || []).length + (form?.custom || []).length,
    /* Lo obligatorio que falta viaja con el progreso porque quien pinta el uno
       casi siempre necesita el otro, y dos llamadas para lo mismo acaban en dos
       criterios distintos de «está completo». */
    missing: missingRequired(form, profile),
  };
};

// ── Editar el formulario ───────────────────────────────────────────────────

/** Encender o apagar una pregunta del catálogo. */
export const toggleAsked = (form, id) => {
  if (!fieldById(id)) return form;
  const dentro = (form.asked || []).includes(id);
  return {
    ...form,
    asked: dentro ? form.asked.filter((x) => x !== id) : [...form.asked, id],
  };
};

/**
 * Añadir una pregunta propia.
 *
 * El id se genera aquí y NO sale de la etiqueta: si saliera del texto, corregir
 * una falta de ortografía en la pregunta cambiaría su id y las respuestas ya
 * dadas se quedarían huérfanas en la ficha de todo el mundo.
 */
export const addCustom = (form, { label, kind = 'text' }) => {
  const limpio = String(label || '').trim().slice(0, MAX_LABEL);
  if (!limpio || (form.custom || []).length >= MAX_CUSTOM) return form;

  return {
    ...form,
    custom: [
      ...(form.custom || []),
      { id: newId('ask'), label: limpio, kind: KIND_IDS.includes(kind) ? kind : 'text' },
    ],
  };
};

export const removeCustom = (form, id) => ({
  ...form,
  custom: (form.custom || []).filter((q) => q.id !== id),
});
