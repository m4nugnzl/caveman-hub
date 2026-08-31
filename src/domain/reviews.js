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
import { weekFromStart } from './photos';
import { round, toNum } from '@/lib/num';

/**
 * La foto del plan que se guarda al cerrar una revisión.
 *
 * Pequeña a propósito: no es una copia del plan, es lo que se compara entre dos
 * semanas. Guardar el menú entero haría la columna enorme para responder algo
 * que nadie pregunta —qué alimentos concretos tenía en marzo—, y para eso está
 * el plan actual.
 */
/**
 * Recorta la foto hasta que quepa DE VERDAD en la columna.
 *
 * La base rechaza una foto de más de 8 KB (migración 0042), y un programa de
 * veinte semanas con seis días se pasa. Si eso llega al servidor, la revisión
 * FALLA al cerrarse — y se lleva por delante la nota que el entrenador acababa
 * de escribir, que no tenía nada que ver con el programa.
 *
 * ══ Y eso es justo lo que pasaba ═══════════════════════════════════════════
 *
 * Se medía `JSON.stringify(...).length`, o sea CARACTERES DE TEXTO, contra un
 * tope que la migración comprueba con `pg_column_size`, o sea BYTES DE JSONB.
 * No son la misma unidad ni se parecen: jsonb no guarda el texto, guarda un
 * árbol con cuatro bytes de índice por cada clave y por cada valor, y los
 * números ocupan una docena de bytes cada uno. Esta foto está llena de objetos
 * diminutos —`{n, s}` por ejercicio—, que es la forma que peor sale parada.
 *
 * Medido contra Postgres, una foto de 6.208 caracteres —holgada bajo el
 * presupuesto viejo de 7.000— pesa 10.172 bytes de jsonb y el servidor la
 * rechaza. De ahí el «La foto del plan es demasiado grande» delante de alguien
 * que solo había escrito un texto.
 *
 * Se estima en las unidades del servidor con `jsonbSize`, que redondea SIEMPRE
 * hacia arriba: pasarse de prudente cuesta una semana menos de historia, y
 * quedarse corto cuesta la revisión entera.
 *
 * Se recortan las semanas más ANTIGUAS: los cambios de una revisión se hacen en
 * lo que está por venir, no en lo que ya se entrenó hace tres meses.
 */
const PRESUPUESTO = 7800; // bytes de jsonb; margen bajo el tope de 8.192

const utf8 = (texto) => new TextEncoder().encode(texto).length;

/**
 * Cuánto ocupa un valor como jsonb, por lo alto.
 *
 * El formato: cuatro bytes de cabecera por cada objeto o lista, cuatro más por
 * cada clave y por cada valor que contengan, y el contenido en crudo. Los
 * números se guardan como `numeric`; 16 bytes los cubren con holgura.
 *
 * ══ Y el relleno, que es lo que se le escapó a la primera versión ══════════
 *
 * Postgres ALINEA a cuatro bytes todo lo que no es texto: antes de cada objeto,
 * de cada lista y de cada número mete hasta tres bytes de relleno para cuadrar.
 * Tres bytes no son nada; una foto son cientos de objetos diminutos —un `{n, s}`
 * por ejercicio— y el relleno se acumula hasta pesar más que el margen.
 *
 * Medido contra Postgres: un programa con veinte ejercicios por día y nombres
 * cortos se estimaba en 7.627 bytes y ocupaba 8.296 de verdad. Pasaba el recorte
 * y el servidor lo rechazaba igual, con el mismo mensaje delante del entrenador.
 *
 * Contando el relleno, la estimación queda por encima del tamaño real en todos
 * los casos medidos, que es lo que tiene que hacer: sobrar cuesta una semana
 * menos de historia, faltar cuesta la revisión entera.
 *
 * Se exporta para poder comprobar en las pruebas lo único que importa aquí: que
 * la foto que sale de `planSnapshot` cabe en la columna.
 */
const RELLENO = 3; // lo que puede costar cuadrar a cuatro bytes

export const jsonbSize = (valor) => {
  if (valor === null || typeof valor === 'boolean') return 4;
  if (typeof valor === 'number') return 4 + RELLENO + 16;
  if (typeof valor === 'string') return 4 + utf8(valor);
  if (Array.isArray(valor)) return 8 + RELLENO + valor.reduce((n, v) => n + jsonbSize(v), 0);
  return (
    8 + RELLENO + Object.entries(valor).reduce((n, [k, v]) => n + 4 + utf8(k) + jsonbSize(v), 0)
  );
};

const sinClave = (foto, clave) => {
  const out = { ...foto };
  delete out[clave];
  return out;
};

/**
 * Quita historia hasta que la foto entre, en este orden: primero las semanas
 * viejas, luego el programa entero y por último la dieta.
 *
 * Se mide la foto COMPLETA en cada vuelta, no solo las semanas: las comidas y
 * las cifras del objetivo también ocupan, y el tope es de la fila entera.
 *
 * Lo último que se suelta son las cifras del objetivo —calorías, macros, pasos—,
 * que nunca se sueltan: ocupan unos cientos de bytes y son lo que de verdad se
 * consulta dos meses después. Una foto recortada sigue siendo una foto; una
 * revisión que no se puede cerrar no es nada.
 */
const recorta = (foto) => {
  let out = foto;
  while (out.weeksPlan?.length > 1 && jsonbSize(out) > PRESUPUESTO) {
    out = { ...out, weeksPlan: out.weeksPlan.slice(1) };
  }
  /* Una sola semana que ya no cabe: fuera el programa. Pasa con un microciclo de
     seis días y veinte ejercicios por día. */
  if (out.weeksPlan && jsonbSize(out) > PRESUPUESTO) out = sinClave(out, 'weeksPlan');
  if (out.meals && jsonbSize(out) > PRESUPUESTO) out = sinClave(out, 'meals');
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
  if (semanas.length > 0) foto.weeksPlan = semanas;

  /* Las claves vacías no se guardan: una foto llena de `null` ocupa lo mismo que
     una con datos y hace creer que se midió algo que no existía. */
  const limpia = Object.fromEntries(
    Object.entries(foto).filter(([, v]) => v !== null && v !== undefined)
  );

  /* Y el recorte al final, sobre la foto entera: es la foto entera lo que el
     servidor mide contra su tope. */
  return recorta(limpia);
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

/** Una cifra o un texto que de verdad está puesto. La cadena vacía cuenta como
    ausente: el cardio se guarda como texto y borrarlo deja `''`, no `null`. */
const puesto = (v) => v !== null && v !== undefined && v !== '';

/**
 * Qué cambió entre dos fotos. Lista vacía si no cambió nada o si falta alguna.
 *
 * ══ Estrenar una cifra SÍ es un cambio ══════════════════════════════════════
 *
 * Aquí se exigía que las dos fotos tuvieran valor, con el argumento de que «sin
 * calorías → 2400» es configurar el plan por primera vez y no un ajuste. El
 * argumento es cierto para la PRIMERA revisión y falso para todas las demás, y
 * como la regla estaba puesta campo por campo se comía cambios de verdad:
 *
 *   Ponerle 10.000 pasos a alguien que no los tenía puestos es exactamente la
 *   clase de decisión que se toma revisando —y de las que más se toman, porque
 *   los pasos y el cardio son los dos campos que casi nadie rellena al dar de
 *   alta—. No salía en el diff, no le llegaba al cliente como cambio, y el
 *   histórico decía «sin cambios en el plan» encima de una semana en la que sí
 *   los hubo.
 *
 * El caso que la regla quería proteger ya está protegido un piso más arriba y
 * mejor: sin foto anterior no se compara NADA (la línea de abajo, y `comparable`
 * en `reviewHistory`). Dar de alta el plan pasa en la primera revisión, que por
 * definición no tiene contra qué medirse.
 *
 * ── Y por eso `from` y `to` pueden ser nulos ────────────────────────────────
 * `from: null` es «no lo tenía» y `to: null` es «se lo has quitado». La pantalla
 * los pinta con una raya (ver `PlanChanges`), que es lo que son: un hueco, no un
 * cero. Escribir 0 ahí sería afirmar que le pusiste cero pasos.
 */
export const snapshotChanges = (antes, ahora) => {
  if (!antes || !ahora) return [];

  return CAMPOS.filter(({ key }) => {
    const a = antes[key];
    const b = ahora[key];
    /* Lo que no estaba antes y sigue sin estar no es un cambio: es una cifra que
       este entrenador no usa, y sacarla llenaría el diff de campos vacíos. */
    if (!puesto(a) && !puesto(b)) return false;
    return a !== b;
  }).map(({ key, label, unit, text }) => {
    const a = antes[key];
    const b = ahora[key];
    return {
      key,
      label,
      unit,
      text: Boolean(text),
      from: puesto(a) ? a : null,
      to: puesto(b) ? b : null,
      /* La dirección se calcula aquí y no en la pantalla: es lo que decide el
         color y la flecha, y dos pantallas calculándolo por su cuenta acabarían
         pintando una subida de calorías de dos colores distintos.

         `null` cuando la pregunta no aplica, y son dos casos: los campos de
         TEXTO —«2 días» y «3 días de 15 min» no suben ni bajan— y los que
         estrenan o pierden valor, donde no hay dos cifras que comparar. Con
         `false` la pantalla los pintaría como una bajada. */
      up: text || !puesto(a) || !puesto(b) ? null : b > a,
    };
  });
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

/**
 * CÓMO EVOLUCIONA LO QUE TE CUENTA: sus respuestas del check-in, semana a semana.
 *
 * ══ Por qué una respuesta suelta no sirve para decidir ═════════════════════
 *
 * «Descanso: 5» no es información. Un cinco en alguien que lleva meses en cuatro
 * es una buena noticia, y en alguien que venía de ocho es la explicación de por
 * qué esta semana no ha rendido. La revisión enseñaba el número de la semana y
 * nada más, así que la mitad de lo que el cliente cuenta se perdía.
 *
 * Aquí sale el valor de ESTA semana, el de la última vez que contestó antes, y
 * la serie para dibujarla. Con eso, «5» pasa a ser «5, y venía de 8».
 *
 * ── Solo las de escala ──────────────────────────────────────────────────────
 * Las preguntas de texto no tienen evolución que dibujar: lo que escribió se lee,
 * no se compara. Salen en el bloque de respuestas tal cual.
 *
 * ── Y hasta la semana que se está mirando ──────────────────────────────────
 * Revisando la semana 3 de ocho, las respuestas de la 4 a la 8 todavía no han
 * pasado para quien revisa. Enseñarlas convertiría el histórico en una
 * predicción.
 *
 * @param questions  Las preguntas de HOY (`checkinQuestions`). Si el entrenador
 *   quitó una, su serie deja de pintarse: no hay forma de saber de qué escala
 *   era, y el mismo criterio ya rige en el histórico.
 */
export const answerTrend = ({ checkIns = [], questions = [], weekStart = null, weeks = 8 } = {}) => {
  const previas = checkIns
    .filter((c) => c.weekStart && (!weekStart || c.weekStart <= weekStart))
    .sort((a, b) => String(a.weekStart).localeCompare(String(b.weekStart)))
    .slice(-weeks);

  return questions
    .filter((q) => q.kind !== 'text')
    .map((q) => {
      const puntos = previas
        .map((c) => ({ label: c.weekStart, value: toNum(c.answers?.[q.id]) }))
        .filter((p) => p.value !== null);

      /* El valor de ESTA semana, no el último que haya. Si no contestó, el hueco
         se dice: coger el de hace tres semanas y pintarlo como el de ahora es
         inventarle una respuesta. */
      const ahora = puntos.find((p) => p.label === weekStart) ?? null;
      const antes = puntos.filter((p) => !weekStart || p.label < weekStart).at(-1) ?? null;

      return {
        id: q.id,
        label: q.label,
        color: q.color,
        min: q.min ?? 1,
        max: q.max ?? 10,
        value: ahora?.value ?? null,
        from: antes?.value ?? null,
        delta: ahora && antes ? round(ahora.value - antes.value, 1) : null,
        points: puntos,
      };
    })
    /* Una pregunta que no ha contestado NUNCA no es una fila vacía: es una
       pregunta que este cliente no usa. */
    .filter((r) => r.points.length > 0);
};

/**
 * LA PASADA: a quién le debes una respuesta ahora mismo.
 *
 * ══ Por qué esto es una lista y no un modo ═════════════════════════════════
 *
 * Revisar no es un sitio, es una tarea con final: el lunes se contestan cuatro
 * personas y hay que saber cuántas quedan. Eso se resolvía con un MODO —una
 * barra flotante que te seguía por la aplicación— y un modo no sabe contar: te
 * acompañaba con un solo nombre y al cerrarlo te dejaba donde estuvieras.
 *
 * Una lista sí. Se calcula sobre lo que ya está en memoria, se recalcula sola al
 * cerrar una —la fila deja de estar pendiente— y no necesita guardar ningún
 * estado: no hay ninguna «pasada en curso» que pueda quedarse a medias.
 *
 * ── En orden de ENTREGA ─────────────────────────────────────────────────────
 * El primero que entregó es el que lleva más esperando. Ordenarlo por nombre o
 * por urgencia sería inventar una prioridad que aquí no existe: las cuatro se
 * van a contestar hoy.
 *
 * Solo cuentan las ENTREGADAS y sin contestar. Quien no ha subido nada no está
 * esperando por ti, y meterlo en la pasada sería pararla en alguien con quien no
 * se puede hacer nada salvo recordárselo.
 */
export const pendingReviews = ({ clients = [], checkIns = {} } = {}) =>
  clients
    .filter((client) => client?.status !== 'archived')
    .map((client) => ({ client, checkIn: checkIns[client.id] }))
    .filter(({ checkIn }) => Boolean(checkIn?.submittedAt) && !checkIn.reviewedAt)
    .sort((a, b) => String(a.checkIn.submittedAt).localeCompare(String(b.checkIn.submittedAt)));

/**
 * QUÉ SEMANA ABRE LA REVISIÓN DE ALGUIEN.
 *
 * ══ El fallo que esta función viene a cerrar ════════════════════════════════
 *
 * La pantalla lo decidía con dos reglas: la semana que el cliente entregó y
 * espera respuesta, y si no la había, **la última con actividad**. Le faltaba la
 * tercera, que es la que manda en «Hoy»: el PERIODO DE CHECK-IN VIGENTE.
 *
 * `buildPortfolio` descarta cualquier entrega anterior a `periodo.start` antes de
 * mirar si está revisada, así que la pasada solo se queda tranquila con una
 * revisión guardada DENTRO del periodo de ahora. Abriendo en la última semana con
 * actividad —que con un cliente que lleva dos semanas flojo es una semana vieja—
 * se cerraba la semana equivocada: la escritura era correcta, el histórico se
 * actualizaba, el diff volvía a cero… y el cliente seguía en la pasada. Desde
 * fuera: «le doy a cerrar y no pasa nada».
 *
 * ── Por qué vive aquí y no en la pantalla ──────────────────────────────────
 * Porque es una regla, no una maqueta, y porque una regla que solo existe dentro
 * de un componente de setecientas líneas no se puede probar — que es exactamente
 * la razón por la que ese fallo llegó a producción.
 *
 * @param weeks     Las semanas de programa que EXISTEN (tienen microciclo). Una
 *   semana sin montar no se puede abrir: la pantalla no tendría qué enseñar.
 * @param submitted La última entrega del cliente, o null.
 * @param period    `currentCheckInPeriod(...)`, o null si no le toca.
 * @param fallback  Qué abrir cuando ninguna de las dos aplica. Lo calcula quien
 *   llama (`latestActiveWeek`) porque necesita las fotos y los pesajes.
 */
export const weekToReview = ({
  weeks = [],
  startDate = null,
  submitted = null,
  period = null,
  fallback = null,
} = {}) => {
  /* 1 · Lo que entregó y espera respuesta. Manda sobre todo: es la razón por la
     que se entra a esta pantalla desde «Hoy». */
  const entregada =
    submitted?.submittedAt && !submitted.reviewedAt
      ? weekFromStart(startDate, submitted.weekStart)
      : null;
  if (weeks.includes(entregada)) return entregada;

  /* 2 · Lo que la pasada está pidiendo, haya entregado o no. */
  const pedida = period?.isDue ? weekFromStart(startDate, period.start) : null;
  if (weeks.includes(pedida)) return pedida;

  /* 3 · Y si no le toca nada, lo último que hizo. */
  return fallback;
};

/** La semana por la que pregunta la pasada, o `null` si a este cliente no le toca. */
export const queueWeek = ({ startDate = null, period = null } = {}) =>
  period?.isDue ? weekFromStart(startDate, period.start) : null;

/**
 * QUÉ SEMANAS SE PUEDEN ABRIR EN LA REVISIÓN DE ALGUIEN.
 *
 * ══ Por qué no bastan las del programa ══════════════════════════════════════
 *
 * La pantalla las sacaba de los microciclos: solo se podía mirar una semana que
 * tuviera rutina montada. Y el calendario de check-ins no espera a que la montes
 * — avanza con la cadencia que le pusiste, esté programada o no.
 *
 * El resultado era un callejón sin salida. Un cliente con el programa acabado en
 * la semana 3 y cadencia semanal aparece en la pasada pidiendo la 4; se pulsa
 * «Revisar», la pantalla no puede abrir la 4 porque no existe, se cae a la 3, y
 * lo que se cierra es la 3. El cliente se queda en la lista para siempre y
 * ninguna de las dos pantallas miente: la pasada pide la 4 y la revisión cierra
 * la 3.
 *
 * Una semana sin rutina montada SÍ se revisa: se mira lo que pesó, lo que subió
 * y lo que contó, y se cierra. Que no le programaras nada es una respuesta sobre
 * ti, no un motivo para no poder contestarle.
 *
 * ── Y la que entregó, por el mismo motivo ──────────────────────────────────
 * Un cliente puede entregar una semana que tú no montaste. Sin ella en la lista,
 * su entrega tampoco se podía abrir.
 */
export const reviewableWeeks = ({
  programmed = [],
  startDate = null,
  submitted = null,
  period = null,
} = {}) => {
  const semanas = new Set(programmed.filter((w) => Number.isFinite(w) && w >= 1));

  const entregada = submitted?.weekStart ? weekFromStart(startDate, submitted.weekStart) : null;
  if (Number.isFinite(entregada) && entregada >= 1) semanas.add(entregada);

  const pedida = queueWeek({ startDate, period });
  if (Number.isFinite(pedida) && pedida >= 1) semanas.add(pedida);

  return [...semanas].sort((a, b) => a - b);
};
