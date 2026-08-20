-- ============================================================================
-- El registro de cambios, del plan Equipo
-- ----------------------------------------------------------------------------
-- El tercero de los capados de `docs/monetizacion.md` §7.4, y el más barato de
-- los tres: una columna y una condición en una política de lectura.
--
-- Como con los asientos (0064), esto no inventa un límite: lo cumple. La tarifa
-- lleva anunciando «registro de cambios» como cosa del plan Equipo desde la §5
-- —la de los 69 €— y la política de la 0017 se lo enseñaba a todo el mundo.
-- Igual que `max_seats` era una nota y no un límite, esto era una promesa al
-- revés: se regalaba lo que se vendía.
--
--      Gratis · Solo · Pro    no
--      Equipo                 sí
--      Las tarifas retiradas  sí  (ver punto 3)
--
-- ══ 1. Por qué Equipo y no Pro ══════════════════════════════════════════════
--
-- El registro contesta «quién de nosotros cambió esto», y ese «nosotros» solo
-- existe con más de un asiento. Gratis, Solo y Pro son planes de un entrenador
-- (0064): su registro diría siempre «tú», que es no decir nada. No es un recorte
-- que le duela a nadie que pueda dolerle: es quitar de la pantalla una función
-- que en esos planes no tiene pregunta que contestar.
--
-- ══ 2. Se capa la LECTURA, nunca la escritura ═══════════════════════════════
--
-- Los disparadores de la 0017 siguen anotando cada cambio en TODOS los planes.
-- Solo se gobierna quién ve la traza. Dos motivos:
--
--   · El día que un equipo sube a Equipo, su historial ya está ahí, entero.
--     Capar la escritura regalaría silencio: subir de plan compraría un registro
--     que empieza hoy, con los meses de antes en blanco.
--   · La traza también protege al negocio ante una reclamación («yo no tenía
--     programado eso»). Esa protección no puede depender del plan del acusado.
--
-- Y una consecuencia de capar un SELECT: RLS **filtra sin error**. Quien no lo
-- tiene no recibe un rechazo que explicar, recibe cero filas, que la pantalla
-- anunciaría como «todavía no consta ningún cambio» — mentira. Por eso esta
-- migración viaja con `my_team_plan()` diciendo si el plan lo incluye (0067) y
-- con la ficha del cliente explicándolo en vez de enseñar una lista vacía.
--
-- ══ 3. A quien ya lo tenía no se le quita ═══════════════════════════════════
--
-- El mismo punto 3 de la 0065, palabra por palabra: `solo_2026`, `equipo_2026`
-- y `fundador` entran con `true`. Esa gente contrató cuando no había nada
-- capado, y empezar a aplicar una regla no puede quitarle algo que ya usaba.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION 'Falta 0017_audit_log.sql: no hay registro que capar.';
  END IF;
  IF to_regclass('public.plan_limits') IS NULL THEN
    RAISE EXCEPTION 'Falta 0019_billing.sql.';
  END IF;
  /*
    La 0061, porque el injerto de abajo escribe sobre `solo_2026` y `equipo_2026`.
    Sin ella el UPDATE no casaría con nada —sin error— y cuando la 0061 corriera
    después, las filas retiradas nacerían con el defecto (`false`): justo la
    gente a la que este capado no puede tocar, capada en silencio.
  */
  IF NOT EXISTS (SELECT 1 FROM public.plan_limits WHERE plan = 'solo_2026') THEN
    RAISE EXCEPTION 'Falta 0061_escalera_de_planes.sql. Aplícala antes.';
  END IF;
END;
$$;

BEGIN;

ALTER TABLE public.plan_limits
  -- `false` por defecto por lo mismo que en la 0065: un plan nuevo que nadie
  -- configure NO trae el registro. El olvido no regala la función.
  ADD COLUMN IF NOT EXISTS has_audit_log boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.plan_limits.has_audit_log IS
  'Si este plan puede LEER el registro de cambios (0017). Se escribe siempre, '
  'en todos los planes; lo que gobierna esta columna es la política `audit_read`.';

UPDATE public.plan_limits SET has_audit_log = true
 WHERE plan IN ('equipo', 'equipo_2026', 'solo_2026', 'fundador');

-- La portada lo enseña en la tarjeta del plan y lee sin sesión. La 0049 concedió
-- COLUMNAS, no la tabla: sin esta línea la columna llega vacía y no da error.
GRANT SELECT (has_audit_log) ON public.plan_limits TO anon;

/**
 * ¿El plan del equipo de este cliente incluye leer su traza?
 *
 * `SECURITY DEFINER` como los helpers de la 0007 y por lo mismo: la política que
 * lo llama corre como quien consulta, y quien consulta no tiene por qué poder
 * leer `team_subscriptions` de otro. Sin fila de suscripción se lee como el plan
 * de partida, y si ni siquiera hay cliente devuelve NULL, que en una política es
 * «no»: el lado seguro del error.
 */
CREATE OR REPLACE FUNCTION public.audit_visible_for(p_client uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT l.has_audit_log
    FROM public.clients c
    LEFT JOIN public.team_subscriptions s ON s.team_id = c.team_id
    JOIN public.plan_limits l ON l.plan = COALESCE(s.plan, 'prueba')
   WHERE c.id = p_client;
$$;

REVOKE ALL ON FUNCTION public.audit_visible_for(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.audit_visible_for(uuid) TO authenticated;

/*
  La política de la 0017, con la condición del plan delante de la de siempre.
  Aquí NO hace falta el disparador-por-el-mensaje de la 0065: aquello era un
  INSERT rechazado que necesitaba explicarse; esto es un SELECT que filtra, y la
  explicación la da la interfaz leyendo `my_team_plan()`.
*/
DROP POLICY IF EXISTS "audit_read" ON public.audit_log;
CREATE POLICY "audit_read" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.audit_visible_for(client_id)
    AND public.app_can_read_client(client_id)
  );

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Qué plan lleva el registro:
--
--   SELECT sort, plan, label, has_audit_log FROM public.plan_limits ORDER BY sort;
--
-- Que se sigue ESCRIBIENDO en todos los planes —guarda algo desde una cuenta
-- gratuita y mira que la fila aparece—:
--
--   SELECT table_name, action, at FROM public.audit_log ORDER BY at DESC LIMIT 5;
--
-- Y desde la aplicación: en una cuenta gratuita, la ficha del cliente (Datos y
-- borrado) tiene que decir que el registro no entra en su plan, no enseñar
-- «todavía no consta ningún cambio». En una cuenta Equipo, el botón de siempre.
-- ============================================================================
