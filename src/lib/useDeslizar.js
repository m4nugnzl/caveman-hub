import { useRef } from 'react';

/**
 * ══ PASAR HOJA CON EL DEDO ═══════════════════════════════════════════════════
 *
 * El portal se abre de pie, en el gimnasio y con una mano. Ahí la rutina son
 * hojas —una por sesión— y cambiar de hoja es deslizar, igual que en cualquier
 * aplicación del teléfono. Este gancho es solo eso: convertir un arrastre en
 * «anterior» o «siguiente».
 *
 * ── Por qué no hay carrusel ni scroll horizontal ────────────────────────────
 * Porque una hoja mide dos mil píxeles de alto: un contenedor con
 * `scroll-snap-type: x` tendría que llevar dentro las hojas vecinas enteras
 * —cada una con sus inputs controlados— y su alto sería el de la más larga, así
 * que debajo de una sesión corta quedaría el hueco de la larga de al lado. Se
 * pinta UNA hoja, y el gesto la cambia. Es además lo que hace un pager nativo,
 * que es a donde esto va.
 *
 * ── Dónde NO se pasa hoja ───────────────────────────────────────────────────
 * Sobre un campo (escribir kilos arrastra el cursor, no la pantalla) y sobre
 * cualquier cosa marcada con `data-sin-deslizar`, que son los carriles que ya
 * se mueven a lo ancho por su cuenta. Sin esa guarda, mover el carril de las
 * sesiones del día también cambiaría de sesión.
 */

/** Lo que hay que arrastrar para que cuente. Menos de esto es un dedo apoyado. */
export const UMBRAL = 56;

/**
 * El gesto, a partir de lo que se movió el dedo. `null` si no lo es.
 *
 * Pide que el arrastre sea claramente horizontal —una vez y media más que lo
 * vertical— porque el gesto que se hace en esta pantalla mil veces es bajar por
 * los ejercicios, y una bajada torcida no puede sacarte de la sesión.
 */
export const decidirGesto = ({ dx, dy }) => {
  if (Math.abs(dx) < UMBRAL) return null;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'siguiente' : 'anterior';
};

const SIN_GESTO = 'input, textarea, select, [contenteditable], [data-sin-deslizar]';

export const useDeslizar = ({ onAnterior, onSiguiente, activo = true }) => {
  const origen = useRef(null);

  if (!activo) return {};

  return {
    onTouchStart: (evento) => {
      const toque = evento.touches?.length === 1 ? evento.touches[0] : null;
      origen.current =
        toque && !evento.target?.closest?.(SIN_GESTO) ? { x: toque.clientX, y: toque.clientY } : null;
    },
    onTouchEnd: (evento) => {
      const desde = origen.current;
      origen.current = null;
      const toque = evento.changedTouches?.[0];
      if (!desde || !toque) return;

      const gesto = decidirGesto({ dx: toque.clientX - desde.x, dy: toque.clientY - desde.y });
      if (gesto === 'anterior') onAnterior?.();
      if (gesto === 'siguiente') onSiguiente?.();
    },
  };
};
