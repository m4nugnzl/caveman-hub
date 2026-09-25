import { addDays, localeNumber } from '@/lib/dates';
import { cabeEn } from './escalones';

const f1 = (n) => Math.round(n * 10) / 10;
/** Lo alto de todas las filas de tira: sensaciones y entrenos. */
export const ALTO_TIRA = 22;
const HUECO = 1;

/** «4», «3,5»: la cifra de una celda. */
const cifra = (c) => c.texto ?? localeNumber(c.valor, { maximumFractionDigits: 1 });

/**
 * UNA FILA DE TIRA: una celda por semana (o por día), con su valor dentro si
 * cabe (24 sep 2026).
 *
 * El color es solo para los extremos de la escala según el sentido de la
 * pregunta (`tonoDeSensacion`): lo malo en un tono cálido, lo bueno en verde,
 * los dos suaves. El resto, neutro. Lo que falta, una celda vacía con borde:
 * no se inventa. Bajo el cursor, la celda se marca con un canto.
 *
 * @param celdas `[{ clave, desde, hasta, valor, tono, texto?, titulo? }]` (`capas.js`).
 * @param cursor el día bajo el cursor, o `null`.
 */
export const TiraDeCalor = ({ escala, celdas, cursor = null }) => {
  const W = escala.ancho;
  const alto = ALTO_TIRA;
  return (
    <g className="tl-tira">
      {celdas
        .filter((c) => escala.toca(c.desde, c.hasta))
        .map((c) => {
          const xa = Math.max(-2, escala.x(c.desde));
          const xb = Math.min(W + 2, escala.x(addDays(c.hasta, 1)));
          const ancho = xb - xa - HUECO;
          if (ancho <= 0.5) return null;
          const vacia = c.valor === null;
          const bajo = cursor && cursor >= c.desde && cursor <= c.hasta;
          const texto = vacia ? null : cifra(c);
          return (
            <g key={c.clave} className={`tl-celda${vacia ? ' is-vacia' : ''}${c.tono ? ` is-${c.tono}` : ''}${bajo ? ' is-cursor' : ''}`}>
              {c.titulo && <title>{c.titulo}</title>}
              <rect x={f1(xa + HUECO / 2 + (vacia ? 0.5 : 0))} y={vacia ? 1.5 : 1} width={f1(Math.max(0.5, ancho - (vacia ? 1 : 0)))} height={alto - (vacia ? 3 : 2)} rx={3} />
              {/* El número llega hasta casi el canto: en la temporada entera una semana mide lo que un «10». */}
              {texto && cabeEn(texto, ancho - 1) && (
                <text x={f1(xa + HUECO / 2 + ancho / 2)} y={alto / 2 + 4} textAnchor="middle">
                  {texto}
                </text>
              )}
            </g>
          );
        })}
    </g>
  );
};
