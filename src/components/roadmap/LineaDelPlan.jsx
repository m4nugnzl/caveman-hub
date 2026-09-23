import { useId } from 'react';

import { MONTH_NAMES, kindMeta } from '@/domain/calendar';
import { directionById } from '@/domain/goals';
import { metricColor } from '@/domain/metrics';
import { replanteoVigente, valorDelTramo } from '@/domain/roadmap';
import { llegadaTexto, ritmoTexto } from '@/domain/semanasDelPlan';
import { addDays, localeNumber, miles, shortDate, toISODate, weekStart } from '@/lib/dates';
import { anchoTexto, diasDe, enRenglones, escalaPeso, escalaX, ms, pxPorSemana, semanasVisibles } from './geometria';
import { TrazoDelPeso } from './TrazoDelPeso';

/**
 * LA LÍNEA DEL PLAN: el peso contra lo esperado, los hechos y la dieta, sobre
 * las mismas semanas.
 *
 * ══ De arriba abajo ════════════════════════════════════════════════════════
 *
 *   1. La tira de las fases, con su color de dirección (`GOAL_DIRECTIONS`) y
 *      rellena hasta hoy. El cruce, como dos tiras finas que salen del final
 *      de la última. El hueco hasta el destino, rayado en tinta.
 *   2. El peso: la recta esperada de cada fase (entera hasta hoy, apagada
 *      después), el fantasma original desde el primer replanteo, los caminos
 *      del cruce, los pesajes y la media de cada semana en su jueves.
 *   3. Los hechos, en su franja y en tinta: vacaciones, refeeds, diet breaks.
 *      Las competiciones, con el color de su tipo.
 *   4. La escalera de las kcal pautadas, con cada cambio rotulado en renglones
 *      que crecen lo que haga falta.
 *
 * ══ Las únicas verticales ══════════════════════════════════════════════════
 *
 * Hoy, el destino y los HILOS: una raya punteada en cada cambio de pauta, de la
 * tira de las fases a su cifra. No hay rejilla vertical: así cada vertical
 * significa algo y los hilos se leen también en la temporada.
 *
 * ══ Lo que NO dice ═════════════════════════════════════════════════════════
 *
 * El desvío va en tinta, nunca en rojo ni en verde, y ninguna semana se
 * destaca por ir lejos de su recta. El sistema enseña la desviación; no sugiere
 * replanteos, no reajusta solo, no avisa.
 */

const kg = (v, d = 1) => localeNumber(v, { minimumFractionDigits: d, maximumFractionDigits: d });
const signoKg = (v) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${kg(Math.abs(v))}`;
const signoMiles = (v) => `${v > 0 ? '+' : '−'}${miles(Math.abs(v))}`;
const f1 = (n) => Math.round(n * 10) / 10;
const color = (direccion) => directionById(direccion)?.color || 'var(--text-tertiary)';
/* El peso real en su tinta de dato, la misma que la curva del peso en
   Progresión y en el Resumen (`metrics.js`). */
const TINTA_PESO = metricColor('weight');

/* Las medidas de las dos versiones: la entera y la que se queda fija arriba. */
const MEDIDAS = {
  entera: { fY: 30, fh: 8, pY: 50, ph: 210, phEstrecho: 150, sep: 12, dh: 52, dhEstrecho: 40 },
  compacta: { fY: 20, fh: 6, pY: 34, ph: 64, phEstrecho: 56, sep: 8, dh: 20, dhEstrecho: 20 },
  /* La tira del Resumen: solo las fases, hoy y el destino. */
  tira: { fY: 18, fh: 8, pY: 30, ph: 0, phEstrecho: 0, sep: 0, dh: 0, dhEstrecho: 0 },
  /* La espina plegada de la revisión: la banda de fase, el peso contra lo
     esperado sin eje de kilos, hoy y el cruce o el destino. */
  espina: { fY: 16, fh: 6, pY: 26, ph: 40, phEstrecho: 36, sep: 0, dh: 0, dhEstrecho: 0 },
};

/**
 * La leyenda de la línea, centrada y con el mismo pincel que el dibujo, como
 * la de Progresión.
 */
export const LeyendaDelPlan = ({ oculto = {}, hayOriginal = false, hayKcal = false }) => (
  <ul className="chart-legend roadmap-leyenda" aria-label="Leyenda">
    {!oculto.weight && (
      <>
        <li>
          <span className="chart-swatch" style={{ background: TINTA_PESO }} aria-hidden="true" />
          Media semanal
        </li>
        <li>
          <span className="chart-swatch is-fase" aria-hidden="true" />
          Esperado
        </li>
        {hayOriginal && (
          <li>
            <span className="chart-swatch is-punteada is-fase" aria-hidden="true" />
            Esperado original
          </li>
        )}
      </>
    )}
    {hayKcal && !oculto.nutrition && (
      <li>
        <span className="chart-swatch is-kcal" aria-hidden="true" />
        Kcal pautadas
      </li>
    )}
  </ul>
);

/** El ritmo que manda en una fase hoy, o al final si ya acabó. */
const ritmoDe = (fase, hoy) => {
  const dia = fase.endsOn && fase.endsOn < hoy ? fase.endsOn : hoy;
  const vigente = replanteoVigente(fase, dia);
  return ritmoTexto(fase.direction, vigente ? vigente.ratePct : fase.ratePct);
};

export const LineaDelPlan = ({
  plan,
  ventana,
  ancho,
  compacta = false,
  tira = false,
  espina = false,
  elegida = null,
  senalada = null,
  marcas = null,
  pendiente = null,
  oculto = {},
  onSenalar,
  onElegir,
  onPlan = null,
  arrastrar = false,
  /* Sin los igualados: ni su marca ni el fantasma del esperado original. Es
     la línea del cliente, que ve el plan vigente y no cómo se ajustó. */
  sinIgualados = false,
}) => {
  const id = useId().replace(/:/g, '');
  const { semanas, cruce, destino, hoy, expectativas, grupos } = plan;
  const m = tira ? MEDIDAS.tira : espina ? MEDIDAS.espina : compacta ? MEDIDAS.compacta : MEDIDAS.entera;
  const W = Math.max(300, Math.round(ancho || 0));
  const estrecho = W < 560;
  const temporada = diasDe(ventana) > 150;
  const corto = estrecho || temporada || compacta || tira || espina;
  /* Lo que solo cabe en la línea entera: pesajes, fantasmas, caminos del
     cruce, igualados y rótulos del peso. */
  const entera = !compacta && !tira && !espina;

  /* Sin eje de kilos (la espina) no hace falta margen para sus cifras. */
  const x0 = espina ? 8 : estrecho ? 34 : 60;
  const x1 = W - (espina ? 8 : 14);
  const X = escalaX(ventana, x0, x1);
  const dentro = (dia) => dia >= ventana[0] && dia <= ventana[1];
  const visibles = semanasVisibles(semanas, ventana);
  const fases = grupos.filter((g) => g.fase).map((g) => g.fase);

  /* La escalera de las kcal, con el escalón en su día si se sabe. Se calcula
     antes que las alturas: sin kcal pautadas no hay carril que dibujar. */
  const tramosKcal = [];
  {
    let previa = null;
    for (const s of semanas) {
      const k = s.pauta?.kcals ?? null;
      if (k === null) {
        previa = null;
        continue;
      }
      const corte = s.cambioEl && previa !== null ? s.cambioEl : s.lunes;
      if (corte !== s.lunes && previa !== null) tramosKcal.push({ desde: s.lunes, hasta: corte, k: previa });
      tramosKcal.push({ desde: corte, hasta: addDays(s.lunes, 7), k });
      previa = k;
    }
  }

  const conPeso = !oculto.weight && !tira;
  const conKcal = !oculto.nutrition && !tira && !espina && tramosKcal.length > 0;

  /* ── Las alturas, de arriba abajo ─────────────────────────────────────── */
  const fY = m.fY;
  const fh = m.fh;
  const pY = m.pY;
  const ph = conPeso ? (estrecho ? m.phEstrecho : m.ph) : 0;
  const hY = pY + ph + (conPeso ? m.sep : 0);

  /* Los hechos: en la compacta, solo sus marcas; en la entera, con rótulo en
     dos renglones. Una competición nunca pisa la etiqueta de un hecho: si no
     cabe, baja al segundo. */
  const hechos = [];
  {
    const vistos = new Set();
    for (const s of visibles) {
      for (const e of s.hechos) {
        if (vistos.has(e.id)) continue;
        vistos.add(e.id);
        const fin = e.hasta && e.hasta > e.date ? e.hasta : e.date;
        const a = Math.max(X(e.date), x0);
        const b = Math.min(X(addDays(fin, 1)), x1);
        const kcal = conKcal && e.kcal ? ` · ${miles(e.kcal)} kcal` : '';
        hechos.push({
          e,
          a,
          b,
          x: e.kind === 'race' ? a + 5 : a,
          texto: corto ? e.title.split(/\s+/)[0] : `${e.title}${kcal}`,
        });
      }
    }
  }
  /* Un carril sin contenido no se dibuja: sin hechos en la ventana, ni su
     franja ni su rótulo. */
  const conHechos = !tira && !espina && hechos.length > 0;
  const rotulosHechos = compacta || !conHechos ? { items: conHechos ? hechos : [], filas: 0 } : enRenglones(hechos, x1, 2);
  const alturaHechos = !conHechos ? 0 : compacta ? 10 : 12 + Math.max(1, rotulosHechos.filas) * 13;
  const dY = hY + alturaHechos + (conHechos ? m.sep : 0);
  const dh = conKcal ? (estrecho ? m.dhEstrecho : m.dh) : 0;

  const kcalsVisibles = tramosKcal.filter((t) => t.hasta > ventana[0] && t.desde < ventana[1]).map((t) => t.k);
  for (const h of hechos) if (h.e.kcal) kcalsVisibles.push(h.e.kcal);
  const kLo = kcalsVisibles.length ? Math.min(...kcalsVisibles) : 0;
  const kHi = kcalsVisibles.length ? Math.max(...kcalsVisibles) : 1;
  const Yk = (k) => f1(dY + 3 + ((kHi - k) / Math.max(1, kHi - kLo)) * (dh - 6));

  /* Los cambios de pauta de la ventana: cada uno con su hilo y su cifra. */
  const cambios = (tira || espina ? [] : visibles)
    .filter((s) => s.cambios.length > 0 && dentro(s.cambioEl || s.lunes))
    .map((s) => {
      const dia = s.cambioEl || s.lunes;
      const kc = s.cambios.find((c) => c.k === 'kcals');
      const partes = s.cambios
        .filter((c) => conKcal || c.k !== 'kcals')
        .map((c) =>
          c.k === 'kcals'
            ? corto
              ? miles(c.a)
              : `${miles(c.a)} kcal ${c.de !== null ? signoMiles(c.a - c.de) : ''}`.trim()
            : c.k === 'steps'
              ? corto
                ? 'pasos'
                : `${miles(c.a ?? 0)} pasos`
              : corto
                ? 'cardio'
                : `cardio ${c.a ?? 'fuera'}`
        );
      const texto = (s.aprox ? '≈ ' : '') + (corto && kc && conKcal ? miles(kc.a) : partes.join(' · '));
      return { s, dia, x: X(dia) + 3, texto, px: 6.1 };
    })
    .filter((c) => c.texto.replace('≈ ', ''));
  const rotulosCambios = compacta || !conKcal ? { items: cambios, filas: 0 } : enRenglones(cambios, x1);
  const rY = dY + dh + 14;
  const ejeY = tira ? fY + fh + 18 : compacta || !conKcal ? dY + dh + 13 : rY + Math.max(rotulosCambios.filas, 1) * 14 + 10;
  const H = ejeY + 5;
  const abajo = tira ? fY + fh + 4 : dY + dh;

  /* ── El eje de fechas: solo rótulos, sin rayas ────────────────────────── */
  const eje = [];
  if (temporada) {
    const [y, mm] = ventana[0].split('-').map(Number);
    for (let i = 1; i < 40; i += 1) {
      const d = new Date(Date.UTC(y, mm - 1 + i, 1));
      const dia = d.toISOString().slice(0, 10);
      if (dia >= ventana[1]) break;
      const mes = d.getUTCMonth();
      eje.push({ x: X(dia), texto: mes === 0 ? `${MONTH_NAMES[0].slice(0, 3)} ${d.getUTCFullYear()}` : MONTH_NAMES[mes].slice(0, 3) });
    }
  } else if (visibles.length > 0) {
    const cada = Math.max(1, Math.ceil(44 / Math.max(1, pxPorSemana(X, visibles[0].lunes))));
    let mesPrevio = null;
    visibles.forEach((s, i) => {
      if (i % cada || !dentro(s.lunes)) return;
      const mes = s.lunes.slice(5, 7);
      eje.push({ x: X(s.lunes), texto: mes !== mesPrevio ? shortDate(s.lunes) : String(Number(s.lunes.slice(8, 10))) });
      mesPrevio = mes;
    });
  }

  /* Un rótulo que no cabe detrás del anterior no se escribe: en el teléfono,
     «ENE 2027» y «FEB» se pisaban. */
  const ejeVisible = [];
  for (const e of eje) {
    const previo = ejeVisible[ejeVisible.length - 1];
    if (!previo || e.x >= previo.x + anchoTexto(previo.texto, 6.6) + 6) ejeVisible.push(e);
  }

  /* ── El peso ──────────────────────────────────────────────────────────── */
  const pesoFinCruce = cruce?.pesoInicio ?? null;
  /* Plegada, la escala es la de lo vivido: con lo esperado hasta el destino,
     cuarenta píxeles aplanan la media. */
  const escala = !conPeso
    ? null
    : espina
    ? escalaPeso(
        visibles
          .filter((s) => s.estado !== 'futura')
          .flatMap((s) => [s.media, s.esperado])
          .filter((v) => v !== null && v !== undefined)
      )
    : escalaPeso([
        ...visibles.flatMap((s) => [s.media, s.esperado, s.original, ...s.pesajes.map((p) => p.weight)]),
        ...(cruce && cruce.caminos.length && cruce.caminos[0].ini < ventana[1]
          ? [pesoFinCruce, ...cruce.caminos.map((c) => c.pesoFin)]
          : []),
      ].filter((v) => v !== null && v !== undefined));
  const pTop = pY + 6;
  const pAlto = ph - 12;
  const Y = (v) => f1(pTop + ((escala.hi - v) / (escala.hi - escala.lo)) * pAlto);

  const lineasPeso = [];
  if (escala && !espina) {
    /* En la compacta el alto no da para una cifra por kilo: se espacian hasta
       que haya 12 px entre dos, y lo que sobra se queda sin rótulo. */
    const porKilo = pAlto / (escala.hi - escala.lo);
    const paso = Math.max(escala.paso, Math.ceil(12 / porKilo / escala.paso) * escala.paso);
    for (let v = Math.ceil(escala.lo / paso) * paso; v <= escala.hi; v += paso) {
      lineasPeso.push(v);
    }
  }

  /* Las rectas esperadas: un segmento por tramo, entero hasta hoy y apagado
     después. La recta salta en cada replanteo; ese salto ya cuenta la
     igualación y no lleva raya vertical. */
  const rectas = [];
  const fantasmas = [];
  const igualados = [];
  if (escala) {
    for (const fase of fases) {
      const exp = expectativas.get(fase.id);
      if (!exp) continue;
      const finFase = addDays(fase.endsOn || ventana[1], 1);
      exp.tramos.forEach((t, i) => {
        const a = t.desde > ventana[0] ? t.desde : ventana[0];
        const siguiente = exp.tramos[i + 1]?.desde || finFase;
        const b = siguiente < ventana[1] ? siguiente : ventana[1];
        if (b <= a) return;
        const punto = (d) => [f1(X(d)), Y(valorDelTramo(t, d))];
        const corte = hoy > a ? (hoy < b ? hoy : b) : a;
        if (corte > a) rectas.push({ key: `${fase.id}-${i}-p`, c: color(fase.direction), p: punto(a), q: punto(corte), futuro: false });
        if (b > corte) rectas.push({ key: `${fase.id}-${i}-f`, c: color(fase.direction), p: punto(corte), q: punto(b), futuro: true });
        if (t.replanteo && dentro(t.ancla) && entera && !sinIgualados) {
          igualados.push({ key: `${fase.id}-${i}`, x: f1(X(t.ancla)), y: Y(t.base), texto: `Igualado · ${ritmoTexto(fase.direction, t.ratePct)}` });
        }
      });
      if (exp.tramos.length > 1 && entera && !sinIgualados) {
        const a = exp.tramos[1].desde > ventana[0] ? exp.tramos[1].desde : ventana[0];
        const b = finFase < ventana[1] ? finFase : ventana[1];
        if (b > a) {
          fantasmas.push({
            key: fase.id,
            c: color(fase.direction),
            p: [f1(X(a)), Y(valorDelTramo(exp.original, a))],
            q: [f1(X(b)), Y(valorDelTramo(exp.original, b))],
          });
        }
      }
    }
  }

  /* Las semanas que entran en el trazo: las que se ven y una a cada lado, para
     que la curva entre y salga por el canto en vez de empezar dentro. Más allá
     no hace falta: el recorte del peso las taparía igual y son pesajes que no
     se van a ver. */
  const paraTrazo = (() => {
    if (visibles.length === 0) return [];
    const a = semanas.indexOf(visibles[0]);
    const b = semanas.indexOf(visibles[visibles.length - 1]);
    return semanas.slice(Math.max(0, a - 1), b + 2);
  })();

  const actual = semanas.find((s) => s.estado === 'hoy');
  const cruceVisible = Boolean(cruce && cruce.caminos.length && cruce.caminos[0].ini < ventana[1]);
  const xCruce = cruceVisible ? X(cruce.caminos[0].ini) : null;
  const colorDestino = destino ? kindMeta(destino.kind).color : null;

  /* La franja elegida y la señalada: la misma semana en la línea y en el libro. */
  const franja = (lunes) => {
    if (!lunes || !dentro(lunes)) return null;
    const a = Math.max(X(lunes), x0);
    const b = Math.min(X(addDays(lunes, 7)), x1);
    return { x: f1(a), w: f1(Math.max(0, b - a)) };
  };
  const franjaElegida = franja(elegida);
  const franjaSenalada = senalada !== elegida ? franja(senalada) : null;

  /* Dónde cae una semana, para quien monte un globo encima: su jueves y la
     altura de su media. Sale con `onSenalar` porque los márgenes y la escala
     son de aquí dentro; fuera solo se sabe la semana. */
  const sitioDe = (s) => ({
    x: f1(X(s.jueves)),
    y: escala && s.media !== null && s.media !== undefined ? Y(s.media) : pY + ph / 2,
    W,
    H,
  });

  /* Arriba, la banda de las fases abre el plan (`onPlan`); debajo, cada
     semana se señala y se elige. */
  const golpeY = onPlan ? fY + fh + 3 : 14;

  /* Arrastrar recorre las semanas, con el ratón o con el dedo: la x vuelve a
     su día y el día a su lunes. */
  const arrastre = (event) => {
    if (event.buttons !== 1 || !onElegir) return;
    const r = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - r.left) / (r.width || 1)) * W;
    const y = ((event.clientY - r.top) / (r.height || 1)) * H;
    if (y < golpeY || x < x0 || x > x1) return;
    const dia = toISODate(new Date(ms(ventana[0]) + ((x - x0) / (x1 - x0)) * (ms(ventana[1]) - ms(ventana[0]))));
    const lunes = weekStart(dia);
    if (lunes && lunes !== elegida && semanas.some((s) => s.lunes === lunes)) onElegir(lunes);
  };

  const resumen = [
    destino ? `Destino: ${destino.title}, ${shortDate(destino.date)}.` : null,
    actual?.fase ? `${actual.fase.title}, semana ${actual.semanaFase}${actual.totalFase ? ` de ${actual.totalFase}` : ''}.` : null,
    cambios.length ? `${cambios.length} cambios de pauta en la ventana.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      className={`linea-plan${compacta ? ' is-compacta' : ''}${espina ? ' is-espina' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`Peso real contra esperado, hechos y kcal pautadas. ${resumen}`}
      onMouseLeave={() => onSenalar?.(null)}
      onPointerMove={arrastrar ? arrastre : undefined}
    >
      <defs>
        <pattern id={`${id}-raya`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className="lp-raya" />
        </pattern>
        {escala && (
          <clipPath id={`${id}-peso`}>
            <rect x={x0} y={pTop - 4} width={x1 - x0} height={pAlto + 8} />
          </clipPath>
        )}
        {conKcal && (
          <clipPath id={`${id}-kcal`}>
            <rect x={x0} y={dY - 2} width={x1 - x0} height={dh + 4} />
          </clipPath>
        )}
      </defs>

      {franjaSenalada && <rect className="lp-senalada" x={franjaSenalada.x} y={14} width={franjaSenalada.w} height={abajo - 14} />}
      {franjaElegida && <rect className="lp-elegida" x={franjaElegida.x} y={14} width={franjaElegida.w} height={abajo - 14} />}

      {ejeVisible.map((e) => (
        <text key={`${e.x}-${e.texto}`} className="lp-eje" x={f1(e.x + 3)} y={ejeY}>
          {e.texto}
        </text>
      ))}

      {/* Los hilos van debajo de todo: de la tira a su cifra. */}
      {rotulosCambios.items.map((c) => {
        const x = f1(X(c.dia));
        const yFin = c.fila !== null && c.fila !== undefined && !compacta ? rY + c.fila * 14 - 9 : abajo;
        return <line key={`hilo-${c.s.lunes}`} className="lp-hilo" x1={x} x2={x} y1={fY + fh + 2} y2={yFin} />;
      })}

      {/* ── 1. La tira de las fases ─────────────────────────────────────── */}
      {fases.map((f) => {
        const fin = f.endsOn ? addDays(f.endsOn, 1) : ventana[1];
        const a = Math.max(X(f.startsOn), x0);
        const b = Math.min(X(fin), x1);
        if (b - a < 1) return null;
        const c = color(f.direction);
        const p = Math.min(Math.max(X(hoy), a), b - 1);
        const largo = `${f.title} · ${ritmoDe(f, hoy)}`;
        const texto = compacta || espina
          ? anchoTexto(f.title, 6) < b - a - 4 ? f.title : ''
          : anchoTexto(largo, 6.5) < b - a - 4 ? largo : anchoTexto(f.title, 6.5) < b - a - 4 ? f.title : '';
        return (
          <g key={f.id}>
            <rect className={`lp-fase${f.endsOn ? '' : ' is-abierta'}`} x={f1(a)} y={fY} width={f1(b - a - 1)} height={fh} rx="2" style={{ '--c': c }} />
            {p > a && <rect className="lp-fase-hecha" x={f1(a)} y={fY} width={f1(p - a)} height={fh} rx="2" style={{ '--c': c }} />}
            {texto && (
              <text className="lp-t lp-t-fase" x={f1(a)} y={fY - 5} style={{ fill: c }}>
                {texto}
              </text>
            )}
          </g>
        );
      })}
      {/* Los huecos entre fases, y el de la última hasta el destino, en tinta. */}
      {plan.grupos
        .filter((g) => !g.fase && g.semanas.some((s) => s.lunes >= plan.grupos.find((x) => x.fase)?.desde))
        .map((g) => {
          const a = Math.max(X(g.desde), x0);
          const tope = destino && destino.date <= g.hasta ? destino.date : addDays(g.hasta, 1);
          const b = Math.min(X(tope), x1);
          return b - a > 1 ? <rect key={`hueco-${g.desde}`} x={f1(a)} y={fY} width={f1(b - a)} height={fh} fill={`url(#${id}-raya)`} /> : null;
        })}
      {/* Lo que la última fase se pasa del destino, rayado ENCIMA: la fase es real. */}
      {destino && plan.temporada?.llegada?.estado === 'exceso' && fases.length > 0 && (() => {
        const ultima = plan.temporada.fases[plan.temporada.fases.length - 1];
        const a = Math.max(X(addDays(destino.date, 1)), x0);
        const b = Math.min(X(addDays(ultima.endsOn, 1)), x1);
        return b - a > 1 ? <rect x={f1(a)} y={fY} width={f1(b - a)} height={fh} fill={`url(#${id}-raya)`} /> : null;
      })()}
      {cruceVisible &&
        cruce.caminos.map((c, i) => {
          const hh = (fh - 1) / 2;
          const a = Math.max(xCruce, x0);
          const b = Math.min(X(addDays(c.fin, 1)), x1);
          const yy = fY + i * (hh + 1);
          const hastaDestino = destino ? Math.min(X(destino.date), x1) : null;
          return (
            <g key={`camino-${c.indice}`}>
              {b > a && <rect className="lp-camino-tira" x={f1(a + 1)} y={f1(yy)} width={f1(b - a - 1)} height={f1(hh)} rx="1.5" style={{ '--c': color(c.direccion) }} />}
              {hastaDestino && hastaDestino > b + 1 && (
                <rect x={f1(b)} y={f1(yy)} width={f1(hastaDestino - b)} height={f1(hh)} fill={`url(#${id}-raya)`} />
              )}
            </g>
          );
        })}
      {cruceVisible && xCruce + 70 < x1 && entera && (
        <text className="lp-t lp-t-tinta2" x={f1(xCruce + 3)} y={fY - 5}>
          Cruce · {shortDate(cruce.decide)}
        </text>
      )}

      {/* ── 2. El peso ──────────────────────────────────────────────────── */}
      {escala && (
        <>
          {lineasPeso.map((v) => (
            <g key={v}>
              <line className="lp-rejilla" x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} />
              <text className="lp-eje" x={x0 - 6} y={Y(v) + 3.5} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          <g clipPath={`url(#${id}-peso)`}>
            {rectas.map((r) => (
              <line key={r.key} className={`lp-esperado${r.futuro ? ' is-futuro' : ''}`} style={{ stroke: r.c }} x1={r.p[0]} y1={r.p[1]} x2={r.q[0]} y2={r.q[1]} />
            ))}
            {fantasmas.map((r) => (
              <line key={`fantasma-${r.key}`} className="lp-fantasma" style={{ stroke: r.c }} x1={r.p[0]} y1={r.p[1]} x2={r.q[0]} y2={r.q[1]} />
            ))}
            {cruceVisible &&
              !espina &&
              pesoFinCruce !== null &&
              cruce.caminos.map((c) =>
                c.pesoFin === null ? null : (
                  <line
                    key={`camino-l-${c.indice}`}
                    className="lp-camino"
                    style={{ stroke: color(c.direccion) }}
                    x1={f1(xCruce)}
                    y1={Y(pesoFinCruce)}
                    x2={f1(X(addDays(c.fin, 1)))}
                    y2={Y(c.pesoFin)}
                  />
                )
              )}
            {/* El peso real es la MISMA pieza que dibuja las tiras de la
                portada: aquí se le da la escala de la ventana, allí la de la
                fase. Ver `TrazoDelPeso`. */}
            <TrazoDelPeso
              semanas={paraTrazo}
              X={X}
              Y={Y}
              color={TINTA_PESO}
              conPesajes={entera}
              punto={(s) => dentro(s.jueves) && (!espina || s.lunes === elegida)}
              radio={(s) => (espina ? 3.5 : s === actual && !compacta ? 4.5 : compacta || estrecho ? 2.2 : 2.8)}
              grueso={(s) => s === actual}
            />
            {igualados.map((g) => (
              <circle key={`ig-${g.key}`} className="lp-igualado" cx={g.x} cy={g.y} r="4.5" />
            ))}
          </g>
          {entera &&
            igualados.map((g) => (
              <text key={`ig-t-${g.key}`} className="lp-t lp-t-tinta" x={g.x + 7} y={g.y - 8}>
                {estrecho ? 'Igualado' : g.texto}
              </text>
            ))}
          {/* Los rótulos de los caminos, al final de su recta. */}
          {entera &&
            cruceVisible &&
            xCruce < x1 - 40 &&
            [...cruce.caminos]
              .filter((c) => c.pesoFin !== null)
              .sort((a, b) => b.pesoFin - a.pesoFin)
              .map((c, i) => {
                const llegada = llegadaTexto(c.llegada);
                const texto = estrecho || !llegada ? c.titulo : `${c.titulo} · ${llegada}`;
                return (
                  <text key={`camino-t-${c.indice}`} className="lp-t lp-t-tinta2" x={f1(Math.min(X(addDays(c.fin, 1)), x1) - 2)} y={f1(Y(c.pesoFin) + (i === 0 ? -7 : 14))} textAnchor="end">
                    {texto}
                  </text>
                );
              })}
          {entera && actual?.media !== null && actual?.media !== undefined && dentro(actual.jueves) && (
            <text className="lp-t lp-t-fuerte lp-num" x={f1(X(actual.jueves) + 8)} y={Y(actual.media) + 16}>
              {kg(actual.media)} kg
              {actual.desvio !== null && <tspan className="lp-t-suave"> {signoKg(actual.desvio)}</tspan>}
            </text>
          )}
        </>
      )}

      {/* ── 3. Los hechos ───────────────────────────────────────────────── */}
      {conHechos && <line className="lp-rejilla" x1={x0} x2={x1} y1={hY - 6} y2={hY - 6} />}
      {conHechos && !estrecho && !compacta && (
        <text className="lp-carril" x={x0 - 6} y={hY + 8} textAnchor="end">
          hechos
        </text>
      )}
      {rotulosHechos.items.map((h) => (
        <g key={h.e.id}>
          {h.e.kind === 'race' ? (
            <circle className="lp-competicion" cx={f1(h.a)} cy={hY + 4} r="3" style={{ fill: kindMeta('race').color }} />
          ) : (
            <rect className={h.e.date > hoy ? 'lp-hecho is-futuro' : 'lp-hecho'} x={f1(h.a)} y={hY + 1} width={f1(Math.max(h.b - h.a, 3))} height="6" rx="1.5" />
          )}
          {!compacta && h.fila !== null && h.fila !== undefined && (
            <text className={`lp-t ${h.e.kind === 'race' ? 'lp-t-competicion' : 'lp-t-tinta2'}`} x={f1(h.xt)} y={hY + 19 + h.fila * 13} style={h.e.kind === 'race' ? { fill: kindMeta('race').color } : undefined}>
              {h.texto}
            </text>
          )}
        </g>
      ))}

      {/* ── 4. Las kcal ─────────────────────────────────────────────────── */}
      {conKcal && (
        <>
          <line className="lp-rejilla" x1={x0} x2={x1} y1={dY - 6} y2={dY - 6} />
          {!estrecho && !compacta && (
            <text className="lp-carril" x={x0 - 6} y={dY + 8} textAnchor="end">
              kcal
            </text>
          )}
          <g clipPath={`url(#${id}-kcal)`}>
            {hechos
              .filter((h) => h.e.kcal)
              .map((h) => {
                const base = semanas.find((s) => s.lunes <= h.e.date && s.domingo >= h.e.date)?.pauta?.kcals;
                if (!base) return null;
                return (
                  <rect key={`rf-${h.e.id}`} className="lp-refeed" x={f1(h.a)} y={Yk(h.e.kcal)} width={f1(Math.max(h.b - h.a, 2))} height={f1(Math.max(0, Yk(base) - Yk(h.e.kcal)))} />
                );
              })}
            <path
              className="lp-kcal"
              d={tramosKcal
                .map((t, i) => {
                  const a = f1(X(t.desde));
                  const b = f1(X(t.hasta));
                  const y = Yk(t.k);
                  const seguido = i > 0 && tramosKcal[i - 1].hasta === t.desde;
                  return `${seguido ? 'L' : 'M'}${a},${y}L${b},${y}`;
                })
                .join('')}
            />
          </g>
          {!compacta &&
            (() => {
              const primera = visibles.find((s) => s.pauta?.kcals);
              if (!primera || primera.cambios.length) return null;
              return (
                <text className="lp-n lp-t-tinta2" x={f1(Math.max(X(primera.lunes), x0) + 3)} y={Yk(primera.pauta.kcals) - 4}>
                  {miles(primera.pauta.kcals)} kcal
                </text>
              );
            })()}
          {!compacta &&
            rotulosCambios.items.map((c) =>
              c.fila === null || c.fila === undefined ? null : (
                <g key={`cambio-${c.s.lunes}`}>
                  {c.s.pauta?.kcals ? <circle className="lp-marca" cx={f1(X(c.dia))} cy={Yk(c.s.pauta.kcals)} r="2" /> : null}
                  <text className="lp-n lp-t-tinta2" x={f1(c.xt)} y={rY + c.fila * 14}>
                    {c.texto}
                  </text>
                </g>
              )
            )}
        </>
      )}

      {/* ── Hoy y el destino ─────────────────────────────────────────────── */}
      {dentro(hoy) && (
        <g>
          <line className="lp-hoy" x1={f1(X(hoy))} x2={f1(X(hoy))} y1={14} y2={abajo} />
          {!compacta && !tira && !espina && (
            <text className="lp-t lp-t-hoy" x={f1(X(hoy))} y={10} textAnchor="middle">
              hoy
            </text>
          )}
        </g>
      )}
      {destino && dentro(destino.date) && (
        <g style={{ '--destino': colorDestino }}>
          <line className="lp-destino" x1={f1(X(destino.date))} x2={f1(X(destino.date))} y1={14} y2={abajo} />
          <text className="lp-t lp-t-destino" x={f1(X(destino.date) + 3)} y={10} textAnchor="end">
            {estrecho || compacta || tira || espina ? shortDate(destino.date) : `${destino.title} · ${shortDate(destino.date)}`}
          </text>
        </g>
      )}

      {/* Las semanas que ya se contestaron, en una marca diminuta al canto, y
          la que espera respuesta en su color. Son el rastro del trabajo, no
          un dato del cliente. */}
      {marcas &&
        visibles.map((s) =>
          !dentro(s.jueves) ? null : s.lunes === pendiente ? (
            <rect key={`mk-${s.lunes}`} className="lp-marca-pendiente" x={f1(X(s.jueves) - 3)} y={abajo - 3} width="6" height="3" rx="1.5" />
          ) : marcas.has(s.lunes) ? (
            <rect key={`mk-${s.lunes}`} className="lp-marca-hecha" x={f1(X(s.jueves) - 1)} y={abajo - 3} width="2" height="3" rx="1" />
          ) : null
        )}

      {onPlan && (
        <rect className="lp-golpe-plan" x={x0} y={0} width={f1(x1 - x0)} height={golpeY} onClick={onPlan}>
          <title>Editar el plan</title>
        </rect>
      )}

      {/* Los golpes: cada semana, entera, se señala y se elige. */}
      {visibles.map((s) => {
        const a = Math.max(X(s.lunes), x0);
        const b = Math.min(X(addDays(s.lunes, 7)), x1);
        if (b <= a) return null;
        return (
          <rect
            key={`g-${s.lunes}`}
            className={`lp-golpe${onElegir ? '' : ' is-quieto'}`}
            x={f1(a)}
            y={golpeY}
            width={f1(b - a)}
            height={Math.max(0, abajo - golpeY)}
            onMouseEnter={() => onSenalar?.(s.lunes, sitioDe(s))}
            onClick={() => onElegir?.(s.lunes)}
          >
            <title>{`Semana del ${shortDate(s.lunes)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
};

