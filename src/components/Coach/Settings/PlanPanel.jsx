import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Check, ExternalLink, Receipt } from 'lucide-react';

import { useActions, useSession } from '@/context/AppContext';
import { localeNumber } from '@/lib/dates';
import { supabase } from '@/lib/supabaseClient';
import { Notice, Panel } from '@/components/ui/primitives';
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
  const [params, setParams] = useSearchParams();

  const pago = params.get('pago');

  useEffect(() => {
    let alive = true;
    supabase
      .from('plan_limits')
      .select('plan, label, max_clients, price_cents, currency, interval, blurb, purchasable, sort')
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

  if (!team) {
    return (
      <Header>
        <Notice tone="info">
          Todavía no tienes equipo. La suscripción es del equipo, así que aparecerá aquí en cuanto
          exista. Si acabas de aplicar las migraciones, vuelve a entrar.
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
          Falta aplicar <strong>0019_billing.sql</strong>. Hasta entonces no hay planes ni límites:
          la aplicación funciona como siempre, sin tope de clientes.
        </Notice>
      </Header>
    );
  }

  const { label, status, clients, maxClients, trialEndsAt } = plan;
  const quedan = maxClients === null ? null : Math.max(0, maxClients - clients);
  const pct = maxClients ? Math.min(100, Math.round((clients / maxClients) * 100)) : 100;
  const dias = trialEndsAt ? Math.ceil((new Date(trialEndsAt) - Date.now()) / 86400000) : null;
  const esDueno = myTeamRole === 'owner' || !myTeamRole;

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
      </Panel>

      {/* ── La escala ────────────────────────────────────────────────────── */}
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
                  <span className="plan-price tnum">{precio(tier)}</span>
                  {!actual && tier.purchasable && esDueno && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={Boolean(busy)}
                      onClick={() => contratar(tier.plan)}
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
    <div className="section-head">
      <div>
        <h2>Plan</h2>
        <p>Cuántos clientes llevas y hasta dónde llega tu plan.</p>
      </div>
    </div>
    {children}
  </div>
);

/**
 * «25 € al mes». Los céntimos solo se escriben si los hay: «25,00 €» en una lista
 * de precios redondos es ruido, y aquí lo único que se compara es la cifra.
 */
const precio = (tier) => {
  if (!tier.price_cents) return 'Incluido';

  const importe = localeNumber(tier.price_cents / 100, {
    style: 'currency',
    currency: (tier.currency || 'eur').toUpperCase(),
    minimumFractionDigits: tier.price_cents % 100 === 0 ? 0 : 2,
  });

  return `${importe} al ${tier.interval === 'year' ? 'año' : 'mes'}`;
};
