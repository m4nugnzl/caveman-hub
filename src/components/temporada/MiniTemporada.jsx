import { directionById } from '@/domain/goals';
import { addDays } from '@/lib/dates';
import { crearEscala } from './escalaDeTiempo';

const RUTA_Y = 4;
const RUTA_H = 6;
const PESO_Y = RUTA_Y + RUTA_H + 8;
const PESO_H = 44;
export const ALTO_MINI_TEMPORADA = PESO_Y + PESO_H + 4;

const f1 = (n) => Math.round(n * 10) / 10;

/**
 * LA TEMPORADA EN MINIATURA, para la tarjeta del Resumen (26 sep 2026). No
 * se toca: la tarjeta entera es la puerta a la pestaña.
 *
 *     ▓▓▓▓▓▓▓▓▓│░░░░░░░░░░░⚑      ← la ruta: fases por dirección, destino
 *     ‾‾\__/‾‾‾│‾ ‾ ‾ ‾ ‾ ‾        ← el peso (media semanal) y lo esperado
 *              hoy
 *
 * La misma ruta y la misma línea que el minimapa de la línea de tiempo
 * (`Minimapa`), sin ventana ni gestos, y con lo esperado para leer el
 * desvío de un vistazo.
 *
 * @param limites la temporada entera `{ inicio, fin }` (`limitesDe`).
 * @param destino `{ date }` o `null`.
 */
export const MiniTemporada = ({ limites, ancho, fases, semanas, hoy, destino = null }) => {
  const escala = crearEscala(limites, ancho);

  const ruta = fases
    .filter((f) => f.startsOn)
    .map((f, i) => {
      const hasta = f.endsOn || escala.ultimoDia;
      const x = Math.max(0, escala.x(f.startsOn));
      const w = Math.min(ancho, escala.x(addDays(hasta, 1))) - x;
      if (w <= 0) return null;
      return (
        <rect
          key={f.id || i}
          className={`tl-minit-fase${f.startsOn > hoy ? ' is-plan' : ''}`}
          x={f1(x)}
          y={RUTA_Y}
          width={f1(Math.max(1, w - 2))}
          height={RUTA_H}
          rx={2}
          style={{ fill: directionById(f.direction)?.color || 'var(--text-tertiary)' }}
        />
      );
    });

  /* Una escala de kilos para el peso y lo esperado juntos. */
  const pesadas = semanas.filter((s) => s.media !== null && s.estado !== 'futura' && s.jueves);
  const esperadas = semanas.filter((s) => s.esperado !== null && s.jueves);
  const valores = [...pesadas.map((s) => s.media), ...esperadas.map((s) => s.esperado)];
  const min = valores.length ? Math.min(...valores) : 0;
  const max = valores.length ? Math.max(...valores) : 0;
  const Y = (v) => PESO_Y + (max === min ? PESO_H / 2 : ((max - v) / (max - min)) * PESO_H);
  const trazo = (lista, clave) =>
    lista.length > 1 ? lista.map((s, i) => `${i ? 'L' : 'M'}${f1(escala.x(s.jueves))} ${f1(Y(s[clave]))}`).join(' ') : null;
  const peso = trazo(pesadas, 'media');
  const esperado = trazo(esperadas, 'esperado');
  const ultima = pesadas[pesadas.length - 1];

  const xHoy = escala.x(hoy);
  const xDestino = destino?.date ? escala.x(destino.date) : null;

  return (
    <svg className="tl-minit" width={ancho} height={ALTO_MINI_TEMPORADA} viewBox={`0 0 ${ancho} ${ALTO_MINI_TEMPORADA}`} aria-hidden="true">
      {ruta}
      {xHoy >= 0 && xHoy <= ancho && <line className="tl-minit-hoy" x1={f1(xHoy)} x2={f1(xHoy)} y1={0} y2={ALTO_MINI_TEMPORADA} />}
      {esperado && <path className="tl-minit-esperado" d={esperado} />}
      {peso && <path className="tl-minit-peso" d={peso} />}
      {ultima && <circle className="tl-minit-punto" cx={f1(escala.x(ultima.jueves))} cy={f1(Y(ultima.media))} r={3} />}
      {xDestino !== null && xDestino >= 0 && xDestino <= ancho && (
        <g className="tl-minit-destino" transform={`translate(${f1(xDestino)} ${RUTA_Y - 2})`}>
          <line x1={0} x2={0} y1={0} y2={RUTA_H + 4} />
          <path d="M0 0 H7 L5 2.5 L7 5 H0 Z" />
        </g>
      )}
    </svg>
  );
};
