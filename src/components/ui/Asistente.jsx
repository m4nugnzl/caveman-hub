import { Check } from 'lucide-react';

/**
 * EL CARRIL DE PASOS de un formulario partido.
 *
 * ══ Por qué es una pieza ═══════════════════════════════════════════════════
 *
 * Este dibujo —los círculos numerados, el visto en los ya hechos, la línea de
 * abajo y el «Paso 2 de 3» que aparece cuando la ventana es estrecha— estaba
 * escrito a mano en la revisión semanal y otra vez en «Mandar algo», con las
 * mismas clases (`wiz`, en `revision.css`) y el mismo `map`. Con el asistente
 * del objetivo eran tres copias del mismo bucle, y tres copias de un dibujo
 * divergen: basta con que alguien añada un estado a una.
 *
 * El estilo no se mueve de sitio: sigue en `revision.css`, donde ya vivía. Lo
 * que sube aquí es el marcado.
 *
 * ── El carril dice cuántos quedan ─────────────────────────────────────────
 * No es decoración. Sin él, «Siguiente» es una puerta a un número desconocido
 * de pantallas, que es lo que hace abandonar un formulario partido.
 *
 * ── QUÉ CUENTA COMO «HECHO» ───────────────────────────────────────────────
 * Por defecto, haberlo pasado: en un asistente con validación por paso no se
 * avanza sin contestar, así que dejarlo atrás ES haberlo hecho.
 *
 * Pero eso no vale en todas partes. El alta del cliente se puede recorrer
 * entera sin escribir nada —ninguna pregunta es obligatoria— y ahí un visto por
 * haber pasado de largo diría que está contestada una tanda en blanco. Por eso
 * un paso puede traer su propio `hecho`, y entonces manda él.
 *
 * @param pasos   `[{ id, titulo, hecho? }]`.
 * @param indice  El paso en el que se está.
 * @param onIr    Con él, cada marca es un botón y se puede volver a un paso ya
 *   contestado sin deshacer nada. Sin él, el carril solo informa —que es lo que
 *   quiere un asistente con validación por paso, donde saltar adelante dejaría
 *   respuestas sin dar.
 */
export const CarrilDePasos = ({ pasos, indice, onIr = null }) => (
  <>
    <ol className="wiz-rail">
      {pasos.map((p, i) => {
        const actual = i === indice;
        const hecho = p.hecho ?? i < indice;
        const dentro = (
          <>
            <span className="wiz-mark-n" aria-hidden="true">
              {hecho ? <Check size={13} strokeWidth={3} /> : i + 1}
            </span>
            <span className="wiz-mark-k">{p.titulo}</span>
          </>
        );
        return (
          <li
            /* El paso en el que se está manda sobre el visto verde: lo primero
               que hay que poder encontrar en el carril es dónde estás. */
            className={`wiz-mark${actual ? ' is-on' : ''}${!actual && hecho ? ' is-done' : ''}`}
            key={p.id}
            aria-current={actual ? 'step' : undefined}
          >
            {onIr ? (
              <button type="button" className="wiz-ir" onClick={() => onIr(i)}>
                {dentro}
              </button>
            ) : (
              dentro
            )}
          </li>
        );
      })}
    </ol>

    {/* En estrecho los nombres de los pasos se esconden (ver `.wiz-count`):
        esta línea mantiene dicho el total. */}
    <p className="wiz-count">
      Paso {indice + 1} de {pasos.length}
    </p>
  </>
);
