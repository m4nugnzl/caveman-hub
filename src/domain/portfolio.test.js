import { describe, expect, it } from 'vitest';

import {
  BOARD_COLUMNS,
  INBOX_TASKS,
  PORTFOLIO_FILTERS,
  buildPortfolio,
  clientStatus,
  isArchived,
  reviewState,
  portfolioBoard,
  portfolioInbox,
  portfolioSummary,
  reviewQueue,
} from './portfolio';

const client = (over = {}) => ({
  id: 'c1',
  name: 'Ana Pérez',
  paymentStatus: 'paid',
  onboardingComplete: true,
  clientProfileId: 'user-1',
  ...over,
});

describe('clientStatus', () => {
  it('avisa cuando el cliente no tiene cuenta enlazada', () => {
    /*
      Es la alerta que explica todas las demás. Sin ella la ficha decía «no ha
      registrado ningún entreno» y «nunca ha registrado su peso» —las dos ciertas—
      y llevaba a la conclusión equivocada de que el cliente no colabora, cuando lo
      que pasa es que no puede ni entrar.
    */
    const row = clientStatus({ client: client({ clientProfileId: null }) }, '2026-08-11');
    const alert = row.alerts.find((a) => a.id === 'no_account');

    expect(alert).toBeDefined();
    expect(alert.severity).toBe('alta');
  });

  it('no avisa si ya tiene cuenta', () => {
    const row = clientStatus({ client: client() }, '2026-08-11');
    expect(row.alerts.find((a) => a.id === 'no_account')).toBeUndefined();
  });
});

describe('portfolioBoard', () => {
  /*
    La propiedad que el tablero tiene que cumplir siempre: cada cliente en UNA
    columna. Si un cliente cayera en dos, los contadores de las cabeceras sumarían
    más que el total de la cartera y el tablero dejaría de ser una partición — que
    es lo único que lo hace útil para ver dónde está el cuello de botella.
  */
  const scenarios = [
    ['sin cuenta', { clientProfileId: null }],
    ['sin pagar', { paymentStatus: 'pending' }],
    ['onboarding sin cerrar', { onboardingComplete: false }],
    ['al día', {}],
    ['todo mal a la vez', { clientProfileId: null, paymentStatus: 'pending', onboardingComplete: false }],
  ];

  it('coloca a cada cliente en una sola columna, y los contadores suman el total', () => {
    const clients = scenarios.map(([label, over], i) =>
      client({ ...over, id: `c${i}`, name: label })
    );
    const rows = buildPortfolio({ clients }, '2026-08-11');
    const board = portfolioBoard(rows);

    const placed = board.flatMap((column) => column.rows.map((r) => r.client.id));
    expect(placed).toHaveLength(clients.length);
    expect(new Set(placed).size).toBe(clients.length);
    expect(board.map((c) => c.id)).toEqual(BOARD_COLUMNS.map((c) => c.id));
  });

  it('una cartera vacía da columnas vacías, no columnas ausentes', () => {
    // La cabecera de cada columna tiene que existir igualmente: un tablero al que le
    // faltan columnas no se lee como «no hay nadie ahí», se lee como roto.
    const board = portfolioBoard([]);
    expect(board).toHaveLength(BOARD_COLUMNS.length);
    expect(board.every((c) => c.rows.length === 0)).toBe(true);
  });
});

describe('portfolioInbox', () => {
  /*
    Lo que distingue la bandeja del tablero: el tablero metía a cada cliente en
    UNA columna, así que alguien con el pago vencido y sin cuenta salía solo en
    la más grave y la otra tarea no aparecía en ninguna parte.
  */
  it('un cliente con dos problemas sale en las dos tareas', () => {
    /* La fecha vencida es necesaria: un cobro cuya fecha no ha llegado —o que no
       tiene fecha— ya no es una tarea, y sin eso este caso no probaría nada. */
    const rows = buildPortfolio(
      {
        clients: [
          client({ clientProfileId: null, paymentStatus: 'pending', nextPaymentDate: '2026-08-01' }),
        ],
      },
      '2026-08-11'
    );
    const { tasks } = portfolioInbox(rows);
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain('access');
    expect(ids).toContain('payment');
  });

  it('las tareas salen en el orden declarado, no en el de aparición', () => {
    const rows = buildPortfolio(
      { clients: [client({ paymentStatus: 'pending' }), client({ id: 'c2', clientProfileId: null })] },
      '2026-08-11'
    );
    const ids = portfolioInbox(rows).tasks.map((t) => t.id);
    const esperado = INBOX_TASKS.filter((t) => ids.includes(t.id)).map((t) => t.id);
    expect(ids).toEqual(esperado);
  });

  /* Un grupo a cero es ruido en una bandeja: si no hay nada que hacer, no hay
     nada que enseñar. Es justo lo contrario que en el tablero, donde la columna
     vacía era información. */
  it('no devuelve tareas vacías', () => {
    const rows = buildPortfolio({ clients: [client()] }, '2026-08-11');
    expect(portfolioInbox(rows).tasks.every((t) => t.rows.length > 0)).toBe(true);
  });

  /*
    El invariante que sí importa: tareas y «al día» son complementarios. Cada
    cliente está en al menos una tarea O en «al día», nunca en los dos ni en
    ninguno — si no, hay gente que desaparece de la pantalla.

    No se comprueba con un cliente concreto a propósito: uno recién creado ya
    arrastra «sin rutina» y «no ha entrenado», así que «al día» de verdad exige
    datos de entreno. Lo que se prueba es la partición, no un caso.
  */
  it('tareas y «al día» reparten la cartera entera sin solaparse', () => {
    const clients = [
      client(),
      client({ id: 'c2', paymentStatus: 'pending' }),
      client({ id: 'c3', clientProfileId: null }),
    ];
    const rows = buildPortfolio({ clients }, '2026-08-11');
    const { tasks, clear } = portfolioInbox(rows);

    const conTarea = new Set(tasks.flatMap((t) => t.rows.map((r) => r.client.id)));
    const alDia = clear.map((r) => r.client.id);

    expect(alDia.some((id) => conTarea.has(id))).toBe(false);
    expect(new Set([...conTarea, ...alDia]).size).toBe(clients.length);
  });

  it('cada fila lleva escrito por qué está ahí', () => {
    const rows = buildPortfolio({ clients: [client({ clientProfileId: null })] }, '2026-08-11');
    const acceso = portfolioInbox(rows).tasks.find((t) => t.id === 'access');
    expect(acceso.rows[0].why).toBeTruthy();
  });

  it('una cartera vacía no tiene tareas ni gente al día', () => {
    expect(portfolioInbox([])).toEqual({ tasks: [], clear: [] });
  });
});

describe('isArchived', () => {
  /*
    El caso que importa es el NULL. `clients.status` es anterior al valor por
    defecto, así que hay filas con NULL, y si esto las diera por archivadas
    desaparecerían de la cartera entera sin que nadie las hubiera archivado.

    Y tiene que coincidir exactamente con lo que hace el disparador del límite en
    la base de datos (`status IS DISTINCT FROM 'archived'`): si discreparan, la
    pantalla enseñaría un recuento y el servidor rechazaría el alta por otro.
  */
  it('solo cuenta como archivado el valor explícito', () => {
    expect(isArchived(client({ status: 'archived' }))).toBe(true);
    expect(isArchived(client({ status: 'active' }))).toBe(false);
    expect(isArchived(client({ status: null }))).toBe(false);
    expect(isArchived(client({ status: undefined }))).toBe(false);
    expect(isArchived(null)).toBe(false);
  });
});

describe('empezar no es descolgarse', () => {
  /*
    Un cliente recién dado de alta no tiene rutina, no ha entrenado y no se ha
    pesado. Antes cada una disparaba su alerta —cuatro avisos, dos de gravedad
    alta— y la persona con la que aún no habías hecho nada encabezaba la lista de
    urgencias por delante de quien llevaba tres semanas sin aparecer.
  */
  it('el recién llegado tiene UNA alerta, no cuatro', () => {
    const [row] = buildPortfolio({ clients: [client()] }, '2026-08-11');
    const ids = row.alerts.map((a) => a.id);

    expect(ids).toContain('not_started');
    expect(ids).not.toContain('no_program');
    expect(ids).not.toContain('never_trained');
    expect(ids).not.toContain('no_weight');
  });

  it('«no ha empezado» no es de gravedad alta', () => {
    const [row] = buildPortfolio({ clients: [client()] }, '2026-08-11');
    expect(row.alerts.find((a) => a.id === 'not_started').severity).not.toBe('alta');
  });

  it('cae en «poner en marcha», no en «se están descolgando»', () => {
    const { tasks } = portfolioInbox(buildPortfolio({ clients: [client()] }, '2026-08-11'));
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain('start');
    expect(ids).not.toContain('inactive');
  });

  /* En cuanto hay un pesaje ya ha empezado, y a partir de ahí las alertas de
     descolgarse vuelven a significar algo. */
  it('con un pesaje deja de estar «sin empezar»', () => {
    const rows = buildPortfolio(
      { clients: [client()], anthropometry: { c1: { history: [{ date: '2026-08-10', weight: 80 }] } } },
      '2026-08-11'
    );
    const ids = rows[0].alerts.map((a) => a.id);
    expect(ids).not.toContain('not_started');
    expect(ids).toContain('no_program');
  });
});

describe('el cobro solo se reclama cuando toca', () => {
  /*
    `paymentStatus` se pone en 'pending' al empezar el ciclo, así que quien
    renueva el día 30 salía como «pago pendiente» desde el día 1. Veintinueve
    días avisando de algo que no había que hacer, y el aviso de verdad —el del
    vencimiento— indistinguible de ese ruido.
  */
  it('una fecha futura no genera ninguna tarea de cobro', () => {
    const rows = buildPortfolio(
      { clients: [client({ paymentStatus: 'pending', nextPaymentDate: '2026-09-30' })] },
      '2026-08-11'
    );
    const ids = rows[0].alerts.map((a) => a.id);
    expect(ids).not.toContain('payment_pending');
    expect(ids).not.toContain('payment_overdue');
    expect(portfolioInbox(rows).tasks.map((t) => t.id)).not.toContain('payment');
  });

  it('una fecha pasada sí, y es de gravedad alta', () => {
    const rows = buildPortfolio(
      { clients: [client({ paymentStatus: 'pending', nextPaymentDate: '2026-08-01' })] },
      '2026-08-11'
    );
    const vencido = rows[0].alerts.find((a) => a.id === 'payment_overdue');
    expect(vencido.severity).toBe('alta');
    expect(portfolioInbox(rows).tasks.map((t) => t.id)).toContain('payment');
  });

  /* Sin fecha no es una deuda del cliente: es un dato que falta en su ficha. */
  it('sin fecha se avisa en bajo, no como pago pendiente', () => {
    const rows = buildPortfolio(
      { clients: [client({ paymentStatus: 'pending', nextPaymentDate: null })] },
      '2026-08-11'
    );
    const aviso = rows[0].alerts.find((a) => a.id === 'payment_no_date');
    expect(aviso.severity).toBe('baja');
  });

  /* Lo que vence HOY y sin cobrar es tarea del día. Antes se colaba entre los
     avisos de cortesía —«renueva hoy», gravedad baja, al lado de «renueva en 3
     días»— y no llegaba a la bandeja. */
  it('lo que vence hoy es una tarea, no un aviso de cortesía', () => {
    const rows = buildPortfolio(
      { clients: [client({ paymentStatus: 'pending', nextPaymentDate: '2026-08-11' })] },
      '2026-08-11'
    );
    const alerta = rows[0].alerts.find((a) => a.id === 'payment_due');
    expect(alerta.severity).toBe('media');
    expect(portfolioInbox(rows).tasks.map((t) => t.id)).toContain('payment');
  });

  /* La tarea dice CUÁNTO. Cobrar sin saber el importe obliga a abrir la ficha,
     que es justo lo que la bandeja existe para evitar. */
  it('la tarea de cobrar lleva la tarifa cuando está anotada', () => {
    const rows = buildPortfolio(
      {
        clients: [
          client({
            paymentStatus: 'pending',
            nextPaymentDate: '2026-08-01',
            feeAmount: 60,
            billingPeriod: 'monthly',
          }),
        ],
      },
      '2026-08-11'
    );
    const tarea = portfolioInbox(rows).tasks.find((t) => t.id === 'payment');
    expect(tarea.rows[0].why).toContain('60 € / mes');
    expect(tarea.rows[0].why).toContain('vencido');
  });

  /*
    El filtro «Cobros» y la tarea tienen que coincidir SIEMPRE. Se separaron una
    vez —los dos buscaban un `payment_pending` que ya no emitía nadie— y una
    tarjeta que dice «1» y al pulsarla enseña otra cosa destruye la confianza en
    la pantalla entera.
  */
  it('el filtro de cobros y la tarea cuentan lo mismo', () => {
    const rows = buildPortfolio(
      {
        clients: [
          client({ id: 'a', paymentStatus: 'pending', nextPaymentDate: '2026-08-01' }),
          client({ id: 'b', paymentStatus: 'pending', nextPaymentDate: '2026-08-11' }),
          client({ id: 'c', paymentStatus: 'pending', nextPaymentDate: '2026-09-30' }),
          client({ id: 'd', paymentStatus: 'paid', nextPaymentDate: '2026-08-13' }),
        ],
      },
      '2026-08-11'
    );

    const tarea = portfolioInbox(rows).tasks.find((t) => t.id === 'payment');
    const filtro = PORTFOLIO_FILTERS.find((f) => f.id === 'payment');

    expect(tarea.rows.length).toBe(2);
    expect(rows.filter(filtro.test).length).toBe(2);
    expect(portfolioSummary(rows).paymentIssues).toBe(2);
  });
});


/*
  ══ La cola de revisiones ═══════════════════════════════════════════════════

  Lo que protege esto es que la lista NO salga entera. Sin cadencia aparecían los
  veinte clientes cada semana, y una lista de pendientes que sale siempre completa
  es la cartera con otro título: se deja de mirar en dos semanas.
*/
describe('la cola de revisiones', () => {
  const HOY = '2026-08-20'; // jueves
  const LUNES = '2026-08-17';

  const fila = (name, { weekday = 3, everyWeeks = 1, startDate = '2026-08-17' } = {}, review = {}, checkIn = {}) => ({
    /* Con cuenta enlazada, que es el caso normal: sin ella no se le puede
       reclamar nada porque no puede ni entrar a entregarlo. */
    client: {
      id: name,
      name,
      startDate,
      clientProfileId: 'user-1',
      preferences: { checkin: { weekday, everyWeeks } },
    },
    review: { exact: true, submittedAt: null, reviewedAt: null, pending: false, id: 'ci', ...review },
    checkIn: { count: 0, target: 3, weekStart: LUNES, ...checkIn },
    severity: 'baja',
  });

  it('sin día elegido no se reclama nada', () => {
    expect(reviewState(fila('Sin día', { weekday: null }), HOY)).toBe('off');
  });

  /*
    Salía como «Sin subir», y era la aplicación reclamándole un check-in a
    alguien que no puede ni entrar a entregarlo — mientras dos bloques más abajo
    le pedía al entrenador justamente que le diera acceso. Lo que hay que hacer
    con esta persona es invitarla, y de eso ya se encarga la alerta `no_account`.
  */
  it('sin cuenta enlazada no se le reclama nada, aunque le tocara', () => {
    const row = fila('Franco');
    row.client.clientProfileId = null;
    expect(reviewState(row, HOY)).toBe('off');
    expect(reviewQueue([row], HOY)).toEqual([]);
  });

  /* El jueves por la mañana nadie ha hecho el check-in del jueves. Antes del día
     señalado no hay nada que reclamar. */
  it('antes del día que le toca, tampoco', () => {
    expect(reviewState(fila('Aún no', { weekday: 6 }), HOY)).toBe('off');
  });

  it('le tocaba y ha subido: te espera', () => {
    const row = fila('Marta', {}, { submittedAt: '2026-08-20', pending: true });
    expect(reviewState(row, HOY)).toBe('ready');
  });

  it('le tocaba y no ha subido: sin subir', () => {
    expect(reviewState(fila('Luis'), HOY)).toBe('missing');
  });

  it('ya revisado en este periodo: fuera de la cola', () => {
    const row = fila('Ana', {}, { submittedAt: '2026-08-19', reviewedAt: '2026-08-20' });
    expect(reviewState(row, HOY)).toBe('done');
    expect(reviewQueue([row], HOY)).toEqual([]);
  });

  /*
    El caso que motivó todo esto. Quincenal con el día en el jueves: el lunes y el
    martes de su semana no se le reclama nada, porque su cita todavía no ha
    llegado. Antes aparecía igual, junto a los otros diecinueve.
  */
  it('quincenal: antes de su día no aparece', () => {
    const row = fila('Quincenal', { everyWeeks: 2, startDate: '2026-08-17' });
    expect(reviewState(row, '2026-08-18')).toBe('off');
  });

  /* Y pasado su día sigue pendiente hasta que lo suba, aunque cambie de semana:
     llegar tarde no es dejar de deber. */
  it('quincenal: pasado su día sigue pendiente la semana siguiente', () => {
    const row = fila('Quincenal', { everyWeeks: 2, startDate: '2026-08-10' });
    expect(reviewState(row, HOY)).toBe('missing');
  });

  it('quincenal: la semana que sí toca, y cuenta lo entregado de ese periodo', () => {
    const row = fila(
      'Quincenal',
      { everyWeeks: 2, startDate: '2026-08-17' },
      { submittedAt: '2026-08-20', pending: true }
    );
    expect(reviewState(row, HOY)).toBe('ready');
  });

  it('primero quien te espera y después quien no ha subido', () => {
    const espera = fila('Espera', {}, { submittedAt: '2026-08-20', pending: true });
    const falta = fila('Falta');
    expect(reviewQueue([falta, espera], HOY).map((r) => r.client.name)).toEqual(['Espera', 'Falta']);
  });
});

/*
  ══ El cliente al que no le llevas el entrenamiento ═════════════════════════

  «Sin rutina asignada» es de gravedad ALTA, así que a un cliente de solo
  nutrición lo dejaría el primero de la cartera, en rojo y para siempre, por
  hacer exactamente lo que se acordó con él. Las alertas de entrenamiento cuelgan
  del servicio; las de peso y check-in no, que esas se le piden igual.
*/
describe('clientStatus con un cliente de solo nutrición', () => {
  const soloDieta = client({
    preferences: { protocol: { services: { training: false } } },
  });

  it('no le reprocha no tener rutina', () => {
    /*
      Con un pesaje reciente, para que el cliente cuente como ARRANCADO. Sin él
      caería en «todavía no ha empezado», que se lleva por delante el resto de
      alertas — y esta prueba pasaría sin que el filtro existiera.
    */
    const row = clientStatus(
      { client: soloDieta, anthro: { history: [{ date: '2026-08-10', weight: 70 }] } },
      '2026-08-11'
    );
    const ids = row.alerts.map((a) => a.id);

    expect(ids).not.toContain('no_program');
    expect(ids).not.toContain('never_trained');
    expect(ids).not.toContain('stale_training');
  });

  it('pero sí le sigue pidiendo su peso', () => {
    const row = clientStatus(
      { client: soloDieta, anthro: { history: [{ date: '2026-06-01', weight: 70 }] } },
      '2026-08-11'
    );
    expect(row.alerts.map((a) => a.id)).toContain('stale_weight');
  });

  it('y a quien sí le llevas el entrenamiento le avisa como siempre', () => {
    const row = clientStatus(
      { client: client(), anthro: { history: [{ date: '2026-08-10', weight: 70 }] } },
      '2026-08-11'
    );
    expect(row.alerts.map((a) => a.id)).toContain('no_program');
  });
});

/*
  ══ «Ya puedes empezar con él» ═══════════════════════════════════════════════

  El aviso que cierra el circuito del alta: el cliente entrega lo suyo y a partir
  de ahí le toca al entrenador. Sin él, enterarse de que ya se puede empezar
  exigía entrar en su ficha a mirar — o sea, acordarse de mirar.

  Lo que estas pruebas defienden son sus tres condiciones, porque cada una evita
  un aviso falso distinto y ninguna se ve mirando la pantalla.
*/
describe('el aviso de alta entregada', () => {
  /* Le pide las tres entregas y le quedan sus dos pasos por hacer. */
  const preferences = {
    intake: { steps: ['form', 'gymPhotos', 'postureReview'], done: [] },
    /* Un cuestionario con UNA pregunta, para poder darlo por contestado sin
       tener que rellenar diecinueve campos en cada caso. */
    intakeForm: { asked: ['sleepHours'], custom: [], askHealth: false },
  };

  const entregado = client({
    preferences,
    profile: { sleepHours: 7 },
    postureReviewed: false,
  });

  const tiene = (row) => row.alerts.some((a) => a.id === 'intake_ready');

  it('salta cuando lo ha entregado todo y a ti te falta algo', () => {
    const row = clientStatus({ client: entregado, equipmentCount: 4 }, '2026-08-11');
    expect(tiene(row)).toBe(true);
  });

  /* A medias no vale: montar un plan con la mitad de las respuestas es lo que
     este circuito viene a evitar. */
  it('no salta si le falta una de sus entregas', () => {
    const sinFotos = clientStatus({ client: entregado, equipmentCount: 0 }, '2026-08-11');
    expect(tiene(sinFotos)).toBe(false);

    const sinCuestionario = clientStatus(
      { client: { ...entregado, profile: {} }, equipmentCount: 4 },
      '2026-08-11'
    );
    expect(tiene(sinCuestionario)).toBe(false);
  });

  /* Si tus pasos están cerrados no hay tarea: el aviso sería el recordatorio de
     algo terminado, y eso es exactamente cómo una bandeja deja de leerse. */
  it('no salta si ya has hecho lo tuyo', () => {
    const row = clientStatus(
      { client: { ...entregado, postureReviewed: true }, equipmentCount: 4 },
      '2026-08-11'
    );
    expect(tiene(row)).toBe(false);
  });

  /* Quien no le pide nada a su cliente no tiene nada que esperar, así que no hay
     momento en el que «acabe de entregar». */
  it('no salta si no le pides nada a él', () => {
    const soloTuyos = client({
      preferences: { intake: { steps: ['postureReview'], done: [] } },
      postureReviewed: false,
    });
    expect(tiene(clientStatus({ client: soloTuyos }, '2026-08-11'))).toBe(false);
  });

  it('llega a la bandeja como su propia tarea, y delante de «terminar el alta»', () => {
    const rows = buildPortfolio(
      { clients: [entregado], equipmentCounts: { c1: 4 } },
      '2026-08-11'
    );
    const { tasks } = portfolioInbox(rows);
    const ids = tasks.map((t) => t.id);

    expect(ids).toContain('intake_ready');
    expect(ids.indexOf('intake_ready')).toBeLessThan(
      ids.indexOf('intake') === -1 ? Infinity : ids.indexOf('intake')
    );
  });
});
