import { addDays, daysBetween, todayISO, toISODate } from '@/lib/dates';
import { sortPhases } from './roadmap';

/**
 * LAS FASES, ARRASTRADAS EN LA TEMPORADA: estirar una fase, hasta dónde se
 * puede mover cada borde y mover un inicio, sin React.
 *
 * Venían del creador del plan (`creadorDelPlan.js`, la pestaña Plan de la
 * ventana «El plan»). La ventana se retiró el 26 sep 2026 —todo el plan se
 * crea y se cambia desde la Temporada— y aquí queda lo que la Temporada usa.
 */

/** El tope de `plannedWeeks` (`blockTraits`): un bloque de un año no es un bloque. */
export const MAX_MICROCICLOS = 52;

const iso = (v) => toISODate(v);
const mayor = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

/* ══════════════════════════════════════════════════════════════════════════
   ESTIRAR UNA FASE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Lo que hace `estirar_fase` (0136), en memoria: la vista previa del arrastre
 * y la prueba de que la regla es la misma en los dos sitios.
 *
 * La fase acaba `dias` días más tarde (o antes, en negativo) y TODAS las que
 * empiezan detrás se mueven lo mismo. El destino, los bloques y las fases de
 * antes no se mueven.
 */
export const estirarFases = (phases, faseId, dias) => {
  const fase = (phases || []).find((f) => f.id === faseId);
  const fin = iso(fase?.endsOn);
  if (!fase || !fin || !dias) return phases;
  return phases.map((f) => {
    if (f.id === faseId) return { ...f, endsOn: addDays(fin, dias) };
    if (iso(f.startsOn) > fin) {
      return { ...f, startsOn: addDays(iso(f.startsOn), dias), endsOn: f.endsOn ? addDays(iso(f.endsOn), dias) : f.endsOn };
    }
    return f;
  });
};

/* ══════════════════════════════════════════════════════════════════════════
   LOS BORDES DE UNA FASE, ARRASTRADOS EN LA TEMPORADA (26 sep 2026)
   ══════════════════════════════════════════════════════════════════════════ */

/** El final más temprano de una fase: una semana como poco y, si ya empezó, hoy. */
const finMinimoDe = (fase, hoy) => {
  const inicio = iso(fase?.startsOn);
  return inicio <= hoy ? mayor(addDays(inicio, 6), hoy) : addDays(inicio, 6);
};

/* La fase de justo antes (la última que acaba antes de que empiece esta). */
const anteriorDe = (phases, fase) =>
  sortPhases(phases)
    .filter((f) => f.id !== fase.id && iso(f.endsOn) && iso(f.endsOn) < iso(fase.startsOn))
    .pop() || null;

/** Cuánto se puede mover cada borde, en días desde donde está. */
const TOPE_DIAS = 364;

/**
 * Hasta dónde se puede arrastrar cada borde de una fase, en días (negativo =
 * antes). `null` si ese borde no se arrastra:
 *
 *   · el FINAL, si la fase tiene final: se acorta hasta una semana de fase y,
 *     si ya empezó, nunca antes de hoy (lo vivido se juzgó con ella). Alargar
 *     empuja las de detrás (`estirar_fase`), así que no tiene tope propio.
 *   · el INICIO, solo en una fase que aún no ha empezado: lo vivido no se
 *     mueve. Si la anterior la toca (acaba el día antes), el borde es de las
 *     dos y la anterior no puede quedarse en menos de una semana ni acabar
 *     antes de hoy; si hay hueco, no puede comérselo entero. Nunca antes de hoy.
 */
export const bordesDeFase = (phases, faseId, hoy = todayISO()) => {
  const fase = (phases || []).find((f) => f.id === faseId);
  const inicio = iso(fase?.startsOn);
  if (!fase || !inicio) return { inicio: null, fin: null };
  const fin = iso(fase.endsOn);

  const deFin = fin ? { min: Math.min(0, daysBetween(fin, finMinimoDe(fase, hoy)) ?? 0), max: TOPE_DIAS } : null;

  let deInicio = null;
  if (inicio > hoy) {
    const max = fin ? Math.max(0, daysBetween(inicio, addDays(fin, -6)) ?? 0) : TOPE_DIAS;
    const anterior = anteriorDe(phases, fase);
    let suelo = hoy;
    if (anterior) {
      const pegada = addDays(iso(anterior.endsOn), 1) === inicio;
      suelo = mayor(suelo, pegada ? addDays(finMinimoDe(anterior, hoy), 1) : addDays(iso(anterior.endsOn), 1));
    }
    deInicio = { min: Math.min(0, daysBetween(inicio, suelo) ?? 0), max };
  }
  return { inicio: deInicio, fin: deFin };
};

/**
 * Mover el INICIO de una fase `dias` días. Si la anterior la toca, su final va
 * con él: es el mismo borde. No empuja nada más.
 *
 * @returns `{ fases, pasos }`: las fases como quedarían (la vista previa) y
 *   las escrituras en el orden que no pisa a la otra —si el borde va antes,
 *   primero se acorta la anterior; si va después, primero se mueve esta—.
 *   Cada paso, `{ id, campos, antes }`. `{ error }` si se sale de sus bordes.
 */
export const moverInicioDeFase = (phases, faseId, dias, hoy = todayISO()) => {
  const fase = (phases || []).find((f) => f.id === faseId);
  const { inicio: limites } = bordesDeFase(phases, faseId, hoy);
  if (!fase || !limites) return { error: 'Esa fase ya empezó: su inicio no se mueve.' };
  if (!dias) return { fases: phases, pasos: [] };
  if (dias < limites.min || dias > limites.max) return { error: 'Así la fase, o la de antes, se quedaría en menos de una semana.' };

  const nuevo = addDays(iso(fase.startsOn), dias);
  const anterior = anteriorDe(phases, fase);
  const pegada = anterior && addDays(iso(anterior.endsOn), 1) === iso(fase.startsOn);
  const deEsta = { id: fase.id, campos: { startsOn: nuevo }, antes: { startsOn: iso(fase.startsOn) } };
  const deLaAnterior = pegada
    ? { id: anterior.id, campos: { endsOn: addDays(nuevo, -1) }, antes: { endsOn: iso(anterior.endsOn) } }
    : null;
  const pasos = deLaAnterior ? (dias < 0 ? [deLaAnterior, deEsta] : [deEsta, deLaAnterior]) : [deEsta];
  const porId = new Map(pasos.map((p) => [p.id, p.campos]));
  return { fases: phases.map((f) => (porId.has(f.id) ? { ...f, ...porId.get(f.id) } : f)), pasos };
};
