-- ============================================================================
-- La ficha del ejercicio llega al cliente, y el alimento gana tu nota
-- (tanda 1 de `docs/replanteamiento-alimentos-y-ejercicios.md`)
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva: una columna nueva en `foods` y una función de lectura. No toca
--     ninguna política, ninguna tabla existente y ningún dato.
--
-- ══ 1 · Por qué hace falta una función y no una política ════════════════════
--
-- La 0098 le dio a la biblioteca del equipo tu vídeo y tu clave. Y no las lee
-- nadie: las políticas de `exercises` son de EQUIPO (`exercises_team_read`,
-- 0027), así que **una sesión de cliente no puede leer esa tabla**. El vídeo
-- estaba escrito y no había forma de que llegara al móvil de nadie.
--
-- Se estudiaron los tres caminos y se descartaron dos:
--
--   (a) COPIAR el vídeo y la clave dentro del plan al programar. Cero
--       migración, y mal: son mil copias del mismo hecho —el error que
--       evitaron la 0033 y la 0094— y corregir un enlace roto no lo corrige
--       en los clientes que ya lo tienen puesto. Un enlace muerto que no se
--       puede arreglar desde ningún sitio.
--
--   (b) ENSANCHAR la política para que un cliente lea la biblioteca de su
--       equipo. Una línea, y le entrega a cada cliente la biblioteca entera:
--       trescientos nombres y todas las claves técnicas de su entrenador,
--       incluidas las de ejercicios que no entrena.
--
--   (c) ESTA. Una función que devuelve, del cliente que llama, solo la ficha de
--       los ejercicios **que aparecen en su propio plan**. Una sola fuente de
--       verdad y la exposición mínima. Son unas decenas de filas.
--
-- Es la misma forma de resolver que ya usó `training_summaries` (0024): cuando
-- lo que hace falta es un RECORTE del dato y no el dato, se pide al servidor.
--
-- ── Qué NO devuelve, y por qué ─────────────────────────────────────────────
-- · `alternatives` de la biblioteca. Las que el cliente lee son las del PLAN
--   (`exercise.alternatives`), que ya viajan dentro de su rutina y ya se
--   imprimen en el renglón. Mandar también las de la biblioteca sería el mismo
--   hecho por dos caminos.
-- · `equipment` y `description`. Son del CATÁLOGO (0094), y `catalog_exercises`
--   ya se lee con cualquier sesión (0033). El portal las busca por nombre igual
--   que hace el resto del producto.
-- · Las filas sin vídeo Y sin clave. No hay nada que enseñar de ellas, y
--   filtrarlas aquí es lo que mantiene la respuesta pequeña.
--
-- ══ 2 · Tu nota en el alimento ══════════════════════════════════════════════
--
-- «El de lata al natural, no en aceite.» Es la CLAVE DEL EJERCICIO aplicada a
-- la comida: no es un hecho del alimento —el catálogo no puede tenerla— sino un
-- hecho tuyo, y hasta hoy no tenía dónde vivir.
--
-- Y por eso se escribe igual que el vídeo (ver `saveFoodSheet`): **un alimento
-- del catálogo también puede llevar tu nota**. Lo que la 0033 protege son los
-- macros de referencia, que siguen intocables; esto es tu voz, y la voz no es
-- del catálogo. Misma excepción y mismo motivo que la 0098.
-- ============================================================================

BEGIN;

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS note text;

COMMIT;


BEGIN;

/*
  La ficha de los ejercicios del plan de un cliente.

  @param target  El cliente. NULL —lo normal desde el portal— significa «el
    cliente que soy». Se pasa explícito cuando mira un ENTRENADOR, que es lo que
    hace «Ver como»: sin eso, el entrenador que se asoma al portal de su cliente
    vería la rutina sin ninguna ficha y creería que no ha guardado nada.

  `SECURITY DEFINER` porque el objetivo es justamente saltarse la política de
  equipo de `exercises`; el permiso se comprueba a mano abajo, que es la regla de
  la casa para estas funciones (ver `set_equipment_group`, 0080).

  `STABLE` y no `VOLATILE`: solo lee. Permite que el planificador la llame una
  vez por consulta.
*/
CREATE OR REPLACE FUNCTION public.exercise_sheets(target uuid DEFAULT NULL)
RETURNS TABLE (exercise text, video_url text, cue text)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
  /*
    Los nombres de salida (`video_url`, `cue`) coinciden con columnas de
    `exercises`. Todas las referencias de abajo van cualificadas con `e.`, así
    que no hay ambigüedad real; esto lo deja dicho de todas formas para que
    añadir una columna más tarde no convierta la función en un error en
    ejecución.
  */
  #variable_conflict use_column
DECLARE
  objetivo    uuid;
  equipo      uuid;
  entrenador  uuid;
BEGIN
  IF target IS NULL THEN
    /*
      El cliente que llama. `LIMIT 1` con orden estable porque un mismo perfil
      podría estar dado de alta por dos entrenadores distintos: el portal abre
      uno, y sin ORDER BY «uno» sería cualquiera en cada llamada.
    */
    SELECT c.id INTO objetivo
    FROM public.clients c
    WHERE c.client_profile_id = auth.uid()
    ORDER BY c.created_at, c.id
    LIMIT 1;
  ELSE
    objetivo := target;
  END IF;

  -- Sin cliente no hay plan. Cero filas, y no es un error: es un entrenador
  -- que todavía no ha abierto a nadie.
  IF objetivo IS NULL THEN
    RETURN;
  END IF;

  /*
    Y aquí se falla en voz alta en vez de devolver la lista vacía. Devolver cero
    filas sin permiso es el «403 invisible»: la rutina aparecería sin fichas y
    nadie sabría si es que no hay vídeos o que no se puede leer.
  */
  IF NOT (public.app_is_client(objetivo) OR public.app_can_read_client(objetivo)) THEN
    RAISE EXCEPTION 'No tienes permiso para leer el plan de ese cliente';
  END IF;

  SELECT c.team_id, c.coach_id INTO equipo, entrenador
  FROM public.clients c WHERE c.id = objetivo;

  RETURN QUERY
  WITH plan AS (
    /*
      El guardia de `jsonb_typeof` es el de la 0024: `microcycles` es una columna
      jsonb con DEFAULT '[]' que en filas antiguas puede traer cualquier cosa, y
      un camino sobre un no-array reventaría la consulta entera.
    */
    SELECT CASE WHEN jsonb_typeof(w.microcycles) = 'array' THEN w.microcycles ELSE '[]'::jsonb END AS mc
    FROM public.workout_data w
    WHERE w.client_id = objetivo
  ),
  nombres AS (
    /*
      Los ejercicios del PLAN (`days`) y los de lo REGISTRADO (`sessions`). Los
      dos, porque un ejercicio puede haber salido del plan y seguir estando en
      una sesión ya anotada — y quien la mira sigue necesitando la ficha.

      `jsonb_path_query` en modo `lax` en vez de los cuatro LATERAL anidados que
      escribió la 0024: allí hacía falta bajar a mano porque había que CONVERTIR
      un texto libre a número y un guion en una celda tumbaba la consulta. Aquí
      solo se leen cadenas, y `lax` se traga por diseño lo que falte —un
      microciclo sin `days`, un ejercicio sin `name`— sin error.
    */
    SELECT DISTINCT lower(btrim(v #>> '{}')) AS clave
    FROM plan, LATERAL jsonb_path_query(plan.mc, 'lax $[*].days[*].exercises[*].name') AS v
    WHERE jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') <> ''
    UNION
    SELECT DISTINCT lower(btrim(v #>> '{}'))
    FROM plan, LATERAL jsonb_path_query(plan.mc, 'lax $[*].sessions[*].exercises[*].name') AS v
    WHERE jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') <> ''
  )
  SELECT e.name, e.video_url, e.cue
  FROM public.exercises e
  JOIN nombres n ON n.clave = lower(btrim(e.name))
  WHERE
    /*
      La biblioteca de su entrenador: la del equipo si lo hay, y la suya propia
      en cualquier caso. Las dos condiciones y no una porque `team_id` es
      opcional (0006) y sin ella `e.team_id = equipo` no encontraría nada.
    */
    ((equipo IS NOT NULL AND e.team_id = equipo) OR e.coach_id = entrenador)
    -- Sin vídeo y sin clave no hay ficha que abrir.
    AND (e.video_url IS NOT NULL OR e.cue IS NOT NULL);
END;
$$;

/*
  La regla de la 0069: las funciones nacen cerradas. Sin este par, una función
  nueva es ejecutable por `public` —y por tanto con la clave anónima— porque así
  es el DEFAULT de PostgreSQL, no porque nadie lo haya decidido.
*/
REVOKE ALL ON FUNCTION public.exercise_sheets(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.exercise_sheets(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   -- Como entrenador, la ficha de lo que le has puesto a un cliente:
--   SELECT * FROM public.exercise_sheets('<id-del-cliente>');
--
--   -- Como cliente (con su sesión), la suya y sin argumento:
--   SELECT * FROM public.exercise_sheets();
--
--   -- Y que no se pueda leer la de un cliente ajeno: tiene que dar
--   -- «No tienes permiso para leer el plan de ese cliente».
--   SELECT * FROM public.exercise_sheets('<id-de-otro>');
--
-- Lo que NO cambia:
-- · Las políticas de `exercises`. La biblioteca sigue siendo del equipo y el
--   cliente sigue sin poder leerla directamente.
-- · Las rutinas montadas. La ficha se resuelve POR NOMBRE en el momento de
--   pintar; no se copia nada a ningún plan.
-- · Los alimentos existentes. `note` nace NULL, que significa «no dice».
-- ============================================================================
