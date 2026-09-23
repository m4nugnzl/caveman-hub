import { beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateBlockPlans } from '@/domain/blocksMigration';
import { proyectarPlanEnDias, removeBlockSessionFrom, renameBlockSessionIn } from '@/domain/blocks';
import { soltarHojaSinEntrenar } from '@/domain/hojasFuera';
import { buildSessionFromPlan, withSessionSet } from '@/domain/sessions';
import { createSaveQueue } from './saveQueue';
import { almacenNoGuardadas, crearRecolocador } from './seriesNoGuardadas';

/* ══════════════════════════════════════════════════════════════════════════
   UN TELÉFONO ABIERTO DESDE ANTES, Y EL ENTRENADOR CAMBIA LA HOJA.

   El caso: el cliente abre la sesión de «Pull A» con el programa de por la
   mañana, y a mediodía su entrenador renombra la hoja o la quita. Las series
   que el teléfono manda llevan el nombre viejo y el servidor las rechaza.

   Lo que se exige: cada serie o se RECOLOCA (acaba guardada en su hoja con el
   nombre nuevo) o se queda como NO GUARDADA con su valor. Nunca desaparece.

   El servidor es de mentira pero con las reglas de `log_session_set` (0119),
   en su orden: la semana, el día en el plan, el ejercicio en el día, y luego
   la sesión —que se crea con el id que llega si no existe—.
   ══════════════════════════════════════════════════════════════════════════ */

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

const aplicar = (program, updater) => proyectarPlanEnDias(updater(migrateBlockPlans(program).program));

/** Quitar la hoja como lo hace el entrenador (`removeBlockSheet`): del plan y, en
    el mismo paso, de los microciclos donde no se entrenó. */
const quitarPullA = (x) => soltarHojaSinEntrenar(removeBlockSessionFrom(x, 'b_1', 'Pull A'), 'b_1', 'Pull A');
const ej = (n) => ({ id: `e${n}`, name: `Ejercicio ${n}`, sets: [{ targetReps: '8' }, { targetReps: '8' }] });

const programa = () =>
  aplicar(
    {
      weeklySplit: {},
      mobilityDrills: [],
      microcycles: [
        {
          id: 'm1',
          weekNumber: 1,
          date: '2026-09-21',
          days: [
            { dayName: 'Pull A', exercises: [ej(1), ej(2)] },
            { dayName: 'Push A', exercises: [ej(3)] },
          ],
          sessions: [],
        },
      ],
      blocks: [{ id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: null }],
    },
    (p) => p
  );

/** `log_session_set`, con sus rechazos y en su orden. Escribe en `servidor.p`. */
const logSessionSetEnServidor = (servidor, a) => {
  const rechazo = (message) => ({ error: { code: 'P0001', message } });
  const micro = servidor.p.microcycles.find((m) => m.weekNumber === a.weekNumber);
  if (!micro) return rechazo(`No existe la semana ${a.weekNumber}`);
  const day = (micro.days || []).find((d) => d.dayName === a.dayName);
  if (!day) return rechazo(`El día ${a.dayName} no está en el plan de la semana ${a.weekNumber}`);
  if (!(day.exercises || []).some((e) => e.id === a.exercise.id)) {
    return rechazo(`El ejercicio ${a.exercise.id} no está programado en ${a.dayName}`);
  }
  let sesiones = micro.sessions || [];
  if (!sesiones.some((s) => s.id === a.sessionId)) {
    sesiones = [...sesiones, { ...buildSessionFromPlan(day, a.date), id: a.sessionId, dayName: a.dayName }];
  }
  micro.sessions = sesiones.map((s) =>
    s.id === a.sessionId ? withSessionSet(s, a.exercise, a.setIndex, a.field, a.value) : s
  );
  return { error: null };
};

/** El teléfono: su cola, su almacén y el recolocador, montados como en `AppContext`. */
const telefono = (servidor, { contar = null } = {}) => {
  const almacen = almacenNoGuardadas('u1');
  const enviar = (payload) => Promise.resolve(logSessionSetEnServidor(servidor, payload));
  const recolocador = crearRecolocador({
    almacen,
    programaAlDia: async () => structuredClone(servidor.p),
    reenviar: (key, _cliente, payload) => queue.enqueue(key, payload, enviar, { immediate: true }),
    contar,
  });
  const queue = createSaveQueue({
    debounceMs: 0,
    onRechazo: (key, payload, error) => recolocador.alRechazar(key, payload, error),
    onStatus: (key, s) => {
      if (s.status === 'saved') almacen.quitar(key);
    },
  });
  /* Lo que manda la pantalla de la sesión: el día con el que se ENTRÓ. */
  const anotar = (dayName, exercise, setIndex, field, value, sessionId = 'ses_tel') =>
    queue.enqueue(
      `set:c1:${sessionId}:${exercise.id}:${setIndex}:${field}`,
      { weekNumber: 1, sessionId, date: '2026-09-22', dayName, exercise, setIndex, field, value, sub: null },
      enviar,
      { immediate: true }
    );
  return { anotar, almacen, recolocador };
};

const esperar = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const sesionDe = (servidor, id = 'ses_tel') => servidor.p.microcycles[0].sessions.find((s) => s.id === id);

describe('series rechazadas por un cambio de la hoja', () => {
  it('renombrada antes de la primera serie: se recoloca en la hoja con el nombre nuevo', async () => {
    const servidor = { p: programa() };
    const tel = telefono(servidor);
    servidor.p = aplicar(servidor.p, (x) => renameBlockSessionIn(x, 'b_1', 'Pull A', 'Tirón'));

    tel.anotar('Pull A', ej(1), 0, 'kg', '60');
    await esperar();

    expect(sesionDe(servidor).dayName).toBe('Tirón');
    expect(sesionDe(servidor).entries[0].sets[0].kg).toBe('60');
    expect(tel.almacen.list()).toEqual([]);
  });

  it('renombrada con la sesión ya empezada: la siguiente serie sigue a su sesión', async () => {
    const servidor = { p: programa() };
    const tel = telefono(servidor);
    tel.anotar('Pull A', ej(1), 0, 'reps', '8');
    await esperar();

    servidor.p = aplicar(servidor.p, (x) => renameBlockSessionIn(x, 'b_1', 'Pull A', 'Tirón'));
    tel.anotar('Pull A', ej(1), 1, 'reps', '7');
    await esperar();

    const s = sesionDe(servidor);
    expect(s.dayName).toBe('Tirón');
    expect(s.entries[0].sets.map((x) => x.reps)).toEqual(['8', '7']);
    expect(tel.almacen.list()).toEqual([]);
  });

  it('quitada antes de la primera serie: se queda como no guardada, con su valor', async () => {
    const servidor = { p: programa() };
    const tel = telefono(servidor);
    servidor.p = aplicar(servidor.p, quitarPullA);

    tel.anotar('Pull A', ej(1), 0, 'kg', '60');
    await esperar();

    expect(sesionDe(servidor)).toBeUndefined();
    const [queda] = tel.almacen.list();
    expect(queda.payload).toMatchObject({ dayName: 'Pull A', setIndex: 0, field: 'kg', value: '60' });
    expect(queda.error).toMatch(/no está en el plan/);
  });

  it('quitada con la sesión ya empezada: su día se queda en la semana y la serie entra', async () => {
    const servidor = { p: programa() };
    const tel = telefono(servidor);
    tel.anotar('Pull A', ej(1), 0, 'reps', '8');
    await esperar();

    servidor.p = aplicar(servidor.p, quitarPullA);
    tel.anotar('Pull A', ej(1), 1, 'reps', '7');
    await esperar();

    expect(sesionDe(servidor).entries[0].sets.map((x) => x.reps)).toEqual(['8', '7']);
    expect(tel.almacen.list()).toEqual([]);
  });

  it('un ejercicio quitado de la hoja: no se inventa otro sitio, queda no guardada', async () => {
    const servidor = { p: programa() };
    const tel = telefono(servidor);
    tel.anotar('Pull A', ej(1), 0, 'reps', '8');
    await esperar();

    // El entrenador quita «Ejercicio 2» de la hoja: sin su id no hay dónde ponerla.
    servidor.p.microcycles[0].days[0].exercises = [ej(1)];
    tel.anotar('Pull A', ej(2), 0, 'reps', '10');
    await esperar();

    expect(tel.almacen.list().map((e) => e.payload.value)).toEqual(['10']);
  });

  it('la recolocación se intenta una vez: si vuelve rechazada, no hay bucle', async () => {
    const tiron = aplicar(programa(), (x) => renameBlockSessionIn(x, 'b_1', 'Pull A', 'Tirón'));
    const otra = aplicar(tiron, (x) => renameBlockSessionIn(x, 'b_1', 'Tirón', 'Otra'));
    /* Tres lecturas: el envío, el programa al día y el reenvío. Entre las dos
       últimas la hoja se vuelve a renombrar. */
    let lecturas = 0;
    const servidor = {
      get p() {
        lecturas += 1;
        return lecturas > 2 ? otra : tiron;
      },
    };
    const tel = telefono(servidor);

    tel.anotar('Pull A', ej(1), 0, 'kg', '60');
    await esperar();

    expect(lecturas).toBe(3);
    const [queda] = tel.almacen.list();
    expect(queda.payload).toMatchObject({ dayName: 'Tirón', recolocada: true, value: '60' });
  });
});

describe('lo que se le cuenta al entrenador', () => {
  it('la que no tiene sitio se le cuenta una vez, con lo que hace falta para decirlo', async () => {
    const contadas = [];
    const servidor = { p: programa() };
    const tel = telefono(servidor, { contar: async (key, datos) => (contadas.push([key, datos]), { error: null }) });
    servidor.p = aplicar(servidor.p, quitarPullA);

    tel.anotar('Pull A', ej(1), 0, 'kg', '60');
    await esperar();

    expect(contadas).toHaveLength(1);
    expect(contadas[0][1]).toMatchObject({
      weekNumber: 1,
      dayName: 'Pull A',
      exercise: { name: 'Ejercicio 1' },
      setIndex: 0,
      field: 'kg',
      value: '60',
    });
    expect(contadas[0][1].exercise.sets).toBeUndefined();
    expect(tel.almacen.list()[0].avisado).toBe(true);
  });

  it('la que se recoloca no se le cuenta', async () => {
    const contar = vi.fn(async () => ({ error: null }));
    const servidor = { p: programa() };
    const tel = telefono(servidor, { contar });
    servidor.p = aplicar(servidor.p, (x) => renameBlockSessionIn(x, 'b_1', 'Pull A', 'Tirón'));

    tel.anotar('Pull A', ej(1), 0, 'kg', '60');
    await esperar();

    expect(contar).not.toHaveBeenCalled();
  });

  it('si no llega (sin red, sin la 0132), se vuelve a contar al arrancar', async () => {
    let falla = true;
    const contar = vi.fn(async () => (falla ? { error: { message: 'relation does not exist' } } : { error: null }));
    const servidor = { p: programa() };
    const tel = telefono(servidor, { contar });
    servidor.p = aplicar(servidor.p, quitarPullA);

    tel.anotar('Pull A', ej(1), 0, 'kg', '60');
    await esperar();
    expect(tel.almacen.list()[0].avisado).toBeUndefined();

    falla = false;
    await tel.recolocador.contarPendientes();
    expect(contar).toHaveBeenCalledTimes(2);
    expect(tel.almacen.list()[0].avisado).toBe(true);
  });
});
