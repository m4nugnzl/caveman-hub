import { useApp } from '@/context/AppContext';
import { entregaDelPeriodo, periodoAEntregar } from '@/domain/calendar';
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
  const semanasDelPeriodo = periodo?.everyWeeks || 1;
  /* La fila de ESTE periodo y no «la de este lunes en adelante»: una fila de
     una semana posterior —el entrenador cerrando la que viene mientras el
     cliente todavía debe la anterior— daba por entregada y revisada una semana
     que el cliente no había tocado. Ver `entregaDelPeriodo`. */
  const deEste = entregaDelPeriodo(entrega, semana, semanasDelPeriodo);

  return {
    periodo,
    /** El lunes del periodo que se entrega. */
    semana,
    /** Cuántas semanas naturales abarca ese periodo. */
    semanasDelPeriodo,
    /** La fila de `check_ins` de este periodo, entregada o en borrador. */
    deEste,
    yaEntregada: Boolean(deEste?.submittedAt),
    /** Revisada: ya no queda nada que hacer contra ella. */
    cerrada: Boolean(deEste?.reviewedAt),
    /*
      La semana de las FOTOS se cuenta desde su alta y no es la misma cifra que
      el lunes del periodo: una fecha para agrupar entregas, un ordinal para
      fechar fotos. Ver `domain/photos`.

      Se cuenta desde `semana` y no desde hoy: es la semana QUE SE ENTREGA. Con
      la ventana de gracia abierta no son la misma —hoy ya es la siguiente— y
      las fotos se sellaban con la de hoy mientras la entrega iba a la anterior.
      La pantalla que las sube y la lista que las cuenta tienen que decir la
      misma cifra, y ahora las dos salen de aquí.
    */
    semanaFoto: activeClient ? weekFromStart(activeClient.startDate, semana) : null,
  };
};
