/**
 * Los errores de Postgres y PostgREST, dichos en castellano y con qué hacer.
 *
 * ══ El caso que lo motivó ═══════════════════════════════════════════════════
 *
 * Un cliente intentaba anotar sus kilos en el gimnasio y le salía esto, tal cual,
 * en la pantalla:
 *
 *     public.log_session_set(p_client, p_date, p_day_name, p_exercise_id,
 *     p_field, p_session_id, p_set_index, p_value, p_week)
 *
 * Eso no es un mensaje de error: es la firma de una función de base de datos.
 * No dice qué ha pasado, no dice si la culpa es suya, y sobre todo no dice lo
 * único que importaba —que **falta aplicar una migración en Supabase**, y que
 * hasta que se aplique no va a poder anotar nada por mucho que lo reintente—.
 *
 * ══ Por qué esto es un módulo y no un `try/catch` en el sitio del fallo ═════
 *
 * Porque el fallo no sale por un sitio: sale por la cola de guardado, que es por
 * donde pasa TODA la escritura de la aplicación —la rutina, la dieta, el peso,
 * las preferencias—. Traducirlo ahí lo arregla para las cuarenta pantallas a la
 * vez, y es además el único punto que ve el mensaje antes de enseñarlo.
 *
 * ── Lo que no se reconoce se enseña tal cual ────────────────────────────────
 * Igual que en `authErrors.js`. Un mensaje de Postgres en inglés es peor que uno
 * en castellano y muchísimo mejor que «se ha producido un error»: al menos se
 * puede buscar, y va entero al ticket de soporte (`lib/diagnostics.js`).
 */

/**
 * Qué migración da cada función, para poder decir CUÁL falta.
 *
 * No están todas: solo las que el navegador llama y que, si faltan, rompen algo
 * que el usuario está haciendo en ese momento. La lista de despliegue completa
 * vive en `docs/despliegue.md`.
 */
const FUNCION_MIGRACION = {
  log_session_set: '0014',
  save_workout_data: '0014',
  continue_program: '0014',
  log_session_feedback: '0016',
  set_client_preferences: '0008',
  create_client_invite: '0015',
  claim_client_invite: '0015',
  submit_check_in: '0009',
  review_check_in: '0042',
  create_client: '0032',
  delete_check_in: '0044',
};

/** El nombre de la función del que habla un PGRST202. */
const funcionDe = (message = '') =>
  /function (?:public\.)?([a-z_][a-z0-9_]*)/i.exec(message)?.[1] || null;

/**
 * Traduce el error de una escritura. Recibe el objeto de error de supabase-js
 * —que trae `code` y `message`— y devuelve una sola frase.
 */
export const traduceDbError = (error) => {
  const message = typeof error === 'string' ? error : error?.message || '';
  const code = typeof error === 'string' ? '' : error?.code || '';

  /*
    ── La función no existe ────────────────────────────────────────────────
    Casi siempre significa una migración sin aplicar, y no un fallo puntual: no
    sirve de nada reintentar. Se nombra el archivo para que quien lo lea sepa
    exactamente qué ejecutar, y se distingue de un problema del usuario.
  */
  if (code === 'PGRST202' || /Could not find the function/i.test(message)) {
    const fn = funcionDe(message);
    const mig = fn ? FUNCION_MIGRACION[fn] : null;
    return mig
      ? `Falta preparar la base de datos: la migración ${mig} no está aplicada en Supabase. Hasta entonces esto no se puede guardar.`
      : 'Falta preparar la base de datos: hay una migración sin aplicar en Supabase.';
  }

  /* Sin permiso sobre la operación. `42501` es el de Postgres y el de RLS llega
     con este texto: los dos se leen igual desde fuera. */
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'No tienes permiso para guardar esto. Si crees que deberías, avisa a tu entrenador.';
  }

  /* Choque de clave única. El caso real es entregar dos veces la misma semana. */
  if (code === '23505') {
    return 'Eso ya estaba guardado. Recarga la página para ver lo que hay.';
  }

  /* Sin conexión. `supabase-js` lo entrega como un TypeError de `fetch`, sin
     código, y «Failed to fetch» no le dice nada a nadie. */
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Sin conexión. Lo que has escrito se guarda aquí y se manda solo cuando vuelvas a tener red.';
  }

  return message || 'No se pudo guardar';
};

/**
 * Traduce el error de una SUBIDA a Storage. Devuelve la frase, o `null` si no
 * lo reconoce — entonces quien llama enseña el mensaje original, como siempre.
 *
 * ══ Por qué existe aparte de `traduceDbError` ═══════════════════════════════
 *
 * Porque la API de Storage NO reenvía el texto de un `RAISE EXCEPTION`: cuando
 * el disparador de la cuota (migración 0067) corta una subida, lo que llega
 * aquí es literalmente «database error, code: 23514». El mensaje que la 0067
 * redactó con cuidado se queda dentro de Postgres, así que la frase que ve una
 * persona tiene que ponerse aquí — que además es donde se sabe QUIÉN sube, y
 * el capado habla distinto a cada lado a propósito:
 *
 *   · al ENTRENADOR se le dice qué pasa y qué hacer: es quien puede pagar;
 *   · al CLIENTE no se le nombra ni el plan ni la tarifa — en qué plan está su
 *     entrenador no es asunto de la aplicación (`monetizacion.md` §7.4).
 */
export const traduceStorageError = (error, { cliente = false } = {}) => {
  const message = typeof error === 'string' ? error : error?.message || '';

  // 23514 = check_violation: el único origen en Storage es la cuota de la 0067.
  if (/23514/.test(message)) {
    return cliente
      ? 'No queda espacio para archivos en esta cuenta. Díselo a tu entrenador: puede liberar espacio o ampliarlo.'
      : 'Has llenado el espacio de fotos y vídeo de tu plan. Borra archivos que ya no necesites o cambia de plan en Ajustes → Plan.';
  }

  return null;
};

/**
 * Lo que ha fallado al llamar a una función de borde, dicho en castellano.
 *
 * ══ El fallo que esto arregla, y que ya estaba documentado ══════════════════
 *
 * `supabase/README.md` lo avisa desde hace tiempo: si una función NO está
 * desplegada, la petición se lleva un 404 —que no lleva cabeceras de CORS— y lo
 * que `supabase-js` levanta es un `FunctionsFetchError` con el texto **«Failed to
 * send a request to the Edge Function»**. Esa frase se pintaba tal cual, en
 * inglés, en la pantalla de integraciones: no dice qué falta, no dice qué hacer y
 * hace pensar en un fallo de red pasajero que se arregla recargando.
 *
 * Y es, con diferencia, **el despiste más probable la primera vez**: el código
 * está en el repositorio, la migración está aplicada, y lo único que falta es un
 * `functions deploy` que nadie ha corrido.
 *
 * ── Por qué no se distingue de «estás sin conexión» ─────────────────────────
 * Porque desde el navegador son indistinguibles: en los dos casos el `fetch` no
 * llega a completarse y el error es el mismo objeto. Así que la frase nombra las
 * dos posibilidades por orden de probabilidad, en vez de afirmar una.
 *
 * @param nombre  Cuál se ha intentado llamar. Va en el mensaje porque es
 *   exactamente lo que hay que teclear detrás de `functions deploy`.
 */
export const traduceFunctionError = (error, nombre) => {
  const message = typeof error === 'string' ? error : error?.message || '';

  if (/failed to send a request/i.test(message) || error?.name === 'FunctionsFetchError') {
    return `No se ha podido hablar con el servidor. Lo más probable es que la función «${nombre}» no esté desplegada todavía (npx supabase functions deploy ${nombre}); si lo está, comprueba tu conexión.`;
  }

  return message || 'Algo ha fallado en el servidor.';
};
