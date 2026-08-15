import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Plug } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import { PROVIDERS, providerById } from '@/domain/integrations';
import { BrandMark } from '@/components/ui/BrandMark';
import { Notice, Panel, SectionTitle } from '@/components/ui/primitives';
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
  const [open, setOpen] = useState(null);
  const [connected, setConnected] = useState({});
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);

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
        <Detail onChanged={loadConnected} />
      </div>
    );
  }

  const detail = open ? providerById(open) : null;

  return (
    <div className="col gap-4">
      <Panel className="col gap-4">
        <SectionTitle icon={Plug}>
          Integraciones
        </SectionTitle>
        <p className="t-sm t-secondary">
          Conecta lo que ya usas para no llevar la misma información en dos sitios.
        </p>

        {unavailable && ready && (
          <Notice tone="info">
            Falta aplicar <code>0010_integrations.sql</code> y desplegar la función{' '}
            <code>notion-payments</code>. Hasta entonces puedes ver el catálogo pero no conectar
            nada.
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
