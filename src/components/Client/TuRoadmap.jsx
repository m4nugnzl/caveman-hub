import { useState } from 'react';

import { useOculto } from '@/components/Client/Oculto';
import { TimelineSpine } from '@/components/review/TimelineSpine';
import { usePlanDelRoadmap } from '@/components/roadmap/usePlanDelRoadmap';
import { todayISO, weekStart } from '@/lib/dates';

/**
 * TU ROADMAP: la espina de la revisión, del lado del cliente.
 *
 * La misma pieza que abre la revisión del entrenador (`review/TimelineSpine`),
 * plegada por defecto, en su revisión y encima de «Tus semanas». Es lo que
 * sustituye a su pestaña `/mi/roadmap` (R2, 21 sep 2026): el roadmap vive en
 * las revisiones, en los dos lados.
 *
 * Solo se mira. Aquí no se elige semana —su revisión es la entrega de esta
 * semana— ni se abre el plan, que es criterio del entrenador (y lo garantiza
 * RLS, 0028, no esta pantalla). Y sin los igualados: ve el esperado vigente,
 * no el original ni dónde se ajustó.
 *
 * Sin fases ni destino no hay plan que enseñar y no sale.
 */
export const TuRoadmap = () => {
  const { plan } = usePlanDelRoadmap();
  const oculto = useOculto() || {};
  const [abierta, setAbierta] = useState(false);

  const hay = Boolean(plan && (plan.grupos.some((g) => g.fase) || plan.destino));
  if (!hay) return null;

  return (
    <TimelineSpine
      plan={plan}
      elegida={weekStart(todayISO())}
      abierta={abierta}
      onAlternar={setAbierta}
      oculto={oculto}
      soloLectura
      rotulo="Tu roadmap"
    />
  );
};
