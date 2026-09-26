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
 * Los bloques PREVISTOS (letra c, `borrador`) van enteros a trazos y se
 * pulsan para cambiarlos (`onBorrador`). Detrás del último, «+ bloque
 * previsto» (`nuevo`), al pasar por encima (en táctil, siempre).
 *
 * Límite conocido: el microciclo no guarda versiones dentro de un bloque; si
 * cambió a mitad, la barra enseña el último.
 *
 * @param bloques `[{ id, nombre, desde, hasta, previstoHasta, split, borrador }]`.
 * @param nuevo   `{ desde, onClick }` o `null` sin permiso para escribir.
 */
export const FranjaDelSplit = ({ escala, bloques, nuevo = null, onBorrador = null }) => {
  const W = escala.ancho;
  let previo = null;
  const barras = bloques
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
      /* Del previsto se lee su nombre antes que su split: aún no es nada más. */
      const opciones = b.borrador ? [b.nombre && s?.texto ? `${b.nombre} · ${s.texto}` : null, b.nombre, s?.corto] : [s?.texto, s?.corto, s?.dias, b.nombre];
      const rotulo = repite && !b.borrador ? null : rotuloQueCabe(opciones.filter(Boolean), Math.min(xp, W) - x0 - 4, 6.2, 0);
      const titulo = [
        `${b.nombre} · ${shortDate(b.desde)} – ${shortDate(b.previstoHasta || b.hasta)}${b.previstoHasta || b.borrador ? ' (previsto)' : ''}`,
        s?.nombre && s?.datos ? `${s.nombre}: ${s.datos}` : s?.datos || s?.nombre || null,
        b.borrador && onBorrador ? 'Pulsa para cambiarlo o montarlo en Entreno.' : null,
      ]
        .filter(Boolean)
        .join('\n');
      if (b.borrador) {
        return (
          <g
            key={b.id}
            className={`tl-split is-previsto${onBorrador ? ' is-pulsable' : ''}`}
            onClick={
              onBorrador
                ? (e) => {
                    e.stopPropagation();
                    onBorrador(b.id);
                  }
                : undefined
            }
          >
            <title>{titulo}</title>
            {onBorrador && <rect className="tl-diana" x={f1(xa)} y={ARRIBA} width={f1(Math.max(1, xb - xa))} height={BARRA} />}
            <rect className="tl-split-previsto" x={f1(xa)} y={ARRIBA + 0.5} width={f1(Math.max(1, xb - xa - 1))} height={BARRA - 1} rx={4} />
            {rotulo && (
              <text className="tl-split-rotulo is-previsto" x={f1(x0)} y={ARRIBA + 12.5}>
                {rotulo}
              </text>
            )}
          </g>
        );
      }
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

  /* «+ bloque previsto», detrás del último: solo si ese día se ve y cabe. */
  let mas = null;
  if (nuevo?.desde) {
    const xa = Math.max(0, escala.x(nuevo.desde));
    const ancho = W - xa;
    if (xa < W && ancho >= 60) {
      mas = (
        <g
          className="tl-hueco is-editable is-final is-pulsable tl-split-mas"
          onClick={(e) => {
            e.stopPropagation();
            nuevo.onClick();
          }}
        >
          <title>Planificar un bloque desde el {shortDate(nuevo.desde)}</title>
          <rect className="tl-diana" x={f1(xa)} y={ARRIBA} width={f1(ancho)} height={BARRA} />
          <text className="tl-mas" x={f1(xa + 8)} y={ARRIBA + 12.5}>
            {ancho >= 118 ? '+ bloque previsto' : '+ bloque'}
          </text>
        </g>
      );
    }
  }

  return (
    <>
      {barras}
      {mas}
    </>
  );
};
