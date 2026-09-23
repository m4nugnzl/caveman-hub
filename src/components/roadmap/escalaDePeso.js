/**
 * EL EJE DE KILOS, EN UN SOLO SITIO.
 *
 * La gráfica de la temporada y las tiras de la portada de Revisiones son el
 * mismo dibujo a distinto zoom, así que no pueden tener dos ejes de peso. Aquí
 * están los DOS MODOS que necesitan, con la misma forma de salida
 * (`{ lo, hi, alto, y }`) para que el trazo no sepa cuál le han dado:
 *
 *   · POR VENTANA (`porVentana`) — un solo rango para todo lo que se ve, con un
 *     8 % de aire y un mínimo de dos kilos. Es el de la línea entera: en la
 *     temporada se compara una fase con otra, y con un rango por fase la misma
 *     pendiente se dibujaría distinta en cada tramo.
 *
 *   · POR FASE (`pxPorKilo` + `porFase`) — cada tira recortada a su fase con
 *     0,35 kg de margen, pero compartiendo los PÍXELES POR KILO con todas las
 *     demás del cliente. Es el de la portada: una fase de cuatro semanas y
 *     medio kilo no puede salir con la misma pinta que una de dieciséis y seis
 *     kilos, y a la vez media semana plana tiene que verse plana en las dos.
 *
 * Se comparte la proporción, no el rango. Los dos modos son legítimos y
 * ninguno manda sobre el otro: quien dibuja elige, y la escala se calcula aquí.
 *
 * Sin React a propósito: son cuentas que se rompen sin que nadie lo vea hasta
 * que dos cifras se pisan o una curva sale aplanada.
 */

/*
  ══ EL EJE NO BAJA DE DOS KILOS ════════════════════════════════════════════
  La misma regla que `GraficaDelProgreso`: dos kilos es el orden de magnitud de
  lo que se decide mirando esta curva. Una semana plana se ve plana.
*/
const RANGO_MINIMO = 2;

/* El aire de la ventana: lo justo para que un extremo no toque el canto. */
const AIRE = 0.08;

export const MARGEN_KG = 0.35;
export const ALTO_MAYOR = 260;
export const PX_POR_KG_MAX = 90;
export const ALTO_MINIMO = 120;

/* El paso de la rejilla: el más fino que deja al menos 28 px entre rayas. */
const PASOS = [0.25, 0.5, 1, 2, 5];
const HUECO_MINIMO = 28;

/** Los pesos que dibuja un tramo: sus pesajes, sus medias y lo esperado. */
export const pesosDe = (semanas) => {
  const vs = [];
  for (const s of semanas) {
    for (const p of s.pesajes || []) vs.push(p.weight);
    vs.push(s.media, s.esperado);
  }
  return vs.filter((v) => Number.isFinite(v));
};

/**
 * MODO VENTANA: un rango para unos valores, con aire y el mínimo de dos kilos
 * repartido a los dos lados. `null` si no hay ni un valor.
 *
 * `paso` es el de las cifras del eje cuando hay alto de sobra; `marcasDe` lo
 * afina a lo que de verdad cabe.
 */
export const porVentana = (valores) => {
  const vs = valores.filter((v) => Number.isFinite(v));
  if (vs.length === 0) return null;
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (hi - lo < RANGO_MINIMO) {
    const centro = (hi + lo) / 2;
    lo = centro - RANGO_MINIMO / 2;
    hi = centro + RANGO_MINIMO / 2;
  }
  const aire = (hi - lo) * AIRE;
  return { lo: lo - aire, hi: hi + aire, paso: hi - lo > 6 ? 2 : 1 };
};

/**
 * MODO FASE, primera mitad: los píxeles por kilo del cliente, los que hacen que
 * la fase con más recorrido ocupe `ALTO_MAYOR`, con un tope.
 *
 * Se calcula UNA VEZ con todas las fases y se le pasa a cada una: es lo que
 * hace que una bajada de medio kilo por semana tenga la misma inclinación en
 * cualquier tira.
 */
export const pxPorKilo = (fases) => {
  let mayor = 0;
  for (const semanas of fases) {
    const vs = pesosDe(semanas);
    if (vs.length) mayor = Math.max(mayor, Math.max(...vs) - Math.min(...vs) + 2 * MARGEN_KG);
  }
  return mayor > 0 ? Math.min(PX_POR_KG_MAX, ALTO_MAYOR / mayor) : PX_POR_KG_MAX;
};

/**
 * MODO FASE, segunda mitad: el rango de una fase con su margen y su alto a la
 * proporción del cliente. Si se queda por debajo del alto mínimo, el rango se
 * abre por los dos lados y la proporción se mantiene. `null` sin ningún peso.
 */
export const porFase = (semanas, ppk) => {
  const vs = pesosDe(semanas);
  if (vs.length === 0) return null;
  let lo = Math.min(...vs) - MARGEN_KG;
  let hi = Math.max(...vs) + MARGEN_KG;
  let alto = (hi - lo) * ppk;
  if (alto < ALTO_MINIMO) {
    const falta = (ALTO_MINIMO / ppk - (hi - lo)) / 2;
    lo -= falta;
    hi += falta;
    alto = ALTO_MINIMO;
  }
  return { lo, hi, alto: Math.round(alto) };
};

/**
 * Le pone a una escala su función `y`: de kilos a píxeles dentro de una caja.
 *
 * @param escala `{ lo, hi }` de cualquiera de los dos modos.
 * @param arriba el píxel del techo de la caja.
 * @param alto   el alto de la caja; por defecto, el que traiga la escala.
 */
export const conY = (escala, arriba = 0, alto = escala?.alto) => {
  if (!escala) return null;
  const h = alto ?? escala.alto ?? 0;
  return { ...escala, alto: h, y: (v) => arriba + ((escala.hi - v) / (escala.hi - escala.lo)) * h };
};

/**
 * Las cifras del eje: el paso más fino que deja `HUECO_MINIMO` píxeles entre
 * dos rayas, y todas las marcas dentro del rango.
 */
export const marcasDe = (escala, alto = escala?.alto, hueco = HUECO_MINIMO) => {
  if (!escala || !alto) return [];
  const ppk = alto / (escala.hi - escala.lo);
  const paso = PASOS.find((p) => p * ppk >= hueco) || PASOS[PASOS.length - 1];
  const marcas = [];
  for (let v = Math.ceil(escala.lo / paso) * paso; v <= escala.hi; v += paso) marcas.push(Math.round(v * 100) / 100);
  return marcas;
};
