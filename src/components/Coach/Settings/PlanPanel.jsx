import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Check, ExternalLink, Receipt } from 'lucide-react';

import { useActions, useSession } from '@/context/AppContext';
import { fmt, planAhorroPct, planPrice, storageLabel } from '@/lib/num';
import { supabase } from '@/lib/supabaseClient';
import { Notice, PageHead, Panel, SegmentedControl } from '@/components/ui/primitives';
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
  const { plan, team, myTeamRole } = useSession();
  const { refreshPlan } = useActions();
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
    supabase
      .from('plan_limits')
      .select(
        'plan, label, max_clients, price_cents, price_cents_year, currency, interval, blurb, purchasable, sort'
      )
      .order('sort')
      .then(({ data }) => {
        if (alive) setTiers(data || []);
      });
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
    if (pago === 'ok') poll();
    else refreshPlan();
  }, [team, pago, poll, refreshPlan]);

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
    if (!(myTeamRole === 'owner' || !myTeamRole)) return;

    const tier = tiers.find((t) => t.plan === contratando);
    if (!tier || !tier.purchasable || tier.plan === plan.plan) return;

    yaLanzado.current = true;
    contratar(tier.plan, params.get('periodo') === 'year' ? 'year' : 'month');
  }, [contratando, busy, team, plan, tiers, myTeamRole, contratar, params]);

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
  const esDueno = myTeamRole === 'owner' || !myTeamRole;

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
          <p className="t-sm t-secondary">Abriendo el pago…</p>
        </Panel>
      </Header>
    );
  }

  return (
    <Header>
      {pago === 'ok' && (
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
          Pago recibido. Tu plan se actualiza en unos segundos; si no cambia, recarga la página.
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
      <Panel className="plan-hero">
        <div className="plan-hero-head">
          <div className="col gap-1">
            <span className="plan-count tnum">{clients}</span>
            <span className="t-sm t-secondary">
              {clients === 1 ? 'cliente en tu cartera' : 'clientes en tu cartera'}
            </span>
          </div>

          <div className="plan-hero-side">
            <span className="section-label">Plan {label}</span>
            <span className="t-sm t-secondary">
              {quedan === null
                ? 'Sin tope de clientes'
                : quedan === 0
                  ? 'Has llegado al tope'
                  : `Te ${quedan === 1 ? 'queda' : 'quedan'} ${quedan} por dar de alta`}
            </span>
          </div>
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
          El disco, en una línea y no en otra barra: la cifra que decide un
          cambio de plan sigue siendo la de clientes, y dos barras en el mismo
          panel pelearían por ser la importante. Solo aparece con la 0067
          aplicada —`storageBytes` trae número— y avisa cuando el tope está
          cerca, que es ANTES de que una foto de un cliente choque con él: el
          mensaje de ese choque no le dice al cliente por qué (a propósito), así
          que el único aviso con contexto es este.
        */}
        {storageBytes != null && (
          <p className="t-sm t-secondary row gap-2">
            <span>
              {/* Lo usado, en la unidad del TOPE: «120 de 512 MB», «1,2 de 10 GB».
                  Mezclar unidades en la misma frase obligaría a convertir de
                  cabeza justo cuando se está decidiendo si borrar o pagar. */}
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
          </p>
        )}
      </Panel>

      {/* ── La escala ────────────────────────────────────────────────────── */}
      {/*
        El interruptor solo aparece si HAY algo que pagar por años. Mientras la
        0062 esté sin encender, `price_cents_year` es NULL en todas las filas y
        esta pantalla es exactamente la de antes: un control que ofrece una
        opción que no existe es peor que no tenerlo.

        Va encima de la escala y no dentro de cada plan porque la pregunta se
        contesta una vez —«¿pago por meses o por años?»— y luego se comparan los
        peldaños ya en esa moneda. Repetirlo por tarjeta obligaría a decidir tres
        veces lo mismo.
      */}
      {hayAnual && (
        <div className="row gap-2 wrap">
          <SegmentedControl
            label="Cada cuánto pagas"
            value={anual ? 'year' : 'month'}
            onChange={(v) => setAnual(v === 'year')}
            options={[
              { id: 'month', label: 'Al mes' },
              { id: 'year', label: 'Al año' },
            ]}
          />
          {ahorro && <span className="badge badge-ok">{ahorro}</span>}
        </div>
      )}

      <div className="col gap-2">
        {tiers
          // Los planes que no se venden solo se enseñan si es el tuyo: la escala es
          // para decidir, y un plan que nadie puede contratar no es una opción.
          .filter((tier) => tier.purchasable || tier.plan === plan.plan)
          .map((tier) => {
            const actual = tier.plan === plan.plan;
            return (
              <Panel key={tier.plan} className={`plan-tier${actual ? ' is-current' : ''}`}>
                <div className="plan-tier-main">
                  <div className="row gap-2">
                    <strong className="plan-tier-name">{tier.label}</strong>
                    {actual && (
                      <span className="badge badge-ok">
                        <Check size={11} /> Tu plan
                      </span>
                    )}
                  </div>
                  <span className="t-sm t-secondary">{tier.blurb}</span>
                </div>

                <div className="plan-tier-cap t-sm">
                  {tier.max_clients === null ? 'Sin tope' : `Hasta ${tier.max_clients} clientes`}
                </div>

                <div className="plan-tier-buy">
                  <span className="plan-price tnum">{precio(tier, anual)}</span>
                  {!actual && tier.purchasable && esDueno && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={Boolean(busy)}
                      /*
                        Se contrata lo que la tarjeta está enseñando: si este plan
                        no tiene anual, `precio` ya se cayó al mensual y el botón
                        tiene que hacer lo mismo o cobraría algo distinto de lo
                        que se acaba de leer.
                      */
                      onClick={() =>
                        contratar(tier.plan, anual && tier.price_cents_year ? 'year' : 'month')
                      }
                    >
                      {busy === tier.plan ? 'Abriendo…' : 'Contratar'}
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
              </Panel>
            );
          })}
      </div>

      {!esDueno && (
        <p className="t-sm t-tertiary">
          La suscripción la gestiona quien creó el equipo.
        </p>
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
    <PageHead title="Plan" sub="Cuántos clientes llevas y hasta dónde llega tu plan." />
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
  return (anual && planPrice(tier, { anual: true })) || planPrice(tier);
};

const MB = 1048576;
const GB = 1073741824;

/*
  «Casi lleno» al 85 %: por debajo la cifra informa, por encima ya es cuestión
  de días —las fotos las suben los clientes solos— y conviene decirlo aquí,
  porque el mensaje del choque (0067) al cliente no le cuenta el porqué a
  propósito. Sin tope (`maxMb` nulo) nunca avisa: no hay nada que llenar.
*/
const cercaDelTope = (bytes, maxMb) => Boolean(maxMb) && bytes >= maxMb * MB * 0.85;
