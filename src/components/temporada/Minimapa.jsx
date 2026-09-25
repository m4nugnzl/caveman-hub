import { useRef } from 'react';

import { directionById } from '@/domain/goals';
import { addDays, shortDate } from '@/lib/dates';
import { aDia, crearEscala, desplazar, SEMANA_MS } from './escalaDeTiempo';

/** Lo alto del minimapa: la ruta en miniatura y, debajo, la línea del peso. */
export const ALTO_MINIMAPA = 30;
const RUTA_Y = 3;
const RUTA_H = 5;
const PESO_Y = 12;
const PESO_H = ALTO_MINIMAPA - PESO_Y - 3;
/* Lo que se puede errar al coger un borde de la ventana, a cada lado. */
const BORDE = 7;

const f1 = (n) => Math.round(n * 10) / 10;

/**
 * EL MINIMAPA: la temporada entera en una franja fina, bajo el eje, cuando la
 * vista no la enseña toda (25 sep 2026). Es para no perder de vista dónde se
 * está.
 *
 *     ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░              ← las fases, en miniatura
 *     ‾‾‾‾\__/‾‾‾[‾‾\___]‾‾‾\__           ← el peso, simplificado
 *               └ ventana ┘               ← lo que se ve
 *
 * La ventana marca el tramo visible. Arrastrarla desplaza la vista; arrastrar
 * sus bordes la amplía o la reduce; pulsar fuera la centra ahí. Con el
 * teclado, ← y → la mueven una semana.
 *
 * @param limites  la temporada entera `{ inicio, fin }`.
 * @param vista    lo que se ve `{ inicio, fin }`.
 * @param onMover  poner una vista de golpe (mientras se arrastra).
 * @param onIr     ir a una vista con su paso (pulsar fuera, el teclado).
 */
export const Minimapa = ({ limites, vista, ancho, fases, semanas, hoy, onMover, onIr }) => {
  const escala = crearEscala(limites, ancho);
  const gesto = useRef(null);
  const total = limites.fin - limites.inicio;

  /* La ruta: cada fase, del color de su dirección; lo que falta, más lavado. */
  const ruta = fases
    .filter((f) => f.startsOn)
    .map((f, i) => {
      const hasta = f.endsOn || escala.ultimoDia;
      const x = Math.max(0, escala.x(f.startsOn));
      const w = Math.min(ancho, escala.x(addDays(hasta, 1))) - x;
      if (w <= 0) return null;
      const color = directionById(f.direction)?.color || 'var(--text-tertiary)';
      return (
        <rect
          key={f.id || i}
          className={`tl-mini-fase${f.startsOn > hoy ? ' is-plan' : ''}`}
          x={f1(x)}
          y={RUTA_Y}
          width={f1(Math.max(1, w - 1))}
          height={RUTA_H}
          rx={1.5}
          style={{ fill: color }}
        />
      );
    });

  /* El peso: la media de cada semana, en su jueves, unida. */
  const puntos = semanas.filter((s) => s.media !== null && s.estado !== 'futura' && s.jueves);
  let linea = null;
  if (puntos.length > 1) {
    const valores = puntos.map((s) => s.media);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const Y = (v) => PESO_Y + (max === min ? PESO_H / 2 : ((max - v) / (max - min)) * PESO_H);
    linea = puntos.map((s, i) => `${i ? 'L' : 'M'}${f1(escala.x(s.jueves))} ${f1(Y(s.media))}`).join(' ');
  }

  const xa = Math.max(0, escala.xMs(vista.inicio));
  const xb = Math.min(ancho, escala.xMs(vista.fin));

  const aTiempo = (dx) => (dx / (ancho || 1)) * total;
  const pxDe = (e) => e.clientX - e.currentTarget.getBoundingClientRect().left;

  const alBajar = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    /* El minimapa no es lienzo: nada de cursor ni de franja debajo. */
    e.stopPropagation();
    const px = pxDe(e);
    let modo = 'mover';
    let desde = vista;
    if (Math.abs(px - xa) <= BORDE && px < (xa + xb) / 2) modo = 'izquierda';
    else if (Math.abs(px - xb) <= BORDE) modo = 'derecha';
    else if (px < xa || px > xb) {
      /* Pulsar fuera: la ventana se centra ahí, y se puede seguir arrastrando. */
      const t = escala.tDe(px);
      const mitad = (vista.fin - vista.inicio) / 2;
      desde = { inicio: t - mitad, fin: t + mitad };
      onIr(desde);
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gesto.current = { modo, px, desde };
  };

  const alMover = (e) => {
    const g = gesto.current;
    if (!g) return;
    const dt = aTiempo(pxDe(e) - g.px);
    const { inicio, fin } = g.desde;
    if (g.modo === 'mover') onMover({ inicio: inicio + dt, fin: fin + dt });
    else if (g.modo === 'izquierda') onMover({ inicio: Math.min(inicio + dt, fin - SEMANA_MS), fin });
    else onMover({ inicio, fin: Math.max(fin + dt, inicio + SEMANA_MS) });
  };

  const alSoltar = () => {
    gesto.current = null;
  };

  const alTeclear = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    onIr(desplazar(vista, (e.key === 'ArrowLeft' ? -1 : 1) * SEMANA_MS, limites));
  };

  return (
    <svg
      className="tl-mini"
      width={ancho}
      height={ALTO_MINIMAPA}
      viewBox={`0 0 ${ancho} ${ALTO_MINIMAPA}`}
      role="slider"
      tabIndex={0}
      aria-label="Dónde estás en la temporada"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(((vista.inicio - limites.inicio) / (total || 1)) * 100)}
      aria-valuetext={`Se ve del ${shortDate(aDia(vista.inicio))} al ${shortDate(aDia(vista.fin - 1))}`}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onKeyDown={alTeclear}
    >
      <rect className="tl-mini-fondo" x={0} y={0} width={ancho} height={ALTO_MINIMAPA} rx={4} />
      {ruta}
      {linea && <path className="tl-mini-peso" d={linea} />}
      {/* Lo que no se ve, velado; la ventana, en el azul de la selección. */}
      <rect className="tl-mini-velo" x={0} y={0} width={f1(xa)} height={ALTO_MINIMAPA} />
      <rect className="tl-mini-velo" x={f1(xb)} y={0} width={f1(Math.max(0, ancho - xb))} height={ALTO_MINIMAPA} />
      <rect className="tl-mini-ventana" x={f1(xa + 0.5)} y={0.5} width={f1(Math.max(2, xb - xa - 1))} height={ALTO_MINIMAPA - 1} rx={4} />
      <rect className="tl-mini-asa" x={f1(xa - BORDE)} y={0} width={BORDE * 2} height={ALTO_MINIMAPA} />
      <rect className="tl-mini-asa" x={f1(xb - BORDE)} y={0} width={BORDE * 2} height={ALTO_MINIMAPA} />
    </svg>
  );
};
