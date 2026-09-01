-- ============================================================================
-- Dos políticas más que no llegaban a evaluarse
-- ----------------------------------------------------------------------------
-- ⚠️  De permisos. `GRANT SELECT` sobre `client_calendar_feeds`, y `SELECT` +
--     `UPDATE` sobre `client_folders`. No crea ni cambia tablas, políticas,
--     funciones ni datos. Requiere `0071_calendario_del_cliente.sql` y
--     `0082_la_carpeta_de_cada_cliente.sql`.
--
-- ══ El mismo fallo que la 0088, en otras dos tablas ═════════════════════════
--
-- La 0088 arregló `client_consents`: tenía su política de lectura y no el
-- privilegio de tabla que la hace evaluable. Al buscar si estaba sola aparecen
-- estas dos, con el mismo perfil y el mismo síntoma —403 `42501`, tragado por
-- quien llama y convertido en «no hay nada»—:
--
--   · `client_folders` (0082). La lee `loadClientFolder` para el entrenador y
--     para el cliente, y su lectura trata cualquier error como «no hay
--     carpeta»: es una defensa pensada para las bases sin la 0082 aplicada. Con
--     el privilegio ausente, esa defensa se comía el permiso denegado y **la
--     carpeta compartida no aparecía nunca**, ni en la ficha ni en el portal,
--     estuviera montada o no. También se le concede UPDATE, que es lo que usa
--     `setClientFolder` para los dos interruptores de la carpeta —si el cliente
--     puede subir y qué se le pide— y que su política `folders_write` ya
--     reserva a quien puede escribirle.
--
--   · `client_calendar_feeds` (0071). El enlace de suscripción al calendario.
--     Con la lectura denegada, «Mi calendario» del portal no podía saber si ya
--     había un enlace hecho.
--
-- ══ Lo que NO se concede, y por qué ════════════════════════════════════════
--
-- El repaso encuentra más políticas sin privilegio, y no todas son un fallo:
-- donde la escritura pasa por una función `SECURITY DEFINER`, la política es
-- redundante y conceder el privilegio ABRIRÍA un camino que hoy no existe. Es
-- el caso de los borradores de `check_ins` —se entregan por `submit_check_in`—
-- y de la creación y revocación del propio enlace de calendario, que van por
-- `create_client_calendar_feed` y `revoke_client_calendar_feed`.
--
-- Aquí solo se concede lo que la aplicación pide de verdad contra la tabla y lo
-- que la política de al lado ya decía que se podía hacer. Las que quedan
-- —`client_invites` y `client_payments`, las dos del lado del entrenador— están
-- anotadas en el informe: merecen su propia migración, con la comprobación de
-- qué privilegio necesita cada pantalla.
--
-- Es idempotente: si los privilegios ya están, no cambia nada.
-- ============================================================================

BEGIN;

-- Su política `calendar_feeds_client_read` ya la limita a `app_is_client`.
GRANT SELECT ON public.client_calendar_feeds TO authenticated;

-- `folders_read` (leerla el entrenador o el propio cliente) y `folders_write`
-- (cambiarla quien pueda escribirle) siguen siendo las que deciden las filas.
GRANT SELECT, UPDATE ON public.client_folders TO authenticated;

/* Sin sesión no hay nada que preguntar en ninguna de las dos, y sus políticas
   —escritas para el rol `authenticated`— no alcanzarían a protegerlas. */
REVOKE ALL ON public.client_calendar_feeds FROM anon;
REVOKE ALL ON public.client_folders FROM anon;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Las cuatro filas tienen que decir `true`:
--
--   SELECT has_table_privilege('authenticated', 'public.client_calendar_feeds', 'select'),
--          has_table_privilege('authenticated', 'public.client_folders', 'select'),
--          has_table_privilege('authenticated', 'public.client_folders', 'update'),
--          NOT has_table_privilege('anon', 'public.client_folders', 'select');
--
-- Y el repaso que encontró esto, que sirve para la próxima vez: políticas para
-- `authenticated` cuyo privilegio de tabla no existe, o sea reglas escritas que
-- nunca se ejecutan.
--
--   SELECT p.polrelid::regclass AS tabla, p.polname, p.polcmd
--   FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND 'authenticated' = ANY (SELECT rolname FROM pg_roles WHERE oid = ANY (p.polroles))
--     AND CASE p.polcmd
--           WHEN 'r' THEN NOT has_table_privilege('authenticated', p.polrelid, 'select')
--           WHEN 'a' THEN NOT has_table_privilege('authenticated', p.polrelid, 'insert')
--           WHEN 'w' THEN NOT has_table_privilege('authenticated', p.polrelid, 'update')
--           WHEN 'd' THEN NOT has_table_privilege('authenticated', p.polrelid, 'delete')
--           ELSE false
--         END;
-- ============================================================================
