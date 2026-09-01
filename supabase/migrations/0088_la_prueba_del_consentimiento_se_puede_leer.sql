-- ============================================================================
-- La prueba del consentimiento se puede LEER
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y de permisos. Un `GRANT SELECT` sobre `client_consents`. No crea
--     ni modifica tablas, políticas, funciones ni datos. Requiere
--     `0018_client_consent.sql` y `0050_consentimiento_unico.sql`.
--
-- ══ El fallo ═══════════════════════════════════════════════════════════════
--
-- La 0018 creó la tabla, le encendió RLS y le escribió su política de lectura:
--
--     CREATE POLICY "consents_read" ON public.client_consents
--       FOR SELECT TO authenticated
--       USING (public.is_me(client_id) OR public.is_my_client(client_id));
--
-- Lo que no hizo —y la 0050 tampoco, porque se ocupó de los permisos de las
-- FUNCIONES— fue darle a `authenticated` el privilegio de SELECT sobre la tabla.
-- En Postgres son dos capas distintas y hacen falta las dos: la política decide
-- QUÉ FILAS se ven; el GRANT decide si se puede mirar la tabla siquiera. Sin él,
-- la política no llega a evaluarse nunca.
--
-- Así que `consent_state(uuid)` —que es `STABLE` a secas, no `SECURITY
-- DEFINER`, y por tanto lee con los permisos de quien llama— contesta siempre:
--
--     42501: permission denied for table client_consents
--
-- ── Lo que se veía en pantalla ─────────────────────────────────────────────
--
-- Las dos pantallas que leen ese estado se tragaban el error (`const { data } =
-- await supabase.rpc(...)`, sin mirar `error`) y se quedaban con `null`, que
-- significa «esta persona no ha consentido nunca». Consecuencias:
--
--   · En el portal, `Mis datos y privacidad` decía **«sin consentimiento»** con
--     chapa de aviso a todo el mundo, incluido quien acababa de aceptar en la
--     puerta treinta segundos antes.
--   · Y como el botón de RETIRAR solo se ofrece cuando consta el consentimiento,
--     nadie podía retirarlo. Un derecho del RGPD apagado por un permiso que
--     faltaba, sin un solo error visible.
--   · En la ficha del entrenador, `ClientDataPanel` decía lo mismo de todos sus
--     clientes.
--
-- `needs_consent` no lo sufría —es `SECURITY DEFINER`— y por eso la PUERTA
-- funcionaba bien: quien aceptaba, pasaba. El desacuerdo entre las dos era la
-- pista.
--
-- ══ Por qué el GRANT y no volver `consent_state` SECURITY DEFINER ══════════
--
-- Porque la política ya existe, ya dice exactamente quién puede leer qué, y está
-- escrita para ser el juez de esto. Con `SECURITY DEFINER` la función saltaría
-- RLS y tendría que repetir la regla por dentro: dos jueces del mismo hecho,
-- que es justo lo que la 0050 vino a quitar del consentimiento.
--
-- Se concede SOLO `SELECT`. La tabla sigue sin política de INSERT, UPDATE ni
-- DELETE, así que sigue siendo append-only y sigue escribiéndose únicamente
-- desde las funciones que corren como definidor. La prueba se puede leer; no se
-- puede fabricar ni editar.
--
-- Es idempotente: si el privilegio ya está, no cambia nada.
-- ============================================================================

BEGIN;

GRANT SELECT ON public.client_consents TO authenticated;

/* `anon` no. Nadie sin sesión tiene nada que preguntar aquí, y la política
   —que solo alcanza al rol `authenticated`— no le protegería. */
REVOKE ALL ON public.client_consents FROM anon;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- El privilegio, que tiene que decir `true`:
--
--   SELECT has_table_privilege('authenticated', 'public.client_consents', 'select');
--
-- Y de punta a punta, con la sesión de un cliente que ya aceptó:
--
--   select * from consent_state('<client_id>');
--   -- granted | 2026-08 | 2026-08-31 ...
--
-- Antes de esta migración, esa misma llamada devolvía 42501.
-- ============================================================================
