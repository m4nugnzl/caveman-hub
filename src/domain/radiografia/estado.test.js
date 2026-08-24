import { describe, expect, it } from 'vitest';

import { comparar, instantanea } from './analisis.js';
import {
  aAceptar,
  aceptadosDe,
  anotar,
  claveDe,
  claveNovedad,
  estadoDeFilas,
  filaDeInstantanea,
  filasDeAceptacion,
  serieDe,
  siguienteEstado,
} from './estado.js';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que aceptar un hallazgo de seguridad no se convierta en dejar de mirarlo.
 *
 * La lista de seguridad nunca queda vacía sola —hay decisiones deliberadas que
 * salen siempre— y por eso se puede aceptar lo que ya se ha revisado. Ese
 * mecanismo es útil y es peligroso por el mismo motivo: si acepta de más, o si
 * mantiene la aceptación cuando el hallazgo ha CAMBIADO, convierte el informe en
 * una pantalla en verde que no comprueba nada.
 *
 * Lo que se fija abajo es dónde está esa frontera.
 */

const HALLAZGOS = [
  { area: 'anon', nivel: 'critico', objeto: 'videos · Acceso a videos', detalle: 'Política ALL alcanzable sin sesión (roles: public).' },
  { area: 'funciones', nivel: 'critico', objeto: 'handle_new_user()', detalle: 'SECURITY DEFINER sin search_path fijo.' },
  { area: 'rls', nivel: 'aviso', objeto: 'platform_admins', detalle: 'RLS activo y ninguna política.' },
];

describe('claveDe', () => {
  it('incluye el TEXTO del hallazgo, no solo el objeto', () => {
    /*
      La decisión central. Se acepta un hallazgo concreto, no un objeto para
      siempre: si `videos` pasa de tener una política SELECT a tener una ALL, el
      texto cambia, la clave cambia y vuelve a salir. Con la clave solo en el
      objeto, aceptar lo leve habría tapado lo grave.
    */
    const leve = { area: 'anon', objeto: 'videos', detalle: 'Política SELECT alcanzable sin sesión.' };
    const grave = { area: 'anon', objeto: 'videos', detalle: 'Política ALL alcanzable sin sesión.' };
    expect(claveDe(leve)).not.toBe(claveDe(grave));
  });
});

describe('claveNovedad', () => {
  it('NO mira el texto: reescribir el informe no inventa novedades', () => {
    /*
      El fallo real que motiva que haya dos claves. Al aplicar la migración 0055
      —que solo cambia cómo se REDACTA el hallazgo— el panel avisó de «36
      hallazgos que ayer no estaban». No había cambiado nada en la base: había
      cambiado el texto del informe.

      Un aviso de novedad que se dispara porque el propio informe se reescribió
      enseña a ignorar la única señal que significa «algo se movió en la base».
    */
    const antes = { area: 'anon', objeto: 'x()', nivel: 'aviso', detalle: 'comprueba permisos por dentro' };
    const despues = { ...antes, detalle: 'alcanza auth.uid() y se defiende sola' };

    expect(claveNovedad(antes)).toBe(claveNovedad(despues));
    /* Y para ACEPTAR siguen siendo distintos, que es lo que protege la otra clave. */
    expect(claveDe(antes)).not.toBe(claveDe(despues));
  });

  it('sí distingue una subida de gravedad', () => {
    /* Es lo que de verdad cambia cuando cambia la base: una política que pasa de
       `SELECT` a `ALL` sube de aviso a crítico, y eso tiene que salir como
       nuevo. */
    const leve = { area: 'anon', objeto: 'videos · p', nivel: 'aviso', detalle: 'SELECT' };
    const grave = { area: 'anon', objeto: 'videos · p', nivel: 'critico', detalle: 'ALL' };
    expect(claveNovedad(leve)).not.toBe(claveNovedad(grave));
  });
});

describe('anotar', () => {
  const vacio = { version: 2, aceptados: {}, ultimo: null };

  it('en el primer informe nada es «nuevo»', () => {
    /* Sin nada con que comparar, marcar los 239 como novedad sería la misma
       inundación que se quería evitar, solo que por otro lado. */
    const anotados = anotar(HALLAZGOS, vacio);
    expect(anotados.every((h) => h.nuevo === false)).toBe(true);
  });

  it('nuevo es «no estaba la vez anterior», no «no está aceptado»', () => {
    /*
      Son dos cosas distintas y confundirlas rompe el mecanismo: un hallazgo
      puede llevar semanas apareciendo sin que nadie lo haya aceptado porque
      nadie lo ha mirado, y eso no lo convierte en noticia. La noticia es lo que
      ayer no estaba.
    */
    const estado = {
      ...vacio,
      ultimo: { generado: '2026-08-09T00:00:00Z', claves: [claveNovedad(HALLAZGOS[0])], metricas: {} },
    };

    const anotados = anotar(HALLAZGOS, estado);
    expect(anotados[0].nuevo).toBe(false); // estaba, y sigue sin aceptar
    expect(anotados[1].nuevo).toBe(true); // no estaba
  });

  it('las líneas de contexto nunca son «nuevas»', () => {
    /*
      El fallo real que motiva esta prueba: ejecutar el informe dos veces
      seguidas sin cambiar nada avisaba de «4 hallazgos nuevos». Eran las cuatro
      líneas de contexto —«31 de 31 tablas con RLS», «68 políticas»…—, que se
      anotan pero no se guardan entre ejecuciones porque no son accionables.

      Un aviso de novedad que salta solo enseña a ignorar el único indicador que
      hay para lo que sí importa.
    */
    const conContexto = [
      ...HALLAZGOS,
      { area: 'contexto', nivel: 'info', objeto: 'tablas', detalle: '31 de 31 con RLS activo.' },
    ];
    const estado = {
      ...vacio,
      /* Lo que se guarda son los accionables, nunca el contexto. */
      ultimo: { generado: '2026-08-09T00:00:00Z', claves: HALLAZGOS.map(claveNovedad), metricas: {} },
    };

    const anotados = anotar(conContexto, estado);
    expect(anotados.filter((h) => h.nuevo)).toEqual([]);
  });

  it('adjunta el motivo y la fecha de lo aceptado', () => {
    const estado = {
      ...vacio,
      aceptados: {
        [claveDe(HALLAZGOS[2])]: { desde: '2026-08-01', motivo: 'solo se lee vía is_platform_admin()' },
      },
      ultimo: { generado: '2026-08-09T00:00:00Z', claves: HALLAZGOS.map(claveNovedad), metricas: {} },
    };

    const [, , tercero] = anotar(HALLAZGOS, estado);
    expect(tercero.aceptado.motivo).toMatch(/is_platform_admin/);
    expect(tercero.nuevo).toBe(false);
  });

  it('un hallazgo aceptado que CAMBIA de texto vuelve a salir sin aceptar', () => {
    /* El caso que justifica la clave estricta: se aceptó ESE hallazgo, no ese
       objeto para siempre. */
    const estado = {
      ...vacio,
      aceptados: { [claveDe(HALLAZGOS[0])]: { desde: '2026-08-01', motivo: 'deliberado' } },
      ultimo: { generado: '2026-08-09T00:00:00Z', claves: [claveNovedad(HALLAZGOS[0])], metricas: {} },
    };

    const empeorado = [{ ...HALLAZGOS[0], detalle: 'Política ALL alcanzable sin sesión (roles: public, anon).' }];
    const [h] = anotar(empeorado, estado);

    expect(h.aceptado).toBe(null);
    /* Pero NO como novedad: el objeto y la gravedad son los mismos. Marcarlo
       nuevo es lo que inundó el panel con 36 falsas novedades al reescribir la
       redacción de los hallazgos. Sale sin aceptar, que ya lo pone delante. */
    expect(h.nuevo).toBe(false);
  });

  it('y si además SUBE de gravedad, entonces sí es nuevo', () => {
    const estado = {
      ...vacio,
      ultimo: { generado: '2026-08-09T00:00:00Z', claves: [claveNovedad(HALLAZGOS[2])], metricas: {} },
    };

    const empeorado = [{ ...HALLAZGOS[2], nivel: 'critico' }];
    expect(anotar(empeorado, estado)[0].nuevo).toBe(true);
  });

  it('un estado guardado con las claves antiguas no marca todo como nuevo', () => {
    /*
      La migración entre las dos formas de clave. El `estado.json` escrito antes
      de separarlas guarda claves estrictas; si se compararan con las de novedad
      no coincidiría ninguna y la primera ejecución después del cambio marcaría
      TODOS los hallazgos como novedad — que es exactamente el ruido que la
      separación venía a quitar.

      Se distingue por el número de versión y no adivinando la forma de las
      claves: las dos son tres campos separados por barras y no se distinguen
      mirándolas.
    */
    const estado = {
      ...vacio,
      version: 1,
      ultimo: {
        generado: '2026-08-09T00:00:00Z',
        claves: HALLAZGOS.map(claveDe), // la forma vieja
        metricas: {},
      },
    };

    expect(anotar(HALLAZGOS, estado).filter((h) => h.nuevo)).toEqual([]);
  });
});

describe('siguienteEstado', () => {
  const base = { version: 2, aceptados: {}, ultimo: null };

  it('guarda las claves de hoy aunque no se acepte nada', () => {
    /* Es lo que permite saber qué es nuevo la próxima vez. Sin esto, cada
       informe sería el primero y la columna «nuevo» no diría nunca nada. */
    const siguiente = siguienteEstado({
      estado: base,
      hallazgos: HALLAZGOS,
      instantanea: { 'seguridad · críticos': 2 },
      generado: '2026-08-16T10:00:00Z',
    });

    expect(siguiente.ultimo.claves).toHaveLength(3);
    expect(siguiente.aceptados).toEqual({});
  });

  it('aceptar deja escrito el motivo y la fecha de cada uno', () => {
    const siguiente = siguienteEstado({
      estado: base,
      hallazgos: HALLAZGOS,
      instantanea: {},
      generado: '2026-08-16T10:00:00Z',
      aceptar: 'revisados uno a uno el 16/08',
    });

    expect(Object.keys(siguiente.aceptados)).toHaveLength(3);
    for (const a of Object.values(siguiente.aceptados)) {
      expect(a.motivo).toBe('revisados uno a uno el 16/08');
      expect(a.desde).toBe('2026-08-16');
    }
  });

  it('no reescribe el motivo de algo aceptado antes', () => {
    /* El motivo original —y su fecha— es el que explica la decisión. Pisarlo con
       el de una aceptación masiva posterior borraría justo lo que hace que la
       lista se pueda revisar. */
    const estado = {
      ...base,
      aceptados: { [claveDe(HALLAZGOS[0])]: { desde: '2026-01-01', motivo: 'el motivo bueno' } },
    };

    const siguiente = siguienteEstado({
      estado,
      hallazgos: HALLAZGOS,
      instantanea: {},
      generado: '2026-08-16T10:00:00Z',
      aceptar: 'aceptación masiva',
    });

    expect(siguiente.aceptados[claveDe(HALLAZGOS[0])].motivo).toBe('el motivo bueno');
    expect(siguiente.aceptados[claveDe(HALLAZGOS[1])].motivo).toBe('aceptación masiva');
  });
});

describe('el histórico que dibuja las tendencias', () => {
  const base = { version: 2, aceptados: {}, ultimo: null, historico: [] };

  const trasEjecutar = (estado, generado, metricas) =>
    siguienteEstado({ estado, hallazgos: [], instantanea: metricas, generado });

  it('acumula un punto por ejecución', () => {
    let e = trasEjecutar(base, '2026-08-01T10:00:00Z', { x: 1 });
    e = trasEjecutar(e, '2026-08-08T10:00:00Z', { x: 2 });
    expect(e.historico.map((h) => h.metricas.x)).toEqual([1, 2]);
  });

  it('dos ejecuciones del mismo día son un solo punto', () => {
    /*
      Probar el script tres veces seguidas dibujaría un dientecito que no
      significa nada: esto se mira una vez por semana y cada punto tiene que ser
      una semana. Manda la última del día.
    */
    let e = trasEjecutar(base, '2026-08-01T10:00:00Z', { x: 1 });
    e = trasEjecutar(e, '2026-08-01T18:00:00Z', { x: 9 });

    expect(e.historico).toHaveLength(1);
    expect(e.historico[0].metricas.x).toBe(9);
  });

  it('no crece para siempre', () => {
    let e = base;
    for (let i = 1; i <= 40; i += 1) {
      const dia = String(i).padStart(2, '0');
      e = trasEjecutar(e, `2026-${i <= 28 ? '01' : '02'}-${i <= 28 ? dia : String(i - 28).padStart(2, '0')}T10:00:00Z`, { x: i });
    }
    expect(e.historico.length).toBeLessThanOrEqual(26);
    /* Y lo que se conserva es lo reciente, no lo primero. */
    expect(e.historico.at(-1).metricas.x).toBe(40);
  });
});

describe('serieDe', () => {
  it('un solo punto no es una tendencia', () => {
    /* Una raya horizontal sugiere estabilidad donde no hay información. */
    const historico = [{ generado: '2026-08-01T10:00:00Z', metricas: { x: 5 } }];
    expect(serieDe(historico, 'x')).toEqual([]);
  });

  it('salta los puntos donde esa métrica no existía', () => {
    /* Al añadir una métrica nueva, los informes viejos no la tienen; tratarlos
       como cero dibujaría una subida desde el suelo que nunca ocurrió. */
    const historico = [
      { generado: '2026-08-01T10:00:00Z', metricas: {} },
      { generado: '2026-08-08T10:00:00Z', metricas: { x: 3 } },
      { generado: '2026-08-15T10:00:00Z', metricas: { x: 4 } },
    ];
    expect(serieDe(historico, 'x').map((p) => p.valor)).toEqual([3, 4]);
  });
});

describe('instantanea y comparar', () => {
  const informe = {
    seguridad: HALLAZGOS,
    embudo: [{ hito: 'Se registró', cuentas: 4 }],
    actividad: [{ semana: '2026-08-10', cuentas: 5 }],
    fallos: [{}, {}],
    volumen: [{ tabla: 'workout_data', filas: 7, bytes: 472 * 1024 }],
    censo: {
      clientes: { total: 15, portal: { pct: 13.3 }, conSexo: 40 },
      programas: { clientesConPrograma: 46.7 },
      revision: { sinContestar: 0 },
      antropometria: { registros: 9 },
    },
  };

  it('recoge la señal de auditoria.md §1.4 en kilobytes por fila', () => {
    expect(instantanea(informe)['workout_data · KB por fila']).toBe(67);
  });

  it('«mejor» no sale del signo, sale de qué mide cada cifra', () => {
    /*
      Lo que impide que el panel pinte de verde el número de fallos cuando crece.
      Un cuadro de mando que celebra una mala noticia deja de merecer confianza,
      y se deja de mirar por eso.
    */
    const antes = { 'seguridad · críticos': 2, 'clientes · total': 10 };
    const ahora = { 'seguridad · críticos': 5, 'clientes · total': 15 };

    const cambios = comparar(antes, ahora);
    expect(cambios.find((c) => c.clave.includes('críticos')).mejor).toBe(false);
    expect(cambios.find((c) => c.clave.includes('total')).mejor).toBe(true);
  });

  it('lo que no ha cambiado no aparece', () => {
    /* Una lista de «qué ha cambiado» con lo que sigue igual no es una lista de
       qué ha cambiado. */
    expect(comparar({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it('una cifra que no existía antes no cuenta como cambio', () => {
    /* Al añadir una métrica nueva, compararla contra «nada» daría un salto
       enorme desde cero que no ha ocurrido. */
    expect(comparar({}, { nueva: 40 })).toEqual([]);
  });

  it('ordena por magnitud, que es el orden en el que se mira', () => {
    const cambios = comparar({ a: 1, b: 1 }, { a: 2, b: 90 });
    expect(cambios[0].clave).toBe('b');
  });
});

/* ==========================================================================
   Lo mismo, viviendo en la base (migración 0074)
   ========================================================================== */

describe('aceptadosDe', () => {
  it('no acepta nada si no hay ninguna fila', () => {
    expect(aceptadosDe([])).toEqual({});
  });

  it('lee una aceptación con su motivo, su fecha y su autor', () => {
    const aceptados = aceptadosDe([
      {
        id: 1,
        clave: 'tablas|videos|política FOR ALL',
        motivo: 'la tabla se retira en la 0057',
        nivel: 'critico',
        objeto: 'videos',
        quien: 'perfil-1',
        at: '2026-08-16T10:00:00.000Z',
      },
    ]);

    expect(aceptados['tablas|videos|política FOR ALL']).toEqual({
      desde: '2026-08-16',
      motivo: 'la tabla se retira en la 0057',
      nivel: 'critico',
      objeto: 'videos',
      quien: 'perfil-1',
    });
  });

  it('una retirada deja el hallazgo sin aceptar', () => {
    const aceptados = aceptadosDe([
      { id: 1, clave: 'a|b|c', motivo: 'deliberado', at: '2026-08-16T10:00:00.000Z' },
      { id: 2, clave: 'a|b|c', motivo: 'ya no lo es', retira: 1, at: '2026-08-20T10:00:00.000Z' },
    ]);
    expect(aceptados['a|b|c']).toBeUndefined();
  });

  it('aceptar, retirar y volver a aceptar deja el hallazgo aceptado', () => {
    /* Tres filas y una sola conclusión: es lo que distingue un registro de
       decisiones de una casilla que se marca y se desmarca. */
    const aceptados = aceptadosDe([
      { id: 1, clave: 'a|b|c', motivo: 'primera vez', at: '2026-08-16T10:00:00.000Z' },
      { id: 2, clave: 'a|b|c', motivo: 'me equivoqué', retira: 1, at: '2026-08-18T10:00:00.000Z' },
      { id: 3, clave: 'a|b|c', motivo: 'lo he vuelto a mirar', at: '2026-08-20T10:00:00.000Z' },
    ]);
    expect(aceptados['a|b|c'].motivo).toBe('lo he vuelto a mirar');
  });

  it('ordena las filas aunque lleguen del revés', () => {
    /* Un `select` sin `order by` no promete ningún orden. Aplicar la retirada
       antes que su aceptación dejaría aceptado algo que ya no debe estarlo:
       se vería MENOS de lo que hay, que es el fallo caro. */
    const desordenadas = [
      { id: 2, clave: 'a|b|c', motivo: 'retirada', retira: 1, at: '2026-08-20T10:00:00.000Z' },
      { id: 1, clave: 'a|b|c', motivo: 'aceptada', at: '2026-08-16T10:00:00.000Z' },
    ];
    expect(aceptadosDe(desordenadas)['a|b|c']).toBeUndefined();
  });
});

describe('estadoDeFilas', () => {
  const snap = (dia, metricas, claves = []) => ({
    dia,
    generado: `${dia}T10:00:00.000Z`,
    metricas,
    claves,
  });

  it('sin instantáneas no hay «anterior», y por tanto nada es nuevo', () => {
    const estado = estadoDeFilas({});
    expect(estado.ultimo).toBeNull();
    expect(estado.historico).toEqual([]);

    const hallazgo = { area: 'a', objeto: 'b', detalle: 'c', nivel: 'critico' };
    expect(anotar([hallazgo], estado)[0].nuevo).toBe(false);
  });

  it('el «anterior» es la instantánea más reciente, no la primera que llegue', () => {
    const estado = estadoDeFilas({
      snapshots: [snap('2026-08-16', { x: 1 }), snap('2026-08-23', { x: 5 }, ['a|b|critico'])],
    });
    expect(estado.ultimo.metricas).toEqual({ x: 5 });
    expect(estado.ultimo.claves).toEqual(['a|b|critico']);
  });

  it('el histórico sale en orden, para que la línea no vaya y vuelva', () => {
    const estado = estadoDeFilas({
      snapshots: [snap('2026-08-23', { x: 5 }), snap('2026-08-09', { x: 1 }), snap('2026-08-16', { x: 3 })],
    });
    expect(serieDe(estado.historico, 'x').map((p) => p.valor)).toEqual([1, 3, 5]);
  });
});

describe('filaDeInstantanea', () => {
  it('guarda el día, y con eso manda la última ejecución de cada día', () => {
    const fila = filaDeInstantanea({
      generado: '2026-08-23T16:25:50.000Z',
      metricas: { x: 1 },
      hallazgos: [{ area: 'tablas', objeto: 'videos', detalle: 'texto que cambia', nivel: 'critico' }],
    });

    expect(fila.dia).toBe('2026-08-23');
    /* Las de NOVEDAD: si guardara las estrictas, reescribir el texto de un
       hallazgo lo haría parecer nuevo sin que la base hubiera cambiado. */
    expect(fila.claves).toEqual(['tablas|videos|critico']);
  });
});

describe('filasDeAceptacion', () => {
  const hallazgo = { area: 'a', objeto: 'b', detalle: 'c', nivel: 'aviso' };

  it('compone la fila con su clave estricta y su motivo', () => {
    const [fila] = filasDeAceptacion({ hallazgos: [hallazgo], motivo: 'revisado', quien: 'p1' });
    expect(fila).toEqual({ clave: 'a|b|c', motivo: 'revisado', nivel: 'aviso', objeto: 'b', quien: 'p1' });
  });

  it('no repite lo que ya estaba aceptado', () => {
    /* Sin esto, cada ejecución con --aceptar-todo añadiría una fila idéntica
       por hallazgo, y la tabla dejaría de ser un registro de decisiones para
       ser un registro de ejecuciones. */
    const filas = filasDeAceptacion({
      hallazgos: [hallazgo],
      motivo: 'otra vez',
      yaAceptados: { 'a|b|c': { motivo: 'ya estaba' } },
    });
    expect(filas).toEqual([]);
  });
});

describe('aAceptar', () => {
  const h = (nivel, objeto, nuevo = false) => ({
    area: 'a',
    objeto,
    detalle: 'd',
    nivel,
    nuevo,
  });

  const lista = [
    h('critico', 'videos'),
    h('aviso', 'platform_snapshots', true),
    h('aviso', 'una_funcion_vieja'),
    h('info', 'contexto'),
  ];

  it('«nuevos» solo alcanza lo que ayer no estaba', () => {
    expect(aAceptar(lista, 'nuevos').map((x) => x.objeto)).toEqual(['platform_snapshots']);
  });

  it('«avisos» alcanza todo lo que no es crítico', () => {
    expect(aAceptar(lista, 'avisos').map((x) => x.objeto)).toEqual([
      'platform_snapshots',
      'una_funcion_vieja',
    ]);
  });

  it('«todo» incluye los críticos, y es la única forma de aceptarlos', () => {
    expect(aAceptar(lista, 'todo').map((x) => x.objeto)).toContain('videos');
  });

  /* ══ La regla que justifica que haya ámbitos ═══════════════════════════
     Aceptar dos avisos nuevos no puede llevarse por delante un crítico sin
     arreglar: dejaría de pedir atención sin que nadie decidiera nada. */
  it('ni «nuevos» ni «avisos» tocan jamás un crítico', () => {
    for (const ambito of ['nuevos', 'avisos']) {
      expect(aAceptar(lista, ambito).some((x) => x.nivel === 'critico')).toBe(false);
    }
  });

  it('nunca incluye las líneas de contexto', () => {
    for (const ambito of ['nuevos', 'avisos', 'todo']) {
      expect(aAceptar(lista, ambito).some((x) => x.nivel === 'info')).toBe(false);
    }
  });

  it('descuenta lo que ya estaba aceptado, para no decir un número inflado', () => {
    const ya = { 'a|una_funcion_vieja|d': { motivo: 'ya estaba' } };
    expect(aAceptar(lista, 'avisos', ya).map((x) => x.objeto)).toEqual(['platform_snapshots']);
  });

  it('un ámbito que no existe no acepta nada', () => {
    expect(aAceptar(lista, 'inventado')).toEqual([]);
  });
});
