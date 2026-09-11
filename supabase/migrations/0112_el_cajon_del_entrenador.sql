-- ============================================================================
-- El cajón del entrenador: lo que guarda con nombre, en su propia tabla
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para guardar bloques, y para que sigan viéndose los días y los
--     platos que ya hay. Aditiva: crea una tabla, COPIA lo que estaba en las
--     preferencias y **no borra nada**.
--
-- ⚠️  ORDEN DE DESPLIEGUE: esta migración va ANTES que el código.
--
-- ══ Qué había ══════════════════════════════════════════════════════════════
--
-- El material guardado del entrenador estaba repartido en tres sitios con tres
-- leyes distintas:
--
--     exercises, foods                        → tabla, del EQUIPO (0006)
--     preferences.formularios / protocolos    → JSONB, del entrenador
--     preferences.piezas / platos             → JSONB, del entrenador
--     bloques                                 → no existían
--
-- Y el que faltaba era el caro. Un día suelto se rehace en cinco minutos; un
-- bloque son cuatro a ocho hojas con sus ejercicios y sus series: el trabajo de
-- una tarde, y lo único que un entrenador reconoce como suyo de verdad.
--
-- ══ Por qué una tabla y no una cuarta clave de `preferences` ═══════════════
--
-- Por tamaño y por equipo, y la segunda es la que decide.
--
--   · `profiles.preferences` se lee ENTERA al arrancar y se REESCRIBE ENTERA en
--     cada guardado de sección (`useCoachPrefs.js`). Un bloque realista son
--     7,6 KB medidos; veinte, 152 KB. Con la biblioteca ahí dentro, tocar un
--     interruptor del panel reescribe la biblioteca de programas.
--
--   · Ejercicios y alimentos son del equipo desde la 0006. Que la lista de
--     ejercicios se comparta y el programa montado con ellos no, sería la
--     excepción rara.
--
-- El contraargumento de la 0099 —los formularios se quedaron en `preferences`
-- porque `newClientPreferences`, `resolveProtocolo` y `planDe` son funciones
-- PURAS que el alta llama para sembrar el protocolo, y una carga asíncrona las
-- rompería— aquí no aplica: `piecesOf` y `platosOf` no se llaman desde ninguna
-- función pura ni desde el alta, solo desde pantallas.
--
-- ══ El reflejo: por qué NO se borra `preferences.piezas` ni `.platos` ══════
--
-- Porque una versión anterior de la aplicación —una pestaña abierta desde ayer,
-- un teléfono que no ha recargado— sigue leyendo de ahí. Dejándolas, ve lo que
-- ya tenía: congelado, pero no vacío ni falso, que es el mismo trato de la 0111.
-- Retirarlas es una segunda migración, cuando ya no queden lectores.
--
-- El precio, dicho: entre esta migración y la recarga de todo el mundo, lo que
-- se guarde desde una versión vieja se queda en las preferencias y el cajón
-- nuevo no lo verá. Es una ventana de horas sobre un gesto que se hace una vez
-- por semana.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.teams') IS NULL THEN
    RAISE EXCEPTION 'Falta 0006_teams.sql: no existe `teams`.';
  END IF;
  IF to_regprocedure('public.my_team_ids()') IS NULL THEN
    RAISE EXCEPTION 'Falta 0006_teams.sql: no existe `my_team_ids()`.';
  END IF;
  IF to_regprocedure('public.team_write_allowed(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0027_readonly_when_expired.sql: no existe `team_write_allowed()`.';
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS public.coach_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /*
    Del EQUIPO, como `exercises` y `foods`.

    ── Y ANULABLE, a diferencia de aquellas ─────────────────────────────────
    Las de la 0006 son anulables de hecho pero no de derecho: sus políticas solo
    preguntan por `team_id`, así que una fila sin equipo nace HUÉRFANA —ni se lee
    ni se escribe por ninguna vía— y eso costó un fallo de verdad (está contado
    en `useLibraries.js`). Aquí la política contempla los dos casos, de modo que
    un entrenador sin equipo guarda y ve lo suyo igual.
  */
  team_id    uuid REFERENCES public.teams (id) ON DELETE CASCADE,

  -- Quién la guardó. Se queda aunque la fila sea del equipo: es lo que permite
  -- decir de quién es una plantilla cuando el cajón es de cuatro.
  coach_id   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,

  /*
    QUÉ FORMA ES: el vocabulario del portapapeles (`lib/portapapeles`, `TIPO`),
    no un segundo juego de nombres.

    Sin CHECK a propósito. La lista de formas con cajón es una decisión de
    producto que ya se hace cumplir en `domain/cajon.js` (`CAJONES`), y clavarla
    aquí obligaría a una migración para añadir la cuarta —que es exactamente el
    coste que este trabajo vino a quitar—. Una fila con una forma que el código
    no conoce no se enseña; no rompe nada.
  */
  kind       text NOT NULL,

  name       text NOT NULL,

  /*
    LA CARGA, que es la misma que viaja en el portapapeles y ya limpia:

      bloque  { sessions, mobilityDrills, intent, plannedWeeks, note }
      hoja    { exercises }
      comida  { foods }

    Nada registrado entra aquí: ni `log`, ni `overrides`, ni kilos, ni fechas.
    Lo que se guarda es el criterio, no el caso. La poda la hacen
    `cloneExerciseAsTemplate` y `comoMaterial`, que son las mismas que ya usaban
    las piezas y los platos.
  */
  carga      jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_templates_team_idx  ON public.coach_templates (team_id, kind);
CREATE INDEX IF NOT EXISTS coach_templates_coach_idx ON public.coach_templates (coach_id, kind);

ALTER TABLE public.coach_templates ENABLE ROW LEVEL SECURITY;

/*
  Leer siempre; escribir solo con el plan al día.

  Partida en dos por la misma razón que la 0027 partió la de `exercises`: con
  una sola política `FOR ALL`, caducar dejaría el cajón invisible y parecería
  que se ha borrado.
*/
DROP POLICY IF EXISTS "coach_templates_read" ON public.coach_templates;
CREATE POLICY "coach_templates_read" ON public.coach_templates
  FOR SELECT TO authenticated
  USING (
    team_id IN (SELECT public.my_team_ids())
    OR (team_id IS NULL AND coach_id = auth.uid())
  );

DROP POLICY IF EXISTS "coach_templates_write" ON public.coach_templates;
CREATE POLICY "coach_templates_write" ON public.coach_templates
  FOR ALL TO authenticated
  USING (
    (team_id IN (SELECT public.my_team_ids()) AND public.team_write_allowed(team_id))
    OR (team_id IS NULL AND coach_id = auth.uid())
  )
  WITH CHECK (
    (team_id IN (SELECT public.my_team_ids()) AND public.team_write_allowed(team_id))
    OR (team_id IS NULL AND coach_id = auth.uid())
  );

/*
  ══ Y EL GRANT, que es la otra mitad ═══════════════════════════════════════
  Una política decide QUÉ FILAS; el GRANT, si se puede mirar la tabla. Sin el
  segundo, la primera no llega a evaluarse y PostgREST devuelve 403 (42501). Este
  proyecto se comió ese fallo cuatro veces (0088, 0089, 0090 y las de `client_*`)
  y el síntoma nunca es un error visible: es un dato falso —«no has guardado
  nada»— porque quien llama se traga el 403 y pinta el vacío.
*/
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_templates TO authenticated;

COMMIT;


-- ============================================================================
-- La copia: lo que ya estaba guardado entra en el cajón
-- ----------------------------------------------------------------------------
-- Idempotente por (coach_id, kind, name): aplicarla dos veces no duplica nada.
-- No hay UNIQUE en la tabla a propósito —dos plantillas del mismo nombre son
-- legítimas si las guardan dos personas del equipo, y el desempate de nombres
-- lo hace el producto (`freeSheetName`, `freePlatoName`)—, así que el cinturón
-- va en el WHERE y no en un constraint.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'preferences'
  ) THEN
    RAISE NOTICE 'Sin la 0035 no hay `preferences`: no hay nada que copiar.';
    RETURN;
  END IF;

  INSERT INTO public.coach_templates (team_id, coach_id, kind, name, carga, created_at)
  SELECT
    /* El equipo que el entrenador POSEE, y si no tiene, aquel del que es
       miembro. Sin ninguno, `NULL` — y la política de arriba lo contempla. */
    COALESCE(
      (SELECT t.id FROM public.teams t WHERE t.owner_id = p.id ORDER BY t.created_at LIMIT 1),
      (SELECT tm.team_id FROM public.team_members tm WHERE tm.profile_id = p.id ORDER BY tm.created_at LIMIT 1)
    ),
    p.id,
    f.kind,
    trim(item->>'name'),
    jsonb_build_object(f.clave, item->f.clave),
    /* La fecha en que se guardó, si la fila la trae y es legible. Poner `now()`
       a todo diría que el entrenador guardó hoy sus treinta plantillas. */
    CASE
      WHEN item->>'savedAt' ~ '^\d{4}-\d{2}-\d{2}' THEN (item->>'savedAt')::timestamptz
      ELSE now()
    END
  FROM public.profiles p
  CROSS JOIN (VALUES ('hoja', 'exercises', 'piezas'), ('comida', 'foods', 'platos'))
    AS f(kind, clave, seccion)
  CROSS JOIN LATERAL jsonb_array_elements(
    /* El CASE va DENTRO y no en el WHERE: la lateral se evalúa antes de filtrar,
       y `jsonb_array_elements` sobre algo que no es un array aborta la
       migración entera. */
    CASE
      WHEN jsonb_typeof(p.preferences->f.seccion->'items') = 'array'
        THEN p.preferences->f.seccion->'items'
      ELSE '[]'::jsonb
    END
  ) AS item
  WHERE trim(COALESCE(item->>'name', '')) <> ''
    AND jsonb_typeof(item->f.clave) = 'array'
    AND jsonb_array_length(item->f.clave) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.coach_templates ct
      WHERE ct.coach_id = p.id AND ct.kind = f.kind AND ct.name = trim(item->>'name')
    );
END $$;

COMMENT ON TABLE public.coach_templates IS
  'El cajón del entrenador: bloques, días y platos guardados con nombre. Ver domain/cajon.js y docs/replanteamiento-lo-guardado.md.';


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT p.full_name, ct.kind, count(*)
--   FROM public.coach_templates ct
--   JOIN public.profiles p ON p.id = ct.coach_id
--   GROUP BY 1, 2 ORDER BY 1, 2;
--
-- Nada más aplicarla salen los días y los platos que cada uno tuviera en sus
-- preferencias, y ningún bloque: los bloques no existían y se guardan a partir
-- de ahora, uno a uno, desde la lista de bloques del cliente.
--
-- Y para ver que las preferencias siguen intactas (que es el reflejo):
--
--   SELECT id,
--          jsonb_array_length(COALESCE(preferences->'piezas'->'items', '[]')) AS piezas,
--          jsonb_array_length(COALESCE(preferences->'platos'->'items', '[]')) AS platos
--   FROM public.profiles WHERE role = 'coach';
-- ============================================================================
