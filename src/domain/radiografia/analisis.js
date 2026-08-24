/**
 * Las reglas de la radiografía, sin tocar la red.
 *
 * ══ Por qué está separado del script ════════════════════════════════════════
 *
 * Por la misma razón por la que `src/domain/` no importa React ni Supabase: lo
 * que hay aquí son las reglas —qué cuenta como una cuenta activa, qué es un
 * hito del embudo, qué se considera «medido»— y las reglas son lo que hay que
 * poder probar y discutir.
 *
 * Todo lo de este archivo es una función pura sobre filas ya descargadas. No
 * hay `fetch`, no hay `Date.now()` —el «hoy» se pasa como argumento, que es lo
 * que hace que las pruebas no dependan del día en que se ejecuten— y no hay
 * ningún efecto. `radiografia.mjs` baja los datos y pinta; aquí solo se piensa.
 *
 * ══ La decisión que ordena todo el archivo ══════════════════════════════════
 *
 * **El embudo NO se calcula con eventos.** Se calcula con las tablas de verdad.
 *
 * Parece contraintuitivo teniendo una tabla de instrumentación, y es lo más
 * importante que hay aquí: los eventos solo existen desde que se aplicó la
 * migración 0045, así que un embudo hecho con ellos empieza a contestar dentro
 * de tres meses. Pero «cuántos entrenadores llegaron a dar de alta un cliente»
 * ya está escrito en `clients.created_at` desde el primer día, y «cuántos
 * llegaron a invitarle a su portal» en `clients.client_profile_id`.
 *
 * O sea: el embudo se puede leer HOY, con el histórico completo, y además sin
 * depender de que la instrumentación estuviera bien puesta.
 *
 * A los eventos les queda lo único que no deja rastro en ninguna tabla: qué
 * pantallas se abren y quién sigue apareciendo esta semana. Que es bastante, y
 * es exactamente para lo que se hizo la 0045.
 */

/* ==========================================================================
   Utilidades
   ========================================================================== */

/** El lunes de la semana natural de una fecha, en ISO. Igual que en la app. */
export const semanaDe = (fecha) => {
  const t = Date.parse(fecha);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  /* `getUTCDay()` es 0 el domingo. El lunes es el día 1, así que el domingo hay
     que retroceder seis y no cero — el error clásico de esta función. */
  const desplazamiento = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - desplazamiento))
    .toISOString()
    .slice(0, 10);
};

/** Días entre dos fechas, redondeados hacia abajo. `null` si alguna no vale. */
export const diasEntre = (desde, hasta) => {
  const a = Date.parse(desde);
  const b = Date.parse(hasta);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86400000);
};

const porcentaje = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);

/** Recuento por clave, de mayor a menor. */
const cuentaPor = (filas, clave) => {
  const mapa = new Map();
  for (const fila of filas) {
    const k = clave(fila);
    if (k === null || k === undefined) continue;
    mapa.set(k, (mapa.get(k) || 0) + 1);
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
};

/**
 * La mediana, no la media.
 *
 * En todo lo que mide tiempos de respuesta humanos la media miente: un
 * entrenador que se fue de vacaciones y contestó un check-in a los veinte días
 * desplaza la media de todos los demás. La mediana dice lo que le pasa a la
 * mitad de la gente, que es lo que se quería saber.
 */
export const mediana = (valores) => {
  const xs = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const medio = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[medio] : (xs[medio - 1] + xs[medio]) / 2;
};

/* ==========================================================================
   1 · El embudo de activación
   ========================================================================== */

/**
 * Cuántas cuentas llegan a cada hito, y cuántas se quedan por el camino.
 *
 * ── Por qué la unidad es la CUENTA y no la persona ──────────────────────────
 * Un equipo de cuatro entrenadores es un cliente que paga, no cuatro. Contar
 * personas haría que un solo equipo grande pareciera cuatro activaciones y
 * escondería que solo se ha convencido a una empresa.
 *
 * ── Por qué los hitos son éstos ─────────────────────────────────────────────
 * Cada uno es un momento en el que el producto pasa a existir un poco más para
 * quien lo usa, y el salto que más gente pierde es dónde hay que trabajar:
 *
 *   1. equipo         se registró. El denominador.
 *   2. primer cliente dejó de mirar y metió a alguien de verdad.
 *   3. programa       le programó algo. Aquí ya ha hecho trabajo que perdería
 *                     si se va, que es el primer día en que el producto retiene.
 *   4. portal         le dio acceso a su cliente. `monetizacion.md` §4.1 supone
 *                     que el abandono está justo aquí, y esto lo confirma o lo
 *                     desmiente sin discutir.
 *   5. revisión       cerró el círculo: el cliente entregó y él contestó. A
 *                     partir de aquí el producto ya está funcionando solo.
 */
export const embudo = ({ equipos = [], clientes = [], programas = [], checkins = [] } = {}) => {
  const conCliente = new Set(clientes.map((c) => c.team_id).filter(Boolean));

  /* Un programa cuenta cuando tiene al menos un microciclo. La fila existe desde
     que se abre la pantalla, así que contar filas contaría intenciones. */
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));
  const equipoDe = (clientId) => clientePorId.get(clientId)?.team_id || null;

  const conPrograma = new Set(
    programas
      .filter((p) => Array.isArray(p.microcycles) && p.microcycles.length > 0)
      .map((p) => equipoDe(p.client_id))
      .filter(Boolean)
  );

  const conPortal = new Set(
    clientes.filter((c) => c.client_profile_id).map((c) => c.team_id).filter(Boolean)
  );

  const conRevision = new Set(
    checkins
      .filter((c) => c.reviewed_at)
      .map((c) => equipoDe(c.client_id))
      .filter(Boolean)
  );

  const total = equipos.length;
  const pasos = [
    { hito: 'Se registró', cuentas: total },
    { hito: 'Dio de alta un cliente', cuentas: conCliente.size },
    { hito: 'Le programó algo', cuentas: conPrograma.size },
    { hito: 'Le dio acceso al portal', cuentas: conPortal.size },
    { hito: 'Revisó un check-in', cuentas: conRevision.size },
  ];

  return pasos.map((paso, i) => ({
    ...paso,
    pct: porcentaje(paso.cuentas, total),
    /* La caída respecto al paso ANTERIOR, que es la cifra que señala dónde
       trabajar. El porcentaje sobre el total esconde eso: un 20 % final puede
       ser una fuga enorme en el paso 2 o cuatro fugas repartidas. */
    caida: i === 0 ? 0 : pasos[i - 1].cuentas - paso.cuentas,
  }));
};

/* ==========================================================================
   2 · Actividad semanal
   ========================================================================== */

/**
 * Cuántas cuentas distintas dieron señales de vida cada semana.
 *
 * Esto sí sale de los eventos, porque «entró y trabajó» no deja rastro en
 * ninguna tabla: alguien puede pasarse una hora revisando el progreso de sus
 * clientes sin escribir una sola fila.
 *
 * `desde` acota la ventana. Sin él, las primeras semanas —cuando la
 * instrumentación aún no estaba puesta en todas partes— saldrían como una caída
 * que nunca ocurrió.
 */
export const actividadSemanal = (eventos = [], { semanas = 12, hoy } = {}) => {
  const finSemana = semanaDe(hoy);
  if (!finSemana) return [];

  const inicio = new Date(Date.parse(`${finSemana}T00:00:00Z`) - (semanas - 1) * 7 * 86400000)
    .toISOString()
    .slice(0, 10);

  const porSemana = new Map();
  for (let i = 0; i < semanas; i += 1) {
    const semana = new Date(Date.parse(`${inicio}T00:00:00Z`) + i * 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    porSemana.set(semana, new Set());
  }

  for (const ev of eventos) {
    const semana = semanaDe(ev.at);
    if (!semana || !porSemana.has(semana)) continue;
    /* La cuenta, no la persona: dos entrenadores del mismo equipo trabajando la
       misma semana son una cuenta activa. Sin equipo —un entrenador suelto que
       aún no tiene el suyo— cuenta como sí mismo. */
    porSemana.get(semana).add(ev.team_id || ev.actor);
  }

  return [...porSemana.entries()].map(([semana, cuentas]) => ({
    semana,
    cuentas: cuentas.size,
  }));
};

/**
 * ¿Vuelve alguien a la semana siguiente?
 *
 * De todas las cuentas activas en la semana N, qué proporción sigue activa en la
 * N+1. Es la pregunta que decide si esto es un producto o una demo: sin
 * retención, cada venta hay que volver a hacerla.
 */
export const retencionSemanaSiguiente = (eventos = [], { semanas = 12 } = {}) => {
  const porSemana = new Map();
  for (const ev of eventos) {
    const semana = semanaDe(ev.at);
    if (!semana) continue;
    if (!porSemana.has(semana)) porSemana.set(semana, new Set());
    porSemana.get(semana).add(ev.team_id || ev.actor);
  }

  const ordenadas = [...porSemana.keys()].sort();
  const ventana = ordenadas.slice(-semanas);

  return ventana
    .map((semana, i) => {
      const siguiente = ventana[i + 1];
      if (!siguiente) return null;

      const antes = porSemana.get(semana);
      const despues = porSemana.get(siguiente);
      const vuelven = [...antes].filter((c) => despues.has(c)).length;

      return { semana, activas: antes.size, vuelven, pct: porcentaje(vuelven, antes.size) };
    })
    .filter(Boolean);
};

/* ==========================================================================
   3 · Qué se usa
   ========================================================================== */

/** Cada evento, cuántas veces y en cuántas cuentas distintas. */
export const porEvento = (eventos = []) => {
  const mapa = new Map();
  for (const ev of eventos) {
    if (!mapa.has(ev.name)) mapa.set(ev.name, { veces: 0, cuentas: new Set() });
    const entrada = mapa.get(ev.name);
    entrada.veces += 1;
    entrada.cuentas.add(ev.team_id || ev.actor);
  }

  return [...mapa.entries()]
    .map(([nombre, e]) => ({ nombre, veces: e.veces, cuentas: e.cuentas.size }))
    .sort((a, b) => b.veces - a.veces);
};

/**
 * Qué pantallas se abren, y **cuáles no las abre nadie**.
 *
 * La segunda mitad es la que importa y la que ninguna herramienta enseña por su
 * cuenta: una lista de lo más usado no dice nada de lo que sobra. Por eso hace
 * falta pasarle el catálogo de pantallas que EXISTEN — las que no aparecen en
 * los eventos son las candidatas a retirar.
 */
export const porPantalla = (eventos = [], catalogo = []) => {
  const vistas = eventos.filter((e) => e.name === 'pantalla_vista');

  const mapa = new Map();
  for (const ev of vistas) {
    const pantalla = ev.props?.pantalla;
    if (!pantalla) continue;
    if (!mapa.has(pantalla)) mapa.set(pantalla, { veces: 0, cuentas: new Set() });
    const entrada = mapa.get(pantalla);
    entrada.veces += 1;
    entrada.cuentas.add(ev.team_id || ev.actor);
  }

  const usadas = [...mapa.entries()]
    .map(([nombre, e]) => ({ nombre, veces: e.veces, cuentas: e.cuentas.size }))
    .sort((a, b) => b.veces - a.veces);

  return {
    usadas,
    /* «Nadie la ha abierto en la ventana medida» no es lo mismo que «sobra»,
       pero es la única lista corta donde puede estar lo que sobra. */
    sinUso: catalogo.filter((p) => !mapa.has(p)).sort(),
  };
};

/* ==========================================================================
   4 · Qué se rompe
   ========================================================================== */

/**
 * Los fallos agrupados por lo que de verdad los identifica.
 *
 * Se ordenan por CUENTAS afectadas y no por número de veces, y esa es toda la
 * gracia: un fallo que le ocurre doscientas veces a una persona es un caso raro
 * suyo; uno que le ocurre una vez a seis personas es un error del producto. Con
 * el orden por veces, el segundo no aparece nunca en la primera pantalla.
 */
export const fallosAgrupados = (fallos = []) => {
  const mapa = new Map();

  for (const f of fallos) {
    const clave = `${f.source}|${f.ruta}|${f.code || '—'}|${f.message}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        source: f.source,
        ruta: f.ruta,
        code: f.code || null,
        message: f.message,
        veces: 0,
        cuentas: new Set(),
        roles: new Set(),
        ultimo: f.at,
      });
    }
    const e = mapa.get(clave);
    e.veces += f.veces || 1;
    e.cuentas.add(f.team_id || f.actor);
    e.roles.add(f.rol);
    if (String(f.at) > String(e.ultimo)) e.ultimo = f.at;
  }

  return [...mapa.values()]
    .map((e) => ({ ...e, cuentas: e.cuentas.size, roles: [...e.roles].sort().join(', ') }))
    .sort((a, b) => b.cuentas - a.cuentas || b.veces - a.veces);
};

/** Fallos por día, para ver de un vistazo si algo empezó a pasar y cuándo. */
export const fallosPorDia = (fallos = []) =>
  cuentaPor(fallos, (f) => String(f.at).slice(0, 10))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dia, veces]) => ({ dia, veces }));

/* ==========================================================================
   5 · El censo: qué información se rellena de verdad
   ========================================================================== */

/*
  ══ Por qué esto no son eventos ════════════════════════════════════════════

  La pregunta «¿qué información le sirve al entrenador?» no la contesta la
  instrumentación y no la puede contestar: `product_events` no lleva `client_id`
  a propósito, así que nunca sabrá qué campos se rellenan.

  La contesta CONTAR lo que ya está guardado. Y tiene tres ventajas sobre
  cualquier evento:

    · Contesta HOY, sobre todo el histórico, sin esperar a acumular nada.
    · No hay que instrumentar ni una línea, así que no se puede instrumentar mal.
    · No describe a nadie: lo que sale son porcentajes sobre el conjunto.

  Lo que responde, en concreto: qué campos del formulario de antropometría no ha
  rellenado nunca nadie. Eso es una decisión de producto —quitar campos— que hoy
  se tomaría por intuición.
*/

/** Las claves de un objeto anidado que tienen un número dentro. */
const clavesConValor = (obj) =>
  Object.entries(obj || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)))
    .map(([k]) => k);

/**
 * Cuántas veces se ha rellenado cada campo de un grupo de medidas.
 *
 * `etiquetas` es la lista de campos que la aplicación OFRECE, y hace falta
 * pasarla: sin ella, un campo que no ha rellenado nadie nunca no aparecería en
 * el resultado —y es exactamente el que se está buscando—.
 */
export const usoDeCampos = (registros, extrae, etiquetas) => {
  const cuenta = Object.fromEntries(etiquetas.map((k) => [k, 0]));
  let conAlguno = 0;

  for (const registro of registros) {
    const claves = clavesConValor(extrae(registro));
    if (claves.length > 0) conAlguno += 1;
    for (const clave of claves) {
      if (clave in cuenta) cuenta[clave] += 1;
    }
  }

  return {
    total: registros.length,
    conAlguno,
    campos: etiquetas
      .map((campo) => ({ campo, veces: cuenta[campo], pct: porcentaje(cuenta[campo], registros.length) }))
      .sort((a, b) => b.veces - a.veces),
  };
};

/**
 * El censo completo.
 *
 * Cada cifra de aquí está pensada para contestar una pregunta que hoy se
 * contesta a ojo. Las que más rinden, y por qué:
 *
 *   · `portal.pct` — cuántos clientes tienen acceso de verdad a su portal. Media
 *     aplicación es el portal; si esta cifra es baja, media aplicación no la usa
 *     nadie y no es porque esté mal hecha.
 *   · `pliegues.campos` — qué se mide y qué no. La lista de campos a quitar.
 *   · `revision.horasMediana` — cuánto tarda un entrenador en contestar un
 *     check-in. Es la promesa del producto, medida.
 */
export const censo = ({
  clientes = [],
  antropometria = [],
  nutricion = [],
  programas = [],
  checkins = [],
  fotos = [],
  etiquetas = {},
  hoy,
} = {}) => {
  const activos = clientes.filter((c) => c.status !== 'archived');
  const total = clientes.length;

  /* Todos los registros de peso de todo el mundo, aplanados: la unidad del censo
     de medidas es el REGISTRO, no el cliente. «El 4 % de las revisiones incluye
     el pliegue de pantorrilla» es la cifra que decide si el campo se queda. */
  const registros = antropometria.flatMap((a) => (Array.isArray(a.history) ? a.history : []));

  const revisados = checkins.filter((c) => c.submitted_at && c.reviewed_at);
  const horasHastaRevisar = revisados
    .map((c) => (Date.parse(c.reviewed_at) - Date.parse(c.submitted_at)) / 3600000)
    .filter((h) => Number.isFinite(h) && h >= 0);

  const conMicrociclos = programas.filter(
    (p) => Array.isArray(p.microcycles) && p.microcycles.length > 0
  );

  return {
    clientes: {
      total,
      activos: activos.length,
      archivados: total - activos.length,
      /* Sin `gender` no se puede calcular el % graso: la fórmula de pliegues es
         distinta para hombres y mujeres (`domain/anthropometry.js`). Un cliente
         sin este campo tiene los pliegues medidos y el resultado no. */
      conSexo: porcentaje(clientes.filter((c) => c.gender).length, total),
      conFechaInicio: porcentaje(clientes.filter((c) => c.start_date).length, total),
      portal: {
        cuantos: clientes.filter((c) => c.client_profile_id).length,
        pct: porcentaje(clientes.filter((c) => c.client_profile_id).length, total),
      },
    },

    antropometria: {
      clientesConAlguno: porcentaje(
        antropometria.filter((a) => (a.history || []).length > 0).length,
        total
      ),
      registros: registros.length,
      registrosPorCliente: total > 0 ? Math.round((registros.length / total) * 10) / 10 : 0,
      pliegues: usoDeCampos(registros, (r) => r.skinFolds, etiquetas.pliegues || []),
      perimetros: usoDeCampos(registros, (r) => r.perimeters, etiquetas.perimetros || []),
    },

    nutricion: {
      clientesConPlan: porcentaje(nutricion.length, total),
      conObjetivo: porcentaje(nutricion.filter((n) => n.target_kcals).length, nutricion.length),
      conVariantes: porcentaje(nutricion.filter((n) => n.has_day_variants).length, nutricion.length),
      conPasos: porcentaje(nutricion.filter((n) => n.steps_goal).length, nutricion.length),
      conHabitos: porcentaje(
        nutricion.filter((n) => (n.habits_notes || []).length > 0).length,
        nutricion.length
      ),
    },

    programas: {
      clientesConPrograma: porcentaje(conMicrociclos.length, total),
      microciclosMediana: mediana(conMicrociclos.map((p) => p.microcycles.length)),
      sesiones: conMicrociclos.reduce(
        (suma, p) => suma + p.microcycles.reduce((s, m) => s + (m.sessions || []).length, 0),
        0
      ),
      conCalentamiento: porcentaje(
        programas.filter((p) => (p.mobility_drills || []).length > 0).length,
        programas.length
      ),
      conNotas: porcentaje(programas.filter((p) => p.notes).length, programas.length),
    },

    revision: {
      total: checkins.length,
      entregados: checkins.filter((c) => c.submitted_at).length,
      revisados: revisados.length,
      pctRevisados: porcentaje(revisados.length, checkins.filter((c) => c.submitted_at).length),
      horasMediana: mediana(horasHastaRevisar),
      /* Los que llevan más de una semana entregados y sin contestar. Es la deuda
         del entrenador con sus clientes, y la razón más común de que uno se
         vaya. */
      sinContestar: checkins.filter(
        (c) => c.submitted_at && !c.reviewed_at && (diasEntre(c.submitted_at, hoy) ?? 0) > 7
      ).length,
    },

    fotos: {
      total: fotos.length,
      clientesConAlguna: porcentaje(new Set(fotos.map((f) => f.client_id)).size, total),
    },
  };
};

/* ==========================================================================
   6 · La instantánea: qué comparar con la semana pasada
   ========================================================================== */

/*
  ══ Por qué esto existe ════════════════════════════════════════════════════

  Porque un informe suelto dice cómo están las cosas, y lo que hace falta para
  decidir es **qué ha cambiado**. «El 13 % de los clientes tiene acceso al
  portal» es un dato; «el 13 %, y hace un mes era el 30 %» es un problema.

  Y en seguridad es todavía más claro: la lista nunca va a estar vacía —hay
  decisiones deliberadas que salen siempre— así que lo único accionable es la
  línea nueva.

  Se guarda un puñado de números y no el informe entero: comparar dos informes
  completos obligaría a decidir qué diferencias importan cada vez, y casi
  ninguna importa. Estas son las que sí.
*/

/** Un número por cosa que merece vigilarse en el tiempo. */
export const instantanea = ({
  seguridad = [],
  embudo: pasos = [],
  censo: elCenso = null,
  actividad = [],
  fallos = [],
  volumen = [],
} = {}) => {
  const foto = {
    'seguridad · críticos': seguridad.filter((h) => h.nivel === 'critico').length,
    'seguridad · avisos': seguridad.filter((h) => h.nivel === 'aviso').length,
    'actividad · cuentas esta semana': actividad.at(-1)?.cuentas ?? 0,
    'fallos · distintos': fallos.length,
  };

  for (const paso of pasos) foto[`embudo · ${paso.hito.toLowerCase()}`] = paso.cuentas;

  if (elCenso) {
    foto['clientes · total'] = elCenso.clientes.total;
    foto['clientes · con portal (%)'] = elCenso.clientes.portal.pct;
    foto['clientes · con sexo (%)'] = elCenso.clientes.conSexo;
    foto['programas · clientes con programa (%)'] = elCenso.programas.clientesConPrograma;
    foto['revisión · entregados sin contestar +7d'] = elCenso.revision.sinContestar;
    foto['antropometría · registros'] = elCenso.antropometria.registros;
  }

  /* La señal de `auditoria.md` §1.4, en kilobytes para que el número se lea.
     Es la única de la lista que mide si el modelo de datos aguanta. */
  const programas = volumen.find((v) => v.tabla === 'workout_data');
  if (programas && programas.filas > 0) {
    foto['workout_data · KB por fila'] = Math.round(programas.bytes / programas.filas / 1024);
  }

  return foto;
};

/**
 * Qué ha cambiado, y en qué dirección.
 *
 * `mejor` NO se deduce del signo: que suban los clientes es bueno y que suban
 * los críticos es malo. Sin eso, la interfaz pintaría de verde el número de
 * fallos cuando crece, que es la clase de detalle que hace que un panel deje de
 * merecer confianza.
 */
export const comparar = (antes = {}, ahora = {}) => {
  /* Lo que es mejor cuando BAJA. Todo lo demás es mejor cuando sube. */
  const mejorSiBaja = /crítico|aviso|fallo|sin contestar|KB por fila/i;

  return Object.entries(ahora)
    .map(([clave, valor]) => {
      const previo = antes[clave];
      if (!Number.isFinite(previo) || previo === valor) return null;

      const delta = Math.round((valor - previo) * 10) / 10;
      return {
        clave,
        antes: previo,
        ahora: valor,
        delta,
        mejor: mejorSiBaja.test(clave) ? delta < 0 : delta > 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
};

/* ==========================================================================
   7 · Negocio
   ========================================================================== */

/**
 * Quién paga, quién está de prueba y quién dejó de pagar — cruzado con si usan
 * el producto.
 *
 * El cruce es lo único que aporta algo aquí: los estados de suscripción ya se
 * ven en Stripe. Lo que Stripe no puede decir es **si las cuentas que pagan usan
 * esto más que las que no**, y esa es la que decide si el precio está en el
 * sitio o si se está cobrando por algo que no se usa.
 */
export const negocio = ({ equipos = [], suscripciones = [], eventos = [], hoy } = {}) => {
  const desde = new Date(Date.parse(`${semanaDe(hoy)}T00:00:00Z`) - 27 * 86400000)
    .toISOString()
    .slice(0, 10);

  const activasRecientes = new Set(
    eventos.filter((e) => String(e.at).slice(0, 10) >= desde).map((e) => e.team_id).filter(Boolean)
  );

  const porEquipo = new Map(suscripciones.map((s) => [s.team_id, s]));

  const estados = new Map();
  for (const equipo of equipos) {
    const sus = porEquipo.get(equipo.id);
    const estado = sus?.status || 'sin suscripción';
    if (!estados.has(estado)) estados.set(estado, { estado, cuentas: 0, activas: 0, plan: new Set() });
    const e = estados.get(estado);
    e.cuentas += 1;
    if (activasRecientes.has(equipo.id)) e.activas += 1;
    if (sus?.plan) e.plan.add(sus.plan);
  }

  return [...estados.values()]
    .map((e) => ({
      ...e,
      plan: [...e.plan].sort().join(', ') || '—',
      pctActivas: porcentaje(e.activas, e.cuentas),
    }))
    .sort((a, b) => b.cuentas - a.cuentas);
};
