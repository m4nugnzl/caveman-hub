-- ============================================================================
-- Un solo consentimiento
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Añade una columna con valor por defecto a `client_consents` y una
--     función para RETIRAR el consentimiento. No borra ninguna fila y no cambia
--     el significado de las que ya hay: todas las existentes son concesiones, y
--     así quedan marcadas.
--
-- ══ El problema: había DOS sistemas ═════════════════════════════════════════
--
-- El consentimiento del cliente —dato de categoría especial: fotos corporales,
-- peso, pliegues— se recogía y se guardaba de dos formas que no se conocían:
--
--   1. `client_consents` (esta tabla, 0018). La escribe el canje de la invitación
--      y `record_my_consent` (0023). Es prueba archivada, append-only, sin
--      política de escritura: el interesado no la puede fabricar ni editar.
--
--   2. `clients.preferences.consent`, un objeto JSONB que escribía la propia
--      aplicación desde dos pantallas del portal.
--
-- Cada uno con su propia constante de versión, y ni siquiera del mismo tipo:
-- `'2026-08'` en `ConsentNotice.jsx` y `1` en `domain/privacy.js`. Subir una para
-- volver a pedir el consentimiento tras cambiar el texto NO subía la otra.
--
-- Y los dos se contradecían en producto: la puerta (`ConsentGate`) cortaba el
-- paso argumentando que detrás está el tratamiento; el panel de dentro
-- (`ClientLayout`) argumentaba que no debe bloquear porque un consentimiento que
-- no se puede rechazar sin perder el servicio no es libre. Las dos razones son
-- buenas y no pueden convivir en el mismo producto.
--
-- ══ Qué se decide ══════════════════════════════════════════════════════════
--
-- Se queda **la tabla**, por tres motivos y no por descarte:
--
--   · Es la única que vale como prueba. Un consentimiento guardado en un campo
--     que la aplicación puede reescribir no demuestra nada.
--   · Es la que ya escribe el canje de la invitación, o sea el 100 % de los
--     clientes nuevos.
--   · Conserva el HISTORIAL. Con la columna que añade esta migración se puede
--     contestar «lo dio, lo retiró en marzo y lo volvió a dar en mayo», que es
--     justo lo que hay que poder demostrar.
--
-- Lo que le faltaba era poder RETIRARLO, que es un derecho y solo existía en el
-- lado que se retira. Se añade aquí.
--
-- ══ Por qué una fila nueva y no un UPDATE ═══════════════════════════════════
--
-- Porque la tabla es una prueba y una prueba no se edita. Retirar el
-- consentimiento escribe UNA FILA MÁS, de tipo `withdrawn`. El estado actual es
-- el tipo de la última fila. Así el rastro queda entero y sigue sin haber
-- ninguna política de UPDATE ni de DELETE.
-- ============================================================================

BEGIN;

/*
  `granted` para todo lo que ya existe: hasta hoy la única forma de tener una
  fila era haber aceptado. El DEFAULT hace que las filas viejas queden marcadas
  correctamente sin tocarlas.
*/
ALTER TABLE public.client_consents
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'granted';

ALTER TABLE public.client_consents
  DROP CONSTRAINT IF EXISTS client_consents_kind_check;
ALTER TABLE public.client_consents
  ADD CONSTRAINT client_consents_kind_check CHECK (kind IN ('granted', 'withdrawn'));

/* Se consulta «la última fila de este cliente» en cada comprobación. */
CREATE INDEX IF NOT EXISTS client_consents_ultimo_idx
  ON public.client_consents (client_id, accepted_at DESC);

COMMIT;


BEGIN;

/**
 * El estado actual del consentimiento de quien llama, o de un cliente suyo.
 *
 * Devuelve la ÚLTIMA fila, sea concesión o retirada, para que la aplicación no
 * tenga que reimplementar «la más reciente» en tres pantallas distintas.
 *
 * `SECURITY INVOKER` a propósito: que la política `consents_read` haga su
 * trabajo. Solo ven esto el propio cliente y su entrenador, que es exactamente
 * lo que ya decía la 0018.
 */
CREATE OR REPLACE FUNCTION public.consent_state(p_client uuid)
RETURNS TABLE (kind text, version text, at timestamptz)
LANGUAGE sql SECURITY INVOKER STABLE SET search_path = public AS $$
  SELECT k.kind, k.version, k.accepted_at
  FROM public.client_consents k
  WHERE k.client_id = p_client
  ORDER BY k.accepted_at DESC
  LIMIT 1;
$$;

/**
 * Retirar el consentimiento. Lo ejerce el interesado, nadie más.
 *
 * ── Por qué NO borra nada ───────────────────────────────────────────────────
 * Retirar el consentimiento no es lo mismo que ejercer el derecho de supresión.
 * Lo primero dice «deja de tratar mis datos»; lo segundo, «bórralos». Esta
 * función hace lo primero y deja constancia de CUÁNDO, que es lo que después hay
 * que poder demostrar. Borrar es otra cosa y ya tiene su camino, en la ficha.
 *
 * ── Y por qué la puede llamar cualquiera con sesión ─────────────────────────
 * Porque solo puede retirar EL SUYO: el cliente se resuelve desde `auth.uid()`,
 * no desde un argumento. Sin ficha enlazada no hace nada.
 */
CREATE OR REPLACE FUNCTION public.withdraw_my_consent(p_version text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client uuid;
BEGIN
  SELECT id INTO v_client FROM public.clients WHERE client_profile_id = auth.uid();
  IF v_client IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.client_consents (client_id, profile_id, version, kind)
  VALUES (v_client, auth.uid(), btrim(coalesce(p_version, 'sin-version')), 'withdrawn');

  RETURN true;
END;
$$;

/**
 * `needs_consent`, ahora consciente de la retirada.
 *
 * Antes preguntaba «¿existe alguna fila con esta versión?». Con la retirada eso
 * se queda corto: quien acepta, retira y vuelve a entrar tenía su fila de
 * aceptación intacta, así que la puerta le dejaba pasar como si nada — el
 * derecho a retirarlo no habría servido de nada.
 *
 * Ahora mira la ÚLTIMA fila: hace falta consentimiento si no hay ninguna, si la
 * última es una retirada, o si es de una versión distinta de la vigente.
 */
CREATE OR REPLACE FUNCTION public.needs_consent(p_version text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_client uuid;
  v_kind   text;
  v_ver    text;
BEGIN
  SELECT id INTO v_client FROM public.clients WHERE client_profile_id = auth.uid();
  IF v_client IS NULL THEN
    RETURN false;
  END IF;

  SELECT k.kind, k.version INTO v_kind, v_ver
  FROM public.client_consents k
  WHERE k.client_id = v_client
  ORDER BY k.accepted_at DESC
  LIMIT 1;

  RETURN v_kind IS DISTINCT FROM 'granted' OR v_ver IS DISTINCT FROM btrim(p_version);
END;
$$;

REVOKE ALL ON FUNCTION public.consent_state(uuid) FROM public;
REVOKE ALL ON FUNCTION public.withdraw_my_consent(text) FROM public;
REVOKE ALL ON FUNCTION public.needs_consent(text) FROM public;

REVOKE ALL ON FUNCTION public.consent_state(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.withdraw_my_consent(text) FROM anon;

GRANT EXECUTE ON FUNCTION public.consent_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_my_consent(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.needs_consent(text) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Todas las filas anteriores quedan como concesiones:
--
--   SELECT kind, count(*) FROM public.client_consents GROUP BY 1;
--   -- granted | n
--
-- El historial de una persona, que es lo que hay que poder enseñar:
--
--   SELECT kind, version, accepted_at
--   FROM public.client_consents
--   WHERE client_id = '<id>'
--   ORDER BY accepted_at;
--
-- Y que retirar vuelve a cerrar la puerta: con la sesión de un cliente que ya
-- aceptó, `needs_consent` da `false`; después de `withdraw_my_consent`, `true`.
--
-- Lo fija `supabase/tests/autorizacion.test.js`.
-- ============================================================================
