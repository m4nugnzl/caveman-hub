-- ============================================================================
-- La radiografía: lo que solo sabe el catálogo de Postgres
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y de solo lectura. Dos funciones que no escriben nada, no tocan
--     ninguna tabla y no conceden ningún permiso nuevo a nadie con sesión.
--
--     La aplicación funciona SIN esta migración y ni se entera: nada del
--     navegador la llama. La usa `npm run radiografia`, que corre fuera.
--
-- ══ Qué resuelve, y por qué merece existir ══════════════════════════════════
--
-- La migración 0046 cuenta el peor susto del proyecto: **RLS estaba apagado en
-- las nueve tablas base**. Dieciocho políticas escritas, revisadas y sin
-- evaluar, porque en PostgreSQL una política sobre una tabla con RLS apagado no
-- filtra poco: no se evalúa. Se descubrió por casualidad, meses después,
-- levantando el entorno local por otro motivo.
--
-- Eso no se descubrió antes por una razón sencilla: **nadie lo estaba mirando, y
-- no había forma de mirarlo**. El estado de seguridad de una base de datos no
-- está en el código, está en el catálogo, y el catálogo no se lee sin querer.
--
-- Estas dos funciones convierten aquel hallazgo en una comprobación que se hace
-- en dos segundos y cuantas veces haga falta. Si mañana una migración deja una
-- tabla nueva sin RLS, o Supabase concede permisos por su cuenta, sale en el
-- informe del viernes en vez de dentro de ocho meses.
--
-- ══ Por qué SOLO para `service_role` ════════════════════════════════════════
--
-- Porque la salida es un mapa de por dónde entrar: qué tablas no filtran, qué
-- puede ejecutar quien no ha iniciado sesión, qué funciones corren con permisos
-- del definidor. Eso es exactamente lo que buscaría alguien que quisiera atacar
-- esto, y no hay ninguna pantalla que lo necesite.
--
-- Así que no se expone a `anon` ni a `authenticated`, ni siquiera a un
-- administrador de plataforma. Se llama con la `service_role key`, que vive en
-- `.env.backup` y nunca sale de la máquina de quien administra — el mismo
-- reparto que ya usa `npm run backup`.
--
-- Y por eso el panel de todo esto NO está dentro de la aplicación: una pantalla
-- web que enseñe esta información necesita una ruta, una sesión y una política
-- que la proteja, y sería la única pantalla del producto cuyo fallo de
-- autorización se paga con el mapa de la casa. Un informe que se genera en local
-- no tiene esa superficie porque no tiene puerta.
--
-- ══ Por qué `SECURITY DEFINER` teniendo ya la service_role ══════════════════
--
-- Por `storage.buckets`, que no es del esquema `public` y cuyo dueño es
-- `supabase_storage_admin`. El resto del catálogo se lee sin privilegios
-- especiales, pero mezclar dos formas de acceso dentro de la misma función
-- obligaría a razonar cuál aplica en cada línea.
--
-- Las dos llevan `SET search_path = ''` y nombran cada objeto por su esquema.
-- Es la regla que la propia función comprueba en las demás; incumplirla aquí
-- sería la clase de detalle que hace que nadie se crea el informe.
-- ============================================================================

BEGIN;

/**
 * El estado de la seguridad, tal y como está AHORA MISMO en el catálogo.
 *
 * Devuelve una fila por hallazgo. Ninguna es necesariamente un fallo: hay
 * decisiones deliberadas —dos pantallas se abren sin sesión, y la 0047 explica
 * cuáles— que aparecerán siempre. El valor no está en que la lista quede vacía,
 * está en que **la lista de hoy se parezca a la de la semana pasada**.
 *
 * `nivel`:
 *   critico  algo que casi con seguridad no se decidió: datos sin filtrar, o
 *            escritura alcanzable sin sesión.
 *   aviso    algo que puede ser correcto pero que hay que poder justificar.
 *   info     contexto para leer lo anterior.
 */
CREATE OR REPLACE FUNCTION public.radiografia_seguridad()
RETURNS TABLE (area text, nivel text, objeto text, detalle text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  /*
    ── 1. Tablas sin RLS ─────────────────────────────────────────────────────
    El hallazgo de la 0046, hecho comprobación. Una tabla de `public` sin RLS es
    legible y escribible por cualquiera que tenga permiso de tabla, y
    `authenticated` lo tiene sobre casi todo: es decir, por cualquiera con una
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
    El caso contrario, y no es un fallo de seguridad sino de funcionamiento: con
    RLS activo y sin políticas, la tabla está cerrada del todo para cualquiera
    que no sea `service_role`. A veces es exactamente lo que se quiere
    —`product_events` y `app_errors` se escriben y no se leen— y por eso es un
    aviso y no un crítico. Pero una tabla que la aplicación necesita leer y que
    aparezca aquí explica un «no me carga nada» que si no se busca en el sitio
    equivocado.
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
    Una política cuyo rol es `anon` —o `public`, que incluye a `anon`— es una
    puerta abierta a internet. Puede ser correcta: los planes públicos de la 0049
    y la revisión compartida por enlace lo son. Se distingue por el comando: que
    se pueda LEER algo pensado para ser público es una decisión; que se pueda
    ESCRIBIR sin identificarse casi nunca lo es.
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
    ── 4. Permisos de TABLA concedidos a `anon` ──────────────────────────────
    Distinto de lo anterior y peor de encontrar, porque no se ve en ninguna
    migración: son los `GRANT` sueltos. Sin RLS, un GRANT a `anon` es acceso
    directo; con RLS, es la mitad de la puerta ya abierta.
  */
  RETURN QUERY
  SELECT
    'anon'::text,
    CASE WHEN a.privilege_type = 'SELECT' THEN 'aviso' ELSE 'critico' END::text,
    c.relname::text,
    ('El rol anon (sin sesión) tiene ' || a.privilege_type || ' sobre la tabla.')::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
  JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND r.rolname = 'anon'
  ORDER BY c.relname, a.privilege_type;

  /*
    ── 5. Funciones ejecutables sin sesión ───────────────────────────────────
    La trampa que documenta la 0047: Supabase declara `ALTER DEFAULT PRIVILEGES
    … GRANT ALL ON FUNCTIONS TO anon`, así que **toda función nueva nace
    ejecutable por `anon`**, y el `REVOKE … FROM public` que casi todas las
    migraciones escriben no lo quita.

    Consecuencia práctica: esta comprobación se dispara sola cada vez que alguien
    añade una función y se olvida de revocar. Que sea ruidosa es su virtud.

    Las `SECURITY DEFINER` van como críticas porque corren con los permisos de
    quien las creó: si además no comprueban `auth.uid()`, saltan RLS entero.

    ── Por qué se comprueba antes que el rol exista ──────────────────────────
    `has_function_privilege('anon', …)` levanta excepción si el rol no existe, y
    eso tumbaría la función ENTERA: el informe se quedaría sin ninguna de las
    ocho comprobaciones por culpa de una.

    No es un caso hipotético. `anon` lo crea Supabase, no PostgreSQL, así que en
    una base reconstruida a mano —exactamente el escenario del que salió el
    hallazgo de la 0046— puede no estar. Y esa es la instalación donde más falta
    hace que el resto de comprobaciones funcionen.
  */
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    RETURN QUERY
    SELECT
      'anon'::text,
      CASE WHEN p.prosecdef THEN 'critico' ELSE 'aviso' END::text,
      (p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')')::text,
      (CASE WHEN p.prosecdef
            THEN 'SECURITY DEFINER y ejecutable sin sesión: corre con permisos del definidor.'
            ELSE 'Ejecutable sin sesión.' END)::text
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    ORDER BY p.prosecdef DESC, p.proname;
  ELSE
    RETURN QUERY
    SELECT
      'anon'::text,
      'info'::text,
      'anon'::text,
      'El rol «anon» no existe en esta base: la comprobación de qué se puede ejecutar sin sesión no se ha hecho.'::text;
  END IF;

  /*
    ── 6. SECURITY DEFINER sin `search_path` fijo ────────────────────────────
    Una función que corre con permisos del definidor y resuelve los nombres con
    el `search_path` de QUIEN LA LLAMA se puede engañar: basta con crear un
    esquema propio con una tabla del mismo nombre y ponerlo delante. Es el fallo
    clásico de escalada de privilegios en PostgreSQL, y no deja ninguna huella.
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
  ORDER BY p.proname;

  /*
    ── 7. Buckets públicos ───────────────────────────────────────────────────
    `client-media` guarda fotografías de los cuerpos de personas concretas. Un
    bucket público significa que cualquiera con la URL las ve, sin sesión y sin
    política que valga — y las URL de Storage son adivinables si se conoce la
    estructura, que está escrita en este mismo repositorio.

    Es la única comprobación de la lista cuyo hallazgo sería una brecha de datos
    de salud, así que va sola y en crítico.
  */
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    RETURN QUERY
    SELECT
      'almacenamiento'::text,
      'critico'::text,
      b.id::text,
      'Bucket PÚBLICO: sus archivos se leen sin sesión con solo conocer la URL.'::text
    FROM storage.buckets b
    WHERE b.public;
  END IF;

  /*
    ── 8. Contexto ───────────────────────────────────────────────────────────
    Sin esto, un informe con cero hallazgos no se distingue de un informe que no
    llegó a mirar nada. El recuento de lo revisado es lo que convierte el vacío
    en una afirmación.
  */
  RETURN QUERY
  SELECT
    'contexto'::text,
    'info'::text,
    'tablas'::text,
    (count(*) FILTER (WHERE c.relrowsecurity) || ' de ' || count(*) ||
     ' tablas de public con RLS activo.')::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';

  RETURN QUERY
  SELECT
    'contexto'::text,
    'info'::text,
    'politicas'::text,
    (count(*) || ' políticas RLS declaradas sobre public.')::text
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public';
END;
$$;

/**
 * Cuánto ocupa cada cosa, y cuánto de eso es una sola columna.
 *
 * ── Para qué sirve de verdad ────────────────────────────────────────────────
 * `auditoria.md` §1.4 deja abierta la decisión más cara del proyecto: el
 * programa entero de un cliente vive en `workout_data.microcycles`, un JSONB que
 * se reescribe ENTERO en cada guardado. La recomendación es normalizarlo «cuando
 * empiece a doler», y hasta ahora no había forma de saber cuándo es eso.
 *
 * `bytes / filas` de `workout_data` es esa señal. Cuando el tamaño medio de fila
 * se acerca al megabyte, cada pulsación de tecla con debounce mueve un megabyte,
 * y la conversación deja de ser teórica.
 *
 * `reltuples` es la estimación del planificador y solo se refresca con ANALYZE o
 * autovacuum. Para decidir si algo crece es de sobra, y no cuesta el recorrido
 * completo que costaría un `count(*)` sobre la tabla de programas.
 */
CREATE OR REPLACE FUNCTION public.radiografia_volumen()
RETURNS TABLE (tabla text, filas bigint, bytes bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.relname::text,
    GREATEST(c.reltuples, 0)::bigint,
    pg_catalog.pg_total_relation_size(c.oid)::bigint
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY pg_catalog.pg_total_relation_size(c.oid) DESC;
$$;

/*
  ══ El reparto de llaves ═══════════════════════════════════════════════════

  `REVOKE … FROM PUBLIC` no basta, y la 0047 explica por qué: el
  `ALTER DEFAULT PRIVILEGES` de Supabase concede EXECUTE a `anon`, a
  `authenticated` y a `service_role` de forma EXPLÍCITA en cuanto se crea la
  función, y quitárselo a PUBLIC no toca lo explícito.

  Así que se nombran los dos roles uno por uno. Si esto se hiciera mal, las
  propias funciones lo dirían en su comprobación número 5 del próximo informe —
  que es una forma razonable de comprobar que funcionan.
*/
REVOKE ALL ON FUNCTION public.radiografia_seguridad() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.radiografia_volumen()   FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.radiografia_seguridad() TO service_role;
GRANT EXECUTE ON FUNCTION public.radiografia_volumen()   TO service_role;

COMMENT ON FUNCTION public.radiografia_seguridad() IS
  'Estado de seguridad leído del catálogo. Solo service_role: ver la 0053.';
COMMENT ON FUNCTION public.radiografia_volumen() IS
  'Tamaño y filas estimadas por tabla. Solo service_role: ver la 0053.';

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que NO se puede llamar con la anon key ni con una sesión normal (las dos
-- tienen que dar «permission denied for function»):
--
--   SELECT * FROM public.radiografia_seguridad();
--
-- Desde fuera, con la service_role key, que es como lo llama el script:
--
--   npm run radiografia
--
-- O directamente:
--
--   SELECT nivel, area, objeto, detalle
--   FROM public.radiografia_seguridad()
--   WHERE nivel = 'critico';
--
-- El tamaño medio de fila de los programas, que es la señal de §1.4:
--
--   SELECT tabla, filas, pg_size_pretty(bytes) AS total,
--          pg_size_pretty((bytes / GREATEST(filas, 1))::bigint) AS por_fila
--   FROM public.radiografia_volumen() WHERE tabla = 'workout_data';
-- ============================================================================
