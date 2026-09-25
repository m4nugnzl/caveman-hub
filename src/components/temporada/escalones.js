import { kindMeta } from '@/domain/calendar';
import { intervencionesEntre, kcalsDeIntervencion } from '@/domain/pautaDelDia';
import { addDays, weekStart } from '@/lib/dates';
import { anchoTexto } from './escalaDeTiempo';
import { entero } from './lectura';
import { tintaDeIntervencion } from './series';

/**
 * LOS ESCALONES DE LA LÍNEA DE TIEMPO: kcal y pasos (24 sep 2026).
 *
 * ══ Un área continua ══════════════════════════════════════════════════════
 *
 * Lo pautado es un área en escalón: una línea de borde con un relleno suave
 * debajo, sin huecos entre días ni semanas. Cada cambio de pauta es un
 * escalón; el refeed, un pico dentro de la misma área y en su tinta. El
 * número va en cada escalón, pegado a la línea, a la izquierda del tramo que
 * empieza: nunca «2.450 2.450 2.450».
 *
 * El zoom cambia la granularidad, no solo el tamaño:
 *   · Temporada: un escalón por semana, a su media.
 *   · Rango y Semana: un escalón por día.
 *
 * La escala vertical es UNA para todo el carril y toda la temporada (no salta
 * al desplazarse) y no empieza en cero: empieza lo bastante abajo para que el
 * tramo más bajo se vea y lo bastante cerca para que 2.600 y 2.900 no
 * parezcan iguales. Un refeed de 3.570 es claramente más alto.
 */

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

/* Los signos estrechos (comas, puntos, espacios) ocupan la mitad que una
   cifra: contarlos enteros dejaba sin escribir números que sí cabían. */
const LETRA = 6.2;
const ESTRECHOS = /[\s,.·:;'′×\-−–+/]/g;
/** Si un texto de la gráfica cabe en un ancho, estimado por arriba. */
export const cabeEn = (texto, ancho) => {
  const estrechos = (String(texto).match(ESTRECHOS) || []).length;
  return anchoTexto(texto, LETRA) - anchoTexto(' '.repeat(estrechos), LETRA * 0.5) <= ancho;
};

/**
 * La escala vertical de un carril: `{ base, tope, fraccion(v) }`, con la
 * fracción de 0 a 1 de la altura útil. `null` sin valores.
 */
export const escalaVertical = (valores) => {
  const vs = valores.filter(esNumero);
  if (vs.length === 0) return null;
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  /* La base, por debajo de la más baja: lo que separa la más baja de la más
     alta, o un 15 % de la más baja si todas piden lo mismo. */
  const base = Math.max(0, lo - Math.max((hi - lo) * 0.8, lo * 0.15));
  const tramo = hi - base || 1;
  return { base, tope: hi, fraccion: (v) => (esNumero(v) ? Math.max(0.04, Math.min(1, (v - base) / tramo)) : 0) };
};

/** Lo que vale más días en una semana; a igualdad, lo que menos pide. */
export const valorBase = (tipos, clave) => {
  const cuenta = new Map();
  for (const t of tipos) if (esNumero(t[clave])) cuenta.set(t[clave], (cuenta.get(t[clave]) || 0) + (t.dias ?? 1));
  let mejor = null;
  for (const [v, n] of cuenta) if (mejor === null || n > mejor.n || (n === mejor.n && v < mejor.v)) mejor = { v, n };
  return mejor?.v ?? null;
};

/** Las semanas con pauta: hasta la que corre (lo que viene no se proyecta). */
const conPauta = (semanas, hoy) => {
  const lunesDeHoy = weekStart(hoy);
  return semanas.filter((s) => s.lunes <= lunesDeHoy && s.pauta);
};

/**
 * UN TRAMO POR SEMANA: la media de lo pautado. Con los refeeds y diet
 * breaks de la semana como marca: su cifra más alta (solo las kcal).
 *
 * @returns `[{ clave, desde, hasta, valor, media, marca, eventos }]`.
 */
export const tramosDeSemanas = ({ semanas, clave, hoy, intervenciones = [] }) =>
  conPauta(semanas, hoy).flatMap((s) => {
    const valor = s.pauta[clave];
    if (!esNumero(valor)) return [];
    const eventos = intervenciones.length ? intervencionesEntre(intervenciones, s.lunes, s.domingo) : [];
    const cifras = eventos.flatMap(kcalsDeIntervencion);
    return [
      {
        clave: s.lunes,
        desde: s.lunes,
        hasta: s.domingo,
        valor,
        media: Boolean(s.pauta.soloMedia),
        marca: eventos.length ? { valor: cifras.length ? Math.max(...cifras) : null, color: tintaDeIntervencion(eventos[0]) } : null,
        eventos: eventos.length ? eventos : null,
      },
    ];
  });

/**
 * UN TRAMO POR DÍA: lo pautado ese día. El día de un refeed, con su tinta.
 * Los días de las semanas que solo guardan la media van como media (`≈`).
 *
 * @param dias `pautaDeLosDias` de las semanas que se ven, seguidos.
 * @returns `[{ clave, desde, hasta, valor, tipo, media, futuro, color, eventos, dia }]`.
 */
export const tramosDeDias = ({ dias, clave, hoy }) =>
  dias
    .filter((d) => esNumero(d[clave]))
    .map((d) => {
      /* Un refeed cambia la comida, no los pasos. */
      const intervencion = clave === 'kcals' ? d.intervencion : null;
      return {
        clave: d.fecha,
        desde: d.fecha,
        hasta: d.fecha,
        valor: d[clave],
        tipo: intervencion ? kindMeta(intervencion.kind).label : d.tipo,
        media: !d.exacto,
        futuro: d.fecha > hoy,
        color: intervencion ? tintaDeIntervencion(intervencion) : null,
        eventos: intervencion ? [intervencion] : null,
        dia: d,
      };
    });

/**
 * EL NÚMERO DE CADA SEMANA: el valor base («2.450», «2.450 + refeed»); con
 * tipos de día que piden distinto en pasos, el tramo («9.000–12.000»). Con
 * solo la media guardada, «≈ 2.900».
 *
 * @returns `[{ clave, desde, hasta, valor, opciones, firma, eventos }]`: `opciones`,
 *   de la más larga a la más corta.
 */
export const numerosDeSemanas = ({ semanas, clave, hoy, tiposDe, intervenciones = [] }) =>
  conPauta(semanas, hoy).flatMap((s) => {
    const tipos = s.pauta.soloMedia ? [] : tiposDe(s.lunes).filter((t) => esNumero(t[clave]));
    const media = tipos.length === 0;
    const valores = [...new Set(tipos.map((t) => t[clave]))].sort((a, b) => a - b);
    const eventos = intervenciones.length ? intervencionesEntre(intervenciones, s.lunes, s.domingo) : [];
    let cifra;
    if (media) {
      if (!esNumero(s.pauta[clave])) return [];
      cifra = `≈ ${entero(s.pauta[clave])}`;
    } else if (clave === 'steps' && valores.length > 1) {
      cifra = `${entero(valores[0])}–${entero(valores[valores.length - 1])}`;
    } else {
      cifra = entero(valorBase(tipos, clave));
    }
    const extra = eventos.length ? kindMeta(eventos[0].kind).label.toLowerCase() : null;
    return [
      {
        clave: s.lunes,
        desde: s.lunes,
        hasta: s.domingo,
        /* Si no cabe «+ refeed», la cifra sola: va en la tinta del refeed. */
        /* A la altura del valor base: ahí se escribe cuando los escalones son
           de día. */
        valor: media ? s.pauta[clave] : valorBase(tipos, clave),
        opciones: extra ? [`${cifra} + ${extra}`, cifra] : [cifra],
        firma: extra ? `${cifra}|${s.lunes}` : cifra,
        eventos: eventos.length ? eventos : null,
      },
    ];
  });

/**
 * EL NÚMERO DE CADA DÍA, solo al cambiar.
 *
 * @param tramos `tramosDeDias`.
 * @returns las mismas con `opciones` y `firma`.
 */
export const numerosDeDias = (tramos) =>
  tramos.map((b) => {
    const cifra = b.media ? `≈ ${entero(b.valor)}` : entero(b.valor);
    /* Los días de un mismo refeed que piden lo mismo son un escalón: una
       cifra para todos. Escalonado, cada escalón lleva la suya. */
    return {
      ...b,
      opciones: [cifra],
      firma: b.eventos ? `i|${b.eventos[0].id ?? b.desde}|${b.valor}` : `${b.valor}|${b.tipo}|${b.media}`,
    };
  });

/**
 * Solo los números que cambian: el primero que se ve y cada uno que no dice
 * lo mismo que el anterior. Cada uno sabe hasta dónde puede escribirse: hasta
 * el siguiente que se escribe.
 *
 * @param numeros ordenados, con `firma`; los que se ven.
 */
export const alCambiar = (numeros) => {
  const salen = numeros.filter((n, i) => i === 0 || n.firma !== numeros[i - 1].firma || n.desde !== addDays(numeros[i - 1].hasta, 1));
  return salen.map((n, i) => ({ ...n, siguiente: salen[i + 1]?.desde ?? null }));
};

/**
 * Ningún número repetido: de los que cambian (`alCambiar`), solo la primera
 * vez que se ve cada cifra. Alta y baja que se alternan día a día se escriben
 * una vez; la altura del escalón dice el resto (y el cursor, la cifra).
 *
 * @param numeros los de `alCambiar`, con `opciones`.
 */
export const sinRepetir = (numeros) => {
  const vistas = new Set();
  const salen = numeros.filter((n) => {
    const cifra = n.opciones[n.opciones.length - 1];
    if (vistas.has(cifra)) return false;
    vistas.add(cifra);
    return true;
  });
  return salen.map((n, i) => ({ ...n, siguiente: salen[i + 1]?.desde ?? null }));
};
