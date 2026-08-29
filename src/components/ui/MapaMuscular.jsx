import { metricColor } from '@/domain/metrics';

/**
 * EL MAPA MUSCULAR — el bloque de una mirada.
 *
 * Dos figuras, de frente y de espaldas, con cada grupo pintado según las
 * series que lleva sobre su MRV. Un entrenador ve «pierna floja, mucho
 * hombro» antes de leer una cifra. Hevy la puso en el mapa de todos por algo.
 *
 * ── Cómo se lee ─────────────────────────────────────────────────────────────
 * Apagado: sin series. De claro a pleno: de pocas series al MRV. Pasado del
 * MRV, el grupo se pinta en negativo, igual que su barra de al lado. La
 * leyenda de abajo lo dice con la misma escala.
 *
 * ── La figura ───────────────────────────────────────────────────────────────
 * Anatómica en lo que importa para reconocerla —trapecio, dorsal, pectoral en
 * dos lóbulos, deltoides, bíceps/tríceps, glúteo, cuádriceps, isquios,
 * gemelos— y esquemática en todo lo demás. No es un dibujo de anatomía: es un
 * pictograma que se lee a 60 px de alto.
 *
 * ── Los nombres ─────────────────────────────────────────────────────────────
 * Cada entrenador escribe el músculo a su manera —«hombro», «Deltoides
 * Lateral», «espalda», «Dorsal»—. `region()` traduce sin acentos ni
 * mayúsculas y agrupa sinónimos; lo que no reconoce no se pinta.
 */
const sinAcentos = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

const REGIONES = [
  ['pecho', ['pecho', 'pectoral']],
  ['hombro', ['hombro', 'deltoide']],
  ['biceps', ['biceps']],
  ['triceps', ['triceps']],
  ['antebrazo', ['antebrazo']],
  ['abdomen', ['abdomen', 'abdominal', 'core', 'oblicuo']],
  ['trapecio', ['trapecio', 'espalda alta']],
  ['dorsal', ['dorsal', 'espalda', 'lumbar']],
  ['gluteo', ['gluteo']],
  ['cuadriceps', ['cuadriceps']],
  ['femoral', ['femoral', 'isquio']],
  ['aductor', ['aductor']],
  ['gemelo', ['gemelo', 'soleo', 'pantorrilla']],
];

export const region = (name) => {
  const n = sinAcentos(name);
  for (const [id, claves] of REGIONES) if (claves.some((c) => n.includes(c))) return id;
  return null;
};

const intensidades = (musculos) => {
  const out = new Map();
  for (const m of musculos || []) {
    const id = region(m.name);
    if (!id || !(m.media > 0)) continue;
    const tope = m.mrv || 20;
    const valor = Math.min(1, m.media / tope);
    const pasado = Boolean(m.mrv) && m.media > m.mrv;
    const previo = out.get(id);
    if (!previo || valor > previo.valor) out.set(id, { valor, pasado, media: m.media, mrv: m.mrv });
  }
  return out;
};

/* Un cuerpo de 120 × 262. Todo simétrico sobre x = 60: cada pieza par se
   declara una vez y `espejo` la refleja. Las formas sin región son silueta. */
const espejo = (d) =>
  d.replace(/(-?\d+(?:\.\d+)?)([ ,])(-?\d+(?:\.\d+)?)/g, (m, x, sep, y) => `${(120 - Number(x)).toFixed(1)}${sep}${y}`)
    .replace(/([Cc]) /g, '$1 ');

/* Piezas de frente. Coordenadas absolutas (M/L/C/Z) para que el espejo sea
   una resta. */
const CABEZA = 'M49 17 C49 8 54 3 60 3 C66 3 71 8 71 17 C71 25 66 30 60 30 C54 30 49 25 49 17 Z';
const CUELLO = 'M54 29 L66 29 L67 38 L53 38 Z';
const FRENTE_IZQ = [
  { r: 'trapecio', d: 'M53 36 L38 44 L44 47 L57 41 Z' },
  { r: 'hombro', d: 'M38 44 C30 44 24 50 24 58 L25 64 L40 62 L42 50 Z' },
  { r: 'pecho', d: 'M42 47 L59 45 L59 68 C59 73 54 76 48 75 C42 74 39 70 40 64 Z' },
  { r: 'biceps', d: 'M26 66 L39 64 L38 92 C38 97 34 100 30 100 C26 100 23 97 23 92 Z' },
  { r: 'antebrazo', d: 'M23 100 L37 100 L34 132 C34 136 31 138 28 138 C25 138 22 136 22 132 Z' },
  { d: 'M22 139 L34 139 L33 150 C33 153 30 155 28 155 C25 155 22 153 22 150 Z' },
  { r: 'abdomen', d: 'M46 77 L59 77 L59 112 L46 112 C44 108 44 84 46 77 Z' },
  { r: 'cuadriceps', d: 'M40 116 L57 116 L56 178 C56 184 52 188 47 188 C42 188 38 184 38 178 Z' },
  { r: 'aductor', d: 'M57 116 L60 116 L60 150 C58 150 57 145 57 140 Z' },
  { d: 'M40 190 L55 190 L55 200 L40 200 Z' },
  { r: 'gemelo', d: 'M40 202 L55 202 L54 240 C54 245 51 248 47 248 C43 248 40 245 40 240 Z' },
  { d: 'M38 249 L56 249 L56 258 L38 258 Z' },
];
const ESPALDA_IZQ = [
  { r: 'trapecio', d: 'M53 36 L38 46 L42 50 L59 44 L59 70 L48 70 L44 52 Z' },
  { r: 'hombro', d: 'M38 46 C30 46 24 52 24 60 L25 65 L40 63 L42 52 Z' },
  { r: 'dorsal', d: 'M42 52 L48 70 L59 70 L59 100 C52 104 46 100 44 94 C42 84 41 66 42 52 Z' },
  { r: 'triceps', d: 'M26 67 L39 65 L38 92 C38 97 34 100 30 100 C26 100 23 97 23 92 Z' },
  { r: 'antebrazo', d: 'M23 100 L37 100 L34 132 C34 136 31 138 28 138 C25 138 22 136 22 132 Z' },
  { d: 'M22 139 L34 139 L33 150 C33 153 30 155 28 155 C25 155 22 153 22 150 Z' },
  { r: 'dorsal', d: 'M47 100 L59 100 L59 112 L47 112 Z' },
  { r: 'gluteo', d: 'M40 114 L59 114 L59 138 C59 144 54 148 48 148 C42 148 38 143 38 136 Z' },
  { r: 'femoral', d: 'M40 150 L57 150 L56 188 C56 194 52 198 47 198 C42 198 38 194 38 188 Z' },
  { d: 'M40 199 L55 199 L55 206 L40 206 Z' },
  { r: 'gemelo', d: 'M40 207 L55 207 L54 240 C54 245 51 248 47 248 C43 248 40 245 40 240 Z' },
  { d: 'M38 249 L56 249 L56 258 L38 258 Z' },
];

const dobla = (izq) => [{ d: CABEZA }, { d: CUELLO }, ...izq, ...izq.map((p) => ({ ...p, d: espejo(p.d) }))];
const FRENTE = dobla(FRENTE_IZQ);
const ESPALDA = dobla(ESPALDA_IZQ);

const relleno = (dato, color) => {
  if (!dato) return 'var(--fill)';
  if (dato.pasado) return 'var(--negative)';
  return `color-mix(in srgb, ${color} ${Math.round(22 + dato.valor * 78)}%, var(--fill))`;
};

const Figura = ({ piezas, mapa, color, titulo }) => (
  <figure className="mapa-figura">
    <svg viewBox="0 0 120 262" role="img" aria-label={titulo}>
      <title>{titulo}</title>
      {piezas.map((p, i) => {
        const dato = p.r ? mapa.get(p.r) : null;
        return (
          <path key={i} d={p.d} fill={relleno(dato, color)} className={p.r ? 'mapa-pieza' : 'mapa-silueta'}>
            {dato && <title>{`${p.r}: ${dato.media}${dato.mrv ? ` de ${dato.mrv}` : ''} series`}</title>}
          </path>
        );
      })}
    </svg>
    <figcaption>{titulo}</figcaption>
  </figure>
);

/**
 * @param musculos  `[{ name, media, mrv }]`, lo mismo que la lista de barras.
 */
export const MapaMuscular = ({ musculos }) => {
  const mapa = intensidades(musculos);
  const color = metricColor('sets');
  if (mapa.size === 0) return null;
  const pasados = [...mapa.values()].some((d) => d.pasado);
  return (
    <div className="mapa-muscular">
      <div className="mapa-figuras">
        <Figura piezas={FRENTE} mapa={mapa} color={color} titulo="Frente" />
        <Figura piezas={ESPALDA} mapa={mapa} color={color} titulo="Espalda" />
      </div>
      <div className="mapa-leyenda" aria-hidden="true">
        <span className="mapa-escala" style={{ background: `linear-gradient(90deg, var(--fill), color-mix(in srgb, ${color} 22%, var(--fill)), ${color})` }} />
        <span className="mapa-leyenda-k">
          <span>sin series</span>
          <span>MRV</span>
        </span>
        {pasados && <span className="mapa-leyenda-pasado">rojo: por encima del MRV</span>}
      </div>
    </div>
  );
};
