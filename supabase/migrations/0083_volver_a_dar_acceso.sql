-- ============================================================================
-- Volver a dar acceso a un cliente que ha perdido su cuenta
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. No cambia ninguna función existente: añade una que las usa.
--     Requiere `0015_client_invites.sql`.
--
-- ══ El callejón sin salida que cierra ══════════════════════════════════════
--
-- Un cliente olvida su contraseña, pulsa «he olvidado mi contraseña» y no le llega
-- nada. Pasó de verdad. La causa está en `docs/correo-transaccional.md`: el correo
-- de autenticación sale por el SMTP compartido de Supabase, que va limitado a unos
-- pocos envíos por hora **para el proyecto entero** y que en los proyectos nuevos
-- solo entrega a las direcciones del equipo. La API responde 200, la aplicación
-- dice «te hemos mandado un enlace» y no sale ningún correo.
--
-- Eso es configuración y se arregla con un SMTP propio. Lo que NO se arregla con
-- un SMTP propio es lo que venía detrás: **su entrenador no podía hacer nada**.
-- `create_client_invite` levanta «Este cliente ya tiene su cuenta enlazada» en
-- cuanto `client_profile_id` está puesto, así que la ficha quedaba inalcanzable y
-- la única salida era abrir el panel de Supabase y poner esa columna a NULL a
-- mano. Una aplicación cuyo procedimiento de recuperación es «entra a la base de
-- datos» no tiene procedimiento de recuperación.
--
-- Y el correo no es el único camino hasta aquí: una dirección que ya no existe, un
-- cliente que se registró con la cuenta de Google de su antigua empresa, o alguien
-- que sencillamente no recuerda con qué correo entró. Ninguno de esos tres lo
-- resuelve el SMTP.
--
-- ══ Por qué desenlazar y reinvitar, y no «cambiarle la contraseña» ═════════
--
-- La alternativa evidente sería dejar que el entrenador le pusiera una contraseña
-- nueva a la cuenta de su cliente. No se hace, y no por comodidad:
--
--   · Escribir en `auth.users` exige `service_role`. Eso es una Edge Function con
--     la llave maestra del proyecto, expuesta a una pantalla del entrenador.
--   · Convierte a cada entrenador en alguien que **puede entrar como su cliente**
--     y firmar cosas en su nombre. La ficha es suya; la identidad de su cliente,
--     no.
--   · No sirve para el caso «ya no tengo ese correo», que es la mitad de las veces.
--
-- Desenlazar y reinvitar no toca ninguna cuenta: suelta la ficha y emite el mismo
-- token de un solo uso de la `0015`. El cliente entra con una cuenta nueva —o con
-- Google— y **conserva todo su historial**, porque el historial cuelga de la ficha
-- y no de la cuenta. El entrenador nunca ve ni fija ninguna credencial.
--
-- ══ Lo que le pasa a la cuenta antigua ═════════════════════════════════════
--
-- Se queda sin ficha, con su `profiles.role = 'client'`. Si alguien entrara con
-- ella vería la pantalla de «tu cuenta aún no está vinculada» que ya existe en
-- `Client/ClientLayout.jsx`, sin acceso a nada. No se borra desde aquí: borrar
-- cuentas de `auth.users` no es cosa de una función que llama el entrenador, y la
-- persona a la que pertenece esa cuenta puede querer recuperarla el día que su
-- correo vuelva a funcionar.
--
-- Su consentimiento SIGUE registrado. La `0018` guarda `client_consents.profile_id`
-- aparte precisamente para esto —su comentario ya decía «esa columna puede cambiar
-- (una ficha se puede desenlazar y volver a enlazar)»—, así que la prueba de quién
-- aceptó qué y cuándo no se reescribe: se le añade una fila nueva al canjear. Esas
-- filas son, además, el rastro de cada cuenta que ha estado enlazada a una ficha.
-- ============================================================================

BEGIN;

/**
 * Suelta la ficha de su cuenta actual y devuelve un token de invitación nuevo.
 *
 * La llama EL ENTRENADOR sobre un cliente suyo. Devuelve el token, igual que
 * `create_client_invite`, para que la aplicación componga la misma URL de siempre.
 *
 * ── Por qué las tres cosas van en una función y no en tres llamadas ─────────
 * Una función es una transacción. Con tres llamadas desde el navegador existe el
 * estado intermedio «ficha desenlazada y sin invitación»: si la segunda falla —se
 * cae la red, se cierra el portátil— el cliente se queda fuera y el entrenador sin
 * enlace que mandarle, que es exactamente el agujero del que venimos. O pasan las
 * tres, o no pasa ninguna.
 *
 * ── Por qué reutiliza `create_client_invite` ───────────────────────────────
 * Mismo criterio que la `0018` con `claim_client_invite`: la generación del token
 * y su formato viven en un solo sitio. Duplicarlos aquí es garantizar que el día
 * que uno cambie —la caducidad, la entropía— el otro no se entere. Al correr en la
 * misma transacción, la llamada ve la columna ya puesta a NULL y toma el camino
 * normal.
 */
CREATE OR REPLACE FUNCTION public.reissue_client_access(target uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_previous uuid;
BEGIN
  IF NOT public.is_my_client(target) THEN
    RAISE EXCEPTION 'Ese cliente no es tuyo';
  END IF;

  /*
    `FOR UPDATE` y no un SELECT a secas: entre leer la columna y ponerla a NULL
    cabe un canje de otra invitación viva. Sin el bloqueo, esa carrera acaba con
    la ficha enlazada a una cuenta y con un token nuevo circulando por WhatsApp
    que la enlazaría a una segunda.
  */
  SELECT client_profile_id INTO v_previous
  FROM public.clients
  WHERE id = target
  FOR UPDATE;

  /*
    Sin cuenta enlazada esto no es lo que hace falta: es «Invitar» a secas, y
    tiene su propio botón. Decirlo en vez de emitir el token igualmente, porque
    llegar aquí con la ficha libre significa que la pantalla está enseñando el
    gesto equivocado y eso hay que poder verlo.
  */
  IF v_previous IS NULL THEN
    RAISE EXCEPTION 'Esta ficha no tiene ninguna cuenta enlazada: mándale una invitación normal';
  END IF;

  UPDATE public.clients
  SET client_profile_id = NULL
  WHERE id = target;

  /*
    Las invitaciones vivas se anulan antes de emitir la nueva.

    No es limpieza: `create_client_invite` REUTILIZA la invitación viva que
    encuentre, así que sin esto el entrenador recibiría un token viejo —el de un
    WhatsApp de hace diez días, quizá reenviado— en lugar de uno recién emitido.
    Y el propósito de este gesto es justamente cortar los accesos anteriores.
  */
  UPDATE public.client_invites
  SET revoked_at = now()
  WHERE client_id = target
    AND claimed_at IS NULL
    AND revoked_at IS NULL;

  RETURN public.create_client_invite(target);
END;
$$;

REVOKE ALL ON FUNCTION public.reissue_client_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reissue_client_access(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- Después de aplicarla
-- ----------------------------------------------------------------------------
-- Desde la ficha de un cliente enlazado: «Acceso al portal» → «Perdió el acceso» →
-- confirmar. El enlace se copia solo. Comprobación en la base de datos:
--
--   SELECT c.name, c.client_profile_id, i.token, i.created_at, i.revoked_at
--   FROM public.clients c
--   LEFT JOIN public.client_invites i ON i.client_id = c.id
--   WHERE c.id = '<uuid>'
--   ORDER BY i.created_at DESC;
--
-- Tiene que quedar `client_profile_id` a NULL, la invitación anterior con
-- `revoked_at` puesto, y una fila nueva sin canjear.
--
-- ── Lo que esto NO resuelve ────────────────────────────────────────────────
-- · **El correo sigue sin llegar.** Esto es la salida de emergencia, no el
--   arreglo: el restablecimiento de contraseña seguirá fallando en silencio
--   mientras el proyecto use el SMTP compartido de Supabase. El procedimiento
--   está en `docs/correo-transaccional.md` §1–§3 y es trabajo de cuenta y DNS.
-- · **Las cuentas huérfanas.** Se quedan en `auth.users` sin ficha. No estorban
--   —no ven nada— pero nadie las recoge.
-- ============================================================================
