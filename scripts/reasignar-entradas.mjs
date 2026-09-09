/**
 * LO ANOTADO BAJO UN IDENTIFICADOR QUE YA NO SE NOMBRA.
 *
 * ══ Qué arregla ════════════════════════════════════════════════════════════
 *
 * Una sesión guarda lo que se levantó en `entries[].exerciseId`. Ese id era el
 * del ejercicio dentro de `microcycles[].days[]`, uno distinto por semana. Desde
 * que el plan vive en el bloque (`0086`), la pantalla nombra los ejercicios con
 * los ids del BLOQUE —uno para todas sus semanas—, así que en las semanas que no
 * fueron el molde del plan al migrar, la sesión y el plan hablan de lo mismo con
 * dos nombres distintos.
 *
 * La consecuencia no es un error: es que **los kilos dejan de verse**. La hoja
 * busca la entrada por el id del plan, no la encuentra, y pinta las casillas
 * vacías. Los datos están en la fila, intactos, sin ninguna pantalla que los
 * lea. En el proyecto real, al escribir esto: seis series de un cliente.
 *
 * `reparar-ids-del-plan.mjs` arregla el otro lado —que `days` diga los ids del
 * plan, que es lo que hace que se pueda REGISTRAR—; esto arregla lo ya
 * REGISTRADO, que ninguna proyección puede recuperar porque las sesiones no se
 * tocan al proyectar.
 *
 * ══ La regla, y por qué es tan estrecha ════════════════════════════════════
 *
 * Una entrada huérfana se reasigna solo cuando no hay ninguna duda de a quién
 * pertenece:
 *
 *   · el ejercicio del plan tiene EL MISMO NOMBRE, en el MISMO día;
 *   · ese ejercicio del plan no tiene ya su propia entrada —si la tiene, son dos
 *     cosas distintas y juntarlas sumaría series que nadie hizo—;
 *   · y hay exactamente UNA huérfana y UN candidato con ese nombre, así que la
 *     correspondencia no se elige: se deduce.
 *
 * Todo lo demás se queda como está. Una entrada huérfana cuyo nombre no está en
 * el plan de hoy NO es un fallo: es el historial de un ejercicio que el
 * entrenador cambió por otro, y sigue siendo verdad que ese día se hizo.
 *
 * No se toca ninguna serie: solo cambia el `exerciseId` de la entrada. El nombre
 * y el músculo se refrescan desde el plan, que es lo que ya hacen al escribir
 * tanto el navegador (`withSessionSet`) como la base de datos (`0101`).
 */

const clave = (name) => String(name || '').trim().toLowerCase();

/** Índice de una lista por nombre: `clave -> elementos`. */
const porNombre = (lista, nombreDe) => {
  const mapa = new Map();
  for (const item of lista) {
    const k = clave(nombreDe(item));
    if (!k) continue;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(item);
  }
  return mapa;
};

/**
 * Devuelve el programa con las entradas huérfanas reasignadas y la lista de lo
 * que ha cambiado, para poder enseñarlo antes de escribir nada.
 *
 * El programa que se le pasa tiene que ser el YA PROYECTADO
 * (`proyectarPlanEnDias`): es en `days` donde están los ids que la pantalla usa.
 *
 * @returns {{ program: object, cambios: Array<{semana:number, dayName:string, date:string, name:string, de:string, a:string, series:number}> }}
 */
export const reasignarEntradas = (program) => {
  const cambios = [];

  const microcycles = (program?.microcycles || []).map((micro) => {
    const sessions = (micro.sessions || []).map((ses) => {
      const dia = (micro.days || []).find((d) => d.dayName === ses.dayName);
      const entries = ses.entries || [];
      if (!dia || entries.length === 0) return ses;

      const idsDelPlan = new Set((dia.exercises || []).map((e) => e.id));
      const conEntrada = new Set(entries.map((e) => e.exerciseId));

      const huerfanas = entries.filter((e) => !idsDelPlan.has(e.exerciseId));
      if (huerfanas.length === 0) return ses;

      /* Los ejercicios del plan que este día tiene y esta sesión no anotó: los
         únicos destinos posibles. */
      const libres = (dia.exercises || []).filter((x) => !conEntrada.has(x.id));
      if (libres.length === 0) return ses;

      const candidatosDe = porNombre(libres, (x) => x.name);
      const huerfanasDe = porNombre(huerfanas, (e) => e.name);

      const destino = new Map();
      for (const [k, cuales] of huerfanasDe) {
        const candidatos = candidatosDe.get(k) || [];
        // Exactamente una a una, o no se toca: ver la regla en la cabecera.
        if (cuales.length !== 1 || candidatos.length !== 1) continue;
        destino.set(cuales[0], candidatos[0]);
      }
      if (destino.size === 0) return ses;

      return {
        ...ses,
        entries: entries.map((e) => {
          const ex = destino.get(e);
          if (!ex) return e;
          cambios.push({
            semana: micro.weekNumber,
            dayName: ses.dayName,
            date: ses.date,
            name: ex.name,
            de: e.exerciseId,
            a: ex.id,
            series: (e.sets || []).filter(
              (s) => String(s?.kg ?? '').trim() || String(s?.reps ?? '').trim() || String(s?.rir ?? '').trim()
            ).length,
          });
          return { ...e, exerciseId: ex.id, name: ex.name, muscle: ex.muscle ?? e.muscle };
        }),
      };
    });

    return sessions.some((s, i) => s !== (micro.sessions || [])[i]) ? { ...micro, sessions } : micro;
  });

  return {
    program: cambios.length === 0 ? program : { ...program, microcycles },
    cambios,
  };
};

/** Todas las series con algo anotado de un programa: el recuento que no puede cambiar. */
export const seriesAnotadas = (program) =>
  (program?.microcycles || []).reduce(
    (total, micro) =>
      total +
      (micro.sessions || []).reduce(
        (n, ses) =>
          n +
          (ses.entries || []).reduce(
            (m, e) =>
              m +
              (e.sets || []).filter(
                (s) =>
                  String(s?.kg ?? '').trim() ||
                  String(s?.reps ?? '').trim() ||
                  String(s?.rir ?? '').trim()
              ).length,
            0
          ),
        0
      ),
    0
  );
