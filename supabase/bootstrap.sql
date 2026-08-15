-- ============================================================================
-- Lo que hace falta para levantar un proyecto DESDE CERO
-- ----------------------------------------------------------------------------
-- ⚠️  Esto NO es una migración y no se aplica al proyecto que está en marcha.
--     Es lo que falta entre `schema.sql` y `migrations/` para que una base de
--     datos vacía llegue a ser una instalación funcionando: un proyecto nuevo,
--     el entorno local de pruebas, o una RESTAURACIÓN.
--
-- ══ Por qué existe este archivo ═════════════════════════════════════════════
--
-- Al preparar el entorno local de pruebas apareció un agujero que
-- `docs/copias.md` §6 predijo sin saber cuál era: «hasta que no se pruebe una
-- restauración no se sabe qué se ha olvidado».
--
-- Esto es lo que se había olvidado.
--
-- `copias.md` §5.1 dice que para reconstruir basta con `schema.sql` y las
-- migraciones en orden. **No basta**: el disparador que crea la fila de
-- `profiles` cuando alguien se registra —`handle_new_user`— nunca estuvo en el
-- repositorio. Está escrito a mano en el proyecto de Supabase, y la migración
-- 0019 lo dice explícitamente al explicar por qué `ensure_my_team` se puso al
-- lado en vez de dentro:
--
--     «ese disparador no está en el repositorio: vive solo en el proyecto de
--      Supabase, escrito a mano en su día».
--
-- La consecuencia, en una restauración de verdad: la base se levanta, las tablas
-- están, las políticas están… y **registrarse no crea ningún perfil**. Sin fila
-- en `profiles` no hay rol, `ensure_my_team()` falla por clave foránea y no se
-- puede dar de alta ni un cliente. La aplicación arranca y no sirve para nada, y
-- el fallo no se parece en nada a su causa.
--
-- ══ Esto es una RECONSTRUCCIÓN, y hay que compararla ════════════════════════
--
-- Lo de abajo cumple el contrato que el resto del proyecto da por hecho —crea el
-- perfil con rol `coach`— pero está escrito desde ese contrato, no copiado del
-- original, porque el original no se puede leer desde aquí.
--
-- **Antes de fiarse, vuelca el de verdad** y compáralo. Desde el SQL Editor del
-- proyecto que está en marcha:
--
--     SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
--
--     SELECT tgname, pg_get_triggerdef(oid)
--     FROM pg_trigger WHERE tgname = 'on_auth_user_created';
--
-- Si el de producción hace algo más que esto, cópialo aquí. Es el único archivo
-- del repositorio cuyo contenido no se puede verificar solo con leer el
-- repositorio, y por eso lleva este aviso.
-- ============================================================================

BEGIN;

/*
  Cada cuenta de `auth` necesita su fila en `profiles`.

  `profiles` es de donde sale el ROL, y el rol decide qué mitad de la aplicación
  ve alguien: el panel del entrenador o el portal del cliente. Sin fila, la
  aplicación no puede contestar «¿quién eres?» y todo lo demás cuelga de eso.

  `SECURITY DEFINER` porque el disparador corre en el contexto de quien inserta
  en `auth.users` —el sistema de autenticación—, que no tiene permiso sobre
  `public.profiles`.
*/
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  /*
    `coach` por defecto, que es lo que documenta `monetizacion.md` §2.4 al
    señalar que el registro está abierto: cualquiera crea cuenta de entrenador.

    A un cliente NO se le cambia el rol aquí: se lo pone `claim_client_invite`
    (migración 0015) al canjear su invitación, que es el único camino por el que
    alguien llega a ser cliente. Deducirlo en el alta sería adivinar.
  */
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    /* El nombre que haya puesto en el registro, si lo puso. */
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    'coach'
  )
  /*
    Idempotente. Si la fila ya existe —una restauración que carga `profiles`
    ANTES de recrear las cuentas, que es el orden que recomienda `copias.md`
    §5.3— el alta no puede reventar por eso: se quedaría a medias el padrón
    entero y con él la propiedad de todos los datos.
  */
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;


-- ============================================================================
-- El orden completo, de una base vacía a una instalación que funciona
-- ----------------------------------------------------------------------------
--   1. supabase/schema.sql        las tablas base
--   2. supabase/bootstrap.sql     ESTE archivo — el disparador del alta
--   3. supabase/migrations/*.sql  en orden numérico
--
-- El paso 2 va ANTES de las migraciones porque la 0022 y la 0029 reaccionan a
-- que existan perfiles y equipos.
--
-- Con el entorno local (`supabase start`) los pasos 1 y 3 los hace el CLI si
-- `schema.sql` está enlazado como primera migración; el 2 hay que aplicarlo a
-- mano o dejarlo en `supabase/seed.sql`.
--
-- Comprobarlo, que es lo único que cierra el asunto:
--
--   -- Dar de alta una cuenta y ver que aparece su perfil.
--   SELECT id, email, role FROM public.profiles ORDER BY created_at DESC LIMIT 1;
--
-- Si esa consulta no devuelve nada después de registrarse, el disparador no está
-- puesto y la instalación NO está terminada — por mucho que la aplicación cargue.
-- ============================================================================
