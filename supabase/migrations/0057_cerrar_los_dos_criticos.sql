-- ============================================================================
-- Los dos críticos que quedaban
-- ----------------------------------------------------------------------------
-- ⚠️  BORRA UNA TABLA. `videos` se retira, y la migración **se niega a hacerlo
--     si tiene una sola fila**: en el proyecto de referencia tiene cero, pero
--     una migración que borra datos porque alguien supuso que estaban vacíos es
--     exactamente como se pierden.
--
-- Son los dos hallazgos que `npm run radiografia` lleva señalando desde la 0053
-- y que no se habían tocado porque cambian el funcionamiento de la aplicación,
-- no el informe.
-- ============================================================================


-- ============================================================================
-- 1. `handle_new_user` corre con permisos prestados y search_path del que llama
-- ----------------------------------------------------------------------------
-- Es el disparador que crea el perfil al registrarse alguien. Al ser
-- `SECURITY DEFINER` corre con los permisos de quien la creó, y sin
-- `search_path` fijo resuelve los nombres con el del que la invoca: basta con
-- crear un esquema propio con una tabla `profiles` dentro y ponerlo delante para
-- que la función escriba ahí. Es la escalada de privilegios clásica de
-- PostgreSQL y no deja ninguna huella.
--
-- ══ Lo interesante: el repositorio ya lo tenía bien ═════════════════════════
--
-- `supabase/bootstrap.sql` la declara con `SET search_path = public` desde
-- siempre. Lo que está desplegado NO es eso, así que la función se creó —o se
-- volvió a crear— por otra vía, probablemente desde el panel de Supabase.
--
-- Es el mismo patrón que la 0046 con RLS: **el estado real de la base no estaba
-- en el repositorio**, y solo se ve mirando el catálogo. Esta vez lo encontró el
-- informe en lugar de una restauración por casualidad, que es justo para lo que
-- se hizo.
--
-- ══ Por qué `''` y no `public` ═════════════════════════════════════════════
--
-- Porque su cuerpo ya nombra todo con esquema —`public.profiles`— así que no
-- necesita ninguno en el camino de búsqueda, y el camino vacío es el único que
-- no depende de que nadie pueda crear objetos en `public`.
--
-- `ALTER FUNCTION` y no `CREATE OR REPLACE`: el cuerpo desplegado puede no ser
-- exactamente el de `bootstrap.sql` —esa es justo la sospecha— y reescribirlo
-- entero se llevaría por delante cualquier cambio que alguien hiciera después.
-- Esto solo añade el ajuste que falta.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NULL THEN
    RAISE WARNING 'No existe handle_new_user: nada que asegurar.';
    RETURN;
  END IF;

  ALTER FUNCTION public.handle_new_user() SET search_path = '';
  RAISE NOTICE 'handle_new_user: search_path fijado a ''''.';
END;
$$;


-- ============================================================================
-- 2. La tabla `videos`, con una política abierta a internet
-- ----------------------------------------------------------------------------
-- Tiene una política `FOR ALL` cuyo rol es `public`, o sea alcanzable **sin
-- sesión**: cualquiera podía leer y escribir en ella desde internet.
--
-- Y no hace falta arreglar la política, porque la tabla sobra. `auditoria.md`
-- §2 la lista desde hace tiempo: «La corrección de vídeos se retiró del
-- producto». No la consulta ni una línea de la aplicación — solo aparece en la
-- lista de tablas de `scripts/backup.mjs` y `scripts/restore.mjs`.
--
-- Arreglar la política de una tabla muerta es dejar la tabla muerta y una
-- política más que mantener. Lo correcto es quitarla.
--
-- ══ La guarda ══════════════════════════════════════════════════════════════
--
-- Se comprueba que esté VACÍA antes de borrarla, y si no lo está no se toca
-- nada y se levanta excepción. En el proyecto de referencia tiene cero filas,
-- pero esta migración se va a ejecutar también en cualquier restauración futura
-- y en el entorno local de quien venga después — y una migración que borra datos
-- porque alguien supuso que no los había es exactamente como se pierden.
--
-- Si salta: mira qué hay dentro. O es material que hay que rescatar, o es basura
-- de pruebas y se vacía a mano antes de volver a ejecutarla.
-- ============================================================================

DO $$
DECLARE
  v_filas bigint;
BEGIN
  IF to_regclass('public.videos') IS NULL THEN
    RAISE NOTICE 'La tabla videos ya no existe.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.videos' INTO v_filas;

  IF v_filas > 0 THEN
    RAISE EXCEPTION
      'La tabla videos tiene % fila(s) y esta migración solo la retira si está vacía. '
      'Mira qué hay dentro antes de decidir: SELECT * FROM public.videos;', v_filas;
  END IF;

  DROP TABLE public.videos;
  RAISE NOTICE 'Tabla videos retirada (0 filas). Su política abierta se va con ella.';
END;
$$;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   npm run radiografia
--   -- «Ningún hallazgo crítico sin revisar»
--
-- O directamente:
--
--   SELECT nivel, objeto, detalle FROM public.radiografia_seguridad()
--   WHERE nivel = 'critico';
--   -- cero filas
--
-- Que el registro de usuarios nuevos SIGUE funcionando, que es lo único que esta
-- migración podría haber roto: crear una cuenta desde la aplicación y comprobar
-- que aparece su fila.
--
--   SELECT id, email, role FROM public.profiles ORDER BY created_at DESC LIMIT 1;
--
-- Si el alta fallara con «relation "profiles" does not exist», el cuerpo
-- desplegado NO nombraba los objetos con esquema y hay que volver atrás:
--
--   ALTER FUNCTION public.handle_new_user() SET search_path = public;
-- ============================================================================
