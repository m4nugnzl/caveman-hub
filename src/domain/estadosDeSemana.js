/**
 * LAS CINCO FORMAS DE UNA SEMANA en la portada de Revisiones.
 *
 * ══ Qué contesta ═══════════════════════════════════════════════════════════
 *
 * Para cada semana de `semanasDelPlan`, en qué punto está su revisión:
 *
 *   · `pendiente`  te toca a ti. Es lo MISMO que pide la cola de Inicio
 *                  (`reviewState` en `ready` o `missing`): una entrega sin
 *                  contestar, sea de la semana que sea, o el periodo vigente
 *                  que ya llegó a su día sin nada entregado.
 *   · `revisada`   la cerraste: hay entrega con `reviewedAt` o revisión
 *                  guardada en su periodo.
 *   · `curso`      la de hoy, sin nada que hacer todavía.
 *   · `sin`        pasó sin check-in y ya no la pide nadie.
 *   · `futura`     no ha llegado.
 *
 * No juzga la semana: dice en qué punto está su revisión. Si fue bien o mal
 * lo dicen las cifras de la casilla, no su forma.
 *
 * ══ El periodo, no la semana ═══════════════════════════════════════════════
 *
 * Con cadencia quincenal, las dos semanas de un periodo son UNA entrega, que
 * se archiva en el lunes del periodo. Por eso el estado se calcula por periodo
 * (`periodStartOf`, la misma cuenta que la cola) y se reparte a sus semanas, y
 * cada una lleva `periodo` para que la portada las pinte pegadas.
 *
 * ══ Lo que NO toca ═════════════════════════════════════════════════════════
 *
 * Ni `reviewableWeeks`, ni el cierre, ni `planSnapshot`. Es una lectura de lo
 * que ya existe: las entregas crudas (`useReviewRows().checkIns`), las
 * revisiones cerradas y el periodo vigente.
 */

import { addDays, daysBetween, todayISO, weekStart } from '@/lib/dates';
import { checkInSchedule, currentCheckInPeriod, periodStartOf } from './calendar';
import { weekFromStart } from './photos';

export const ESTADOS_DE_SEMANA = ['revisada', 'pendiente', 'curso', 'sin', 'futura'];

/*
  La cola solo existe para quien tiene cuenta y no está en pausa: son las dos
  guardas de `reviewState` antes de mirar nada más. Sin ellas la portada
  pintaría de azul una semana que Inicio no pide.
*/
const colaActiva = (client) => Boolean(client?.clientProfileId) && client?.status !== 'paused';

/**
 * @param semanas    `semanasDelPlan().semanas`.
 * @param entregas   las filas crudas de `check_ins` de esta persona.
 * @param revisiones las revisiones cerradas (`reviewHistory`), con `weekStart`.
 * @param client     la ficha: su pauta de entregas, su alta, su cuenta y su pausa.
 * @returns `{ semanas, porLunes, pendientes, aRevisar }`. `semanas` son las
 *   mismas filas con `revision5` (el estado), `periodo`, `entrega` y `numero`;
 *   `pendientes`, los lunes de periodo pendientes, del más reciente al más
 *   antiguo; `aRevisar`, el primero de ellos o `null`.
 */
export const estadosDeSemana = ({
  semanas = [],
  entregas = [],
  revisiones = [],
  client = null,
  hoy = todayISO(),
} = {}) => {
  const pauta = checkInSchedule(client?.preferences);
  const cada = pauta.weekday === null ? 1 : pauta.everyWeeks;
  const ancla = weekStart(client?.startDate) || weekStart(hoy);
  const vigente = currentCheckInPeriod(client?.preferences, client?.startDate, hoy);
  const activa = colaActiva(client);

  /* El lunes de periodo de cada semana. Antes del alta, o sin pauta, cada
     semana es su propio periodo. */
  const inicioDe = (lunes) => (pauta.weekday === null ? lunes : periodStartOf(lunes, ancla, cada) || lunes);
  const largoDe = (inicio) => (pauta.weekday === null || inicio < ancla ? 1 : cada);

  const dentro = (fecha, inicio) => {
    const f = weekStart(fecha);
    return Boolean(f) && f >= inicio && f < addDays(inicio, largoDe(inicio) * 7);
  };

  const periodos = new Map();
  const periodoDe = (inicio, filas) => {
    if (periodos.has(inicio)) return periodos.get(inicio);
    const suyas = entregas.filter((e) => e?.weekStart && dentro(e.weekStart, inicio));
    const revisada =
      suyas.some((e) => e.reviewedAt) || revisiones.some((r) => r?.weekStart && dentro(r.weekStart, inicio));
    const sinContestar = suyas.find((e) => e.submittedAt && !e.reviewedAt) || null;
    const entregada = suyas.some((e) => e.submittedAt || e.reviewedAt);
    const pedida = Boolean(vigente?.isDue) && vigente.start === inicio && !entregada;

    let estado;
    if (activa && (sinContestar || pedida)) estado = 'pendiente';
    else if (revisada) estado = 'revisada';
    else if (filas.some((s) => s.estado === 'hoy')) estado = 'curso';
    else if (filas.every((s) => s.estado === 'futura')) estado = 'futura';
    else estado = 'sin';

    const p = {
      inicio,
      semanas: largoDe(inicio),
      estado,
      /* Si la pendiente es porque entregó o porque no lo ha hecho: la casilla
         es la misma, y el texto dice «Entregó» o «Sin subir». */
      entregada: Boolean(sinContestar),
      entrega: sinContestar || suyas.find((e) => e.reviewedAt) || suyas[0] || null,
    };
    periodos.set(inicio, p);
    return p;
  };

  /* Las filas de cada periodo, para decidir «en curso» y «futura» mirando el
     periodo entero y no la semana suelta. */
  const porInicio = new Map();
  for (const s of semanas) {
    const inicio = inicioDe(s.lunes);
    if (!porInicio.has(inicio)) porInicio.set(inicio, []);
    porInicio.get(inicio).push(s);
  }

  const filas = semanas.map((s) => {
    const inicio = inicioDe(s.lunes);
    const p = periodoDe(inicio, porInicio.get(inicio));
    /* La mitad futura de un periodo que aún no ha llegado se queda futura: el
       periodo pendiente o en curso se lee en su primera semana. */
    const estado = s.estado === 'futura' && p.estado === 'sin' ? 'futura' : p.estado;
    return {
      ...s,
      revision5: estado,
      numero: weekFromStart(client?.startDate, s.lunes),
      periodo: {
        inicio,
        semanas: p.semanas,
        posicion: Math.round((daysBetween(inicio, s.lunes) || 0) / 7),
      },
      entrega: p.entrega,
      entregada: p.entregada,
    };
  });

  /*
    Las pendientes, de periodo en periodo. Incluye las entregas viejas sin
    contestar aunque caigan fuera del plan que se dibuja: la frase de arriba
    las cuenta («y 1 más sin contestar») aunque no tengan casilla.
  */
  const pendientes = new Set(filas.filter((s) => s.revision5 === 'pendiente').map((s) => s.periodo.inicio));
  if (activa) {
    for (const e of entregas) {
      if (e?.weekStart && e.submittedAt && !e.reviewedAt) pendientes.add(inicioDe(weekStart(e.weekStart)));
    }
  }
  const lista = [...pendientes].sort((a, b) => b.localeCompare(a));

  return {
    semanas: filas,
    porLunes: new Map(filas.map((s) => [s.lunes, s])),
    pendientes: lista,
    aRevisar: lista[0] || null,
  };
};
