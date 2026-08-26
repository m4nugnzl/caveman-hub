/**
 * Fotos de progreso.
 *
 * ── La "carpeta por semanas" ────────────────────────────────────────────────
 * La tabla `progress_photos` no tiene columna de semana, y no puedo añadirla
 * sin acceso al esquema. En su lugar, la semana se codifica en la RUTA del
 * archivo dentro de Supabase Storage:
 *
 *     <clientId>/photos/week-12/1699999999-frontal.jpg
 *
 * Esto tiene dos ventajas sobre añadir una columna: en el bucket se ven
 * carpetas de verdad (el mismo modelo mental de "carpetas del Drive"), y no
 * hace falta migrar la base de datos.
 *
 * ── URLs firmadas ──────────────────────────────────────────────────────────
 * Antes se guardaba en `photo_url` una URL firmada de UN AÑO. Eso significa
 * que todo el material caduca de golpe en la fecha de aniversario. Ahora en
 * esa columna se guarda la RUTA, y la URL firmada se genera en cada carga
 * (`resolveSignedUrls` en AppContext). Las filas antiguas que ya contienen una
 * URL completa se siguen entendiendo: `isRemoteUrl` las distingue.
 *
 * Cuando se pueda tocar el esquema, lo correcto es renombrar la columna a
 * `storage_path`. Hasta entonces conviven los dos formatos.
 */

import { toNum } from '@/lib/num';
import { daysBetween, weekStart } from '@/lib/dates';
import { weeklyWeightAverages } from './anthropometry';

export const ANGLES = [
  { id: 'frontal', label: 'Frontal', short: 'F', hint: 'De frente, brazos relajados' },
  { id: 'lateral', label: 'Lateral', short: 'L', hint: 'De perfil, mismo lado siempre' },
  { id: 'espalda', label: 'Espalda', short: 'E', hint: 'De espaldas, brazos relajados' },
];

/** Inicial del ángulo, para etiquetas donde no cabe la palabra. */
export const angleShort = (id) => ANGLES.find((a) => a.id === id)?.short || '?';

export const ANGLE_IDS = ANGLES.map((a) => a.id);
export const angleLabel = (id) => ANGLES.find((a) => a.id === id)?.label || id || 'Sin ángulo';

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB — fotos de móvil actuales

/** Valida un File antes de subirlo. Devuelve mensaje de error o null. */
export const validatePhotoFile = (file) => {
  if (!file) return 'No se ha seleccionado ningún archivo.';
  // Algunos navegadores no rellenan `type` para HEIC: se acepta por extensión.
  const byExt = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!ACCEPTED_TYPES.includes(file.type) && !byExt) {
    return 'Formato no admitido. Usa JPG, PNG, WEBP o HEIC.';
  }
  if (file.size > MAX_FILE_BYTES) {
    return `La foto pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es 15 MB.`;
  }
  return null;
};

// ── Rutas de Storage ───────────────────────────────────────────────────────

export const isRemoteUrl = (value) => /^https?:\/\//i.test(String(value || ''));

const extensionOf = (fileName) => {
  const m = /\.([a-z0-9]+)$/i.exec(fileName || '');
  return (m ? m[1] : 'jpg').toLowerCase();
};

/**
 * Nombre de archivo sin acentos ni espacios: Supabase Storage rechaza varios
 * caracteres en las claves de objeto.
 *
 * El rango se escribe con escapes ASCII a propósito: dejar marcas diacríticas
 * combinantes literales en el fuente es frágil (cualquier editor o
 * normalización de git puede estropearlas sin que se note).
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export const slug = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

export const buildPhotoPath = ({ clientId, week, angle, fileName, timestamp }) => {
  const ts = timestamp ?? Date.now();
  const w = Math.max(1, Math.round(toNum(week) ?? 1));
  return `${clientId}/photos/week-${w}/${ts}-${slug(angle) || 'foto'}.${extensionOf(fileName)}`;
};

/** Extrae {week, angle} de una ruta. Devuelve nulls si no sigue el patrón. */
export const parsePhotoPath = (path) => {
  const str = String(path || '');
  const week = /\/week-(\d+)\//.exec(str);
  const angle = /\/\d+-([a-z]+)\.[a-z0-9]+$/i.exec(str);
  return {
    week: week ? Number(week[1]) : null,
    angle: angle ? angle[1] : null,
  };
};

// ── Semanas ────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;

/**
 * Semana del programa (1-indexada) en la que cae una fecha.
 *
 * ══ Los dos ejes de «semana», y por qué ahora sí encajan ════════════════════
 *
 * Esta aplicación cuenta las semanas de DOS maneras: las fotos por **semana de
 * programa** (`week-12` en la ruta de Storage) y los check-ins por **semana
 * natural** (el lunes, `weekStart`). `auditoria.md` §1.2 las señaló como dos
 * calendarios incompatibles, y lo eran por una razón concreta y pequeña:
 *
 * esto contaba desde la FECHA CRUDA de alta. Un cliente que empezaba en
 * miércoles tenía semanas de miércoles a martes, mientras sus pesajes iban de
 * lunes a domingo. Sus dos ejes no compartían ni un corte, así que la «semana 3»
 * de sus fotos y su «semana del 17 de agosto» no cubrían los mismos días y un
 * check-in no podía casar con sus fotos de forma fiable.
 *
 * Anclando al LUNES del alta, la semana de programa deja de ser otro calendario
 * y pasa a ser **la misma partición del tiempo con otra etiqueta**: la semana N
 * es exactamente una semana natural, y la conversión entre las dos es exacta en
 * los dos sentidos (ver `weekStartOfProgramWeek`).
 *
 * Un cliente que empieza en miércoles sigue empezando en miércoles: lo que
 * cambia es que sus tres primeros días cuentan como semana 1 —la suya, la que va
 * de ese lunes a ese domingo— en vez de arrastrar el corte durante todo el
 * programa.
 *
 * No hace falta migrar nada: las fotos que ya existen llevan su semana escrita
 * en la ruta y `photoWeek` la respeta. Esto solo cambia lo que se DEDUCE de una
 * fecha, que es lo que estaba mal.
 */
export const weekFromStart = (startDate, date) => {
  const start = weekStart(startDate);
  const when = weekStart(date);
  if (!start || !when) return null;
  const dias = daysBetween(start, when);
  if (dias === null) return null;
  return Math.max(1, Math.floor(dias / 7) + 1);
};

/**
 * El camino de vuelta: el lunes en el que empieza la semana de programa `week`.
 *
 * Existe para que la conversión entre los dos ejes viva en UN sitio y en los dos
 * sentidos. Sin ella, cada pantalla que quisiera casar una foto con un check-in
 * se inventaría su propia aritmética de semanas — que es exactamente de donde
 * venía el problema.
 */
export const weekStartOfProgramWeek = (startDate, week) => {
  const start = weekStart(startDate);
  const n = Math.max(1, Math.round(toNum(week) ?? 1));
  if (!start) return null;
  return new Date(Date.parse(`${start}T00:00:00Z`) + (n - 1) * 7 * DAY_MS)
    .toISOString()
    .slice(0, 10);
};

/** Semana efectiva de una foto: la de la ruta, o la deducida de la fecha. */
export const photoWeek = (photo, startDate) =>
  photo.week ?? weekFromStart(startDate, photo.date) ?? null;

/**
 * Agrupa fotos en "carpetas" de semana, de la más reciente a la más antigua.
 * Las que no tienen semana determinable caen en un grupo `week: null`.
 */
export const groupByWeek = (photos, startDate) => {
  const groups = new Map();
  for (const p of photos) {
    const week = photoWeek(p, startDate);
    const key = week ?? 'sin-semana';
    if (!groups.has(key)) groups.set(key, { week, photos: [] });
    groups.get(key).photos.push(p);
  }

  return [...groups.values()]
    .map((g) => ({
      ...g,
      label: g.week === null ? 'Sin semana' : `Semana ${g.week}`,
      photos: sortPhotos(g.photos),
      dateRange: dateRangeOf(g.photos),
    }))
    .sort((a, b) => (b.week ?? -1) - (a.week ?? -1));
};

/** Ordena por fecha descendente y, a igual fecha, por orden de ángulo estable. */
export const sortPhotos = (photos) =>
  [...photos].sort((a, b) => {
    const byDate = String(b.date).localeCompare(String(a.date));
    if (byDate !== 0) return byDate;
    return ANGLE_IDS.indexOf(a.angle) - ANGLE_IDS.indexOf(b.angle);
  });

const dateRangeOf = (photos) => {
  const dates = photos.map((p) => p.date).filter(Boolean).sort();
  if (dates.length === 0) return null;
  return { from: dates[0], to: dates[dates.length - 1] };
};

/** Semanas disponibles (números), de menor a mayor. */
export const availableWeeks = (photos, startDate) =>
  [...new Set(photos.map((p) => photoWeek(p, startDate)).filter((w) => w !== null))].sort(
    (a, b) => a - b
  );

/**
 * Sugiere el par a comparar por defecto: la foto más antigua contra la más
 * reciente del mismo ángulo, que es la comparación que de verdad interesa.
 * Mezclar ángulos distintos produce comparaciones sin sentido.
 */
export const suggestPair = (photos) => {
  const sorted = sortPhotos(photos);
  if (sorted.length < 2) return { before: null, after: sorted[0] || null };

  for (const angle of ANGLE_IDS) {
    const ofAngle = sorted.filter((p) => p.angle === angle);
    if (ofAngle.length >= 2) {
      return { before: ofAngle[ofAngle.length - 1], after: ofAngle[0] };
    }
  }
  // Ningún ángulo repetido: se cae al extremo más antiguo contra el más nuevo.
  return { before: sorted[sorted.length - 1], after: sorted[0] };
};

// ── El peso de una foto sale del check-in, no se teclea ────────────────────
//
// ── El problema que tenía ───────────────────────────────────────────────────
// Al subir una foto había un campo «Peso en esa foto (kg)» que el cliente
// rellenaba a mano. Eso hacía que esta herramienta pareciera no tener nada que
// ver con el resto de la aplicación: el mismo peso se escribía dos veces, en dos
// pantallas distintas, y podía no coincidir. Y si el cliente lo dejaba vacío —lo
// normal— la comparativa se quedaba sin la única cifra que la hace útil.
//
// El peso de una foto es el de SU SEMANA, y ese dato ya existe: es el promedio
// del check-in semanal, que es además más fiable que un pesaje suelto porque
// filtra la variación diaria de agua.
//
// Las filas antiguas que guardaron un peso a mano en `tag` se siguen respetando:
// es un dato real que alguien introdujo, y descartarlo sería perder información.

/**
 * Peso asociado a una foto: el promedio de su semana natural, o el pesaje más
 * cercano si esa semana no tiene ninguno.
 */
export const photoWeight = (photo, history = []) => {
  const stored = toNum(photo?.weight);
  if (stored !== null) return stored;
  if (!photo?.date) return null;

  const key = weekStart(photo.date);
  const week = weeklyWeightAverages(history).find((w) => w.date === key);
  if (week) return week.value;

  // Sin promedio de esa semana: el pesaje más próximo en el tiempo, siempre que
  // no esté a más de diez días (más allá ya no describe la foto).
  let best = null;
  for (const entry of history) {
    const value = toNum(entry?.weight);
    const distance = Math.abs(daysBetween(entry?.date, photo.date) ?? Infinity);
    if (value === null || distance > 10) continue;
    if (best === null || distance < best.distance) best = { value, distance };
  }
  return best?.value ?? null;
};

/** Diferencia de peso entre dos fotos, o null si falta alguno de los dos. */
export const weightDelta = (before, after, history = []) => {
  const a = photoWeight(before, history);
  const b = photoWeight(after, history);
  if (a === null || b === null) return null;
  return Math.round((b - a) * 10) / 10;
};

// ── Comparar VARIAS semanas, no dos ────────────────────────────────────────

/**
 * Matriz de comparación: una columna por semana, una fila por ángulo.
 *
 * ── Por qué una matriz ──────────────────────────────────────────────────────
 * Comparar la evolución no es «esta foto contra esa»: es ver el frontal de las
 * semanas 1, 6 y 12 en una fila y el de espaldas justo debajo. Con dos huecos
 * había que montar tres collages y pegarlos a mano.
 *
 * Devuelve los huecos en el orden de lectura del lienzo (fila a fila), con
 * `photoId` en null donde esa semana no tiene ese ángulo, para que el montaje
 * conserve la cuadrícula en lugar de descolocar las columnas.
 */
export const weekAngleMatrix = ({ photos, weeks, angles, startDate }) => {
  const chosenWeeks = [...weeks].sort((a, b) => a - b);
  const chosenAngles = ANGLE_IDS.filter((id) => angles.includes(id));

  const byKey = new Map();
  for (const photo of sortPhotos(photos)) {
    const key = `${photoWeek(photo, startDate)}|${photo.angle}`;
    // sortPhotos deja la más reciente primero: la primera de cada celda es la
    // que se queda si hay varias del mismo ángulo esa semana.
    if (!byKey.has(key)) byKey.set(key, photo);
  }

  const cells = [];
  for (const angle of chosenAngles) {
    for (const week of chosenWeeks) {
      const photo = byKey.get(`${week}|${angle}`) || null;
      cells.push({ week, angle, photoId: photo?.id || null });
    }
  }

  return { cells, cols: chosenWeeks.length, rows: chosenAngles.length, weeks: chosenWeeks, angles: chosenAngles };
};

/** Ángulos con al menos una foto, en orden estable. */
/**
 * La misma foto, pero servida como MINIATURA.
 *
 * ══ El problema ═════════════════════════════════════════════════════════════
 *
 * La biblioteca del estudio pinta una tira de miniaturas de 90 px, y para cada
 * una descargaba el ORIGINAL: una foto de móvil de 3 MB. Sesenta fotos son 180 MB
 * de tráfico para dibujar sesenta cuadraditos. En el móvil del cliente eso es su
 * tarifa de datos; en el del entrenador, una pantalla que tarda en aparecer.
 *
 * ══ Cómo se convierte ═══════════════════════════════════════════════════════
 *
 * Supabase sirve las imágenes transformadas por una ruta distinta de la de los
 * objetos: `/object/sign/…` entrega el archivo tal cual y `/render/image/sign/…`
 * lo redimensiona. El token firmado es el mismo —firma la RUTA, no el tamaño—,
 * así que basta con cambiar el segmento y añadir el ancho.
 *
 * ── Por qué esto devuelve la original si algo no cuadra ─────────────────────
 * Porque la transformación de imágenes es una función del plan de Supabase y
 * puede no estar disponible, y porque este cambio de ruta no lo he podido probar
 * contra un proyecto real. Una optimización que puede fallar tiene que fallar
 * hacia el lado bueno: si la URL no tiene la forma esperada se devuelve la de
 * siempre, y quien la pinta debe además volver a la original si la miniatura no
 * carga (ver `PhotoLibrary`). El peor caso es el comportamiento de antes, nunca
 * una foto rota.
 */
export const thumbnailUrl = (url, width = 240) => {
  if (typeof url !== 'string' || !url.includes('/object/sign/')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url.replace('/object/sign/', '/render/image/sign/')}${separator}width=${width}&resize=contain&quality=70`;
};

/**
 * La cobertura del historial: qué semanas tienen foto y de qué ángulos, desde la
 * primera semana con foto hasta la última.
 *
 * ══ Por qué esto es lo que le faltaba al estudio ════════════════════════════
 *
 * La biblioteca enseña LO QUE HAY, agrupado por semana. Eso convierte el
 * historial en un explorador de archivos: se ve lo subido y no se ve lo que
 * falta, que es justo el dato accionable.
 *
 * Un entrenador que abre las fotos de un cliente quiere saber dos cosas, y la
 * segunda no estaba en ninguna pantalla:
 *
 *   1. ¿Cómo ha cambiado? — para eso está el comparador.
 *   2. ¿Tengo material para compararlo? — «me faltan las semanas 5, 7 y 9, y de
 *      la 8 solo tengo el frontal».
 *
 * Lo segundo es una tarea: hay que escribirle. Y era invisible, porque una
 * semana sin fotos simplemente no aparecía en la lista y no dejaba hueco.
 *
 * Se devuelven TODAS las semanas del rango, también las vacías. Es la misma
 * decisión que la escala de días de «Hoy»: un historial al que le faltan los
 * huecos no es un historial, es una selección.
 *
 * `angles` se pasa como argumento —normalmente los que el cliente usa de verdad—
 * para no marcar como incompleta una semana por no tener un ángulo que ese
 * cliente no se hace nunca.
 */
export const photoCoverage = ({ photos = [], startDate, angles = ANGLE_IDS }) => {
  const byWeek = new Map();

  for (const photo of photos) {
    const week = photoWeek(photo, startDate);
    if (week === null || week === undefined) continue;
    if (!byWeek.has(week)) byWeek.set(week, new Set());
    if (photo.angle) byWeek.get(week).add(photo.angle);
  }

  if (byWeek.size === 0) return [];

  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  const first = weeks[0];
  const last = weeks[weeks.length - 1];

  const out = [];
  for (let week = first; week <= last; week += 1) {
    const present = byWeek.get(week) || new Set();
    out.push({
      week,
      angles: angles.map((angle) => ({ angle, has: present.has(angle) })),
      count: present.size,
      complete: angles.length > 0 && angles.every((angle) => present.has(angle)),
      empty: present.size === 0,
    });
  }
  return out;
};

export const availableAngles = (photos) =>
  ANGLE_IDS.filter((id) => photos.some((p) => p.angle === id));

/** Semanas transcurridas entre dos fotos según su semana de programa. */
export const weekSpan = (before, after, startDate) => {
  const a = photoWeek(before || {}, startDate);
  const b = photoWeek(after || {}, startDate);
  if (a === null || b === null) return null;
  return Math.abs(b - a);
};
/**
 * La comparativa de UNA semana: su foto contra la de una semana anterior.
 *
 * ══ Por qué no vale `suggestPair` ═══════════════════════════════════════════
 *
 * `suggestPair` contesta «¿cómo va este cliente?» y para eso empareja la foto
 * más antigua con la más reciente: la comparación que se enseña. Al revisar un
 * check-in la pregunta es otra —«¿qué ha pasado desde la última vez?»— y el
 * «después» no se elige: es la entrega que estoy mirando. Lo único que se elige
 * es contra qué.
 *
 * ══ Y por qué se puede elegir contra cuál ══════════════════════════════════
 *
 * Porque de una semana a la siguiente casi nunca se ve nada, y entonces la
 * comparativa no informa: dos fotos idénticas al lado no son un dato, son ruido
 * con forma de dato. A tres o cuatro semanas ya se ve algo, y ése es el gesto
 * real —«enséñame contra hace un mes»—. Se devuelven las semanas anteriores que
 * TIENEN ese ángulo, de la más reciente a la más antigua, para que la pantalla
 * las ofrezca sin inventarse ninguna: un chip que lleva a un hueco vacío es peor
 * que no tener el chip.
 *
 * `null` cuando esa semana no tiene ninguna foto — no hay nada que comparar ni
 * nada que decir.
 *
 * @param angle        El ángulo elegido. Si no está disponible esa semana se cae
 *                     al primero que sí, en el orden de `ANGLES`: mezclar
 *                     ángulos produce comparaciones sin sentido.
 * @param againstWeek  La semana contra la que comparar. Si no vale —no existe o
 *                     no tiene ese ángulo— se cae a la anterior más cercana, que
 *                     es la que contesta la pregunta del check-in.
 */
export const weekComparison = ({
  photos = [],
  startDate = null,
  weekNumber = null,
  angle = null,
  againstWeek = null,
} = {}) => {
  if (weekNumber === null) return null;

  /* `groupByWeek` ya devuelve las semanas de la más reciente a la más antigua y
     las fotos de cada una ordenadas: aquí no se vuelve a ordenar nada. */
  const semanas = groupByWeek(photos, startDate).filter((g) => g.week !== null);
  const actual = semanas.find((g) => g.week === weekNumber);
  if (!actual) return null;

  const angles = ANGLE_IDS.filter((id) => actual.photos.some((p) => p.angle === id));
  if (angles.length === 0) return null;

  const elegido = angles.includes(angle) ? angle : angles[0];
  const after = actual.photos.find((p) => p.angle === elegido) || null;

  const anteriores = semanas.filter(
    (g) => g.week < weekNumber && g.photos.some((p) => p.angle === elegido)
  );
  const options = anteriores.map((g) => g.week);

  const contra = options.includes(againstWeek) ? againstWeek : options[0] ?? null;
  const before =
    contra === null
      ? null
      : anteriores.find((g) => g.week === contra).photos.find((p) => p.angle === elegido);

  return {
    angle: elegido,
    angles,
    after,
    before,
    against: contra,
    options,
    /* Cuántas semanas atrás está la elegida. Es lo que hace legible el chip
       —«hace 3 semanas» y no «S2»— cuando el cliente lleva medio año. */
    span: contra === null ? null : weekNumber - contra,
  };
};
