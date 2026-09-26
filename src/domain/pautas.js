/**
 * LA PAUTA DE CADA MICROCICLO: la del anterior, con lo que cambia en este.
 *
 * ══ El problema ═══════════════════════════════════════════════════════════
 *
 * La pauta vivía en un solo sitio, las series de la definición del bloque
 * (`block.sessions[].exercises[].sets`), y valía igual para todos sus
 * microciclos. Progresar —«en el M3 la última a RIR 0»— era reescribir la
 * definición, y con ella cambiaban también los microciclos ya entrenados.
 *
 * ══ El modelo ═════════════════════════════════════════════════════════════
 *
 * La definición sigue siendo la base, y encima cada microciclo guarda SOLO
 * lo que cambia, campo a campo:
 *
 *     block.pautas = {
 *       [exerciseId]: {
 *         [microcycleId]: { n?, series?: { [índice]: { targetReps?, targetKg?, targetRir? } } }
 *       }
 *     }
 *
 * Con ids estables: el del ejercicio —único dentro del bloque, y que no cambia
 * al renombrar la hoja— y el del microciclo, que no cambia al renumerar las
 * semanas del programa.
 *
 * La pauta de un microciclo es una CADENA: la definición, y encima las
 * diferencias de cada microciclo del bloque hasta él, en orden. Así M2 hereda
 * de M1, M3 de M2, y un campo que M4 fija él mismo no lo mueve lo que se
 * cambie antes.
 *
 * Este fichero no sabe nada de bloques ni de semanas: recibe series y
 * diferencias. Dónde está cada una lo resuelve `blocks.js` (`pautaEfectiva`).
 */
import { localeNumber } from '@/lib/dates';
import { toNum } from '@/lib/num';

/** Lo que se pauta de una serie. Lo demás (kilos hechos, el remate) no viaja. */
export const CAMPOS_DE_PAUTA = ['targetReps', 'targetKg', 'targetRir'];

/** El tope de series de toda la casa. */
export const MAX_SERIES = 12;

const texto = (v) => String(v ?? '').trim();

/** Una serie más: copia el rango, la carga y el RIR de la que tiene delante,
    sin su remate (la bajada estaba puesta en esa serie, no en «la última»). */
export const serieNueva = (anterior) => ({
  kg: '',
  reps: '',
  rir: '',
  targetKg: texto(anterior?.targetKg),
  targetReps: texto(anterior?.targetReps),
  targetRir: texto(anterior?.targetRir),
});

/** Las mismas series con otro número: crecer copia la última, encoger quita por el final. */
export const conNumeroDeSeries = (sets = [], n) => {
  const cuantas = Math.min(Math.max(Math.round(Number(n)) || 1, 1), MAX_SERIES);
  if (cuantas === sets.length) return sets;
  const out = sets.slice(0, cuantas);
  while (out.length < cuantas) out.push(serieNueva(out[out.length - 1]));
  return out;
};

/**
 * Las series de un microciclo a partir de las que le llegan y su diferencia.
 *
 * Primero el número de series y después los campos por índice. Un índice que
 * ya no existe —la definición bajó de cuatro a tres series y el M3 tenía algo
 * escrito en la cuarta— SE IGNORA: no rompe nada ni inventa la serie. No se
 * borra, porque si las series vuelven a ser cuatro vuelve a valer.
 */
export const aplicarDiferencia = (sets = [], dif = null) => {
  if (!dif || typeof dif !== 'object') return sets;
  let out = Number.isInteger(dif.n) ? conNumeroDeSeries(sets, dif.n) : sets;
  const series = dif.series && typeof dif.series === 'object' ? dif.series : null;
  if (!series) return out;
  let copiada = false;
  for (const [clave, campos] of Object.entries(series)) {
    const i = Number(clave);
    if (!Number.isInteger(i) || i < 0 || i >= out.length || !campos || typeof campos !== 'object') continue;
    for (const campo of CAMPOS_DE_PAUTA) {
      if (!(campo in campos)) continue;
      if (!copiada) {
        out = [...out];
        copiada = true;
      }
      out[i] = { ...out[i], [campo]: texto(campos[campo]) };
    }
  }
  return out;
};

/** La cadena entera: la base y las diferencias, en el orden de los microciclos. */
export const encadenar = (base = [], diferencias = []) =>
  diferencias.reduce((sets, dif) => aplicarDiferencia(sets, dif), base || []);

/**
 * LA DIFERENCIA QUE QUEDA GUARDADA cuando en un microciclo se escribe `pedidas`.
 *
 * Solo cuenta lo que se ha TOCADO: los campos en los que `pedidas` no coincide
 * con lo que el microciclo enseñaba. Cada uno se guarda si difiere de lo que le
 * llega del anterior, y se suelta —vuelve a heredar— si coincide. Lo que el
 * microciclo ya tenía propio y no se ha tocado se queda como estaba.
 *
 * Las series que se añaden nacen de la última heredada (`conNumeroDeSeries`), y
 * lo que llevaran escrito los índices que no existían se descarta: una serie
 * nueva no hereda un valor viejo que nadie ve.
 *
 * @param vieja     la diferencia que ese microciclo ya tenía, o `null`.
 * @param heredadas lo que le llega del anterior, sin su diferencia.
 * @param pedidas   cómo tienen que quedar sus series.
 * @returns la diferencia, o `null` si ya no difiere en nada.
 */
export const diferenciaNueva = (vieja, heredadas = [], pedidas = []) => {
  if (!Array.isArray(pedidas) || pedidas.length === 0) return vieja || null;
  const actuales = aplicarDiferencia(heredadas, vieja);
  const n = Math.min(pedidas.length, MAX_SERIES);
  const referencia = conNumeroDeSeries(heredadas, n);

  const series = {};
  for (const [clave, campos] of Object.entries(vieja?.series || {})) {
    const i = Number(clave);
    if (!Number.isInteger(i) || i >= n || i >= actuales.length || !campos) continue;
    const suyos = Object.fromEntries(CAMPOS_DE_PAUTA.filter((c) => c in campos).map((c) => [c, texto(campos[c])]));
    if (Object.keys(suyos).length > 0) series[i] = suyos;
  }

  for (let i = 0; i < n; i += 1) {
    for (const campo of CAMPOS_DE_PAUTA) {
      const quiere = texto(pedidas[i]?.[campo]);
      const tenia = i < actuales.length ? texto(actuales[i]?.[campo]) : null;
      if (tenia !== null && quiere === tenia) continue;
      if (quiere === texto(referencia[i]?.[campo])) {
        if (series[i]) delete series[i][campo];
      } else {
        series[i] = { ...(series[i] || {}), [campo]: quiere };
      }
    }
    if (series[i] && Object.keys(series[i]).length === 0) delete series[i];
  }

  const dif = {};
  if (n !== heredadas.length) dif.n = n;
  if (Object.keys(series).length > 0) dif.series = series;
  return Object.keys(dif).length > 0 ? dif : null;
};

/** Qué claves toca una diferencia: `'n'` y `'índice:campo'`. */
export const clavesDe = (dif) => {
  const claves = new Set();
  if (!dif) return claves;
  if (Number.isInteger(dif.n)) claves.add('n');
  for (const [i, campos] of Object.entries(dif.series || {})) {
    for (const campo of CAMPOS_DE_PAUTA) if (campos && campo in campos) claves.add(`${i}:${campo}`);
  }
  return claves;
};

/** Las claves en las que dos juegos de series no coinciden. */
export const clavesQueCambian = (antes = [], ahora = []) => {
  const claves = new Set();
  if (antes.length !== ahora.length) claves.add('n');
  const largo = Math.max(antes.length, ahora.length);
  for (let i = 0; i < largo; i += 1) {
    for (const campo of CAMPOS_DE_PAUTA) {
      if (texto(antes[i]?.[campo]) !== texto(ahora[i]?.[campo])) claves.add(`${i}:${campo}`);
    }
  }
  return claves;
};

/** Solo lo pautado de unas series: lo que se compara y lo que se fotografía. */
export const soloLaPauta = (sets = []) =>
  (sets || []).map((s) => ({
    targetReps: texto(s?.targetReps),
    targetKg: texto(s?.targetKg),
    targetRir: texto(s?.targetRir),
  }));

/** ¿Pide carga alguna serie? ¿Y RIR? Es lo que decide si la fila los enseña. */
export const pideCampo = (sets = [], campo) => (sets || []).some((s) => texto(s?.[campo]) !== '');

/* ══ LA FILA EN TABLA: UNA LÍNEA POR GRUPO ═════════════════════════════════ */

/**
 * Series seguidas que se leen en una línea: las que piden el mismo rango y la
 * misma carga («1 × 4-6 · 140», «2 × 8-10 · 115»). El RIR no parte el grupo:
 * se dice serie a serie dentro de él («2 1»). Por POSICIÓN, como los tramos:
 * una pirámide que baja y vuelve a subir son tres grupos.
 *
 * `separarPrimera` saca la primera serie a su propia línea aunque pida lo
 * mismo que las demás: es «Separar la primera serie» (3 × … → 1 + 2). No
 * escribe nada; en cuanto la primera se cambia, ya es otra de verdad.
 *
 * @returns `[{ desde, n, sets }]`
 */
export const gruposDeSeries = (sets = [], { separarPrimera = false } = {}) => {
  const clave = (s) => `${texto(s?.targetReps)}|${texto(s?.targetKg)}`;
  const grupos = [];
  (sets || []).forEach((s, i) => {
    const ultimo = grupos[grupos.length - 1];
    const suelta = separarPrimera && i === 1;
    if (ultimo && !suelta && ultimo.clave === clave(s)) ultimo.sets.push(s);
    else grupos.push({ desde: i, clave: clave(s), sets: [s] });
  });
  return grupos.map(({ desde, sets: suyas }) => ({ desde, n: suyas.length, sets: suyas }));
};

/** ¿Los dos primeros grupos piden lo mismo? Solo pasa con la primera serie
    separada a mano y vuelta a dejar igual: es cuando «Juntar» tiene sentido. */
export const primerosIguales = (grupos = []) =>
  grupos.length > 1 &&
  texto(grupos[0].sets[0]?.targetReps) === texto(grupos[1].sets[0]?.targetReps) &&
  texto(grupos[0].sets[0]?.targetKg) === texto(grupos[1].sets[0]?.targetKg);

/** Una cifra como se lee aquí: sin unidad y con coma decimal («72,5»). El
    lastre conserva su signo («+15»). */
export const cifra = (v) => {
  const n = toNum(v);
  if (n === null) return texto(v);
  return `${texto(v).startsWith('+') ? '+' : ''}${localeNumber(n)}`;
};

/**
 * Lo que dice cada celda de una línea: `{ n, reps, kg, rir }`. `rir` es una
 * lista, una cifra por serie, o una sola si todas piden lo mismo («1»). Vacío
 * es vacío: la celda no se rellena con guiones.
 */
export const celdasDeGrupo = (grupo) => {
  const rirs = grupo.sets.map((s) => cifra(s?.targetRir));
  return {
    n: grupo.n,
    reps: texto(grupo.sets[0]?.targetReps),
    kg: cifra(grupo.sets[0]?.targetKg),
    rir: rirs.every((r) => r === rirs[0]) ? [rirs[0]] : rirs,
  };
};

/* ── Escribir una línea ───────────────────────────────────────────────────
   Las tres devuelven las series ENTERAS del ejercicio, con la línea cambiada:
   quien las recibe (`ponerPautaIn`) ya sabe guardar solo lo que difiere. Si
   lo escrito no cambia nada o no vale, devuelven `null`. */

const conGrupo = (sets, g, nuevas) => [...sets.slice(0, g.desde), ...nuevas, ...sets.slice(g.desde + g.n)];

/**
 * Otro número de series en una línea: subir copia la última de la línea
 * (rango, carga y RIR), bajar quita por el final, y a 0 la línea se va si hay
 * otra. Nunca pasa del tope de la casa.
 */
export const conSeriesDelGrupo = (sets = [], grupos = [], gi, escrito) => {
  const g = grupos[gi];
  if (!g) return null;
  const libres = MAX_SERIES - (sets.length - g.n);
  const n = toNum(escrito);
  if (n === null) return null;
  const k = Math.min(Math.max(Math.round(n), 0), libres);
  if (k === g.n) return null;
  if (k === 0) return grupos.length > 1 ? conGrupo(sets, g, []) : null;
  const suyas = g.sets.slice(0, k);
  while (suyas.length < k) suyas.push(serieNueva(suyas[suyas.length - 1]));
  return conGrupo(sets, g, suyas);
};

/**
 * Un campo de una línea. Un valor vale para todas sus series; varios
 * separados («8-10 / 8-12», «2 1») van uno por serie, y el último se repite.
 * `serie` (índice dentro de la línea) escribe solo esa: es el RIR «2 1»
 * tocado cifra a cifra.
 */
export const conCampoDelGrupo = (sets = [], grupos = [], gi, campo, escrito, { serie = null } = {}) => {
  const g = grupos[gi];
  if (!g) return null;
  const separador = campo === 'targetRir' ? /[·/\s]+/ : /\s*\/\s*/;
  /* Un guion suelto es un hueco: es como se lee una serie sin RIR en «2 – 1».
     El «·» se sigue aceptando: es como se escribía antes. */
  const limpio = (v) =>
    campo === 'targetReps' ? leerRango(v) : texto(v).replace(/\s*kg$/i, '').replace(/^[–-]$/, '');
  const valores = texto(escrito).split(separador).map(limpio);
  if (campo === 'targetReps' && valores.every((v) => v === '')) return null;
  const nuevas = g.sets.map((s, j) => {
    if (serie !== null) return j === serie ? { ...s, [campo]: valores[0] } : s;
    return { ...s, [campo]: valores[Math.min(j, valores.length - 1)] };
  });
  if (nuevas.every((s, j) => texto(s[campo]) === texto(g.sets[j]?.[campo]))) return null;
  return conGrupo(sets, g, nuevas);
};

/** «Añadir serie»: una más al final, copia de la última. */
export const conOtraSerie = (sets = []) =>
  sets.length >= MAX_SERIES || sets.length === 0 ? null : [...sets, serieNueva(sets[sets.length - 1])];

/**
 * «8 10», «8,10» o «8.10» se leen «8-10»: en el teclado numérico del móvil no
 * siempre hay guion, y las repeticiones no llevan decimales. Lo demás
 * («AMRAP», «12-15+») se queda como está.
 */
export const leerRango = (escrito) => {
  const t = texto(escrito);
  const m = /^(\d+)\s*[\s.,\-–]\s*(\d+)$/.exec(t);
  return m ? `${m[1]}-${m[2]}` : t;
};

/**
 * QUÉ HA CAMBIADO RESPECTO AL MICROCICLO ANTERIOR, por partes de la fila.
 *
 * Se compara serie a serie. Una serie que no existía antes se compara con la
 * última que había —es lo que copia al nacer—, así que pasar de tres a cuatro
 * marca el número y no la carga.
 *
 * @returns `{ n, kg, reps, rir }`, o `null` sin anterior (el primer
 *   microciclo del bloque no marca nada).
 */
export const cambiosEntre = (antes, ahora = []) => {
  if (!Array.isArray(antes)) return null;
  const difiere = (campo) => {
    const a = antes.map((s) => texto(s?.[campo]));
    const b = ahora.map((s) => texto(s?.[campo]));
    const largo = Math.max(a.length, b.length);
    for (let i = 0; i < largo; i += 1) {
      const va = i < a.length ? a[i] : a[a.length - 1];
      const vb = i < b.length ? b[i] : b[b.length - 1];
      if ((va ?? '') !== (vb ?? '')) return true;
    }
    return false;
  };
  return {
    n: antes.length !== ahora.length,
    kg: difiere('targetKg'),
    reps: difiere('targetReps'),
    rir: difiere('targetRir'),
  };
};

/**
 * Lo mismo, línea a línea y cifra a cifra, para la fila en tabla. Cada serie
 * se compara con la que ocupaba su sitio (o con la última, si no existía); el
 * número de una línea, con el de la línea que ocupaba su sitio, agrupada igual.
 *
 * @returns una entrada por grupo, `{ n, reps, kg, rir: [bool por serie] }`, o
 *   `null` en cada una sin anterior.
 */
export const marcasDeGrupos = (antes, grupos = [], { separarPrimera = false } = {}) => {
  if (!Array.isArray(antes)) return grupos.map(() => null);
  const previos = gruposDeSeries(antes, { separarPrimera });
  return grupos.map((g, gi) => {
    const suyas = g.sets.map((_, j) => antes[g.desde + j] ?? antes[antes.length - 1]);
    const distinta = (campo) => g.sets.map((s, j) => texto(s?.[campo]) !== texto(suyas[j]?.[campo]));
    return {
      n: previos[gi]?.n !== g.n,
      reps: distinta('targetReps').some(Boolean),
      kg: distinta('targetKg').some(Boolean),
      rir: distinta('targetRir'),
    };
  });
};

/**
 * El esquema de repeticiones como lo escribe la fila desde siempre: «3 × 8-10»,
 * «3 × 6-8 / 8-10 / 8-12» (una rampa) o «2 × 6-8 / 1 × 8-12».
 */
export const esquemaEnLinea = (sets = []) => {
  const tramos = [];
  for (const s of sets || []) {
    const reps = texto(s?.targetReps);
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.reps === reps) ultimo.n += 1;
    else tramos.push({ n: 1, reps });
  }
  if (tramos.length === 0) return '';
  if (tramos.length === 1) return `${tramos[0].n} × ${tramos[0].reps || '—'}`;
  if (tramos.every((t) => t.n === 1)) return `${tramos.length} × ${tramos.map((t) => t.reps || '—').join(' / ')}`;
  return tramos.map((t) => `${t.n} × ${t.reps || '—'}`).join(' / ');
};

/**
 * La pauta en texto corrido, para la bitácora. Sin carga ni RIR, el esquema
 * de siempre; con ellos, una línea por grupo y sin comprimir nada:
 * «1 × 4-6 · 140 · RIR 1 / 2 × 8-10 · 115 · RIR 2 1».
 */
export const pautaDicha = (sets = []) => {
  if (!pideCampo(sets, 'targetKg') && !pideCampo(sets, 'targetRir')) return esquemaEnLinea(sets);
  return gruposDeSeries(sets)
    .map((g) => {
      const c = celdasDeGrupo(g);
      const rir = c.rir.filter(Boolean).length > 0 ? `RIR ${c.rir.map((r) => r || '–').join(' ')}` : null;
      return [`${c.n} × ${c.reps || '—'}`, c.kg || null, rir].filter(Boolean).join(' · ');
    })
    .join(' / ');
};
