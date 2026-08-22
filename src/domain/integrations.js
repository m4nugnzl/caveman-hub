/**
 * Integraciones externas.
 *
 * ── El problema que domina el diseño ────────────────────────────────────────
 * En Notion el cliente se identifica por una columna de TEXTO con su nombre. No
 * hay id estable. Emparejar por nombre es frágil de cuatro formas distintas:
 * acentos, mayúsculas, orden invertido («González, Manu») y apodos. Y el fallo es
 * silencioso: un pago que cae en el cliente equivocado no da ningún error.
 *
 * La respuesta es de dos capas:
 *   1. `nameKey` absorbe lo que varía sin querer —tildes, mayúsculas, espacios y
 *      el orden de las palabras—.
 *   2. Lo que sigue sin cuadrar NO se adivina: se queda sin asignar y visible, y
 *      cuando el entrenador lo confirma una vez, queda guardado en
 *      `client_external_refs` y ya no se vuelve a preguntar.
 */

/**
 * Clave de conciliación de un nombre.
 *
 * Ordenar las palabras alfabéticamente es lo que hace que «Manu González» y
 * «González Manu» den la misma clave, sin tener que decidir cuál es el nombre y
 * cuál el apellido —una heurística que falla con apellidos compuestos.
 *
 * ⚠️ Esta función está DUPLICADA en `supabase/functions/notion-payments/index.ts`.
 * Es la única duplicación deliberada del proyecto: cruza dos runtimes (el
 * navegador y Deno) y la clave tiene que ser idéntica en los dos lados o la
 * memoria de conciliación deja de encontrarse. Si se cambia una, hay que cambiar
 * la otra.
 */
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');

export const nameKey = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

/**
 * Extrae el id de una base de Notion de lo que sea que pegue el usuario.
 *
 * ── Por qué hace falta esto ─────────────────────────────────────────────────
 * Nadie copia el id: se copia la URL, o el id con el `?v=…` de la vista pegado
 * detrás, que es lo que sale al usar «Copiar enlace». Y el `?v=` es TAMBIÉN una
 * cadena de 32 hexadecimales, así que quedarse con el último trozo hexadecimal
 * cogería el id de la vista y no el de la base. De ahí que Notion respondiera
 * `invalid_request_url`.
 *
 * Por eso lo primero es cortar en el `?`: lo que va después nunca es la base.
 *
 * Formatos que acepta:
 *   e232ec9c52f9419e8ff7365d63cbaeb8
 *   e232ec9c-52f9-419e-8ff7-365d63cbaeb8
 *   e232ec9c52f9419e8ff7365d63cbaeb8?v=0327e6ecfe374217a89786a0d8e94a8f
 *   https://app.notion.com/p/e232ec9c52f9419e8ff7365d63cbaeb8?v=…&source=copy_link
 *   https://notion.so/equipo/Pagos-asesorados-e232ec9c52f9419e8ff7365d63cbaeb8?v=…
 */
export const notionDatabaseId = (input) => {
  const beforeQuery = String(input || '').trim().split('?')[0].split('#')[0];
  const flat = beforeQuery.replace(/-/g, '');
  const matches = flat.match(/[0-9a-fA-F]{32}/g);
  return matches ? matches[matches.length - 1].toLowerCase() : '';
};

/**
 * Catálogo de servicios que se pueden conectar.
 *
 * ── Por qué un catálogo y no una pantalla por servicio ──────────────────────
 * Con una sola integración, una pantalla dedicada parece razonable; con tres es un
 * laberinto de pestañas. El catálogo es cómo lo resuelven todas las aplicaciones
 * que tienen extensiones: una rejilla con lo disponible, cada cosa con su logotipo
 * y su estado, y la configuración DENTRO de cada una. Añadir un servicio nuevo pasa
 * a ser una entrada en esta lista.
 *
 * `status: 'planned'` es deliberado y honesto: se ve que existe y que todavía no
 * está, en lugar de aparecer de la nada algún día o de fingir que funciona.
 */
export const PROVIDERS = [
  {
    id: 'notion',
    name: 'Notion',
    tagline: 'Lee los cobros desde una base de datos tuya',
    status: 'available',
    category: 'Cobros',
    what: 'Si ya llevas los pagos en Notion, esto los lee y actualiza el estado de cada cliente. Notion sigue siendo la fuente de verdad.',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    tagline: 'Suscripciones, cobros fallidos y bajas, al día',
    status: 'available',
    category: 'Cobros',
    what: 'Es la integración que de verdad cambia el trabajo: en lugar de leer una tabla que alguien mantiene a mano, el estado de pago viene de quien cobra. Detecta la tarjeta rechazada el día que pasa y la baja en cuanto ocurre.',
  },
];

/*
  ══ Por qué aquí no hay ningún calendario ═══════════════════════════════════

  Llegó a estar, como «Pronto», y se quitó al decidir de quién es el calendario
  que importa: **el del cliente, no el del entrenador**. Y eso lo saca de este
  catálogo, que es del entrenador y va de traer datos DE FUERA hacia aquí.

  Lo que se construyó en su lugar es un feed suscribible en el portal del
  cliente (migración 0071, `ClientCalendarFeed`): una URL que él pega en su
  calendario —Google, Apple, Outlook— y que le enseña lo suyo. No necesita
  OAuth, ni la verificación de Google, ni guardar el token de nadie.

  Si algún día se quiere además la versión del entrenador —tu semana en tu
  calendario—, entonces sí es una entrada de esta lista, y `docs/google-calendar.md`
  tiene los pasos de la consola ya hechos. Hasta entonces no se anuncia: una
  tarjeta «Pronto» es una promesa, y esta no está prometida.
*/

/**
 * Qué resuelve cada tanda del catálogo.
 *
 * Va aquí y no en la pantalla porque es propiedad del catálogo: la tanda existe
 * porque existe la `category` de un proveedor, y quien añada uno nuevo con una
 * categoría nueva tiene que escribir su frase en el mismo sitio o el encabezado
 * saldrá pelado. Sin entrada, el encabezado sale solo con el nombre — que es
 * degradar, no romper.
 */
export const CATEGORIAS = {
  Cobros:
    'De dónde sale quién ha pagado y quién no. Conectando uno, el estado de pago de tus clientes deja de mantenerse a mano.',
};

export const providerById = (id) => PROVIDERS.find((p) => p.id === id) || null;

/** Configuración por defecto para Notion, con los nombres de columna habituales. */
export const defaultNotionConfig = () => ({
  databaseId: '',
  props: { client: 'Cliente', amount: '', date: '', status: '', periodEnd: '' },
  paidValues: ['Pagado'],
  currency: 'EUR',
});

/** Las columnas que se pueden mapear, y para qué sirve cada una. */
export const NOTION_FIELDS = [
  {
    key: 'client',
    label: 'Cliente',
    hint: 'La columna con el nombre. Es la única imprescindible.',
    required: true,
  },
  { key: 'status', label: 'Estado del pago', hint: 'De aquí sale si está cobrado o pendiente' },
  { key: 'amount', label: 'Importe', hint: 'Opcional, solo para mostrarlo' },
  { key: 'date', label: 'Fecha del pago', hint: 'Decide cuál es el pago más reciente' },
  { key: 'periodEnd', label: 'Vencimiento', hint: 'Rellena la próxima renovación del cliente' },
];

/** ¿Está la configuración lo bastante completa para sincronizar? */
export const configIssues = (config) => {
  const issues = [];
  if (!notionDatabaseId(config?.databaseId)) {
    issues.push('El id de la base de Notion no es válido. Pega la URL de la base y lo extraigo yo.');
  }
  if (!String(config?.props?.client || '').trim()) {
    issues.push('Falta indicar qué columna contiene el nombre del cliente.');
  }
  if (!String(config?.props?.status || '').trim()) {
    issues.push(
      'Sin columna de estado no se puede saber quién ha pagado: todos entrarán como pendientes.'
    );
  }
  if (!String(config?.props?.date || '').trim()) {
    issues.push(
      'Sin columna de fecha, para decidir cuál es el pago más reciente de cada cliente se usará la última modificación de la fila en Notion.'
    );
  }
  return issues;
};

/**
 * Candidatos para un nombre sin conciliar, del más probable al menos.
 *
 * No propone uno solo ni lo aplica: propone y el entrenador confirma. Con dos
 * clientes de nombre parecido, elegir automáticamente es exactamente el error que
 * toda esta capa existe para evitar.
 */
export const matchCandidates = (label, clients) => {
  const key = nameKey(label);
  if (!key) return [];
  const words = new Set(key.split(' '));

  return clients
    .map((client) => {
      const candidateKey = nameKey(client.name);
      if (candidateKey === key) return { client, score: 1, reason: 'nombre idéntico' };

      const candidateWords = candidateKey.split(' ');
      const shared = candidateWords.filter((w) => words.has(w)).length;
      if (shared === 0) return null;

      const score = shared / Math.max(words.size, candidateWords.length);
      return {
        client,
        score,
        reason: shared === 1 ? 'comparten una palabra' : `comparten ${shared} palabras`,
      };
    })
    /*
      Umbral bajo a propósito. Con 0,34 pasaba algo absurdo: para «Marta» aparecía
      «Marta Gómez» (1 de 2 palabras = 0,50) pero no «Marta García Ruiz» (1 de 3 =
      0,33), que es igual de plausible. Como el entrenador confirma, esconder un
      candidato es peor que ofrecer uno de más.
    */
    .filter((match) => match && match.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
};
