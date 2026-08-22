import { describe, expect, it } from 'vitest';

import {
  checkInDates,
  checkInSchedule,
  currentCheckInPeriod,
  moveCheckIn,
  monthGrid,
  nextCheckIn,
  weekCells,
} from './calendar';

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
    expect(moveCheckIn(QUINCENAL_JUEVES, '2026-08-03', '2026-08-18')).toEqual(['2026-08-18']);
  });

  /* Una por periodo. Sin esto, dos fechas en la misma quincena y `dueOnOf` se
     quedaría con la primera sin que nadie lo hubiera decidido. */
  it('la segunda fecha del mismo periodo sustituye a la primera', () => {
    expect(moveCheckIn(MOVIDA, '2026-08-03', '2026-08-21')).toEqual(['2026-08-21']);
  });

  it('volver a pulsar la misma fecha la quita', () => {
    expect(moveCheckIn(MOVIDA, '2026-08-03', '2026-08-18')).toEqual([]);
  });

  it('mover al propio día de la pauta no guarda nada', () => {
    expect(moveCheckIn(MOVIDA, '2026-08-03', '2026-08-20')).toEqual([]);
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
    expect(moveCheckIn(llena, '2026-08-03', '2026-09-02')).toHaveLength(12);
  });
});
