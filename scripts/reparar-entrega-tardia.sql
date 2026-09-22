-- ============================================================================
-- REPARACIÓN de la entrega tardía. ESTO ESCRIBE.
-- ----------------------------------------------------------------------------
-- Antes de nada: `npm run backup`.
--
-- Pasa `auditoria-entrega-tardia.sql` primero y mira lo que sale. Esto sella
-- (`history[].semana`) los registros que un cliente apuntó para una revisión
-- que estaba entregando tarde, exactamente como el código hace ya al
-- escribirlos desde el arreglo. Es la misma cuenta, aplicada a lo de antes.
--
-- ══ Qué NO toca, y por qué ═════════════════════════════════════════════════
--
--   · Revisiones ya contestadas (`reviewed_at`). Sellar cambia la media que el
--     entrenador leyó al decidir el ajuste: reescribe la base de una decisión
--     que ya se tomó. Si quieres incluirlas, quita la línea marcada.
--   · Registros escritos después de que su ventana se cerrara. La aplicación ya
--     no le enseñaba esa revisión, así que no los escribió para ella.
--   · Registros que ya llevan sello. No se pisa ninguno: el sello se pone, no se
--     cambia. Por eso volver a ejecutar esto no hace nada — es idempotente.
--
-- ══ Y qué SÍ cambia ════════════════════════════════════════════════════════
--
-- Mueve pesajes de una semana a otra. La semana N+1 pierde esos pesajes de su
-- media: es lo correcto, eran de la N, pero conviene saberlo antes y no después.
-- El peso que el cliente CONFIRMÓ al entregar (`check_ins.weight`) no se toca;
-- lo que cambia es la media y el recuento que la pantalla recalcula al abrirla.
--
-- ══ El interruptor ═════════════════════════════════════════════════════════
--
-- Tal y como está, solo repara las revisiones SIN ENTREGAR: los clientes que
-- están bloqueados ahora mismo, que es lo urgente y lo que no rescribe nada que
-- nadie haya leído. Para incluir también las que se entregaron tarde y siguen
-- sin contestar, quita la línea marcada «solo las bloqueadas».
-- ============================================================================

BEGIN;

WITH pauta AS (
  SELECT
    c.id AS client_id,
    GREATEST(1, LEAST(8, COALESCE(NULLIF(c.preferences -> 'checkin' ->> 'everyWeeks', '')::int, 1))) AS cada,
    NULLIF(c.preferences -> 'checkin' ->> 'weekday', '')::int AS dia
  FROM public.clients c
),
log AS (
  SELECT a.client_id, (h ->> 'date')::date AS fecha, h ->> 'id' AS log_id, h ? 'semana' AS ya_sellado
  FROM public.anthropometry a, jsonb_array_elements(a.history) h
  WHERE h ->> 'date' IS NOT NULL
),
revision AS (
  SELECT
    c.client_id, c.week_start, c.submitted_at, c.reviewed_at,
    c.week_start + (7 * p.cada)         AS abre,
    c.week_start + (7 * p.cada) + p.dia AS cierra,
    COALESCE((c.submitted_at AT TIME ZONE 'UTC')::date, CURRENT_DATE) AS hasta
  FROM public.check_ins c
  JOIN pauta p ON p.client_id = c.client_id
  WHERE p.dia IS NOT NULL
    AND c.reviewed_at IS NULL                                        -- sin contestar
    AND c.submitted_at IS NULL                                       -- solo las bloqueadas
),
sello AS (
  SELECT r.client_id, l.log_id, r.week_start
  FROM revision r
  JOIN log l
    ON l.client_id = r.client_id
   AND NOT l.ya_sellado
   AND l.fecha >= r.abre
   AND l.fecha <= LEAST(r.cierra, r.hasta)   -- dentro de la ventana Y antes de entregar
  WHERE NOT EXISTS (
    SELECT 1 FROM public.check_ins c2
     WHERE c2.client_id = l.client_id
       AND c2.week_start = date_trunc('week', l.fecha)::date
       AND c2.submitted_at IS NOT NULL
  )
)
UPDATE public.anthropometry a
   SET history = (
         /* `WITH ORDINALITY` + `ORDER BY`: el historial es una lista ordenada y
            `jsonb_agg` no promete conservar el orden del escaneo. Rearmarla al
            azar no rompería nada hoy, pero es la clase de cosa que se descubre
            tarde. */
         SELECT jsonb_agg(
                  CASE
                    WHEN s.week_start IS NOT NULL AND NOT (t.h ? 'semana')
                    THEN t.h || jsonb_build_object('semana', to_char(s.week_start, 'YYYY-MM-DD'))
                    ELSE t.h
                  END
                  ORDER BY t.ord
                )
         FROM jsonb_array_elements(a.history) WITH ORDINALITY AS t(h, ord)
         LEFT JOIN sello s ON s.client_id = a.client_id AND s.log_id = t.h ->> 'id'
       ),
       updated_at = now()
 WHERE EXISTS (SELECT 1 FROM sello s WHERE s.client_id = a.client_id);

-- Mira el número de filas antes de confirmar. Si no cuadra con la auditoría:
-- ROLLBACK;
COMMIT;
