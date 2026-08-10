-- ============================================================================
-- Guardar las preferencias del panel sin abrir la fila entera
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA. La aplicación llama a esta función para guardar la
--     personalización del resumen. Sin ella verás «No se guardó» con su botón de
--     reintentar. Requiere que la columna exista (0005).
--
-- ── El problema que resuelve ────────────────────────────────────────────────
-- `0002_rls_hardening.sql` deja `clients` en SOLO LECTURA para el cliente, y con
-- razón: RLS filtra FILAS, no columnas, así que darle UPDATE sobre su propia fila
-- le devuelve el poder de ponerse `payment_status = 'paid'` o reasignarse de
-- entrenador. Los tres agujeros que 0002 cierra volverían a abrirse.
--
-- El candado por columna (`REVOKE UPDATE … GRANT UPDATE (preferences) …`) no
-- sirve: el entrenador y el cliente usan el MISMO rol de Postgres
-- (`authenticated`), y un GRANT no distingue entre ellos. Lo que se le quita a
-- uno se le quita al otro.
--
-- ── La solución ─────────────────────────────────────────────────────────────
-- Una función `SECURITY DEFINER` que escribe EXACTAMENTE una columna después de
-- comprobar quién llama. El permiso deja de ser «puede escribir en esta fila» y
-- pasa a ser «puede hacer esta operación concreta», que es lo que de verdad se
-- quiere conceder.
--
-- Vale para los dos: el entrenador configura el panel de su cliente y el cliente
-- lo adapta a su gusto, cada uno por el mismo camino.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_client_preferences(target uuid, prefs jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- La función es invocable directamente con la anon key, así que no puede
  -- confiar en que la aplicación haya mandado algo sensato.
  IF jsonb_typeof(prefs) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Las preferencias tienen que ser un objeto JSON';
  END IF;

  -- Tope de tamaño: sin él, cualquiera con la anon key podría engordar la fila de
  -- un cliente hasta donde quisiera. Las preferencias reales ocupan ~200 bytes.
  IF pg_column_size(prefs) > 8192 THEN
    RAISE EXCEPTION 'Las preferencias son demasiado grandes';
  END IF;

  UPDATE public.clients
  SET preferences = prefs
  WHERE id = target
    AND (coach_id = auth.uid() OR client_profile_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar las preferencias de ese cliente';
  END IF;
END;
$$;

-- `SECURITY DEFINER` corre con los privilegios del dueño, así que el EXECUTE se
-- concede a mano y solo a usuarios autenticados. `public` incluiría a `anon`.
REVOKE ALL ON FUNCTION public.set_client_preferences(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.set_client_preferences(uuid, jsonb) TO authenticated;

COMMIT;

-- ── Nota para cuando existan equipos (0006) ────────────────────────────────
-- La condición pasa a ser:
--   AND (public.can_write_client(target) OR client_profile_id = auth.uid())
-- y no hay que tocar nada más: la aplicación llama igual.
