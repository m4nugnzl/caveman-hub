import { Check, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useData } from '@/context/AppContext';
import { clientIntake, clientSteps, stepDone } from '@/domain/intake';
import { onboardingState } from '@/domain/onboardingState';
import { Panel } from '@/components/ui/primitives';

/**
 * A dónde lleva cada tarea.
 *
 * ══ Por qué TODAS llevan a algún sitio ═════════════════════════════════════
 *
 * Antes solo la del check-in tenía destino, y las otras dos eran texto inerte
 * encima de una pantalla de tres pantallas de largo: la lista decía «te falta el
 * cuestionario» y no había forma de ir al cuestionario más que desplazando a
 * ciegas hasta reconocerlo. Una lista de tareas donde las tareas no se pueden
 * abrir es un cartel, no un índice.
 *
 * Dos clases de destino, y por eso el valor lleva su forma dentro:
 *
 *   · `#ancla` — está en ESTA pantalla, más abajo. El salto lo hace el navegador
 *     y el CSS le deja sitio bajo la cabecera (`.page-section`).
 *   · `/ruta`  — está en otra sección del portal. El primer check-in se entrega
 *     en «Evolución», que es donde se pesa y se hacen las fotos.
 *
 * Vive en el componente y no en el catálogo porque son rutas y anclas del PORTAL,
 * y el catálogo lo lee también el entrenador — que no tiene ninguna de las dos.
 */
const DESTINO = {
  form: '#cuestionario',
  gym: '#gimnasio',
  checkin: '/mi/evolucion',
};

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
      className="col gap-3"
      action={
        <span className={`badge${completo ? ' badge-ok' : ''}`}>
          {completo && <Check size={11} />} {hechas.length} de {tareas.length}
        </span>
      }
    >
      {/*
        La barra, con la misma factura que la del cuestionario y la de su portada.

        Con dos tareas es casi retórica; con cuatro —cuestionario, salud, fotos y
        primer check-in— es la diferencia entre «me queda algo» y «me queda la
        mitad». Y cuesta una línea, que es lo que hace que se pinte siempre y no
        haya que decidir a partir de cuántas.
      */}
      <div
        className="form-progress"
        role="progressbar"
        aria-valuenow={hechas.length}
        aria-valuemin={0}
        aria-valuemax={tareas.length}
        aria-label="Tareas entregadas"
      >
        <i style={{ width: `${(hechas.length / tareas.length) * 100}%` }} />
      </div>

      <ol className="chore-list">
        {tareas.map((tarea, i) => {
          const hecha = stepDone(tarea, client, intake, estado);
          const destino = DESTINO[tarea.auto];
          const enEstaPantalla = destino?.startsWith('#');

          return (
            <li key={tarea.id} className={`chore${hecha ? ' is-done' : ''}`}>
              {/* El número es el ORDEN, y por eso se sustituye por el tic cuando
                  está hecha: lo que informa entonces ya no es que fuera la
                  segunda, sino que no hay que volver a ella. */}
              <span className="chore-mark" aria-hidden="true">
                {hecha ? <Check size={13} /> : i + 1}
              </span>
              <span className="chore-say">
                <span className="chore-title">{tarea.youLabel || tarea.label}</span>
                {!hecha && tarea.hint && (
                  <span className="t-2xs t-tertiary">{tarea.youHint || tarea.hint}</span>
                )}
              </span>

              {/*
                Lo entregado conserva su enlace, en voz baja.

                Se puede cambiar —el cuestionario se contesta a plazos, las fotos
                se amplían— y quitarle el camino a lo hecho obliga a buscarlo
                desplazando, que es exactamente lo que esta lista vino a
                ahorrar. Lo que cambia es el peso: botón lleno mientras falta,
                enlace apagado cuando está.
              */}
              {destino &&
                (enEstaPantalla ? (
                  <a
                    className={`btn btn-sm shrink-0 ${hecha ? 'btn-plain' : 'btn-secondary'}`}
                    href={destino}
                  >
                    {hecha ? 'Cambiar' : 'Ir'} <ChevronRight size={14} />
                  </a>
                ) : (
                  <Link
                    className={`btn btn-sm shrink-0 ${hecha ? 'btn-plain' : 'btn-secondary'}`}
                    to={destino}
                  >
                    {hecha ? 'Ver' : 'Ir'} <ChevronRight size={14} />
                  </Link>
                ))}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
};
