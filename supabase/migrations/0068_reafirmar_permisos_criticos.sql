-- ============================================================================
-- Reafirmar los permisos de las dos funciones que la radiografía marca críticas
-- ----------------------------------------------------------------------------
-- `npm run radiografia` (21/08/2026) señala que `audit_visible_for` y
-- `team_storage_bytes` son ejecutables por `anon` EN LO DESPLEGADO. El
-- repositorio las tiene bien —la 0066 y la 0067 llevan sus REVOKE— así que lo
-- que hay en producción no es lo del repositorio: el mismo patrón que ya
-- documentaron la 0046 y la 0057 (una función pegada o repegada desde el panel
-- sin su REVOKE detrás).
--
-- Por qué importa: las dos son `SECURITY DEFINER`. `audit_visible_for` revela si
-- el equipo de un cliente cualquiera paga el registro de cambios (un oráculo
-- sobre clientes ajenos), y `team_storage_bytes` deja medir el disco de
-- cualquier equipo con solo probar uuids. Ninguna filtra contenido, pero
-- ninguna tiene por qué contestarle a nadie sin sesión.
--
-- Esto es idempotente: si los permisos ya están bien, no cambia nada.
-- ============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.audit_visible_for(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.audit_visible_for(uuid) TO authenticated;

-- Sin GRANT a nadie, como dice la 0067: la llaman `enforce_storage_limit` y
-- `my_team_plan()`, las dos como definidor.
REVOKE ALL ON FUNCTION public.team_storage_bytes(uuid) FROM public, anon, authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Las dos filas tienen que decir `false`:
--
--   SELECT 'audit_visible_for' AS fn,
--          has_function_privilege('anon', 'public.audit_visible_for(uuid)', 'execute')
--   UNION ALL
--   SELECT 'team_storage_bytes',
--          has_function_privilege('anon', 'public.team_storage_bytes(uuid)', 'execute');
--
-- Y después, `npm run radiografia` tiene que bajar los críticos a cero.
-- ============================================================================
