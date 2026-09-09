/**
 * El catálogo común, mezclado con lo que ya es tuyo.
 *
 * ══ Por qué no hay pantalla de catálogo ════════════════════════════════════
 *
 * Porque obligaría a un paso previo —«ir a importar»— que nadie da. El momento en
 * el que necesitas «Lentejas» es mientras montas la dieta, no media hora antes
 * administrando una lista.
 *
 * Así que el catálogo no se navega: se mezcla con tu biblioteca en los buscadores
 * que ya existen. Escribes «lentejas», sale, la eliges, y en ese momento se copia
 * a tu biblioteca, con su unidad y sus macros puestos.
 *
 * ── La copia NO es editable, y esto ha cambiado ───────────────────────────
 * Aquí ponía «después de la primera vez ya es tuya y editable», que es lo que
 * pensaba la 0033. Ya no: un alimento del catálogo es de referencia y se queda
 * como está, en el catálogo y en tu copia. Para unos macros distintos —los de
 * la marca que compras— se da de alta un alimento distinto, con su nombre.
 * Ver `canEditLibraryItem`, que es donde vive el porqué.
 *
 * ══ Quién gana cuando el nombre se repite ══════════════════════════════════
 *
 * **Tu biblioteca, siempre.** Si has ajustado los macros de «Pan integral» a los
 * de la marca que compras, ver dos «Pan integral» en el desplegable —el tuyo y el
 * genérico— sería un error a punto de pasar: elegirías el equivocado la mitad de
 * las veces y no notarías nada hasta que las cuentas no cuadren.
 *
 * Se comparan en minúsculas y sin espacios sobrantes, que es como se escriben los
 * duplicados de verdad: «Pan Integral» y «pan integral ».
 */

/** Clave de comparación: lo que hace que dos nombres sean «el mismo». */
const clave = (name) => String(name || '').trim().toLowerCase();

/**
 * Tu biblioteca primero y el catálogo detrás, sin repetidos.
 *
 * Las entradas del catálogo se marcan con `fromCatalog` para que el buscador
 * pueda decir de dónde vienen. No es decoración: saber que un alimento **todavía
 * no es tuyo** explica por qué al elegirlo aparece de repente en tu biblioteca.
 */
export const mergeCatalog = (library = [], catalog = []) => {
  const mios = new Set((library || []).map((item) => clave(item?.name)));

  return [
    ...(library || []),
    ...(catalog || [])
      .filter((item) => item && !mios.has(clave(item.name)))
      .map((item) => ({ ...item, fromCatalog: true })),
  ];
};

/**
 * La entrada de la lista que se llama así, o `null`.
 *
 * Compara con la misma `clave` que la mezcla: si «Pan Integral» y «pan integral »
 * cuentan como el mismo a la hora de no duplicar, tienen que contar como el mismo
 * a la hora de decir de quién es.
 */
export const findByName = (items, name) => {
  const buscada = clave(name);
  return (items || []).find((item) => clave(item?.name) === buscada) || null;
};

/**
 * ══ Qué se puede corregir y qué se queda como está ═════════════════════════
 *
 * **Solo lo que has dado de alta tú.** Y eso deja fuera dos cosas.
 *
 * ── 1. Los generales, que están bien y se quedan así ───────────────────────
 * Un alimento cuyo nombre está en el CATÁLOGO es de referencia: la pechuga de
 * pollo tiene los mismos macros en todas las bibliotecas del mundo, y los 179
 * del catálogo salen de tablas de composición, no del criterio de nadie. No se
 * tocan ni en el catálogo ni en la copia que tengas de él.
 *
 * Que la copia también cuente es EL punto, y es lo que fallaba antes: preguntar
 * solo por `coach_id` no distinguía nada para quien trabaja solo. Los 46
 * alimentos de arranque (0022) se siembran con el `coach_id` del DUEÑO del
 * equipo, y cada alimento que copias del catálogo al usarlo nace también con el
 * tuyo — así que todo era «tuyo» y todo llevaba lápiz. Cuarenta y cinco de esos
 * cuarenta y seis están en el catálogo, que es exactamente por lo que el
 * catálogo sirve de definición sin inventar una columna nueva.
 *
 * Si necesitas otros macros —la marca de pan que compras trae los suyos—, es un
 * alimento distinto y se da de alta con su nombre: «Pan integral Bimbo». Nombres
 * distintos para cosas distintas es además lo único que entiende `upsertByName`,
 * que identifica por nombre.
 *
 * ── 2. Lo que dio de alta un compañero de equipo ───────────────────────────
 * Desde la 0006 la biblioteca es del EQUIPO y sus políticas de RLS dejan a
 * cualquier miembro escribir cualquier fila: la base NO te va a parar. La regla
 * vive aquí, en el producto, porque es una decisión de producto — un entrenador
 * no le reescribe los macros a otro sin que se entere.
 *
 * ── Lo que NO está en la biblioteca de nadie ───────────────────────────────
 * Vale: si no hay fila con ese nombre, nadie lo creó, y al guardarlo nace una
 * fila tuya. Es el caso de una dieta traída de fuera —un PDF importado— cuyos
 * alimentos todavía no ha visto la biblioteca.
 *
 * ── Sin catálogo cargado ───────────────────────────────────────────────────
 * Si la 0033 no está aplicada, `catalog` llega vacío y no hay forma de saber qué
 * es general. Se cae a la regla de antes —`coach_id`— en vez de bloquearlo todo:
 * es un entorno a medio migrar, no un motivo para quitarle a nadie la única
 * manera de arreglar un macro mal tecleado.
 *
 * ── Y esto NO decide si se puede tocar la DIETA ────────────────────────────
 * Una entrada de dieta es una copia congelada (ver `buildFoodEntry`): los gramos,
 * el orden, la unidad en la que se lee y hasta cambiar un alimento por otro
 * siguen siendo del entrenador que monta ese plan. Lo que esto acota es la
 * escritura en la BIBLIOTECA, que es lo único compartido.
 */
export const canEditLibraryItem = (name, { library = [], catalog = [], coachId = null } = {}) => {
  if (!coachId) return false;
  if (findByName(catalog, name)) return false;

  const fila = findByName(library, name);
  if (!fila) return true;
  return !fila.fromCatalog && fila.coachId === coachId;
};

/**
 * CÓMO SE CLASIFICA UN ALIMENTO.
 *
 * Es el vocabulario que ya escribe el catálogo (0033 y 0096), sacado aquí para
 * que la ficha pueda ofrecerlo al clasificar **lo tuyo** (0103). Vive en el
 * producto y no en un CHECK de la base a propósito: una categoría nueva no
 * puede costar un despliegue.
 *
 * En el orden en que se lee una compra —lo que se cocina, lo que acompaña, lo
 * que se unta y lo que sobra—, no alfabético: alfabético pondría «Dulces»
 * delante de «Carne» y el menú se recorrería entero cada vez.
 *
 * `null` es «sin clasificar», y es un estado legítimo: hay alimentos que no
 * caen en ninguna y forzarlos a «Otros» no es clasificarlos, es esconderlos.
 */
export const FOOD_CATEGORIES = [
  'Carne',
  'Pescado',
  'Huevos',
  'Lácteos',
  'Legumbres',
  'Cereales',
  'Tubérculos',
  'Verdura',
  'Fruta',
  'Frutos secos',
  'Grasas',
  'Dulces',
  'Suplementos',
];

/**
 * Agrupa por categoría, respetando el orden en que llegan.
 *
 * Se usa cuando hay que enseñar el catálogo entero —no en el buscador, que
 * ordena por relevancia—. `Map` y no un objeto porque conserva el orden de
 * inserción y ahí sí importa: «Carne» antes que «Suplementos» es una decisión.
 */
export const byCategory = (items = []) => {
  const out = new Map();
  for (const item of items) {
    const cat = item?.category || 'Otros';
    if (!out.has(cat)) out.set(cat, []);
    out.get(cat).push(item);
  }
  return out;
};

/**
 * La misma lista, partida por lo que ya la clasifica.
 *
 * ══ Por qué la Librería se agrupa y no se ordena a secas ═══════════════════
 *
 * Porque doscientas treinta y nueve filas por orden alfabético no son una
 * estructura: son un listín. Y porque la clasificación estaba dicha DOS veces
 * en la misma pantalla —una columna «Músculo» a seiscientos píxeles del nombre
 * y un filtro «Músculo» treinta píxeles más arriba— sin que ninguna de las dos
 * dejara ver de un vistazo cuántos dorsales tienes.
 *
 * Agrupada, la clasificación deja de ser una columna que se repite fila a fila
 * y pasa a ser lo que de verdad es: el índice del inventario. Se lee cuántos
 * hay de cada cosa, se salta a la parte que interesa, y la columna se va con
 * su socavón.
 *
 * ── El orden lo pone quien llama, y es el del filtro ──────────────────────
 * Los dos vocabularios de la casa (`MUSCLE_GROUPS`, `FOOD_CATEGORIES`) no
 * cubren lo que el catálogo trae de verdad —el catálogo dice «Pectoral» donde
 * la aplicación dice «Pecho», que es una discrepancia ya documentada—, así que
 * ordenar por ellos dejaría media biblioteca en un cajón de sastre. El orden
 * que se pasa es el que ya calcula el selector de filtros: por cuántos hay.
 * Una pantalla, un orden.
 *
 * ── Y lo que no está clasificado va al final, no primero ─────────────────
 * Un grupo «Sin clasificar» arriba es lo primero que se lee al abrir, y es lo
 * único de la lista que no dice nada. Se devuelve con `grupo: null` para que
 * quien pinte decida cómo llamarlo.
 *
 * @param items  Las filas ya filtradas y ordenadas.
 * @param clave  De dónde sale el grupo de cada fila (`muscle`, `category`).
 * @param orden  Los grupos en el orden en que van. Uno que aparezca en las
 *   filas y no esté aquí no se pierde: entra detrás, por orden de aparición.
 * @returns `[{ grupo, filas }]`, sin grupos vacíos.
 */
export const groupInOrder = (items = [], clave = 'category', orden = []) => {
  const cajas = new Map(orden.map((g) => [g, []]));
  const sueltas = [];

  for (const item of items) {
    const grupo = item?.[clave] || null;
    if (!grupo) sueltas.push(item);
    else if (cajas.has(grupo)) cajas.get(grupo).push(item);
    else cajas.set(grupo, [item]);
  }

  const grupos = [...cajas.entries()]
    .filter(([, filas]) => filas.length > 0)
    .map(([grupo, filas]) => ({ grupo, filas }));

  if (sueltas.length > 0) grupos.push({ grupo: null, filas: sueltas });
  return grupos;
};

/* ══════════════════════════════════════════════════════════════════════════
   LAS ETIQUETAS DEL ALIMENTO Y EL AVISO PASIVO
   ══════════════════════════════════════════════════════════════════════════

   `food.tags` lleva HECHOS del alimento (0094): que el pan lleva gluten es
   verdad para todo el mundo. Lo que es de CADA cliente son sus restricciones,
   que ya viven en sus condicionantes; aquí se cruzan las dos cosas.

   ── La ley de la casa, aplicada a la letra ────────────────────────────────
   El resultado es información, nunca un filtro: el buscador AVISA («Marta
   evita el gluten — este alimento lo contiene») y deja añadir igualmente.
   Puede haber mil motivos legítimos para hacerlo — el criterio es del
   entrenador, y la app no receta. Es la misma gramática que el aviso del
   multipower en el banco. */

/** Cómo se dice cada etiqueta. Solo las conocidas se enseñan. */
export const FOOD_TAG_LABELS = {
  gluten: 'Gluten',
  lactosa: 'Lactosa',
  huevo: 'Huevo',
  pescado: 'Pescado',
  marisco: 'Marisco',
  'frutos-de-cascara': 'Frutos de cáscara',
  soja: 'Soja',
  carne: 'Carne',
};

export const foodTagLabels = (food) =>
  (Array.isArray(food?.tags) ? food.tags : []).map((t) => FOOD_TAG_LABELS[t]).filter(Boolean);

/* Qué palabras de un condicionante encienden cada etiqueta. Se busca en el
   texto libre porque las restricciones son vocabulario del cliente —«celiaquía»,
   «alergia a los frutos secos»— y un enum aquí obligaría a reescribirlas. */
const TAG_TRIGGERS = {
  gluten: /gluten|celiaqu/,
  lactosa: /lactosa|l[aá]cteo/,
  huevo: /huevo/,
  pescado: /pescado/,
  marisco: /marisco|crust[aá]ceo|gamba/,
  'frutos-de-cascara': /frutos? (secos|de c[aá]scara)|nuez|nueces|almendra|cacahuete|avellana|pistacho/,
  soja: /soja/,
};

/**
 * Las etiquetas de este alimento que chocan con las restricciones del cliente.
 *
 * Solo miran los condicionantes ACTIVOS de nutrición (o de las dos áreas): una
 * lesión de hombro no opina de un pan, y lo resuelto ya no restringe. El
 * vegetariano choca con carne, pescado y marisco; el vegano, además, con huevo
 * y lactosa.
 *
 * @returns lista de etiquetas en conflicto (ids), vacía si no hay choque.
 */
export const foodConflicts = (food, conditions = []) => {
  const tags = new Set(Array.isArray(food?.tags) ? food.tags : []);
  if (tags.size === 0) return [];

  const activos = (conditions || []).filter(
    (c) => c && !c.resolvedAt && (c.area === 'nutrition' || c.area === 'both')
  );
  if (activos.length === 0) return [];

  const texto = activos
    .map((c) => `${c.label || ''} ${c.detail || ''}`)
    .join(' · ')
    .toLowerCase();

  const out = [];
  for (const [tag, re] of Object.entries(TAG_TRIGGERS)) {
    if (tags.has(tag) && re.test(texto)) out.push(tag);
  }

  const vegano = /vegan/.test(texto);
  const vegetariano = vegano || /vegetarian/.test(texto);
  if (vegetariano) for (const t of ['carne', 'pescado', 'marisco']) if (tags.has(t)) out.push(t);
  if (vegano) for (const t of ['huevo', 'lactosa']) if (tags.has(t)) out.push(t);

  return [...new Set(out)];
};

/**
 * ══ LOS QUE SE PARECEN DEMASIADO ═══════════════════════════════════════════
 *
 * La Librería promete «curar»: tu vídeo, tus pautas, tu nota, y **los dos "Pan
 * integral" que se colaron**. Lo primero estaba construido; lo último no tenía
 * ni forma de verse.
 *
 * ── Qué caza esto y qué NO ────────────────────────────────────────────────
 * Caza el duplicado que se lee: «Platano» y «Plátano», «Alubia» y «Alubias»,
 * una letra de más al teclear. Ésos conviven tan tranquilos —son dos nombres
 * distintos para todo el mundo— y solo se ven poniéndolos uno al lado del otro.
 *
 * NO caza el que solo cambia de caja o de espacios, y no porque no exista sino
 * porque no llega hasta aquí: `upsertByName` busca la fila con
 * `.eq('name', trimmed)`, que compara carácter a carácter, mientras
 * `mergeCatalog` deduplica con `clave` —minúsculas y sin espacios sobrantes—.
 * O sea que «Pan Integral» y «pan integral» pueden ser DOS filas en la base y
 * la mezcla enseña una sola, callando la otra. El alta de la ficha sí lo
 * comprueba con `clave` y lo rechaza; lo que entra por otras puertas (una
 * importación), no. Eso es un cabo suelto del ESCRITOR, y arreglarlo ahí es lo
 * que corresponde — taparlo desde la lista sería curar el síntoma.
 *
 * ── Por qué distancia y no «uno contiene al otro» ─────────────────────────
 * Porque contener es lo NORMAL en una despensa y no significa nada: «Almendras»
 * y «Almendras crudas» son dos alimentos de verdad, con macros distintos, y
 * marcarlos como sospechosos sería ruido en la mitad de las filas. Lo que
 * delata un duplicado es un nombre que se escribió dos veces con una letra o un
 * acento de diferencia, y eso es una distancia de edición corta.
 *
 * El suelo de cinco caracteres no es cosmético: con nombres cortos una
 * distancia de dos los empareja casi todos —«Sal» y «Col» distan dos— y la
 * señal se convertiría en un adorno que nadie mira.
 *
 * ── Lo que esto NO hace, y a propósito: fusionar ──────────────────────────
 * Fusionar dos alimentos exigiría reescribir las dietas ya montadas de todos
 * los clientes que lleven el que se va. Y una entrada de dieta es una COPIA
 * CONGELADA por decisión escrita (`buildFoodEntry`): cambiarle el nombre a
 * espaldas del entrenador es justo lo que el modelo evita. La salida honesta es
 * la que ofrece la ficha: ver cuál de los dos usas y borrar el que no.
 *
 * @param name   El nombre del que se busca pareja.
 * @param names  Los demás nombres de la lista.
 * @returns Los que se le parecen, sin repetidos y sin él mismo.
 */
const distanciaCorta = (a, b, tope) => {
  if (Math.abs(a.length - b.length) > tope) return false;

  /* Una sola fila de la matriz: de la anterior solo hace falta la diagonal, y
     un nombre de alimento no justifica reservar dos vectores. */
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = fila[0];
    fila[0] = i;
    let mejorDeLaFila = i;

    for (let j = 1; j <= b.length; j += 1) {
      const anterior = fila[j];
      fila[j] =
        a[i - 1] === b[j - 1]
          ? diagonal
          : 1 + Math.min(diagonal, fila[j], fila[j - 1]);
      diagonal = anterior;
      if (fila[j] < mejorDeLaFila) mejorDeLaFila = fila[j];
    }

    /* Si la fila entera ya se pasa del tope, ninguna de abajo puede bajar de
       ahí: las distancias solo crecen hacia el final. */
    if (mejorDeLaFila > tope) return false;
  }

  return fila[b.length] <= tope;
};

export const SIMILAR_MIN_LENGTH = 5;

export const similarNames = (name, names = [], tope = 2) => {
  const yo = clave(name);
  if (yo.length < SIMILAR_MIN_LENGTH) return [];

  const vistos = new Set([yo]);
  const out = [];

  for (const otro of names) {
    const suya = clave(otro);
    if (suya.length < SIMILAR_MIN_LENGTH || vistos.has(suya)) continue;
    if (!distanciaCorta(yo, suya, tope)) continue;
    vistos.add(suya);
    out.push(otro);
  }

  return out;
};
