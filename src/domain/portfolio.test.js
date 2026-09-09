import { describe, expect, it } from 'vitest';

import {
  BOARD_COLUMNS,
  COLAS_INICIO,
  INBOX_TASKS,
  TRAMITES_INICIO,
  PORTFOLIO_FILTERS,
  buildPortfolio,
  clientStatus,
  columnFor,
  isArchived,
  pauseOf,
  reviewState,
  portfolioBoard,
  portfolioInbox,
  portfolioSummary,
  colasDeInicio,
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

/*
  ══ El check-in se reclama contra lo que el entrenador PIDE ══════════════════

  El objetivo eran tres pesajes escritos en `weeklyCheckIn`, así que «check-in a
  medias (1/3)» le salía a media cartera por incumplir un número que nadie había
  puesto. De esta alerta cuelgan además la columna «Check-in pendiente» y su
  cifra de cabecera.
*/
describe('el check-in a medias necesita un número pedido', () => {
  const jueves = '2026-08-13'; // a mitad de semana, que es cuando se reclama
  const pesajes = [{ id: 'a1', date: '2026-08-10', weight: 80 }];

  const estadoCon = (weighIns) =>
    clientStatus(
      {
        client: client({ preferences: { protocol: { weighIns } } }),
        anthro: { history: pesajes },
      },
      jueves
    );

  it('sin pesajes pedidos, no lo reclama', () => {
    const row = estadoCon(0);
    expect(row.alerts.map((a) => a.id)).not.toContain('checkin_pending');
    /* Y por tanto tampoco cae en la columna de check-in pendiente. */
    expect(row.checkIn.asked).toBe(false);
  });

  it('con tres pedidos y uno hecho, sí', () => {
    const alerta = estadoCon(3).alerts.find((a) => a.id === 'checkin_pending');
    expect(alerta).toBeDefined();
    expect(alerta.label).toContain('1/3');
  });
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

  /*
    La entrega sin contestar no caduca al cambiar de semana. Sin pauta, «el
    periodo en curso» se caía al lunes de hoy, así que lo entregado el jueves
    anterior desaparecía de la cartera el lunes siguiente: el cliente había
    subido lo suyo y su entrenador dejaba de verlo sin haber contestado.
  */
  it('lo entregado y sin contestar sigue en la cartera aunque sea de otra semana', () => {
    const rows = buildPortfolio(
      {
        clients: [client()],
        checkIns: {
          c1: { id: 'ci1', weekStart: '2026-08-03', submittedAt: '2026-08-06', reviewedAt: null },
        },
      },
      '2026-08-11'
    );

    expect(rows[0].review.exact).toBe(true);
    expect(rows[0].review.pending).toBe(true);
    expect(portfolioBoard(rows).find((c) => c.id === 'to_review').rows).toHaveLength(1);
  });

  it('una cartera vacía da columnas vacías, no columnas ausentes', () => {
    // La cabecera de cada columna tiene que existir igualmente: un tablero al que le
    // faltan columnas no se lee como «no hay nadie ahí», se lee como roto.
    const board = portfolioBoard([]);
    expect(board).toHaveLength(BOARD_COLUMNS.length);
    expect(board.every((c) => c.rows.length === 0)).toBe(true);
  });
});

/*
  ══ Lo que le mandaste y no ha hecho ═══════════════════════════════════════

  Lo suelto se veía en `/protocolos` envío por envío y en su ficha, así que para
  saber a quién le falta algo había que abrirlos de uno en uno y cruzarlos
  mentalmente. Esta es la vuelta que faltaba: sale donde ya se mira todo lo demás.
*/
describe('lo mandado vuelve a la cartera', () => {
  it('sin nada pendiente no dice nada', () => {
    const row = clientStatus({ client: client(), mandadoCount: 0 }, '2026-08-11');
    expect(row.alerts.map((a) => a.id)).not.toContain('mandado_pending');
  });

  it('con una cosa y con varias, lo dice contado', () => {
    const una = clientStatus({ client: client(), mandadoCount: 1 }, '2026-08-11');
    expect(una.alerts.find((a) => a.id === 'mandado_pending').label).toBe(
      'Le falta algo que le mandaste'
    );

    const varias = clientStatus({ client: client(), mandadoCount: 3 }, '2026-08-11');
    expect(varias.alerts.find((a) => a.id === 'mandado_pending').label).toBe(
      'Le faltan 3 cosas que le mandaste'
    );
  });

  /* En pausa no se le reclama NADA, y esto no es una excepción: a quien le has
     dicho que pare no se le recuerdan deberes. */
  it('a quien está en pausa no se le reclama', () => {
    const enPausa = client({ status: 'paused', pausedUntil: '2099-01-01' });
    const row = clientStatus({ client: enPausa, mandadoCount: 2 }, '2026-08-11');
    expect(row.alerts.map((a) => a.id)).not.toContain('mandado_pending');
  });

  it('entra en la bandeja como una cola más', () => {
    const rows = buildPortfolio(
      { clients: [client()], mandadoCounts: { c1: 2 } },
      '2026-08-11'
    );
    const { tasks } = portfolioInbox(rows);
    const cola = tasks.find((t) => t.id === 'mandado');
    expect(cola).toBeDefined();
    expect(cola.rows).toHaveLength(1);
    expect(cola.rows[0].why).toBe('Le faltan 2 cosas que le mandaste');
  });
});

/*
  ══ Y lo que ha VUELTO ══════════════════════════════════════════════════════

  La otra mitad: con la alerta de arriba sola, la cartera sabía decir a quién le
  falta algo y no sabía decir quién ya lo ha mandado. La marca de leído (0108) es
  lo que hace que esta cola se pueda vaciar.
*/
/*
  ══ Ninguna tarea se calcula para nadie ═════════════════════════════════════

  «Hoy» pinta las COLAS y los TRÁMITES, y nada más. Una tarea de `INBOX_TASKS`
  que no esté en ninguna de las dos listas se calcula en cada render y no sale en
  ninguna pantalla — que es lo que le pasó a «Les falta lo que les mandaste»
  desde que se escribió. Esta prueba es la que lo impide de aquí en adelante.
*/
describe('la bandeja llega entera a Inicio', () => {
  it('cada tarea es una cola o un trámite', () => {
    const enColas = new Set(COLAS_INICIO.flatMap((c) => c.tasks));
    /* «Por revisar» no declara `tasks`: se construye con `reviewQueue`, que es
       otra forma del mismo trabajo. */
    enColas.add('review');
    const huerfanas = INBOX_TASKS.map((t) => t.id).filter(
      (id) => !enColas.has(id) && !TRAMITES_INICIO.includes(id)
    );
    expect(huerfanas).toEqual([]);
  });

  it('lo contestado sale como cola propia, con su verbo', () => {
    const rows = buildPortfolio({ clients: [client()], contestadoCounts: { c1: 2 } }, '2026-08-11');
    const cola = colasDeInicio(rows, '2026-08-11').find((c) => c.id === 'leer');
    expect(cola.n).toBe(1);
    expect(cola.label).toBe('Sin leer');
    expect(cola.verbo).toBe('Leer');
    expect(cola.filas[0].row.client.id).toBe('c1');
  });
});

describe('lo contestado vuelve a la cartera', () => {
  it('sin nada por leer no dice nada', () => {
    const row = clientStatus({ client: client(), contestadoCount: 0 }, '2026-08-11');
    expect(row.alerts.map((a) => a.id)).not.toContain('contestado_nuevo');
  });

  it('con una y con varias, lo dice contado', () => {
    const una = clientStatus({ client: client(), contestadoCount: 1 }, '2026-08-11');
    expect(una.alerts.find((a) => a.id === 'contestado_nuevo').label).toBe(
      'Te ha contestado y no lo has leído'
    );

    const varias = clientStatus({ client: client(), contestadoCount: 3 }, '2026-08-11');
    expect(varias.alerts.find((a) => a.id === 'contestado_nuevo').label).toBe(
      'Te ha contestado 3 cosas sin leer'
    );
  });

  /* Misma vara que el check-in por revisar: es el mismo hecho —alguien ha hecho
     su parte y espera—, y dos gravedades distintas ordenarían mal la cartera. */
  it('pesa lo mismo que un check-in por revisar', () => {
    const row = clientStatus({ client: client(), contestadoCount: 1 }, '2026-08-11');
    expect(row.alerts.find((a) => a.id === 'contestado_nuevo').severity).toBe('media');
  });

  /* En pausa se calla, igual que la entrega del check-in: «una entrega en pausa
     no es trabajo hasta la vuelta». La respuesta no se pierde — sigue sin leer. */
  it('a quien está en pausa no se le reclama todavía', () => {
    const enPausa = client({ status: 'paused', pausedUntil: '2099-01-01' });
    const row = clientStatus({ client: enPausa, contestadoCount: 2 }, '2026-08-11');
    expect(row.alerts.map((a) => a.id)).not.toContain('contestado_nuevo');
  });

  it('entra en la bandeja, y como trabajo que ESPERA', () => {
    const rows = buildPortfolio({ clients: [client()], contestadoCounts: { c1: 1 } }, '2026-08-11');
    const { tasks } = portfolioInbox(rows);
    const cola = tasks.find((t) => t.id === 'contestado');
    expect(cola).toBeDefined();
    expect(cola.awaited).toBe(true);
    expect(cola.rows).toHaveLength(1);
    expect(cola.rows[0].why).toBe('Te ha contestado y no lo has leído');
  });

  /* Lo que ha vuelto va DELANTE de lo que falta: leerlo cambia a menudo lo que
     ibas a reclamar. */
  it('va delante de «les falta lo que les mandaste»', () => {
    const rows = buildPortfolio(
      { clients: [client()], contestadoCounts: { c1: 1 }, mandadoCounts: { c1: 1 } },
      '2026-08-11'
    );
    const ids = portfolioInbox(rows).tasks.map((t) => t.id);
    expect(ids.indexOf('contestado')).toBeLessThan(ids.indexOf('mandado'));
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
    ══ Pero una ENTREGA sí, tenga pauta o no ══════════════════════════════════

    Lo reportó un entrenador: un cliente sin periodicidad subía sus fotos y sus
    pesajes, la entrega se guardaba… y «Por revisar» seguía vacío. No se puede
    llegar tarde a una cita que nadie ha puesto —de ahí el `off` de arriba—,
    pero una respuesta que le debes no depende de ninguna cita.
  */
  it('sin día elegido, si ha entregado, te espera igual', () => {
    const row = fila('Sin día', { weekday: null }, { submittedAt: '2026-08-20', pending: true });
    expect(reviewState(row, HOY)).toBe('ready');
    expect(reviewQueue([row], HOY).map((r) => r.review_state)).toEqual(['ready']);
  });

  /* La aproximación de «ha hecho su parte» (sin la migración 0009) NO cuenta:
     es una conjetura, y una conjetura sin cita detrás es ruido, no trabajo. */
  it('sin día elegido, la entrega solo aproximada no reclama nada', () => {
    const row = fila('Sin día', { weekday: null }, { exact: false, pending: true });
    expect(reviewState(row, HOY)).toBe('off');
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

/*
  ══ La pausa: el estado del lesionado y del que se va un mes ═════════════════

  Sin ella solo había dos sitios donde estar —activo, con alertas falsas que
  reprochan parar a quien TÚ le dijiste que parara, o archivado, como si hubiera
  terminado—. La regla entera es «sin reproches»: vigente, ni una alerta;
  vencida, las alertas vuelven solas y lo único nuevo es el aviso de que venció.
*/
describe('la pausa', () => {
  const hoy = '2026-09-07';
  /* Sin cuenta enlazada a propósito: es la alerta más tozuda de todas (gravedad
     alta, sale la primera), así que si la pausa calla ESA, calla cualquiera. */
  const pausado = client({ status: 'paused', pausedUntil: '2026-10-12', clientProfileId: null });

  it('vigente: ni una alerta, y la fila lo dice', () => {
    const row = clientStatus({ client: pausado }, hoy);

    expect(row.alerts).toEqual([]);
    expect(row.severity).toBeNull();
    expect(row.needsAttention).toBe(false);
    expect(row.paused).toEqual({ on: true, until: '2026-10-12', expired: false });
  });

  it('sin fecha también es una pausa: dura hasta que alguien la levante', () => {
    expect(pauseOf(client({ status: 'paused' }), hoy)).toEqual({
      on: true,
      until: null,
      expired: false,
    });
  });

  it('vencida: las alertas vuelven y lo único nuevo es el aviso de que venció', () => {
    const row = clientStatus(
      { client: client({ status: 'paused', pausedUntil: '2026-09-01', clientProfileId: null }) },
      hoy
    );
    const ids = row.alerts.map((a) => a.id);

    expect(ids).toContain('pause_over');
    expect(ids).toContain('no_account'); // la pausa vencida ya no silencia nada
    expect(row.paused).toBeNull();
  });

  it('la cola de revisiones lo da por off, aunque haya entregado', () => {
    expect(reviewState({ client: client(), paused: { on: true, until: null } })).toBe('off');
  });

  it('en el tablero va con los que están al día, y en la lista al final', () => {
    const rows = buildPortfolio(
      { clients: [pausado, client({ id: 'c2', name: 'Bea', clientProfileId: null })] },
      hoy
    );

    const fila = rows.find((r) => r.client.id === 'c1');
    expect(columnFor(fila)).toBe('on_track');
    /* Bea tiene una alerta alta; el pausado, ninguna: va detrás. */
    expect(rows.map((r) => r.client.id)).toEqual(['c2', 'c1']);
  });

  it('tiene su filtro con su cifra, y no se cuela en «al día»', () => {
    const rows = buildPortfolio(
      { clients: [pausado, client({ id: 'c2', name: 'Bea' })] },
      hoy
    );
    const cuenta = (id) => rows.filter(PORTFOLIO_FILTERS.find((f) => f.id === id).test).length;

    expect(cuenta('paused')).toBe(1);
    expect(rows.filter(PORTFOLIO_FILTERS.find((f) => f.id === 'ok').test)
      .map((r) => r.client.id)).not.toContain('c1');
  });

  it('una entrega en pausa no cuenta como trabajo pendiente', () => {
    /* `review.pending` lo leen la bandeja de Hoy y los filtros SIN pasar por
       `reviewState`: si la pausa no lo apagara aquí, el pausado saldría en
       «Responder check-ins» — trabajo que no corre hasta su vuelta. */
    const rows = buildPortfolio(
      {
        clients: [pausado],
        checkIns: {
          c1: { id: 'ci1', weekStart: '2026-08-31', submittedAt: '2026-09-03', reviewedAt: null },
        },
      },
      hoy
    );

    expect(rows[0].review.pending).toBe(false);
    expect(rows[0].review.submittedAt).toBe('2026-09-03'); // la entrega no se pierde
  });
});

/*
  ══ La vara es de cada persona ═══════════════════════════════════════════════

  «7 días sin entrenar» salta en cada semana normal de quien entrena dos días.
  Afinada en su protocolo (`alertDays`), la alerta espera lo que ESA persona
  tiene de silencio normal; sin afinar (0), la vara general de siempre.
*/
describe('el umbral de alerta afinado por cliente', () => {
  const hoy = '2026-09-07';
  /* 9 días sin entrenar: por encima de la vara general (7) y por debajo de una
     afinada a 14. El mismo dato, dos veredictos — que es el punto. */
  const conSilencio = (alertDays) =>
    clientStatus(
      {
        client: client({ preferences: { protocol: alertDays ? { alertDays } : {} } }),
        training: {
          lastTraining: '2026-08-29',
          microcycleCount: 4,
          sessionCount: 12,
          weekNumber: 4,
        },
      },
      hoy
    );

  it('sin afinar, manda la vara general', () => {
    expect(conSilencio(null).alerts.map((a) => a.id)).toContain('stale_training');
  });

  it('afinada a 14, nueve días de silencio no son una alerta', () => {
    expect(conSilencio({ training: 14 }).alerts.map((a) => a.id)).not.toContain('stale_training');
  });

  it('un valor absurdo guardado a mano cae a la vara general', () => {
    expect(conSilencio({ training: 'catorce' }).alerts.map((a) => a.id)).toContain('stale_training');
    expect(conSilencio({ training: -3 }).alerts.map((a) => a.id)).toContain('stale_training');
  });
});
