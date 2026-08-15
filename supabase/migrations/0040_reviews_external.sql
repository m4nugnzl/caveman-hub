-- ============================================================================
-- Una revisión puede vivir fuera: YouTube oculto o Loom
-- ----------------------------------------------------------------------------
-- Requiere `0011_review_links.sql`. Hace `storage_path` opcional, añade
-- `external_url`, y dos funciones. No toca ninguna política ni ningún dato.
--
-- ══ Por qué ═══════════════════════════════════════════════════════════════
--
-- El grabador propio escribe el vídeo en `client-media`, y ahí el problema no es
-- técnico sino aritmético: una revisión de 15 o 20 minutos —que es lo que dura
-- una de verdad— ocupa cientos de megas, se multiplica por cada cliente y por
-- cada semana, y no se libera nunca. Veinte clientes con revisión semanal son
-- más de 300 GB al año que hay que pagar todos los meses siguientes.
--
-- Un vídeo en YouTube oculto o en Loom **cuesta cero, no tiene techo de duración
-- y no hay que pagarlo cada mes**. La aplicación no necesita alojar el vídeo para
-- que la revisión sea suya: necesita saber que existe, de qué semana es, y si el
-- cliente la ha visto. Eso es esta tabla, y ya estaba escrita.
--
-- ── Lo que NO se retira ─────────────────────────────────────────────────────
-- El grabador se queda. Para una corrección de tres minutos grabada sobre la
-- hoja de la rutina sigue siendo mejor que abrir Loom: no hay que salir de la
-- aplicación ni pegar nada. Lo que cambia es que deja de ser la única forma.
--
-- Las dos conviven en la misma lista y en la misma pantalla del cliente, y por
-- eso van en la MISMA tabla y no en dos: para quien la mira son lo mismo —«la
-- revisión de la semana 7»— y separarlas obligaría a unir dos listas por fecha
-- en cada sitio que las enseñe.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.review_links') IS NULL THEN
    RAISE EXCEPTION 'Falta 0011_review_links.sql: no existe `review_links`.';
  END IF;
END $$;


-- ============================================================================
-- 1. La columna, y la regla de que sea una cosa o la otra
-- ============================================================================

BEGIN;

ALTER TABLE public.review_links
  ADD COLUMN IF NOT EXISTS external_url text;

ALTER TABLE public.review_links
  ALTER COLUMN storage_path DROP NOT NULL;

/*
  Exactamente una de las dos. Sin esta condición cabrían dos estados sin sentido:
  una revisión que no apunta a ninguna parte —una fila que el cliente ve en su
  lista y no puede abrir— y otra que apunta a dos sitios, donde cada pantalla
  elegiría uno y acabarían enseñando vídeos distintos.

  `NOT VALID` + `VALIDATE` en dos pasos para no bloquear la tabla mientras
  comprueba las filas que ya existen. Todas las cumplen —hasta hoy `storage_path`
  era obligatoria y `external_url` no existía— pero el patrón es el correcto y
  aquí no cuesta nada.
*/
ALTER TABLE public.review_links
  DROP CONSTRAINT IF EXISTS review_links_one_source;

ALTER TABLE public.review_links
  ADD CONSTRAINT review_links_one_source
  CHECK (num_nonnulls(storage_path, external_url) = 1) NOT VALID;

ALTER TABLE public.review_links VALIDATE CONSTRAINT review_links_one_source;

COMMIT;


-- ============================================================================
-- 2. Crear una revisión que vive fuera
-- ----------------------------------------------------------------------------
-- Función aparte y no un parámetro más en `create_review_link`: las dos
-- comprueban cosas distintas —aquella, que la ruta sea de ese cliente; esta, que
-- la dirección sea de un sitio conocido— y una sola función con las dos ramas
-- acabaría con la mitad de sus parámetros sin usar en cada llamada.
--
-- ── Por qué se restringe el dominio ────────────────────────────────────────
-- Porque esta URL acaba dentro de un `<iframe>` en el portal del cliente, y un
-- iframe ejecuta lo que haya al otro lado. Aceptar cualquier dirección sería
-- dejar que quien pueda escribir en un cliente le incruste lo que quiera en la
-- pantalla. La lista es corta a propósito: YouTube y Loom.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_review_url(
  target      uuid,
  url         text,
  link_title  text DEFAULT NULL,
  week        date DEFAULT NULL,
  link_notes  text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_token text;
  limpio    text := btrim(url);
BEGIN
  IF NOT public.app_can_write_client(target) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  /*
    Se comprueba el ORIGEN completo, no que la cadena «contenga» youtube: con un
    `LIKE '%youtube.com%'` colaría `https://malo.com/?x=youtube.com`. El patrón
    ancla el principio de la URL y el punto que separa el dominio.
  */
  IF limpio !~ '^https://(www\.)?(youtube\.com|youtu\.be|loom\.com|www\.loom\.com)/' THEN
    RAISE EXCEPTION 'Solo se admiten enlaces de YouTube o de Loom';
  END IF;

  IF length(limpio) > 500 THEN
    RAISE EXCEPTION 'Ese enlace es demasiado largo';
  END IF;

  new_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');

  INSERT INTO public.review_links
    (client_id, token, storage_path, external_url, title, week_start, notes, created_by)
  VALUES
    (target, new_token, NULL, limpio, link_title, week, link_notes, auth.uid());

  RETURN new_token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_review_url(uuid, text, text, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_review_url(uuid, text, text, date, text) TO authenticated;

COMMIT;


-- ============================================================================
-- 3. Que el cliente marque que la ha visto
-- ----------------------------------------------------------------------------
-- Hasta ahora las visitas las contaba la función `review-link`, que es por donde
-- pasa quien abre `/r/<token>` sin sesión. Con la revisión DENTRO del portal ese
-- camino no se usa, así que el contador se quedaría a cero justo cuando el
-- cliente sí la está viendo — y «visto el 15 de agosto» es la única señal que le
-- llega de vuelta al entrenador.
--
-- Va por función y no por una política de UPDATE porque RLS filtra filas y no
-- columnas: con permiso para actualizar su fila, el cliente podría reescribir el
-- título, la semana o la dirección del vídeo. Es la misma decisión, por el mismo
-- motivo, que `submit_check_in` en la 0009.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_review_viewed(link uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner uuid;
BEGIN
  SELECT client_id INTO owner FROM public.review_links WHERE id = link;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'Esa revisión no existe';
  END IF;

  -- El propio cliente o quien pueda escribir sobre él. Que el entrenador también
  -- pueda es intencionado: al probar el portal de su cliente no debe reventar.
  IF NOT (public.app_is_client(owner) OR public.app_can_write_client(owner)) THEN
    RAISE EXCEPTION 'No tienes permiso sobre esa revisión';
  END IF;

  UPDATE public.review_links
  SET first_viewed_at = COALESCE(first_viewed_at, now()),
      last_viewed_at  = now(),
      view_count      = COALESCE(view_count, 0) + 1
  WHERE id = link
    AND revoked_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_review_viewed(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_review_viewed(uuid) TO authenticated;

COMMIT;


-- ============================================================================
-- 4. Y el bucket se aprieta
-- ----------------------------------------------------------------------------
-- La 0038 lo subió a 120 MB para que cupiera una revisión larga. Con las largas
-- fuera y el grabador limitando la calidad (`lib/useReviewRecorder`), 120 MB solo
-- sirven ya para una cosa: que una FOTO de progreso pueda pesar 120 MB, y las
-- fotos las sube el cliente desde el móvil.
--
-- 80 MB dan para unos doce minutos de grabación propia con la calidad limitada,
-- que es de sobra para lo que se graba dentro de la aplicación, y cierran esa
-- puerta. El tope es del bucket entero: no hay forma de poner uno por carpeta sin
-- duplicar el bucket y sus cuatro políticas.
-- ============================================================================

BEGIN;

UPDATE storage.buckets
SET file_size_limit = 83886080                                            -- 80 MB
WHERE id = 'client-media';

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT id, external_url IS NOT NULL AS es_externa, storage_path, title
--   FROM public.review_links ORDER BY created_at DESC LIMIT 10;
--
--   SELECT file_size_limit FROM storage.buckets WHERE id = 'client-media';
--   -- 83886080
--
-- Que la regla de «una cosa o la otra» está puesta:
--
--   SELECT conname FROM pg_constraint WHERE conname = 'review_links_one_source';
--
-- Y desde la APLICACIÓN: ficha de un cliente → pegar un enlace de YouTube oculto
-- como revisión. Tiene que aparecer incrustado en el portal del cliente, y al
-- abrirlo el contador de visitas del entrenador tiene que subir.
-- ============================================================================
