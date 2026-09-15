import { useEffect, useMemo, useRef } from 'react';

import { useApp } from '@/context/AppContext';
import { abreSoloElCiclo, cicloPorAbrir } from '@/domain/blocks';

/**
 * QUE EL SIGUIENTE SE ABRA SOLO AL CERRAR ESTE.
 *
 * ══ Qué hace ═══════════════════════════════════════════════════════════════
 *
 * Nada, salvo que esta persona lo haya pedido marcando la casilla del aviso de
 * su portada. Entonces, en cuanto su microciclo queda entero anotado, el
 * siguiente se crea sin que nadie pulse nada: la misma operación acotada que
 * hace el botón (`continueProgram` → `continue_program`), disparada por el
 * hecho en vez de por el dedo.
 *
 * ══ Por qué vive en el MARCO del portal y no en la portada ═════════════════
 *
 * Porque el microciclo se cierra entrenando, y se entrena en `/mi/rutina`. Con
 * el automatismo colgado de «Hoy», quien acabara su última sesión tendría que
 * volver a la portada para que se abriera el siguiente — o sea, exactamente el
 * viaje que la casilla existe para ahorrar. El marco está montado en las cinco
 * pantallas, así que el sitio es este.
 *
 * ══ Por qué no lo dispara el entrenador ════════════════════════════════════
 *
 * Porque «Ver como» monta este mismo portal con la ficha de su cliente, y una
 * preferencia del cliente no puede convertirse en una escritura del entrenador
 * por el hecho de que él haya abierto la pantalla a mirar. Ver `useRadiografia`,
 * que ya tiene esta regla escrita: se abre para mirar.
 *
 * ── Una vez por ciclo, aunque React monte dos veces ───────────────────────
 * El número de la semana que se pidió se recuerda en una referencia. Sin eso,
 * el doble montaje de desarrollo pediría el mismo microciclo dos veces y la
 * segunda llegaría a la cola de guardado con la misma clave; y en producción,
 * cualquier render entre la petición y la respuesta lo volvería a pedir.
 */
export const useCicloAutomatico = () => {
  const { activeClient, workoutData, continueProgram, isCoach } = useApp();
  const pedido = useRef(null);

  const clientId = activeClient?.id ?? null;
  const program = clientId ? workoutData?.[clientId] : null;

  const siguiente = useMemo(() => cicloPorAbrir(program), [program]);
  const abreSolo = abreSoloElCiclo(activeClient?.preferences);

  useEffect(() => {
    if (isCoach || !abreSolo || !clientId || !siguiente) return;

    const clave = `${clientId}:${siguiente}`;
    if (pedido.current === clave) return;
    pedido.current = clave;
    continueProgram(clientId);
  }, [isCoach, abreSolo, clientId, siguiente, continueProgram]);
};
