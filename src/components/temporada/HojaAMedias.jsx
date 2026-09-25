import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * LA HOJA A MEDIAS (25 sep 2026): la tarjeta de impacto en el teléfono.
 *
 * La tarjeta se lee CONTRA la gráfica: sus tres ventanas están dibujadas
 * encima. Una hoja modal la tapaba entera, así que esta se abre a media
 * altura, sin velo y sin bloquear lo de detrás: la gráfica, con sus ventanas y
 * sus bordes arrastrables, sigue a la vista y se puede tocar.
 *
 * Dos alturas, como las hojas de Mapas: MEDIA y ENTERA. Se cambia arrastrando
 * el asa (hacia arriba sube; hacia abajo baja, y desde media cierra) o
 * pulsándola, que es la forma de hacerlo con el teclado o un lector. Escape
 * cierra.
 *
 * No es `Modal`: aquel atrapa el foco y bloquea el fondo, que es justo lo que
 * aquí sobra. Por eso el rol es de diálogo NO modal.
 */
const UMBRAL = 56;

export const HojaAMedias = ({ titulo, onCerrar, pie = null, children }) => {
  const tituloId = useId();
  const [entera, setEntera] = useState(false);
  const hojaRef = useRef(null);
  const gesto = useRef(null);
  /* Un arrastre también dispara el clic al soltar: ese clic no cambia nada. */
  const arrastrado = useRef(false);

  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  /* El dedo mueve la hoja directamente (sin estado de React por cada
     `pointermove`); al soltar, decide la altura. */
  const onPointerDown = (e) => {
    if (e.button > 0 || !hojaRef.current) return;
    gesto.current = { y0: e.clientY, t0: e.timeStamp, dy: 0, movio: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    hojaRef.current.style.transition = 'none';
  };
  const onPointerMove = (e) => {
    const g = gesto.current;
    const hoja = hojaRef.current;
    if (!g || !hoja) return;
    g.dy = e.clientY - g.y0;
    if (Math.abs(g.dy) > 4) g.movio = true;
    /* Hacia arriba estira la altura; hacia abajo desplaza la hoja. */
    if (g.dy < 0 && !entera) hoja.style.height = `calc(var(--hoja-media) + ${-g.dy}px)`;
    else hoja.style.transform = `translateY(${Math.max(0, g.dy)}px)`;
  };
  const onPointerUp = (e) => {
    const g = gesto.current;
    const hoja = hojaRef.current;
    gesto.current = null;
    if (!g || !hoja) return;
    hoja.style.transition = '';
    hoja.style.transform = '';
    hoja.style.height = '';
    arrastrado.current = g.movio;
    if (!g.movio) return;
    const rapido = Math.abs(g.dy) / Math.max(1, e.timeStamp - g.t0) > 0.5;
    if (g.dy < -UMBRAL || (g.dy < 0 && rapido)) setEntera(true);
    else if (g.dy > UMBRAL || (g.dy > 0 && rapido)) {
      if (entera) setEntera(false);
      else onCerrar();
    }
  };

  return createPortal(
    <section ref={hojaRef} className={`tl-hoja${entera ? ' is-entera' : ''}`} role="dialog" aria-modal="false" aria-labelledby={tituloId}>
      <button
        type="button"
        className="tl-hoja-asa"
        aria-label={entera ? 'Bajar la hoja a media altura' : 'Subir la hoja a pantalla completa'}
        aria-expanded={entera}
        onClick={() => {
          if (arrastrado.current) arrastrado.current = false;
          else setEntera((v) => !v);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span aria-hidden="true" />
      </button>
      <header className="tl-hoja-cabeza">
        <h2 id={tituloId} className="modal-title">
          {titulo}
        </h2>
        <button type="button" className="btn btn-icon" onClick={onCerrar} aria-label="Cerrar">
          <X size={15} />
        </button>
      </header>
      <div className="tl-hoja-cuerpo">{children}</div>
      {pie && <footer className="modal-footer">{pie}</footer>}
    </section>,
    document.body
  );
};
