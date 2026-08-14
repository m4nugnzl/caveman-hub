-- ============================================================================
-- El resumen configurado UNA vez, no una por cliente
-- ----------------------------------------------------------------------------
-- Añade `profiles.preferences` y una función para aplicar el panel a toda la
-- cartera. No cambia ninguna política ni toca los paneles ya configurados.
--
-- ══ El problema ════════════════════════════════════════════════════════════
--
-- El resumen de cada cliente es configurable —qué widgets, qué tarjetas, en qué
-- orden— y esa configuración vive en `clients.preferences`, es decir **por
-- cliente**. Tiene sentido: un cliente que compite y otro que quiere bajar diez
-- kilos no necesitan ver lo mismo.
--
-- Pero en la práctica el entrenador tiene UNA forma de mirar a sus clientes, y
-- ahora mismo la tiene que reproducir a mano tantas veces como clientes tenga.
-- Con veinte, son veinte veces. Y cuando cambia de opinión, otras veinte.
--
-- El resultado real es que nadie personaliza nada: se queda el panel por defecto
-- porque configurarlo no compensa.
--
-- ══ La distinción que hacía falta ══════════════════════════════════════════
--
-- Hay dos preguntas distintas y hasta ahora solo existía la segunda:
--
--   · **«¿Cómo miro yo a mis clientes?»** → del ENTRENADOR. Es lo que se repite.
--   · **«¿Qué necesita ver ESTE cliente?»** → del cliente. Es la excepción.
--
-- Esta migración añade la primera. La segunda no cambia: lo que ya esté puesto en
-- la ficha de un cliente sigue mandando sobre el predeterminado, porque si el
-- entrenador se molestó en ajustar el panel de Marta fue por algo.
--
-- ══ Por qué en `profiles` y no en `teams` ══════════════════════════════════
--
-- Porque es una preferencia de PERSONA, no de negocio. En un equipo de cuatro,
-- cada entrenador mira a sus clientes como quiere; guardarlo en el equipo haría
-- que el último en tocarlo se lo cambiara a los otros tres.
--
-- Y `profiles` ya tiene política de escritura propia (`profiles_update_own`, de
-- la 0002), así que la columna es escribible por su dueño sin añadir nada.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla `profiles`.';
  END IF;
END $$;

BEGIN;

/*
  Objeto abierto, igual que `clients.preferences`. La aplicación ignora lo que no
  conoce y rellena lo que falta (`domain/preferences.js`), así que añadir una
  preferencia nueva mañana no necesita migración.
*/
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;


BEGIN;

/**
 * Aplica un panel a TODOS mis clientes de golpe.
 *
 * ── Por qué una función y no veinte llamadas desde el navegador ─────────────
 * Porque veinte llamadas son veinte transacciones: si la novena falla, quedan
 * ocho clientes con el panel nuevo y doce con el viejo, y no hay forma de saber
 * cuáles sin mirarlos uno a uno. Aquí o se aplica a todos o no se aplica a
 * ninguno.
 *
 * ── Qué escribe exactamente ─────────────────────────────────────────────────
 * SOLO la clave `dashboard`. El resto de `preferences` —el objetivo del cliente
 * (`goal`, que usa `domain/goals.js`), y lo que venga después— se conserva
 * intacto con el operador `||`, que fusiona por nivel superior.
 *
 * Sustituir el objeto entero borraría el objetivo declarado de veinte clientes de
 * una tacada, y la analítica dejaría de poder juzgar a nadie sin que nada
 * indicara por qué.
 *
 * ── Alcance ─────────────────────────────────────────────────────────────────
 * `can_write_client` decide, igual que en todo lo demás: un `trainer` se lo
 * aplica a los suyos y no a los del compañero. Los archivados quedan fuera —no se
 * está trabajando con ellos y tocarlos solo cambiaría datos que nadie va a mirar.
 */
CREATE OR REPLACE FUNCTION public.apply_dashboard_to_my_clients(p_dashboard jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesión';
  END IF;

  IF jsonb_typeof(p_dashboard) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'La configuración del panel tiene que ser un objeto JSON';
  END IF;

  -- Mismo tope que `set_client_preferences` (0008): la función es invocable con
  -- la anon key y no puede fiarse de que la aplicación mande algo sensato.
  IF pg_column_size(p_dashboard) > 8192 THEN
    RAISE EXCEPTION 'La configuración del panel es demasiado grande';
  END IF;

  UPDATE public.clients c
  SET preferences = COALESCE(c.preferences, '{}'::jsonb)
                    || jsonb_build_object('dashboard', p_dashboard)
  WHERE public.can_write_client(c.id)
    AND c.status IS DISTINCT FROM 'archived';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_dashboard_to_my_clients(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_dashboard_to_my_clients(jsonb) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Desde la aplicación, con sesión iniciada:
--
--   await supabase.rpc('apply_dashboard_to_my_clients', {
--     p_dashboard: { widgets: ['weight'], cards: [], spans: {}, showMetricList: false }
--   })
--   // → número de clientes actualizados
--
-- Y que el objetivo declarado NO se ha perdido por el camino:
--
--   SELECT name, preferences -> 'goal', preferences -> 'dashboard'
--   FROM public.clients WHERE preferences ? 'goal';
-- ============================================================================
