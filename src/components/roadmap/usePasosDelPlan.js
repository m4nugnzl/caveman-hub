import { useCallback, useRef, useState } from 'react';

/**
 * DESHACER EN EL CREADOR DEL PLAN: una pila de GESTOS con su inverso.
 *
 * ══ Por qué no vale ninguna de las dos pilas que ya hay ════════════════════
 *
 * `useWorkout` guarda fotos del programa y `lib/usePilaDeCambios` fotos de un
 * estado local. Aquí casi nada es una foto que se pueda devolver: estirar una
 * fase mueve varias filas de `client_phases` en la base (0136), un hecho es un
 * evento del calendario, el peso objetivo vive en la ficha. Lo que sí tiene
 * cada gesto es su INVERSO exacto —estirar −14 deshace estirar +14—, así que la
 * pila guarda pares `{ deshacer, rehacer }` y los llama.
 *
 * ── Un gesto es un paso ────────────────────────────────────────────────────
 * Un arrastre entero es UN paso, aunque haya pasado por diez semanas: se apunta
 * al soltar, no en cada encaje. Lo mismo al añadir: el paso es la fase, no los
 * campos que se rellenaron.
 *
 * ── Si el inverso falla, el paso no se pierde ─────────────────────────────
 * Se queda donde estaba y se devuelve el error: la pantalla lo dice, y se puede
 * volver a intentar. Tirarlo dejaría el cambio hecho y sin camino de vuelta.
 *
 * @returns `{ pasos, apuntar, deshacer, rehacer, ocupado }`. Cada paso es
 *   `{ texto, deshacer: () => Promise<{ok, error?}>, rehacer: () => Promise<…> }`.
 */

/** Cuántos gestos atrás. Una tarde de planificar cabe de sobra. */
const MAX = 40;

export const usePasosDelPlan = () => {
  const atras = useRef([]);
  const adelante = useRef([]);
  const enMarcha = useRef(false);
  const [pasos, setPasos] = useState({ atras: 0, adelante: 0, ultimo: null });
  const [ocupado, setOcupado] = useState(false);

  const contar = () =>
    setPasos({
      atras: atras.current.length,
      adelante: adelante.current.length,
      ultimo: atras.current[atras.current.length - 1]?.texto || null,
    });

  const apuntar = useCallback((paso) => {
    atras.current = [...atras.current, paso].slice(-MAX);
    adelante.current = [];
    contar();
  }, []);

  const mover = useCallback(async (de, a, verbo) => {
    if (enMarcha.current || de.current.length === 0) return { ok: false, nada: true };
    const paso = de.current[de.current.length - 1];
    enMarcha.current = true;
    setOcupado(true);
    let res;
    try {
      res = (await paso[verbo]()) || { ok: true };
    } catch (e) {
      res = { ok: false, error: e?.message || 'No se ha podido.' };
    }
    enMarcha.current = false;
    setOcupado(false);
    if (!res.ok) return res;
    de.current = de.current.slice(0, -1);
    a.current = [...a.current, paso];
    contar();
    return { ok: true, paso };
  }, []);

  const deshacer = useCallback(() => mover(atras, adelante, 'deshacer'), [mover]);
  const rehacer = useCallback(() => mover(adelante, atras, 'rehacer'), [mover]);

  return { pasos, apuntar, deshacer, rehacer, ocupado };
};
