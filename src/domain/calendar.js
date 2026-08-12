/**
 * Calendario del cliente.
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 * El check-in semanal no tiene día. «Pésate tres veces» sin decir cuándo se
 * convierte en «me peso cuando me acuerdo», y ahí se acaba la comparabilidad: el
 * promedio de una semana con tres pesajes de lunes a miércoles no es comparable
 * con el de otra con tres de viernes a domingo.
 *
 * Aquí el cliente fija SU día —el que le encaje— y a partir de ahí el calendario
 * lo repite, marca lo cumplido y le deja apuntar lo suyo: una carrera, una semana
 * de viaje, una comida fuera. Esas notas no son adorno: explican los picos del peso
 * que si no parecen inexplicables.
 *
 * Todo son funciones puras sobre fechas ISO. El mes se genera aquí y no en el
 * componente para poder comprobarlo caso por caso: los meses que empiezan en
 * domingo y los años bisiestos son donde fallan estas cosas.
 */

import { toISODate, todayISO, weekStart } from '@/lib/dates';

const DAY_MS = 86400000;

/** Tipos de evento. `checkin` lo genera el sistema; el resto los pone la gente. */
export const EVENT_KINDS = [
  { id: 'checkin', label: 'Check-in', hint: 'Pesarse y subir las fotos', color: 'var(--accent)' },
  { id: 'appointment', label: 'Cita', hint: 'Sesión presencial, videollamada, revisión', color: 'var(--data-blue)' },
  { id: 'race', label: 'Competición', hint: 'Carrera, campeonato, prueba', color: 'var(--data-violet)' },
  { id: 'rest', label: 'Descanso', hint: 'Viaje, vacaciones, semana de descarga', color: 'var(--data-amber)' },
  { id: 'goal', label: 'Objetivo', hint: 'Una fecha a la que llegar', color: 'var(--data-pink)' },
  { id: 'note', label: 'Nota', hint: 'Cualquier otra cosa que quieras recordar', color: 'var(--data-slate)' },
];

export const kindMeta = (id) => EVENT_KINDS.find((k) => k.id === id) || EVENT_KINDS[EVENT_KINDS.length - 1];

/** Lunes = 0 … domingo = 6, que es el orden en el que se lee un calendario aquí. */
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const weekdayIndex = (date) => {
  const d = new Date(`${toISODate(date)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : (d.getUTCDay() + 6) % 7;
};

/**
 * Rejilla de un mes: siempre semanas completas de lunes a domingo, con los días
 * de los meses vecinos rellenados.
 *
 * Se rellenan a propósito en lugar de dejar huecos: una rejilla con huecos hace
 * que la primera semana del mes parezca más corta, y un check-in que cae en un día
 * de relleno tiene que verse igual —esa semana existe aunque el mes no la empiece.
 */
export const monthGrid = (year, month) => {
  const first = Date.UTC(year, month, 1);
  const start = Date.parse(`${weekStart(new Date(first).toISOString().slice(0, 10))}T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Semanas necesarias para cubrir el mes desde el lunes de su primera semana.
  const offset = Math.round((first - start) / DAY_MS);
  const weeks = Math.ceil((offset + daysInMonth) / 7);

  return Array.from({ length: weeks * 7 }, (_, i) => {
    const iso = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    const d = new Date(`${iso}T00:00:00Z`);
    return {
      date: iso,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month && d.getUTCFullYear() === year,
      isToday: iso === todayISO(),
      weekStart: weekStart(iso),
    };
  });
};

export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const monthLabel = (year, month) => `${MONTH_NAMES[month]} de ${year}`;

/** Mes anterior / siguiente sin liarse con el año. */
export const shiftMonth = (year, month, delta) => {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
};

/**
 * Días de check-in del mes, según el día elegido por el cliente.
 *
 * ── Por qué se derivan y no se guardan ──────────────────────────────────────
 * Guardar una fila por cada check-in futuro obligaría a generarlas para siempre y
 * a borrarlas y regenerarlas cada vez que el cliente cambie de día. Derivarlos del
 * día de la semana es una cuenta, y cambiar de día es cambiar un número.
 *
 * Solo se materializan como fila los que TIENEN algo: el check-in entregado vive en
 * `check_ins`, no aquí.
 */
export const checkInDates = (grid, weekday) => {
  if (weekday === null || weekday === undefined) return new Set();
  return new Set(grid.filter((cell) => weekdayIndex(cell.date) === weekday).map((cell) => cell.date));
};

/** Eventos indexados por fecha, para pintar la rejilla sin recorrer la lista N veces. */
export const eventsByDate = (events) => {
  const map = new Map();
  for (const event of events) {
    if (!map.has(event.date)) map.set(event.date, []);
    map.get(event.date).push(event);
  }
  // Los del sistema primero, y dentro de cada grupo por orden de creación.
  const order = EVENT_KINDS.map((k) => k.id);
  for (const list of map.values()) {
    list.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  }
  return map;
};

/**
 * El próximo check-in a partir de hoy, o null si el cliente no ha elegido día.
 *
 * Es la cifra que se le enseña al cliente: «te toca el jueves» dice más que un
 * calendario entero.
 */
export const nextCheckIn = (weekday, from = todayISO()) => {
  if (weekday === null || weekday === undefined) return null;
  const today = weekdayIndex(from);
  if (today === null) return null;
  const ahead = (weekday - today + 7) % 7;
  return new Date(Date.parse(`${from}T00:00:00Z`) + ahead * DAY_MS).toISOString().slice(0, 10);
};
