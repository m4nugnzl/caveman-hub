/**
 * El histórico de revisiones: qué se decidió cada semana.
 *
 * ══ De dónde sale, sin inventar tablas ══════════════════════════════════════
 *
 * Una revisión es una fila de `check_ins` que alguien cerró. Todo lo demás ya
 * existía repartido y aquí solo se junta:
 *
 *   · **Lo que él entregó** — su peso y su nota, de la propia fila.
 *   · **Lo que tú contestaste** — `coach_notes`, la columna de la 0009.
 *   · **Lo que cambiaste** — comparando la foto del plan de esa revisión con la
 *     de la anterior (`snapshot`, migración 0042).
 *   · **El vídeo, si lo hubo** — el enlace de revisión de esa misma semana.
 *
 * ══ Por qué el cambio se calcula y no se registra ══════════════════════════
 *
 * Porque la dieta se guarda sola a cada tecla: un registro de cambios apuntaría
 * cuarenta por tarde, casi todos intermedios. Comparando dos fotos solo queda lo
 * que acabó decidido, que es lo que alguien va a leer dos meses después.
 *
 * Y da la respuesta a la pregunta que hoy no la tiene: «te bajo un poco los
 * hidratos» pasa a ser «280 → 240 g».
 */

import { optionMacros } from './nutrition';
import { toNum } from '@/lib/num';

/**
 * La foto del plan que se guarda al cerrar una revisión.
 *
 * Pequeña a propósito: no es una copia del plan, es lo que se compara entre dos
 * semanas. Guardar el menú entero haría la columna enorme para responder algo
 * que nadie pregunta —qué alimentos concretos tenía en marzo—, y para eso está
 * el plan actual.
 */
/**
 * Recorta las semanas hasta que la foto quepa.
 *
 * La base rechaza una foto de más de 8 KB (migración 0042), y un programa de
 * veinte semanas con seis días se pasa. Si eso llegara al servidor, la revisión
 * FALLARÍA al cerrarse — que es infinitamente peor que guardar menos historia.
 *
 * Se recortan las más ANTIGUAS: los cambios de una revisión se hacen en lo que
 * está por venir, no en lo que ya se entrenó hace tres meses.
 */
const PRESUPUESTO = 7000; // margen bajo el tope de 8 KB, contando el resto de claves

const fitWeeks = (semanas) => {
  let out = semanas;
  while (out.length > 1 && JSON.stringify(out).length > PRESUPUESTO) out = out.slice(1);
  return out;
};

export const planSnapshot = ({ nutrition, program } = {}) => {
  const foto = {
    kcals: toNum(nutrition?.targetKcals),
    protein: toNum(nutrition?.proteinGrams),
    carbs: toNum(nutrition?.carbsGrams),
    fats: toNum(nutrition?.fatsGrams),
    steps: toNum(nutrition?.stepsGoal),
    /* El cardio es texto, así que se guarda tal cual y no pasa por `toNum`.
       Recortado: la foto tiene un tope de 8 KB y una prescripción de tres
       párrafos se comería el sitio de las semanas del programa. */
    cardio: String(nutrition?.cardioGoal || '').trim().slice(0, 120) || null,
    weeks: (program?.microcycles || []).length || null,
  };

  /*
    ══ Y la estructura, que es lo que convierte «cambió algo» en algo útil ═════

    Con las cifras solas, cambiar la Prensa por la Hack no se ve: las calorías
    siguen iguales y el histórico dice «sin cambios». Guardando los nombres se
    puede decir exactamente qué entró y qué salió.

    Nombres y poco más, a propósito: series, repeticiones y gramos cambian cada
    semana por ajustes finos y llenarían el histórico de ruido. Lo que se recuerda
    de una revisión es «le quité la sentadilla», no «le puse 3×8 en vez de 3×10».
  */
  /*
    Las calorías de cada comida, con respaldo.

    Se usaba solo `target.kcals` —lo que el entrenador reparte— y la mayoría de
    las dietas no lo tienen puesto: entonces `k` era null en todas y cambiar una
    comida entera no producía ninguna línea. «De la dieta no dice nada» era eso.

    Sin objetivo se usa lo que SUMAN sus alimentos, que es la otra cifra real de
    esa comida y la que cambia al tocarla.
  */
  const kcalDe = (meal) =>
    toNum(meal?.target?.kcals) ?? Math.round(optionMacros(meal?.options?.[0]).kcal) ?? null;

  const comidas = (nutrition?.closedMealsTraining?.length
    ? nutrition.closedMealsTraining
    : nutrition?.closedMeals || []
  ).map((meal) => ({ n: String(meal?.name || '').slice(0, 40), k: kcalDe(meal) || null }));

  /*
    ══ TODAS las semanas, no solo la última ═══════════════════════════════════

    Guardaba únicamente el último microciclo, con el argumento de que es «el que
    está en marcha». Falso: al revisar se toca la semana que se esté programando,
    que muchas veces no es la última de la lista. Con eso, subir una serie en la
    semana 1 de un programa de ocho no cambiaba la foto, y el histórico decía «sin
    cambios» delante de un cambio que sí se había hecho.

    Nombre y NÚMERO DE SERIES por ejercicio. Las repeticiones se quedan fuera: ahí
    el ruido sí es real, se tocan en casi todas las series de casi todas las
    semanas.
  */
  const semanas = (program?.microcycles || []).map((m) => ({
    w: m?.weekNumber ?? null,
    d: (m?.days || []).map((day, i) => ({
      /*
        `dayName`, no `name`. Leía el campo equivocado, así que TODOS los días se
        quedaban con la cadena vacía y se emparejaban entre sí: cada día del
        programa se comparaba contra el primero del anterior, y el histórico
        escupía sesenta líneas de «+ este ejercicio / − aquel» para un programa
        que no había cambiado.

        El respaldo por posición es lo que impide que vuelva a pasar: aunque un
        día llegue sin nombre, «Día 3» no puede confundirse con «Día 1».
      */
      n: String(day?.dayName || `Día ${i + 1}`).slice(0, 30),
      e: (day?.exercises || []).map((ex) => ({
        n: String(ex?.name || '').slice(0, 40),
        s: (ex?.sets || []).length || null,
      })),
    })),
  }));

  if (comidas.length > 0) foto.meals = comidas;
  if (semanas.length > 0) foto.weeksPlan = fitWeeks(semanas);

  /* Las claves vacías no se guardan: una foto llena de `null` ocupa lo mismo que
     una con datos y hace creer que se midió algo que no existía. */
  return Object.fromEntries(Object.entries(foto).filter(([, v]) => v !== null && v !== undefined));
};

/**
 * Lo que se compara, en el orden en que se lee.
 *
 * `text: true` marca los que no son cifras. La diferencia importa en la pantalla:
 * un cambio numérico tiene dirección —sube o baja, y se pinta con su flecha y su
 * color— y «2 días de HIIT → 3 días de 15 min» no la tiene. Inventarle una flecha
 * a un texto es afirmar algo que nadie ha calculado.
 */
const CAMPOS = [
  { key: 'kcals', label: 'Calorías', unit: ' kcal' },
  { key: 'protein', label: 'Proteína', unit: ' g' },
  { key: 'carbs', label: 'Hidratos', unit: ' g' },
  { key: 'fats', label: 'Grasas', unit: ' g' },
  { key: 'steps', label: 'Pasos', unit: '' },
  { key: 'cardio', label: 'Cardio', unit: '', text: true },
  { key: 'weeks', label: 'Semanas programadas', unit: '' },
];

/**
 * Qué cambió entre dos fotos. Lista vacía si no cambió nada o si falta alguna.
 *
 * `null` como valor anterior NO se cuenta como cambio: significa que entonces no
 * había esa cifra, y «sin calorías → 2400» no es un ajuste, es haber configurado
 * el plan por primera vez.
 */
export const snapshotChanges = (antes, ahora) => {
  if (!antes || !ahora) return [];

  return CAMPOS.filter(({ key }) => {
    const a = antes[key];
    const b = ahora[key];
    return a !== null && a !== undefined && b !== null && b !== undefined && a !== b;
  }).map(({ key, label, unit, text }) => ({
    key,
    label,
    unit,
    text: Boolean(text),
    from: antes[key],
    to: ahora[key],
    /* La dirección se calcula aquí y no en la pantalla: es lo que decide el color
       y la flecha, y dos pantallas calculándolo por su cuenta acabarían pintando
       una subida de calorías de dos colores distintos.

       `null` en los campos de texto: no es que no haya subido, es que la pregunta
       no aplica. Con `false` la pantalla lo pintaría como una bajada. */
    up: text ? null : ahora[key] > antes[key],
  }));
};

/*
  ── Compatibilidad con las fotos anteriores ────────────────────────────────
  Han pasado por tres formas en pocos días: `days` con los ejercicios como
  cadenas, `days` con `{n, s}`, y ahora `weeksPlan` con todas las semanas. Se
  aceptan las tres para que el histórico no se parta en la frontera entre
  versiones — que es justo donde estará mirando quien lo abra esta semana.
*/
const semanasDe = (foto) => {
  if (Array.isArray(foto?.weeksPlan)) return foto.weeksPlan;
  if (Array.isArray(foto?.days)) return [{ w: null, d: foto.days }];
  return [];
};

const ejercicios = (lista = []) =>
  lista.map((ex) => (typeof ex === 'string' ? { n: ex, s: null } : ex));

/** Lo que entró y lo que salió de una lista de nombres. */
const entraSale = (antes = [], ahora = []) => {
  const a = new Set(antes);
  const b = new Set(ahora);
  return {
    added: ahora.filter((x) => !a.has(x)),
    removed: antes.filter((x) => !b.has(x)),
  };
};

/**
 * Los cambios de ESTRUCTURA: comidas y ejercicios que entraron, salieron o
 * cambiaron de calorías.
 *
 * ══ Por qué va aparte de las cifras ════════════════════════════════════════
 *
 * Porque se leen distinto. «2400 → 2200 kcal» es una cifra que sube o baja;
 * «fuera Prensa, dentro Hack» es una sustitución, y pintarla con la misma píldora
 * de antes-y-después obligaría a inventarse un «de» y un «a» que no existen.
 *
 * Se compara POR NOMBRE, no por posición: mover la cena al segundo puesto no es
 * un cambio de dieta, y comparando por orden lo parecería.
 */
/**
 * Si una foto se puede comparar por estructura.
 *
 * ══ Por qué hace falta preguntarlo ═════════════════════════════════════════
 *
 * Durante unos días la foto guardó el nombre del día leyendo el campo
 * equivocado, así que TODOS los días salían con la cadena vacía. Comparar contra
 * una de esas produce un disparate: como todos los días se llaman igual, cada uno
 * se empareja con el primero y salen «−37 ejercicios, +34» de un programa que
 * apenas cambió.
 *
 * Ante una foto así hay que callarse, no adivinar. Esta función es lo que permite
 * distinguir «no cambió nada» de «esto no se puede comparar», que es la
 * diferencia entre informar y mentir.
 */
export const readableStructure = (foto) => {
  const semanas = semanasDe(foto);
  if (semanas.length === 0) return true; // sin programa no hay nada que comparar

  return semanas.every((semana) => {
    const nombres = (semana.d || []).map((d) => d.n);
    if (nombres.some((n) => !n)) return false;
    return new Set(nombres).size === nombres.length;
  });
};

export const structureChanges = (antes, ahora) => {
  if (!antes || !ahora) return [];
  /* Con una foto ilegible no se compara: se dice que no se puede. */
  if (!readableStructure(antes) || !readableStructure(ahora)) return [];
  const out = [];

  // ── Comidas ──────────────────────────────────────────────────────────────
  const comidasAntes = antes.meals || [];
  const comidasAhora = ahora.meals || [];
  if (comidasAntes.length > 0 || comidasAhora.length > 0) {
    const { added, removed } = entraSale(
      comidasAntes.map((m) => m.n),
      comidasAhora.map((m) => m.n)
    );
    for (const nombre of added) out.push({ area: 'dieta', kind: 'add', label: nombre });
    for (const nombre of removed) out.push({ area: 'dieta', kind: 'remove', label: nombre });

    /* Y las que siguen estando pero con otro objetivo: es el ajuste más común y
       el que no se ve en el total del día si compensas una comida con otra. */
    for (const ahoraM of comidasAhora) {
      const antesM = comidasAntes.find((m) => m.n === ahoraM.n);
      if (antesM && antesM.k && ahoraM.k && antesM.k !== ahoraM.k) {
        out.push({
          area: 'dieta',
          kind: 'change',
          label: ahoraM.n,
          from: antesM.k,
          to: ahoraM.k,
          unit: ' kcal',
          up: ahoraM.k > antesM.k,
        });
      }
    }
  }

  // ── Entrenamiento, semana por semana ─────────────────────────────────────
  for (const semana of semanasDe(ahora)) {
    const previa = semanasDe(antes).find((s) => s.w === semana.w);
    /* Una semana que antes no existía es un microciclo nuevo, y eso ya lo cuenta
       «Semanas programadas» en las cifras. Listar aquí sus veinte ejercicios como
       «añadidos» convertiría programar una semana en un muro de treinta líneas. */
    if (!previa) continue;

    const donde = (dia) => (semana.w ? `S${semana.w} · ${dia}` : dia);

    for (const dia of semana.d || []) {
      const diaPrevio = (previa.d || []).find((d) => d.n === dia.n);
      if (!diaPrevio) {
        out.push({ area: 'entreno', kind: 'add', label: `Día ${dia.n}`, in: `S${semana.w}` });
        continue;
      }

      const antesEx = ejercicios(diaPrevio.e);
      const ahoraEx = ejercicios(dia.e);

      const { added, removed } = entraSale(
        antesEx.map((ex) => ex.n),
        ahoraEx.map((ex) => ex.n)
      );
      for (const ex of added) out.push({ area: 'entreno', kind: 'add', label: ex, in: donde(dia.n) });
      for (const ex of removed)
        out.push({ area: 'entreno', kind: 'remove', label: ex, in: donde(dia.n) });

      /* Y el que sigue estando con otro número de series, que es el ajuste más
         frecuente de todos: añadir una serie a un ejercicio es media revisión. */
      for (const ex of ahoraEx) {
        const era = antesEx.find((e) => e.n === ex.n);
        if (era && era.s && ex.s && era.s !== ex.s) {
          out.push({
            area: 'entreno',
            kind: 'change',
            label: ex.n,
            in: donde(dia.n),
            from: era.s,
            to: ex.s,
            unit: ' series',
            up: ex.s > era.s,
          });
        }
      }
    }

    for (const dia of previa.d || []) {
      if (!(semana.d || []).some((d) => d.n === dia.n)) {
        out.push({ area: 'entreno', kind: 'remove', label: `Día ${dia.n}`, in: `S${semana.w}` });
      }
    }
  }

  return out;
};

/**
 * Semanas pasadas que el cliente puede entregar todavía.
 *
 * ══ Por qué solo el cliente, y por qué solo estas ══════════════════════════
 *
 * Una revisión es la RESPUESTA a algo que él entregó: si no sube nada, no hay
 * nada que revisar, y el entrenador no va a inventarse una. Por eso rellenar
 * hacia atrás es cosa suya y no del entrenador.
 *
 * Pero tampoco cualquier semana: **solo las que tienen datos suyos**. Se pesó el
 * martes, se le pasó darle a entregar, y el domingo ya era otra semana — ese es
 * el caso real. Ofrecerle entregar una semana en la que no registró nada sería
 * ofrecerle mandar un sobre vacío.
 *
 * Y nunca la actual: esa tiene su propio botón, que es el camino normal.
 */
export const deliverableWeeks = ({ history = [], checkIns = [], currentStart, weekStartOf, max = 4 }) => {
  const entregadas = new Set(checkIns.filter((c) => c.submittedAt).map((c) => c.weekStart));

  const conDatos = new Set(
    history.filter((h) => h.date).map((h) => weekStartOf(h.date)).filter(Boolean)
  );

  return [...conDatos]
    .filter((semana) => semana < currentStart && !entregadas.has(semana))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, max);
};

/**
 * Los cambios de estructura, agrupados para poder leerlos.
 *
 * ══ Por qué hace falta agrupar ══════════════════════════════════════════════
 *
 * Reprogramar una semana entera cambia treinta ejercicios, y treinta líneas de
 * «+ Press Militar · S1 · Torso» no son un resumen: es el volcado que hay que
 * leer entero para enterarse de que cambió el entrenamiento. La información útil
 * ahí es «rehiciste el Torso de la semana 1», y los nombres son el detalle.
 *
 * Se agrupa por SITIO —dieta, o la semana y el día— y dentro se cuentan las altas
 * y las bajas. Los cambios de cifra no se agrupan nunca: «Hack 2 → 3 series» es
 * exactamente lo que se quiere ver, y son pocos por definición.
 */
export const groupChanges = (cambios = []) => {
  const grupos = new Map();

  for (const c of cambios) {
    const sitio = c.in || (c.area === 'dieta' ? 'Dieta' : 'Entreno');
    if (!grupos.has(sitio)) {
      grupos.set(sitio, { sitio, area: c.area, added: [], removed: [], changed: [] });
    }
    const g = grupos.get(sitio);
    if (c.kind === 'add') g.added.push(c.label);
    else if (c.kind === 'remove') g.removed.push(c.label);
    else g.changed.push(c);
  }

  return [...grupos.values()];
};

/**
 * El histórico completo de un cliente, de lo más reciente a lo más antiguo.
 *
 * Solo las revisiones CERRADAS: una semana entregada y sin revisar no es una
 * revisión, es trabajo pendiente, y ese sitio ya lo tiene en la cola.
 *
 * El vídeo se empareja por semana. Es lo que permite enlazarlo DESPUÉS de haber
 * cerrado la revisión —pegar el enlace de YouTube el jueves para la revisión del
 * lunes— sin que haga falta ninguna columna que los una.
 */
export const reviewHistory = ({ checkIns = [], links = [] } = {}) => {
  const cerradas = checkIns
    .filter((c) => c.reviewedAt)
    .sort((a, b) => String(a.weekStart).localeCompare(String(b.weekStart)));

  const videos = new Map();
  for (const link of links) {
    if (link.revokedAt || !link.weekStart) continue;
    // El más reciente de esa semana gana: si se grabó dos veces, la buena es la
    // segunda.
    const previo = videos.get(link.weekStart);
    if (!previo || String(link.createdAt) > String(previo.createdAt)) videos.set(link.weekStart, link);
  }

  return cerradas
    .map((actual, index) => ({
      ...actual,
      changes: snapshotChanges(cerradas[index - 1]?.snapshot, actual.snapshot),
      structure: structureChanges(cerradas[index - 1]?.snapshot, actual.snapshot),
      /*
        ══ Tres estados, no dos ═══════════════════════════════════════════════

        `hasSnapshot`  — esta revisión guardó foto.
        `comparable`   — Y LA ANTERIOR TAMBIÉN, que es lo que hace falta para
                         poder decir que algo cambió.

        Faltaba el segundo y por eso la primera revisión con foto decía «sin
        cambios en el plan» — con la anterior vacía no hay nada que comparar, y
        afirmar que no cambió nada era mentir con aplomo. Ahora la pantalla dice
        que es la primera con seguimiento, que es lo cierto.
      */
      hasSnapshot: Boolean(actual.snapshot),
      comparable: Boolean(actual.snapshot && cerradas[index - 1]?.snapshot),
      /* Hay las dos fotos, pero alguna se guardó con los días sin nombre y su
         estructura no se puede comparar. La pantalla lo dice en vez de callar —o
         peor, de inventarse un «sin cambios». */
      structureStale: Boolean(
        actual.snapshot &&
          cerradas[index - 1]?.snapshot &&
          (!readableStructure(actual.snapshot) || !readableStructure(cerradas[index - 1].snapshot))
      ),
      video: videos.get(actual.weekStart) || null,
    }))
    .reverse();
};
