/**
 * EL FORMULARIO LIBRE: una lista de elementos, y ya está.
 *
 * ══ Por qué existe este módulo además de `formularios.js` ══════════════════
 *
 * `domain/formularios.js` guarda los TRES cuestionarios del producto —el alta,
 * el parte de la sesión y el check-in— y los guarda bien: cada uno referencia el
 * catálogo que le toca, sus preguntas caen donde el portal ya sabe leerlas y el
 * protocolo los apunta por id. Eso no se toca.
 *
 * Lo que no cabía ahí era un CUARTO cuestionario. Un formulario tenía un
 * momento dentro (`alta` | `sesion` | `semana`) y el protocolo tres casillas,
 * una por momento. «Hábitos de sueño», «cómo llevas el viaje», «pásame tus
 * marcas» se podían crear y no tenían dónde vivir.
 *
 * Aquí el formulario **no sabe cuándo se pide ni a quién**: es una lista
 * ordenada de elementos. El cuándo y el a quién los pone el envío
 * (`domain/envios.js`), que es exactamente la división que pedía el encargo —
 * los formularios se crean libres y su uso se define fuera.
 *
 * ══ El eje del catálogo no son los «tipos de campo» ════════════════════════
 *
 * Es **dónde cae la respuesta**. Eso es lo que este producto puede decir y un
 * formulario genérico no: una respuesta no se queda en una hoja, entra en la
 * ficha de una persona. Sus perímetros van a su antropometría, sus lesiones a
 * sus condicionantes, su material a su maquinaria. Los `enchufes` que el
 * constructor ya tenía como cuatro casos especiales pasan a ser una familia
 * entera del catálogo, y por eso `cae` es un campo de todos los elementos y no
 * un adorno de algunos.
 *
 * ══ Y una regla, escrita como se lee ═══════════════════════════════════════
 *
 * Una condición por elemento, mirando a un elemento ANTERIOR, con un operador.
 * Cubre lo que un entrenador escribe de verdad —lesiones, embarazo, alergias,
 * «si has fallado entrenos, cuéntame por qué»— y no puede formar ciclos, porque
 * solo se mira hacia atrás. La frase la compone `fraseDeRegla` y la usan LOS DOS
 * lados: el constructor para enseñarla y el portal para obedecerla. Una sola
 * función, o divergen.
 *
 * ══ Dónde vive ═════════════════════════════════════════════════════════════
 *
 * El formulario, en `profiles.preferences.formularios.items` con
 * `momento: 'libre'` — la misma lista de siempre, sin migración.
 *
 * Lo que se le MANDA a alguien es otra cosa y sí tiene tabla: `client_actions`
 * (0099, con ese nombre desde la 0105) guarda una copia CONGELADA del esquema y
 * las respuestas con su fecha. El porqué está escrito en esa migración y se
 * resume así: las respuestas del alta caen hoy en `clients.profile` por campo,
 * de modo que la misma pregunta hecha dos veces no da dos respuestas sino una.
 */

import { newId } from '@/lib/ids';

/**
 * Tope de elementos por formulario.
 *
 * Veinticuatro: un cuestionario de alta completo de los que sustituyen a un Word
 * de trece páginas ronda los veinte. Más que eso no se contesta desde un móvil,
 * y el tope también protege la columna `preferences` del entrenador, que
 * comparte con el panel, las plantillas y los protocolos.
 */
export const MAX_ELEMENTOS = 24;
export const MAX_OPCIONES = 8;
export const MAX_ENUN = 140;
export const MAX_AYUDA = 200;
export const MAX_OPCION = 60;

/** Los límites de una escala. Los mismos que `protocol.js` ya usa. */
export const ESCALA_MIN = 0;
export const ESCALA_MAX = 10;

// ── Dónde cae una respuesta ────────────────────────────────────────────────

/**
 * Los destinos posibles.
 *
 * `dice` es lo que se lee en el renglón del constructor, en minúsculas y sin
 * punto, porque va detrás del enunciado y no es una frase suya.
 */
export const DESTINOS = [
  { id: 'respuesta', dice: 'con la entrega', largo: 'Se guarda con la entrega' },
  { id: 'serie', dice: 'a una serie suya', largo: 'Se dibuja como serie en su progreso' },
  { id: 'antro', dice: 'a su antropometría', largo: 'Entra en su antropometría' },
  { id: 'ficha', dice: 'a su ficha', largo: 'Actualiza su ficha' },
  { id: 'salud', dice: 'a sus condicionantes', largo: 'Entra en sus condicionantes' },
  { id: 'equipo', dice: 'a su maquinaria', largo: 'Entra en la maquinaria de su gimnasio' },
  { id: 'consent', dice: 'a sus consentimientos', largo: 'Queda como consentimiento con su fecha' },
  { id: 'fotos', dice: 'a su archivo de fotos', largo: 'Se guardan en su archivo, con su semana' },
  { id: 'nada', dice: '', largo: 'No pregunta nada' },
];

export const destinoById = (id) => DESTINOS.find((d) => d.id === id) || DESTINOS[0];

// ── El catálogo: lo que se puede añadir ────────────────────────────────────

/**
 * Las tres familias, en el orden en que se leen en la lámina.
 *
 * El disco de familia sale de aquí (`tono`), y va por `data-tono` + hsl como el
 * avatar y las etiquetas: `verify-styles.mjs` prohíbe usar la paleta de datos
 * como cromo, y con razón — esa paleta es del dato dentro de un gráfico.
 */
export const FAMILIAS = [
  {
    id: 'pregunta',
    rot: 'Preguntas',
    hint: 'Lo que le preguntas y se guarda con la entrega.',
    tono: 'pregunta',
  },
  {
    id: 'oficio',
    rot: 'Del oficio',
    hint: 'Lo que no se queda en el formulario: entra donde vive ese dato.',
    tono: 'oficio',
  },
  {
    id: 'estructura',
    rot: 'Estructura',
    hint: 'No pregunta nada. Ordena y explica.',
    tono: 'estructura',
  },
];

/**
 * EL CATÁLOGO DE ELEMENTOS.
 *
 * `icono` es el nombre que la pantalla traduce a un icono de `lucide-react`; no
 * se importa aquí porque el dominio no conoce React ni pinta nada.
 */
export const TIPOS = [
  // ── Preguntas ───────────────────────────────────────────────────────────
  { id: 'texto', fam: 'pregunta', label: 'Texto corto', icono: 'texto', cae: 'respuesta' },
  { id: 'parrafo', fam: 'pregunta', label: 'Texto largo', icono: 'parrafo', cae: 'respuesta' },
  { id: 'numero', fam: 'pregunta', label: 'Un número', icono: 'numero', cae: 'respuesta' },
  { id: 'sino', fam: 'pregunta', label: 'Sí o no', icono: 'sino', cae: 'respuesta' },
  { id: 'una', fam: 'pregunta', label: 'Elegir una', icono: 'una', cae: 'respuesta' },
  { id: 'varias', fam: 'pregunta', label: 'Elegir varias', icono: 'varias', cae: 'respuesta' },
  { id: 'escala', fam: 'pregunta', label: 'Una escala', icono: 'escala', cae: 'serie' },
  { id: 'fecha', fam: 'pregunta', label: 'Una fecha', icono: 'fecha', cae: 'respuesta' },
  { id: 'archivo', fam: 'pregunta', label: 'Subir un archivo', icono: 'archivo', cae: 'respuesta' },

  /*
    ── Del oficio ───────────────────────────────────────────────────────────

    Aquí SOLO está lo que de verdad aterriza. La familia entera existe porque su
    promesa —«esto no se queda en el formulario, entra donde vive ese dato»— es
    lo que distingue a este producto de un formulario cualquiera, y una promesa a
    medias es peor que no hacerla: el entrenador contaría con una medida en la
    antropometría de alguien que nunca va a estar ahí.

    Los tres primeros pesan en `anthropometry` al entregar (ver `aterrizar`) y
    las fotos van a su archivo por el asistente de la revisión. Los que faltan
    —su salud a los condicionantes, su maquinaria, su consentimiento con fecha—
    tienen tabla desplegada y les falta el camino de escritura; entran en cuanto
    lo tengan, y no antes.
  */
  { id: 'peso', fam: 'oficio', label: 'Su peso', icono: 'peso', cae: 'antro' },
  { id: 'perimetros', fam: 'oficio', label: 'Sus perímetros', icono: 'cinta', cae: 'antro', guia: true },
  { id: 'pliegues', fam: 'oficio', label: 'Sus pliegues', icono: 'pliegue', cae: 'antro', guia: true },
  /*
    Las fotos SÍ tienen camino de escritura, y por eso entran: no lo tienen por
    `aterrizar` —una foto no es una cifra de la antropometría— sino por el
    asistente de la revisión, que enseña el paso de fotos y las sube a su archivo
    con su semana y su ángulo. Lo que faltaba no era el camino: era declararlas.

    Solo caben donde ese asistente existe, o sea en el check-in de la semana
    (`TIPOS_DE_MOMENTO`). En un formulario suelto prometería una subida por
    ángulos que su pantalla no tiene.
  */
  { id: 'fotos', fam: 'oficio', label: 'Sus fotos de progreso', icono: 'foto', cae: 'fotos' },

  // ── Estructura ──────────────────────────────────────────────────────────
  { id: 'apartado', fam: 'estructura', label: 'Un apartado', icono: 'apartado', cae: 'nada' },
  { id: 'nota', fam: 'estructura', label: 'Un texto', icono: 'nota', cae: 'nada' },
];

export const tipoById = (id) => TIPOS.find((t) => t.id === id) || null;

/** Los tipos de una familia, para pintar la lámina. */
export const tiposDe = (familia) => TIPOS.filter((t) => t.fam === familia);

/** ¿Este elemento pide algo, o solo ordena? */
export const esPregunta = (elem) => {
  const t = tipoById(elem?.tipo);
  return Boolean(t) && t.fam !== 'estructura';
};

/** Los que pueden ser el «de» de una regla: solo los de respuesta cerrada. */
export const CONDICIONABLES = ['sino', 'una', 'escala', 'numero'];

// ── Un elemento recién nacido ──────────────────────────────────────────────

/**
 * Lo que sale al añadir cada tipo.
 *
 * El enunciado nace con el nombre del tipo y no vacío: un renglón sin texto en
 * el lienzo no se puede distinguir de otro, y el primer gesto después de añadir
 * es escribirlo de todas formas. Las piezas del oficio nacen con TODAS las suyas
 * puestas —quien pide perímetros los quiere— y se quitan las que sobren.
 */
export const defaultElemento = (tipo) => {
  const t = tipoById(tipo);
  if (!t) return null;

  const base = { id: newId('el'), tipo, enun: t.label, ayuda: '', oblig: false, cae: t.cae };

  if (tipo === 'una' || tipo === 'varias') return { ...base, ops: ['Sí', 'No'] };
  if (tipo === 'escala') return { ...base, min: 1, max: 10, mejorAbajo: false };
  if (tipo === 'numero') return { ...base, unidad: '' };
  if (tipo === 'perimetros') {
    return { ...base, enun: 'Sus perímetros', piezas: ['pecho', 'brazoD', 'ombligo', 'gluteo', 'musloD', 'gemeloD'] };
  }
  if (tipo === 'pliegues') {
    return { ...base, enun: 'Sus pliegues', piezas: ['tricipital', 'subescapular', 'suprailiaco', 'abdominal'] };
  }
  if (tipo === 'peso') return { ...base, enun: 'Su peso', unidad: 'kg', veces: 1 };
  if (tipo === 'fotos') return { ...base, enun: 'Sus fotos de progreso', ayuda: 'Frente, perfil y espalda' };
  if (tipo === 'apartado') return { ...base, enun: 'Apartado nuevo' };
  if (tipo === 'nota') return { ...base, enun: 'Lo que quieras explicarle antes de pedirle nada.' };

  return base;
};

// ── Saneado ────────────────────────────────────────────────────────────────

const texto = (v, tope) => String(v ?? '').trim().slice(0, tope);

const entero = (v, min, max, porDefecto) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, n));
};

const OPERADORES = ['es', 'noEs', 'mayorQue', 'menorQue'];

/**
 * Un elemento guardado, completado y acotado.
 *
 * Devuelve `null` si el tipo no se conoce, y ese `null` se filtra fuera: un
 * elemento que la aplicación no sabe pintar es peor que no tenerlo, porque el
 * cliente vería un hueco y el entrenador contaría con una respuesta que nunca
 * va a llegar. Es el mismo criterio que `clientProtocol` con las preguntas.
 */
export const sanitizeElemento = (raw) => {
  const t = tipoById(raw?.tipo);
  if (!t || !raw?.id) return null;

  const elem = {
    id: String(raw.id),
    tipo: t.id,
    enun: texto(raw.enun, MAX_ENUN) || t.label,
    ayuda: texto(raw.ayuda, MAX_AYUDA),
    /* La estructura no se puede exigir: no hay nada que contestar. */
    oblig: t.fam !== 'estructura' && raw.oblig === true,
    cae: DESTINOS.some((d) => d.id === raw.cae) ? raw.cae : t.cae,
  };

  /*
    ── DE QUÉ PREGUNTA DEL CATÁLOGO SALIÓ ÉSTA ─────────────────────────────

    Es lo que convierte el catálogo del protocolo en una ESTANTERÍA: coges
    «Adherencia a la dieta», entra en tu formulario como un elemento más y a
    partir de ahí la renombras, le cambias el rango o le pones una regla — pero
    sigue siendo LA MISMA pregunta, porque conserva su id de origen.

    Y eso no es cosmético: el id es la serie. Las respuestas guardadas están
    indexadas por él y el color de la línea sale de él. Sin `origen`, retocar el
    enunciado partiría en dos la gráfica de todos los clientes.

    Los elementos que el entrenador escribe de cero no lo llevan, y esa ausencia
    es la que dice «esta no venía de ninguna parte».
  */
  const origen = texto(raw.origen, 40);
  if (origen) elem.origen = origen;

  if (t.id === 'una' || t.id === 'varias') {
    const ops = (Array.isArray(raw.ops) ? raw.ops : [])
      .map((o) => texto(o, MAX_OPCION))
      .filter(Boolean)
      .slice(0, MAX_OPCIONES);
    /* Sin opciones no es una elección, es un hueco. Se cae a las de fábrica. */
    elem.ops = ops.length > 0 ? ops : ['Sí', 'No'];
  }

  if (t.id === 'escala') {
    const min = entero(raw.min, ESCALA_MIN, ESCALA_MAX - 1, 1);
    elem.min = min;
    elem.max = entero(raw.max, min + 1, ESCALA_MAX, 10);
    elem.mejorAbajo = raw.mejorAbajo === true;
  }

  if (t.id === 'numero' || t.id === 'peso') elem.unidad = texto(raw.unidad, 12);
  /*
    Cuántas veces a la semana se pesa. Vive en el elemento y no fuera porque es
    lo que hace fiable la media, y sin él una ida y vuelta por el lienzo
    convertía «3 a la semana» en «1» sin decir nada. El tope es el mismo que
    `WEIGH_INS_MAX`; se repite aquí como número y no como import para no atar el
    modelo de elementos al del protocolo, y `sanitizeFormulario` lo vuelve a
    acotar al guardar.
  */
  if (t.id === 'peso') elem.veces = entero(raw.veces, 1, 7, 1);

  if (Array.isArray(raw.piezas)) {
    const piezas = raw.piezas.map((p) => texto(p, 40)).filter(Boolean).slice(0, 12);
    if (piezas.length > 0) elem.piezas = piezas;
  }
  if (!elem.piezas && (t.id === 'perimetros' || t.id === 'pliegues')) {
    elem.piezas = defaultElemento(t.id).piezas;
  }

  const regla = raw.regla;
  if (regla && regla.de && OPERADORES.includes(regla.op)) {
    elem.regla = { de: String(regla.de), op: regla.op, valor: texto(regla.valor, MAX_OPCION) };
  }

  return elem;
};

/**
 * La lista entera, saneada.
 *
 * Además del acotado por elemento hace dos cosas que solo se pueden hacer
 * mirando la lista completa:
 *
 *   · **Quitar ids repetidos.** Duplicar un elemento por error dejaría dos
 *     renglones que se seleccionan a la vez y una respuesta que se pisa.
 *   · **Tirar las reglas que no se pueden cumplir**: las que apuntan a un
 *     elemento que no existe, a sí mismo, o a uno POSTERIOR. Sin esto habría
 *     ciclos, y el portal se quedaría decidiendo si enseñar algo que depende de
 *     algo que todavía no ha preguntado.
 */
export const sanitizeElementos = (raw) => {
  const lista = (Array.isArray(raw) ? raw : []).map(sanitizeElemento).filter(Boolean);

  /*
    Se deduplica por IDENTIDAD, que es `origen` cuando lo hay y el id propio
    cuando no. Dos elementos con el mismo `origen` en un formulario son la misma
    pregunta del catálogo puesta dos veces: al resolverse contra el protocolo
    producirían dos entradas con el mismo id, y la segunda se caería más tarde y
    en otro sitio — un elemento que se ve en el lienzo y no llega al cliente.
    Aquí se corta donde se puede explicar.
  */
  const vistos = new Set();
  const unicos = [];
  for (const el of lista) {
    const identidad = el.origen || el.id;
    if (vistos.has(identidad)) continue;
    vistos.add(identidad);
    unicos.push(el);
    if (unicos.length >= MAX_ELEMENTOS) break;
  }

  return unicos.map((el, i) => {
    if (!el.regla) return el;
    const anteriores = unicos.slice(0, i);
    const de = anteriores.find((a) => a.id === el.regla.de);
    if (!de || !CONDICIONABLES.includes(de.tipo)) {
      const limpio = { ...el };
      delete limpio.regla;
      return limpio;
    }
    return el;
  });
};

// ── Operaciones sobre la lista ─────────────────────────────────────────────

export const anadirElemento = (elementos, tipo) => {
  if (elementos.length >= MAX_ELEMENTOS) return elementos;
  const nuevo = defaultElemento(tipo);
  return nuevo ? [...elementos, nuevo] : elementos;
};

/**
 * Quitar uno. Las reglas que apuntaban a él se van con él.
 *
 * No se dejan huérfanas y no se convierten en «siempre visible» en silencio:
 * `sanitizeElementos` las tiraría igual en la siguiente lectura, y entonces el
 * entrenador vería desaparecer una regla sin haber tocado nada.
 */
export const quitarElemento = (elementos, id) =>
  sanitizeElementos(elementos.filter((el) => el.id !== id));

export const moverElemento = (elementos, id, direccion) => {
  const i = elementos.findIndex((el) => el.id === id);
  const j = direccion === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= elementos.length) return elementos;
  const copia = [...elementos];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  /* Mover puede dejar una regla mirando hacia delante: el saneado la retira. */
  return sanitizeElementos(copia);
};

export const editarElemento = (elementos, id, patch) =>
  elementos.map((el) => (el.id === id ? sanitizeElemento({ ...el, ...patch }) || el : el));

/** Los elementos que pueden ser el «de» de la regla de éste: los anteriores. */
export const candidatosDeRegla = (elementos, id) => {
  const i = elementos.findIndex((el) => el.id === id);
  if (i <= 0) return [];
  return elementos.slice(0, i).filter((el) => CONDICIONABLES.includes(el.tipo));
};

/** El valor con el que nace una regla recién puesta, según de quién dependa. */
export const reglaPorDefecto = (de) => {
  if (!de) return null;
  if (de.tipo === 'sino') return { de: de.id, op: 'es', valor: 'si' };
  if (de.tipo === 'una') return { de: de.id, op: 'es', valor: (de.ops || [''])[0] };
  return { de: de.id, op: 'mayorQue', valor: String(de.min ?? 0) };
};

// ── Las reglas, leídas y obedecidas ────────────────────────────────────────

const VERBO_OP = {
  es: 'es',
  noEs: 'no es',
  mayorQue: 'es mayor que',
  menorQue: 'es menor que',
};

/** Cómo se dice un valor. `si`/`no` se guardan así y se leen «Sí»/«No». */
export const valorLegible = (valor) => {
  if (valor === 'si') return 'Sí';
  if (valor === 'no') return 'No';
  return String(valor ?? '');
};

/**
 * La regla, escrita como se lee.
 *
 * Es la pieza que el encargo pedía por su nombre («reglas escritas»): una
 * condición no se enseña como tres desplegables, se enseña como una frase. La
 * componen el constructor y el renglón del lienzo, y por eso vive aquí y no en
 * un componente.
 */
export const fraseDeRegla = (elem, elementos) => {
  if (!elem?.regla) return '';
  const de = elementos.find((e) => e.id === elem.regla.de);
  if (!de) return '';
  return `solo si ${VERBO_OP[elem.regla.op]} ${valorLegible(elem.regla.valor)} en «${de.enun}»`;
};

const vacio = (v) => v === undefined || v === null || v === '' ||
  (Array.isArray(v) && v.length === 0);

/**
 * ¿Se le enseña este elemento, con lo que lleva contestado?
 *
 * Sin regla, siempre. Con regla, se compara contra la respuesta del elemento del
 * que depende. **Una respuesta que todavía no existe no cumple ninguna regla**:
 * el elemento condicionado aparece cuando se contesta lo de arriba, y no antes.
 */
export const visible = (elem, respuestas = {}) => {
  if (!elem?.regla) return true;
  const dado = respuestas[elem.regla.de];
  if (vacio(dado)) return false;

  const { op, valor } = elem.regla;
  if (op === 'es') return String(dado) === String(valor);
  if (op === 'noEs') return String(dado) !== String(valor);

  const n = Number(dado);
  const v = Number(valor);
  if (!Number.isFinite(n) || !Number.isFinite(v)) return false;
  return op === 'mayorQue' ? n > v : n < v;
};

/** La lista que de verdad se le enseña. La usan el portal y la vista previa. */
export const elementosVisibles = (elementos, respuestas = {}) =>
  (elementos || []).filter((el) => visible(el, respuestas));

/**
 * Las obligatorias que faltan, para poder entregar.
 *
 * Solo cuentan las VISIBLES: exigir una pregunta que la regla esconde dejaría al
 * cliente atrapado en un formulario que no puede terminar y sin ver por qué.
 */
export const faltanObligatorias = (elementos, respuestas = {}) =>
  elementosVisibles(elementos, respuestas).filter(
    (el) => el.oblig && esPregunta(el) && vacio(respuestas[el.id])
  );

// ── Lectura ────────────────────────────────────────────────────────────────

export const cuentaElementos = (elementos) => (elementos || []).filter(esPregunta).length;

export const cuentaApartados = (elementos) =>
  (elementos || []).filter((el) => el.tipo === 'apartado').length;

/** Lo que lleva puesto, en una frase para la columna de la lista. */
export const resumenElementos = (elementos) => {
  const n = cuentaElementos(elementos);
  const oficio = (elementos || []).filter((el) => tipoById(el.tipo)?.fam === 'oficio').length;
  const preguntas = `${n} ${n === 1 ? 'elemento' : 'elementos'}`;
  return oficio > 0 ? `${preguntas} · ${oficio} del oficio` : preguntas;
};

/** Las columnas de la tabla de un envío: una por pregunta, en orden. */
export const columnasDe = (elementos) =>
  (elementos || []).filter(esPregunta).map((el) => ({ id: el.id, rot: el.enun, tipo: el.tipo }));

/**
 * Una respuesta, dicha en una celda.
 *
 * Las de varias se juntan con coma; las de sí/no se leen; lo que no ha llegado
 * es una raya y no una celda vacía, que se confundiría con un fallo de pintado.
 */
export const respuestaLegible = (elem, valor) => {
  if (vacio(valor)) return '—';
  if (Array.isArray(valor)) return valor.join(', ');
  if (elem?.tipo === 'sino') return valorLegible(valor);
  if (elem?.tipo === 'archivo') return 'Adjunto';
  return String(valor);
};

// ── Dónde cae de verdad lo que se contesta ─────────────────────────────────

/**
 * ATERRIZAR: lo del oficio sale del formulario y entra donde vive ese dato.
 *
 * Es la promesa de la familia «del oficio», hecha de verdad. Sin esto, «sus
 * perímetros» sería una pregunta bonita cuyo resultado se queda en un JSON que
 * nadie mira: el entrenador iría a la antropometría de esa persona y no habría
 * nada, porque la medida se tomó y se guardó en otro sitio.
 *
 * ── Una sola medición, no tres ────────────────────────────────────────────
 * Peso, perímetros y pliegues del mismo formulario son la MISMA medición: se han
 * tomado el mismo día y con las mismas condiciones. Van a un solo registro, que
 * es lo que `anthropometry` espera —una fila por fecha— y lo que hace que la
 * tendencia se lea. Tres registros del mismo día se pisarían entre ellos:
 * `addAnthropometryLog` reemplaza por fecha.
 *
 * Devuelve `null` si no hay nada que aterrizar, y quien llama no escribe.
 */
export const aterrizar = (elementos, respuestas = {}, fecha = null) => {
  let weight;
  const perimeters = {};
  const folds = {};

  for (const elem of elementos || []) {
    const dado = respuestas[elem.id];
    if (vacio(dado)) continue;

    if (elem.tipo === 'peso') weight = dado;
    if (elem.tipo === 'perimetros' || elem.tipo === 'pliegues') {
      /* Las piezas llegan como objeto {pecho: 98, brazoD: 38}: es el elemento el
         que agrupa varias medidas, no una respuesta suelta. */
      const destino = elem.tipo === 'perimetros' ? perimeters : folds;
      for (const [pieza, valor] of Object.entries(dado || {})) {
        if (!vacio(valor)) destino[pieza] = valor;
      }
    }
  }

  const hayMedidas = Object.keys(perimeters).length > 0 || Object.keys(folds).length > 0;
  if (vacio(weight) && !hayMedidas) return null;

  return { date: fecha, weight, perimeters, folds };
};

/** ¿Este formulario toca la antropometría? Para avisarlo en el constructor. */
export const tocaAntropometria = (elementos) =>
  (elementos || []).some((el) => ['peso', 'perimetros', 'pliegues'].includes(el.tipo));

// ── Las plantillas de fábrica ──────────────────────────────────────────────

/**
 * POR DÓNDE EMPEZAR.
 *
 * El encargo lo pedía por su nombre: «poder copiar plantillas de formularios».
 * Se COPIAN y no se usan ligadas — tocar una plantilla no puede cambiar lo que
 * alguien ya tiene puesto, que es la avería clásica de las plantillas vivas.
 *
 * El contenido es de verdad: son los cuestionarios que un entrenador manda, con
 * las preguntas que hace y en el orden en que las hace. Una galería de plantillas
 * vacías es una galería de deberes.
 */
const el = (tipo, enun, extra = {}) => ({ ...defaultElemento(tipo), enun, ...extra });

export const PLANTILLAS = [
  {
    id: 'blanco',
    name: 'En blanco',
    dice: 'Empiezas por el primer elemento',
    elementos: () => [],
  },
  {
    id: 'sueno',
    name: 'Hábitos de sueño',
    dice: '4 preguntas · para saber por qué no rinde',
    elementos: () => [
      el('numero', '¿Cuántas horas duermes de media?', { unidad: 'horas', oblig: true }),
      el('sino', '¿Duermes del tirón?'),
      el('parrafo', '¿Qué te lo estropea?', {
        regla: null,
        ayuda: 'Ruido, el móvil, turnos, los niños, la cabeza…',
      }),
      el('escala', 'Cómo te levantas de descansado', { min: 1, max: 10 }),
    ],
  },
  {
    id: 'lesiones',
    name: 'Historial de lesiones',
    dice: '5 elementos · con reglas',
    elementos: () => {
      const tiene = el('sino', '¿Arrastras alguna lesión ahora mismo?', { oblig: true, cae: 'salud' });
      const cual = el('parrafo', '¿Cuál, y desde cuándo?', { cae: 'salud' });
      cual.regla = { de: tiene.id, op: 'es', valor: 'si' };
      const operado = el('sino', '¿Te han operado alguna vez?', { cae: 'salud' });
      const deQue = el('parrafo', '¿De qué y cuándo?', { cae: 'salud' });
      deQue.regla = { de: operado.id, op: 'es', valor: 'si' };
      return [
        el('apartado', 'Lo que te limita hoy'),
        tiene,
        cual,
        operado,
        deQue,
      ];
    },
  },
  {
    id: 'revision',
    name: 'Revisión con medidas',
    dice: '2 preguntas · 9 medidas y fotos',
    elementos: () => [
      el('nota', 'Hazlo por la mañana, en ayunas y después de ir al baño. Siempre igual.'),
      el('peso', 'Tu peso de hoy', { oblig: true }),
      el('perimetros', 'Tus perímetros'),
      el('escala', 'Cómo te ves esta semana', { min: 1, max: 10 }),
      el('parrafo', '¿Algo que deba saber antes de tocarte el plan?'),
    ],
  },
  {
    id: 'comida',
    name: 'Preferencias de comida',
    dice: '6 elementos · alergias y aversiones',
    elementos: () => [
      el('apartado', 'Lo que no puedes comer'),
      el('parrafo', '¿Tienes alguna alergia o intolerancia?', { oblig: true }),
      el('parrafo', '¿Qué no comes por gusto?', { ayuda: 'Sé concreto: «pescado azul», no «pescado».' }),
      el('apartado', 'Cómo comes'),
      el('numero', '¿Cuántas comidas haces al día?', { unidad: 'comidas', cae: 'ficha' }),
      el('varias', '¿Qué días comes fuera?', {
        ops: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
      }),
    ],
  },
  {
    id: 'marcas',
    name: 'Marcas de fuerza',
    dice: '4 números · para ajustar cargas',
    elementos: () => [
      el('nota', 'Pon tu mejor marca reciente, no la de tu vida.'),
      el('numero', 'Sentadilla', { unidad: 'kg', oblig: true }),
      el('numero', 'Press de banca', { unidad: 'kg', oblig: true }),
      el('numero', 'Peso muerto', { unidad: 'kg', oblig: true }),
      el('una', '¿A cuántas repeticiones?', { ops: ['1', '3', '5', '8 o más'] }),
    ],
  },
  {
    id: 'viaje',
    name: 'Se va de viaje',
    dice: '5 elementos · para no perder la semana',
    elementos: () => {
      const gimnasio = el('sino', '¿Vas a tener gimnasio?', { oblig: true });
      const que = el('varias', '¿Con qué vas a contar?', {
        ops: ['Mancuernas', 'Barra', 'Máquinas', 'Poleas', 'Solo mi peso'],
      });
      que.regla = { de: gimnasio.id, op: 'es', valor: 'si' };
      return [
        el('nota', 'Cuéntame esto antes de irte y te dejo la semana montada.'),
        el('numero', '¿Cuántos días estarás fuera?', { unidad: 'días', oblig: true }),
        gimnasio,
        que,
        el('parrafo', '¿Cómo va a ser la comida?'),
      ];
    },
  },
  {
    id: 'satisfaccion',
    name: 'Qué tal lo hago',
    dice: '4 preguntas · una vez al trimestre',
    elementos: () => [
      el('escala', 'Del 1 al 10, ¿cómo de contento estás?', { min: 1, max: 10, oblig: true }),
      el('una', '¿Te contesto lo bastante rápido?', { ops: ['Sí', 'Podría ser mejor', 'No'] }),
      el('parrafo', '¿Qué te sobra de lo que hacemos?'),
      el('parrafo', '¿Qué echas de menos?'),
    ],
  },
];

export const plantillaById = (id) => PLANTILLAS.find((p) => p.id === id) || null;

/** Los elementos de una plantilla, ya con ids nuevos y saneados. */
export const elementosDePlantilla = (id) => {
  const p = plantillaById(id);
  return p ? sanitizeElementos(p.elementos()) : [];
};

/** Copiar los de otro formulario: mismos elementos, ids nuevos. */
export const duplicarElementos = (elementos) => {
  const mapa = new Map();
  const copia = (elementos || []).map((elem) => {
    const id = newId('el');
    mapa.set(elem.id, id);
    return { ...elem, id };
  });
  return sanitizeElementos(
    copia.map((elem) =>
      elem.regla ? { ...elem, regla: { ...elem.regla, de: mapa.get(elem.regla.de) } } : elem
    )
  );
};
