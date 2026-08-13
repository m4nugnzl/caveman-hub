import { describe, expect, it } from 'vitest';

import { activityScale, buildActivity, buildInbox, dayLabel, groupByDay } from './today';
import { trainingSummary } from './sessions';

const TODAY = '2026-08-12';

const client = (over = {}) => ({ id: 'c1', name: 'Ana Pérez', ...over });

/**
 * El resumen de entrenamiento de un cliente con una sesión en la fecha dada.
 *
 * Se deriva del programa completo con `trainingSummary`, que es la misma función
 * que usa la aplicación cuando ya lo tiene cargado. Así estas pruebas comprueban
 * de paso lo que sostiene la carga perezosa: que «Hoy» ve lo mismo venga el
 * resumen del servidor o del programa entero.
 */
const resumen = (date, sets) => trainingSummary(program(date, sets), { today: TODAY });

/** Un microciclo con una sesión registrada en la fecha dada. */
const program = (date, sets = [{ kg: '100', reps: '5', rir: '2' }]) => ({
  microcycles: [
    {
      id: 'm1',
      weekNumber: 1,
      days: [],
      sessions: [
        {
          id: 's1',
          date,
          dayName: 'Empuje A',
          entries: [{ exerciseId: 'e1', name: 'Press banca', muscle: 'Pecho', sets }],
        },
      ],
    },
  ],
});

describe('buildActivity', () => {
  it('no anuncia un entreno cuando la sesión está abierta pero vacía', () => {
    /*
      El caso que haría inútil la pantalla. Al empezar el día el entrenador crea la
      sesión con todas las casillas en blanco: si eso contara como «Ana entrenó»,
      «Hoy» avisaría de entrenos que no han ocurrido y se dejaría de mirar a la
      tercera vez.
    */
    const vacia = buildActivity(
      { clients: [client()], training: { c1: resumen(TODAY, [{ kg: '', reps: '', rir: '' }]) } },
      TODAY
    );
    expect(vacia).toHaveLength(0);

    const hecha = buildActivity({ clients: [client()], training: { c1: resumen(TODAY) } }, TODAY);
    expect(hecha).toHaveLength(1);
    expect(hecha[0].kind).toBe('session');
    expect(hecha[0].detail).toContain('500 kg');
  });

  it('agrupa en un solo evento las fotos subidas el mismo día', () => {
    /*
      Un check-in son tres fotos. Como tres líneas idénticas empujarían al resto de
      la cartera fuera de la pantalla, un día de fotos es UN evento con su recuento.
    */
    const events = buildActivity(
      {
        clients: [client()],
        progressPhotos: [
          { clientId: 'c1', date: TODAY },
          { clientId: 'c1', date: TODAY },
          { clientId: 'c1', date: TODAY },
        ],
      },
      TODAY
    );

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('3 fotos');
  });

  it('deja fuera lo anterior a la ventana y lo que aún no ha pasado', () => {
    const events = buildActivity(
      {
        clients: [client()],
        anthropometry: {
          c1: {
            history: [
              { date: '2026-08-12', weight: 80 }, // hoy
              { date: '2026-07-01', weight: 82 }, // fuera de la ventana
              { date: '2026-09-01', weight: 79 }, // futuro: un pesaje con fecha mal puesta
            ],
          },
        },
      },
      TODAY
    );

    expect(events.map((e) => e.date)).toEqual(['2026-08-12']);
  });

  it('ordena de lo más reciente a lo más antiguo', () => {
    const events = buildActivity(
      {
        clients: [client(), client({ id: 'c2', name: 'Bruno Gil' })],
        training: { c1: resumen('2026-08-10'), c2: resumen('2026-08-12') },
      },
      TODAY
    );

    expect(events.map((e) => e.date)).toEqual(['2026-08-12', '2026-08-10']);
  });
});

describe('activityScale', () => {
  it('devuelve todos los días de la ventana, también los vacíos', () => {
    /*
      Una escala a la que le faltan las marcas de los días de cero no es una
      escala: los huecos son justamente lo que se quiere ver.
    */
    const scale = activityScale([{ date: TODAY }], TODAY, 14);

    expect(scale).toHaveLength(14);
    expect(scale[0].date).toBe('2026-07-30');
    expect(scale[13]).toMatchObject({ date: TODAY, count: 1, isToday: true });
    expect(scale.filter((d) => d.count === 0)).toHaveLength(13);
  });
});

describe('dayLabel', () => {
  it('usa lo relativo mientras se entienda mejor que la fecha', () => {
    expect(dayLabel(TODAY, TODAY)).toBe('Hoy');
    expect(dayLabel('2026-08-11', TODAY)).toBe('Ayer');
    expect(dayLabel('2026-08-09', TODAY)).toBe('Domingo');
    // A doce días, «domingo» ya no dice cuál: hace falta la fecha.
    expect(dayLabel('2026-07-31', TODAY)).toBe('Viernes, 31 de julio');
  });
});

describe('groupByDay', () => {
  it('conserva el orden de entrada y agrupa por fecha', () => {
    const groups = groupByDay(
      [
        { date: '2026-08-12', id: 'a' },
        { date: '2026-08-12', id: 'b' },
        { date: '2026-08-10', id: 'c' },
      ],
      TODAY
    );

    expect(groups.map((g) => g.label)).toEqual(['Hoy', 'Lunes']);
    expect(groups[0].events).toHaveLength(2);
  });
});

describe('buildInbox', () => {
  it('solo recoge lo que espera respuesta del entrenador', () => {
    /*
      La bandeja NO repite la cartera. «Lleva nueve días sin entrenar» es un estado
      y lo ordena mejor el tablero; aquí entra lo que tiene la pelota en el tejado
      del entrenador: un check-in entregado y un cobro que vence hoy.
    */
    const rows = [
      {
        client: client(),
        review: { pending: true, exact: true, id: 'ci1' },
        alerts: [{ id: 'stale_training', severity: 'media', label: '9 días sin entrenar' }],
        daysToPayment: null,
      },
      {
        client: client({ id: 'c2', name: 'Bruno Gil', nextPaymentDate: '2026-08-01' }),
        review: { pending: false },
        alerts: [{ id: 'payment_overdue', severity: 'alta', label: 'Pago vencido hace 11 días' }],
        daysToPayment: -11,
      },
    ];

    const inbox = buildInbox(rows);

    expect(inbox.map((i) => i.kind)).toEqual(['payment', 'review']);
    expect(inbox.some((i) => i.title.includes('sin entrenar'))).toBe(false);
  });
});
