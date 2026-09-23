import { toNum, round } from '@/lib/num';
import { weekStart } from '@/lib/dates';
import { FOLDS_LABELS, PERIMETER_LABELS, pliegesDe, semanaDelRegistro } from './anthropometry';
import { photoWeek, weekStartOfProgramWeek } from './photos';

/**
 * «TUS SEMANAS»: el rastro del cliente, una semana detrás de otra.
 *
 * ══ Por qué existe ═════════════════════════════════════════════════════════
 *
 * El rastro vivía en `/mi/evolucion/medidas`, que montaba la báscula del
 * ENTRENADOR en versión cliente: siete casillas escribibles y una tabla con
 * papelera. Era un segundo sitio donde apuntar el peso —el dueño ya tumbó las
 * tres básculas de la Revisión el 14 de septiembre— y el 19 la llamó «un
 * resquicio de lo que antes existía».
 *
 * Lo que de verdad servía de allí se lee aquí, agrupado como se vive: por
 * semanas. Qué pesaste y la media, las medidas que tomaste, tus fotos, si la
 * entregaste y qué te contestó. **Aquí no se escribe ningún peso**: se apunta
 * en «Tu peso de hoy». Lo único que se hace es QUITAR un pesaje mal apuntado,
 * que es la corrección que la papelera de la pantalla vieja permitía.
 *
 * Es una LECTURA de lo que ya existe —la antropometría, los check-ins, las
 * revisiones cerradas y las fotos—, sin ninguna estructura nueva.
 *
 * ── La semana es la natural, de lunes a domingo ────────────────────────────
 * La misma partición que usan la media de la Revisión (`weekEntries`) y las
 * fotos (`weekStartOfProgramWeek`). Con cadencia quincenal, la entrega cuelga
 * del lunes de su periodo, que es el de la primera de las dos.
 */

const media = (valores) =>
  valores.length > 0 ? round(valores.reduce((a, b) => a + b, 0) / valores.length, 2) : null;

/* Lo medido en un registro, con su nombre: los perímetros, los pliegues uno a
   uno y lo que el entrenador haya decidido medir. Lo que no se midió no sale. */
const medidasDe = (log, catalogo) => {
  const lista = [];
  for (const [k, v] of Object.entries(log.perimeters || {})) {
    if (toNum(v) > 0) lista.push({ id: `p-${k}`, etiqueta: PERIMETER_LABELS[k] || k, valor: toNum(v), unidad: 'cm' });
  }
  const pliegues = pliegesDe(log) || {};
  for (const [k, v] of Object.entries(pliegues)) {
    if (toNum(v) > 0) lista.push({ id: `f-${k}`, etiqueta: FOLDS_LABELS[k] || k, valor: toNum(v), unidad: 'mm' });
  }
  for (const [id, v] of Object.entries(log.medidas || {})) {
    if (v === null || v === '' || v === undefined) continue;
    const def = catalogo.find((m) => m.id === id);
    /* Sin su definición no se sabe ni cómo se llama ni en qué se mide: mejor
       no enseñarla que enseñar un identificador. */
    if (!def) continue;
    lista.push({ id: `m-${id}`, etiqueta: def.label, valor: v, unidad: def.unit || '' });
  }
  return lista;
};

/**
 * Las semanas con algo tuyo, de la más reciente a la más antigua.
 *
 * @param {{
 *   history?: object[],     antropometría del cliente
 *   checkIns?: object[],    sus entregas (`loadCheckInHistory`)
 *   revisiones?: object[],  las cerradas, con su vídeo (`reviewHistory`)
 *   fotos?: object[],       sus fotos de progreso
 *   startDate?: string|null su alta: ancla las fotos a su semana
 *   catalogo?: object[],    las medidas de su protocolo, para nombrarlas
 *   hoy: string,            ISO; marca la semana en curso
 *   revisionDe?: (lunes) => object|null  `estadoDeRevision` de la semana: su
 *                           estado se cuenta por PERIODO (con cadencia
 *                           quincenal, las dos semanas son una entrega) y
 *                           dice si todavía se puede completar
 *   extras?: string[]       lunes que salen aunque no tengan nada: las
 *                           revisiones que todavía se pueden completar
 * }} datos
 */
export const semanasDelRastro = ({
  history = [],
  checkIns = [],
  revisiones = [],
  fotos = [],
  startDate = null,
  catalogo = [],
  hoy,
  revisionDe = null,
  extras = [],
}) => {
  const semanas = new Map();
  const de = (lunes) => {
    if (!semanas.has(lunes)) {
      semanas.set(lunes, { semana: lunes, pesajes: [], registrosConMedidas: [], fotos: [] });
    }
    return semanas.get(lunes);
  };

  for (const log of history) {
    /* La semana para la que CUENTA, que es la que su Revisión leyó: un pesaje
       apuntado dentro de la ventana de entrega tardía lleva el sello de la
       revisión que se entregó con él, y este rastro tiene que contar lo mismo
       que ella. Ver `semanaDelRegistro`. */
    const lunes = semanaDelRegistro(log);
    if (!lunes) continue;
    const peso = toNum(log.weight);
    const conMedidas = medidasDe(log, catalogo).length > 0;
    /* `conMedidas`: el pesaje comparte registro con medidas de ese día. Quitarlo
       es vaciar su peso, no borrar el registro, que se llevaría las medidas. */
    if (peso !== null) de(lunes).pesajes.push({ id: log.id, fecha: log.date, peso, conMedidas });
    if (conMedidas) de(lunes).registrosConMedidas.push(log);
  }

  for (const foto of fotos) {
    const n = photoWeek(foto, startDate);
    const lunes = n && startDate ? weekStartOfProgramWeek(startDate, n) : weekStart(foto.date);
    if (lunes) de(lunes).fotos.push(foto);
  }

  const entregas = new Map(checkIns.map((c) => [c.weekStart, c]));
  const cerradas = new Map(revisiones.map((r) => [r.weekStart, r]));
  /* Una entrega entregada o revisada es parte del rastro aunque esa semana no
     tenga nada más: es lo que se le mandó a su entrenador. */
  for (const c of checkIns) if (c.submittedAt || c.reviewedAt) de(c.weekStart);
  /* Una revisión que se puede completar sale aunque esa semana no apuntara
     nada: se le olvidó entrar, pero tiene los pesos en su báscula. */
  for (const lunes of extras) if (lunes) de(lunes);

  const actual = weekStart(hoy);
  const orden = [...semanas.values()].sort((a, b) => a.semana.localeCompare(b.semana));

  let anterior = null;
  const salida = orden.map((s) => {
    const pesajes = [...s.pesajes].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const m = media(pesajes.map((p) => p.peso));
    /* Las medidas de la semana son las del ÚLTIMO registro que las trae: si se
       midió dos veces, la buena es la segunda, como en la báscula. */
    const ultimoConMedidas = [...s.registrosConMedidas].sort((a, b) => a.date.localeCompare(b.date)).pop();
    const revision = revisionDe ? revisionDe(s.semana) : null;
    /* Por PERIODO cuando se sabe: el lunes exacto dejaba la segunda semana de
       una quincenal «sin entregar» con la entrega hecha. */
    const entrega = revision ? revision.entrega : entregas.get(s.semana) || null;
    const cerrada = cerradas.get(revision?.lunes || s.semana) || null;

    const fila = {
      semana: s.semana,
      esta: s.semana === actual,
      pesajes,
      media: m,
      mediaAnterior: anterior,
      medidas: ultimoConMedidas
        ? { fecha: ultimoConMedidas.date, lista: medidasDe(ultimoConMedidas, catalogo) }
        : null,
      fotos: s.fotos,
      estado: entrega?.reviewedAt
        ? 'revisada'
        : entrega?.submittedAt
          ? 'entregada'
          : revision?.estado === 'pendiente'
            ? s.semana < actual
              ? 'por entregar'
              : null
            : s.semana < actual
              ? 'sin entregar'
              : null,
      /* La revisión entera (`estadoDeRevision`): si se puede completar, hasta
         cuándo, y por qué no cuando no. `null` sin pauta de revisión. */
      revision,
      respuesta:
        cerrada && (cerrada.coachNotes || cerrada.video)
          ? { texto: cerrada.coachNotes || '', cuando: cerrada.reviewedAt, video: cerrada.video?.url || null }
          : null,
    };
    if (m !== null) anterior = m;
    return fila;
  });

  return salida.reverse();
};
