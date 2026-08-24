import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Que la pantalla monta y que lee los campos que el dominio DE VERDAD produce.
 *
 * ══ Por qué esta prueba existe ══════════════════════════════════════════════
 *
 * Porque el modo de fallar de esta pantalla es callado y ya ocurrió al
 * escribirla: se pintaba `c.email`, `c.planLabel` y `c.acciones7d` cuando la
 * hoja de cuentas produce `correo`, `planEtiqueta` y `accionesSemana`. Nada de
 * eso rompe el build ni el lint ni los tipos — sale una columna vacía, que en
 * un informe se lee como «no hay nada» en vez de como «esto está mal».
 *
 * Es el mismo riesgo que `AppContext.test.jsx` describe para el reparto de
 * claves, y se comprueba igual: `renderToString`, sin jsdom ni librería de
 * componentes. Lo que se quiere saber es que MONTA y que los datos llegan a la
 * salida, no cómo se comporta un clic.
 *
 * ── Los datos de abajo NO son inventados ────────────────────────────────────
 * Salen de ejecutar el informe contra el proyecto real (23/08/2026), recortados.
 * Una prueba con campos inventados comprobaría que la pantalla pinta lo que la
 * prueba escribió, que es justo lo que no hace falta saber.
 */

const pedir = vi.fn();
const aceptar = vi.fn();

vi.mock('@/context/useRadiografia', () => ({
  VENTANAS: [
    { id: 7, label: '7 días' },
    { id: 30, label: '30 días' },
  ],
  useEsAdminPlataforma: () => true,
  useRadiografia: () => globalThis.__estado,
}));

const { PlatformPanel, Dinero, Salud, Uso, Seguridad, pestañas } =
  await import('./PlatformPanel');

const INFORME = {
  proyecto: 'pscpermmojmircadirzk.supabase.co',
  generado: '2026-08-23T17:34:16.240Z',
  comparadoCon: '2026-08-21T07:05:06.132Z',
  ventanaDias: 30,

  diagnosticos: [
    {
      titulo: '7 cuenta(s) entraron y no hicieron nada',
      gravedad: 'atender',
      cifra: '7',
      porque: 'Marta, desde hace 4 días · Luis, desde hace 6 días',
      hacer: 'Es el abandono más temprano y el más recuperable.',
      ancla: 'cuentas',
    },
    {
      titulo: '6 campos de medidas que no ha rellenado nadie nunca',
      gravedad: 'vigilar',
      cifra: '6',
      hacer: 'Quitarlos de la pantalla.',
    },
    { titulo: 'Ningún bucket público', gravedad: 'bien' },
  ],
  resumen: { atender: 1, vigilar: 1, bien: 1, sinDatos: 0 },

  metricas: {
    'seguridad · críticos': 2,
    'actividad · cuentas esta semana': 17,
    'clientes · total': 22,
    'clientes · con portal (%)': 72.7,
    'revisión · entregados sin contestar +7d': 0,
    'fallos · distintos': 0,
  },
  series: {
    'clientes · total': [
      { etiqueta: '2026-08-21', valor: 19 },
      { etiqueta: '2026-08-23', valor: 22 },
    ],
    'seguridad · críticos': [],
  },
  cambios: [{ clave: 'clientes · total', antes: 19, ahora: 22, mejor: true }],

  cuentas: [
    {
      id: 'equipo-1',
      nombre: 'Ana Ruiz',
      correo: 'ana@ejemplo.com',
      planEtiqueta: 'Gratis',
      diasDePrueba: 3,
      clientes: 4,
      topeClientes: 5,
      conPortal: 2,
      entrada: { texto: 'hace 9 días', dias: 9 },
      accionesSemana: 0,
    },
    {
      id: 'equipo-2',
      nombre: 'Sin nombre',
      correo: '',
      planEtiqueta: 'Fundador',
      diasDePrueba: null,
      clientes: 0,
      topeClientes: null,
      conPortal: 0,
      entrada: { texto: 'nunca', dias: null },
      accionesSemana: 0,
    },
  ],
  riesgo: [
    { id: 'equipo-1', motivos: ['sin entrar hace 9 días', 'la prueba acaba en 3 días'] },
  ],

  seguridad: [
    {
      clave: 'rls|videos|política FOR ALL con rol public',
      area: 'rls',
      objeto: 'videos',
      detalle: 'política FOR ALL con rol public',
      nivel: 'critico',
      nuevo: false,
      aceptado: null,
    },
    {
      clave: 'rls|platform_snapshots|RLS activo y ninguna política',
      area: 'rls',
      objeto: 'platform_snapshots',
      detalle: 'RLS activo y ninguna política',
      nivel: 'aviso',
      nuevo: true,
      aceptado: null,
    },
    {
      clave: 'rls|platform_admins|RLS activo y ninguna política',
      area: 'rls',
      objeto: 'platform_admins',
      detalle: 'RLS activo y ninguna política',
      nivel: 'aviso',
      nuevo: false,
      aceptado: { desde: '2026-08-16', motivo: 'solo la lee service_role' },
    },
    { clave: 'x', area: 'rls', objeto: 'contexto', detalle: '31 de 31 tablas con RLS', nivel: 'info' },
  ],
  avisoSeguridad: null,
  avisos: ['La tabla «videos» no existe en este proyecto.'],

  /* ── Dinero: las DOS capas, que no son la misma ─────────────────────── */
  planes: [
    { plan: 'prueba', planEtiqueta: 'Gratis', estado: 'trialing', cuentas: 3, nombres: ['Ana Ruiz'] },
  ],
  pruebas: [{ id: 'equipo-1', nombre: 'Ana Ruiz', correo: 'ana@ejemplo.com', diasDePrueba: 3 }],
  cobros: {
    total: 17,
    pagados: 12,
    pendientes: 5,
    fallidos: 0,
    importePagado: 1480,
    importePendiente: 720,
    moneda: 'EUR',
    monedas: ['EUR'],
    importeMedio: 129,
    proximos: [
      {
        id: 'pago-1',
        period_end: '2026-08-18',
        faltan: -5,
        amount: 150,
        currency: 'EUR',
        cuenta: 'Ana Ruiz',
        etiqueta: 'Marta — mensual',
      },
      { id: 'pago-2', period_end: '2026-08-30', faltan: 7, amount: 120, currency: 'EUR', cuenta: null },
    ],
  },
  movimiento: {
    altas: [
      { semana: '2026-08-09', altas: 4 },
      { semana: '2026-08-16', altas: 7 },
    ],
    archivados: 3,
    total: 22,
  },
  invitaciones: { creadas: 17, canjeadas: 9, revocadas: 1, caducadas: 2, pendientes: 5 },

  /* El cruce de suscripción contra uso: lo único que Stripe no puede contestar. */
  negocio: [
    { estado: 'trialing', plan: 'prueba', cuentas: 12, activas: 4, pctActivas: 33.3 },
    { estado: 'sin suscripción', plan: '—', cuentas: 8, activas: 1, pctActivas: 12.5 },
  ],
  actividad: [
    { semana: '2026-08-09', cuentas: 11 },
    { semana: '2026-08-16', cuentas: 17 },
  ],
  embudo: [
    { hito: 'Se registró', cuentas: 20, pct: 100, caida: 0 },
    { hito: 'Dio de alta un cliente', cuentas: 12, pct: 60, caida: 8 },
    { hito: 'Le programó algo', cuentas: 9, pct: 45, caida: 3 },
    { hito: 'Le dio acceso al portal', cuentas: 9, pct: 45, caida: 0 },
    { hito: 'Revisó un check-in', cuentas: 4, pct: 20, caida: 5 },
  ],
  retencion: [
    { semana: '2026-08-02', activas: 9, vuelven: 6, pct: 66.7 },
    { semana: '2026-08-09', activas: 11, vuelven: 7, pct: 63.6 },
    { semana: '2026-08-16', activas: 17, vuelven: 11, pct: 64.7 },
  ],

  tickets: [
    {
      id: 't1',
      subject: 'No puedo dar de alta a un cliente',
      status: 'open',
      created_at: '2026-08-20T09:00:00.000Z',
      quien: 'Ana Ruiz',
    },
  ],

  /* ── Salud ──────────────────────────────────────────────────────────── */
  fallos: [
    {
      source: 'supabase',
      ruta: '/c/:id/rutina',
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      veces: 12,
      cuentas: 6,
      roles: 'coach',
      ultimo: '2026-08-22T10:00:00.000Z',
    },
  ],
  fallosDia: [{ dia: '2026-08-22', veces: 12 }],
  volumen: [
    { tabla: 'workout_data', filas: 19, bytes: 566000 },
    { tabla: 'clients', filas: 22, bytes: 45000 },
  ],

  /* ── Uso ────────────────────────────────────────────────────────────── */
  eventos: [{ nombre: 'pantalla_vista', veces: 2240, cuentas: 17 }],
  pantallas: {
    usadas: [{ nombre: 'hoy', veces: 800, cuentas: 17 }],
    sinUso: ['ajustes_copia', 'cliente_calendario'],
  },
  censo: {
    clientes: {
      total: 22,
      activos: 19,
      archivados: 3,
      conSexo: 86.4,
      conFechaInicio: 90,
      portal: { cuantos: 16, pct: 72.7 },
    },
    antropometria: {
      clientesConAlguno: 50,
      registros: 38,
      registrosPorCliente: 1.7,
      pliegues: { total: 38, conAlguno: 0, campos: [{ campo: 'tricipital', veces: 0, pct: 0 }] },
      perimetros: { total: 38, conAlguno: 12, campos: [{ campo: 'ombligo', veces: 12, pct: 31.6 }] },
    },
    nutricion: {
      clientesConPlan: 81.8,
      conObjetivo: 90,
      conVariantes: 10,
      conPasos: 20,
      conHabitos: 5,
    },
    programas: {
      clientesConPrograma: 86.4,
      microciclosMediana: 4,
      sesiones: 210,
      conCalentamiento: 30,
      conNotas: 15,
    },
    revision: {
      total: 10,
      entregados: 10,
      revisados: 8,
      pctRevisados: 80,
      horasMediana: 19,
      sinContestar: 0,
    },
    fotos: { total: 39, clientesConAlguna: 45 },
  },
};

const pintar = (estado) => {
  globalThis.__estado = { esAdmin: true, cargando: false, error: null, pedir, aceptar, ...estado };
  return renderToString(<PlatformPanel />);
};

/*
  El detalle vive en pestañas y solo se pinta la abierta, así que para mirar una
  sección concreta hay que abrirla. `renderToString` no da clics: se comprueba
  la vista por defecto con `pintar` y las demás llamando al componente de la
  sección, que es lo que de verdad se quiere comprobar —que lee bien sus datos—.
*/
const pintarSeccion = (Componente, props) => renderToString(<Componente {...props} />);

describe('PlatformPanel', () => {
  it('sin informe todavía, invita a generarlo en vez de fingir que no hay datos', () => {
    const html = pintar({ informe: null });
    expect(html).toContain('Sin generar');
    expect(html).toContain('Generar informe');
  });

  it('monta el informe entero sin reventar', () => {
    expect(() => pintar({ informe: INFORME })).not.toThrow();
  });

  describe('el veredicto', () => {
    it('pinta lo accionable con su cifra y QUÉ HACER', () => {
      const html = pintar({ informe: INFORME });
      expect(html).toContain('7 cuenta(s) entraron y no hicieron nada');
      expect(html).toContain('Es el abandono más temprano');
    });

    it('no pinta los «bien» de uno en uno, pero los cuenta', () => {
      /* Son la mayoría: enumerarlos llenaría la pantalla de buenas noticias
         por encima de las malas. */
      const html = pintar({ informe: INFORME });
      expect(html).not.toContain('Ningún bucket público');
      expect(html).toContain('1 en verde');
    });
  });

  describe('la hoja de cuentas', () => {
    /* ══ Lo que esta prueba existe para fijar ═══════════════════════════════
       Los nombres de campo de `cuentasDe`. Pintar `c.email` en vez de
       `c.correo` no rompe nada: deja la columna vacía. */
    it('lee los campos que produce el dominio, no los que uno supone', () => {
      const html = pintar({ informe: INFORME });
      expect(html).toContain('Ana Ruiz');
      expect(html).toContain('ana@ejemplo.com');
      expect(html).toContain('Gratis');
      expect(html).toContain('hace 9 días');
    });

    it('enseña POR QUÉ una cuenta está en riesgo, no solo que lo está', () => {
      const html = pintar({ informe: INFORME });
      expect(html).toContain('la prueba acaba en 3 días');
    });

    it('un tope nulo es «sin límite», no un cero', () => {
      /* `renderToString` mete `<!-- -->` entre nodos de texto contiguos, así que
         «/ 5» sale como «/ <!-- -->5». Se quitan los comentarios antes de mirar:
         lo que se comprueba es lo que LEE una persona. */
      const html = pintar({ informe: INFORME }).replace(/<!--.*?-->/g, '');
      expect(html).toContain('/ 5');
      expect(html).not.toContain('/ null');
      expect(html).not.toContain('/ undefined');
    });
  });

  /* ══ Que ninguna métrica con tendencia se quede sin pintar ═══════════════
     `CON_TENDENCIA` es la lista del dominio y `FILAS` la del reparto visual.
     Añadir una métrica allí y olvidarse de colocarla aquí no rompe nada: la
     cifra se calcula, viaja por la red y no la ve nadie. */
  it('las filas cubren exactamente las métricas con tendencia del dominio', async () => {
    const { CON_TENDENCIA } = await import('@/domain/radiografia/recogida');
    const { FILAS } = await import('./PlatformPanel');

    const pintadas = FILAS.flatMap((f) => f.claves);
    expect([...pintadas].sort()).toEqual([...CON_TENDENCIA].sort());

    /* Y cada fila tiene 2 o 4 tarjetas, nunca 3 (`producto.md` §5.4). */
    for (const fila of FILAS) expect([2, 4]).toContain(fila.claves.length);
  });

  describe('seguridad', () => {
    it('empieza por lo pendiente y no enseña las líneas de contexto', () => {
      const html = pintarSeccion(Seguridad, { hallazgos: INFORME.seguridad });
      expect(html).toContain('videos');
      expect(html).toContain('platform_snapshots');
      /* Lo aceptado queda fuera hasta que se pide verlo. */
      expect(html).not.toContain('solo la lee service_role');
      /* Las de nivel `info` no son hallazgos: son contexto. */
      expect(html).not.toContain('31 de 31 tablas con RLS');
    });

    it('deja marcar lo pendiente y NO lo ya aceptado', () => {
      /* Retirar una aceptación no es desmarcar una casilla: es añadir una fila
         que la retira (0074). Una casilla desmarcable sugeriría lo contrario. */
      const html = pintarSeccion(Seguridad, { hallazgos: INFORME.seguridad }).replace(/<!--.*?-->/g, '');
      const casillas = (html.match(/type="checkbox"/g) || []).length;
      /* Dos pendientes visibles —`videos` y `platform_snapshots`—; la aceptada
         no se pinta con el filtro por defecto. */
      expect(casillas).toBe(2);
    });

    it('sin nada elegido no pide motivo ni ofrece guardar', () => {
      /* El formulario aparece al elegir. Un campo de motivo permanente sobre
         una lista sin marcar es cromo que no hace nada. */
      const html = pintarSeccion(Seguridad, { hallazgos: INFORME.seguridad });
      expect(html).not.toContain('Por qué se dan por buenos');
    });
  });

  describe('el dinero', () => {
    it('mantiene las dos capas separadas y rotuladas', () => {
      /* Las dos se llaman «pagos» y no son la misma: lo que te pagan a ti y lo
         que le pagan a ellos. Nunca se suman (cabecera de `dinero.js`). */
      const html = pintarSeccion(Dinero, INFORME);
      expect(html).toContain('Lo que te pagan a ti');
      expect(html).toContain('Lo que le pagan a ellos');
      /* Y ninguna cifra es la suma de las dos: 1.480 + 720 = 2.200. */
      expect(html).not.toContain('2.200');
    });

    it('un cobro vencido se lee como retraso, no como «en -5 días»', () => {
      const html = pintarSeccion(Dinero, INFORME);
      expect(html).toContain('5 d de retraso');
      expect(html).not.toContain('en -5');
    });

    it('las pruebas que acaban salen con sus días', () => {
      const html = pintarSeccion(Dinero, INFORME);
      expect(html).toContain('Pruebas que acaban');
      expect(html).toContain('3 d');
    });
  });

  it('los tickets salen con su asunto literal y con quién lo escribió', () => {
    /* Es la información más cara que se recibe: alguien se paró a escribirla.
       Y un ticket sin nombre no se puede contestar. */
    const html = pintar({ informe: INFORME });
    expect(html).toContain('No puedo dar de alta a un cliente');
    expect(html).toContain('Ana Ruiz');
  });

  describe('qué se rompe', () => {
    it('destaca las CUENTAS afectadas, no las veces', () => {
      /* Un fallo que le ocurre 200 veces a una persona es un caso raro suyo;
         uno que le ocurre una vez a seis personas es un error del producto. */
      const html = pintarSeccion(Salud, INFORME).replace(/<!--.*?-->/g, '');
      expect(html).toContain('6 cuenta(s)');
      expect(html).toContain('duplicate key value violates unique constraint');
    });

    it('enseña los bytes POR FILA, que es la señal de auditoria.md §1.4', () => {
      /* 566000 / 19 ≈ 29 KB por fila de `workout_data`. Cuando se acerque al
         megabyte, cada ráfaga de teclas con debounce mueve un megabyte. */
      const html = pintarSeccion(Salud, INFORME);
      expect(html).toContain('29 KB');
    });
  });

  describe('qué se usa', () => {
    it('abre por las pantallas que NO abre nadie', () => {
      /* Una lista de lo más usado no dice nada de lo que sobra, y quitar una
         pantalla vale más que añadir dos. */
      const html = pintarSeccion(Uso, INFORME);
      const sinUso = html.indexOf('Pantallas que no ha abierto nadie');
      const masUsado = html.indexOf('Lo más usado');
      expect(sinUso).toBeGreaterThan(-1);
      expect(sinUso).toBeLessThan(masUsado);
      expect(html).toContain('ajustes_copia');
    });

    it('cuenta los campos de medida sobre REGISTROS, no sobre clientes', () => {
      const html = pintarSeccion(Uso, INFORME).replace(/<!--.*?-->/g, '');
      expect(html).toContain('sobre 38 registros');
      /* El pliegue que nadie ha medido nunca sale con su cero, que es lo que
         decide si el campo se queda en el formulario. */
      expect(html).toContain('tricipital');
    });
  });

  it('lo que no se ha podido leer se dice, para que un cero no parezca un dato', () => {
    const html = pintar({ informe: INFORME });
    expect(html).toContain('La tabla «videos» no existe en este proyecto.');
  });

  it('a quien no administra la plataforma no le enseña nada del informe', () => {
    globalThis.__estado = {
      esAdmin: false,
      informe: null,
      cargando: false,
      error: null,
      pedir,
    };
    const html = renderToString(<PlatformPanel />);
    expect(html).toContain('Esto no es para tu cuenta');
    expect(html).not.toContain('Generar informe');
  });
});

/* ══ Lo que se arregló mirando la pantalla de verdad ═════════════════════════
   Las tres cosas de abajo salieron de abrir el panel contra el proyecto real y
   ver que no servían. Quedan fijadas para que no vuelvan. */

describe('las pestañas del detalle', () => {
  it('llevan lo que hay que ATENDER dentro, no cuántas filas tienen', () => {
    /* «Dinero 5» son cinco cobros vencidos, no diecisiete cobros. Un contador
       de filas es decoración; uno de pendientes es una razón para entrar. */
    const p = pestañas(INFORME);
    const por = (id) => p.find((x) => x.id === id).label;

    /* Un solo cobro con `faltan < 0` en el fixture. */
    expect(por('dinero')).toBe('Dinero 1');
    /* Un crítico sin aceptar + un nuevo. */
    expect(por('seguridad')).toBe('Seguridad 2');
    /* Dos pantallas sin abrir. */
    expect(por('producto')).toBe('Producto 2');
  });

  it('un cero no pinta cifra', () => {
    /* Un «0» al lado de cada pestaña es ruido que enseña a no mirar las que sí
       llevan número. */
    const limpio = {
      ...INFORME,
      cobros: { ...INFORME.cobros, proximos: [] },
      seguridad: [],
      pantallas: { usadas: [], sinUso: [] },
      fallos: [],
      riesgo: [],
      tickets: [],
    };
    for (const p of pestañas(limpio)) expect(p.label).not.toMatch(/\d/);
  });
});

describe('el porqué de un diagnóstico', () => {
  it('la LISTA se pliega en vez de empujar los demás fuera de la pantalla', () => {
    /* Con siete cuentas, «entró hoy, 0 clientes y 0 acciones en 7 días» son
       seis líneas repetidas. No se recorta —quién es hace falta para actuar—
       se pliega, que es distinto. */
    const html = pintar({ informe: INFORME });
    expect(html).toContain('Por qué');
    expect(html).toContain('aria-expanded="false"');
    /* Y el contenido no está en la salida hasta que se abre. */
    expect(html).not.toContain('Marta, desde hace 4 días');
  });

  it('una FRASE no se pliega: el pliegue mide lo mismo que lo que esconde', () => {
    /* `porque` llega de dos formas: una lista unida por « · » o una frase. */
    const unaFrase = {
      ...INFORME,
      diagnosticos: [
        {
          titulo: '720 EUR sin cobrar',
          gravedad: 'atender',
          cifra: '720 EUR',
          porque: 'El más antiguo venció hace 22 días.',
          hacer: 'Avisar a quien cobra.',
        },
      ],
      resumen: { atender: 1, vigilar: 0, bien: 0, sinDatos: 0 },
    };
    const html = pintar({ informe: unaFrase });
    expect(html).toContain('El más antiguo venció hace 22 días.');
    expect(html).not.toContain('aria-expanded');
  });

  it('la cifra sale UNA vez, no tres', () => {
    /* El resumen del pliegue era `d.cifra`, la misma que ya está en su píldora
       dos líneas más arriba: tres veces la misma cifra se lee como tres. */
    const soloUno = {
      ...INFORME,
      diagnosticos: [
        {
          titulo: 'Cuentas que entraron y no hicieron nada',
          gravedad: 'atender',
          cifra: '7',
          porque: 'Marta, desde hace 4 días · Luis, desde hace 6 días',
        },
      ],
      resumen: { atender: 1, vigilar: 0, bien: 0, sinDatos: 0 },
    };
    const html = pintar({ informe: soloUno }).replace(/<!--.*?-->/g, '');
    expect((html.match(/>7</g) || []).length).toBe(1);
  });
});

/* ══ Fase 3: se puede preguntar, y ya no se tira nada ════════════════════════
   `plataforma.md` §4 decía que al HTML le faltaban cuatro cosas. Estas pruebas
   fijan las dos primeras: que hay camino de la cifra a las filas, y que lo que
   el dominio calcula llega a la pantalla en vez de morir en el JSON. */

describe('el camino de la cifra a las filas', () => {
  it('un diagnóstico con ancla lleva a su sección', () => {
    /* `ancla` la produce el dominio desde siempre y el informe HTML la usa como
       enlace; esta pantalla la ignoraba entera. */
    const html = pintar({ informe: INFORME });
    expect(html).toContain('Ver el detalle: 7 cuenta(s) entraron y no hicieron nada');
  });

  it('uno SIN ancla no lleva a ninguna parte, en vez de a un sitio elegido a ojo', () => {
    const sinAncla = {
      ...INFORME,
      diagnosticos: [{ titulo: 'Algo que no es de ninguna sección', gravedad: 'vigilar' }],
      resumen: { atender: 0, vigilar: 1, bien: 0, sinDatos: 0 },
    };
    const html = pintar({ informe: sinAncla });
    expect(html).not.toContain('Ver el detalle');
  });
});

describe('lo que se calculaba y no pintaba nadie', () => {
  it('el dinero cruza quién paga con quién lo usa', () => {
    /* Los estados de suscripción ya se ven en Stripe. Que un tercio de quien
       paga no entre, no. */
    const html = pintarSeccion(Dinero, INFORME).replace(/<!--.*?-->/g, '');
    expect(html).toContain('Quién paga y quién lo usa');
    expect(html).toContain('sin suscripción');
    expect(html).toContain('33,3');
  });

  it('el plan dice QUIÉNES, no solo cuántos', () => {
    const html = pintarSeccion(Dinero, INFORME);
    expect(html).toContain('Quiénes');
  });

  it('el cobro medio sale, que es lo que hace dimensionable el «sin cobrar»', () => {
    const html = pintarSeccion(Dinero, INFORME).replace(/<!--.*?-->/g, '');
    expect(html).toContain('Cobro medio 129 EUR');
  });

  it('los gestos salen, no solo cuántos gestos distintos hay', () => {
    /* `Uso` recibía `eventos` y solo usaba `.length` para el subtítulo. */
    const html = pintarSeccion(Uso, INFORME);
    expect(html).toContain('Qué se hace');
    expect(html).toContain('pantalla_vista');
  });

  it('el censo enseña sus cinco bloques, no dos', () => {
    /* Nutrición entera, fotos entera y media de programas y revisión se
       quedaban en el JSON. */
    const html = pintarSeccion(Uso, INFORME);
    expect(html).toContain('Con plan de dieta');
    expect(html).toContain('Con foto');
    expect(html).toContain('Sesiones programadas');
    expect(html).toContain('Con fecha de inicio');
  });

  it('los fallos dicen CUÁNDO empezaron', () => {
    /* Una lista de fallos dice qué se rompe y no si lleva un mes roto. Con un
       solo día no se dibuja: una «serie» de un punto es una raya. */
    const dosDias = {
      ...INFORME,
      fallosDia: [
        { dia: '2026-08-21', veces: 3 },
        { dia: '2026-08-22', veces: 12 },
      ],
    };
    const html = pintarSeccion(Salud, dosDias);
    expect(html).toContain('Cuándo se rompió');
    expect(pintarSeccion(Salud, INFORME)).not.toContain('Cuándo se rompió');
  });
});

/* ══ El embudo y la retención ════════════════════════════════════════════════
   `informe.mjs` los quitó a propósito: «a esta escala un porcentaje divide y
   borra los nombres». Vuelven corregidos por lo que aquella regla protegía, y
   estas pruebas fijan justo esa corrección — sin ellas es cuestión de tiempo
   que alguien «simplifique» dejando solo el porcentaje. */

describe('el embudo', () => {
  it('la cifra que se lee son CUENTAS, no un porcentaje', () => {
    /* «12 de 20», no «60 %»: con veinte cuentas un porcentaje disfraza de
       tendencia lo que son dos personas. */
    const html = pintarSeccion(Uso, INFORME).replace(/<!--.*?-->/g, '');
    expect(html).toContain('Hasta dónde llega una cuenta');
    expect(html).toContain('Dio de alta un cliente');
    expect(html).toContain('de 20');
    /* El porcentaje solo decide el ANCHO de la barra, y ahí sí sirve. */
    expect(html).toContain('width:60%');
  });

  it('enseña la caída de cada paso, que es lo que dice dónde trabajar', () => {
    /* Un 20 % final puede ser una fuga enorme en el paso 2 o cuatro repartidas,
       y el porcentaje sobre el total no distingue esos dos casos. */
    const html = pintarSeccion(Uso, INFORME).replace(/<!--.*?-->/g, '');
    expect(html).toContain('−8 aquí');
    expect(html).toContain('−5 aquí');
    /* Un paso sin caída lo dice, en vez de dejar el hueco en blanco. */
    expect(html).toContain('sin caída');
  });

  it('no nombra el peor paso: eso sería un veredicto', () => {
    /* Los veredictos los da `diagnosticos.js`. Esta pantalla no calcula ni
       decide: enseña las cinco cifras y se ven las cinco. */
    const html = pintarSeccion(Uso, INFORME);
    expect(html).not.toMatch(/mayor caída|peor paso|donde más se pierde/i);
  });
});

describe('la retención', () => {
  it('lo dice en personas y no en porcentaje', () => {
    const html = pintarSeccion(Uso, INFORME).replace(/<!--.*?-->/g, '');
    expect(html).toContain('De las 17 cuentas activas la semana del 2026-08-16, volvieron');
    expect(html).toContain('11');
  });

  it('con pocas semanas avisa de que todavía no es una tendencia', () => {
    /* Es la misma cortesía que el dominio ya tiene con los diagnósticos: sin
       muestra suficiente no hay veredicto. */
    const pocas = {
      ...INFORME,
      retencion: [{ semana: '2026-08-16', activas: 17, vuelven: 11, pct: 64.7 }],
    };
    expect(pintarSeccion(Uso, pocas)).toContain('todavía no es una tendencia');
    /* Y con suficientes, no molesta. */
    const muchas = {
      ...INFORME,
      retencion: Array.from({ length: 6 }, (_, i) => ({
        semana: `2026-07-0${i + 1}`,
        activas: 10 + i,
        vuelven: 6 + i,
        pct: 60 + i,
      })),
    };
    expect(pintarSeccion(Uso, muchas)).not.toContain('todavía no es una tendencia');
  });
});

describe('poder tocar: ordenar y filtrar', () => {
  it('las columnas de la hoja de cuentas se anuncian como ordenables', () => {
    /* `aria-sort` es el atributo que existe para esto y es el primero de su
       clase en el repositorio: sin él, un lector de pantalla anuncia seis
       botones sin decir que ordenan ni por cuál está ordenada la tabla. */
    const html = pintar({ informe: INFORME });
    const cabeceras = (html.match(/aria-sort="none"/g) || []).length;
    expect(cabeceras).toBeGreaterThanOrEqual(6);
  });

  it('los filtros traen su cifra, para no tener que pulsarlos', () => {
    /* «Sin clientes 1» es una respuesta tan buena como la lista de dentro. */
    const html = pintar({ informe: INFORME }).replace(/<!--.*?-->/g, '');
    expect(html).toContain('En riesgo');
    expect(html).toContain('Sin clientes');
    expect(html).toContain('chip-count');
  });

  it('la búsqueda de cuentas tiene nombre para quien no ve el icono', () => {
    const html = pintar({ informe: INFORME });
    expect(html).toContain('Buscar por nombre o correo');
  });
});

describe('la pantalla, como pieza del producto', () => {
  it('se apila con el ritmo de las demás y no como un volcado', () => {
    /* `.layout` NO reparte aire entre sus hijos: lo pone cada pantalla con
       `.stack`, que es lo que hacen las otras once. Sin él, la cabecera, el
       carril, el veredicto y los ocho paneles salían pegados unos a otros. */
    const html = pintar({ informe: INFORME });
    expect(html.startsWith('<div class="stack">')).toBe(true);
  });

  it('el carril del detalle se queda a la vista al recorrer las tablas', () => {
    /* Dentro de cada pestaña hay tablas de una pantalla larga: sin esto, para
       cambiar de sección hay que subir por encima de los seis indicadores. */
    const html = pintar({ informe: INFORME });
    expect(html).toContain('tab-rail');
  });
});

describe('mientras se vuelve a leer', () => {
  /* Cambiar la ventana vuelve a pedir el informe entero y tarda segundos. */
  it('apaga el informe viejo en vez de dejar que pase por el nuevo', () => {
    const html = pintar({ informe: INFORME, cargando: true });
    expect(html).toContain('is-releyendo');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Actualizando el informe');
  });

  it('pero no lo tapa: un informe viejo se sigue pudiendo leer', () => {
    const html = pintar({ informe: INFORME, cargando: true });
    expect(html).toContain('Ana Ruiz');
    /* Y no sale la carga de la primera vez, que sí sustituye a la pantalla. */
    expect(html).not.toContain('Leyendo dieciocho tablas');
  });
});

describe('cuando no hay nada todavía, o algo ha fallado', () => {
  it('el vacío trae con qué generarlo, y no solo el botón de la cabecera', () => {
    /* Es lo único que hay en pantalla y es donde mira quien acaba de entrar. */
    const html = pintar({ informe: null });
    expect((html.match(/Generar informe/g) || []).length).toBe(2);
  });

  it('un error trae con qué reintentar', () => {
    /* Sin esto, la única salida de un corte de red es subir a buscar el botón
       de la cabecera en la pantalla que más tarda en contestar. */
    const html = pintar({ informe: null, error: 'No se ha podido comprobar el permiso.' });
    expect(html).toContain('Reintentar');
    /* Y el vacío no se pinta encima del error: son dos estados, no dos avisos. */
    expect(html).not.toContain('Sin generar');
  });
});

describe('el veredicto, en lo que no cuadraba', () => {
  it('cuenta también las comprobaciones que no se han podido hacer', () => {
    /* Los «sin datos» salen en la lista —no son comprobaciones en verde— y no
       estaban en el recuento: «1 para atender · 6 en verde» encima de una lista
       de tres filas enseña a no leer el recuento. */
    const conHueco = {
      ...INFORME,
      diagnosticos: [
        ...INFORME.diagnosticos,
        { titulo: 'Retención: sin muestra suficiente', gravedad: 'sin_datos' },
      ],
      resumen: { atender: 1, vigilar: 1, bien: 1, sinDatos: 1 },
    };
    const html = pintar({ informe: conHueco });
    expect(html).toContain('1 sin datos');
  });
});

describe('aceptar un hallazgo', () => {
  it('cada casilla dice QUÉ se da por bueno, no solo lo grave que es', () => {
    /* Lo único dentro de la etiqueta es la píldora «Crítico», así que un lector
       de pantalla anunciaba «Crítico, casilla» una vez por hallazgo: casillas
       indistinguibles para dar por buenos agujeros distintos. */
    const html = pintarSeccion(Seguridad, { hallazgos: INFORME.seguridad });
    expect(html).toContain('Dar por bueno: videos');
    expect(html).toContain('Dar por bueno: platform_snapshots');
  });
});

describe('el dinero, después de mirarlo con datos reales', () => {
  it('un cobro vencido dice de quién es y cómo encontrarlo', () => {
    /* Salía «22 d de retraso · 2026-08-01 · 130 EUR»: la lista más accionable
       del informe, sin nada sobre lo que actuar. */
    const html = pintarSeccion(Dinero, INFORME);
    expect(html).toContain('Ana Ruiz');
    expect(html).toContain('Marta — mensual');
  });

  it('un cobro sin cuenta conocida lo dice, no lo deja en blanco', () => {
    const html = pintarSeccion(Dinero, INFORME);
    expect(html).toContain('Cuenta desconocida');
  });

  it('el plan sale con su etiqueta y con su clave detrás', () => {
    /* La sección enseñaba «prueba» mientras la tabla de cuentas enseñaba
       «Gratis»: el mismo plan con dos nombres en la misma pantalla. La clave se
       conserva para poder buscarla en la base o en Stripe. */
    const html = pintarSeccion(Dinero, INFORME).replace(/<!--.*?-->/g, '');
    expect(html).toContain('Gratis');
    expect(html).toContain('· prueba');
  });
});
