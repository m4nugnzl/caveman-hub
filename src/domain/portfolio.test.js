import { describe, expect, it } from 'vitest';

import {
  BOARD_COLUMNS,
  INBOX_TASKS,
  buildPortfolio,
  clientStatus,
  isArchived,
  portfolioBoard,
  portfolioInbox,
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
});
