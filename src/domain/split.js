import { cadenaDe, dayPlannedVolume, entrenosDe, normalizaMicrociclo, normalizeMuscle, tandasDe } from './training';

/**
 * EL NOMBRE DEL SPLIT, deducido de sus hojas (24 sep 2026).
 *
 * «Torso / Pierna · 4 días», «Push Pull Legs 2-1». Es lo que un entrenador
 * diría del bloque sin mirarlo: qué tipo de día es cada hoja y con qué ritmo se
 * repiten. Si el entrenador le puso nombre (`block.split`), manda el suyo: así
 * cabe el apellido de método que ningún dato dice («Torso / Brazo density»).
 *
 * Cada hoja se clasifica en dos pasos:
 *   1. Por su NOMBRE: «Upper A», «Pierna B», «Push» ya lo dicen.
 *   2. Si el nombre no dice nada («Día 1»), por el REPARTO DE SERIES por
 *      músculo. Abdominales y «Otros» no cuentan: no definen el tipo de día.
 * Una hoja sin series y sin nombre que la delate no se clasifica.
 */

export const TIPOS_DE_DIA = ['Torso', 'Pierna', 'Push', 'Pull', 'Full body', 'Brazo'];

/* Los umbrales, sobre las series de los músculos que cuentan. */
export const UMBRAL_PIERNA = 0.7;
export const UMBRAL_EMPUJE = 0.6;
export const UMBRAL_TIRON = 0.6;
export const UMBRAL_BRAZO = 0.6;
export const UMBRAL_FULL_BODY = 0.25;

const PIERNA = new Set(['Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Aductor', 'Gemelo']);
const EMPUJE = new Set(['Pecho', 'Deltoides Anterior', 'Deltoides Lateral', 'Tríceps']);
const TIRON = new Set(['Dorsal', 'Espalda Alta', 'Deltoides Posterior', 'Bíceps']);
const BRAZO = new Set(['Bíceps', 'Tríceps']);

/* Palabras enteras, sin tildes ni mayúsculas. Plurales incluidos. */
const PALABRAS = [
  ['Full body', /\b(full ?body|full|cuerpo completo)\b/],
  ['Torso', /\b(torso|upper)\b/],
  ['Pierna', /\b(piernas?|lower|legs?)\b/],
  ['Push', /\b(push|empujes?)\b/],
  ['Pull', /\b(pull|tiron(es)?)\b/],
  ['Brazo', /\b(brazos?|arms?)\b/],
];

const plano = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** El tipo que dice el nombre, o `null`. Con dos, el que aparece antes. */
const tipoPorNombre = (nombre) => {
  const texto = plano(nombre);
  let mejor = null;
  for (const [tipo, re] of PALABRAS) {
    const m = re.exec(texto);
    if (m && (mejor === null || m.index < mejor.en)) mejor = { tipo, en: m.index };
  }
  return mejor?.tipo || null;
};

/**
 * El tipo que dicen sus series. El de brazo se mira antes que empuje y tirón:
 * es el más estrecho, y un día de brazo con más tríceps que bíceps no es Push.
 */
const tipoPorMusculos = (hoja) => {
  let pierna = 0;
  let empuje = 0;
  let tiron = 0;
  let brazo = 0;
  for (const [crudo, series] of Object.entries(dayPlannedVolume(hoja))) {
    const m = normalizeMuscle(crudo)?.muscle;
    if (PIERNA.has(m)) pierna += series;
    if (EMPUJE.has(m)) empuje += series;
    if (TIRON.has(m)) tiron += series;
    if (BRAZO.has(m)) brazo += series;
  }
  const total = pierna + empuje + tiron;
  if (total === 0) return null;
  const superior = empuje + tiron;
  if (pierna / total >= UMBRAL_PIERNA) return 'Pierna';
  if (brazo / total >= UMBRAL_BRAZO) return 'Brazo';
  if (empuje / total >= UMBRAL_EMPUJE) return 'Push';
  if (tiron / total >= UMBRAL_TIRON) return 'Pull';
  if (pierna / total >= UMBRAL_FULL_BODY && superior / total >= UMBRAL_FULL_BODY) return 'Full body';
  if (empuje > 0 && tiron > 0) return 'Torso';
  return null;
};

/** El tipo de día de una hoja (`{ dayName, exercises }`), o `null`. */
export const tipoDeHoja = (hoja) => tipoPorNombre(hoja?.dayName) || tipoPorMusculos(hoja);

const es = (tipos, ...quiere) => tipos.length === quiere.length && quiere.every((t) => tipos.includes(t));

/** El nombre del conjunto de tipos, en orden de aparición. */
const nombreDeTipos = (tipos) => {
  if (es(tipos, 'Torso', 'Pierna')) return 'Torso / Pierna';
  if (es(tipos, 'Push', 'Pull', 'Pierna')) return 'Push Pull Legs';
  if (es(tipos, 'Push', 'Pull', 'Pierna', 'Torso')) return 'PPL + Torso / Pierna';
  return tipos.join(' / ');
};

/* La forma corta, para donde no cabe más (las filas del roadmap). */
const CORTOS = {
  'Torso / Pierna': 'T/P',
  'Push Pull Legs': 'PPL',
  'PPL + Torso / Pierna': 'PPL + T/P',
};

/**
 * El ritmo de un rotativo, como lo escribió el entrenador. Es `cadenaDe` salvo
 * en un caso: «2-1» con tres hojas genera P P · L · (`generarSecuencia` con
 * una tanda cierra la última aunque quede corta), que `cadenaDe` lee
 * «2-1 1-1». Para el nombre es «2-1»: todas las tandas iguales menos la
 * última, más corta y con el mismo descanso, es una tanda repetida.
 */
const ritmoDe = (dias) => {
  const tandas = tandasDe(dias);
  const [primera] = tandas;
  const ultima = tandas[tandas.length - 1];
  const repetida =
    tandas.length > 1 &&
    tandas.slice(0, -1).every((t) => t.entreno === primera.entreno && t.descanso === primera.descanso) &&
    ultima.entreno < primera.entreno &&
    ultima.descanso === primera.descanso;
  return repetida ? `${primera.entreno}-${primera.descanso}` : cadenaDe(dias);
};

/**
 * Lo que se deduce de un bloque: el nombre de los tipos y el ritmo, por
 * separado. Base de las dos formas que se exportan.
 */
const deducir = (bloque, hojas, microciclo) => {
  const mc = microciclo || normalizaMicrociclo(bloque?.microciclo);
  const entrenos = entrenosDe(mc);
  const lista = (hojas || []).filter((h) => h?.dayName);

  /* En orden de aparición: primero como caen en la secuencia, detrás las que
     no caen en ningún día, que siguen siendo del plan. */
  const orden = [];
  for (const d of mc?.dias || []) if (!d.descanso && d.hoja && !orden.includes(d.hoja)) orden.push(d.hoja);
  for (const h of lista) if (!orden.includes(h.dayName)) orden.push(h.dayName);

  const tipos = [];
  for (const nombre of orden) {
    const tipo = tipoDeHoja(lista.find((h) => h.dayName === nombre) || { dayName: nombre });
    if (tipo && !tipos.includes(tipo)) tipos.push(tipo);
  }

  const dias = `${entrenos} ${entrenos === 1 ? 'día' : 'días'}`;
  const ritmo = mc?.tipo === 'rotativo' ? ritmoDe(mc.dias) : null;
  return { tipos: tipos.length > 0 ? nombreDeTipos(tipos) : null, dias, ritmo, entrenos };
};

/**
 * EL NOMBRE DEL SPLIT de un bloque.
 *
 *   · Semanal:  «Torso / Pierna · 4 días».
 *   · Rotativo: «Push Pull Legs 2-1», «Torso / Pierna 3-1», con su cadena
 *     (`ritmoDe`; los asimétricos, deletreados).
 *   · Sin tipos que deducir (sin hojas o sin series): solo «4 días».
 *   · Con nombre del entrenador (`bloque.split`): el suyo, sin más.
 *
 * @param bloque     El bloque; de él salen `split` y, si no llega otro,
 *                   el microciclo guardado.
 * @param hojas      Sus hojas con ejercicios: `[{ dayName, exercises }]`.
 * @param microciclo El microciclo ya leído, para los bloques que no lo tienen
 *                   guardado (`microcicloDelBloque`).
 * @returns El nombre, o `null` si no hay ni nombre ni entrenos.
 */
export const nombreDelSplit = (bloque, hojas = [], microciclo = null) => {
  const propio = String(bloque?.split ?? '').trim();
  if (propio) return propio;
  const { tipos, dias, ritmo, entrenos } = deducir(bloque, hojas, microciclo);
  if (entrenos === 0) return null;
  if (!tipos) return dias;
  return ritmo ? `${tipos} ${ritmo}` : `${tipos} · ${dias}`;
};

/**
 * LA FORMA CORTA, para las filas del roadmap: «T/P · 4d», «PPL 2-1». Con
 * nombre del entrenador, el suyo (ya lo escribió él lo corto que quiso).
 */
export const nombreCortoDelSplit = (bloque, hojas = [], microciclo = null) => {
  const propio = String(bloque?.split ?? '').trim();
  if (propio) return propio;
  const { tipos, ritmo, entrenos } = deducir(bloque, hojas, microciclo);
  if (entrenos === 0) return null;
  const dias = `${entrenos}d`;
  if (!tipos) return dias;
  const corto = CORTOS[tipos] || tipos;
  return ritmo ? `${corto} ${ritmo}` : `${corto} · ${dias}`;
};
