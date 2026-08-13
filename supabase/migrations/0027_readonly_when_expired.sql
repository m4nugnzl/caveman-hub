-- ============================================================================
-- Solo lectura cuando la suscripción se acaba
-- ----------------------------------------------------------------------------
-- ⚠️  CAMBIA QUIÉN PUEDE ESCRIBIR. Requiere `0006_teams.sql` y `0019_billing.sql`.
--     Se para sola si falta alguna.
--
-- ══ El agujero que cierra ══════════════════════════════════════════════════
--
-- La `0019` bloqueaba una sola cosa al acabarse la prueba: dar de alta clientes.
-- Todo lo demás seguía funcionando —programar rutinas, montar dietas, añadir
-- ejercicios a la biblioteca—, así que con tres clientes, que es justo el tope de
-- la prueba, se podía usar esto indefinidamente sin pagar.
--
-- Un periodo de prueba que no termina no es un periodo de prueba.
--
-- ══ Lo que NO se bloquea, y por qué ════════════════════════════════════════
--
-- **Leer, exportar y borrar.** Los datos son del entrenador y de sus clientes: no
-- se retienen como rehenes. Puede sacar su copia y puede borrar la ficha de quien
-- se lo pida —que además es una obligación legal suya, no un favor—.
--
-- **Los clientes.** Sus escrituras no pasan por estas políticas sino por las
-- funciones de la `0014` y la `0016`, y se quedan intactas. Que un entrenador
-- deje de pagar no puede impedirle a una persona registrar su propio peso o ver
-- su rutina: no es ella quien debe.
--
-- **El impago (`past_due`).** Sigue permitiendo trabajar. Un webhook perdido, una
-- tarjeta que caduca un domingo o un reintento de Stripe dejarían a alguien que sí
-- paga sin poder trabajar con sus clientes, y eso es mucho peor que cobrar dos
-- días tarde. Bloquea el crecimiento (0019) y ya presiona bastante.
--
-- Si algún día se quiere que el impago también congele, es quitar `'past_due'` de
-- la lista de `team_write_allowed`. Una palabra.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.team_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'Falta 0019_billing.sql: sin suscripciones no hay nada que comprobar.';
  END IF;
  /*
    `to_regprocedure` y no `to_regproc`: el primero entiende la firma con sus
    argumentos, el segundo solo el nombre a secas y devuelve NULL en cuanto ve un
    paréntesis. Con el equivocado, esta guarda saltaba siempre —incluso con la
    0006 aplicada— y acusaba de faltar a una migración que estaba puesta.
  */
  IF to_regprocedure('public.can_write_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0006_teams.sql: `can_write_client` es la puerta que esta migración estrecha.';
  END IF;
END $$;

BEGIN;

/**
 * ¿Está la suscripción de este equipo en condiciones de escribir?
 *
 * Permisiva ante la duda: un equipo sin fila de suscripción puede escribir. Esa
 * fila la crea `ensure_my_team`, pero un equipo llegado por otra vía no debe
 * quedarse mudo por una omisión administrativa —el bloqueo es una consecuencia de
 * no pagar, no de un hueco en una tabla—.
 */
CREATE OR REPLACE FUNCTION public.team_write_allowed(target_team uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (
      SELECT
        s.status IN ('active', 'trialing', 'past_due')
        AND (s.status <> 'trialing' OR s.trial_ends_at IS NULL OR s.trial_ends_at > now())
      FROM public.team_subscriptions s
      WHERE s.team_id = target_team
    ),
    true
  );
$$;

/**
 * ¿Puede el usuario escribir en la ficha de este cliente?
 *
 * Es `can_write_client` —el rol dentro del equipo, de la 0006— **y además** la
 * suscripción al día. Se añade una función en vez de modificar aquella porque
 * `can_write_client` responde a «¿tiene permiso?» y esto a «¿tiene permiso y está
 * al corriente?», que son preguntas distintas: hay sitios donde solo importa la
 * primera —borrar los datos de alguien que los reclama— y mezclarlas cerraría
 * también esa puerta.
 */
CREATE OR REPLACE FUNCTION public.can_write_client_active(target uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.can_write_client(target)
     AND public.team_write_allowed((SELECT team_id FROM public.clients WHERE id = target));
$$;

REVOKE ALL ON FUNCTION public.team_write_allowed(uuid) FROM public;
REVOKE ALL ON FUNCTION public.can_write_client_active(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.team_write_allowed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_client_active(uuid) TO authenticated;

COMMIT;


BEGIN;

-- ── Los bloques de cada cliente ────────────────────────────────────────────
-- Solo se sustituye la política de ESCRITURA. La de lectura (`*_team_read`) se
-- queda como está: seguir viendo el trabajo hecho no depende de estar al día.

DROP POLICY IF EXISTS "workout_team_write" ON public.workout_data;
CREATE POLICY "workout_team_write" ON public.workout_data
  FOR ALL TO authenticated
  USING (public.can_write_client_active(client_id))
  WITH CHECK (public.can_write_client_active(client_id));

DROP POLICY IF EXISTS "anthro_team_write" ON public.anthropometry;
CREATE POLICY "anthro_team_write" ON public.anthropometry
  FOR ALL TO authenticated
  USING (public.can_write_client_active(client_id))
  WITH CHECK (public.can_write_client_active(client_id));

DROP POLICY IF EXISTS "nutrition_team_write" ON public.nutrition_plans;
CREATE POLICY "nutrition_team_write" ON public.nutrition_plans
  FOR ALL TO authenticated
  USING (public.can_write_client_active(client_id))
  WITH CHECK (public.can_write_client_active(client_id));

DROP POLICY IF EXISTS "photos_team_write" ON public.progress_photos;
CREATE POLICY "photos_team_write" ON public.progress_photos
  FOR ALL TO authenticated
  USING (public.can_write_client_active(client_id))
  WITH CHECK (public.can_write_client_active(client_id));

-- ── La ficha del cliente ───────────────────────────────────────────────────
-- Editar sus datos, sí lo bloquea. Borrarla, NO: la política de borrado es otra
-- (`clients_team_delete`) y se queda intacta, porque el derecho de supresión de
-- una persona no puede depender de si su entrenador tiene un recibo al día.

DROP POLICY IF EXISTS "clients_team_write" ON public.clients;
CREATE POLICY "clients_team_write" ON public.clients
  FOR UPDATE TO authenticated
  USING (public.can_write_client_active(id))
  WITH CHECK (public.can_write_client_active(id));

COMMIT;


BEGIN;

-- ── Las bibliotecas del equipo ─────────────────────────────────────────────
/*
  Aquí había UNA política `FOR ALL` que servía para leer y para escribir. Añadirle
  la condición habría dejado la biblioteca invisible al caducar, y entonces la
  rutina de un cliente aparecería con los ejercicios en blanco: parecería que se
  han borrado.

  Se parte en dos: leer siempre, escribir solo al día.
*/

DROP POLICY IF EXISTS "exercises_team_all" ON public.exercises;
CREATE POLICY "exercises_team_read" ON public.exercises
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.my_team_ids()));
CREATE POLICY "exercises_team_write" ON public.exercises
  FOR ALL TO authenticated
  USING (team_id IN (SELECT public.my_team_ids()) AND public.team_write_allowed(team_id))
  WITH CHECK (team_id IN (SELECT public.my_team_ids()) AND public.team_write_allowed(team_id));

DROP POLICY IF EXISTS "foods_team_all" ON public.foods;
CREATE POLICY "foods_team_read" ON public.foods
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.my_team_ids()));
CREATE POLICY "foods_team_write" ON public.foods
  FOR ALL TO authenticated
  USING (team_id IN (SELECT public.my_team_ids()) AND public.team_write_allowed(team_id))
  WITH CHECK (team_id IN (SELECT public.my_team_ids()) AND public.team_write_allowed(team_id));

COMMIT;

-- ============================================================================
-- Probarlo, y volver atrás
-- ----------------------------------------------------------------------------
-- Caducar la prueba a mano:
--
--   UPDATE public.team_subscriptions
--   SET plan='prueba', status='trialing', trial_ends_at = now() - interval '1 day';
--
-- A partir de ahí, en la aplicación: la cartera y las rutinas se ven, y cualquier
-- intento de guardar falla. Devolverlo:
--
--   UPDATE public.team_subscriptions
--   SET plan='fundador', status='active', trial_ends_at = NULL;
--
-- Comprobación directa:
--
--   SELECT t.name, s.status, public.team_write_allowed(t.id) AS puede_escribir
--   FROM public.teams t JOIN public.team_subscriptions s ON s.team_id = t.id;
--
-- ── Lo que el usuario ve al fallar ─────────────────────────────────────────
-- RLS no lanza un mensaje bonito: rechaza la fila y PostgREST responde que no se
-- ha actualizado nada. La aplicación lo enseña como un error de guardado con su
-- botón de reintentar, no como «se te ha acabado la prueba». Por eso la franja de
-- aviso (`components/PlanNotice.jsx`) importa tanto: es lo único que explica por
-- qué de repente nada se guarda.
-- ============================================================================
