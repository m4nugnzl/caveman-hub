import { WEEK_DAYS, isRestDay } from '@/domain/training';

/**
 * Qué hoja cae cada día de la semana natural. Solo tiene sentido con
 * `cycleType: 'weekly'`; en ciclo rotativo no hay semana a la que atarse —ahí
 * la estructura la dice la cadena del patrón (`ui/CycleChain`)—.
 *
 * ══ La semana como REJILLA, no como siete cajas de texto ════════════════════
 *
 * Era un campo de texto por día donde había que escribir «Empuje A» a mano —y
 * escribirlo igual que en el microciclo, o el día no se encontraba—. Ahora cada
 * día ELIGE entre las hojas que existen, o descanso. Es la vista para ver de
 * una mirada dónde caen dos días de pierna seguidos antes de que el cliente los
 * sufra.
 *
 * ══ Sin la carga: eso lo dice la matriz ════════════════════════════════════
 * Debajo de cada día iba su top-3 de grupos, y al pie la suma de la semana
 * entera. Era el mismo dato que la matriz de volumen del bloque, dicho peor
 * —tres grupos de siete, sin MRV y sin poder comparar hojas entre sí—. Dos
 * sitios contando series acaban discrepando, así que se cuenta en uno.
 *
 * Aquí se contesta CUÁNDO; cuánto, en la matriz.
 *
 * ══ Ni caja ni pliegue ═════════════════════════════════════════════════════
 * Vive arriba del plan del bloque, a la vista. Estuvo dentro del pliegue de
 * `CycleSettings`, al final de la pantalla: la estructura del bloque, escondida
 * debajo de todo lo que la estructura explica.
 *
 * @param days  Las hojas del bloque, para ofrecerlas en el selector.
 */
const DESCANSO = 'Descanso';

export const WeeklySplitEditor = ({ split, onChange, days = [], disabled = false }) => {
  const nombres = days.map((d) => d.dayName);

  return (
    <div className="split-grid">
      {WEEK_DAYS.map((day) => {
        const value = split?.[day] ?? DESCANSO;
        const descanso = isRestDay(value);
        const opciones = [DESCANSO, ...nombres];
        /* Un valor que ya no corresponde a ninguna hoja (se renombró, se quitó)
           se sigue ofreciendo: si no, el selector lo cambiaría solo por el
           primero de la lista al primer render. */
        if (!descanso && !opciones.includes(value)) opciones.push(value);

        return (
          <div className={`split-day${descanso ? ' is-descanso' : ' is-training'}`} key={day}>
            <label className="name" htmlFor={`split-${day}`}>
              {day.slice(0, 3)}
            </label>
            <select
              id={`split-${day}`}
              className="split-select"
              value={value}
              disabled={disabled}
              onChange={(e) => onChange(day, e.target.value)}
              aria-label={`Hoja del ${day.toLowerCase()}`}
            >
              {opciones.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
};
