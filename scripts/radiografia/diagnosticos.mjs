/**
 * El veredicto: qué mirar hoy, y qué hacer con ello.
 *
 * ══ Por qué esto es el cambio importante ════════════════════════════════════
 *
 * Las versiones anteriores del informe enseñaban cifras. Enseñar cifras no es
 * ayudar: «13,3 %» debajo de «con acceso al portal» obliga a quien lo lee a
 * saber que el portal es media aplicación, a recordar que `monetizacion.md` §4.1
 * suponía que el abandono estaba ahí, y a decidir por su cuenta si 13 es poco.
 *
 * Eso es trabajo que el informe puede hacer, y si no lo hace se hace una vez y
 * no se vuelve a hacer nunca. Una herramienta que no se moja acaba siendo un
 * volcado bonito.
 *
 * Así que aquí se convierte cada cifra en una de tres cosas: **algo que hay que
 * atender**, **algo que conviene vigilar**, o **nada** — y cuando es algo, se
 * dice qué se hace al respecto.
 *
 * ══ Las dos reglas que impiden que esto se vuelva ruido ═════════════════════
 *
 * 1. **NINGÚN UMBRAL REDONDO SIN MOTIVO.** Cada número de este archivo lleva
 *    escrito por qué es ése y no otro. Un umbral inventado produce alarmas
 *    inventadas, y a la tercera nadie mira la sección.
 *
 * 2. **SIN DATOS SUFICIENTES NO HAY VEREDICTO.** Decir «nadie mide pliegues»
 *    con nueve registros, de los cuales ocho son de pruebas, es peor que callar:
 *    suena a conclusión y es una casualidad. Cada regla declara cuántos datos
 *    necesita, y si no los hay lo dice en vez de opinar.
 *
 * ══ La forma de un diagnóstico ══════════════════════════════════════════════
 *
 *   gravedad  'atender'  algo está roto o se está perdiendo. Va arriba.
 *             'vigilar'  todavía no duele, y va a doler.
 *             'bien'     una comprobación que ha salido limpia y que conviene
 *                        ver: un informe sin buenas noticias no se distingue de
 *                        uno que no ha mirado nada.
 *             'sin_datos' no hay muestra para opinar.
 *
 *   titulo    la frase, no la métrica. «El portal no lo alcanza casi nadie».
 *   cifra     el número que la sostiene, para poder comprobarla de un vistazo.
 *   porque    de dónde sale, con el contexto que hace falta para creérsela.
 *   hacer     qué se hace. Sin esto, un diagnóstico es una queja.
 *   ancla     a qué sección del panel lleva.
 */

/** Cuántas cuentas de verdad hacen falta para hablar de comportamiento. */
const MUESTRA_MINIMA_CUENTAS = 3;

/** Y cuántos registros para hablar de qué campos se rellenan. */
const MUESTRA_MINIMA_REGISTROS = 20;

const d = (gravedad, titulo, { cifra = null, porque = '', hacer = '', ancla = '' } = {}) => ({
  gravedad,
  titulo,
  cifra,
  porque,
  hacer,
  ancla,
});

/* ==========================================================================
   Las reglas
   --------------------------------------------------------------------------
   Cada una recibe el informe entero y devuelve un diagnóstico o `null`. Se
   escriben aparte y no como un `if` gigante para que cada una se pueda leer,
   probar y discutir por su cuenta.
   ========================================================================== */

const REGLAS = [
  /* ══ Las cuentas: lo que tiene nombre y fecha ═══════════════════════════ */

  ({ pruebas = [] }) => {
    /* Catorce días: es lo que se tarda en escribir, esperar respuesta y volver a
       escribir. Avisar más tarde es avisar cuando ya no da tiempo. */
    const cerca = pruebas.filter((c) => c.diasDePrueba !== null && c.diasDePrueba <= 14);
    if (cerca.length === 0) return null;

    const caducadas = cerca.filter((c) => c.diasDePrueba < 0);
    const lista = cerca
      .map((c) => `${c.nombre} (${c.diasDePrueba < 0 ? `caducó hace ${-c.diasDePrueba} d` : `${c.diasDePrueba} d`})`)
      .join(' · ');

    return d('atender', `${cerca.length} prueba(s) a punto de acabar`, {
      cifra: cerca[0].diasDePrueba < 0 ? 'vencida' : `${cerca[0].diasDePrueba} días`,
      porque: lista,
      hacer:
        caducadas.length > 0
          ? 'Las vencidas no van a convertirse solas: escríbeles hoy.'
          : 'Es la única lista con fecha límite. Después de ese día ya no se puede hacer nada.',
      ancla: 'cuentas',
    });
  },

  ({ riesgo = [] }) => {
    const callados = riesgo.filter((c) => c.motivos.some((m) => m.startsWith('sin entrar')));
    if (callados.length === 0) return null;

    return d('atender', `${callados.length} cuenta(s) llevan una semana sin entrar`, {
      cifra: String(callados.length),
      porque: callados.map((c) => `${c.nombre}: ${c.entrada.texto}`).join(' · '),
      hacer: 'El check-in del producto es semanal: quien se salta una semana se ha saltado el ciclo entero.',
      ancla: 'cuentas',
    });
  },

  ({ cuentas = [] }) => {
    /*
      Entró, miró y se fue sin tocar nada.

      Es la señal de abandono más temprana que existe y la más fácil de no ver:
      la cuenta NO parece muerta —entró hace poco— y sin embargo no ha hecho ni
      un gesto. Cuando dé la cara en «lleva una semana sin entrar» ya se habrá
      ido, porque nadie vuelve a un producto que abrió y no entendió.

      Hacen falta las tres condiciones a la vez: sin clientes, sin acciones, y
      habiendo entrado. Sin la última esto sería «no ha entrado», que es otra
      cosa y ya tiene su propia regla.
    */
    const enBlanco = cuentas.filter(
      (c) => c.clientes === 0 && c.accionesSemana === 0 && c.entrada.dias !== null && c.entrada.dias <= 7
    );
    if (enBlanco.length === 0) return null;

    return d('atender', `${enBlanco.length} cuenta(s) entraron y no hicieron nada`, {
      cifra: String(enBlanco.length),
      porque: enBlanco
        .map((c) => `${c.nombre}: entró ${c.entrada.texto}, 0 clientes y 0 acciones en 7 días`)
        .join(' · '),
      hacer:
        'Es el abandono más temprano y el más recuperable: pregúntales qué esperaban encontrar. ' +
        'Cuando aparezcan en «lleva una semana sin entrar» ya será tarde.',
      ancla: 'cuentas',
    });
  },

  ({ riesgo = [] }) => {
    const vacias = riesgo.filter((c) => c.motivos.includes('nunca ha dado de alta un cliente'));
    if (vacias.length === 0) return null;

    return d('atender', `${vacias.length} cuenta(s) sin un solo cliente dado de alta`, {
      cifra: String(vacias.length),
      porque: vacias.map((c) => `${c.nombre}, desde hace ${c.diasDeVida} días`).join(' · '),
      hacer: 'No han llegado a empezar. Es el momento exacto en el que se abandona un producto.',
      ancla: 'cuentas',
    });
  },

  ({ cuentas = [] }) => {
    /*
      Cuentas activas, sin límite y a las que nunca se les va a cobrar.

      No es una decisión comercial: es el injerto de la migración 0019, que al
      activar la facturación metió en el plan `fundador` —ilimitado, activo y sin
      caducidad— a TODOS los equipos que existían ese día. Quien se registró unas
      horas antes del corte tiene barra libre para siempre y quien lo hizo al día
      siguiente tiene catorce días de prueba.

      Se detecta por los datos y no por el nombre del plan: `active` sin cliente
      de Stripe y sin periodo de cobro. «Fundador» es una etiqueta que además
      confunde —suena a «el fundador del producto»— y mañana puede llamarse otra
      cosa.

      La tuya no cuenta: se sabe por `platform_admins`.
    */
    const regaladas = cuentas.filter((c) => c.gratisIndefinido && !c.esTuya);
    if (regaladas.length === 0) return null;

    const clientes = regaladas.reduce((t, c) => t + c.clientes, 0);
    return d('vigilar', `${regaladas.length} cuenta(s) con barra libre para siempre`, {
      cifra: regaladas.map((c) => c.plan).join(', '),
      porque:
        `${regaladas.map((c) => `${c.nombre} (alta el ${String(c.alta).slice(0, 10)})`).join(' · ')}. ` +
        `Activas, sin límite, sin caducidad y sin pasar por Stripe: ${clientes} cliente(s) que no ` +
        'facturan. Lo decidió la fecha de alta, no tú — es el injerto de la migración 0019.',
      hacer:
        'Decide si es un regalo que quieres hacer. Si no, es un UPDATE hablado con cada uno, que ' +
        'es como la propia 0019 dice que hay que hacerlo.',
      ancla: 'cuentas',
    });
  },

  /* ══ El dinero ═════════════════════════════════════════════════════════ */

  ({ cobros }) => {
    if (!cobros || cobros.total === 0) return null;

    const vencidos = cobros.proximos.filter((p) => p.faltan < 0);
    if (vencidos.length === 0) {
      if (cobros.pendientes === 0) {
        return d('bien', 'Ningún cobro pendiente entre los clientes de tus entrenadores', {
          cifra: `${cobros.total} cobros`,
          ancla: 'dinero',
        });
      }
      return d('vigilar', `${cobros.pendientes} cobro(s) pendientes de los clientes`, {
        cifra: cobros.moneda ? `${cobros.importePendiente} ${cobros.moneda}` : `${cobros.pendientes}`,
        porque:
          'No es dinero tuyo: es lo que cada entrenador le cobra a sus clientes a través del ' +
          'producto. Pero un entrenador que cobra por aquí no se va.',
        hacer: 'Míralo con ellos: un impago suyo es un cliente que se les está yendo.',
        ancla: 'dinero',
      });
    }

    return d('atender', `${vencidos.length} cobro(s) vencidos y sin pagar`, {
      cifra: cobros.moneda
        ? `${vencidos.reduce((t, p) => t + Number(p.amount || 0), 0)} ${cobros.moneda}`
        : String(vencidos.length),
      porque: `El más antiguo venció hace ${-vencidos[0].faltan} días.`,
      hacer: 'Son clientes de tus entrenadores. Si se les caen, se te cae el uso el mes que viene.',
      ancla: 'dinero',
    });
  },

  /* ══ Lo que dicen ══════════════════════════════════════════════════════ */

  ({ tickets = [] }) => {
    const abiertos = tickets.filter((t) => t.status !== 'closed');
    if (abiertos.length === 0) return null;

    return d('atender', `${abiertos.length} ticket(s) de soporte sin cerrar`, {
      cifra: String(abiertos.length),
      porque: abiertos.slice(0, 3).map((t) => `«${t.subject}»`).join(' · '),
      hacer: 'Alguien se paró a escribir. Es la información más cara que vas a recibir.',
      ancla: 'voz',
    });
  },

  ({ invitaciones: inv }) => {
    if (!inv || inv.creadas === 0 || inv.caducadas === 0) return null;

    return d('vigilar', `${inv.caducadas} invitación(es) al portal caducadas sin canjear`, {
      cifra: `${inv.canjeadas} de ${inv.creadas}`,
      porque: 'Un correo que nadie abrió. Es la mitad de la explicación de por qué casi nadie tiene portal.',
      hacer: 'Ficha del cliente → volver a mandar la invitación.',
      ancla: 'cuentas',
    });
  },

  /* ── Seguridad ─────────────────────────────────────────────────────────── */

  ({ seguridad, avisoSeguridad }) => {
    if (avisoSeguridad) {
      return d('atender', 'La seguridad no se ha podido comprobar', {
        porque:
          'La función de catálogo no ha respondido, así que este informe no afirma que ' +
          'todo esté bien: afirma que no se ha mirado.',
        hacer: 'Comprueba que las migraciones 0053 a 0055 están aplicadas.',
        ancla: 'seguridad',
      });
    }

    const nuevos = seguridad.filter((h) => h.nuevo && h.nivel !== 'info');
    if (nuevos.length > 0) {
      /* Uno basta. Es la única señal del informe que significa «algo cambió en
         la base desde la última vez», y ninguna cantidad la hace más urgente. */
      return d('atender', `${nuevos.length} hallazgo(s) de seguridad que ayer no estaban`, {
        cifra: String(nuevos.length),
        porque: nuevos.slice(0, 3).map((h) => `${h.objeto}: ${h.detalle}`).join(' · '),
        hacer: 'Míralos antes que nada: son lo único que ha cambiado.',
        ancla: 'seguridad',
      });
    }
    return null;
  },

  ({ seguridad, avisoSeguridad }) => {
    if (avisoSeguridad) return null;
    const criticos = seguridad.filter((h) => h.nivel === 'critico' && !h.aceptado);

    if (criticos.length === 0) {
      const revisados = seguridad.filter((h) => h.aceptado).length;
      return d('bien', 'Ningún hallazgo crítico de seguridad sin revisar', {
        cifra: '0',
        porque: revisados > 0 ? `${revisados} aceptado(s) con su motivo escrito.` : 'La lista está limpia.',
        ancla: 'seguridad',
      });
    }

    return d('atender', `${criticos.length} hallazgo(s) críticos de seguridad`, {
      cifra: String(criticos.length),
      porque: criticos.slice(0, 3).map((h) => `${h.objeto}: ${h.detalle}`).join(' · '),
      hacer: 'Arréglalos, o acéptalos en el panel con el motivo si son deliberados.',
      ancla: 'seguridad',
    });
  },

  /* ── El portal: media aplicación ───────────────────────────────────────── */

  ({ censo }) => {
    if (!censo || censo.clientes.total < 5) {
      /* Cinco fichas es lo mínimo para que un porcentaje no sea una anécdota:
         con cuatro, cada cliente mueve la cifra 25 puntos. */
      return null;
    }

    const { pct, cuantos } = censo.clientes.portal;
    if (pct >= 60) {
      return d('bien', 'La mayoría de los clientes tiene acceso a su portal', {
        cifra: `${pct} %`,
        ancla: 'censo',
      });
    }

    return d(pct < 30 ? 'atender' : 'vigilar', 'El portal no lo alcanza casi nadie', {
      cifra: `${pct} %`,
      porque:
        `Solo ${cuantos} de ${censo.clientes.total} clientes tienen su cuenta enlazada. ` +
        'El portal es la mitad del producto —rutina, dieta, check-ins y fotos del lado del ' +
        'cliente— y esa mitad no la está usando nadie.',
      hacer: 'Ficha del cliente → dar acceso al portal. Es el paso donde más gente se cae del embudo.',
      ancla: 'censo',
    });
  },

  /* ── La deuda con los clientes ─────────────────────────────────────────── */

  ({ censo }) => {
    if (!censo || censo.revision.entregados === 0) return null;

    const { sinContestar } = censo.revision;
    if (sinContestar === 0) {
      return d('bien', 'Ningún check-in entregado sin contestar', {
        cifra: '0',
        porque: `${censo.revision.revisados} de ${censo.revision.entregados} revisados.`,
        ancla: 'censo',
      });
    }

    /* Uno ya cuenta: es una persona concreta que entregó su peso y sus fotos
       hace más de una semana y no ha recibido respuesta. La semana es el umbral
       porque es la cadencia del producto. */
    return d('atender', `${sinContestar} check-in(s) sin contestar hace más de una semana`, {
      cifra: String(sinContestar),
      porque:
        'Alguien se pesó, se hizo las fotos y las entregó. Es la razón más común de que ' +
        'un cliente se vaya, y no se ve en ninguna pantalla del producto.',
      hacer: 'Hoy → bandeja de revisión.',
      ancla: 'censo',
    });
  },

  /* ── Campos que no usa nadie ───────────────────────────────────────────── */

  ({ censo }) => {
    if (!censo) return null;
    const { registros, pliegues, perimetros } = censo.antropometria;

    if (registros < MUESTRA_MINIMA_REGISTROS) {
      return d('sin_datos', 'Todavía no se puede decir qué medidas se usan', {
        cifra: `${registros} registros`,
        porque:
          `Con menos de ${MUESTRA_MINIMA_REGISTROS} pesajes, que un campo esté a cero puede ser ` +
          'casualidad. La pregunta sigue abierta.',
        ancla: 'censo',
      });
    }

    const sinUsar = [...pliegues.campos, ...perimetros.campos].filter((c) => c.veces === 0);
    if (sinUsar.length === 0) {
      return d('bien', 'Todos los campos de medidas se usan alguna vez', { ancla: 'censo' });
    }

    return d('vigilar', `${sinUsar.length} campos de medidas que no ha rellenado nadie nunca`, {
      cifra: String(sinUsar.length),
      porque: `Sobre ${registros} pesajes: ${sinUsar.map((c) => c.campo).join(', ')}.`,
      hacer: 'Quitarlos de la pantalla. Un formulario más corto se rellena más.',
      ancla: 'censo',
    });
  },

  /* ── El dato que bloquea otro dato ─────────────────────────────────────── */

  ({ censo }) => {
    if (!censo || censo.clientes.total < 5) return null;
    if (censo.clientes.conSexo >= 90) return null;

    /* El 90 % no es redondo por gusto: por debajo de ahí, la pantalla de
       composición corporal falla para más de uno de cada diez clientes, que ya
       es «falla» y no «un caso raro». */
    return d('vigilar', 'Faltan sexos, y sin ellos no sale el % graso', {
      cifra: `${censo.clientes.conSexo} %`,
      porque:
        'La fórmula de pliegues es distinta para hombres y mujeres ' +
        '(`domain/anthropometry.js`). A quien le falte el campo, se le toman las medidas y ' +
        'el resultado no aparece — y nadie relaciona una cosa con la otra.',
      hacer: 'Hacer el campo obligatorio al dar de alta, o rellenarlo en las fichas que falten.',
      ancla: 'censo',
    });
  },

  /* ── Lo que se rompe ───────────────────────────────────────────────────── */

  ({ fallos, ventanaDias }) => {
    /* Dos cuentas distintas. Es la frontera entre «a esta persona le pasa algo
       raro» y «el producto está roto», y está escrita también en el orden de la
       tabla de fallos. */
    const extendidos = fallos.filter((f) => f.cuentas >= 2);
    if (extendidos.length === 0) {
      if (fallos.length === 0) {
        return d('bien', 'Ningún fallo registrado', {
          cifra: '0',
          porque: `En los últimos ${ventanaDias} días.`,
          ancla: 'salud',
        });
      }
      return null;
    }

    const peor = extendidos[0];
    return d('atender', `${extendidos.length} fallo(s) que le pasan a más de una cuenta`, {
      cifra: String(extendidos.length),
      porque: `El peor: ${peor.message} (${peor.ruta}, ${peor.cuentas} cuentas, ${peor.veces} veces).`,
      hacer: 'Un fallo que le pasa a varias cuentas es del producto, no del usuario.',
      ancla: 'salud',
    });
  },

  /* ── El techo del modelo de datos ──────────────────────────────────────── */

  ({ volumen }) => {
    const programas = (volumen || []).find((v) => v.tabla === 'workout_data');
    if (!programas || programas.filas < 5) return null;

    const kb = Math.round(programas.bytes / programas.filas / 1024);
    /* Medio mega por fila. `auditoria.md` §1.4 dice «cuando empiece a doler»; el
       dolor concreto es que cada ráfaga de teclas con debounce reescribe la fila
       entera, así que medio mega por pulsación es donde deja de ser teórico. */
    if (kb < 500) {
      return d('bien', 'El JSONB de los programas todavía no aprieta', {
        cifra: `${kb} KB/fila`,
        porque: 'La decisión cara de `auditoria.md` §1.4 puede esperar.',
        ancla: 'salud',
      });
    }

    return d('vigilar', 'Los programas empiezan a pesar demasiado por fila', {
      cifra: `${kb} KB/fila`,
      porque:
        'Cada guardado reescribe `workout_data.microcycles` entero, así que eso es lo que ' +
        'mueve cada ráfaga de teclas.',
      hacer: 'Es el momento de normalizar a tablas: `auditoria.md` §1.4.',
      ancla: 'salud',
    });
  },

  /* ── Uso ───────────────────────────────────────────────────────────────── */

  ({ pantallas, eventos }) => {
    if (!pantallas || eventos.length === 0) return null;
    /* Tres. Una pantalla sin abrir puede ser una semana rara; tres a la vez es
       un patrón, y ya merece una decisión de producto. */
    if (pantallas.sinUso.length < 3) return null;

    return d('vigilar', `${pantallas.sinUso.length} pantallas que no ha abierto nadie`, {
      cifra: String(pantallas.sinUso.length),
      porque: pantallas.sinUso.join(', '),
      hacer: 'Candidatas a retirarse. Quitar una pantalla vale más que añadir dos.',
      ancla: 'uso',
    });
  },

  ({ eventos, actividad }) => {
    if (eventos.length === 0) {
      return d('sin_datos', 'No está llegando ni un evento de uso', {
        porque:
          'O la migración 0045 no está aplicada, o la versión desplegada todavía no ' +
          'instrumenta. Sin esto, «qué se usa» y la actividad semanal salen vacías.',
        hacer: 'Comprueba la 0045 y despliega el build actual.',
        ancla: 'uso',
      });
    }

    const semanas = (actividad || []).filter((a) => a.cuentas > 0);
    if (semanas.length < 2) return null;

    const ultima = semanas.at(-1).cuentas;
    const previa = semanas.at(-2).cuentas;
    /* La mitad. Una caída pequeña entre semanas es normal —vacaciones, una
       semana corta—; perder la mitad de las cuentas activas no lo es. */
    if (ultima >= previa / 2) return null;

    return d('atender', 'La actividad ha caído a menos de la mitad', {
      cifra: `${previa} → ${ultima}`,
      porque: 'Cuentas distintas que dieron señales de vida, semana contra semana.',
      hacer: 'Mira si coincide con un despliegue o con un fallo nuevo.',
      ancla: 'actividad',
    });
  },

  /* ── Negocio ───────────────────────────────────────────────────────────── */

  ({ negocio }) => {
    const pagando = (negocio || []).find((n) => n.estado === 'active');
    if (!pagando || pagando.cuentas < MUESTRA_MINIMA_CUENTAS) return null;
    if (pagando.pctActivas >= 60) return null;

    const dormidas = pagando.cuentas - pagando.activas;
    return d('atender', `${dormidas} cuenta(s) que pagan y no lo usan`, {
      cifra: `${pagando.pctActivas} %`,
      porque:
        'De las cuentas con la suscripción al día, ésas no han dado señales de vida en 28 ' +
        'días. Es una baja que todavía no ha ocurrido, y Stripe no la puede ver.',
      hacer: 'Escríbeles antes de que les llegue el siguiente cobro.',
      ancla: 'negocio',
    });
  },
];

/* ==========================================================================
   El veredicto
   ========================================================================== */

const PESO = { atender: 0, vigilar: 1, sin_datos: 2, bien: 3 };

/**
 * Todos los diagnósticos, ordenados por lo que hay que hacer primero.
 *
 * Devuelve también las buenas noticias y los «sin datos», y eso es
 * deliberado: un panel que solo enseña problemas no se distingue de uno que no
 * ha mirado, y no deja saber qué se ha comprobado. Van detrás, no delante.
 */
export const diagnosticar = (informe) => {
  const salida = [];
  for (const regla of REGLAS) {
    const r = regla(informe);
    if (r) salida.push(r);
  }
  return salida.sort((a, b) => PESO[a.gravedad] - PESO[b.gravedad]);
};

/** Cuántos hay de cada clase. Lo usa la portada. */
export const resumenDe = (diagnosticos) => ({
  atender: diagnosticos.filter((x) => x.gravedad === 'atender').length,
  vigilar: diagnosticos.filter((x) => x.gravedad === 'vigilar').length,
  bien: diagnosticos.filter((x) => x.gravedad === 'bien').length,
  sinDatos: diagnosticos.filter((x) => x.gravedad === 'sin_datos').length,
});
