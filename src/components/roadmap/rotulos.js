/**
 * QUÉ RÓTULO CABE EN UN TRAMO, sin React.
 *
 * ══ Por qué esto es una pieza aparte ═══════════════════════════════════════
 *
 * En el creador, un tramo de plan puede medir 400 px o 22. El rótulo no se
 * puede escribir y confiar en `overflow: hidden`: un «Intensificación» cortado
 * a «Inten…» ocupa lo mismo que la palabra entera y no dice más que una letra,
 * y un rótulo que se sale pisa al del tramo siguiente. Así que se decide ANTES
 * de dibujar: se mide cada versión y se coge la primera que entra.
 *
 * La regla la aprobó el dueño en los bocetos (22 sep 2026): **ningún bloque se
 * queda mudo**. Nombre → abreviatura → una letra. Y la letra de adaptación es
 * «Ad», porque la A se la queda acumulación, que sale mucho más.
 *
 * ── Se mide a ojo, por arriba ──────────────────────────────────────────────
 * `anchoTexto` estima por el número de caracteres. Pasarse deja aire de más;
 * quedarse corto deja dos rótulos pisados. Se prefiere el aire.
 */

import { anchoTexto } from './geometria';

/* Los píxeles por carácter de cada tinta del creador, estimados por arriba.
   Salen de medir Geist: 12 px normal, 12 px a 600 y 11 px a 550. */
export const PX_FASE = 6.6;
export const PX_FASE_FUERTE = 7.2;
export const PX_BLOQUE = 6.2;

/** El relleno lateral de la píldora de un bloque, a los dos lados. */
export const AIRE_BLOQUE = 10;

/**
 * La abreviatura y la letra de cada intención.
 *
 * `descarga` no lleva letra a propósito: en el carril es un trazo fino sin
 * texto, que es como se reconoce (los bocetos, 3.ª vuelta). Si alguna vez
 * hiciera falta su letra, la D está libre.
 */
const POR_INTENCION = {
  adaptacion: { corto: 'Adapt.', letra: 'Ad' },
  acumulacion: { corto: 'Acum.', letra: 'A' },
  intensificacion: { corto: 'Intens.', letra: 'I' },
  descarga: { corto: 'Desc.', letra: null },
  mantenimiento: { corto: 'Mant.', letra: 'M' },
};

/**
 * Lo que se escribe dentro de la píldora de un bloque.
 *
 * @param nombre     el nombre que le puso el entrenador, que manda.
 * @param intent     su intención (`blockTraits().intent`), de donde salen la
 *                   abreviatura y la letra.
 * @param cola       lo que se añade al nombre si cabe entero («· M3 de 5»).
 * @param ancho      los píxeles de la píldora.
 * @returns `{ texto, letra }`; `letra` es true cuando el texto es la inicial y
 *          hay que centrarlo. Los dos pueden salir vacíos: un tramo de 10 px no
 *          admite ni una letra, y entonces manda el globo.
 */
export const etiquetaDelBloque = ({ nombre, intent = null, cola = '', ancho }) => {
  const meta = POR_INTENCION[intent] || null;
  const util = ancho - AIRE_BLOQUE;
  const cabe = (t) => t && anchoTexto(t, PX_BLOQUE) <= util;

  for (const t of [cola ? `${nombre}${cola}` : null, nombre, meta?.corto]) {
    if (cabe(t)) return { texto: t, letra: false };
  }
  /* La letra se centra y no lleva aire: una píldora de 16 px cabe una «A». */
  const letra = meta?.letra || nombre?.trim()?.[0]?.toUpperCase() || null;
  if (letra && anchoTexto(letra, PX_BLOQUE) <= ancho - 2) return { texto: letra, letra: true };
  return { texto: '', letra: false };
};

/**
 * El rótulo de una fase sobre su tramo: lo suyo a la izquierda, la cuenta y el
 * peso de salida a la derecha.
 *
 * Se va cayendo por orden de lo que menos se echa en falta. Lo último que
 * sobrevive son los dos pesos de los extremos —a dónde entra y a dónde sale—,
 * y después el título. Las unidades caen antes que las cifras: «76,0 → 86,5»
 * se entiende sin los «kg» y ocupa un tercio menos.
 *
 * @param pesoEntrada,pesoSalida ya escritos («76,0»), o null si el tramo está
 *                               partido y ese extremo cae en otra tira.
 * @returns `{ izq: [...], der: [...] }` con los trozos que caben, cada uno
 *          `{ texto, tono }`. Tono: 'peso' | 'titulo' | 'flojo'.
 */
export const rotuloDeFase = ({ titulo, ritmo = '', cuenta = '', pesoEntrada = null, pesoSalida = null, ancho }) => {
  const ue = pesoEntrada ? `${pesoEntrada} kg` : null;
  const us = pesoSalida ? `${pesoSalida} kg` : null;
  const opciones = [
    [ue, titulo, ritmo, cuenta, us],
    [ue, titulo, '', cuenta, us],
    [pesoEntrada, titulo, '', cuenta, pesoSalida],
    [pesoEntrada, titulo, '', '', pesoSalida],
    [pesoEntrada, '', '', '', pesoSalida],
    ['', titulo, '', '', ''],
    ['', '', '', '', ''],
  ];

  const mide = ([a, b, c, d, e]) => {
    const izq = [
      [a, PX_FASE],
      [b, PX_FASE_FUERTE],
      [c, PX_FASE],
    ].filter(([t]) => t);
    const der = [
      [d, PX_FASE],
      [e, PX_FASE],
    ].filter(([t]) => t);
    const suma = (l) => l.reduce((n, [t, px]) => n + anchoTexto(t, px), 0);
    /* 6 px entre los trozos de un lado, 14 entre los del otro y 10 en el hueco
       del medio: es lo que deja el `justify-content: space-between`. */
    return (
      suma(izq) +
      6 * Math.max(0, izq.length - 1) +
      suma(der) +
      14 * Math.max(0, der.length - 1) +
      (izq.length && der.length ? 10 : 0)
    );
  };

  const [a, b, c, d, e] = opciones.find((o) => mide(o) <= ancho) || opciones[opciones.length - 1];
  return {
    izq: [
      { texto: a, tono: 'peso' },
      { texto: b, tono: 'titulo' },
      { texto: c, tono: 'flojo' },
    ].filter((x) => x.texto),
    der: [
      { texto: d, tono: 'flojo' },
      { texto: e, tono: 'peso' },
    ].filter((x) => x.texto),
  };
};
