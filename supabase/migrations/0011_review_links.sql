-- ============================================================================
-- Revisiones compartibles: enlace que no caduca y saber si se ha visto
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Requiere desplegar también la función `review-link`.
--
-- ── El problema ─────────────────────────────────────────────────────────────
-- Los vídeos de revisión se comparten con una URL firmada de Storage. Eso tiene
-- dos defectos que los hacen inservibles como producto:
--
--   1. **Caducan.** Siete días. Un cliente que quiere volver a ver en marzo la
--      revisión de enero se encuentra un enlace muerto. Y es justo lo que hace
--      valioso el vídeo: que se pueda volver a él.
--   2. **No se sabe si lo ha visto.** Que es la mitad del valor de Loom, y aquí
--      son dos columnas.
--
-- ── Cómo se resuelve ────────────────────────────────────────────────────────
-- El enlace deja de apuntar al archivo y apunta a un TOKEN. El token vive en esta
-- tabla y no caduca; la URL firmada se genera al abrirlo, dura minutos y no se
-- comparte con nadie. Así el enlace es permanente y el archivo sigue privado.
--
-- Además el token se puede REVOCAR, que un enlace firmado no permite: una vez
-- reenviado a quien no debía, con Storage no hay marcha atrás hasta que caduca.
--
-- ── Por qué el token no es el id ────────────────────────────────────────────
-- Un uuid es adivinable en el sentido de que revela que es un uuid y de dónde
-- sale. El token se genera aparte y con más entropía, y así se puede rotar sin
-- tocar la fila ni perder el contador de visitas.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.review_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,

  -- Lo que viaja en la URL: /r/<token>
  token           text NOT NULL UNIQUE,
  -- Ruta del archivo en el bucket privado. Nunca sale de aquí.
  storage_path    text NOT NULL,

  title           text,
  -- Semana natural a la que pertenece la revisión, para encabezar la página.
  week_start      date,
  notes           text,

  created_by      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Revocar es poner una fecha aquí. No se borra la fila: se quiere conservar
  -- que existió y que se vio.
  revoked_at      timestamptz,

  -- Lo que el entrenador quiere saber.
  first_viewed_at timestamptz,
  last_viewed_at  timestamptz,
  view_count      integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS review_links_client_idx ON public.review_links (client_id, created_at DESC);

COMMIT;


-- ============================================================================
-- RLS
-- ----------------------------------------------------------------------------
-- El entrenador gestiona los enlaces de sus clientes. El público NO lee esta
-- tabla: quien abre /r/<token> pasa por la función `review-link`, que resuelve el
-- token con `service_role`. Si el anónimo pudiera consultar la tabla, podría
-- enumerarla.
-- ============================================================================

BEGIN;

ALTER TABLE public.review_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review_links_coach" ON public.review_links;
CREATE POLICY "review_links_coach" ON public.review_links
  FOR ALL TO authenticated
  USING (public.app_can_write_client(client_id))
  WITH CHECK (public.app_can_write_client(client_id));

-- El cliente ve los enlaces de sus propias revisiones desde su portal.
DROP POLICY IF EXISTS "review_links_client_read" ON public.review_links;
CREATE POLICY "review_links_client_read" ON public.review_links
  FOR SELECT TO authenticated USING (public.app_is_client(client_id));

COMMIT;


-- ============================================================================
-- Crear un enlace
-- ============================================================================

BEGIN;

/**
 * Crea el enlace de una revisión y devuelve su token.
 *
 * El token se genera en la base de datos y no en el cliente: así no depende de la
 * calidad del generador aleatorio del navegador y no hay forma de forzar un token
 * elegido a mano.
 *
 * 24 bytes en base64url son ~32 caracteres. Es lo bastante largo para que no se
 * pueda dar con uno probando, y lo bastante corto para caber en un mensaje.
 */
CREATE OR REPLACE FUNCTION public.create_review_link(
  target       uuid,
  path         text,
  link_title   text DEFAULT NULL,
  week         date DEFAULT NULL,
  link_notes   text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_token text;
BEGIN
  IF NOT public.app_can_write_client(target) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  -- El primer segmento de la ruta tiene que ser el cliente: es la misma regla que
  -- aplican las políticas de Storage, y comprobarla aquí evita crear un enlace
  -- público a un archivo de otro.
  IF split_part(path, '/', 1) IS DISTINCT FROM target::text THEN
    RAISE EXCEPTION 'Esa ruta no pertenece a ese cliente';
  END IF;

  new_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');

  INSERT INTO public.review_links (client_id, token, storage_path, title, week_start, notes, created_by)
  VALUES (target, new_token, path, link_title, week, link_notes, auth.uid());

  RETURN new_token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_review_link(uuid, text, text, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_review_link(uuid, text, text, date, text) TO authenticated;

COMMIT;

-- ============================================================================
-- Después de aplicarla
-- ----------------------------------------------------------------------------
--   npx supabase functions deploy review-link
--
-- La función se despliega con `verify_jwt = false` (ver supabase/config.toml)
-- porque tiene que responder a gente SIN sesión: es una página pública. Lo único
-- que hace sin autenticar es canjear un token por una URL firmada de minutos, y
-- solo si el token existe y no está revocado.
-- ============================================================================
