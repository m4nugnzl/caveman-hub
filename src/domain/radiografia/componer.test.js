import { describe, expect, it } from 'vitest';

import { componer } from './componer.js';
import { estadoVacio } from './estado.js';
import { CON_TENDENCIA } from './recogida.js';

const GENERADO = '2026-08-23T10:00:00.000Z';

const informeDe = (extra = {}) =>
  componer({
    datos: {},
    generado: GENERADO,
    proyecto: 'proyecto.supabase.co',
    estado: estadoVacio(),
    ...extra,
  });

describe('componer', () => {
  it('devuelve un informe entero aunque no se haya podido leer nada', () => {
    const informe = informeDe();

    /* Un proyecto recién creado, o uno donde todas las lecturas fallaron, tiene
       que producir informe igual: es el caso en el que MÁS falta hace saber que
       no se pudo leer nada, y una excepción aquí lo deja sin decir. */
    expect(informe.cuentas).toEqual([]);
    expect(informe.diagnosticos.length).toBeGreaterThan(0);
    expect(informe.resumen).toHaveProperty('atender');
    expect(informe.censo).not.toBeNull();
  });

  it('conserva la ventana y el proyecto tal cual se los dan', () => {
    const informe = informeDe({ dias: 90 });
    expect(informe.ventanaDias).toBe(90);
    expect(informe.proyecto).toBe('proyecto.supabase.co');
    expect(informe.generado).toBe(GENERADO);
  });

  /* ══ Lo que este archivo existe para fijar ═══════════════════════════════
     `informe.serie` era UNA FUNCIÓN colgada del informe, y una función no
     sobrevive a `JSON.stringify`: en cuanto el informe viaja hasta un panel,
     ese campo desaparece sin decir nada. Ahora son datos, y esto lo comprueba
     de la única forma que no admite interpretación: pasándolo por JSON. */
  describe('las tendencias', () => {
    it('son datos y sobreviven a un viaje por JSON', () => {
      const informe = informeDe();
      const ida = JSON.parse(JSON.stringify(informe));

      expect(typeof informe.series).toBe('object');
      expect(ida.series).toEqual(informe.series);
      for (const clave of CON_TENDENCIA) expect(ida.series).toHaveProperty(clave);
    });

    it('no dibujan nada con un solo punto', () => {
      /* Una «tendencia» de un punto es una raya horizontal que sugiere
         estabilidad donde no hay información. En la primera ejecución el
         histórico está vacío y el único punto es el de hoy. */
      const informe = informeDe();
      for (const clave of CON_TENDENCIA) expect(informe.series[clave]).toEqual([]);
    });

    it('incluyen la ejecución de hoy, que todavía no está en el histórico', () => {
      const estado = {
        ...estadoVacio(),
        historico: [{ generado: '2026-08-16T10:00:00.000Z', metricas: { 'clientes · total': 10 } }],
      };
      const informe = informeDe({ estado });
      const serie = informe.series['clientes · total'];

      /* Dos puntos: el guardado de la semana pasada y el de ahora. Sin el de
         hoy la línea acabaría en la semana pasada y parecería que el informe
         no se ha ejecutado. */
      expect(serie).toHaveLength(2);
      expect(serie[0]).toEqual({ etiqueta: '2026-08-16', valor: 10 });
      expect(serie[1].etiqueta).toBe('2026-08-23');
    });
  });

  describe('el orden del montaje', () => {
    it('anota los hallazgos de seguridad ANTES de dar el veredicto', () => {
      /* La mitad de los diagnósticos miran si un hallazgo está aceptado. Si el
         veredicto se calculara antes de anotar, un crítico ya revisado y dado
         por bueno volvería a pedir atención en cada informe — que es justo lo
         que la lista de aceptados existe para evitar. */
      const hallazgo = {
        area: 'funciones',
        objeto: 'handle_new_user',
        detalle: 'SECURITY DEFINER sin search_path',
        nivel: 'critico',
      };
      const estado = {
        ...estadoVacio(),
        aceptados: {
          'funciones|handle_new_user|SECURITY DEFINER sin search_path': {
            desde: '2026-08-16',
            motivo: 'revisado a mano',
          },
        },
      };

      const informe = informeDe({ seguridad: [hallazgo], estado });
      expect(informe.seguridad[0].aceptado).not.toBeNull();
      expect(informe.seguridad[0].clave).toBe(
        'funciones|handle_new_user|SECURITY DEFINER sin search_path'
      );
    });

    it('guarda la instantánea que el estado siguiente necesita', () => {
      /* `metricas` sustituye a la variable local `foto` que el script tenía: es
         lo que se guarda para poder comparar la próxima vez. Sin ella, cada
         informe sería el primero. */
      const informe = informeDe();
      expect(informe.metricas).toHaveProperty('seguridad · críticos');
      expect(informe.cambios).toEqual([]);
      expect(informe.comparadoCon).toBeNull();
    });
  });

  it('pone nombre a quién escribió cada ticket', () => {
    const informe = informeDe({
      datos: {
        perfiles: [{ id: 'p1', full_name: 'Ana', email: 'ana@ejemplo.com' }],
        tickets: [
          { id: 't1', profile_id: 'p1', subject: 'No puedo dar de alta', created_at: '2026-08-20' },
          { id: 't2', profile_id: 'nadie', subject: 'Otra cosa', created_at: '2026-08-22' },
        ],
      },
    });

    /* Un ticket sin nombre no se puede contestar. Y uno cuyo perfil ya no
       existe tampoco puede desaparecer del informe: sale con `quien` en nulo. */
    expect(informe.tickets.map((t) => t.quien)).toEqual([null, 'Ana']);
    expect(informe.tickets[0].id).toBe('t2');
  });
});

describe('el dinero, para que se pueda accionar', () => {
  const CLIENTES = [
    { id: 'cli-1', team_id: 'eq-1', status: 'active' },
    { id: 'cli-2', team_id: 'eq-9', status: 'active' },
  ];
  const EQUIPOS = [{ id: 'eq-1', name: 'Equipo de Ana', owner_id: 'perf-1', created_at: '2026-01-01' }];
  const PERFILES = [{ id: 'perf-1', full_name: 'Ana Ruiz', email: 'ana@ejemplo.com' }];
  const MIEMBROS = [{ team_id: 'eq-1', profile_id: 'perf-1', role: 'owner' }];

  it('un cobro vencido dice DE QUIÉN es', () => {
    /* Salía como «22 días de retraso · 2026-08-01 · 130 EUR», y con eso no se
       puede hacer nada. Es el mismo error que el informe entero tenía cuando
       abría por agregados: no se le puede escribir un correo a una fecha. */
    const informe = informeDe({
      datos: {
        equipos: EQUIPOS,
        perfiles: PERFILES,
        miembros: MIEMBROS,
        clientes: CLIENTES,
        pagos: [
          {
            id: 'p1',
            client_id: 'cli-1',
            period_end: '2026-08-20',
            is_paid: false,
            amount: 130,
            currency: 'EUR',
            external_label: 'Marta — mensual',
          },
        ],
      },
    });

    const [cobro] = informe.cobros.proximos;
    expect(cobro.cuenta).toBe('Ana Ruiz');
    /* El rótulo que el entrenador escribió en SU herramienta: es lo que le
       permite encontrar la fila cuando se lo cuentes. */
    expect(cobro.etiqueta).toBe('Marta — mensual');
  });

  it('un cobro de un cliente sin equipo conocido no inventa un nombre', () => {
    /* `cuenta` en nulo es una respuesta; un nombre equivocado en una lista de
       impagos hace que se le reclame a quien no es. */
    const informe = informeDe({
      datos: {
        equipos: EQUIPOS,
        perfiles: PERFILES,
        miembros: MIEMBROS,
        clientes: CLIENTES,
        pagos: [
          { id: 'p2', client_id: 'cli-2', period_end: '2026-08-20', is_paid: false, amount: 90 },
        ],
      },
    });
    expect(informe.cobros.proximos[0].cuenta).toBeNull();
  });

  it('los planes salen con su ETIQUETA, no con su clave interna', () => {
    /* La clave del plan gratuito sigue siendo `prueba` (0056). La sección de
       dinero enseñaba la clave mientras la tabla de cuentas enseñaba la
       etiqueta: el mismo plan con dos nombres en la misma pantalla. */
    const informe = informeDe({
      datos: {
        equipos: EQUIPOS,
        perfiles: PERFILES,
        miembros: MIEMBROS,
        suscripciones: [{ team_id: 'eq-1', plan: 'prueba', status: 'active' }],
        planes: [{ plan: 'prueba', label: 'Gratis', max_clients: 3 }],
      },
    });

    const [linea] = informe.planes;
    expect(linea.planEtiqueta).toBe('Gratis');
    /* Y la clave se conserva, para poder buscarla en la base o en Stripe. */
    expect(linea.plan).toBe('prueba');
  });
});
