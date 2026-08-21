import { useCallback } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { track } from '@/lib/analytics';

/*
  ══ Las integraciones (Notion, Stripe), fuera de AppContext ══════════════════

  Con la convención de `useRoadmap.js`. Sin estado propio: se cargan a demanda
  desde su pantalla — son una o dos filas que no hacen falta para nada más. Si
  las tablas no existen (migración 0010 sin aplicar), la pantalla lo dice.

  `addClient` llega del proveedor: el alta desde un nombre de Notion es un alta
  normal (dominio de clientes) más el vínculo, y duplicar el alta aquí sería
  tener dos formas de crear un cliente.
*/

export const useIntegrations = ({ session, team, addClient }) => {
  const loadIntegration = useCallback(
    async (provider = 'notion') => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('provider', provider)
        .maybeSingle();

      if (error) return { ok: false, error: error.message, integration: null };
      if (!data) return { ok: true, integration: null, hasToken: false };

      // Del token solo se puede saber SI existe: no hay forma de leerlo desde el
      // cliente, y eso es deliberado (ver migración 0010).
      const { data: hasToken } = await supabase.rpc('integration_has_token', {
        integration: data.id,
      });

      // Lo mismo con el secreto de firma del webhook. Falla en silencio si la
      // migración 0013 no está aplicada: entonces simplemente no hay webhook.
      const { data: webhook } = await supabase
        .rpc('integration_has_webhook', { integration: data.id })
        .then((r) => r, () => ({ data: false }));

      return {
        ok: true,
        hasToken: Boolean(hasToken),
        hasWebhook: Boolean(webhook),
        integration: {
          id: data.id,
          provider: data.provider,
          label: data.label,
          config: data.config || {},
          status: data.status,
          lastSyncAt: data.last_sync_at,
          lastError: data.last_error,
          // Sin 0013 estas columnas no existen y llegan como undefined: la
          // pantalla lo lee como «todavía no ha llegado ningún evento».
          lastEventAt: data.last_event_at || null,
          eventCount: data.event_count || 0,
        },
      };
    },
    [session]
  );

  const saveIntegration = useCallback(
    async ({ id, provider = 'notion', config, label }) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const row = {
        owner_id: userId,
        provider,
        config,
        label,
        team_id: team?.id ?? null,
        updated_at: new Date().toISOString(),
      };

      const query = id
        ? supabase.from('integrations').update(row).eq('id', id).select().single()
        : supabase.from('integrations').insert(row).select().single();

      const { data, error } = await query;
      return error ? { ok: false, error: error.message } : { ok: true, id: data.id };
    },
    [session, team]
  );

  const setIntegrationToken = useCallback(async (integrationId, token) => {
    const { error } = await supabase.rpc('set_integration_token', {
      integration: integrationId,
      token,
    });
    if (error) return { ok: false, error: error.message };

    /*
      Sin decir CUÁL. El identificador de una integración es un UUID y no tiene
      sitio aquí, y el proveedor tampoco viaja: cuál usa cada equipo se responde
      mucho mejor contando filas de `integrations` desde la radiografía, que es
      un dato que ya existe y no hay que instrumentar.

      Lo que este evento aporta y esa cuenta no es el CUÁNDO: conectar una
      integración es un hito de compromiso, y saber a qué distancia del alta
      ocurre es lo que dice si merece la pena empujarlo en el primer día.
    */
    track('integracion_conectada');
    return { ok: true };
  }, []);

  /**
   * Llama a la Edge Function.
   *
   * `functions.invoke` manda el JWT de la sesión automáticamente, que es lo que la
   * función usa para comprobar —vía RLS— que la integración es del que llama. El
   * token de Notion no pasa por aquí en ningún momento.
   */
  const runIntegration = useCallback(async (integrationId, action) => {
    const { data, error } = await supabase.functions.invoke('notion-payments', {
      body: { integrationId, action },
    });

    if (error) {
      // El cuerpo del error trae el mensaje útil; `error.message` a secas suele ser
      // un genérico «non-2xx status code» que no ayuda a nadie.
      const detail = await error.context?.json?.().catch(() => null);
      return { ok: false, error: detail?.error || error.message };
    }
    return data?.error ? { ok: false, error: data.error } : { ok: true, ...data };
  }, []);

  /**
   * Da de alta un cliente A PARTIR de un nombre de Notion y lo vincula.
   *
   * ── Por qué esto es lo que faltaba ──────────────────────────────────────────
   * La conciliación solo sabía emparejar con clientes que YA existían. Pero el caso
   * real es el contrario: el entrenador lleva años cobrando en Notion y su cartera
   * entera está ahí, mientras que en la aplicación no hay nadie. Sin esto la
   * integración enseñaba catorce nombres seguidos con «¿Está dado de alta en
   * Clientes?» y no ofrecía ninguna forma de darlos de alta — que es exactamente lo
   * que hacía que no sirviera de nada.
   *
   * Con esto, la tabla de pagos se convierte en el alta masiva de la cartera: un
   * toque por persona y el pago queda ya asignado.
   */
  const createClientFromExternal = useCallback(
    async ({ integrationId, externalKey, externalLabel }) => {
      const created = await addClient({ name: String(externalLabel || '').trim() });
      if (!created.ok) return created;

      // Vincular a la vez que se crea: si no, el siguiente sincronizado volvería a
      // preguntar por el mismo nombre.
      const linked = await supabase.from('client_external_refs').upsert(
        {
          integration_id: integrationId,
          external_key: externalKey,
          external_label: externalLabel,
          client_id: created.client.id,
          linked_by: session?.user?.id,
        },
        { onConflict: 'integration_id,external_key' }
      );

      if (linked.error) return { ok: false, error: linked.error.message };
      return { ok: true, client: created.client };
    },
    [addClient, session]
  );

  /**
   * Guarda el secreto de firma del webhook de Stripe.
   *
   * Va por su propia función (migración 0013) y no por un UPDATE: la tabla de
   * secretos no tiene políticas, así que ni el dueño puede escribirla desde el
   * navegador. La función comprueba además que empiece por «whsec_», que es el
   * error más común: pegar la clave de API en el hueco del secreto de firma.
   */
  const setWebhookSecret = useCallback(async (integrationId, secret) => {
    const { error } = await supabase.rpc('set_integration_webhook_secret', {
      integration: integrationId,
      secret,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  /** Lo mismo para Stripe, que tiene su propia función. */
  const runStripe = useCallback(async (integrationId, action) => {
    const { data, error } = await supabase.functions.invoke('stripe-payments', {
      body: { integrationId, action },
    });
    if (error) {
      const detail = await error.context?.json?.().catch(() => null);
      return { ok: false, error: detail?.error || error.message };
    }
    return data?.error ? { ok: false, error: data.error } : { ok: true, ...data };
  }, []);

  /** Confirma que una cadena de Notion corresponde a un cliente, para siempre. */
  const linkExternalName = useCallback(
    async ({ integrationId, externalKey, externalLabel, clientId }) => {
      const userId = session?.user?.id;
      const { error } = await supabase.from('client_external_refs').upsert(
        {
          integration_id: integrationId,
          external_key: externalKey,
          external_label: externalLabel,
          client_id: clientId,
          linked_by: userId,
        },
        { onConflict: 'integration_id,external_key' }
      );
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    [session]
  );

  return {
    loadIntegration,
    saveIntegration,
    setIntegrationToken,
    runIntegration,
    createClientFromExternal,
    setWebhookSecret,
    runStripe,
    linkExternalName,
  };
};
