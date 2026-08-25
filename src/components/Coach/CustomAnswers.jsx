import { clientIntakeForm } from '@/domain/intakeForm';
import { customAnswers } from '@/domain/profile';
import { Panel } from '@/components/ui/primitives';

/**
 * Lo que contestó a TUS preguntas.
 *
 * ══ Por qué esto tiene su propio bloque ════════════════════════════════════
 *
 * Porque sin él, el editor del cuestionario sería una trampa: el entrenador
 * añade «¿con quién vives y quién cocina?», el cliente la contesta desde su
 * portal, y esa respuesta no aparece en ninguna parte. Un formulario que se
 * traga lo que le dices es peor que uno que no lo pregunta.
 *
 * Los dos bloques de al lado —«Cómo entrena» y «Cómo come»— se dibujan desde el
 * catálogo del perfil, y estas preguntas por definición no están en él: las
 * inventa cada entrenador. Por eso van aparte y no coladas dentro de una tanda
 * que no es la suya.
 *
 * ══ Las etiquetas salen del formulario DEL CLIENTE ═════════════════════════
 *
 * De `clients.preferences.intakeForm`, que es la copia que se le hizo al darle
 * de alta, y no de la plantilla actual del entrenador. Es lo correcto: lo que
 * hay que enseñar es la pregunta que se le HIZO. Si él cambió el texto después,
 * poner el nuevo al lado de una respuesta vieja diría que contestó a algo que
 * nunca le preguntaron.
 *
 * ══ Y no se edita desde aquí ═══════════════════════════════════════════════
 *
 * Es lo que dijo el cliente. Corregirlo en su nombre convertiría un testimonio
 * en una nota del entrenador, y entonces nadie sabría cuál de las dos cosas es.
 * Lo que el entrenador apunta tiene su sitio: los otros dos bloques.
 */
export const CustomAnswers = ({ client }) => {
  const form = clientIntakeForm(client.preferences);
  const respuestas = customAnswers(client.profile);

  /* Solo las preguntas que SIGUEN en su formulario. Una respuesta a algo que se
     retiró se queda guardada —no se borra nada— pero deja de pintarse: sin su
     etiqueta es un valor suelto que nadie puede interpretar. */
  const filas = form.custom
    .map((q) => ({ id: q.id, label: q.label, valor: respuestas[q.id] }))
    .filter((f) => f.valor !== undefined && f.valor !== null && f.valor !== '');

  if (filas.length === 0) return null;

  return (
    <Panel
      title="Lo que le preguntaste tú"
      sub="Sus respuestas a las preguntas propias de tu cuestionario."
      className="col gap-2"
    >
      {filas.map((fila) => (
        <div key={fila.id} className="row between wrap gap-2 t-sm">
          <span className="t-secondary" style={{ minWidth: 0 }}>
            {fila.label}
          </span>
          <span style={{ fontWeight: 600, textAlign: 'right' }}>
            {typeof fila.valor === 'boolean' ? (fila.valor ? 'Sí' : 'No') : fila.valor}
          </span>
        </div>
      ))}
    </Panel>
  );
};
