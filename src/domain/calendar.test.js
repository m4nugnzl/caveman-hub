import { describe, expect, it } from 'vitest';

import {
  CHECKIN_CADENCES,
  WEEKDAYS,
  checkInDates,
  checkInSchedule,
  currentCheckInPeriod,
  entregaDelPeriodo,
  estadoDeLaEntrega,
  moveCheckIn,
  monthGrid,
  nextCheckIn,
  periodoAEntregar,
  weekCells,
} from './calendar';
import { DIAS } from './protocol';

/**
 * Las dos preguntas del check-in.
 *
 * ══ Por qué existe este archivo ═════════════════════════════════════════════
 *
 * `calendar.js` contesta dos cosas que tienen que estar de acuerdo entre sí:
 * «¿le toca ya?» (`currentCheckInPeriod`) y «¿cuándo le toca?» (`nextCheckIn`).
 * Las dos se equivocaban en el mismo sitio y por el mismo motivo: ignoraban la
 * cadencia o el alta y contestaban con la semana natural.
 *
 * Lo que se fija aquí no es la forma del resultado, es que **la cadencia y la
 * fecha de alta se respetan siempre**, que es lo que hacía que la cola de
 * revisiones reclamara a quien no había empezado y que el calendario prometiera
 * un día que no tocaba.
 */

/** Jueves, cada dos semanas. La combinación donde fallaban las dos. */
const QUINCENAL_JUEVES = { checkin: { weekday: 3, everyWeeks: 2 } };
const SEMANAL_JUEVES = { checkin: { weekday: 3, everyWeeks: 1 } };

describe('currentCheckInPeriod', () => {
  it('no hay periodo si el cliente no ha elegido día', () => {
    expect(currentCheckInPeriod({}, '2026-08-03', '2026-08-15')).toBeNull();
  });

  /*
    El caso que reclamaba el check-in de alguien que empieza la semana que viene.

    Sin la guarda, el módulo normalizaba las semanas NEGATIVAS al rango
    [0, everyWeeks-1], anclaba el periodo a esta semana y devolvía un `dueOn` ya
    pasado con `isDue` en cierto.
  */
  it('el alta futura no tiene periodo en curso', () => {
    expect(currentCheckInPeriod(QUINCENAL_JUEVES, '2026-08-24', '2026-08-15')).toBeNull();
    expect(currentCheckInPeriod(SEMANAL_JUEVES, '2026-08-24', '2026-08-15')).toBeNull();
  });

  it('el alta de esta misma semana sí cuenta', () => {
    const periodo = currentCheckInPeriod(QUINCENAL_JUEVES, '2026-08-10', '2026-08-15');
    expect(periodo).not.toBeNull();
    expect(periodo.start).toBe('2026-08-10');
    expect(periodo.dueOn).toBe('2026-08-13');
    expect(periodo.isDue).toBe(true);
  });

  /* Antes del día señalado no se le reclama nada: el jueves por la mañana nadie
     ha hecho todavía el check-in del jueves. */
  it('no vence antes de su día', () => {
    const periodo = currentCheckInPeriod(SEMANAL_JUEVES, '2026-08-03', '2026-08-11');
    expect(periodo.dueOn).toBe('2026-08-13');
    expect(periodo.isDue).toBe(false);
  });

  it('con cadencia quincenal el periodo dura dos semanas', () => {
    // Alta el lunes 3-ago. Periodos: 3-ago y 17-ago. El 20-ago sigue en el de 17.
    const periodo = currentCheckInPeriod(QUINCENAL_JUEVES, '2026-08-03', '2026-08-24');
    expect(periodo.start).toBe('2026-08-17');
    expect(periodo.dueOn).toBe('2026-08-20');
  });
});

/*
  ══ «¿ME DEBE LA REVISIÓN?» ═══════════════════════════════════════════════════
  Lo preguntan su portada —para la fila— y la barra del pulgar —para el punto—, y
  tienen que contestar lo mismo. Lo que se fija aquí es el emparejamiento: la
  entrega cuenta si es de este PERIODO, no de esta semana natural.
*/
describe('estadoDeLaEntrega', () => {
  const suya = { preferences: SEMANAL_JUEVES, startDate: '2026-08-03' };

  it('sin nada entregado y con el día pasado, espera', () => {
    const out = estadoDeLaEntrega({ ...suya, today: '2026-08-14' });
    expect(out.desde).toBe('2026-08-10');
    expect(out.sinEntregar).toBe(true);
    expect(out.espera).toBe(true);
  });

  /*
    Antes del día no se le reclama nada — con lo anterior en orden.

    La entrega del periodo pasado va en el caso a propósito. Sin ella, lo que
    está abierto un martes no es el jueves que todavía no ha llegado sino el
    jueves pasado, que sí debe (ver `periodoAEntregar`), y esta prueba pasaba por
    el motivo equivocado: no porque no le toque, sino porque el fixture no tenía
    nada atrasado.
  */
  it('antes de su día no espera', () => {
    const entrega = { weekStart: '2026-08-03', submittedAt: '2026-08-06T10:00:00Z' };
    expect(estadoDeLaEntrega({ ...suya, entrega, today: '2026-08-11' }).espera).toBe(false);
  });

  it('entregada la de este periodo, no espera', () => {
    const entrega = { weekStart: '2026-08-10', submittedAt: '2026-08-13T10:00:00Z' };
    const out = estadoDeLaEntrega({ ...suya, entrega, today: '2026-08-14' });
    expect(out.sinEntregar).toBe(false);
    expect(out.espera).toBe(false);
  });

  /* La del periodo ANTERIOR no cuenta: si contara, quien entregó hace quince
     días no volvería a ver nunca que le toca. */
  it('la entrega de un periodo pasado no cuenta', () => {
    const entrega = { weekStart: '2026-08-03', submittedAt: '2026-08-06T10:00:00Z' };
    expect(estadoDeLaEntrega({ ...suya, entrega, today: '2026-08-14' }).espera).toBe(true);
  });

  /*
    El caso que se equivocaba escrito a mano en cada pantalla: con cadencia
    quincenal el periodo empezó hace dos semanas, y comparar contra el lunes de
    hoy daba por no entregada una revisión que sí lo estaba.
  */
  it('con cadencia quincenal la ventana es el periodo, no la semana', () => {
    const quincenal = { preferences: QUINCENAL_JUEVES, startDate: '2026-08-03' };
    const entrega = { weekStart: '2026-08-17', submittedAt: '2026-08-20T09:00:00Z' };
    const out = estadoDeLaEntrega({ ...quincenal, entrega, today: '2026-08-24' });
    expect(out.desde).toBe('2026-08-17');
    expect(out.espera).toBe(false);
  });

  /* Sin día elegido no hay periodo, y entonces nadie le debe nada: reclamar algo
     que nadie ha fijado es ruido. */
  it('sin pauta no espera nada', () => {
    const out = estadoDeLaEntrega({ preferences: {}, startDate: '2026-08-03', today: '2026-08-14' });
    expect(out.periodo).toBeNull();
    expect(out.espera).toBe(false);
  });
});

/*
  ══ La ventana de gracia ═══════════════════════════════════════════════════

  La avería: una revisión se archiva en la semana en la que estás HOY, no en la
  que debías. Con la revisión el domingo, entregar el martes la guardaba en la
  semana nueva —consumiéndola sin haberla vivido— y dejaba la vieja sin entregar.
  Una entrega, dos semanas contadas.

  Lo que se fija aquí es la regla entera: de tu día al siguiente, lo que entregas
  es la que debías. Y que la ventana se cierre sola al llegar el día nuevo, que es
  lo que impide que esto se convierta en un cliente entregando para siempre la
  revisión de hace tres meses.
*/
describe('periodoAEntregar', () => {
  /** Domingo, cada semana: el caso donde la ventana dura de lunes a sábado. */
  const DOMINGO = { checkin: { weekday: 6, everyWeeks: 1 } };
  const suya = { preferences: DOMINGO, startDate: '2026-08-03' };

  it('sin día elegido no hay nada abierto', () => {
    expect(periodoAEntregar({ preferences: {}, startDate: '2026-08-03', today: '2026-08-11' })).toBeNull();
  });

  it('llegado su día, lo abierto es el periodo de hoy', () => {
    const out = periodoAEntregar({ ...suya, today: '2026-08-16' });
    expect(out.start).toBe('2026-08-10');
    expect(out.tarde).toBeUndefined();
  });

  /* El caso reportado: se le pasó el domingo y entrega el martes. Lo que manda
     es la del 3, no la del 10 — si no, la del 10 queda consumida sin vivirla. */
  it('pasado su día y sin entregar, lo abierto es el periodo anterior', () => {
    const out = periodoAEntregar({ ...suya, today: '2026-08-11' });
    expect(out.start).toBe('2026-08-03');
    expect(out.dueOn).toBe('2026-08-09');
    expect(out.tarde).toBe(true);
  });

  it('entregado el anterior, lo abierto vuelve a ser el de hoy', () => {
    const entrega = { weekStart: '2026-08-03', submittedAt: '2026-08-09T18:00:00Z' };
    const out = periodoAEntregar({ ...suya, entrega, today: '2026-08-11' });
    expect(out.start).toBe('2026-08-10');
    expect(out.tarde).toBeUndefined();
  });

  /* La ventana no es un plazo inventado: se cierra exactamente cuando llega el
     día siguiente, y a partir de ahí la vieja es cosa de `deliverableWeeks`. */
  it('la ventana se cierra al llegar el día nuevo', () => {
    expect(periodoAEntregar({ ...suya, today: '2026-08-15' }).start).toBe('2026-08-03');
    expect(periodoAEntregar({ ...suya, today: '2026-08-16' }).start).toBe('2026-08-10');
  });

  /* Con la revisión el lunes no hay nada que hacer: el periodo en curso YA es el
     que se debe toda la semana, así que `isDue` es cierto desde el primer día y
     no se entra nunca en la rama de la gracia. */
  it('con la revisión el lunes la regla no cambia nada', () => {
    const lunes = { preferences: { checkin: { weekday: 0, everyWeeks: 1 } }, startDate: '2026-08-03' };
    for (const dia of ['2026-08-10', '2026-08-12', '2026-08-16']) {
      expect(periodoAEntregar({ ...lunes, today: dia }).start).toBe('2026-08-10');
    }
  });

  /* Quien empezó este lunes no arrastra nada: el periodo anterior cae antes de
     su alta y no existe. Es la misma guarda que `periodStartOf`. */
  it('el alta reciente no inventa un periodo anterior', () => {
    const out = periodoAEntregar({ preferences: DOMINGO, startDate: '2026-08-10', today: '2026-08-12' });
    expect(out.start).toBe('2026-08-10');
    expect(out.tarde).toBeUndefined();
  });

  /* Con cadencia quincenal la ventana dura dos semanas, sin ninguna regla
     aparte: es el mismo `isDue` del periodo en curso. */
  it('con cadencia quincenal la ventana dura el periodo entero', () => {
    const quincenal = { preferences: { checkin: { weekday: 3, everyWeeks: 2 } }, startDate: '2026-08-03' };
    expect(periodoAEntregar({ ...quincenal, today: '2026-08-19' }).start).toBe('2026-08-03');
    expect(periodoAEntregar({ ...quincenal, today: '2026-08-27' }).start).toBe('2026-08-17');
  });
});

describe('nextCheckIn', () => {
  it('sin día elegido no hay próximo', () => {
    expect(nextCheckIn({}, '2026-08-03', '2026-08-15')).toBeNull();
  });

  it('devuelve el de este periodo si todavía no ha pasado', () => {
    expect(nextCheckIn(SEMANAL_JUEVES, '2026-08-03', '2026-08-11')).toBe('2026-08-13');
  });

  /*
    ══ El fallo que motivó cambiarle la firma ═════════════════════════════════

    Con la firma anterior —`(weekday, from)`— esto devolvía «el próximo jueves»,
    27-ago, que NO es un jueves de cadencia. El siguiente que de verdad le toca
    está una cadencia entera más allá.
  */
  it('con cadencia quincenal salta a la siguiente, no al jueves que viene', () => {
    // Alta 3-ago. Cadencia: 6-ago, 20-ago, 3-sep. El 22-ago ya pasó el de 20-ago.
    expect(nextCheckIn(QUINCENAL_JUEVES, '2026-08-03', '2026-08-22')).toBe('2026-09-03');
  });

  it('con cadencia semanal sí es el jueves siguiente', () => {
    expect(nextCheckIn(SEMANAL_JUEVES, '2026-08-03', '2026-08-22')).toBe('2026-08-27');
  });

  /* Con el alta en el futuro el primero es el de SU primera semana, no uno
     calculado desde hoy. */
  it('el alta futura estrena con su propia semana', () => {
    expect(nextCheckIn(QUINCENAL_JUEVES, '2026-08-24', '2026-08-15')).toBe('2026-08-27');
  });

  /*
    ══ Y la razón de ser de todo esto ═════════════════════════════════════════

    Las dos funciones tienen que estar de acuerdo. Mientras el periodo esté
    vigente y sin vencer, «cuándo le toca» y «el día de este periodo» son la misma
    fecha — si divergen, la pantalla dice una cosa y la cola de revisiones actúa
    según otra, que es exactamente el fallo que se estaba arreglando.
  */
  it('coincide con el periodo vigente mientras no haya vencido', () => {
    for (const dia of ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20']) {
      const periodo = currentCheckInPeriod(QUINCENAL_JUEVES, '2026-08-03', dia);
      expect(nextCheckIn(QUINCENAL_JUEVES, '2026-08-03', dia)).toBe(periodo.dueOn);
    }
  });
});

describe('weekCells', () => {
  /* La forma es la de una celda de mes A PROPÓSITO: lo que consume celdas de
     mes (checkInDates, eventsByDate) tiene que poder consumir estas. */
  it('siempre son 7, de lunes a domingo, con el mismo weekStart', () => {
    const cells = weekCells('2026-08-19'); // un miércoles
    expect(cells).toHaveLength(7);
    expect(cells[0].date).toBe('2026-08-17'); // el lunes de esa semana
    expect(cells[6].date).toBe('2026-08-23'); // su domingo
    expect(new Set(cells.map((c) => c.weekStart))).toEqual(new Set(['2026-08-17']));
  });

  it('el lunes es su propia semana, no la anterior', () => {
    expect(weekCells('2026-08-17')[0].date).toBe('2026-08-17');
  });

  it('checkInDates las entiende igual que a las celdas del mes', () => {
    // Jueves semanal: en la semana del 17-ago cae el 20.
    const marcados = checkInDates(weekCells('2026-08-19'), checkInSchedule(SEMANAL_JUEVES), '2026-08-03');
    expect([...marcados]).toEqual(['2026-08-20']);
  });
});

/* ==========================================================================
   Las fechas movidas
   --------------------------------------------------------------------------
   Una fecha movida SUSTITUYE a la de su periodo. Lo que se protege aquí es esa
   frase: si además de mover marcara el día de la pauta, el cliente vería dos
   citas donde la aplicación reclama una, que es la clase de desacuerdo que este
   archivo lleva dos rondas cerrando.
   ========================================================================== */

/** Jueves, cada dos semanas, con la entrega del periodo del 17-ago movida al martes 18. */
const MOVIDA = { checkin: { weekday: 3, everyWeeks: 2, dates: ['2026-08-18'] } };

describe('fechas movidas', () => {
  it('la fecha movida manda sobre el día de la pauta', () => {
    const periodo = currentCheckInPeriod(MOVIDA, '2026-08-03', '2026-08-19');
    expect(periodo.start).toBe('2026-08-17');
    expect(periodo.dueOn).toBe('2026-08-18'); // el martes, no el jueves 20
    expect(periodo.moved).toBe(true);
  });

  it('no toca a los demás periodos', () => {
    const periodo = currentCheckInPeriod(MOVIDA, '2026-08-03', '2026-09-02');
    expect(periodo.start).toBe('2026-08-31');
    expect(periodo.dueOn).toBe('2026-09-03');
    expect(periodo.moved).toBe(false);
  });

  /* El caso que hace falta que no se rompa: mover al martes hace que la entrega
     VENZA dos días antes, y eso tiene que notarse en `isDue`. */
  it('adelantar la fecha adelanta el vencimiento', () => {
    expect(currentCheckInPeriod(MOVIDA, '2026-08-03', '2026-08-18').isDue).toBe(true);
    expect(currentCheckInPeriod(QUINCENAL_JUEVES, '2026-08-03', '2026-08-18').isDue).toBe(false);
  });

  it('el calendario marca la movida y NO el día de la pauta', () => {
    const marcados = checkInDates(weekCells('2026-08-19'), checkInSchedule(MOVIDA), '2026-08-03');
    expect([...marcados]).toEqual(['2026-08-18']);
  });

  it('nextCheckIn devuelve la movida', () => {
    expect(nextCheckIn(MOVIDA, '2026-08-03', '2026-08-17')).toBe('2026-08-18');
  });

  /* La invariante de siempre, ahora con las fechas movidas dentro. */
  it('sigue coincidiendo con el periodo vigente', () => {
    for (const dia of ['2026-08-17', '2026-08-18']) {
      const periodo = currentCheckInPeriod(MOVIDA, '2026-08-03', dia);
      expect(nextCheckIn(MOVIDA, '2026-08-03', dia)).toBe(periodo.dueOn);
    }
  });

  /* Y la que de verdad importa en pantalla: lo que marca el mes y lo que se
     reclama son la MISMA fecha, día a día, con y sin fechas movidas. */
  it('el mes y la reclamación no pueden discrepar', () => {
    const celdas = monthGrid(2026, 7); // agosto de 2026
    for (const prefs of [SEMANAL_JUEVES, QUINCENAL_JUEVES, MOVIDA]) {
      const marcados = checkInDates(celdas, checkInSchedule(prefs), '2026-08-03');
      for (const celda of celdas) {
        const periodo = currentCheckInPeriod(prefs, '2026-08-03', celda.date);
        if (periodo?.dueOn === celda.date) expect(marcados.has(celda.date)).toBe(true);
      }
    }
  });
});

describe('moveCheckIn', () => {
  it('sin pauta no se puede mover nada', () => {
    expect(moveCheckIn({}, '2026-08-03', '2026-08-18')).toBeNull();
  });

  it('mueve la entrega de su periodo', () => {
    expect(moveCheckIn(QUINCENAL_JUEVES, '2026-08-03', '2026-08-18')).toEqual({
      dates: ['2026-08-18'],
      notes: {},
    });
  });

  /* Una por periodo. Sin esto, dos fechas en la misma quincena y `dueOnOf` se
     quedaría con la primera sin que nadie lo hubiera decidido. */
  it('la segunda fecha del mismo periodo sustituye a la primera', () => {
    expect(moveCheckIn(MOVIDA, '2026-08-03', '2026-08-21')).toEqual({
      dates: ['2026-08-21'],
      notes: {},
    });
  });

  it('volver a pulsar la misma fecha la quita', () => {
    expect(moveCheckIn(MOVIDA, '2026-08-03', '2026-08-18')).toEqual({ dates: [], notes: {} });
  });

  it('mover al propio día de la pauta no guarda nada', () => {
    expect(moveCheckIn(MOVIDA, '2026-08-03', '2026-08-20')).toEqual({ dates: [], notes: {} });
  });

  it('respeta el tope', () => {
    // Doce martes seguidos: una fecha movida en cada uno de doce periodos semanales.
    const doce = [
      '2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06',
      '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17',
    ];
    const llena = { checkin: { weekday: 3, everyWeeks: 1, dates: doce } };

    expect(checkInSchedule(llena).dates).toHaveLength(12);
    // Un periodo nuevo ya no cabe; uno que ya tenía fecha sí, porque la sustituye.
    expect(moveCheckIn(llena, '2026-08-03', '2027-01-05')).toBeNull();
    expect(moveCheckIn(llena, '2026-08-03', '2026-09-02').dates).toHaveLength(12);
  });

  /* ══ El porqué ══════════════════════════════════════════════════════════
     Una fecha movida sin motivo, tres semanas después, es un día raro en el
     calendario. Se guarda apuntado a SU fecha, y se cae con ella. */
  it('guarda el motivo apuntado a su fecha', () => {
    expect(
      moveCheckIn(QUINCENAL_JUEVES, '2026-08-03', '2026-08-18', { motivo: 'Está de viaje' })
    ).toEqual({ dates: ['2026-08-18'], notes: { '2026-08-18': 'Está de viaje' } });
  });

  it('devolver la fecha a su pauta se lleva su motivo', () => {
    const conNota = {
      checkin: { weekday: 3, everyWeeks: 2, dates: ['2026-08-18'], notes: { '2026-08-18': 'Viaje' } },
    };
    expect(moveCheckIn(conNota, '2026-08-03', '2026-08-18')).toEqual({ dates: [], notes: {} });
  });

  it('las notas de otros periodos sobreviven', () => {
    const dos = {
      checkin: {
        weekday: 3,
        everyWeeks: 1,
        dates: ['2026-08-04', '2026-08-11'],
        notes: { '2026-08-04': 'Viaje', '2026-08-11': 'Boda' },
      },
    };
    /* Se mueve la del segundo periodo a otro día: la nota de la semana anterior
       no tiene por qué enterarse. */
    expect(moveCheckIn(dos, '2026-08-03', '2026-08-12')).toEqual({
      dates: ['2026-08-04', '2026-08-12'],
      notes: { '2026-08-04': 'Viaje' },
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   UNA SOLA CITA — la cadencia y su tope
   ══════════════════════════════════════════════════════════════════════════ */

describe('la cadencia', () => {
  it('ofrece la de tres semanas, que era la que faltaba', () => {
    expect(CHECKIN_CADENCES.map((c) => c.weeks)).toEqual([1, 2, 3, 4]);
  });

  /* El horario del protocolo acepta hasta ocho, y SIEMBRA esta pauta. Si aquí
     solo cupieran las cuatro de la lista, sembrar «cada 6» se convertiría en
     silencio en «cada semana». */
  it('acepta cualquier cadencia que el horario pueda sembrar', () => {
    expect(checkInSchedule({ checkin: { weekday: 0, everyWeeks: 6 } }).everyWeeks).toBe(6);
    expect(checkInSchedule({ checkin: { weekday: 0, everyWeeks: 99 } }).everyWeeks).toBe(1);
    expect(checkInSchedule({ checkin: { weekday: 0, everyWeeks: 0 } }).everyWeeks).toBe(1);
  });

  /* La numeración es UNA: lunes es 0 en el calendario y lunes es 0 en el
     horario del protocolo. Cruzarlas con un desfase de uno es la avería que la
     unificación vino a cerrar. */
  it('la numeración del día es la misma en las dos listas', () => {
    expect(DIAS.map((d) => d.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(DIAS).toHaveLength(WEEKDAYS.length);
    expect(DIAS[0].corto).toBe('lunes');
    expect(WEEKDAYS[0]).toBe('Lun');
    expect(DIAS[6].corto).toBe('domingo');
    expect(WEEKDAYS[6]).toBe('Dom');
  });
});

/**
 * LA FILA DE ESTE PERIODO Y NO «DE ESTE LUNES EN ADELANTE».
 *
 * ══ Qué se está fijando aquí ═══════════════════════════════════════════════
 *
 * `entrega.weekStart >= desde`, escrito igual en tres sitios, dejaba entrar
 * filas de semanas POSTERIORES al periodo abierto. Esas existen y no son raras:
 * `useCloseReview` crea la fila con `submit_check_in` cuando el entrenador
 * cierra una semana que el cliente no llegó a entregar, y esa función sella
 * `submitted_at`. Con la fila de más adelante colada aquí, el portal daba por
 * entregada y revisada una semana que el cliente no había tocado, y le contaba
 * las respuestas de otra como suyas.
 */
describe('entregaDelPeriodo', () => {
  const fila = (weekStart) => ({ weekStart, submittedAt: '2026-09-20T10:00:00Z' });

  it('acepta la del periodo', () => {
    expect(entregaDelPeriodo(fila('2026-09-14'), '2026-09-14')).not.toBeNull();
  });

  it('deja fuera la de una semana anterior', () => {
    expect(entregaDelPeriodo(fila('2026-09-07'), '2026-09-14')).toBeNull();
  });

  /* La de la semana que VIENE: es la que crea el entrenador al cerrar por
     delante mientras el cliente todavía debe la anterior. */
  it('deja fuera la de una semana posterior', () => {
    expect(entregaDelPeriodo(fila('2026-09-21'), '2026-09-14')).toBeNull();
  });

  it('con cadencia quincenal el periodo mide dos semanas', () => {
    expect(entregaDelPeriodo(fila('2026-09-21'), '2026-09-14', 2)).not.toBeNull();
    expect(entregaDelPeriodo(fila('2026-09-28'), '2026-09-14', 2)).toBeNull();
  });

  it('sin fila o sin periodo no hay nada', () => {
    expect(entregaDelPeriodo(null, '2026-09-14')).toBeNull();
    expect(entregaDelPeriodo(fila('2026-09-14'), null)).toBeNull();
  });
});
