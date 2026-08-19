-- ============================================================================
-- El tope de asientos, que estaba escrito y no lo comprobaba nadie
-- ----------------------------------------------------------------------------
-- `plan_limits.max_seats` existe desde la 0019, sale en Ajustes → Plan y **se
-- anuncia en la portada pública** —«1 entrenador» en la tarjeta de Gratis y en
-- la de Solo—. No lo aplicaba nada. Una cuenta gratuita podía invitar a diez.
--
-- Esta migración lo convierte en verdad. No cambia ningún límite: los números ya
-- estaban puestos (0019, 0056, 0061).
--
--      Gratis · Solo · Pro   1 asiento
--      Equipo                3 asientos
--
-- ══ 1. Disparador, y no un `IF` dentro de `invite_team_member` ═════════════
--
-- La función es hoy el único camino —la 0046 concede a `authenticated` SELECT,
-- UPDATE y DELETE sobre `team_members`, pero **no INSERT**—, así que un `IF` ahí
-- dentro bastaría. Y aun así va como disparador, por dos motivos:
--
--   · La política `members_owner_write` (0006) es `FOR ALL` y deja escribir al
--     dueño. Lo único que hoy impide el `INSERT` directo es la ausencia de un
--     `GRANT`. Un control que depende de que nadie añada un permiso más adelante
--     no es un control, es una casualidad que aguanta.
--   · Es el patrón que ya sostiene el límite de clientes (`enforce_client_limit`,
--     0019) y la regla que gobierna todo esto: **los límites los impone
--     Postgres, no la aplicación** (`docs/monetizacion.md` §3.3). Dos formas
--     distintas de aplicar dos límites del mismo plan es cómo se acaba con uno
--     de los dos sin aplicar.
--
-- ══ 2. Cambiar el rol de alguien NO gasta un asiento ═══════════════════════
--
-- Es la trampa de esta migración y no se ve leyendo el código de la función.
--
-- `invite_team_member` termina en `INSERT … ON CONFLICT (team_id, profile_id) DO
-- UPDATE SET role`, o sea que **volver a invitar a quien ya está dentro es como
-- se le cambia el rol**. Y un disparador `BEFORE INSERT` se ejecuta ANTES de que
-- Postgres detecte el conflicto: sin la comprobación de abajo, un equipo con los
-- asientos llenos no podría ascender a nadie a administrador — el error diría
-- que no caben más personas, cuando no se está añadiendo ninguna.
--
-- ══ 3. Un equipo sin suscripción cuenta como el plan gratuito ══════════════
--
-- No como «sin límite». Es la misma decisión que la 0019 tomó para los clientes
-- —«el hueco de los equipos que no cuentan para nada es por donde se acaba
-- colando todo el mundo»— resuelta aquí de la forma más simple: si no hay fila
-- de suscripción se lee el tope del plan de partida. No se crea ninguna fila:
-- inventar una suscripción desde el disparador de los asientos duplicaría la
-- lógica de la 0019 y, peor, la duplicaría desactualizada (esa rama sigue
-- abriendo una prueba de catorce días, que la 0056 retiró).
--
-- ══ 4. A quien ya se pasó, no se le echa ═══════════════════════════════════
--
-- `BEFORE INSERT` solo mira las altas. Un equipo que hoy tenga cuatro personas
-- con un plan de una se queda con sus cuatro y no puede añadir una quinta. Es lo
-- mismo que hace el límite de clientes y por lo mismo: empezar a aplicar una
-- regla no puede echar hacia atrás a nadie que entró cuando no se aplicaba.
--
-- Para saber si le pasa a alguien, la consulta está al final.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.team_members') IS NULL THEN
    RAISE EXCEPTION 'Falta 0006_teams.sql: sin equipos no hay asientos que contar.';
  END IF;
  IF to_regclass('public.plan_limits') IS NULL THEN
    RAISE EXCEPTION 'Falta 0019_billing.sql: `max_seats` vive ahí.';
  END IF;
END;
$$;

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max   integer;
  v_label text;
  v_count integer;
BEGIN
  /*
    El punto 2 de la cabecera: si esa persona ya está en el equipo, esto es un
    cambio de rol disfrazado de `INSERT` y no ocupa ningún asiento nuevo.
  */
  IF EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = NEW.team_id AND profile_id = NEW.profile_id
  ) THEN
    RETURN NEW;
  END IF;

  /*
    El tope del plan del equipo. `COALESCE` sobre el plan y no sobre el número:
    un equipo sin suscripción se lee como el plan de partida (punto 3), mientras
    que un `max_seats` que vale NULL de verdad significa «sin tope» y tiene que
    seguir significándolo.
  */
  SELECT l.max_seats, l.label INTO v_max, v_label
    FROM public.plan_limits l
   WHERE l.plan = COALESCE(
           (SELECT s.plan FROM public.team_subscriptions s WHERE s.team_id = NEW.team_id),
           'prueba'
         );

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count FROM public.team_members WHERE team_id = NEW.team_id;

  IF v_count >= v_max THEN
    /*
      Dos frases y no una con un número dentro, porque el caso de un asiento es
      casi todos los casos y «llega a 1 entrenadores» es justo la clase de
      descuido que hace desconfiar del resto de la pantalla.

      Y ninguna nombra el plan al que hay que ir: los nombres cambian —esta misma
      semana `solo` pasó a significar otra cosa— y un mensaje que dice «cambia a
      Equipo» envejece dentro de la base de datos, donde nadie lo va a releer.
    */
    IF v_max = 1 THEN
      RAISE EXCEPTION 'El plan % es para un solo entrenador. Cambia de plan para trabajar con más gente.',
        v_label
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'El plan % llega a % entrenadores y ya sois %. Cambia de plan para añadir a alguien más.',
        v_label, v_max, v_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_members_seat_limit ON public.team_members;
CREATE TRIGGER team_members_seat_limit
  BEFORE INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Quién se pasa ya del tope de su plan (punto 4). Ninguno pierde nada; lo que no
-- podrán es añadir a nadie más:
--
--   SELECT p.email, l.label AS plan, l.max_seats, count(m.*) AS asientos_usados
--     FROM public.teams t
--     JOIN public.profiles p ON p.id = t.owner_id
--     JOIN public.team_members m ON m.team_id = t.id
--     LEFT JOIN public.team_subscriptions s ON s.team_id = t.id
--     JOIN public.plan_limits l ON l.plan = COALESCE(s.plan, 'prueba')
--    GROUP BY 1, 2, 3
--   HAVING l.max_seats IS NOT NULL AND count(m.*) > l.max_seats;
--
-- Que el tope se aplica de verdad, desde la aplicación: en una cuenta gratuita,
-- Ajustes → Equipo → invitar a un segundo entrenador tiene que contestar «El
-- plan Gratis es para un solo entrenador».
--
-- Y que cambiar el rol de alguien que YA está dentro sigue funcionando con los
-- asientos llenos, que es lo que rompería si faltara la comprobación del punto 2.
-- ============================================================================
