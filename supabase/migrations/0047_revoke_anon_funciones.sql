-- ============================================================================
-- Los `REVOKE` de las funciones no revocaban nada
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y reversible: solo quita permisos de EJECUCIÓN a `anon`, el rol de
--     quien no ha iniciado sesión. No toca ninguna tabla, ninguna política y
--     ningún dato.
--
-- ══ El patrón que no funciona ═══════════════════════════════════════════════
--
-- Casi todas las migraciones de este proyecto protegen sus funciones así:
--
--     REVOKE ALL ON FUNCTION public.loquesea(...) FROM public;
--     GRANT EXECUTE ON FUNCTION public.loquesea(...) TO authenticated;
--
-- La intención es clara y correcta: que solo la ejecute quien tenga sesión. Pero
-- **no es lo que ocurre**, y por la misma razón que el `REVOKE UPDATE (role)` de
-- la 0002 tampoco protegía nada (ver la migración 0046):
--
-- Supabase declara `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon,
-- authenticated, service_role`. Así que **toda función nueva nace con EXECUTE
-- concedido a `anon` de forma EXPLÍCITA**, y `REVOKE ... FROM public` solo retira
-- el permiso del pseudo-rol PUBLIC: el explícito se queda.
--
-- Comprobado en la base reconstruida:
--
--     new_review_token → postgres=X | anon=X | authenticated=X | service_role=X
--
-- después de que su migración le hiciera el REVOKE.
--
-- ══ Qué se podía hacer sin sesión, y qué no ════════════════════════════════
--
-- Se revisaron las funciones `SECURITY DEFINER` alcanzables por API. La mayoría
-- se defienden solas —`create_client`, `create_review_url`, `submit_check_in` y
-- compañía comprueban `auth.uid()` o llaman a `app_can_write_client`, y con
-- `anon` eso es nulo y levantan excepción—. Esa es la defensa de verdad, y
-- funciona.
--
-- Quedaban dos que no comprueban nada, y por eso esta migración es corta:
--
--   · `seed_team_library(target_team)` — **escribe**. Rellena la biblioteca de un
--     equipo con los ejercicios y alimentos de partida. Sin sesión se le puede
--     pedir que siembre la biblioteca de un equipo ajeno si se conoce su
--     identificador. El daño es pequeño —solo entra en bibliotecas vacías, así
--     que no reordena el trabajo de nadie— pero es una escritura de alguien sin
--     identificar, y eso no debería existir.
--
--   · `team_write_allowed(target_team)` — lee si la suscripción de un equipo está
--     al día. Sin sesión, sabiendo el identificador de un equipo, se puede
--     averiguar si su dueño está pagando. No es grave; tampoco es de nadie de
--     fuera.
--
-- Y `new_review_token()`, que devuelve dos UUID al azar y no hace nada más: no
-- había riesgo, pero su propia migración dice que no quiere que se pueda llamar,
-- así que se cumple lo que dice.
--
-- ══ Por qué no se revoca a `anon` en bloque ════════════════════════════════
--
-- Sería una línea (`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon`) y es
-- tentador. No se hace porque **hay dos pantallas que se abren sin sesión** —la
-- revisión compartida y la invitación— y romperlas sería cambiar el producto
-- desde una migración de seguridad. Si algún día se confirma que ninguna necesita
-- una función de `public`, esa línea es la buena.
-- ============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.seed_team_library(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.team_write_allowed(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.new_review_token() FROM anon, authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Las tres tienen que dar `f` para anon:
--
--   SELECT p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_puede
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('seed_team_library', 'team_write_allowed', 'new_review_token');
--
-- Y el panorama completo, que es lo que conviene mirar de vez en cuando: qué
-- puede ejecutar alguien sin sesión.
--
--   SELECT p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND pg_get_function_result(p.oid) <> 'trigger'
--     AND has_function_privilege('anon', p.oid, 'EXECUTE')
--   ORDER BY 1;
--
-- Las que salgan ahí tienen que defenderse solas comprobando `auth.uid()`. Lo
-- fija `supabase/tests/autorizacion.test.js`.
-- ============================================================================
