/**
 * Las cuentas, una por una y con su nombre.
 *
 * ══ Por qué esto sustituye a media herramienta ══════════════════════════════
 *
 * Las primeras versiones del informe agregaban: porcentajes, embudos, tasas de
 * retención. Eso es lo correcto cuando hay demasiadas cuentas para mirarlas una
 * a una — y aquí hay **cuatro**.
 *
 * A esta escala agregar no informa, esconde. «El 13 % de los clientes tiene
 * portal» son 2 de 15, y quien lo lee ya lo sabía. Lo que no sabía es CUÁL de
 * sus cuatro entrenadores no ha entrado desde hace tres días, a cuál se le acaba
 * la prueba el jueves y cuál lleva cinco tickets sin que nadie relacione una
 * cosa con la otra.
 *
 * Un porcentaje sobre cuatro no es una estadística: es una división que borra
 * los nombres.
 *
 * ══ Y por qué aquí SÍ van los nombres ═══════════════════════════════════════
 *
 * La regla de «sin datos personales» de las migraciones 0045 y 0052 protege a
 * los CLIENTES FINALES: las personas de las que esta aplicación guarda su peso,
 * sus pliegues y fotografías de su cuerpo. Esa regla sigue intacta y de aquí no
 * sale ni un dato suyo — solo recuentos.
 *
 * Los ENTRENADORES son otra cosa: son los clientes de pago del negocio, con una
 * relación comercial de por medio, y sus nombres y correos ya están en
 * `profiles` porque hacen falta para facturar y para contestarles un ticket. Un
 * informe local, privado y que nunca sale de la máquina de quien administra no
 * puede pretender llevar un negocio sin saber quién es quién.
 *
 * Aplicar aquí la regla del cliente final fue un error de las versiones
 * anteriores, y es la razón principal de que el informe no sirviera para nada.
 *
 * ══ El orden de la lista ════════════════════════════════════════════════════
 *
 * Por urgencia, no alfabético ni por antigüedad. Primero lo que tiene fecha de
 * caducidad —una prueba que acaba—, después lo que lleva más tiempo callado.
 * Una lista ordenada por nombre obliga a leerla entera cada vez.
 */

/**
 * Días de CALENDARIO entre dos fechas, no horas transcurridas divididas.
 *
 * ── Por qué importa la diferencia ───────────────────────────────────────────
 * Una prueba que acaba el día 20 a las 10:00, mirada el día 16 a las 12:00, son
 * 3,9 días de reloj. Dividir y redondear hacia abajo da «acaba en 3 días» y es
 * falso: acaba el jueves, que está a cuatro días del domingo, y así es como lo
 * va a contar quien lea el informe y quien reciba el correo.
 *
 * Con fechas negativas el problema es peor: `Math.floor(-6.5)` es −7, así que
 * una prueba caducada hace seis días saldría como siete. Comparando fechas de
 * calendario no hay redondeo que discutir.
 */
const dias = (desde, hasta) => {
  const a = Date.parse(String(desde).slice(0, 10));
  const b = Date.parse(String(hasta).slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
};

/**
 * «hace 2 días», «hoy», «nunca».
 *
 * En días y no con la fecha porque la pregunta nunca es «¿qué día entró?» sino
 * «¿cuánto lleva sin aparecer?», y responder eso con un `2026-08-14` obliga a
 * restar mentalmente en cada fila.
 */
export const hace = (fecha, hoy) => {
  if (!fecha) return { texto: 'nunca', dias: null };
  const d = dias(fecha, hoy);
  if (d === null) return { texto: '—', dias: null };
  if (d <= 0) return { texto: 'hoy', dias: 0 };
  if (d === 1) return { texto: 'ayer', dias: 1 };
  if (d < 30) return { texto: `hace ${d} días`, dias: d };
  return { texto: `hace ${Math.floor(d / 30)} meses`, dias: d };
};

/** Lo que queda para una fecha futura. Negativo si ya pasó. */
export const faltan = (fecha, hoy) => (fecha ? dias(hoy, fecha) : null);

/**
 * Una fila por cuenta, con todo lo que hace falta para decidir sobre ella.
 *
 * `sesiones` son las cuentas de `auth.users`: es de donde sale `last_sign_in_at`,
 * que es la mejor señal que existe de que una cuenta sigue viva y que ninguna
 * tabla de `public` puede dar.
 */
export const cuentasDe = ({
  equipos = [],
  miembros = [],
  perfiles = [],
  sesiones = [],
  suscripciones = [],
  clientes = [],
  programas = [],
  eventos = [],
  tickets = [],
  integraciones = [],
  admins = [],
  planes = [],
  hoy,
} = {}) => {
  const esAdmin = new Set(admins.map((a) => a.profile_id));
  const planPor = new Map(planes.map((p) => [p.plan, p]));

  /*
    ══ Los eventos huérfanos, recuperados ════════════════════════════════════

    Un 10 % de los eventos llega con `team_id` nulo. No es un fallo de la tabla:
    `lib/analytics.js` apunta con lo que sabe en ese momento, y al abrir la
    aplicación la sesión resuelve antes que el equipo — así que todo lo que pase
    en ese hueco se guarda a nombre de una persona y de ningún equipo.

    Descartarlos sería perder una de cada diez acciones **justo de los primeros
    minutos de cada sesión**, que es donde se ve si alguien entra y se va.

    Se recuperan aquí porque el dato no falta: `actor` siempre está, y a qué
    equipo pertenece esa persona lo dice `team_members`. Arreglarlo en el emisor
    —no apuntar hasta saber el equipo— perdería los eventos de verdad; esto los
    conserva y además funciona sobre los que ya están guardados.
  */
  const equipoDeActor = new Map(miembros.map((m) => [m.profile_id, m.team_id]));
  const equipoDe = (evento) => evento.team_id || equipoDeActor.get(evento.actor) || null;
  const perfilPor = new Map(perfiles.map((p) => [p.id, p]));
  const sesionPor = new Map(sesiones.map((u) => [u.id, u]));
  const susPor = new Map(suscripciones.map((s) => [s.team_id, s]));

  const semana = new Date(Date.parse(hoy) - 7 * 86400000).toISOString();
  const conMicrociclos = new Set(
    programas
      .filter((p) => Array.isArray(p.microcycles) && p.microcycles.length > 0)
      .map((p) => p.client_id)
  );

  const filas = equipos.map((equipo) => {
    const suyos = miembros.filter((m) => m.team_id === equipo.id);
    const dueño = perfilPor.get(equipo.owner_id) || null;
    const sus = susPor.get(equipo.id) || null;

    const susClientes = clientes.filter((c) => c.team_id === equipo.id);
    const activos = susClientes.filter((c) => c.status !== 'archived');
    const misEventos = eventos.filter((e) => equipoDe(e) === equipo.id);

    /*
      La última señal de vida de la CUENTA, no de una persona: en un equipo de
      cuatro, que uno entre significa que la cuenta está viva. Se toma la más
      reciente de sus miembros.
    */
    const ultimaEntrada = suyos
      .map((m) => sesionPor.get(m.profile_id)?.last_sign_in_at)
      .filter(Boolean)
      .sort()
      .pop();

    const ultimoEvento = misEventos.map((e) => e.at).sort().pop();

    /*
      ══ El pulso: catorce días, un valor por día ══════════════════════════════

      Una cifra —«45 acciones esta semana»— no distingue a quien trabaja todos
      los días de quien entró un martes, hizo cuarenta y cinco cosas de golpe y
      no ha vuelto. Y esas dos cuentas necesitan conversaciones opuestas.

      Catorce días porque es lo que dura el ciclo de trabajo del producto: dos
      check-ins semanales. Con siete, un entrenador que revisa los lunes se ve
      igual que uno que no aparece.

      Los días vacíos van con cero y NO se saltan: el hueco es el dato.
    */
    const dia = (iso) => String(iso).slice(0, 10);
    const hoyDia = dia(hoy);
    const pulso = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(Date.parse(`${hoyDia}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10);
      pulso.push({ dia: d, valor: misEventos.filter((e) => dia(e.at) === d).length });
    }

    return {
      id: equipo.id,
      equipo: equipo.name,
      /* Quien se registra sin poner su nombre se queda con el correo como
         etiqueta, y si tampoco hay, con el nombre del equipo. Un «(sin nombre)»
         en una lista de cuatro personas no identifica a nadie. */
      nombre: dueño?.full_name || dueño?.email || equipo.name || '(sin nombre)',
      correo: dueño?.email || '',
      alta: equipo.created_at,
      diasDeVida: dias(equipo.created_at, hoy),

      plan: sus?.plan || 'sin plan',
      /* La ETIQUETA, no la clave. La clave del plan gratuito sigue llamándose
         `prueba` por compatibilidad con el webhook de Stripe (migración 0056), y
         enseñarla diría lo contrario de lo que el plan hace. */
      planEtiqueta: planPor.get(sus?.plan)?.label || sus?.plan || 'sin plan',
      /* `null` es «sin límite», que es distinto de cero. */
      topeClientes: planPor.get(sus?.plan)?.max_clients ?? null,
      estado: sus?.status || 'sin suscripción',

      /* Tú mismo, según `platform_admins` (0034). Sin esto, la cuenta del dueño
         del producto aparece en cada lista de «cuentas que no van a pagar». */
      esTuya: esAdmin.has(equipo.owner_id),

      /*
        ══ Barra libre: gratis, para siempre y SIN TOPE ══════════════════════

        Las tres condiciones a la vez, y la tercera es la que importa desde que
        el plan de partida es gratuito (migración 0056).

        Sin ella, «activa y sin pasar por Stripe» describiría a TODAS las cuentas
        del plan gratis —que es el modelo, no un problema— y el aviso se
        dispararía con cada alta hasta que nadie lo mirase.

        Con `max_clients IS NULL` describe solo lo que de verdad es un accidente:
        el injerto de la 0019, que al activar la facturación metió en `fundador`
        —ilimitado, activo y sin caducidad— a todos los equipos que existían ese
        día. No fue una decisión por cuenta: fue la fecha en la que se registró.

        Se mira el TOPE y no el nombre del plan a propósito. «Fundador» se lee
        como «el fundador del producto» y significa «ya estabas dentro»; mañana
        puede llamarse de otra manera y esto seguirá siendo correcto.
      */
      facturable: Boolean(sus?.stripe_customer_id || sus?.current_period_end),
      gratisIndefinido:
        sus?.status === 'active' &&
        !sus?.stripe_customer_id &&
        !sus?.current_period_end &&
        (planPor.get(sus?.plan)?.max_clients ?? null) === null,
      /* Lo único de toda la herramienta con fecha de caducidad. Va delante de
         todo lo demás porque después de ese día ya no se puede hacer nada. */
      pruebaAcaba: sus?.trial_ends_at || null,
      diasDePrueba: faltan(sus?.trial_ends_at, hoy),
      cobroAcaba: sus?.current_period_end || null,

      personas: suyos.length,
      clientes: activos.length,
      archivados: susClientes.length - activos.length,
      conPortal: susClientes.filter((c) => c.client_profile_id).length,
      conPrograma: susClientes.filter((c) => conMicrociclos.has(c.id)).length,

      entrada: hace(ultimaEntrada, hoy),
      ultimoEvento: hace(ultimoEvento, hoy),
      accionesSemana: misEventos.filter((e) => e.at >= semana).length,
      pulso,
      /* Días distintos con actividad, de los catorce. Separa «trabaja aquí» de
         «entró una vez e hizo mucho»: cuarenta acciones repartidas en ocho días
         y cuarenta en uno solo son la misma cifra y cuentas opuestas. */
      diasActivos: pulso.filter((p) => p.valor > 0).length,

      tickets: tickets.filter((t) => t.team_id === equipo.id).length,
      ticketsAbiertos: tickets.filter((t) => t.team_id === equipo.id && t.status !== 'closed').length,
      integraciones: integraciones
        .filter((i) => i.team_id === equipo.id)
        .map((i) => i.provider),
    };
  });

  /*
    Por urgencia. Lo que caduca primero, después lo que lleva más tiempo callado.
    Alfabético obligaría a leer la lista entera todas las veces.
  */
  return filas.sort((a, b) => {
    const ca = a.diasDePrueba ?? Infinity;
    const cb = b.diasDePrueba ?? Infinity;
    if (ca !== cb) return ca - cb;
    return (b.entrada.dias ?? 9999) - (a.entrada.dias ?? 9999);
  });
};

/**
 * Las que están en riesgo, y por qué motivo exactamente.
 *
 * El motivo se guarda como texto y no como una bandera booleana porque una
 * cuenta puede estar en riesgo por dos cosas a la vez, y «en riesgo» sin decir
 * de qué no se puede accionar.
 */
export const enRiesgo = (cuentas, { silencioDias = 7 } = {}) =>
  cuentas
    .map((c) => {
      const motivos = [];

      /* Una semana sin entrar. Es la cadencia del producto —el check-in es
         semanal—, así que quien se salta una semana entera se ha saltado el
         ciclo completo de trabajo, no un día flojo. */
      if ((c.entrada.dias ?? 9999) >= silencioDias) {
        motivos.push(`sin entrar ${c.entrada.texto}`);
      }
      if (c.diasDePrueba !== null && c.diasDePrueba >= 0 && c.diasDePrueba <= 14) {
        motivos.push(`la prueba acaba en ${c.diasDePrueba} día${c.diasDePrueba === 1 ? '' : 's'}`);
      }
      if (c.diasDePrueba !== null && c.diasDePrueba < 0) {
        motivos.push(`la prueba caducó hace ${-c.diasDePrueba} días y no ha pasado a pago`);
      }
      if (c.estado === 'past_due') motivos.push('el cobro ha fallado');
      if (c.estado === 'canceled') motivos.push('ha cancelado');
      /* Dado de alta hace más de tres días y sin un solo cliente: no ha llegado
         a empezar, y ése es el momento en que se abandona un producto. */
      if (c.clientes === 0 && (c.diasDeVida ?? 0) > 3) motivos.push('nunca ha dado de alta un cliente');

      return { ...c, motivos };
    })
    .filter((c) => c.motivos.length > 0);
