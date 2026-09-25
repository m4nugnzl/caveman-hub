import { blocksOf, tramoDelBloque } from './blocks';
import { daysBetween } from '@/lib/dates';

/**
 * LOS BLOQUES DE UNA PERSONA COMO LÍNEA DE TIEMPO (24 sep 2026).
 *
 * La lista de bloques (`?v=lista`) se pinta como un historial vertical: un
 * raíl con un punto por bloque. Aquí vive lo que no es pintura —el orden y
 * dónde se corta el raíl— para que se pueda probar sin montar la pantalla.
 *
 * ══ El orden ═══════════════════════════════════════════════════════════════
 * De lo que viene a lo que pasó: arriba lo previsto (los borradores, en su
 * orden), luego el bloque abierto, y debajo los cerrados del más reciente al
 * más antiguo. `fromWeek` y no la fecha, que un microciclo puede no tenerla.
 *
 * ══ Las pausas ═════════════════════════════════════════════════════════════
 * Entre dos bloques seguidos puede haber semanas enteras sin microciclos: se
 * fue de vacaciones, se lesionó, lo dejó y volvió. La línea lo dice cortando el
 * raíl, con las fechas de `tramoDelBloque` —el hueco entre el último día del
 * anterior y el primero del siguiente—. Solo semanas ENTERAS: tres días de
 * margen entre bloques no son una pausa. Y nunca con fechas estimadas: esas
 * salen de la cuenta del alta, que supone justo que no hubo pausas.
 */

const abiertoEs = (b) => b?.toWeek === null || b?.toWeek === undefined;

/** Semanas enteras sin microciclos entre el final de un tramo y el principio del siguiente. */
export const semanasSinEntrenar = (anterior, siguiente) => {
  if (!anterior || !siguiente || anterior.estimado || siguiente.estimado) return 0;
  const dias = daysBetween(anterior.hasta, siguiente.desde);
  if (dias === null) return 0;
  return Math.max(0, Math.floor((dias - 1) / 7));
};

/**
 * La línea, de arriba abajo.
 *
 * @param borradores los bloques previstos, ya en su orden (`borradoresDe`).
 * @param opciones   `{ cycleType, cyclePattern, startDate }` del cliente.
 * @returns `[{ tipo: 'borrador', bloque } | { tipo: 'bloque', bloque, tramo, abierto }
 *   | { tipo: 'pausa', semanas, key }]`
 */
export const lineaDeBloques = (program, { borradores = [], opciones = {} } = {}) => {
  const bloques = blocksOf(program)
    .map((b) => ({ tipo: 'bloque', bloque: b, tramo: tramoDelBloque(program, b, opciones), abierto: abiertoEs(b) }))
    .sort((x, y) => Number(y.abierto) - Number(x.abierto) || (y.bloque.fromWeek ?? 0) - (x.bloque.fromWeek ?? 0));

  const linea = borradores.map((b) => ({ tipo: 'borrador', bloque: b }));
  bloques.forEach((item, i) => {
    linea.push(item);
    const anterior = bloques[i + 1];
    const semanas = anterior ? semanasSinEntrenar(anterior.tramo, item.tramo) : 0;
    if (semanas > 0) linea.push({ tipo: 'pausa', semanas, key: `pausa-${anterior.bloque.id}-${item.bloque.id}` });
  });
  return linea;
};

/**
 * La cuenta de la cabecera: cuántos bloques y cuántas semanas desde el primer
 * día. Con un bloque abierto se cuenta hasta hoy; sin él, hasta el último día
 * entrenado, que es donde acaba la historia.
 */
export const resumenDeLaLinea = (linea, hoy) => {
  const bloques = linea.filter((i) => i.tipo === 'bloque');
  const tramos = bloques.map((i) => i.tramo).filter(Boolean);
  const desde = tramos.map((t) => t.desde).sort()[0] || null;
  const hastaUltimo = tramos.map((t) => t.hasta).sort().at(-1) || null;
  const fin = bloques.some((i) => i.abierto) ? hoy : hastaUltimo;
  const dias = desde && fin ? daysBetween(desde, fin) : null;
  return {
    bloques: bloques.length,
    desde,
    semanas: dias === null ? null : Math.max(0, Math.floor(dias / 7)),
  };
};
