import { useId, useMemo, useState } from 'react';

import { metricColor } from '@/domain/metrics';
import { makeScale } from '@/components/ui/charts';
import { Globo, GloboCifra, GloboLinea, GloboNada, sitioDelGlobo } from '@/components/ui/Globo';
import { localeNumber, shortDate } from '@/lib/dates';
import { useElementWidth } from '@/lib/useElementWidth';

/*
  Las medidas del lienzo. El canal de la izquierda es FIJO: con uno que se
  ajustara al texto, dos personas con pesos de distinto número de cifras
  tendrían el dibujo empezando en sitios distintos.
*/
const ALTO = 260;
const CANAL = 44;
const MARGEN_D = 14;
/* Aire arriba y abajo para que ni el primer punto ni el de hoy se coman su
   propio canto, y para que las anotaciones tengan dónde caer. */
const CEJA = 30;
const SUELO = 10;
const TICKS = 4;
/* El tercio de abajo es del FONDO: ahí vive la serie pautada. La curva no
   entra —su suelo es `SUELO`— y por eso las dos pueden compartir lienzo sin
   compartir eje. */
const TECHO_FONDO = ALTO * 0.7;
const SUELO_FONDO = 6;
/* El aire entre un punto y la anotación que habla de él: lo justo para que el
   anillo del punto no toque el canto. */
const SEPARA = 10;
const dentro = (v, min, max) => Math.max(min, Math.min(max, v));
const chocan = (a, b) => Boolean(a && b && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1);

const kg = (v) => localeNumber(v, { maximumFractionDigits: 1 });
/** El cambio con su signo de verdad: «−0,4», «+0,2». */
const signoKg = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${kg(Math.abs(v))}`;
const signoEntero = (v) => `${v > 0 ? '+' : '−'}${localeNumber(Math.abs(v))}`;

/*
  Lo que mide una anotación. Son cajas de HTML con la letra, el interlineado y
  el relleno FIJOS en el CSS, así que se cuentan aquí en vez de medirse en el
  DOM: el reparto de huecos tiene que resolverse en el mismo render que dibuja,
  y una medida que llega un fotograma después es un salto en pantalla.

  El ancho se estima del texto, y se estima POR ARRIBA a propósito: en un
  reparto de huecos, pasarse deja aire de más y quedarse corto deja dos cifras
  pisadas, que es justo lo que esto viene a evitar.
*/
const ALTO_CHAPA = 22;
const ALTO_EXTREMO = 16;
const ALTO_HOY = 50;
const anchoDe = (texto, px, relleno) => Math.round(String(texto).length * px + relleno);

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

/*
  ══ DÓNDE CAE CADA ANOTACIÓN ═══════════════════════════════════════════════

  Una anotación pide sitio con una lista de posiciones EN ORDEN DE GUSTO —al
  lado de su punto, por el lado por el que no pasa la línea, y si ahí no cabe,
  al otro— y se le da la primera que esté libre.

  «Libre» tiene dos durezas. Las cajas ya colocadas son un obstáculo DURO: dos
  cifras una encima de otra no se leen ninguna de las dos. El recorrido de la
  curva es un obstáculo BLANDO: se evita mientras haya alternativa, pero con un
  dibujo lleno siempre hay que apoyarse en alguna parte, y una cifra sobre la
  línea sigue leyéndose.

  Si ninguna posición sirve, la caja se EMPUJA en vertical de seis en seis
  hasta encontrar hueco, y entonces se le ata un hilo a su punto: una cifra
  desplazada sin hilo es una cifra que ya no dice de quién habla.
  Se exporta para poderlo probar sin navegador: el reparto de huecos es pura
  geometría, y es la clase de cuenta que se rompe sin que nadie lo vea hasta
  que dos cifras aparecen una encima de otra en la pantalla de alguien.
*/
export const ALTO_LIENZO = ALTO;
export const colocar = ({ candidatos, alto, duras, curva = null }) => {
  const caja = (c, y0) => ({ x0: c.x0, x1: c.x0 + c.ancho, y0, y1: y0 + alto });
  for (const c of candidatos) {
    const prueba = caja(c, c.y0);
    if (prueba.y0 < 0 || prueba.y1 > ALTO) continue;
    if (duras.some((o) => chocan(prueba, o))) continue;
    if (curva && chocan(prueba, curva(prueba.x0, prueba.x1))) continue;
    return { ...c, caja: prueba };
  }
  for (const c of candidatos) {
    const base = dentro(c.y0, 0, ALTO - alto);
    for (let d = 0; d <= 72; d += 6) {
      for (const s of d === 0 ? [0] : [-d, d]) {
        const y0 = base + s;
        if (y0 < 0 || y0 + alto > ALTO) continue;
        const prueba = caja(c, y0);
        if (!duras.some((o) => chocan(prueba, o))) return { ...c, y0, caja: prueba };
      }
    }
  }
  const c = candidatos[0];
  const y0 = dentro(c.y0, 0, ALTO - alto);
  return { ...c, y0, caja: caja(c, y0) };
};

/*
  El hilo de una anotación a su punto, y SOLO si ha quedado lejos de él.

  El umbral es el doble del aire normal (`SEPARA`) y no un pelo más: una cifra
  a diez píxeles de su punto ya se lee pegada a él, y atarla con una rayita
  sería subrayar lo evidente — que es como un dibujo se llena de líneas que no
  dicen nada. El hilo aparece cuando la caja ha tenido que apartarse de verdad,
  que es cuando deja de estar claro de quién habla.
*/
const hiloA = (caja, ancla) => {
  if (!ancla) return null;
  if (ancla.y >= caja.y0 - 2 && ancla.y <= caja.y1 + 2) return null;
  const y = ancla.y < caja.y0 ? caja.y0 : caja.y1;
  if (Math.abs(y - ancla.y) <= SEPARA * 2) return null;
  return { x1: dentro(ancla.x, caja.x0 + 8, caja.x1 - 8), y1: y, x2: ancla.x, y2: ancla.y };
};

/**
 * LA GRÁFICA DEL PROGRESO — el peso encima de lo que le pusiste, en UN dibujo.
 *
 * ══ Qué tiene que contestar ════════════════════════════════════════════════
 *
 * *«Con la gráfica sola, sin leer ningún número más, tengo que saber si el
 * cliente va en rumbo y en qué fase está.»* Ése es el listón, y de él salen
 * las dos piezas que no son adorno:
 *
 *   · El RUMBO lo dicen cuatro anotaciones ancladas a su punto —de dónde
 *     salió, el techo, dónde está hoy y adónde tiene que llegar— sobre la
 *     curva y su raya de objetivo. Cuatro cifras en todo el dibujo, no una por
 *     punto.
 *   · La FASE la dice una banda suave por detrás, con su nombre encima de
 *     ella. La fase en curso lleva un punto más de tinta: se ve dónde estás
 *     sin tener que contar bloques.
 *
 *              DEFINICIÓN                 │ VOLUMEN
 *     ┌─────────────────────────────────┬─────────────────────────────┐
 *     │  82 ┼ [79,3 kg EMPEZÓ]          ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
 *     │     │   ●─●            MÁX 80,6 ░░░░░░░░░░░░░░ ┌ HOY ──────┐  │
 *     │  80 ┼────●──●──●─ ─(hueco)─ ─ ─░░●──●──────────│ 77,3 kg   │  │
 *     │  78 ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─░░░░░░░ ─ ─ ─ ─ └───●───────┘  │
 *     │     │▁▁▁▁▁▁▁▁▁▁○▔▔▔▔▔▔▔▔▔▔▔▔▔▔░░░░░▁▁▁▁▁▁▁▁ [74,9 kg OBJETIVO]│
 *     └─────────────────────────────────┴─────────────────────────────┘
 *        S1   S2   S3   S4   S5   S6   S7   S8   S9  S10  S11  S12
 *        ╱● Peso   ▁▁ Calorías pautadas · el escalón, cuándo las cambiaste
 *        ┄ Objetivo
 *
 * ══ Dos series, UN solo eje medido ═════════════════════════════════════════
 *
 * La regla —la de la casa y la de cualquier manual— es que un gráfico no tiene
 * dos escalas verticales: con dos ejes, la relación entre las dos curvas la
 * decide quien eligió los topes, no los datos.
 *
 * Aquí no se rompe, porque la serie pautada NO ES UNA MAGNITUD MEDIBLE en este
 * dibujo: no tiene eje, no tiene rótulos y su altura no se puede leer. Es un
 * FONDO —el terreno por el que corre la curva— y lo único que de ella se lee
 * es el ESCALÓN: la semana en que dejó de valer lo de la anterior, que es lo
 * que TÚ hiciste. La cifra exacta la da el globo al pasar por encima, que es
 * donde una cifra exacta se pide.
 *
 * Por eso el fondo es un área al 7 % y no unas columnas: las columnas eran una
 * magnitud —invitaban a medirlas— y además pesaban más que la curva, que es el
 * dato. Un fondo que compite con lo que va encima ha dejado de ser fondo.
 *
 * ── Los huecos se ven ──────────────────────────────────────────────────────
 * Una semana sin pesaje parte la línea, y el tramo que falta se cruza con una
 * raya de puntos apagada. Unir dos pesajes separados por un mes con el mismo
 * trazo que une dos semanas seguidas es afirmar cuatro medidas que nadie tomó.
 *
 * @param semanas  Filas de `useReviewTrack`: `{ week, weekStart, weight, kcals, steps }`.
 * @param banda    Qué se dibuja de fondo: `kcals` o `steps`.
 * @param tramos   `[{ desde, hasta, name, id }]` — las bandas, en índices de
 *                 `semanas`. Las calcula `TarjetaProgreso`: las fases del
 *                 cliente si las tiene, y si no los bloques de su programa.
 * @param objetivo Peso al que tiene que acabar, si lo hay.
 */
export const GraficaDelProgreso = ({
  semanas = [],
  banda = 'kcals',
  tramos = [],
  objetivo = null,
  ariaLabel = 'Su peso, semana a semana, sobre el plan que tenía puesto',
}) => {
  const [ref, ancho] = useElementWidth();
  /* El degradado se nombra por instancia: dos gráficas en la misma página (el
     Resumen y una ventana «a fondo») no pueden compartir `id`. */
  const idArea = `progreso-area-${useId().replace(/:/g, '')}`;
  const color = metricColor('weight');
  const colorPlan = metricColor(banda === 'steps' ? 'steps' : 'kcals');
  const campo = banda === 'steps' ? 'steps' : 'kcals';
  const unidad = campo === 'steps' ? 'pasos' : 'kcal';

  const geo = useMemo(() => {
    const n = semanas.length;
    if (n === 0 || ancho < 220) return null;

    const W = Math.max(280, ancho);
    const util = W - CANAL - MARGEN_D;
    const columna = util / n;
    const x = (i) => CANAL + (i + 0.5) * columna;
    const canto = (i) => CANAL + i * columna;

    /* La escala del peso incluye el OBJETIVO: si no, una meta que todavía queda
       lejos cae fuera del lienzo y su anotación se pinta pegada al canto,
       diciendo una altura que no es la suya. */
    const pesos = semanas.map((f) => f.weight).filter((v) => v !== null && v !== undefined);
    const escala = minimo(
      makeScale(objetivo !== null ? [...pesos, objetivo] : pesos, { padRatio: 0.28 })
    );
    const yPeso = (v) => {
      if (!escala) return ALTO / 2;
      const t = (v - escala.min) / (escala.max - escala.min || 1);
      return ALTO - SUELO - t * (ALTO - SUELO - CEJA);
    };

    /* El peso, por RACHAS de semanas seguidas. Cada racha es un trazo con su
       degradado; entre dos rachas queda el hueco, que se cruza aparte. */
    const rachas = [];
    let abierta = null;
    semanas.forEach((f, i) => {
      if (f.weight === null || f.weight === undefined) {
        abierta = null;
        return;
      }
      const p = { i, x: x(i), y: yPeso(f.weight), v: f.weight };
      if (abierta) abierta.push(p);
      else {
        abierta = [p];
        rachas.push(abierta);
      }
    });
    const puntos = rachas.flat();
    const trazos = rachas
      .filter((r) => r.length > 1)
      .map((r) => ({
        key: r[0].i,
        linea: r.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
        /* El relleno de debajo de la curva: el mismo trazo cerrado contra el
           suelo del lienzo, con un degradado que se apaga hacia abajo. */
        area: `M${r[0].x.toFixed(1)},${ALTO} ${r
          .map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
          .join(' ')} L${r[r.length - 1].x.toFixed(1)},${ALTO} Z`,
      }));
    const saltos = rachas.slice(1).map((r, k) => {
      const previa = rachas[k];
      const a = previa[previa.length - 1];
      const b = r[0];
      return { key: `${a.i}-${b.i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    });

    /*
      ══ EL FONDO, Y CUÁNDO NO SE DIBUJA ═════════════════════════════════════
      Un plan que no se ha tocado en diez semanas sale como una raya recta, y
      eso ya está juzgado en esta casa: *«una serie que no se mueve, que en una
      gráfica no es un dato, es un adorno»*. Con menos de dos valores distintos
      no hay escalón que enseñar y el dibujo se queda con la curva, que es lo
      único que ahí cambia. El conmutador de la barra sigue estando: es por
      dónde se mira, no qué hay.
    */
    const planes = semanas.map((f) => f[campo]).filter((v) => v !== null && v !== undefined);
    const hayEscalon = new Set(planes).size > 1;
    /* Un margen corto (0,45) y no el 0,9 de antes: con el fondo bajado al
       tercio inferior, un margen grande aplasta el escalón hasta hacerlo
       invisible, que es exactamente lo único que el fondo viene a enseñar. */
    const escalaPlan = hayEscalon ? makeScale(planes, { padRatio: 0.45 }) : null;
    const yPlan = (v) => {
      if (!escalaPlan) return ALTO - SUELO_FONDO;
      const t = (v - escalaPlan.min) / (escalaPlan.max - escalaPlan.min || 1);
      return ALTO - SUELO_FONDO - t * (ALTO - SUELO_FONDO - TECHO_FONDO);
    };
    /* Los escalones salen de la propia serie y no de `fila.changed`: ese campo
       lo pone `nutritionTrack` y solo sabe de calorías, así que al pasar a los
       pasos marcaría los peldaños equivocados. */
    const gradas = [];
    let corrida = null;
    let previo = null;
    semanas.forEach((f, i) => {
      const v = f[campo];
      if (v === null || v === undefined) {
        corrida = null;
        previo = null;
        return;
      }
      const g = { i, x0: canto(i), x1: canto(i + 1), y: yPlan(v), v, previo };
      if (corrida) corrida.push(g);
      else {
        corrida = [g];
        gradas.push(corrida);
      }
      previo = v;
    });
    const fondo = !hayEscalon
      ? []
      : gradas.map((c) => ({
          key: c[0].i,
          area: `M${c[0].x0.toFixed(1)},${ALTO} ${c
            .map((g) => `L${g.x0.toFixed(1)},${g.y.toFixed(1)} L${g.x1.toFixed(1)},${g.y.toFixed(1)}`)
            .join(' ')} L${c[c.length - 1].x1.toFixed(1)},${ALTO} Z`,
          borde: c
            .map(
              (g, k) =>
                `${k === 0 ? 'M' : 'L'}${g.x0.toFixed(1)},${g.y.toFixed(1)} L${g.x1.toFixed(1)},${g.y.toFixed(1)}`
            )
            .join(' '),
        }));
    const peldanos = !hayEscalon
      ? []
      : gradas.flat().filter((g) => g.previo !== null && g.previo !== undefined && g.v !== g.previo);

    const rejilla = escala
      ? Array.from({ length: TICKS }, (_, k) => {
          const v = escala.max - ((escala.max - escala.min) * k) / (TICKS - 1);
          return { v, y: yPeso(v) };
        })
      : [];

    /*
      ══ LAS BANDAS DE FASE ══════════════════════════════════════════════════
      Era una raya vertical dura con un rótulo flotando al lado. Una raya dice
      «aquí pasó algo», no QUÉ hay a cada lado, y encima competía con la raya
      de puntos del objetivo: dos líneas verticales de distinto idioma en el
      mismo dibujo.

      Ahora cada tramo es una BANDA del alto del lienzo que ocupa exactamente
      sus semanas, en gris de fondo y alternando, así que el canto se ve sin
      ninguna línea; y el nombre va ENCIMA de su banda, con su mismo tinte, no
      suelto al lado. La banda en curso sube un escalón de gris pase lo que
      pase con la alternancia: es la que se está juzgando, y es la mitad de la
      pregunta que esta gráfica tiene que contestar de un vistazo.
    */
    const bandas = tramos
      .filter((t) => t && t.desde >= 0 && t.hasta >= t.desde && t.hasta < n)
      .map((t, k, lista) => ({
        ...t,
        key: t.id ?? `${t.desde}-${t.hasta}`,
        x0: canto(t.desde),
        x1: canto(t.hasta + 1),
        actual: k === lista.length - 1,
        tinte:
          k === lista.length - 1 ? 'var(--fill)' : k % 2 === 1 ? 'var(--fill-subtle)' : 'transparent',
      }));

    /* El recorrido de la curva dentro de un tramo de anchura: es el obstáculo
       blando de las anotaciones. Se mira punto a punto y en los cruces de cada
       segmento con los dos cantos, que es por donde la línea entra y sale. */
    const recorrido = (x0, x1) => {
      let arriba = Infinity;
      let abajo = -Infinity;
      for (const r of rachas) {
        r.forEach((p, k) => {
          if (p.x >= x0 && p.x <= x1) {
            arriba = Math.min(arriba, p.y);
            abajo = Math.max(abajo, p.y);
          }
          const q = r[k + 1];
          if (!q || q.x === p.x) return;
          for (const xc of [x0, x1]) {
            if ((p.x - xc) * (q.x - xc) > 0) continue;
            const y = p.y + ((xc - p.x) / (q.x - p.x)) * (q.y - p.y);
            arriba = Math.min(arriba, y);
            abajo = Math.max(abajo, y);
          }
        });
      }
      return arriba === Infinity ? null : { x0, x1, y0: arriba - 7, y1: abajo + 7 };
    };

    return {
      W,
      x,
      canto,
      columna,
      yPeso,
      puntos,
      trazos,
      saltos,
      fondo,
      peldanos,
      bandas,
      rejilla,
      recorrido,
    };
  }, [semanas, ancho, campo, tramos, objetivo]);

  /* En su propio `useMemo` y no `geo?.puntos || []`: el array vacío del día
     que no hay dibujo sería nuevo en cada render, y con él se recalcularían
     los extremos y el reparto de las anotaciones sin que nada haya cambiado. */
  const puntos = useMemo(() => geo?.puntos || [], [geo]);
  const ultimo = puntos.length > 0 ? puntos[puntos.length - 1] : null;
  const primero = puntos.length > 1 ? puntos[0] : null;
  const yObjetivo = objetivo !== null && geo ? geo.yPeso(objetivo) : null;
  /* El último pesaje puede no ser el de esta semana: quien todavía no se ha
     pesado tiene la última fila vacía, y entonces la anotación no puede decir
     «hoy» — dice de cuándo es. */
  const alDia = Boolean(ultimo && ultimo.i === semanas.length - 1);

  /*
    ══ EL MÁXIMO Y EL MÍNIMO ═══════════════════════════════════════════════
    Dos puntos con su anillo y su rótulo pequeño —«MÁX 80,6»— por el lado por
    donde no pasa la línea. Si el extremo es el primer punto o el último, su
    anotación ya dice la cifra: allí solo se le añade la palabra, para no poner
    dos rótulos al mismo punto. Con menos de tres pesajes, o todos iguales, no
    hay extremos que contar.
  */
  const extremos = useMemo(() => {
    if (puntos.length < 3) return null;
    let max = puntos[0];
    let min = puntos[0];
    for (const p of puntos) {
      if (p.v > max.v) max = p;
      if (p.v < min.v) min = p;
    }
    return max.v === min.v ? null : { max, min };
  }, [puntos]);

  /*
    ══ LAS ANOTACIONES, POR ORDEN DE PRIORIDAD ═════════════════════════════

    HOY manda: es la cifra que se viene a buscar. Detrás el OBJETIVO —lo único
    del dibujo que aún no ha pasado—, después el MÁXIMO y el MÍNIMO, y la
    última EMPEZÓ, que es contexto y no noticia. El orden importa porque el que
    llega primero se queda el hueco bueno y el siguiente se aparta.
  */
  const notas = useMemo(() => {
    if (!geo || !ultimo) return { lista: [], hilos: [] };
    const duras = [];
    const lista = [];
    const hilos = [];
    const mete = (nota, ancla) => {
      duras.push(nota.caja);
      lista.push(nota);
      const hilo = hiloA(nota.caja, ancla);
      if (hilo) hilos.push({ ...hilo, key: nota.key });
    };

    /* ── 1. HOY ── */
    const marcaHoy = [
      alDia ? 'Hoy' : `S${semanas[ultimo.i].week}`,
      extremos && ultimo === extremos.max ? 'Máx' : null,
      extremos && ultimo === extremos.min ? 'Mín' : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const cifraHoy = kg(ultimo.v);
    const anchoHoy = Math.max(78, anchoDe(marcaHoy, 6.1, 24), anchoDe(`${cifraHoy} kg`, 11, 24));
    /* Pegada a su punto por la derecha si cabe; si no, encima o debajo con el
       canto derecho un pelo pasado el punto, que es por donde baja el hilo. */
    const xJunto = dentro(ultimo.x + SEPARA, CANAL, geo.W - anchoHoy - 2);
    const xSobre = dentro(ultimo.x - anchoHoy + 22, CANAL, geo.W - anchoHoy - 2);
    mete(
      {
        ...colocar({
          candidatos: [
            ...(ultimo.x + SEPARA + anchoHoy <= geo.W
              ? [
                  {
                    x0: xJunto,
                    y0: dentro(ultimo.y - ALTO_HOY / 2, 0, ALTO - ALTO_HOY),
                    ancho: anchoHoy,
                  },
                ]
              : []),
            { x0: xSobre, y0: ultimo.y - SEPARA - ALTO_HOY, ancho: anchoHoy },
            { x0: xSobre, y0: 0, ancho: anchoHoy },
            { x0: xSobre, y0: ultimo.y + SEPARA, ancho: anchoHoy },
          ],
          alto: ALTO_HOY,
          duras,
          curva: geo.recorrido,
        }),
        key: 'hoy',
        tipo: 'hoy',
        marca: marcaHoy,
        cifra: cifraHoy,
      },
      ultimo
    );

    /* ── 2. EL OBJETIVO, al extremo de su propia raya ── */
    if (yObjetivo !== null) {
      const texto = `${kg(objetivo)} kg`;
      const anchoMeta = anchoDe(`${texto} objetivo`, 6.2, 24);
      const derecha = dentro(geo.W - MARGEN_D - anchoMeta, CANAL, geo.W - anchoMeta);
      const izquierda = CANAL + 4;
      mete(
        {
          ...colocar({
            candidatos: [
              { x0: derecha, y0: yObjetivo - 6 - ALTO_CHAPA, ancho: anchoMeta },
              { x0: derecha, y0: yObjetivo + 6, ancho: anchoMeta },
              { x0: izquierda, y0: yObjetivo - 6 - ALTO_CHAPA, ancho: anchoMeta },
              { x0: izquierda, y0: yObjetivo + 6, ancho: anchoMeta },
            ],
            alto: ALTO_CHAPA,
            duras,
            curva: geo.recorrido,
          }),
          key: 'meta',
          tipo: 'meta',
          texto,
          rotulo: 'objetivo',
        },
        null
      );
    }

    /* ── 3 y 4. EL MÁXIMO Y EL MÍNIMO, por el lado libre ── */
    if (extremos) {
      for (const e of [
        { p: extremos.max, k: 'máx', arriba: true },
        { p: extremos.min, k: 'mín', arriba: false },
      ]) {
        /* Si el extremo es el primer punto o el de hoy, su cifra ya la dice
           aquella anotación: allí solo se le añade la palabra. */
        if (e.p === primero || e.p === ultimo) continue;
        const texto = kg(e.p.v);
        const anchoExtremo = anchoDe(`${e.k} ${texto}`, 6.4, 12);
        const centro = dentro(e.p.x - anchoExtremo / 2, CANAL, geo.W - anchoExtremo - 2);
        const encima = e.p.y - SEPARA - ALTO_EXTREMO;
        const debajo = e.p.y + SEPARA;
        const lados = e.arriba
          ? [
              { x0: centro, y0: encima, ancho: anchoExtremo },
              { x0: centro, y0: debajo, ancho: anchoExtremo },
            ]
          : [
              { x0: centro, y0: debajo, ancho: anchoExtremo },
              { x0: centro, y0: encima, ancho: anchoExtremo },
            ];
        mete(
          { ...colocar({ candidatos: lados, alto: ALTO_EXTREMO, duras }), key: e.k, tipo: 'extremo', texto, rotulo: e.k },
          e.p
        );
      }
    }

    /* ── 5. EMPEZÓ, colgado del primer punto ── */
    if (primero) {
      const texto = `${kg(primero.v)} kg`;
      const rotulo = [
        'empezó',
        extremos && primero === extremos.max ? '· máx' : null,
        extremos && primero === extremos.min ? '· mín' : null,
      ]
        .filter(Boolean)
        .join(' ');
      const anchoEmpezo = anchoDe(`${texto} ${rotulo}`, 6.2, 24);
      const x0 = dentro(primero.x - 8, CANAL, geo.W - anchoEmpezo - 2);
      /* Por el lado por el que NO se va la línea: si el peso baja desde aquí,
         la anotación va encima. */
      const baja = puntos[1] && puntos[1].y >= primero.y;
      const encima = primero.y - SEPARA - ALTO_CHAPA;
      const debajo = primero.y + SEPARA;
      const lados = baja
        ? [
            { x0, y0: encima, ancho: anchoEmpezo },
            { x0, y0: debajo, ancho: anchoEmpezo },
          ]
        : [
            { x0, y0: debajo, ancho: anchoEmpezo },
            { x0, y0: encima, ancho: anchoEmpezo },
          ];
      mete(
        {
          ...colocar({ candidatos: lados, alto: ALTO_CHAPA, duras, curva: geo.recorrido }),
          key: 'empezo',
          tipo: 'chapa',
          texto,
          rotulo,
        },
        primero
      );
    }

    return { lista, hilos };
  }, [geo, puntos, ultimo, primero, extremos, yObjetivo, objetivo, semanas, alDia]);

  /*
    ══ UN SOLO GLOBO, AL RECORRER LA SERIE ═════════════════════════════════
    Al pasar por un punto —o al llegar con las flechas— se marca su guía
    vertical, el punto crece y sale UN globo con todo lo de esa semana: el
    peso, cuánto cambió desde el pesaje anterior, lo que tenía pautado, si esa
    semana se lo cambiaste y a cuánto está del objetivo. Un globo por serie
    serían dos cajas diciendo cada una media semana, y habría que mirar a dos
    sitios para cruzar lo único que hay que cruzar.

    Es una lectura, no un mando: no lleva a ningún sitio ni cambia nada.
  */
  const [activo, setActivo] = useState(null);
  const globo = (() => {
    if (!geo || activo === null || !semanas[activo]) return null;
    const fila = semanas[activo];
    const punto = puntos.find((p) => p.i === activo) || null;
    const anterior = [...puntos].reverse().find((p) => p.i < activo) || null;
    const x = geo.x(activo);
    const y = punto ? punto.y : ALTO / 2;
    return {
      fila,
      punto,
      anterior,
      x,
      ...sitioDelGlobo({ x, y, W: geo.W, H: ALTO }),
      plan: fila[campo] ?? null,
      peldano: geo.peldanos.find((g) => g.i === activo) || null,
      marca:
        [
          punto && punto === ultimo && alDia ? 'Hoy' : null,
          extremos && punto
            ? punto === extremos.max
              ? 'Máximo'
              : punto === extremos.min
                ? 'Mínimo'
                : null
            : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
    };
  })();

  const dicho = (i) => {
    const f = semanas[i];
    const p = puntos.find((q) => q.i === i);
    const plan = f[campo];
    const peldano = geo?.peldanos.find((g) => g.i === i) || null;
    return [
      `Semana ${f.week}`,
      p ? `${kg(p.v)} kg` : 'sin pesaje',
      plan !== null && plan !== undefined ? `${localeNumber(plan)} ${unidad} pautadas` : null,
      peldano ? `esa semana cambiaron, ${signoEntero(peldano.v - peldano.previo)} ${unidad}` : null,
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

  /* Cuántas marcas caben en el eje: una columna de 26 px no aguanta «S12». */
  const paso = Math.max(
    1,
    Math.ceil(semanas.length / Math.max(1, Math.floor((ancho - CANAL - MARGEN_D) / 42)))
  );

  /* Las columnas de la cinta de fases y del eje de semanas: las mismas del
     dibujo, así que cada rótulo empieza justo donde empieza su banda. */
  const columnas = {
    gridTemplateColumns: `repeat(${semanas.length}, minmax(0, 1fr))`,
    marginLeft: geo ? CANAL : 0,
    marginRight: geo ? MARGEN_D : 0,
  };
  const conFondo = Boolean(geo && geo.fondo.length > 0);

  return (
    <div className="progreso-grafica" ref={ref}>
      {/* El nombre de cada fase, encima de su banda y con su mismo tinte: el
          rótulo y la banda son un solo objeto, no una etiqueta flotando. */}
      {geo && geo.bandas.length > 0 && (
        <div className="progreso-fases" style={columnas}>
          {geo.bandas.map((b) => (
            <span
              key={b.key}
              className={`progreso-fase${b.actual ? ' is-actual' : ''}`}
              style={{ gridColumn: `${b.desde + 1} / ${b.hasta + 2}`, background: b.tinte }}
              title={`${b.name}: semanas ${semanas[b.desde].week} a ${semanas[b.hasta].week}`}
            >
              {b.name}
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
            <defs>
              <linearGradient id={idArea} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Las bandas de fase, lo primero de todo: son el papel. */}
            <g>
              {geo.bandas.map((b) => (
                <rect key={`b-${b.key}`} x={b.x0} y="0" width={b.x1 - b.x0} height={ALTO} fill={b.tinte} />
              ))}
            </g>

            <g className="progreso-rejilla">
              {geo.rejilla.map((t) => (
                <line key={`g-${t.v}`} x1={CANAL} x2={geo.W - MARGEN_D} y1={t.y} y2={t.y} />
              ))}
            </g>

            {/* La serie pautada, a fondo real: área al 7 %, su canto de arriba a
                media luz y un punto hueco en cada escalón. */}
            <g>
              {geo.fondo.map((c) => (
                <path key={`f-${c.key}`} className="progreso-fondo" d={c.area} fill={colorPlan} />
              ))}
              {geo.fondo.map((c) => (
                <path
                  key={`fb-${c.key}`}
                  className="progreso-fondo-borde"
                  d={c.borde}
                  fill="none"
                  stroke={colorPlan}
                />
              ))}
              {geo.peldanos.map((g) => (
                <circle key={`pe-${g.i}`} className="progreso-peldano" cx={g.x0} cy={g.y} r="3" stroke={colorPlan} />
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

            {globo && <line className="progreso-guia" x1={globo.x} x2={globo.x} y1="0" y2={ALTO} />}

            {/* El peso: puntos UNIDOS y no curva suavizada. Un peso son medidas
                tomadas los días que esa persona se subió a la báscula, no una
                función continua. */}
            {geo.trazos.map((t) => (
              <path key={`a-${t.key}`} className="progreso-area" d={t.area} fill={`url(#${idArea})`} />
            ))}
            {geo.saltos.map((s) => (
              <line
                key={`s-${s.key}`}
                className="progreso-salto"
                x1={s.x1}
                y1={s.y1}
                x2={s.x2}
                y2={s.y2}
                stroke={color}
              />
            ))}
            {geo.trazos.map((t) => (
              <polyline key={`t-${t.key}`} className="progreso-trazo" points={t.linea} fill="none" stroke={color} />
            ))}
            {puntos.map((p) => {
              const extremo = Boolean(extremos && (p === extremos.max || p === extremos.min));
              const clase = [
                'progreso-punto',
                p === ultimo && 'is-hoy',
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
                  r={p.i === activo ? 6 : p === ultimo ? 5 : extremo ? 4.5 : 3.25}
                  fill={color}
                />
              );
            })}

            {/* El hilo de una anotación que ha tenido que apartarse. */}
            <g className="progreso-hilos" stroke={color}>
              {notas.hilos.map((h) => (
                <line key={`h-${h.key}`} x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2} />
              ))}
            </g>

            <g className="progreso-eje-y">
              {geo.rejilla.map((t) => (
                <text key={`ty-${t.v}`} x={CANAL - 10} y={t.y} textAnchor="end" dominantBaseline="middle">
                  {kg(t.v)}
                </text>
              ))}
            </g>
          </svg>
        )}

        {/* Las anotaciones van fuera del SVG a propósito: son cajas de texto con
            su relleno y su canto, y dentro del dibujo habría que componerlas a
            mano con `rect` y `text` sin saber lo que mide la letra. Se apagan
            mientras se lee el globo: una cosa cada vez. */}
        {geo && notas.lista.length > 0 && (
          <div className={`progreso-notas${activo !== null ? ' is-apagado' : ''}`} aria-hidden="true">
            {notas.lista.map((nota) =>
              nota.tipo === 'hoy' ? (
                <span key={nota.key} className="progreso-hoy" style={{ left: nota.caja.x0, top: nota.caja.y0 }}>
                  <em>{nota.marca}</em>
                  <b style={{ color }}>
                    {nota.cifra}
                    <small> kg</small>
                  </b>
                </span>
              ) : nota.tipo === 'extremo' ? (
                <span key={nota.key} className="progreso-extremo" style={{ left: nota.caja.x0, top: nota.caja.y0 }}>
                  <em>{nota.rotulo}</em> {nota.texto}
                </span>
              ) : (
                <span
                  key={nota.key}
                  className={`progreso-chapa${nota.tipo === 'meta' ? ' is-meta' : ''}`}
                  style={{
                    left: nota.caja.x0,
                    top: nota.caja.y0,
                    ...(nota.tipo === 'meta' ? { color, borderColor: color } : null),
                  }}
                >
                  {nota.texto} <em>{nota.rotulo}</em>
                </span>
              )
            )}
          </div>
        )}

        {globo && (
          <Globo
            left={globo.left}
            top={globo.top}
            marca={globo.marca}
            cab={`S${globo.fila.week}${globo.fila.weekStart ? ` · ${shortDate(globo.fila.weekStart)}` : ''}`}
          >
            {globo.punto ? (
              <GloboCifra color={color} unidad="kg">
                {kg(globo.punto.v)}
              </GloboCifra>
            ) : (
              <GloboNada>Sin pesaje esa semana</GloboNada>
            )}
            {globo.punto && globo.anterior && (
              <GloboLinea>
                {signoKg(globo.punto.v - globo.anterior.v)} kg desde S{semanas[globo.anterior.i].week}
              </GloboLinea>
            )}
            {globo.plan !== null && (
              <GloboLinea muestra="fondo" color={colorPlan}>
                {localeNumber(globo.plan)} {unidad} pautadas
              </GloboLinea>
            )}
            {/* Si esa semana se lo cambiaste, el escalón con su cifra: es la
                decisión contra la que se está leyendo la curva. */}
            {globo.peldano && (
              <GloboLinea muestra="escalon" color={colorPlan}>
                {signoEntero(globo.peldano.v - globo.peldano.previo)} {unidad} esa semana
              </GloboLinea>
            )}
            {globo.punto && objetivo !== null && (
              <GloboLinea muestra="meta" color={color}>
                Objetivo {kg(objetivo)} kg
                {Math.abs(globo.punto.v - objetivo) >= 0.05
                  ? ` · a ${kg(Math.abs(globo.punto.v - objetivo))} kg`
                  : ' · clavado'}
              </GloboLinea>
            )}
          </Globo>
        )}

        {/* Lo que se toca: UN DISCO POR PUNTO, por encima de todo. El globo no
            sale con solo cruzar la tarjeta con el ratón: «no quiero que siempre
            que pases el ratón te muestre algo, ha de ser cuando pasas por un
            punto». El disco es más grande que el punto —hasta 28 px, o el ancho
            de su semana si no cabe— para que el dedo lo acierte. Las semanas sin
            pesaje no tienen disco, pero siguen a un toque de flecha: un solo
            tope de tabulador para el grupo, que con veinte semanas veinte
            tabuladores son un peaje para llegar a lo siguiente. */}
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
          <span
            key={`${f.week}-${i}`}
            className={`progreso-semana${i === semanas.length - 1 ? ' is-hoy' : ''}`}
          >
            {/* Una marca de cada `paso` y siempre la última: con treinta semanas,
                treinta rótulos de 20 px en 600 se pisan unos a otros. El hueco se
                queda en blanco y no se recorta la columna, que es lo que mantiene
                cada marca bajo su punto. */}
            {i % paso === 0 || i === semanas.length - 1 ? `S${f.week}` : ''}
          </span>
        ))}
      </div>

      {/*
        ══ LA LEYENDA, DIBUJADA CON EL MISMO PINCEL ════════════════════════════
        Eran cuatro entradas con cuatro idiomas: un punto, una raya gruesa, un
        círculo hueco y una línea de puntos, y ninguno era el trazo que decía
        explicar. Ahora cada muestra es un SVG diminuto que usa LAS MISMAS
        CLASES que el dibujo —`progreso-trazo`, `progreso-fondo`,
        `progreso-meta`—, así que no puede desincronizarse: si cambia el grosor
        de la curva, cambia el de su muestra.

        Y son tres y no cuatro: el escalón dejó de ser una entrada suelta y pasó
        a estar DENTRO de la muestra de la serie pautada, que es donde vive.
        Cada entrada sale solo si su trazo está en el dibujo — una leyenda que
        explica lo que no hay es ruido. Con la curva sola no hay leyenda:
        «Peso» debajo de la única línea del dibujo es decir lo que ya dice el
        título.
      */}
      {geo && (conFondo || yObjetivo !== null) && (
        <ul className="progreso-leyenda" aria-label="Qué es cada trazo del dibujo">
          <li>
            <svg className="progreso-muestra" viewBox="0 0 24 12" aria-hidden="true">
              <polyline className="progreso-trazo" points="2,9 9,4 16,6 22,2" fill="none" stroke={color} />
              <circle className="progreso-punto" cx="9" cy="4" r="2.75" fill={color} />
            </svg>
            Peso
          </li>
          {conFondo && (
            <li>
              <svg className="progreso-muestra" viewBox="0 0 24 12" aria-hidden="true">
                <path className="progreso-fondo" d="M2,12 L2,8 L12,8 L12,4 L22,4 L22,12 Z" fill={colorPlan} />
                <path className="progreso-fondo-borde" d="M2,8 L12,8 L12,4 L22,4" fill="none" stroke={colorPlan} />
                <circle className="progreso-peldano" cx="12" cy="4" r="2.5" stroke={colorPlan} />
              </svg>
              {banda === 'steps' ? 'Pasos pautados' : 'Calorías pautadas'}
              {geo.peldanos.length > 0 && (
                <em> · el escalón, la semana en que {banda === 'steps' ? 'los' : 'las'} cambiaste</em>
              )}
            </li>
          )}
          {yObjetivo !== null && (
            <li>
              <svg className="progreso-muestra" viewBox="0 0 24 12" aria-hidden="true">
                <line className="progreso-meta" x1="2" y1="6" x2="22" y2="6" stroke={color} />
              </svg>
              Objetivo
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
