import { useEffect, useRef, useState } from 'react';

import { SessionFeedback } from '@/components/Coach/Workout/SessionFeedback';
import { traduceDbError } from '@/lib/dbErrors';
import { Aire, Boton, Cabecera, Tramo } from './Piezas';

/** Lo que se espera desde la última respuesta antes de guardar. */
const ESPERA_MS = 700;

/**
 * «CUESTIONARIO SEMANAL» EN EL TELÉFONO — el frame `128:195`, con la gramática
 * de los otros nueve (lo decidió el dueño el 18 sep): lienzo blanco, cada
 * pregunta en su caja con canto y el botón en píldora.
 *
 * ══ Se guarda al contestar, no al final ════════════════════════════════════
 *
 * El dibujo acaba en «Guardar respuestas». Aquí cada respuesta se guarda sola
 * al darla, que es la ley de `SessionFeedback` («un formulario con Enviar al
 * final introduce un estado nuevo —contestado pero sin mandar— y una forma de
 * perder lo escrito»). Las escalas se guardan al tocarlas; el texto, cuando se
 * deja de escribir. El renglón de abajo dice si ha llegado.
 *
 * El botón del pie se queda, pero hace lo único que queda por hacer: volver a
 * la lista de la revisión.
 *
 * ── Entregada y revisada ─────────────────────────────────────────────────
 * Entregada, lo que se cambie aquí corrige la entrega (la base lo permite
 * hasta que su entrenador la revise). Revisada, se lee y no se toca.
 */
export const PantallaCuestionario = ({ datos }) => {
  const { sub, preguntas, iniciales, cerrada, yaEntregada, onGuardar, onVolver } = datos;
  const [respuestas, setRespuestas] = useState(iniciales);
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);

  /* Si hay algo tocado que el reloj todavía no ha mandado. Se manda al salir,
     para que volver atrás justo después de escribir no se lo lleve. */
  const pendiente = useRef(null);
  const tocado = useRef(false);
  const guardarRef = useRef(onGuardar);
  useEffect(() => {
    guardarRef.current = onGuardar;
  }, [onGuardar]);

  useEffect(() => {
    if (!tocado.current) return undefined;
    pendiente.current = respuestas;
    const reloj = setTimeout(async () => {
      pendiente.current = null;
      setEstado('guardando');
      const res = await guardarRef.current(respuestas);
      if (res && res.ok === false) {
        setEstado('error');
        setError(traduceDbError(res.error));
      } else {
        setEstado('guardado');
        setError(null);
      }
    }, ESPERA_MS);
    return () => clearTimeout(reloj);
  }, [respuestas, intento]);

  useEffect(
    () => () => {
      if (pendiente.current) guardarRef.current(pendiente.current);
    },
    []
  );

  const responder = (id, valor) => {
    tocado.current = true;
    /* Funcional: `SessionFeedback` puede llamar varias veces seguidas —la de
       arriba y la que se queda huérfana— y cada una tiene que ver la anterior. */
    setRespuestas((prev) => ({ ...prev, [id]: valor }));
  };

  return (
    <>
      <Cabecera titulo="Cuestionario semanal" sub={sub} atras={{ onClick: onVolver }} disco />

      <Tramo>
        <p className="tel-pie tel-pie-arriba">
          {cerrada
            ? 'Tu entrenador ya ha revisado esta semana. Esto es lo que contestaste.'
            : 'Lo que la báscula no cuenta. Ninguna es obligatoria: en blanco, tu entrenador ve que no la has contestado en vez de un número inventado.'}
        </p>

        <div className="tel-cuestionario">
          <SessionFeedback
            questions={preguntas}
            answers={respuestas}
            title={false}
            readOnly={cerrada}
            onChange={responder}
          />
        </div>

        {!cerrada ? (
          <p
            className={`tel-pie tel-guardado-estado${estado === 'error' ? ' tel-error' : ''}`}
            role="status"
            aria-live="polite"
          >
            {estado === 'guardando'
              ? 'Guardando…'
              : estado === 'guardado'
                ? yaEntregada
                  ? 'Guardado. Tu entrenador ya ve la respuesta corregida.'
                  : 'Guardado. Se manda cuando entregues tu revisión.'
                : estado === 'error'
                  ? `No se ha guardado: ${error}`
                  : null}
            {estado === 'error' ? (
              <button type="button" className="tel-reintentar" onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </button>
            ) : null}
          </p>
        ) : null}
      </Tramo>

      <div className="tel-hoja-pie">
        <Boton onClick={onVolver}>
          Volver a la revisión
        </Boton>
      </div>

      <Aire />
    </>
  );
};
