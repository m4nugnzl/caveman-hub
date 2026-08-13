import { describe, expect, it } from 'vitest';

import { BOARD_COLUMNS, buildPortfolio, clientStatus, isArchived, portfolioBoard } from './portfolio';

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
