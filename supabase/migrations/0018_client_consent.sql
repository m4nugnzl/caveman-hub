-- ============================================================================
-- Consentimiento del cliente
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva en el esquema, pero **cambia quién puede canjear una invitación**.
--     Requiere `0015_client_invites.sql`, y hay que aplicarla y desplegar el
--     código SEGUIDO: en cualquiera de los dos órdenes queda un rato en el que
--     canjear falla —sin migración no existe la función de dos argumentos; con
--     ella, la de uno ya no la puede llamar `authenticated`—. No se pierde nada:
--     el enlace vive catorce días y se canjea después.
--
-- ══ Lo que faltaba ═════════════════════════════════════════════════════════
--
-- Esta aplicación guarda peso, perímetros, pliegues cutáneos y **fotos del cuerpo**.
-- Son datos de salud: la categoría especial del artículo 9 del RGPD, la que no se
-- puede tratar por «interés legítimo» ni porque venga bien. Hace falta
-- consentimiento explícito de la persona, y hace falta poder DEMOSTRARLO.
--
-- Hasta ahora el cliente canjeaba su invitación y empezaba a subir fotos sin que
-- en ningún momento se le hubiera dicho quién las ve ni para qué. Exportar y
-- borrar sus datos ya estaba resuelto (`auditoria.md` 3.5); esto es la tercera
-- pata y la única que quedaba abierta.
--
-- ══ Por qué se registra al canjear y no después ════════════════════════════
--
-- El canje es el instante EXACTO en que empieza el tratamiento: antes de él la
-- ficha existe pero no hay relación con la persona, y justo después ya puede subir
-- una foto. Pedirlo más tarde —un aviso la primera vez que abre las fotos— dejaría
-- un tramo en el que ya se están tratando sus datos sin base para hacerlo.
--
-- Y va en la MISMA transacción que el enlace, no en dos llamadas seguidas: una
-- función es una transacción, así que o queda constancia del consentimiento y la
-- cuenta enlazada, o no queda ninguna de las dos cosas. Con dos llamadas existiría
-- el caso de «enlazado sin consentimiento registrado», que es precisamente el
-- estado que esta migración viene a hacer imposible.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_consents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- `ON DELETE CASCADE` a propósito: el derecho de supresión incluye esto. Cuando
  -- se borra un cliente desaparece también la prueba de su consentimiento, que es
  -- lo correcto —no se puede conservar un registro de alguien a quien se ha
  -- borrado— y además evita que `deleteClientCompletely` tenga que aprenderse una
  -- tabla más.
  client_id   uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,

  -- Quién lo aceptó. No se deriva de `clients.client_profile_id` porque esa
  -- columna puede cambiar (una ficha se puede desenlazar y volver a enlazar), y
  -- entonces la prueba pasaría a señalar a otra persona.
  profile_id  uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- QUÉ texto aceptó. Sin esto, la prueba dice «aceptó algo» y no sirve: el día
  -- que cambie la información que se le da, hay que poder distinguir a quién se le
  -- enseñó una versión y a quién otra.
  version     text NOT NULL,

  accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_consents_client_idx ON public.client_consents (client_id);

ALTER TABLE public.client_consents ENABLE ROW LEVEL SECURITY;

/*
  Leen los dos implicados: el cliente, porque tiene derecho a saber qué aceptó y
  cuándo; y su entrenador, porque es quien tiene que poder demostrarlo.

  No hay política de INSERT, UPDATE ni DELETE, y eso es el punto: una prueba que el
  interesado puede escribir a mano no prueba nada, y una que se puede editar
  después, tampoco. La única escritura es la de la función de canje, que corre como
  `SECURITY DEFINER` y por tanto salta RLS.
*/
DROP POLICY IF EXISTS "consents_read" ON public.client_consents;
CREATE POLICY "consents_read" ON public.client_consents
  FOR SELECT TO authenticated
  USING (public.is_me(client_id) OR public.is_my_client(client_id));

COMMIT;


BEGIN;

/**
 * Canjea un token dejando constancia del consentimiento.
 *
 * ── Por qué es una sobrecarga y no un reemplazo ─────────────────────────────
 * La versión de un solo argumento SIGUE EXISTIENDO porque esta la llama: todas las
 * comprobaciones del canje —token vivo, ficha libre, cuenta libre— viven ahí y
 * duplicarlas sería garantizar que las dos copias divergen.
 *
 * Lo que cambia es quién puede llamarla: al final de esta migración se le retira el
 * permiso a `authenticated`. Deja de ser una operación de la aplicación y pasa a
 * ser una pieza interna de esta. Como las funciones `SECURITY DEFINER` se ejecutan
 * con los permisos de su dueño, la llamada de aquí dentro sigue funcionando.
 *
 * El efecto práctico: **ya no hay ninguna forma de enlazar una cuenta sin registrar
 * el consentimiento**, ni siquiera llamando a la API a mano. Si la comprobación
 * viviera solo en el navegador, saltársela sería abrir las herramientas de
 * desarrollo.
 *
 * PostgREST distingue las dos por el nombre de los argumentos que se le pasan, así
 * que convivir no las hace ambiguas.
 */
CREATE OR REPLACE FUNCTION public.claim_client_invite(p_token text, p_consent_version text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name      text;
  v_client_id uuid;
BEGIN
  IF p_consent_version IS NULL OR btrim(p_consent_version) = '' THEN
    RAISE EXCEPTION 'Falta la versión del consentimiento';
  END IF;

  -- Hace el trabajo y lanza excepción con un motivo legible si el token no sirve.
  -- Al ser la misma transacción, cualquier fallo posterior deshace también esto.
  v_name := public.claim_client_invite(p_token);

  SELECT client_id INTO v_client_id
  FROM public.client_invites
  WHERE token = p_token;

  INSERT INTO public.client_consents (client_id, profile_id, version)
  VALUES (v_client_id, auth.uid(), btrim(p_consent_version));

  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_client_invite(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_client_invite(text, text) TO authenticated;

-- La puerta de atrás se cierra: canjear sin dejar constancia deja de ser posible.
REVOKE EXECUTE ON FUNCTION public.claim_client_invite(text) FROM authenticated;

COMMIT;

-- ============================================================================
-- Después de aplicarla
-- ----------------------------------------------------------------------------
-- Comprobación rápida, con una invitación de prueba: canjearla desde la aplicación
-- y mirar que aparece la fila.
--
--   SELECT c.name, k.version, k.accepted_at
--   FROM public.client_consents k
--   JOIN public.clients c ON c.id = k.client_id
--   ORDER BY k.accepted_at DESC;
--
-- ── Lo que esto NO resuelve ────────────────────────────────────────────────
-- · **Los clientes ya enlazados.** Los que entraron antes de esta migración no
--   tienen fila, y no se les puede inventar una: el consentimiento se da, no se
--   deduce. Hay que pedírselo dentro de la aplicación, y eso es una pantalla
--   aparte que aquí no está.
-- · **Retirarlo.** Hoy se retira pidiéndole al entrenador que borre los datos, que
--   sí está implementado. Un botón propio del cliente es otra fase.
-- ============================================================================
