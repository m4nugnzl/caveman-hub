import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';

import { useActions, useSession } from '@/context/AppContext';
import { supabase } from '@/lib/supabaseClient';
import { PROVIDERS, providerById } from '@/domain/integrations';
import { BrandMark } from '@/components/ui/BrandMark';
import { Notice, PageHead, Panel } from '@/components/ui/primitives';
import { NotionSettings } from './NotionSettings';
import { StripeSettings } from './StripeSettings';

/** Una tarjeta del catálogo. */
const ProviderCard = ({ provider, connected, onOpen }) => (
  <article className={`provider${provider.status === 'planned' ? ' is-planned' : ''}`}>
    {provider.status !== 'planned' && (
      <button
        type="button"
        className="provider-hit"
        onClick={onOpen}
        aria-label={`Configurar ${provider.name}`}
      />
    )}

    <header className="provider-head">
      <BrandMark brand={provider.id} name={provider.name} size={26} />
      <span className="who">
        <span className="name">{provider.name}</span>
        <span className="sub">{provider.category}</span>
      </span>
      {provider.status === 'planned' ? (
        <span className="badge">Pronto</span>
      ) : connected ? (
        <span className="badge badge-ok">
          <Check size={11} /> Conectado
        </span>
      ) : (
        <span className="badge badge-info">Disponible</span>
      )}
    </header>

    <p className="provider-what">{provider.tagline}</p>
  </article>
);

/**
 * Catálogo de integraciones.
 *
 * ── Por qué un catálogo ─────────────────────────────────────────────────────
 * Con una sola integración una pantalla dedicada parece razonable; con tres es un
 * laberinto. El catálogo es cómo lo resuelve cualquier aplicación con extensiones:
 * una rejilla con lo que hay, cada cosa con su logotipo y su estado, y la
 * configuración DENTRO de cada una. Añadir un servicio pasa a ser una entrada en
 * `PROVIDERS`.
 *
 * Lo que todavía no está se muestra igualmente, marcado como «Pronto» y diciendo
 * qué le falta. Es más honesto que aparecer de la nada un día, y de paso el
 * entrenador sabe si merece la pena esperar o montar lo que hay.
 */
export const IntegrationsCatalogue = () => {
  const { loadIntegration } = useActions();
  const { plan } = useSession();
  const [open, setOpen] = useState(null);
  const [connected, setConnected] = useState({});
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);

  /*
    ¿El plan incluye integraciones? (migración 0065)
    --------------------------------------------------------------------------
    Quien lo IMPONE es un disparador de Postgres; lo que hace esta consulta es
    que la pantalla lo EXPLIQUE antes de que alguien haga el trabajo — sin esto,
    una cuenta Gratis rellenaba el formulario entero de Notion, token incluido,
    y se enteraba del capado al pulsar guardar, que es el peor momento.

    `null` significa «sin dato» —columna sin migrar, cuenta sin plan— y entonces
    no se capa nada desde aquí: la última palabra la tiene la base, como siempre.
  */
  const [conIntegraciones, setConIntegraciones] = useState(null);
  useEffect(() => {
    if (!plan?.plan) return;
    let alive = true;
    supabase
      .from('plan_limits')
      .select('has_integrations')
      .eq('plan', plan.plan)
      .maybeSingle()
      .then(({ data, error }) => {
        if (alive && !error) setConIntegraciones(data?.has_integrations ?? null);
      });
    return () => {
      alive = false;
    };
  }, [plan?.plan]);
  const capado = conIntegraciones === false;

  /** Qué proveedores están conectados. Se pregunta por todos, no solo por Notion. */
  const loadConnected = useCallback(async () => {
    const results = await Promise.all(PROVIDERS.map((p) => loadIntegration(p.id)));
    setUnavailable(results.some((r) => !r.ok));
    setConnected(
      Object.fromEntries(PROVIDERS.map((p, i) => [p.id, Boolean(results[i].hasToken)]))
    );
    setReady(true);
  }, [loadIntegration]);

  useEffect(() => {
    loadConnected();
  }, [loadConnected]);

  // Cada proveedor tiene su pantalla; el catálogo solo decide cuál abre.
  const DETAIL = { notion: NotionSettings, stripe: StripeSettings };
  const Detail = DETAIL[open];

  if (Detail) {
    /*
      Una integración YA conectada se abre siempre: el capado de la 0065 solo
      bloquea crear una nueva, y a quien la tenía de antes no se le quita ni el
      uso ni la configuración. Lo que no se enseña es el formulario de conectar
      a quien su plan no le va a dejar guardarlo.
    */
    const bloqueado = capado && !connected[open];
    return (
      <div className="col gap-4">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setOpen(null)}
        >
          <ArrowLeft size={14} /> Integraciones
        </button>
        {bloqueado ? (
          <Panel className="col gap-3">
            <div className="row gap-3">
              <BrandMark brand={open} name={providerById(open)?.name || open} size={26} />
              <div>
                <span className="section-title">{providerById(open)?.name}</span>
                <p className="t-sm t-secondary">{providerById(open)?.tagline}</p>
              </div>
            </div>
            <p className="t-sm">
              El plan {plan?.label || 'actual'} no incluye integraciones, así que conectarla no se
              podría guardar. Antes de crear el token, amplía tu plan: un minuto y vuelves aquí.
            </p>
            <Link className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} to="/ajustes/plan">
              Ver planes
            </Link>
          </Panel>
        ) : (
          <Detail onChanged={loadConnected} />
        )}
      </div>
    );
  }

  const detail = open ? providerById(open) : null;

  return (
    <div className="stack">
      <PageHead
        title="Integraciones"
        sub="Conecta lo que ya usas para no llevar la misma información en dos sitios."
      />

      <Panel className="col gap-4">

        {unavailable && ready && (
          <Notice tone="info">
            Las integraciones todavía no están activas en tu cuenta: puedes ver qué hay, pero no conectar nada. Escríbenos desde Ajustes → Ayuda y las activamos.
          </Notice>
        )}

        {/* El capado del plan, dicho AQUÍ y no al final del formulario (0065):
            quien va a chocar con él debe saberlo antes de crear ningún token. */}
        {capado && !unavailable && (
          <Notice tone="info">
            El plan {plan?.label || 'actual'} no incluye integraciones. Puedes ver qué hay; para
            conectarlas, <Link to="/ajustes/plan">cambia de plan</Link>.
          </Notice>
        )}

        <div className="provider-grid">
          {PROVIDERS.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              connected={connected[provider.id]}
              onOpen={() => setOpen(provider.id)}
            />
          ))}
        </div>
      </Panel>

      {/* El detalle de lo que aún no está: qué haría y qué le falta. Prometer una
          fecha sería peor que explicar el trabajo pendiente. */}
      {detail?.status === 'planned' && (
        <Panel className="col gap-3">
          <div className="row gap-3">
            <BrandMark brand={detail.id} name={detail.name} size={26} />
            <div>
              <span className="section-title">{detail.name}</span>
              <p className="t-sm t-secondary">{detail.tagline}</p>
            </div>
          </div>
          <p className="t-sm">{detail.what}</p>
          {detail.why && (
            <p className="t-sm t-secondary">
              <strong>Qué falta:</strong> {detail.why}
            </p>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setOpen(null)}
          >
            <ArrowLeft size={14} /> Volver
          </button>
        </Panel>
      )}
    </div>
  );
};
