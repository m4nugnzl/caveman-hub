/**
 * Preferencias del panel, por cliente.
 *
 * ── El criterio ─────────────────────────────────────────────────────────────
 * La personalización no es "que el cliente mueva cajas": es que **vea lo que a
 * él le importa**. A uno le interesa el peso y las calorías; a otro, que compite,
 * le importan el tonelaje y la progresión por ejercicio; a otro solo si ha hecho
 * su check-in. Mostrarles a los tres lo mismo obliga a los tres a filtrar.
 *
 * Reglas del formato:
 *  · Lo que no está configurado usa el valor por defecto. Un cliente que no toca
 *    nada ve un panel completo y sensato.
 *  · Las claves desconocidas se ignoran. Así se pueden añadir preferencias
 *    nuevas sin migrar la base de datos otra vez.
 *  · El ORDEN del array es el orden en pantalla: personalizar incluye reordenar.
 */

/** Catálogo de KPIs disponibles para la fila superior del panel. */
export const WIDGETS = [
  { id: 'weight', label: 'Peso corporal', hint: 'Último pesaje y su variación' },
  { id: 'rate', label: 'Ritmo del peso', hint: 'Kilos por semana de media' },
  { id: 'tonnage', label: 'Tonelaje', hint: 'Kilos totales levantados' },
  { id: 'sets', label: 'Series efectivas', hint: 'Series con repeticiones registradas' },
  { id: 'kcals', label: 'Kcal objetivo', hint: 'Objetivo diario y reparto de macros' },
  { id: 'adherence', label: 'Adherencia', hint: 'Series registradas sobre las programadas' },
  { id: 'checkin', label: 'Check-in semanal', hint: 'Pesajes de esta semana' },
  { id: 'photos', label: 'Fotos de progreso', hint: 'Cuántas hay y la última' },
  /* Solo aparece si el protocolo pregunta algo medible: sin preguntas activas no
     hay nada que enseñar, y el catálogo no debe ofrecer un hueco vacío. */
  { id: 'readiness', label: 'Sensaciones', hint: 'La primera pregunta de tu protocolo, semana a semana' },
];

/**
 * Catálogo de gráficos disponibles para el cuerpo del panel.
 *
 * ── Por qué cada tarjeta declara su ancho ───────────────────────────────────
 * No todas las piezas caben en media fila. La estructura semanal son SIETE
 * columnas: metida en media fila queda una tira minúscula con el texto cortado,
 * que es exactamente lo que pasaba al mezclarla con los demás gráficos. El
 * volumen por músculo tiene el mismo problema con nombres largos.
 *
 *   span  → ancho por defecto ('full' = fila completa, 'half' = media)
 *   fixed → el ancho NO es negociable; la interfaz no ofrece cambiarlo
 */
export const CARDS = [
  { id: 'weightTrend', label: 'Evolución del peso', hint: 'Banda con el promedio semanal', span: 'half' },
  { id: 'tonnageTrend', label: 'Tonelaje por semana', hint: 'Barras por microciclo', span: 'half' },
  { id: 'macros', label: 'Reparto de macros', hint: 'Kcal objetivo y reparto por macro', span: 'half' },
  {
    id: 'split',
    /* Ni «semanal» ni «ciclo»: la misma tarjeta enseña las dos estructuras según
       cómo entrene cada cliente, y en esta lista se elige para cualquiera. */
    label: 'Estructura del programa',
    hint: 'Qué toca cada día y cuándo se descansa — necesita la fila entera',
    span: 'full',
    fixed: true,
  },
  { id: 'volume', label: 'Volumen por músculo', hint: 'Series por grupo con su MRV', span: 'full' },
  /*
    El feedback de las sesiones. Va a fila completa y es innegociable por lo mismo
    que la estructura semanal: son varias líneas con su leyenda, y en media fila
    la leyenda se come el gráfico.

    Que esté en este catálogo —y no en una pantalla aparte— es el punto entero del
    diseño: una respuesta de escala es una serie temporal como el peso, así que se
    configura, se ordena y se esconde por el mismo sitio que todas las demás.
  */
  {
    id: 'feedbackTrend',
    label: 'Feedback de las sesiones',
    hint: 'Una línea por pregunta — necesita la fila entera',
    span: 'full',
    fixed: true,
  },
];

/**
 * De qué servicio depende cada pieza del resumen.
 *
 * ══ Por qué un mapa y no un campo en cada catálogo ══════════════════════════
 *
 * Porque los mismos identificadores los usan TRES listas: las cifras de arriba
 * (`WIDGETS`), los gráficos (`CARDS`) y la lista agrupada de métricas del final,
 * que no sale de ningún catálogo —se arma con lo que tiene dato—. Un campo en los
 * dos catálogos dejaría la tercera fuera, que es justo donde el objetivo calórico
 * volvería a aparecer en el panel de alguien a quien no le llevas la dieta.
 *
 * Lo que no está aquí existe siempre: el peso, las fotos y el check-in no
 * dependen de si le programas o le pautas la comida.
 */
export const PIECE_SERVICE = {
  tonnage: 'training',
  sets: 'training',
  adherence: 'training',
  readiness: 'training',
  tonnageTrend: 'training',
  split: 'training',
  volume: 'training',
  feedbackTrend: 'training',
  kcals: 'nutrition',
  macros: 'nutrition',
};

/** El servicio que necesita una pieza, o `null` si no depende de ninguno. */
export const pieceNeeds = (id) => PIECE_SERVICE[id] || null;

const DEFAULTS = {
  dashboard: {
    widgets: ['weight', 'checkin', 'tonnage', 'kcals'],
    // La estructura semanal va última y a fila completa: es contexto, no una
    // métrica, y en media fila no se lee.
    cards: ['weightTrend', 'tonnageTrend', 'split'],
    spans: {},
    showMetricList: true,
  },
};

/**
 * Perfiles: la personalización en un solo toque.
 *
 * ── Por qué existen ─────────────────────────────────────────────────────────
 * Elegir ocho cifras y cinco gráficos de una lista es trabajo, y casi nadie lo
 * hace. Un perfil resuelve el 90 % de los casos con un clic, y quien quiera
 * afinar sigue teniendo el detalle debajo. Cada uno responde a un tipo de
 * cliente real, no a una combinación bonita.
 */
export const DASHBOARD_PRESETS = [
  {
    id: 'balanced',
    label: 'Equilibrado',
    hint: 'Peso, check-in y entrenamiento a partes iguales',
    prefs: {
      widgets: ['weight', 'checkin', 'tonnage', 'kcals'],
      cards: ['weightTrend', 'tonnageTrend', 'split'],
      spans: {},
      showMetricList: true,
    },
  },
  {
    id: 'physique',
    label: 'Composición corporal',
    hint: 'Para quien busca perder o ganar peso',
    prefs: {
      widgets: ['weight', 'rate', 'checkin', 'kcals', 'photos'],
      cards: ['weightTrend', 'macros'],
      spans: {},
      showMetricList: true,
    },
  },
  {
    id: 'performance',
    label: 'Rendimiento',
    hint: 'Para quien entrena por fuerza o competición',
    prefs: {
      widgets: ['tonnage', 'sets', 'adherence', 'weight'],
      // Dos de media fila que se emparejan, y las dos anchas debajo: ningún
      // perfil debería salir con todo a fila completa, aunque `layoutCards`
      // impida el hueco.
      cards: ['tonnageTrend', 'weightTrend', 'volume', 'split'],
      spans: {},
      showMetricList: false,
    },
  },
  {
    id: 'minimal',
    label: 'Mínimo',
    hint: 'Solo lo que hay que hacer esta semana',
    prefs: {
      widgets: ['checkin', 'adherence'],
      cards: ['split'],
      spans: {},
      showMetricList: false,
    },
  },
];

const ids = (list) => list.map((item) => item.id);

/** Filtra a lo conocido conservando el orden elegido, y evita duplicados. */
const sanitizeList = (chosen, catalogue, fallback) => {
  if (!Array.isArray(chosen)) return fallback;
  const valid = new Set(ids(catalogue));
  const out = [];
  for (const id of chosen) {
    if (valid.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
};

/** Anchos válidos y no impuestos: los de las tarjetas con `fixed` se ignoran. */
const sanitizeSpans = (raw) => {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const card of CARDS) {
    if (card.fixed) continue;
    const value = raw[card.id];
    if (value === 'full' || value === 'half') out[card.id] = value;
  }
  return out;
};

/**
 * Preferencias efectivas del panel: lo elegido para el cliente, completado con
 * los valores por defecto y limpio de claves que la aplicación no conoce.
 *
 * ── El predeterminado del entrenador (migración 0035) ───────────────────────
 * `fallback` es la configuración que el entrenador guardó como suya. Se usa
 * cuando la ficha del cliente no dice nada, que es el caso de todos los clientes
 * nuevos.
 *
 * El orden importa y es este: **lo del cliente gana, y solo si no hay nada suyo
 * se mira el predeterminado**. Si el entrenador se molestó en ajustar el panel de
 * Marta fue por algo, y un cambio en su plantilla no puede deshacerlo.
 */
export const dashboardPrefs = (preferences, fallback = null) => {
  const raw = preferences?.dashboard || fallback || {};
  return {
    widgets: sanitizeList(raw.widgets, WIDGETS, DEFAULTS.dashboard.widgets),
    cards: sanitizeList(raw.cards, CARDS, DEFAULTS.dashboard.cards),
    spans: sanitizeSpans(raw.spans),
    showMetricList:
      typeof raw.showMetricList === 'boolean' ? raw.showMetricList : DEFAULTS.dashboard.showMetricList,
  };
};

export const cardById = (id) => CARDS.find((card) => card.id === id) || null;
export const widgetById = (id) => WIDGETS.find((widget) => widget.id === id) || null;

/** Ancho efectivo de una tarjeta: el impuesto, el elegido o el suyo por defecto. */
export const cardSpan = (prefs, id) => {
  const card = cardById(id);
  if (!card) return 'half';
  if (card.fixed) return card.span;
  return prefs?.spans?.[id] || card.span;
};

/** ¿El cliente ha personalizado algo, o está viendo el panel por defecto? */
export const isCustomized = (preferences) => {
  const current = dashboardPrefs(preferences);
  const base = DEFAULTS.dashboard;
  return (
    current.widgets.join() !== base.widgets.join() ||
    current.cards.join() !== base.cards.join() ||
    Object.keys(current.spans).length > 0 ||
    current.showMetricList !== base.showMetricList
  );
};

/** El perfil que coincide exactamente con lo que hay puesto, si hay alguno. */
export const matchingPreset = (prefs) =>
  DASHBOARD_PRESETS.find(
    (preset) =>
      preset.prefs.widgets.join() === prefs.widgets.join() &&
      preset.prefs.cards.join() === prefs.cards.join() &&
      JSON.stringify(preset.prefs.spans) === JSON.stringify(prefs.spans) &&
      preset.prefs.showMetricList === prefs.showMetricList
  ) || null;

export const defaultDashboardPrefs = () => ({ ...DEFAULTS.dashboard, spans: {} });

/** Añade o quita un elemento conservando el orden del catálogo al añadir. */
export const togglePref = (chosen, id, catalogue) => {
  if (chosen.includes(id)) return chosen.filter((x) => x !== id);
  const order = ids(catalogue);
  return [...chosen, id].sort((a, b) => order.indexOf(a) - order.indexOf(b));
};

/** Mueve un elemento una posición, para reordenar sin arrastrar. */
export const movePref = (chosen, id, direction) => {
  const index = chosen.indexOf(id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= chosen.length) return chosen;
  const next = [...chosen];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

/**
 * Reparte las tarjetas en filas de dos columnas SIN DEJAR HUECOS.
 *
 * ── El fallo que corrige ────────────────────────────────────────────────────
 * La rejilla era `auto-fit`, así que el número de columnas dependía del ancho de
 * la ventana: en una pantalla grande caben tres, y con dos tarjetas de media fila
 * más una de fila completa quedaba un hueco vacío a la derecha de la primera fila.
 * Y aunque se fije a dos columnas, una tarjeta de media fila que se quede sola
 * —porque es la última, o porque la siguiente ocupa la fila entera— deja medio
 * hueco igual.
 *
 * La regla es una sola: **una tarjeta de media fila que se quede sin pareja pasa
 * a ocupar la fila completa.** Con eso el panel queda bien montado para cualquier
 * combinación que elija el cliente, sin que tenga que pensar en el ancho de nada.
 *
 * Se calcula aquí, en el dominio, y no con CSS, porque depende del ORDEN y de los
 * anchos elegidos —información que el CSS no tiene—. Y siendo una función pura se
 * puede comprobar caso por caso.
 */
export const layoutCards = (prefs, ids) => {
  const out = ids.map((id) => ({ id, span: cardSpan(prefs, id) }));

  let pending = null; // media fila esperando pareja
  for (const slot of out) {
    if (slot.span === 'full') {
      if (pending) pending.span = 'full'; // se quedó sola: se estira
      pending = null;
      continue;
    }
    if (pending) pending = null; // pareja completa
    else pending = slot;
  }
  if (pending) pending.span = 'full'; // última tarjeta impar

  return out;
};

/** Alterna el ancho de una tarjeta. Devuelve el mapa completo de anchos. */
export const toggleSpan = (spans, id) => {
  const card = cardById(id);
  if (!card || card.fixed) return spans;
  const current = spans?.[id] || card.span;
  const next = { ...spans };
  const wanted = current === 'full' ? 'half' : 'full';
  // Si vuelve a coincidir con el valor por defecto se borra la clave: así el
  // objeto guardado solo contiene decisiones reales del cliente.
  if (wanted === card.span) delete next[id];
  else next[id] = wanted;
  return next;
};
