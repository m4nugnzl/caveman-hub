import { useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Link2,
  Plug,
  RefreshCw,
  Table2,
  UserPlus,
  Users,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  NOTION_FIELDS,
  configIssues,
  defaultNotionConfig,
  matchCandidates,
  nameKey,
  notionDatabaseId,
} from '@/domain/integrations';
import { BrandMark } from '@/components/ui/BrandMark';
import { EmptyState, Notice, Panel } from '@/components/ui/primitives';

/**
 * Un paso del proceso, con su estado.
 *
 * ── Por qué en pasos ────────────────────────────────────────────────────────
 * Conectar Notion tiene un orden obligado —sin token no se puede leer la base, y
 * sin leer la base no se sabe cómo se llaman sus columnas— y antes eso era un
 * formulario plano donde todo parecía opcional y simultáneo. Numerar los pasos y
 * marcar los cumplidos convierte «rellena esto» en «vas por aquí».
 */
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
 * Un nombre de Notion que no cuadra con ningún cliente.
 *
 * ── Por qué se pregunta en vez de acertar ───────────────────────────────────
 * Con dos clientes de nombre parecido, elegir automáticamente coloca un pago en la
 * persona equivocada y **no da ningún error**: te enterarías meses después, o
 * nunca. Se proponen candidatos ordenados y decides tú. Solo una vez por nombre: la
 * respuesta se guarda y no se vuelve a preguntar.
 */
const UnmatchedRow = ({ label, clients, onLink, onCreate }) => {
  const [busy, setBusy] = useState(false);
  const candidates = matchCandidates(label, clients);

  const act = async (fn) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <div className="match-row">
      <span className="who">
        <span className="name">{label}</span>
        <span className="sub">
          {candidates.length === 0 ? 'No está en tu cartera' : 'Elige a quién corresponde'}
        </span>
      </span>

      <div className="rail-wrap">
        {candidates.map((match) => (
          <button
            key={match.client.id}
            type="button"
            className="chip"
            disabled={busy}
            title={match.reason}
            onClick={() =>
              act(() =>
                onLink({
                  externalKey: nameKey(label),
                  externalLabel: label,
                  clientId: match.client.id,
                })
              )
            }
          >
            {match.client.name}
          </button>
        ))}

        {/*
          Dar de alta desde aquí es lo que hace útil la integración.
          --------------------------------------------------------------------
          El caso real es que el entrenador lleva años cobrando en Notion y su
          cartera entera está ahí, mientras que en la aplicación no hay nadie. Sin
          esto la pantalla enseñaba catorce nombres seguidos con «¿Está dado de
          alta en Clientes?» y ninguna forma de darlos de alta: informaba de un
          problema y no ofrecía la solución.
        */}
        <button
          type="button"
          className="chip chip-dashed"
          disabled={busy}
          title={`Crear a ${label} como cliente y asignarle este pago`}
          onClick={() =>
            act(() => onCreate({ externalKey: nameKey(label), externalLabel: label }))
          }
        >
          <UserPlus size={12} /> Dar de alta
        </button>
      </div>
    </div>
  );
};

/**
 * Integraciones.
 *
 * ── Cómo está pensado ───────────────────────────────────────────────────────
 * Genérico desde el principio: tú dices **cuál es tu base** y **cómo se llaman tus
 * columnas**. Nada está fijado a un Notion concreto, así que otro entrenador
 * conecta el suyo sin tocar código.
 *
 * La pantalla es una tarjeta por servicio con su marca, y dentro los pasos en el
 * orden en que hay que darlos. Antes era un formulario plano de ocho campos donde no
 * se sabía por dónde empezar ni si faltaba algo.
 */
export const NotionSettings = ({ onChanged }) => {
  const {
    clients,
    loadIntegration,
    saveIntegration,
    setIntegrationToken,
    runIntegration,
    linkExternalName,
    createClientFromExternal,
    reloadClients,
  } = useApp();

  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [integration, setIntegration] = useState(null);
  const [hasToken, setHasToken] = useState(false);
  const [config, setConfig] = useState(defaultNotionConfig);
  const [token, setToken] = useState('');
  const [columns, setColumns] = useState([]);
  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [result, setResult] = useState(null);

  const refresh = async () => {
    const loaded = await loadIntegration('notion');
    setUnavailable(!loaded.ok);
    setReady(true);
    if (!loaded.ok) return;
    setIntegration(loaded.integration);
    setHasToken(loaded.hasToken);
    if (loaded.integration) setConfig({ ...defaultNotionConfig(), ...loaded.integration.config });
  };

  useEffect(() => {
    refresh();
    // Solo al montar: recargar en cada render pisaría lo que estés escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setProp = (key, value) =>
    setConfig((prev) => ({ ...prev, props: { ...prev.props, [key]: value } }));

  const run = async (label, promise) => {
    setBusy(label);
    setFeedback(null);
    const outcome = await promise;
    setBusy(null);
    if (!outcome.ok) setFeedback({ tone: 'error', text: outcome.error });
    return outcome;
  };

  const save = async () => {
    // El id se normaliza al guardar: se pega la URL entera y se queda lo que vale.
    const clean = { ...config, databaseId: notionDatabaseId(config.databaseId) || config.databaseId };
    const outcome = await run('save', saveIntegration({ id: integration?.id, config: clean, label: 'Notion' }));
    if (!outcome.ok) return;

    if (token.trim()) {
      const stored = await run('save', setIntegrationToken(outcome.id, token.trim()));
      if (!stored.ok) return;
      setToken('');
    }
    setConfig(clean);
    await refresh();
    onChanged?.();
    setFeedback({ tone: 'success', text: 'Guardado.' });
  };

  const test = async () => {
    const outcome = await run('test', runIntegration(integration.id, 'test'));
    if (!outcome.ok) return;
    setColumns(outcome.properties || []);
    setFeedback({
      tone: 'success',
      text: `Conectado: ${outcome.rows} filas y ${outcome.properties?.length || 0} columnas.`,
    });
  };

  /** Conciliar y volver a sincronizar: el pago queda asignado en el mismo gesto. */
  const reconcile = async (action, payload) => {
    const outcome = await action({ integrationId: integration.id, ...payload });
    if (!outcome.ok) setFeedback({ tone: 'error', text: outcome.error });
    else await sync('sync');
  };

  const sync = async (action) => {
    const outcome = await run(action, runIntegration(integration.id, action));
    if (!outcome.ok) return;
    setResult(outcome);
    /* Tras sincronizar hay que RELEER los clientes: el estado de pago lo ha escrito
       la función en el servidor, y la lista que tiene la aplicación es la de la
       carga inicial. Sin esto, el cliente recién creado se ve sin pago aunque en la
       base de datos ya lo tenga. */
    if (action === 'sync') await Promise.all([refresh(), reloadClients()]);
  };

  if (!ready) {
    return (
      <Panel tight>
        <p className="t-sm t-secondary">Cargando…</p>
      </Panel>
    );
  }

  if (unavailable) {
    return (
      <EmptyState
        icon={Plug}
        title="Las integraciones no están activadas"
        message="Falta aplicar la migración 0010_integrations.sql y desplegar la función notion-payments. Las instrucciones están al final del propio archivo SQL."
      />
    );
  }

  const resolvedId = notionDatabaseId(config.databaseId);
  /* Lo GUARDADO puede seguir sucio aunque el campo ya esté limpio: es lo que se
     manda a Notion, así que hay que avisar de que falta guardar. */
  const dirtyStored =
    Boolean(integration?.config?.databaseId) &&
    integration.config.databaseId !== notionDatabaseId(integration.config.databaseId);

  /** Estado real, no solo «¿ha sincronizado alguna vez?». */
  const state = !hasToken
    ? { label: 'Sin conectar', tone: '' }
    : integration?.status === 'error'
      ? { label: 'Con errores', tone: 'badge-bad' }
      : integration?.lastSyncAt
        ? { label: `Sincronizado ${new Date(integration.lastSyncAt).toLocaleDateString('es-ES')}`, tone: 'badge-ok' }
        : { label: 'Conectado, sin sincronizar', tone: 'badge-info' };

  const issues = configIssues(config);
  // Los avisos sobre columnas opcionales no impiden sincronizar; el del id, sí.
  const blocking = !resolvedId || !String(config.props.client || '').trim();
  const canRun = Boolean(integration?.id) && hasToken && !blocking;
  const options = columns.length > 0 ? columns : Object.values(config.props).filter(Boolean);
  const mapped = NOTION_FIELDS.filter((f) => config.props[f.key]).length;

  return (
    <div className="stack">
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
      {integration?.status === 'error' && integration.lastError && (
        <Notice tone="error">Última sincronización fallida: {integration.lastError}</Notice>
      )}

      <article className="integration">
        <header className="integration-head">
          <span className="integration-logo">
            <BrandMark brand="notion" name="Notion" size={30} />
          </span>

          <div className="who">
            <span className="name">Notion</span>
            <span className="sub">Los cobros de tus clientes, leídos desde tu base</span>
          </div>

          <span className={`badge ${state.tone}`}>
            {state.tone === 'badge-ok' && <Check size={11} />}
            {state.label}
          </span>
        </header>

        <div className="integration-body">
          <Step
            index={1}
            title="Conectar la cuenta"
            hint="Notion → Settings → Connections → Develop"
            done={hasToken}
          >
            <div className="row gap-2 wrap">
              <input
                type="password"
                className="input grow"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={hasToken ? '•••••••••• guardado' : 'secret_…'}
                autoComplete="off"
                aria-label="Token de la integración de Notion"
              />
              <a
                className="btn btn-secondary btn-sm"
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink size={13} /> Crear token
              </a>
            </div>
            <p className="t-xs t-tertiary">
              <KeyRound size={11} style={{ display: 'inline', verticalAlign: -1 }} /> El token se
              guarda donde no lo puede leer ni la propia aplicación: solo el servidor. Después de
              crearlo, <strong>comparte tu base con la integración</strong> desde el botón Compartir
              de Notion — sin ese paso el token existe pero no ve nada.
            </p>
          </Step>

          <Step index={2} title="Elegir la base" hint="Pega la URL: extraigo el id" done={Boolean(resolvedId)}>
            {/*
              Se normaliza AL ESCRIBIR, no al guardar.
              ------------------------------------------------------------------
              Antes el campo conservaba la URL con su `?v=…` y solo se limpiaba al
              pulsar Guardar. Quien pegaba la URL, veía «Id detectado: …» y se iba
              directo a sincronizar, mandaba el valor sucio a Notion y recibía
              `invalid_request_url` con el id correcto delante en pantalla — lo más
              confuso posible. Ahora el campo se convierte en el id en cuanto es
              reconocible, así que lo que se ve es lo que se manda.
            */}
            <input
              className="input"
              value={config.databaseId}
              onChange={(e) => {
                const raw = e.target.value;
                const found = notionDatabaseId(raw);
                setConfig((prev) => ({ ...prev, databaseId: found || raw }));
              }}
              placeholder="https://notion.so/…/Pagos-asesorados-e232ec9c…?v=…"
              aria-label="URL o id de la base de Notion"
            />
            {resolvedId && (
              <p className="t-xs t-tertiary">
                <Table2 size={11} style={{ display: 'inline', verticalAlign: -1 }} /> Id de la base:{' '}
                <code>{resolvedId}</code>
              </p>
            )}
            {dirtyStored && (
              <Notice tone="warn">
                El id guardado todavía lleva el <code>?v=…</code> de la vista, y eso es lo que hace
                que Notion responda «Invalid request URL». Pulsa <strong>Guardar</strong> para
                corregirlo.
              </Notice>
            )}
          </Step>

          <Step
            index={3}
            title="Emparejar las columnas"
            hint={`${mapped} de ${NOTION_FIELDS.length} mapeadas`}
            done={Boolean(config.props.client) && Boolean(config.props.status)}
          >
            {columns.length === 0 ? (
              <p className="t-xs t-tertiary">
                Guarda y pulsa «Probar la conexión»: aparecerán aquí las columnas reales de tu base
                para elegirlas en lugar de escribirlas de memoria.
              </p>
            ) : null}

            <div className="grid-auto">
              {NOTION_FIELDS.map((field) => (
                <label className="field" key={field.key}>
                  <span className="field-label">
                    {field.label}
                    {field.required ? ' *' : ''}
                  </span>
                  {columns.length > 0 ? (
                    <select
                      className="select"
                      value={config.props[field.key] || ''}
                      onChange={(e) => setProp(field.key, e.target.value)}
                    >
                      <option value="">— sin usar —</option>
                      {options.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input"
                      value={config.props[field.key] || ''}
                      onChange={(e) => setProp(field.key, e.target.value)}
                      placeholder={field.key === 'client' ? 'Cliente' : 'opcional'}
                    />
                  )}
                  <span className="field-hint">{field.hint}</span>
                </label>
              ))}

              <label className="field">
                <span className="field-label">Cuenta como pagado</span>
                <input
                  className="input"
                  value={(config.paidValues || []).join(', ')}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      paidValues: e.target.value.split(',').map((v) => v.trim()).filter(Boolean),
                    }))
                  }
                  placeholder="Pagado, Cobrado"
                />
                <span className="field-hint">Tal como aparecen en tu columna de estado</span>
              </label>
            </div>
          </Step>
        </div>

        {issues.length > 0 && (
          <div className="integration-notes">
            {issues.map((issue) => (
              <p key={issue} className="t-xs">
                <ChevronRight size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {issue}
              </p>
            ))}
          </div>
        )}

        <footer className="integration-foot">
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy === 'save'}>
            {busy === 'save' ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={test}
            disabled={!integration?.id || !hasToken || busy === 'test'}
          >
            <Link2 size={14} /> {busy === 'test' ? 'Probando…' : 'Probar la conexión'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => sync('preview')}
            disabled={!canRun || busy === 'preview'}
          >
            {busy === 'preview' ? 'Calculando…' : 'Ver qué haría'}
          </button>
          <button
            type="button"
            className="btn btn-tinted btn-sm"
            onClick={() => sync('sync')}
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
              <span className="k">Pagos leídos</span>
              <span className="v">{result.total}</span>
              <span className="sub">en tu base</span>
            </span>
            <span className="tile" style={{ cursor: 'default' }}>
              <span className="k">Asignados</span>
              <span className="v" style={{ color: 'var(--positive)' }}>
                {result.matched}
              </span>
              <span className="sub">a un cliente</span>
            </span>
            <span className="tile" style={{ cursor: 'default' }}>
              <span className="k">Sin conciliar</span>
              <span
                className="v"
                style={{ color: result.unmatched?.length ? 'var(--warning)' : undefined }}
              >
                {result.unmatched?.length || 0}
              </span>
              <span className="sub">nombres</span>
            </span>
            {result.clientsUpdated != null && (
              <span className="tile" style={{ cursor: 'default' }}>
                <span className="k">Actualizados</span>
                <span className="v">{result.clientsUpdated}</span>
                <span className="sub">clientes</span>
              </span>
            )}
          </div>

          {result.unmatched?.length > 0 ? (
            <>
              <div className="col gap-1">
                <span className="section-label">
                  <Users size={11} style={{ display: 'inline', verticalAlign: -1 }} /> Nombres sin
                  conciliar
                </span>
                <p className="t-xs t-tertiary">
                  Estos pagos están guardados pero sin cliente, así que no han cambiado el estado de
                  nadie. Asígnalos una vez y queda memorizado.
                </p>
              </div>

              <div className="col gap-2">
                {result.unmatched.map((label) => (
                  <UnmatchedRow
                    key={label}
                    label={label}
                    clients={clients}
                    onLink={(payload) => reconcile(linkExternalName, payload)}
                    onCreate={(payload) => reconcile(createClientFromExternal, payload)}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="t-sm t-secondary">Todos los pagos han encontrado su cliente.</p>
          )}
        </Panel>
      )}
    </div>
  );
};
