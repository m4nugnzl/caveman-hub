import { useApp } from '@/context/AppContext';
import { Migas } from '@/components/ui/Migas';
import { CalendarPanel } from '@/components/calendar/CalendarPanel';
import { ClientCalendarFeed } from './ClientCalendarFeed';

/**
 * Ruta `/mi/calendario`: lo que tiene por delante, y cómo llevárselo a su
 * calendario de verdad.
 *
 * ══ Por qué existe esta ruta, si antes era `<CalendarPanel audience="client"/>`
 *
 * Por dos cosas que el panel compartido no puede poner:
 *
 *   · **La miga.** El calendario dejó de ser pestaña el 12 de septiembre —se
 *     abre dos veces al mes— y pasó a ser una pantalla EMPUJADA desde «Tú». Una
 *     pantalla empujada sin camino de vuelta es un callejón: en el teléfono la
 *     barra del pulgar marca «Tú», pero no hay nada que diga cómo se sale.
 *   · **La suscripción** (`ClientCalendarFeed`, 0071). Colgaba del marco del
 *     portal y se pintaba en el pie de su INICIO, que es de lo único que no
 *     habla: el enlace con el que se mete su plan en el calendario del teléfono
 *     va en su calendario.
 */
export const ClientCalendarRoute = () => {
  const { activeClient } = useApp();

  return (
    <div className="stack">
      <Migas volver={{ to: '/mi/tu', label: 'Lo tuyo' }} />
      <CalendarPanel audience="client" />
      {activeClient && <ClientCalendarFeed client={activeClient} />}
    </div>
  );
};
