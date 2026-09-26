/**
 * LAS INTERVENCIONES: lo que el entrenador cambió, y qué pasó alrededor
 * (25 sep 2026).
 *
 * ══ Qué es una intervención ═══════════════════════════════════════════════
 *
 * No es una tabla de hechos nueva: se DERIVA de tres fuentes que ya tienen
 * fecha (ver la cabecera de la migración 0143):
 *
 *   · un REFEED o un DIET BREAK       → `client_events`, sus propios días
 *   · un CAMBIO DE DIETA              → una versión de `nutrition_plan_versions`
 *                                        cuyas kcal, macros, pasos o cardio
 *                                        cambian respecto a la anterior
 *   · un BLOQUE NUEVO                 → el arranque de cada bloque del programa
 *                                        (salvo el primero: no cambia nada)
 *
 * Encima va la capa del entrenador (`client_interventions`): el motivo, la
 * valoración y las ventanas que movió a mano. Es privada.
 *
 * ══ Las tres ventanas ═════════════════════════════════════════════════════
 *
 *   ANTES      los 7 días de antes;
 *   DURANTE    sus días (un refeed, un diet break) o, en un cambio que se
 *              queda (dieta, bloque), su primera semana;
 *   DESPUÉS    los 7 días de después.
 *
 * Antes y después se recortan SOLO por el límite de su fase. Otra
 * intervención que cae dentro no las recorta (26 sep 2026: recortarlas dejaba
 * tarjetas vacías, «— → —»): se dice, «Coincide con: …» (`coinciden`). El
 * entrenador puede mover a mano el principio de «antes» y el final de
 * «después» (`antes_desde`, `despues_hasta`); lo movido a mano no se recorta.
 * Una ventana movida que ya no cuadra con las fechas (se movió el refeed) se
 * ignora.
 *
 * Mientras la ventana de después no ha terminado, la intervención está EN
 * CURSO; antes de empezar, PREVISTA.
 *
 * ══ Lo que no hace ════════════════════════════════════════════════════════
 * No juzga. La tabla pone cifras juntas; si funcionó lo dice el entrenador,
 * a mano, con su valoración. Nada aquí la sugiere.
 */

import { addDays, daysBetween } from '@/lib/dates';
import { esIntervencion } from './pautaDelDia';
import { tendenciaDelPeso } from './tendenciaDelPeso';

/** Lo que dura una ventana por defecto, y lo más que se puede estirar a mano. */
export const DIAS_DE_VENTANA = 7;
export const MAX_DIAS_DE_VENTANA = 56;

export const VALORACIONES = [
  { id: 'funciono', label: 'Funcionó' },
  { id: 'no_funciono', label: 'No funcionó' },
  { id: 'dudoso', label: 'Dudoso' },
];

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const media = (vs) => (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null);
const finDe = (e) => (e?.hasta && e.hasta > e.date ? e.hasta : e?.date);
const mayor = (a, b) => (a > b ? a : b);
const menor = (a, b) => (a < b ? a : b);

/* ── La lista ─────────────────────────────────────────────────────────── */

/* Lo que se compara de dos versiones de la dieta: si nada de esto cambia
   (se cambió un alimento, un horario), no es una intervención. */
const CIFRAS_DE_DIETA = ['kcals', 'protein', 'carbs', 'fats', 'steps'];
const redondo = (v) => (esNumero(v) ? Math.round(v) : null);

/**
 * Lo que cambió entre dos fotos de la dieta: `[{ clave, antes, despues }]`.
 * Vacío si no cambió nada de lo que cuenta.
 */
export const cambiosDeDieta = (antes, despues) => {
  const salida = [];
  for (const clave of CIFRAS_DE_DIETA) {
    const a = redondo(antes?.[clave]);
    const d = redondo(despues?.[clave]);
    if (a !== d) salida.push({ clave, antes: a, despues: d });
  }
  const ca = String(antes?.cardio || '').trim() || null;
  const cd = String(despues?.cardio || '').trim() || null;
  if (ca !== cd) salida.push({ clave: 'cardio', antes: ca, despues: cd });
  return salida;
};

/** La clave de la fila de la capa del entrenador que habla de una intervención. */
const claveDeCapa = (c) =>
  c.eventId ? `e:${c.eventId}` : c.dietaDia ? `d:${c.dietaDia}` : c.bloqueId ? `b:${c.bloqueId}` : null;

/**
 * TODAS LAS INTERVENCIONES DEL CLIENTE, en orden.
 *
 * @param hechos    los eventos del cliente (se miran refeeds y diet breaks).
 * @param versiones `usePautaFechada()`: `[{ dia, snapshot }]`.
 * @param bloques   `[{ id, nombre, desde, split }]`, en orden (el split en
 *                  texto: «Torso-pierna · 4 días»).
 * @param capa      las filas de `client_interventions`, ya traducidas.
 * @param programadas las dietas programadas (0146) con su foto
 *                  (`{ …programada, snapshot }`). Una PENDIENTE es un cambio
 *                  de dieta previsto: su antes es la pendiente anterior o, si
 *                  no la hay, la dieta de ahora (`actual`). Una APLICADA ya
 *                  dejó su versión, que es la intervención: se le cuelga
 *                  (`programada`) para que su tarjeta diga cómo entró. Si esa
 *                  versión no es una intervención (la primera del cliente, o
 *                  solo cambió el menú), sale sola, sin cifras de antes. Una
 *                  que no se aplicó no fue nada.
 * @param actual    la foto de la dieta de ahora, o `null`.
 * @param hoy       lo que empieza después está prevista.
 * @returns `[{ id, tipo, desde, hasta, evento, cambios, bloque, fuente, capa, prevista, programada }]`:
 *   `tipo` es 'refeed' | 'diet_break' | 'dieta' | 'bloque'; `fuente`, la
 *   columna con la que se guarda su capa (`{ eventId }`, `{ dietaDia }` o
 *   `{ bloqueId }`); `hasta`, el último día de DURANTE.
 */
export const intervencionesDelCliente = ({ hechos = [], versiones = [], bloques = [], capa = [], programadas = [], actual = null, hoy }) => {
  const porClave = new Map(capa.map((c) => [claveDeCapa(c), c]));
  const salida = [];

  for (const e of hechos) {
    if (!esIntervencion(e) || !e.date || !e.id) continue;
    salida.push({ id: `e:${e.id}`, tipo: e.kind, desde: e.date, hasta: finDe(e), evento: e, fuente: { eventId: e.id } });
  }

  const orden = [...versiones].filter((v) => v?.dia).sort((a, b) => a.dia.localeCompare(b.dia));
  for (let i = 1; i < orden.length; i += 1) {
    const cambios = cambiosDeDieta(orden[i - 1].snapshot, orden[i].snapshot);
    if (cambios.length === 0) continue;
    const dia = orden[i].dia;
    salida.push({
      id: `d:${dia}`,
      tipo: 'dieta',
      desde: dia,
      hasta: addDays(dia, DIAS_DE_VENTANA - 1),
      cambios,
      antes: orden[i - 1].snapshot,
      despues: orden[i].snapshot,
      fuente: { dietaDia: dia },
    });
  }

  const enOrden = [...programadas].filter((p) => p?.empieza && p.snapshot).sort((a, b) => a.empieza.localeCompare(b.empieza));
  let previa = actual;
  for (const p of enOrden) {
    if (p.estado === 'aplicada') {
      const suya = salida.find((x) => x.id === `d:${p.empieza}`);
      if (suya) suya.programada = p;
      else {
        const conVersion = orden.some((v) => v.dia === p.empieza);
        salida.push({
          id: `p:${p.id}`,
          tipo: 'dieta',
          desde: p.empieza,
          hasta: addDays(p.empieza, DIAS_DE_VENTANA - 1),
          cambios: [],
          antes: null,
          despues: p.snapshot,
          programada: p,
          fuente: conVersion ? { dietaDia: p.empieza } : null,
        });
      }
      continue;
    }
    if (p.estado !== 'pendiente') continue;
    const antes = previa;
    previa = p.snapshot;
    salida.push({
      id: `p:${p.id}`,
      tipo: 'dieta',
      desde: p.empieza,
      hasta: addDays(p.empieza, DIAS_DE_VENTANA - 1),
      cambios: antes ? cambiosDeDieta(antes, p.snapshot) : [],
      antes,
      despues: p.snapshot,
      programada: p,
      /* Aún no hay versión de la que colgar lo que se piensa: su motivo va
         en la propia programada, y pasa a la capa al aplicarse. */
      fuente: null,
    });
  }

  const conFecha = bloques.filter((b) => b?.id && b.desde).sort((a, b) => a.desde.localeCompare(b.desde));
  for (let i = 1; i < conFecha.length; i += 1) {
    const b = conFecha[i];
    salida.push({
      id: `b:${b.id}`,
      tipo: 'bloque',
      desde: b.desde,
      hasta: addDays(b.desde, DIAS_DE_VENTANA - 1),
      bloque: b,
      anterior: conFecha[i - 1],
      fuente: { bloqueId: b.id },
    });
  }

  return salida
    .map((x) => ({ ...x, capa: porClave.get(x.id) || null, prevista: x.desde > hoy }))
    .sort((a, b) => a.desde.localeCompare(b.desde) || a.id.localeCompare(b.id));
};

/* ── Las ventanas ─────────────────────────────────────────────────────── */

/** La fase que cubre un día, o `null`. */
const faseDe = (fases, dia) => fases.find((f) => f.startsOn && f.startsOn <= dia && (!f.endsOn || f.endsOn >= dia)) || null;

/**
 * LAS TRES VENTANAS de una intervención.
 *
 * @param todas las intervenciones del cliente: no recortan nada; las que caen
 *              dentro de las tres ventanas salen en `coinciden`.
 * @param fases las del cliente: antes y después no cruzan el límite de la
 *              fase en la que empieza.
 * @returns `{ antes, durante, despues, movidas: { antes, despues }, coinciden }`;
 *   cada ventana `{ desde, hasta }`, o `null` si el recorte la deja sin días;
 *   `coinciden`, las otras intervenciones que tocan alguna, en orden.
 */
export const ventanasDe = (intervencion, { todas = [], fases = [] } = {}) => {
  const { desde, hasta, capa } = intervencion;
  const durante = { desde, hasta };
  const otras = todas.filter((x) => x.id !== intervencion.id);
  const fase = faseDe(fases, desde);

  /* Movidas a mano, si aún cuadran con las fechas. */
  const antesMovida =
    capa?.antesDesde && capa.antesDesde < desde && (daysBetween(capa.antesDesde, desde) ?? 0) <= MAX_DIAS_DE_VENTANA
      ? capa.antesDesde
      : null;
  const despuesMovida =
    capa?.despuesHasta && capa.despuesHasta > hasta && (daysBetween(hasta, capa.despuesHasta) ?? 0) <= MAX_DIAS_DE_VENTANA
      ? capa.despuesHasta
      : null;

  let antes = null;
  const antesHasta = addDays(desde, -1);
  if (antesMovida) antes = { desde: antesMovida, hasta: antesHasta };
  else {
    let inicio = addDays(desde, -DIAS_DE_VENTANA);
    if (fase?.startsOn) inicio = mayor(inicio, fase.startsOn);
    antes = inicio <= antesHasta ? { desde: inicio, hasta: antesHasta } : null;
  }

  let despues = null;
  const despuesDesde = addDays(hasta, 1);
  if (despuesMovida) despues = { desde: despuesDesde, hasta: despuesMovida };
  else {
    let fin = addDays(hasta, DIAS_DE_VENTANA);
    if (fase?.endsOn) fin = menor(fin, fase.endsOn);
    despues = despuesDesde <= fin ? { desde: despuesDesde, hasta: fin } : null;
  }

  const [a, b] = [antes?.desde || desde, despues?.hasta || hasta];
  const coinciden = otras.filter((o) => o.desde <= b && o.hasta >= a);
  return { antes, durante, despues, movidas: { antes: Boolean(antesMovida), despues: Boolean(despuesMovida) }, coinciden };
};

/**
 * Cómo está: 'prevista' si no ha empezado, 'en_curso' mientras la ventana de
 * después no ha terminado, 'hecha' después.
 */
export const estadoDe = (intervencion, ventanas, hoy) => {
  if (intervencion.desde > hoy) return 'prevista';
  const fin = ventanas.despues?.hasta || intervencion.hasta;
  return fin >= hoy ? 'en_curso' : 'hecha';
};

/* ── Lo que pasó en cada ventana ──────────────────────────────────────── */

/** Los días de una ventana que ya han pasado (hoy incluido). */
const diasVividos = (v, hoy) => {
  if (!v) return [];
  const salida = [];
  for (let d = v.desde; d <= v.hasta && d <= hoy && salida.length < 400; d = addDays(d, 1)) salida.push(d);
  return salida;
};

/**
 * EL PESO de una ventana: la media de sus pesajes y la tendencia
 * (`tendenciaDelPeso`: mínimos cuadrados, desde dos días pesados, con cuántos
 * la sostienen).
 *
 * @returns `{ media, ritmo, pesajes }`; `null` sin pesajes.
 */
export const pesoDeLaVentana = (pesajes, v, hoy) => (v ? tendenciaDelPeso(pesajes, { desde: v.desde, hasta: v.hasta, hoy }) : null);

/** La media de lo pautado en los días vividos de una ventana. `null` si no hay. */
const pautaMedia = (v, hoy, pautaDelDia, clave) =>
  media(
    diasVividos(v, hoy)
      .map((d) => pautaDelDia(d)?.[clave])
      .filter(esNumero)
  );

/**
 * LAS KCAL DE UN CAMBIO DE DIETA, con la misma cuenta que la tabla: la media
 * de lo pautado día a día (`pautaDelDia`) en los 7 días de antes y en los 7
 * primeros de la versión nueva. Nunca la media del ciclo de la versión: con
 * días altos y bajos, aquella y la de la tabla no casaban. Lo que aún no ha
 * llegado también cuenta: es lo pautado, no lo vivido.
 *
 * @returns `{ antes, despues }`, cada una en kcal o `null`.
 */
export const kcalDelCambio = (x, pautaDelDia) => {
  const siempre = '9999-12-31';
  return {
    antes: pautaMedia({ desde: addDays(x.desde, -DIAS_DE_VENTANA), hasta: addDays(x.desde, -1) }, siempre, pautaDelDia, 'kcals'),
    despues: pautaMedia({ desde: x.desde, hasta: addDays(x.desde, DIAS_DE_VENTANA - 1) }, siempre, pautaDelDia, 'kcals'),
  };
};

/**
 * Una sensación en una ventana: la media de las celdas que caen en ella. Una
 * celda de un día (una sesión), si está dentro; una de una semana (un
 * check-in), si al menos la mitad de sus días caen dentro de lo vivido de la
 * ventana — un check-in que habla de otra semana no es de esta ventana.
 */
const sensacionEn = (celdas, v, hoy) => {
  const dias = diasVividos(v, hoy);
  if (dias.length === 0) return null;
  const [a, b] = [dias[0], dias[dias.length - 1]];
  const valores = [];
  for (const c of celdas || []) {
    if (!esNumero(c.valor)) continue;
    const ca = mayor(c.desde, a);
    const cb = menor(c.hasta, b);
    if (ca > cb) continue;
    const dentro = (daysBetween(ca, cb) ?? 0) + 1;
    const largo = (daysBetween(c.desde, c.hasta) ?? 0) + 1;
    if (dentro * 2 >= Math.min(largo, dias.length)) valores.push(c.valor);
  }
  return media(valores);
};

/** Los entrenos de una ventana: `{ hechos, pedidos }`; `null` si no se pedía ni se hizo nada. */
const entrenosEn = (v, hoy, entrenoDelDia) => {
  let hechos = 0;
  let pedidos = 0;
  let cuenta = false;
  for (const d of diasVividos(v, hoy)) {
    const e = entrenoDelDia(d);
    if (!e) continue;
    if (e.pedida) {
      pedidos += 1;
      cuenta = true;
    }
    /* Un entreno de más cuenta como hecho, no como pedido. */
    if (e.hechas?.length) {
      hechos += 1;
      cuenta = true;
    }
  }
  return cuenta ? { hechos, pedidos } : null;
};

/**
 * LA TABLA DE IMPACTO: una fila por cosa medida, una celda por ventana
 * (antes, durante, después). Cada celda es un número o `null`; el texto lo
 * pone quien la pinta.
 *
 * @param pesajes       `[{ date, weight }]`.
 * @param pautaDelDia   `(fecha) => { kcals, steps } | null`.
 * @param sensaciones   `[{ id, nombre, max, celdas }]`: las celdas de
 *                      `celdasDeCheckin` / `celdasDeSesionPorDia`.
 * @param entrenoDelDia `(fecha) => { pedida, hechas } | null`, o `null` si
 *                      el cliente entrena por su cuenta.
 * @param referencias   `[{ nombre, marca: (desde, hasta) => número | null }]`:
 *                      la mejor marca de cada referencia en un tramo. La cifra
 *                      nunca sale: solo cuánto se movió contra ANTES.
 * @returns `{ filas: [{ id, grupo, nombre, unidad, max, celdas: [a, d, p] }] }`.
 *   Una fila sin ningún dato no sale.
 */
export const impactoDe = ({ ventanas, hoy, pesajes = [], pautaDelDia = () => null, sensaciones = [], entrenoDelDia = null, referencias = [] }) => {
  const vs = [ventanas.antes, ventanas.durante, ventanas.despues];
  const filas = [];
  const fila = (id, grupo, nombre, celdas, extra = {}) => {
    if (celdas.some((c) => c !== null && c !== undefined)) filas.push({ id, grupo, nombre, celdas, ...extra });
  };

  const pesos = vs.map((v) => pesoDeLaVentana(pesajes, v, hoy));
  fila('ritmo', 'peso', 'Tendencia del peso', pesos.map((p) => (esNumero(p?.ritmo) ? { ritmo: p.ritmo, pesajes: p.pesajes } : null)), { unidad: '%/sem' });
  fila('peso', 'peso', 'Peso medio', pesos.map((p) => p?.media ?? null), { unidad: 'kg' });

  fila('kcal', 'pauta', 'Kcal medias', vs.map((v) => pautaMedia(v, hoy, pautaDelDia, 'kcals')));
  fila('pasos', 'pauta', 'Pasos medios', vs.map((v) => pautaMedia(v, hoy, pautaDelDia, 'steps')));

  for (const s of sensaciones) {
    fila(`s:${s.id}`, 'sensacion', s.nombre, vs.map((v) => sensacionEn(s.celdas, v, hoy)), { max: s.max });
  }

  if (entrenoDelDia) fila('entrenos', 'entreno', 'Entrenos hechos', vs.map((v) => entrenosEn(v, hoy, entrenoDelDia)));

  for (const r of referencias) {
    const marcas = vs.map((v) => {
      const dias = diasVividos(v, hoy);
      return dias.length ? r.marca(dias[0], dias[dias.length - 1]) : null;
    });
    const base = marcas[0];
    /* Contra ANTES: sin marca antes no hay con qué comparar. */
    const pcts = marcas.map((m, i) => (i === 0 ? (esNumero(m) ? 0 : null) : esNumero(m) && esNumero(base) && base > 0 ? m / base - 1 : null));
    if (pcts.slice(1).some(esNumero)) fila(`r:${r.nombre}`, 'rendimiento', r.nombre, pcts, { unidad: '%' });
  }

  return { filas };
};

/* ── La cifra clave ───────────────────────────────────────────────────── */

/* La fatiga del parte de la sesión; si el check-in la pregunta y se unieron, esa. */
const FILAS_DE_FATIGA = ['s:se:fatigue', 's:ci:fatigue'];

/**
 * LA CIFRA CLAVE de una intervención, la que se lee primero en el historial y
 * en su tarjeta (26 sep 2026). Sale de su tabla (`impactoDe`), con la misma
 * cuenta:
 *
 *   · refeed, diet break, cambio de dieta → la tendencia del peso, antes →
 *     después;
 *   · bloque nuevo → el rendimiento de sus referencias en DESPUÉS, la media en
 *     % contra ANTES, y la fatiga de la sesión antes → después si la hay.
 *
 * Solo cifras: si es bueno o malo lo dice el entrenador.
 *
 * @returns `{ tipo: 'peso', antes, despues }` (cada una `{ ritmo, pesajes }`
 *   o `null`) o `{ tipo: 'bloque', rendimiento, referencias, fatiga }`:
 *   `rendimiento`, la media (0,021 = +2,1 %) o `null`; `referencias`,
 *   cuántas la forman; `fatiga`, `{ antes, despues, max }` o `null`.
 */
export const cifraClaveDe = (x, impacto) => {
  const filas = impacto?.filas || [];
  if (x.tipo !== 'bloque') {
    const r = filas.find((f) => f.id === 'ritmo');
    return { tipo: 'peso', antes: r?.celdas[0] ?? null, despues: r?.celdas[2] ?? null };
  }
  const pcts = filas
    .filter((f) => f.grupo === 'rendimiento')
    .map((f) => f.celdas[2])
    .filter(esNumero);
  const fatiga = FILAS_DE_FATIGA.map((id) => filas.find((f) => f.id === id)).find(Boolean);
  return {
    tipo: 'bloque',
    rendimiento: media(pcts),
    referencias: pcts.length,
    fatiga: fatiga ? { antes: fatiga.celdas[0] ?? null, despues: fatiga.celdas[2] ?? null, max: fatiga.max } : null,
  };
};

/* ── El historial ─────────────────────────────────────────────────────── */

/** Los tipos, en el orden en que se filtran y se cuentan. */
export const TIPOS_DE_INTERVENCION = [
  { id: 'refeed', label: 'Refeed', plural: 'Refeeds' },
  { id: 'diet_break', label: 'Diet break', plural: 'Diet breaks' },
  { id: 'dieta', label: 'Dieta', plural: 'Cambios de dieta' },
  { id: 'bloque', label: 'Bloque', plural: 'Bloques nuevos' },
];

/**
 * EL HISTORIAL DE INTERVENCIONES (25 sep 2026): todas, de la más reciente a
 * la más antigua, cada una con su estado y su cifra clave (`cifraClaveDe`),
 * con la misma cuenta que su tarjeta.
 *
 * @param pautaDelDia la de la tabla; con ella, las kcal de un cambio de dieta
 *   (`kcalDelCambio`). Sin ella, `kcal` es `null`.
 * @param medir `(x, ventanas) => impactoDe(...)`: la tabla de la tarjeta. Sin
 *   ella, solo el peso.
 * @returns `[{ x, ventanas, estado, clave, kcal }]`.
 */
export const historialDeIntervenciones = ({ todas = [], fases = [], pesajes = [], hoy, pautaDelDia = null, medir = null }) =>
  todas
    .map((x) => {
      const ventanas = ventanasDe(x, { todas, fases });
      const impacto = medir ? medir(x, ventanas) : impactoDe({ ventanas, hoy, pesajes });
      return {
        x,
        ventanas,
        estado: estadoDe(x, ventanas, hoy),
        clave: cifraClaveDe(x, impacto),
        kcal: x.tipo === 'dieta' && pautaDelDia ? kcalDelCambio(x, pautaDelDia) : null,
      };
    })
    .sort((a, b) => b.x.desde.localeCompare(a.x.desde) || b.x.id.localeCompare(a.x.id));

/**
 * CUÁNTAS HAY DE CADA TIPO y cómo las valoró el entrenador. Solo cuenta: no
 * saca conclusiones. `sinValorar` no incluye las previstas, que aún no se
 * pueden valorar.
 *
 * @returns `[{ tipo, plural, n, funciono, no_funciono, dudoso, sinValorar, previstas }]`,
 *   solo los tipos que tiene.
 */
export const recuentoDeIntervenciones = (entradas) =>
  TIPOS_DE_INTERVENCION.map((t) => {
    const suyas = entradas.filter((e) => e.x.tipo === t.id);
    const con = (v) => suyas.filter((e) => e.x.capa?.valoracion === v).length;
    return {
      tipo: t.id,
      plural: t.plural,
      n: suyas.length,
      funciono: con('funciono'),
      no_funciono: con('no_funciono'),
      dudoso: con('dudoso'),
      sinValorar: suyas.filter((e) => !e.x.capa?.valoracion && e.estado !== 'prevista').length,
      previstas: suyas.filter((e) => e.estado === 'prevista').length,
    };
  }).filter((r) => r.n > 0);
