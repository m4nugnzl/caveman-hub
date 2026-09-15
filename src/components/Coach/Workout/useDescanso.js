import { useEffect, useState } from 'react';

/**
 * El descanso entre series.
 *
 * ══ Por qué existe, y qué corrige ═══════════════════════════════════════════
 *
 * Esto vivía dentro de `ClientRoutine` con una regla escrita así: «el descanso
 * es el PAUTADO, y si no hay pauta no hay cuenta atrás». La regla es correcta y
 * se queda —arrancar noventa segundos por defecto le pone a todo el mundo un
 * descanso que su entrenador no ha puesto, y un número en pantalla es una
 * instrucción— pero de ella se sacó una conclusión que no se seguía: que sin
 * pauta no hubiera NADA.
 *
 * Y sin pauta está la mayoría. El dueño del producto, sin ir más lejos, no
 * pauta descansos, así que la pieza no aparecía nunca en sus clientes: existía
 * en el código y no en el producto.
 *
 * Son dos cosas distintas y se habían juntado en una:
 *
 *   · **El objetivo** lo dice quien programa. Si no lo ha dicho, no se inventa.
 *   · **El tiempo que llevas parado** es un hecho, y saberlo no es una
 *     instrucción de nadie: es mirar el reloj de la pared del gimnasio.
 *
 * Así que la cuenta arranca siempre, y lo que cambia es QUÉ cuenta:
 *
 *   · Con pauta (`restSeconds` de la hoja), cuenta ATRÁS hacia el objetivo y se
 *     apaga sola al llegar, que es lo que hacía hasta ahora.
 *   · Sin pauta, cuenta HACIA ARRIBA y no reclama nada. No hay meta que
 *     dibujar, así que no se dibuja ninguna.
 *
 * ── El tope de la cuenta libre ──────────────────────────────────────────────
 * Sin pauta no hay final, y un contador que sube para siempre es un contador
 * que redibuja para siempre —y que a la media hora dice «34:12» como si eso
 * fuera un descanso—. A los cinco minutos se apaga solo: por encima de ahí ya
 * no estás descansando entre series, estás haciendo otra cosa.
 */

/** Por encima de esto ya no es un descanso. Ver arriba. */
export const TOPE_SIN_PAUTA = 300;

/** Segundos en `m:ss`. */
export const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Qué enseña el descanso en un instante dado, o `null` si ya no enseña nada.
 *
 * Es una función pura y está fuera del gancho a propósito: es la regla —cuándo
 * cuenta atrás, cuándo cuenta hacia arriba y cuándo se apaga— y es lo único de
 * esta pieza que merece una prueba.
 *
 * @param {{ desde: number|null, pauta: number|null, ahora: number }} args
 * @returns {{ segundos: number, cuentaAtras: boolean, pauta: number|null }|null}
 */
export const lecturaDelDescanso = ({ desde, pauta, ahora }) => {
  if (!desde) return null;

  const transcurrido = Math.max(0, Math.floor((ahora - desde) / 1000));

  if (pauta > 0) {
    const restante = pauta - transcurrido;
    /* Llegó a cero: el descanso ha terminado y la pieza se retira. */
    return restante <= 0 ? null : { segundos: restante, cuentaAtras: true, pauta };
  }

  if (transcurrido >= TOPE_SIN_PAUTA) return null;
  return { segundos: transcurrido, cuentaAtras: false, pauta: null };
};

/**
 * El descanso, como estado de una pantalla.
 *
 * `empezar(pauta)` arranca siempre; `pauta` puede ser `null` y entonces la
 * cuenta sube. `parar()` lo retira — es lo que hace el toque sobre la pieza,
 * porque quien vuelve a la barra antes de tiempo ya ha decidido seguir.
 */
export function useDescanso() {
  const [inicio, setInicio] = useState(null);
  /* El redibujo del segundero. Medio segundo y no uno entero: con uno, el
     número se queda hasta 999 ms viejo y la cuenta se ve dar saltos de dos. */
  const [, tick] = useState(0);

  useEffect(() => {
    if (!inicio) return undefined;
    const id = setInterval(() => tick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [inicio]);

  const lectura = inicio ? lecturaDelDescanso({ ...inicio, ahora: Date.now() }) : null;

  /* Se apagó solo (llegó a cero, o se pasó del tope): se suelta el estado para
     que el intervalo de arriba se desmonte y deje de redibujar para nadie. */
  useEffect(() => {
    if (inicio && !lectura) setInicio(null);
  }, [inicio, lectura]);

  return {
    lectura,
    empezar: (pauta) => setInicio({ desde: Date.now(), pauta: pauta > 0 ? pauta : null }),
    parar: () => setInicio(null),
  };
}
