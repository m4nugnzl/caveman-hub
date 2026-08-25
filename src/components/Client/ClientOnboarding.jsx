import { useApp } from '@/context/AppContext';
import { clientIntakeForm } from '@/domain/intakeForm';
import { PageHead } from '@/components/ui/primitives';
import { DownloadAnamnesis } from '@/components/Coach/DownloadAnamnesis';
import { ClientGymUpload } from './ClientGymUpload';
import { IntakeHealth } from './IntakeHealth';
import { IntakeQuestions } from './IntakeQuestions';
import { IntakeTasks } from './IntakeTasks';

/**
 * Su alta: lo que el cliente entrega al empezar.
 *
 * ══ Por qué esto es una pantalla y no una sección del carril ═══════════════
 *
 * Porque se hace UNA vez. Las cinco secciones del portal —progreso, rutina,
 * dieta, evolución, calendario— contestan preguntas que se repiten cada semana, y
 * `routes.jsx` es explícito en que ahí no entra nada que no pase esa prueba: en
 * el móvil las cuatro primeras son la barra del pulgar, y meter aquí algo que se
 * usa la primera semana le quitaría el sitio a lo que se usa cada día.
 *
 * Así que vive fuera del carril, con su ruta propia, y se llega desde su inicio
 * mientras haya algo pendiente. Cuando termina, deja de estorbar.
 *
 * ══ Las tres cosas que entrega, en una pantalla ════════════════════════════
 *
 * El cuestionario —lo que hoy viaja en un Word por correo, con las preguntas que
 * cada entrenador elija—, su salud y las fotos de la maquinaria de su gimnasio.
 * Son la misma clase de cosa: información que el cliente da una vez y con la que
 * se le monta el plan, así que comparten pantalla en vez de repartirse entre tres
 * sitios que hay que recordar.
 *
 * ══ Y cada una es una SECCIÓN con nombre ═══════════════════════════════════
 *
 * `anchored` con su `id` no es adorno: es lo que convierte la lista de tareas
 * de arriba en un índice de verdad. Antes decía «te falta el cuestionario» sin
 * ofrecer forma de llegar a él, y en un móvil eso son tres pantallas de
 * desplazamiento reconociendo tarjetas. Ahora cada tarea salta a la suya, y el
 * `scroll-margin-top` de la clase deja el título por debajo de la cabecera en vez
 * de tapado por ella.
 */
export const ClientOnboarding = () => {
  const { activeClient } = useApp();

  /* El marco ya redirige cuando no hay cliente; esto cubre el instante entre
     montar la ruta y tenerlo cargado. */
  if (!activeClient) return null;

  return (
    <div className="stack">
      <PageHead
        title="Tu alta"
        sub="Lo que tu entrenador necesita de ti para montarte el plan. Se hace una vez."
        /*
          Llevarse lo suyo, y en algo que se lee.

          La exportación completa que existe es un JSON, y cumplir el derecho de
          acceso con un JSON es cumplirlo sobre el papel: nadie lo abre. Esto es
          su historial escrito para una persona — el mismo documento que se lleva
          su entrenador, sacado de los mismos datos.
        */
        action={<DownloadAnamnesis client={activeClient} label="Descargar mi ficha" />}
      />

      {/*
        La lista de tareas ANTES que las tareas.

        Sin ella, esta pantalla era un cuestionario y un cajón de fotos, uno
        detrás de otro, sin nada que dijera que eran dos entregas de la misma
        cosa ni cuántas quedaban. Lo que se veía primero al bajar era «el
        gimnasio donde entrenas», que parecía un apartado más de una pantalla
        larga en lugar de lo segundo de tres.
      */}
      <IntakeTasks client={activeClient} />

      {/* El cuestionario antes que las fotos: son datos que su entrenador
          necesita para escribir la primera serie, y se contestan aquí y ahora.
          Las fotos hay que ir a hacerlas al gimnasio, que puede ser mañana. */}
      <section id="cuestionario" className="anchored">
        <IntakeQuestions client={activeClient} />
      </section>

      {/* Su salud, justo detrás del cuestionario: es la parte que decide qué se
          le puede poner, y va antes que las fotos porque se contesta aquí y
          ahora — las fotos hay que ir a hacerlas.

          No es un paso del alta y por eso no sale en la lista de tareas: son
          filas de `client_conditions`, no respuestas del formulario, y no hay
          forma de saber que alguien «ya ha terminado» de contar lo que le duele.
          Se pregunta, y quien no tenga nada sigue. */}
      {clientIntakeForm(activeClient.preferences).askHealth && (
        <section id="salud" className="anchored">
          <IntakeHealth client={activeClient} />
        </section>
      )}

      <section id="gimnasio" className="anchored">
        <ClientGymUpload client={activeClient} />
      </section>
    </div>
  );
};
