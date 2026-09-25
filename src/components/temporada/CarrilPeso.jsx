import { NOISE_BAND_PCT } from '@/domain/goals';
import { metricColor } from '@/domain/metrics';
import { valorDelTramo } from '@/domain/roadmap';
import { addDays, localeNumber } from '@/lib/dates';
import { conY, marcasDe, porVentana } from '@/components/roadmap/escalaDePeso';
import { TrazoDelPeso } from '@/components/roadmap/TrazoDelPeso';
import { anchoTexto } from './escalaDeTiempo';

const f1 = (n) => Math.round(n * 10) / 10;
const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const TINTA_PESO = metricColor('weight');

/* La banda de lo esperado: ± el ruido de una medición (`NOISE_BAND_PCT`, lo que
   no se distingue de agua y glucógeno). No es un margen de tolerancia ni un
   veredicto: es el grosor honesto de una recta que en la báscula nunca es una
   recta. */
const MEDIA_BANDA = NOISE_BAND_PCT / 100;

const ARRIBA = 8;
const ABAJO = 8;
/* La separación entre la banda de una fase y la de la siguiente, a cada lado:
   el salto entre las dos se lee como un punto de partida nuevo, no como una
   caída prevista. */
const SEPARACION = 3;

/**
 * Los tramos de lo esperado que tocan la vista, de fase en fase y de igualado
 * en igualado. Cada uno, con sus dos extremos ya recortados a la vista (más un
 * día a cada lado, para que la banda entre y salga por el canto), y si abre o
 * cierra su fase: ahí va la separación.
 */
const tramosVisibles = ({ fases, expectativas, desde, hasta }) => {
  const out = [];
  for (const fase of fases) {
    const exp = expectativas.get(fase.id);
    if (!exp) continue;
    const finFase = addDays(fase.endsOn || hasta, 1);
    exp.tramos.forEach((t, i) => {
      const a = t.desde > desde ? t.desde : desde;
      const siguiente = exp.tramos[i + 1]?.desde || finFase;
      const b = siguiente < hasta ? siguiente : hasta;
      if (b <= a) return;
      out.push({
        key: `${fase.id}-${i}`,
        fase,
        tramo: t,
        a,
        b,
        abre: i === 0 && a === t.desde,
        cierra: i === exp.tramos.length - 1 && b === finFase,
      });
    });
  }
  return out;
};

/**
 * EL PESO: la gráfica protagonista.
 *
 * De atrás adelante:
 *   1. La banda de lo esperado, en gris: el plan. La fase ya se ve en el fondo
 *      de la gráfica; la banda no repite su color. Lo que falta, lavado, con
 *      su recta a trazos: la proyección de la cuenta encadenada, que sale de
 *      la última media.
 *      Cada fase es un tramo suelto, separado del de al lado y con un punto
 *      hueco donde arranca: cada fase que ya empezó parte de su peso real
 *      (`expectativasDelPlan`), y un salto entre dos fases es un punto de
 *      partida nuevo, no una caída que alguien haya previsto. Las futuras
 *      parten de donde se espera que acabe la anterior.
 *   2. Los pesajes de cada día, pequeños y tenues.
 *   3. La media de cada semana, en su jueves y unida: el dato gordo
 *      (`TrazoDelPeso`, la misma pieza que dibuja las tiras de Revisiones).
 *      Por días (`tendencia`), en su lugar la media móvil de siete días
 *      (`mediaMovil`), cortada donde no hay pesajes bastantes.
 *   4. El peso objetivo, una raya corta en la fecha del destino.
 *
 * Cifras, las justas: en Temporada, la media más alta, la más baja y la
 * última (`extremos`); en Rango, ninguna: los pesajes van como puntos
 * tenues (`pesajes`) y sus cifras las da el cursor. El punto del cursor va
 * sobre la línea de la media (`cursorX`). Nada de colores de semáforo: el
 * desvío se ve, no se juzga.
 */
export const CarrilPeso = ({
  escala,
  alto,
  semanas,
  fases,
  expectativas,
  hoy,
  destino,
  objetivoKg = null,
  pesajes = false,
  extremos = false,
  tendencia = null,
  cursorX = null,
}) => {
  const W = escala.ancho;
  const desde = addDays(escala.primerDia, -1);
  const hasta = addDays(escala.ultimoDia, 2);
  const mitadDia = escala.pxPorDia / 2;
  const X = (dia) => escala.x(dia) + mitadDia;

  /* Las semanas que entran: las que se ven y una a cada lado, para que la
     curva salga por el canto en vez de empezar dentro. */
  const visibles = semanas.filter((s) => s.domingo >= addDays(desde, -7) && s.lunes <= addDays(hasta, 7));
  const tramos = tramosVisibles({ fases, expectativas, desde, hasta });
  const destinoVisible = Boolean(destino?.date && objetivoKg && escala.toca(destino.date, destino.date));

  const valores = [];
  for (const s of visibles) {
    if (s.domingo < escala.primerDia || s.lunes > escala.ultimoDia) continue;
    if (s.media !== null) valores.push(s.media);
    for (const p of s.pesajes) if (p.date >= escala.primerDia && p.date <= escala.ultimoDia) valores.push(p.weight);
  }
  for (const t of tramos) {
    for (const d of [t.a, t.b]) {
      const v = valorDelTramo(t.tramo, d);
      if (v !== null) valores.push(v * (1 + MEDIA_BANDA), v * (1 - MEDIA_BANDA));
    }
  }
  if (destinoVisible) valores.push(objetivoKg);

  const rango = porVentana(valores);
  if (!rango) {
    return (
      <text className="tl-vacio" x={12} y={alto / 2 + 4}>
        Sin pesajes ni fases en estas semanas
      </text>
    );
  }
  /* Con los extremos escritos, sitio arriba para la cifra de la más alta. */
  const arriba = ARRIBA + (extremos ? 10 : 0);
  const escalaY = conY(rango, arriba, alto - arriba - ABAJO - (extremos ? 8 : 0));
  const Y = (v) => f1(escalaY.y(v));
  const marcas = marcasDe(escalaY, escalaY.alto, 26);

  /* La banda y su recta, partidas en hoy. */
  const proyeccion = [];
  const trozosVistos = [];
  const bandas = tramos.flatMap(({ key, tramo, a, b, abre, cierra }) => {
    const trozos = [];
    if (a < hoy) trozos.push({ k: `${key}-p`, a, b: b < hoy ? b : hoy, plan: false });
    if (b > hoy) trozos.push({ k: `${key}-f`, a: a > hoy ? a : hoy, b, plan: true });
    return trozos.map((z) => {
      const va = valorDelTramo(tramo, z.a);
      const vb = valorDelTramo(tramo, z.b);
      /* La banda va de canto a canto de sus días, no de centro a centro: así
         dos fases seguidas se tocan justo en su frontera, y la separación se
         abre desde ahí. Hoy se parte a mitad del día, con la raya de hoy. */
      const borde = (d) => (d === hoy ? X(hoy) : escala.x(d));
      const xa = f1(borde(z.a) + (abre && z.a === a ? SEPARACION : 0));
      const xb = f1(borde(z.b) - (cierra && z.b === b ? SEPARACION : 0));
      if (xb - xa < 1) return null;
      if (z.plan) proyeccion.push({ k: z.k, xa, xb, ya: Y(va), yb: Y(vb) });
      trozosVistos.push({ plan: z.plan, xa: Math.max(0, xa), xb: Math.min(W, xb), va, vb });
      const puntos = [
        [xa, Y(va * (1 + MEDIA_BANDA))],
        [xb, Y(vb * (1 + MEDIA_BANDA))],
        [xb, Y(vb * (1 - MEDIA_BANDA))],
        [xa, Y(va * (1 - MEDIA_BANDA))],
      ];
      return (
        <polygon key={z.k} className={`tl-banda${z.plan ? ' is-plan' : ''}`} points={puntos.map((p) => p.join(',')).join(' ')} />
      );
    });
  });

  /* La banda se nombra en su sitio, una vez y sin leyenda: bajo el trozo
     vivido más ancho que se ve («esperado»); si aún no hay, bajo el que viene. */
  const anchoDe = (z) => z.xb - z.xa;
  const sitio = [...trozosVistos.filter((z) => !z.plan), ...trozosVistos.filter((z) => z.plan)]
    .filter((z) => anchoDe(z) > anchoTexto('esperado', 6.4) + 16)
    .sort((a, b) => a.plan - b.plan || anchoDe(b) - anchoDe(a))[0];
  /* Dónde arranca cada fase: un punto hueco en su base. */
  const arranques = tramos
    .filter((t) => t.abre)
    .map((t) => {
      const v = valorDelTramo(t.tramo, t.a);
      const x = escala.x(t.a) + SEPARACION;
      if (v === null || x < 0 || x > W) return null;
      return (
        <circle key={`a-${t.key}`} className="tl-banda-arranque" cx={f1(x)} cy={Y(v)} r={2.75}>
          <title>{`${t.fase.title || 'La fase'} parte de ${kg(v)} kg`}</title>
        </circle>
      );
    });

  /* El objetivo en su fecha. */
  let objetivo = null;
  if (destinoVisible) {
    const x = X(destino.date);
    const y = Y(objetivoKg);
    const texto = `${kg(objetivoKg)} kg`;
    const izquierda = x - 12 - anchoTexto(texto, 6) > 26;
    objetivo = (
      <g className="tl-objetivo">
        <title>{`Peso objetivo: ${texto}`}</title>
        <line x1={f1(x - 8)} x2={f1(x + 8)} y1={y} y2={y} />
        <text x={f1(izquierda ? x - 12 : x + 12)} y={y + 4} textAnchor={izquierda ? 'end' : 'start'}>
          {texto}
        </text>
      </g>
    );
  }

  /* Las medias que se ven, de su jueves: de ellas salen los extremos, la
     proyección y el punto del cursor. */
  const medias = visibles
    .filter((x) => x.media !== null && x.estado !== 'futura')
    .map((x) => ({ s: x, x: X(x.jueves), y: Y(x.media) }));
  const enVista = medias.filter((m) => m.x >= 0 && m.x <= W);

  /* Del lado de la banda donde no pasa la línea del peso: encima si la
     media más cercana va por debajo, y al revés. */
  let rotuloBanda = null;
  if (sitio) {
    const xm = (sitio.xa + sitio.xb) / 2;
    const t = (xm - sitio.xa) / (sitio.xb - sitio.xa || 1);
    const v = sitio.va + (sitio.vb - sitio.va) * t;
    const cerca = medias.length ? medias.reduce((p, m) => (Math.abs(m.x - xm) < Math.abs(p.x - xm) ? m : p)) : null;
    const debajo = !cerca || Math.abs(cerca.x - xm) > 60 || cerca.y < Y(v);
    const abajo = Y(v * (1 - MEDIA_BANDA)) + 14;
    const arriba = Y(v * (1 + MEDIA_BANDA)) - 6;
    /* Si la línea del peso cruza el sitio del rótulo, el otro lado; si cruza los dos, sin rótulo. */
    const medio = anchoTexto('esperado', 6.4) / 2 + 4;
    const libre = (y) => y < alto - 2 && y > 10 && !medias.some((m) => Math.abs(m.x - xm) < medio && Math.abs(m.y - (y - 4)) < 10);
    const y = [debajo ? abajo : arriba, debajo ? arriba : abajo].find(libre);
    if (y !== undefined)
      rotuloBanda = (
        <text className="tl-banda-rotulo" x={f1(xm)} y={f1(y)} textAnchor="middle">
          esperado
        </text>
      );
  }


  /* La recta de lo que viene sale de la última media, no de la nada. */
  const ultima = medias[medias.length - 1];
  const primera = proyeccion[0];
  const enlace =
    ultima && primera && primera.xa >= ultima.x && primera.xa - ultima.x < escala.pxPorDia * 10 ? (
      <line className="tl-proyeccion" x1={ultima.x} y1={ultima.y} x2={primera.xa} y2={primera.ya} stroke={TINTA_PESO} />
    ) : null;

  /* En Temporada, la más alta, la más baja y la última: nada más. */
  let cifrasExtremas = null;
  if (extremos && enVista.length) {
    const alta = enVista.reduce((a, b) => (b.s.media > a.s.media ? b : a));
    const baja = enVista.reduce((a, b) => (b.s.media < a.s.media ? b : a));
    const final = enVista[enVista.length - 1];
    const puestas = new Map();
    puestas.set(final.s.lunes, { m: final, donde: 'derecha' });
    if (!puestas.has(alta.s.lunes)) puestas.set(alta.s.lunes, { m: alta, donde: 'arriba' });
    if (!puestas.has(baja.s.lunes)) puestas.set(baja.s.lunes, { m: baja, donde: 'abajo' });
    cifrasExtremas = [...puestas.values()].map(({ m, donde }) => {
      const texto = kg(m.s.media);
      const cabe = m.x + 8 + anchoTexto(texto, 6) < W;
      const [x, y, ancla] =
        donde === 'derecha' && cabe
          ? [m.x + 8, m.y + 4, 'start']
          : donde === 'abajo'
            ? [m.x, m.y + 15, 'middle']
            : [m.x, m.y - 8, 'middle'];
      return (
        <text key={m.s.lunes} className="tl-peso-cifra" x={f1(x)} y={f1(y)} textAnchor={ancla}>
          {texto}
        </text>
      );
    });
  }

  /* Por días, la tendencia: tramos de días seguidos, cortados donde falta. */
  const diasTendencia = (tendencia || [])
    .filter((t) => t.fecha >= desde && t.fecha <= hasta)
    .map((t) => ({ ...t, x: f1(X(t.fecha)), y: Y(t.valor) }));
  const tramosTendencia = [];
  for (const t of diasTendencia) {
    const ultimo = tramosTendencia[tramosTendencia.length - 1];
    const previo = ultimo?.[ultimo.length - 1];
    if (previo && addDays(previo.fecha, 1) === t.fecha) ultimo.push(t);
    else tramosTendencia.push([t]);
  }

  /* El punto del cursor, sobre la línea de las medias: entre dos semanas
     seguidas, donde las une la línea; en una sola, sobre su media. */
  let punto = null;
  if (cursorX !== null && tendencia) {
    const cerca = diasTendencia.find((t) => Math.abs(t.x - cursorX) <= escala.pxPorDia / 2);
    if (cerca) punto = <circle className="tl-cursor-punto" cx={f1(cursorX)} cy={cerca.y} r={4.5} stroke={TINTA_PESO} />;
  } else if (cursorX !== null && medias.length) {
    const i = medias.findIndex((m) => m.x >= cursorX);
    const b = i >= 0 ? medias[i] : null;
    const a = i > 0 ? medias[i - 1] : i < 0 ? medias[medias.length - 1] : null;
    const seguidas = a && b && addDays(a.s.lunes, 7) === b.s.lunes;
    let y = null;
    if (seguidas) y = a.y + ((b.y - a.y) * (cursorX - a.x)) / (b.x - a.x || 1);
    else {
      const cerca = [a, b].filter(Boolean).find((m) => Math.abs(m.x - cursorX) <= escala.pxPorDia * 3.5);
      if (cerca) y = cerca.y;
    }
    if (y !== null) punto = <circle className="tl-cursor-punto" cx={f1(cursorX)} cy={f1(y)} r={4.5} stroke={TINTA_PESO} />;
  }

  return (
    <>
      {marcas.map((m) => (
        <g key={m} className="tl-peso-marca">
          <line x1={0} x2={W} y1={Y(m)} y2={Y(m)} />
          <text x={4} y={Y(m) - 3}>
            {kg(m).replace(/,0$/, '')}
          </text>
        </g>
      ))}
      {bandas}
      {rotuloBanda}
      {proyeccion.map((p) => (
        <line key={`r-${p.k}`} className="tl-proyeccion" x1={p.xa} y1={p.ya} x2={p.xb} y2={p.yb} stroke={TINTA_PESO} />
      ))}
      {enlace}
      {arranques}
      {tendencia ? (
        <>
          {visibles.flatMap((x) =>
            x.pesajes.map((p) => <circle key={`p-${p.date}`} className="progreso-pesaje" cx={f1(X(p.date))} cy={Y(p.weight)} r="2.25" fill={TINTA_PESO} />)
          )}
          {tramosTendencia.map((t) =>
            t.length > 1 ? (
              <polyline
                key={`t-${t[0].fecha}`}
                className="progreso-trazo tl-tendencia"
                points={t.map((m) => `${m.x},${m.y}`).join(' ')}
                fill="none"
                stroke={TINTA_PESO}
              />
            ) : (
              <circle key={`t-${t[0].fecha}`} cx={t[0].x} cy={t[0].y} r="1.75" fill={TINTA_PESO} />
            )
          )}
        </>
      ) : (
        <TrazoDelPeso
          semanas={visibles}
          X={X}
          Y={Y}
          color={TINTA_PESO}
          conPesajes={pesajes}
          radio={(x) => (x.estado === 'hoy' ? 3.5 : 2.5)}
          grueso={(x) => x.estado === 'hoy'}
        />
      )}
      {objetivo}
      {cifrasExtremas}
      {punto}
    </>
  );
};

