import { useMemo, useState } from 'react';

import { metricColor } from '@/domain/metrics';
import { makeScale } from '@/components/ui/charts';
import { localeNumber, shortDate } from '@/lib/dates';
import { useElementWidth } from '@/lib/useElementWidth';

/*
  Las medidas del lienzo. El canal de la izquierda es FIJO: con uno que se
  ajustara al texto, dos personas con pesos de distinto número de cifras
  tendrían el dibujo empezando en sitios distintos.
*/
const ALTO = 240;
const CANAL = 40;
const MARGEN_D = 12;
/* Aire arriba y abajo para que el primer y el último punto no se coman su
   propio canto, y para que la chapa de «hoy» tenga dónde caer. */
const CEJA = 18;
const SUELO = 8;
const TICKS = 4;
/* Lo que miden las chapas, para colgarlas de su punto sin que se pisen. Son
   cajas de HTML y no se miden en el render: con la letra y el relleno fijos en
   el CSS (`line-height` incluido), estas cifras son las de verdad. */
const ALTO_CHAPA = 22;
const ANCHO_CHAPA = 116;
const ALTO_HOY = 52;
const ANCHO_HOY = 96;
/* El aire entre un punto y la chapa que habla de él: lo justo para que el
   anillo del punto no toque el canto. */
const SEPARA = 10;

const dentro = (v, min, max) => Math.max(min, Math.min(max, v));
const chocan = (a, b) => a && b && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const kg = (v) => localeNumber(v, { maximumFractionDigits: 1 });
/** El cambio con su signo de verdad: «−0,4», «+0,2». */
const signoKg = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${kg(Math.abs(v))}`;
/* El globo que sale al tocar una semana: su ancho, para saber si cabe a la
   derecha del punto o hay que abrirlo a la izquierda. */
const ANCHO_GLOBO = 172;

/*
  ══ EL EJE DEL PESO NO BAJA DE DOS KILOS ═══════════════════════════════════

  Con dos pesajes de 78,4 y 78,3 la escala automática se ajusta a los datos y
  abre un eje de cien gramos: la misma línea que en una fase entera dibuja tres
  kilos de bajada sale como un despeñadero, y los cuatro rótulos de la rejilla
  se repiten («78,4 · 78,4 · 78,3 · 78,2») porque no caben en un decimal.

  El eje mínimo es lo que convierte el dibujo en una MEDIDA: dos kilos es el
  orden de magnitud de lo que se decide mirando esta curva, así que una semana
  plana se ve plana y una bajada real ocupa el lienzo. Se reparte a los dos
  lados del centro para no mover lo que ya estaba dentro.
*/
const RANGO_MINIMO = 2;
const minimo = (escala) => {
  if (!escala) return escala;
  const rango = escala.max - escala.min;
  if (rango >= RANGO_MINIMO) return escala;
  const centro = (escala.max + escala.min) / 2;
  return { ...escala, min: centro - RANGO_MINIMO / 2, max: centro + RANGO_MINIMO / 2 };
};

/**
 * LA GRÁFICA DEL PROGRESO — el peso encima de lo que le pusiste, en UN dibujo.
 *
 * ══ De dónde sale (frame de Figma 50:131, 17 sep 2026) ═════════════════════
 *
 * El prototipo del Resumen dibuja una sola caja con las dos cosas dentro:
 * columnas apagadas con el objetivo de cada semana —calorías o pasos— y, encima,
 * el peso como PUNTOS UNIDOS. Atadas a sus puntos, tres chapas que dicen lo
 * que un eje no dice: de dónde salió, dónde está hoy y dónde tiene que acabar;
 * encima, la cinta con los bloques, y debajo, la leyenda de cada trazo.
 *
 *              ┌─ Bloque 1 ──────────────┬─ Bloque 2 ────────────┐
 *     ┌─────────────────────────────────┬───────────────────────────┐
 *     │  82 ┼ [80,7 kg EMPEZÓ]          │              ┌ HOY ────┐  │
 *     │     │  ●───●───●              │              │ 76,9 kg │  │
 *     │  80 ┼──────────────●───●──────│──●───●       └────┬────┘  │
 *     │     │                         │        ●───●──────●       │
 *     │  78 ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │─ ─ ─ ─ ─ ─ ─ ─ [OBJETIVO] ─│
 *     │     │  ▓   ▓   ▓   ▓   ▓      │▓   ▓   ▓   ▓   ▓   ▓      │
 *     └─────────────────────────────────┴───────────────────────────┘
 *        S1    S2   S3   S4   S5   S6   S7   S8
 *        ● Peso  ▓ Calorías pautadas  ▬ Semana en que cambiaron  ┄ Objetivo
 *
 * ══ Por qué NO es `ReviewChart` con otra piel ══════════════════════════════
 *
 * Aquélla son DOS bandas apiladas, cada una con su eje, y es el mando de la
 * Revisión: se pulsa una semana y el tablero de abajo pasa a hablar de ella.
 * Aquí no hay tablero que mandar y el sitio es la mitad de alto, así que apilar
 * dos bandas deja la del plan en cuarenta píxeles — que es donde un peldaño de
 * doscientas kcal deja de verse. El dibujo del frame resuelve las dos cosas de
 * una vez: una sola banda, y el plan DETRÁS en vez de debajo.
 *
 * ── Y las columnas NO arrancan en cero ─────────────────────────────────────
 * Es la misma razón que ya está escrita en la escalera de `ReviewChart`: entre
 * 2.100 y 2.400 kcal, con base cero, ocho columnas salen idénticas y el peldaño
 * —lo único que se mira ahí— desaparece. Por eso van APAGADAS y no en tinta
 * plena: son el fondo contra el que se lee la curva, no una magnitud que se mida
 * desde su origen. Lo que sí se marca es el PELDAÑO —la semana en que dejó de
 * valer lo de la anterior—, que es lo que tú hiciste.
 *
 * @param semanas   Filas de `useReviewTrack`: `{ week, weight, kcals, steps }`.
 * @param banda     Qué se dibuja detrás: `kcals` o `steps`.
 * @param cambios   `[{ week, name, id }]` — TODOS los bloques y la semana en que empezó cada uno.
 * @param objetivo  Peso al que tiene que acabar, si lo hay.
 */
export const GraficaDelProgreso = ({
  semanas = [],
  banda = 'kcals',
  cambios = [],
  objetivo = null,
  ariaLabel = 'Su peso, semana a semana, sobre el plan que tenía puesto',
}) => {
  const [ref, ancho] = useElementWidth();
  const color = metricColor('weight');
  const colorPlan = metricColor(banda === 'steps' ? 'steps' : 'kcals');

  const geo = useMemo(() => {
    const n = semanas.length;
    if (n === 0 || ancho < 220) return null;

    const W = Math.max(280, ancho);
    const util = W - CANAL - MARGEN_D;
    const columna = util / n;
    const x = (i) => CANAL + (i + 0.5) * columna;

    /* La escala del peso incluye el OBJETIVO: si no, una meta que todavía queda
       lejos cae fuera del lienzo y su chapa se pinta pegada al canto, diciendo
       una altura que no es la suya. */
    const pesos = semanas.map((f) => f.weight).filter((v) => v !== null && v !== undefined);
    const escala = minimo(
      makeScale(objetivo !== null ? [...pesos, objetivo] : pesos, { padRatio: 0.28 })
    );
    const yPeso = (v) => {
      if (!escala) return ALTO / 2;
      const t = (v - escala.min) / (escala.max - escala.min || 1);
      return ALTO - SUELO - t * (ALTO - SUELO - CEJA);
    };

    const puntos = semanas
      .map((f, i) =>
        f.weight === null || f.weight === undefined
          ? null
          : { i, x: x(i), y: yPeso(f.weight), v: f.weight }
      )
      .filter(Boolean);

    const trazo =
      puntos.length > 1 ? puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') : '';

    /*
      ══ LAS COLUMNAS DEL PLAN, Y CUÁNDO NO SE DIBUJAN ═══════════════════════
      Un plan que no se ha tocado en diez semanas sale como diez columnas
      idénticas, y eso ya está juzgado en esta casa: *«una serie que no se
      mueve, que en una gráfica no es un dato, es un adorno»* (ver el
      comentario de la banda en `Dashboard`). Con menos de dos valores
      distintos no hay peldaño que enseñar y el dibujo se queda con la curva,
      que es lo único que ahí cambia. El conmutador de la cabecera sigue
      estando: es por dónde se mira, no qué hay.
    */
    const campo = banda === 'steps' ? 'steps' : 'kcals';
    const planes = semanas.map((f) => f[campo]).filter((v) => v !== null && v !== undefined);
    const hayPeldano = new Set(planes).size > 1;
    const escalaPlan = hayPeldano ? makeScale(planes, { padRatio: 0.9 }) : null;
    /* Las columnas viven en la MITAD de abajo: subiendo hasta el 30 % se metían
       entre los puntos del peso y el dibujo era una sola masa. Abajo, el plan es
       el suelo sobre el que se lee la curva, como en el frame. */
    const TECHO = ALTO * 0.5;
    const yPlan = (v) => {
      if (!escalaPlan) return ALTO * 0.6;
      const t = (v - escalaPlan.min) / (escalaPlan.max - escalaPlan.min || 1);
      return ALTO - t * (ALTO - TECHO);
    };
    const anchoBarra = Math.max(6, Math.min(56, columna * 0.6));
    const barras = !hayPeldano
      ? []
      : semanas
          .map((f, i) =>
            f[campo] === null || f[campo] === undefined
              ? null
              : { i, x: x(i) - anchoBarra / 2, y: yPlan(f[campo]), v: f[campo] }
          )
          .filter(Boolean);

    /* Los peldaños se calculan de la propia serie y no de `fila.changed`: ese
       campo lo pone `nutritionTrack` y solo sabe de calorías, así que al pasar a
       los pasos marcaría los escalones equivocados. */
    const peldanos = [];
    let previo = null;
    semanas.forEach((f, i) => {
      const v = f[campo];
      if (v === null || v === undefined) return;
      if (previo !== null && v !== previo) peldanos.push(i);
      previo = v;
    });

    /*
      ══ LOS BLOQUES, EN UNA CINTA ENCIMA DEL DIBUJO ═════════════════════════
      Era una raya de puntos con una chapita «BLOQUE 2» al pie, y el dueño no
      la leía: «que se entendiese mejor la separación entre bloques». Una raya
      suelta dice «aquí pasó algo», no QUÉ hay a cada lado — y era de puntos,
      como la del objetivo, así que las dos se confundían.

      Ahora cada bloque es un TRAMO con su nombre, en una cinta encima del
      lienzo que ocupa exactamente sus semanas (las mismas columnas del eje),
      y la raya que baja por el dibujo es CONTINUA: es un hecho que pasó. La de
      puntos queda solo para el objetivo, que es lo que todavía no ha pasado.
      Con un solo bloque no hay cinta: no separa nada.
    */
    const ordenados = [...cambios].sort((a, b) => a.week - b.week);
    const tramos = ordenados
      .map((c, k) => {
        const siguiente = ordenados[k + 1];
        let desde = -1;
        let hasta = -1;
        semanas.forEach((f, i) => {
          if (f.week >= c.week && (!siguiente || f.week < siguiente.week)) {
            if (desde < 0) desde = i;
            hasta = i;
          }
        });
        return desde < 0 ? null : { desde, hasta, name: c.name, key: c.id ?? c.week };
      })
      .filter(Boolean);
    const conCinta = tramos.length > 1;
    const marcas = conCinta ? tramos.slice(1).map((t) => ({ x: x(t.desde) - columna / 2, key: t.key })) : [];

    const rejilla = escala
      ? Array.from({ length: TICKS }, (_, k) => {
          const v = escala.max - ((escala.max - escala.min) * k) / (TICKS - 1);
          return { v, y: yPeso(v) };
        })
      : [];

    return {
      W,
      x,
      columna,
      anchoBarra,
      yPeso,
      puntos,
      trazo,
      barras,
      peldanos: hayPeldano ? peldanos : [],
      marcas,
      tramos: conCinta ? tramos : [],
      rejilla,
    };
  }, [semanas, ancho, banda, cambios, objetivo]);

  const puntos = geo?.puntos || [];
  const ultimo = puntos.length > 0 ? puntos[puntos.length - 1] : null;
  const primero = puntos.length > 1 ? puntos[0] : null;
  const yObjetivo = objetivo !== null && geo ? geo.yPeso(objetivo) : null;
  const campo = banda === 'steps' ? 'steps' : 'kcals';

  /*
    ══ EL MÁXIMO Y EL MÍNIMO (18 sep) ══════════════════════════════════════
    «Que pusiese quizás el máximo y el mínimo.» Dos puntos con su anillo y su
    rótulo pequeño —«máx 80,7»— encima del alto y debajo del bajo, que es el
    lado por donde no pasa la línea. Si el extremo es el primer punto o el de
    hoy, su chapa ya dice la cifra: allí solo se añade la palabra a la chapa,
    para no poner dos rótulos al mismo punto. Con menos de tres pesajes, o
    todos iguales, no hay extremos que contar.
  */
  const extremos = (() => {
    if (puntos.length < 3) return null;
    let max = puntos[0];
    let min = puntos[0];
    for (const p of puntos) {
      if (p.v > max.v) max = p;
      if (p.v < min.v) min = p;
    }
    return max.v === min.v ? null : { max, min };
  })();
  const esChapa = (p) => p === primero || p === ultimo;

  /*
    ══ TOCAR UNA SEMANA (18 sep) ═══════════════════════════════════════════
    «Que la gráfica fuese interactiva, que pudieses tocar los puntos y
    soltasen información.» Cada semana es una franja del alto del dibujo —no
    el punto de 3 px, que con el dedo no se acierta—: al pasar el ratón, al
    tocarla o al llegar con las flechas, se marca su guía vertical, su punto
    crece y sale un globo con lo que pasó esa semana: el peso, cuánto cambió
    desde el pesaje anterior y lo que tenía pautado. Es una lectura, no un
    mando: no lleva a ningún sitio ni cambia nada de la tarjeta.
  */
  const [activo, setActivo] = useState(null);
  const globo = (() => {
    if (!geo || activo === null || !semanas[activo]) return null;
    const fila = semanas[activo];
    const punto = puntos.find((p) => p.i === activo) || null;
    const anterior = [...puntos].reverse().find((p) => p.i < activo) || null;
    const x = geo.x(activo);
    const y = punto ? punto.y : ALTO / 2;
    const derecha = x + 14 + ANCHO_GLOBO <= geo.W;
    return {
      fila,
      punto,
      anterior,
      x,
      left: derecha ? x + 14 : x - 14 - ANCHO_GLOBO,
      top: dentro(y - 34, 0, ALTO - 96),
      plan: fila[campo] ?? null,
      extremo: extremos && punto ? (punto === extremos.max ? 'Máximo' : punto === extremos.min ? 'Mínimo' : null) : null,
    };
  })();
  const dicho = (i) => {
    const f = semanas[i];
    const p = puntos.find((q) => q.i === i);
    const plan = f[campo];
    return [
      `Semana ${f.week}`,
      p ? `${kg(p.v)} kg` : 'sin pesaje',
      plan !== null && plan !== undefined ? `${localeNumber(plan)} ${campo === 'steps' ? 'pasos' : 'kcal'} pautadas` : null,
    ]
      .filter(Boolean)
      .join(', ');
  };
  const conTeclas = (e) => {
    if (!semanas.length) return;
    const n = semanas.length;
    const actual = activo ?? n - 1;
    const salto = { ArrowRight: 1, ArrowLeft: -1, Home: -n, End: n }[e.key];
    if (salto === undefined) {
      if (e.key === 'Escape') setActivo(null);
      return;
    }
    e.preventDefault();
    setActivo(activo === null ? n - 1 : dentro(actual + salto, 0, n - 1));
  };

  /*
    ══ CADA CHAPA, COLGADA DE SU PUNTO ═════════════════════════════════════
    «Empezó» iba abajo a la izquierda y «hoy» arriba a la derecha, clavadas a
    las esquinas del lienzo, y el dueño lo pidió al revés: «que el empezó fuese
    en donde empezó, y el hoy en el hoy». Una cifra que no está junto a su
    punto obliga a buscar a cuál se refiere.

    Cada una se cuelga del lado por el que NO pasa la línea: si el peso baja
    desde el primer punto, «empezó» va encima (debajo viene la curva); si la
    línea llega a hoy desde arriba, «hoy» va debajo. Si ese lado no cabe en el
    lienzo, al otro.
  */
  const empezo = (() => {
    if (!geo || !primero) return null;
    const siguiente = puntos[1];
    const arriba = siguiente.y >= primero.y;
    const encima = primero.y - SEPARA - ALTO_CHAPA;
    const debajo = primero.y + SEPARA;
    const cabe = (t) => t >= 0 && t <= ALTO - ALTO_CHAPA;
    const top = arriba ? (cabe(encima) ? encima : debajo) : cabe(debajo) ? debajo : encima;
    const left = Math.max(CANAL, primero.x - SEPARA);
    return { left, top: dentro(top, 0, ALTO - ALTO_CHAPA), caja: { x0: left, x1: left + ANCHO_CHAPA, y0: top, y1: top + ALTO_CHAPA } };
  })();

  /*
    ══ «HOY», ARRIBA Y EN SU COLUMNA (tercera vuelta, 18 sep) ═════════════════
    Colgada al lado de su punto caía casi siempre sobre las columnas del plan
    —el peso de hoy suele ser el mínimo del dibujo, o sea el que está más
    cerca de ellas— y se comía las calorías de las últimas semanas: «el hoy
    quizás debería estar arriba porque se come las kcals y pasos».

    Arriba del lienzo, donde el dibujo no tiene nada, pero en la columna de su
    punto y atada a él con un hilo: se lee dónde está hoy sin tapar nada. Solo
    baja debajo de su punto si el peso de hoy está tan alto que la tarjeta lo
    taparía.
  */
  const hoy = (() => {
    if (!geo || !ultimo) return null;
    const radio = 6;
    const arriba = ultimo.y - radio >= ALTO_HOY + SEPARA;
    const top = arriba ? 0 : dentro(ultimo.y + SEPARA, 0, ALTO - ALTO_HOY);
    /* El canto derecho de la tarjeta, un pelo a la derecha de su punto: el
       hilo baja por dentro de ella y no por su canto. */
    const right = Math.max(0, geo.W - ultimo.x - 24);
    const x1 = geo.W - right;
    const hilo = arriba ? { y1: top + ALTO_HOY, y2: ultimo.y - radio - 2 } : null;
    return { right, top, hilo, caja: { x0: x1 - ANCHO_HOY, x1, y0: top, y1: top + ALTO_HOY } };
  })();

  /* El objetivo va al extremo de SU raya, a la derecha como en el frame. Si ahí
     choca con la de hoy —pasa cuando ya casi ha llegado—, prueba debajo de la
     raya, y luego el otro extremo. */
  const meta = (() => {
    if (!geo || yObjetivo === null) return null;
    const encima = yObjetivo - 6 - ALTO_CHAPA;
    const debajo = yObjetivo + 6;
    const tops = [encima, debajo].filter((t) => t >= 0 && t <= ALTO - ALTO_CHAPA);
    const huecos = [
      ...tops.map((t) => ({ right: MARGEN_D, top: t, x0: geo.W - MARGEN_D - ANCHO_CHAPA, x1: geo.W - MARGEN_D })),
      ...tops.map((t) => ({ left: CANAL + 4, top: t, x0: CANAL + 4, x1: CANAL + 4 + ANCHO_CHAPA })),
    ];
    const libre = huecos.find((h) => {
      const caja = { x0: h.x0, x1: h.x1, y0: h.top, y1: h.top + ALTO_CHAPA };
      return !chocan(caja, hoy?.caja) && !chocan(caja, empezo?.caja);
    });
    return libre || huecos[0] || { right: MARGEN_D, top: dentro(encima, 0, ALTO - ALTO_CHAPA) };
  })();
  /* Cuántas marcas caben en el eje: una columna de 26 px no aguanta «S12». */
  const paso = Math.max(1, Math.ceil(semanas.length / Math.max(1, Math.floor((ancho - CANAL - MARGEN_D) / 42))));

  /* Las columnas de la cinta de bloques y del eje de semanas: las mismas del
     dibujo, así que cada tramo empieza justo en su raya. */
  const columnas = {
    gridTemplateColumns: `repeat(${semanas.length}, minmax(0, 1fr))`,
    marginLeft: geo ? CANAL : 0,
    marginRight: geo ? MARGEN_D : 0,
  };
  const conPlan = Boolean(geo && geo.barras.length > 0);

  return (
    <div className="progreso-grafica" ref={ref}>
      {geo && geo.tramos.length > 0 && (
        <div className="progreso-bloques" style={columnas}>
          {geo.tramos.map((t, k) => (
            <span
              key={t.key}
              className={`progreso-tramo${k === geo.tramos.length - 1 ? ' is-actual' : ''}`}
              style={{ gridColumn: `${t.desde + 1} / ${t.hasta + 2}` }}
              title={`${t.name}: semanas ${semanas[t.desde].week} a ${semanas[t.hasta].week}`}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}
      <div className="progreso-lienzo" style={{ height: ALTO }}>
        {geo && (
          <svg
            className="progreso-svg"
            width={geo.W}
            height={ALTO}
            viewBox={`0 0 ${geo.W} ${ALTO}`}
            role="img"
            aria-label={ariaLabel}
          >
            <g className="progreso-rejilla">
              {geo.rejilla.map((t) => (
                <line key={`g-${t.v}`} x1={CANAL} x2={geo.W - MARGEN_D} y1={t.y} y2={t.y} />
              ))}
            </g>

            {/* El plan, detrás de todo: columnas apagadas con el canto de arriba
                redondeado, como en el frame. */}
            <g className="progreso-plan" fill={colorPlan}>
              {geo.barras.map((b) => (
                <rect
                  key={`b-${b.i}`}
                  x={b.x}
                  y={b.y}
                  width={geo.anchoBarra}
                  height={Math.max(2, ALTO - b.y)}
                  rx="4"
                />
              ))}
            </g>
            <g className="progreso-peldano" fill={colorPlan}>
              {geo.peldanos.map((i) => {
                const b = geo.barras.find((c) => c.i === i);
                return b ? (
                  <rect key={`p-${i}`} x={b.x} y={b.y} width={geo.anchoBarra} height="3" rx="1.5" />
                ) : null;
              })}
            </g>

            {/* El cambio de bloque: una raya CONTINUA de arriba abajo, que sube
                hasta el canto de su tramo en la cinta de encima. */}
            <g className="progreso-corte">
              {geo.marcas.map((m) => (
                <line key={`c-${m.key}`} x1={m.x} x2={m.x} y1="0" y2={ALTO} />
              ))}
            </g>

            {yObjetivo !== null && (
              <line
                className="progreso-meta"
                x1={CANAL}
                x2={geo.W - MARGEN_D}
                y1={yObjetivo}
                y2={yObjetivo}
                stroke={color}
              />
            )}

            {globo && (
              <line className="progreso-guia" x1={globo.x} x2={globo.x} y1="0" y2={ALTO} />
            )}

            {hoy?.hilo && hoy.hilo.y2 > hoy.hilo.y1 + 4 && (
              <line
                className="progreso-hilo"
                x1={ultimo.x}
                x2={ultimo.x}
                y1={hoy.hilo.y1}
                y2={hoy.hilo.y2}
                stroke={color}
              />
            )}

            {/* El peso: puntos UNIDOS y no curva suavizada. Un peso son medidas
                tomadas los días que esa persona se subió a la báscula, no una
                función continua. */}
            {geo.trazo && (
              <polyline className="progreso-trazo" points={geo.trazo} fill="none" stroke={color} />
            )}
            {puntos.map((p, k) => {
              const extremo = extremos && (p === extremos.max || p === extremos.min);
              const clase = [
                'progreso-punto',
                k === puntos.length - 1 && 'is-hoy',
                extremo && 'is-extremo',
                p.i === activo && 'is-activo',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <circle
                  key={`pt-${p.i}`}
                  className={clase}
                  cx={p.x}
                  cy={p.y}
                  r={p.i === activo ? 6 : k === puntos.length - 1 || extremo ? 5 : 3}
                  fill={color}
                />
              );
            })}

            <g className="progreso-eje-y">
              {geo.rejilla.map((t) => (
                <text key={`t-${t.v}`} x={CANAL - 10} y={t.y} textAnchor="end" dominantBaseline="middle">
                  {kg(t.v)}
                </text>
              ))}
            </g>
          </svg>
        )}

        {/* ── Las chapas ────────────────────────────────────────────────────
            Fuera del SVG a propósito: son cajas de texto con su relleno y su
            canto, y dentro del dibujo habría que componerlas a mano con `rect` y
            `text` sin saber lo que mide la letra. */}
        {empezo && (
          <span className="progreso-chapa" style={{ left: empezo.left, top: empezo.top }}>
            {kg(primero.v)} kg <em>empezó</em>
            {extremos?.max === primero && <em> · máx</em>}
            {extremos?.min === primero && <em> · mín</em>}
          </span>
        )}
        {extremos &&
          [
            { p: extremos.max, k: 'máx', top: extremos.max.y - 24 },
            { p: extremos.min, k: 'mín', top: extremos.min.y + 10 },
          ]
            .filter((e) => !esChapa(e.p))
            .map((e) => (
              <span
                key={e.k}
                className="progreso-extremo"
                style={{ left: e.p.x, top: dentro(e.top, 0, ALTO - 16) }}
              >
                <em>{e.k}</em> {kg(e.p.v)}
              </span>
            ))}
        {meta && (
          <span
            className="progreso-chapa is-meta"
            style={{ left: meta.left, right: meta.right, top: meta.top, color, borderColor: color }}
          >
            {kg(objetivo)} kg <em>objetivo</em>
          </span>
        )}
        {hoy && (
          <span className="progreso-hoy" style={{ right: hoy.right, top: hoy.top }}>
            <em>
              Hoy
              {extremos?.max === ultimo && ' · máx'}
              {extremos?.min === ultimo && ' · mín'}
            </em>
            <b style={{ color }}>
              {kg(ultimo.v)}
              <small> kg</small>
            </b>
          </span>
        )}

        {globo && (
          <div className="progreso-globo" style={{ left: globo.left, top: globo.top, width: ANCHO_GLOBO }} aria-hidden="true">
            <span className="progreso-globo-cab">
              S{globo.fila.week}
              {globo.fila.weekStart ? ` · ${shortDate(globo.fila.weekStart)}` : ''}
              {globo.extremo && <span className="progreso-globo-marca">{globo.extremo}</span>}
            </span>
            {globo.punto ? (
              <b style={{ color }}>
                {kg(globo.punto.v)}
                <small> kg</small>
              </b>
            ) : (
              <span className="progreso-globo-nada">Sin pesaje esa semana</span>
            )}
            {globo.punto && globo.anterior && (
              <span className="progreso-globo-linea">
                {signoKg(globo.punto.v - globo.anterior.v)} kg desde S{semanas[globo.anterior.i].week}
              </span>
            )}
            {globo.plan !== null && (
              <span className="progreso-globo-linea">
                <i style={{ background: colorPlan }} />
                {localeNumber(globo.plan)} {campo === 'steps' ? 'pasos' : 'kcal'} pautadas
              </span>
            )}
          </div>
        )}

        {/* Lo que se toca: UN DISCO POR PUNTO, por encima de todo. Eran franjas
            del alto del dibujo, una por semana, y el globo salía con solo cruzar
            la tarjeta con el ratón: «no quiero que siempre que pases el ratón te
            muestre algo, ha de ser cuando pasas por un punto» (18 sep). El disco
            es más grande que el punto —hasta 28 px, o el ancho de su semana si
            no cabe— para que el dedo lo acierte. Las semanas sin pesaje no
            tienen disco, pero siguen a un toque de flecha: un solo tope de
            tabulador para el grupo, que con veinte semanas veinte tabuladores
            son un peaje para llegar a lo siguiente. */}
        {geo && (
          <div
            className="progreso-toques"
            role="group"
            tabIndex={0}
            aria-label="Semanas del dibujo: usa las flechas para leer cada una"
            onKeyDown={conTeclas}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setActivo(null);
            }}
          >
            {puntos.map((p) => {
              const lado = Math.max(16, Math.min(28, (geo.W - CANAL - MARGEN_D) / semanas.length));
              return (
                <button
                  type="button"
                  tabIndex={-1}
                  key={`toque-${p.i}`}
                  className={`progreso-toque${p.i === activo ? ' is-activo' : ''}`}
                  style={{ left: p.x - lado / 2, top: p.y - lado / 2, width: lado, height: lado }}
                  aria-label={dicho(p.i)}
                  onMouseEnter={() => setActivo(p.i)}
                  onMouseLeave={() => setActivo(null)}
                  onClick={() => setActivo(p.i)}
                />
              );
            })}
          </div>
        )}
        <span className="sr-only" aria-live="polite">
          {activo !== null && semanas[activo] ? dicho(activo) : ''}
        </span>
      </div>

      {/* El eje de semanas: las mismas columnas del dibujo, así que la marca de
          la S8 cae justo bajo su punto. */}
      <div className="progreso-eje" style={columnas} aria-hidden="true">
        {semanas.map((f, i) => (
          <span key={`${f.week}-${i}`} className={`progreso-semana${i === semanas.length - 1 ? ' is-hoy' : ''}`}>
            {/* Una marca de cada `paso` y siempre la última: con treinta semanas,
                treinta rótulos de 20 px en 600 se pisan unos a otros. El hueco
                se queda en blanco y no se recorta la columna, que es lo que
                mantiene cada marca bajo su punto. */}
            {i % paso === 0 || i === semanas.length - 1 ? `S${f.week}` : ''}
          </span>
        ))}
      </div>

      {/*
        ══ LA LEYENDA ═════════════════════════════════════════════════════════
        «No sé qué significa que en pasos y kcals haya líneas marcadas en
        ciertas semanas.» El dibujo tenía cuatro trazos y no decía cuál era
        cuál: se entendía la curva, y lo demás había que adivinarlo. Cada
        entrada sale solo si su trazo está en el dibujo — una leyenda que
        explica lo que no hay es ruido. Y con la curva sola no sale: «● Peso»
        debajo de la única línea del dibujo es decir lo que ya dice el título.
      */}
      {geo && (conPlan || yObjetivo !== null) && (
        <ul className="progreso-leyenda" aria-label="Qué es cada trazo del dibujo">
          <li>
            <i className="is-peso" style={{ background: color }} aria-hidden="true" />
            Peso
          </li>
          {conPlan && (
            <li>
              <i className="is-plan" style={{ background: colorPlan }} aria-hidden="true" />
              {banda === 'steps' ? 'Pasos pautados' : 'Calorías pautadas'}
            </li>
          )}
          {conPlan && geo.peldanos.length > 0 && (
            <li>
              <i className="is-peldano" style={{ background: colorPlan }} aria-hidden="true" />
              {banda === 'steps' ? 'Semana en que cambiaron los pasos' : 'Semana en que cambiaron las calorías'}
            </li>
          )}
          {yObjetivo !== null && (
            <li>
              <i className="is-meta" style={{ borderColor: color }} aria-hidden="true" />
              Objetivo
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
