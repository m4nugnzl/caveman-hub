import { Navigate } from 'react-router-dom';

import { useMediaQuery } from '@/lib/useMediaQuery';
import { PageHead } from '@/components/ui/primitives';
import { TusSemanas } from './TusSemanas';
import { TuRoadmap } from './TuRoadmap';

/**
 * «TUS SEMANAS» EN EL TELÉFONO — `/mi/evolucion/semanas`, una pantalla empujada
 * desde la fila «Semanas anteriores» de la Revisión.
 *
 * ══ Qué era esto ═══════════════════════════════════════════════════════════
 *
 * «Tu peso y tus medidas» (`/mi/evolucion/medidas`): la báscula del entrenador
 * en versión cliente —siete casillas escribibles, una gráfica de ejes y una
 * tabla de pesajes con papelera—, más sus vídeos y lo que le fue contestando.
 * Era otro sitio donde apuntar el peso, y el 19 de septiembre el dueño la llamó
 * «un resquicio de lo que antes existía».
 *
 * Lo que servía se lee ahora en `TusSemanas`, por semanas y sin ninguna casilla
 * de peso: se apunta en «Tu peso de hoy». La dirección vieja redirige aquí.
 *
 * ── En el monitor no es una pantalla ──────────────────────────────────────
 * Allí «Tus semanas» va al pie de la propia Revisión, que tiene sitio. Quien
 * llegue a esta dirección con la pantalla ancha va a ella, a la altura del
 * rastro.
 */
export const ClientCheckInsRoute = () => {
  const enMonitor = useMediaQuery('(min-width: 1024px)');
  if (enMonitor) return <Navigate to="/mi/evolucion#tus-semanas" replace />;

  return (
    <div className="stack cascada">
      <PageHead title="Tus semanas" sub="Lo que apuntaste, lo que entregaste y lo que te contestó" />
      <TuRoadmap />
      <TusSemanas conCabecera={false} todas />
    </div>
  );
};
