-- ============================================================================
-- La casilla tuya vive en tu agenda, y el cliente no la ve
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para «Mandar algo → una casilla tuya». Sin ella esa opción
--     escribiría en el calendario COMPARTIDO y el cliente leería tus notas.
--
-- ══ Por qué aquí y no en la tabla de lo mandado ════════════════════════════
--
-- Porque tu trabajo pendiente ya tiene su sitio y su reloj. `client_events`
-- (0009) guarda desde hace meses una nota con fecha sobre una persona, y
-- `domain/today.js` ya la reclama por dos caminos: la agenda —lo de hoy y lo
-- vencido— y la bandeja. Meter «llamar a Marta el jueves» en `client_actions`
-- habría creado una segunda lista de deberes tuyos, sin agenda y sin vencidos, y
-- con ella un segundo sitio donde mirar para contestar una sola pregunta: qué me
-- toca hoy.
--
-- Lo único que le faltaba a `client_events` para servir es que algunas de sus
-- filas puedan ser SOLO TUYAS. Hasta hoy el calendario es de los dos: la
-- política de lectura dice «el entrenador que puede ver al cliente, o el propio
-- cliente», sin más.
--
-- ══ El defecto en `false`, y no es un detalle ══════════════════════════════
--
-- Todo lo que ya está escrito sigue siendo compartido, exactamente como estaba.
-- Una columna así con el defecto al revés le escondería al cliente su propio
-- calendario de un día para otro —sus citas, sus carreras, sus descansos— sin
-- que nadie hubiera pedido nada.
--
-- ══ Las cuatro políticas, no solo la de leer ═══════════════════════════════
--
-- Esconder una fila solo en el SELECT deja la puerta de atrás abierta: con el
-- `id` a mano se puede actualizar o borrar lo que no se puede leer, y también se
-- puede CREAR una fila privada haciéndose pasar por el otro lado. Así que la
-- condición entra en las cuatro. Es la misma lección de las 0088-0090: media
-- capa de permisos es ninguna.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.client_events') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existe `client_events`.';
  END IF;
  IF to_regprocedure('public.app_is_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existen los ayudantes de RLS.';
  END IF;
END $$;

BEGIN;

/*
  Privada = solo la ve quien la escribió y quien lleva a ese cliente.

  No se llama `oculta` ni `interna`: privada es la palabra que se usa en la
  pantalla («solo la ves tú»), y el esquema y la interfaz llamando a lo mismo de
  dos maneras es media hora de traducción cada vez que algo falla.
*/
ALTER TABLE public.client_events
  ADD COLUMN IF NOT EXISTS privada boolean NOT NULL DEFAULT false;

-- ── Leer ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "events_read" ON public.client_events;
CREATE POLICY "events_read" ON public.client_events
  FOR SELECT TO authenticated
  USING (
    public.app_can_read_client(client_id)
    OR (public.app_is_client(client_id) AND NOT privada)
  );

-- ── Crear ───────────────────────────────────────────────────────────────────
--
-- El cliente sigue pudiendo apuntar cosas en su calendario, pero no puede
-- apuntarlas como privadas: una fila privada creada desde su lado sería una nota
-- que su entrenador ve y él no, que es justo lo contrario de lo que la columna
-- significa.

DROP POLICY IF EXISTS "events_insert" ON public.client_events;
CREATE POLICY "events_insert" ON public.client_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.app_can_write_client(client_id)
      OR (public.app_is_client(client_id) AND NOT privada)
    )
    AND created_by = auth.uid()
  );

-- ── Cambiar ─────────────────────────────────────────────────────────────────
--
-- `USING` decide qué filas se pueden tocar y `WITH CHECK` cómo quedan. Hacen
-- falta las dos: sin la segunda, el cliente podría coger una fila suya y
-- marcarla privada, y a partir de ahí dejaría de verla él mismo.

DROP POLICY IF EXISTS "events_update" ON public.client_events;
CREATE POLICY "events_update" ON public.client_events
  FOR UPDATE TO authenticated
  USING (
    public.app_can_write_client(client_id)
    OR (public.app_is_client(client_id) AND NOT privada)
  )
  WITH CHECK (
    public.app_can_write_client(client_id)
    OR (public.app_is_client(client_id) AND NOT privada)
  );

-- ── Borrar ──────────────────────────────────────────────────────────────────
--
-- El entrenador cura el calendario y cada uno puede quitar lo que puso. Lo que
-- se cierra es el borrado a ciegas: sin la condición, un cliente con el `id` de
-- una nota privada podría borrarla sin haberla visto nunca.

DROP POLICY IF EXISTS "events_delete" ON public.client_events;
CREATE POLICY "events_delete" ON public.client_events
  FOR DELETE TO authenticated
  USING (
    public.app_can_write_client(client_id)
    OR (created_by = auth.uid() AND (NOT privada OR public.app_can_write_client(client_id)))
  );

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Que la columna nació compartida (debe dar 0):
--
--   SELECT count(*) FROM public.client_events WHERE privada;
--
-- 2) Que las cuatro políticas la miran (debe dar 4):
--
--   SELECT count(*) FROM pg_policies
--   WHERE tablename = 'client_events'
--     AND (qual LIKE '%privada%' OR with_check LIKE '%privada%');
--
-- 3) Con la sesión de un CLIENTE, que una nota privada suya no se ve (0 filas):
--
--   SELECT count(*) FROM public.client_events WHERE privada;
-- ============================================================================
