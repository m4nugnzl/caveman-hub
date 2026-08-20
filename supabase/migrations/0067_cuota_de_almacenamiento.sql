-- ============================================================================
-- La cuota de almacenamiento, que era la última y la más cara
-- ----------------------------------------------------------------------------
-- El único capado de `docs/monetizacion.md` §7.4 que protege margen de verdad:
-- los gigabytes son coste real y crecen solos, sin que nadie pulse nada.
--
--      Gratis    1 GB      Solo   15 GB      Pro   50 GB      Equipo   250 GB
--      Las tarifas retiradas y `fundador`: sin tope (contrataron sin él)
--
-- ══ 0. De dónde salen los números ═══════════════════════════════════════════
--
-- No son redondos por gusto: salen de medir lo que el propio producto produce.
-- Una foto reducida son ~0,3 MB (`shrinkImage`, 1600 px, webp 0.82) y el
-- grabador escribe a ~7,5 MB por minuto (`useReviewRecorder`: 900+96 kbps).
--
-- La regla de dimensionado, en una frase: **el comportamiento previsto de cada
-- plan tiene que caber MÁS DE UN AÑO sin borrar nada** —las fotos semanales de
-- toda la cartera y las correcciones cortas en vídeo que el grabador existe
-- para hacer—. Lo único que el tope debe morder es alojar dentro la revisión
-- larga semanal, que es exactamente lo que la 0040 mandó a YouTube/Loom.
--
--      Gratis  3 clientes · fotos + un vídeo corto/mes  ≈  81 MB/mes → 12 meses
--      Solo   10 clientes · fotos + vídeo corto semanal ≈ 0,95 GB/mes → 16 meses
--      Pro    30 clientes · fotos + vídeo corto semanal ≈ 2,9 GB/mes → 17 meses
--      Equipo ~90 clientes · lo mismo                   ≈ 8,6 GB/mes → 29 meses
--
-- El coste no es el motivo del tope, y conviene dejarlo escrito: con el
-- gigabyte a ~0,021 $/mes (Supabase, agosto 2026, tras los 100 GB incluidos en
-- el plan Pro de 25 $), el tope LLENO del plan más caro cuesta ~5 $/mes contra
-- 149 €. La cuota está para dos cosas: que una cuenta gratuita no se convierta
-- en un disco duro ajeno, y contener el **egress** (250 GB/mes incluidos,
-- 0,09 $/GB después), que sí crece con cada reproducción de vídeo alojado
-- dentro — los enlaces externos generan cero.
--
-- ══ 1. Qué cuenta: lo que cuelga de un cliente ══════════════════════════════
--
-- Todo vive en el bucket `client-media` (0007) y casi todo con el id del cliente
-- como primer segmento: `<clientId>/photos/…`, `<clientId>/reviews/…`,
-- `<clientId>/intake/…`. La cuota suma exactamente eso —lo que el equipo acumula
-- a través de sus clientes— y por la misma junta quedan fuera, a propósito:
--
--   · `support/<ticket>/…`: un adjunto de soporte es un derecho, no una función
--     del plan. Capar la forma de pedir ayuda a quien no paga sería capar la
--     ayuda.
--   · Los huérfanos de clientes borrados, que el borrado ya limpia.
--
-- ══ 2. El tope se comprueba ANTES de contar el archivo que entra ════════════
--
-- En un `BEFORE INSERT` sobre `storage.objects` el tamaño aún no es fiable: el
-- almacén escribe la fila y completa `metadata` cuando la subida termina. Así
-- que la regla es «si ya estás lleno, no entra nada más», y el desborde posible
-- es UN archivo (como mucho 120 MB, el tope por archivo del bucket). Es el mismo
-- trato que el límite de clientes le da a quien ya se pasó: se corta el
-- crecimiento, no se echa lo que ya está dentro.
--
-- ══ 3. El cliente también choca con el tope, y el mensaje lo sabe ═══════════
--
-- Aquí hay una tensión con la regla de la §7.4 —«nada del lado del cliente»— y
-- hay que decidirla de frente, no dejar que la decida el código: las fotos las
-- sube EL CLIENTE, así que una cuota que solo frene al entrenador no es una
-- cuota. Se aplica a todos, y lo que protege la regla se protege en el mensaje:
--
--   · Al entrenador se le dice el plan, los GB y qué hacer: es exactamente quien
--     puede pagar por quitar el tope (0065).
--   · Al cliente NO se le nombra el plan ni la tarifa: «no queda espacio,
--     díselo a tu entrenador». Un disco lleno es un disco lleno; en qué plan
--     está su entrenador sigue sin ser asunto de la aplicación.
--
-- Y el entrenador tiene el dato ANTES del choque: `my_team_plan()` devuelve el
-- uso y Ajustes → Plan lo enseña.
--
-- ══ 4. Disparador, con la letra pequeña de Storage ══════════════════════════
--
-- Mismo criterio que 0064 y 0065 —el mensaje explica el capado—, con una
-- diferencia de terreno: `storage.objects` no es nuestra tabla, es de
-- `supabase_storage_admin`. Crear el disparador puede contestar «must be owner»
-- según el rol con el que corra la migración; el bloque de abajo lo intenta y,
-- si hace falta, repite vistiéndose de ese rol, que es el arreglo que ya
-- documentó la 0007 para sus políticas.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.plan_limits') IS NULL THEN
    RAISE EXCEPTION 'Falta 0019_billing.sql.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'client-media') THEN
    RAISE EXCEPTION 'Falta 0007_storage_policies.sql: el bucket no existe.';
  END IF;
  -- La 0061, o el `UPDATE` del plan `pro` de abajo no casaría con nada y Pro
  -- nacería después SIN tope: el plan de 79 € regalando lo que capa el de 149.
  IF NOT EXISTS (SELECT 1 FROM public.plan_limits WHERE plan = 'solo_2026') THEN
    RAISE EXCEPTION 'Falta 0061_escalera_de_planes.sql. Aplícala antes.';
  END IF;
  -- Y la 0066, porque `my_team_plan()` se reescribe aquí leyendo `has_audit_log`.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plan_limits'
      AND column_name = 'has_audit_log'
  ) THEN
    RAISE EXCEPTION 'Falta 0066_registro_de_cambios_por_plan.sql. Aplícala antes.';
  END IF;
END;
$$;

BEGIN;

ALTER TABLE public.plan_limits
  -- En gigabytes enteros porque así se anuncia y así se compara. NULL = sin
  -- tope, igual que en `max_clients` y `max_seats`: la ausencia de límite tiene
  -- que escribirse igual en las tres columnas o alguna acabará leyéndose mal.
  ADD COLUMN IF NOT EXISTS max_storage_gb integer
    CHECK (max_storage_gb IS NULL OR max_storage_gb > 0);

COMMENT ON COLUMN public.plan_limits.max_storage_gb IS
  'Tope de fotos y vídeo del equipo, en GB. NULL = sin tope. Lo aplica '
  '`enforce_storage_limit` sobre el bucket `client-media`.';

UPDATE public.plan_limits SET max_storage_gb = 1   WHERE plan = 'prueba';
UPDATE public.plan_limits SET max_storage_gb = 15  WHERE plan = 'solo';
UPDATE public.plan_limits SET max_storage_gb = 50  WHERE plan = 'pro';
UPDATE public.plan_limits SET max_storage_gb = 250 WHERE plan = 'equipo';
-- `solo_2026`, `equipo_2026` y `fundador` se quedan en NULL: punto 3 de la 0065.

-- La portada, como siempre desde la 0062: columna nueva, GRANT nuevo o llega
-- vacía sin dar error.
GRANT SELECT (max_storage_gb) ON public.plan_limits TO anon;

/**
 * Cuántos bytes ocupa un equipo en `client-media`.
 *
 * La junta con `clients` es la definición de la cuota (punto 1): solo cuenta lo
 * que cuelga de un cliente del equipo. `metadata->>'size'` puede faltar en una
 * fila recién insertada cuya subida aún no terminó; se cuenta como cero y la
 * siguiente pasada ya lo ve entero.
 *
 * Sin GRANT a nadie: la llaman `enforce_storage_limit` y `my_team_plan()`, las
 * dos como definidor. Nadie más tiene por qué poder medir el disco de otro.
 */
CREATE OR REPLACE FUNCTION public.team_storage_bytes(p_team uuid)
RETURNS bigint
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(sum((o.metadata->>'size')::bigint), 0)
    FROM storage.objects o
    JOIN public.clients c ON c.id::text = (storage.foldername(o.name))[1]
   WHERE o.bucket_id = 'client-media'
     AND c.team_id = p_team;
$$;

REVOKE ALL ON FUNCTION public.team_storage_bytes(uuid) FROM public;

CREATE OR REPLACE FUNCTION public.enforce_storage_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client public.clients%ROWTYPE;
  v_max_gb integer;
  v_label  text;
BEGIN
  IF NEW.bucket_id <> 'client-media' THEN
    RETURN NEW;
  END IF;

  /*
    Rutas que no empiezan por un cliente (`support/…`) no son de la cuota:
    siguen su camino y deciden las políticas de siempre.
  */
  SELECT c.* INTO v_client
    FROM public.clients c
   WHERE c.id::text = (storage.foldername(NEW.name))[1];
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT l.max_storage_gb, l.label INTO v_max_gb, v_label
    FROM public.plan_limits l
   WHERE l.plan = COALESCE(
           (SELECT s.plan FROM public.team_subscriptions s
             WHERE s.team_id = v_client.team_id),
           'prueba'
         );

  IF v_max_gb IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.team_storage_bytes(v_client.team_id)
       < v_max_gb::bigint * 1024 * 1024 * 1024 THEN
    RETURN NEW;
  END IF;

  /*
    El punto 3: al cliente, sin plan ni tarifa; al entrenador, con todo. Se
    distingue por quién sube, no por la carpeta: el entrenador también escribe
    en `photos/` y el cliente también en `intake/`.
  */
  IF v_client.client_profile_id IS NOT NULL AND v_client.client_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'No queda espacio para archivos en esta cuenta. Díselo a tu entrenador: puede liberar espacio o ampliarlo.'
      USING ERRCODE = 'check_violation';
  END IF;

  RAISE EXCEPTION 'El plan % ha llenado sus % GB de fotos y vídeo. Borra archivos que ya no necesites o cambia de plan.',
    COALESCE(v_label, 'actual'), v_max_gb
    USING ERRCODE = 'check_violation';
END;
$$;

/*
  El punto 4. Si el rol de la migración no es dueño de `storage.objects`, se
  repite como `supabase_storage_admin` y se vuelve. Si tampoco así —un entorno
  donde ese rol no se puede vestir—, el error dice qué hacer a mano.
*/
DO $$
BEGIN
  BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS objects_storage_limit ON storage.objects';
    EXECUTE 'CREATE TRIGGER objects_storage_limit
               BEFORE INSERT ON storage.objects
               FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_limit()';
  EXCEPTION WHEN insufficient_privilege THEN
    BEGIN
      EXECUTE 'SET LOCAL ROLE supabase_storage_admin';
      EXECUTE 'DROP TRIGGER IF EXISTS objects_storage_limit ON storage.objects';
      EXECUTE 'CREATE TRIGGER objects_storage_limit
                 BEFORE INSERT ON storage.objects
                 FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_limit()';
      EXECUTE 'RESET ROLE';
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'No se pudo crear el disparador sobre storage.objects (%). '
        'Ejecuta a mano, desde el editor SQL: SET ROLE supabase_storage_admin; '
        'y repite el CREATE TRIGGER de la 0067.', SQLERRM;
    END;
  END;
END;
$$;

/*
  ── `my_team_plan()` aprende tres cosas ─────────────────────────────────────
  El uso y el tope de almacenamiento —para que Ajustes → Plan enseñe la cifra
  ANTES del choque, punto 3— y si el plan incluye el registro de cambios (0066)
  —porque un SELECT capado por RLS filtra sin error, y la ficha del cliente
  necesita saber si la lista vacía es «no hay cambios» o «no lo incluye tu
  plan»—.

  DROP y no OR REPLACE, como en la 0026 y por lo mismo: cambia la forma de lo
  que devuelve. La suma del disco corre una vez por arranque de sesión de
  entrenador; con miles de archivos es una pasada por índice de bucket, y el
  día que duela, el arreglo es materializarla, no dejar de enseñarla.
*/
DROP FUNCTION IF EXISTS public.my_team_plan();

CREATE FUNCTION public.my_team_plan()
RETURNS TABLE (
  team_id            uuid,
  plan               text,
  label              text,
  status             text,
  activo             boolean,
  clientes           integer,
  max_clientes       integer,
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  con_facturacion    boolean,
  -- Si el plan incluye LEER el registro de cambios (0066).
  con_registro       boolean,
  -- El tope (NULL = sin tope) y lo que ya ocupa el equipo en `client-media`.
  max_almacen_gb     integer,
  almacen_bytes      bigint
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT
    s.team_id,
    s.plan,
    l.label,
    s.status,
    (
      s.status IN ('active', 'trialing')
      -- Una prueba con fecha pasada deja de valer aunque Stripe todavía no haya
      -- dicho nada: el reloj corre aquí, no allí.
      AND (s.status <> 'trialing' OR s.trial_ends_at IS NULL OR s.trial_ends_at > now())
    ),
    (SELECT count(*)::integer FROM public.clients c
      WHERE c.team_id = s.team_id AND c.status IS DISTINCT FROM 'archived'),
    l.max_clients,
    s.trial_ends_at,
    s.current_period_end,
    s.stripe_customer_id IS NOT NULL,
    l.has_audit_log,
    l.max_storage_gb,
    public.team_storage_bytes(s.team_id)
  FROM public.team_subscriptions s
  JOIN public.plan_limits l ON l.plan = s.plan
  WHERE s.team_id IN (SELECT public.my_team_ids())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_team_plan() FROM public;
GRANT EXECUTE ON FUNCTION public.my_team_plan() TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- La escalera con sus tres topes:
--
--   SELECT sort, plan, label, max_clients, max_seats, max_storage_gb,
--          has_integrations, has_audit_log
--     FROM public.plan_limits ORDER BY sort;
--
-- Quién se pasa YA de su tope (a nadie se le borra nada; no podrán subir más):
--
--   SELECT p.email, l.label, l.max_storage_gb,
--          round(public.team_storage_bytes(t.id) / 1073741824.0, 2) AS gb_usados
--     FROM public.teams t
--     JOIN public.profiles p ON p.id = t.owner_id
--     LEFT JOIN public.team_subscriptions s ON s.team_id = t.id
--     JOIN public.plan_limits l ON l.plan = COALESCE(s.plan, 'prueba')
--    WHERE l.max_storage_gb IS NOT NULL
--      AND public.team_storage_bytes(t.id) > l.max_storage_gb::bigint * 1073741824;
--
-- Y desde la aplicación, las dos caras del punto 3: con una cuenta gratuita
-- llena, una foto desde «Fotos & Evolución» tiene que contestar con el plan y
-- los GB; la misma foto desde el portal del cliente, con el mensaje que no
-- nombra el plan. Y Ajustes → Plan tiene que enseñar el uso en los dos casos.
-- ============================================================================
