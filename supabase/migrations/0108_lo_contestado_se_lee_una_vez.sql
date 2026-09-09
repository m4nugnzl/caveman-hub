-- ============================================================================
-- Lo contestado se lee UNA vez
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para que «te han contestado» llegue a la bandeja. Sin ella la
--     aplicación se comporta como antes: lo contestado solo se ve abriendo el
--     envío en el Taller.
--
-- ══ El agujero que cierra ══════════════════════════════════════════════════
--
-- La 0105 le dio a lo mandado fecha, estado e historia, y con la vuelta a la
-- cartera (`mandado_pending`) el entrenador ya sabe a quién le FALTA algo. Lo
-- que no sabe es lo contrario, que es lo que de verdad le da trabajo: quién ha
-- contestado y él todavía no lo ha leído. Hoy eso se descubre abriendo el envío
-- de uno en uno, o no se descubre.
--
-- Reclamarlo sin esta columna no se puede: con `submitted_at` a secas la
-- bandeja se llenaría de todo lo contestado desde el principio de los tiempos y
-- **no habría forma de vaciarla**. Una cola que no se puede vaciar deja de
-- mirarse, y arrastra a las once que tiene al lado.
--
-- ══ Por qué una columna y no una tabla de «leídos» ═════════════════════════
--
-- Porque es un hecho de la fila, no una relación: una acción es de UNA persona
-- y la lee UN entrenador. Con equipos, `app_can_write_client` ya decide quién
-- puede tocarla, y que un compañero la dé por leída es lo que se quiere —el
-- trabajo es del equipo, no de cada uno—. Una tabla `lecturas` sería una fila
-- por cada fila para guardar una fecha.
--
-- ══ Lo que hace, y lo que NO ═══════════════════════════════════════════════
--
--   · `seen_at` en `client_actions`. La escribe el entrenador cuando abre lo
--     contestado; el cliente no la toca (la política de escritura es suya desde
--     la 0099, y lo del cliente entra por `marcar_accion`).
--   · Lo YA contestado nace VISTO. Es lo único honesto: nadie ha dejado de leer
--     lo que no se le podía reclamar, y el día del despliegue la bandeja saldría
--     con meses de respuestas viejas encima.
--   · `marcar_accion` gana una línea: corregir las respuestas BORRA la marca. Si
--     alguien cambia lo que puso después de que lo hayas leído, lo que leíste ya
--     no es lo que hay.
--
-- No toca políticas, ni GRANTs, ni el resto de la tabla.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.client_actions') IS NULL THEN
    RAISE EXCEPTION 'Falta 0105_lo_mandado_es_una_accion.sql: no existe `client_actions`.';
  END IF;
END $$;

BEGIN;

-- ── 1. La marca ─────────────────────────────────────────────────────────────

ALTER TABLE public.client_actions
  /*
    Cuándo lo leíste TÚ. Nula mientras esté sin leer, que es el estado que la
    bandeja reclama. Es la misma pareja que `submitted_at`/`reviewed_at` del
    check-in (0009): una fecha por cada lado del intercambio, y no un booleano,
    porque «cuándo» se puede enseñar y «sí» no.
  */
  ADD COLUMN IF NOT EXISTS seen_at timestamptz;

-- ── 2. Lo viejo nace visto ──────────────────────────────────────────────────
--
-- Con `seen_at` a NULL, la primera vez que el entrenador abriera la cartera le
-- saldría como pendiente de leer TODO lo que le han contestado desde que existe
-- la 0099. Una cola que estrena con cien filas no es una cola, es un cartel.
--
-- Se marca con `submitted_at` y no con `now()`: la fecha que interesa es la de
-- la respuesta, y así una fila migrada no miente diciendo que la leíste hoy.

UPDATE public.client_actions
SET seen_at = submitted_at
WHERE submitted_at IS NOT NULL
  AND seen_at IS NULL;

-- ── 3. Corregir lo contestado vuelve a pedir lectura ───────────────────────
--
-- `marcar_accion` deja a propósito que el cliente corrija lo que puso («esto es
-- una respuesta a una pregunta, y corregir los kilos que se puso mal tiene que
-- valer», 0105). Si eso pasa después de haberlo leído, lo leído ya no es lo que
-- hay: la marca se borra y vuelve a la bandeja.
--
-- Marcar SIN respuestas no la borra: un vídeo que se reabre no trae nada nuevo.
--
-- Es la misma función que la 0105, con esa línea. Se recrea entera porque un
-- `CREATE OR REPLACE` parcial no existe, y con la misma firma no hay dos
-- funciones que puedan confundirse.

CREATE OR REPLACE FUNCTION public.marcar_accion(
  target  uuid,
  answers jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dueno  uuid;
  clase  text;
  cuando timestamptz;
BEGIN
  SELECT ca.client_id, ca.tipo INTO dueno, clase
  FROM public.client_actions ca
  WHERE ca.id = target;

  IF dueno IS NULL THEN
    RAISE EXCEPTION 'No existe esa acción';
  END IF;

  IF NOT (public.app_is_client(dueno) OR public.app_can_write_client(dueno)) THEN
    RAISE EXCEPTION 'No tienes permiso sobre esa acción';
  END IF;

  IF marcar_accion.answers IS NOT NULL THEN
    IF clase IS DISTINCT FROM 'form' THEN
      RAISE EXCEPTION 'Solo un formulario guarda respuestas';
    END IF;

    IF jsonb_typeof(marcar_accion.answers) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Las respuestas tienen que ser un objeto JSON';
    END IF;

    IF pg_column_size(marcar_accion.answers) > 8192 THEN
      RAISE EXCEPTION 'Las respuestas son demasiado largas';
    END IF;
  END IF;

  UPDATE public.client_actions
  SET answers      = COALESCE(marcar_accion.answers, client_actions.answers),
      submitted_at = COALESCE(client_actions.submitted_at, now()),
      /*
        Contestar de nuevo vuelve a pedir lectura. Sin esto, corregir una
        respuesta ya leída se quedaba en silencio: el entrenador tiene en la
        cabeza lo que leyó, y lo que hay es otra cosa.
      */
      seen_at      = CASE WHEN marcar_accion.answers IS NOT NULL THEN NULL ELSE client_actions.seen_at END
  WHERE id = target
  RETURNING submitted_at INTO cuando;

  RETURN cuando;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_accion(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_accion(uuid, jsonb) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Que la columna está y que no queda nada contestado sin marca (0):
--
--   SELECT count(*) FILTER (WHERE submitted_at IS NOT NULL AND seen_at IS NULL) AS sin_leer
--   FROM public.client_actions;
--
--   (Cero JUSTO después de aplicarla. En cuanto alguien conteste, deja de serlo:
--    eso es precisamente lo que la bandeja va a reclamar.)
--
-- 2) Que corregir borra la marca. Con contexto de cliente, dentro de un ensayo:
--
--   BEGIN;
--     SET LOCAL role authenticated;
--     SET LOCAL request.jwt.claims = '{"sub":"<uuid del cliente>","role":"authenticated"}';
--     SELECT public.marcar_accion('<id de una fila suya de tipo form>', '{"q1":"7"}'::jsonb);
--   ROLLBACK;
--
--   Entre medias, `seen_at` de esa fila tiene que ser NULL aunque estuviera
--   puesta.
--
-- 3) Que el cliente NO puede marcarla como leída por la puerta de atrás (0 filas):
--
--   UPDATE public.client_actions SET seen_at = now() WHERE id = '<una suya>';
--
--   Con su rol puesto no toca ninguna fila: la política de escritura sigue
--   siendo solo del entrenador.
-- ============================================================================
