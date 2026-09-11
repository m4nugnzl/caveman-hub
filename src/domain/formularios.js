/**
 * LOS FORMULARIOS DEL ENTRENADOR: todo lo que le pregunta a un cliente.
 *
 * ══ Qué junta, y por qué estaba partido ════════════════════════════════════
 *
 * Este producto tiene TRES cuestionarios y hasta hoy vivían en dos sitios con
 * dos modelos y dos editores:
 *
 *   · **El alta** — `preferences.intakeForm(s)`, catálogo `PROFILE_FIELDS`,
 *     editado por `ConstructorFormulario` (el lienzo) Y por `IntakeFormSection`
 *     (una lista de casillas dentro del protocolo). Dos editores del mismo dato.
 *   · **La sesión** — `protocol.questions`, catálogo `SESSION_QUESTIONS`.
 *   · **La semana** — `protocol.checkinQuestions`, catálogo `CHECKIN_QUESTIONS`.
 *
 * Los dos últimos ni siquiera aparecían en la pantalla de Formularios: tenía un
 * pie con dos enlaces avisando de que estaban en otra parte. Un cajón que avisa
 * de que dos de sus tres cosas están en otro cajón no es un cajón.
 *
 * Aquí los tres son **objetos con nombre y con momento**, y el protocolo los
 * referencia por id. Eso es lo que pedía el encargo: los formularios se crean
 * libres, y el protocolo define su uso.
 *
 * ══ Lo que NO se unifica, a propósito ══════════════════════════════════════
 *
 * El almacenamiento de las preguntas propias. Las del alta son
 * `{id, label, kind: text|number|yesno}` y las de sesión/semana son
 * `{id, label, kind: scale|text, min, max, lowerIsBetter, color}` — con color,
 * porque de cada escala sale una serie en la analítica.
 *
 * Unificarlas obligaría a migrar la columna `preferences` de todos los
 * entrenadores y la de todos sus clientes, para ganar elegancia y perder el
 * color de las series. Como un formulario tiene UN momento, las dos formas no
 * se cruzan nunca en tiempo de ejecución: el saneado se bifurca y ya está.
 *
 * **Lo que se unifica es el editor**, que recibe su vocabulario por parámetro.
 *
 * ══ Dónde vive ═════════════════════════════════════════════════════════════
 *
 * En `profiles.preferences.formularios.items`. Columna abierta, **sin
 * migración**, exactamente como `intakeForms` (0035).
 *
 * Y sin lista, los formularios de siempre SON la lista: `heredados()` reconstruye
 * las altas de `intakeForms` y arma el parte y el check-in con lo que hay en
 * `protocolTemplate`. Quien nunca toque esta pantalla no nota nada, y quien la
 * abra el primer día se encuentra sus tres cuestionarios ya dentro con su
 * contenido de verdad — no tres plantillas vacías que tendría que rellenar otra
 * vez.
 */

import {
  CHECKIN_QUESTIONS,
  MAX_CUSTOM as MAX_CUSTOM_PREGUNTAS,
  SESSION_QUESTIONS,
  addCustomQuestion,
  clientProtocol,
  defaultCheckin,
  defaultProtocol,
  moveQuestion,
  removeCustomQuestion,
  toggleQuestion,
} from './protocol';
import {
  MAX_FORM_NAME,
  coachIntakeForm,
  coachIntakeForms,
  defaultIntakeForm,
} from './intakeForm';
import {
  TIPOS,
  cuentaElementos,
  defaultElemento,
  esPregunta,
  resumenElementos,
  sanitizeElementos,
} from './formulario';
import { newId } from '@/lib/ids';

/**
 * Los tres momentos en que se le pregunta algo a un cliente.
 *
 * `lista` dice en qué clave del protocolo cae lo que se elija aquí, y es lo que
 * permite que `resolveProtocolo` no tenga que saber de formularios: le pide a
 * cada uno sus preguntas y las pone donde el cliente ya sabe leerlas.
 */
export const MOMENTOS = [
  {
    id: 'alta',
    label: 'Al entrar',
    corto: 'Al entrar',
    hint: 'Lo que contesta una vez, cuando empieza contigo.',
    lista: null,
  },
  {
    id: 'sesion',
    label: 'Al terminar de entrenar',
    corto: 'Tras entrenar',
    hint: 'El parte de cada sesión. Cada escala se convierte en una serie que puedes seguir.',
    lista: 'questions',
  },
  {
    id: 'semana',
    label: 'Cada semana',
    corto: 'Cada semana',
    hint: 'Su check-in: lo que se mide y lo que se pregunta antes de entregarlo.',
    lista: 'checkinQuestions',
  },
  /*
    ── Y EL CUARTO, que no es un momento ─────────────────────────────────────

    Los tres de arriba dicen CUÁNDO se pregunta, porque el protocolo los coloca
    en una casilla por momento. Un formulario libre no tiene casilla: no sabe
    cuándo se pide ni a quién, y eso lo decide el envío (`domain/envios.js`).

    Está en esta lista de todas formas porque el resto del módulo pregunta por
    `momentoById` para saber cómo sanear y cómo contar, y dejarlo fuera obligaría
    a que cada sitio recordara la excepción. `lista: null` es lo que dice que sus
    preguntas no caen en ninguna clave del protocolo — porque no pasan por él.
  */
  {
    id: 'libre',
    label: 'Suelto',
    corto: 'Suelto',
    hint: 'No lo pide ningún protocolo: se lo mandas tú a quien quieras, cuando quieras.',
    lista: null,
  },
];

const MOMENTO_IDS = MOMENTOS.map((m) => m.id);

export const momentoById = (id) => MOMENTOS.find((m) => m.id === id) || null;

/**
 * Tope de formularios.
 *
 * Veinte y no seis: aquí caben las cuatro clases en la misma lista, y el tope de
 * seis de `intakeForms` dejaría a quien tenga sus seis altas sin poder crear ni
 * un check-in. Subió de doce a veinte al entrar los sueltos, que son los que se
 * multiplican: uno por cada cosa que se le ocurre preguntar.
 *
 * Sigue habiendo tope, y por dos motivos distintos: la columna `preferences` del
 * CLIENTE está capada a 8 KB por la 0008 —y ahí se copia lo que el protocolo
 * resuelve—, y la del ENTRENADOR se carga entera en cada arranque. Lo que acota
 * el tamaño de cada formulario es `MAX_ELEMENTOS` (`domain/formulario.js`).
 */
export const MAX_FORMULARIOS = 20;

export { MAX_FORM_NAME };

// ── Valores por defecto ────────────────────────────────────────────────────

/**
 * Un formulario recién nacido, según su momento.
 *
 * El alta hereda los diez de siempre (`defaultIntakeForm`), porque un
 * cuestionario de entrada vacío no le sirve a nadie. Los otros dos nacen
 * **vacíos**, que es la regla de la casa: la lista vacía ES el apagado, y estos
 * dos alargan una entrega que ya cuesta que se haga cada semana.
 */
export const defaultFormulario = (momento = 'alta') => {
  if (momento === 'alta') return { momento: 'alta', ...defaultIntakeForm() };
  /* El suelto nace de verdad en blanco: es lo que pedía el encargo —«partir de
     0 elementos y poder ir añadiendo»— y lo que hace que la galería de
     plantillas tenga sentido, porque si no habría que vaciar antes de empezar. */
  if (momento === 'libre') return { momento: 'libre', elementos: [] };
  if (momento === 'sesion') return { momento: 'sesion', questions: [], custom: [] };
  return {
    momento: 'semana',
    questions: [],
    custom: [],
    /* Los dos bloques y los pesajes son parte del check-in, no del protocolo:
       son lo que se MIDE en el mismo momento en que se pregunta. Traerlos aquí
       es lo que convierte «perímetros: opcional» —un conmutador perdido en otra
       pantalla— en una pieza más del formulario de la semana. */
    checkin: defaultCheckin(),
    weighIns: defaultProtocol().weighIns,
    /* Las fotos de progreso no tenían dónde declararse: se subían porque sí.
       Aquí son una pieza del formulario, como las medidas — y nacen PEDIDAS,
       que es lo que la aplicación hacía cuando esto no se podía elegir. */
    askPhotos: true,
  };
};

// ── Saneado ────────────────────────────────────────────────────────────────

const NOMBRE_POR_DEFECTO = {
  alta: 'Alta',
  sesion: 'El parte',
  semana: 'El check-in',
  libre: 'Formulario nuevo',
};

const nombreDe = (raw, momento) =>
  String(raw ?? '').trim().slice(0, MAX_FORM_NAME) || NOMBRE_POR_DEFECTO[momento] || 'Formulario';

/**
 * Las preguntas de un formulario de sesión o de semana, saneadas.
 *
 * ══ Por qué se sanean PASANDO POR `clientProtocol` ═════════════════════════
 *
 * Porque las reglas ya están escritas ahí y son delicadas: cada lista solo
 * acepta ids de SU catálogo más los propios, las propias se acotan a seis, los
 * ids que chocan con el catálogo se caen, y cada escala recibe su color de la
 * paleta de datos. Reescribir todo eso aquí sería tener dos saneados de lo mismo
 * que divergirían a la tercera semana — que es exactamente el fallo que este
 * módulo viene a cerrar.
 *
 * Así que se monta un protocolo de mentira con lo de este formulario, se sanea
 * con el de verdad y se recoge lo que sale. Un rodeo de seis líneas a cambio de
 * no tener un segundo criterio.
 */
const saneaPreguntas = (raw, momento) => {
  const lista = momentoById(momento).lista;
  const sano = clientProtocol({
    protocol: {
      /* Siempre un array: `clientProtocol` solo cae en su valor por defecto
         cuando no lo es, y aquí «vacío» tiene que seguir siendo vacío. */
      [lista]: Array.isArray(raw?.questions) ? raw.questions : [],
      custom: Array.isArray(raw?.custom) ? raw.custom : [],
      checkin: raw?.checkin,
      weighIns: raw?.weighIns,
    },
  });
  return { questions: sano[lista], custom: sano.custom, checkin: sano.checkin, weighIns: sano.weighIns };
};

/**
 * Un formulario guardado, completado y acotado. `null` si no hay ni id.
 *
 * Las claves desconocidas se ignoran, como en todo el proyecto: se pueden añadir
 * cosas mañana sin migrar nada.
 */
export const sanitizeFormulario = (raw) => {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;

  const momento = MOMENTO_IDS.includes(raw.momento) ? raw.momento : 'alta';
  const base = { id: String(raw.id), name: nombreDe(raw.name, momento), momento };

  if (momento === 'alta') return { ...base, ...coachIntakeForm({ intakeForm: raw }) };

  /* El suelto no pasa por `clientProtocol`: sus elementos no son preguntas de
     ningún catálogo del protocolo, así que tiene su propio saneado. */
  if (momento === 'libre') return { ...base, elementos: sanitizeElementos(raw.elementos) };

  const { questions, custom, checkin, weighIns } = saneaPreguntas(raw, momento);
  if (momento === 'sesion') return { ...base, questions, custom };

  return { ...base, questions, custom, checkin, weighIns, askPhotos: raw.askPhotos !== false };
};

// ── La lista ───────────────────────────────────────────────────────────────

/**
 * Los tres cuestionarios de siempre, leídos como formularios.
 *
 * Es la mudanza silenciosa: mientras nadie guarde una lista nueva, ESTO es la
 * lista. Las altas salen de `intakeForms` tal cual, y el parte y el check-in se
 * arman con lo que el entrenador tenga puesto en su plantilla de protocolo — o
 * con lo de serie, si no ha tocado nada.
 *
 * Los ids son FIJOS (`form_sesion`, `form_semana`) y no generados: son «los de
 * siempre», no unos nuevos en cada lectura. Si cambiaran, el protocolo que los
 * referencia se quedaría apuntando al vacío en el siguiente render.
 */
const heredados = (preferences) => {
  const p = clientProtocol({ protocol: preferences?.protocolTemplate });

  return [
    ...coachIntakeForms(preferences).map((f) => ({ ...f, momento: 'alta' })),
    { id: 'form_sesion', name: 'El parte', momento: 'sesion', questions: p.questions, custom: p.custom },
    {
      id: 'form_semana',
      name: 'El check-in',
      momento: 'semana',
      questions: p.checkinQuestions,
      custom: p.custom,
      checkin: p.checkin,
      weighIns: p.weighIns,
      askPhotos: true,
    },
  ];
};

/** Los formularios del entrenador, saneados. Nunca vuelve vacío. */
export const coachFormularios = (preferences) => {
  const items = preferences?.formularios?.items;
  if (Array.isArray(items)) {
    const sanos = items.map(sanitizeFormulario).filter(Boolean).slice(0, MAX_FORMULARIOS);
    if (sanos.length > 0) return sanos;
  }
  return heredados(preferences);
};

/** Los de un momento concreto, para elegir cuál usa un protocolo. */
export const formulariosDe = (preferences, momento) =>
  coachFormularios(preferences).filter((f) => f.momento === momento);

/**
 * LOS QUE SE PUEDEN MANDAR, que no son todos.
 *
 * Un formulario de alta, el parte o el check-in no viajan como acción suelta:
 * sus preguntas no viven en `elementos` sino en la forma de su momento, así que
 * `filasDeEnvio` congelaría `elementos: []` y al cliente le llegaría un
 * cuestionario **vacío**. «Mandar algo» ya filtraba así de su cosecha; el «⊕»
 * del carril de automatizaciones no, y ofrecía los cuatro: elegir «Alta» ahí
 * mandaba una hoja en blanco y la lista decía «0 preguntas» sin que eso
 * impidiera nada.
 *
 * El criterio se escribe UNA vez y lo usan las dos bocas —y el motor 2, que lo
 * comprueba otra vez en la base porque allí no puede fiarse de quién llama.
 */
export const formulariosMandables = (preferences) =>
  coachFormularios(preferences).filter(
    (f) => f.momento === 'libre' && cuentaElementos(f.elementos) > 0
  );

/** El elegido, o el primero de su momento: nadie se queda sin por un id roto. */
export const formularioById = (preferences, id, momento = null) => {
  const lista = coachFormularios(preferences);
  const encontrado = lista.find((f) => f.id === id);
  if (encontrado && (!momento || encontrado.momento === momento)) return encontrado;
  return momento ? lista.find((f) => f.momento === momento) || null : lista[0] || null;
};

/** La lista, lista para guardarse en `preferences.formularios`. */
export const formulariosToPreferences = (forms) => ({
  items: coachFormularios({ formularios: { items: forms } }),
});

/** Uno nuevo. */
export const buildFormulario = ({ name, momento = 'alta', elementos = null }) => {
  const m = MOMENTO_IDS.includes(momento) ? momento : 'alta';
  const base = { id: newId('form'), name: nombreDe(name, m), ...defaultFormulario(m) };
  /* `elementos` llega de una plantilla de fábrica o de duplicar otro suelto. Se
     sanea igual que si viniera de la base: una plantilla es contenido, no una
     excepción al saneado. */
  return m === 'libre' && elementos ? { ...base, elementos: sanitizeElementos(elementos) } : base;
};

// ── Lectura ────────────────────────────────────────────────────────────────

/** Cuántas preguntas lleva. Las tandas del alta cuentan como una cada una. */
export const cuentaPreguntas = (form) => {
  if (!form) return 0;
  if (form.momento === 'libre') return cuentaElementos(form.elementos);
  if (form.momento !== 'alta') return (form.questions || []).length;
  return (
    (form.asked || []).length +
    (form.custom || []).length +
    (form.askBasics ? 3 : 0) +
    (form.askHealth ? 1 : 0) +
    (form.askMeasures ? 1 : 0) +
    (form.askScreening ? 1 : 0)
  );
};

/**
 * Lo que lleva puesto, en una frase para la columna de la lista.
 *
 * Las medidas se dicen aparte de las preguntas porque no son preguntas: son
 * piezas que caen en su antropometría, y sumarlas al mismo número haría que «8»
 * significara cosas distintas en dos filas de la misma tabla.
 */
export const resumenFormulario = (form) => {
  if (form?.momento === 'libre') return resumenElementos(form.elementos);
  const n = cuentaPreguntas(form);
  const preguntas = `${n} ${n === 1 ? 'pregunta' : 'preguntas'}`;
  if (form?.momento !== 'semana') return preguntas;

  const piezas = [];
  if ((form.weighIns || 0) > 0) piezas.push('peso');
  if (form.checkin?.perimeters !== 'off') piezas.push('perímetros');
  if (form.checkin?.folds !== 'off') piezas.push('pliegues');
  if (form.askPhotos) piezas.push('fotos');
  return piezas.length > 0 ? `${preguntas} + ${piezas.length} medidas` : preguntas;
};

/** ¿Se le pide algo de verdad? Con el formulario vacío no hay pantalla. */
export const formularioVacio = (form) => cuentaPreguntas(form) === 0;

/** El catálogo que le toca a un formulario, para el constructor. */
export const catalogoDe = (momento) => {
  if (momento === 'sesion') return SESSION_QUESTIONS;
  if (momento === 'semana') return CHECKIN_QUESTIONS;
  return [];
};

/* ══════════════════════════════════════════════════════════════════════════
   LA ESTANTERÍA — el catálogo deja de ser un cajón de interruptores
   --------------------------------------------------------------------------
   Hasta aquí, el parte y el check-in eran LISTAS DE IDS de un catálogo cerrado:
   podías encender «Adherencia a la dieta» y no podías tocarla. El dueño lo dijo
   con sus palabras: «son opciones semifijas, no puedes hacer tú una».

   El formulario suelto, en cambio, es una lista de ELEMENTOS: catorce tipos,
   reglas, apartados, dónde cae la respuesta. Dos modelos para lo mismo.

   Lo que hacen estas tres funciones es unificarlos SIN migrar nada:

     · `estanteria(momento)` sirve el catálogo como elementos listos para meter.
       Coges uno y ya es tuyo — con su `origen` puesto, que es lo que conserva
       la serie de la analítica (ver `sanitizeElemento`).
     · `elementosDe(form)` lee un formulario del viejo modelo COMO elementos.
       Es el puente de lectura, el mismo truco que `heredados()`: mientras nadie
       guarde elementos, los ids de siempre SON los elementos.
     · `comoProtocoloDesdeElementos(...)` hace el viaje de vuelta y produce
       exactamente la forma que el portal, la revisión y la analítica ya saben
       leer (`questions` / `checkinQuestions` + `custom`). Nada aguas abajo se
       entera del cambio, que es la única forma de hacer esto sin romper a nadie.
   ══════════════════════════════════════════════════════════════════════════ */

/** El tipo de elemento que le toca a una pregunta del catálogo. */
const tipoDePregunta = (kind) => (kind === 'scale' ? 'escala' : 'parrafo');

/** Una pregunta del catálogo, servida como elemento listo para insertar. */
export const elementoDePregunta = (q) => ({
  ...defaultElemento(tipoDePregunta(q.kind)),
  origen: q.id,
  enun: q.label,
  ayuda: q.hint || '',
  ...(q.kind === 'scale'
    ? { min: q.min ?? 1, max: q.max ?? 10, mejorAbajo: q.lowerIsBetter === true }
    : {}),
});

/**
 * El catálogo de un momento, como elementos.
 *
 * Cada llamada genera ids nuevos (`defaultElemento` los pide a `newId`), que es
 * lo correcto: son plantillas de las que se saca una copia, no objetos vivos.
 */
export const estanteria = (momento) => catalogoDe(momento).map(elementoDePregunta);

/**
 * QUÉ ELEMENTOS CABEN EN CADA MOMENTO — y por qué no caben todos.
 *
 * El parte y el check-in se guardan en el modelo viejo (`questions` + `custom`),
 * donde una pregunta solo puede ser **escala o texto**: eso es lo que leen el
 * portal, la revisión y la analítica. Ofrecer ahí «Elegir una» sería dejar que
 * el entrenador escriba tres opciones para que al guardar se conviertan en un
 * campo de texto y al volver a abrirlo hayan desaparecido — la pérdida
 * silenciosa que un constructor único vuelve fácil de cometer.
 *
 * Así que la lámina enseña lo que ese momento SABE GUARDAR, ni uno más:
 *
 *   · **semana** — las cuatro del oficio, más escala y texto.
 *   · **sesión** — escala y texto. Nada del oficio: el parte se cierra al
 *     terminar de entrenar, y ahí no se pesa nadie.
 *   · **suelto** — todo menos las fotos, que necesitan el asistente de la
 *     revisión para subirse por ángulos.
 *   · **alta** — vacío: sigue con su editor propio, porque su modelo son campos
 *     de perfil y no preguntas.
 *
 * Los apartados y las notas tampoco entran en los dos del protocolo: no
 * preguntan nada, y el modelo viejo no tiene dónde guardarlos (lo dice también
 * `comoProtocoloDesdeElementos`, que los descarta).
 */
export const tiposDeMomento = (momento) => {
  if (momento === 'semana') return ['peso', 'perimetros', 'pliegues', 'fotos', 'escala', 'parrafo'];
  if (momento === 'sesion') return ['escala', 'parrafo'];
  if (momento === 'libre') return TIPOS.filter((t) => t.id !== 'fotos').map((t) => t.id);
  return [];
};

/**
 * Las piezas del oficio que lleva un check-in, como elementos.
 *
 * `weighIns`, los dos bloques y las fotos vivían como cuatro campos sueltos del
 * formulario. Como elementos son lo que siempre fueron: cosas que se piden en el
 * mismo momento y que caen en la antropometría.
 */
const oficioDeSemana = (form) => {
  const out = [];
  if ((form.weighIns || 0) > 0) {
    out.push({ ...defaultElemento('peso'), origen: 'weighIns', veces: form.weighIns });
  }
  if (form.checkin?.perimeters !== 'off') {
    out.push({
      ...defaultElemento('perimetros'),
      origen: 'perimeters',
      oblig: form.checkin?.perimeters === 'required',
    });
  }
  if (form.checkin?.folds !== 'off') {
    out.push({
      ...defaultElemento('pliegues'),
      origen: 'folds',
      oblig: form.checkin?.folds === 'required',
    });
  }
  /* Al final: primero te pesas, después te mides y por último te haces las
     fotos — que es el orden del asistente de la revisión. */
  if (form.askPhotos !== false) out.push({ ...defaultElemento('fotos'), origen: 'askPhotos' });

  return out;
};

/**
 * Un formulario de sesión o de semana, leído como lista de elementos.
 *
 * El orden es el que puso el entrenador —`preguntasDe` ya lo respeta— y las
 * piezas del oficio van DELANTE, porque es el orden en que se hace: primero te
 * pesas y te mides, y después cuentas qué tal ha ido la semana.
 */
export const elementosDe = (form) => {
  if (!form) return [];
  if (form.momento === 'libre') return sanitizeElementos(form.elementos);
  if (form.momento === 'alta') return [];

  const oficio = form.momento === 'semana' ? oficioDeSemana(form) : [];
  const preguntas = preguntasDe(form).map(elementoDePregunta);
  return sanitizeElementos([...oficio, ...preguntas]);
};

/** ¿Este elemento dice lo mismo que la pregunta de catálogo de la que salió? */
const igualQueElCatalogo = (elem, base) => {
  if (!base) return false;
  if (elem.enun !== base.label) return false;
  if ((elem.ayuda || '') !== (base.hint || '')) return false;
  if (base.kind !== 'scale') return true;
  return (
    elem.min === (base.min ?? 1) &&
    elem.max === (base.max ?? 10) &&
    elem.mejorAbajo === (base.lowerIsBetter === true)
  );
};

/**
 * El viaje de vuelta: elementos → la forma que el protocolo ya sabe leer.
 *
 * ── Por qué NO se emite un `custom` por cada elemento ─────────────────────
 * Porque `preferences` del cliente está capada a 8 KB (migración 0008) y ahí se
 * copia lo que el protocolo resuelve. Un elemento que dice exactamente lo mismo
 * que su pregunta de catálogo no necesita guardarse: basta con su id, y el
 * catálogo lo sirve. Solo se escribe lo que el entrenador ha CAMBIADO.
 *
 * Ese es además el criterio honesto: `custom` pasa a significar «lo que has
 * tocado tú», sea inventado o retocado.
 */
export const comoProtocoloDesdeElementos = (elementos, momento) => {
  const lista = momentoById(momento)?.lista;
  const catalogo = catalogoDe(momento);
  const ids = [];
  const custom = [];
  let weighIns = 0;
  let askPhotos = false;
  const checkin = { perimeters: 'off', folds: 'off' };

  for (const elem of sanitizeElementos(elementos)) {
    if (elem.tipo === 'peso') {
      /* Cuántas veces se pesa lo dice el elemento: sin esto, una ida y vuelta por
         el lienzo convertía «3 a la semana» en «1». */
      weighIns = Math.max(weighIns, elem.veces || 1);
      continue;
    }
    if (elem.tipo === 'fotos') {
      askPhotos = true;
      continue;
    }
    if (elem.tipo === 'perimetros' || elem.tipo === 'pliegues') {
      const clave = elem.tipo === 'perimetros' ? 'perimeters' : 'folds';
      checkin[clave] = elem.oblig ? 'required' : 'optional';
      continue;
    }
    /* Lo que no pregunta nada —apartados y notas— no tiene sitio en el modelo
       viejo. Se pierde a propósito y no en silencio: el constructor no deja
       ponerlos en estos dos momentos. */
    if (!esPregunta(elem)) continue;

    const id = elem.origen || elem.id;
    if (ids.includes(id)) continue;
    ids.push(id);

    const base = catalogo.find((q) => q.id === elem.origen) || null;
    if (igualQueElCatalogo(elem, base)) continue;

    const escala = elem.tipo === 'escala';
    custom.push({
      id,
      label: elem.enun,
      hint: elem.ayuda || undefined,
      kind: escala ? 'scale' : 'text',
      ...(escala ? { min: elem.min, max: elem.max, lowerIsBetter: elem.mejorAbajo } : {}),
    });
  }

  /*
    `askPhotos` sale de un elemento como los demás desde que existe el tipo
    `fotos` (ver `TIPOS`). Antes se quedaba fuera porque la familia del oficio
    solo llevaba lo que aterriza por `aterrizar`, y una foto no es una cifra de
    la antropometría; su camino de escritura es el otro que ya existía —el paso
    de fotos del asistente de la revisión—, y lo que le faltaba era declararse.

    Se emite SIEMPRE, puesto o no: es la única forma de que quitar el elemento
    del lienzo apague de verdad las fotos. Con `askPhotos` solo cuando es `true`,
    el campo viejo se quedaba encendido para siempre.
  */
  return lista
    ? { [lista]: ids, custom, checkin, weighIns, askPhotos }
    : { custom, checkin, weighIns, askPhotos };
};

/**
 * El formulario entero, escrito desde el lienzo de elementos.
 *
 * Es el par de `elementosDe`: uno lee cualquier formulario como elementos y
 * este los devuelve a la forma en que ese formulario se guarda. Con los dos, el
 * constructor de elementos puede editar los tres —suelto, parte y check-in— sin
 * saber que dos de ellos viven en el modelo viejo, y sin que el portal, la
 * revisión ni la analítica se enteren de nada.
 *
 * Lo que NO hace es tocar el alta: su modelo son campos de perfil (`asked`,
 * `askBasics`…), no preguntas, y meterlo aquí sería inventarle un puente que
 * todavía no existe. Devuelve el formulario tal cual.
 */
export const desdeElementos = (form, elementos) => {
  if (!form) return form;
  if (form.momento === 'libre') return { ...form, elementos: sanitizeElementos(elementos) };
  if (form.momento === 'alta') return form;

  const p = comoProtocoloDesdeElementos(elementos, form.momento);
  const lista = momentoById(form.momento)?.lista;
  const base = { ...form, questions: lista ? p[lista] : form.questions, custom: p.custom };

  /* Los bloques, los pesajes y las fotos son del check-in y de nadie más: el
     parte no mide nada, y escribírselos le dejaría campos que su saneado tira. */
  if (form.momento !== 'semana') return base;
  return { ...base, checkin: p.checkin, weighIns: p.weighIns, askPhotos: p.askPhotos };
};

// ── Editar las preguntas de un formulario de sesión o de semana ────────────

/*
  ══ Por qué esto son ADAPTADORES y no operaciones nuevas ═══════════════════

  `protocol.js` ya tiene escritas —y probadas— las cuatro operaciones sobre una
  lista de preguntas: encender, mover, añadir una propia y borrarla. Trabajan
  sobre un objeto con `questions`/`checkinQuestions` y `custom`, que es
  exactamente la forma que tiene un formulario de sesión o de semana con otro
  nombre de clave.

  Así que aquí no se reimplementa nada: se monta el objeto que esperan, se
  llaman, y se recoge el resultado. Duplicar las cuatro habría sido copiar
  cuarenta líneas para cambiar un nombre de clave y garantizar que dentro de tres
  meses una de las dos copias tenga un arreglo que la otra no — que es el fallo
  que este módulo entero viene a cerrar.
*/
const comoProtocolo = (form) => ({
  [momentoById(form.momento).lista]: form.questions || [],
  custom: form.custom || [],
});

const desdeProtocolo = (form, p) => ({
  ...form,
  questions: p[momentoById(form.momento).lista],
  custom: p.custom,
});

/** Las preguntas puestas, resueltas y en el orden que puso el entrenador. */
export const preguntasDe = (form) => {
  if (!form || form.momento === 'alta') return [];
  const catalogo = catalogoDe(form.momento);
  return (form.questions || [])
    .map((id) => catalogo.find((q) => q.id === id) || (form.custom || []).find((q) => q.id === id))
    .filter(Boolean);
};

/** Las del catálogo que todavía no están puestas, para el selector. */
export const preguntasLibres = (form) => {
  const puestas = new Set(form?.questions || []);
  return catalogoDe(form?.momento).filter((q) => !puestas.has(q.id));
};

/**
 * Encender o apagar una pregunta.
 *
 * Comprueba que sea de SU catálogo (o propia) antes de meterla. `toggleQuestion`
 * no lo hace —en el protocolo la lista se sanea después— pero aquí este
 * adaptador es la única puerta que tiene un formulario, así que la invariante se
 * defiende donde se puede romper: colar `rpe` en el check-in pediría el esfuerzo
 * de una sesión que el domingo no existe.
 */
export const togglePregunta = (form, id) => {
  const puesta = (form.questions || []).includes(id);
  const conocida =
    catalogoDe(form.momento).some((q) => q.id === id) ||
    (form.custom || []).some((q) => q.id === id);
  if (!puesta && !conocida) return form;
  return desdeProtocolo(form, toggleQuestion(comoProtocolo(form), id, momentoById(form.momento).lista));
};

export const moverPregunta = (form, id, direccion) =>
  desdeProtocolo(
    form,
    moveQuestion(comoProtocolo(form), id, direccion, momentoById(form.momento).lista)
  );

export const anadirPropia = (form, datos) =>
  desdeProtocolo(
    form,
    addCustomQuestion(comoProtocolo(form), datos, momentoById(form.momento).lista)
  );

/** Borrarla del todo. `removeCustomQuestion` la saca de las dos listas. */
export const quitarPropia = (form, id) =>
  desdeProtocolo(form, removeCustomQuestion(comoProtocolo(form), id));

export { MAX_CUSTOM_PREGUNTAS };
