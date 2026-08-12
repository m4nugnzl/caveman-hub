-- ============================================================================
-- Invitar a un cliente a su portal
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Nada existente cambia de comportamiento.
--
-- ══ El agujero que cierra ═══════════════════════════════════════════════════
--
-- `clients.client_profile_id` existe desde el principio y es lo que enlaza una ficha
-- de cliente con una cuenta de usuario. Toda la seguridad del portal del cliente
-- descansa en esa columna: `is_me(client_id)` la consulta, y de ahí salen los
-- permisos para leer su rutina, registrar sus series y subir sus fotos.
--
-- Y no había ninguna pantalla para rellenarla.
--
-- Es decir: la mitad de la aplicación —el portal completo, con su rutina, su dieta,
-- sus check-ins y sus fotos— estaba construida y era inalcanzable. La única forma de
-- que un cliente entrara era abrir el panel de Supabase y escribir a mano el uuid de
-- su cuenta en la fila correspondiente. Para vender esto, es el primer bloqueante:
-- no hay producto si el cliente no puede entrar.
--
-- ══ Por qué un token y no el email ═════════════════════════════════════════
--
-- La alternativa evidente —enlazar por email al registrarse— tiene un problema:
-- convierte «conocer el email de un cliente» en «poder ser ese cliente». Cualquiera
-- que sepa la dirección se registra con ella y hereda su ficha, su historial y sus
-- fotos. Y los emails de los clientes los tiene el entrenador en su agenda.
--
-- Con token, hacen falta las dos cosas: recibir el enlace y crearse una cuenta. El
-- token lo genera la base de datos, se usa UNA vez y caduca.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,

  -- Lo que viaja en la URL: /invitacion/<token>
  token       text NOT NULL UNIQUE,

  created_by  uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Caducidad corta a propósito. Un enlace de invitación acaba en un WhatsApp que
  -- no se borra nunca; que deje de servir en dos semanas limita a dos semanas la
  -- ventana en la que un móvil perdido vale para entrar en la ficha de alguien.
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '14 days',

  claimed_at  timestamptz,
  claimed_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  revoked_at  timestamptz
);

CREATE INDEX IF NOT EXISTS client_invites_client_idx ON public.client_invites (client_id);

ALTER TABLE public.client_invites ENABLE ROW LEVEL SECURITY;

/*
  El entrenador ve y revoca las invitaciones de SUS clientes. Nadie más lee la
  tabla, y en particular no la lee quien va a canjear el token: eso pasa por la
  función `claim_client_invite`, que es `SECURITY DEFINER`.

  Si el que canjea pudiera consultar la tabla, podría listar tokens de otros. Con
  cero políticas de SELECT para él, el token solo sirve si ya lo tiene.
*/
DROP POLICY IF EXISTS "invites_coach_read" ON public.client_invites;
CREATE POLICY "invites_coach_read" ON public.client_invites
  FOR SELECT TO authenticated USING (public.is_my_client(client_id));

DROP POLICY IF EXISTS "invites_coach_revoke" ON public.client_invites;
CREATE POLICY "invites_coach_revoke" ON public.client_invites
  FOR UPDATE TO authenticated
  USING (public.is_my_client(client_id))
  WITH CHECK (public.is_my_client(client_id));

COMMIT;


BEGIN;

/**
 * Crea (o reutiliza) la invitación de un cliente y devuelve su token.
 *
 * ── Por qué reutiliza ───────────────────────────────────────────────────────
 * Si cada pulsación generara un token nuevo, el enlace que el entrenador mandó
 * ayer por WhatsApp dejaría de valer en cuanto volviera a abrir la pantalla —sin
 * que nada se lo dijera—. Mientras haya una invitación viva y sin usar, se devuelve
 * esa misma. Para invalidar la anterior está `revoke_client_invite`.
 *
 * El token se genera en la base de datos y no en el navegador: así no depende de la
 * calidad del generador aleatorio del cliente ni se puede forzar un token elegido.
 */
CREATE OR REPLACE FUNCTION public.create_client_invite(target uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text;
BEGIN
  IF NOT public.is_my_client(target) THEN
    RAISE EXCEPTION 'Ese cliente no es tuyo';
  END IF;

  -- Una ficha ya enlazada no necesita invitación, y generar una sería la forma de
  -- que un segundo usuario se quedara con la ficha de otro.
  IF EXISTS (SELECT 1 FROM public.clients WHERE id = target AND client_profile_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Este cliente ya tiene su cuenta enlazada';
  END IF;

  SELECT token INTO v_token
  FROM public.client_invites
  WHERE client_id = target
    AND claimed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  -- 32 bytes de aleatoriedad en base64url. Suficiente para que adivinarlo no sea
  -- una estrategia.
  v_token := translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');

  INSERT INTO public.client_invites (client_id, token, created_by)
  VALUES (target, v_token, auth.uid());

  RETURN v_token;
END;
$$;

/** Invalida las invitaciones vivas de un cliente. */
CREATE OR REPLACE FUNCTION public.revoke_client_invite(target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_my_client(target) THEN
    RAISE EXCEPTION 'Ese cliente no es tuyo';
  END IF;

  UPDATE public.client_invites
  SET revoked_at = now()
  WHERE client_id = target AND claimed_at IS NULL AND revoked_at IS NULL;
END;
$$;

/**
 * Canjea un token: enlaza la cuenta que llama con la ficha del cliente.
 *
 * La llama el CLIENTE recién registrado, sobre su propia sesión. Devuelve el nombre
 * del cliente enlazado para poder saludarle, o lanza excepción con un motivo
 * legible si el token no sirve.
 *
 * ── Las cuatro comprobaciones, y por qué cada una ───────────────────────────
 *   1. El token existe, no está revocado, no está usado y no ha caducado.
 *   2. La ficha no está ya enlazada a otra cuenta. Sin esto, dos tokens del mismo
 *      cliente —o uno reenviado— dejarían que el segundo en llegar se quedara con
 *      la ficha del primero.
 *   3. Quien llama no está ya enlazado a OTRA ficha. Una cuenta es un cliente; si
 *      no, `is_me` devolvería dos filas y los permisos dejarían de ser de uno.
 *   4. Hay sesión. Un token no vale sin cuenta: es lo que hace que haga falta
 *      recibir el enlace *y* registrarse.
 */
CREATE OR REPLACE FUNCTION public.claim_client_invite(p_token text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite public.client_invites;
  v_name   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesión para aceptar la invitación';
  END IF;

  SELECT * INTO v_invite
  FROM public.client_invites
  WHERE token = p_token
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Esta invitación no existe';
  END IF;
  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta invitación ha sido anulada por tu entrenador';
  END IF;
  IF v_invite.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta invitación ya se ha usado';
  END IF;
  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'Esta invitación ha caducado. Pídele a tu entrenador que te mande otra';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = v_invite.client_id AND client_profile_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Esta ficha ya está enlazada a otra cuenta';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE client_profile_id = auth.uid() AND id <> v_invite.client_id
  ) THEN
    RAISE EXCEPTION 'Tu cuenta ya está enlazada a otro cliente';
  END IF;

  UPDATE public.clients
  SET client_profile_id = auth.uid()
  WHERE id = v_invite.client_id
  RETURNING name INTO v_name;

  UPDATE public.client_invites
  SET claimed_at = now(), claimed_by = auth.uid()
  WHERE id = v_invite.id;

  -- El rol del perfil pasa a 'client', que es lo que decide qué aplicación se
  -- carga al entrar. `profiles.role` no lo puede escribir el usuario (la 0002 le
  -- revocó el UPDATE de esa columna), así que tiene que hacerse aquí.
  UPDATE public.profiles SET role = 'client' WHERE id = auth.uid();

  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_invite(uuid) FROM public;
REVOKE ALL ON FUNCTION public.revoke_client_invite(uuid) FROM public;
REVOKE ALL ON FUNCTION public.claim_client_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_client_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_client_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client_invite(text) TO authenticated;

COMMIT;

-- ============================================================================
-- Cómo se usa
-- ----------------------------------------------------------------------------
-- 1. El entrenador abre la ficha del cliente y pulsa «Invitar». Sale un enlace
--    /invitacion/<token> que copia y manda por WhatsApp.
-- 2. El cliente lo abre. Si no tiene cuenta, se registra con el email que quiera —el
--    token es lo que le identifica, no el email—.
-- 3. Al entrar, la aplicación canjea el token y ya está en su portal.
--
-- El enlace caduca en 14 días y sirve una sola vez.
-- ============================================================================
