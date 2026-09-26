/**
 * LAS VARIACIONES DE LA DIETA (26 sep 2026): un refeed o un diet break es la
 * dieta de unos días concretos, sin tocar la dieta base.
 *
 * ══ Dónde viven ════════════════════════════════════════════════════════════
 * En `client_events` (0123, 0142, 0143, 0144), como siempre: sus fechas, sus
 * cifras (iguales cada día o una por día, `pauta_dias`), la indicación para el
 * cliente (`nota`), su menú día a día (`menu`, opcional) y el tipo de día del
 * que partió, congelado (`parte_de`). El motivo, solo del entrenador, en
 * `client_interventions`. Esta hoja no guarda nada: traduce entre el
 * formulario y la fila, y responde a las preguntas que hacen las pantallas.
 *
 * ══ Reglas ═════════════════════════════════════════════════════════════════
 *   · Dos variaciones nunca cubren el mismo día (0144 lo garantiza en la
 *     base; aquí se dice ANTES con cuál choca). Vacaciones, enfermedad o
 *     competición sí pueden coincidir con una: no son pauta.
 *   · «Parte de» copia las cifras del tipo de día AL CREARLA. Si la base
 *     cambia después, la variación se queda como se definió y se avisa.
 *   · Un día sin menú enseña sus cifras y la indicación; nunca el menú de la
 *     base, que es de otras cifras.
 *   · La variación manda sobre la dieta esos días, también sobre un cambio de
 *     dieta programado que caiga dentro (`pautaDelDia` ya da prioridad a los
 *     eventos).
 *
 * Informa, no receta: nada de aquí propone cifras. La escalera reparte entre
 * el primer y el último día que escribe el entrenador.
 */

import { addDays, daysBetween } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { buildMeal, cloneMeals, dayKcalTarget, planDays } from './nutrition';
import { esIntervencion, kcalDeMacros } from './pautaDelDia';

/** Hasta cuántos días puede ir «por día» (0143) o llevar menú (0144). */
export const MAX_DIAS_POR_DIA = 28;

export const NOMBRE_DE_VARIACION = { refeed: 'Refeed', diet_break: 'Diet break' };

/** El último día de una variación, incluido. */
export const finDeVariacion = (e) => (e?.hasta && e.hasta > e.date ? e.hasta : e?.date);

/** Cuántos días van de `desde` a `hasta`, los dos incluidos. */
export const cuantosDias = (desde, hasta) => {
  if (!desde) return 0;
  const n = daysBetween(desde, hasta && hasta > desde ? hasta : desde);
  return n === null ? 0 : n + 1;
};

/**
 * La variación con la que choca un tramo, o `null`. `id` es la que se está
 * editando: no choca consigo misma.
 */
export const choqueDeVariacion = (hechos, { desde, hasta, id = null }) => {
  if (!desde) return null;
  const fin = hasta && hasta > desde ? hasta : desde;
  return (
    (hechos || [])
      .filter((e) => esIntervencion(e) && e.id !== id && e.date && e.date <= fin && finDeVariacion(e) >= desde)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null
  );
};

/**
 * LA ESCALERA: `n` valores del primero al último, repartidos en línea recta y
 * redondeados a `paso`. El primero y el último son exactamente los escritos.
 */
export const escalera = (inicio, fin, n, paso = 1) => {
  const a = toNum(inicio);
  const b = toNum(fin);
  if (a === null || b === null || n < 1) return [];
  if (n === 1) return [a];
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return a;
    if (i === n - 1) return b;
    return Math.round((a + ((b - a) * i) / (n - 1)) / paso) * paso;
  });
};

/**
 * La foto de un tipo de día de la dieta: `{ diaId, nombre, kcal, proteina,
 * carbohidratos, grasa }`, o `null` si ya no existe.
 */
export const fotoDelDia = (plan, diaId) => {
  const d = planDays(plan).find((x) => x.id === diaId);
  if (!d) return null;
  const t = d.targets || {};
  return {
    diaId: d.id,
    nombre: d.name,
    kcal: dayKcalTarget(plan, d.id) || null,
    proteina: toNum(t.proteinGrams),
    carbohidratos: toNum(t.carbsGrams),
    grasa: toNum(t.fatsGrams),
  };
};

const mismasCifras = (a, b) =>
  ['kcal', 'proteina', 'carbohidratos', 'grasa'].every((k) => Math.round(a?.[k] ?? -1) === Math.round(b?.[k] ?? -1));

/**
 * ¿CAMBIÓ LA DIETA BASE desde que se definió? Mira las versiones fechadas de
 * la dieta (0124) desde el día en que se creó la variación y devuelve la
 * primera en la que ese tipo de día tiene otras cifras (o ya no está):
 * `{ fecha, sinElDia }`, o `null`.
 */
export const cambioDeLaBase = (variacion, versiones) => {
  const parte = variacion?.parteDe;
  const creada = String(variacion?.createdAt || '').slice(0, 10);
  if (!parte?.diaId || !creada) return null;
  for (const v of [...(versiones || [])].sort((a, b) => String(a.dia).localeCompare(String(b.dia)))) {
    if (v.dia < creada) continue;
    const foto = fotoDelDia(v.nutrition, parte.diaId);
    if (!foto) return { fecha: v.dia, sinElDia: true };
    if (!mismasCifras(foto, parte)) return { fecha: v.dia, sinElDia: false };
  }
  return null;
};

/**
 * LA VÍSPERA: la variación que empieza mañana, para que el cliente se
 * organice. `{ kind, nombre, dias, kcals }` o `null`. `kcals`, las de su
 * primer día (o `null`).
 */
export const variacionDeManana = (hechos, hoy) => {
  if (!hoy) return null;
  const manana = addDays(hoy, 1);
  const e = (hechos || []).find((h) => esIntervencion(h) && h.date === manana);
  if (!e) return null;
  const primero = Array.isArray(e.pautaDias) && e.pautaDias.length ? e.pautaDias[0]?.kcal : e.kcal;
  return {
    kind: e.kind,
    nombre: NOMBRE_DE_VARIACION[e.kind] || e.title,
    dias: cuantosDias(e.date, e.hasta),
    kcals: toNum(primero),
  };
};

/**
 * Las variaciones de un cliente, repartidas contra hoy: en curso, previstas
 * (de la más cercana a la más lejana) y pasadas (de la más reciente a la más
 * antigua).
 */
export const variacionesDelCliente = (hechos, hoy) => {
  const todas = (hechos || []).filter(esIntervencion);
  const porFecha = (a, b) => String(a.date).localeCompare(String(b.date));
  return {
    enCurso: todas.filter((e) => e.date <= hoy && finDeVariacion(e) >= hoy).sort(porFecha),
    previstas: todas.filter((e) => e.date > hoy).sort(porFecha),
    pasadas: todas.filter((e) => finDeVariacion(e) < hoy).sort((a, b) => porFecha(b, a)),
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   EL FORMULARIO
   ══════════════════════════════════════════════════════════════════════════ */

const vacio = () => ({ kcal: '', proteina: '', carbohidratos: '', grasa: '' });
const texto = (v) => (v === null || v === undefined ? '' : String(v));
const deFoto = (foto) =>
  foto
    ? { kcal: texto(foto.kcal), proteina: texto(foto.proteina), carbohidratos: texto(foto.carbohidratos), grasa: texto(foto.grasa) }
    : vacio();

/** Las kcal de una fila del formulario: las de sus macros si están las tres. */
export const kcalDeFila = (fila, unidad) =>
  unidad === 'macros'
    ? kcalDeMacros({ protein: fila?.proteina, carbs: fila?.carbohidratos, fats: fila?.grasa })
    : toNum(fila?.kcal);

/** ¿Todos los días llevan la misma lista? (el atajo «el mismo menú»). */
const todosIguales = (menus) =>
  menus.length > 0 && menus.every((m) => JSON.stringify(m) === JSON.stringify(menus[0]));

/** Una lista de `n`, alargada repitiendo la última o recortada. */
const aLo = (lista, n, relleno) => {
  if (lista.length >= n) return lista.slice(0, n);
  const ultimo = lista.length ? lista[lista.length - 1] : relleno;
  return [...lista, ...Array.from({ length: n - lista.length }, () => structuredClone(ultimo))];
};

/**
 * El formulario de una variación nueva, con las fechas puestas y partiendo
 * del tipo de día `diaId` (sus cifras, copiadas).
 */
export const formularioNuevo = ({ plan, kind = 'refeed', desde, hasta = null, diaId = null }) => {
  const dia = diaId || planDays(plan)[0]?.id || null;
  const foto = dia ? fotoDelDia(plan, dia) : null;
  const n = Math.max(1, cuantosDias(desde, hasta));
  const conMacros = foto && foto.proteina !== null && foto.carbohidratos !== null && foto.grasa !== null;
  return {
    id: null,
    kind,
    desde: desde || '',
    hasta: hasta && hasta > desde ? hasta : desde || '',
    parteDe: foto,
    modo: 'igual',
    unidad: conMacros || !foto ? 'macros' : 'kcal',
    igual: deFoto(foto),
    dias: Array.from({ length: n }, () => deFoto(foto)),
    nota: '',
    motivo: '',
    conMenu: false,
    mismoMenu: true,
    menus: [],
  };
};

/** El formulario de una variación que ya existe (y su motivo, si lo tiene). */
export const formularioDe = (e, motivo = '') => {
  const n = cuantosDias(e.date, e.hasta);
  const porDia = Array.isArray(e.pautaDias) && e.pautaDias.length > 0;
  const filas = porDia ? e.pautaDias : [{ kcal: e.kcal, proteina: e.proteina, carbohidratos: e.carbohidratos, grasa: e.grasa }];
  const conMacros = filas.every((f) => f.proteina !== null && f.proteina !== undefined);
  const aFila = (f) => ({
    kcal: texto(f.kcal),
    proteina: texto(f.proteina),
    carbohidratos: texto(f.carbohidratos),
    grasa: texto(f.grasa),
  });
  const menus = Array.isArray(e.menus) ? e.menus.map((m) => (Array.isArray(m) ? m : [])) : [];
  return {
    id: e.id,
    kind: e.kind,
    desde: e.date,
    hasta: finDeVariacion(e),
    parteDe: e.parteDe || null,
    modo: porDia ? 'dias' : 'igual',
    unidad: conMacros ? 'macros' : 'kcal',
    igual: aFila(filas[0] || {}),
    dias: porDia ? filas.map(aFila) : Array.from({ length: n }, () => aFila(filas[0] || {})),
    nota: e.nota || '',
    motivo: motivo || '',
    conMenu: menus.some((m) => m.length > 0),
    mismoMenu: menus.length > 0 ? todosIguales(menus) : true,
    menus,
  };
};

/**
 * Las fechas cambian: los días «por día» y los menús se alargan repitiendo
 * el último, o se recortan.
 */
export const conFechas = (f, { desde = f.desde, hasta = f.hasta }) => {
  const fin = hasta && desde && hasta >= desde ? hasta : desde;
  const n = Math.max(1, cuantosDias(desde, fin));
  const dias = aLo(f.dias.length ? f.dias : [f.igual], n, f.igual);
  const menus = f.conMenu ? aLo(f.menus, Math.min(n, MAX_DIAS_POR_DIA), []) : f.menus;
  return { ...f, desde, hasta: fin, dias, menus, modo: n < 2 ? 'igual' : f.modo };
};

/** «Parte de» otro tipo de día: sus cifras, en todos los días. */
export const partiendoDe = (f, plan, diaId) => {
  const foto = fotoDelDia(plan, diaId);
  if (!foto) return f;
  const fila = deFoto(foto);
  const conMacros = foto.proteina !== null && foto.carbohidratos !== null && foto.grasa !== null;
  return {
    ...f,
    parteDe: foto,
    unidad: conMacros ? f.unidad : 'kcal',
    igual: fila,
    dias: f.dias.map(() => ({ ...fila })),
  };
};

/**
 * La escalera en el formulario: los días de en medio, repartidos entre el
 * primero y el último (cada macro por su lado, a 5 g; las kcal, a 10).
 */
export const escalonar = (f) => {
  const n = f.dias.length;
  if (n < 3) return f;
  const campos = f.unidad === 'macros' ? [['proteina', 5], ['carbohidratos', 5], ['grasa', 5]] : [['kcal', 10]];
  const dias = f.dias.map((d) => ({ ...d }));
  for (const [k, paso] of campos) {
    const valores = escalera(f.dias[0][k], f.dias[n - 1][k], n, paso);
    if (valores.length === n) valores.forEach((v, i) => (dias[i][k] = String(v)));
  }
  return { ...f, dias };
};

/** «Añadir menú»: el del día del que parte, copiado (ids nuevos) en cada día. */
export const conMenuDeLaBase = (f, plan) => {
  const base = f.parteDe?.diaId ? planDays(plan).find((d) => d.id === f.parteDe.diaId)?.meals || [] : [];
  const semilla = base.length ? base : [{ ...buildMeal(), name: 'Comida 1' }];
  const n = Math.min(Math.max(1, cuantosDias(f.desde, f.hasta)), MAX_DIAS_POR_DIA);
  return { ...f, conMenu: true, menus: Array.from({ length: n }, () => cloneMeals(semilla)) };
};

/**
 * EL ATAJO «Usar el mismo menú todos los días». Al encenderlo, todos toman
 * el del día que se está mirando; al apagarlo, cada día sigue con esa copia
 * y se edita por separado.
 */
export const conMismoMenu = (f, mismo, desdeDia = 0) => {
  if (!mismo) return { ...f, mismoMenu: false, menus: f.menus.map((m) => cloneMeals(m)) };
  const fuente = f.menus[desdeDia] || f.menus[0] || [];
  return { ...f, mismoMenu: true, menus: f.menus.map(() => structuredClone(fuente)) };
};

/**
 * ¿Qué le falta al formulario para poder guardarse? Un texto que lo dice, o
 * `null`. El choque con otra variación se mira aparte (`choqueDeVariacion`),
 * porque necesita los hechos del cliente.
 */
export const problemaDelFormulario = (f) => {
  if (!f.desde) return 'Falta el primer día.';
  if (f.hasta && f.hasta < f.desde) return 'El último día va después del primero.';
  const n = cuantosDias(f.desde, f.hasta);
  if (f.modo === 'dias' && (n < 2 || n > MAX_DIAS_POR_DIA)) {
    return n < 2 ? 'Por día necesita dos días o más.' : `Por día llega hasta ${MAX_DIAS_POR_DIA} días.`;
  }
  if (f.conMenu && n > MAX_DIAS_POR_DIA) return `Con menú llega hasta ${MAX_DIAS_POR_DIA} días.`;
  const filas = f.modo === 'dias' ? f.dias : [f.igual];
  for (const fila of filas) {
    if (f.unidad === 'macros') {
      const algunas = ['proteina', 'carbohidratos', 'grasa'].filter((k) => String(fila[k] ?? '').trim() !== '');
      if (algunas.length === 0) continue;
      if (algunas.length < 3) return 'Faltan macros: van las tres o ninguna.';
    }
    const k = kcalDeFila(fila, f.unidad);
    if (k !== null && (k < 800 || k > 8000)) return 'Cada día, entre 800 y 8.000 kcal.';
  }
  if (f.modo === 'dias' && filas.some((fila) => kcalDeFila(fila, f.unidad) === null)) {
    return 'Por día, cada día lleva sus cifras.';
  }
  return null;
};

/**
 * La fila para `client_events`, en los nombres de `useRoadmap`: `{ kind,
 * title, date, hasta, kcal, proteina, carbohidratos, grasa, pautaDias, nota,
 * menus, parteDe }`. Una de dos: cifras iguales en sus columnas o
 * `pautaDias`, nunca las dos (0143).
 */
export const filaDelFormulario = (f) => {
  const n = cuantosDias(f.desde, f.hasta);
  const num = (v) => toNum(v);
  const macros = f.unidad === 'macros';
  /* En kcal, un día que trae sus tres macros y cuyas kcal no se han tocado
     (siguen siendo su cuenta) las conserva: pasar a kcal para escribir otro
     día no borra las macros de este. */
  const conSusMacros = (fila) => kcalDeFila(fila, 'macros') !== null && kcalDeFila(fila, 'macros') === num(fila.kcal);
  const deFila = (fila) =>
    macros || conSusMacros(fila)
      ? { proteina: num(fila.proteina), carbohidratos: num(fila.carbohidratos), grasa: num(fila.grasa), kcal: kcalDeFila(fila, 'macros') }
      : { proteina: null, carbohidratos: null, grasa: null, kcal: num(fila.kcal) };
  const porDia = f.modo === 'dias' && n >= 2;
  const unica = deFila(f.igual);
  /* Un día sin un solo alimento es un día sin menú: una «Comida 1» vacía no
     le dice nada al cliente y le taparía sus cifras. */
  const conAlimentos = (m) => Array.isArray(m) && m.some((c) => (c.options || []).some((o) => (o.foods || []).length > 0));
  const menus = f.conMenu ? aLo(f.menus, n, []).map((m) => (conAlimentos(m) ? m : null)) : null;
  return {
    kind: f.kind,
    title: NOMBRE_DE_VARIACION[f.kind],
    date: f.desde,
    hasta: n > 1 ? f.hasta : null,
    ...(porDia ? { kcal: null, proteina: null, carbohidratos: null, grasa: null } : unica),
    pautaDias: porDia ? f.dias.slice(0, n).map(deFila) : null,
    nota: String(f.nota || '').trim() || null,
    menus: menus && menus.some(Boolean) ? menus : null,
    parteDe: f.parteDe || null,
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   EL MENÚ DE UN DÍA, EN LOCAL
   ══════════════════════════════════════════════════════════════════════════

   El menú de la variación no se guarda hasta «Guardar»: se edita en memoria
   con los MISMOS verbos que la dieta del cliente (`domain/menu`), para que
   una comida de aquí sea exactamente una comida de la dieta. Aquí solo queda
   a qué día (o a cuáles) va el cambio.
*/

/** Cambia el menú del día `i` (o el de todos, con el atajo puesto). */
export const conMenuCambiado = (f, i, cambio) => {
  if (f.mismoMenu) {
    const nuevo = cambio(f.menus[i] || []);
    return { ...f, menus: f.menus.map(() => structuredClone(nuevo)) };
  }
  return { ...f, menus: f.menus.map((m, j) => (j === i ? cambio(m || []) : m)) };
};
