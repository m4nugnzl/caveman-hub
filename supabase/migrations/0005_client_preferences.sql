-- ============================================================================
-- Preferencias por cliente
-- ----------------------------------------------------------------------------
-- ⚠️  ESTA SÍ ES NECESARIA. Sin ella, guardar las preferencias del panel falla
--     con «Could not find the 'preferences' column», visible en la interfaz.
--     Es aditiva y no toca ningún dato existente.
--
-- ── Por qué una columna y no localStorage ───────────────────────────────────
-- Las preferencias son del CLIENTE, no del dispositivo: si el cliente entra desde
-- el móvil y desde el portátil tiene que ver su panel igual, y si cambia de
-- teléfono no debería perder su configuración. `localStorage` no cumple ninguna
-- de las dos cosas.
--
-- Tampoco se reutiliza una columna jsonb existente. Ya hay dos sitios donde se
-- guarda algo distinto de lo que dice su nombre (`meals` para el objetivo de los
-- días de descanso, `tag` para los metadatos de las fotos), y añadir un tercero
-- convertiría el esquema en un acertijo.
--
-- ── Qué guarda ──────────────────────────────────────────────────────────────
--   {
--     "dashboard": {
--       "widgets": ["weight", "tonnage", "sets", "kcals"],   -- KPIs visibles y su orden
--       "cards":   ["weightTrend", "tonnageTrend"],          -- gráficos visibles
--       "showMetricList": true
--     }
--   }
--
-- El objeto es abierto a propósito: la aplicación ignora las claves que no
-- conoce y aplica valores por defecto a las que falten, de modo que se pueden
-- añadir preferencias nuevas sin migrar otra vez.
-- ============================================================================

BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;

-- ── Nota sobre RLS: solo si has aplicado 0002_rls_hardening.sql ─────────────
-- En ese caso el cliente tiene `clients` en SOLO LECTURA y no podrá guardar sus
-- propias preferencias (verá «No se guardó» con su botón de reintentar). Para
-- permitírselo, ejecuta también esto:
--
--   CREATE POLICY "clients_self_prefs" ON public.clients
--     FOR UPDATE TO authenticated
--     USING (client_profile_id = auth.uid())
--     WITH CHECK (client_profile_id = auth.uid());
--
-- Qué concede exactamente: el cliente puede escribir en SU PROPIA fila. RLS es
-- por filas, no por columnas, así que técnicamente eso incluye `payment_status` y
-- compañía —vuelve a abrir el agujero que 0002 cierra—. El candado por columna
-- (`REVOKE UPDATE ... GRANT UPDATE (preferences) ...`) no sirve aquí, porque el
-- coach y el cliente usan el MISMO rol de Postgres (`authenticated`) y un GRANT no
-- distingue entre ellos: lo que se le quita a uno se le quita al otro.
--
-- Las dos salidas limpias, en orden de esfuerzo:
--   a) Que las preferencias las guarde solo el ENTRENADOR (no añadas la política).
--      La personalización sigue funcionando desde su panel, y es donde más se va a
--      usar. Es lo que recomiendo hasta la fase de equipos.
--   b) Una función `SECURITY DEFINER` que reciba el JSON, compruebe
--      `client_profile_id = auth.uid()` y escriba solo esa columna. Es la solución
--      correcta y son quince líneas, pero obliga a que la app llame a un RPC en
--      lugar de a un UPDATE.
