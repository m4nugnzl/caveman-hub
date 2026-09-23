/**
 * EL DÍA DE UNA SESIÓN: qué días puede llevar y quién puede cambiarlo.
 *
 * ══ Por qué existe (23 sep 2026) ═══════════════════════════════════════════
 *
 * Una sesión nace con la fecha del día en que se apunta su primera serie. Si
 * el cliente entrenó el martes y lo apuntó el miércoles, la sesión decía
 * miércoles, y ni él ni su entrenador tenían un sitio sencillo donde ponerle
 * el día: el entrenador solo desde el panel de la semana, el cliente nunca.
 *
 * Ahora los dos lo cambian con el mismo calendario, y las reglas viven aquí,
 * UNA vez, para los dos.
 *
 * ══ Qué días valen (segunda vuelta, 23 sep) ════════════════════════════════
 *
 * La primera versión encerraba la sesión en las semanas de su microciclo, y el
 * dueño lo corrigió con un caso real: el cliente se va dos semanas de
 * vacaciones y al volver hace la sesión que tenía pendiente. Esa sesión sigue
 * siendo de su microciclo aunque caiga dos semanas después. Lo que no puede
 * pasar es que un microciclo quede con fechas anteriores a otro:
 *
 *   · Hacia atrás, ni antes de que empiece su microciclo (`micro.date`) ni
 *     antes de la última sesión registrada del microciclo anterior.
 *   · Hacia delante, ni un día que no ha llegado ni después de la primera
 *     sesión registrada del microciclo siguiente, si la hay.
 *   · Un día que ya tiene otra sesión de la misma hoja NO se pisa: las dos
 *     conviven, igual que con «Otra sesión de este día».
 *   · Cambiar el día no mueve nada más: ni microciclos, ni semanas del
 *     roadmap, ni otras sesiones.
 *   · El cliente, con el mismo criterio que las revisiones: lo que su
 *     entrenador ya ha revisado queda cerrado (`puedeTocarLaSemana`, que es la
 *     cuenta de `semana_cerrada_al_cliente` en la base).
 *
 * La base repite las reglas en `log_session_date` (0135): esto es lo que evita
 * ofrecer un día que el servidor va a rechazar.
 */

import { addDays, addMonths, toISODate, todayISO, weekStart } from '@/lib/dates';
import { MARGEN_SEMANAS, estadoDeRevision } from './revisionesPasadas';
import { sessionSetCount, sessionsOf, sessionsOfDay } from './sessions';

const fechasDe = (micro) =>
  sessionsOf(micro)
    .map((s) => toISODate(s.date))
    .filter(Boolean)
    .sort();

/**
 * Entre qué días puede caer una sesión del microciclo `weekNumber`.
 *
 * @returns `{ desde, hasta }`, los dos incluidos: `desde` es `null` si no hay
 *   nada que lo fije (un programa viejo sin fecha en sus microciclos), y
 *   `hasta` nunca pasa de hoy.
 */
export const limitesDeLaSesion = (microcycles = [], weekNumber, hoy = todayISO()) => {
  const ordenados = [...microcycles].sort((a, b) => a.weekNumber - b.weekNumber);
  const i = ordenados.findIndex((m) => m.weekNumber === weekNumber);
  if (i < 0) return { desde: null, hasta: hoy };
  const empieza = toISODate(ordenados[i].date);
  const ultimaDelAnterior = fechasDe(ordenados[i - 1]).at(-1) || null;
  const primeraDelSiguiente = fechasDe(ordenados[i + 1])[0] || null;
  const desde = [empieza, ultimaDelAnterior].filter(Boolean).sort().at(-1) || null;
  const hasta = primeraDelSiguiente && primeraDelSiguiente < hoy ? primeraDelSiguiente : hoy;
  return { desde, hasta };
};

/** ¿Cabe ese día en esos límites? */
export const diaElegible = (fecha, { desde, hasta }) =>
  Boolean(fecha) && (!desde || fecha >= desde) && fecha <= hasta;

/** El día 1 del mes de una fecha: la clave con la que el calendario pasa página. */
export const mesDe = (fecha) => `${String(toISODate(fecha) || todayISO()).slice(0, 7)}-01`;

export const otroMes = (mes, n) => addMonths(mes, n);

/**
 * Las semanas que pinta el calendario para un mes: de lunes a domingo, desde
 * la que contiene el día 1 hasta la que contiene el último. Cuatro, cinco o
 * seis filas de siete días ISO.
 */
export const semanasDelMes = (mes) => {
  const ultimo = addDays(addMonths(mes, 1), -1);
  const semanas = [];
  for (let lunes = weekStart(mes); lunes <= ultimo; lunes = addDays(lunes, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, d) => addDays(lunes, d)));
  }
  return semanas;
};

/**
 * ¿Puede esta persona cambiarle el día a la sesión? `null` si puede; si no,
 * por qué, en una línea que se puede enseñar tal cual.
 */
export const porQueNoSeMueve = ({ session, esCliente = false, entregas = [], preferences, startDate = null, hoy = todayISO() }) => {
  /* El registro de antes de las sesiones no es una sesión: su día es el del
     microciclo y no hay dónde guardarle otro. */
  if (session?.isLegacy) return 'Es un registro antiguo: su día es el de su microciclo.';
  if (!session || !session.id) return 'Esta sesión todavía no se ha guardado.';
  if (!esCliente || !session.date) return null;
  /* La cuenta de `puedeTocarLaSemana`, pero diciendo cuál de las dos
     fronteras es: no es lo mismo «ya la revisó» que «queda muy atrás». */
  const estado = estadoDeRevision({ lunes: session.date, entregas, preferences, startDate, hoy });
  const cerrada = estado ? !estado.editable && estado.estado === 'cerrada' : false;
  if (cerrada) return 'Tu entrenador ya ha revisado esa semana. Si hay que cambiar el día, díselo.';
  const dentro = estado
    ? estado.editable
    : weekStart(session.date) >= addDays(weekStart(hoy), -MARGEN_SEMANAS * 7);
  return dentro ? null : 'Esa semana queda fuera de plazo. Si hay que cambiar el día, díselo a tu entrenador.';
};

/**
 * Cómo va una sesión, con las palabras y los tonos del chip de estado de las
 * tarjetas del bloque (`.plan-col-estado`): hecha si se cerró o tiene todas
 * sus series, abierta mientras no.
 */
export const estadoDeLaSesion = (session, seriesPautadas = 0) => {
  const hechas = session ? sessionSetCount(session) : 0;
  if (session?.endedAt || (seriesPautadas > 0 && hechas >= seriesPautadas)) return { tono: 'ok', texto: 'hecha' };
  if (hechas === 0) return { tono: 'aun', texto: 'abierta' };
  return { tono: 'warn', texto: `abierta · ${hechas}/${seriesPautadas}` };
};

/**
 * La escritura, la misma para los dos: la sesión con su día nuevo. Si la
 * cambia el cliente queda dicho (`fechaPor: 'cliente'`), para que su entrenador
 * lo vea en el panel de la sesión; si la cambia el entrenador, la marca se va.
 */
export const conFechaDeSesion = (micro, sessionId, fecha, { porCliente = false } = {}) => ({
  ...micro,
  sessions: (micro?.sessions || []).map((s) => {
    if (s.id !== sessionId) return s;
    const { fechaPor: _fuera, ...resto } = s;
    return porCliente ? { ...resto, date: fecha, fechaPor: 'cliente' } : { ...resto, date: fecha };
  }),
});

/**
 * Los días que ya tienen otra sesión de la misma hoja, en todo el programa: el
 * calendario ya no se queda en su microciclo, así que la sesión de la hoja en
 * el siguiente también puede caer a la vista. Se marcan, no se pisan.
 */
export const diasConOtraSesion = (microcycles = [], dayName, sessionId) =>
  new Set(
    microcycles
      .flatMap((m) => sessionsOfDay(m, dayName))
      .filter((s) => s.id !== sessionId && s.date)
      .map((s) => toISODate(s.date))
  );
