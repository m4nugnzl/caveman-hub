import { useCallback, useRef, useState } from 'react';

/**
 * Estado con espejo sincrónico en un ref.
 *
 * ── El problema que resuelve ────────────────────────────────────────────────
 * Las mutaciones hacían el guardado DENTRO del updater de `setState`:
 *
 *     setWorkoutData((prev) => {
 *       const next = updater(prev[clientId]);
 *       persist(clientId, next);        // ← efecto secundario en función pura
 *       return { ...prev, [clientId]: next };
 *     });
 *
 * React puede invocar un updater más de una vez (StrictMode lo hace siempre en
 * desarrollo, y el reconciliador puede repetirlo al recalcular). Cada mutación
 * disparaba por tanto dos escrituras a la base de datos, y el contrato de
 * pureza de React quedaba roto: con Concurrent Features eso falla de formas no
 * deterministas.
 *
 * No se puede simplemente calcular fuera usando la variable de estado, porque
 * dentro del mismo tick esa variable todavía tiene el valor viejo y dos
 * mutaciones seguidas perderían la primera.
 *
 * La solución es mantener un ref actualizado de forma sincrónica: se lee el
 * valor actual del ref (siempre fresco), se calcula el siguiente, y se llama a
 * `setState` con el valor ya calculado. El updater vuelve a ser puro y el
 * guardado ocurre una sola vez, en el sitio que le corresponde.
 *
 * `set` devuelve el nuevo valor, lo que permite que las mutaciones devuelvan
 * datos útiles (por ejemplo el número de la semana recién creada) sin recurrir
 * a `setTimeout` para "esperar" a que el estado se actualice.
 */
export function useMirroredState(initialValue) {
  const [state, setState] = useState(initialValue);
  const ref = useRef(initialValue);

  const set = useCallback((next) => {
    const value = typeof next === 'function' ? next(ref.current) : next;
    ref.current = value;
    setState(value);
    return value;
  }, []);

  return [state, set, ref];
}