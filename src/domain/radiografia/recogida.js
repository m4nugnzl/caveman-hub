/**
 * Qué tablas hace falta leer, y con qué columnas.
 *
 * ══ Por qué es una lista de datos y no un montón de consultas ═══════════════
 *
 * Porque hay dos programas que leen exactamente lo mismo —el script de la
 * terminal y la función edge— y solo uno de ellos puede ser el que manda. Cuando
 * la lista vivía dentro del script, añadir una columna al informe significaba
 * añadirla en dos sitios, y el sitio que se olvidara no fallaría: devolvería el
 * informe de siempre con una sección en blanco, que se lee igual que una sección
 * donde no hay nada que ver.
 *
 * Aquí solo está el PLAN. Ejecutarlo —paginar, distinguir «no existe» de «no se
 * ha podido leer»— es de quien tiene el cliente de base de datos delante, porque
 * cada entorno lo trae de una forma.
 *
 * ══ Las columnas son explícitas a propósito ════════════════════════════════
 *
 * Con `*` el informe se llevaría columnas que no usa, y entre ellas las que la
 * regla de `observabilidad.md` §5.2 mantiene fuera: de los clientes finales aquí
 * no puede salir ni un nombre ni una medida. Pedir solo lo que se usa es lo que
 * hace que eso sea comprobable leyendo esta lista.
 */

/**
 * El plan de lectura.
 *
 * `desde` acota las dos tablas de telemetría, que son las únicas que crecen sin
 * parar. Las demás se leen enteras porque su «ahora» es el estado actual, no una
 * ventana: una suscripción que caduca mañana no aparecería en los últimos 30 días.
 *
 * @param {{ desde?: string|null, conProgramas?: boolean }} [opciones]
 * @returns {{ tablas: Record<string, { tabla: string, columnas?: string, desde?: string|null }>, avisos: string[] }}
 */
export const planDe = ({ desde = null, conProgramas = true } = {}) => {
  const tablas = {
    eventos: { tabla: 'product_events', desde },
    fallos: { tabla: 'app_errors', desde },
    equipos: { tabla: 'teams', columnas: 'id, name, owner_id, created_at' },
    /* Nombres y correos de los ENTRENADORES. Ver la cabecera de `cuentas.js`:
       son los clientes de pago del negocio y sin saber quién es quién no se
       puede llevar. De los clientes finales aquí no sale ni un nombre. */
    perfiles: { tabla: 'profiles', columnas: 'id, full_name, email, role' },
    miembros: { tabla: 'team_members', columnas: 'team_id, profile_id, role' },
    pagos: { tabla: 'client_payments' },
    tickets: {
      tabla: 'support_tickets',
      columnas: 'id, team_id, profile_id, subject, status, created_at',
    },
    invites: {
      tabla: 'client_invites',
      columnas: 'id, client_id, created_at, expires_at, claimed_at, revoked_at',
    },
    integraciones: { tabla: 'integrations', columnas: 'id, team_id, provider, status, last_sync_at' },
    /* Para saber cuál de las cuentas eres tú y no listarte entre las que no facturan. */
    admins: { tabla: 'platform_admins', columnas: 'profile_id' },
    /* Para la etiqueta visible del plan y su tope: la clave interna del gratuito
       sigue siendo `prueba` (0056) y enseñarla diría lo contrario de lo que hace. */
    planes: {
      tabla: 'plan_limits',
      columnas: 'plan, label, max_clients, max_seats, price_cents, purchasable',
    },
    clientes: {
      tabla: 'clients',
      columnas: 'id, team_id, status, gender, start_date, client_profile_id, created_at',
    },
    antropometria: { tabla: 'anthropometry', columnas: 'client_id, history' },
    nutricion: {
      tabla: 'nutrition_plans',
      columnas: 'client_id, target_kcals, has_day_variants, steps_goal, habits_notes',
    },
    checkins: { tabla: 'check_ins', columnas: 'client_id, submitted_at, reviewed_at' },
    fotos: { tabla: 'progress_photos', columnas: 'client_id' },
    /* `trial_ends_at` y `current_period_end` son las DOS únicas fechas límite de
       todo el negocio: pasado ese día ya no se puede hacer nada. Pedir solo el
       plan y el estado —como se hacía— dejaba el informe sin la información más
       accionable que existe. */
    suscripciones: {
      tabla: 'team_subscriptions',
      columnas:
        'team_id, plan, status, trial_ends_at, current_period_end, stripe_customer_id, updated_at',
    },
  };

  const avisos = [];

  /* Los programas van aparte porque son lo único que pesa: `microcycles` es el
     JSONB de varios MB por cliente de `auditoria.md` §1.4. Se pueden dejar
     fuera, y entonces el censo lo dice en vez de contar cero. */
  if (conProgramas) {
    tablas.programas = {
      tabla: 'workout_data',
      columnas: 'client_id, microcycles, mobility_drills, notes',
    };
  } else {
    avisos.push(
      'Los programas no se han leído en esta ejecución: la sección de programas sale vacía. ' +
        'Un cero ahí no significa que nadie programe nada.'
    );
  }

  return { tablas, avisos };
};

/**
 * Las métricas de la portada que llevan línea de tendencia.
 *
 * Es una lista corta y cerrada a propósito: `instantanea()` guarda del orden de
 * quince cifras, y dibujar quince líneas es la forma de que no se mire ninguna.
 * Éstas son las que contestan «¿va a mejor o a peor?» — las demás son contexto.
 */
export const CON_TENDENCIA = [
  'seguridad · críticos',
  'actividad · cuentas esta semana',
  'clientes · total',
  'clientes · con portal (%)',
  'revisión · entregados sin contestar +7d',
  'fallos · distintos',
];
