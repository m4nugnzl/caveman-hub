import { ArrowRight, CheckCircle2, CircleDashed, RotateCw } from 'lucide-react';

/**
 * La cadena de un ciclo rotativo: Empuje → Tirón → Descanso, y vuelta a empezar.
 *
 * ══ Por qué una cadena y no una rejilla ═════════════════════════════════════
 *
 * La estructura semanal se pinta en siete columnas porque son siete casillas
 * fijas: lunes es lunes. Un ciclo rotativo no tiene casillas —tiene un orden que
 * se repite—, y una rejilla de tres columnas diría que el día 1 es siempre el
 * mismo día de la semana, que es justo lo contrario de lo que significa.
 *
 * Las flechas dicen «después de esto, esto», y el remate circular dice que al
 * terminar se vuelve al principio. Es la única forma que tiene un cliente de
 * saber cuándo descansa cuando su programa no está atado a la semana.
 *
 * ══ Un solo objeto para los dos lados ═══════════════════════════════════════
 *
 * Lo enseña el panel de progreso del cliente y la configuración del programa del
 * entrenador. Antes el entrenador tenía su propia versión —casillas genéricas
 * de «Entreno», sin los nombres de los días— y el cliente no tenía ninguna. Que
 * sea el mismo componente es lo que garantiza que lo que el entrenador monta es
 * exactamente lo que el cliente lee.
 *
 * Las casillas las arma `rotatingSlots`, en el dominio y con sus pruebas.
 */
export const CycleChain = ({ slots, label = 'El ciclo, día a día' }) => {
  if (!slots || slots.length === 0) return null;

  return (
    <ol className="cycle-chain" aria-label={label}>
      {slots.map((slot, index) => (
        <li className="cycle-step" key={slot.key}>
          <div className={`cycle-slot${slot.rest ? ' is-rest' : ''}`}>
            <span className="lead">
              {slot.rest ? <CircleDashed size={12} /> : <CheckCircle2 size={12} />}
              {slot.lead}
            </span>
            <span className="nm">{slot.name}</span>
          </div>

          {index < slots.length - 1 ? (
            <ArrowRight className="link" size={14} aria-hidden="true" />
          ) : (
            /* El remate: sin él, la cadena parece terminar en el último
               descanso. Un ciclo rotativo no termina — se repite. */
            <RotateCw className="link is-loop" size={14} aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
};
