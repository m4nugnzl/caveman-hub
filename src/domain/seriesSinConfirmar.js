/**
 * LAS SERIES QUE EL SERVIDOR TODAVÍA NO TIENE, puestas encima del programa.
 *
 * El teléfono anota cada campo de cada serie por su cuenta (`log_session_set`),
 * y hay dos momentos en los que lo que enseña la pantalla y lo que tiene el
 * servidor no coinciden:
 *
 *   · las que esperan en la cola —sin red, o en vuelo—, cuando el programa se
 *     vuelve a pedir: lo que llega no las tiene todavía;
 *   · y las que el servidor rechazó (`lib/seriesNoGuardadas`), al recargar: no
 *     están en ningún programa, solo en el navegador.
 *
 * En los dos casos se ponen encima con la misma regla con la que se escribieron
 * (`withSessionSet`), para que nadie vea desaparecer lo que acaba de anotar.
 */

import { buildSessionFromPlan, sessionsOf, withSessionSet } from './sessions';

/**
 * El programa con estas series puestas. Cada payload es el de `persistSet`:
 * `{ weekNumber, sessionId, date, dayName, exercise, setIndex, field, value, sub }`.
 *
 * Si la sesión no existe todavía se crea desde su día, con el MISMO id: es el
 * que manda el teléfono, y el servidor lo respeta. Una serie cuyo día ya no
 * está en esa semana no tiene dónde ir y se salta: sigue contada donde esté
 * (en la cola o entre las no guardadas), pero no se inventa un día para ella.
 *
 * Devuelve el mismo objeto si no ha cambiado nada.
 */
export const conSeriesSinConfirmar = (program, payloads) => {
  if (!program || !Array.isArray(program.microcycles) || !payloads?.length) return program;

  let microcycles = program.microcycles;
  for (const p of payloads) {
    if (!p?.exercise?.id || !Number.isInteger(p.setIndex) || !p.field) continue;
    const at = microcycles.findIndex((m) => m.weekNumber === p.weekNumber);
    if (at < 0) continue;
    const micro = microcycles[at];

    let sessions = sessionsOf(micro);
    let session = p.sessionId ? sessions.find((s) => s.id === p.sessionId) : null;
    if (!session) {
      const day = (micro.days || []).find((d) => d.dayName === p.dayName);
      if (!day) continue;
      session = { ...buildSessionFromPlan(day, p.date), ...(p.sessionId ? { id: p.sessionId } : {}) };
      sessions = [...sessions, session];
    }

    const puesta = withSessionSet(session, p.exercise, p.setIndex, p.field, p.value, p.sub ?? null);
    microcycles = microcycles.map((m, i) =>
      i === at ? { ...m, sessions: sessions.map((s) => (s.id === session.id ? puesta : s)) } : m
    );
  }

  return microcycles === program.microcycles ? program : { ...program, microcycles };
};

/**
 * ¿A QUÉ DÍA VA AHORA ESTA SERIE? Lo pregunta quien recoloca una serie que el
 * servidor rechazó porque su día o su ejercicio ya no estaban en el plan.
 *
 *   · Si su sesión existe, manda la sesión: renombrar una hoja se lleva sus
 *     sesiones con ella (`renameBlockSessionIn`), así que el nombre nuevo es el
 *     de la sesión. Vale si ese día sigue teniendo el ejercicio.
 *   · Si no existe —era la primera serie—, el día de esa semana que tiene ese
 *     ejercicio, por su id. Solo si hay UNO: con dos, adivinar sería escribir
 *     la serie en la sesión de otra hoja.
 *
 * `null` si no tiene sitio: la hoja se quitó, o el ejercicio.
 */
export const diaDeLaSerie = (program, p) => {
  const micro = (program?.microcycles || []).find((m) => m.weekNumber === p?.weekNumber);
  const id = p?.exercise?.id;
  if (!micro || !id) return null;
  const dias = micro.days || [];
  const tiene = (d) => (d.exercises || []).some((e) => e.id === id);

  const sesion = p.sessionId ? sessionsOf(micro).find((s) => s.id === p.sessionId) : null;
  if (sesion) {
    const dia = dias.find((d) => d.dayName === sesion.dayName);
    return dia && tiene(dia) ? dia.dayName : null;
  }

  const candidatos = dias.filter(tiene);
  return candidatos.length === 1 ? candidatos[0].dayName : null;
};
