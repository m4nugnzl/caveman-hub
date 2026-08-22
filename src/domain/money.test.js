import { describe, expect, it } from 'vitest';

import {
  byPeriod,
  collectionBoard,
  concentration,
  forecast,
  incomePerClient,
  money,
  monthlyFee,
  paymentsByMonth,
  paymentsTotals,
  recurringMonthly,
} from './money';

const HOY = '2026-08-17';

const client = (over = {}) => ({
  id: 'c1',
  name: 'Ana Pérez',
  status: 'active',
  paymentStatus: 'paid',
  nextPaymentDate: null,
  feeAmount: null,
  billingPeriod: null,
  ...over,
});

const pago = (over = {}) => ({
  id: 'p1',
  clientId: 'c1',
  amount: 60,
  paidOn: '2026-08-01',
  isPaid: true,
  source: 'manual',
  ...over,
});

describe('money', () => {
  it('escribe los enteros sin decimales y los rotos con dos', () => {
    expect(money(60)).toBe('60 €');
    expect(money(59.5)).toBe('59,50 €');
  });

  /*
    El español no separa los millares de cuatro cifras —«1240», no «1.240»— y sí
    los de cinco. No es un capricho de `toLocaleString`: es la regla, y por eso
    el formato sale de la configuración regional y no de un `replace` a mano, que
    es como se acaba escribiendo «1.240» en una factura española.
  */
  it('agrupa los millares como los agrupa el español', () => {
    expect(money(1240)).toBe('1240 €');
    expect(money(12400)).toBe('12.400 €');
  });

  /* Un importe que falta no es un cero: cero euros es una cifra y significa que
     no cobras nada. */
  it('sin dato escribe un guion, no un cero', () => {
    expect(money(null)).toBe('—');
    expect(money(undefined)).toBe('—');
    expect(money(0)).toBe('0 €');
  });
});

describe('monthlyFee', () => {
  it('normaliza cada periodicidad a mes', () => {
    expect(monthlyFee(client({ feeAmount: 60, billingPeriod: 'monthly' }))).toBe(60);
    expect(monthlyFee(client({ feeAmount: 180, billingPeriod: 'quarterly' }))).toBe(60);
    expect(monthlyFee(client({ feeAmount: 600, billingPeriod: 'annual' }))).toBe(50);
  });

  /*
    Los tres casos que devuelven `null`, y por los que existe la distinción entre
    «no se repite» y «no lo sé». Si el pago único devolviera 0, entraría en la
    suma del recurrente como un cliente que no paga — y paga, solo que una vez.
  */
  it('devuelve null cuando no hay recurrente que calcular', () => {
    expect(monthlyFee(client({ feeAmount: 300, billingPeriod: 'once' }))).toBeNull();
    expect(monthlyFee(client({ feeAmount: 60, billingPeriod: null }))).toBeNull();
    expect(monthlyFee(client({ feeAmount: null, billingPeriod: 'monthly' }))).toBeNull();
  });
});

describe('recurringMonthly', () => {
  it('suma mensualizando, y cuenta aparte a quien no suma', () => {
    const cartera = [
      client({ id: 'a', feeAmount: 60, billingPeriod: 'monthly' }),
      client({ id: 'b', feeAmount: 180, billingPeriod: 'quarterly' }),
      client({ id: 'c', feeAmount: 300, billingPeriod: 'once' }),
      client({ id: 'd' }),
    ];

    const r = recurringMonthly(cartera);
    expect(r.total).toBe(120);
    expect(r.counted).toBe(2);
    expect(r.oneOff).toBe(1);
    expect(r.missing).toBe(1);
    expect(r.clients).toBe(4);
  });

  /* Un archivado no paga. Si contara, el recurrente subiría al dar de baja a
     nadie y bajaría solo al borrar la ficha. */
  it('deja fuera a los archivados', () => {
    const cartera = [
      client({ id: 'a', feeAmount: 60, billingPeriod: 'monthly' }),
      client({ id: 'b', status: 'archived', feeAmount: 90, billingPeriod: 'monthly' }),
    ];

    const r = recurringMonthly(cartera);
    expect(r.total).toBe(60);
    expect(r.clients).toBe(1);
  });

  it('sin cartera no inventa nada', () => {
    expect(recurringMonthly([])).toEqual({ total: 0, counted: 0, missing: 0, oneOff: 0, clients: 0 });
  });
});

describe('byPeriod', () => {
  it('reparte el recurrente y omite las periodicidades sin nadie', () => {
    const filas = byPeriod([
      client({ id: 'a', feeAmount: 60, billingPeriod: 'monthly' }),
      client({ id: 'b', feeAmount: 90, billingPeriod: 'monthly' }),
      client({ id: 'c', feeAmount: 600, billingPeriod: 'annual' }),
      client({ id: 'd', feeAmount: 300, billingPeriod: 'once' }),
    ]);

    expect(filas.map((f) => f.id)).toEqual(['monthly', 'annual']);
    expect(filas[0]).toMatchObject({ clients: 2, monthly: 150 });
    expect(filas[1]).toMatchObject({ clients: 1, monthly: 50 });
  });
});

describe('collectionBoard', () => {
  const cartera = [
    client({ id: 'a', name: 'Vencida', paymentStatus: 'pending', nextPaymentDate: '2026-08-10', feeAmount: 60 }),
    client({ id: 'b', name: 'Muy vencida', paymentStatus: 'pending', nextPaymentDate: '2026-07-01', feeAmount: 90 }),
    client({ id: 'c', name: 'Hoy', paymentStatus: 'pending', nextPaymentDate: HOY, feeAmount: 50 }),
    client({ id: 'd', name: 'Pronto', paymentStatus: 'pending', nextPaymentDate: '2026-08-20', feeAmount: 40 }),
    client({ id: 'e', name: 'Lejos', paymentStatus: 'pending', nextPaymentDate: '2026-12-01', feeAmount: 70 }),
    client({ id: 'f', name: 'Sin fecha', feeAmount: 80 }),
  ];

  it('agrupa por el estado que decide domain/billing', () => {
    const tablero = collectionBoard(cartera, HOY);

    expect(tablero.overdue.map((f) => f.client.id)).toEqual(['b', 'a']);
    expect(tablero.due.map((f) => f.client.id)).toEqual(['c']);
    expect(tablero.soon.map((f) => f.client.id)).toEqual(['d']);
  });

  /* Lo que lleva más tiempo sin cobrarse va arriba: es por donde se empieza. */
  it('pone lo más vencido primero', () => {
    expect(collectionBoard(cartera, HOY).overdue[0].client.name).toBe('Muy vencida');
  });

  it('suma el importe del cobro, no el mensualizado', () => {
    const tablero = collectionBoard(
      [client({ id: 'a', paymentStatus: 'pending', nextPaymentDate: '2026-08-01', feeAmount: 180, billingPeriod: 'quarterly' })],
      HOY
    );
    expect(tablero.overdueTotal).toBe(180);
  });

  it('junta vencido y de hoy en lo que hay que cobrar', () => {
    const tablero = collectionBoard(cartera, HOY);
    expect(tablero.pending).toHaveLength(3);
    expect(tablero.overdueTotal + tablero.dueTotal).toBe(200);
  });

  it('deja fuera a los archivados', () => {
    const tablero = collectionBoard(
      [client({ id: 'z', status: 'archived', paymentStatus: 'pending', nextPaymentDate: '2026-01-01', feeAmount: 60 })],
      HOY
    );
    expect(tablero.overdue).toHaveLength(0);
  });
});

describe('paymentsByMonth', () => {
  it('devuelve el tramo completo aunque haya meses sin un solo cobro', () => {
    const serie = paymentsByMonth([pago({ paidOn: '2026-08-03', amount: 60 })], { months: 3, today: HOY });

    expect(serie.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(serie.map((m) => m.total)).toEqual([0, 0, 60]);
  });

  it('suma los cobros del mismo mes', () => {
    const serie = paymentsByMonth(
      [pago({ id: '1', paidOn: '2026-08-03', amount: 60 }), pago({ id: '2', paidOn: '2026-08-28', amount: 90 })],
      { months: 2, today: HOY }
    );

    expect(serie.at(-1)).toMatchObject({ total: 150, count: 2 });
  });

  /* Un cobro fallido de Stripe está en la tabla y no es dinero que haya entrado. */
  it('no suma lo que no se ha cobrado', () => {
    const serie = paymentsByMonth([pago({ amount: 60, isPaid: false })], { months: 1, today: HOY });
    expect(serie[0].total).toBe(0);
  });

  it('cruza el año hacia atrás sin descolocar los meses', () => {
    const serie = paymentsByMonth([], { months: 3, today: '2026-01-15' });
    expect(serie.map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  /* Con dos años en pantalla, «ene» aparecería dos veces sin decir cuál es cuál. */
  it('añade el año a la etiqueta solo cuando el tramo lo cruza', () => {
    expect(paymentsByMonth([], { months: 3, today: '2026-01-15' })[0].label).toBe('nov 25');
    expect(paymentsByMonth([], { months: 3, today: HOY })[0].label).toBe('jun');
  });
});

describe('forecast', () => {
  it('empieza en el mes en curso y avanza', () => {
    const serie = forecast([], { months: 4, today: HOY });
    expect(serie.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
  });

  it('repite el ciclo de un mensual en todos los meses', () => {
    const serie = forecast(
      [client({ feeAmount: 60, billingPeriod: 'monthly', nextPaymentDate: '2026-08-20' })],
      { months: 3, today: HOY }
    );
    expect(serie.map((m) => m.total)).toEqual([60, 60, 60]);
  });

  /*
    La razón de existir de esta serie. El recurrente de este cliente son 50 € al
    mes y su dinero entra UNA vez: los meses valle no se ven en ninguna media.
  */
  it('pone el anual en su mes y deja los demás a cero', () => {
    const serie = forecast(
      [client({ feeAmount: 600, billingPeriod: 'annual', nextPaymentDate: '2026-10-01' })],
      { months: 4, today: HOY }
    );
    expect(serie.map((m) => m.total)).toEqual([0, 0, 600, 0]);
  });

  it('cuenta el trimestral cada tres meses', () => {
    const serie = forecast(
      [client({ feeAmount: 180, billingPeriod: 'quarterly', nextPaymentDate: '2026-09-05' })],
      { months: 7, today: HOY }
    );
    expect(serie.map((m) => m.total)).toEqual([0, 180, 0, 0, 180, 0, 0]);
  });

  it('cuenta el pago único una sola vez', () => {
    const serie = forecast(
      [client({ feeAmount: 300, billingPeriod: 'once', nextPaymentDate: '2026-09-01' })],
      { months: 4, today: HOY }
    );
    expect(serie.map((m) => m.total)).toEqual([0, 300, 0, 0]);
  });

  /*
    Una deuda de julio no es una previsión de agosto: sale en el tablero de
    cobros, no aquí. Lo que sí entra son sus ciclos futuros.
  */
  it('no arrastra lo vencido, pero sí proyecta desde ahí', () => {
    const serie = forecast(
      [client({ feeAmount: 60, billingPeriod: 'monthly', nextPaymentDate: '2026-06-10' })],
      { months: 3, today: HOY }
    );
    expect(serie.map((m) => m.total)).toEqual([60, 60, 60]);
  });

  it('deja fuera a quien no tiene fecha o no tiene tarifa', () => {
    const serie = forecast(
      [
        client({ id: 'a', feeAmount: 60, billingPeriod: 'monthly' }),
        client({ id: 'b', billingPeriod: 'monthly', nextPaymentDate: '2026-08-20' }),
        client({ id: 'c', status: 'archived', feeAmount: 90, billingPeriod: 'monthly', nextPaymentDate: '2026-08-20' }),
      ],
      { months: 2, today: HOY }
    );
    expect(serie.map((m) => m.total)).toEqual([0, 0]);
  });

  it('cuenta cuántos cobros caen en cada mes, no solo el importe', () => {
    const serie = forecast(
      [
        client({ id: 'a', feeAmount: 60, billingPeriod: 'monthly', nextPaymentDate: '2026-08-05' }),
        client({ id: 'b', feeAmount: 90, billingPeriod: 'monthly', nextPaymentDate: '2026-08-25' }),
      ],
      { months: 1, today: HOY }
    );
    expect(serie[0]).toMatchObject({ total: 150, count: 2 });
  });
});

describe('concentration', () => {
  const conTarifa = (id, fee) => client({ id, feeAmount: fee, billingPeriod: 'monthly' });

  it('mide qué parte del recurrente son los mayores', () => {
    const c = concentration([conTarifa('a', 300), conTarifa('b', 100), conTarifa('c', 50), conTarifa('d', 50)]);
    expect(c).toMatchObject({ top: 3, amount: 450, total: 500 });
    expect(c.share).toBe(90);
  });

  /* «Tus tres mayores son el 100 %» con tres clientes es aritmética, no cartera. */
  it('no dice nada cuando no hay más clientes que el corte', () => {
    expect(concentration([conTarifa('a', 300), conTarifa('b', 100), conTarifa('c', 50)])).toBeNull();
    expect(concentration([])).toBeNull();
  });

  it('ignora a quien no aporta recurrente', () => {
    const c = concentration([
      conTarifa('a', 100),
      conTarifa('b', 100),
      conTarifa('c', 100),
      conTarifa('d', 100),
      client({ id: 'e', feeAmount: 900, billingPeriod: 'once' }),
    ]);
    expect(c.total).toBe(400);
  });
});

describe('paymentsTotals', () => {
  it('separa lo conciliado de lo apuntado a mano', () => {
    const totales = paymentsTotals([
      pago({ id: '1', amount: 60, source: 'manual' }),
      pago({ id: '2', amount: 90, source: 'integration' }),
      pago({ id: '3', amount: 50, isPaid: false, source: 'integration' }),
    ]);

    expect(totales).toMatchObject({ total: 150, count: 2, manual: 60, manualCount: 1, integration: 90 });
  });

  it('cuenta los que llegaron de fuera y no se han casado con nadie', () => {
    expect(paymentsTotals([pago({ clientId: null, source: 'integration' })]).unmatched).toBe(1);
  });
});

describe('incomePerClient', () => {
  it('agrupa por cliente, de más a menos, con su último cobro', () => {
    const filas = incomePerClient(
      [
        pago({ id: '1', clientId: 'a', amount: 60, paidOn: '2026-06-01' }),
        pago({ id: '2', clientId: 'a', amount: 60, paidOn: '2026-07-01' }),
        pago({ id: '3', clientId: 'b', amount: 200, paidOn: '2026-05-01' }),
      ],
      [client({ id: 'a', name: 'Ana' }), client({ id: 'b', name: 'Beto' })]
    );

    expect(filas.map((f) => f.name)).toEqual(['Beto', 'Ana']);
    expect(filas[1]).toMatchObject({ total: 120, count: 2, last: '2026-07-01' });
  });

  /* Un cobro sin conciliar no tiene a quién atribuirse. Repartirlo «a ver si
     acierta» sería peor que dejarlo fuera y contarlo aparte. */
  it('deja fuera los cobros sin cliente', () => {
    expect(incomePerClient([pago({ clientId: null })], [])).toEqual([]);
  });

  it('nombra al que ya no está en la cartera en vez de dejarlo en blanco', () => {
    expect(incomePerClient([pago({ clientId: 'zz' })], [])[0].name).toBe('Cliente dado de baja');
  });
});
