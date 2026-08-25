import { useApp } from '@/context/AppContext';
import { PageHead } from '@/components/ui/primitives';
import { ClientGymUpload } from './ClientGymUpload';
import { IntakeQuestions } from './IntakeQuestions';

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
 * ══ Las dos cosas que entrega, en una pantalla ═════════════════════════════
 *
 * El cuestionario —lo que hoy viaja en un Word por correo, con las preguntas que
 * cada entrenador elija— y las fotos de la maquinaria de su gimnasio. Son la
 * misma clase de cosa: información que el cliente da una vez y con la que se le
 * monta el plan, así que comparten pantalla en vez de repartirse entre dos
 * sitios que hay que recordar.
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
      />

      {/* El cuestionario primero: son datos que su entrenador necesita antes de
          escribir la primera serie, y las fotos se hacen cuando pise el
          gimnasio — que puede ser mañana. */}
      <IntakeQuestions client={activeClient} />

      <ClientGymUpload client={activeClient} />
    </div>
  );
};
