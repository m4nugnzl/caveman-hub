-- ============================================================================
-- Dejar de tener una lista de nombres que adivinar
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y de solo lectura. Reemplaza el cuerpo de
--     `public.radiografia_seguridad()` (0053, afinada por la 0054). No cambia su
--     firma, ni sus permisos, ni toca ninguna tabla.
--
-- ══ Las tres falsas alarmas ═════════════════════════════════════════════════
--
-- La 0054 marcaba como críticas las funciones `SECURITY DEFINER` alcanzables sin
-- sesión «cuyo cuerpo NO nombra ninguna comprobación de permisos», y decidía eso
-- con una lista de nombres escrita a mano: `auth.uid()`, `app_can_%`, `my_team%`
-- y unos pocos más.
--
-- Contra el proyecto real señaló tres, y las tres estaban bien:
--
--   · `can_write_client_active` llama a `can_write_client(target)` (0027).
--   · `log_session_feedback` hace `IF NOT (is_me(…) OR is_my_client(…))
--     THEN RAISE EXCEPTION` (0016).
--   · `revoke_client_invite` hace `IF NOT is_my_client(target)
--     THEN RAISE EXCEPTION` (0015).
--
-- Ninguno de esos tres nombres —`can_write_client`, `is_me`, `is_my_client`—
-- estaba en la lista. Y no por descuido: la lista se escribió mirando unas
-- cuantas migraciones, y **no hay forma de saber que está completa**.
--
-- ══ Por qué alargar la lista sería el arreglo equivocado ════════════════════
--
-- Porque el fallo no es que le falten tres nombres: es que una lista de nombres
-- de un proyecto vivo está incompleta por definición. Mañana alguien escribe un
-- ayudante nuevo, lo usa en una función, y esa función aparece como crítica sin
-- serlo. A la tercera vez que eso pasa, la sección de seguridad se ignora — que
-- es exactamente lo que la 0054 vino a evitar.
--
-- ══ Lo que hace en su lugar: seguir las llamadas ════════════════════════════
--
-- La autorización de este proyecto SIEMPRE termina en `auth.uid()`. Todos los
-- ayudantes lo demuestran:
--
--   is_my_client(t)  →  clients WHERE coach_id = auth.uid()             (0002)
--   is_me(t)         →  clients WHERE client_profile_id = auth.uid()    (0002)
--   can_write_client →  team_members m ON m.profile_id = auth.uid()     (0006)
--   app_can_write_client → clients WHERE coach_id = auth.uid()          (0009)
--
-- Así que la pregunta correcta no es «¿nombra alguno de estos?» sino **«¿llega a
-- `auth.uid()` por algún camino?»**. Eso se resuelve con una consulta recursiva:
-- se parte de las funciones que nombran `auth.uid()` ellas mismas, y se van
-- añadiendo las que llaman a alguna de las que ya están.
--
-- No hay nada que mantener. Un ayudante nuevo entra solo el día que se escribe,
-- porque su cuerpo termina en `auth.uid()` como todos los demás.
--
-- ══ Lo que sigue sin poder afirmar, y cómo se dice ══════════════════════════
--
-- Que una función ALCANCE `auth.uid()` no demuestra que lo use bien: podría
-- calcularlo y no mirarlo. Al revés sí es concluyente — una función que no llega
-- a `auth.uid()` por ningún camino no está comprobando quién llama, y punto.
--
-- Por eso el texto del hallazgo cambia: ya no dice «no comprueba permisos»
-- —que es una afirmación que este análisis no puede sostener— sino que **no
-- alcanza `auth.uid()` por ninguna llamada**, que es exactamente lo que se ha
-- comprobado. Quien lo lea tiene que poder no estar de acuerdo sabiendo qué se
-- miró.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.radiografia_seguridad()
RETURNS TABLE (area text, nivel text, objeto text, detalle text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hay_anon boolean := EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon');
BEGIN
  /*
    ── 1. Tablas sin RLS ─────────────────────────────────────────────────────
    El hallazgo de la 0046, hecho comprobación. Una tabla de `public` sin RLS es
    legible y escribible por cualquiera que tenga permiso de tabla, y
    `authenticated` lo tiene sobre todo: es decir, por cualquiera con una
    cuenta. Con la anon key pública por diseño, «cualquiera con una cuenta» es
    cualquiera.
  */
  RETURN QUERY
  SELECT
    'rls'::text, 'critico'::text, c.relname::text,
    'La tabla no tiene RLS activo: sus políticas, si las tiene, no se evalúan.'::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  ORDER BY c.relname;

  /*
    ── 2. RLS encendido y ninguna política ───────────────────────────────────
    No es un fallo de seguridad sino de funcionamiento: la tabla queda cerrada
    del todo salvo para `service_role`. A veces es lo que se quiere
    —`integration_secrets` guarda tokens, `platform_admins` solo se lee por
    `is_platform_admin()`, `product_events` y `app_errors` se escriben y no se
    leen— y por eso es un aviso. Pero una tabla que la aplicación necesita leer
    y que aparezca aquí explica un «no me carga nada» que si no se busca en el
    sitio equivocado.
  */
  RETURN QUERY
  SELECT
    'rls'::text, 'aviso'::text, c.relname::text,
    'RLS activo y ninguna política: nadie puede leerla ni escribirla por la API.'::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid = c.oid)
  ORDER BY c.relname;

  /*
    ── 3. Políticas que alcanzan a quien no ha iniciado sesión ───────────────
    Una política cuyo rol es `anon` —o `public`, que lo incluye— es una puerta
    abierta a internet. Puede ser correcta: los planes públicos de la 0049 lo
    son. Se distingue por el comando: que se pueda LEER algo pensado para ser
    público es una decisión; que se pueda ESCRIBIR sin identificarse casi nunca
    lo es.
  */
  RETURN QUERY
  SELECT
    'anon'::text,
    CASE WHEN p.cmd = 'SELECT' THEN 'aviso' ELSE 'critico' END::text,
    (p.tablename || ' · ' || p.policyname)::text,
    ('Política ' || p.cmd || ' alcanzable sin sesión (roles: ' ||
     array_to_string(p.roles, ', ') || ').')::text
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public' AND (p.roles && ARRAY['anon', 'public']::name[])
  ORDER BY p.tablename, p.policyname;

  /*
    ── 4. Permisos de TABLA para `anon`, correlacionados con RLS ─────────────
    Sin RLS, un GRANT a `anon` es la puerta entera; con RLS, es media puerta que
    la política cierra. Esa correlación es la lección de la 0046: «los dos
    agujeros se tapaban el uno al otro». Se agrupa por tabla: siete líneas de la
    misma no dicen nada que no diga una.
  */
  RETURN QUERY
  SELECT
    'anon'::text, 'critico'::text, c.relname::text,
    ('SIN RLS y con permisos para anon (' ||
     string_agg(DISTINCT a.privilege_type, ', ' ORDER BY a.privilege_type) ||
     '): se lee y se escribe desde internet sin sesión.')::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
  JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND r.rolname = 'anon' AND NOT c.relrowsecurity
  GROUP BY c.relname
  ORDER BY c.relname;

  /*
    ── 5. Funciones alcanzables sin sesión ───────────────────────────────────
    La trampa de la 0047: Supabase concede `EXECUTE` a `anon` sobre toda función
    nueva, y el `REVOKE … FROM public` de las migraciones no lo quita. Esta
    comprobación se dispara sola cuando alguien añade una y se olvida de
    revocar, y eso es su virtud.

    Fuera quedan las de extensiones y las de disparador (0054): las primeras no
    son de este proyecto y las segundas no las expone PostgREST.

    El nivel sale de si la función LLEGA a `auth.uid()` por alguna cadena de
    llamadas. Ver la cabecera de esta migración: la lista de nombres a mano que
    había aquí produjo tres falsas alarmas de tres.
  */
  IF hay_anon THEN
    RETURN QUERY
    WITH RECURSIVE propias AS (
      /* Las funciones de este proyecto: ni de extensión ni de disparador. */
      SELECT p.oid, p.proname, p.prosrc, p.prosecdef, p.prorettype
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_depend d
          WHERE d.objid = p.oid AND d.classid = 'pg_catalog.pg_proc'::regclass AND d.deptype = 'e'
        )
    ),
    /*
      El cierre transitivo. El caso base son las que nombran `auth.uid()` ellas
      mismas; el paso recursivo añade las que LLAMAN a alguna de las que ya
      están. `\m…\s*\(` exige principio de palabra y paréntesis detrás, para que
      `is_me` no case dentro de `folder_is_me` ni dentro de un comentario que lo
      mencione de pasada.

      Termina porque `UNION` deduplica y el conjunto de funciones es finito.
    */
    llegan_a_uid AS (
      SELECT oid, proname FROM propias WHERE prosrc ILIKE '%auth.uid()%'
      UNION
      SELECT p.oid, p.proname
      FROM propias p
      JOIN llegan_a_uid u ON p.oid <> u.oid
        AND p.prosrc ~* ('\m' || u.proname || '\s*\(')
    )
    SELECT
      'anon'::text,
      CASE WHEN p.prosecdef AND u.oid IS NULL THEN 'critico' ELSE 'aviso' END::text,
      (p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')')::text,
      (CASE
         WHEN p.prosecdef AND u.oid IS NULL
           THEN 'SECURITY DEFINER, ejecutable sin sesión y NO alcanza auth.uid() por ninguna cadena de llamadas: no comprueba quién llama.'
         WHEN p.prosecdef
           THEN 'SECURITY DEFINER y ejecutable sin sesión, pero alcanza auth.uid() y se defiende sola (0047).'
         ELSE 'Ejecutable sin sesión. No es SECURITY DEFINER: corre con los permisos de anon.'
       END)::text
    FROM propias p
    LEFT JOIN llegan_a_uid u ON u.oid = p.oid
    WHERE pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.prorettype <> 'pg_catalog.trigger'::regtype
    /* Los críticos primero. Un `ORDER BY nivel` los pondría detrás: «aviso» va
       antes que «critico» por orden alfabético, que no es el orden en el que se
       lee una lista de seguridad. */
    ORDER BY (p.prosecdef AND u.oid IS NULL) DESC, p.proname;
  ELSE
    RETURN QUERY
    SELECT 'anon'::text, 'info'::text, 'anon'::text,
      'El rol «anon» no existe en esta base: no se ha comprobado qué se puede ejecutar sin sesión.'::text;
  END IF;

  /*
    ── 6. SECURITY DEFINER sin `search_path` fijo ────────────────────────────
    Una función que corre con permisos del definidor y resuelve los nombres con
    el `search_path` de QUIEN LA LLAMA se puede engañar: basta con crear un
    esquema propio con una tabla del mismo nombre y ponerlo delante. Es la
    escalada de privilegios clásica de PostgreSQL y no deja ninguna huella.

    Aquí SÍ entran las de disparador —y es donde apareció `handle_new_user`—: el
    riesgo no es que se pueda llamar desde fuera, es que se ejecute con permisos
    prestados resolviendo nombres ajenos.
  */
  RETURN QUERY
  SELECT
    'funciones'::text, 'critico'::text,
    (p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')')::text,
    'SECURITY DEFINER sin search_path fijo: se puede engañar con un esquema propio.'::text
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
      WHERE cfg LIKE 'search\_path=%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d
      WHERE d.objid = p.oid AND d.classid = 'pg_catalog.pg_proc'::regclass AND d.deptype = 'e'
    )
  ORDER BY p.proname;

  /*
    ── 7. Buckets públicos ───────────────────────────────────────────────────
    `client-media` guarda fotografías de los cuerpos de personas concretas. Un
    bucket público significa que cualquiera con la URL las ve, sin sesión y sin
    política que valga — y las URL de Storage son adivinables si se conoce la
    estructura, que está escrita en este mismo repositorio.
  */
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    RETURN QUERY
    SELECT 'almacenamiento'::text, 'critico'::text, b.id::text,
      'Bucket PÚBLICO: sus archivos se leen sin sesión con solo conocer la URL.'::text
    FROM storage.buckets b WHERE b.public;
  END IF;

  /*
    ── 8. Contexto ───────────────────────────────────────────────────────────
    Sin esto, un informe con cero hallazgos no se distingue de uno que no llegó
    a mirar nada. Y desde la 0054 cumple una segunda función: es donde se
    comprueba que lo agrupado sigue estando bien. Si la línea de los GRANT
    dijera «28 de 31 con RLS», habría tres tablas cuyos permisos se resumen en
    lugar de denunciarse — y saldrían arriba, en la comprobación 4.
  */
  RETURN QUERY
  SELECT 'contexto'::text, 'info'::text, 'tablas'::text,
    (count(*) FILTER (WHERE c.relrowsecurity) || ' de ' || count(*) ||
     ' tablas de public con RLS activo.')::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';

  RETURN QUERY
  SELECT 'contexto'::text, 'info'::text, 'politicas'::text,
    (count(*) || ' políticas RLS declaradas sobre public.')::text
  FROM pg_catalog.pg_policies p WHERE p.schemaname = 'public';

  IF hay_anon THEN
    RETURN QUERY
    SELECT 'contexto'::text, 'info'::text, 'permisos_anon'::text,
      (count(DISTINCT c.relname) ||
       ' tablas con los GRANT por defecto de Supabase para anon. Son inertes mientras esas ' ||
       'tablas tengan RLS activo; las que no lo tengan salen arriba como críticas.')::text
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
    JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND r.rolname = 'anon';

    RETURN QUERY
    SELECT 'contexto'::text, 'info'::text, 'funciones_extension'::text,
      (count(*) || ' funciones de extensiones instaladas en public, excluidas de la ' ||
       'comprobación 5: no son de este proyecto y nadie las va a revocar.')::text
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend d
        WHERE d.objid = p.oid AND d.classid = 'pg_catalog.pg_proc'::regclass AND d.deptype = 'e'
      );
  END IF;
END;
$$;

/* Un `CREATE OR REPLACE` conserva los permisos del objeto, pero depender de eso
   obliga a recordarlo. Repetirlos es barato y hace que el archivo se lea solo. */
REVOKE ALL ON FUNCTION public.radiografia_seguridad() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.radiografia_seguridad() TO service_role;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Las tres falsas alarmas de la 0054 tienen que haber desaparecido, y el
-- hallazgo de verdad seguir ahí:
--
--   SELECT nivel, objeto FROM public.radiografia_seguridad() WHERE nivel = 'critico';
--
--   Esperado: `videos · Acceso a videos` y `handle_new_user()`. Y NO:
--   `can_write_client_active`, `log_session_feedback` ni `revoke_client_invite`.
--
-- Que el cierre transitivo hace su trabajo —estas tres llegan a auth.uid() por
-- una llamada, no directamente—:
--
--   SELECT objeto, detalle FROM public.radiografia_seguridad()
--   WHERE objeto LIKE 'revoke_client_invite%';
--   → «… pero alcanza auth.uid() y se defiende sola»
-- ============================================================================
