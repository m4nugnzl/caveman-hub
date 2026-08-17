-- ============================================================================
-- Afinar la radiografía: 239 críticos de los que 2 lo eran
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y de solo lectura. Reemplaza el cuerpo de
--     `public.radiografia_seguridad()` (0053). No cambia su firma, ni sus
--     permisos, ni toca ninguna tabla. Nada del navegador la llama.
--
-- ══ Qué pasó al ejecutarla por primera vez ══════════════════════════════════
--
-- La 0053 se estrenó contra el proyecto real y devolvió **239 hallazgos
-- críticos**. De esos, dos merecían la palabra:
--
--   · `handle_new_user()` es SECURITY DEFINER y no fija `search_path`. Es el
--     disparador que corre al registrarse alguien.
--   · La tabla `videos` tiene una política `FOR ALL` cuyo rol es `public`.
--
-- Los otros 237 eran **la configuración por defecto de Supabase**, que es la
-- misma en todos los proyectos del mundo:
--
--   · 238 filas de «anon tiene INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/
--     TRIGGER/MAINTAIN sobre la tabla» — siete por cada una de las 31 tablas.
--     Es el `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon` de
--     Supabase.
--   · 187 funciones `gbt_*`, `*_dist`, `gbtreekey*`: la extensión `btree_gist`
--     instalada en `public`. Aritmética de índices, de nadie.
--
-- ══ Por qué eso NO es un detalle cosmético ══════════════════════════════════
--
-- Porque una lista de 239 críticos no se lee. Se mira una vez, se decide que
-- «eso sale siempre» y se deja de abrir — y el día que aparezca el 240, que sí
-- importa, no lo va a ver nadie.
--
-- La propia `docs/observabilidad.md` lo dice de la otra herramienta: «un script
-- que siempre falla es un script que se deja de mirar». Aplicarse el cuento es
-- esta migración.
--
-- ══ Los cuatro cambios, y el criterio de cada uno ═══════════════════════════
--
-- 1. LOS GRANT A `anon` SE CORRELACIONAN CON RLS, que es lo que de verdad
--    decide si son peligrosos.
--
--    Un `GRANT` a `anon` sobre una tabla CON RLS activo es inerte: la política
--    filtra igual, y sin política no pasa nada. Sobre una tabla SIN RLS es
--    acceso directo desde internet.
--
--    Esa correlación es literalmente la lección de la 0046: «los dos agujeros
--    se tapaban el uno al otro». Informar de cada permiso por separado rompe esa
--    pareja justo cuando es lo único que importa. Ahora los grants solo aparecen
--    —y como críticos— si la tabla NO tiene RLS; si lo tiene, se resumen en una
--    sola línea de contexto con el recuento.
--
-- 2. LAS FUNCIONES DE EXTENSIONES SE IGNORAN. No son de este proyecto, nadie las
--    escribió aquí y nadie las va a revocar: quitarlas de la lista no pierde
--    ninguna información y devuelve 192 filas a 4.
--
-- 3. LAS FUNCIONES DE DISPARADOR SE IGNORAN en la comprobación de «alcanzable
--    sin sesión». Una función que devuelve `trigger` no se puede invocar por la
--    API: PostgREST no la expone. Que `anon` tenga EXECUTE sobre ella no abre
--    ninguna puerta, porque no hay puerta.
--
--    Ojo: siguen contando en la comprobación de `search_path` (número 6), y es
--    justo donde apareció `handle_new_user`. Son dos riesgos distintos y solo
--    uno depende de que se pueda llamar desde fuera.
--
-- 4. LAS `SECURITY DEFINER` ALCANZABLES SIN SESIÓN SE SEPARAN POR SI SE DEFIENDEN
--    SOLAS. La 0047 revisó esa lista a mano y concluyó que «la mayoría se
--    defienden solas: comprueban `auth.uid()` o llaman a `app_can_write_client`,
--    y con `anon` eso es nulo y levantan excepción. Esa es la defensa de verdad,
--    y funciona».
--
--    Eso se puede mirar en el propio cuerpo de la función. Es una HEURÍSTICA y
--    hay que decirlo: una función podría comprobar los permisos de una forma que
--    no esté en la lista, y saldría como crítica sin serlo. Se prefiere ese error
--    al contrario —callar una que no comprueba nada— y por eso el texto del
--    hallazgo dice lo que se ha mirado, para que quien lo lea pueda no estar de
--    acuerdo.
--
-- ══ Lo que NO cambia ════════════════════════════════════════════════════════
--
-- Ninguna comprobación desaparece. Lo que había sigue estando: lo que cambia es
-- qué se llama crítico y qué se agrupa. Un hallazgo que antes salía y ahora no
-- es siempre uno que se ha demostrado inerte, nunca uno que se haya dejado de
-- mirar — y las líneas de contexto del final están para poder comprobarlo.
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
    'rls'::text,
    'critico'::text,
    c.relname::text,
    'La tabla no tiene RLS activo: sus políticas, si las tiene, no se evalúan.'::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity
  ORDER BY c.relname;

  /*
    ── 2. RLS encendido y ninguna política ───────────────────────────────────
    No es un fallo de seguridad sino de funcionamiento: con RLS activo y sin
    políticas la tabla está cerrada del todo salvo para `service_role`. A veces
    es exactamente lo que se quiere —`integration_secrets` guarda tokens,
    `platform_admins` solo se lee a través de `is_platform_admin()`,
    `product_events` y `app_errors` se escriben y no se leen— y por eso es un
    aviso. Pero una tabla que la aplicación necesita leer y que aparezca aquí
    explica un «no me carga nada» que si no se busca en el sitio equivocado.
  */
  RETURN QUERY
  SELECT
    'rls'::text,
    'aviso'::text,
    c.relname::text,
    'RLS activo y ninguna política: nadie puede leerla ni escribirla por la API.'::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity
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
  WHERE p.schemaname = 'public'
    AND (p.roles && ARRAY['anon', 'public']::name[])
  ORDER BY p.tablename, p.policyname;

  /*
    ── 4. Permisos de TABLA para `anon`, correlacionados con RLS ─────────────
    Ver el punto 1 de la cabecera. Sin RLS, un GRANT a `anon` es la puerta
    entera; con RLS, es media puerta que la política cierra.

    Se agrupa por tabla y no por permiso: siete líneas de la misma tabla no
    dicen nada que no diga una.
  */
  RETURN QUERY
  SELECT
    'anon'::text,
    'critico'::text,
    c.relname::text,
    ('SIN RLS y con permisos para anon (' ||
     string_agg(DISTINCT a.privilege_type, ', ' ORDER BY a.privilege_type) ||
     '): se lee y se escribe desde internet sin sesión.')::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
  JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND r.rolname = 'anon'
    AND NOT c.relrowsecurity
  GROUP BY c.relname
  ORDER BY c.relname;

  /*
    ── 5. Funciones alcanzables sin sesión ───────────────────────────────────
    La trampa que documenta la 0047: Supabase declara `ALTER DEFAULT PRIVILEGES
    … GRANT ALL ON FUNCTIONS TO anon`, así que toda función nueva nace
    ejecutable por `anon`, y el `REVOKE … FROM public` que casi todas las
    migraciones escriben no lo quita. Esta comprobación se dispara sola cada vez
    que alguien añade una función y se olvida de revocar, y eso es su virtud.

    Fuera quedan las de extensiones (`btree_gist` mete 187 en `public`) y las de
    disparador, que PostgREST no expone: ver los puntos 2 y 3 de la cabecera.

    El nivel sale de si la función SE DEFIENDE SOLA. Es una heurística —se mira
    si el cuerpo nombra alguna comprobación de permisos— y por eso el texto dice
    exactamente qué se ha mirado: quien lo lea tiene que poder no estar de
    acuerdo con conocimiento de causa.
  */
  IF hay_anon THEN
    RETURN QUERY
    SELECT
      'anon'::text,
      CASE WHEN p.prosecdef AND NOT (
             p.prosrc ILIKE '%auth.uid()%' OR
             p.prosrc ILIKE '%app_can_%'   OR
             p.prosrc ILIKE '%app_is_%'    OR
             p.prosrc ILIKE '%app_owns_%'  OR
             p.prosrc ILIKE '%my_team%'    OR
             p.prosrc ILIKE '%shares_team_with%' OR
             p.prosrc ILIKE '%is_platform_admin%'
           ) THEN 'critico' ELSE 'aviso' END::text,
      (p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')')::text,
      (CASE
         WHEN p.prosecdef AND NOT (
             p.prosrc ILIKE '%auth.uid()%' OR
             p.prosrc ILIKE '%app_can_%'   OR
             p.prosrc ILIKE '%app_is_%'    OR
             p.prosrc ILIKE '%app_owns_%'  OR
             p.prosrc ILIKE '%my_team%'    OR
             p.prosrc ILIKE '%shares_team_with%' OR
             p.prosrc ILIKE '%is_platform_admin%'
           )
           THEN 'SECURITY DEFINER, ejecutable sin sesión y su cuerpo NO nombra ninguna comprobación de permisos.'
         WHEN p.prosecdef
           THEN 'SECURITY DEFINER y ejecutable sin sesión, pero comprueba permisos por dentro (0047).'
         ELSE 'Ejecutable sin sesión. No es SECURITY DEFINER: corre con los permisos de anon.'
       END)::text
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      -- Ni las de extensiones ni las de disparador: cabecera, puntos 2 y 3.
      AND p.prorettype <> 'pg_catalog.trigger'::regtype
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend d
        WHERE d.objid = p.oid AND d.classid = 'pg_catalog.pg_proc'::regclass AND d.deptype = 'e'
      )
    ORDER BY p.prosecdef DESC, p.proname;
  ELSE
    RETURN QUERY
    SELECT
      'anon'::text, 'info'::text, 'anon'::text,
      'El rol «anon» no existe en esta base: no se ha comprobado qué se puede ejecutar sin sesión.'::text;
  END IF;

  /*
    ── 6. SECURITY DEFINER sin `search_path` fijo ────────────────────────────
    Una función que corre con permisos del definidor y resuelve los nombres con
    el `search_path` de QUIEN LA LLAMA se puede engañar: basta con crear un
    esquema propio con una tabla del mismo nombre y ponerlo delante. Es la
    escalada de privilegios clásica de PostgreSQL y no deja ninguna huella.

    Aquí SÍ entran las funciones de disparador —y es donde apareció
    `handle_new_user`—: el riesgo no es que se pueda llamar desde fuera, es que
    se ejecute con permisos prestados resolviendo nombres ajenos.
  */
  RETURN QUERY
  SELECT
    'funciones'::text,
    'critico'::text,
    (p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')')::text,
    'SECURITY DEFINER sin search_path fijo: se puede engañar con un esquema propio.'::text
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
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

    Es la única comprobación cuyo hallazgo sería una brecha de datos de salud.
  */
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    RETURN QUERY
    SELECT
      'almacenamiento'::text, 'critico'::text, b.id::text,
      'Bucket PÚBLICO: sus archivos se leen sin sesión con solo conocer la URL.'::text
    FROM storage.buckets b
    WHERE b.public;
  END IF;

  /*
    ── 8. Contexto ───────────────────────────────────────────────────────────
    Sin esto, un informe con cero hallazgos no se distingue de uno que no llegó a
    mirar nada. Y desde esta migración cumple una segunda función más
    importante: es donde se puede comprobar que lo agrupado sigue estando bien.

    Si la línea de los GRANT dijera «28 de 31 con RLS», habría tres tablas cuyos
    permisos se están resumiendo en lugar de denunciarse — y saldrían arriba, en
    la comprobación 4, como críticas. Las dos cifras se vigilan la una a la otra.
  */
  RETURN QUERY
  SELECT
    'contexto'::text, 'info'::text, 'tablas'::text,
    (count(*) FILTER (WHERE c.relrowsecurity) || ' de ' || count(*) ||
     ' tablas de public con RLS activo.')::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';

  RETURN QUERY
  SELECT
    'contexto'::text, 'info'::text, 'politicas'::text,
    (count(*) || ' políticas RLS declaradas sobre public.')::text
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public';

  IF hay_anon THEN
    RETURN QUERY
    SELECT
      'contexto'::text, 'info'::text, 'permisos_anon'::text,
      (count(DISTINCT c.relname) ||
       ' tablas con los GRANT por defecto de Supabase para anon. Son inertes mientras esas ' ||
       'tablas tengan RLS activo; las que no lo tengan salen arriba como críticas.')::text
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
    JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND r.rolname = 'anon';

    RETURN QUERY
    SELECT
      'contexto'::text, 'info'::text, 'funciones_extension'::text,
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

/* Los permisos no cambian, pero se repiten: un `CREATE OR REPLACE` conserva los
   del objeto, y depender de eso obliga a recordarlo. Repetirlos es barato y hace
   que este archivo se pueda leer solo. */
REVOKE ALL ON FUNCTION public.radiografia_seguridad() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.radiografia_seguridad() TO service_role;

COMMIT;


-- ============================================================================
-- Lo que esta migración NO arregla, y hay que arreglar a mano
-- ----------------------------------------------------------------------------
-- Los dos hallazgos de verdad de la primera ejecución siguen ahí, porque son
-- problemas del proyecto y no del informe:
--
--   1. `handle_new_user()` — SECURITY DEFINER sin `search_path`. Corre al
--      registrarse un usuario. Se arregla con una línea:
--
--        ALTER FUNCTION public.handle_new_user() SET search_path = '';
--
--      (y comprobando antes que su cuerpo nombra los objetos con esquema, o
--      pasará a fallar en el registro de cada usuario nuevo — que es peor).
--
--   2. `videos · Acceso a videos` — política `FOR ALL` con rol `public`, o sea
--      alcanzable sin sesión. `auditoria.md` §2 ya dice que la tabla `videos`
--      sobra: la corrección de vídeos se retiró del producto. Lo correcto no es
--      arreglar la política, es quitar la tabla.
--
-- Las dos se dejan aquí escritas y sin hacer a propósito: son cambios sobre el
-- funcionamiento de la aplicación —el registro de usuarios y una tabla— y no
-- tienen por qué colarse dentro de una migración que solo cambia un informe.
-- ============================================================================
