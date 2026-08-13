-- ============================================================================
-- El consentimiento de los que ya estaban
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Requiere `0018_client_consent.sql`. No cambia ningún permiso
--     existente: solo añade una función para que el cliente registre el suyo.
--
-- ══ El hueco que queda después de la 0018 ══════════════════════════════════
--
-- Aquella migración hizo imposible enlazar una cuenta sin dejar constancia del
-- consentimiento. Pero solo mira hacia delante: **los clientes que ya tenían su
-- cuenta enlazada no tienen fila**, y no se les puede inventar una —el
-- consentimiento se da, no se deduce de que alguien lleve seis meses usando el
-- portal—.
--
-- Así que hay que pedírselo. Esta migración pone la pieza de servidor; la
-- pantalla que lo pide vive en el portal del cliente.
--
-- ══ Por qué una función y no un INSERT ═════════════════════════════════════
--
-- `client_consents` no tiene política de INSERT, y eso es justo lo que la hace
-- valer como prueba: si el interesado pudiera escribir la fila a mano, también
-- podría escribir la de otro, o cambiar la fecha de la suya. La función es la
-- única puerta, y solo deja registrar el consentimiento de UNO MISMO.
-- ============================================================================

BEGIN;

/**
 * Registra el consentimiento de quien llama, sobre su propia ficha.
 *
 * Devuelve `true` si ha escrito una fila y `false` si ya la había: llamarla dos
 * veces no duplica la prueba ni mueve su fecha, que es lo que importa de un
 * registro que existe para demostrar CUÁNDO se dio.
 */
CREATE OR REPLACE FUNCTION public.record_my_consent(p_version text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesión';
  END IF;

  IF p_version IS NULL OR btrim(p_version) = '' THEN
    RAISE EXCEPTION 'Falta la versión del consentimiento';
  END IF;

  -- La ficha de quien llama. Si no tiene, no hay nada que consentir: es un
  -- entrenador, o una cuenta sin enlazar.
  SELECT id INTO v_client FROM public.clients WHERE client_profile_id = auth.uid();
  IF v_client IS NULL THEN
    RETURN false;
  END IF;

  -- Ya consintió esta versión. No se toca: la fecha de la primera vez es el dato.
  IF EXISTS (
    SELECT 1 FROM public.client_consents
    WHERE client_id = v_client AND profile_id = auth.uid() AND version = btrim(p_version)
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.client_consents (client_id, profile_id, version)
  VALUES (v_client, auth.uid(), btrim(p_version));

  RETURN true;
END;
$$;

/**
 * ¿Le falta a quien llama consentir esta versión?
 *
 * Existe porque la pantalla necesita saberlo ANTES de enseñar nada, y hacerlo con
 * un SELECT sobre `client_consents` obligaría a la aplicación a saber cómo se
 * decide eso. Aquí la regla vive en un sitio.
 *
 * Un entrenador siempre responde `false`: esto es de los clientes.
 */
CREATE OR REPLACE FUNCTION public.needs_consent(p_version text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_client uuid;
BEGIN
  SELECT id INTO v_client FROM public.clients WHERE client_profile_id = auth.uid();
  IF v_client IS NULL THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.client_consents
    WHERE client_id = v_client AND profile_id = auth.uid() AND version = btrim(p_version)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_my_consent(text) FROM public;
REVOKE ALL ON FUNCTION public.needs_consent(text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_my_consent(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.needs_consent(text) TO authenticated;

COMMIT;

-- ============================================================================
-- Consecuencia de producto, para que no sorprenda
-- ----------------------------------------------------------------------------
-- Al subir `CONSENT_VERSION` en la aplicación, TODOS los clientes vuelven a ver
-- la pantalla de consentimiento la próxima vez que entren. Es lo correcto —si
-- cambia lo que se guarda o quién lo ve, el consentimiento anterior no cubre lo
-- nuevo— pero conviene saberlo antes de tocar una coma del texto.
--
-- Quién ha consentido y qué versión:
--
--   SELECT c.name, k.version, k.accepted_at
--   FROM public.clients c
--   LEFT JOIN public.client_consents k ON k.client_id = c.id
--   WHERE c.client_profile_id IS NOT NULL
--   ORDER BY k.accepted_at NULLS FIRST;
-- ============================================================================
