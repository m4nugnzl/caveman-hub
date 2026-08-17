import { describe, expect, it } from 'vitest';

import { cuentasDe, enRiesgo, faltan, hace } from './cuentas.mjs';
import { cobros, invitaciones, porPlan, pruebas } from './dinero.mjs';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que la lista de cuentas diga la verdad sobre personas concretas.
 *
 * Todo lo demás del informe son agregados: si un porcentaje sale mal, se lee
 * raro y alguien lo comprueba. Aquí no: si una cuenta sale como «sin entrar hace
 * 9 días» cuando entró ayer, se le va a escribir un correo a esa persona
 * diciéndole algo que no es cierto. Y si sale al revés —una prueba que acaba
 * mañana y no aparece— se pierde un cliente sin enterarse.
 */

const HOY = '2026-08-16T12:00:00Z';

const base = () => ({
  hoy: HOY,
  equipos: [{ id: 't1', name: 'Equipo A', owner_id: 'p1', created_at: '2026-08-01T10:00:00Z' }],
  miembros: [{ team_id: 't1', profile_id: 'p1', role: 'owner' }],
  perfiles: [{ id: 'p1', full_name: 'Ada L.', email: 'ada@ejemplo.com', role: 'coach' }],
  sesiones: [{ id: 'p1', last_sign_in_at: '2026-08-16T09:00:00Z' }],
  suscripciones: [{ team_id: 't1', plan: 'solo', status: 'active', stripe_customer_id: 'cus_1' }],
  /* Como en `plan_limits`: `null` en `max_clients` es «sin límite», no cero. */
  planes: [
    { plan: 'prueba', label: 'Gratis', max_clients: 3 },
    { plan: 'solo', label: 'Solo', max_clients: 30 },
    { plan: 'fundador', label: 'Fundador', max_clients: null },
  ],
  clientes: [
    { id: 'c1', team_id: 't1', status: 'active', client_profile_id: 'x' },
    { id: 'c2', team_id: 't1', status: 'archived', client_profile_id: null },
  ],
  programas: [{ client_id: 'c1', microcycles: [{}] }],
  eventos: [{ team_id: 't1', at: '2026-08-15T10:00:00Z' }],
  tickets: [{ team_id: 't1', status: 'closed' }],
  integraciones: [{ team_id: 't1', provider: 'notion' }],
});

describe('hace', () => {
  it('cuenta lo que la gente pregunta: cuánto lleva sin aparecer', () => {
    expect(hace('2026-08-16T09:00:00Z', HOY).texto).toBe('hoy');
    expect(hace('2026-08-15T09:00:00Z', HOY).texto).toBe('ayer');
    expect(hace('2026-08-09T09:00:00Z', HOY).texto).toBe('hace 7 días');
  });

  it('nunca haber entrado no es lo mismo que un cero', () => {
    /* Un cero se lee como «entró hoy», que es justo lo contrario. */
    expect(hace(null, HOY)).toEqual({ texto: 'nunca', dias: null });
  });
});

describe('cuentasDe', () => {
  it('lleva el nombre y el correo de quien hay que escribirle', () => {
    /*
      La razón de ser del archivo. Las versiones anteriores del informe daban
      «el 25 % de las cuentas está inactivo», que no permite hacer nada: no se le
      puede escribir a un porcentaje.
    */
    const [c] = cuentasDe(base());
    expect(c.nombre).toBe('Ada L.');
    expect(c.correo).toBe('ada@ejemplo.com');
  });

  it('la última entrada sale de auth, no de los eventos', () => {
    /*
      Y es la diferencia entre saber si una cuenta está viva o no. Los eventos
      solo existen desde que se instrumentó y solo se apuntan desde el panel;
      `last_sign_in_at` existe desde el primer día para todo el mundo.
    */
    const datos = base();
    datos.eventos = [];
    expect(cuentasDe(datos)[0].entrada.texto).toBe('hoy');
  });

  it('en un equipo, la cuenta está viva si entra CUALQUIERA', () => {
    const datos = base();
    datos.miembros.push({ team_id: 't1', profile_id: 'p2', role: 'trainer' });
    datos.sesiones = [
      { id: 'p1', last_sign_in_at: '2026-07-01T09:00:00Z' },
      { id: 'p2', last_sign_in_at: '2026-08-16T09:00:00Z' },
    ];
    expect(cuentasDe(datos)[0].entrada.texto).toBe('hoy');
  });

  it('recupera los eventos que llegaron sin equipo', () => {
    /*
      Un 10 % de los eventos reales tiene `team_id` nulo: `lib/analytics.js`
      apunta con lo que sabe, y al abrir la aplicación la sesión resuelve antes
      que el equipo. Descartarlos sería perder una de cada diez acciones justo de
      los primeros minutos de cada sesión — que es donde se ve si alguien entra
      y se va.

      El dato no falta: `actor` siempre está, y `team_members` dice de qué equipo
      es esa persona.
    */
    const datos = base();
    datos.eventos = [
      { team_id: 't1', actor: 'p1', at: '2026-08-15T10:00:00Z' },
      { team_id: null, actor: 'p1', at: '2026-08-16T10:00:00Z' },
    ];

    const [c] = cuentasDe(datos);
    expect(c.accionesSemana).toBe(2);
    expect(c.diasActivos).toBe(2);
  });

  it('un evento de alguien que no está en ningún equipo no se le cuelga a nadie', () => {
    const datos = base();
    datos.eventos = [{ team_id: null, actor: 'desconocido', at: '2026-08-16T10:00:00Z' }];
    expect(cuentasDe(datos)[0].accionesSemana).toBe(0);
  });

  it('el pulso deja los días vacíos en cero, no los salta', () => {
    /* El hueco es el dato: 45 acciones en un día y 45 repartidas en ocho son la
       misma cifra y cuentas opuestas. */
    const datos = base();
    datos.eventos = [{ team_id: 't1', actor: 'p1', at: '2026-08-16T10:00:00Z' }];

    const [c] = cuentasDe(datos);
    expect(c.pulso).toHaveLength(14);
    expect(c.pulso.at(-1)).toEqual({ dia: '2026-08-16', valor: 1 });
    expect(c.pulso.filter((p) => p.valor === 0)).toHaveLength(13);
    expect(c.diasActivos).toBe(1);
  });

  it('los clientes archivados no cuentan como cartera', () => {
    const [c] = cuentasDe(base());
    expect(c.clientes).toBe(1);
    expect(c.archivados).toBe(1);
  });

  it('ordena por urgencia: primero lo que caduca', () => {
    /* Alfabético obligaría a leer la lista entera cada vez. */
    const datos = base();
    datos.equipos.push({ id: 't2', name: 'B', owner_id: 'p2', created_at: '2026-08-01T10:00:00Z' });
    datos.miembros.push({ team_id: 't2', profile_id: 'p2' });
    datos.perfiles.push({ id: 'p2', full_name: 'Zoe', email: 'z@e.com' });
    datos.suscripciones.push({
      team_id: 't2', plan: 'prueba', status: 'trialing', trial_ends_at: '2026-08-18T10:00:00Z',
    });

    expect(cuentasDe(datos).map((c) => c.nombre)).toEqual(['Zoe', 'Ada L.']);
  });
});

describe('activa y sin pasar nunca por Stripe', () => {
  it('detecta la barra libre por los DATOS, no por el nombre del plan', () => {
    /*
      El caso real. Al activar la facturación, el injerto de la migración 0019
      metió en el plan `fundador` —activo, ilimitado y sin caducidad— a todos los
      equipos que existían ese día. Una cuenta dada de alta veinte horas antes
      del corte tiene barra libre para siempre; la del día siguiente, catorce
      días de prueba.

      Se detecta como «activa sin cliente de Stripe y sin periodo de cobro» y no
      buscando la palabra «fundador», porque esa etiqueta además confunde —suena
      a «el fundador del producto»— y mañana puede llamarse de otra manera.
    */
    const datos = base();
    datos.suscripciones = [{ team_id: 't1', plan: 'fundador', status: 'active' }];

    const [c] = cuentasDe(datos);
    expect(c.gratisIndefinido).toBe(true);
    expect(c.facturable).toBe(false);
  });

  it('una cuenta con cliente de Stripe sí factura', () => {
    const datos = base();
    datos.suscripciones = [
      { team_id: 't1', plan: 'solo', status: 'active', stripe_customer_id: 'cus_1' },
    ];
    expect(cuentasDe(datos)[0].gratisIndefinido).toBe(false);
  });

  it('el plan GRATUITO del producto no es barra libre: tiene tope', () => {
    /*
      La distinción que hace falta desde que el plan de partida es gratis y sin
      plazo (migración 0056). Sin ella, «activa y sin pasar por Stripe»
      describiría a TODAS las cuentas del modelo —que es el modelo, no un
      problema— y el aviso se dispararía con cada alta hasta que nadie lo mirase.

      Lo que distingue el accidente es que NO tiene tope de clientes.
    */
    const datos = base();
    datos.suscripciones = [{ team_id: 't1', plan: 'prueba', status: 'active' }];

    const [c] = cuentasDe(datos);
    expect(c.gratisIndefinido).toBe(false);
    expect(c.topeClientes).toBe(3);
  });

  it('enseña la ETIQUETA del plan, no su clave interna', () => {
    /* La clave del gratuito sigue llamándose `prueba` por compatibilidad con el
       webhook de Stripe (0056); enseñarla diría lo contrario de lo que hace. */
    const datos = base();
    datos.suscripciones = [{ team_id: 't1', plan: 'prueba', status: 'active' }];
    expect(cuentasDe(datos)[0].planEtiqueta).toBe('Gratis');
  });

  it('sabe cuál de las cuentas eres tú', () => {
    /* Sin esto, la cuenta del dueño del producto aparecería en cada lista de
       «cuentas que no van a pagar nunca». */
    const datos = base();
    datos.suscripciones = [{ team_id: 't1', plan: 'fundador', status: 'active' }];
    datos.admins = [{ profile_id: 'p1' }];

    expect(cuentasDe(datos)[0].esTuya).toBe(true);
  });
});

describe('enRiesgo', () => {
  const conCuenta = (patch) => enRiesgo(cuentasDe({ ...base(), ...patch }));

  it('una cuenta al día no está en riesgo', () => {
    expect(conCuenta({})).toEqual([]);
  });

  it('una semana sin entrar es riesgo: es un ciclo de trabajo entero perdido', () => {
    /* El check-in del producto es semanal, así que saltarse una semana no es un
       día flojo: es haberse saltado el ciclo completo. */
    const r = conCuenta({ sesiones: [{ id: 'p1', last_sign_in_at: '2026-08-08T09:00:00Z' }] });
    expect(r[0].motivos[0]).toMatch(/sin entrar/);
  });

  it('avisa de la prueba ANTES de que acabe, no después', () => {
    const r = conCuenta({
      suscripciones: [{ team_id: 't1', plan: 'prueba', status: 'trialing', trial_ends_at: '2026-08-20T10:00:00Z' }],
    });
    expect(r[0].motivos).toContain('la prueba acaba en 4 días');
  });

  it('y también de la que ya caducó sin pasar a pago', () => {
    /* Es el caso peor y el más fácil de no ver: la fecha ya pasó, así que no
       aparece en ninguna lista de «próximos vencimientos». */
    const r = conCuenta({
      suscripciones: [{ team_id: 't1', plan: 'prueba', status: 'trialing', trial_ends_at: '2026-08-10T10:00:00Z' }],
    });
    expect(r[0].motivos[0]).toMatch(/caducó hace 6 días/);
  });

  it('una cuenta con días de vida y sin un solo cliente no ha llegado a empezar', () => {
    const r = conCuenta({ clientes: [] });
    expect(r[0].motivos).toContain('nunca ha dado de alta un cliente');
  });

  it('recién dada de alta y sin clientes todavía NO es riesgo', () => {
    /* Dar de alta a alguien lleva un rato. Avisar el mismo día convierte el
       aviso en ruido desde la primera cuenta. */
    const datos = base();
    datos.clientes = [];
    datos.equipos[0].created_at = '2026-08-15T10:00:00Z';
    expect(enRiesgo(cuentasDe(datos))).toEqual([]);
  });

  it('dice POR QUÉ, y puede ser por más de una cosa a la vez', () => {
    const r = conCuenta({
      sesiones: [{ id: 'p1', last_sign_in_at: '2026-08-01T09:00:00Z' }],
      suscripciones: [{ team_id: 't1', plan: 'prueba', status: 'trialing', trial_ends_at: '2026-08-20T10:00:00Z' }],
    });
    expect(r[0].motivos).toHaveLength(2);
  });
});

describe('cobros', () => {
  const PAGOS = [
    { amount: 100, currency: 'EUR', is_paid: true, period_end: '2026-09-01', payment_failed: false },
    { amount: 150, currency: 'EUR', is_paid: false, period_end: '2026-08-20', payment_failed: false },
    { amount: 80, currency: 'EUR', is_paid: false, period_end: '2026-08-10', payment_failed: true },
  ];

  it('separa lo cobrado de lo pendiente, y no los suma', () => {
    const r = cobros(PAGOS, { hoy: HOY });
    expect(r.importePagado).toBe(100);
    expect(r.importePendiente).toBe(230);
  });

  it('con dos monedas NO suma: lo dice', () => {
    /*
      Sumar euros con libras da un número con aspecto de dato y significado
      ninguno. Es el error clásico de un panel de cobros.
    */
    const r = cobros([...PAGOS, { amount: 50, currency: 'GBP', is_paid: false }], { hoy: HOY });
    expect(r.moneda).toBe(null);
    expect(r.monedas).toEqual(['EUR', 'GBP']);
  });

  it('lo que vence pronto incluye lo que ya venció y sigue sin pagar', () => {
    /* Un cobro vencido hace tres días es más urgente que uno que vence dentro de
       diez, y una lista de «próximos» que empiece hoy lo deja fuera. */
    const r = cobros(PAGOS, { hoy: HOY });
    expect(r.proximos.map((p) => p.faltan)).toEqual([-6, 4]);
  });

  it('sin pagos no divide por cero', () => {
    expect(cobros([], { hoy: HOY }).importeMedio).toBe(0);
  });
});

describe('pruebas y planes', () => {
  it('las pruebas salen ordenadas por lo que queda', () => {
    const cuentas = [
      { estado: 'trialing', pruebaAcaba: '2026-08-30', diasDePrueba: 14, nombre: 'B' },
      { estado: 'trialing', pruebaAcaba: '2026-08-18', diasDePrueba: 2, nombre: 'A' },
      { estado: 'active', pruebaAcaba: null, diasDePrueba: null, nombre: 'C' },
    ];
    expect(pruebas(cuentas).map((c) => c.nombre)).toEqual(['A', 'B']);
  });

  it('los planes se agrupan por plan Y estado a la vez', () => {
    /* «Dos en fundador» no dice si pagan; «dos activas» no dice de qué plan. */
    const r = porPlan([
      { plan: 'solo', estado: 'active', nombre: 'A' },
      { plan: 'solo', estado: 'trialing', nombre: 'B' },
      { plan: 'solo', estado: 'active', nombre: 'C' },
    ]);
    expect(r[0]).toMatchObject({ plan: 'solo', estado: 'active', cuentas: 2 });
    expect(r).toHaveLength(2);
  });
});

describe('invitaciones', () => {
  it('separa las caducadas sin canjear, que son las que hay que reenviar', () => {
    const r = invitaciones(
      [
        { claimed_at: '2026-08-10', expires_at: '2026-08-20' },
        { claimed_at: null, revoked_at: null, expires_at: '2026-08-10' },
        { claimed_at: null, revoked_at: null, expires_at: '2026-08-30' },
      ],
      { hoy: HOY }
    );
    expect(r).toMatchObject({ creadas: 3, canjeadas: 1, caducadas: 1, pendientes: 1 });
  });
});

describe('faltan', () => {
  it('es negativo cuando la fecha ya pasó', () => {
    expect(faltan('2026-08-10', HOY)).toBe(-6);
    expect(faltan(null, HOY)).toBe(null);
  });
});
