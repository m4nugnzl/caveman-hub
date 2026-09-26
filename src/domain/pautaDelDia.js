/**
 * LA PAUTA DE UN DÍA: qué kcal, macros y pasos le tocaban a una fecha concreta
 * (24 sep 2026).
 *
 * ══ De dónde sale ══════════════════════════════════════════════════════════
 *
 *   1. Si un REFEED o un DIET BREAK cubre la fecha, lo suyo. Son pauta de unos
 *      días concretos y viven en el calendario (`client_events`, 0123 y 0142):
 *      la dieta solo se fecha «desde hoy», así que no pueden vivir en ella.
 *   2. Si no, el TIPO DE DÍA que tocaba en la dieta vigente esa semana: la
 *      versión fechada (`nutrition_plan_versions`, 0124) trae los tipos con sus
 *      casillas, y la casilla de cada fecha la da el ciclo del cliente.
 *   3. Si la semana no guarda sus tipos (fotos viejas), la media: se dice.
 *
 * La leen la línea de tiempo (Rango y Semana) y la leerá el Calendario. Una
 * sola cuenta: si cada pantalla decidiera la pauta de un día a su manera,
 * acabarían enseñando dos cifras para el mismo martes.
 *
 * ══ Límites que se aceptan ═════════════════════════════════════════════════
 * Con ciclo rotativo, la casilla de una fecha pasada se calcula con el punto de
 * arranque del ciclo de HOY: es aproximada. Con ciclo semanal, exacta.
 *
 * ══ Lo que no hace ═════════════════════════════════════════════════════════
 * No compara con lo comido ni juzga: enseña lo que se pautó.
 */

import { addDays, daysBetween } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { clientCycleSlots, semanaDelCliente } from './blocks';
import { KCAL_PER_GRAM } from './nutrition';

/** Los hechos que son PAUTA de la dieta, no contexto: van en el carril de Kcal. */
export const PAUTA_KINDS = ['refeed', 'diet_break'];

/** ¿Este evento es un refeed o un diet break? */
export const esIntervencion = (evento) => PAUTA_KINDS.includes(evento?.kind);

/**
 * Las kcal de unas macros, 4/4/9. `null` si falta alguna: con dos no hay
 * cuenta. Es la misma que hace la base al guardar (0142), para que la pantalla
 * enseñe lo que se va a guardar antes de guardarlo.
 */
export const kcalDeMacros = ({ protein, carbs, fats } = {}) => {
  const [p, c, g] = [toNum(protein), toNum(carbs), toNum(fats)];
  if (p === null || c === null || g === null) return null;
  return Math.round(p * KCAL_PER_GRAM.protein + c * KCAL_PER_GRAM.carbs + g * KCAL_PER_GRAM.fats);
};

/**
 * Lo que pide un refeed o un diet break: `{ kcals, protein, carbs, fats }`.
 * Si es escalonado (`pautaDias`, 0143), lo del día `fecha`; sin fecha, o
 * fuera de sus días, lo del primero.
 */
export const pautaDeIntervencion = (evento, fecha = null) => {
  const dias = evento?.pautaDias;
  if (Array.isArray(dias) && dias.length) {
    const i = fecha ? (daysBetween(evento.date, fecha) ?? 0) : 0;
    const d = dias[Math.min(Math.max(i, 0), dias.length - 1)] || {};
    return { kcals: toNum(d.kcal), protein: toNum(d.proteina), carbs: toNum(d.carbohidratos), fats: toNum(d.grasa) };
  }
  return {
    kcals: toNum(evento?.kcal),
    protein: toNum(evento?.proteina),
    carbs: toNum(evento?.carbohidratos),
    fats: toNum(evento?.grasa),
  };
};

/**
 * Las kcal de un refeed o diet break, una por escalón: `[3570]` si todos sus
 * días piden lo mismo, `[3000, 3300, 3600]` si es escalonado. Vacío si no
 * tiene kcal apuntadas.
 */
export const kcalsDeIntervencion = (evento) => {
  const escalonado = Array.isArray(evento?.pautaDias) && evento.pautaDias.length > 0;
  const kcals = escalonado ? evento.pautaDias.map((d) => toNum(d?.kcal)) : [toNum(evento?.kcal)];
  return kcals.filter((v) => v !== null && v > 0);
};

/** El último día de un evento, incluido. */
const finDe = (e) => (e?.hasta && e.hasta > e.date ? e.hasta : e?.date);

/**
 * El refeed o diet break que cubre una fecha, o `null`. Si dos se pisan, el
 * que empieza más tarde: es el más concreto.
 */
export const intervencionDelDia = (hechos, fecha) => {
  let elegida = null;
  for (const e of hechos || []) {
    if (!esIntervencion(e) || !e.date || e.date > fecha || finDe(e) < fecha) continue;
    if (!elegida || e.date >= elegida.date) elegida = e;
  }
  return elegida;
};

/**
 * LO QUE LE TOCA HOY AL CLIENTE si un refeed o un diet break cubre el día
 * (25 sep 2026): su pauta de ESE día (la de su escalón, si es escalonado) y la
 * indicación que le dejó su entrenador. La dieta de hoy del cliente la enseña
 * en lugar de la del plan. El menú de ese día es el SUYO (0144) o ninguno:
 * el de la base es de otras cifras y no se enseña (26 sep).
 *
 * Solo lo que el cliente puede ver: el motivo del entrenador vive en otra
 * tabla (`client_interventions`) y aquí no llega.
 *
 * Va con la FECHA, no con la dieta: un ciclo repite la misma dieta varios
 * días y el refeed solo cae en los suyos. Sin fecha (en el monitor se elige
 * una dieta, no un día) no hay ninguno.
 *
 * @returns `{ kind, nombre, dia, dias, kcals, protein, carbs, fats, macros,
 *   nota, menu }` o `null`. `dia` cuenta desde 1; `macros`, si trae las tres;
 *   `menu`, las comidas de ese día o `null` si ese día no tiene.
 */
export const pautaEspecialDelDia = (hechos, fecha) => {
  if (!fecha) return null;
  const e = intervencionDelDia(hechos, fecha);
  if (!e) return null;
  const p = pautaDeIntervencion(e, fecha);
  const i = daysBetween(e.date, fecha) ?? 0;
  return {
    kind: e.kind,
    nombre: e.kind === 'refeed' ? 'Refeed' : 'Diet break',
    dia: i + 1,
    dias: (daysBetween(e.date, finDe(e)) ?? 0) + 1,
    ...p,
    macros: p.protein !== null && p.carbs !== null && p.fats !== null,
    nota: String(e.nota ?? '').trim() || null,
    menu: Array.isArray(e.menus?.[i]) && e.menus[i].length ? e.menus[i] : null,
  };
};

/** Los refeeds y diet breaks que tocan un tramo de días, en orden. */
export const intervencionesEntre = (hechos, desde, hasta) =>
  (hechos || [])
    .filter((e) => esIntervencion(e) && e.date && e.date <= hasta && finDe(e) >= desde)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

/**
 * La casilla del ciclo de cada día de una semana: `Map<fecha, clave>`.
 *
 * Semanal: el día de la semana. Rotativo: la vuelta del ciclo contada desde su
 * arranque (aproximado en el pasado, ver la cabecera). Vacío si no se puede
 * saber.
 */
export const casillasDeLaSemana = (client, program, lunes) => {
  const slots = clientCycleSlots(client, program);
  const semana = semanaDelCliente(client, program, slots, lunes) || [];
  return new Map(semana.map((d) => [d.fecha, d.key]));
};

/**
 * La pauta de cada día de una semana.
 *
 * @param semana   una fila de `semanasDelPlan` (su `pauta`, con `tipos`).
 * @param hechos   los eventos del cliente (se miran solo refeeds y diet breaks).
 * @param casillas `casillasDeLaSemana(...)`.
 * @returns siete `{ fecha, kcals, protein, carbs, fats, steps, tipo,
 *   intervencion, exacto }`. `tipo` es el nombre del día de la dieta;
 *   `exacto` es falso cuando solo se sabe la media de la semana.
 */
export const pautaDeLosDias = ({ semana, hechos = [], casillas = new Map() }) => {
  const pauta = semana?.pauta || null;
  const tipos = pauta?.tipos || [];
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = addDays(semana.lunes, i);
    const clave = casillas.get(fecha) ?? null;
    /* Con un solo tipo, ese; con varios, el de su casilla. */
    const tipo = tipos.length === 1 ? tipos[0] : tipos.find((t) => clave !== null && t.casillas?.includes(clave)) || null;
    const base = tipo
      ? { kcals: tipo.kcals, protein: tipo.protein, carbs: tipo.carbs, fats: tipo.fats, steps: tipo.steps ?? pauta?.steps ?? null }
      : pauta
        ? { kcals: pauta.kcals, protein: pauta.protein, carbs: pauta.carbs, fats: pauta.fats, steps: pauta.steps }
        : { kcals: null, protein: null, carbs: null, fats: null, steps: null };
    const intervencion = intervencionDelDia(hechos, fecha);
    if (intervencion) {
      const suya = pautaDeIntervencion(intervencion, fecha);
      /* Un refeed cambia la comida, no los pasos. Sin kcal apuntadas, se sabe
         que hubo refeed pero no cuánto. */
      return {
        fecha,
        ...suya,
        steps: base.steps,
        tipo: null,
        intervencion,
        exacto: true,
      };
    }
    return {
      fecha,
      ...base,
      tipo: tipo && tipos.length > 1 ? tipo.n : null,
      intervencion: null,
      exacto: Boolean(tipo) || (pauta !== null && !pauta.soloMedia),
    };
  });
};

/**
 * La pauta de una semana POR TIPO DE DÍA: `[{ n, kcals, protein, carbs, fats,
 * steps, dias }]`, del que más kcal pide al que menos.
 *
 * `dias` son los días de ESA semana que le tocan, contados con las casillas;
 * sin ellas, las casillas del ciclo que guardó la foto. Con un solo tipo, la
 * lista tiene uno. Vacía si la semana no tiene pauta o solo tiene la media.
 */
export const tiposDeLaSemana = ({ semana, casillas = new Map() }) => {
  const tipos = semana?.pauta?.tipos || [];
  if (tipos.length === 0) return [];
  const claves = Array.from({ length: 7 }, (_, i) => casillas.get(addDays(semana.lunes, i)) ?? null);
  const conCasillas = claves.some((c) => c !== null) && tipos.some((t) => t.casillas?.length);
  return tipos
    .map((t) => ({
      n: t.n,
      kcals: t.kcals,
      protein: t.protein,
      carbs: t.carbs,
      fats: t.fats,
      steps: t.steps ?? semana.pauta.steps ?? null,
      dias:
        tipos.length === 1
          ? 7
          : conCasillas
            ? claves.filter((c) => c !== null && t.casillas?.includes(c)).length
            : t.dias ?? t.casillas?.length ?? null,
    }))
    .filter((t) => t.dias === null || t.dias > 0)
    .sort((a, b) => (b.kcals ?? 0) - (a.kcals ?? 0));
};

/**
 * Gramos por kilo, con el peso medio REAL de la semana. `null` sin peso o sin
 * gramos.
 */
export const gPorKg = (gramos, peso) => {
  const g = toNum(gramos);
  const kg = toNum(peso);
  return g === null || kg === null || kg <= 0 ? null : g / kg;
};
