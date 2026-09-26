import { directionById } from '@/domain/goals';
import { ritmoTexto } from '@/domain/semanasDelPlan';
import { dayMonthMaybeYear, localeNumber, shortDate } from '@/lib/dates';

/**
 * LAS VERSIONES DEL PLAN (letra f, 26 sep 2026).
 *
 * Una versión es la foto del plan —fases y destino— que guarda la base cada
 * vez que se cambia (0140). Aquí se leen para la lista de «Versiones», para
 * dibujar una como sombra sobre la ruta y la banda esperada, y para decir en
 * palabras en qué se diferencia del plan de ahora. Datos, no juicios: qué
 * estaba y qué está.
 *
 * La más reciente ES el plan de ahora (la base la guarda con cada cambio); la
 * más antigua, el original. Restaurar (0147) deja una nueva.
 */

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Una fila de `client_plan_versions`, con las fases en la forma de la app. */
export const versionDeFila = (row) => ({
  id: row.id,
  creada: row.created_at,
  /* Cómo quedó el plan: la hora del último cambio que absorbió la foto. */
  tocada: row.tocada_en || row.created_at,
  quien: row.created_by ?? null,
  nota: row.nota || '',
  fases: (Array.isArray(row.fases) ? row.fases : []).map((f) => ({
    id: f.id,
    title: f.title || '',
    direction: f.direction,
    ratePct: num(f.ratePct) ?? 0,
    startsOn: f.startsOn,
    endsOn: f.endsOn ?? null,
    note: f.note || '',
    nextOptions: Array.isArray(f.nextOptions) ? f.nextOptions : null,
    nextQuestion: typeof f.nextQuestion === 'string' ? f.nextQuestion : '',
    replanteos: Array.isArray(f.replanteos) ? f.replanteos : null,
  })),
  destino: row.destino?.fecha
    ? {
        date: row.destino.fecha,
        title: row.destino.titulo || '',
        kind: row.destino.kind || null,
        pesoObjetivoKg: num(row.destino.pesoObjetivoKg),
      }
    : null,
});

/** «12 sep, 10:24»: cuándo quedó así. */
export const cuandoDeLaVersion = (v) => dayMonthMaybeYear(v.tocada, { conHora: true });

/** La nota con la que se guarda una restauración: «Restaurada la del 12 sep, 10:24» (el mismo día puede haber varias). */
export const notaDeRestaurar = (v) => `Restaurada la del ${cuandoDeLaVersion(v)}`;

/**
 * Quién la dejó: «Tú», el nombre de quien del equipo, o «Sin autor» (la
 * sembró la base al aplicar la 0140, o un proceso sin sesión).
 */
export const quienDeLaVersion = (v, { yo = null, miembros = [] } = {}) => {
  if (!v.quien) return 'Sin autor';
  if (v.quien === yo) return 'Tú';
  return miembros.find((m) => m.profileId === v.quien)?.name || 'Otra persona del equipo';
};

const nombre = (f) => f.title || directionById(f.direction)?.label || 'Fase';
const tramo = (f) => `del ${shortDate(f.startsOn)} ${f.endsOn ? `al ${shortDate(f.endsOn)}` : 'en adelante'}`;
const kgTexto = (v) => `${localeNumber(v, { maximumFractionDigits: 1 })} kg`;

/**
 * En qué se diferencia una versión del plan de ahora, en frases cortas y en
 * el orden del calendario. Cada una dice lo de la versión y, entre
 * paréntesis, lo de ahora. Vacío si son el mismo plan.
 *
 * @param version `versionDeFila(...)`.
 * @param ahora   `{ fases, destino, objetivoKg }`: el plan vigente.
 */
export const cambiosDeLaVersion = (version, { fases = [], destino = null, objetivoKg = null } = {}) => {
  const lineas = [];
  const deAhora = new Map(fases.map((f) => [f.id, f]));
  const deEntonces = new Map(version.fases.map((f) => [f.id, f]));
  const todas = [...version.fases, ...fases.filter((f) => !deEntonces.has(f.id))].sort((a, b) => String(a.startsOn).localeCompare(String(b.startsOn)));

  for (const f of todas) {
    const antes = deEntonces.get(f.id);
    const hoy = deAhora.get(f.id);
    if (antes && !hoy) {
      lineas.push({ id: `fase-${f.id}`, texto: `${nombre(antes)}, ${tramo(antes)} (ahora no está)` });
      continue;
    }
    if (!antes && hoy) {
      lineas.push({ id: `fase-${f.id}`, texto: `${nombre(hoy)}: no estaba (ahora ${tramo(hoy)})` });
      continue;
    }
    const partes = [];
    if (antes.startsOn !== hoy.startsOn) partes.push(`empezaba el ${shortDate(antes.startsOn)} (ahora el ${shortDate(hoy.startsOn)})`);
    if ((antes.endsOn || null) !== (hoy.endsOn || null)) {
      partes.push(
        antes.endsOn
          ? `acababa el ${shortDate(antes.endsOn)} (ahora ${hoy.endsOn ? `el ${shortDate(hoy.endsOn)}` : 'sin final'})`
          : `no tenía final (ahora el ${shortDate(hoy.endsOn)})`
      );
    }
    if (antes.direction !== hoy.direction || Number(antes.ratePct) !== Number(hoy.ratePct)) {
      partes.push(`${ritmoTexto(antes.direction, antes.ratePct)} (ahora ${ritmoTexto(hoy.direction, hoy.ratePct)})`);
    }
    if (nombre(antes) !== nombre(hoy)) partes.push(`se llamaba «${nombre(antes)}»`);
    if (JSON.stringify(antes.replanteos || null) !== JSON.stringify(hoy.replanteos || null)) partes.push('otros replanteos');
    if (JSON.stringify(antes.nextOptions || null) !== JSON.stringify(hoy.nextOptions || null) || (antes.nextQuestion || '') !== (hoy.nextQuestion || '')) {
      partes.push('otro punto de decisión');
    }
    if ((antes.note || '') !== (hoy.note || '')) partes.push('otra nota');
    if (partes.length) lineas.push({ id: `fase-${f.id}`, texto: `${nombre(hoy)}: ${partes.join('; ')}` });
  }

  const d0 = version.destino;
  if (d0 && (!destino || d0.date !== destino.date || (d0.title || '') !== (destino.title || ''))) {
    const suyo = `${d0.title || 'Destino'} el ${shortDate(d0.date)}`;
    const hoy = destino ? `${destino.title || 'Destino'} el ${shortDate(destino.date)}` : 'sin destino';
    lineas.push({ id: 'destino', texto: `Destino: ${suyo} (ahora ${hoy})` });
  } else if (!d0 && destino) {
    lineas.push({ id: 'destino', texto: `Sin destino (ahora ${destino.title || 'Destino'} el ${shortDate(destino.date)})` });
  }
  if (d0 && (d0.pesoObjetivoKg ?? null) !== (objetivoKg ?? null)) {
    const suyo = d0.pesoObjetivoKg !== null ? kgTexto(d0.pesoObjetivoKg) : 'sin peso objetivo';
    const hoy = objetivoKg !== null ? kgTexto(objetivoKg) : 'sin peso objetivo';
    lineas.push({ id: 'peso', texto: `Peso objetivo: ${suyo} (ahora ${hoy})` });
  }
  return lineas;
};

/**
 * Qué versiones enseña la lista sin pedirlo: se esconden las que no cambian
 * nada visible respecto a la anterior —fases, destino, peso objetivo— y no
 * tienen nota (guardados de pruebas, un tipo de destino que no se pinta). La
 * de ahora y la original, siempre.
 *
 * @param versiones De la más nueva a la más antigua.
 * @returns `{ visibles, ocultas }`: las visibles en el mismo orden, y cuántas no.
 */
export const versionesALaVista = (versiones = []) => {
  const ultima = versiones.length - 1;
  const visibles = versiones.filter((v, i) => {
    if (i === 0 || i === ultima || v.nota) return true;
    const anterior = versiones[i + 1];
    const ahora = { fases: anterior.fases, destino: anterior.destino, objetivoKg: anterior.destino?.pesoObjetivoKg ?? null };
    return cambiosDeLaVersion(v, ahora).length > 0;
  });
  return { visibles, ocultas: versiones.length - visibles.length };
};
