import { addDays, daysBetween, localeNumber } from '@/lib/dates';
import { useElementWidth } from '@/lib/useElementWidth';

/**
 * LA SEMANA POR DENTRO: de lunes a domingo (22 sep 2026).
 *
 * Las medias semanales están en la portada; aquí se ve lo que las forma. Cada
 * pesaje en su día, unidos por una línea fina; la semana anterior en gris,
 * detrás; la media y el esperado de la semana, en horizontal.
 *
 * Con los trazos de la gráfica del Resumen (`.progreso-*`) y en píxeles de
 * verdad, sin escalar el dibujo: con un `viewBox` estirado, las letras crecían
 * con la pantalla y los ejes pesaban más que las cifras de encima.
 */

const ALTO = 190;
const CANAL = 40;
const DERECHA = 96;
const TECHO = 18;
const SUELO = 34;
const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const RANGO_MINIMO = 1.2;

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const SemanaPorDias = ({ lunes, pesajes = [], previos = [], nPrevia = null, media = null, esperado = null, color }) => {
  const [ref, ancho] = useElementWidth(560);
  const W = Math.max(280, ancho);
  const PL = W - CANAL - DERECHA;

  const dia = (p, desde) => Math.max(0, Math.min(6, daysBetween(desde, p.date) ?? 0));
  const esta = pesajes.map((p) => ({ d: dia(p, lunes), v: p.weight }));
  const antes = previos.map((p) => ({ d: dia(p, addDays(lunes, -7)), v: p.weight }));
  const mediaPrevia = antes.length ? antes.reduce((a, p) => a + p.v, 0) / antes.length : null;

  const vs = [...esta, ...antes].map((p) => p.v).concat([media, esperado].filter((v) => Number.isFinite(v)));
  if (vs.length === 0) {
    return <p className="t-sm t-tertiary">No se pesó esta semana.</p>;
  }
  let min = Math.min(...vs);
  let max = Math.max(...vs);
  if (max - min < RANGO_MINIMO) {
    const c = (max + min) / 2;
    min = c - RANGO_MINIMO / 2;
    max = c + RANGO_MINIMO / 2;
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;

  const alto = ALTO - TECHO - SUELO;
  const x = (d) => CANAL + (PL * (d + 0.5)) / 7;
  const y = (v) => TECHO + ((max - v) / (max - min)) * alto;
  const paso = [0.25, 0.5, 1, 2].find((p) => (p * alto) / (max - min) >= 26) || 2;
  const marcas = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max; v += paso) marcas.push(Math.round(v * 100) / 100);

  /* Los rótulos de la derecha, sin pisarse: se empujan hacia abajo. */
  const rotulos = [
    media !== null && { y: y(media), t: `media ${kg(media)}`, clase: 'is-media' },
    esperado !== null && { y: y(esperado), t: `esperado ${kg(esperado)}`, clase: 'is-esperado' },
    mediaPrevia !== null && { y: y(mediaPrevia), t: `${nPrevia ? `S${nPrevia}` : 'anterior'} ${kg(mediaPrevia)}`, clase: 'is-previa' },
  ]
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < rotulos.length; i++) {
    if (rotulos[i].y - rotulos[i - 1].y < 12) rotulos[i].y = rotulos[i - 1].y + 12;
  }

  const linea = (ps) => ps.map((p) => `${x(p.d)},${y(p.v)}`).join(' ');

  return (
    <div className="semana-dias" ref={ref}>
      <svg className="semana-dias-svg" width={W} height={ALTO} role="img" aria-label={`Pesajes de la semana: ${esta.map((p) => `${LETRAS[p.d]} ${kg(p.v)} kg`).join(', ') || 'ninguno'}`}>
        <g className="progreso-rejilla">
          {marcas.map((v) => (
            <line key={v} x1={CANAL} x2={CANAL + PL} y1={y(v)} y2={y(v)} />
          ))}
        </g>
        <g className="progreso-eje-y">
          {marcas.map((v) => (
            <text key={v} x={CANAL - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {kg(v)}
            </text>
          ))}
        </g>

        {mediaPrevia !== null && (
          <line className="semana-dias-previa-media" x1={CANAL} x2={CANAL + PL} y1={y(mediaPrevia)} y2={y(mediaPrevia)} />
        )}
        {esperado !== null && (
          <line className="progreso-meta" x1={CANAL} x2={CANAL + PL} y1={y(esperado)} y2={y(esperado)} stroke={color} />
        )}
        {media !== null && (
          <line className="semana-dias-media" x1={CANAL} x2={CANAL + PL} y1={y(media)} y2={y(media)} stroke={color} />
        )}

        {antes.length > 1 && <polyline className="semana-dias-previa" points={linea(antes)} fill="none" />}
        {antes.map((p) => (
          <circle key={`a-${p.d}-${p.v}`} className="semana-dias-previa-punto" cx={x(p.d)} cy={y(p.v)} r="3" />
        ))}

        {esta.length > 1 && <polyline className="semana-dias-linea" points={linea(esta)} fill="none" stroke={color} />}
        {esta.map((p) => (
          <g key={`e-${p.d}-${p.v}`}>
            <circle className="progreso-punto" cx={x(p.d)} cy={y(p.v)} r="3.5" fill={color} />
            <text className="semana-dias-cifra" x={x(p.d)} y={y(p.v) - 9} textAnchor="middle">
              {kg(p.v)}
            </text>
          </g>
        ))}

        {rotulos.map((r) => (
          <text key={r.clase} className={`semana-dias-rotulo ${r.clase}`} x={CANAL + PL + 8} y={r.y} dominantBaseline="middle" fill={r.clase === 'is-previa' ? undefined : color}>
            {r.t}
          </text>
        ))}

        {LETRAS.map((l, d) => (
          <g key={l} className="semana-dias-dia">
            <text x={x(d)} y={ALTO - 18} textAnchor="middle">
              {l}
            </text>
            <text className="is-fecha" x={x(d)} y={ALTO - 5} textAnchor="middle">
              {Number(addDays(lunes, d).slice(8, 10))}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};
