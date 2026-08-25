/**
 * Los condicionantes de una persona: lo que limita lo que le puedes poner.
 *
 * ══ Por qué esto no es un campo de notas ════════════════════════════════════
 *
 * Porque una nota no avisa. La aplicación ya tenía dónde guardar esto —el paso
 * «Anamnesis» del alta, con su PDF adjunto (`domain/intake.js`)— y el problema
 * nunca fue guardarlo: era que al programar el jueves nadie te recordaba la
 * hernia, y al montar el menú nadie te recordaba la intolerancia. La información
 * existía, estaba a dos clics, y llegaba tarde.
 *
 * Estructurarlo es lo que permite que la rutina pregunte «¿qué le condiciona el
 * entrenamiento?» y la dieta «¿qué le condiciona la comida?» y cada una reciba
 * solo lo suyo.
 *
 * ══ Catálogo y texto libre, las dos cosas ══════════════════════════════════
 *
 * Es el mismo trato que hacen `protocol.js` con las preguntas e `intake.js` con
 * los pasos, y por la misma razón: solo catálogo se queda corto el primer día
 * —nadie va a encontrar ahí «tendinopatía rotuliana del izquierdo»— y solo texto
 * libre convierte esto en el cuaderno de notas que ya existía.
 *
 * El catálogo no restringe: sugiere. Lo que se guarda siempre es una etiqueta de
 * texto, venga de donde venga, y por eso una entrada del catálogo se puede
 * retocar después sin que nada se rompa.
 */

import { toISODate } from '@/lib/dates';

// ── El vocabulario ─────────────────────────────────────────────────────────

/**
 * A qué parte del trabajo afecta.
 *
 * `both` existe porque una diabetes condiciona la comida Y el entreno, y
 * obligar a apuntarla dos veces produciría dos filas que hay que acordarse de
 * cambiar a la vez — o sea, dos que acaban diciendo cosas distintas.
 */
export const AREAS = [
  { id: 'training', label: 'Entrenamiento', short: 'Entreno' },
  { id: 'nutrition', label: 'Nutrición', short: 'Dieta' },
  { id: 'both', label: 'Las dos cosas', short: 'Ambas' },
];

export const AREA_IDS = AREAS.map((a) => a.id);
export const areaLabel = (id) => AREAS.find((a) => a.id === id)?.label || 'Entrenamiento';
export const areaShort = (id) => AREAS.find((a) => a.id === id)?.short || 'Entreno';

/**
 * Cuánto pesa.
 *
 * Dos valores y no una escala de cinco: entre «moderado» y «alto» hay que
 * decidir cada vez que se apunta algo, y esa decisión no cambia nada de lo que
 * hace la aplicación. Lo que sí cambia es el tono con el que se dice.
 */
export const SEVERITIES = [
  { id: 'note', label: 'Tenlo en cuenta', tone: 'info' },
  { id: 'block', label: 'No se le puede poner', tone: 'warn' },
];

export const SEVERITY_IDS = SEVERITIES.map((s) => s.id);
export const severityLabel = (id) => SEVERITIES.find((s) => s.id === id)?.label || 'Tenlo en cuenta';
/* El tono del aviso sale de aquí y no de cada pantalla, por la misma razón que
   el color de una métrica sale de `domain/metrics.js`: si la rutina y la dieta
   lo eligieran por su cuenta, el mismo condicionante se leería como más grave en
   una que en la otra. */
export const severityTone = (id) => SEVERITIES.find((s) => s.id === id)?.tone || 'info';

/**
 * Lo que se ve de verdad en una anamnesis, agrupado por dónde duele.
 *
 * No es una lista médica ni pretende serlo: son los quince que un entrenador
 * apunta el primer día y que además CAMBIAN lo que prescribe. Una taxonomía
 * completa haría el desplegable inservible, que es el problema que resuelven las
 * sugerencias y no un catálogo cerrado.
 */
export const CONDITION_CATALOG = [
  /* ── Entrenamiento ── */
  { label: 'Hernia o protrusión lumbar', area: 'training' },
  { label: 'Dolor de hombro', area: 'training' },
  { label: 'Dolor de rodilla', area: 'training' },
  { label: 'Lesión de espalda', area: 'training' },
  { label: 'Operación reciente', area: 'training' },
  { label: 'Movilidad limitada', area: 'training' },
  { label: 'Embarazo o posparto', area: 'both' },

  /* ── Nutrición ── */
  { label: 'Celiaquía', area: 'nutrition' },
  { label: 'Intolerancia a la lactosa', area: 'nutrition' },
  { label: 'Alergia alimentaria', area: 'nutrition' },
  { label: 'Vegetariano o vegano', area: 'nutrition' },
  { label: 'Trastorno de la conducta alimentaria', area: 'nutrition' },

  /* ── Las dos ── */
  { label: 'Diabetes', area: 'both' },
  { label: 'Hipertensión', area: 'both' },
  { label: 'Problema de tiroides', area: 'both' },
  { label: 'Problema cardíaco', area: 'both' },
  { label: 'Medicación habitual', area: 'both' },
];

/** Lo que hace que dos etiquetas sean «la misma»: igual que en `catalog.js`. */
const clave = (texto) => String(texto || '').trim().toLowerCase();

/**
 * Las sugerencias que tienen sentido en un área, sin repetir lo ya apuntado.
 *
 * Se quitan las que ya tiene porque una sugerencia que al elegirla produce un
 * duplicado no es una sugerencia: es una trampa. Es el mismo trato que da
 * `mergeCatalog` a los alimentos que ya están en tu biblioteca.
 */
export const catalogFor = (area, existing = []) => {
  const puestos = new Set((existing || []).map((c) => clave(c?.label)));
  return CONDITION_CATALOG.filter(
    (item) =>
      (area === 'both' || item.area === area || item.area === 'both') &&
      !puestos.has(clave(item.label))
  );
};

// ── Topes ──────────────────────────────────────────────────────────────────

/* Los mismos que la migración 0077. Están escritos dos veces a propósito: la
   base los defiende y la interfaz los explica, y una restricción que solo vive
   en la base llega al usuario como un error de Postgres. */
export const MAX_LABEL = 120;
export const MAX_DETAIL = 2000;

// ── Saneado ────────────────────────────────────────────────────────────────

/**
 * Una fila de la base, completada y acotada.
 *
 * Igual que en el resto del proyecto: lo que no se reconoce cae al valor por
 * defecto en vez de propagarse. Un `area` inventado dejaría un condicionante
 * INVISIBLE en las dos secciones —que es la peor forma de perder un dato de
 * salud: sin error y sin hueco—, así que cae en «entrenamiento», donde al menos
 * se ve.
 */
export const cleanCondition = (row) => {
  const label = String(row?.label ?? '').trim().slice(0, MAX_LABEL);
  if (!label) return null;

  const detail = String(row?.detail ?? '').trim().slice(0, MAX_DETAIL);

  return {
    id: row?.id ?? null,
    clientId: row?.clientId ?? null,
    label,
    detail: detail || null,
    area: AREA_IDS.includes(row?.area) ? row.area : 'training',
    severity: SEVERITY_IDS.includes(row?.severity) ? row.severity : 'note',
    since: toISODate(row?.since),
    resolvedAt: toISODate(row?.resolvedAt),
  };
};

// ── Consultas ──────────────────────────────────────────────────────────────

/** ¿Sigue vigente? Lo resuelto se conserva, pero deja de avisar. */
export const isActive = (condition) => !condition?.resolvedAt;

/**
 * Los de un área, vigentes, con los vetos delante.
 *
 * ── Por qué `both` entra en las dos ─────────────────────────────────────────
 * Es toda la razón de que ese valor exista: una diabetes tiene que aparecer al
 * programar y al pautar la comida, apuntada una sola vez.
 *
 * ── Y por qué los vetos van primero ─────────────────────────────────────────
 * Porque la lista se lee de arriba abajo y a veces se corta —en la cabecera de
 * la rutina se enseñan los primeros y el resto se despliega—. Si el orden fuera
 * el de creación, lo único que NO se puede hacer podría quedar escondido detrás
 * de tres cosas que solo hay que tener en cuenta.
 */
export const conditionsFor = (conditions, area) =>
  (conditions || [])
    .filter((c) => c && isActive(c) && (c.area === area || c.area === 'both'))
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'block' ? -1 : 1;
      return a.label.localeCompare(b.label, 'es');
    });

/** Todos los vigentes, para la ficha: los vetos delante y el resto por área. */
export const activeConditions = (conditions) =>
  (conditions || [])
    .filter((c) => c && isActive(c))
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'block' ? -1 : 1;
      if (a.area !== b.area) return AREA_IDS.indexOf(a.area) - AREA_IDS.indexOf(b.area);
      return a.label.localeCompare(b.label, 'es');
    });

/** Los ya resueltos, del más reciente al más antiguo. Historia, no avisos. */
export const resolvedConditions = (conditions) =>
  (conditions || [])
    .filter((c) => c && !isActive(c))
    .sort((a, b) => String(b.resolvedAt).localeCompare(String(a.resolvedAt)));

/**
 * La frase de una sección: «2 cosas a tener en cuenta», «1 que no puede hacer».
 *
 * Vive aquí y no en las pantallas porque la dicen DOS —la rutina y la dieta— y
 * dos redacciones del mismo recuento es cómo se acaba dudando de si cuentan lo
 * mismo.
 */
export const conditionsHeadline = (list) => {
  const total = (list || []).length;
  if (total === 0) return null;

  const vetos = list.filter((c) => c.severity === 'block').length;
  if (vetos === 0) return total === 1 ? '1 cosa a tener en cuenta' : `${total} cosas a tener en cuenta`;
  if (vetos === total) return vetos === 1 ? '1 cosa que no puede hacer' : `${vetos} cosas que no puede hacer`;

  return `${vetos} que no puede hacer y ${total - vetos} a tener en cuenta`;
};
