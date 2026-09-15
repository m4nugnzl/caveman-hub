import { mmss } from '@/context/SesionEnCurso';

/** La circunferencia del anillo: 2π·110, redondeada. */
const VUELTA = 691;

/**
 * EL DESCANSO — la firma del modo entreno.
 *
 * ══ Solo existe si alguien lo pautó ════════════════════════════════════════
 *
 * Esta pantalla no se monta sin `restSeconds`: la cuenta la arranca
 * `empezarDescanso`, que se niega sin pauta. El prototipo tenía una segunda
 * versión «sin pauta» que contaba hacia arriba, y el dueño la descartó el 15 de
 * septiembre: *«cuando no hay pauta no aparece»*. Un número corriendo en la
 * pantalla del gimnasio se lee como que hay que volver a la barra, y esa
 * instrucción no la ha dado nadie.
 *
 * ══ Por qué toma la pantalla entera ════════════════════════════════════════
 *
 * Porque durante el descanso no hay nada que apuntar, y lo que se mira desde el
 * banco a dos metros es cuánto falta. Un contador del tamaño de una etiqueta no
 * se lee sin coger el móvil.
 *
 * El anillo va en `--brasa`, que es la marca de «aquí» de la casa y no un
 * estado: dice «esto es lo que te espera», no «vas mal». Y su luz de fondo es
 * `--brasa-luz`, la de los momentos que la merecen.
 *
 * ══ Y no es una cárcel ═════════════════════════════════════════════════════
 *
 * Tres salidas, y ninguna se lleva lo apuntado:
 *
 *   · **+30 s** alarga la cuenta sin empezar otra.
 *   · **Saltar** la para: quien vuelve a la barra antes de tiempo ya ha
 *     decidido seguir.
 *   · **Volver a la hoja** la tapa SIN pararla, para corregir una serie con la
 *     cuenta corriendo. La cifra se queda en la cabecera y se toca para volver.
 */
export const Descanso = ({ descanso, despues, onSumar, onSaltar, onVolver }) => {
  const queda = descanso.total > 0 ? Math.max(0, Math.min(1, descanso.restante / descanso.total)) : 0;

  return (
    <div className="tel-reposo" role="dialog" aria-modal="true" aria-label="Descanso">
      <div className="tel-reposo-anillo">
        <svg viewBox="0 0 236 236" aria-hidden="true">
          <circle className="tel-reposo-fondo" cx="118" cy="118" r="110" />
          <circle
            className="tel-reposo-arco"
            cx="118"
            cy="118"
            r="110"
            strokeDasharray={VUELTA}
            strokeDashoffset={VUELTA * (1 - queda)}
          />
        </svg>
        <span className="tel-reposo-cifra" role="timer">
          {mmss(descanso.restante)}
        </span>
      </div>
      <span className="tel-reposo-rot">Descanso · pautado {mmss(descanso.total)}</span>

      {despues ? (
        <div className="tel-reposo-despues">
          <span className="tel-reposo-k">Después</span>
          <span className="tel-reposo-n">{despues.nombre}</span>
          {despues.meta ? <span className="tel-reposo-m">{despues.meta}</span> : null}
        </div>
      ) : null}

      <div className="tel-reposo-acc">
        <button type="button" onClick={onSumar}>
          +30 s
        </button>
        <button type="button" className="tel-pri" onClick={onSaltar}>
          Saltar
        </button>
      </div>

      <button type="button" className="tel-reposo-volver" onClick={onVolver}>
        Volver a la hoja
      </button>
    </div>
  );
};
