-- ============================================================================
-- Las series que no se guardaron
-- ----------------------------------------------------------------------------
-- Independiente de la 0130 y la 0131: se puede aplicar antes o después.
--
-- ══ El fallo que cierra ═══════════════════════════════════════════════════
--
-- `log_session_set` rechaza una serie cuando su día o su ejercicio ya no están
-- en el plan de esa semana: el entrenador renombró o quitó la hoja con el
-- teléfono del cliente abierto desde antes. Desde la versión de la app de esta
-- migración el teléfono ya no la pierde: la recoloca si puede y, si no, la
-- guarda en el navegador y la marca «No guardada» (`lib/seriesNoGuardadas`).
--
-- Pero el entrenador no se enteraba: el rechazo solo llegaba a `app_errors`,
-- que es diagnóstico de la plataforma. Esto es donde se le cuenta. Se lee en su
-- Revisión, en la tarjeta del entreno: «3 series no se guardaron el 22 sep ·
-- Pull A».
--
-- ══ Qué guarda ════════════════════════════════════════════════════════════
--
-- Una fila por CAMPO rechazado —la misma unidad que la cola del teléfono—, con
-- lo necesario para decirlo en una línea y para que el entrenador pueda
-- apuntarlo a mano si quiere: semana, hoja, ejercicio, serie, campo y valor.
-- Cuando la serie acaba entrando (el cliente pulsa «Reintentar» y ya tiene
-- sitio), el teléfono borra su fila: una línea que dice «no se guardó» de algo
-- que sí está guardado es peor que ninguna.
--
-- ══ Quién escribe y quién lee ═════════════════════════════════════════════
--
-- Escribe el cliente, y SOLO por `report_unsaved_set`: la función comprueba que
-- es suyo, recorta los textos y pone un tope por cliente. Sin INSERT directo,
-- por lo mismo que las series van por `log_session_set` (0014): el permiso es
-- la operación, no la tabla.
--
-- Lee quien puede leer a ese cliente (`app_can_read_client`, el entrenador y su
-- equipo) y el propio cliente (`is_me`).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.series_no_guardadas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,

  /* La clave de la cola del teléfono: `set:<cliente>:<sesión>:<ejercicio>:<serie>:<campo>`.
     Un mismo campo que se rechaza dos veces es UNA fila, con el último valor. */
  clave       text NOT NULL,

  semana      integer,
  hoja        text,
  ejercicio   text,
  serie       integer,
  campo       text,
  valor       text,
  -- La fecha del entreno, la del cliente.
  fecha       date,
  -- Lo que dijo el servidor, tal cual. Para el soporte; la pantalla no lo enseña.
  motivo      text,

  rechazada_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS series_no_guardadas_llave
  ON public.series_no_guardadas (client_id, clave);

ALTER TABLE public.series_no_guardadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "series_no_guardadas_read" ON public.series_no_guardadas;
CREATE POLICY "series_no_guardadas_read" ON public.series_no_guardadas
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id) OR public.is_me(client_id));

/* Solo leer: escribir va por la función. Sin el GRANT la política no llega a
   evaluarse y PostgREST devuelve 403 — el dato falso sería «no hay ninguna». */
GRANT SELECT ON public.series_no_guardadas TO authenticated;


/**
 * Apunta —o borra— una serie que no se guardó.
 *
 * `p_datos` es el payload de la serie tal como lo tiene el teléfono
 * (`weekNumber`, `dayName`, `exercise.name`, `setIndex`, `field`, `value`,
 * `date`) más `motivo`. Con `p_datos` NULL se borra: la serie acabó entrando.
 */
CREATE OR REPLACE FUNCTION public.report_unsaved_set(p_client uuid, p_clave text, p_datos jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fecha date;
BEGIN
  IF NOT (public.is_me(p_client) OR public.app_can_write_client(p_client)) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente' USING ERRCODE = '42501';
  END IF;

  /* La longitud aparte: Postgres no admite repeticiones de más de 255 en una
     expresión regular (`{3,300}` daba «invalid repetition count(s)» en CADA
     llamada, y ninguna serie llegaba al entrenador). */
  IF p_clave IS NULL OR p_clave !~ '^set:[^[:cntrl:]]{3,}$' OR length(p_clave) > 304 THEN
    RAISE EXCEPTION 'Clave de serie no válida';
  END IF;

  IF p_datos IS NULL THEN
    DELETE FROM public.series_no_guardadas WHERE client_id = p_client AND clave = p_clave;
    RETURN;
  END IF;

  /* Un tope por cliente: esto es un aviso, no un almacén. Un teléfono que se
     vuelva loco no llena la tabla; lo que ya está se sigue pudiendo actualizar. */
  IF (SELECT count(*) FROM public.series_no_guardadas WHERE client_id = p_client) >= 500
     AND NOT EXISTS (SELECT 1 FROM public.series_no_guardadas WHERE client_id = p_client AND clave = p_clave) THEN
    RETURN;
  END IF;

  BEGIN
    v_fecha := NULLIF(p_datos ->> 'date', '')::date;
  EXCEPTION WHEN others THEN
    v_fecha := NULL;
  END;

  INSERT INTO public.series_no_guardadas
    (client_id, clave, semana, hoja, ejercicio, serie, campo, valor, fecha, motivo, rechazada_en)
  VALUES (
    p_client,
    p_clave,
    CASE WHEN p_datos ->> 'weekNumber' ~ '^[0-9]{1,4}$' THEN (p_datos ->> 'weekNumber')::integer END,
    left(p_datos ->> 'dayName', 120),
    left(p_datos -> 'exercise' ->> 'name', 160),
    CASE WHEN p_datos ->> 'setIndex' ~ '^[0-9]{1,2}$' THEN (p_datos ->> 'setIndex')::integer END,
    left(p_datos ->> 'field', 8),
    left(p_datos ->> 'value', 16),
    v_fecha,
    left(p_datos ->> 'motivo', 300),
    now()
  )
  ON CONFLICT (client_id, clave) DO UPDATE SET
    semana = EXCLUDED.semana,
    hoja = EXCLUDED.hoja,
    ejercicio = EXCLUDED.ejercicio,
    serie = EXCLUDED.serie,
    campo = EXCLUDED.campo,
    valor = EXCLUDED.valor,
    fecha = EXCLUDED.fecha,
    motivo = EXCLUDED.motivo,
    rechazada_en = now();
END;
$$;

REVOKE ALL ON FUNCTION public.report_unsaved_set(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.report_unsaved_set(uuid, text, jsonb) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT count(*) FROM public.series_no_guardadas;   -- 0: nace vacía
--
-- Para deshacer:
--   DROP FUNCTION public.report_unsaved_set(uuid, text, jsonb);
--   DROP TABLE public.series_no_guardadas;
-- ============================================================================
