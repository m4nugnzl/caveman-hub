import { e1rm, isRecord, isSetLogged } from '@/domain/sessions';
import { localeNumber } from '@/lib/dates';
import { round, toNum } from '@/lib/num';

/**
 * ══ LAS CUENTAS DEL MODO ENTRENO ═════════════════════════════════════════════
 *
 * Lo que las dos pantallas de la sesión —el teléfono y el puesto del monitor—
 * necesitan saber y no es pintar: cuánto sube un «+», cuál es la serie que toca
 * ahora, qué ha sido récord y contra qué se mide un ejercicio.
 *
 * Está fuera de los componentes por lo mismo que `hojas.js`: son reglas, las
 * leen dos pantallas que no se parecen y es lo único de todo esto que merece una
 * prueba. Ver `docs/la-sesion-manda.md`.
 */

/**
 * EL PASO DE CADA CAMPO, en las unidades del gimnasio: un disco de 1,25 por
 * lado, una repetición, un punto de RIR.
 *
 * ── No es una propuesta, y por eso no lleva cifra ──────────────────────────
 * El 11 de septiembre murieron los botones «−2,5 / +2,5» de la pastilla del
 * teclado: un signo delante de una carga ESCRITO se lee como recomendación. El
 * −/+ de aquí no dice cuánto; es un mando que mueve el número que tienes
 * delante, igual que la rueda de una báscula. Quién decide subir sigue siendo
 * quien entrena. Ver `la app no receta`.
 */
export const PASO = { kg: 2.5, reps: 1, rir: 1 };

/** Un número como lo guarda una serie: sin ceros de más y con punto. */
const comoCampo = (n) => String(round(n, 2));

/**
 * El valor de un campo después de pulsar − o +.
 *
 * ── El vacío parte de la vez anterior ─────────────────────────────────────
 * El primer toque en un campo en blanco no pone 2,5 kg: pone lo que levantaste
 * la última vez en ESA serie. Es donde empieza a pensar cualquiera que entrena
 * un bloque, y lo que evita pulsar «+» treinta y dos veces para llegar a 80.
 * Sin vez anterior, sí: arranca en un paso.
 *
 * El RIR es la excepción del cero: «0» es una respuesta —fallo—, mientras que
 * cero kilos o cero repeticiones es no haber puesto nada.
 *
 * @param {{ valor: string, previo?: string|number|null, campo: 'kg'|'reps'|'rir', dir: 1|-1 }} args
 * @returns {string} lo que se escribe en el campo; `''` es dejarlo vacío.
 */
export const pasoDelCampo = ({ valor, previo = null, campo, dir }) => {
  const paso = PASO[campo] ?? 1;
  const actual = toNum(valor);

  if (actual === null) {
    const antes = toNum(previo);
    const valeElAnterior = antes !== null && (campo === 'rir' ? antes >= 0 : antes > 0);
    if (valeElAnterior) return comoCampo(antes);
    if (dir > 0) return comoCampo(paso);
    return campo === 'rir' ? '0' : '';
  }

  return comoCampo(Math.max(0, actual + dir * paso));
};

/**
 * LA SERIE QUE TOCA después de `desde`: la primera sin hacer, dando la vuelta.
 *
 * Dando la vuelta porque se salta: quien hace la serie 3 antes que la 2 —porque
 * la máquina estaba libre, porque se equivocó de fila— tiene que volver a
 * encontrarse la 2 abierta al acabar la 4, no un «hecho» que miente.
 *
 * @param {{ hecha: boolean }[]} series
 * @param {number} desde índice de la que se acaba de cerrar; `-1` es «desde el
 *   principio».
 * @returns {number} el índice, o `-1` si están todas hechas.
 */
export const siguientePorHacer = (series, desde = -1) => {
  const n = (series || []).length;
  for (let k = 1; k <= n; k += 1) {
    const i = (((desde + k) % n) + n) % n;
    if (!series[i]?.hecha) return i;
  }
  return -1;
};

/** «80 kg · 8» — una serie dicha en corto; sin kilos es «8 reps». */
export const serieEnCorto = ({ kg, reps }) => {
  const k = toNum(kg);
  const r = toNum(reps);
  if (!r) return '—';
  return k > 0 ? `${localeNumber(k, { maximumFractionDigits: 2 })} kg · ${r}` : `${r} reps`;
};

/**
 * LOS RÉCORDS DE ESTA SESIÓN: la mejor serie de cada ejercicio que ha superado
 * su listón de antes.
 *
 * Una por ejercicio y no cada serie que lo supere: tres filas de «press banca»
 * en el cierre son el mismo récord contado tres veces. Y con lo que ha
 * mejorado, dicho en la cifra que mejoró —kilos si subió el peso, repeticiones
 * si fue con el mismo—, porque eso es lo que se recuerda.
 *
 * Sin listón no hay récord: la primera vez que se hace un ejercicio no se
 * celebra nada, se registra (`isRecord`).
 *
 * @param {{ name: string, sets: object[] }[]} exercises los de la sesión, con lo anotado.
 * @param {Map<string, { kg: string, reps: string, e1rm: number }>} mejores `bestSetsBefore`.
 */
export const recordsDeLaSesion = (exercises, mejores) =>
  (exercises || []).flatMap((ex) => {
    const liston = mejores?.get(ex.name);
    let mejor = null;
    for (const set of ex.sets || []) {
      if (!isSetLogged(set) || !isRecord(set, liston)) continue;
      if (!mejor || e1rm(set.kg, set.reps) > e1rm(mejor.kg, mejor.reps)) mejor = set;
    }
    if (!mejor) return [];

    const masKg = (toNum(mejor.kg) ?? 0) - (toNum(liston.kg) ?? 0);
    const masReps = (toNum(mejor.reps) ?? 0) - (toNum(liston.reps) ?? 0);
    return [
      {
        nombre: ex.name,
        serie: serieEnCorto(mejor),
        mejora:
          masKg > 0
            ? `+${localeNumber(round(masKg, 2), { maximumFractionDigits: 2 })} kg`
            : masReps > 0
              ? `+${masReps} ${masReps === 1 ? 'rep' : 'reps'}`
              : null,
      },
    ];
  });

/**
 * LO HECHO, EJERCICIO A EJERCICIO: cuántas series y cuántos kilos.
 *
 * Solo los que tienen algo anotado — un ejercicio que no se hizo no es «0
 * series», es una fila que no hay que leer.
 */
export const porEjercicio = (exercises) =>
  (exercises || [])
    .map((ex) => {
      const hechas = (ex.sets || []).filter(isSetLogged);
      if (hechas.length === 0) return null;
      const kg = hechas.reduce((n, s) => n + (toNum(s.kg) ?? 0) * (toNum(s.reps) ?? 0), 0);
      return { nombre: ex.name, series: hechas.length, kg: Math.round(kg) };
    })
    .filter(Boolean);

/**
 * CONTRA QUÉ TE MIDES en un ejercicio: sus últimas veces, serie a serie, y el
 * tonelaje de cada una.
 *
 * Es lo que se mira ANTES de decidir el peso, y por eso el puesto del monitor
 * lo pone al lado de la sesión en vez de detrás de un botón de historial.
 *
 * ── Hechos, sin flecha ─────────────────────────────────────────────────────
 * Se marca la serie más fuerte de la tabla (la de mayor 1RM estimado) porque
 * es la que alguien busca con los ojos; y el cambio de tonelaje entre la
 * primera y la última fila se dice en tanto por ciento. Ninguna de las dos
 * propone nada: dicen lo que pasó. Ver `la app no receta`.
 *
 * @param {ReturnType<import('@/domain/sessions').historialDeEjercicio>} historial
 *   de la más reciente a la más antigua, que es como lo devuelve el dominio.
 * @param {number} cuantas cuántas veces enseñar.
 * @returns {null | {
 *   columnas: number,
 *   filas: { weekNumber: number, date: string|null, celdas: ({ texto: string, pico: boolean }|null)[] }[],
 *   tonelajes: number[],
 *   cambio: number|null,
 * }}
 */
export const contraQueTeMides = (historial, cuantas = 4) => {
  const dias = (historial || []).slice(0, cuantas).reverse();
  if (dias.length === 0) return null;

  const columnas = Math.min(4, Math.max(...dias.map((d) => d.sets.length)));

  let pico = 0;
  for (const d of dias) {
    for (const s of d.sets.slice(0, columnas)) pico = Math.max(pico, e1rm(s.kg, s.reps));
  }

  const filas = dias.map((d) => ({
    weekNumber: d.weekNumber,
    date: d.date,
    celdas: Array.from({ length: columnas }, (_, i) => {
      const s = d.sets[i];
      if (!s) return null;
      return { texto: serieEnCorto(s), pico: pico > 0 && e1rm(s.kg, s.reps) >= pico - 1e-9 };
    }),
  }));

  const tonelajes = dias.map((d) =>
    Math.round(d.sets.reduce((n, s) => n + (toNum(s.kg) ?? 0) * (toNum(s.reps) ?? 0), 0))
  );
  const primero = tonelajes[0];
  const ultimo = tonelajes[tonelajes.length - 1];
  const cambio =
    tonelajes.length > 1 && primero > 0 ? Math.round(((ultimo - primero) / primero) * 100) : null;

  return { columnas, filas, tonelajes, cambio };
};
