import { describe, expect, it } from 'vitest';

import { diagnosticar, resumenDe } from './diagnosticos.mjs';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que la herramienta no se invente conclusiones.
 *
 * Desde que el informe da veredictos en vez de cifras, tiene mucho más poder
 * sobre las decisiones que se toman —y por eso puede hacer mucho más daño—. Un
 * «nadie mide pliegues» sacado de nueve registros de prueba haría que se
 * quitaran quince campos que sí se usan, y nadie volvería a comprobarlo.
 *
 * Lo que se fija abajo son las dos disciplinas del archivo: que sin muestra no
 * hay veredicto, y que los umbrales están donde dicen estar.
 */

/* Un informe mínimo y sano. Cada prueba estropea solo lo que le interesa. */
const sano = () => ({
  ventanaDias: 30,
  seguridad: [],
  avisoSeguridad: null,
  volumen: [{ tabla: 'workout_data', filas: 20, bytes: 20 * 100 * 1024 }],
  fallos: [],
  eventos: [{ nombre: 'pantalla_vista', veces: 10, cuentas: 3 }],
  actividad: [{ semana: '2026-08-03', cuentas: 4 }, { semana: '2026-08-10', cuentas: 4 }],
  pantallas: { usadas: [], sinUso: [] },
  negocio: [],
  censo: {
    clientes: { total: 20, portal: { cuantos: 16, pct: 80 }, conSexo: 95 },
    antropometria: {
      registros: 60,
      pliegues: { campos: [{ campo: 'tricipital', veces: 40, pct: 66 }] },
      perimetros: { campos: [{ campo: 'pecho', veces: 30, pct: 50 }] },
    },
    revision: { entregados: 10, revisados: 10, sinContestar: 0 },
  },
});

const buscar = (informe, fragmento) =>
  diagnosticar(informe).find((x) => x.titulo.toLowerCase().includes(fragmento.toLowerCase()));

describe('sin muestra no hay veredicto', () => {
  it('no dice qué medidas sobran con pocos registros', () => {
    /*
      El caso que motiva la regla, y ocurrió de verdad: en el proyecto real hay
      nueve pesajes —casi todos sembrados— y los seis pliegues salían al 0 %.
      Concluir de ahí que sobran quince campos sería quitar de la pantalla algo
      que nadie ha llegado a usar todavía porque no hay usuarios.
    */
    const informe = sano();
    informe.censo.antropometria.registros = 9;
    informe.censo.antropometria.pliegues.campos = [{ campo: 'tricipital', veces: 0, pct: 0 }];

    const v = buscar(informe, 'todavía no se puede decir');
    expect(v).toBeDefined();
    expect(v.gravedad).toBe('sin_datos');
    /* Y no aparece la conclusión que no toca. */
    expect(buscar(informe, 'no ha rellenado nadie')).toBeUndefined();
  });

  it('no opina del portal con menos de cinco clientes', () => {
    /* Con cuatro fichas, cada cliente mueve el porcentaje veinticinco puntos. */
    const informe = sano();
    informe.censo.clientes = { total: 4, portal: { cuantos: 0, pct: 0 }, conSexo: 100 };
    expect(buscar(informe, 'portal')).toBeUndefined();
  });

  it('no opina de las cuentas que pagan si hay menos de tres', () => {
    const informe = sano();
    informe.negocio = [{ estado: 'active', cuentas: 2, activas: 0, pctActivas: 0 }];
    expect(buscar(informe, 'pagan y no lo usan')).toBeUndefined();
  });

  it('avisa de que no llega ni un evento en vez de decir que no se usa nada', () => {
    /* «Nadie abre ninguna pantalla» y «la instrumentación no está llegando» se
       ven igual en los datos y significan cosas opuestas. */
    const informe = sano();
    informe.eventos = [];
    const v = buscar(informe, 'ni un evento');
    expect(v.gravedad).toBe('sin_datos');
    expect(v.hacer).toMatch(/0045|despliega/i);
  });
});

describe('el abandono que no parece abandono', () => {
  const conCuentas = (cuentas) => diagnosticar({ ...sano(), cuentas });

  it('caza a quien entra y no toca nada', () => {
    /*
      El caso real que la motiva: una cuenta dada de alta hace tres días, que
      entró ayer, con cero clientes y cero acciones. No parece muerta —entró
      hace nada— y sin embargo no ha hecho un solo gesto. Cuando aparezca en
      «lleva una semana sin entrar» ya se habrá ido.
    */
    const v = conCuentas([
      { nombre: 'Dani', clientes: 0, accionesSemana: 0, entrada: { dias: 1, texto: 'ayer' } },
    ]).find((x) => x.titulo.includes('no hicieron nada'));

    expect(v.gravedad).toBe('atender');
    expect(v.porque).toMatch(/Dani/);
  });

  it('no confunde «no ha entrado» con «entró y no hizo nada»', () => {
    /* Son dos problemas distintos, con dos conversaciones distintas, y cada uno
       tiene su regla. */
    const v = conCuentas([
      { nombre: 'Ana', clientes: 0, accionesSemana: 0, entrada: { dias: null, texto: 'nunca' } },
    ]).find((x) => x.titulo.includes('no hicieron nada'));
    expect(v).toBeUndefined();
  });

  it('quien tiene clientes no está en blanco aunque no haya actuado esta semana', () => {
    const v = conCuentas([
      { nombre: 'Leo', clientes: 4, accionesSemana: 0, entrada: { dias: 2, texto: 'hace 2 días' } },
    ]).find((x) => x.titulo.includes('no hicieron nada'));
    expect(v).toBeUndefined();
  });
});

describe('lo que hay que atender va primero', () => {
  it('ordena por gravedad, no por el orden en que se comprueban', () => {
    const informe = sano();
    informe.censo.revision.sinContestar = 3;

    const [primero] = diagnosticar(informe);
    expect(primero.gravedad).toBe('atender');
  });

  it('un hallazgo de seguridad nuevo pesa más que la cantidad', () => {
    /* Es la única señal que significa «algo cambió en la base desde la última
       vez». Uno basta y ninguna cantidad lo hace más urgente. */
    const informe = sano();
    informe.seguridad = [
      { nivel: 'critico', nuevo: true, aceptado: null, objeto: 'x', detalle: 'y' },
    ];

    const [primero] = diagnosticar(informe);
    expect(primero.titulo).toMatch(/ayer no estaban/);
  });

  it('cada diagnóstico de atender dice qué hacer', () => {
    /* Un diagnóstico sin acción es una queja. */
    const informe = sano();
    informe.censo.revision.sinContestar = 2;
    informe.censo.clientes.portal = { cuantos: 1, pct: 5 };
    informe.fallos = [{ cuentas: 4, veces: 9, message: 'boom', ruta: '/hoy' }];

    for (const v of diagnosticar(informe).filter((x) => x.gravedad === 'atender')) {
      expect(v.hacer.length, `«${v.titulo}» no dice qué hacer`).toBeGreaterThan(10);
    }
  });
});

describe('los umbrales están donde dicen estar', () => {
  it('un fallo de una sola cuenta no es del producto; de dos, sí', () => {
    const uno = sano();
    uno.fallos = [{ cuentas: 1, veces: 200, message: 'raro', ruta: '/hoy' }];
    expect(buscar(uno, 'más de una cuenta')).toBeUndefined();

    const dos = sano();
    dos.fallos = [{ cuentas: 2, veces: 2, message: 'rls', ruta: '/c/:id/rutina' }];
    expect(buscar(dos, 'más de una cuenta').gravedad).toBe('atender');
  });

  it('el JSONB avisa al pasar de medio mega por fila', () => {
    const bien = sano();
    expect(buscar(bien, 'todavía no aprieta').gravedad).toBe('bien');

    const mal = sano();
    mal.volumen = [{ tabla: 'workout_data', filas: 20, bytes: 20 * 600 * 1024 }];
    expect(buscar(mal, 'empiezan a pesar').gravedad).toBe('vigilar');
  });

  it('la actividad avisa solo si cae a menos de la mitad', () => {
    const suave = sano();
    suave.actividad = [{ semana: 'a', cuentas: 10 }, { semana: 'b', cuentas: 6 }];
    expect(buscar(suave, 'actividad ha caído')).toBeUndefined();

    const brusca = sano();
    brusca.actividad = [{ semana: 'a', cuentas: 10 }, { semana: 'b', cuentas: 4 }];
    expect(buscar(brusca, 'actividad ha caído').gravedad).toBe('atender');
  });

  it('el portal por debajo del 30 % es atender; entre 30 y 60, vigilar', () => {
    const grave = sano();
    grave.censo.clientes.portal = { cuantos: 2, pct: 13 };
    expect(buscar(grave, 'portal no lo alcanza').gravedad).toBe('atender');

    const medio = sano();
    medio.censo.clientes.portal = { cuantos: 9, pct: 45 };
    expect(buscar(medio, 'portal no lo alcanza').gravedad).toBe('vigilar');
  });

  it('un check-in sin contestar ya cuenta: es una persona esperando', () => {
    const informe = sano();
    informe.censo.revision.sinContestar = 1;
    expect(buscar(informe, 'sin contestar').gravedad).toBe('atender');
  });
});

describe('las buenas noticias también salen', () => {
  it('un informe sano da veredictos «bien» y ninguno de atender', () => {
    /* Un panel que solo enseña problemas no se distingue de uno que no ha
       mirado nada, y no deja saber qué se ha comprobado. */
    const r = resumenDe(diagnosticar(sano()));
    expect(r.atender).toBe(0);
    expect(r.bien).toBeGreaterThan(2);
  });

  it('van detrás de los problemas, nunca delante', () => {
    const informe = sano();
    informe.censo.revision.sinContestar = 1;

    const orden = diagnosticar(informe).map((x) => x.gravedad);
    expect(orden.indexOf('atender')).toBeLessThan(orden.indexOf('bien'));
  });

  it('si la seguridad no se ha podido comprobar, NO dice que esté bien', () => {
    /* La confusión más peligrosa del informe: «no hay hallazgos» y «no se ha
       mirado» se ven igual y significan lo contrario. */
    const informe = sano();
    informe.avisoSeguridad = 'no se ha podido leer';

    expect(buscar(informe, 'no se ha podido comprobar').gravedad).toBe('atender');
    expect(buscar(informe, 'ningún hallazgo crítico')).toBeUndefined();
  });
});
