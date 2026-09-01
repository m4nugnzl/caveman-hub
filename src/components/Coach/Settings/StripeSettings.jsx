import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  RefreshCw,
  UserPlus,
  Webhook,
} from 'lucide-react';

import { useActions } from '@/context/AppContext';
import { dateOnly, dateTime } from '@/lib/dates';
import { BrandMark } from '@/components/ui/BrandMark';
import { BotonAccion, Loading, Notice, Panel } from '@/components/ui/primitives';

/** Un paso con su estado, igual que en Notion: el orden aquí es obligado. */
const Step = ({ index, title, hint, done, children }) => (
  <section className={`step${done ? ' is-done' : ''}`}>
    <span className="step-mark">{done ? <Check size={13} /> : index}</span>
    <div className="step-body">
      <div className="step-head">
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </div>
  </section>
);

/**
 * Un valor largo que hay que llevarse a otra pestaña.
 *
 * La URL del webhook tiene 80 caracteres y un id de por medio: transcribirla a
 * mano es garantizar una errata que luego se manifiesta como «Stripe no avisa» sin
 * ninguna pista de por qué. Así que se copia, y se enseña para poder comprobarla.
 */
const Copyable = ({ value, label }) => {
  const [copied, setCopied] = useState(false);

  return (
    <div className="copyable">
      <code>{value}</code>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-label={`Copiar ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            // Se vuelve a «Copiar» solo: un botón que se queda en «Copiado»
            // para siempre deja de decir nada la segunda vez.
            setTimeout(() => setCopied(false), 1600);
          } catch {
            // Sin permiso de portapapeles (o sin HTTPS) queda seleccionable a
            // mano, que es justo para lo que está el texto a la vista.
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
};

/**
 * Los cuatro eventos que interesan. Cualquier otro se descarta.
 *
 * El de cobro correcto parece redundante junto al de cobro fallido, y es el que
 * LIMPIA la marca de impago: sin él, quien falló un mes y se arregló al siguiente
 * se queda como moroso para siempre.
 */
const EVENTS = [
  ['invoice.payment_failed', 'la tarjeta ha sido rechazada'],
  ['invoice.payment_succeeded', 'ha pagado — quita el aviso de impago'],
  ['customer.subscription.updated', 'cambio de estado o de renovación'],
  ['customer.subscription.deleted', 'se ha dado de baja'],
];

/**
 * Stripe.
 *
 * ── Qué aporta sobre Notion ─────────────────────────────────────────────────
 * Notion es un espejo de una tabla que mantienes a mano: si no apuntas un cobro, la
 * aplicación no lo sabe. Aquí el estado viene de quien cobra, y trae tres cosas que
 * no existen en una hoja escrita a mano: la tarjeta rechazada el día que se rechaza,
 * la baja en cuanto se pide, y la fecha real de la próxima renovación.
 *
 * ── Y casi no hay que conciliar ─────────────────────────────────────────────
 * Stripe identifica a cada cliente por EMAIL, no por un texto libre con su nombre.
 * El email es exacto: o coincide o no. Con Notion había que emparejar catorce
 * nombres a mano; aquí solo se pregunta por quien no tenga email en su ficha.
 */
export const StripeSettings = ({ onChanged }) => {
  const {
    loadIntegration,
    saveIntegration,
    setIntegrationToken,
    runStripe,
    setWebhookSecret,
    createClientFromExternal,
    reloadClients,
  } = useActions();

  const [ready, setReady] = useState(false);
  const [integration, setIntegration] = useState(null);
  const [hasKey, setHasKey] = useState(false);
  const [key, setKey] = useState('');
  const [hasHook, setHasHook] = useState(false);
  const [hookSecret, setHookSecret] = useState('');
  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [result, setResult] = useState(null);

  const refresh = async () => {
    const loaded = await loadIntegration('stripe');
    setReady(true);
    if (!loaded.ok) return;
    setIntegration(loaded.integration);
    setHasKey(loaded.hasToken);
    setHasHook(loaded.hasWebhook);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (label, promise) => {
    setBusy(label);
    setFeedback(null);
    const outcome = await promise;
    setBusy(null);
    if (!outcome.ok) setFeedback({ tone: 'error', text: outcome.error });
    return outcome;
  };

  const save = async () => {
    const outcome = await run(
      'save',
      saveIntegration({ id: integration?.id, provider: 'stripe', config: {}, label: 'Stripe' })
    );
    /* Devuelve si ha ido o no: es lo que decide si el botón confirma con un tic
       o vuelve a su sitio sin celebrar nada. Ver `BotonAccion`. */
    if (!outcome.ok) return false;

    if (key.trim()) {
      const stored = await run('save', setIntegrationToken(outcome.id, key.trim()));
      if (!stored.ok) return false;
      setKey('');
    }
    await refresh();
    onChanged?.();
    setFeedback({ tone: 'success', text: 'Guardado.' });
    return true;
  };

  const call = async (action) => {
    const outcome = await run(action, runStripe(integration.id, action));
    if (!outcome.ok) return;
    if (action === 'test') {
      setFeedback({ tone: 'success', text: 'Conectado con Stripe.' });
      return;
    }
    setResult(outcome);
    if (action === 'sync') await Promise.all([refresh(), reloadClients()]);
  };

  const saveHook = async () => {
    const outcome = await run('hook', setWebhookSecret(integration.id, hookSecret.trim()));
    if (!outcome.ok) return false;
    setHookSecret('');
    await refresh();
    setFeedback({ tone: 'success', text: 'Webhook configurado. Stripe ya puede avisar.' });
    return true;
  };

  if (!ready) {
    return (
      <Panel tight>
        <Loading />
      </Panel>
    );
  }

  const canRun = Boolean(integration?.id) && hasKey;

  const state = !hasKey
    ? { label: 'Sin conectar', tone: '' }
    : integration?.status === 'error'
      ? { label: 'Con errores', tone: 'badge-bad' }
      : integration?.lastSyncAt
        ? {
            label: `Sincronizado ${dateOnly(integration.lastSyncAt)}`,
            tone: 'badge-ok',
          }
        : { label: 'Conectado, sin sincronizar', tone: 'badge-info' };

  return (
    <div className="stack">
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
      {integration?.status === 'error' && integration.lastError && (
        <Notice tone="error">Última sincronización fallida: {integration.lastError}</Notice>
      )}

      <article className="integration">
        <header className="integration-head">
          <BrandMark brand="stripe" name="Stripe" size={30} />
          <div className="who">
            <span className="name">Stripe</span>
            <span className="sub">Suscripciones, cobros fallidos y bajas</span>
          </div>
          <span className={`badge ${state.tone}`}>
            {state.tone === 'badge-ok' && <Check size={11} />}
            {state.label}
          </span>
        </header>

        <div className="integration-body">
          <Step
            index={1}
            title="Pegar la clave"
            hint="Developers → API keys → Restricted key"
            done={hasKey}
          >
            <div className="row gap-2 wrap">
              <input
                type="password"
                className="input grow"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={hasKey ? '•••••••••• guardada' : 'rk_live_… o rk_test_…'}
                autoComplete="off"
                aria-label="Clave restringida de Stripe"
              />
              <a
                className="btn btn-secondary btn-sm"
                href="https://dashboard.stripe.com/apikeys"
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink size={13} /> Abrir Stripe
              </a>
            </div>

            {/*
              El aviso más importante de toda la integración: qué clave usar.
              La clave secreta completa puede EMITIR COBROS Y REEMBOLSOS. Esto solo
              lee, así que no hay ningún motivo para darle más. Con una restringida
              de lectura, una filtración expone datos; con la completa, mueve dinero.
            */}
            <Notice tone="warn">
              <strong>Usa una clave restringida</strong> (<code>rk_…</code>), no la secreta
              completa. Con permiso de <strong>lectura</strong> en Customers, Subscriptions e
              Invoices y nada más: esta integración solo lee. Una clave completa puede emitir cobros
              y reembolsos.
            </Notice>

            <p className="t-xs t-tertiary">
              <KeyRound size={11} className="icon-inline" /> Se guarda donde
              no la puede leer ni la aplicación: solo el servidor.
            </p>
          </Step>

          <Step index={2} title="Traer las suscripciones" hint="Se emparejan por email" done={Boolean(result)}>
            <p className="t-xs t-tertiary">
              Se leen todas las suscripciones, incluidas las canceladas y las impagadas — que son
              justo las que interesan. Cada una se asigna al cliente cuyo email coincida.
            </p>
          </Step>

          {/*
            Paso 3: el webhook.
            ------------------------------------------------------------------
            Es opcional y va al final a propósito: con los pasos 1 y 2 la
            integración ya funciona. Lo que añade es TIEMPO. «Sincronizar» hay que
            acordarse de pulsarlo, y el dato que más caduca —la tarjeta rechazada—
            deja de servir a los cinco días: enterarte entonces es enterarte
            cuando el cliente ya se ha ido.
          */}
          <Step
            index={3}
            title="Que Stripe avise solo"
            hint="Opcional, pero es lo que da tiempo de reaccionar"
            done={hasHook}
          >
            {integration?.id ? (
              <>
                <p className="t-xs t-tertiary">
                  En Stripe: <strong>Developers → Webhooks → Add endpoint</strong>. Pega esta URL —
                  lleva tu identificador al final, no la recortes:
                </p>

                <Copyable
                  label="la URL del webhook"
                  value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook?integration=${integration.id}`}
                />

                <p className="t-xs t-tertiary">Suscribe solo estos cuatro eventos:</p>
                <ul className="event-list">
                  {EVENTS.map(([name, why]) => (
                    <li key={name}>
                      <code>{name}</code> {why}
                    </li>
                  ))}
                </ul>

                <p className="t-xs t-tertiary">
                  Stripe te mostrará entonces un <strong>Signing secret</strong> (<code>whsec_…</code>
                  ). Pégalo aquí:
                </p>
                <div className="row gap-2 wrap">
                  <input
                    type="password"
                    className="input grow"
                    value={hookSecret}
                    onChange={(e) => setHookSecret(e.target.value)}
                    placeholder={hasHook ? '•••••••••• guardado' : 'whsec_…'}
                    autoComplete="off"
                    aria-label="Secreto de firma del webhook"
                  />
                  <BotonAccion
                    className="btn btn-secondary btn-sm"
                    icon={Webhook}
                    onClick={saveHook}
                    disabled={!hookSecret.trim()}
                  >
                    Guardar el secreto
                  </BotonAccion>
                </div>

                {/*
                  Por qué hace falta el secreto, dicho sin rodeos: es un endpoint
                  público y la firma es lo único que distingue un aviso de Stripe
                  de uno inventado. Sin ella, cualquiera podría marcar a un cliente
                  como pagado enviando un JSON.
                */}
                <p className="t-xs t-tertiary">
                  <KeyRound size={11} className="icon-inline" /> Es distinto
                  de la clave de API. Con él se comprueba la firma de cada aviso: sin firma válida,
                  no se procesa nada.
                </p>

                {hasHook &&
                  (integration.eventCount > 0 ? (
                    <Notice tone="success">
                      Está llegando: {integration.eventCount}{' '}
                      {integration.eventCount === 1 ? 'aviso recibido' : 'avisos recibidos'}
                      {integration.lastEventAt &&
                        `, el último el ${dateTime(integration.lastEventAt)}`}
                      .
                    </Notice>
                  ) : (
                    // Un webhook configurado y sin eventos es indistinguible de uno
                    // mal apuntado hasta que alguien lo prueba. Se dice cómo.
                    <Notice tone="info">
                      Configurado, pero todavía no ha llegado ningún aviso. Compruébalo con{' '}
                      <strong>Send test webhook</strong> desde Stripe: este contador tiene que subir.
                    </Notice>
                  ))}
              </>
            ) : (
              <p className="t-xs t-tertiary">
                Guarda primero la integración: la URL del webhook incluye su identificador.
              </p>
            )}
          </Step>
        </div>

        <footer className="integration-foot">
          <BotonAccion className="btn btn-primary btn-sm" onClick={save}>
            Guardar
          </BotonAccion>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => call('test')}
            disabled={!canRun || busy === 'test'}
          >
            <Link2 size={14} /> {busy === 'test' ? 'Probando…' : 'Probar la conexión'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => call('preview')}
            disabled={!canRun || busy === 'preview'}
          >
            {busy === 'preview' ? 'Calculando…' : 'Ver qué haría'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => call('sync')}
            disabled={!canRun || busy === 'sync'}
          >
            <RefreshCw size={14} /> {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        </footer>
      </article>

      {result && (
        <Panel className="col gap-4">
          <div className="tiles">
            <span className="tile" style={{ cursor: 'default' }}>
              <span className="k">Suscripciones</span>
              <span className="v">{result.total}</span>
              <span className="sub">en Stripe</span>
            </span>
            <span className="tile" style={{ cursor: 'default' }}>
              <span className="k">Asignadas</span>
              <span className="v" style={{ color: 'var(--positive)' }}>
                {result.matched}
              </span>
              <span className="sub">por email</span>
            </span>
            {/* Los dos datos que Notion no puede dar. */}
            <span className="tile" style={{ cursor: 'default' }}>
              <span className="k">Cobros fallidos</span>
              <span className="v" style={{ color: result.failing ? 'var(--negative)' : undefined }}>
                {result.failing ?? 0}
              </span>
              <span className="sub">tarjeta rechazada</span>
            </span>
            <span className="tile" style={{ cursor: 'default' }}>
              <span className="k">Bajas</span>
              <span className="v" style={{ color: result.canceled ? 'var(--warning)' : undefined }}>
                {result.canceled ?? 0}
              </span>
              <span className="sub">canceladas</span>
            </span>
          </div>

          {result.failing > 0 && (
            <Notice tone="warn">
              <AlertTriangle size={13} className="icon-inline" /> Hay{' '}
              {result.failing} {result.failing === 1 ? 'suscripción' : 'suscripciones'} con el último
              cobro rechazado. Esos clientes aparecen ya como pendientes en la cartera.
            </Notice>
          )}

          {result.unmatched?.length > 0 ? (
            <>
              <div className="col gap-1">
                <span className="section-label">Sin emparejar</span>
                <p className="t-xs t-tertiary">
                  Estos no tienen un cliente con el mismo email. Dales de alta, o pon su email en su
                  ficha y vuelve a sincronizar.
                </p>
              </div>

              <div className="col gap-2">
                {result.unmatched.map((label) => (
                  <div className="match-row" key={label}>
                    <span className="who">
                      <span className="name">{label}</span>
                      <span className="sub">sin cliente con ese email</span>
                    </span>
                    <button
                      type="button"
                      className="chip chip-dashed"
                      onClick={async () => {
                        const outcome = await createClientFromExternal({
                          integrationId: integration.id,
                          externalKey: String(label).trim().toLowerCase(),
                          externalLabel: label,
                        });
                        if (!outcome.ok) setFeedback({ tone: 'error', text: outcome.error });
                        else await call('sync');
                      }}
                    >
                      <UserPlus size={12} /> Dar de alta
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="t-sm t-secondary">Todas las suscripciones han encontrado su cliente.</p>
          )}
        </Panel>
      )}
    </div>
  );
};
