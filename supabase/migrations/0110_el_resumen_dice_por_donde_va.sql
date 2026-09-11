-- ============================================================================
-- El resumen dice por dónde va cada uno, y si le queda hoja escrita
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva sobre una función de lectura. No crea tablas, no cambia permisos y
--     no toca ni un dato. Si no se aplica, la aplicación funciona como hoy: la
--     barra no pinta microciclo y la cola «Sin semana siguiente» sale a cero
--     (ver `mapTrainingSummaryFromDb`).
--
-- ══ Por qué hacían falta dos columnas más ══════════════════════════════════
--
-- `training_summaries()` (0024) contesta qué ha PASADO —cuándo entrenó, cuántas
-- sesiones, las de los últimos días—. No contesta qué VIENE, y esa es la primera
-- pregunta del lunes: a quién se le acaba lo escrito.
--
-- El dato no se podía calcular sin descargar el programa entero de todo el
-- mundo, que es justo lo que la 0024 vino a evitar. Así que el resumen lleva
-- ahora el ÍNDICE del programa: los números de semana escritos y los bloques sin
-- nada dentro.
--
-- ══ Y por qué esto NO reimplementa ninguna regla ═══════════════════════════
--
-- Es la misma promesa de la 0024, y hay que mantenerla: aquí no se decide por
-- qué microciclo va nadie ni si se le acaba. Esto SELECCIONA enteros. Quién va
-- por dónde lo sigue diciendo `semanaDeAhora` en `domain/week.js` —un solo
-- reloj— y qué significa lo escrito lo sigue diciendo `horizonteEscrito` en
-- `domain/blocks.js`, sobre los mismos objetos que cuando el programa está
-- cargado del todo.
--
-- ── Los bloques van RECORTADOS, y no es cosmética ──────────────────────────
-- `workout_data.blocks` (0086) lleva dentro las hojas del bloque —el plan
-- entero, desde `plan-del-bloque`—, o sea megas. De un bloque aquí solo hace
-- falta dónde empieza, dónde acaba y cuántas semanas se previeron: lo demás
-- devolvería por otra puerta la descarga que la 0024 cerró.
-- ============================================================================

BEGIN;

/*
  Cambia la FORMA del resultado, así que hay que soltar la anterior: PostgreSQL
  no deja reemplazar una función cambiándole las columnas de salida. Se suelta y
  se vuelve a crear con su permiso, dentro de la misma transacción — entre las
  dos sentencias no hay ventana en la que la aplicación pueda leer una función a
  medias.
*/
DROP FUNCTION IF EXISTS public.training_summaries(integer);

/**
 * Resumen de entrenamiento de los clientes que el usuario puede ver.
 *
 * `SECURITY INVOKER` (el valor por defecto, dicho aquí porque importa): lee
 * `workout_data` con los permisos de quien llama, así que RLS decide de qué
 * clientes hay fila. Con `SECURITY DEFINER` habría que reimplementar aquí dentro
 * la regla de quién ve a quién, que es lo que el proyecto evita.
 *
 * @param p_days  Ventana de las sesiones que se devuelven enteras. 21 por
 *                defecto: «Hoy» mira 14 y conviene margen para que un cambio en
 *                la interfaz no exija tocar la base de datos.
 */
CREATE FUNCTION public.training_summaries(p_days integer DEFAULT 21)
RETURNS TABLE (
  client_id        uuid,
  last_training    text,
  session_count    integer,
  microcycle_count integer,
  has_legacy       boolean,
  recent_sessions  jsonb,
  microcycle_weeks integer[],
  blocks           jsonb
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
    ),
    /*
      Los números de semana escritos, ordenados. Se filtra por tipo antes de
      convertir por lo mismo que arriba con `reps`: un `weekNumber` que no sea un
      número —de una importación antigua— tumbaría la consulta de todos los
      clientes del entrenador, no solo la suya.
    */
    COALESCE(
      (SELECT array_agg((m.doc->>'weekNumber')::integer ORDER BY (m.doc->>'weekNumber')::integer)
        FROM micro m
        WHERE m.client_id = w.client_id
          AND jsonb_typeof(m.doc->'weekNumber') = 'number'),
      ARRAY[]::integer[]
    ),
    /* Los bloques, recortados a lo que sitúa una semana: sin `sessions` dentro. */
    COALESCE(
      (SELECT jsonb_agg(
                jsonb_strip_nulls(jsonb_build_object(
                  'id', b->>'id',
                  'name', b->>'name',
                  'fromWeek', b->'fromWeek',
                  'toWeek', b->'toWeek',
                  'plannedWeeks', b->'plannedWeeks'
                ))
                ORDER BY ord
              )
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(w.blocks) = 'array' THEN w.blocks ELSE '[]'::jsonb END
             ) WITH ORDINALITY AS t(b, ord)),
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
--   SELECT c.name, t.microcycle_weeks, jsonb_array_length(t.blocks) AS bloques
--   FROM public.training_summaries() t
--   JOIN public.clients c ON c.id = t.client_id
--   ORDER BY c.name;
--
-- `microcycle_weeks` vacío significa que esa persona no tiene ni un microciclo
-- escrito: es «sin programar», no «sin semana siguiente», y son dos colas
-- distintas de la portada.
--
-- Ojo con el peso: si `blocks` de alguien viniera con las hojas dentro, es que
-- el recorte de arriba se ha quedado corto y hay que revisarlo — la gracia de
-- esta función es que la carga inicial siga siendo de kilobytes.
-- ============================================================================
