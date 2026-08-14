-- ============================================================================
-- Quien atiende soporte también puede abrir un ticket
-- ----------------------------------------------------------------------------
-- Corrige una política de `0034_support.sql`. No toca datos ni tablas.
--
-- ══ El fallo ═══════════════════════════════════════════════════════════════
--
-- La política de escritura de mensajes decía:
--
--     AND from_support = public.is_platform_admin()
--
-- La intención era buena: impedir que un entrenador se fabricara una respuesta
-- con sello oficial dentro de su propio hilo. Pero la condición es una IGUALDAD,
-- y eso obliga a que **todos** los mensajes de un administrador sean
-- `from_support = true` — incluido el primero de un ticket suyo, que se inserta
-- con `false` porque lo escribe como usuario, no como soporte.
--
-- Resultado: quien atiende la plataforma no puede abrir un ticket. El INSERT del
-- ticket entra (su política es otra) y el del primer mensaje se rechaza, así que
-- queda una fila huérfana sin conversación.
--
-- Y no es un caso de prueba: **atender el soporte no deja de convertirte en
-- entrenador con tu propia cuenta**. Si te tropiezas con un fallo usando la
-- aplicación, el sitio para escribirlo es este.
--
-- ══ La regla correcta ══════════════════════════════════════════════════════
--
-- No es una igualdad entre dos cosas, son dos permisos distintos según de qué
-- lado hables:
--
--   · **`from_support = true`** → hace falta ser administrador. Es lo que
--     protegía la versión anterior y se mantiene intacto: nadie se fabrica una
--     respuesta oficial.
--   · **`from_support = false`** → hace falta ser el DUEÑO del hilo. Esto además
--     aprieta lo que había: antes un administrador podía escribir en el hilo de
--     otro, y ahora solo puede hacerlo con su sello de soporte.
--
-- En los dos casos `author_id` sigue siendo quien llama, así que nadie escribe
-- en nombre de otro.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.support_messages') IS NULL THEN
    RAISE EXCEPTION 'Falta 0034_support.sql.';
  END IF;
END $$;

BEGIN;

DROP POLICY IF EXISTS "messages_write" ON public.support_messages;
CREATE POLICY "messages_write" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND CASE
      -- Hablando como soporte: solo soporte.
      WHEN from_support THEN public.is_platform_admin()
      -- Hablando como usuario: solo en tu propio hilo.
      ELSE EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.profile_id = auth.uid()
      )
    END
  );

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Desde la aplicación, con una cuenta que ESTÉ en `platform_admins`:
-- abrir un ticket en Ajustes › Ayuda tiene que funcionar y dejar el hilo con su
-- primer mensaje.
--
--   SELECT t.subject, count(m.id) AS mensajes
--   FROM public.support_tickets t
--   LEFT JOIN public.support_messages m ON m.ticket_id = t.id
--   GROUP BY t.id, t.subject;
--
-- Ningún ticket debe salir con 0 mensajes. Si alguno lo hace, es uno de los que
-- se quedaron huérfanos antes de esta migración:
--
--   DELETE FROM public.support_tickets t
--   WHERE NOT EXISTS (SELECT 1 FROM public.support_messages m WHERE m.ticket_id = t.id);
-- ============================================================================
