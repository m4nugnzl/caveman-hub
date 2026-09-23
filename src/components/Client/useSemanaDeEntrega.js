import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { entregaDelPeriodo, periodoAEntregar, periodoQueEmpieza } from '@/domain/calendar';
import { weekFromStart } from '@/domain/photos';
import { estadoDeRevision } from '@/domain/revisionesPasadas';
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
 *
 * ══ O una revisión PASADA, si la dirección la pide (23 sep 2026) ═══════════
 *
 * `?semana=<lunes>` abre una revisión que se quedó sin entregar —o entregada y
 * sin revisar— para completarla. La pide «Tus semanas» y la arrastran los pasos
 * del teléfono de pantalla en pantalla, así que la lista, el peso, las fotos y
 * el cuestionario guardan contra ESA semana sin saber que es una pasada.
 *
 * Su fila no está en `checkIns` del contexto, que guarda solo la última de cada
 * cliente: se pide el historial una vez y `recargar` lo vuelve a leer después
 * de entregar. Si la semana pedida no es una pasada —es la de hoy, o no existe
 * en su pauta— se ignora y manda el camino normal.
 */
export const useSemanaDeEntrega = () => {
  const { activeClient, checkIns, loadCheckInHistory } = useApp();
  const [params] = useSearchParams();
  const pedida = params.get('semana');
  const clienteId = activeClient?.id;

  /* `null` mientras no se ha leído: sin la fila, una entregada parecería sin
     entregar el primer instante. */
  const [historial, setHistorial] = useState(null);

  const recargar = useCallback(async () => {
    if (!clienteId || !pedida) return;
    const res = await loadCheckInHistory(clienteId);
    setHistorial(res.checkIns || []);
  }, [clienteId, pedida, loadCheckInHistory]);

  useEffect(() => {
    setHistorial(null);
    recargar();
  }, [recargar]);

  const hoy = todayISO();
  const entrega = checkIns?.[clienteId];

  const revision =
    activeClient && pedida
      ? estadoDeRevision({
          lunes: pedida,
          entregas: historial || [],
          preferences: activeClient.preferences,
          startDate: activeClient.startDate,
          hoy,
        })
      : null;

  if (revision?.pasada) {
    const deEste = revision.entrega;
    return {
      periodo: { ...periodoQueEmpieza(activeClient.preferences, revision.lunes, hoy), pasada: true },
      semana: revision.lunes,
      semanasDelPeriodo: revision.semanas,
      deEste,
      yaEntregada: Boolean(deEste?.submittedAt),
      /* Para una pasada, «cerrada» es lo que ya no se puede tocar: revisada o
         fuera de plazo. La pantalla dice cuál con `revision.motivo`. */
      cerrada: !revision.editable,
      semanaFoto: weekFromStart(activeClient.startDate, revision.lunes),
      revision,
      cargando: historial === null,
      recargar,
      /* Lo que los pasos del teléfono añaden a su dirección para no perder la
         semana por el camino. */
      consulta: `?semana=${revision.lunes}`,
    };
  }

  const periodo = activeClient
    ? periodoAEntregar({
        preferences: activeClient.preferences,
        startDate: activeClient.startDate,
        entrega,
        today: hoy,
      })
    : null;
  const semana = periodo?.start || weekStart(hoy);
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
    revision: null,
    cargando: false,
    recargar,
    consulta: '',
  };
};
