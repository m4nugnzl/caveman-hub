-- ============================================================================
-- Un entrenador no puede canjear una invitación de cliente
-- ----------------------------------------------------------------------------
-- ⚠️  Reemplaza `claim_client_invite(text)`. No toca tablas, ni políticas, ni
--     permisos, ni datos. Requiere `0015_client_invites.sql`.
--
-- ══ El fallo ═══════════════════════════════════════════════════════════════
--
-- Un entrenador abre el enlace de invitación de uno de sus clientes —probar el
-- enlace que acabas de generar es exactamente lo que hace todo el mundo al
-- montar la asesoría— con su sesión ya iniciada. La pantalla no le pide crear
-- cuenta, porque ya tiene una, así que le enseña el botón de aceptar. Y al
-- pulsarlo, la última línea de la 0015 se ejecuta sobre ÉL:
--
--     UPDATE public.profiles SET role = 'client' WHERE id = auth.uid();
--
-- Su cuenta deja de ser la de un entrenador. `AppContext` lee ese rol en el
-- arranque para decidir qué aplicación carga, así que a partir de la siguiente
-- recarga entra en el portal del cliente, que filtra por `client_profile_id` y
-- solo encuentra la ficha que acaba de canjear.
--
-- ── Por qué se vive como una pérdida de datos, sin serlo ────────────────────
--
-- No se borra nada. Los clientes siguen enteros, con su `team_id`, y el equipo
-- sigue siendo suyo. Lo único que cambia son dos filas —su rol y el
-- `client_profile_id` de una ficha— y sin embargo el síntoma es la pantalla
-- vacía de quien lo ha perdido todo. Es el peor tipo de fallo: reversible, e
-- indistinguible de uno que no lo es.
--
-- ── Por qué `profiles.role` no sirve para detectarlo ────────────────────────
--
-- Era lo primero que uno intenta —«si ya es coach, que no canjee»— y no vale:
-- `handle_new_user` (bootstrap.sql) da `'coach'` a TODO el mundo al registrarse,
-- porque el registro está abierto y el rol de cliente lo pone precisamente esta
-- función al canjear. Un cliente recién registrado y un entrenador con veinte
-- fichas son, en esa columna, exactamente lo mismo.
--
-- Así que la guarda no pregunta quién dice ser, sino qué tiene detrás.
--
-- ══ Las tres pruebas de ser entrenador ═════════════════════════════════════
--
-- Están elegidas para que un cliente recién registrado no cumpla NINGUNA. Es la
-- condición que las hace aceptables: una guarda que bloquee al cliente legítimo
-- se quita a la semana, y volvemos aquí.
--
--   1. **El enlace lo generaste tú** (`created_by = auth.uid()`). Exacta, sin
--      falsos positivos posibles: nadie canjea legítimamente su propia
--      invitación. Es el camino del accidente real, y por eso va la primera y
--      antes que las comprobaciones del token — quien tropieza con su propio
--      enlace merece que se lo digan aunque además esté caducado.
--
--   2. **Tienes fichas a tu nombre** (`clients.coach_id = auth.uid()`). Un
--      cliente recién registrado tiene cero. Un entrenador, no.
--
--   3. **Perteneces al equipo de otro** (miembro de un equipo que no es tuyo).
--      Cubre al entrenador contratado, que puede no tener ninguna ficha propia
--      y sigue siendo personal de una asesoría. El equipo que `ensure_my_team`
--      le crea a cualquiera al arrancar NO cuenta aquí, porque de ese es dueño
--      él: por eso la condición es `owner_id <> auth.uid()` y no «tiene equipo».
--      Confundir las dos habría bloqueado al cliente que se registró por su
--      cuenta antes de abrir el enlace, que es justo a quien no hay que tocar.
--
-- ══ Lo que esto cierra, y lo que deja fuera a propósito ════════════════════
--
-- Queda fuera un caso: una cuenta de entrenador SIN clientes, sin equipo ajeno,
-- canjeando la invitación de OTRO. Se deja pasar porque no hay nada que
-- destruir —un equipo vacío— y porque es, literalmente, la forma en que una
-- cuenta que no se usó nunca se convierte en la de un cliente.
--
-- Y queda fuera otro, este por limitación conocida del modelo: **un entrenador
-- no puede ser además cliente de otro entrenador**. `profiles.role` es una sola
-- columna con un solo valor y la aplicación elige qué cargar a partir de ella,
-- así que las dos cosas a la vez no existen hoy. Antes de esta migración eso no
-- estaba permitido tampoco: simplemente rompía la cuenta en silencio. El cambio
-- no es que deje de poder hacerse, es que ahora lo dice.
--
-- ══ Por qué en la base y no en la pantalla ═════════════════════════════════
--
-- La pantalla también avisa (`InvitePage`), y ese aviso es el que va a leer una
-- persona. Pero es cortesía: se salta con las herramientas de desarrollo, y lo
-- que hay al otro lado no es un error cosmético sino una cuenta de entrenador
-- convertida en la de un cliente. El mismo criterio que llevó el consentimiento
-- a la 0018 en vez de dejarlo en una casilla del navegador.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.claim_client_invite(text)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0015_client_invites.sql: `claim_client_invite` es lo que esta migración protege.';
  END IF;
END $$;

BEGIN;

/**
 * Canjea un token: enlaza la cuenta que llama con la ficha del cliente.
 *
 * Misma función de la 0015, con las tres comprobaciones de identidad añadidas.
 * El resto del cuerpo no cambia ni una línea.
 *
 * ── Los permisos se conservan solos ─────────────────────────────────────────
 * `CREATE OR REPLACE` sobre una función que ya existe MANTIENE sus permisos, así
 * que el `REVOKE EXECUTE … FROM authenticated` que le puso la 0018 —para que
 * nadie pueda enlazar sin registrar el consentimiento— sigue en pie sin repetirlo
 * aquí. Repetirlo sería, además, la forma de equivocarse: escribir un GRANT de
 * más reabriría la puerta de atrás que aquella migración cerró.
 *
 * Quien la llama es `claim_client_invite(text, text)` (0018), que es la que sí
 * puede ejecutar `authenticated`. Como esta guarda vive dentro, la protege igual.
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

  /*
    ── Quién canjea, antes de en qué estado está el token ────────────────────

    Deliberadamente antes de «anulada», «ya usada» y «caducada»: el entrenador
    que abre su propio enlace necesita saber QUE ES SUYO, y enterarse de que
    además ha caducado no le acerca nada a entender qué estuvo a punto de pasar.
  */
  IF v_invite.created_by = auth.uid() THEN
    RAISE EXCEPTION 'Este enlace lo has generado tú. Si lo aceptas con tu propia cuenta, tu cuenta de entrenador pasaría a ser la de este cliente. Para probarlo, ábrelo en una ventana privada.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.clients WHERE coach_id = auth.uid()) THEN
    RAISE EXCEPTION 'Estás dentro con una cuenta de entrenador que tiene clientes a su nombre. Cierra sesión y acepta la invitación con la cuenta del cliente.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.team_members m
    JOIN public.teams t ON t.id = m.team_id
    WHERE m.profile_id = auth.uid()
      AND t.owner_id <> auth.uid()
  ) THEN
    RAISE EXCEPTION 'Estás dentro con una cuenta que forma parte del equipo de un entrenador. Cierra sesión y acepta la invitación con la cuenta del cliente.';
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

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Desde el editor SQL no hay sesión (`auth.uid()` es NULL) y solo saldría «Hay
-- que iniciar sesión». Se comprueba desde la APLICACIÓN.
--
-- 1. Con la sesión del ENTRENADOR, sobre un enlace suyo — tiene que fallar:
--
--      await supabase.rpc('claim_client_invite',
--        { p_token: '<token>', p_consent_version: '2026-08' })
--      // → «Este enlace lo has generado tú…»
--
-- 2. Con una cuenta recién registrada, sobre ese mismo enlace — tiene que
--    funcionar y devolver el nombre del cliente.
--
-- 3. Que los permisos siguen como los dejó la 0018 (la de un argumento cerrada,
--    la de dos abierta):
--
--      SELECT has_function_privilege('authenticated', 'public.claim_client_invite(text)',      'execute'),
--             has_function_privilege('authenticated', 'public.claim_client_invite(text,text)', 'execute');
--      -- → f | t
--
-- ── Si alguien ya se ha canjeado su propia cuenta ───────────────────────────
-- Esta migración impide que vuelva a pasar; no repara al que ya cayó. Para eso,
-- con la `service_role` y sustituyendo los dos identificadores:
--
--   UPDATE public.profiles SET role = 'coach' WHERE id = '<uid>';
--   UPDATE public.clients  SET client_profile_id = NULL WHERE id = '<ficha>';
--   DELETE FROM public.client_consents WHERE profile_id = '<uid>' AND client_id = '<ficha>';
--
-- El consentimiento se borra porque es falso —lo firmó el entrenador creyendo
-- que probaba el enlace— y dejarlo haría que la persona que ocupe esa ficha
-- mañana llegara con un «sí» que nunca dio.
--
-- Para encontrar a los afectados que queden, si los hubiera:
--
--   SELECT p.email, c.name AS ficha
--   FROM public.clients c
--   JOIN public.profiles p ON p.id = c.client_profile_id
--   WHERE c.coach_id = c.client_profile_id;
-- ============================================================================
