/**
 * LAS MEDIDAS: lo que se apunta con un aparato.
 *
 * ══ La distinción que el producto no había hecho ═══════════════════════════
 *
 * El mecanismo para apuntar un número y verlo como serie ya existía: una
 * pregunta de escala del protocolo produce una serie con su color y su
 * histórico. Lo que no existía era la diferencia entre **opinar** y **medir**.
 *
 * El saneado del cuestionario capa todo a enteros de 0 a 10 sin unidad
 * (`sanitizeCustom` en `protocol.js`), y eso es exactamente lo correcto para
 * «¿cómo has dormido?» y exactamente imposible para lo demás: una temperatura
 * basal (36,4 °C) no tiene decimales dónde caer; una glucosa en ayunas (95
 * mg/dL) se sale del rango; una tensión sistólica no tiene dónde decir que es
 * mmHg. Y ninguna de las tres es una escala subjetiva.
 *
 *     Una PREGUNTA es una opinión con forma de número.
 *     Una MEDIDA es un número con unidad que alguien ha tomado con un aparato.
 *
 * ══ Y los pliegues y los perímetros son medidas ════════════════════════════
 *
 * Estaban escritos a mano como dos constantes (`FOLDS_LABELS`,
 * `PERIMETER_LABELS`) y como dos bloques fijos del check-in
 * (`CHECKIN_BLOCKS`), y fuera de esa lista no había nada que medir. Aquí son
 * las dos primeras entradas del catálogo, con la misma gramática de tres
 * estados que ya tenían —obligatorio / opcional / apagado—, que es lo que hace
 * esto barato en vez de un módulo nuevo: la gramática ya era la correcta; lo
 * único que había que quitar es que la lista fuera fija.
 *
 * ══ Qué viene de fábrica, y por qué ════════════════════════════════════════
 *
 * Glucosa, temperatura basal, frecuencia cardíaca en reposo y tensión. Son las
 * cuatro que un entrenador pide de verdad, y vienen **diseñadas de base** —con
 * su unidad, sus decimales y su rango de cordura— por la misma razón por la que
 * los pliegues no se escriben a mano: si cada uno tiene que definirlas, cada uno
 * las define distinto y dos clientes del mismo entrenador acaban con «Glucosa» y
 * «glucemia» en dos series que no se pueden comparar.
 *
 * **Todas nacen apagadas** salvo las dos de siempre, que conservan su
 * «opcional»: quien no toque nada no puede notar el cambio, que es la regla de
 * la casa para todo lo que se añade al check-in de alguien.
 *
 * ══ Dónde vive lo que el entrenador añada ══════════════════════════════════
 *
 * En `preferences.medidas` del entrenador: el sitio y el patrón de los grupos
 * de equivalencia —criterio suyo, columna abierta, sin migración—. Una
 * definición son unos ochenta bytes y con doce basta: nadie lleva cuarenta
 * instrumentos.
 *
 * Y lo medido se guarda donde ya se guardan los pliegues, en `history`:
 *
 *     { id, date, weight?, skinFolds?, perimeters?, medidas?: { [id]: valor } }
 *
 * `history` es jsonb, así que tampoco hay migración. `null` sigue significando
 * «no medido» y no cero — que en una glucosa no es un matiz, es la diferencia
 * entre un hueco y una hipoglucemia.
 *
 * ══ LA LEY DE LA CASA: esto no interpreta ══════════════════════════════════
 *
 * Una medida es un número con unidad y su serie. No lleva rango «normal», no se
 * pinta en rojo por salirse de nada y no dice una palabra sobre lo que
 * significa. El `min`/`max` es un filtro de dedazos al teclear —para no guardar
 * un 950 de glucosa por un dedo de más—, **no un diagnóstico**.
 */

import { toNum } from '@/lib/num';
import { norm } from '@/lib/texto';
import { FOLDS_LABELS, PERIMETER_LABELS, chronological } from './anthropometry';

/** Cuándo se apunta cada medida. */
export const CUANDOS = [
  { id: 'revision', label: 'En cada revisión', hint: 'Un paso más de su asistente de revisión.' },
  { id: 'diaria', label: 'A diario', hint: 'Una fila más de la rejilla de la semana.' },
];

const CUANDO_IDS = CUANDOS.map((c) => c.id);

/** Si subir es bueno, malo o ninguna de las dos. Decide el signo de la variación. */
const SENTIDOS = ['neutral', 'lowerIsBetter', 'higherIsBetter'];

/**
 * Las dos de siempre: no son un valor, son un grupo de casillas.
 *
 * `campos` es lo que las distingue del resto del catálogo, y por eso viven aquí
 * y no se pueden inventar: su formulario, su guía de medición y su fórmula del
 * % graso están escritos contra esas claves concretas.
 */
export const MEDIDAS_DE_GRUPO = [
  {
    id: 'perimeters',
    label: 'Perímetros corporales',
    hint: 'Cintura, cadera, brazo… Se miden con una cinta métrica.',
    unit: 'cm',
    decimals: 1,
    campos: PERIMETER_LABELS,
    cuando: 'revision',
    modo: 'optional',
  },
  {
    id: 'folds',
    label: 'Pliegues cutáneos',
    hint: 'Los seis pliegues del % graso. Hace falta plicómetro y buena mano.',
    unit: 'mm',
    decimals: 1,
    campos: FOLDS_LABELS,
    cuando: 'revision',
    modo: 'optional',
  },
];

/**
 * Las de fábrica de un solo valor. Nacen APAGADAS: se encienden cuando alguien
 * las pide, no cuando la aplicación decide que están ahí.
 *
 * `grupo` junta las dos de la tensión bajo un mismo rótulo en el formulario. Son
 * dos medidas y no una porque son dos series: la sistólica y la diastólica se
 * dibujan por separado y se leen por separado.
 */
export const MEDIDAS_DE_FABRICA = [
  {
    id: 'glucose',
    label: 'Glucosa en ayunas',
    hint: 'Con glucómetro, en ayunas y antes de desayunar.',
    unit: 'mg/dL',
    decimals: 0,
    min: 20,
    max: 600,
    cuando: 'revision',
    sentido: 'neutral',
    color: 'var(--data-rose)',
  },
  {
    id: 'temperature',
    label: 'Temperatura basal',
    hint: 'Nada más despertarse, antes de levantarse de la cama.',
    unit: '°C',
    decimals: 1,
    min: 30,
    max: 43,
    cuando: 'diaria',
    sentido: 'neutral',
    /* Ámbar desde el 20 sep: era `--data-orange`, que se retira por estar a 8°
       del naranja del aviso. De las cinco medidas de fábrica, el ámbar era la
       única tinta libre —glucosa roja, pulso teal, tensiones violeta y gris— y
       además es la que se lee como temperatura sin explicarla. */
    color: 'var(--data-amber)',
  },
  {
    id: 'restingHr',
    label: 'Frecuencia cardíaca en reposo',
    hint: 'En reposo, sentado o recién despertado.',
    unit: 'lpm',
    decimals: 0,
    min: 25,
    max: 200,
    cuando: 'diaria',
    sentido: 'neutral',
    color: 'var(--data-teal)',
  },
  {
    id: 'bpSystolic',
    label: 'Tensión sistólica',
    grupo: 'Tensión arterial',
    unit: 'mmHg',
    decimals: 0,
    min: 60,
    max: 260,
    cuando: 'revision',
    sentido: 'neutral',
    color: 'var(--data-violet)',
  },
  {
    id: 'bpDiastolic',
    label: 'Tensión diastólica',
    grupo: 'Tensión arterial',
    unit: 'mmHg',
    decimals: 0,
    min: 30,
    max: 180,
    cuando: 'revision',
    sentido: 'neutral',
    color: 'var(--data-slate)',
  },
];

/** Las que no se pueden borrar ni redefinir: vienen con el producto. */
export const MEDIDAS_FIJAS = [...MEDIDAS_DE_GRUPO, ...MEDIDAS_DE_FABRICA];

const FIJAS_POR_ID = new Map(MEDIDAS_FIJAS.map((m) => [m.id, m]));

/**
 * Tope de medidas propias.
 *
 * No es una limitación de producto, es la columna: `preferences` está capada a
 * 8 KB y ese tope protege la fila de que cualquiera con la anon key la engorde.
 * Doce definiciones son cerca de un kilobyte.
 */
export const MAX_MEDIDAS = 12;

export const MAX_MEDIDA_NAME = 40;
export const MAX_MEDIDA_UNIT = 10;

/**
 * Color de las medidas propias: rotan por la paleta de datos, como las
 * preguntas.
 *
 * Desde el 20 sep la rueda son EXACTAMENTE las seis tintas categóricas de la
 * casa, en el orden en que se reparten (ver `docs/lenguaje-visual.md` §7.3).
 * Entró el rojo en lugar del lima, que se retira.
 *
 * Seis y no siete: `--data-slate` queda fuera a propósito. Es la tinta de «la
 * referencia» —lo comparado, el fantasma, lo que no lleva color— y tiene que
 * sobrar siempre, o deja de significar eso. Es también lo que contesta
 * `medidaColor` cuando una medida no dice color.
 */
const COLORES = [
  'var(--data-rose)',
  'var(--data-blue)',
  'var(--data-pink)',
  'var(--data-amber)',
  'var(--data-violet)',
  'var(--data-teal)',
];

const clamp = (n, min, max, porDefecto) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return porDefecto;
  return Math.min(max, Math.max(min, v));
};

/**
 * Una medida guardada, completada y acotada. `null` si ni siquiera trae nombre.
 *
 * Un id de los fijos NO se puede redefinir: se devuelve el de fábrica. Es lo que
 * impide que una definición escrita a mano en la columna convierta los pliegues
 * en otra cosa y deje el formulario del check-in sin sus seis casillas.
 */
export const sanitizeMedida = (raw, indice = 0) => {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  if (FIJAS_POR_ID.has(id)) return FIJAS_POR_ID.get(id);

  const label = String(raw.label ?? '').trim().slice(0, MAX_MEDIDA_NAME);
  if (!label) return null;

  const min = clamp(raw.min, -10000, 100000, 0);
  const max = clamp(raw.max, min + 1, 100000, Math.max(min + 1, 1000));

  return {
    id,
    label,
    unit: String(raw.unit ?? '').trim().slice(0, MAX_MEDIDA_UNIT),
    /* Dos decimales es el tope: por debajo del centésimo, ningún aparato de los
       que usa un entrenador distingue nada y lo que se gana es ruido. */
    decimals: clamp(raw.decimals, 0, 2, 0),
    min,
    max,
    cuando: CUANDO_IDS.includes(raw.cuando) ? raw.cuando : 'revision',
    sentido: SENTIDOS.includes(raw.sentido) ? raw.sentido : 'neutral',
    color: COLORES[indice % COLORES.length],
    ...(String(raw.hint ?? '').trim() ? { hint: String(raw.hint).trim().slice(0, 140) } : {}),
  };
};

/**
 * EL CATÁLOGO DE UN ENTRENADOR: las de fábrica y las suyas.
 *
 * Las fijas van primero y siempre, incluso si alguien vacía la columna: son el
 * vocabulario del producto, y una lista guardada no puede quitarlas.
 */
export const coachMedidas = (preferences) => {
  const raw = Array.isArray(preferences?.medidas?.items) ? preferences.medidas.items : [];
  const propias = [];

  for (const item of raw) {
    if (propias.length >= MAX_MEDIDAS) break;
    const sana = sanitizeMedida(item, propias.length);
    /* Las fijas coladas en la lista se ignoran: ya están, y contarlas gastaría
       el cupo de lo que de verdad ha inventado el entrenador. */
    if (!sana || FIJAS_POR_ID.has(sana.id)) continue;
    if (propias.some((m) => m.id === sana.id)) continue;
    propias.push(sana);
  }

  return [...MEDIDAS_FIJAS, ...propias];
};

export const medidasToPreferences = (lista) => ({
  items: lista.filter((m) => !FIJAS_POR_ID.has(m.id)).slice(0, MAX_MEDIDAS),
});

/** ¿Es de las que vienen con el producto? Las fijas no se borran ni se editan. */
export const esFija = (id) => FIJAS_POR_ID.has(id);

/** ¿Es un grupo de casillas —pliegues, perímetros— y no un valor suelto? */
export const esGrupo = (medida) => Boolean(medida?.campos);

/**
 * Una medida nueva, del entrenador. El id sale del nombre para que dos clientes
 * del mismo entrenador compartan serie: «Glucosa postprandial» escrita dos veces
 * es la misma medida, no dos.
 */
export const buildMedida = ({ label, unit = '', decimals = 0, min = 0, max = 1000, cuando = 'revision' }) => ({
  id: `m_${norm(label).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || Date.now()}`,
  label: String(label).trim().slice(0, MAX_MEDIDA_NAME),
  unit: String(unit).trim().slice(0, MAX_MEDIDA_UNIT),
  decimals,
  min,
  max,
  cuando,
  sentido: 'neutral',
});

/* ══════════════════════════════════════════════════════════════════════════
   LO MEDIDO
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ¿Vale este valor para esta medida? Devuelve el problema, o `null`.
 *
 * Es un filtro de dedazos y **no un diagnóstico**: lo que rechaza es un 950 de
 * glucosa escrito con un dedo de más, no una glucosa alta. Ver la ley de la
 * cabecera.
 */
export const problemaDeMedida = (medida, valor) => {
  const n = toNum(valor);
  if (n === null) return null; // Vacío es «no medido», que es legítimo.
  if (n < medida.min || n > medida.max) {
    return `${medida.label}: se esperaba entre ${medida.min} y ${medida.max} ${medida.unit}.`;
  }
  return null;
};

/** El valor redondeado a los decimales de su medida. `null` si no hay valor. */
export const valorDeMedida = (medida, valor) => {
  const n = toNum(valor);
  if (n === null) return null;
  const f = 10 ** (medida?.decimals ?? 0);
  return Math.round(n * f) / f;
};

/**
 * Las medidas rellenas de un registro, listas para guardar. `undefined` si no
 * se rellenó ninguna — el mismo criterio que `compact` usa con los pliegues: un
 * cero no es «no medido», y guardar el objeto vacío ensuciaría cada punto de
 * cada serie.
 */
export const compactMedidas = (medidas, valores) => {
  const out = {};
  for (const medida of medidas) {
    const v = valorDeMedida(medida, valores?.[medida.id]);
    if (v !== null) out[medida.id] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

/**
 * LA SERIE DE UNA MEDIDA, a lo largo del tiempo.
 *
 * Es `weightSeries` generalizada: eran ocho funciones escritas contra la clave
 * `weight`, y una medida nueva no tenía dónde dibujarse. Misma forma que todas
 * las demás series del producto —`{ date, value }`— para que entre en `BandChart`
 * sin traducir nada.
 */
export const serieDe = (history, id) =>
  chronological(history)
    .map((h) => ({ date: h.date, value: toNum(h.medidas?.[id]) }))
    .filter((p) => p.value !== null);

/** La última medición, o `null`. La cifra que se enseña al lado del peso. */
export const ultimaDe = (history, id) => {
  const puntos = serieDe(history, id);
  return puntos.length > 0 ? puntos[puntos.length - 1] : null;
};

/**
 * La variación desde la revisión anterior. `null` con menos de dos puntos: con
 * una sola medición no hay «desde entonces» que contar.
 */
export const deltaDe = (history, id) => {
  const puntos = serieDe(history, id);
  if (puntos.length < 2) return null;
  const ultimo = puntos[puntos.length - 1];
  const previo = puntos[puntos.length - 2];
  return { from: previo.value, to: ultimo.value, delta: ultimo.value - previo.value };
};
