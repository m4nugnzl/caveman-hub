-- ============================================================================
-- El cliente dice quién es (y su correo sale de su cuenta)
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para el bloque «Quién eres» del alta del cliente. Sin ella, la
--     pantalla se enseña y GUARDAR falla con «Could not find the function
--     set_client_identity», con su aviso. Es ADITIVA: una función nueva y el
--     reemplazo de `claim_client_invite(text)`. Ni un ALTER, ni un DELETE, ni un
--     dato que se toque.
--
-- ══ El agujero que tapa ════════════════════════════════════════════════════
--
-- La cabecera de la ficha son cuatro hechos —edad, altura, peso y sexo
-- (`domain/ficha.js`)— y son los cuatro que entran en cualquier cuenta: el gasto
-- energético, las zonas de pulso, el ratio cintura/altura, la fórmula de
-- pliegues. Hasta hoy los cuatro los tecleaba el ENTRENADOR en la ficha, y el
-- cuestionario de alta —que es el sitio donde la persona cuenta cosas de sí
-- misma— preguntaba a qué hora entrena y no preguntaba cuántos años tiene.
--
-- El resultado era el previsible: fichas dadas de alta con los cuatro huecos, y
-- el dato pedido por WhatsApp cuando hacía falta la cuenta.
--
-- ══ Por qué hace falta una función, y no una política ══════════════════════
--
-- Lo mismo que razonó la 0080 con el perfil: `0002_rls_hardening.sql` deja
-- `clients` en SOLO LECTURA para el cliente, y con razón — RLS filtra FILAS y no
-- columnas, así que darle UPDATE sobre la suya le devuelve el poder de ponerse
-- `payment_status = 'paid'` o reasignarse de entrenador. El candado por columna
-- tampoco vale: el entrenador y el cliente comparten el rol `authenticated` y un
-- GRANT no distingue entre ellos.
--
-- Así que la salida es la de siempre en este proyecto: una `SECURITY DEFINER`
-- que escribe EXACTAMENTE dos columnas después de comprobar quién llama.
--
-- ══ Por qué el PESO no está aquí ═══════════════════════════════════════════
--
-- Porque no es un dato de la ficha: es una serie. Ya costó una columna —la 0048
-- tuvo que borrar `clients.current_weight` por enseñar el valor congelado del día
-- que se dejó de rellenar— y la regla quedó escrita en `domain/ficha.js`: la
-- ficha guarda lo CONSTANTE, lo que evoluciona vive en su histórico.
--
-- El peso que teclea en su alta entra donde entra el de cada semana, en
-- `anthropometry`, y ahí el cliente ya tenía permiso desde la 0002
-- (`anthro_client_insert`). No hacía falta nada nuevo, y por eso no hay nada.
--
-- ══ Los `COALESCE`, que son la decisión importante ═════════════════════════
--
-- Un argumento en `NULL` NO borra: deja la columna como estaba. Es lo contrario
-- de lo que hace el entrenador desde la ficha, que manda el formulario entero
-- —vacíos incluidos— porque él sí tiene que poder BORRAR un dato mal puesto.
--
-- Desde el portal, en cambio, guardar el bloque con la altura sin rellenar tiene
-- que dejar la altura que ya hubiera. Si no, el cliente que abre su alta para
-- corregir la edad se lleva por delante lo que su entrenador le tomó con el
-- tallímetro. Mezclar y no reemplazar: la misma decisión que la 0080.
--
-- ══ Y el correo, que sale de la CUENTA ═════════════════════════════════════
--
-- `clients.email` lo tecleaba el entrenador al dar de alta, de memoria o copiado
-- de un chat, y desde ese momento no lo verificaba nadie. La dirección buena
-- —la única que se sabe que existe, porque con ella se ha entrado— está en
-- `auth.users` desde que la persona canjea su invitación, y no se estaba mirando.
--
-- Se sella en los dos sitios donde se puede saber:
--
--   · **Al canjear** (`claim_client_invite`), que es el instante en que la ficha
--     y la cuenta se enlazan. Es el sitio natural y cubre a todo el que entre a
--     partir de ahora.
--   · **Al guardar su alta** (`set_client_identity`), que cubre a los que ya
--     estaban enlazados antes de esta migración y al que cambie de correo
--     después. Sin esto haría falta una pasada de datos, y una pasada de datos
--     sobre correos es exactamente lo que no se quiere hacer a ciegas.
--
-- ── El detalle que lo haría destructivo, y por eso está mirado ─────────────
-- `set_client_identity` la puede llamar también el entrenador. Si sellara el
-- correo sin mirar quién llama, el entrenador que tocara el bloque escribiría SU
-- dirección en la ficha de su cliente. Por eso el sello va condicionado a que
-- quien llama SEA el cliente (`client_profile_id = auth.uid()`), y no a que
-- tenga permiso de escritura.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.app_can_write_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existen las funciones app_*_client.';
  END IF;
  IF to_regprocedure('public.claim_client_invite(text)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0015_client_invites.sql: `claim_client_invite` es lo que esta migración amplía.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'height_cm'
  ) THEN
    RAISE EXCEPTION 'Falta 0076_la_ficha_de_la_persona.sql: no existen `birth_date` ni `height_cm`.';
  END IF;
END $$;

BEGIN;

-- ── 1. Su edad y su altura, escritas por él ────────────────────────────────

/**
 * Escribe `birth_date` y `height_cm` de una ficha, y nada más.
 *
 * Los topes repiten los CHECK de la columna (0076) a propósito: el mensaje de un
 * CHECK violado nombra el constraint y no dice qué hacer, y esto lo lee un
 * cliente en su portal. Que no esté en el futuro solo se puede comprobar aquí —
 * un CHECK exige funciones inmutables y `CURRENT_DATE` no lo es.
 */
CREATE OR REPLACE FUNCTION public.set_client_identity(
  target       uuid,
  p_birth_date date    DEFAULT NULL,
  p_height_cm  numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  /* `SECURITY DEFINER` salta RLS, así que esta lectura ve la fila exista de
     quien exista. No decide el permiso —eso lo hace el WHERE de abajo—: decide
     si el correo se sella, que es cosa distinta. */
  v_es_el_cliente boolean;
  v_email         text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesión';
  END IF;

  IF p_birth_date IS NOT NULL
     AND (p_birth_date > CURRENT_DATE OR p_birth_date <= DATE '1900-01-01') THEN
    RAISE EXCEPTION 'Esa fecha de nacimiento no es posible';
  END IF;

  IF p_height_cm IS NOT NULL AND (p_height_cm <= 0 OR p_height_cm >= 300) THEN
    RAISE EXCEPTION 'Esa altura no es posible';
  END IF;

  SELECT c.client_profile_id = auth.uid()
    INTO v_es_el_cliente
    FROM public.clients c
   WHERE c.id = target;

  IF v_es_el_cliente THEN
    /* La dirección de la cuenta con la que ha entrado, que es la única que se
       sabe que existe. Se lee de `auth.users` y no del token: quien cambió su
       correo hace cinco minutos sigue trayendo el viejo en el JWT hasta que se
       renueve. */
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = auth.uid();
    v_email := NULLIF(btrim(v_email), '');
  END IF;

  UPDATE public.clients
     SET birth_date = COALESCE(p_birth_date, birth_date),
         height_cm  = COALESCE(p_height_cm, height_cm),
         email      = COALESCE(v_email, email)
   WHERE id = target
     AND (public.app_can_write_client(target) OR client_profile_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tienes permiso para escribir en la ficha de ese cliente';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_client_identity(uuid, date, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_client_identity(uuid, date, numeric) TO authenticated;

-- ── 2. Al canjear, el correo de la cuenta entra en la ficha ────────────────

/**
 * Canjea un token: enlaza la cuenta que llama con la ficha del cliente.
 *
 * La misma función de la 0084 —las tres pruebas de ser entrenador incluidas, sin
 * tocar una línea— con el correo de la cuenta escrito en la ficha al enlazar.
 *
 * ── Los permisos se conservan solos ────────────────────────────────────────
 * `CREATE OR REPLACE` sobre una función existente MANTIENE sus permisos, así que
 * el `REVOKE EXECUTE … FROM authenticated` que le puso la 0018 —para que nadie
 * enlace sin registrar el consentimiento— sigue en pie sin repetirlo. Escribir
 * aquí un GRANT de más sería reabrir esa puerta.
 */
CREATE OR REPLACE FUNCTION public.claim_client_invite(p_token text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite public.client_invites;
  v_name   text;
  v_email  text;
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

  /*
    El correo con el que acaba de entrar, que a partir de aquí es el suyo.

    Pisa lo que hubiera escrito el entrenador a propósito: eso se tecleó de
    memoria o se copió de un chat y no lo ha verificado nadie, mientras que ésta
    es la dirección con la que se ha iniciado sesión. `COALESCE` por si la cuenta
    no tuviera correo —hay proveedores que no lo dan—: entonces se queda lo que
    ya había, que es mejor que un hueco.
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
-- Que anon no puede llamar a la función nueva y `authenticated` sí (f | t):
--
--   SELECT has_function_privilege('anon',          'public.set_client_identity(uuid,date,numeric)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.set_client_identity(uuid,date,numeric)', 'EXECUTE');
--
-- Que los permisos del canje siguen como los dejó la 0018 (f | t):
--
--   SELECT has_function_privilege('authenticated', 'public.claim_client_invite(text)',      'execute'),
--          has_function_privilege('authenticated', 'public.claim_client_invite(text,text)', 'execute');
--
-- Que un NULL no borra (la segunda llamada tiene que dejar la altura puesta):
--
--   SELECT public.set_client_identity('<id>', NULL, 176);
--   SELECT public.set_client_identity('<id>', DATE '1991-04-02', NULL);
--   SELECT birth_date, height_cm FROM public.clients WHERE id = '<id>';
--   -- → 1991-04-02 | 176
--
-- Que el disparate se corta con palabras (tiene que dar «Esa altura no es
-- posible», no un error de constraint):
--
--   SELECT public.set_client_identity('<id>', NULL, 450);
--
-- Desde la APLICACIÓN: entrar COMO CLIENTE en «Tu alta» → «Quién eres», poner
-- edad, altura y peso y guardar. En la ficha del entrenador, la cabecera tiene
-- que decir los cuatro hechos —edad, altura, peso y sexo— y el correo tiene que
-- ser el de la cuenta con la que ha entrado el cliente.
--
-- ── Sin aplicar ─────────────────────────────────────────────────────────────
-- El bloque «Quién eres» se enseña y falla al GUARDAR, con su aviso nombrando
-- esta migración. El peso sí entra —va por `anthropometry`, que no depende de
-- esto—. Lo del entrenador no cambia: él escribe por UPDATE directo desde la
-- ficha, y el canje sigue funcionando con la versión de la 0084.
-- ============================================================================
