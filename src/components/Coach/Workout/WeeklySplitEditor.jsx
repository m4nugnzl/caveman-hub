import { useState } from 'react';

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
/*
  ══ Y CUANDO NO HAY REPARTO, NO SE PINTAN SIETE CAJAS VACÍAS ═════════════════

  Un bloque recién montado no tiene ningún día asignado, así que esta fila salía
  como SIETE desplegables idénticos que decían «Descanso». Ocupaba noventa
  píxeles a lo ancho de la pantalla más importante del producto para no contar
  nada: siete veces la misma palabra no es una semana, es un formulario en
  blanco. Y peor, leído rápido dice lo contrario de lo que pasa —parece que le
  has programado siete días de descanso a propósito.

  Así que el vacío o invita o desaparece: una frase que dice lo que hay y el
  botón que lo arregla. Los siete selectores siguen ahí, a un clic, y en cuanto
  UN día tiene hoja vuelven solos —a partir de ahí la rejilla sí cuenta algo.
*/
const DESCANSO = 'Descanso';

export const WeeklySplitEditor = ({ split, onChange, days = [], disabled = false }) => {
  const nombres = days.map((d) => d.dayName);
  const sinRepartir = WEEK_DAYS.every((d) => isRestDay(split?.[d] ?? DESCANSO));
  const [abierto, setAbierto] = useState(false);

  if (sinRepartir && !abierto) {
    return (
      <p className="split-vacia">
        <span>
          {nombres.length === 0
            ? 'Todavía no hay hojas que repartir.'
            : 'Ninguna hoja tiene día asignado: el cliente las ve todas juntas.'}
        </span>
        {!disabled && nombres.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAbierto(true)}>
            Repartirlas por días
          </button>
        )}
      </p>
    );
  }

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
