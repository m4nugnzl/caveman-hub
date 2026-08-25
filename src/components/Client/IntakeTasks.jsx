import { Check, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useData } from '@/context/AppContext';
import { clientIntake, clientSteps, stepDone } from '@/domain/intake';
import { onboardingState } from '@/domain/onboardingState';
import { Panel } from '@/components/ui/primitives';

/**
 * A dónde lleva cada tarea. La que no está aquí se hace en esta misma pantalla.
 *
 * Vive en el componente y no en el catálogo porque es una ruta del portal, y el
 * catálogo lo lee también el entrenador — que no tiene esas rutas.
 */
const DESTINO = { checkin: '/mi/evolucion' };

/**
 * Lo que el cliente tiene que entregar, en orden y con lo hecho tachado.
 *
 * ══ Por qué una lista y no las dos tarjetas sueltas ════════════════════════
 *
 * Porque antes esta pantalla era un cuestionario y un cajón de fotos, uno detrás
 * de otro, sin nada que dijera que eran DOS TAREAS de una misma cosa ni cuántas
 * quedaban. Lo primero que se veía era «el gimnasio donde entrenas», que parecía
 * un apartado más de una pantalla larga en vez de lo segundo de tres.
 *
 * Con la lista arriba, la pregunta «¿qué tengo que hacer?» se contesta antes de
 * bajar. Y lo que ya está hecho se queda, tachado: ver lo que llevas es la mitad
 * de las ganas de terminar lo que falta.
 *
 * ══ Las tareas las elige el ENTRENADOR ═════════════════════════════════════
 *
 * Salen de los pasos de su alta marcados como del cliente (`owner: 'client'` en
 * `domain/intake.js`), que él enciende en Ajustes → Protocolo. Uno pedirá el
 * cuestionario y las fotos; otro querrá además el primer check-in; otro solo las
 * fotos porque la anamnesis la hace hablando. Ninguno de los tres debería ver
 * las tareas de los otros dos.
 *
 * ══ Y se marcan solas ══════════════════════════════════════════════════════
 *
 * No hay casilla que pulsar: o están las respuestas, o están las fotos, o está
 * el check-in. Una tarea que hay que marcar hecha aparte de hacerla es una tarea
 * que se queda sin marcar, y entonces el entrenador reclama algo que ya tiene.
 */
export const IntakeTasks = ({ client }) => {
  const { equipment, checkIns } = useData();

  const intake = clientIntake(client.preferences);
  const tareas = clientSteps(intake);
  if (tareas.length === 0) return null;

  const estado = onboardingState({ client, equipment, checkIn: checkIns?.[client.id] });
  const hechas = tareas.filter((t) => stepDone(t, client, intake, estado));
  const completo = hechas.length === tareas.length;

  return (
    <Panel
      title={completo ? 'Ya está todo' : 'Lo que te falta'}
      sub={
        completo
          ? 'Lo tienes entregado. Puedes cambiar cualquier cosa cuando quieras.'
          : 'Tu entrenador necesita esto para montarte el plan.'
      }
      className="col gap-2"
      action={
        <span className={`badge${completo ? ' badge-ok' : ''}`}>
          {completo && <Check size={11} />} {hechas.length} de {tareas.length}
        </span>
      }
    >
      <ol className="task-list">
        {tareas.map((tarea, i) => {
          const hecha = stepDone(tarea, client, intake, estado);
          const destino = DESTINO[tarea.auto];

          return (
            <li key={tarea.id} className={`task${hecha ? ' is-done' : ''}`}>
              {/* El número es el ORDEN, y por eso se sustituye por el tic cuando
                  está hecha: lo que informa entonces ya no es que fuera la
                  segunda, sino que no hay que volver a ella. */}
              <span className="task-mark" aria-hidden="true">
                {hecha ? <Check size={13} /> : i + 1}
              </span>
              <span className="task-say">
                <span className="task-title">{tarea.youLabel || tarea.label}</span>
                {!hecha && tarea.hint && <span className="t-2xs t-tertiary">{tarea.youHint || tarea.hint}</span>}
              </span>
              {!hecha && destino && (
                <Link className="btn btn-secondary btn-sm" to={destino}>
                  Ir <ChevronRight size={14} />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
};
