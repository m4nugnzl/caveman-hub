-- ============================================================================
-- Cobros e invitaciones pueden leerse
-- ----------------------------------------------------------------------------
-- ⚠️  De permisos. `GRANT SELECT, INSERT, DELETE` sobre `client_payments`;
--     `GRANT SELECT, DELETE` y una política de borrado sobre `client_invites`.
--     No cambia tablas, funciones ni datos. Requiere `0015_client_invites.sql`
--     y `0072_el_cobro_a_mano_tambien_deja_rastro.sql`.
--
-- ══ Las dos que la 0089 dejó anotadas ═══════════════════════════════════════
--
-- El mismo fallo que `client_consents` (0088), `client_folders` y
-- `client_calendar_feeds` (0089): políticas escritas y evaluadas nunca, porque
-- falta el privilegio de tabla que las hace alcanzables. El síntoma aquí no se
-- tragaba en silencio: la pantalla de Cobros abre con su aviso de «no se ha
-- podido leer tu histórico» — un 403 42501 enseñado a quien no puede hacer
-- nada con él.
--
-- Lo que la aplicación hace DE VERDAD contra cada tabla, y su política:
--
--   · `client_payments` SELECT — el histórico de la pantalla de Cobros
--     (`IncomePanel`). Lo decide `payments_read` (0010).
--   · `client_payments` INSERT — el apunte del cobro a mano (`apuntarCobro`,
--     `useClients`). Lo decide `payments_manual_insert` (0072).
--   · `client_payments` DELETE — el «Deshacer» de ese mismo apunte, y la purga
--     al borrar una ficha. Lo decide `payments_manual_delete` (0072).
--   · `client_invites` SELECT — el aviso de «este enlace es de un cliente
--     tuyo» en la página de invitación (`InvitePage`). Lo decide
--     `invites_coach_read` (0015). Su fallo sí se tragaba: la consulta sigue
--     adelante y el aviso simplemente no salía nunca.
--   · `client_invites` DELETE — la purga al borrar una ficha (`useClients`).
--     No tenía política: el borrado directo devolvía 42501 y el borrado de un
--     cliente terminaba con un «problema» que no lo era (la cascada de la 0015
--     limpiaba la fila igualmente). La política nueva dice lo mismo que las
--     otras dos de la tabla: sus invitaciones las borra su entrenador.
--
-- ══ Lo que NO se concede, y por qué ═════════════════════════════════════════
--
--   · `client_payments` UPDATE. `payments_reconcile` existe para la
--     conciliación de integraciones, pero hoy ninguna pantalla actualiza la
--     tabla directamente. Conceder el privilegio abriría un camino sin
--     consumidor; cuando la conciliación llegue, que traiga su GRANT.
--   · `client_invites` UPDATE e INSERT. Crear, revocar y canjear pasan por
--     `create_client_invite`, `revoke_client_invite` y `claim_client_invite`,
--     las tres SECURITY DEFINER: la política de revocación es redundante y el
--     privilegio directo solo añadiría superficie.
--
-- Es idempotente: si los privilegios ya están, no cambia nada.
-- ============================================================================

BEGIN;

GRANT SELECT, INSERT, DELETE ON public.client_payments TO authenticated;
GRANT SELECT, DELETE ON public.client_invites TO authenticated;

-- Sus invitaciones las borra su entrenador — la misma guarda que leerlas y
-- revocarlas. Sin esto, el DELETE concedido arriba no alcanzaría ninguna fila.
DROP POLICY IF EXISTS "invites_coach_delete" ON public.client_invites;
CREATE POLICY "invites_coach_delete" ON public.client_invites
  FOR DELETE TO authenticated
  USING (public.is_my_client(client_id));

/* Sin sesión no hay nada que preguntar en ninguna de las dos, y sus políticas
   —escritas para el rol `authenticated`— no alcanzarían a protegerlas. */
REVOKE ALL ON public.client_payments FROM anon;
REVOKE ALL ON public.client_invites FROM anon;

COMMIT;
