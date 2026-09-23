import { useRef, useState } from 'react';

import { Thumb } from './Thumb';

const PASO = 5;
const acotar = (v) => Math.min(100, Math.max(0, v));

/**
 * LA CORTINILLA: antes y ahora sobre el mismo encuadre, y una línea que se
 * arrastra para descubrir uno u otro (22 sep 2026).
 *
 * A la izquierda de la línea se ve el Antes; a la derecha, el Ahora. Las dos
 * fotos se recortan igual —3:4, centradas— y ocupan el mismo sitio, así que lo
 * que cambia al mover la línea es el cuerpo y no el marco.
 *
 * ── No alinea ───────────────────────────────────────────────────────────────
 * Si se colocó distinto una semana y otra, se nota: el encuadre a mano es del
 * Estudio. Esto compara lo que se subió, tal cual.
 *
 * ── El gesto es suyo ────────────────────────────────────────────────────────
 * El visor pasa de foto al soltar un arrastre de más de 50 px; aquí arrastrar
 * mueve la línea, así que el puntero no sube (`stopPropagation`). Y con el foco
 * en la línea, las flechas la mueven a ella y no cambian de ángulo: el visor
 * no atiende las flechas que nacen en un `role="slider"` (ver `Gallery`).
 *
 * @param antes `{ url, pie }` — `pie` es «Antes · S5 · 73,2 kg».
 * @param ahora `{ url, pie }`.
 */
export const Cortinilla = ({ antes, ahora }) => {
  const [corte, setCorte] = useState(50);
  const caja = useRef(null);
  const arrastrando = useRef(false);

  const aLaX = (x) => {
    const r = caja.current?.getBoundingClientRect();
    if (!r?.width) return;
    setCorte(acotar(((x - r.left) / r.width) * 100));
  };

  const teclas = {
    ArrowLeft: (v) => v - PASO,
    ArrowDown: (v) => v - PASO,
    ArrowRight: (v) => v + PASO,
    ArrowUp: (v) => v + PASO,
    Home: () => 0,
    End: () => 100,
  };

  return (
    <div
      ref={caja}
      className="cortinilla"
      style={{ '--corte': `${corte}%` }}
      onPointerDown={(e) => {
        e.stopPropagation();
        arrastrando.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        aLaX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (arrastrando.current) aLaX(e.clientX);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        arrastrando.current = false;
      }}
      onPointerCancel={() => {
        arrastrando.current = false;
      }}
    >
      <Thumb url={antes.url} alt={antes.pie} width={1200} className="cortinilla-foto" />
      <Thumb url={ahora.url} alt={ahora.pie} width={1200} className="cortinilla-foto is-ahora" />

      <span className="cortinilla-pie is-antes">{antes.pie}</span>
      <span className="cortinilla-pie is-ahora">{ahora.pie}</span>

      <span
        className="cortinilla-linea"
        role="slider"
        tabIndex={0}
        aria-label="Línea entre antes y ahora"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(corte)}
        aria-valuetext={`${Math.round(corte)} % de antes a la vista`}
        onKeyDown={(e) => {
          const mover = teclas[e.key];
          if (!mover) return;
          e.preventDefault();
          setCorte((v) => acotar(mover(v)));
        }}
      >
        <span className="cortinilla-asa" aria-hidden="true" />
      </span>
    </div>
  );
};
