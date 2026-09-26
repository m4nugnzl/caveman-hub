import {
  blockPlannedVolume,
  blocksOf,
  blockSummary,
  blockTraits,
  carpetaDelBloque,
  intentColor,
  microcicloDelBloque,
  splitDelBloque,
  tramoDelBloque,
  weeksOfBlock,
} from './blocks';
import { borradoresDe, diasDelBorrador } from './borradores';
import { cambioMedio, indiceMedio, rendimientoDelBloque } from './rendimiento';
import { nombreDelSplit } from './split';
import { dayPlannedVolume, entrenosDe, MRV_GOALS, normalizaMicrociclo, WEEK_DAYS } from './training';
import { addDays, daysBetween, todayISO } from '@/lib/dates';

/**
 * LAS TEMPORADAS: los bloques de una persona agrupados en fundas (25 sep 2026).
 *
 * La lista de bloques (`?v=lista`) se dibuja como una cartera: cada bloque es
 * un PASE y cada temporada una FUNDA con sus pases. Aquí vive lo que no es
 * pintura —qué va en cada funda, en qué orden y a qué escala— para poder
 * probarlo sin montar la pantalla.
 *
 * ══ De dónde sale una temporada ════════════════════════════════════════════
 * De `folder`, un campo OPCIONAL del bloque y del previsto (`carpetaDelBloque`).
 * Sin él, el bloque va a la temporada de su AÑO —el de su primer día—: quien no
 * ordena nada ve una funda por año y no tiene que hacer nada. Un bloque nuevo
 * hereda la temporada del anterior (`openNextBlock`, `anadirBorrador`), así que
 * poner nombre a una temporada una vez basta.
 *
 * No hay lista de temporadas guardada: una temporada existe mientras tenga
 * algún bloque. Por eso una recién creada vive en la pantalla hasta que se le
 * suelta el primero.
 *
 * ══ El orden ═══════════════════════════════════════════════════════════════
 * La sucesión va de lo más antiguo a lo más nuevo: los cerrados por su primer
 * microciclo, el abierto, y detrás los previstos en su orden. Los previstos no
 * tienen fechas: se encadenan detrás del final previsto del abierto, cada uno
 * con lo que dura (`diasDelBorrador`). Son ESTIMADAS y así se marcan.
 *
 * Las fundas, de la más reciente a la más antigua (por su último pase). Dentro
 * de una funda, la cascada va al revés: el más antiguo arriba y el más reciente
 * abajo, que es el que se ve entero.
 */

/** «2026» → la clave de la funda del año. Las de nombre, `t:` + el nombre. */
const claveDeAno = (ano) => `a:${ano}`;
const claveDeCarpeta = (carpeta) => `t:${carpeta.toLowerCase()}`;

const anoDe = (iso) => {
  const n = Number(String(iso || '').slice(0, 4));
  return Number.isInteger(n) && n > 1900 ? n : null;
};

/** Días → semanas, redondeando; al menos una si hay algún día. */
const semanasDeDias = (dias) => (dias > 0 ? Math.max(1, Math.round(dias / 7)) : 0);

/**
 * La sucesión de pases, de lo más antiguo a lo más nuevo.
 *
 * @param opciones `{ cycleType, cyclePattern, startDate }` del cliente, para
 *   las fechas de los bloques (`tramoDelBloque`).
 * @param borradores si se leen los previstos (la pantalla que no los toca los
 *   deja fuera).
 * @returns `[{ id, tipo: 'bloque' | 'borrador', bloque, carpeta, abierto,
 *   desde, hasta, estimado, largo, color, intent }]`. `largo` son sus
 *   microciclos: los escritos o, si se previeron más, los previstos.
 */
export const sucesionDeBloques = (program, { opciones = {}, borradores = true, hoy = todayISO() } = {}) => {
  const hayMicrociclos = (program?.microcycles || []).length > 0;
  const bloques = blocksOf(program)
    .map((b) => ({ b, semanas: weeksOfBlock(program, b).length, abierto: b.toWeek === null || b.toWeek === undefined }))
    .filter(({ semanas, abierto }) => semanas > 0 || (abierto && hayMicrociclos))
    .sort((x, y) => Number(x.abierto) - Number(y.abierto) || (x.b.fromWeek ?? 0) - (y.b.fromWeek ?? 0));

  const salida = bloques.map(({ b, semanas, abierto }) => {
    const tramo = tramoDelBloque(program, b, opciones);
    const { intent, plannedWeeks } = blockTraits(b);
    return {
      id: b.id,
      tipo: 'bloque',
      bloque: b,
      carpeta: carpetaDelBloque(b),
      abierto,
      desde: tramo?.desde || null,
      /* El abierto acaba donde se previó, si se previó. */
      hasta: (abierto && tramo?.previstoHasta) || tramo?.hasta || null,
      estimado: Boolean(tramo?.estimado),
      largo: abierto && plannedWeeks ? Math.max(semanas, plannedWeeks) : semanas,
      intent,
      color: intentColor(intent),
    };
  });

  if (borradores) {
    /* Detrás del último día previsto del abierto; sin fechas, desde hoy. */
    let cursor = salida.at(-1)?.hasta || hoy;
    for (const b of borradoresDe(program)) {
      const desde = addDays(cursor, 1);
      const hasta = addDays(desde, Math.max(1, diasDelBorrador(b)) - 1);
      cursor = hasta;
      const { intent, plannedWeeks } = blockTraits(b);
      salida.push({
        id: b.id,
        tipo: 'borrador',
        bloque: b,
        carpeta: carpetaDelBloque(b),
        abierto: false,
        desde,
        hasta,
        estimado: true,
        largo: plannedWeeks || 0,
        intent,
        color: intentColor(intent),
      });
    }
  }
  return salida;
};

/**
 * Las fundas, de la más reciente a la más antigua.
 *
 * @returns `[{ clave, nombre, propia, pases, desde, hasta, semanas, largo,
 *   ahora }]`: `propia` si tiene nombre del entrenador (si no, es la del año);
 *   `pases` de lo más antiguo a lo más nuevo; `largo` la suma de sus
 *   microciclos; `ahora` si lleva el bloque abierto.
 */
export const temporadasDe = (sucesion = [], { hoy = todayISO() } = {}) => {
  const porClave = new Map();
  let ultimoAno = anoDe(hoy);
  sucesion.forEach((pase, i) => {
    const ano = anoDe(pase.desde) ?? ultimoAno;
    ultimoAno = ano;
    const clave = pase.carpeta ? claveDeCarpeta(pase.carpeta) : claveDeAno(ano);
    if (!porClave.has(clave))
      porClave.set(clave, { clave, nombre: pase.carpeta || String(ano), propia: Boolean(pase.carpeta), pases: [], orden: i });
    const t = porClave.get(clave);
    t.pases.push(pase);
    t.orden = i;
  });

  return [...porClave.values()]
    .sort((a, b) => b.orden - a.orden)
    .map(({ orden: _o, ...t }) => {
      const desde = t.pases.map((p) => p.desde).filter(Boolean).sort()[0] || null;
      const hasta = t.pases.map((p) => p.hasta).filter(Boolean).sort().at(-1) || null;
      const dias = desde && hasta ? daysBetween(desde, hasta) + 1 : 0;
      return {
        ...t,
        desde,
        hasta,
        semanas: semanasDeDias(dias),
        largo: t.pases.reduce((n, p) => n + p.largo, 0),
        ahora: t.pases.some((p) => p.abierto),
      };
    });
};

/**
 * LA TIRA DE INTENCIONES de cada funda, a una ESCALA COMÚN: la funda más larga
 * ocupa todo el ancho y las demás, lo que les toca. Así una temporada de ocho
 * semanas no se dibuja igual que una de cuarenta. Dentro, un segmento por pase,
 * proporcional a sus microciclos.
 *
 * @returns `Map<clave, { ancho, segmentos: [{ id, color, intent, fraccion }] }>`,
 *   `ancho` y `fraccion` entre 0 y 1 (`fraccion` de la tira de ESA funda).
 */
export const tirasDeLasTemporadas = (temporadas = []) => {
  const mayor = Math.max(0, ...temporadas.map((t) => t.largo));
  return new Map(
    temporadas.map((t) => [
      t.clave,
      {
        ancho: mayor > 0 ? t.largo / mayor : 0,
        segmentos: t.pases
          .filter((p) => p.largo > 0)
          .map((p) => ({ id: p.id, color: p.color, intent: p.intent, fraccion: p.largo / t.largo })),
      },
    ])
  );
};

/**
 * La cascada de una funda abierta: de lo más antiguo (arriba) a lo más nuevo
 * (abajo), con UNO elegido —el que enseña el detalle—. Por defecto el bloque
 * de ahora si está en la funda y, si no, el último; lo mismo si el pedido no
 * es de esta funda.
 *
 * @returns los pases con `elegido: boolean`.
 */
export const cascadaDeLaTemporada = (temporada, elegido = null) => {
  const pases = temporada?.pases || [];
  const id = pases.some((p) => p.id === elegido)
    ? elegido
    : (pases.find((p) => p.abierto) || pases.at(-1))?.id;
  return pases.map((p) => ({ ...p, elegido: p.id === id }));
};

/* ══ LAS CIFRAS DE UN PASE ══════════════════════════════════════════════════
   Todo sale de ESE bloque: sus microciclos, su plan y su microciclo guardado
   (o su reparto congelado, si es un cerrado sin él). Nada se lee de la
   plantilla de hoy: un bloque de adaptación de tres días dice tres días
   aunque ahora se entrenen cinco. */

const INICIAL = { Miércoles: 'X' };
const inicialDe = (dia) => INICIAL[dia] || dia[0];

/**
 * La semana del split, casilla a casilla. Semanal: de lunes a domingo. Una
 * vuelta rotativa no cae en días de la semana: sus casillas se numeran.
 */
const semanaDelSplit = (microciclo) => {
  const dias = microciclo?.dias || [];
  const semanal = microciclo?.tipo !== 'rotativo' && dias.length === 7;
  return dias.map((d, i) => ({
    rotulo: semanal ? inicialDe(WEEK_DAYS[i]) : String(i + 1),
    dia: semanal ? WEEK_DAYS[i] : `Día ${i + 1}`,
    hoja: d.descanso ? null : d.hoja || null,
  }));
};

/** Las series por semana de cada grupo, de más a menos, con su MEV y su MRV. */
const gruposConReferencias = (porGrupo) =>
  Object.entries(porGrupo)
    .map(([nombre, series]) => ({
      nombre,
      series: Math.round(series * 10) / 10,
      mev: MRV_GOALS[nombre]?.mev ?? null,
      mrv: MRV_GOALS[nombre]?.mrv ?? null,
    }))
    .filter((g) => g.series > 0)
    .sort((a, b) => b.series - a.series);

/**
 * Lo que se cuenta de un pase, en la cascada y en su detalle.
 *
 * Un previsto no ha pasado: sus series son las de sus hojas (una vez cada una
 * por microciclo, como las del plan de un bloque) y no tiene ni pautado ni
 * rendimiento.
 *
 * @returns `{ split, dias, semana, series, adherencia, curva, pct, sube,
 *   baja, grupos }`:
 *   · `split` el nombre con sus días («Torso / Pierna · 4 días»);
 *   · `semana` `[{ rotulo, dia, hoja }]`, `hoja` nula en los descansos;
 *   · `series` la media por semana, redondeada; `adherencia` el % pautado;
 *   · `curva` `[{ semana, indice }]` el índice medio por microciclo (`null`
 *     donde no hay dato) y `pct` su cambio medio;
 *   · `sube` y `baja` `{ nombre, cambio }` el ejercicio que más y el que menos
 *     cambia (`baja` solo si hay dos o más medidos);
 *   · `grupos` `[{ nombre, series, mev, mrv }]` por semana.
 */
export const cifrasDelPase = (pase, program, cliente = null) => {
  const b = pase.bloque;
  if (pase.tipo === 'borrador') {
    const hojas = b.sessions || [];
    const microciclo = normalizaMicrociclo(b.microciclo);
    const porGrupo = {};
    for (const h of hojas)
      for (const [grupo, n] of Object.entries(dayPlannedVolume(h))) porGrupo[grupo] = (porGrupo[grupo] || 0) + n;
    const series = Object.values(porGrupo).reduce((n, v) => n + v, 0);
    const entrenos = entrenosDe(microciclo);
    return {
      split: nombreDelSplit(b, hojas, microciclo),
      dias: entrenos > 0 ? entrenos : null,
      semana: semanaDelSplit(microciclo),
      series: hojas.length ? Math.round(series) : null,
      adherencia: null,
      curva: [],
      pct: null,
      sube: null,
      baja: null,
      grupos: gruposConReferencias(porGrupo),
    };
  }

  const resumen = blockSummary(program, b, cliente);
  const sp = splitDelBloque(program, b, cliente);
  const split = sp?.texto ? (sp.dias && !sp.texto.includes(sp.dias) ? `${sp.texto} · ${sp.dias}` : sp.texto) : null;
  const microciclo = microcicloDelBloque(program, b, cliente);
  const { ejercicios } = rendimientoDelBloque(program, b);
  const medidos = ejercicios.filter((e) => e.cambio).sort((x, y) => y.cambio.indice - x.cambio.indice);
  const porMusculo = blockPlannedVolume(program, b).porMusculo;
  const entrenos = entrenosDe(microciclo);
  return {
    split,
    dias: entrenos > 0 ? entrenos : null,
    semana: semanaDelSplit(microciclo),
    series: resumen.series === null ? null : Math.round(resumen.series),
    adherencia: resumen.adherencia,
    curva: medidos.length ? indiceMedio(medidos.map((e) => e.linea)).map(({ semana, indice }) => ({ semana, indice })) : [],
    pct: cambioMedio(medidos),
    sube: medidos.length ? { nombre: medidos[0].nombre, cambio: medidos[0].cambio } : null,
    baja: medidos.length > 1 ? { nombre: medidos.at(-1).nombre, cambio: medidos.at(-1).cambio } : null,
    grupos: gruposConReferencias(Object.fromEntries(Object.entries(porMusculo).map(([m, v]) => [m, v.media || 0]))),
  };
};

/** Los cantos que asoman por detrás de una funda: sus tres últimos pases, el más nuevo delante. */
export const cantosDeLaFunda = (temporada, cuantos = 3) => (temporada?.pases || []).slice(-cuantos).reverse();

/* ══ LAS ESCRITURAS ═════════════════════════════════════════════════════════
   Mover un pase, renombrar una temporada y quitarla son la misma operación:
   poner (o quitar) `folder` a una lista de bloques y previstos. */

/** El bloque sin su temporada: vuelve a la de su año. */
export const sinCarpeta = (b) => {
  const { folder: _f, ...resto } = b || {};
  return resto;
};

/**
 * Pone la temporada `carpeta` a los bloques y previstos de `ids`, o se la quita
 * con `null`/vacío. Lo que no cambia se devuelve igual.
 */
export const ponerCarpetaIn = (program, ids = [], carpeta = null) => {
  const suyos = new Set(ids);
  const nombre = carpetaDelBloque({ folder: carpeta });
  const poner = (b) => {
    if (!suyos.has(b.id) || carpetaDelBloque(b) === nombre) return b;
    return nombre ? { ...b, folder: nombre } : sinCarpeta(b);
  };
  const bloques = blocksOf(program);
  const nuevos = bloques.map(poner);
  const previstos = borradoresDe(program);
  const nuevosPrevistos = previstos.map(poner);
  const tocaBloques = nuevos.some((b, i) => b !== bloques[i]);
  const tocaPrevistos = nuevosPrevistos.some((b, i) => b !== previstos[i]);
  if (!tocaBloques && !tocaPrevistos) return program;
  return {
    ...program,
    ...(tocaBloques ? { blocks: nuevos } : {}),
    ...(tocaPrevistos ? { draftBlocks: nuevosPrevistos } : {}),
  };
};

/** ¿Hay ya una temporada con ese nombre (sin mirar mayúsculas)? */
export const temporadaConNombre = (temporadas = [], nombre) => {
  const limpio = carpetaDelBloque({ folder: nombre });
  return limpio ? temporadas.find((t) => t.propia && t.clave === claveDeCarpeta(limpio)) || null : null;
};
