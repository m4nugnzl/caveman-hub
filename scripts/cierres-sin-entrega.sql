-- ============================================================================
-- Las semanas que el entrenador cerró SIN entrega, antes de la 0134
-- ----------------------------------------------------------------------------
-- NO SE EJECUTA SOLO. Lo ejecuta el dueño desde el panel de Supabase, con
-- `npm run backup` antes.
--
-- Hasta la 0134, cerrar la semana de quien no entregó creaba la fila con
-- `submit_check_in`, que siempre pone `submitted_at`. El cliente ve esas
-- semanas como «entregada · revisada» cuando nunca las mandó. Desde la 0134 la
-- fila se crea con `fila_de_revision` y sin `submitted_at`: «Cerrada por tu
-- entrenador».
--
-- Las viejas NO se distinguen con certeza: no se guardó quién puso
-- `submitted_at`. La huella es que la entrega y el cierre llegaron en el mismo
-- gesto: `submitted_at` a segundos de `reviewed_at`, sin peso, sin notas y sin
-- cuestionario. Es una heurística: revisa la lista antes de tocar nada.
-- ============================================================================

-- 1) Mirar: las candidatas.
SELECT c.name, ci.week_start, ci.submitted_at, ci.reviewed_at, ci.weight, ci.answers
FROM public.check_ins ci
JOIN public.clients c ON c.id = ci.client_id
WHERE ci.submitted_at IS NOT NULL
  AND ci.reviewed_at IS NOT NULL
  AND ci.reviewed_at - ci.submitted_at BETWEEN interval '0' AND interval '30 seconds'
  AND ci.weight IS NULL
  AND coalesce(ci.notes, '') = ''
  AND ci.answers IS NULL
ORDER BY c.name, ci.week_start;

-- 2) Arreglar: quitarles la entrega que nunca hicieron. Descomentar a mano.
--
-- UPDATE public.check_ins ci
-- SET submitted_at = NULL, updated_at = now()
-- WHERE ci.submitted_at IS NOT NULL
--   AND ci.reviewed_at IS NOT NULL
--   AND ci.reviewed_at - ci.submitted_at BETWEEN interval '0' AND interval '30 seconds'
--   AND ci.weight IS NULL
--   AND coalesce(ci.notes, '') = ''
--   AND ci.answers IS NULL;
