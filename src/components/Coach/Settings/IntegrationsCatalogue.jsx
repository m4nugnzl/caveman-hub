import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, RefreshCw } from 'lucide-react';

import { useActions, useSession } from '@/context/AppContext';
import { supabase } from '@/lib/supabaseClient';
import { CATEGORIAS, PROVIDERS, providerById } from '@/domain/integrations';
import { shortDate } from '@/lib/dates';
import { BrandMark } from '@/components/ui/BrandMark';
import { GroupHead, Notice, PageHead, Panel } from '@/components/ui/primitives';
import { NotionSettings } from './NotionSettings';
import { StripeSettings } from './StripeSettings';
import { DriveSettings } from './DriveSettings';

/**
 * Cómo vuelve el permiso de Google, dicho en castellano.
 *
 * La vuelta de OAuth es una REDIRECCIÓN a esta pantalla con un parámetro, así que
 * lo único que llega de aquel viaje es esa palabra: si no se traduce, el
 * entrenador acaba en el catálogo sin saber si su Drive quedó conectado o no.
 * Cancelar no es un fallo y por eso no sale en rojo — es una respuesta.
 */
const VUELTA_DE_DRIVE = {
  ok: { tone: 'success', text: 'Tu Drive ha quedado conectado.' },
  cancelado: { tone: 'info', text: 'No has dado el permiso, así que no se ha conectado nada.' },
  caducado: {
    tone: 'warn',
    text: 'La conexión ha tardado demasiado y ha caducado. Vuelve a empezar: son dos clics.',
  },
  'sin-permiso': {
    tone: 'error',
    text: 'Google no ha dado un permiso duradero. Entra en tu cuenta de Google → Datos y privacidad → Aplicaciones de terceros, quita el acceso de Caveman Hub y vuelve a conectarlo.',
  },
  error: { tone: 'error', text: 'Google ha rechazado la conexión. Vuelve a intentarlo.' },
};

/**
 * Las que se pueden conectar HOY.
 *
 * ── El fallo que esto evita ─────────────────────────────────────────────────
 * El estado se pedía para todo `PROVIDERS`, incluidos los `planned`. Un
 * proveedor anunciado como «Pronto» no existe en el servidor, así que su
 * consulta contesta que no —y `unavailable` es `results.some((r) => !r.ok)`—:
 * la primera entrada «Pronto» habría encendido el aviso de «las integraciones
 * todavía no están activas en tu cuenta» para TODO el mundo, incluido quien las
 * tiene funcionando. La rama existía desde el principio y nunca se había
 * ejercitado, que es exactamente cuando pasan estas cosas.
 */
const CONECTABLES = PROVIDERS.filter((p) => p.status !== 'planned');

/** La línea de estado de una tarjeta conectada: qué pasó la última vez. */
const metaDeEstado = (estado) => {
  const { integration } = estado || {};
  if (!integration) return null;
  if (integration.lastError) return null; // lo dice el badge, no la letra pequeña
  if (!integration.lastSyncAt) return 'Conectado, sin sincronizar todavía';
  const eventos =
    integration.eventCount > 0 ? ` · ${integration.eventCount} avisos recibidos` : '';
  return `Sincronizado ${shortDate(integration.lastSyncAt)}${eventos}`;
};

/**
 * Una tarjeta del catálogo.
 *
 * Conectada, deja de ser un enlace mudo: dice cuándo sincronizó por última vez
 * y trae el botón de sincronizar AQUÍ — la operación de cada lunes no debería
 * exigir entrar a la pantalla de configuración, que es de un solo día.
 */
const ProviderCard = ({ provider, estado, ready, busy, onOpen, onSync }) => {
  const connected = Boolean(estado?.hasToken);
  const conError = Boolean(estado?.integration?.lastError);
  const meta = metaDeEstado(estado);
  const planned = provider.status === 'planned';

  return (
    <article className={`provider${planned ? ' is-planned' : ''}`}>
      {!planned && (
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
        {/*
          Mientras no se sabe, no se dice. `estados` empieza vacío, así que una
          integración YA conectada se anunciaba «Disponible» durante el viaje de
          ida y vuelta y luego cambiaba a «Conectado»: un parpadeo que dice justo
          lo contrario de la verdad, en la línea que se mira primero.
        */}
        {planned ? (
          <span className="badge">Pronto</span>
        ) : !ready ? (
          <span className="badge-hueco" aria-hidden="true" />
        ) : conError ? (
          <span className="badge badge-warn">Con un fallo</span>
        ) : connected ? (
          <span className="badge badge-ok">
            <Check size={11} /> Conectado
          </span>
        ) : (
          <span className="badge badge-info">Disponible</span>
        )}
      </header>

      <p className="provider-what">{provider.tagline}</p>

      {/*
        El pie ya no es solo de las conectadas. Una tarjeta «Disponible»
        terminaba en su frase y no decía en ninguna parte que se pudiera pulsar
        —la tarjeta entera es un botón, pero eso solo se descubre pasando por
        encima—. «Conectar →» lo dice; es un `span` inerte a propósito
        (`.provider > *` no recibe puntero) para que el clic siga siendo el de la
        tarjeta y no haya dos destinos donde hay uno.
      */}
      {!planned && ready && (
        <div className="provider-foot">
          {connected ? (
            <>
              <span className="provider-meta">{meta}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={(e) => {
                  /* Que sincronizar no abra además la pantalla de configuración: el
                     `provider-hit` cubre la tarjeta entera. */
                  e.stopPropagation();
                  onSync();
                }}
              >
                <RefreshCw size={13} className={busy ? 'is-girando' : undefined} />
                {busy ? 'Sincronizando…' : 'Sincronizar'}
              </button>
            </>
          ) : (
            <span className="provider-cta">
              Conectar <ChevronRight size={13} />
            </span>
          )}
        </div>
      )}
    </article>
  );
};

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
 * Lo que todavía no está se muestra igualmente, marcado como «Pronto». Es más
 * honesto que aparecer de la nada un día, y de paso el entrenador sabe si merece
 * la pena esperar o montar lo que hay. (Hoy no hay ninguno «Pronto»: la rama
 * existe para el siguiente proveedor, no para el aire.)
 */
export const IntegrationsCatalogue = () => {
  const { loadIntegration, runIntegration, runStripe, runDrive } = useActions();
  const { plan } = useSession();
  const [open, setOpen] = useState(null);
  /* El resultado ENTERO de `loadIntegration` por proveedor, no solo si hay
     token: la fecha de la última sincronización y el contador de eventos ya
     venían en la respuesta y se tiraban. */
  const [estados, setEstados] = useState({});
  const [syncing, setSyncing] = useState(null);
  const [aviso, setAviso] = useState(null);
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

  /** El estado de cada proveedor conectable. Se pregunta por todos, no solo por Notion. */
  const loadConnected = useCallback(async () => {
    const results = await Promise.all(CONECTABLES.map((p) => loadIntegration(p.id)));
    setUnavailable(results.some((r) => !r.ok));
    setEstados(Object.fromEntries(CONECTABLES.map((p, i) => [p.id, results[i]])));
    setReady(true);
  }, [loadIntegration]);

  useEffect(() => {
    loadConnected();
  }, [loadConnected]);

  /*
    La vuelta de Google, si es que se viene de allí.

    Se lee UNA vez y se limpia de la barra de direcciones: dejar el parámetro
    puesto haría que recargar la página volviera a anunciar «tu Drive ha quedado
    conectado» días después, sin que hubiera pasado nada. Se abre además la
    pantalla de Drive, que es donde estaba uno antes de irse a Google — volver al
    catálogo y tener que buscarla otra vez es perder el hilo del gesto.
  */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vuelta = params.get('drive');
    if (!vuelta) return;

    setAviso(VUELTA_DE_DRIVE[vuelta] || VUELTA_DE_DRIVE.error);
    setOpen('google_drive');
    params.delete('drive');
    const limpia = params.toString();
    window.history.replaceState(
      {},
      '',
      window.location.pathname + (limpia ? `?${limpia}` : '') + window.location.hash
    );
  }, []);

  /*
    Sincronizar desde la tarjeta: la operación de cada lunes, sin pasar por la
    pantalla de configuración. El resumen se dice aquí arriba con las mismas
    cifras que daría la pantalla del proveedor.
  */
  const sincronizar = async (provider) => {
    const integrationId = estados[provider.id]?.integration?.id;
    if (!integrationId || syncing) return;

    setSyncing(provider.id);
    setAviso(null);
    /* Drive no lleva (id, acción) como las de cobros: su función atiende a varios
       llamadores —el entrenador y su cliente— y por eso recibe un objeto en vez
       de dos argumentos posicionales. Ver `useIntegrations.js`. */
    const res =
      provider.id === 'google_drive'
        ? await runDrive({ action: 'sync', integrationId })
        : await (provider.id === 'stripe' ? runStripe : runIntegration)(integrationId, 'sync');
    setSyncing(null);

    if (!res.ok) {
      setAviso({ tone: 'error', text: `${provider.name}: ${res.error}` });
    } else if (res.summary) {
      /*
        El proveedor que sepa resumirse, se resume.

        El texto de abajo habla de pagos asignados y de nombres sin conciliar,
        que es lo que hacen las dos integraciones de cobros. Drive no asigna
        ningún pago: con esa plantilla decía «0 de 0 pagos asignados», que es una
        frase verdadera y absurda.
      */
      setAviso({ tone: 'success', text: `${provider.name}: ${res.summary}.` });
    } else {
      const partes = [`${res.matched ?? 0} de ${res.total ?? 0} pagos asignados`];
      if (res.clientsUpdated != null) partes.push(`${res.clientsUpdated} clientes al día`);
      if (res.unmatched?.length > 0) partes.push(`${res.unmatched.length} nombres sin conciliar`);
      setAviso({ tone: 'success', text: `${provider.name}: ${partes.join(' · ')}.` });
    }
    loadConnected();
  };

  // Cada proveedor tiene su pantalla; el catálogo solo decide cuál abre.
  const DETAIL = { notion: NotionSettings, stripe: StripeSettings, google_drive: DriveSettings };
  const Detail = DETAIL[open];

  if (Detail) {
    /*
      Una integración YA conectada se abre siempre: el capado de la 0065 solo
      bloquea crear una nueva, y a quien la tenía de antes no se le quita ni el
      uso ni la configuración. Lo que no se enseña es el formulario de conectar
      a quien su plan no le va a dejar guardarlo.
    */
    const bloqueado = capado && !estados[open]?.hasToken;
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
        {/*
          El aviso, TAMBIÉN aquí dentro.

          Estaba solo en la rejilla, y esa es la mitad de las veces en que hace
          falta: la vuelta de Google abre esta pantalla y pone el aviso a la vez
          (ver el efecto de `?drive=`), así que el «Tu Drive ha quedado
          conectado» se pintaba en una pantalla que en ese momento no se está
          mirando. Volver de dar un permiso y que no te diga nada es la forma más
          rápida de creer que no ha funcionado.
        */}
        {aviso && <Notice tone={aviso.tone}>{aviso.text}</Notice>}

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

  return (
    <div className="stack">
      <PageHead
        title="Integraciones"
        sub="Conecta lo que ya usas para no llevar la misma información en dos sitios."
      />

      {unavailable && ready && (
        <Notice tone="info">
          Las integraciones todavía no están activas en tu cuenta: puedes ver qué hay, pero no
          conectar nada. Escríbenos desde Ajustes → Ayuda y las activamos.
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

      {aviso && <Notice tone={aviso.tone}>{aviso.text}</Notice>}

      {/*
        Por categoría (`category` en PROVIDERS), y cada tanda con su encabezado de
        verdad. Estaba todo dentro de UNA tarjeta con rótulos sueltos por dentro:
        una tarjeta que contiene tarjetas no separa nada, solo mete un marco de
        más, y los avisos quedaban encerrados en él en vez de encabezar la
        pantalla. Es la misma gramática que Protocolo — el encabezado explica, la
        tarjeta se toca.
      */}
      {[...new Set(PROVIDERS.map((p) => p.category))].map((categoria) => (
        <section className="col gap-3" key={categoria}>
          <GroupHead title={categoria} sub={CATEGORIAS[categoria]} />
          <div className="provider-grid">
            {PROVIDERS.filter((p) => p.category === categoria).map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                estado={estados[provider.id]}
                ready={ready}
                busy={syncing === provider.id}
                onOpen={() => setOpen(provider.id)}
                onSync={() => sincronizar(provider)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
