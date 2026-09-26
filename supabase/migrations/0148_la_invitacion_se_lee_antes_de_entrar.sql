-- ============================================================================
-- La invitación se lee antes de entrar
-- ----------------------------------------------------------------------------
-- Requiere 0015 (`client_invites`), 0018 (el canje con consentimiento) y 0091
-- (la última versión de `claim_client_invite(text)`). Se para sola si falta.
--
-- ⚠️  Añade DOS funciones y reescribe `claim_client_invite(text)`. No toca
--     tablas, políticas ni datos. Los permisos del canje se conservan solos
--     (`CREATE OR REPLACE`): la de un argumento sigue cerrada, como la dejó la
--     0018.
--
-- ══ El fallo (26 sep 2026) ═════════════════════════════════════════════════
--
-- Un entrenador nos dijo que la invitación «no se entiende y puede que no
-- funcione». Las dos cosas eran verdad, y las dos venían de lo mismo: la
-- pantalla de `/invitacion/<token>` NO SABÍA NADA del enlace hasta después de
-- crear la cuenta. No sabía de quién era, así que no podía decir «Carlos te ha
-- invitado»; y no sabía si estaba caducado o usado, así que el cliente se creaba
-- la cuenta, aceptaba el consentimiento y DESPUÉS leía «esta invitación ha
-- caducado» — con una cuenta de entrenador vacía ya creada a su nombre.
--
-- ══ 1. `leer_invitacion(token)`, que puede llamar cualquiera ═══════════════
--
-- Es la segunda función de `public` que se abre a `anon` a propósito (la 0069
-- dejó escrito que abrir algo a `anon` tiene que ser una frase, no un olvido).
-- Se abre porque la pantalla que la necesita existe ANTES de la cuenta.
--
-- Qué devuelve, y por qué no es una fuga:
--
--   · `estado` — valida, caducada, usada, anulada, enlazada, tuya o no_existe.
--   · `cliente` — el NOMBRE DE PILA de la ficha, y solo si el enlace sirve.
--   · `entrenador` — el nombre de pila de quien lo generó.
--   · `caduca` — la fecha.
--   · `acceso_nuevo` — si esa ficha ya tuvo una cuenta (una reemisión, 0083).
--   · `bloqueo` — con sesión, si ESA cuenta no puede canjear y por qué.
--
-- Ni un correo, ni un id, ni un dato de salud. Y para preguntar hay que tener
-- el token, que son 256 bits (0015): no se adivina, se recibe. Quien lo tiene es
-- la persona a la que se lo mandaron — o alguien a quien ella se lo reenvió, y
-- ese ya podía canjearlo, que es bastante más que leer dos nombres de pila.
--
-- ══ 2. La guarda del entrenador, en UNA pieza ══════════════════════════════
--
-- Las tres pruebas de ser entrenador de la 0084 vivían dentro del canje, y la
-- pantalla las imitaba con dos consultas propias que no eran las mismas (miraba
-- «puedo leer esta invitación», que no es ninguna de las tres). Una pantalla y
-- una base que deciden distinto acaban en el peor caso: la pantalla deja pasar,
-- el cliente acepta y la base le dice que no.
--
-- Ahora las tres viven en `motivo_para_no_canjear`, y la usan el canje y la
-- lectura. Lo que la pantalla enseña es lo que la base va a decidir. Siguen
-- siendo las mismas tres, en el mismo orden, y siguen sin contar el equipo
-- propio que `ensure_my_team` le crea a CUALQUIERA al pasar por la raíz — que
-- es exactamente lo que hace una cuenta recién creada antes de volver al enlace.
--
-- ══ 3. El canje: abrir tu propio enlace ya usado no es un error ════════════
--
-- El cliente que ya entró y vuelve a pulsar el enlace del WhatsApp —lo más
-- normal del mundo: es el único sitio donde tiene «la app»— leía «Esta
-- invitación ya se ha usado». Ahora, si quien llama ES la cuenta enlazada a esa
-- ficha, el canje devuelve su nombre sin tocar nada. Cubre también la respuesta
-- que se pierde por la red: el canje se hizo, el navegador no se enteró y
-- «reintentar» ya no falla.
--
-- Y cada error dice qué hacer a continuación, con un código en el HINT
-- (`usada`, `caducada`, `ficha_enlazada`…) para que la pantalla ponga el botón
-- que toca sin tener que leer la frase.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.client_invites') IS NULL THEN
    RAISE EXCEPTION 'Falta 0015_client_invites.sql.';
  END IF;
  IF to_regprocedure('public.claim_client_invite(text,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0018_client_consent.sql: el canje con consentimiento.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.claim_client_invite(text)'::regprocedure
      AND prosrc LIKE '%v_email%'
  ) THEN
    RAISE EXCEPTION 'Falta 0091_el_cliente_dice_quien_es.sql: esta migración parte de su canje.';
  END IF;
END $$;

BEGIN;

-- ── 1. Por qué esta cuenta no puede canjear (o NULL si puede) ─────────────

/**
 * Las tres pruebas de ser entrenador de la 0084, en una sola pieza.
 *
 *   · `propia`     — el enlace lo generó quien llama.
 *   · `entrenador` — tiene fichas a su nombre.
 *   · `equipo`     — es miembro de un equipo que NO es suyo.
 *
 * Una cuenta recién creada no cumple ninguna, aunque haya pasado por la raíz:
 * `ensure_my_team` le crea un equipo del que es DUEÑA, y ese no cuenta. Sin
 * sesión devuelve NULL: no hay nadie de quien decir nada.
 *
 * Interna: solo la llaman las dos funciones de abajo.
 */
CREATE OR REPLACE FUNCTION public.motivo_para_no_canjear(p_created_by uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    WHEN p_created_by = auth.uid() THEN 'propia'
    WHEN EXISTS (SELECT 1 FROM public.clients WHERE coach_id = auth.uid()) THEN 'entrenador'
    WHEN EXISTS (
      SELECT 1
      FROM public.team_members m
      JOIN public.teams t ON t.id = m.team_id
      WHERE m.profile_id = auth.uid()
        AND t.owner_id <> auth.uid()
    ) THEN 'equipo'
  END;
$$;

REVOKE ALL ON FUNCTION public.motivo_para_no_canjear(uuid) FROM public, anon, authenticated;

-- ── 2. Leer la invitación, con o sin sesión ────────────────────────────────

/**
 * Lo que la pantalla de invitación necesita saber ANTES de pedir una cuenta.
 *
 * `tuya` va la primera: si quien llama ya es la cuenta de esa ficha, da igual
 * que el enlace esté usado o caducado — la pantalla le manda a su portal.
 *
 * El nombre del cliente solo sale cuando el enlace sirve (o es suyo). Con uno
 * anulado o caducado —un WhatsApp viejo— basta con saber a quién pedirle otro.
 */
CREATE OR REPLACE FUNCTION public.leer_invitacion(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite      public.client_invites;
  v_cliente     text;
  v_enlazado_a  uuid;
  v_entrenador  text;
  v_estado      text;
BEGIN
  SELECT * INTO v_invite FROM public.client_invites WHERE token = p_token;
  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT c.name, c.client_profile_id INTO v_cliente, v_enlazado_a
  FROM public.clients c WHERE c.id = v_invite.client_id;

  SELECT NULLIF(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), '') INTO v_entrenador
  FROM public.profiles p WHERE p.id = v_invite.created_by;

  v_estado := CASE
    WHEN auth.uid() IS NOT NULL AND v_enlazado_a = auth.uid() THEN 'tuya'
    WHEN v_invite.revoked_at IS NOT NULL THEN 'anulada'
    WHEN v_invite.claimed_at IS NOT NULL THEN 'usada'
    WHEN v_invite.expires_at <= now() THEN 'caducada'
    WHEN v_enlazado_a IS NOT NULL THEN 'enlazada'
    ELSE 'valida'
  END;

  RETURN jsonb_build_object(
    'estado', v_estado,
    'cliente', CASE WHEN v_estado IN ('valida', 'tuya')
                    THEN NULLIF(split_part(btrim(coalesce(v_cliente, '')), ' ', 1), '') END,
    'entrenador', v_entrenador,
    'caduca', v_invite.expires_at,
    'acceso_nuevo', EXISTS (
      SELECT 1 FROM public.client_invites o
      WHERE o.client_id = v_invite.client_id
        AND o.id <> v_invite.id
        AND o.claimed_at IS NOT NULL
    ),
    'bloqueo', CASE WHEN v_estado = 'tuya' THEN NULL
                    ELSE public.motivo_para_no_canjear(v_invite.created_by) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leer_invitacion(text) FROM public;
-- A propósito: la pantalla que la llama existe antes de la cuenta (ver arriba).
GRANT EXECUTE ON FUNCTION public.leer_invitacion(text) TO anon, authenticated;

-- ── 3. El canje, con la guarda compartida y mensajes que dicen qué hacer ───

/**
 * Canjea un token: enlaza la cuenta que llama con la ficha del cliente.
 *
 * La misma de la 0091 —el correo de la cuenta sellado en la ficha, las tres
 * pruebas de ser entrenador— con tres cambios:
 *
 *   · Las tres pruebas vienen de `motivo_para_no_canjear`, las mismas que ve la
 *     pantalla. El orden no cambia: quién canjea, antes que el estado del token.
 *   · Si quien llama YA es la cuenta de esa ficha, devuelve el nombre y no toca
 *     nada. Va antes que la guarda: la cuenta de un cliente no es de entrenador.
 *   · Cada error lleva su código en el HINT y una frase con la salida.
 *
 * Los permisos se conservan solos: sigue sin poder llamarla `authenticated`
 * (0018). La llama `claim_client_invite(text, text)`.
 */
CREATE OR REPLACE FUNCTION public.claim_client_invite(p_token text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite public.client_invites;
  v_name   text;
  v_email  text;
  v_motivo text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entra o crea tu cuenta para aceptar la invitación.'
      USING HINT = 'sin_sesion';
  END IF;

  SELECT * INTO v_invite
  FROM public.client_invites
  WHERE token = p_token
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Este enlace no es válido. Comprueba que lo has abierto entero o pídele a tu entrenador uno nuevo.'
      USING HINT = 'no_existe';
  END IF;

  -- Ya es suya: volver a abrir el enlace no es un error.
  SELECT name INTO v_name
  FROM public.clients
  WHERE id = v_invite.client_id AND client_profile_id = auth.uid();
  IF FOUND THEN
    RETURN v_name;
  END IF;

  v_motivo := public.motivo_para_no_canjear(v_invite.created_by);

  IF v_motivo = 'propia' THEN
    RAISE EXCEPTION 'Este enlace lo has generado tú. Si lo aceptas con tu propia cuenta, tu cuenta de entrenador pasaría a ser la de este cliente. Para probarlo, ábrelo en una ventana privada.'
      USING HINT = 'propia';
  END IF;
  IF v_motivo = 'entrenador' THEN
    RAISE EXCEPTION 'Estás dentro con una cuenta de entrenador que tiene clientes a su nombre. Cierra sesión y acepta la invitación con la cuenta del cliente.'
      USING HINT = 'entrenador';
  END IF;
  IF v_motivo = 'equipo' THEN
    RAISE EXCEPTION 'Estás dentro con una cuenta que forma parte del equipo de un entrenador. Cierra sesión y acepta la invitación con la cuenta del cliente.'
      USING HINT = 'equipo';
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Tu entrenador anuló este enlace. Pídele el nuevo.'
      USING HINT = 'anulada';
  END IF;
  IF v_invite.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este enlace ya se usó. Si fuiste tú, entra con la cuenta que creaste; si no, pídele a tu entrenador uno nuevo.'
      USING HINT = 'usada';
  END IF;
  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'Este enlace ha caducado. Pídele a tu entrenador uno nuevo: se genera al momento.'
      USING HINT = 'caducada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = v_invite.client_id AND client_profile_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Tu ficha ya tiene otra cuenta enlazada. Si es tuya, entra con ella; si la perdiste, pídele a tu entrenador un acceso nuevo.'
      USING HINT = 'ficha_enlazada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE client_profile_id = auth.uid() AND id <> v_invite.client_id
  ) THEN
    RAISE EXCEPTION 'Esta cuenta ya es la de otro cliente. Cierra sesión y crea una cuenta nueva, con otro correo, para aceptar esta invitación.'
      USING HINT = 'cuenta_enlazada';
  END IF;

  /*
    El correo con el que acaba de entrar, que a partir de aquí es el suyo (0091).
    `COALESCE` por si la cuenta no tuviera correo: se queda el que había.
  */
  SELECT NULLIF(btrim(u.email), '') INTO v_email FROM auth.users u WHERE u.id = auth.uid();

  UPDATE public.clients
  SET client_profile_id = auth.uid(),
      email = COALESCE(v_email, email)
  WHERE id = v_invite.client_id
  RETURNING name INTO v_name;

  UPDATE public.client_invites
  SET claimed_at = now(), claimed_by = auth.uid()
  WHERE id = v_invite.id;

  -- El rol del perfil pasa a 'client', que es lo que decide qué aplicación se
  -- carga al entrar. `profiles.role` no lo puede escribir el usuario (0002).
  UPDATE public.profiles SET role = 'client' WHERE id = auth.uid();

  RETURN v_name;
END;
$$;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Los permisos (t | t | f | f | t):
--
--   SELECT has_function_privilege('anon',          'public.leer_invitacion(text)', 'execute'),
--          has_function_privilege('authenticated', 'public.leer_invitacion(text)', 'execute'),
--          has_function_privilege('authenticated', 'public.motivo_para_no_canjear(uuid)', 'execute'),
--          has_function_privilege('authenticated', 'public.claim_client_invite(text)', 'execute'),
--          has_function_privilege('authenticated', 'public.claim_client_invite(text,text)', 'execute');
--
-- Sin sesión, sobre un token cualquiera (tiene que dar `no_existe`):
--
--   SELECT public.leer_invitacion('0000');
--
-- Los casos del canje, con sesiones de verdad: `supabase/tests/invitacion.test.js`
-- (`npm run test:db`).
--
-- ── Sin aplicar ─────────────────────────────────────────────────────────────
-- La pantalla de invitación no falla: sin `leer_invitacion` no sabe de quién es
-- el enlace ni en qué estado está, y se comporta como antes (pide la cuenta y
-- el canje dice lo que haya). Lo que se pierde es el aviso de «caducado» ANTES
-- de registrarse, el nombre del entrenador y la pantalla de «este enlace no es
-- para ti» (la guarda de la base sigue ahí: la 0091).
--
-- Para deshacer: volver a aplicar la 0091 (su `claim_client_invite(text)`) y
--   DROP FUNCTION public.leer_invitacion(text);
--   DROP FUNCTION public.motivo_para_no_canjear(uuid);
-- ============================================================================
