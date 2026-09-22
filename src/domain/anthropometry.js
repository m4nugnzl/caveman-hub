/**
 * Antropometría y seguimiento de peso.
 *
 * ── Cómo está guardado, de verdad ───────────────────────────────────────────
 * La tabla `anthropometry` tiene UNA sola columna de datos: `history` (jsonb).
 * No existe `three_day_weights`, que es lo que el código asumía y por lo que
 * el guardado fallaba entero (y, en consecuencia, no se registraba ni el peso:
 * de ahí que las gráficas del panel aparecieran vacías).
 *
 * Así que el promedio de los 3 días alternos ya no se almacena: se DERIVA de
 * los registros de `history`. Es mejor de las dos maneras — no hace falta
 * migrar nada, y en vez de tres huecos que se sobrescriben cada semana quedan
 * pesajes con fecha real que alimentan la tendencia.
 *
 * Cada entrada de `history`:
 *   { id, date, weight, skinFolds?, perimeters?, medidas?, nutrition?, semana? }
 *
 * `weight` es lo único obligatorio. Pliegues y perímetros son opcionales y solo
 * se guardan si se han rellenado. `nutrition` es una foto de las kcal y macros
 * vigentes en ese momento, para poder cruzar dieta con evolución de peso (la
 * tabla de nutrición solo guarda el plan actual, sin histórico).
 *
 * ══ Y `semana`: PARA QUÉ REVISIÓN CUENTA ═══════════════════════════════════
 *
 * Casi siempre no está, y entonces un registro cuenta para la semana natural de
 * su fecha — que es lo que hacía la aplicación entera y lo que sigue haciendo.
 *
 * Existe por la ventana de entrega tardía. Un cliente que entrega el martes la
 * revisión del viernes anterior se pesa HOY: su único pesaje cae en la semana
 * siguiente y la revisión que está entregando no lo veía nunca («te pide 1
 * pesaje y llevas 0», con el botón de entregar rebotando). Con el sello, ese
 * pesaje cuenta para la revisión abierta y **solo para ella**: no se cuela
 * además en la semana en la que está fechado, que es lo que haría cualquier
 * ventana estirada. Ver `semanaDelRegistro` y `selloDelPeriodo`.
 */

import { toNum, toNum0, round } from '@/lib/num';
import { toISODate, weekStart } from '@/lib/dates';
import { newId } from '@/lib/ids';

export const FOLDS_LABELS = {
  tricipital: 'Tricipital',
  subescapular: 'Subescapular',
  abdominal: 'Abdominal',
  suprailiaco: 'Suprailíaco',
  muslo: 'Muslo',
  pantorrilla: 'Pantorrilla',
};

export const PERIMETER_LABELS = {
  pecho: 'Pecho',
  brazoD: 'Brazo Dcho.',
  brazoI: 'Brazo Izq.',
  ombligo: 'Ombligo',
  gluteo: 'Glúteo',
  musloD: 'Muslo Dcho.',
  musloI: 'Muslo Izq.',
  gemeloD: 'Gemelo Dcho.',
  gemeloI: 'Gemelo Izq.',
};
export const emptyFolds = () => Object.fromEntries(Object.keys(FOLDS_LABELS).map((k) => [k, '']));
export const emptyPerimeters = () =>
  Object.fromEntries(Object.keys(PERIMETER_LABELS).map((k) => [k, '']));

export const emptyAnthropometry = () => ({ history: [] });

// ── % graso ────────────────────────────────────────────────────────────────

export const foldsSum = (folds) =>
  Object.values(folds || {}).reduce((acc, v) => acc + toNum0(v), 0);

/**
 * % graso por suma de 6 pliegues, o `null` si no hay pliegues.
 *   Hombres: 2,59   + (Σ × 0,1051)
 *   Mujeres: 3,5803 + (Σ × 0,1548)
 */
export const fatPercent = (folds, gender) => {
  const sum = foldsSum(folds);
  if (sum <= 0) return null;
  const pct = gender === 'Mujer' ? 3.5803 + sum * 0.1548 : 2.59 + sum * 0.1051;
  return round(pct, 1);
};

// ── Construcción de registros ──────────────────────────────────────────────

/** Deja fuera los grupos de medidas que no se han rellenado. */
const compact = (values) => {
  const entries = Object.entries(values || {}).filter(([, v]) => toNum(v) !== null);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([k, v]) => [k, toNum(v)]));
};

/**
 * Registro completo de revisión. Solo `weight` es obligatorio; pliegues y
 * perímetros se omiten si están vacíos, en vez de guardarse llenos de ceros
 * (un cero no es lo mismo que "no medido", y falseaba las sumas).
 *
 * `nutritionFoto` es la foto del plan de ese momento —`cycleFoto`, ya armada por
 * quien tiene delante el ciclo de esta persona— y se guarda tal cual para poder
 * cruzar después kcal y macros con la evolución del peso.
 */
export const buildAnthropometryLog = ({
  date,
  weight,
  folds,
  perimeters,
  /*
    ── Y lo que el entrenador haya decidido medir ────────────────────────────
    Ya viene compactado por `compactMedidas` —que sabe los decimales de cada
    una— y con la misma ley que los pliegues: lo que no se rellenó no entra, y
    `null` significa «no medido» y no cero. En una glucosa eso no es un matiz:
    es la diferencia entre un hueco y una hipoglucemia. Ver `domain/medidas.js`.
  */
  medidas = null,
  nutritionFoto = null,
  /*
    ── Y para qué revisión cuenta, si no es la de su fecha ───────────────────
    El lunes del periodo que se está entregando, y solo cuando la fecha del
    registro cae FUERA de él: es la ventana de entrega tardía. Lo decide quien
    escribe —que es el único que sabe qué revisión tiene abierta— con
    `selloDelPeriodo`, y aquí solo se guarda. Ver la cabecera del archivo.
  */
  semana = null,
}) => {
  const log = {
    id: newId('log'),
    date: toISODate(date),
    weight: toNum(weight),
  };

  const sello = semana ? weekStart(semana) : null;
  if (sello && sello !== weekStart(log.date)) log.semana = sello;

  const skinFolds = compact(folds);
  const perims = compact(perimeters);
  if (skinFolds) log.skinFolds = skinFolds;
  if (perims) log.perimeters = perims;
  if (medidas && Object.keys(medidas).length > 0) log.medidas = medidas;

  /*
    ── La foto del plan llega HECHA ──────────────────────────────────────────
    Aquí se leía `nutritionPlan.targetKcals`, que es la columna heredada, que es
    el PRIMER día del plan: en un alto/bajo, siempre el alto y sin decirlo. La
    cifra honesta en un ciclado es la media ponderada, y para ponderar hacen
    falta las casillas del ciclo de esta persona —que este módulo no tiene ni
    debe tener: es antropometría—. La arma `cycleFoto` y llega puesta. Ver el
    porqué entero allí.
  */
  /* Y no pasa por `compact`: esa función convierte cada valor con `toNum` y
     tira lo que no sea número, así que se llevaría por delante de dónde sale la
     cifra (`de`) y los días del ciclo. Lo que se comprueba es que la foto diga
     ALGO: un plan sin objetivo no deja rastro, como antes. */
  if (nutritionFoto && ['kcals', 'protein', 'carbs', 'fats'].some((k) => toNum(nutritionFoto[k]) !== null)) {
    log.nutrition = nutritionFoto;
  }

  return log;
};

/** Pesaje rápido: solo fecha y peso, que es el caso habitual del cliente. */
export const buildWeightLog = ({ date, weight, nutritionFoto = null, semana = null }) =>
  buildAnthropometryLog({ date, weight, nutritionFoto, semana });

// ── Consultas ──────────────────────────────────────────────────────────────

/**
 * LA SEMANA PARA LA QUE CUENTA UN REGISTRO: la de su sello si lo lleva, y si no
 * la natural de su fecha.
 *
 * Es la ÚNICA regla, y por eso está aquí sola: la usan la media del periodo
 * (`weekEntries`), las medidas de la entrega (`ultimaMedidaDe`) y las medias
 * semanales (`weeklyWeightAverages`). Escrita tres veces, la ventana de gracia
 * volvería a contar distinto en cada pantalla — que es de donde venía el aviso.
 */
export const semanaDelRegistro = (log) => (log?.semana ? weekStart(log.semana) : weekStart(log?.date));

/**
 * LOS PLIEGUES DE UN REGISTRO, se llamen como se llamen.
 *
 * `buildAnthropometryLog` los guarda en `skinFolds`; el formulario los maneja
 * como `folds`, y media aplicación leía una clave y media la otra. El precio
 * era gordo y mudo: a un cliente al que su entrenador solo le pide PLIEGUES,
 * `tieneMedidas` le decía que no se había medido por mucho que se midiera, el
 * renglón se quedaba en «Sin tomar esta semana» para siempre y —con el bloque
 * marcado como obligatorio— «Entregar mi semana» le reabría el asistente una y
 * otra vez sin dejarle entregar nunca.
 */
export const pliegesDe = (log) => log?.skinFolds || log?.folds || null;

/** De más antiguo a más reciente, para leer tendencias de izquierda a derecha. */
export const chronological = (history) =>
  [...(history || [])].filter((h) => h && h.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));

/** De más reciente a más antiguo, para listados. */
export const reverseChronological = (history) => chronological(history).reverse();

export const weightSeries = (history) =>
  chronological(history)
    .map((h) => ({ date: h.date, value: toNum(h.weight) }))
    .filter((p) => p.value !== null);

/**
 * El último peso registrado, o `null` si no hay ninguno.
 *
 * ══ Por qué existe, y qué reemplaza ═════════════════════════════════════════
 *
 * Había una columna `clients.current_weight` que se pintaba en el portal del
 * cliente bajo la etiqueta «Peso actual» y en el roadmap. **Nadie la escribía**:
 * ni la aplicación ni ninguna migración. Se quedó con el valor que tuviera el día
 * que se dejó de rellenar, y desde entonces le enseñaba a cada persona un peso
 * congelado presentado como el de hoy.
 *
 * Un dato desactualizado con etiqueta de actual es peor que no tener el dato: el
 * hueco vacío se pregunta, la cifra equivocada se cree. Y aquí la cree quien está
 * siguiendo una dieta a partir de ella.
 *
 * El peso de verdad siempre estuvo en `anthropometry.history`, que es lo que la
 * persona rellena cada semana. Esto lo lee de ahí.
 *
 * Se pone en el dominio y no en cada pantalla porque ya se estaba calculando a
 * mano en la analítica (`weightPts[weightPts.length - 1]`), y dos sitios
 * calculando «el último peso» por su cuenta es de donde salen las cifras que no
 * coinciden entre pantallas.
 */
export const latestWeight = (history) => {
  const puntos = weightSeries(history);
  return puntos.length > 0 ? puntos[puntos.length - 1].value : null;
};

export const fatSeries = (history, gender) =>
  chronological(history)
    .map((h) => ({ date: h.date, value: fatPercent(h.skinFolds, gender) }))
    .filter((p) => p.value !== null);

/** Serie de kcal registradas en cada revisión (a partir de la foto guardada). */
export const kcalSeries = (history) =>
  chronological(history)
    .map((h) => ({ date: h.date, value: toNum(h.nutrition?.kcals) }))
    .filter((p) => p.value !== null);

/**
 * LOS CAMBIOS DE KCAL, uno a uno, sacados de la foto de cada pesaje.
 *
 * ══ El eje del tiempo de la dieta se DIBUJA, no se mantiene ════════════════
 *
 * Hubo una propuesta de declarar «tramos» a mano —cada objetivo con su fecha de
 * inicio y de fin— y se cayó por el oficio, no por el código: un microciclo se
 * planifica ANTES, pero un cambio de calorías se decide DESPUÉS, mirando el
 * peso. Mantener una columna vertebral para lo que la mayor parte del tiempo es
 * un retoque de cincuenta calorías es trabajo que nadie va a hacer.
 *
 * Y lo que se quería del tramo no era el tramo: era la lectura —«le bajaste 250
 * kcal el 6 de julio; desde entonces, −2,4 kg»—. Esa lectura ya estaba guardada
 * (`log.nutrition`, en cada pesaje y en cada revisión) y no la enseñaba nadie.
 * Esto es leerla: cero esquema nuevo y cero gestos nuevos.
 */
export const kcalSteps = (history) => {
  const puntos = kcalSeries(history);
  const pasos = [];

  for (let i = 1; i < puntos.length; i += 1) {
    if (puntos[i].value === puntos[i - 1].value) continue;
    pasos.push({
      date: puntos[i].date,
      from: puntos[i - 1].value,
      to: puntos[i].value,
      delta: round(puntos[i].value - puntos[i - 1].value),
    });
  }

  return pasos;
};

/**
 * El último cambio de calorías y lo que ha hecho el peso desde entonces.
 *
 * `null` si nunca ha cambiado: con una sola cifra pautada no hay «desde
 * entonces» que contar, y decirlo igualmente sería inventarse un hito.
 *
 * `weightDelta` es `null` mientras no haya un pesaje POSTERIOR al cambio: el
 * día que se toca el objetivo, la diferencia es cero por definición y pintarla
 * como resultado sería mentir sobre lo que aún no ha pasado.
 */
export const lastKcalChange = (history) => {
  const pasos = kcalSteps(history);
  if (pasos.length === 0) return null;

  const paso = pasos[pasos.length - 1];
  const pesos = weightSeries(history);
  const desde = pesos.find((p) => String(p.date) >= String(paso.date)) || null;
  const ultimo = pesos.length > 0 ? pesos[pesos.length - 1] : null;
  const hayDespues = Boolean(desde && ultimo && String(ultimo.date) > String(desde.date));

  return {
    ...paso,
    weightFrom: desde?.value ?? null,
    weightTo: ultimo?.value ?? null,
    weightDelta: hayDespues ? round(ultimo.value - desde.value, 1) : null,
    until: ultimo?.date ?? null,
  };
};

/** Serie del % que representa cada macro sobre el total calórico, por revisión. */
export const macroShareSeries = (history) =>
  chronological(history)
    .map((h) => {
      const p = toNum0(h.nutrition?.protein) * 4;
      const c = toNum0(h.nutrition?.carbs) * 4;
      const f = toNum0(h.nutrition?.fats) * 9;
      const total = p + c + f;
      if (total <= 0) return null;
      return {
        date: h.date,
        protein: round((p / total) * 100),
        carbs: round((c / total) * 100),
        fats: round((f / total) * 100),
      };
    })
    .filter(Boolean);

/** Serie de un perímetro concreto (cintura, brazo…) a lo largo del tiempo. */
export const perimeterSeries = (history, key) =>
  chronological(history)
    .map((h) => ({ date: h.date, value: toNum(h.perimeters?.[key]) }))
    .filter((p) => p.value !== null);

/**
 * Promedio de los últimos `n` pesajes. Sustituye al widget de "3 días alternos":
 * misma idea (promediar para filtrar el ruido diario) pero sobre registros con
 * fecha real, y sin exigir que sean exactamente tres.
 */
export const rollingWeightAverage = (history, n = 3) => {
  const values = weightSeries(history).slice(-n).map((p) => p.value);
  if (values.length === 0) return null;
  return { average: round(values.reduce((a, b) => a + b, 0) / values.length, 2), count: values.length };
};

/** Promedio de peso por semana natural: la tendencia limpia de ruido diario. */
export const weeklyWeightAverages = (history) => {
  const buckets = new Map();
  for (const log of chronological(history)) {
    const value = toNum(log.weight);
    if (value === null) continue;
    /* Por la semana para la que CUENTA y no por la de su fecha: un pesaje
       sellado para la revisión que se entregó tarde tiene que salir en la
       media de ESA semana, que es la que su entrenador leyó. */
    const key = semanaDelRegistro(log);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(value);
  }

  return [...buckets.entries()]
    .map(([week, values]) => ({
      date: week,
      value: round(values.reduce((a, b) => a + b, 0) / values.length, 2),
      count: values.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/** Variación entre el primer y el último registro de una serie. */
export const seriesDelta = (points) => {
  if (!points || points.length < 2) return null;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  return { from: first, to: last, delta: round(last - first, 2) };
};

/**
 * Ritmo de cambio por semana, en base a promedios semanales. Es la cifra que
 * de verdad usa un entrenador para decidir si ajustar calorías.
 */
export const weeklyRateOfChange = (history) => {
  const weekly = weeklyWeightAverages(history);
  if (weekly.length < 2) return null;
  const first = weekly[0];
  const last = weekly[weekly.length - 1];
  const weeks = Math.max(1, Math.round((Date.parse(last.date) - Date.parse(first.date)) / (7 * 86400000)));
  return round((last.value - first.value) / weeks, 2);
};

/** ¿Se ha medido algún pliegue o perímetro alguna vez? */
export const hasMeasurements = (history) =>
  chronological(history).some((h) => h.skinFolds || h.perimeters);

/**
 * `(registro) => bool` para el periodo `[desde, desde + semanas)`. Sin `desde`
 * acepta todo: es el caso de quien pregunta por el historial entero.
 *
 * Mira la semana para la que el registro CUENTA (`semanaDelRegistro`) y no su
 * fecha: es lo que mete en la revisión que se entrega tarde el pesaje de hoy, y
 * lo que a la vez lo deja fuera de la semana en la que está fechado.
 */
const ventanaDe = (desde, semanas = 1) => {
  const inicio = desde ? weekStart(desde) : null;
  if (!inicio) return () => true;
  const fin = new Date(Date.parse(`${inicio}T00:00:00Z`) + Math.max(1, semanas) * 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  return (log) => {
    const semana = semanaDelRegistro(log);
    return Boolean(semana) && semana >= inicio && semana < fin;
  };
};

/**
 * ¿ESTE REGISTRO TRAE MEDIDAS? Pliegues, perímetros o cualquiera de las medidas
 * propias que el entrenador haya añadido en el protocolo.
 *
 * ── Por qué está aquí y no en la pantalla ──────────────────────────────────
 * Porque la misma pregunta la hacían dos sitios con dos respuestas distintas: el
 * renglón «Tus medidas» de la entrega la contestaba mirando SOLO pliegues y
 * perímetros, y el guardián que deja entregar miraba además `medidas`. Con dos
 * cuentas, la lista decía «hecho» y el botón mandaba al asistente a tomarlas.
 */
export const tieneMedidas = (log) =>
  foldsSum(pliegesDe(log)) > 0 ||
  Object.values(log?.perimeters || {}).some((v) => Number(v) > 0) ||
  Object.values(log?.medidas || {}).some((v) => v !== null && v !== '');

/**
 * LA ÚLTIMA TOMA DE MEDIDAS DEL PERIODO QUE SE ENTREGA, o `null`.
 *
 * ══ Por qué lleva ventana, y por qué no la tenía ═══════════════════════════
 *
 * Sin ventana esto era «la última toma de SIEMPRE», y con eso el paso «Tus
 * medidas» se quedaba en verde para el resto del programa: bastaba haberse
 * medido una vez, en la semana 2, para que la semana 9 dijera que estaba hecha
 * —fechada en la semana 2, que es como se descubrió—. Un cliente leyendo «3 de 4
 * completadas» de una revisión en la que no había tocado nada.
 *
 * La ventana es la MISMA que la de los pesajes (`weekEntries`): el periodo
 * abierto, que con cadencia quincenal son dos semanas y no una.
 *
 * Sin `desde` no se acota nada y se devuelve la última de todas, que es lo que
 * quiere quien pregunta «¿se ha medido alguna vez?».
 */
export const ultimaMedidaDe = (history, { desde = null, semanas = 1 } = {}) => {
  const dentro = ventanaDe(desde, semanas);
  return reverseChronological(history).find((h) => dentro(h) && tieneMedidas(h)) || null;
};

// ── Check-in semanal ───────────────────────────────────────────────────────
//
// El seguimiento real de un cliente no es un pesaje suelto: es un CHECK-IN
// semanal. Se pesa varios días, se promedia para filtrar el ruido diario de agua
// y glucógeno, y ese promedio es el dato que se compara con la semana anterior.
//
// Los pesajes del día se guardan como registros normales de `history`, así que
// no hace falta ninguna estructura nueva: el check-in es una LECTURA de los
// registros de una semana, no otro tipo de dato.

/** Registros de peso que caen dentro de la semana natural de `date`. */
export const weekEntries = (history, date, weeks = 1) => {
  const key = weekStart(date);
  if (!key) return [];

  /*
    ── Por qué esto puede abarcar más de una semana ──────────────────────────
    Porque la cadencia de check-in no siempre es semanal: se puede revisar cada
    dos o cada cuatro (`domain/calendar.js`). Con una ventana fija de una semana,
    el cliente que se pesaba en la SEGUNDA semana de un periodo quincenal
    entregaba su check-in sin peso —la media salía de la primera, que estaba
    vacía— mientras la pantalla le decía «3 de 3 pesajes».

    Por defecto sigue siendo una semana, que es la cadencia de casi todo el mundo
    y lo que necesitan la analítica y el histórico.
  */
  /* Por la semana para la que cada registro CUENTA, no por su fecha: con la
     entrega tardía abierta, el pesaje de hoy lleva el sello de la revisión que
     se está entregando y tiene que entrar en su media. Ver `ventanaDe`. */
  const dentro = ventanaDe(key, weeks);

  return chronological(history).filter((h) => dentro(h) && toNum(h.weight) !== null);
};

/**
 * Estado del check-in de una semana: qué días se ha pesado, cuál es el promedio
 * y cuánto ha cambiado respecto a la semana anterior.
 *
 * `target` son los pesajes que el ENTRENADOR pide a la semana, y sale de su
 * protocolo (`weighInsTarget`). No es un requisito que bloquee nada: informa de
 * cuántos faltan para que la media de la semana sea fiable.
 *
 * ══ Por qué por defecto es 0 y no 3 ═════════════════════════════════════════
 *
 * Eran 3, escritos aquí, y esa cifra se convirtió en la norma de ocho pantallas
 * sin que ningún entrenador la hubiera puesto: al cliente le salía «te faltan 2
 * pesajes» y a su entrenador «check-in a medias» por incumplir algo que nadie le
 * había pedido. Ahora la norma la pone el protocolo y esta función solo la
 * aplica.
 *
 * El 0 es «no se piden», no «se piden cero»: `asked` lo dice en claro para que
 * ninguna pantalla tenga que interpretar un número. Y es el respaldo a
 * propósito: quien llame sin pasar objetivo obtiene silencio, que es el único
 * fallo inofensivo de los dos —reclamar de más es ruido en la cara del cliente;
 * reclamar de menos, como mucho, es no decir nada.
 */
export const weeklyCheckIn = (history, date, { target = 0, weeks = 1 } = {}) => {
  const entries = weekEntries(history, date, weeks);
  const values = entries.map((h) => toNum(h.weight));
  const average = values.length > 0 ? round(values.reduce((a, b) => a + b, 0) / values.length, 2) : null;

  const weekly = weeklyWeightAverages(history);
  const current = weekStart(date);
  const previousWeek = weekly.filter((w) => w.date < current).pop() || null;

  return {
    weekStart: current,
    entries,
    count: values.length,
    /* El objetivo escala con el periodo: pedir tres pesajes en dos semanas sería
       pedir la mitad de los que hacen falta para que la media signifique algo. */
    target: target * Math.max(1, weeks),
    /* Si hay algo que cumplir. Con `false`, ninguna pantalla habla de pesajes que
       falten ni llama fiable a una media: no hay vara con la que medirla. */
    asked: target > 0,
    average,
    previousAverage: previousWeek?.value ?? null,
    delta: average !== null && previousWeek ? round(average - previousWeek.value, 2) : null,
    /* Sin objetivo pedido, `complete` no significa «lo ha hecho todo» sino que no
       queda nada pendiente. Las pantallas miran `asked` antes de felicitar. */
    complete: values.length >= target * Math.max(1, weeks),
  };
};

/** Días de la semana natural que empieza en `weekStartISO`, en ISO. */
export const weekDates = (weekStartISO) => {
  const start = Date.parse(`${weekStartISO}T00:00:00Z`);
  if (!Number.isFinite(start)) return [];
  return Array.from({ length: 7 }, (_, i) => new Date(start + i * 86400000).toISOString().slice(0, 10));
};
