import { Calendar } from 'lucide-react';
import { WEEK_DAYS, isRestDay } from '@/domain/training';
import { SectionTitle } from '@/components/ui/primitives';

/**
 * Qué se entrena cada día de la semana natural. Solo tiene sentido con
 * `cycleType: 'weekly'`; en ciclo rotativo no hay semana a la que atarse.
 *
 * ══ Ni caja ni pliegue propio ═══════════════════════════════════════════════
 *
 * Era un `Panel` con su propio desplegable, y vivía dentro de la ventana de la
 * estructura: una caja dentro de una caja dentro de una ventana, y dos chevrones
 * seguidos que hacían cosas distintas. Ahora la estructura entera es un pliegue
 * (`CycleSettings`) y esto es una zona suya: si has abierto la estructura, ya
 * has dicho que vienes a cambiarla — plegar otra vez lo de dentro solo añade un
 * clic. Dentro de una superficie, las zonas las separa el espacio.
 *
 * El contador de días de entreno no desaparece: se lee en el resumen del
 * pliegue, que es donde sirve — estando CERRADO.
 */
export const WeeklySplitEditor = ({ split, onChange }) => (
  <div className="col gap-3">
    <SectionTitle icon={Calendar}>Planificación semanal</SectionTitle>

    <div className="split-grid">
      {WEEK_DAYS.map((day) => {
        const value = split?.[day] ?? 'Descanso';
        const descanso = isRestDay(value);
        return (
          <div className="split-day" key={day}>
            <label className="name" htmlFor={`split-${day}`}>
              {day}
            </label>
            {/* La misma tinta que el tablero: el día con algo programado en
                acento, el de descanso apagado. Antes esto lo decidía un `style`
                escrito a mano aquí, con su propia idea de qué es descanso. */}
            <input
              id={`split-${day}`}
              className={`input input-center split-value${descanso ? '' : ' is-training'}`}
              value={value}
              onChange={(e) => onChange(day, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  </div>
);
