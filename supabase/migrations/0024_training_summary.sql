-- ============================================================================
-- Resumen de entrenamiento: dejar de descargar la cartera entera
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. No crea tablas ni cambia permisos: añade una función de lectura.
--     Si no se aplica, la aplicación carga como siempre.
--
-- ══ El problema ════════════════════════════════════════════════════════════
--
-- Al arrancar se descargaba el programa COMPLETO de todos los clientes
-- (`auditoria.md` 1.5): todas las semanas, todos los días, todos los ejercicios y
-- todas las series de cada uno. Un año de entrenamiento son varios MB por
-- cliente, y la aplicación no pinta nada hasta que baja el último.
--
-- Cómodo con veinte clientes y letal con doscientos. Y el detalle que lo convierte
-- en un problema de negocio: duele a partir de treinta, que es exactamente el
-- tamaño del entrenador dispuesto a pagar. **El mejor cliente es el que peor
-- experiencia tiene.**
--
-- ══ Qué devuelve ═══════════════════════════════════════════════════════════
--
-- Por cliente, lo único que la cartera y «Hoy» necesitan de veinte personas a la
-- vez: cuándo entrenó por última vez, cuántas sesiones lleva, cuántas semanas
-- tiene programadas, y las sesiones de los últimos días —esas completas, porque
-- «Hoy» dice cuántas series y cuántos kilos—.
--
-- El programa entero se sigue cargando, pero solo del cliente que se abre.
--
-- ══ Por qué esto NO reimplementa ninguna regla de negocio ══════════════════
--
-- Es la parte importante. «Qué se ha entrenado» es una regla de `domain/sessions.js`
-- que ya costó un fallo grave (`auditoria.md` 1.1), y escribirla por segunda vez en
-- SQL sería garantizar que las dos versiones divergen.
--
-- Aquí no se escribe: esto SELECCIONA sesiones y las devuelve tal cual; quien
-- calcula el tonelaje, las series y las alertas sigue siendo el mismo JavaScript
-- de siempre, sobre los mismos objetos.
--
-- Eso solo es posible porque los registros heredados —los kilos que vivían dentro
-- del plan, sin fecha propia— ya están normalizados. Por eso `has_legacy`: si
-- algún cliente todavía tiene de esos, esta función lo dice y la aplicación vuelve
-- a cargarlo todo para ese entrenador. Preferimos cargar de más que enseñar
-- «lleva 40 días sin entrenar» a alguien que entrenó ayer.
-- ============================================================================

BEGIN;

/**
 * Resumen de entrenamiento de los clientes que el usuario puede ver.
 *
 * `SECURITY INVOKER` —el valor por defecto, dicho aquí porque importa—: la función
 * lee `workout_data` con los permisos de quien llama, así que RLS decide de qué
 * clientes hay fila. Con `SECURITY DEFINER` habría que reimplementar aquí dentro
 * la regla de quién ve a quién, que es justo lo que el proyecto evita.
 *
 * @param p_days  Ventana de las sesiones que se devuelven enteras. 21 por defecto:
 *                «Hoy» mira 14 y conviene un margen para que un cambio de ventana
 *                en la interfaz no exija tocar la base de datos.
 */
CREATE OR REPLACE FUNCTION public.training_summaries(p_days integer DEFAULT 21)
RETURNS TABLE (
  client_id       uuid,
  last_training   text,
  session_count   integer,
  microcycle_count integer,
  has_legacy      boolean,
  recent_sessions jsonb
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH micro AS (
    SELECT w.client_id, m AS doc
    FROM public.workout_data w,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(w.microcycles) = 'array' THEN w.microcycles ELSE '[]'::jsonb END
         ) AS m
  ),

  sesion AS (
    SELECT micro.client_id, s AS doc, s->>'date' AS fecha
    FROM micro,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(micro.doc->'sessions') = 'array'
                THEN micro.doc->'sessions' ELSE '[]'::jsonb END
         ) AS s
  ),

  /*
    Un día del PLAN con series anotadas y sin sesión propia: el formato antiguo.
    No se intenta interpretarlo —eso es de `legacySession`—, solo detectarlo, que
    es una pregunta mucho más simple y sin consecuencias si se responde de más.
  */
  heredado AS (
    SELECT DISTINCT micro.client_id
    FROM micro,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(micro.doc->'days') = 'array'
                THEN micro.doc->'days' ELSE '[]'::jsonb END
         ) AS d,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(d->'exercises') = 'array'
                THEN d->'exercises' ELSE '[]'::jsonb END
         ) AS e,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(e->'sets') = 'array' THEN e->'sets' ELSE '[]'::jsonb END
         ) AS st
    WHERE
      -- El texto se comprueba antes de convertirlo: `reps` es texto libre y un
      -- cast directo revienta la consulta entera por una celda con un guion.
      (st->>'reps') ~ '^[0-9]+([.,][0-9]+)?$'
      AND replace(st->>'reps', ',', '.')::numeric > 0
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(micro.doc->'sessions') = 'array'
               THEN micro.doc->'sessions' ELSE '[]'::jsonb END
        ) AS x
        WHERE x->>'dayName' = d->>'dayName'
      )
  )

  SELECT
    w.client_id,
    (SELECT max(s.fecha) FROM sesion s
      WHERE s.client_id = w.client_id AND s.fecha ~ '^\d{4}-\d{2}-\d{2}$'),
    (SELECT count(*)::integer FROM sesion s WHERE s.client_id = w.client_id),
    (SELECT count(*)::integer FROM micro m WHERE m.client_id = w.client_id),
    EXISTS (SELECT 1 FROM heredado h WHERE h.client_id = w.client_id),
    COALESCE(
      (SELECT jsonb_agg(s.doc)
        FROM sesion s
        WHERE s.client_id = w.client_id
          AND s.fecha >= to_char(current_date - p_days, 'YYYY-MM-DD')),
      '[]'::jsonb
    )
  FROM public.workout_data w;
$$;

REVOKE ALL ON FUNCTION public.training_summaries(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.training_summaries(integer) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT c.name, t.last_training, t.session_count, t.microcycle_count,
--          t.has_legacy, jsonb_array_length(t.recent_sessions) AS recientes
--   FROM public.training_summaries() t
--   JOIN public.clients c ON c.id = t.client_id
--   ORDER BY t.last_training DESC NULLS LAST;
--
-- `has_legacy` en `true` para alguien significa que le quedan registros del
-- formato antiguo: pasa el normalizador (Ajustes → Copia de seguridad). Mientras
-- haya uno solo, la aplicación sigue cargando como antes —a propósito—, así que
-- la mejora de arranque no llega hasta que estén todos.
-- ============================================================================
