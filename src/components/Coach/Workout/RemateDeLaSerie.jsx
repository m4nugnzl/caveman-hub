import { useRef, useState } from 'react';
import { Zap } from 'lucide-react';

import { TECNICAS, tecnicaCifras, tecnicaPorDefecto, tecnicaSpec } from '@/domain/training';
import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';

/**
 * EL REMATE DE UNA SERIE: la técnica, y sus números.
 *
 * ══ Por qué no es un ítem de menú ══════════════════════════════════════════
 *
 * Lo era: cuatro palabras dentro del «···» del ejercicio —bajada, rest-pause,
 * myo-reps, parciales— y ahí se acababa. El dueño lo dijo así: «las dropset no
 * se pueden planificar nada bien, es feo». Y no era una opinión sobre el
 * dibujo: elegir «bajada» no dejaba escrito cuántas bajadas ni cuánto se
 * recorta, así que el plan seguía estando en la cabeza del entrenador o en una
 * nota suelta.
 *
 * Un remate es una PAUTA, no un interruptor, así que se pauta: se elige la
 * técnica y salen sus campos, con valores por defecto puestos para que nunca
 * quede a medio escribir. Los campos los declara la técnica (`TECNICAS`), así
 * que añadir una mañana no toca esta pieza.
 *
 * ══ Y cuelga de la SERIE ═══════════════════════════════════════════════════
 *
 * Vivía en el ejercicio y siempre en la última. Aquí el mando está EN la fila
 * de la serie que remata, que es donde se lee, y por eso no hace falta decir de
 * cuál se habla. Ver `ley-de-los-gestos`: el mando encima de lo que cambia.
 *
 * @param tecnica  la que lleva ahora, o `null`.
 * @param onCambio recibe la técnica nueva (con sus números) o `null` para
 *                 quitarla.
 */
export const RemateDeLaSerie = ({ tecnica, etiqueta, onCambio }) => {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setAbierto(false), abierto);
  const capa = useDismissable(abierto);
  const spec = tecnicaSpec(tecnica?.id);
  const cifras = tecnicaCifras(tecnica);

  const escribe = (key, valor) => {
    const campo = spec.campos.find((c) => c.key === key);
    const n = Number(String(valor).replace(',', '.'));
    if (!Number.isFinite(n)) return;
    onCambio({ ...tecnica, [key]: Math.max(campo.min, Math.min(campo.max, Math.round(n))) });
  };

  return (
    <div ref={ref} className="remate-mando">
      <button
        type="button"
        className={`remate-boton${spec ? ' is-puesto' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={spec ? `Remate de ${etiqueta}: ${spec.verbo}` : `Rematar ${etiqueta}`}
        title={spec ? spec.ayuda : 'Rematar esta serie: bajada, rest-pause, myo-reps o parciales'}
        onClick={() => setAbierto((v) => !v)}
      >
        {/* Solo el icono: el botón vive en una columna de 22 px de la tabla y
            un verbo dentro le rompería la retícula a todas las series. Qué
            remate lleva se lee en la línea de debajo, que es donde pasa. */}
        <Zap size={13} aria-hidden="true" />
      </button>

      {capa.mounted && (
        <div
          ref={capa.ref}
          className="popover popover-right remate-capa"
          data-state={capa.closing ? 'closing' : 'open'}
          role="dialog"
          aria-label={`Remate de ${etiqueta}`}
        >
          <div className="remate-elige">
            {/* «Sin remate» a la cabeza y en el mismo carril que las cuatro:
                quitar es elegir, no un botón aparte al final. */}
            <button
              type="button"
              className={`remate-opcion${spec ? '' : ' is-on'}`}
              onClick={() => {
                onCambio(null);
                setAbierto(false);
              }}
            >
              sin remate
            </button>
            {TECNICAS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`remate-opcion${spec?.id === t.id ? ' is-on' : ''}`}
                title={t.ayuda}
                onClick={() => onCambio(tecnicaPorDefecto(t.id))}
              >
                {t.verbo}
              </button>
            ))}
          </div>

          {spec && (
            <>
              <p className="remate-ayuda">{spec.ayuda}</p>
              <div className="remate-campos">
                {spec.campos.map((campo) => (
                  <label key={campo.key} className="remate-campo">
                    <span className="remate-campo-k">{campo.label}</span>
                    <input
                      className="remate-campo-v"
                      inputMode="numeric"
                      defaultValue={tecnica?.[campo.key] ?? campo.por}
                      key={`${campo.key}-${tecnica?.[campo.key] ?? campo.por}`}
                      aria-label={`${campo.label} de ${etiqueta}`}
                      onBlur={(e) => escribe(campo.key, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  </label>
                ))}
              </div>
              {/* Cómo va a quedar escrito, con las mismas palabras que verá el
                  cliente en su teléfono. Es la comprobación de que lo tecleado
                  dice lo que se quería decir. */}
              <p className="remate-dice">
                {spec.verbo}
                {cifras ? ` ${cifras}` : ''}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};
