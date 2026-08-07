import { useEffect } from 'react';

/**
 * Cierra un desplegable al pulsar fuera o al pulsar Escape.
 *
 * Había tres implementaciones distintas de esto (selector de cliente, menú de
 * acciones del día, sugerencias del buscador de ejercicios) y ninguna
 * escuchaba Escape, así que con el teclado no había forma de cerrar nada.
 */
export function useClickOutside(ref, onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;

    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, onClose, active]);
}
