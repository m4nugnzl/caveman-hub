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

/*
 * LOS ÁNGULOS QUE SE PIDEN, Y POR QUÉ SON CUATRO
 * --------------------------------------------------------------------------
 * Eran tres, y el del medio era «Lateral · de perfil, mismo lado siempre». Esa
 * instrucción es justo la que nadie cumple: se pide una vez, se hace bien la
 * primera, y a la tercera semana la lateral está desde el otro lado. Y una
 * lateral izquierda contra una derecha no es una comparación — es la misma
 * persona girada, con la luz al revés y el brazo tapando lo que antes se veía.
 * La serie entera deja de medir nada sin que se note, que es la peor forma de
 * perder un dato.
 *
 * Con un hueco para cada lado no hay nada que recordar: el hueco dice qué lado
 * toca, y la foto de la última vez que lleva dentro dice cómo iba. Que sean dos
 * fotos en vez de una es además lo que hacía falta de todas formas — los dos
 * perfiles no cuentan lo mismo.
 *
 * ── Las laterales de antes se quedan ──────────────────────────────────────
 * Las fotos ya subidas llevan `lateral` escrito en su ruta de Storage y no se
 * migran: no hay forma de saber de qué lado era cada una, e inventarlo sería
 * meter ruido en la única prueba visual que tiene el cliente. Siguen viéndose,
 * ordenándose y comparándose entre ellas (`ANGULOS_RETIRADOS`); lo único que ya
 * no hacen es pedirse.
 */
export const ANGLES = [
  { id: 'frontal', label: 'Frontal', short: 'F', hint: 'De frente, brazos relajados' },
  {
    id: 'izquierdo',
    label: 'Lateral izquierdo',
    short: 'I',
    hint: 'De perfil, con tu lado izquierdo hacia la cámara',
  },
  {
    id: 'derecho',
    label: 'Lateral derecho',
    short: 'D',
    hint: 'De perfil, con tu lado derecho hacia la cámara',
  },
  { id: 'espalda', label: 'Espalda', short: 'E', hint: 'De espaldas, brazos relajados' },
];

/**
 * Los que ya no se piden pero que están en el archivo de quien lleva tiempo.
 * No se ofrecen en ningún hueco ni cuentan para «te faltan fotos»: existen para
 * que lo ya subido siga teniendo nombre, orden y sitio donde mirarse.
 */
export const ANGULOS_RETIRADOS = [
  { id: 'lateral', label: 'Lateral (antiguo)', short: 'L', hint: 'De perfil, sin lado anotado' },
];

/**
 * Todos los que puede llevar una foto, EN ORDEN DE LECTURA. La lateral antigua
 * va entre las dos nuevas porque es de donde salieron: así una carpeta con las
 * dos generaciones mezcladas sigue leyéndose de frente hacia la espalda.
 */
export const TODOS_LOS_ANGULOS = [ANGLES[0], ANGLES[1], ANGULOS_RETIRADOS[0], ANGLES[2], ANGLES[3]];

const angulo = (id) => TODOS_LOS_ANGULOS.find((a) => a.id === id);

/** Inicial del ángulo, para etiquetas donde no cabe la palabra. */
export const angleShort = (id) => angulo(id)?.short || '?';

/** Los que se piden hoy: lo que cuenta para «te faltan fotos de esta semana». */
export const ANGLE_IDS = ANGLES.map((a) => a.id);

/** Y el orden de todos, retirados incluidos: con el que se ordena y se compara. */
export const ORDEN_DE_ANGULOS = TODOS_LOS_ANGULOS.map((a) => a.id);

export const angleLabel = (id) => angulo(id)?.label || id || 'Sin ángulo';

const LADOS = ['izquierdo', 'derecho'];

/**
 * El lado de una foto de perfil: el de su ángulo, o el DECLARADO de una lateral
 * antigua. `null` para las que no son de perfil y para las antiguas sin declarar.
 *
 * ── Declarar no es inventar ─────────────────────────────────────────────────
 * El lado de una lateral antigua no se deduce: lo dice el entrenador, que lo ve
 * en la foto en un segundo. Como la instrucción de entonces era «mismo lado
 * siempre», se declara UNA vez por cliente (`lateralesAntiguas`) y se guarda en
 * cada foto como `lado`, al lado de su ángulo y sin pisarlo.
 */
export const ladoDeLaFoto = (photo) => {
  if (LADOS.includes(photo?.angle)) return photo.angle;
  if (photo?.angle === 'lateral' && LADOS.includes(photo.lado)) return photo.lado;
  return null;
};

/**
 * EL ÁNGULO CON EL QUE UNA FOTO SE ENSEÑA Y SE COMPARA: el suyo, con la lateral
 * antigua declarada en su lado.
 *
 * Todo lo que agrupa, filtra, ordena, empareja o nombra fotos por ángulo pasa
 * por aquí y no por `photo.angle`: una lateral declarada izquierda tiene que ir
 * con las izquierdas en la rejilla de la revisión, en el archivo, en el estudio
 * y en el nombre del archivo que se descarga. Si una pantalla leyera `angle` a
 * pelo, volvería a llamarla «Lateral (antiguo)» y la separaría de su serie.
 *
 * `photo.angle` queda para lo que es: lo que se subió, lo único que se escribe.
 */
export const celdaDeLaFoto = (photo) => ladoDeLaFoto(photo) || photo?.angle || null;

/** El nombre del ángulo de UNA foto, con su lado declarado. */
export const etiquetaDeLaFoto = (photo) => angleLabel(celdaDeLaFoto(photo));

/** Y su inicial, para las etiquetas donde no cabe la palabra. */
export const inicialDeLaFoto = (photo) => angleShort(celdaDeLaFoto(photo));

/**
 * LOS ÁNGULOS QUE OFRECE UN FILTRO: los que se piden, más los retirados que
 * esta persona tenga de verdad.
 *
 * Una pestaña «Lateral (antiguo)» delante de quien empezó la semana pasada es
 * un mando que no lleva a ningún sitio; no tenerla delante de quien tiene
 * cuarenta laterales antiguas las deja sin forma de encontrarse.
 */
export const angulosParaFiltrar = (photos = []) => [
  ...ANGLES,
  ...ANGULOS_RETIRADOS.filter((a) => photos.some((p) => celdaDeLaFoto(p) === a.id)),
];

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

/**
 * Cómo se llama una foto cuando SALE de la aplicación.
 *
 * `manolo-perez-s03-frontal-2026-03-02.jpg`
 *
 * ── Por qué el nombre lleva todo eso ────────────────────────────────────────
 * Porque una foto descargada acaba en una carpeta con otras cuarenta, y ahí no
 * hay ni fila de mando ni pie de foto: el nombre es el único sitio donde queda
 * escrito de quién es, de cuándo y de qué ángulo. Con la semana a dos cifras
 * —`s03`, no `s3`— para que el ordenador las ordene como las ordenaría uno.
 *
 * La ruta de Storage no vale para esto: es `1757…-frontal.jpg`, una marca de
 * tiempo pensada para no colisionar, no para leerse.
 */
export const photoFileName = (photo, { clientName = '', week = null } = {}) => {
  const semana = week ?? photo.week;
  return [
    slug(clientName),
    semana != null ? `s${String(semana).padStart(2, '0')}` : null,
    slug(celdaDeLaFoto(photo)) || 'foto',
    photo.date,
  ]
    .filter(Boolean)
    .join('-')
    .concat(`.${extensionOf(photo.path || photo.url || '')}`);
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
 * LOS ÁNGULOS QUE YA TIENE EL PERIODO QUE SE ENTREGA. Un `Set`, que es lo que
 * la lista de la entrega necesita para decir cuáles faltan.
 *
 * ══ La semana del PERIODO, no la de hoy ════════════════════════════════════
 *
 * Esto lo hacían las pantallas, y lo hacían contra `weekFromStart(alta, hoy)`.
 * Son la misma semana casi siempre y NO lo son en los dos casos que importan:
 * con la ventana de gracia abierta se entrega la semana pasada mientras hoy ya
 * es la siguiente, y con cadencia quincenal el periodo abarca dos semanas de
 * programa de las que solo se miraba una. En los dos, la lista hablaba de unas
 * fotos y la entrega iba con otras.
 *
 * ── Y sin fecha de alta se cae a las FECHAS ────────────────────────────────
 * La semana de programa es un ordinal que se cuenta desde el alta; sin alta no
 * existe. En vez de dar por buena cualquier foto —que es lo que pasaba cuando
 * los dos lados salían `null` y `null === null`— se compara la fecha de la foto
 * contra la ventana del periodo, que es exacta y no necesita ordinal.
 */
export const angulosDelPeriodo = (photos = [], { startDate = null, desde = null, semanas = 1 } = {}) => {
  const tramo = Math.max(1, semanas);
  const primera = desde ? weekFromStart(startDate, desde) : null;
  const fin = desde
    ? new Date(Date.parse(`${weekStart(desde)}T00:00:00Z`) + tramo * 7 * DAY_MS).toISOString().slice(0, 10)
    : null;

  const dentro = (foto) => {
    if (!desde) return true;
    if (primera === null) return foto.date >= weekStart(desde) && foto.date < fin;
    const w = photoWeek(foto, startDate);
    return w !== null && w >= primera && w < primera + tramo;
  };

  return new Set(photos.filter((p) => p?.angle && dentro(p)).map(celdaDeLaFoto));
};

/**
 * LA DE ESTA SEMANA Y LA DE LA ÚLTIMA VEZ, por ángulo.
 *
 * `ahora` es la foto de ese ángulo en `semana`; `antes`, la más reciente de las
 * anteriores —manda la semana, y a igualdad de semana la que se subió
 * después—. Es lo que enseñan los ángulos del asistente (`AngulosDeLaSemana`) y
 * las fotos de la semana del teléfono: la de antes, puesta donde falta la de
 * ahora, es «hazlas siempre igual» sin tener que leerlo.
 *
 * Un solo recorrido: la lista puede tener cien fotos.
 */
export const fotosPorAngulo = (photos = [], semana, startDate) => {
  const ahora = new Map();
  const antes = new Map();
  for (const foto of photos) {
    const celda = celdaDeLaFoto(foto);
    if (!celda) continue;
    const w = photoWeek(foto, startDate);
    if (semana !== null && w === semana) {
      ahora.set(celda, foto);
      continue;
    }
    const previa = antes.get(celda);
    if (!previa || w > photoWeek(previa, startDate)) antes.set(celda, foto);
  }
  return { ahora, antes };
};

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
    return ORDEN_DE_ANGULOS.indexOf(celdaDeLaFoto(a)) - ORDEN_DE_ANGULOS.indexOf(celdaDeLaFoto(b));
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

  for (const angle of ORDEN_DE_ANGULOS) {
    const ofAngle = sorted.filter((p) => celdaDeLaFoto(p) === angle);
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
  const chosenAngles = ORDEN_DE_ANGULOS.filter((id) => angles.includes(id));

  const byKey = new Map();
  for (const photo of sortPhotos(photos)) {
    const key = `${photoWeek(photo, startDate)}|${celdaDeLaFoto(photo)}`;
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
    if (photo.angle) byWeek.get(week).add(celdaDeLaFoto(photo));
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
  ORDEN_DE_ANGULOS.filter((id) => photos.some((p) => celdaDeLaFoto(p) === id));

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

  const angles = ORDEN_DE_ANGULOS.filter((id) => actual.photos.some((p) => celdaDeLaFoto(p) === id));
  if (angles.length === 0) return null;

  const elegido = angles.includes(angle) ? angle : angles[0];
  const after = actual.photos.find((p) => celdaDeLaFoto(p) === elegido) || null;

  const anteriores = semanas.filter(
    (g) => g.week < weekNumber && g.photos.some((p) => celdaDeLaFoto(p) === elegido)
  );
  const options = anteriores.map((g) => g.week);

  const contra = options.includes(againstWeek) ? againstWeek : options[0] ?? null;
  const before =
    contra === null
      ? null
      : anteriores.find((g) => g.week === contra).photos.find((p) => celdaDeLaFoto(p) === elegido);

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

// ── «Cómo se ve»: los cuatro ángulos a la vez (22 sep 2026) ─────────────────

/** Las cuatro celdas de la rejilla, en orden de lectura: fila a fila. */
export const CELDAS_DE_LA_REJILLA = ['frontal', 'izquierdo', 'derecho', 'espalda'];

/**
 * LO QUE SE SABE DE SUS LATERALES ANTIGUAS, para decidir qué se le ofrece.
 *
 *   · `sinLado`    cuántas siguen sin lado: si hay alguna, se ofrece declararlo.
 *   · `lado`       el lado de todas las que lo tienen, si es uno solo.
 *   · `mezcladas`  hay de los dos lados —porque alguna se marcó a mano—. Entonces
 *                  la declaración por cliente NO se ofrece: aplicarla a ciegas
 *                  pondría en el mismo lado fotos que alguien vio distintas.
 *   · `fotos`      las que lleva la declaración: las que siguen siendo `lateral`.
 *                  Las que se cambiaron de ángulo a mano no se tocan.
 *
 * Una lateral antigua es la que se SUBIÓ como `lateral` (la ruta lo dice,
 * `origen`), aunque después se le cambiara el ángulo.
 */
export const lateralesAntiguas = (photos = []) => {
  const antiguas = photos.filter((p) => p?.angle === 'lateral' || p?.origen === 'lateral');
  const lados = new Set(antiguas.map(ladoDeLaFoto).filter(Boolean));
  return {
    total: antiguas.length,
    sinLado: antiguas.filter((p) => !ladoDeLaFoto(p)).length,
    lado: lados.size === 1 ? [...lados][0] : null,
    mezcladas: lados.size > 1,
    fotos: antiguas.filter((p) => p.angle === 'lateral'),
  };
};

/**
 * LA REJILLA DE DOS SEMANAS: una celda por ángulo con su Antes y su Ahora.
 *
 * Siempre las cuatro celdas que se piden, y un hueco honesto donde una semana no
 * tiene ese ángulo: la cabecera promete dos semanas, y una pareja que tirase de
 * una tercera la desmentiría.
 *
 * ── La lateral antigua sin lado ─────────────────────────────────────────────
 *   · Si en las dos semanas no hay ninguna foto con lado, las celdas son tres
 *     —frontal, lateral, espalda—: las dos son de cuando había una sola lateral,
 *     y se comparan entre ellas como siempre.
 *   · Si hay alguna con lado, salen las cuatro, y en la semana que solo tiene la
 *     antigua sin lado sus dos celdas de perfil lo dicen (`antesSinLado`,
 *     `ahoraSinLado`) en vez de emparejarla con un lado que no se sabe.
 *
 * @param antes  las fotos de la semana de antes.
 * @param ahora  las de la semana de ahora.
 */
export const rejillaDeFotos = ({ antes = [], ahora = [] } = {}) => {
  const porCelda = (fotos) => {
    const celdas = new Map();
    /* La más reciente primero: si hay dos del mismo ángulo, se queda la última. */
    for (const foto of sortPhotos(fotos)) {
      const celda = celdaDeLaFoto(foto);
      if (celda && !celdas.has(celda)) celdas.set(celda, foto);
    }
    return celdas;
  };
  const a = porCelda(antes);
  const b = porCelda(ahora);
  const conLado = [...a.keys(), ...b.keys()].some((c) => LADOS.includes(c));
  const antigua = a.has('lateral') || b.has('lateral');
  const ids = !conLado && antigua ? ['frontal', 'lateral', 'espalda'] : CELDAS_DE_LA_REJILLA;

  return ids.map((id) => {
    const perfil = LADOS.includes(id);
    return {
      id,
      antes: a.get(id) || null,
      ahora: b.get(id) || null,
      antesSinLado: perfil && !a.has(id) && a.has('lateral'),
      ahoraSinLado: perfil && !b.has(id) && b.has('lateral'),
    };
  });
};

/**
 * QUÉ DOS SEMANAS SE COMPARAN POR DEFECTO, y los dos atajos del selector.
 *
 * Una semana contra la anterior casi nunca enseña nada en una foto: el cuerpo no
 * se mueve lo bastante en siete días para verse. Por eso el Antes por defecto es
 * el INICIO DE LA FASE —lo que ha hecho este bloque de trabajo—; sin fases, el
 * inicio de todo; y si la fase empezó justo esta semana, la última anterior con
 * foto, que es el final de la fase de antes.
 *
 * @param semanas     las semanas con foto (números de programa).
 * @param semana      la semana que se revisa.
 * @param inicioFase  la semana de programa en la que empieza su fase, o null.
 * @returns `{ ahora, antes, inicioDeFase, inicio }` — los dos últimos son a qué
 *   semana lleva cada atajo, o null si no lleva a ninguna anterior a `ahora`.
 */
export const semanasParaComparar = ({ semanas = [], semana = null, inicioFase = null } = {}) => {
  const orden = [...new Set(semanas)].filter((w) => w !== null).sort((x, y) => x - y);
  if (orden.length === 0) return { ahora: null, antes: null, inicioDeFase: null, inicio: null };

  const ahora =
    (semana === null ? null : [...orden].reverse().find((w) => w <= semana)) ?? orden[orden.length - 1];
  const previas = orden.filter((w) => w < ahora);
  const inicio = previas[0] ?? null;
  const inicioDeFase = inicioFase === null ? null : previas.find((w) => w >= inicioFase) ?? null;
  const anterior = previas[previas.length - 1] ?? null;
  const antes = inicioFase === null ? inicio : inicioDeFase ?? anterior;

  return { ahora, antes, inicioDeFase, inicio };
};

/**
 * La media de peso de una semana de programa: la misma cifra que la casilla de
 * la portada, y no el pesaje del día de la foto —con dos fuentes, la cabecera
 * y la casilla discrepaban por décimas—.
 */
export const mediaDeLaSemana = (history = [], startDate, week) => {
  const lunes = weekStartOfProgramWeek(startDate, week);
  if (!lunes) return null;
  return weeklyWeightAverages(history).find((w) => w.date === lunes)?.value ?? null;
};
