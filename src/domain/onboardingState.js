/**
 * Qué ha entregado ya el cliente de su alta.
 *
 * ══ Por qué esto es un módulo y no tres condiciones sueltas ════════════════
 *
 * Porque lo preguntan TRES pantallas que no pueden discrepar: el portal del
 * cliente —donde se le dice qué le falta—, el aviso de su inicio y el bloque
 * «Alta» de su ficha. Si cada una lo dedujera por su cuenta, el día que una
 * contara el cuestionario como hecho «con algo contestado» y otra «con todo
 * contestado», el entrenador vería un tic donde su cliente ve una tarea
 * pendiente. Y no hay forma de saber cuál de las dos miente.
 *
 * ══ Qué cuenta como hecho, y por qué así ═══════════════════════════════════
 *
 *   · El CUESTIONARIO, cuando está entero. A medias no vale: la mitad de las
 *     respuestas no da para montar un plan, y marcarlo hecho quitaría de su
 *     portal lo único que le recuerda que le falta.
 *   · Las FOTOS del gimnasio, con que haya una. Cuántas son suficientes lo sabe
 *     su entrenador mirándolas, no un número escrito aquí — un gimnasio de casa
 *     son tres máquinas y uno comercial cuarenta.
 *   · El CHECK-IN, con el primero entregado. Es la línea de partida contra la
 *     que se compara todo lo demás; el segundo ya no es alta, es seguimiento.
 *
 * Las tres claves se llaman igual que el `auto` de su paso en el catálogo
 * (`domain/intake.js`), y eso no es casualidad: es lo que permite que `stepDone`
 * resuelva un paso automático sin un `switch` que haya que ampliar cada vez.
 */

import { clientIntakeForm, formProgress } from './intakeForm';

/**
 * @param client      La ficha, con sus `preferences` y su `profile`.
 * @param equipment   Sus fotos de maquinaria (`domain/equipment.js`).
 * @param checkIn     Su último check-in, o nada. Basta con que exista uno.
 */
export const onboardingState = ({ client, equipment, checkIn }) => {
  const form = clientIntakeForm(client?.preferences);
  const progreso = formProgress(form, client?.profile);

  return {
    /* `total > 0` importa: un entrenador que no pregunta nada no puede tener a
       todos sus clientes con el cuestionario «hecho» sin haberlo abierto. Se
       trata como que ese paso no aplica, y quien lo tenga en su lista lo verá
       pendiente hasta que ponga preguntas. */
    /* Y sin nada obligatorio en blanco. Es lo que hace que «obligatoria»
       signifique algo sin bloquear el guardado: se puede dejar a medias, pero el
       alta no se da por terminada hasta que está lo que dijiste que hacía falta. */
    form: progreso.total > 0 && progreso.done === progreso.total && progreso.missing.length === 0,
    gym: (equipment || []).length > 0,
    checkin: Boolean(checkIn?.submittedAt),
  };
};
