-- ============================================================================
-- Quién cambió qué, y cuándo
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. No toca ninguna tabla, ninguna columna ni ninguna política
--     existente: añade una tabla y unos disparadores.
--
--     La aplicación funciona SIN esta migración, como con la 0009 y la 0016: si
--     la tabla no existe, la ficha del cliente no enseña el historial de cambios
--     y el resto va igual.
--
-- ══ Qué resuelve ════════════════════════════════════════════════════════════
--
-- Hoy nadie sabe quién cambió el plan de un cliente, ni cuándo, ni qué había
-- antes. Con un entrenador solo es un inconveniente. Con un equipo es un problema
-- de responsabilidad: dos personas escriben sobre el mismo cliente y no hay forma
-- de saber quién hizo qué. Y ante una reclamación de un cliente —«yo no tenía
-- programado eso»— es la palabra de uno contra la del otro.
--
-- ══ Por qué NO se guarda el contenido ═══════════════════════════════════════
--
-- Se registra `(tabla, cliente, quién, cuándo, qué operación)` y nada más. No se
-- guarda el jsonb anterior, y es una decisión, no una simplificación:
--
--   · TAMAÑO. El programa de un cliente son varios MB y se reescribe entero en
--     cada guardado con debounce. Guardar una copia por escritura multiplicaría la
--     base de datos por cien en un mes, y el 99 % serían versiones intermedias de
--     alguien tecleando «102.5».
--
--   · DATOS PERSONALES. Un historial con el contenido convierte el «bórrame todo»
--     del RGPD en «bórrame todo y además todas las copias», y la de auditoría es
--     justo la que uno quiere conservar. Con solo metadatos, el registro no
--     contiene datos de salud y el conflicto desaparece.
--
-- Para «¿qué había antes?» la respuesta correcta es la copia de seguridad
-- (Ajustes → Copia de seguridad), no un histórico infinito.
--
-- ══ Coste ═══════════════════════════════════════════════════════════════════
--
-- Una fila de ~60 bytes por guardado. El debounce de la aplicación agrupa las
-- ráfagas de tecleo, así que una sesión de programación de media hora deja
-- decenas de filas, no miles. Aun así conviene podarlo: ver el bloque final.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text        NOT NULL,
  client_id  uuid        NOT NULL,
  -- Quién. `NULL` si la escritura no vino de una sesión con usuario (una función
  -- del sistema, una migración, la consola de Supabase).
  actor      uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  action     text        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  at         timestamptz NOT NULL DEFAULT now()
);

-- El índice es por cliente y fecha descendente porque la única consulta que se
-- hace es «los últimos cambios de este cliente».
CREATE INDEX IF NOT EXISTS audit_log_client_idx ON public.audit_log (client_id, at DESC);

COMMENT ON TABLE public.audit_log IS
  'Metadatos de cada escritura sobre los bloques de un cliente. No guarda el '
  'contenido: ver la cabecera de la migración 0017.';

COMMIT;


-- ============================================================================
-- El disparador
-- ============================================================================

BEGIN;

/**
 * Registra la escritura. `SECURITY DEFINER` porque el disparador tiene que poder
 * insertar en `audit_log` aunque quien escribe no tenga permiso sobre esa tabla
 * —que es justamente lo que se quiere: se puede generar el registro, no se puede
 * fabricar ni borrar.
 *
 * Es AFTER y devuelve NULL: no modifica la fila que se está escribiendo.
 *
 * ── Por qué no falla nunca ──────────────────────────────────────────────────
 * Si la auditoría diera error, tumbaría la escritura del entrenador. Un registro
 * de auditoría es importante; perder el trabajo de alguien porque el registro
 * falló lo es más. Por eso el INSERT va dentro de un bloque que traga la
 * excepción.
 */
CREATE OR REPLACE FUNCTION public.log_client_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO public.audit_log (table_name, client_id, actor, action)
    VALUES (
      TG_TABLE_NAME,
      COALESCE(NEW.client_id, OLD.client_id),
      auth.uid(),
      TG_OP
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- la auditoría no puede impedir que alguien guarde su trabajo
  END;

  RETURN NULL;
END;
$$;

-- Las cuatro tablas donde vive el trabajo. `progress_photos` queda fuera: subir
-- y borrar una foto ya deja rastro en el propio almacenamiento, y el volumen de
-- filas no compensa.
DROP TRIGGER IF EXISTS audit_workout_data ON public.workout_data;
CREATE TRIGGER audit_workout_data
  AFTER INSERT OR UPDATE OR DELETE ON public.workout_data
  FOR EACH ROW EXECUTE FUNCTION public.log_client_change();

DROP TRIGGER IF EXISTS audit_anthropometry ON public.anthropometry;
CREATE TRIGGER audit_anthropometry
  AFTER INSERT OR UPDATE OR DELETE ON public.anthropometry
  FOR EACH ROW EXECUTE FUNCTION public.log_client_change();

DROP TRIGGER IF EXISTS audit_nutrition_plans ON public.nutrition_plans;
CREATE TRIGGER audit_nutrition_plans
  AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_plans
  FOR EACH ROW EXECUTE FUNCTION public.log_client_change();

-- Solo si la 0009 está aplicada.
DO $$
BEGIN
  IF to_regclass('public.check_ins') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS audit_check_ins ON public.check_ins;
    CREATE TRIGGER audit_check_ins
      AFTER INSERT OR UPDATE OR DELETE ON public.check_ins
      FOR EACH ROW EXECUTE FUNCTION public.log_client_change();
  END IF;
END;
$$;

COMMIT;


-- ============================================================================
-- RLS: se lee, no se escribe
-- ============================================================================

BEGIN;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Quien puede leer al cliente puede leer su traza. NO hay política de INSERT,
-- UPDATE ni DELETE: con RLS activo y sin política, nadie puede escribir por la
-- API. Solo entra el disparador, que corre como definidor.
--
-- Eso es lo que hace que el registro valga algo: un historial que el propio
-- interesado puede editar no prueba nada.
DROP POLICY IF EXISTS "audit_read" ON public.audit_log;
CREATE POLICY "audit_read" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id));

COMMIT;


-- ============================================================================
-- Poda — opcional, y recomendable
-- ----------------------------------------------------------------------------
-- La traza crece con cada guardado. Un año de trabajo con veinte clientes son
-- decenas de miles de filas: poco para Postgres, pero no hay motivo para
-- guardarla entera para siempre.
--
-- Doce meses cubre lo que se necesita —una reclamación se resuelve en semanas— y
-- coincide con lo que se suele conservar de un contrato. Ejecútalo a mano de vez
-- en cuando, o prográmalo con pg_cron si tu plan lo incluye:
--
--   DELETE FROM public.audit_log WHERE at < now() - interval '12 months';
-- ============================================================================
