/**
 * EL RENDIMIENTO EN LA TEMPORADA: cómo progresan las referencias de cada
 * bloque y cuántas series efectivas hubo cada semana (24 sep 2026).
 *
 * ══ Culturismo, no powerlifting ═══════════════════════════════════════════
 *
 * Nada de aquí sale como «1RM» ni como kilos de un máximo teórico. Lo que se
 * enseña es una VARIACIÓN: cuánto mejor o peor es la mejor serie de esta
 * semana que la de la primera semana del bloque, en %. «Press inclinado
 * −2 %». Epley (`e1rm`) solo sirve por dentro, para comparar 90 × 8 con
 * 95 × 6; la cifra que produce no sale de este fichero.
 *
 * ── Qué serie cuenta ──────────────────────────────────────────────────────
 *   · Dentro del rango de trabajo: hasta `REPS_DE_TRABAJO` repeticiones. Por
 *     encima Epley ya no compara nada.
 *   · Si la serie tiene RIR apuntado, solo si va cerca del fallo
 *     (`RIR_CERCA_DEL_FALLO` o menos). Una serie a RIR 5 es una
 *     aproximación, no la mejor serie de la semana. Sin RIR apuntado cuenta:
 *     no se castiga a quien no lo apunta.
 *
 * ── Qué referencias ───────────────────────────────────────────────────────
 * Las del bloque (`block.referencias`), que elige el entrenador. Si no tiene,
 * el ejercicio MÁS REGISTRADO del bloque (el de más series apuntadas): lo que
 * de verdad se ha entrenado, no lo que se programó.
 *
 * ── Cada bloque empieza en cero ───────────────────────────────────────────
 * El % se mide contra la primera semana del bloque en la que esa referencia
 * tiene una serie que cuente. Un bloque nuevo es otra prescripción —otros
 * rangos, otro orden— y compararlo con el anterior mezclaría la progresión
 * con el cambio de programa.
 *
 * ══ Lo que NO hace ════════════════════════════════════════════════════════
 * No juzga. «−2 %» no es «va mal»: puede ser la semana de descarga, un
 * cambio de máquina o el déficit. La herramienta lo enseña; el entrenador
 * decide.
 */

import { localeNumber, weekStart } from '@/lib/dates';
import { round, toNum } from '@/lib/num';
import { blockPlan, blocksOf, weeksOfBlock } from './blocks';
import { nombresDeLaReferencia, referenciasDelBloque } from './lenteDeEntreno';
/* «Cerca del fallo» y «serie efectiva» son de toda la aplicación: viven en
   `sessions.js`, con el volumen por músculo que también las cuenta. */
import { allSessions, cercaDelFallo, e1rm, esSerieEfectiva, executedSessions } from './sessions';

/** Las repeticiones de más arriba del rango de trabajo que se comparan. */
export const REPS_DE_TRABAJO = 12;

/** La marca con la que se compara una serie, o `0` si no cuenta. Solo por dentro. */
const marcaDe = (set) => (cercaDelFallo(set) ? e1rm(set?.kg, set?.reps, { hasta: REPS_DE_TRABAJO }) : 0);

const clave = (nombre) => String(nombre || '').trim();

/**
 * @param program `workoutData[clientId]`, con sus sesiones.
 * @param semanas las filas de `semanasDelPlan`, con su `bloque` ya puesto.
 * @returns `{ bloques, semanas }`:
 *   · `bloques`: `[{ id, nombre, desde, hasta, propias, referencias }]`, uno
 *     por tramo seguido de semanas del mismo bloque. `desde` y `hasta` son el
 *     primer lunes y el último domingo. Cada referencia es
 *     `{ nombre, puntos: [{ lunes, jueves, pct, serie }] }`, con `pct` la
 *     variación (0,04 = +4 %) y `serie` la que la da (`{ kg, reps, rir }`),
 *     para el detalle.
 *   · `semanas`: `Map<lunes, { efectivas }>`, las series efectivas de cada
 *     semana natural, de todos los ejercicios.
 */
export const rendimientoDeLaTemporada = ({ program, semanas = [] } = {}) => {
  const salida = { bloques: [], semanas: new Map() };
  if (!program || semanas.length === 0) return salida;

  /* Las sesiones por el lunes de SU fecha, como la lente de Entreno. */
  const porLunes = new Map();
  for (const s of allSessions(program.microcycles || [])) {
    const l = s.date ? weekStart(s.date) : null;
    if (!l) continue;
    if (!porLunes.has(l)) porLunes.set(l, []);
    porLunes.get(l).push(s);
  }

  for (const s of semanas) {
    let efectivas = 0;
    for (const sesion of porLunes.get(s.lunes) || [])
      for (const e of sesion.entries || []) for (const set of e.sets || []) if (esSerieEfectiva(set)) efectivas += 1;
    salida.semanas.set(s.lunes, { efectivas });
  }

  /* Los tramos seguidos de semanas del mismo bloque. */
  const tramos = [];
  for (const s of semanas) {
    const id = s.bloque?.id || null;
    const ultimo = tramos[tramos.length - 1];
    if (id && ultimo?.id === id) ultimo.semanas.push(s);
    else if (id) tramos.push({ id, nombre: s.bloque.nombre, semanas: [s] });
  }

  const bloques = blocksOf(program);
  for (const t of tramos) {
    const block = bloques.find((b) => b.id === t.id) || null;
    const lunes = t.semanas.map((s) => s.lunes);

    /* Las referencias: las suyas, o la más registrada del tramo. */
    let refs = referenciasDelBloque(block).map((r) => ({
      nombre: r.nombre,
      nombres: new Set(nombresDeLaReferencia(program, r).map(clave)),
    }));
    const propias = refs.length > 0;
    if (!propias) {
      const cuenta = new Map();
      for (const l of lunes)
        for (const sesion of porLunes.get(l) || [])
          for (const e of sesion.entries || []) {
            const n = clave(e.name);
            if (!n) continue;
            const hechas = (e.sets || []).filter((set) => marcaDe(set) > 0).length;
            if (hechas > 0) cuenta.set(n, (cuenta.get(n) || 0) + hechas);
          }
      /* A igualdad, por nombre: dos pintadas seguidas enseñan lo mismo. */
      const [mas] = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      refs = mas ? [{ nombre: mas[0], nombres: new Set([mas[0]]) }] : [];
    }

    const referencias = refs.map((ref) => {
      let base = null;
      const puntos = [];
      for (const s of t.semanas) {
        let mejor = null;
        for (const sesion of porLunes.get(s.lunes) || [])
          for (const e of sesion.entries || []) {
            if (!ref.nombres.has(clave(e.name))) continue;
            for (const set of e.sets || []) {
              const m = marcaDe(set);
              if (m > 0 && (!mejor || m > mejor.m)) mejor = { m, set };
            }
          }
        if (!mejor) continue;
        if (base === null) base = mejor.m;
        puntos.push({
          lunes: s.lunes,
          jueves: s.jueves,
          pct: mejor.m / base - 1,
          serie: { kg: toNum(mejor.set.kg), reps: toNum(mejor.set.reps), rir: toNum(mejor.set.rir) },
        });
      }
      return { nombre: ref.nombre, nombres: [...ref.nombres], puntos };
    });

    salida.bloques.push({
      id: t.id,
      nombre: t.nombre || block?.name || 'Bloque',
      desde: t.semanas[0].lunes,
      hasta: t.semanas[t.semanas.length - 1].domingo,
      propias,
      referencias,
    });
  }

  return salida;
};

/**
 * La mejor marca de una referencia entre dos fechas (incluidas), con la misma
 * vara que la temporada: la mejor serie cerca del fallo de hasta
 * `REPS_DE_TRABAJO` repeticiones. La cifra es interna: solo se divide entre
 * otra marca de la misma referencia (la tarjeta de impacto de una
 * intervención compara las de antes, durante y después).
 *
 * @param nombres los nombres con que se apuntó (`referencias[].nombres`).
 * @returns un número, o `null` si no hay ninguna serie que cuente.
 */
export const mejorMarcaEntre = ({ program, nombres = [], desde, hasta }) => {
  const suyos = new Set(nombres.map(clave));
  let mejor = 0;
  for (const s of allSessions(program?.microcycles || [])) {
    if (!s.date || s.date < desde || s.date > hasta) continue;
    for (const e of s.entries || []) {
      if (!suyos.has(clave(e.name))) continue;
      for (const set of e.sets || []) mejor = Math.max(mejor, marcaDe(set));
    }
  }
  return mejor > 0 ? mejor : null;
};

/** «+4 %», «−2 %», «±0 %». Entero: un decimal aquí sería ruido de la fórmula. */
export const variacionTexto = (pct) => {
  const n = Math.round((pct ?? 0) * 100);
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)} %`;
};

/* ══════════════════════════════════════════════════════════════════════════
 * EL RENDIMIENTO DE UNA SESIÓN: un número para medir la progresión
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La progresión de un ejercicio se mide con UN número por sesión, el
 * rendimiento de su mejor serie. No con el rango de repeticiones —ese sirve
 * para PRESCRIBIR, no para medir: 34 × 8 dentro de un 6-8 no dice cuánto
 * mejor es que 32 × 7— ni con los kilos solos, que tratan 36 × 4 como mejor
 * que 34 × 8.
 *
 * ── La fórmula ────────────────────────────────────────────────────────────
 * Epley con el RIR dentro: kg × (1 + (reps + rir) / 30). Las repeticiones que
 * quedaban en la recámara son repeticiones que podía hacer, así que 34 × 8 a
 * RIR 2 rinde como 34 × 10 al fallo. Sin RIR apuntado, 0: se lee como al
 * fallo, que es lo que casi siempre significa no apuntarlo.
 *
 * ── Por qué no `e1rm` ─────────────────────────────────────────────────────
 *   · SIN REDONDEAR. La progresión de un curl de 12 kg que pasa de 10 a 11
 *     repeticiones es +0,4 kg de 1RM: redondeado al kilo, desaparece.
 *   · SIN TOPE DE REPETICIONES. Con el corte de 12, un ejercicio a 12-15 no
 *     tenía ni un dato.
 *
 * ── El error de la fórmula no importa aquí ─────────────────────────────────
 * Epley se aleja del 1RM real cuanto más repeticiones: a 15 o 20 el número ya
 * no es un máximo creíble. Pero este número NUNCA se compara con otra persona
 * ni se enseña como un máximo: solo se divide entre el de la misma persona,
 * en el mismo ejercicio, unas semanas antes. Un error que se repite igual en
 * las dos mediciones se cancela en el cociente. Por eso se enseña como un
 * índice (primera semana = 100), y la cifra en sí no sale de este fichero.
 */

/**
 * El rendimiento de una serie: kg × (1 + (reps + rir) / 30).
 * @returns el número sin redondear, o `null` si faltan los kilos o las
 *   repeticiones (una serie a peso corporal no se mide con esta vara).
 */
export const rendimientoDeSerie = ({ kg, reps, rir } = {}) => {
  const k = toNum(kg);
  const r = toNum(reps);
  if (k === null || k <= 0 || r === null || r <= 0) return null;
  const enReserva = Math.max(0, toNum(rir) ?? 0);
  return k * (1 + (r + enReserva) / 30);
};

const mismoEjercicio = (a, b) => clave(a) !== '' && clave(a) === clave(b);

/** La mejor serie efectiva de un montón de series, o `null`. */
const mejorDe = (sets = []) => {
  let mejor = null;
  for (const set of sets) {
    if (!esSerieEfectiva(set)) continue;
    const valor = rendimientoDeSerie(set);
    if (valor === null || (mejor && valor <= mejor.valor)) continue;
    mejor = { kg: toNum(set.kg), reps: toNum(set.reps), rir: toNum(set.rir), valor };
  }
  return mejor;
};

/**
 * La serie que representa un ejercicio en una sesión: la EFECTIVA
 * (`esSerieEfectiva`) de mayor rendimiento. No la de más kilos: 34 × 8 le
 * gana a 36 × 4.
 *
 * @param sesion   una sesión registrada, con `entries`.
 * @param ejercicio el nombre del ejercicio.
 * @returns `{ kg, reps, rir, valor }` (`rir` null si no se apuntó), o `null`.
 */
export const mejorSerie = (sesion, ejercicio) =>
  mejorDe(
    (sesion?.entries || [])
      .filter((e) => mismoEjercicio(e?.name, ejercicio))
      .flatMap((e) => e.sets || [])
  );

/**
 * La línea de rendimiento de un ejercicio, un punto por microciclo.
 *
 * Si en un microciclo lo hizo en dos sesiones, cuenta la mejor de las dos: es
 * lo que fue capaz de hacer esa semana.
 *
 * @param semanas los `weekNumber` que se quieren, en orden; por defecto,
 *   todos los microciclos del programa.
 * @returns `[{ semana, kg, reps, rir, valor, indice }]`, con `indice` = valor /
 *   valor del primer microciclo con dato × 100. Un microciclo sin registro es
 *   un HUECO —todo a `null` salvo la semana—, nunca un cero: no lo hizo, no
 *   rindió cero.
 */
export const lineaDeRendimiento = (microcycles = [], ejercicio, semanas = null) => {
  const porSemana = new Map((microcycles || []).map((m) => [m.weekNumber, m]));
  const orden = semanas ?? [...porSemana.keys()].sort((a, b) => a - b);

  let base = null;
  return orden.map((semana) => {
    const micro = porSemana.get(semana);
    const mejor = micro
      ? mejorDe(
          executedSessions(micro)
            .flatMap((s) => s.entries || [])
            .filter((e) => mismoEjercicio(e?.name, ejercicio))
            .flatMap((e) => e.sets || [])
        )
      : null;
    if (!mejor) return { semana, kg: null, reps: null, rir: null, valor: null, indice: null };
    if (base === null) base = mejor.valor;
    return { semana, ...mejor, indice: (mejor.valor / base) * 100 };
  });
};

/** Por debajo de este % de cambio, el ejercicio está igual: es una repetición de ruido. */
export const UMBRAL_DE_CAMBIO = 1;

const serieTexto = (p) => `${localeNumber(p.kg)} × ${localeNumber(p.reps)}`;

/**
 * Cuánto ha cambiado una línea: su último punto con dato contra el primero.
 *
 * No una recta de regresión: en un bloque de cuatro a seis semanas la
 * pregunta es «¿rinde hoy más que cuando empezó?», y eso es un cociente.
 *
 * @returns `{ pct, dir, desde, hasta }` —`pct` el último índice − 100 con un
 *   decimal; `dir` 'sube' | 'igual' | 'baja' con umbral ±`UMBRAL_DE_CAMBIO`;
 *   `desde` y `hasta` las dos series, «32 × 7» y «36 × 8»—, o `null` si la
 *   línea no tiene ningún dato.
 */
export const cambioEnElBloque = (linea = []) => {
  const conDato = linea.filter((p) => p.indice !== null && p.indice !== undefined);
  if (conDato.length === 0) return null;
  const primero = conDato[0];
  const ultimo = conDato[conDato.length - 1];
  const pct = round(ultimo.indice - 100, 1);
  return {
    pct,
    indice: ultimo.indice,
    dir: pct >= UMBRAL_DE_CAMBIO ? 'sube' : pct <= -UMBRAL_DE_CAMBIO ? 'baja' : 'igual',
    desde: serieTexto(primero),
    hasta: serieTexto(ultimo),
  };
};

/**
 * El % que se ENSEÑA de un cambio: «+15 %». Sale del índice sin redondear y
 * se redondea una sola vez, como el índice que la gráfica escribe al lado
 * (115): con `pct` —ya redondeado a un decimal— 115,46 salía «+16 %» junto a
 * un «115».
 */
export const variacionDelCambio = (cambio) => variacionTexto((Math.round(cambio.indice) - 100) / 100);

/**
 * Las series efectivas de un ejercicio por semana: la media de los
 * microciclos en que lo hizo, con un decimal. Los que no lo hizo no entran —un
 * microciclo sin registro no es un microciclo a cero series—.
 *
 * @returns el número, o `null` si no lo hizo en ninguno.
 */
export const seriesPorSemana = (microcycles = [], ejercicio) => {
  const cuentas = (microcycles || [])
    .map((m) =>
      executedSessions(m)
        .flatMap((s) => s.entries || [])
        .filter((e) => mismoEjercicio(e?.name, ejercicio))
        .flatMap((e) => e.sets || [])
        .filter(esSerieEfectiva).length
    )
    .filter((n) => n > 0);
  return cuentas.length ? round(cuentas.reduce((a, b) => a + b, 0) / cuentas.length, 1) : null;
};

/**
 * El rendimiento de todos los ejercicios de un bloque.
 *
 * Los ejercicios son los programados en sus microciclos y los registrados en
 * sus sesiones —un ejercicio cambiado sobre la marcha también se hizo—. Cada
 * bloque empieza en 100: se mide contra su primer microciclo, no contra el
 * bloque anterior, que era otra prescripción.
 *
 * @returns `{ ejercicios: [{ nombre, grupo, linea, cambio, seriesSemana }], recuento: {
 *   suben, igual, bajan } }`. `grupo` es el músculo con el que está programado
 *   (el del último microciclo que lo tiene), o `null` si solo se registró. Los
 *   ejercicios sin ningún dato salen con `cambio: null` y no cuentan en el
 *   recuento.
 */
export const rendimientoDelBloque = (program, block) => {
  const semanas = block ? weeksOfBlock(program, block) : [];
  const micros = (program?.microcycles || []).filter((m) => semanas.includes(m.weekNumber));

  const nombres = new Set();
  const grupos = new Map();
  const apunta = (nombre) => {
    if (clave(nombre)) nombres.add(clave(nombre));
  };
  for (const m of micros) {
    for (const d of m.days || [])
      for (const ex of d.exercises || []) {
        apunta(ex.name);
        if (clave(ex.name) && ex.muscle) grupos.set(clave(ex.name), ex.muscle);
      }
    for (const s of executedSessions(m)) for (const e of s.entries || []) apunta(e.name);
  }

  /* Con el plan dentro del bloque, los días del microciclo pueden venir
     vacíos: el músculo se lee entonces de sus hojas. */
  if (block)
    for (const h of blockPlan(program, block).sessions || [])
      for (const ex of h.exercises || [])
        if (clave(ex.name) && ex.muscle && !grupos.has(clave(ex.name))) grupos.set(clave(ex.name), ex.muscle);

  const ejercicios = [...nombres]
    .sort((a, b) => a.localeCompare(b))
    .map((nombre) => {
      const linea = lineaDeRendimiento(micros, nombre, semanas);
      return {
        nombre,
        grupo: grupos.get(nombre) || null,
        linea,
        cambio: cambioEnElBloque(linea),
        seriesSemana: seriesPorSemana(micros, nombre),
      };
    });

  const recuento = { suben: 0, igual: 0, bajan: 0 };
  for (const { cambio } of ejercicios) {
    if (cambio?.dir === 'sube') recuento.suben += 1;
    else if (cambio?.dir === 'igual') recuento.igual += 1;
    else if (cambio?.dir === 'baja') recuento.bajan += 1;
  }

  return { ejercicios, recuento };
};

/* ══════════════════════════════════════════════════════════════════════════
 * EL RENDIMIENTO DE UN CONJUNTO: la media, por hoja y por grupo (25 sep)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Para leer el bloque entero —y cada hoja, y cada grupo— hace falta UN índice
 * por microciclo de varios ejercicios. Es la media de sus índices, cada uno ya
 * en base 100 contra su propio inicio: por eso se pueden promediar un press de
 * 80 kg y un curl de 12 sin que el press pese más.
 */

const media = (valores) => valores.reduce((a, b) => a + b, 0) / valores.length;

/**
 * El índice medio por microciclo de varias líneas (`lineaDeRendimiento`).
 *
 * @param lineas líneas de las MISMAS semanas, en el mismo orden.
 * @returns `[{ semana, indice, ejercicios }]`: `indice` la media de los que
 *   tienen dato ese microciclo —`null` si ninguno, que es un hueco, no un
 *   cero— y `ejercicios` cuántos entran en ella.
 */
export const indiceMedio = (lineas = []) => {
  const largo = Math.max(0, ...lineas.map((l) => l?.length || 0));
  return Array.from({ length: largo }, (_, i) => {
    const con = lineas.map((l) => l?.[i]).filter((p) => p && p.indice !== null && p.indice !== undefined);
    const semana = lineas.find((l) => l?.[i])?.[i]?.semana ?? null;
    return { semana, indice: con.length ? media(con.map((p) => p.indice)) : null, ejercicios: con.length };
  });
};

/**
 * El cambio medio de varios ejercicios, en puntos de índice: la media de lo que
 * ha cambiado CADA UNO (su último microciclo con dato contra su primero). No el
 * último punto de `indiceMedio`: con el microciclo en curso a medias, ese punto
 * sería la media de dos ejercicios y saltaría con cada serie apuntada.
 *
 * @returns el % sin redondear (25,3 = +25,3 %), o `null` si ninguno tiene dato.
 */
export const cambioMedio = (ejercicios = []) => {
  const con = ejercicios.filter((e) => e.cambio);
  return con.length ? media(con.map((e) => e.cambio.indice)) - 100 : null;
};

/* `seriesSemana`, la suma de las de sus ejercicios: las series que se le hacen
   al grupo (o a la hoja) cada semana. */
const conjunto = (nombre, ejercicios) => {
  const series = ejercicios.map((e) => e.seriesSemana).filter((n) => n !== null && n !== undefined);
  return {
    nombre,
    ejercicios,
    linea: indiceMedio(ejercicios.map((e) => e.linea)),
    pct: cambioMedio(ejercicios),
    seriesSemana: series.length ? round(series.reduce((a, b) => a + b, 0), 1) : null,
  };
};

/**
 * El rendimiento de cada hoja del bloque, en el orden de las hojas. Un
 * ejercicio que está en dos hojas cuenta en las dos. Lo registrado que no está
 * en ninguna —cambiado sobre la marcha— va al final, en «Fuera de las hojas».
 *
 * @param opciones.ejercicios los de `rendimientoDelBloque`, si ya se tienen.
 * @returns `[{ nombre, ejercicios, linea, pct }]`, solo con los ejercicios que
 *   tienen dato; una hoja sin ninguno no sale.
 */
export const rendimientoPorHoja = (program, block, { ejercicios } = {}) => {
  const medidos = (ejercicios ?? rendimientoDelBloque(program, block).ejercicios).filter((e) => e.cambio);
  const vistos = new Set();
  const hojas = (block ? blockPlan(program, block).sessions || [] : []).map((h) => {
    const suyos = new Set((h.exercises || []).map((ex) => clave(ex.name)));
    const dentro = medidos.filter((e) => suyos.has(e.nombre));
    dentro.forEach((e) => vistos.add(e.nombre));
    return conjunto(h.dayName, dentro);
  });
  const sueltos = medidos.filter((e) => !vistos.has(e.nombre));
  if (sueltos.length) hojas.push(conjunto('Fuera de las hojas', sueltos));
  return hojas.filter((h) => h.ejercicios.length > 0);
};

/**
 * El rendimiento de cada grupo muscular del bloque, por orden alfabético y
 * «Sin grupo» al final.
 *
 * @returns `[{ nombre, ejercicios, linea, pct }]`, como `rendimientoPorHoja`.
 */
export const rendimientoPorGrupo = (program, block, { ejercicios } = {}) => {
  const medidos = (ejercicios ?? rendimientoDelBloque(program, block).ejercicios).filter((e) => e.cambio);
  const porGrupo = new Map();
  for (const e of medidos) {
    const g = e.grupo || 'Sin grupo';
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(e);
  }
  return [...porGrupo.entries()]
    .sort((a, b) => (a[0] === 'Sin grupo') - (b[0] === 'Sin grupo') || a[0].localeCompare(b[0]))
    .map(([nombre, suyos]) => conjunto(nombre, suyos));
};

/**
 * La carga, en el mismo índice: los kilos de la mejor serie de cada
 * microciclo contra los del primero con dato × 100. Va al lado del rendimiento
 * para leer DE DÓNDE sale la subida: si la carga sube con él, subió el peso;
 * si se queda en 100, subieron las repeticiones o bajó el RIR.
 *
 * @returns un valor por punto de la línea, `null` donde no hay registro.
 */
export const cargaIndexada = (linea = []) => {
  const base = linea.find((p) => p.kg !== null && p.kg !== undefined && p.kg > 0)?.kg ?? null;
  return linea.map((p) => (base === null || p.kg === null || p.kg === undefined ? null : (p.kg / base) * 100));
};

/**
 * Las series de un ejercicio en un microciclo, todas, y cuál es la que cuenta
 * (la misma que elige `lineaDeRendimiento`). Para la tabla de la progresión.
 *
 * @returns `{ fecha, series: [{ kg, reps, rir }], cuenta }` —`cuenta` el
 *   índice de la serie que da el punto, o -1 si ninguna cuenta—, o `null` si
 *   no lo hizo.
 */
export const seriesDelMicrociclo = (micro, ejercicio) => {
  const entradas = executedSessions(micro || {}).flatMap((s) =>
    (s.entries || []).filter((e) => mismoEjercicio(e?.name, ejercicio)).map((e) => ({ fecha: s.date || null, e }))
  );
  const series = entradas.flatMap(({ e }) =>
    (e.sets || []).filter((set) => toNum(set?.kg) !== null || toNum(set?.reps) !== null)
  );
  if (series.length === 0) return null;
  let cuenta = -1;
  let tope = null;
  series.forEach((set, i) => {
    if (!esSerieEfectiva(set)) return;
    const v = rendimientoDeSerie(set);
    if (v !== null && (tope === null || v > tope)) {
      tope = v;
      cuenta = i;
    }
  });
  return {
    fecha: entradas[0]?.fecha || micro?.date || null,
    series: series.map((set) => ({ kg: toNum(set.kg), reps: toNum(set.reps), rir: toNum(set.rir) })),
    cuenta,
  };
};

/* ══ UNA PROPUESTA DE UMBRAL, SIN CABLEAR (25 sep) ═════════════════════════
 * Con ±1 % casi todo «sube»: la mejor serie de un microciclo baila más que eso
 * por sí sola —un día peor, una máquina ocupada—. La propuesta es medir ese
 * baile en cada ejercicio: la desviación típica de sus saltos entre
 * microciclos seguidos. Una progresión limpia (+3, +3, +3) salta siempre lo
 * mismo y su baile es cero, así que sigue subiendo; una que va +5, −4, +3, −5
 * baila cinco puntos, y un +2 al final no se distingue de ese ruido.
 *
 * El umbral es el mayor de ±1 % y ese baile. Con menos de dos saltos no hay
 * baile que medir y se queda en ±1 %. NO lo usa todavía `cambioEnElBloque`:
 * está aquí para comparar los dos recuentos antes de cambiar nada. */

/** El baile de un ejercicio entre microciclos, en puntos de índice (o 0). */
export const ruidoDelEjercicio = (linea = []) => {
  const v = linea.filter((p) => p.indice !== null && p.indice !== undefined).map((p) => p.indice);
  const saltos = v.slice(1).map((x, i) => x - v[i]);
  if (saltos.length < 2) return 0;
  const m = media(saltos);
  return Math.sqrt(saltos.reduce((acc, d) => acc + (d - m) ** 2, 0) / (saltos.length - 1));
};

/** La dirección con el umbral propio del ejercicio: 'sube' | 'igual' | 'baja', o null. */
export const direccionConRuido = (linea = []) => {
  const cambio = cambioEnElBloque(linea);
  if (!cambio) return null;
  const umbral = Math.max(UMBRAL_DE_CAMBIO, ruidoDelEjercicio(linea));
  const pct = cambio.indice - 100;
  return pct >= umbral ? 'sube' : pct <= -umbral ? 'baja' : 'igual';
};

/* ══════════════════════════════════════════════════════════════════════════
 * LA LECTURA DEL BLOQUE: qué se sale de lo normal y qué se ha frenado (25 sep)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * «Lo normal» es el propio bloque, no una cifra fija: un +8 % es mucho en un
 * bloque que sube un 3 % y poco en uno que sube un 25 %. Se mide contra la
 * MEDIANA de los % y con la desviación absoluta mediana (MAD), no con la media
 * y la desviación típica: un solo ejercicio disparado —un +60 % de una máquina
 * nueva— movería la media y ensancharía la típica hasta tapar a los demás; la
 * mediana y la MAD no se enteran.
 *
 * Fuera si |x − mediana| > `UMBRAL_ROBUSTO` × `MAD_A_SIGMA` × MAD. El 1,4826
 * pasa la MAD a la escala de una desviación típica, y 1,5 de éstas es un
 * criterio amplio a propósito: señala lo que se sale, no la mitad del bloque.
 *
 * Solo ordena. Por encima no es «va bien» ni por debajo «va mal»: puede ser un
 * ejercicio nuevo que empieza bajo, o uno en mantenimiento.
 */

/** Pasa la MAD a la escala de una desviación típica (distribución normal). */
export const MAD_A_SIGMA = 1.4826;
/** Cuántas desviaciones (robustas) hay que alejarse de la mediana para salir. */
export const UMBRAL_ROBUSTO = 1.5;
/** Por debajo de tantos elementos, la mediana no dice qué es lo normal. */
export const MINIMO_PARA_SEPARAR = 5;

const mediana = (valores) => {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Separa un conjunto por su % respecto a la mediana.
 *
 * El umbral nunca baja de `UMBRAL_DE_CAMBIO`: si casi todos cambian lo mismo
 * la MAD es cero, y con un umbral de cero cualquier décima se saldría.
 *
 * @param items `[{ nombre, pct, … }]`, con `pct` en % (25 = +25 %). Los que no
 *   tienen `pct` no entran.
 * @returns `{ separa, mediana, umbral, encima, media, debajo }`. Cada elemento
 *   sale con `diferencia` (pct − mediana, en puntos). `encima` de más a menos,
 *   `debajo` del más bajo al menos, `media` de más a menos. Con menos de
 *   `MINIMO_PARA_SEPARAR`, `separa: false` y todos en `media`.
 */
export const lecturaDelBloque = (items = []) => {
  const con = items.filter((i) => Number.isFinite(i?.pct));
  const porPct = (a, b) => b.pct - a.pct || String(a.nombre).localeCompare(String(b.nombre));
  if (con.length === 0) return { separa: false, mediana: null, umbral: null, encima: [], media: [], debajo: [] };

  const med = mediana(con.map((i) => i.pct));
  const conDif = con.map((i) => ({ ...i, diferencia: i.pct - med }));
  if (con.length < MINIMO_PARA_SEPARAR)
    return { separa: false, mediana: med, umbral: null, encima: [], media: conDif.sort(porPct), debajo: [] };

  const mad = mediana(con.map((i) => Math.abs(i.pct - med)));
  const umbral = Math.max(UMBRAL_ROBUSTO * MAD_A_SIGMA * mad, UMBRAL_DE_CAMBIO);
  return {
    separa: true,
    mediana: med,
    umbral,
    encima: conDif.filter((i) => i.diferencia > umbral).sort(porPct),
    media: conDif.filter((i) => Math.abs(i.diferencia) <= umbral).sort(porPct),
    debajo: conDif.filter((i) => i.diferencia < -umbral).sort((a, b) => porPct(b, a)),
  };
};

/** Microciclos con registro sin superar el mejor para contar como frenado. */
export const MICROCICLOS_SIN_MEJORA = 3;

/**
 * Los que llevan `MICROCICLOS_SIN_MEJORA` microciclos con registro sin superar
 * su mejor índice, aunque el bloque entero suba. Superar es pasarlo por
 * `UMBRAL_DE_CAMBIO` o más: una décima arriba es la misma marca.
 *
 * @param items `[{ nombre, linea, … }]` (`lineaDeRendimiento`).
 * @returns los frenados, los que más llevan primero, cada uno con `desde` (la
 *   semana de su mejor marca), `microciclos` (los registrados desde entonces)
 *   y `serie` (`{ kg, reps, rir }` del último registro, o `null`).
 */
export const frenados = (items = []) =>
  items
    .flatMap((item) => {
      const con = (item?.linea || []).filter((p) => p.indice !== null && p.indice !== undefined);
      if (con.length <= MICROCICLOS_SIN_MEJORA) return [];
      let mejor = 0;
      for (let i = 1; i < con.length; i += 1) if (con[i].indice >= con[mejor].indice + UMBRAL_DE_CAMBIO) mejor = i;
      const microciclos = con.length - 1 - mejor;
      if (microciclos < MICROCICLOS_SIN_MEJORA) return [];
      const ultimo = con[con.length - 1];
      return [
        {
          ...item,
          desde: con[mejor].semana,
          microciclos,
          serie: ultimo.kg !== null && ultimo.kg !== undefined ? { kg: ultimo.kg, reps: ultimo.reps, rir: ultimo.rir } : null,
        },
      ];
    })
    .sort((a, b) => b.microciclos - a.microciclos || String(a.nombre).localeCompare(String(b.nombre)));
