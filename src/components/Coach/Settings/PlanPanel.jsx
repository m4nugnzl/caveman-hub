import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Check, ExternalLink, Receipt } from 'lucide-react';

import { useActions, useSession } from '@/context/AppContext';
import { fmt, planAhorroPct, planPrice, storageLabel } from '@/lib/num';
import { supabase } from '@/lib/supabaseClient';
import { Loading, Notice, PageHead, Panel, SegmentedControl } from '@/components/ui/primitives';
import { useBilling } from './useBilling';

/**
 * Ajustes → Plan.
 *
 * ══ Por qué esta pantalla no son tres tarjetas con listas de ventajas ══════
 *
 * Porque no es así como se decide aquí. Lo que separa un plan de otro en esta
 * aplicación es UNA cosa —cuánta gente puedes llevar— y la decisión de cambiar no
 * la dispara comparar características: la dispara quedarse sin sitio en mitad de
 * un alta.
 *
 * Así que lo primero que se ve es tu número: cuántos clientes llevas y cuántos te
 * quedan. Los planes van debajo, como una escala en la que estás en un peldaño,
 * no como tres productos compitiendo. La cifra grande va en Archivo porque aquí
 * el dato ES el contenido, que es la regla de la fuente en este proyecto.
 *
 * ══ Lo que NO se guarda desde aquí ═════════════════════════════════════════
 *
 * Nada. Esta pantalla lee y manda a Stripe. Quien escribe el plan es el webhook,
 * cuando el cobro está confirmado: si contratar activara el plan al pulsar,
 * bastaría con abrir la pasarela y cerrar la pestaña.
 */
export const PlanPanel = () => {
  const { plan, team, teamMembers, myTeamRole, session } = useSession();
  const { refreshPlan } = useActions();

  /*
    Dueño de verdad, no dueño por defecto. Antes «sin rol» contaba como dueño
    para que las cuentas anteriores a la 0029 —sin fila de membresía— pudieran
    contratar; pero eso enseñaba el botón de pago a cualquiera cuyo rol aún no
    hubiera cargado (el servidor lo rechaza con un 403, que es peor sitio para
    enterarse). Sin rol, ahora decide `team.ownerId`: la cuenta legada sigue
    pudiendo, y el que no es dueño no ve un botón que no le funciona.
  */
  const esDueno = myTeamRole === 'owner' || (!myTeamRole && team?.ownerId === session?.user?.id);
  const { busy, error, contratar, abrirPortal } = useBilling();
  const [tiers, setTiers] = useState([]);
  const [anual, setAnual] = useState(false);
  const [params, setParams] = useSearchParams();
  /* Que la pasarela se abra sola UNA vez y no en cada render. Un `ref` y no
     estado: cambiarlo no tiene que repintar nada. */
  const yaLanzado = useRef(false);

  const pago = params.get('pago');
  /*
    ══ El plan que venía eligiendo desde la portada ═══════════════════════════

    Las tarjetas de pago de la página pública apuntan aquí con
    `?alta=1&contratar=pro`. Sin sesión, `App` enseña el formulario de acceso y
    **deja la ruta en la barra**; en cuanto la cuenta existe, la aplicación se
    monta sobre esa misma dirección y esta pantalla recibe el parámetro. No hace
    falta ninguna navegación después del alta: ya estaba escrita en el enlace.

    Por qué el destino es esta pantalla y no la pasarela directamente: cobrar
    exige que el EQUIPO exista —lo crea `ensure_my_team()` al arrancar la
    aplicación— y que quien llama sea su dueño. Mandando a Stripe antes de eso,
    lo que contesta es «no perteneces a ningún equipo». Aquí ya hay equipo, y si
    algo falta se ve un aviso en vez de un error.
  */
  const contratando = params.get('contratar');

  useEffect(() => {
    let alive = true;
    /*
      Lista explícita y NUNCA `select('*')`: desde la 0065 los permisos de
      `plan_limits` van POR COLUMNA (`GRANT SELECT (has_integrations)…`), y con
      privilegios por columna un `*` falla entero en cuanto el rol no puede leer
      una. Las cuatro últimas columnas llegan con 0064–0067; si alguna falta
      —migración sin aplicar— se reintenta con la lista de siempre y la pantalla
      se queda exactamente como estaba: cada rasgo solo se pinta si su columna
      trae dato.
    */
    const BASE =
      'plan, label, max_clients, price_cents, price_cents_year, currency, interval, blurb, purchasable, sort';
    (async () => {
      const ampliada = await supabase
        .from('plan_limits')
        .select(`${BASE}, max_seats, has_integrations, has_audit_log, max_storage_mb`)
        .order('sort');
      let { data } = ampliada;
      if (ampliada.error) ({ data } = await supabase.from('plan_limits').select(BASE).order('sort'));
      if (alive) setTiers(data || []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /*
    Al volver de pagar, el plan todavía puede ser el viejo: Stripe manda a la
    aplicación y avisa al webhook a la vez, así que hay unos segundos en los que
    la fila no ha cambiado. Sin esto, el usuario vuelve, ve su plan de siempre y
    da por hecho que el pago ha fallado.

    Tres intentos separados por dos segundos: suficiente para el caso normal, y si
    tarda más se le dice en lugar de dejarle mirando.
  */
  const poll = useCallback(
    async (attempt = 0) => {
      await refreshPlan();
      if (attempt < 2) setTimeout(() => poll(attempt + 1), 2000);
    },
    [refreshPlan]
  );

  useEffect(() => {
    if (!team) return;
    if (pago === 'ok' || pago === 'cambiado') poll();
    else refreshPlan();
  }, [team, pago, poll, refreshPlan]);

  /*
    Pedir un plan, por el camino que toque.

    Con una suscripción ya viva, la función NO abre la pasarela: modifica la
    suscripción en Stripe —que es lo único que prorratea— y vuelve aquí sin
    ninguna URL. Como no hay vuelta de Stripe que avise, la señal se deja en la
    barra de direcciones a mano: es la misma que deja el pago, así que el aviso y
    la espera al webhook que ya existen valen para los dos caminos sin duplicar
    nada. Y de paso limpia el `?contratar=` con el que se pudo llegar.
  */
  const pedirPlan = useCallback(
    async (nombre, periodo) => {
      const cambio = await contratar(nombre, periodo);
      if (!cambio?.cambiado) return;
      setParams({ pago: cambio.baja ? 'cambiado' : 'ok' }, { replace: true });
    },
    [contratar, setParams]
  );

  /*
    Y aquí se recoge esa intención. Todas las condiciones son «espera», no
    «cancela»: los planes y el equipo llegan por su cuenta y en el orden que
    quieran, así que este efecto se ejecuta varias veces y solo la última hace
    algo. Lo que NO puede pasar es que se ejecute dos veces la que hace algo,
    y de eso se encarga `yaLanzado`.

    Si el plan pedido no se puede contratar —no eres el dueño del equipo, ya lo
    tienes, o no existe— no salta nada y el aviso de abajo lo explica. Un enlace
    viejo con un plan retirado no puede acabar en un error de Stripe.
  */
  useEffect(() => {
    if (yaLanzado.current || !contratando || busy) return;
    if (!team || !plan) return;
    if (!esDueno) return;

    const tier = tiers.find((t) => t.plan === contratando);
    if (!tier || !tier.purchasable || tier.plan === plan.plan) return;

    yaLanzado.current = true;
    pedirPlan(tier.plan, params.get('periodo') === 'year' ? 'year' : 'month');
  }, [contratando, busy, team, plan, tiers, esDueno, pedirPlan, params]);

  if (!team) {
    return (
      <Header>
        <Notice tone="info">
          Todavía no tienes equipo. La suscripción va con el equipo, así que aparecerá aquí en
          cuanto exista. Si acabas de registrarte, vuelve a entrar dentro de un momento.
        </Notice>
      </Header>
    );
  }

  if (!plan) {
    return (
      <Header>
        {/*
          Mismo criterio que la pantalla de Equipo con la 0006: se dice qué falta,
          en vez de enseñar una pantalla vacía que parece correcta.
        */}
        <Notice tone="warn">
          Tu cuenta todavía no tiene plan asignado, así que no hay tope de clientes y la aplicación funciona con todo abierto. Escríbenos desde Ajustes → Ayuda para ponerla al día.
        </Notice>
      </Header>
    );
  }

  const { label, status, clients, maxClients, trialEndsAt, maxStorageMb, storageBytes } = plan;
  const quedan = maxClients === null ? null : Math.max(0, maxClients - clients);
  const pct = maxClients ? Math.min(100, Math.round((clients / maxClients) * 100)) : 100;
  const dias = trialEndsAt ? Math.ceil((new Date(trialEndsAt) - Date.now()) / 86400000) : null;

  /*
    Asientos: usados = miembros del equipo (SessionContext); tope = la fila del
    plan actual en la escala (0064, `max_seats` existe desde la 0019). Solo se
    enseña en planes con más de un asiento: en un plan individual «1 de 1,
    completo» sería ruido permanente sin decisión detrás.
  */
  const asientos = teamMembers?.length || 0;
  /** La fila del plan que tienes puesto: la referencia de toda la escala. */
  const miTier = tiers.find((t) => t.plan === plan.plan) || null;
  const maxSeats = miTier?.max_seats ?? null;
  const conAsientos = maxSeats != null && maxSeats > 1 && asientos > 0;

  /*
    ══ El peldaño que se señala, y por qué ═════════════════════════════════════

    El siguiente que se puede comprar hacia arriba. `tiers` llega ordenado por
    `sort`, así que «hacia arriba» es «después que el mío» y no hay que
    comparar precios —que no ordenarían bien un plan gratuito—.

    Solo se señala si de verdad AÑADE algo (`ventajasSobre`) y solo a quien
    puede contratarlo: recomendarle un cambio a quien no es dueño del equipo es
    mandarle a un botón que no existe.
  */
  const miIndice = tiers.findIndex((t) => t.plan === plan.plan);
  const candidato =
    esDueno && miIndice >= 0 ? tiers.find((t, i) => i > miIndice && t.purchasable) : null;
  const recomendado = candidato && ventajasSobre(candidato, miTier).length > 0 ? candidato : null;

  const aprieta = loQueAprieta({
    clients,
    maxClients,
    storageBytes,
    maxStorageMb,
    asientos,
    maxSeats,
    actual: miTier,
  });

  /*
    El ahorro se saca del plan más barato que lo tenga y se enseña una vez, junto
    al interruptor. Es el mismo en los tres —diez meses por doce—, así que
    repetirlo en cada tarjeta sería decir tres veces lo mismo; y calcularlo en
    vez de escribirlo hace que si algún día un plan lleva otro descuento, la
    frase no mienta: sale de los dos precios que hay en la fila.
  */
  const hayAnual = tiers.some((tier) => tier.price_cents_year);
  /* `ahorroPct` y no `pct` a secas: ese nombre ya es el del relleno de la barra
     de clientes, unas líneas más arriba. */
  const ahorroPct = planAhorroPct(tiers.find((tier) => tier.price_cents_year));
  /* Aquí sí cabe la frase entera: es una insignia al lado del carril y no una
     etiqueta dentro de un botón, que es lo que obliga a abreviar en la portada. */
  const ahorro = ahorroPct ? `Ahorra un ${ahorroPct} %` : null;

  /*
    Por qué venías, cuando no se puede hacer lo que venías a hacer. Solo se
    calcula con los planes ya cargados: mientras la lista está vacía, «ese plan
    no existe» sería verdad durante un instante y mentira después.
  */
  const avisoContratar = (() => {
    if (!contratando || yaLanzado.current || tiers.length === 0) return null;
    if (!esDueno) return 'La suscripción la gestiona quien creó el equipo: pídele que lo contrate.';

    const pedido = tiers.find((t) => t.plan === contratando);
    if (pedido && pedido.plan === plan.plan) return `Ya tienes el plan ${pedido.label}.`;
    if (!pedido || !pedido.purchasable)
      return 'Ese plan ya no se puede contratar. Elige uno de la lista de abajo.';
    return null; // Está todo en orden: la pasarela se abre sola.
  })();

  /*
    Quien viene a contratar algo no viene a mirar la escala de planes: viene a
    pagar. Enseñarle la lista entera durante el segundo que tarda la pasarela en
    contestar le pone delante justo la decisión que ya había tomado.

    Se sale de aquí por tres sitios y los tres están cubiertos: la pasarela se
    abre y esta pantalla desaparece con ella; falla, y entonces `busy` se suelta
    y abajo espera el aviso de error; o el plan pedido no se puede contratar, y
    `avisoContratar` lo dice en la pantalla normal.
  */
  if (contratando && !avisoContratar && (busy || !yaLanzado.current)) {
    return (
      <Header>
        <Panel>
          {/* La carga en línea del producto, con sus tres puntos, en vez de una
              frase quieta: aquí se está esperando a un tercero y hay que verse
              que algo pasa. */}
          <Loading label="Abriendo el pago…" />
        </Panel>
      </Header>
    );
  }

  return (
    <Header>
      {/*
        El mismo aviso para los dos finales buenos, con la única frase que cambia
        entre ellos. Una bajada de plan no cobra nada —lo que quedaba pagado se
        queda como saldo—, y decirlo aquí ahorra la pregunta de a dónde ha ido el
        dinero del mes que ya no se va a usar.
      */}
      {(pago === 'ok' || pago === 'cambiado') && (
        <Notice
          tone="success"
          action={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setParams({}, { replace: true })}
            >
              Entendido
            </button>
          }
        >
          {pago === 'ok'
            ? 'Pago recibido. Tu plan se actualiza en unos segundos; si no cambia, recarga la página.'
            : 'Plan cambiado. Lo que te quedaba pagado del anterior se descontará de tu próxima factura; el cambio se aplica en unos segundos.'}
        </Notice>
      )}

      {pago === 'cancelado' && (
        <Notice tone="info">Has salido sin pagar. Tu plan sigue como estaba.</Notice>
      )}

      {status === 'past_due' && (
        <Notice tone="error">
          Hay un recibo pendiente. No puedes dar de alta clientes nuevos hasta resolverlo; lo que ya
          tienes sigue intacto.
        </Notice>
      )}

      {status === 'trialing' && dias !== null && (
        <Notice tone={dias <= 3 ? 'warn' : 'info'}>
          {dias > 0
            ? `Te ${dias === 1 ? 'queda' : 'quedan'} ${dias} ${dias === 1 ? 'día' : 'días'} de prueba.`
            : 'La prueba ha terminado. Elige un plan para seguir dando de alta clientes.'}
        </Notice>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {avisoContratar && <Notice tone="info">{avisoContratar}</Notice>}

      {/* ── Tu número ────────────────────────────────────────────────────── */}
      <Panel className="plan-hero card-lumbre">
        {/*
          El rótulo del plan sube a cabecera del bloque. Estaba a la derecha en
          troquelada diminuta, compitiendo con la cifra por el mismo renglón: la
          identidad de la pantalla susurrada y el dato gritando. Arriba manda
          sobre lo que hay debajo, que es lo que es.

          Y al lado, el estado — cuando es uno que cambia lo que puedes hacer.
          Estaba solo en el aviso de arriba, y los avisos se cierran o se pasan
          por alto; el peldaño en el que estás tiene que decir también en qué
          situación está.
        */}
        <div className="plan-hero-head">
          <span className="section-label">Plan {label}</span>
          {ESTADOS[status] && (
            <span className={`badge ${ESTADOS[status].tone}`}>{ESTADOS[status].label}</span>
          )}
        </div>

        {/* La cifra y su unidad en la misma línea de base: el número solo, con
            la unidad debajo, dejaba una columna estrecha y medio bloque vacío a
            la derecha. */}
        <div className="plan-count-row">
          <span className="plan-count tnum">{clients}</span>
          <span className="plan-count-say">
            <span className="t-sm">
              {clients === 1 ? 'cliente en tu cartera' : 'clientes en tu cartera'}
            </span>
            <span className="t-xs t-tertiary">
              {quedan === null
                ? 'Sin tope de clientes'
                : quedan === 0
                  ? 'Has llegado al tope'
                  : `Te ${quedan === 1 ? 'queda' : 'quedan'} ${quedan} por dar de alta`}
            </span>
          </span>
        </div>

        <div
          className="plan-bar"
          role="progressbar"
          aria-valuenow={clients}
          aria-valuemin={0}
          aria-valuemax={maxClients || clients}
          aria-label="Clientes usados de tu plan"
        >
          <span
            className={`plan-bar-fill${quedan === 0 ? ' is-full' : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/*
          Los otros dos topes del plan, en voz más baja: la cifra que decide un
          cambio de plan sigue siendo la de clientes, con su barra grande, y
          asientos y disco informan sin competir con ella. Cada medidor solo
          aparece cuando su dato existe —sin la 0067 no hay `storageBytes`, y el
          de asientos solo interesa en planes con más de uno—.

          El del disco avisa cuando el tope está cerca, que es ANTES de que una
          foto de un cliente choque con él: el mensaje de ese choque no le dice
          al cliente por qué (a propósito), así que el único aviso con contexto
          es este. Lo usado va en la unidad del TOPE: «120 de 512 MB», «1,2 de
          10 GB» — mezclar unidades obligaría a convertir de cabeza justo cuando
          se está decidiendo si borrar o pagar.
        */}
        {(conAsientos || storageBytes != null) && (
          <div className="plan-meters">
            {conAsientos && (
              <div className="plan-meter">
                <span className="t-sm t-secondary row gap-2">
                  <span>
                    Equipo: <span className="tnum">{asientos}</span> de {maxSeats} asientos
                  </span>
                  {asientos >= maxSeats && <span className="badge badge-warn">Completo</span>}
                </span>
                <div
                  className="plan-bar"
                  role="progressbar"
                  aria-valuenow={asientos}
                  aria-valuemin={0}
                  aria-valuemax={maxSeats}
                  aria-label="Asientos usados de tu equipo"
                >
                  <span
                    className={`plan-bar-fill${asientos >= maxSeats ? ' is-full' : ''}`}
                    style={{ width: `${Math.min(100, Math.round((asientos / maxSeats) * 100))}%` }}
                  />
                </div>
              </div>
            )}

            {storageBytes != null && (
              <div className="plan-meter">
                <span className="t-sm t-secondary row gap-2">
                  <span>
                    Fotos y vídeo:{' '}
                    <span className="tnum">
                      {maxStorageMb === null || maxStorageMb >= 1024
                        ? fmt(storageBytes / GB, { decimals: 1 })
                        : fmt(storageBytes / MB)}
                    </span>
                    {maxStorageMb ? ` de ${storageLabel(maxStorageMb)}` : ' GB, sin tope'}
                  </span>
                  {cercaDelTope(storageBytes, maxStorageMb) && (
                    <span className="badge badge-warn">Casi lleno</span>
                  )}
                </span>
                {maxStorageMb != null && (
                  <div
                    className="plan-bar"
                    role="progressbar"
                    aria-valuenow={Math.round(storageBytes / MB)}
                    aria-valuemin={0}
                    aria-valuemax={maxStorageMb}
                    aria-label="Espacio usado de fotos y vídeo"
                  >
                    <span
                      className={`plan-bar-fill${cercaDelTope(storageBytes, maxStorageMb) ? ' is-full' : ''}`}
                      style={{
                        width: `${Math.min(100, Math.round((storageBytes / (maxStorageMb * MB)) * 100))}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* ── La escala ────────────────────────────────────────────────────── */}
      {/*
        Un solo bloque con peldaños, no una tarjeta por plan. Eran tres tarjetas
        sueltas separadas por 8 px, que es la forma de «tres productos
        compitiendo» que esta pantalla dice expresamente no querer: en columnas o
        en tarjetas, el ojo compara cajas: en una lista agrupada compara
        RENGLONES, que es lo que hace una escala.

        El interruptor de mes/año pasa a ser la cabecera de esa lista. Flotaba
        suelto entre el héroe y las tarjetas, sin bloque al que pertenecer, y lo
        que hace es cambiar la moneda de lo que viene debajo. Solo aparece si HAY
        algo que pagar por años: mientras la 0062 esté sin encender,
        `price_cents_year` es NULL en todas las filas y esta pantalla es la de
        siempre —un control que ofrece una opción que no existe es peor que no
        tenerlo—. Y va aquí y no dentro de cada plan porque la pregunta se
        contesta una vez y luego se comparan los peldaños ya en esa moneda.
      */}
      <div className="list">
        <div className="list-head">
          <span className="section-label">Tu escala</span>
          {hayAnual && (
            <div className="row gap-2 wrap">
              {ahorro && <span className="badge badge-ok">{ahorro}</span>}
              <SegmentedControl
                label="Cada cuánto pagas"
                value={anual ? 'year' : 'month'}
                onChange={(v) => setAnual(v === 'year')}
                options={[
                  { id: 'month', label: 'Al mes' },
                  { id: 'year', label: 'Al año' },
                ]}
              />
            </div>
          )}
        </div>

        {tiers
          // Los planes que no se venden solo se enseñan si es el tuyo: la escala es
          // para decidir, y un plan que nadie puede contratar no es una opción.
          .filter((tier) => tier.purchasable || tier.plan === plan.plan)
          .map((tier) => {
            const actual = tier.plan === plan.plan;
            const elegido = recomendado?.plan === tier.plan;
            /* En el tuyo no hay delta que contar: los rasgos absolutos ya los
               llevas puestos y los mide el héroe de arriba. */
            const gana = actual ? [] : ventajasSobre(tier, miTier);
            const nota = anual ? notaAnual(tier) : null;

            return (
              <div
                key={tier.plan}
                className={`plan-tier${actual ? ' is-current' : ''}${elegido ? ' is-pick' : ''}`}
              >
                <div className="plan-tier-main">
                  <div className="row gap-2 wrap">
                    <strong className="plan-tier-name">{tier.label}</strong>
                    {actual && (
                      <span className="badge badge-ok">
                        <Check size={11} /> Tu plan
                      </span>
                    )}
                    {elegido && <span className="plan-tag">Tu siguiente paso</span>}
                  </div>
                  <span className="t-sm t-secondary">{tier.blurb}</span>

                  {/*
                    Lo que este peldaño AÑADE sobre el tuyo, con palomas — la voz
                    de la tabla de precios de la portada, traída adentro. Antes
                    era la lista absoluta de sus rasgos separada por puntos, en
                    tinta terciaria: los tres peldaños repetían casi lo mismo y
                    había que cruzarlos a ojo para encontrar la única línea que
                    cambiaba, que es justo lo que se venía a saber.
                  */}
                  {gana.length > 0 && (
                    <ul className="plan-gain">
                      {gana.map((ventaja) => (
                        <li key={ventaja}>
                          <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                          {ventaja}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="plan-tier-cap t-sm">
                  {tier.max_clients === null ? 'Sin tope' : `Hasta ${tier.max_clients} clientes`}
                </div>

                <div className="plan-tier-buy">
                  <span className="plan-tier-money">
                    {/*
                      El `key` es el que hace que el precio se mueva al cambiar de
                      mes a año: React remonta el elemento y la animación del CSS
                      vuelve a correr. Sin él, tocar el interruptor repinta tres
                      cifras en silencio y hay que compararlas de memoria.
                    */}
                    <span className="plan-price tnum" key={anual ? 'year' : 'month'}>
                      {precio(tier, anual)}
                    </span>
                    {nota && <span className="plan-price-note">{nota}</span>}
                  </span>

                  {!actual && tier.purchasable && esDueno && (
                    <button
                      type="button"
                      /* El recomendado se lleva el botón sólido y de tamaño
                         entero. Todos iguales, la recomendación era una pastilla
                         de texto sin ninguna consecuencia en el gesto. */
                      className={elegido ? 'btn btn-primary' : 'btn btn-secondary btn-sm'}
                      disabled={Boolean(busy)}
                      /*
                        Se contrata lo que la tarjeta está enseñando: si este plan
                        no tiene anual, `precio` ya se cayó al mensual y el botón
                        tiene que hacer lo mismo o cobraría algo distinto de lo
                        que se acaba de leer.
                      */
                      onClick={() =>
                        pedirPlan(tier.plan, anual && tier.price_cents_year ? 'year' : 'month')
                      }
                    >
                      {busy === tier.plan
                        ? 'Abriendo…'
                        : elegido
                          ? `Pasar a ${tier.label}`
                          : 'Contratar'}
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>

                {/* Y por qué se te señala ESTE. Con algo que aprieta de verdad se
                    dice; sin nada que apriete no se inventa urgencia y la fila se
                    queda con su delta, que ya es el argumento. */}
                {elegido && aprieta && <p className="plan-tier-why">{aprieta}</p>}
              </div>
            );
          })}
      </div>

      {/*
        Lo que quita el miedo, que en una pantalla de pago pesa más que cualquier
        ventaja. Estaba al pie de la tabla de la portada —donde lo lee quien aún
        no ha pagado nada— y faltaba aquí, que es donde se pulsa el botón.
      */}
      <p className="plan-foot">
        Sin permanencia: se cambia y se cancela desde aquí, cuando quieras. Archivar a quien lo ha
        dejado no ocupa sitio en tu plan y conserva su historial entero. Y si algún día dejas de
        pagar, la cuenta pasa a solo lectura — leer, exportar y borrar no se bloquean nunca.
      </p>

      {/* Por qué no hay ningún botón de contratar. Era un párrafo en tinta
          terciaria debajo de la escala, o sea justo la voz que se salta quien
          está buscando el botón que no encuentra. */}
      {!esDueno && (
        <Notice tone="info">La suscripción la gestiona quien creó el equipo.</Notice>
      )}

      {/*
        ── Facturación ────────────────────────────────────────────────────
        Solo si hay cliente de Stripe. Antes la condición era «no está en
        prueba», y eso ofrecía el botón a equipos activos sin relación con
        Stripe —los injertados como `fundador`, por ejemplo—, que al pulsarlo
        recibían «todavía no hay ninguna suscripción que gestionar». Un botón que
        no debería haberse ofrecido enseña a desconfiar de la pantalla.

        `conFacturacion` es `null` mientras falte la 0026: entonces se usa el
        criterio viejo, que es lo que había.
      */}
      {esDueno && (plan.conFacturacion ?? plan.status !== 'trialing') && (
        <Panel className="row between wrap gap-3">
          <div className="row gap-3">
            <span className="day-icon">
              <Receipt size={18} />
            </span>
            <div className="col gap-1">
              <span className="section-title">Facturas, tarjeta y baja</span>
              <p className="t-sm t-secondary">
                Se gestionan en Stripe, que es donde están tus datos de pago.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(busy)}
            onClick={abrirPortal}
          >
            {busy === 'portal' ? 'Abriendo…' : 'Abrir facturación'}
            <ExternalLink size={14} />
          </button>
        </Panel>
      )}
    </Header>
  );
};

/** La cabecera es la misma en los tres estados de la pantalla. */
const Header = ({ children }) => (
  <div className="stack">
    <PageHead title="Suscripción" sub="Cuántos clientes llevas y hasta dónde llega tu plan." />
    {children}
  </div>
);

/*
  El precio lo formatea `planPrice` (lib/num.js). Se sacó de aquí cuando la
  portada pública pasó a enseñar los mismos importes: dos formatos distintos del
  mismo precio es la clase de incoherencia que solo acaba viendo el cliente.

  Aquí «sin precio» se dice «Incluido» —estás dentro, mirando tu plan— y en la
  portada «Gratis», que es lo que significa desde fuera.

  En anual, `planPrice` devuelve `null` si ese plan no tiene precio por años, y
  entonces se cae al mensual en vez de dejar el hueco: el interruptor de arriba
  es una preferencia de lectura, no una promesa de que todo se pueda pagar así.
*/
const precio = (tier, anual) => {
  if (!tier.price_cents) return 'Incluido';
  /*
    En anual se enseña MENSUALIZADO, que es la técnica de la portada y está
    razonada en `planPrice`: nadie tiene en la cabeza si 390 € al año son más o
    menos que 39 al mes, y sí sabe que 32,50 es menos que 39. El cargo real va
    debajo, en su línea, que es lo que esa función exige a cambio.
  */
  return (anual && planPrice(tier, { anual: true, mensualizado: true })) || planPrice(tier);
};

/** El cargo de verdad y lo que te ahorras. Solo en anual, y solo si lo tiene. */
const notaAnual = (tier) => {
  const total = planPrice(tier, { anual: true });
  if (!total) return null;
  const ahorro = ahorroEnDinero(tier);
  return ahorro ? `${total} · te ahorras ${ahorro}` : total;
};

const MB = 1048576;
const GB = 1073741824;

/*
  El estado de la suscripción, dicho en el propio peldaño.

  Solo los dos que CAMBIAN lo que puedes hacer. «Activo» no entra: es lo normal,
  y una insignia que sale siempre deja de significar nada —el nombre del plan ya
  dice que estás dentro—. Un estado desconocido tampoco pinta insignia: mejor
  nada que una palabra de Stripe sin traducir.
*/
const ESTADOS = {
  trialing: { label: 'En prueba', tone: 'badge-info' },
  past_due: { label: 'Recibo pendiente', tone: 'badge-bad' },
  canceled: { label: 'Cancelado', tone: 'badge-bad' },
  unpaid: { label: 'Sin pagar', tone: 'badge-bad' },
};

/*
  Los rasgos que separan un peldaño de otro, además del tope de clientes (que
  tiene su propia columna en la tarjeta). Cada uno solo existe si su columna
  trae dato, así que la escala funciona igual con la tarifa vieja y con la
  nueva. `false` no se enumera: la ausencia ya lo dice, y una lista de «esto
  no» convertiría la escala en un reproche.
*/
const rasgosDeTier = (tier) => {
  const rasgos = [];
  if (tier.max_seats != null && tier.max_seats > 1) rasgos.push(`${tier.max_seats} asientos`);
  if (tier.has_integrations) rasgos.push('Integraciones');
  if (tier.has_audit_log) rasgos.push('Registro de cambios');
  if (tier.max_storage_mb != null)
    rasgos.push(`${storageLabel(tier.max_storage_mb)} de fotos y vídeo`);
  return rasgos;
};

/**
 * Lo que un peldaño AÑADE sobre el que ya tienes.
 *
 * ══ Por qué el delta y no la lista entera ═══════════════════════════════════
 *
 * Porque la portada y esta pantalla no le hablan a la misma persona. Allí no se
 * sabe quién eres, así que cada tarjeta tiene que describirse entera; aquí se
 * sabe exactamente en qué peldaño estás, y repetir en los tres lo mismo obliga a
 * leer tres listas casi idénticas para encontrar la única línea que cambia.
 *
 * «Integraciones · 10 GB · 30 clientes más» ES el argumento. La lista completa
 * es el catálogo del que hay que extraerlo a mano.
 *
 * Sin plan actual conocido (una cuenta sin fila, la tarifa vieja) se cae a los
 * rasgos absolutos: sin referencia no hay diferencia que contar.
 */
const ventajasSobre = (tier, actual) => {
  if (!actual) return rasgosDeTier(tier);

  const gana = [];
  const sube = (valor, tope, sinTope, mas) => {
    if (valor === null && tope !== null) gana.push(sinTope);
    else if (valor != null && tope != null && valor > tope) gana.push(mas);
  };

  sube(
    tier.max_clients,
    actual.max_clients,
    'Clientes sin límite',
    `${tier.max_clients - actual.max_clients} clientes más`
  );
  sube(
    tier.max_seats,
    actual.max_seats,
    'Entrenadores sin límite',
    `${tier.max_seats} asientos de equipo`
  );
  if (tier.has_integrations && !actual.has_integrations) gana.push('Integraciones');
  if (tier.has_audit_log && !actual.has_audit_log) gana.push('Registro de cambios');
  sube(
    tier.max_storage_mb,
    actual.max_storage_mb,
    'Espacio sin límite',
    `${storageLabel(tier.max_storage_mb)} de fotos y vídeo`
  );

  return gana;
};

/**
 * Qué te está apretando AHORA, si es que algo lo hace.
 *
 * Es la única razón honesta para recomendar un cambio de plan desde dentro del
 * producto: no «mira lo bonito que es el de arriba», sino «esto que estás
 * usando se te queda corto, y lo sabes». Ordenada por urgencia real — el tope
 * de clientes rompe el siguiente alta; los demás avisan.
 *
 * Devuelve `null` cuando no aprieta nada, y entonces no se inventa urgencia: el
 * peldaño recomendado sigue señalado, pero argumentando lo que da en vez de lo
 * que falta.
 */
const loQueAprieta = ({ clients, maxClients, storageBytes, maxStorageMb, asientos, maxSeats, actual }) => {
  if (maxClients != null && clients >= maxClients) {
    return `Estás en el tope de ${maxClients} clientes: el siguiente alta no entra.`;
  }
  if (maxClients != null && clients / maxClients >= 0.8) {
    return `Vas por ${clients} de ${maxClients} clientes.`;
  }
  if (cercaDelTope(storageBytes, maxStorageMb)) {
    return 'Las fotos y el vídeo de tus clientes casi llenan tu espacio.';
  }
  if (maxSeats != null && maxSeats > 1 && asientos >= maxSeats) {
    return 'Tu equipo no tiene ningún asiento libre.';
  }
  /* `=== false` y no `!`: sin la 0065 la columna llega `undefined`, y eso es
     «no se sabe», no «no las tienes». */
  if (actual?.has_integrations === false) return 'Tu plan no incluye integraciones.';
  return null;
};

/**
 * Cuánto dinero te ahorras pagando por años, en euros y de este plan.
 *
 * El porcentaje ya estaba y es abstracto: «un 17 %» no se compara con nada que
 * uno tenga en la cabeza. «Te ahorras 78 €» sí. Se formatea con `planPrice`
 * —montando una fila de mentira con la diferencia— y no con un formateador
 * propio, porque dos formatos del mismo dinero es exactamente lo que ese
 * archivo existe para impedir.
 */
const ahorroEnDinero = (tier) => {
  if (!tier?.price_cents || !tier?.price_cents_year) return null;
  const diferencia = tier.price_cents * 12 - tier.price_cents_year;
  if (diferencia <= 0) return null;
  return planPrice({ price_cents: diferencia, currency: tier.currency }, { conPeriodo: false });
};

/*
  «Casi lleno» al 85 %: por debajo la cifra informa, por encima ya es cuestión
  de días —las fotos las suben los clientes solos— y conviene decirlo aquí,
  porque el mensaje del choque (0067) al cliente no le cuenta el porqué a
  propósito. Sin tope (`maxMb` nulo) nunca avisa: no hay nada que llenar.
*/
const cercaDelTope = (bytes, maxMb) => Boolean(maxMb) && bytes >= maxMb * MB * 0.85;
