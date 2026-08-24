/**
 * El dinero: lo que entra, lo que no ha entrado y lo que está a punto de caducar.
 *
 * ══ Las dos capas de dinero de este producto, que NO son la misma ═══════════
 *
 * Y confundirlas es el error fácil, porque las dos se llaman «pagos»:
 *
 *   1. LO QUE TE PAGAN A TI. `team_subscriptions`: el plan y el estado de cada
 *      entrenador. Es tu facturación.
 *
 *   2. LO QUE LE PAGAN A ELLOS. `client_payments`: los cobros que cada
 *      entrenador le pasa a SUS clientes, sincronizados desde Notion o Stripe
 *      (migración 0010). No es dinero tuyo.
 *
 * La segunda no es tu caja, pero es la mejor señal de valor que tiene el
 * producto: un entrenador que cobra a través de esto no se va. Y un impago suyo
 * es un cliente que se le está yendo, o sea una bajada de tu propio uso dentro
 * de un mes.
 *
 * Se cuentan las dos, separadas y con el rótulo delante, para que nunca se sumen
 * por error.
 *
 * ══ Lo que este archivo NO hace ═════════════════════════════════════════════
 *
 * No inventa ingresos recurrentes. `plan_limits` guarda límites, no precios: no
 * hay ni una columna de importe en todo el esquema de suscripciones. Calcular un
 * MRR a partir de precios escritos a mano aquí sería una cifra con aspecto de
 * dato y origen de adivinanza — y las cifras inventadas son las que se acaban
 * repitiendo en una reunión.
 *
 * Lo que sí se puede contar es cuántas cuentas hay en cada plan, y eso se cuenta.
 */

const numero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const dias = (desde, hasta) => {
  const a = Date.parse(String(desde).slice(0, 10));
  const b = Date.parse(String(hasta).slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
};

/**
 * Tu facturación: cuántas cuentas hay en cada plan y en qué estado.
 *
 * Se agrupa por plan Y estado a la vez, no por uno de los dos: «dos en
 * fundador» no dice si están pagando, y «dos activas» no dice de qué plan. La
 * pareja es lo que se mira.
 */
export const porPlan = (cuentas) => {
  const mapa = new Map();
  for (const c of cuentas) {
    const clave = `${c.plan}·${c.estado}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        plan: c.plan,
        /*
          La ETIQUETA además de la clave, por lo mismo que en la hoja de cuentas:
          la clave del plan gratuito sigue llamándose `prueba` por compatibilidad
          con el webhook de Stripe (0056), y enseñarla dice lo contrario de lo
          que el plan hace. Esta sección enseñaba la clave mientras la tabla de
          al lado enseñaba la etiqueta, así que el mismo plan salía con dos
          nombres en la misma pantalla.

          Se guardan las dos: la etiqueta para leer y la clave para poder buscar
          en la base o en el panel de Stripe sin traducir nada.
        */
        planEtiqueta: c.planEtiqueta || c.plan,
        estado: c.estado,
        cuentas: 0,
        nombres: [],
      });
    }
    const e = mapa.get(clave);
    e.cuentas += 1;
    e.nombres.push(c.nombre);
  }
  return [...mapa.values()].sort((a, b) => b.cuentas - a.cuentas);
};

/**
 * Las pruebas que acaban, ordenadas por lo que queda.
 *
 * Es la única lista de toda la herramienta con fecha límite: pasado ese día no
 * se puede hacer nada, y por eso va delante de todo lo demás en el panel.
 */
export const pruebas = (cuentas) =>
  cuentas
    .filter((c) => c.pruebaAcaba && c.estado === 'trialing')
    .sort((a, b) => (a.diasDePrueba ?? 0) - (b.diasDePrueba ?? 0));

/**
 * Los cobros que los entrenadores le pasan a sus clientes.
 *
 * `is_paid` lo decide la integración comparando el estado con los valores que el
 * entrenador marcó como «pagado» en su configuración (0010). Aquí no se
 * reinterpreta: lo que la integración dice que no está pagado, no está pagado.
 */
/**
 * @param {Array} pagos
 * @param {{ hoy?: string, deQuien?: Map<string, string> }} [opciones]
 *   `deQuien` traduce `client_id` en el nombre del ENTRENADOR que lo cobra. Ver
 *   `proximos` abajo: sin eso, la lista más accionable del informe no se puede
 *   accionar.
 */
export const cobros = (pagos = [], { hoy, deQuien = new Map() } = {}) => {
  const pagados = pagos.filter((p) => p.is_paid);
  const pendientes = pagos.filter((p) => !p.is_paid);
  const fallidos = pagos.filter((p) => p.payment_failed);

  const suma = (lista) => Math.round(lista.reduce((t, p) => t + numero(p.amount), 0));

  /*
    Lo que vence en los próximos catorce días: dos semanas es lo que se tarda en
    reaccionar a un impago —avisar, esperar, volver a avisar— así que es la
    ventana en la que todavía sirve de algo mirarlo.

    ── Y DE QUIÉN es cada uno ────────────────────────────────────────────────
    Esta lista salía como «22 días de retraso · 2026-08-01 · 130 EUR» y con eso
    no se puede hacer nada: es el mismo error que `observabilidad.md` §3 cuenta
    del informe entero —«no se le puede escribir un correo a un porcentaje»—
    aplicado a una fila.

    `cuenta` es el ENTRENADOR, no el cliente final. Es deliberado y es la misma
    regla de siempre: el cliente final es la persona de la que esta aplicación
    guarda su peso y sus fotos, y aquí de él no sale ni un nombre. Con quien se
    habla de un impago es con el entrenador, que es quien cobra.

    `etiqueta` es `external_label`, lo que el entrenador escribió en su Notion o
    en su Stripe. No es un nombre: es el rótulo de la fila en SU herramienta, y
    es lo que le permite encontrarla cuando se lo cuentes.
  */
  const proximos = pagos
    .filter((p) => p.period_end && !p.is_paid)
    .map((p) => ({
      ...p,
      faltan: dias(hoy, p.period_end),
      cuenta: deQuien.get(p.client_id) || null,
      etiqueta: p.external_label || null,
    }))
    .filter((p) => p.faltan !== null && p.faltan >= -30 && p.faltan <= 14)
    .sort((a, b) => a.faltan - b.faltan);

  const monedas = [...new Set(pagos.map((p) => p.currency).filter(Boolean))];

  return {
    total: pagos.length,
    pagados: pagados.length,
    pendientes: pendientes.length,
    fallidos: fallidos.length,
    importePagado: suma(pagados),
    importePendiente: suma(pendientes),
    /* Si conviven varias monedas, sumar sería mentir. Se dice y no se suma. */
    moneda: monedas.length === 1 ? monedas[0] : null,
    monedas,
    proximos,
    /* Lo que un entrenador le cobra de media a un cliente. Es la cifra que dice
       cuánto vale para él la herramienta que se lo gestiona. */
    importeMedio: pagos.length > 0 ? Math.round(suma(pagos) / pagos.length) : 0,
  };
};

/**
 * Cuántos clientes finales entran y cuántos salen, por semana.
 *
 * La baja de un cliente final no deja fila propia: lo que hay es
 * `clients.status = 'archived'`, sin fecha de cuándo se archivó. Así que las
 * altas se cuentan por `created_at` y las bajas **solo se pueden dar como total**
 * — y eso se dice en vez de inventar una serie que no existe.
 */
export const movimientoClientes = (clientes = [], { semanas = 8, hoy } = {}) => {
  const lunes = (iso) => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    const d = new Date(t);
    const atras = (d.getUTCDay() + 6) % 7;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - atras))
      .toISOString()
      .slice(0, 10);
  };

  const fin = lunes(hoy);
  if (!fin) return { altas: [], archivados: 0, total: 0 };

  const cubos = new Map();
  for (let i = semanas - 1; i >= 0; i -= 1) {
    const s = new Date(Date.parse(`${fin}T00:00:00Z`) - i * 7 * 86400000).toISOString().slice(0, 10);
    cubos.set(s, 0);
  }

  for (const c of clientes) {
    const s = lunes(c.created_at);
    if (s && cubos.has(s)) cubos.set(s, cubos.get(s) + 1);
  }

  return {
    altas: [...cubos.entries()].map(([semana, altas]) => ({ semana, altas })),
    archivados: clientes.filter((c) => c.status === 'archived').length,
    total: clientes.length,
  };
};

/**
 * Las invitaciones al portal: cuántas se mandan y cuántas se canjean.
 *
 * Es el embudo más corto y más accionable del producto —y el que explica por qué
 * casi nadie tiene portal—: una invitación creada y sin canjear es un correo que
 * no ha abierto nadie, y eso se arregla mandándolo otra vez.
 */
export const invitaciones = (invites = [], { hoy } = {}) => {
  const vivas = invites.filter((i) => !i.claimed_at && !i.revoked_at);
  return {
    creadas: invites.length,
    canjeadas: invites.filter((i) => i.claimed_at).length,
    revocadas: invites.filter((i) => i.revoked_at).length,
    /* Caducadas y sin canjear: el caso que hay que volver a mandar. */
    caducadas: vivas.filter((i) => i.expires_at && Date.parse(i.expires_at) < Date.parse(hoy)).length,
    pendientes: vivas.filter((i) => !i.expires_at || Date.parse(i.expires_at) >= Date.parse(hoy)).length,
  };
};
