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

  const hechas = tareas.length - faltan.length;

  return (
    /*
      ══ La tarjeta de arranque, y por qué pesa más que las demás ═══════════════

      Es la única pantalla del portal que se abre con algo que el cliente NO ha
      hecho todavía y que bloquea lo demás: sin sus respuestas no hay rutina, y
      sin rutina el resto de la aplicación son pantallas vacías. Con el mismo
      aspecto que un aviso cualquiera se leía como opcional, y en la práctica lo
      era: quedaba debajo del recordatorio de pesajes.

      El acento es el mismo que marca el día de hoy y la sección activa. Aquí
      significa lo mismo: es donde estás.
    */
    <Panel className="intake-start col gap-3">
      <span className="section-label">
        <ClipboardList size={12} className="icon-inline" /> Para poder empezar
      </span>

      <div className="row between wrap gap-3">
        <div className="col gap-1" style={{ minWidth: 0 }}>
          <span className="intake-start-title">
            {/* Se nombra lo primero que falta y se cuenta el resto: enumerarlas
                todas sería repetir la pantalla a la que lleva el botón. */}
            {faltan[0].youLabel || faltan[0].label}
            {faltan.length > 1 && (
              <span className="t-secondary" style={{ fontWeight: 400 }}>
                {' '}
                y {faltan.length - 1} {faltan.length === 2 ? 'cosa más' : 'cosas más'}
              </span>
            )}
          </span>
          <span className="t-sm t-secondary">
            Tu entrenador lo necesita para montarte el plan. Se hace una vez y se puede dejar a
            medias.
          </span>
        </div>

        <Link className="btn btn-primary" to="/mi/alta">
          {hechas > 0 ? 'Seguir' : 'Empezar'} <ChevronRight size={16} />
        </Link>
      </div>

      {/* El avance, si ya ha hecho algo. Con cero no se pinta: una barra vacía en
          la primera visita solo dice cuánto queda por delante. */}
      {hechas > 0 && (
        <div className="form-progress" role="presentation">
          <i style={{ width: `${(hechas / tareas.length) * 100}%` }} />
        </div>
      )}
    </Panel>
  );
};
