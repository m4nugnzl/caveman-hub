import { addDays } from '@/lib/dates';
import { kindMeta } from '@/domain/calendar';
import { metricColor } from '@/domain/metrics';

/**
 * La tinta de un refeed o un diet break: la de su tipo de evento
 * (`EVENT_KINDS`), la misma en la Gráfica, el Calendario, las marcas y las
 * tarjetas. El refeed, violeta: se distingue de un vistazo de las kcal (ámbar)
 * y los pasos (rosa), y no pisa nada de la línea (el teal es Definición y el
 * rosa rojo, Enfermedad). El diet break, violeta claro: de la misma familia,
 * más suave (25 sep).
 */
export const tintaDeIntervencion = (evento) => kindMeta(evento?.kind).color;

/**
 * La tinta de CUALQUIER intervención (`domain/intervenciones.js`): la de su
 * evento; un cambio de dieta, la de las kcal (es lo que cambia); un bloque
 * nuevo, gris: el entreno no tiene color propio en la línea.
 */
export const tintaDe = (x) =>
  x.evento ? tintaDeIntervencion(x.evento) : x.tipo === 'dieta' ? metricColor('kcals') : 'var(--text-secondary)';

/**
 * LOS HECHOS DE LA TEMPORADA, juntos cuando se pisan en pantalla: a la escala
 * de un año, tres vacaciones en tres meses son una cápsula «3 vacaciones», y
 * al pulsarla se ve el detalle de cada una. Más cerca van sueltos.
 *
 * @param pxPorDia los píxeles de un día en la escala actual.
 * @param aire     los píxeles que tienen que separarlos para ir sueltos.
 * @returns hechos `{ id, kind, date, hasta, title, grupo, mezcla }`: `grupo` es
 *   la lista de los eventos que representa (uno si va suelto) y `mezcla`, si
 *   junta tipos distintos (entonces va sin la tinta de ninguno).
 */
export const agruparHechos = (hechos, pxPorDia, aire = 8) => {
  const salida = [];
  for (const h of [...hechos].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const hasta = h.hasta && h.hasta > h.date ? h.hasta : h.date;
    const ultimo = salida[salida.length - 1];
    const hueco = ultimo ? ((Date.parse(`${h.date}T00:00:00Z`) - Date.parse(`${ultimo.hasta}T00:00:00Z`)) / 86400000 - 1) * pxPorDia : Infinity;
    if (ultimo && hueco < aire) {
      ultimo.grupo.push(h);
      if (hasta > ultimo.hasta) ultimo.hasta = hasta;
      ultimo.id = `grupo-${ultimo.grupo[0].id || ultimo.grupo[0].date}`;
      ultimo.mezcla = ultimo.grupo.some((e) => e.kind !== ultimo.grupo[0].kind);
      continue;
    }
    salida.push({ ...h, hasta, grupo: [h] });
  }
  return salida;
};

/* Cómo se cuenta cada tipo: uno y varios. */
const CUENTA = {
  refeed: ['1 refeed', 'refeeds'],
  diet_break: ['1 diet break', 'diet breaks'],
  rest: ['unas vacaciones', 'vacaciones'],
  race: ['1 competición', 'competiciones'],
  illness: ['1 enfermedad', 'enfermedades'],
};

/** «Refeed», «3 refeeds», «2 refeeds y 1 diet break». */
export const etiquetaDeGrupo = (eventos) => {
  if (eventos.length === 1) return kindMeta(eventos[0].kind).label;
  const cuenta = new Map();
  for (const e of eventos) cuenta.set(e.kind, (cuenta.get(e.kind) || 0) + 1);
  const partes = [...cuenta].map(([kind, n]) => {
    const [uno, varios] = CUENTA[kind] || [`1 ${kindMeta(kind).label.toLowerCase()}`, kindMeta(kind).label.toLowerCase()];
    return n === 1 ? uno : `${n} ${varios}`;
  });
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0];
};

/**
 * LA TENDENCIA DEL PESO: la media móvil de los últimos `dias` días, día a día
 * (24 sep 2026). Es la línea del peso cuando la gráfica va por días; por
 * semanas manda la media de cada semana.
 *
 * Mira hacia atrás —la del martes es la de los siete días que acaban el
 * martes—: una media centrada usaría pesajes que el martes aún no existían.
 * Con menos de `minimo` pesajes en la ventana, ese día no tiene tendencia y la
 * línea se corta: el dato que falta no se inventa. Dos pesajes el mismo día
 * cuentan como uno, su media.
 *
 * @param pesajes `[{ date, weight }]`, en cualquier orden.
 * @returns `[{ fecha, valor, n }]`, del primer pesaje al último.
 */
export const mediaMovil = (pesajes, { dias = 7, minimo = 2 } = {}) => {
  const porDia = new Map();
  for (const p of pesajes || []) {
    if (!p?.date || typeof p.weight !== 'number' || !Number.isFinite(p.weight)) continue;
    const d = porDia.get(p.date) || { suma: 0, n: 0 };
    porDia.set(p.date, { suma: d.suma + p.weight, n: d.n + 1 });
  }
  const orden = [...porDia].map(([fecha, d]) => ({ fecha, peso: d.suma / d.n })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (orden.length === 0) return [];
  const salida = [];
  let desde = 0;
  let hasta = 0;
  let suma = 0;
  const ultimo = orden[orden.length - 1].fecha;
  for (let f = orden[0].fecha; f <= ultimo; f = addDays(f, 1)) {
    while (hasta < orden.length && orden[hasta].fecha <= f) suma += orden[hasta++].peso;
    const inicio = addDays(f, -(dias - 1));
    while (desde < hasta && orden[desde].fecha < inicio) suma -= orden[desde++].peso;
    const n = hasta - desde;
    if (n >= minimo) salida.push({ fecha: f, valor: suma / n, n });
  }
  return salida;
};
