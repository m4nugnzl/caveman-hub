-- ============================================================================
-- Tus grupos de equivalencia, del lado de quien come
-- ----------------------------------------------------------------------------
-- ⚠️  Solo crea una función. No toca ni una tabla, ni un dato, ni una política.
--     Sin ella, el cliente ve las equivalencias CALCULADAS —lo de siempre— y no
--     falla nada; con ella, ve las que su entrenador le dejó puestas.
--
-- ══ El agujero que tapa ════════════════════════════════════════════════════
--
-- Las equivalencias que calcula el catálogo son correctas y a veces
-- inservibles: las de «Huevo entero» son cinco huevos casi iguales, y nadie
-- puede decir cuál prefiere. Para eso están los grupos con nombre —«Mi proteína
-- magra» son estos cinco alimentos y no los treinta del catálogo—, que el
-- entrenador poda desde la ventana del alimento (`domain/gruposEquiv.js`).
--
-- Pero viven en `profiles.preferences` del ENTRENADOR, y las políticas de
-- `profiles` son «el perfil propio» (0002) y «el equipo» (0006). Un cliente no
-- lee ninguna de las dos. O sea que el entrenador podaba la lista a tres y **su
-- cliente seguía viendo los cinco huevos** — justo la persona a la que la lista
-- le sirve, la que está en la frutería sin lo que le pautaron.
--
-- ══ Es el gemelo exacto de la 0100 ═════════════════════════════════════════
--
-- Mismo problema y misma forma: algo del entrenador que el cliente necesita ver
-- y su política no le deja. Allí era el vídeo del ejercicio y salió
-- `exercise_sheets(target)`; aquí es esto. `SECURITY DEFINER` para saltarse la
-- política a propósito, el permiso comprobado a mano dentro, `STABLE` porque
-- solo lee, y el par REVOKE/GRANT de la 0069 porque las funciones nacen
-- cerradas.
--
-- ── Por qué NO se filtra por lo que hay en su dieta ────────────────────────
-- La 0100 sí lo hace: devuelve solo las fichas de los ejercicios que están en
-- SU plan, porque la biblioteca de ejercicios de un entrenador son miles de
-- filas con vídeos y pautas — su oficio entero. Aquí son como mucho veinte
-- grupos de nombres de alimentos, del vocabulario del propio entrenador, y
-- recortarlos exigiría barrer los cuatro sitios donde vive un menú
-- (`closed_meals`, las dos variantes y `days[].meals`, ver la 0111). Un fallo en
-- ese barrido deja a alguien sin sus equivalencias y en silencio, que es peor
-- que lo que evita. Se manda la lista y la aplicación usa la que le toca.
-- ============================================================================

BEGIN;

/*
  Los grupos de equivalencia del entrenador de un cliente.

  @param target  El cliente. NULL —lo normal desde el portal— significa «el
    cliente que soy». Se pasa explícito cuando mira un ENTRENADOR, que es lo que
    hace «Ver como»: sin eso, el entrenador asomado al portal de su cliente
    vería las listas largas y creería que sus grupos no se guardaron.

  Devuelve una fila por grupo. `foods` es el array de NOMBRES tal cual se
  guardó: un grupo no lleva cantidades ni macros —las raciones se calculan cada
  vez contra el alimento que haya delante—, así que aquí no hay nada que
  convertir. Ver `domain/gruposEquiv.js`.
*/
CREATE OR REPLACE FUNCTION public.equiv_groups(target uuid DEFAULT NULL)
RETURNS TABLE (id text, name text, macro text, foods jsonb)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
  /* Los nombres de salida (`id`, `name`) coinciden con columnas de `profiles`.
     Todo lo de abajo va cualificado, pero queda dicho para que añadir una
     columna más tarde no convierta la función en un error en ejecución. */
  #variable_conflict use_column
DECLARE
  objetivo    uuid;
  entrenador  uuid;
BEGIN
  IF target IS NULL THEN
    /*
      El cliente que llama. `LIMIT 1` con orden estable porque un mismo perfil
      podría estar dado de alta por dos entrenadores distintos: el portal abre
      uno, y sin ORDER BY «uno» sería cualquiera en cada llamada. Es la misma
      elección que hace la 0100, y a propósito: dos criterios distintos para
      «cuál de mis fichas es la que se abre» serían dos portales.
    */
    SELECT c.id INTO objetivo
    FROM public.clients c
    WHERE c.client_profile_id = auth.uid()
    ORDER BY c.created_at, c.id
    LIMIT 1;
  ELSE
    objetivo := target;
  END IF;

  -- Sin cliente no hay dieta. Cero filas, y no es un error.
  IF objetivo IS NULL THEN
    RETURN;
  END IF;

  /*
    Y aquí se falla en voz alta en vez de devolver la lista vacía. Devolver cero
    filas sin permiso es el «403 invisible»: las equivalencias saldrían largas y
    nadie sabría si es que no hay grupos o que no se pueden leer.
  */
  IF NOT (public.app_is_client(objetivo) OR public.app_can_read_client(objetivo)) THEN
    RAISE EXCEPTION 'No tienes permiso para leer la dieta de ese cliente';
  END IF;

  SELECT c.coach_id INTO entrenador FROM public.clients c WHERE c.id = objetivo;
  IF entrenador IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    g.value ->> 'id',
    g.value ->> 'name',
    g.value ->> 'macro',
    /*
      El guardia de `jsonb_typeof`, que es el de la 0024 y el de la 0111: esto
      es una columna jsonb de texto libre donde una versión anterior pudo
      escribir cualquier cosa, y un camino sobre un no-array reventaría la
      consulta entera — o sea, dejaría al cliente sin dieta por un grupo mal
      escrito.
    */
    CASE WHEN jsonb_typeof(g.value -> 'foods') = 'array'
         THEN g.value -> 'foods' ELSE '[]'::jsonb END
  FROM public.profiles p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.preferences -> 'gruposEquiv' -> 'items') = 'array'
         THEN p.preferences -> 'gruposEquiv' -> 'items' ELSE '[]'::jsonb END
  ) AS g
  WHERE p.id = entrenador
    AND jsonb_typeof(g.value) = 'object';
END;
$$;

/*
  La regla de la 0069: las funciones nacen cerradas. Sin este par, una función
  nueva es ejecutable por `public` —y por tanto con la clave anónima— porque así
  es el DEFAULT de PostgreSQL, no porque nadie lo haya decidido.
*/
REVOKE ALL ON FUNCTION public.equiv_groups(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.equiv_groups(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   -- Como entrenador, lo que le llega a un cliente tuyo:
--   SELECT * FROM public.equiv_groups('<id-del-cliente>');
--
--   -- Como cliente (con su sesión), los suyos y sin argumento:
--   SELECT * FROM public.equiv_groups();
--
--   -- Y que no se puedan leer los de un cliente ajeno: tiene que dar
--   -- «No tienes permiso para leer la dieta de ese cliente».
--   SELECT * FROM public.equiv_groups('<id-de-otro>');
--
-- Un entrenador que no haya guardado ningún grupo devuelve cero filas, y es lo
-- correcto: el cliente ve las equivalencias calculadas, que es lo de siempre.
-- ============================================================================
