import { Calendar } from 'lucide-react';
import { WEEK_DAYS, dayMuscleVolume, isRestDay } from '@/domain/training';
import { SectionTitle } from '@/components/ui/primitives';

/**
 * Qué se entrena cada día de la semana natural. Solo tiene sentido con
 * `cycleType: 'weekly'`; en ciclo rotativo no hay semana a la que atarse.
 *
 * ══ La semana como REJILLA, no como siete cajas de texto ════════════════════
 *
 * Era un campo de texto por día donde había que escribir «Empuje A» a mano —y
 * escribirlo igual que en el microciclo, o el día no se encontraba—. Ahora
 * cada día ELIGE entre las sesiones que existen (o descanso), y debajo enseña
 * lo que esa sesión carga: los grupos con más series. Es la vista para
 * diseñar el bloque de una mirada, como la semana de TrueCoach: se ve dónde
 * caen dos días de pierna seguidos antes de que el cliente los sufra.
 *
 * Al pie, la carga de la semana entera por grupo, sumando los siete días.
 *
 * ══ Ni caja ni pliegue propio ═══════════════════════════════════════════════
 * Vive dentro del pliegue de la estructura (`CycleSettings`): si lo has
 * abierto, ya has dicho que vienes a cambiarla. Dentro de una superficie, las
 * zonas las separa el espacio.
 *
 * @param days  Los días del microciclo activo, para ofrecerlos y para medir
 *   su carga. Sin ellos, el selector solo ofrece descanso y lo que ya hubiera.
 */
const DESCANSO = 'Descanso';

const cargaDe = (day) =>
  Object.entries(dayMuscleVolume(day || {}))
    .sort((a, b) => b[1] - a[1]);

export const WeeklySplitEditor = ({ split, onChange, days = [] }) => {
  const nombres = days.map((d) => d.dayName);
  const sesionDe = (valor) => days.find((d) => d.dayName.trim().toLowerCase() === String(valor).trim().toLowerCase()) || null;

  /* La carga de la semana entera: la suma de lo que cae cada día. */
  const semana = {};
  for (const dia of WEEK_DAYS) {
    const sesion = sesionDe(split?.[dia] ?? DESCANSO);
    if (!sesion) continue;
    for (const [m, n] of cargaDe(sesion)) semana[m] = (semana[m] || 0) + n;
  }
  const cargaSemana = Object.entries(semana).sort((a, b) => b[1] - a[1]);
  const diasEntreno = WEEK_DAYS.filter((d) => !isRestDay(split?.[d] ?? DESCANSO)).length;

  return (
    <div className="col gap-3">
      <SectionTitle icon={Calendar}>Planificación semanal</SectionTitle>
      <div className="split-grid">
        {WEEK_DAYS.map((day) => {
          const value = split?.[day] ?? DESCANSO;
          const descanso = isRestDay(value);
          const sesion = sesionDe(value);
          const opciones = [DESCANSO, ...nombres];
          if (!descanso && !sesion && value) opciones.push(value);
          return (
            <div className={`split-day${descanso ? ' is-descanso' : ' is-training'}`} key={day}>
              <label className="name" htmlFor={`split-${day}`}>
                {day.slice(0, 3)}
              </label>
              <select
                id={`split-${day}`}
                className="split-select"
                value={value}
                onChange={(e) => onChange(day, e.target.value)}
                aria-label={`Sesión del ${day.toLowerCase()}`}
              >
                {opciones.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              {sesion && (
                <ul className="split-carga" aria-label={`Carga de ${value}`}>
                  {cargaDe(sesion)
                    .slice(0, 3)
                    .map(([m, n]) => (
                      <li key={m}>
                        <span>{m}</span>
                        <b>{n}</b>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {cargaSemana.length > 0 && (
        <p className="split-semana">
          <b>{diasEntreno} {diasEntreno === 1 ? 'día' : 'días'}</b> ·{' '}
          {cargaSemana.map(([m, n]) => `${m} ${n}`).join(' · ')}
          <span className="t-tertiary"> series a la semana</span>
        </p>
      )}
    </div>
  );
};
