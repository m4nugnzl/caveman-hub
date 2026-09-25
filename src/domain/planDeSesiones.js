/**
 * EL PLAN DE LAS SESIONES: qué día toca cada una y qué pasa al atrasarlas.
 *
 * ══ Dos fechas por sesión (23 sep 2026) ════════════════════════════════════
 *
 * Cada sesión del microciclo —una hoja en una de sus apariciones— tiene:
 *
 *   · La fecha REAL: la de la sesión registrada. Existe desde la primera serie
 *     y sus reglas están en `fechaDeLaSesion.js` (0135).
 *   · La fecha PLANIFICADA: la que le da el patrón del bloque desde la fecha del
 *     microciclo —el lunes es el lunes de esa semana; el D3, el tercer día de la
 *     vuelta—, salvo que el cliente la haya atrasado. Solo lo atrasado se guarda
 *     (`session_plans`, 0138); lo demás se calcula aquí.
 *
 * El estado no se guarda nunca, se deriva: HECHA (tiene al menos una serie),
 * PLANIFICADA (su día no ha pasado), PENDIENTE (su día pasó sin hacerla) o SIN
 * PLANIFICAR (no hay día que darle). «Pendiente» es neutro: no es un fallo.
 *
 * El plan por defecto solo se da al microciclo en curso y al siguiente, si ya
 * está escrito: más allá, el entrenador aún no ha dicho nada.
 *
 * ══ Lo único que puede hacer el cliente: ATRASAR ════════════════════════════
 *
 * Desde un día de hoy en adelante que tiene una sesión sin hacer, corre esa y
 * todas las siguientes sin hacer N días. El patrón lo define el entrenador; el
 * cliente no lo rediseña, solo lo retrasa, y su entrenador se entera (la fila
 * de `session_delays` es el aviso). Las sesiones siguen siendo de su casilla y
 * de su microciclo: solo cambia la fecha planificada.
 */

import { microcicloDeLaSemana, resolvedMicrocycles } from './blocks';
import { planDays } from './nutrition';
import { allSessions, sessionSetCount } from './sessions';
import { addDays, toISODate } from '@/lib/dates';
import { aparicionesDelMicrociclo } from '@/components/Client/hoy';

/**
 * LA DIETA SIGUE AL PLAN.
 *
 * Con `true`, el día de entreno o de descanso de la dieta lo decide la fecha de
 * las sesiones: la real en los días pasados, la planificada de hoy en adelante.
 * Si el cliente atrasa, su día de dieta alta se va con la sesión.
 *
 * Con `false`, la dieta sigue a la casilla del ciclo, como antes del 23 sep.
 */
export const LA_DIETA_SIGUE_AL_PLAN = true;

/** Hoy en el reloj del aparato: el calendario es el de quien lo mira. */
export const hoyLocal = (ahora = new Date()) =>
  `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;

const claveDe = (weekNumber, hoja, vez) => `${weekNumber}|${hoja}|${vez}`;

/** Lunes = 0. */
const diaDeLaSemana = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/**
 * El microciclo en curso y el siguiente, si está escrito.
 *
 * En curso es el último que ya ha empezado; si ninguno ha empezado todavía, el
 * primero. No es «el último de la lista»: el entrenador puede tener escrito el
 * de la semana que viene.
 */
export const microciclosDelPlan = (micros = [], hoy) => {
  const ordenados = [...micros].sort((a, b) => a.weekNumber - b.weekNumber);
  if (ordenados.length === 0) return { actual: null, siguiente: null };
  let i = -1;
  ordenados.forEach((m, j) => {
    const desde = toISODate(m.date);
    if (desde && desde <= hoy) i = j;
  });
  if (i < 0) i = 0;
  return { actual: ordenados[i], siguiente: ordenados[i + 1] || null };
};

/**
 * El día que el patrón le da a la casilla `indice` de un microciclo que empieza
 * en `desde`. Semanal: ese día de la semana, dentro de sus siete días. Rotativo:
 * `desde` más la posición, descansos incluidos.
 */
export const fechaDeLaCasilla = (microciclo, indice, desde) => {
  const inicio = toISODate(desde);
  if (!inicio || indice === null || indice === undefined || indice < 0) return null;
  if (microciclo?.tipo === 'rotativo') return addDays(inicio, indice);
  return addDays(inicio, (indice - diaDeLaSemana(inicio) + 7) % 7);
};

/** La posición en la secuencia de la `vez`-ésima aparición de la hoja. */
const indiceDeLaAparicion = (microciclo, hoja, vez) => {
  let visto = -1;
  const dias = microciclo?.dias || [];
  for (let i = 0; i < dias.length; i += 1) {
    if (dias[i].descanso || dias[i].hoja !== hoja) continue;
    visto += 1;
    if (visto === vez) return i;
  }
  return null;
};

const estadoDe = ({ hecha, fechaPlan }, hoy) => {
  if (hecha) return 'hecha';
  if (!fechaPlan) return 'sin_planificar';
  return fechaPlan < hoy ? 'pendiente' : 'planificada';
};

/**
 * LAS SESIONES DEL PLAN: cada aparición del microciclo en curso y del siguiente.
 *
 * @param program El programa del cliente (`workoutData[id]`).
 * @param client  Su ficha: el rotativo sin secuencia guardada se deriva de ella.
 * @param plans   Las filas de `session_plans` de este cliente.
 * @returns `[{ clave, weekNumber, hoja, vez, cuando, actual, hecha, session,
 *   fechaReal, fechaPorDefecto, fechaGuardada, fechaPlan, fecha, estado }]`.
 *   `fecha` es la que cuenta: la real si está hecha, la planificada si no.
 */
export const sesionesDelPlan = ({ program, client = null, plans = [], hoy }) => {
  const micros = program ? resolvedMicrocycles(program) : [];
  const { actual, siguiente } = microciclosDelPlan(micros, hoy);
  const guardadas = new Map(
    (plans || []).map((p) => [claveDe(p.week_number ?? p.weekNumber, p.hoja, p.vez ?? 0), toISODate(p.planned_date ?? p.plannedDate)])
  );

  return [actual, siguiente].filter(Boolean).flatMap((micro) => {
    const microciclo = microcicloDeLaSemana(program, micro.weekNumber, client);
    return aparicionesDelMicrociclo(micro, microciclo)
      .filter((a) => a.series > 0 || a.session)
      .map((a) => {
        const hecha = Boolean(a.session) && sessionSetCount(a.session) > 0;
        const fechaPorDefecto = fechaDeLaCasilla(microciclo, indiceDeLaAparicion(microciclo, a.dayName, a.vez), micro.date);
        const fechaGuardada = guardadas.get(claveDe(micro.weekNumber, a.dayName, a.vez)) || null;
        const fechaPlan = fechaGuardada || fechaPorDefecto;
        const fechaReal = hecha ? toISODate(a.session.date) : null;
        const item = {
          clave: claveDe(micro.weekNumber, a.dayName, a.vez),
          weekNumber: micro.weekNumber,
          hoja: a.dayName,
          vez: a.vez,
          cuando: a.cuando,
          actual: micro === actual,
          hecha,
          session: a.session,
          fechaReal,
          fechaPorDefecto,
          fechaGuardada,
          fechaPlan,
        };
        return { ...item, fecha: hecha ? fechaReal : fechaPlan, estado: estadoDe(item, hoy) };
      });
  });
};

/**
 * «3 de 5 hechas · 2 por hacer», solo del microciclo en curso. Sin porcentajes
 * ni gráficas: es un recuento. Las que no tienen día no salen en ninguna
 * casilla, así que se cuentan aparte («1 sin día»): si no, el calendario dice
 * que falta algo y no enseña dónde.
 */
export const resumenDelMicrociclo = (items = []) => {
  const suyas = items.filter((i) => i.actual);
  if (suyas.length === 0) return null;
  const hechas = suyas.filter((i) => i.hecha).length;
  const sinDia = suyas.filter((i) => i.estado === 'sin_planificar').length;
  const conDia = suyas.length - hechas - sinDia;
  return {
    weekNumber: suyas[0].weekNumber,
    hechas,
    total: suyas.length,
    texto: [
      `${hechas} de ${suyas.length} hechas`,
      conDia > 0 ? `${conDia} por hacer` : null,
      sinDia > 0 ? `${sinDia} sin día` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  };
};

/**
 * Las sesiones del microciclo en curso que no caen en ningún día: las hojas en
 * «Sin día», o todas si el bloque no tiene días asignados. No tienen casilla en
 * el calendario, así que la hoja de cada día las ofrece aparte.
 */
export const sesionesSinDia = (items = []) =>
  items
    .filter((i) => i.actual && i.estado === 'sin_planificar')
    .map((i) => ({
      clave: i.clave,
      hoja: i.hoja,
      vez: i.vez,
      cuando: i.cuando,
      estado: i.estado,
      weekNumber: i.weekNumber,
      sessionId: i.session?.id || null,
      item: i,
    }));

/**
 * LO QUE PINTA EL CALENDARIO, día a día.
 *
 * Lo hecho sale de TODO el historial, por su fecha real, para que los meses
 * pasados también se lean. Lo que falta, del plan.
 *
 * @returns `Map<fecha, [{ clave, hoja, vez, cuando, estado, weekNumber, sessionId, item }]>`.
 */
export const diasDelCalendario = ({ items = [], micros = [] }) => {
  const dias = new Map();
  const poner = (fecha, sesion) => {
    if (!fecha) return;
    if (!dias.has(fecha)) dias.set(fecha, []);
    dias.get(fecha).push(sesion);
  };

  const delPlan = new Set();
  for (const item of items) {
    if (item.session?.id) delPlan.add(item.session.id);
    poner(item.fecha, {
      clave: item.clave,
      hoja: item.hoja,
      vez: item.vez,
      cuando: item.cuando,
      estado: item.estado,
      weekNumber: item.weekNumber,
      sessionId: item.session?.id || null,
      item,
    });
  }
  for (const micro of micros) {
    for (const s of allSessions([micro])) {
      if (delPlan.has(s.id) || sessionSetCount(s) === 0) continue;
      poner(toISODate(s.date), {
        clave: `s:${s.id}`,
        hoja: s.dayName,
        vez: null,
        cuando: null,
        estado: 'hecha',
        weekNumber: micro.weekNumber,
        sessionId: s.id,
        item: null,
      });
    }
  }
  return dias;
};

/** El estado que resume un día en su marca: lo que falta pesa más que lo hecho. */
export const marcaDelDia = (sesiones = []) => {
  if (sesiones.length === 0) return null;
  if (sesiones.some((s) => s.estado === 'planificada')) return 'planificada';
  if (sesiones.some((s) => s.estado === 'pendiente')) return 'pendiente';
  return 'hecha';
};

/** Dónde empieza cada microciclo: el calendario lo marca en su semana. */
export const iniciosDeMicrociclo = (micros = []) =>
  new Map(
    micros
      .map((m) => [toISODate(m.date), m.weekNumber])
      .filter(([fecha]) => fecha)
  );

/* ── Atrasar ───────────────────────────────────────────────────────────────── */

export const MAX_DIAS_DE_ATRASO = 60;

/** ¿Se puede atrasar desde ese día? Hoy o después, y con algo sin hacer. */
export const puedeAtrasarDesde = (items = [], dia, hoy) =>
  Boolean(dia) && dia >= hoy && items.some((i) => !i.hecha && i.fechaPlan === dia);

/**
 * Lo que mueve un atraso: la sesión de ese día y todas las siguientes sin
 * hacer, las del microciclo siguiente incluidas, `dias` días hacia delante.
 *
 * @returns `{ ok: true, movidas: [{ semana, hoja, vez, antes, despues }] }` o
 *   `{ ok: false, motivo }`.
 */
export const movidasDeAtrasar = (items = [], desde, dias, hoy) => {
  const n = Number(dias);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DIAS_DE_ATRASO) {
    return { ok: false, motivo: `Se puede atrasar entre 1 y ${MAX_DIAS_DE_ATRASO} días.` };
  }
  if (!puedeAtrasarDesde(items, desde, hoy)) {
    return { ok: false, motivo: 'Ese día no tiene ninguna sesión por hacer que se pueda atrasar.' };
  }
  const movidas = items
    .filter((i) => !i.hecha && i.fechaPlan && i.fechaPlan >= desde)
    .sort((a, b) => a.fechaPlan.localeCompare(b.fechaPlan))
    .map((i) => ({ semana: i.weekNumber, hoja: i.hoja, vez: i.vez, antes: i.fechaPlan, despues: addDays(i.fechaPlan, n) }));
  return { ok: true, movidas };
};

/** Las filas de `session_plans` con las movidas puestas: lo que se ve sin esperar a la red. */
export const planesConMovidas = (plans = [], clientId, movidas = []) => {
  const nuevas = new Map((plans || []).map((p) => [claveDe(p.week_number, p.hoja, p.vez), p]));
  for (const m of movidas) {
    nuevas.set(claveDe(m.semana, m.hoja, m.vez), {
      client_id: clientId,
      week_number: m.semana,
      hoja: m.hoja,
      vez: m.vez,
      planned_date: m.despues,
    });
  }
  return [...nuevas.values()];
};

/**
 * «TU ENTRENO DE HOY», CON LO ATRASADO.
 *
 * La portada lee hoy del reparto semanal (`sesionDeHoy`). Si el cliente ha
 * atrasado la sesión de hoy, ofrecérsela sería contradecir a su calendario; y
 * si una atrasada cae hoy, es la de hoy aunque el reparto diga descanso.
 *
 * @param hoy   Lo que dice el reparto: `{ descanso }`, una entrada o `null`.
 * @returns Lo mismo, corregido: la atrasada con `{ name, day, planned, logged,
 *   weekNumber, vez }`, `{ descanso: true }` si la de hoy se fue, o `hoy`.
 */
export const hoySegunElPlan = (hoy, items = [], micros = [], fecha) => {
  const llega = items.find((i) => !i.hecha && i.fechaGuardada && i.fechaPlan === fecha);
  if (llega) {
    const day = micros.find((m) => m.weekNumber === llega.weekNumber)?.days?.find((d) => d.dayName === llega.hoja) || null;
    return {
      name: llega.hoja,
      day,
      planned: (day?.exercises || []).reduce((n, ex) => n + (ex.sets?.length || 0), 0),
      logged: 0,
      weekNumber: llega.weekNumber,
      vez: llega.vez,
    };
  }
  const seFue = items.some(
    (i) => !i.hecha && i.fechaGuardada && i.fechaPorDefecto === fecha && i.fechaPlan !== fecha && i.hoja === hoy?.name
  );
  return seFue && hoy && !hoy.descanso ? { descanso: true } : hoy;
};

/* ── La dieta ─────────────────────────────────────────────────────────────── */

/**
 * ¿Ese día se entrena? Los días pasados, si se entrenó (fecha real); de hoy en
 * adelante, si hay una sesión hecha o planificada ese día.
 *
 * @returns `true`, `false`, o `null` si el plan no llega a ese día y hay que
 *   seguir preguntándole a la casilla.
 */
export const entrenaElDia = (fecha, { items = [], micros = [], hoy }) => {
  const hechas = new Set(
    allSessions(micros)
      .filter((s) => sessionSetCount(s) > 0)
      .map((s) => toISODate(s.date))
  );
  if (hechas.has(fecha)) return true;
  if (fecha < hoy) return micros.length > 0 ? false : null;
  const fechas = items.map((i) => i.fecha).filter(Boolean);
  if (fechas.length === 0) return null;
  if (items.some((i) => !i.hecha && i.fechaPlan === fecha)) return true;
  const ultima = [...fechas].sort().at(-1);
  return fecha <= ultima ? false : null;
};

/**
 * La casilla con la que se busca la dieta de un día, siguiendo al plan.
 *
 * Si la casilla del ciclo ya es de la clase que toca (entreno o descanso), se
 * queda: conserva el reparto del entrenador tal cual. Si no, se usa la dieta
 * que el reparto da más veces a esa clase de día —la alta de los de entreno, la
 * baja de los de descanso—. Sin nada que la decida, la casilla de siempre.
 */
export const casillaParaLaDieta = (nutrition, slots = [], casilla, entrena) => {
  if (!LA_DIETA_SIGUE_AL_PLAN || entrena === null || entrena === undefined) return casilla;
  const propia = slots.find((s) => s.key === casilla);
  if (propia && propia.rest === !entrena) return casilla;

  const existe = new Set(planDays(nutrition).map((d) => d.id));
  const semana = nutrition?.week || {};
  const deSuClase = slots.filter((s) => s.rest === !entrena && existe.has(semana[s.key]));
  if (deSuClase.length === 0) return casilla;

  const veces = new Map();
  for (const s of deSuClase) veces.set(semana[s.key], (veces.get(semana[s.key]) || 0) + 1);
  const [masVeces] = [...veces.entries()].sort((a, b) => b[1] - a[1])[0];
  return deSuClase.find((s) => semana[s.key] === masVeces).key;
};

/* ── Lo que ve el entrenador ─────────────────────────────────────────────── */

/** «jue 25». */
export const diaCorto = (iso) =>
  new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
    .replace(',', '')
    .replace('.', '');

/**
 * UNA LÍNEA POR CLIENTE en la bandeja, aunque haya atrasado varias veces.
 *
 * @param atrasos Sus filas de `session_delays` sin ver.
 * @param conDieta Si tiene una dieta que se reparte entre entreno y descanso:
 *   solo entonces es verdad que «la dieta se ha ajustado».
 */
export const lineaDeAtrasos = (atrasos = [], { conDieta = false } = {}) => {
  if (atrasos.length === 0) return null;
  const desde = atrasos.map((a) => a.desde).sort()[0];
  if (atrasos.length > 1) return `${atrasos.length} atrasos · desde el ${diaCorto(desde)}`;
  const { dias } = atrasos[0];
  return [
    `Desde el ${diaCorto(desde)}`,
    `${dias} ${dias === 1 ? 'día' : 'días'}`,
    conDieta && LA_DIETA_SIGUE_AL_PLAN ? 'dieta ajustada' : null,
  ]
    .filter(Boolean)
    .join(' · ');
};

/** Las filas sin ver, por cliente: `{ [clientId]: fila[] }`. */
export const atrasosSinVer = (filas = []) => {
  const por = {};
  for (const f of filas) {
    if (f.seen_at) continue;
    (por[f.client_id] ||= []).push(f);
  }
  return por;
};

/** ¿Su dieta distingue días? Con una sola no hay nada que ajustar. */
export const dietaConVariosDias = (nutrition) => planDays(nutrition).length > 1;

/**
 * La línea de cada cliente con algo atrasado sin ver: lo que la cartera pone
 * en su bandeja (`buildPortfolio({ atrasoLineas })`).
 *
 * @param nutrition Las dietas por cliente, para decir «dieta ajustada» solo
 *   cuando es verdad.
 */
export const lineasDeAtrasos = (filas = [], nutrition = {}) =>
  Object.fromEntries(
    Object.entries(atrasosSinVer(filas)).map(([id, suyas]) => [
      id,
      lineaDeAtrasos(suyas, { conDieta: dietaConVariosDias(nutrition?.[id]) }),
    ])
  );

/**
 * Los días que quedaron libres por un atraso, para marcarlos en su Entreno.
 *
 * @returns `Map<fecha, fila>`: de `desde` a `desde + dias - 1`.
 */
export const diasAtrasados = (filas = []) => {
  const dias = new Map();
  for (const f of filas) {
    for (let i = 0; i < f.dias; i += 1) {
      const fecha = addDays(f.desde, i);
      if (!dias.has(fecha)) dias.set(fecha, f);
    }
  }
  return dias;
};

/**
 * La fecha planificada de cada hoja para el entrenador, en el microciclo que
 * mira: `Map<hoja, [{ vez, fecha, atrasada }]>`. Solo de lo que está sin hacer.
 */
export const planDeLaSemana = (items = [], weekNumber) => {
  const por = new Map();
  for (const i of items) {
    if (i.weekNumber !== weekNumber || i.hecha || !i.fechaPlan) continue;
    if (!por.has(i.hoja)) por.set(i.hoja, []);
    por.get(i.hoja).push({ vez: i.vez, fecha: i.fechaPlan, atrasada: Boolean(i.fechaGuardada) && i.fechaGuardada !== i.fechaPorDefecto });
  }
  return por;
};
