import { useApp } from '@/context/AppContext';
import { periodoAEntregar } from '@/domain/calendar';
import { weekFromStart } from '@/domain/photos';
import { todayISO, weekStart } from '@/lib/dates';

/**
 * LA SEMANA QUE SE ENTREGA, y en qué punto está su entrega.
 *
 * Vivía dentro de `ClientRevisionRoute`. Desde el teléfono del 18 sep la
 * revisión se hace en tres pantallas —la lista, las fotos, el cuestionario— y
 * las tres tienen que hablar del MISMO periodo: si el cuestionario guardara
 * contra el lunes de hoy y la entrega contra el del periodo abierto, las
 * respuestas se quedarían en una fila que nadie entrega.
 *
 * Es el lunes del periodo ABIERTO, no el de esta semana (ver
 * `periodoAEntregar`): con cadencia quincenal el periodo empezó hace dos, y
 * con la ventana de gracia abierta la entrega todavía va a la anterior.
 */
export const useSemanaDeEntrega = () => {
  const { activeClient, checkIns } = useApp();

  const entrega = checkIns?.[activeClient?.id];
  const periodo = activeClient
    ? periodoAEntregar({
        preferences: activeClient.preferences,
        startDate: activeClient.startDate,
        entrega,
        today: todayISO(),
      })
    : null;
  const semana = periodo?.start || weekStart(todayISO());
  const deEste = entrega?.weekStart >= semana ? entrega : null;

  return {
    periodo,
    /** El lunes del periodo que se entrega. */
    semana,
    /** Cuántas semanas naturales abarca ese periodo. */
    semanasDelPeriodo: periodo?.everyWeeks || 1,
    /** La fila de `check_ins` de este periodo, entregada o en borrador. */
    deEste,
    yaEntregada: Boolean(deEste?.submittedAt),
    /** Revisada: ya no queda nada que hacer contra ella. */
    cerrada: Boolean(deEste?.reviewedAt),
    /* La semana de las FOTOS se cuenta desde su alta y no es la misma cifra que
       el lunes del periodo: una fecha para agrupar entregas, un ordinal para
       fechar fotos. Ver `domain/photos`. */
    semanaFoto: activeClient ? weekFromStart(activeClient.startDate, todayISO()) : null,
  };
};
