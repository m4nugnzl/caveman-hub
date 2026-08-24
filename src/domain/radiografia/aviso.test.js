import { describe, expect, it } from 'vitest';

import { ayuda, esc, ORDENES, queDecir, responder } from './aviso.js';

/**
 * Lo que este archivo protege es que el bot SE CALLE.
 *
 * Es lo contrario de lo que se prueba normalmente, y es lo que decide si un
 * canal así sobrevive: un aviso que llega esté pasando algo o no se silencia en
 * dos semanas, y con él se silencia el que sí importaba.
 */

const diag = (titulo, gravedad = 'atender', extra = {}) => ({
  titulo,
  gravedad,
  cifra: null,
  hacer: null,
  ...extra,
});

const informeCon = (diagnosticos, extra = {}) => ({
  diagnosticos,
  resumen: {
    atender: diagnosticos.filter((d) => d.gravedad === 'atender').length,
    vigilar: diagnosticos.filter((d) => d.gravedad === 'vigilar').length,
  },
  seguridad: [],
  ...extra,
});

describe('cuándo se calla', () => {
  it('con las mismas cosas que la última vez no dice nada', () => {
    /* La regla entera. Que no llegue nada ES la información: nada se ha movido. */
    const informe = informeCon([diag('5 cobros vencidos'), diag('2 cuentas sin entrar')]);
    const r = queDecir({
      informe,
      yaAvisado: ['5 cobros vencidos', '2 cuentas sin entrar'],
    });

    expect(r.hablar).toBe(false);
    expect(r.mensaje).toBeNull();
    expect(r.porque).toMatch(/nada ha cambiado/);
  });

  it('sin nada que atender y sin nada que hubiera antes, tampoco habla', () => {
    const r = queDecir({ informe: informeCon([diag('todo bien', 'bien')]), yaAvisado: [] });
    expect(r.hablar).toBe(false);
  });

  /* ══ La trampa que rompe la memoria ═════════════════════════════════════
     `titulos` se devuelve SIEMPRE, se hable o no. Si solo se guardara al
     hablar, un día de silencio borraría la memoria y al siguiente todo
     volvería a parecer nuevo. */
  it('devuelve qué guardar aunque no hable', () => {
    const informe = informeCon([diag('5 cobros vencidos')]);
    const r = queDecir({ informe, yaAvisado: ['5 cobros vencidos'] });

    expect(r.hablar).toBe(false);
    expect(r.titulos).toEqual(['5 cobros vencidos']);
  });
});

describe('cuándo habla', () => {
  it('cuando aparece algo que no estaba', () => {
    const informe = informeCon([
      diag('5 cobros vencidos'),
      diag('1 cuenta nueva sin usar', 'atender', { cifra: '1', hacer: 'Escríbele.' }),
    ]);
    const r = queDecir({ informe, yaAvisado: ['5 cobros vencidos'] });

    expect(r.hablar).toBe(true);
    expect(r.mensaje).toContain('1 cuenta nueva sin usar');
    /* Con su QUÉ HACER: sin eso es una notificación, no un aviso. */
    expect(r.mensaje).toContain('Escríbele.');
    /* Y lo que ya estaba no se repite. */
    expect(r.mensaje).not.toContain('5 cobros vencidos');
  });

  it('cuando algo se arregla, que también es una noticia', () => {
    /* Si solo hablara de lo que empeora, sería un canal que solo trae malas
       noticias — y abrirlo acabaría costando por otro motivo. */
    const r = queDecir({ informe: informeCon([]), yaAvisado: ['5 cobros vencidos'] });

    expect(r.hablar).toBe(true);
    expect(r.mensaje).toContain('Ya no hace falta mirar');
    expect(r.mensaje).toContain('5 cobros vencidos');
  });

  it('un crítico de seguridad nuevo habla aunque el diagnóstico no cambie', () => {
    /*
      «2 hallazgos críticos» y «3 hallazgos críticos» son el mismo título con
      distinta cifra, así que la comparación por títulos no lo vería. Una tabla
      que se acaba de abrir a internet no puede esperar a que cambie una
      redacción.
    */
    const informe = informeCon([diag('hallazgos críticos de seguridad')], {
      seguridad: [
        {
          objeto: 'videos',
          detalle: 'política FOR ALL con rol public',
          nivel: 'critico',
          nuevo: true,
          aceptado: null,
        },
      ],
    });

    const r = queDecir({ informe, yaAvisado: ['hallazgos críticos de seguridad'] });
    expect(r.hablar).toBe(true);
    expect(r.mensaje).toContain('videos');
  });

  it('un crítico ya aceptado no vuelve a hablar', () => {
    const informe = informeCon([], {
      seguridad: [
        {
          objeto: 'plan_limits',
          detalle: 'legible sin sesión',
          nivel: 'critico',
          nuevo: true,
          aceptado: { motivo: 'los planes son públicos a propósito' },
        },
      ],
    });
    expect(queDecir({ informe, yaAvisado: [] }).hablar).toBe(false);
  });

  it('la primera vez fija la línea base sin volcar la lista entera', () => {
    /* Volcar veinte cosas en el primer mensaje es la forma de que el segundo no
       se lea. Se dice cuántas hay y a partir de ahí solo lo que cambie. */
    const informe = informeCon([diag('a'), diag('b'), diag('c')]);
    const r = queDecir({ informe, yaAvisado: [], primeraVez: true });

    expect(r.hablar).toBe(true);
    expect(r.mensaje).toContain('3 cosa(s) que atender');
    expect(r.mensaje).not.toContain('· a');
    expect(r.titulos).toEqual(['a', 'b', 'c']);
  });

  it('dice cuántas quedan en total, para no dar a entender que lo nuevo es todo', () => {
    const informe = informeCon([diag('vieja'), diag('nueva')]);
    const r = queDecir({ informe, yaAvisado: ['vieja'] });
    expect(r.mensaje).toContain('2 para atender en total');
  });
});

describe('el escapado, que no es una precaución genérica', () => {
  it('escapa los tres caracteres que rompen el mensaje entero', () => {
    expect(esc('<b>&</b>')).toBe('&lt;b&gt;&amp;&lt;/b&gt;');
  });

  it('un título con un «<» no tumba el aviso', () => {
    /*
      Telegram en modo HTML contesta 400 con una etiqueta mal formada y NO
      LLEGA NADA: el fallo se lleva por delante justo el aviso que traía la
      novedad. Los títulos llevan dentro asuntos de tickets y mensajes de
      Postgres, que los escriben personas.
    */
    const informe = informeCon([diag('fallo en <select> de rutina')]);
    const r = queDecir({ informe, yaAvisado: [] });

    expect(r.mensaje).toContain('&lt;select&gt;');
    expect(r.mensaje).not.toContain('<select>');
  });
});

describe('lo que se contesta al preguntar', () => {
  const INFORME = informeCon([diag('5 cobros vencidos', 'atender', { cifra: '720 EUR' })], {
    riesgo: [{ nombre: 'Ana Ruiz', motivos: ['la prueba acaba en 3 días'] }],
    planes: [{ plan: 'prueba', planEtiqueta: 'Gratis', estado: 'active', cuentas: 3 }],
    cobros: {
      importePagado: 1480,
      importePendiente: 720,
      pendientes: 5,
      moneda: 'EUR',
      proximos: [{ faltan: -22, amount: 130, currency: 'EUR', cuenta: 'Ana Ruiz' }],
    },
    pantallas: { sinUso: ['ajustes_copia'] },
  });

  it('preguntar contesta SIEMPRE, aunque no haya cambiado nada', () => {
    /* Es la diferencia entre que te avisen y preguntar: lo segundo lo has
       pedido tú. */
    expect(responder('/estado', INFORME)).toContain('5 cobros vencidos');
  });

  it('un cobro vencido dice de quién es también por aquí', () => {
    /* Un mensaje de Telegram se lee en el móvil, que es justo donde menos se
       puede ir a buscar de quién era ese impago. */
    expect(responder('/dinero', INFORME)).toContain('Ana Ruiz');
  });

  it('el plan se contesta con su etiqueta, no con su clave', () => {
    expect(responder('/dinero', INFORME)).toContain('Gratis');
  });

  it('entiende la forma que Telegram usa en los grupos', () => {
    expect(responder('/estado@cavemanhub_bot', INFORME)).toContain('atender');
  });

  it('a lo que no entiende contesta NULL, que significa callarse', () => {
    /* Contestar «no te entiendo» a un desconocido le confirma que hay un bot
       vivo detrás y a qué responde. */
    expect(responder('hola', INFORME)).toBeNull();
    expect(responder('/borrar_todo', INFORME)).toBeNull();
    expect(responder('', INFORME)).toBeNull();
  });

  it('la ayuda sale de las propias órdenes, así que no pueden divergir', () => {
    const texto = ayuda();
    for (const orden of Object.keys(ORDENES)) expect(texto).toContain(orden);
  });

  it('ninguna respuesta revienta con un informe a medias', () => {
    /* La función edge puede quedarse sin una sección si una tabla falló, y un
       bot que revienta al contestar es peor que uno que contesta poco. */
    for (const { responde } of Object.values(ORDENES)) {
      expect(() => responde({ resumen: {}, diagnosticos: [] })).not.toThrow();
    }
  });
});
