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
 * @param rows   las filas de `reviewTimeline`, que ponen el eje de semanas.
 * @param reviews `reviewHistory` — de donde salen las fotos del plan.
 * @param plan   el plan de HOY (`planSnapshot` del cliente), para las semanas
 *   posteriores a la última revisión cerrada: lo que tiene puesto ahora mismo
 *   sigue en vigor aunque todavía no lo hayas guardado en ninguna revisión.
 */
export const nutritionTrack = ({ rows = [], reviews = [], plan = null } = {}) => {
  /* Las fotos por su semana, de la más vieja a la más nueva. `reviewHistory`
     las devuelve al revés porque el histórico se lee desde hoy. */
  const fotos = [...reviews]
    .filter((r) => r?.weekStart && r.snapshot)
    .sort((a, b) => String(a.weekStart).localeCompare(String(b.weekStart)));

  let vigente = null;
  let ultima = null;

  const salida = rows.map((fila) => {
    /* La última foto tomada en esta semana o antes. */
    for (const foto of fotos) {
      if (String(foto.weekStart) <= String(fila.weekStart)) vigente = foto.snapshot;
      else break;
    }

    const kcals = toNum(vigente?.kcals);
    /* Un escalón: esta semana el objetivo dejó de ser el de la semana anterior.
       Es lo que se marca en el dibujo, porque es lo que TÚ hiciste. */
    const changed = kcals !== null && ultima !== null && kcals !== ultima;
    if (kcals !== null) ultima = kcals;

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
      changed,
    };
  });

  /*
    Y las semanas posteriores a la última revisión llevan el plan de HOY. Sin
    esto, la escalera se queda plana en el último cambio guardado y la semana que
    estás revisando —la de ahora— sale con las calorías de hace un mes.
  */
  if (plan) {
    const desde = fotos.length > 0 ? String(fotos[fotos.length - 1].weekStart) : '';
    let previa = toNum(plan.kcals);
    for (let i = salida.length - 1; i >= 0; i -= 1) {
      if (String(salida[i].weekStart) <= desde) break;
      const kcals = toNum(plan.kcals);
      salida[i] = {
        ...salida[i],
        kcals,
        protein: toNum(plan.protein),
        carbs: toNum(plan.carbs),
        fats: toNum(plan.fats),
        steps: toNum(plan.steps),
        cardio: plan.cardio ?? null,
        /* El escalón se marca en la PRIMERA de esas semanas, no en todas. */
        changed: false,
      };
      previa = kcals;
    }
    /* Y ahí, si de verdad cambió respecto de la última foto guardada. */
    const primeraNueva = salida.findIndex((f) => String(f.weekStart) > desde);
    if (primeraNueva > 0 && previa !== null && salida[primeraNueva - 1].kcals !== previa) {
      salida[primeraNueva] = { ...salida[primeraNueva], changed: true };
    }
  }

  return salida;
};
