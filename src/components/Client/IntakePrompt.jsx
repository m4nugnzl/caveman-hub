import { ChevronRight, ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useData } from '@/context/AppContext';
import { clientIntake, clientSteps, stepDone } from '@/domain/intake';
import { onboardingState } from '@/domain/onboardingState';
import { Panel } from '@/components/ui/primitives';

/**
 * «Tu entrenador espera algo de ti»: la puerta a su alta.
 *
 * ══ Por qué aparece y desaparece ═══════════════════════════════════════════
 *
 * Porque una entrada permanente para algo que se hace UNA vez es cromo el resto
 * del tiempo. Es el mismo criterio con el que `ClientUpdates` vive encima de
 * esta misma pantalla: los avisos se encuentran, no se van a buscar, y
 * desaparecen solos cuando no hay nada.
 *
 * ══ Cuenta TODO lo que falta, no una cosa ══════════════════════════════════
 *
 * La primera versión decía «las fotos de tu gimnasio» y punto: era lo único que
 * existía entonces, y al llegar el cuestionario se quedó nombrando lo segundo en
 * importancia mientras lo primero no aparecía en ninguna parte. Ahora sale de la
 * misma lista que su pantalla de alta (`clientSteps`), así que las dos no pueden
 * discrepar sobre qué le falta.
 *
 * ══ Por qué NO es una tarjeta que navega ═══════════════════════════════════
 *
 * `docs/producto.md` §5.6 lo prohíbe, y con razón: una tarjeta que lleva a otro
 * sitio no se distingue de una que enseña algo. Aquí la tarjeta CUENTA lo que
 * falta y quien navega es el botón, que se lee como un botón.
 */
export const IntakePrompt = ({ client }) => {
  const { equipment, checkIns } = useData();

  const intake = clientIntake(client.preferences);
  const tareas = clientSteps(intake);
  if (tareas.length === 0) return null;

  const estado = onboardingState({ client, equipment, checkIn: checkIns?.[client.id] });
  const faltan = tareas.filter((t) => !stepDone(t, client, intake, estado));

  /* Sin nada pendiente no hay aviso. Lo entregado se sigue pudiendo cambiar
     desde `/mi/alta`, pero eso ya no es una tarea y no ocupa su portada. */
  if (faltan.length === 0) return null;

  return (
    <Panel title="Te falta esto" className="col gap-3">
      <div className="row between wrap gap-3">
        <div className="col gap-1" style={{ minWidth: 0 }}>
          <span className="row gap-2 t-sm" style={{ fontWeight: 600 }}>
            <ClipboardList size={15} />
            {/* Se nombra lo primero que falta y se cuenta el resto. Enumerarlas
                todas aquí sería repetir la pantalla a la que lleva el botón. */}
            {faltan[0].youLabel || faltan[0].label}
            {faltan.length > 1 && (
              <span className="t-tertiary" style={{ fontWeight: 400 }}>
                y {faltan.length - 1} {faltan.length === 2 ? 'cosa más' : 'cosas más'}
              </span>
            )}
          </span>
          <span className="t-xs t-tertiary">
            Es lo que tu entrenador necesita para montarte el plan. Se hace una vez y se puede
            dejar a medias.
          </span>
        </div>

        <Link className="btn btn-primary btn-sm" to="/mi/alta">
          Empezar <ChevronRight size={14} />
        </Link>
      </div>
    </Panel>
  );
};
