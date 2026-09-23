import { useMemo } from 'react';

import { usePautaFechada } from '@/components/nutrition/usePautaFechada';
import { useReviewRows } from '@/components/review/useReviewRows';
import { useApp } from '@/context/AppContext';
import { planSnapshot } from '@/domain/reviews';
import { semanasDelPlan } from '@/domain/semanasDelPlan';
import { todayISO } from '@/lib/dates';

/**
 * Las semanas del plan del cliente activo (`semanasDelPlan`), con todo lo que
 * hace falta para calcularlas: sus fases, destinos y hechos, el peso, el
 * programa, las revisiones cerradas y la pauta fechada.
 *
 * Lo leen la espina de la revisión (`review/TimelineSpine`), el libro de sus
 * semanas y la tarjeta del Resumen: todos dibujan las mismas filas y no pueden
 * discrepar.
 *
 * @param reviews las revisiones, si quien llama ya las tiene cargadas (la
 *                revisión): así no se piden dos veces.
 * @param desde   el primer lunes que tiene que salir (`semanasDelPlan`).
 * @param phases  unas fases en lugar de las guardadas: la vista previa de un
 *                igualado dibuja el plan como quedaría.
 * @returns `{ plan, clientId, hoy }`; `plan` es `null` sin cliente activo.
 */
export const usePlanDelRoadmap = ({ reviews: dadas = null, desde = null, phases: fasesDadas = null } = {}) => {
  const { activeClient, phases: guardadas, anchors, hechos, anthropometry, workoutData, nutrition } = useApp();
  const clientId = activeClient?.id || null;
  const { rows: pedidas } = useReviewRows(dadas ? null : clientId, { conEnlaces: false });
  const reviews = dadas || pedidas;
  const phases = fasesDadas || guardadas;
  const versiones = usePautaFechada();
  const hoy = todayISO();

  const programa = workoutData?.[clientId] || null;
  const history = useMemo(() => anthropometry?.[clientId]?.history || [], [anthropometry, clientId]);
  const planDeHoy = useMemo(
    () => planSnapshot({ nutrition: nutrition?.[clientId], program: programa, client: activeClient }),
    [nutrition, clientId, programa, activeClient]
  );

  const plan = useMemo(
    () =>
      activeClient
        ? semanasDelPlan({
            phases,
            anchors,
            hechos,
            history,
            program: programa,
            client: activeClient,
            reviews,
            versions: versiones,
            plan: planDeHoy,
            desde,
            hoy,
          })
        : null,
    [phases, anchors, hechos, history, programa, activeClient, reviews, versiones, planDeHoy, desde, hoy]
  );

  return { plan, clientId, hoy };
};
