-- ============================================================================
-- AUDITORÍA: registros que se quedaron fuera de la revisión que los pedía
-- ----------------------------------------------------------------------------
-- La parte de arriba solo LEE. La reparación está abajo, en su propia
-- transacción, y hay que ejecutarla a mano.
--
-- ══ Qué busca ══════════════════════════════════════════════════════════════
--
-- Hasta el arreglo de la entrega tardía, un pesaje o una toma de medidas se
-- contaba SIEMPRE en la semana natural de su fecha. Un cliente que entregaba la
-- revisión de la semana N dentro de su ventana de gracia —ya en la N+1— se
-- pesaba y se medía para ella, y esos registros caían en la N+1: su revisión
-- seguía diciendo «te pide 1 pesaje y llevas 0» y el botón de entregar rebotaba.
--
-- Desde el arreglo, esos registros se sellan (`history[].semana`) con el lunes
-- del periodo que se entrega. Lo que esta consulta encuentra son los de ANTES,
-- que siguen sin sello y siguen contados donde no tocaba.
--
-- ══ POR QUÉ LA VENTANA TIENE TOPE ══════════════════════════════════════════
--
-- La primera versión de esta consulta daba por buena cualquier fecha posterior
-- a la semana de la revisión, y para una revisión SIN ENTREGAR el tope era hoy.
-- Eso hace dos cosas mal, y la segunda es grave:
--
--   · Una revisión abandonada hace un mes reclamaba todos los pesajes
--     posteriores, para siempre. Pero la ventana de gracia no dura un mes:
--     `periodoAEntregar` abre el periodo anterior y SOLO mientras al de hoy no
--     le haya llegado su día. Pasado eso, la vieja cae a «semanas atrasadas» y
--     ya no es donde el cliente estaba escribiendo.
--   · Con dos revisiones abiertas del mismo cliente, el MISMO registro salía
--     reclamado por las dos. Un registro solo puede llevar un sello, así que la
--     reparación habría dependido del orden de ejecución: la última gana.
--
-- Así que la ventana de la revisión del periodo P es el periodo SIGUIENTE, y
-- nada más. Son disjuntas por construcción: ningún registro sale dos veces.
--
-- ══ Cómo leer el resultado ═════════════════════════════════════════════════
--
--   estado = 'entregada tarde'  → la revisión llegó, pero sin lo que el cliente
--                                 apuntó para ella. La media que vio su
--                                 entrenador salió de menos pesajes (o de
--                                 ninguno).
--   estado = 'sin entregar'     → la revisión se quedó abierta. Es el cliente
--                                 atascado del aviso.
--   contestada                  → el entrenador ya respondió. Sellar cambia la
--                                 media que leyó al decidir: la reparación las
--                                 deja fuera.
--   pasado_su_dia               → registros escritos DESPUÉS de que la ventana
--                                 se cerrara. La aplicación ya no le enseñaba
--                                 esa revisión, así que no los escribió para
--                                 ella. Salen en la cuenta para que se vean; la
--                                 reparación no los toca.
-- ============================================================================

WITH pauta AS (
  /* La pauta de cada cliente, con los mismos topes que `checkInSchedule`. Sin
     día elegido no hay «le tocaba» y no hay ventana: esos clientes no entran. */
  SELECT
    c.id AS client_id,
    GREATEST(1, LEAST(8, COALESCE(NULLIF(c.preferences -> 'checkin' ->> 'everyWeeks', '')::int, 1))) AS cada,
    NULLIF(c.preferences -> 'checkin' ->> 'weekday', '')::int AS dia
  FROM public.clients c
),
log AS (
  SELECT
    a.client_id,
    (h ->> 'date')::date         AS fecha,
    h ->> 'id'                   AS log_id,
    (h ->> 'weight') IS NOT NULL AS tiene_peso,
    (h ? 'skinFolds' OR h ? 'perimeters' OR h ? 'medidas') AS tiene_medidas,
    h ? 'semana'                 AS ya_sellado
  FROM public.anthropometry a, jsonb_array_elements(a.history) h
  WHERE h ->> 'date' IS NOT NULL
),
revision AS (
  SELECT
    c.client_id,
    c.week_start,
    c.submitted_at,
    c.reviewed_at,
    /* La ventana de gracia: vive entera dentro del periodo siguiente. */
    c.week_start + (7 * p.cada)           AS abre,        -- el lunes de después
    c.week_start + (7 * p.cada) + p.dia   AS cierra,      -- su día, que la cierra
    c.week_start + (14 * p.cada)          AS tope,        -- exclusivo
    /* Y el último día en que ese registro pudo apuntarse PARA esta revisión:
       cuando se entregó, o hoy si sigue abierta. */
    COALESCE((c.submitted_at AT TIME ZONE 'UTC')::date, CURRENT_DATE) AS hasta,
    CASE WHEN c.submitted_at IS NULL THEN 'sin entregar' ELSE 'entregada tarde' END AS estado
  FROM public.check_ins c
  JOIN pauta p ON p.client_id = c.client_id
  WHERE p.dia IS NOT NULL
    AND (
      c.submitted_at IS NULL
      OR (c.submitted_at AT TIME ZONE 'UTC')::date >= c.week_start + (7 * p.cada)
    )
),
candidato AS (
  SELECT r.client_id, r.week_start, r.estado, r.submitted_at, r.reviewed_at,
         l.log_id, l.fecha, l.tiene_peso, l.tiene_medidas,
         l.fecha > r.cierra AS fuera_de_plazo
  FROM revision r
  JOIN log l
    ON l.client_id = r.client_id
   AND NOT l.ya_sellado
   AND l.fecha >= r.abre     -- fuera del periodo de la revisión…
   AND l.fecha <  r.tope     -- …y dentro del siguiente, que es donde vive la ventana
   AND l.fecha <= r.hasta    -- …y antes de que se entregara
  /* Y que su propia semana no los esté usando ya: si el cliente entregó la
     semana siguiente, esos registros son de ella y no hay nada que mover. */
  WHERE NOT EXISTS (
    SELECT 1 FROM public.check_ins c2
     WHERE c2.client_id = l.client_id
       AND c2.week_start = date_trunc('week', l.fecha)::date
       AND c2.submitted_at IS NOT NULL
  )
)
SELECT
  cl.name                                   AS cliente,
  k.client_id,
  k.week_start                              AS semana_de_la_revision,
  k.estado,
  (k.submitted_at AT TIME ZONE 'UTC')::date AS entregada_el,
  k.reviewed_at IS NOT NULL                 AS contestada,
  count(*)                                  AS registros,
  count(*) FILTER (WHERE k.tiene_peso)      AS con_peso,
  count(*) FILTER (WHERE k.tiene_medidas)   AS con_medidas,
  count(*) FILTER (WHERE k.fuera_de_plazo)  AS pasado_su_dia,
  array_agg(k.fecha  ORDER BY k.fecha)      AS fechas,
  array_agg(k.log_id ORDER BY k.fecha)      AS logs
FROM candidato k
JOIN public.clients cl ON cl.id = k.client_id
GROUP BY cl.name, k.client_id, k.week_start, k.estado, k.submitted_at, k.reviewed_at
ORDER BY k.week_start DESC, cliente;


-- ════════════════════════════════════════════════════════════════════════════
-- COMPROBACIÓN: que ningún registro esté reclamado por dos revisiones.
-- ----------------------------------------------------------------------------
-- Tiene que devolver CERO filas. Si devuelve alguna, la ventana de arriba se ha
-- vuelto a ensanchar y la reparación no es segura: no la ejecutes.
--
--   SELECT log_id, count(*), array_agg(week_start)
--     FROM candidato          -- pegando aquí los CTE de arriba
--    GROUP BY log_id HAVING count(*) > 1;
--
-- La reparación está en `reparar-entrega-tardia.sql`, aparte a propósito: este
-- archivo se puede pegar entero sin miedo.
-- ════════════════════════════════════════════════════════════════════════════
