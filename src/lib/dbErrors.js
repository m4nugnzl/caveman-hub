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
