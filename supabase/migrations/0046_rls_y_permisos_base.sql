-- ============================================================================
-- Encender RLS en las tablas base, y conceder lo que la aplicación necesita
-- ----------------------------------------------------------------------------
-- ⚠️  LEE ESTO ENTERO ANTES DE APLICARLO AL PROYECTO QUE ESTÁ EN MARCHA.
--     Sobre una instalación correcta no cambia absolutamente nada: encender RLS
--     donde ya está encendido y conceder lo que ya está concedido son dos no-ops.
--     Pero si tu proyecto NO estaba en ese estado, esto lo cambia — y es el
--     cambio que hay que hacer.
--
-- ══ Cómo apareció esto ══════════════════════════════════════════════════════
--
-- Levantando por primera vez el entorno local y reconstruyendo la base desde el
-- repositorio, que es lo que `docs/copias.md` §6 llevaba pidiendo desde el
-- principio: «hasta que no se pruebe una restauración no se sabe qué se ha
-- olvidado».
--
-- Sobre la base reconstruida, la aplicación no podía leer NADA: `permission
-- denied for table clients`. Al mirar por qué apareció lo de verdad importante.
--
-- ══ Los dos agujeros, y por qué juntos son peores que por separado ══════════
--
-- **1. RLS estaba APAGADO en las nueve tablas base.**
--
-- `clients`, `profiles`, `workout_data`, `anthropometry`, `nutrition_plans`,
-- `progress_photos`, `exercises`, `foods` y `videos` — o sea, donde vive todo:
-- las fichas, los programas, los pliegues, el peso y las fotos.
--
-- La migración 0002 crea DIECIOCHO políticas sobre ellas y **no ejecuta ni un
-- solo `ENABLE ROW LEVEL SECURITY`**; `schema.sql` tampoco. Y en PostgreSQL una
-- política sobre una tabla con RLS apagado **no hace nada**: no es que filtre
-- poco, es que no se evalúa. Las tablas creadas por migraciones posteriores
-- (catálogo, equipos, enlaces de revisión…) sí lo encienden, y por eso el
-- agujero no se veía: 21 de 30 tablas estaban bien.
--
-- El proyecto en producción está a salvo porque RLS se encendió a mano desde el
-- panel de Supabase. Ese estado NO está en el repositorio — el propio
-- `supabase/README.md` avisa de que las políticas «siguen sin estar versionadas
-- ni revisadas» y lo llama «el único riesgo importante que queda abierto». Lo
-- era, y era peor de lo que parecía: no faltaba versionar las políticas, faltaba
-- versionar que estuvieran ENCENDIDAS.
--
-- **2. `authenticated` no tenía permisos de tabla.**
--
-- Ninguna migración concede nunca SELECT, INSERT, UPDATE ni DELETE. En el
-- proyecto real los puso el panel de Supabase al crear las tablas; en una
-- reconstrucción no los pone nadie.
--
-- **Y aquí está el peligro de verdad.** Los dos agujeros se tapaban el uno al
-- otro: sin permisos de tabla, que RLS estuviera apagado no se notaba. Pero el
-- error que ve quien restaura es `permission denied`, y PostgreSQL le sugiere
-- amablemente la solución exacta:
--
--     HINT: Grant the required privileges to the current role with:
--           GRANT SELECT ON public.clients TO authenticated;
--
-- Quien siga esa pista —que es lo razonable— destapa el primer agujero sin saber
-- que existe, y deja una base donde **cualquiera con una cuenta lee y escribe
-- los datos de todos los clientes de todos los entrenadores**. Con la `anon key`
-- pública por diseño, eso es crear una cuenta y descargarse las fotos
-- corporales de desconocidos.
--
-- Por eso las dos cosas van en la MISMA migración y en este orden: primero se
-- enciende la puerta, y solo después se da la llave.
-- ============================================================================

BEGIN;

-- ── 1. Encender RLS ────────────────────────────────────────────────────────
--
-- Las nueve. `videos` incluida, aunque `auditoria.md` §2 la dé por sobrante:
-- mientras exista, una tabla con RLS encendido y sin políticas no la lee nadie,
-- que es exactamente lo que se quiere de una tabla que ya no se usa.

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_data    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anthropometry   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foods           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos          ENABLE ROW LEVEL SECURITY;


-- ── 2. Y ahora sí, los permisos de tabla ───────────────────────────────────
--
-- Este es el modelo de Supabase y el que el proyecto lleva declarando desde el
-- principio: el permiso de tabla es ancho y **quien filtra es RLS**. Sin RLS
-- delante esto sería una barbaridad; con RLS encendido en el paso anterior, es
-- lo correcto.
--
-- `anon` NO recibe nada. Lo que se abre sin sesión —la revisión compartida y la
-- invitación— pasa por funciones `SECURITY DEFINER` y por la función de borde,
-- que tienen su propio `GRANT EXECUTE`. Una cuenta sin identificar no necesita
-- tocar ni una tabla.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_data    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anthropometry   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercises       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foods           TO authenticated;

-- `videos` no la usa nadie: solo lectura, y RLS sin políticas la deja vacía.
GRANT SELECT ON public.videos TO authenticated;

/*
  ══ `profiles` aparte, y aquí hay un tercer hallazgo ═══════════════════════

  La 0002 quiso impedir que un cliente se ascendiera a entrenador y lo escribió
  así:

      REVOKE UPDATE (role) ON public.profiles FROM authenticated;

  **Eso no protege nada mientras exista el permiso de UPDATE sobre la tabla.** En
  PostgreSQL un permiso de tabla cubre todas sus columnas, y un `REVOKE` de
  columna no puede restarle nada: no da error, no avisa, y el permiso sigue ahí.
  Comprobado en la base reconstruida — tras conceder UPDATE sobre la tabla y
  repetir el REVOKE de la 0002, `information_schema.column_privileges` seguía
  diciendo que `authenticated` puede escribir `role`.

  Como en el proyecto real el permiso de tabla lo puso el panel de Supabase, es
  muy probable que **esa corrección nunca haya estado en vigor**. Merece una
  comprobación con la consulta del final de este archivo.

  La forma que sí funciona es la contraria: quitar el permiso de tabla y conceder
  columna por columna. Y ya puestos, se conceden solo las que la aplicación
  escribe de verdad —`preferences`, la plantilla del entrenador (0035)— más
  `full_name`. Ni `role`, ni `id`, ni `email`: cambiar el correo aquí no cambia
  el de la cuenta, así que solo serviría para desincronizarlos.
*/
GRANT SELECT ON public.profiles TO authenticated;

REVOKE UPDATE, INSERT, DELETE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, preferences) ON public.profiles TO authenticated;

-- ── 3. Y las tablas de las migraciones posteriores ─────────────────────────
--
-- Ésas SÍ encienden su RLS (por eso 21 de 30 estaban bien), pero **ninguna
-- concede permisos tampoco**. Sin esto, la reconstrucción se queda sin equipos,
-- sin check-ins, sin calendario, sin integraciones y sin soporte.
--
-- Lo que se concede a cada una sale de lo que la aplicación hace de verdad
-- —`grep .from('tabla')` sobre `src/`—, no de conceder por si acaso. Las que la
-- aplicación NO toca desde el navegador se quedan SIN permiso a propósito, y son
-- justo las delicadas: `integration_secrets` (guarda los tokens de Notion y
-- Stripe), `platform_admins`, `client_invites`, `client_consents` y
-- `team_subscriptions`. A todas ésas se llega por funciones `SECURITY DEFINER`,
-- que tienen su propio `GRANT EXECUTE` y comprueban quién llama.

-- Solo lectura: las escribe un disparador, una función o una migración.
GRANT SELECT ON public.audit_log         TO authenticated;  -- lo escribe el trigger (0017)
GRANT SELECT ON public.catalog_exercises TO authenticated;  -- catálogo común (0033)
GRANT SELECT ON public.catalog_foods     TO authenticated;
GRANT SELECT ON public.plan_limits       TO authenticated;  -- los límites del plan (0019)
GRANT SELECT ON public.check_ins         TO authenticated;  -- se escriben por RPC (0009, 0044)
GRANT SELECT ON public.team_subscriptions TO authenticated; -- la lee `my_team_plan`, la escribe el webhook

-- Lectura y escritura: entidades que la aplicación gestiona directamente.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_events       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_phases       TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON public.client_external_refs TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON public.integrations       TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON public.support_tickets    TO authenticated;
GRANT SELECT, INSERT                  ON public.support_messages   TO authenticated;
GRANT SELECT, UPDATE                  ON public.review_links       TO authenticated;
GRANT SELECT, UPDATE                  ON public.teams              TO authenticated;
GRANT SELECT, UPDATE, DELETE          ON public.team_members       TO authenticated;

-- ── 4. Y la clave de servidor, que tampoco tenía nada ──────────────────────
--
-- `service_role` es la clave de confianza: la que usan las funciones de borde, el
-- webhook de Stripe y `npm run backup`. Nunca viaja al navegador.
--
-- Tiene `BYPASSRLS`, y ahí está la trampa: **saltarse RLS no es tener permisos**.
-- Son dos cosas distintas y hacen falta las dos. En la base reconstruida el rol
-- se saltaba todas las políticas y aun así no podía leer ni una fila, porque
-- ninguna migración le concede nada.
--
-- La consecuencia más fea es la copia de seguridad: `backup.mjs` se conecta con
-- esta clave, y sobre una instalación hecha solo desde el repositorio **no podría
-- copiar nada**. Justo la herramienta que existe para el peor día.
--
-- Aquí sí es correcto conceder en bloque: este rol tiene acceso completo por
-- definición, incluida `integration_secrets` —las funciones de borde leen de ahí
-- los tokens—. Lo que lo protege no es el permiso, es que la clave no salga del
-- servidor.

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

/*
  Y para las tablas que vengan.

  Es lo que impide que este agujero se vuelva a abrir solo: sin esto, la próxima
  migración que cree una tabla la dejaría otra vez sin permisos para la clave de
  servidor, y nadie lo notaría hasta la siguiente copia de seguridad.

  Se declara para `postgres` porque es el rol con el que se aplican las
  migraciones, que es quien creará esas tablas.

  A `authenticated` NO se le pone nada por defecto, y es deliberado: sus permisos
  se conceden tabla por tabla más arriba, según lo que la aplicación necesita de
  cada una. Un valor por defecto ancho para el rol del navegador convertiría cada
  tabla nueva en accesible por descuido — que es exactamente lo contrario de lo
  que arregla esta migración.
*/
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

/*
  Las secuencias de las tablas con clave autonumérica.

  `audit_log` y `product_events` usan `GENERATED ALWAYS AS IDENTITY`, que no
  necesita permiso de secuencia. Se deja anotado porque es la duda que aparece
  siempre al repasar permisos: si alguna tabla futura usa `serial`, ahí sí hará
  falta `GRANT USAGE ON SEQUENCE`.
*/

COMMIT;


-- ============================================================================
-- Comprobarlo — y esto sí conviene ejecutarlo en producción
-- ----------------------------------------------------------------------------
-- Que NO queda ninguna tabla de `public` con RLS apagado (tiene que dar CERO
-- filas). Si devuelve algo, ahí hay datos que no está protegiendo nadie:
--
--   SELECT c.relname
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
--
-- Que las políticas de la 0002 están y ahora sí se evalúan:
--
--   SELECT tablename, count(*) FROM pg_policies
--   WHERE schemaname = 'public' GROUP BY 1 ORDER BY 1;
--
-- Que el rol no se puede escribir (tiene que devolver CERO filas):
--
--   SELECT grantee, privilege_type, column_name
--   FROM information_schema.column_privileges
--   WHERE table_name = 'profiles' AND column_name = 'role'
--     AND grantee = 'authenticated' AND privilege_type = 'UPDATE';
--
-- Y desde la APLICACIÓN, que es donde importa: entrar con dos cuentas de
-- entrenador distintas y comprobar que ninguna ve a los clientes de la otra.
-- Eso es justo lo que automatiza `npm run test:db`.
-- ============================================================================
