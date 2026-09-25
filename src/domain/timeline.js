/**
 * LA LÍNEA DE TIEMPO DE UNA REVISIÓN: una fila por semana, desde el alta.
 *
 * ══ Por qué esto sale del componente y baja al dominio ══════════════════════
 *
 * Se construía dentro de `Coach/WeekReview.jsx`, un `useMemo` de treinta líneas
 * en mitad de una pantalla de novecientas que cruza tres fuentes distintas. Tres
 * consecuencias, todas reales:
 *
 *   · No se podía probar. La regla de qué calorías ganan cuando hay dos —la foto
 *     de nutrición y la del plan de la revisión— vivía en una pantalla, no en un
 *     sitio donde se pudiera fijar con una prueba.
 *   · Se leía a sí misma antes de existir: el `useMemo` de la línea usaba las
 *     fotos agrupadas, que se declaran cien líneas más abajo. Eso no es un olor,
 *     es un `ReferenceError` en cada render.
 *   · Y el día que el portal del cliente quiera su propia línea —el mismo peso,
 *     las mismas semanas, sin las calorías— habría que copiarla entera.
 *
 * ══ Qué cruza, y por qué la semana de PROGRAMA es el eje ════════════════════
 *
 * Las tres capas viven en ejes distintos y solo comparten uno: el lunes en que
 * empieza cada semana de programa.
 *
 *   · **El peso** viene de la serie semanal (`buildWeeklySeries`), que va por
 *     semana NATURAL: se cruza por `weekStart`.
 *   · **Las calorías** vienen de dos sitios que guardan la misma cifra en dos
 *     momentos —la foto de nutrición que se toma al medir los pliegues y la foto
 *     del plan de cada revisión cerrada—. Juntarlas rellena huecos; no mezcla
 *     nada, porque es el mismo objetivo escrito dos veces.
 *   · **Su cuerpo** viene de las fotos, que ya se agrupan por semana de programa.
 *
 * Y el eje es la semana de programa —«S4»— y no la natural porque esta línea
 * ADEMÁS es el selector de la revisión: lo que se pulsa tiene que llamarse igual
 * que lo que dicen la rutina, las fotos y el resto de la pantalla.
 */

import { addDays, daysBetween, weekStart } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { weekStartOfProgramWeek } from './photos';

/**
 * Las filas de la línea, de la primera semana del programa a la última.
 *
 * ── Sin recortes, y ésta es LA decisión de la pantalla ──────────────────────
 * Devuelve TODAS las semanas. La versión anterior se quedaba con las diez
 * últimas y además tiraba las posteriores a la que se estuviera revisando, con
 * dos efectos que se notaban:
 *
 *   1. A partir de la semana once, el arranque del cliente desaparecía. Una
 *      revisión sin el punto de partida es la cifra de hoy sin nada que la
 *      juzgue: 81,5 kg viniendo de 84 y 81,5 viniendo de 79 son dos decisiones
 *      contrarias, y las dos se veían igual.
 *   2. La escala se recalculaba con lo que quedaba, así que **la misma semana se
 *      dibujaba a distinta altura según cuál tuvieras elegida**. Un instrumento
 *      que cambia de forma al señalarlo no se puede leer dos veces.
 *
 * Elegir una semana ya no recorta nada: mueve un cursor. Lo que sigue hablando
 * solo de la semana elegida es todo lo de abajo —las fotos, las series, lo que
 * contestó—, que es donde la distinción importa. Quien recorta para mirar de
 * cerca es la ventana (`windowFrom`), y eso es acercarse, no borrar.
 *
 * @param weeks       números de semana de programa que existen (los microciclos).
 * @param startDate   el alta del cliente; sin ella no hay eje y no hay línea.
 * @param series      `buildWeeklySeries` — filas por semana natural.
 * @param reviews     `reviewHistory` — revisiones cerradas, con su foto del plan.
 * @param photoGroups `groupByWeek` — sus fotos, ya por semana de programa.
 */
export const reviewTimeline = ({
  weeks = [],
  startDate = null,
  series = [],
  reviews = [],
  photoGroups = [],
} = {}) => {
  if (!startDate || weeks.length === 0) return [];

  const porSemanaNatural = new Map(series.map((fila) => [fila.week, fila]));

  /* Las calorías que quedaron escritas al cerrar cada revisión, y las semanas en
     las que hay una respuesta dada. Del mismo recorrido: son la misma lista. */
  const kcalDeRevision = new Map();
  const contestadas = new Set();
  for (const revision of reviews) {
    if (!revision?.weekStart) continue;
    contestadas.add(revision.weekStart);
    const kcals = toNum(revision.snapshot?.kcals);
    if (kcals !== null) kcalDeRevision.set(revision.weekStart, kcals);
  }

  const fotos = new Map(photoGroups.map((grupo) => [grupo.week, grupo.photos]));

  return [...weeks]
    .sort((a, b) => a - b)
    .map((week) => {
      const weekStart = weekStartOfProgramWeek(startDate, week);
      const fila = weekStart ? porSemanaNatural.get(weekStart) : null;

      return {
        week,
        weekStart,
        weight: toNum(fila?.weight),
        /* La foto de nutrición manda sobre la de la revisión: es la que se tomó
           midiendo, y la revisión guarda lo que se le puso. Cuando las dos
           existen dicen lo mismo; cuando no, gana el dato medido. */
        kcals: toNum(fila?.kcals) ?? (weekStart ? kcalDeRevision.get(weekStart) ?? null : null),
        /* Una por semana: la tira es una escala, no un álbum. Todas se ven en el
           visor, que se abre pulsando la semana que ya estás revisando. */
        photo: (fotos.get(week) || []).find((p) => p.url) || null,
        /* Si esa semana ya la contestaste. En una línea de treinta semanas es lo
           que distingue el proceso del hueco: dónde hubo revisión y dónde no. */
        reviewed: weekStart ? contestadas.has(weekStart) : false,
      };
    });
};

/**
 * Cuántas semanas caben de cerca en el ancho que hay.
 *
 * ── Por qué se calcula y no se fija en diez ─────────────────────────────────
 * El detalle lleva la foto de cada semana, y una foto por debajo de unos 44 px
 * no es una foto: es un sello de color. La versión anterior fijaba diez y en el
 * móvil las escondía con un `display: none`, o sea que la capa que dice cómo se
 * VE el cliente desaparecía justo en la pantalla en la que más se revisa.
 *
 * Con el ancho real se enseñan las que caben —cinco o seis en un móvil, doce en
 * un escritorio— y las fotos se quedan siempre. Lo que sobra no se pierde: está
 * entero en la estela de arriba, que es de lo que va toda esta pantalla.
 */
export const windowSize = (width = 0, { min = 5, max = 12, per = 62 } = {}) => {
  const cabe = Math.floor((toNum(width) ?? 0) / per);
  return Math.min(max, Math.max(min, cabe));
};

/**
 * Dónde empieza la ventana de detalle, dado dónde estaba y qué se acaba de
 * elegir.
 *
 * ══ Pegajosa a propósito ════════════════════════════════════════════════════
 *
 * Lo natural sería centrar la ventana en la semana elegida, y es justo lo que no
 * hay que hacer: cada pulsación movería el suelo debajo de lo que estás
 * comparando. Eliges S12, miras, eliges S13 para comparar — y las once semanas
 * del fondo se han corrido una posición. La comparación se hace contra un fondo
 * quieto.
 *
 * Así que la ventana **no se mueve mientras la semana elegida esté dentro**, y
 * cuando se sale se corre lo MÍNIMO para meterla: un paso, como pasar página.
 * Solo se centra cuando no venía de ningún sitio (`from` nulo), que es al abrir
 * la pantalla o al cambiar de cliente.
 *
 * @returns el índice de la primera semana visible, ya acotado a la línea.
 */
export const windowFrom = ({ from = null, index = 0, size = 10, total = 0 } = {}) => {
  if (total <= size) return 0;

  const tope = total - size;
  const acotar = (v) => Math.min(tope, Math.max(0, v));

  /* Sin ventana previa: se abre centrada en lo elegido. */
  if (from === null || from === undefined) return acotar(index - Math.floor(size / 2));

  const actual = acotar(from);
  if (index < actual) return acotar(index);
  if (index > actual + size - 1) return acotar(index - size + 1);
  return actual;
};

/**
 * LAS TRES CIFRAS de la semana elegida, sacadas de la propia línea.
 *
 * ── Por qué salen de aquí y no de otro sitio ────────────────────────────────
 * Porque la línea ya tiene el peso de TODAS las semanas, así que «cuánto ha
 * cambiado desde que empezó» es una resta y no una consulta. Antes esa cifra no
 * existía en la pantalla: se veía el peso de la semana y su variación contra la
 * anterior, y con eso se decide poco. Medio kilo arriba en una semana es ruido;
 * lo que dice si el proceso funciona es el acumulado.
 *
 * Devuelve `null` en lo que no se pueda calcular en vez de un cero. Un cero en
 * «desde el inicio» significa «no se ha movido», que es una afirmación, y aquí
 * lo que pasa muchas veces es que no hay pesaje en la semana uno.
 */
export const timelineSummary = (rows = [], week = null) => {
  const i = rows.findIndex((r) => r.week === week);
  if (i < 0) return null;

  const fila = rows[i];

  /* El peso anterior es el de la última semana CON pesaje, no el de la semana
     de antes: si no se pesó, comparar contra un hueco daría «sin cambio» en
     alguien que lleva tres semanas bajando. */
  const previa = rows
    .slice(0, i)
    .reverse()
    .find((r) => r.weight !== null);

  /* Y el de partida es el primero que hay, que no tiene por qué ser el de la
     semana uno. */
  const inicial = rows.find((r) => r.weight !== null);

  const resta = (a, b) => (a === null || b === null ? null : Math.round((a - b) * 10) / 10);

  return {
    weight: fila.weight,
    kcals: fila.kcals,
    delta: resta(fila.weight, previa?.weight ?? null),
    /* Contra el primer pesaje, y solo si no ES el primer pesaje: «0,0 kg desde
       el inicio» en la semana de partida es una obviedad con aspecto de dato. */
    sinceStart:
      inicial && fila.weight !== null && inicial.week !== fila.week
        ? resta(fila.weight, inicial.weight)
        : null,
    from: inicial && inicial.week !== fila.week ? inicial.week : null,
    kcalDelta: resta(fila.kcals, previa?.kcals ?? null),
  };
};

/**
 * EL PLAN QUE ESTUVO EN VIGOR cada semana — la línea de la nutrición.
 *
 * ══ Por qué el objetivo es una ESCALERA y no una curva ══════════════════════
 *
 * Aquí estaba el fallo de la lente de nutrición, y no era de estilo. Las
 * calorías se dibujaban como barras al fondo de la curva del peso, sin rótulo y
 * sin eje, así que solo las entendía quien ya sabía que estaban ahí. Y las
 * barras además mienten sobre lo que son: una barra dice «esto se midió esta
 * semana», y un objetivo de calorías no se mide — **se pone, y sigue puesto
 * hasta que lo cambias**.
 *
 * Su forma verdadera es una escalera: tramos planos y escalones en las semanas
 * en las que tocaste algo. Dibujada así, la pregunta del entrenador —«¿cuánto
 * llevaba con 2.400 antes de que se parase el peso?»— se contesta midiendo el
 * ancho de un peldaño.
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 * De la foto del plan que guarda cada revisión cerrada (`planSnapshot`), que es
 * el único sitio donde queda constancia de qué le pusiste y cuándo. Entre dos
 * revisiones no hay dato porque no hubo cambio: se arrastra el anterior, que es
 * literalmente lo que estuvo en vigor.
 *
 * ══ Tres fuentes, en este orden ════════════════════════════════════════════
 *
 *   1. **La versión fechada** (`nutrition_plan_versions`, 0124): la pauta del
 *      día en que cambió. Exacta. Existe desde que se aplicó la migración.
 *   2. **La foto de la revisión**: la pauta al cerrar cada revisión. Un cambio
 *      hecho entre dos revisiones cae en la semana de la segunda; si entre las
 *      dos pasó más de una semana, el cambio lleva `aprox` con las dos fechas
 *      entre las que pudo hacerse.
 *   3. **El plan de HOY**, para las semanas posteriores a la última revisión
 *      cuando no hay versiones: lo que tiene puesto ahora mismo sigue en vigor
 *      aunque todavía no lo hayas guardado en ninguna revisión. Con versiones,
 *      el plan de hoy solo cuenta como la versión de hoy: la del estado en
 *      memoria, que puede ir por delante de las versiones cargadas.
 *
 * Es la ÚNICA fuente de la dieta por semana: la leen la Revisión, el Resumen y
 * el roadmap.
 *
 * @param rows     filas con `weekStart` (lunes): las de `reviewTimeline` o las
 *   semanas naturales del roadmap. Se devuelven en el mismo orden.
 * @param reviews  `reviewHistory` — de donde salen las fotos del plan.
 * @param plan     el plan de HOY (`planSnapshot` del cliente).
 * @param versions `[{ dia, snapshot }]`, la pauta fechada con la forma de la
 *   foto (ver `fotoDeVersion` en `reviews.js`).
 * @param hoy      el día de hoy: la fecha del plan en memoria cuando va por
 *   delante de las versiones cargadas.
 * @param cortarEnHoy las semanas posteriores a la de hoy no llevan pauta: el
 *   plan de hoy no se proyecta al futuro. Lo pide el roadmap; la Revisión y el
 *   Resumen no lo pasan y no cambian.
 */
export const nutritionTrack = ({
  rows = [],
  reviews = [],
  plan = null,
  versions = [],
  hoy = null,
  cortarEnHoy = false,
} = {}) => {
  /* Las fotos por su semana, de la más vieja a la más nueva. `reviewHistory`
     las devuelve al revés porque el histórico se lee desde hoy. */
  const fotos = [...reviews]
    .filter((r) => r?.weekStart && r.snapshot)
    .sort((a, b) => String(a.weekStart).localeCompare(String(b.weekStart)));
  const ultimaFoto = fotos.length > 0 ? String(fotos[fotos.length - 1].weekStart) : '';
  const lunesDeHoy = hoy ? weekStart(hoy) : null;

  const versiones = [...(versions || [])]
    .filter((v) => v?.dia && v.snapshot)
    .sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
  /* El plan en memoria, como la versión de hoy, si dice otra cosa que la
     última cargada: un cambio de esta sesión todavía no está en la lista. */
  if (versiones.length > 0 && plan && hoy) {
    const ultima = versiones[versiones.length - 1];
    if (!mismaPauta(ultima.snapshot, plan) && String(ultima.dia) <= String(hoy)) {
      versiones.push({ dia: hoy, snapshot: plan });
    }
  }

  let ultima = null;
  let previa = null;

  return rows.map((fila) => {
    const lunes = String(fila.weekStart || '');
    const domingo = addDays(lunes, 6) || lunes;
    const futura = Boolean(cortarEnHoy && lunesDeHoy && lunes > lunesDeHoy);

    let vigente = null;
    let fuente = null;
    let cambioEl = null;
    let aprox = null;

    if (!futura) {
      const version = ultimaHasta(versiones, (v) => String(v.dia) <= domingo);
      const foto = ultimaHasta(fotos, (f) => String(f.weekStart) <= lunes);
      if (version) {
        vigente = version.snapshot;
        fuente = 'version';
        if (String(version.dia) >= lunes) cambioEl = String(version.dia);
      } else if (plan && lunes > ultimaFoto && versiones.length === 0) {
        vigente = plan;
        fuente = 'plan';
        /* Cambió en algún momento entre la última revisión y hoy. */
        const hasta = lunesDeHoy || lunes;
        if (ultimaFoto && (daysBetween(ultimaFoto, hasta) ?? 0) > 7) aprox = { desde: ultimaFoto, hasta };
      } else if (foto) {
        vigente = foto.snapshot;
        fuente = 'revision';
        const anterior = ultimaHasta(fotos, (f) => String(f.weekStart) < String(foto.weekStart));
        if (anterior && (daysBetween(anterior.weekStart, foto.weekStart) ?? 0) > 7) {
          aprox = { desde: String(anterior.weekStart), hasta: String(foto.weekStart) };
        }
      }
    }

    const kcals = toNum(vigente?.kcals);
    /* Un escalón: esta semana el objetivo dejó de ser el de la semana anterior.
       Es lo que se marca en el dibujo, porque es lo que TÚ hiciste. */
    const changed = kcals !== null && ultima !== null && kcals !== ultima;
    if (kcals !== null) ultima = kcals;

    /* Qué cambió de la pauta: kcal, pasos o cardio. Es lo que pinta un hilo en
       el roadmap y una cifra en negro en su libro. */
    const cambios = vigente && previa ? cambiosDePauta(previa, vigente) : [];
    if (vigente) previa = vigente;

    return {
      week: fila.week,
      weekStart: fila.weekStart,
      weight: fila.weight,
      kcals,
      protein: toNum(vigente?.protein),
      carbs: toNum(vigente?.carbs),
      fats: toNum(vigente?.fats),
      steps: toNum(vigente?.steps),
      cardio: vigente?.cardio ?? null,
      /* De dónde salen esas kcal: la media de su ciclo o un día suelto. Viaja
         desde la foto (`cycleFoto`) para que la tarjeta del plan de la revisión
         pueda decirlo, en vez de dar una cifra sin apellido. */
      de: vigente?.de ?? null,
      reparto: vigente?.reparto ?? null,
      /* Los tipos de día de esa pauta: los de la versión, con sus casillas, o
         los días que guardó la foto de la revisión (`cycle`), sin ellas. Una
         foto vieja no guarda ninguno: esa semana solo tiene la media. */
      tipos: tiposDeLaFoto(vigente),
      changed,
      cambios,
      fuente,
      /* El día exacto del cambio, si lo dice una versión. */
      cambioEl: cambios.length > 0 ? cambioEl : null,
      /* O entre qué dos lunes pudo hacerse, si solo lo dicen las revisiones. */
      aprox: cambios.length > 0 ? aprox : null,
    };
  });
};

/** Los tipos de día de una foto: `[{ n, kcals, protein, carbs, fats, steps, casillas, dias }]` o `null`. */
const tiposDeLaFoto = (foto) => {
  if (foto?.tipos?.length) return foto.tipos;
  if (!foto?.cycle?.length) return null;
  return foto.cycle.map((d) => ({
    n: d.n,
    kcals: toNum(d.kcals),
    protein: toNum(d.protein),
    carbs: toNum(d.carbs),
    fats: toNum(d.fats),
    steps: null,
    casillas: null,
    dias: toNum(d.x),
  }));
};

/** El último elemento de una lista ordenada que cumple la condición. */
const ultimaHasta = (lista, cumple) => {
  let out = null;
  for (const x of lista) {
    if (cumple(x)) out = x;
    else break;
  }
  return out;
};

/** Las cifras de la pauta que se comparan: las del libro del roadmap. */
const CIFRAS_DE_PAUTA = [
  ['kcals', (p) => toNum(p?.kcals)],
  ['steps', (p) => toNum(p?.steps)],
  ['cardio', (p) => String(p?.cardio ?? '').trim() || null],
];

/* Estrenar una cifra y quitarla también son cambios: la misma regla que
   `snapshotChanges` en `reviews.js`. */
const cambiosDePauta = (antes, ahora) =>
  CIFRAS_DE_PAUTA.map(([k, lee]) => ({ k, de: lee(antes), a: lee(ahora) })).filter((c) => c.de !== c.a);

const mismaPauta = (a, b) =>
  CIFRAS_DE_PAUTA.every(([, lee]) => lee(a) === lee(b)) &&
  ['protein', 'carbs', 'fats'].every((k) => toNum(a?.[k]) === toNum(b?.[k]));

/**
 * EL REGISTRO FECHADO DE LA DIETA, de las DOS fuentes que lo escriben.
 *
 * ══ La avería que cierra ═══════════════════════════════════════════════════
 *
 * «Las kcals no las coge en la gráfica, cuando este cliente tuvo varios cambios
 * que sí se recogen en la página de resumen.»
 *
 * Y las dos pantallas tenían razón, porque no miraban lo mismo:
 *
 *   · La REVISIÓN lee `check_ins.snapshot` —la foto del plan que queda escrita
 *     al cerrar cada revisión semanal—. Ahí están los cambios.
 *   · La EVOLUCIÓN de la dieta leía solo `log.nutrition`, la foto que se guarda
 *     al REGISTRAR UN PESAJE, y solo si en ese momento se le pasó el plan
 *     (`buildAnthropometryLog`). Un cliente que se pesa desde el portal y cuyas
 *     revisiones las cierra el entrenador tiene decenas de pesajes sin foto: su
 *     escalera de kcal sale plana, y la tarjeta dice «sus kcal no han cambiado»
 *     de alguien al que le has tocado la dieta cuatro veces.
 *
 * Dos pantallas de la misma aplicación contestando distinto a «¿cuándo le
 * cambiaste las calorías?» no es un matiz: es la que peor pinta tiene la que se
 * cree, porque es la que está al lado de la dieta.
 *
 * ══ Por qué devuelve algo con la forma de un historial ═════════════════════
 *
 * Porque `weightSeries`, `kcalSeries`, `kcalSteps` y `lastKcalChange` ya saben
 * leer esa forma, están probadas y las usan las dos tarjetas y la ventana. Lo
 * que faltaba no era otra lectura: era que la lectura mirara donde está el dato.
 * Esto junta las dos fuentes en una lista con la forma de siempre y no toca ni
 * una de esas funciones.
 *
 * ── Quién gana cuando las dos hablan del mismo día ────────────────────────
 * La foto de nutrición del pesaje, igual que en `reviewTimeline`: es la que se
 * tomó midiendo. Es la misma regla en las dos pantallas, escrita una vez.
 *
 * ── Y el plan de HOY no entra ─────────────────────────────────────────────
 * `nutritionTrack` sí lo arrastra a las semanas sin revisión, y allí está bien:
 * su eje son semanas y la de ahora es una de ellas. Aquí el eje son FECHAS de
 * hechos, y meter el plan actual obligaría a ponerle una: la de hoy. Diría «le
 * bajaste 250 kcal el 10 de septiembre» de un cambio que pudo hacerse en julio,
 * y una fecha inventada en una escalera que se compara con el peso es peor que
 * un escalón que falta. El objetivo de hoy ya está escrito arriba, en su
 * tarjeta.
 *
 * ── Y la tercera: las versiones fechadas (0124) ────────────────────────────
 * Con versiones, cada cambio está en el día en que se hizo. Las fotos de
 * revisión de esas semanas sobran, y además estorban: una revisión cerrada el
 * viernes guarda la pauta nueva con la fecha de su LUNES, y pondría el escalón
 * dos días antes de que ocurriera. Por eso, desde la semana de la primera
 * versión, las revisiones no entran. Si la versión y un pesaje caen el mismo
 * día, la versión va detrás: es la pauta con la que acabó el día.
 *
 * @param history  `anthropometry.history` — los pesajes, con su foto si la hay.
 * @param reviews  `reviewHistory` — las revisiones cerradas, con su `snapshot`.
 * @param versions `[{ dia, snapshot }]`, ver `nutritionTrack`.
 * @returns Registros `{ date, weight, nutrition }` de más viejo a más nuevo.
 */
export const dietLog = ({ history = [], reviews = [], versions = [] } = {}) => {
  const conFoto = new Set(
    (history || []).filter((h) => h?.date && h.nutrition).map((h) => String(h.date))
  );

  const fechadas = (versions || []).filter((v) => v?.dia && v.snapshot);
  const desdeVersiones = fechadas.length
    ? weekStart(fechadas.map((v) => String(v.dia)).sort()[0])
    : null;

  const deVersiones = fechadas.map((v) => ({
    date: String(v.dia),
    weight: null,
    version: true,
    nutrition: {
      kcals: toNum(v.snapshot.kcals),
      protein: toNum(v.snapshot.protein),
      carbs: toNum(v.snapshot.carbs),
      fats: toNum(v.snapshot.fats),
    },
  }));

  const deRevisiones = (reviews || [])
    .filter((r) => r?.weekStart && r.snapshot && !conFoto.has(String(r.weekStart)))
    .filter((r) => !desdeVersiones || String(r.weekStart) < desdeVersiones)
    .map((r) => ({
      /* Sin `id`: no es un registro de antropometría y nadie tiene que poder
         borrarlo desde aquí. La revisión de la que sale se borra en su pantalla. */
      date: r.weekStart,
      weight: null,
      nutrition: {
        kcals: toNum(r.snapshot.kcals),
        protein: toNum(r.snapshot.protein),
        carbs: toNum(r.snapshot.carbs),
        fats: toNum(r.snapshot.fats),
      },
    }));

  return [...(history || []), ...deRevisiones, ...deVersiones]
    .filter((r) => r && r.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(Boolean(a.version)) - Number(Boolean(b.version)));
};
