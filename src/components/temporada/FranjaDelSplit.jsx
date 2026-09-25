import { addDays, shortDate } from '@/lib/dates';
import { rotuloQueCabe } from './escalaDeTiempo';

const f1 = (n) => Math.round(n * 10) / 10;
const ARRIBA = 2;
const BARRA = 18;
export const ALTO_SPLIT = ARRIBA + BARRA + 2;

/**
 * EL SPLIT: una barra por bloque al pie de la gráfica (24 sep 2026).
 *
 * Con el nombre que le puso el entrenador («Torso-pierna · 4 días») o lo que
 * deducido de sus hojas (`splitDelBloque`); si no cabe, su forma corta («T/P · 4d»). Lo previsto que aún no se ha montado,
 * con el canto a trazos. Las sesiones de cada día no van aquí: las dicen el
 * cursor y la hoja del día; la progresión, el panel del rango. Dos bloques
 * seguidos con el mismo split no lo repiten: el segundo va sin rótulo.
 *
 * Límite conocido: el microciclo no guarda versiones dentro de un bloque; si
 * cambió a mitad, la barra enseña el último.
 *
 * @param bloques `[{ id, nombre, desde, hasta, previstoHasta, split }]`.
 */
export const FranjaDelSplit = ({ escala, bloques }) => {
  const W = escala.ancho;
  let previo = null;
  return bloques
    .filter((b) => escala.toca(b.desde, b.previstoHasta || b.hasta))
    .map((b) => {
      const xa = Math.max(-6, escala.x(b.desde));
      const xb = Math.min(W + 6, escala.x(addDays(b.hasta, 1)));
      const xp = b.previstoHasta ? Math.min(W + 6, escala.x(addDays(b.previstoHasta, 1))) : xb;
      const x0 = Math.max(xa, 0) + 7;
      const s = b.split;
      const firma = s?.texto || s?.nombre || s?.dias || b.nombre;
      const repite = firma === previo;
      previo = firma;
      const rotulo = repite ? null : rotuloQueCabe([s?.texto, s?.corto, s?.dias, b.nombre].filter(Boolean), Math.min(xp, W) - x0 - 4, 6.2, 0);
      const titulo = [
        `${b.nombre} · ${shortDate(b.desde)} – ${shortDate(b.previstoHasta || b.hasta)}${b.previstoHasta ? ' (previsto)' : ''}`,
        s?.nombre && s?.datos ? `${s.nombre}: ${s.datos}` : s?.datos || s?.nombre || null,
      ]
        .filter(Boolean)
        .join('\n');
      return (
        <g key={b.id} className="tl-split">
          <title>{titulo}</title>
          {/* Un píxel de aire entre bloques: el cambio de split se ve. */}
          <rect className="tl-split-barra" x={f1(xa)} y={ARRIBA} width={f1(Math.max(1, xb - xa - 1))} height={BARRA} rx={4} />
          {xp > xb + 1 && <rect className="tl-split-previsto" x={f1(xb)} y={ARRIBA + 0.5} width={f1(xp - xb - 1)} height={BARRA - 1} rx={4} />}
          {rotulo && (
            <text className="tl-split-rotulo" x={f1(x0)} y={ARRIBA + 12.5}>
              {rotulo}
            </text>
          )}
        </g>
      );
    });
};
