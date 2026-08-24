import { describe, expect, it } from 'vitest';

import {
  actividadSemanal,
  censo,
  diasEntre,
  embudo,
  fallosAgrupados,
  mediana,
  negocio,
  porEvento,
  porPantalla,
  retencionSemanaSiguiente,
  semanaDe,
  usoDeCampos,
} from './analisis.js';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Un informe que se equivoca es peor que no tener informe, porque con él se
 * toman decisiones. «El 4 % mide el pliegue de pantorrilla» va a hacer que ese
 * campo se quite de la pantalla; si la cifra estaba mal calculada, se quita un
 * campo que sí se usaba y nadie va a volver a comprobarlo.
 *
 * Aquí se fijan las reglas que se pueden equivocar en silencio: qué cuenta como
 * una cuenta y no como una persona, qué es un hito alcanzado, y —la que más
 * importa— que un campo que no ha rellenado nadie nunca APAREZCA en el
 * resultado con un cero, en vez de desaparecer de la lista.
 */

describe('semanaDe', () => {
  it('devuelve el lunes de la semana natural', () => {
    /* 2026-08-16 es domingo. Su lunes es el 10, no el 17. */
    expect(semanaDe('2026-08-16')).toBe('2026-08-10');
    expect(semanaDe('2026-08-10')).toBe('2026-08-10');
    expect(semanaDe('2026-08-11')).toBe('2026-08-10');
  });

  it('el domingo retrocede seis días, no cero', () => {
    /* El error clásico: `getUTCDay()` vale 0 el domingo, así que un cálculo
       ingenuo deja el domingo como su propio lunes y parte la semana en dos. */
    expect(semanaDe('2026-08-16')).not.toBe('2026-08-16');
  });

  it('no inventa nada con una fecha que no lo es', () => {
    expect(semanaDe('no es una fecha')).toBe(null);
    expect(semanaDe(undefined)).toBe(null);
  });
});

describe('mediana', () => {
  it('resiste al valor extremo que estropearía la media', () => {
    /* El caso real: cuatro check-ins contestados en horas y uno contestado tres
       semanas después, porque el entrenador estaba de vacaciones. */
    const horas = [2, 3, 4, 5, 500];
    expect(mediana(horas)).toBe(4);
    const media = horas.reduce((a, b) => a + b, 0) / horas.length;
    expect(media).toBeGreaterThan(100);
  });

  it('con un número par de valores promedia los dos del medio', () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });

  it('sin datos no devuelve cero, devuelve nada', () => {
    /* Cero horas de respuesta y «no hay ninguna revisión» son dos cosas
       distintas, y la primera se leería como un producto que va perfecto. */
    expect(mediana([])).toBe(null);
  });
});

describe('embudo', () => {
  const equipos = [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }];
  const clientes = [
    { id: 'c1', team_id: 't1', client_profile_id: 'p1' },
    { id: 'c2', team_id: 't2', client_profile_id: null },
    { id: 'c3', team_id: 't3', client_profile_id: null },
  ];
  const programas = [
    { client_id: 'c1', microcycles: [{ weekNumber: 1 }] },
    { client_id: 'c2', microcycles: [{ weekNumber: 1 }] },
    /* Fila creada al abrir la pantalla y nunca usada: no es un programa. */
    { client_id: 'c3', microcycles: [] },
  ];
  const checkins = [{ client_id: 'c1', reviewed_at: '2026-08-01T10:00:00Z' }];

  it('cuenta cuentas, no personas ni clientes', () => {
    const pasos = embudo({ equipos, clientes, programas, checkins });
    expect(pasos.map((p) => p.cuentas)).toEqual([4, 3, 2, 1, 1]);
  });

  it('una fila de programa vacía no cuenta como haber programado', () => {
    /* La fila existe desde que se abre la pantalla. Contarla haría que el hito
       más importante del embudo midiera curiosidad en vez de trabajo. */
    const pasos = embudo({ equipos, clientes, programas, checkins });
    expect(pasos[2].cuentas).toBe(2);
  });

  it('la caída es contra el paso anterior, no contra el total', () => {
    const pasos = embudo({ equipos, clientes, programas, checkins });
    expect(pasos[1].caida).toBe(1);
    expect(pasos[3].caida).toBe(1);
    expect(pasos[0].caida).toBe(0);
  });

  it('sin equipos no divide por cero', () => {
    expect(embudo({}).every((p) => p.pct === 0)).toBe(true);
  });
});

describe('actividadSemanal', () => {
  it('dos personas del mismo equipo son UNA cuenta activa', () => {
    /* Es la regla que impide que un equipo de cuatro parezca cuatro clientes. */
    const eventos = [
      { at: '2026-08-11T09:00:00Z', team_id: 't1', actor: 'a' },
      { at: '2026-08-12T09:00:00Z', team_id: 't1', actor: 'b' },
      { at: '2026-08-12T09:00:00Z', team_id: 't2', actor: 'c' },
    ];
    const semanas = actividadSemanal(eventos, { semanas: 2, hoy: '2026-08-16' });
    expect(semanas.at(-1)).toEqual({ semana: '2026-08-10', cuentas: 2 });
  });

  it('una semana sin actividad sale con cero, no desaparece', () => {
    /* Un hueco que se salta convierte una caída a cero en una línea plana. */
    const eventos = [{ at: '2026-08-11T09:00:00Z', team_id: 't1' }];
    const semanas = actividadSemanal(eventos, { semanas: 3, hoy: '2026-08-16' });
    expect(semanas).toHaveLength(3);
    expect(semanas.map((s) => s.cuentas)).toEqual([0, 0, 2 - 1]);
  });

  it('sin equipo cuenta la persona, para no perder al que aún no lo tiene', () => {
    const eventos = [{ at: '2026-08-11T09:00:00Z', team_id: null, actor: 'suelto' }];
    expect(actividadSemanal(eventos, { semanas: 1, hoy: '2026-08-16' })[0].cuentas).toBe(1);
  });
});

describe('retencionSemanaSiguiente', () => {
  it('mide quién VUELVE, no cuánta gente hay', () => {
    const eventos = [
      { at: '2026-08-03T09:00:00Z', team_id: 't1' },
      { at: '2026-08-03T09:00:00Z', team_id: 't2' },
      /* De los dos de la primera semana solo vuelve uno; el otro nombre es
         nuevo, así que la semana 2 también tiene dos activas y el recuento a
         secas no vería ninguna fuga. */
      { at: '2026-08-10T09:00:00Z', team_id: 't1' },
      { at: '2026-08-10T09:00:00Z', team_id: 't3' },
    ];
    const [primera] = retencionSemanaSiguiente(eventos);
    expect(primera).toMatchObject({ semana: '2026-08-03', activas: 2, vuelven: 1, pct: 50 });
  });

  it('la última semana no se mide: todavía no tiene siguiente', () => {
    const eventos = [
      { at: '2026-08-03T09:00:00Z', team_id: 't1' },
      { at: '2026-08-10T09:00:00Z', team_id: 't1' },
    ];
    expect(retencionSemanaSiguiente(eventos)).toHaveLength(1);
  });
});

describe('porPantalla', () => {
  const eventos = [
    { name: 'pantalla_vista', props: { pantalla: 'hoy' }, team_id: 't1' },
    { name: 'pantalla_vista', props: { pantalla: 'hoy' }, team_id: 't2' },
    { name: 'pantalla_vista', props: { pantalla: 'cliente_rutina' }, team_id: 't1' },
    { name: 'cliente_creado', props: {}, team_id: 't1' },
  ];

  it('separa las veces de las cuentas distintas', () => {
    const { usadas } = porPantalla(eventos, []);
    expect(usadas[0]).toEqual({ nombre: 'hoy', veces: 2, cuentas: 2 });
    expect(usadas[1]).toEqual({ nombre: 'cliente_rutina', veces: 1, cuentas: 1 });
  });

  it('las pantallas que NO ha abierto nadie son la mitad útil del resultado', () => {
    /* Sin el catálogo, lo que no se usa simplemente no aparece — y es justo lo
       que se está buscando. Es la diferencia entre «qué se usa» y «qué sobra». */
    const catalogo = ['hoy', 'cliente_rutina', 'cliente_calendario', 'ajustes_integraciones'];
    const { sinUso } = porPantalla(eventos, catalogo);
    expect(sinUso).toEqual(['ajustes_integraciones', 'cliente_calendario']);
  });
});

describe('porEvento', () => {
  it('ordena por veces y cuenta las cuentas aparte', () => {
    const eventos = [
      { name: 'a', team_id: 't1' },
      { name: 'a', team_id: 't1' },
      { name: 'b', team_id: 't2' },
    ];
    expect(porEvento(eventos)).toEqual([
      { nombre: 'a', veces: 2, cuentas: 1 },
      { nombre: 'b', veces: 1, cuentas: 1 },
    ]);
  });
});

describe('fallosAgrupados', () => {
  it('ordena por CUENTAS afectadas, no por número de veces', () => {
    /*
      La regla más importante del archivo. Un fallo que le pasa doscientas veces
      a una persona es un caso raro suyo; uno que le pasa una vez a tres
      personas es un error del producto. Con el orden por veces, el segundo no
      sale nunca en la primera pantalla y no se arregla nunca.
    */
    const fallos = [
      { source: 'js', ruta: '/hoy', code: null, message: 'raro', veces: 200, team_id: 't1', rol: 'coach', at: '2026-08-01' },
      { source: 'servidor', ruta: '/c/:id/rutina', code: '42501', message: 'rls', veces: 1, team_id: 't1', rol: 'coach', at: '2026-08-02' },
      { source: 'servidor', ruta: '/c/:id/rutina', code: '42501', message: 'rls', veces: 1, team_id: 't2', rol: 'coach', at: '2026-08-03' },
      { source: 'servidor', ruta: '/c/:id/rutina', code: '42501', message: 'rls', veces: 1, team_id: 't3', rol: 'client', at: '2026-08-04' },
    ];

    const [primero] = fallosAgrupados(fallos);
    expect(primero.message).toBe('rls');
    expect(primero.cuentas).toBe(3);
    expect(primero.veces).toBe(3);
  });

  it('se queda con la fecha del más reciente y con los dos portales', () => {
    const fallos = [
      { source: 's', ruta: '/mi/rutina', code: 'x', message: 'm', veces: 1, team_id: 't1', rol: 'client', at: '2026-08-01' },
      { source: 's', ruta: '/mi/rutina', code: 'x', message: 'm', veces: 1, team_id: 't1', rol: 'coach', at: '2026-08-09' },
    ];
    const [grupo] = fallosAgrupados(fallos);
    expect(grupo.ultimo).toBe('2026-08-09');
    expect(grupo.roles).toBe('client, coach');
  });
});

describe('usoDeCampos', () => {
  const ETIQUETAS = ['tricipital', 'subescapular', 'abdominal', 'pantorrilla'];

  it('un campo que no ha rellenado nadie sale con CERO, no desaparece', () => {
    /*
      La razón de ser de la función. Si el campo desapareciera de la lista, el
      informe diría «los campos que se usan son estos tres» y nadie se
      preguntaría por el cuarto — que es exactamente el que hay que quitar de la
      pantalla.
    */
    const registros = [
      { skinFolds: { tricipital: 12, abdominal: 20 } },
      { skinFolds: { tricipital: 11 } },
      { skinFolds: null },
    ];

    const uso = usoDeCampos(registros, (r) => r.skinFolds, ETIQUETAS);
    const pantorrilla = uso.campos.find((c) => c.campo === 'pantorrilla');

    expect(pantorrilla).toEqual({ campo: 'pantorrilla', veces: 0, pct: 0 });
  });

  it('un cero medido cuenta como medido; un vacío, no', () => {
    /* `domain/anthropometry.js` es explícito: un cero no es lo mismo que «no
       medido», y confundirlos falsea las sumas. */
    const registros = [{ skinFolds: { tricipital: 0, subescapular: '' } }];
    const uso = usoDeCampos(registros, (r) => r.skinFolds, ETIQUETAS);

    expect(uso.campos.find((c) => c.campo === 'tricipital').veces).toBe(1);
    expect(uso.campos.find((c) => c.campo === 'subescapular').veces).toBe(0);
  });

  it('el porcentaje es sobre TODOS los registros, no sobre los rellenados', () => {
    /* Sobre los rellenados, cualquier campo del grupo saldría al 100 % y la
       lista dejaría de distinguir nada. */
    const registros = [{ skinFolds: { tricipital: 10 } }, { skinFolds: null }];
    const uso = usoDeCampos(registros, (r) => r.skinFolds, ETIQUETAS);

    expect(uso.total).toBe(2);
    expect(uso.conAlguno).toBe(1);
    expect(uso.campos.find((c) => c.campo === 'tricipital').pct).toBe(50);
  });
});

describe('censo', () => {
  const base = {
    clientes: [
      { id: 'c1', status: 'active', gender: 'Hombre', start_date: '2026-01-01', client_profile_id: 'p1' },
      { id: 'c2', status: 'active', gender: null, start_date: null, client_profile_id: null },
      { id: 'c3', status: 'archived', gender: 'Mujer', start_date: '2026-02-01', client_profile_id: null },
    ],
    antropometria: [
      { client_id: 'c1', history: [{ weight: 80, skinFolds: { tricipital: 10 } }, { weight: 79 }] },
    ],
    nutricion: [{ client_id: 'c1', target_kcals: 2400, has_day_variants: true }],
    programas: [{ client_id: 'c1', microcycles: [{ sessions: [{}, {}] }, { sessions: [] }] }],
    checkins: [
      { client_id: 'c1', submitted_at: '2026-08-01T10:00:00Z', reviewed_at: '2026-08-01T14:00:00Z' },
      { client_id: 'c1', submitted_at: '2026-08-02T10:00:00Z', reviewed_at: null },
    ],
    fotos: [{ client_id: 'c1' }, { client_id: 'c1' }],
    etiquetas: { pliegues: ['tricipital', 'abdominal'], perimetros: ['pecho'] },
    hoy: '2026-08-16',
  };

  it('cuenta el acceso al portal, que es la mitad del producto', () => {
    const r = censo(base);
    expect(r.clientes.portal).toEqual({ cuantos: 1, pct: 33.3 });
  });

  it('avisa de los clientes sin sexo, que dejan el % graso sin calcular', () => {
    /* La fórmula de pliegues es distinta para hombres y mujeres. Sin el campo,
       las medidas se toman y el resultado no sale — y nadie relaciona una cosa
       con la otra. */
    const r = censo(base);
    expect(r.clientes.conSexo).toBe(66.7);
  });

  it('mide el tiempo de respuesta a un check-in en horas', () => {
    const r = censo(base);
    expect(r.revision.horasMediana).toBe(4);
    expect(r.revision.pctRevisados).toBe(50);
  });

  it('cuenta los check-ins entregados hace más de una semana y sin contestar', () => {
    /* La deuda del entrenador con sus clientes: la razón más común de que uno se
       vaya, y no se ve en ninguna pantalla del producto. */
    expect(censo(base).revision.sinContestar).toBe(1);
  });

  it('el registro, y no el cliente, es la unidad del censo de medidas', () => {
    const r = censo(base);
    expect(r.antropometria.registros).toBe(2);
    /* Un pliegue medido en uno de los dos registros es el 50 %, no el 100 % por
       ser «el cliente que mide pliegues». */
    expect(r.antropometria.pliegues.campos.find((c) => c.campo === 'tricipital').pct).toBe(50);
    expect(r.antropometria.pliegues.campos.find((c) => c.campo === 'abdominal').pct).toBe(0);
  });

  it('no se cae con una instalación vacía', () => {
    const vacio = censo({ hoy: '2026-08-16' });
    expect(vacio.clientes.total).toBe(0);
    expect(vacio.revision.horasMediana).toBe(null);
  });
});

describe('negocio', () => {
  it('cruza el estado de pago con si la cuenta se usa', () => {
    /*
      Lo único que aporta esta tabla: los estados ya se ven en Stripe. Que una
      cuenta que paga lleve un mes sin abrir el producto es lo que Stripe no
      puede decir, y es una baja que todavía no ha ocurrido.
    */
    const equipos = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
    const suscripciones = [
      { team_id: 't1', status: 'active', plan: 'pro' },
      { team_id: 't2', status: 'active', plan: 'pro' },
      { team_id: 't3', status: 'trialing', plan: 'prueba' },
    ];
    const eventos = [{ at: '2026-08-14T10:00:00Z', team_id: 't1' }];

    const filas = negocio({ equipos, suscripciones, eventos, hoy: '2026-08-16' });
    const activos = filas.find((f) => f.estado === 'active');

    expect(activos).toMatchObject({ cuentas: 2, activas: 1, pctActivas: 50, plan: 'pro' });
  });

  it('un equipo sin fila de suscripción no se pierde', () => {
    const filas = negocio({ equipos: [{ id: 't9' }], hoy: '2026-08-16' });
    expect(filas[0]).toMatchObject({ estado: 'sin suscripción', cuentas: 1 });
  });
});

describe('diasEntre', () => {
  it('cuenta días completos', () => {
    expect(diasEntre('2026-08-01T10:00:00Z', '2026-08-09T09:00:00Z')).toBe(7);
  });

  it('no inventa nada con una fecha inválida', () => {
    expect(diasEntre('ayer', '2026-08-09')).toBe(null);
  });
});
