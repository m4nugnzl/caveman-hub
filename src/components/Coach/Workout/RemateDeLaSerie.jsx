import { useRef, useState } from 'react';
import { Zap } from 'lucide-react';

import {
  TECNICAS,
  cifraDeTecnica,
  tecnicaAlEscribir,
  tecnicaCifras,
  tecnicaPorDefecto,
  tecnicaSpec,
} from '@/domain/training';
import { useCapaFlotante } from '@/lib/useCapaFlotante';
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
 * ══ La frase es el formulario ══════════════════════════════════════════════
 *
 * Los campos iban en columnas —rótulo arriba, casilla abajo— y debajo, otra
 * vez, la frase que salía de ellos («bajada ×1, −20 %») para comprobar que lo
 * tecleado decía lo que se quería decir. Dos veces lo mismo, y la capa se leía
 * como un formulario suelto en medio de una hoja que es una tabla. Ahora las
 * casillas van DENTRO de la frase —«bajada ×[1] −[20] %»—, que es a la vez lo
 * que se escribe y cómo se lee. La arma `tecnicaAlEscribir` con lo que declara
 * cada campo.
 *
 * ── Y se guarda al salir de la casilla ────────────────────────────────────
 * ↑/↓ mueven la cifra dentro de su rango, pero solo en la casilla: cada
 * guardado es un paso del ⌘Z (`usePilaDeCambios`) y en Entreno además un viaje
 * a la base, y cinco pulsaciones no son cinco gestos. Se escribe al salir, con
 * Enter, o con Escape, que devuelve el foco al rayo y con eso sale.
 *
 * ══ Y cuelga de la SERIE ═══════════════════════════════════════════════════
 *
 * Vivía en el ejercicio y siempre en la última. Aquí el mando está EN la fila
 * de la serie que remata, que es donde se lee, y por eso no hace falta decir de
 * cuál se habla. Ver `ley-de-los-gestos`: el mando encima de lo que cambia.
 *
 * @param tecnica  la que lleva ahora, o `null`.
 * @param etiqueta de qué serie se habla: «Press banca, serie 3».
 * @param onCambio recibe la técnica nueva (con sus números) o `null` para
 *                 quitarla.
 */
export const RemateDeLaSerie = ({ tecnica, etiqueta, onCambio }) => {
  const [abierto, setAbierto] = useState(false);
  /* Lo tecleado y aún sin guardar, por campo. Vacío, la casilla dice lo
     guardado. */
  const [borrador, setBorrador] = useState({});
  const ref = useRef(null);
  const botonRef = useRef(null);
  useClickOutside(ref, () => setAbierto(false), abierto);
  const capa = useDismissable(abierto);
  const flota = useCapaFlotante(capa.mounted, ref, capa.ref, { alineado: 'derecha' });
  const spec = tecnicaSpec(tecnica?.id);

  const guardado = (campo) => tecnica?.[campo.key] ?? campo.por;
  const olvida = (key) =>
    setBorrador((b) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== key)));

  const escribe = (campo) => {
    if (!(campo.key in borrador)) return;
    const n = cifraDeTecnica(campo, borrador[campo.key]);
    olvida(campo.key);
    /* Una casilla vaciada vuelve a lo que decía: borrar no es escribir el
       mínimo, y un remate no se queda a medio escribir. */
    if (n === null || n === guardado(campo)) return;
    onCambio({ ...tecnica, [campo.key]: n });
  };

  const alTeclear = (campo) => (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
      return;
    }
    const paso = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
    if (paso === 0) return;
    e.preventDefault();
    const ahora = cifraDeTecnica(campo, borrador[campo.key] ?? guardado(campo)) ?? guardado(campo);
    const siguiente = cifraDeTecnica(campo, ahora + paso * (e.shiftKey ? 5 : 1));
    setBorrador((b) => ({ ...b, [campo.key]: String(siguiente) }));
  };

  return (
    <div ref={ref} className="remate-mando">
      <button
        ref={botonRef}
        type="button"
        className={`remate-boton${spec ? ' is-puesto' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={spec ? `${etiqueta}: ${spec.verbo}` : `Serie de alta intensidad: ${etiqueta}`}
        title={spec ? spec.verbo : 'Serie de alta intensidad'}
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
          style={flota.estilo}
          {...flota.atributos}
          data-state={capa.closing ? 'closing' : 'open'}
          role="dialog"
          aria-label={`Alta intensidad, ${etiqueta}`}
          onKeyDown={(e) => {
            /* Cierra `useClickOutside`, que escucha en el documento y llega
               después. Aquí solo se devuelve el foco a su sitio, y al salir de
               la casilla lo tecleado se guarda. */
            if (e.key === 'Escape') botonRef.current?.focus();
          }}
        >
          {/* «Normal» en el mismo carril que las cuatro: quitar es elegir,
              no un botón aparte. Y se dice como una serie más, que es como
              lo dicen Hevy o Strong, no como la ausencia de algo. */}
          <div className="segmented remate-tipos" role="group" aria-label="Técnica">
            <button
              type="button"
              className="segmented-item"
              aria-pressed={!spec}
              onClick={() => {
                onCambio(null);
                setAbierto(false);
              }}
            >
              normal
            </button>
            {TECNICAS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="segmented-item"
                aria-pressed={spec?.id === t.id}
                title={t.ayuda}
                onClick={() => spec?.id !== t.id && onCambio(tecnicaPorDefecto(t.id))}
              >
                {t.verbo}
              </button>
            ))}
          </div>

          {spec && (
            <>
              <p className="remate-frase">
                <span className="remate-frase-verbo">{spec.verbo}</span>
                {tecnicaAlEscribir(spec.id).map(({ campo, antes, despues }) => (
                  <span key={campo.key} className="remate-frase-trozo">
                    {antes && <span aria-hidden="true">{antes}</span>}
                    <input
                      className="remate-cifra"
                      inputMode="numeric"
                      value={borrador[campo.key] ?? String(guardado(campo))}
                      title={campo.label}
                      aria-label={`${etiqueta}: ${campo.label}`}
                      onChange={(e) => {
                        const valor = e.target.value;
                        setBorrador((b) => ({ ...b, [campo.key]: valor }));
                      }}
                      onBlur={() => escribe(campo)}
                      onKeyDown={alTeclear(campo)}
                    />
                    {despues && <span aria-hidden="true">{despues}</span>}
                  </span>
                ))}
              </p>
              <p className="remate-pie">{spec.ayuda}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * La línea del remate, colgando de su serie: el rayo, la técnica y sus
 * números. La misma en la hoja de Entreno y en el compositor, para que un
 * remate no tenga dos dibujos.
 */
export const LineaDelRemate = ({ tecnica, className = '' }) => {
  const spec = tecnicaSpec(tecnica?.id);
  if (!spec) return null;
  const cifras = tecnicaCifras(tecnica);
  return (
    <p className={`hoja-remate ${className}`.trim()} title={spec.ayuda}>
      <Zap size={13} aria-hidden="true" />
      <span className="hoja-remate-verbo">{spec.verbo}</span>
      {cifras && <span>{cifras}</span>}
    </p>
  );
};
