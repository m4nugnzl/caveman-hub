import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { estadosDeSemana } from '@/domain/estadosDeSemana';
import { usePlanDelRoadmap } from '@/components/roadmap/usePlanDelRoadmap';

/**
 * Las semanas de Revisiones del cliente activo: las filas del plan
 * (`semanasDelPlan`) con el estado de su revisión (`estadosDeSemana`).
 *
 * Lo leen la portada y la semana, y por eso vive aparte: las dos tienen que
 * contar lo mismo, y la semana necesita saber de su casilla si es la que
 * espera tu respuesta para enseñar o no la barra de cierre.
 *
 * @param revisiones las revisiones cerradas (`useReviewRows().rows`).
 * @param entregas   las filas crudas de `check_ins` (`useReviewRows().checkIns`).
 */
export const useSemanasDeRevision = ({ revisiones = [], entregas = [] } = {}) => {
  const { activeClient, workoutData } = useApp();

  /*
    Desde su primera entrega, aunque sea de antes de la temporada: una entrega
    vieja sin contestar tiene que tener casilla.

    ── Y desde su primer MICROCICLO ────────────────────────────────────────
    Porque desde que Revisiones tiene lente de Entreno, «sus semanas» ya no son
    solo las que pesó: alguien que entrena desde julio y empezó a pesarse en
    septiembre tenía dos meses de entrenos sin una casilla donde salir, y la
    lente se abría con una sola columna delante de un programa lleno. El tope
    de cuánto se mira hacia atrás lo sigue poniendo `semanasDelPlan`.
  */
  const primerMicro = useMemo(
    () =>
      (workoutData?.[activeClient?.id]?.microcycles || [])
        .map((m) => m?.date)
        .filter(Boolean)
        .sort()[0] || null,
    [workoutData, activeClient?.id]
  );
  const desde = useMemo(() => {
    const fechas = [...entregas.map((e) => e?.weekStart), primerMicro].filter(Boolean).sort();
    return fechas[0] || null;
  }, [entregas, primerMicro]);
  const { plan, hoy } = usePlanDelRoadmap({ reviews: revisiones, desde });

  const estados = useMemo(
    () =>
      plan
        ? estadosDeSemana({ semanas: plan.semanas, entregas, revisiones, client: activeClient, hoy })
        : null,
    [plan, entregas, revisiones, activeClient, hoy]
  );

  return { plan, estados, hoy };
};
