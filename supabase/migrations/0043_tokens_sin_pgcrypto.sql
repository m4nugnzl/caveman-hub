-- ============================================================================
-- Los tokens de revisión: «function gen_random_bytes(integer) does not exist»
-- ----------------------------------------------------------------------------
-- Requiere `0011_review_links.sql` y `0040_reviews_external.sql`. Redefine DOS
-- funciones. No toca tablas, ni políticas, ni datos, ni firmas.
--
-- ══ El fallo ═══════════════════════════════════════════════════════════════
--
-- Las dos funciones que crean un enlace de revisión generan su token así:
--
--     new_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
--
-- Y `gen_random_bytes` **no es de Postgres: es de la extensión pgcrypto**, que en
-- Supabase vive en el esquema `extensions`. Como las dos funciones se declaran
-- con `SET search_path = public` —lo correcto para una `SECURITY DEFINER`, que no
-- debe resolver nombres por el camino de quien llama—, ese esquema no está en la
-- ruta y Postgres contesta que la función no existe.
--
-- Consecuencia: **no se ha podido crear nunca un enlace de revisión**, ni el de
-- un vídeo grabado aquí (0011) ni el de uno de YouTube o Loom (0040).
--
-- ══ El arreglo, y por qué no es añadir `extensions` al search_path ═════════
--
-- Se podría escribir `SET search_path = public, extensions`. Funciona, y ata
-- estas dos funciones a que pgcrypto esté instalada y siga en ese esquema —dos
-- cosas que dependen de cómo esté montado el proyecto y que no se ven desde aquí
-- cuando dejan de ser ciertas.
--
-- `gen_random_uuid()` es del núcleo desde PostgreSQL 13, no necesita extensión
-- ninguna y usa el mismo generador criptográfico. Dos UUID sin guiones son 64
-- caracteres hexadecimales: 244 bits de entropía, muy por encima de los 192 que
-- daban los 24 bytes de antes.
--
-- Se conserva lo que importaba de la decisión original: **el token lo genera la
-- base de datos y no el navegador**, así que no depende de la calidad de su
-- generador aleatorio ni se puede forzar uno elegido a mano.
--
-- ── Y esto no es una decisión nueva ─────────────────────────────────────────
-- La migración **0015** se encontró este mismo fallo con los enlaces de
-- invitación y lo resolvió así, con su razonamiento escrito al lado. Lo que pasó
-- es que la 0011 —anterior— se quedó como estaba, y la 0040 copió de ella en vez
-- de copiar de la 0015. Ahora las tres generan sus tokens igual.
--
-- ── Los tokens ya creados siguen valiendo ───────────────────────────────────
-- Esto solo cambia cómo se generan los nuevos. Un token es una cadena opaca y
-- nadie comprueba su forma: los antiguos —si alguno llegó a existir— siguen
-- resolviendo igual.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.review_links') IS NULL THEN
    RAISE EXCEPTION 'Falta 0011_review_links.sql: no existe `review_links`.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'review_links' AND column_name = 'external_url'
  ) THEN
    RAISE EXCEPTION 'Falta 0040_reviews_external.sql: no existe `review_links.external_url`.';
  END IF;
END $$;

BEGIN;

/*
  El token, en un solo sitio.

  Estaba escrito dos veces —una en cada función— y por eso el fallo estaba
  duplicado. Con una función propia, el día que haya que cambiar cómo se genera
  se cambia aquí y no en los dos sitios donde uno se olvida.

  `IMMUTABLE` no: devuelve algo distinto en cada llamada. `VOLATILE` (el valor por
  defecto) es lo correcto, y además impide que el planificador se plantee
  reutilizar el resultado.
*/
CREATE OR REPLACE FUNCTION public.new_review_token()
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

REVOKE ALL ON FUNCTION public.new_review_token() FROM public;

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

  new_token := public.new_review_token();

  INSERT INTO public.review_links (client_id, token, storage_path, title, week_start, notes, created_by)
  VALUES (target, new_token, path, link_title, week, link_notes, auth.uid());

  RETURN new_token;
END;
$$;

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

  -- Se comprueba el ORIGEN completo, no que la cadena «contenga» youtube: con un
  -- `LIKE '%youtube.com%'` colaría `https://malo.com/?x=youtube.com`.
  IF limpio !~ '^https://(www\.)?(youtube\.com|youtu\.be|loom\.com|www\.loom\.com)/' THEN
    RAISE EXCEPTION 'Solo se admiten enlaces de YouTube o de Loom';
  END IF;

  IF length(limpio) > 500 THEN
    RAISE EXCEPTION 'Ese enlace es demasiado largo';
  END IF;

  new_token := public.new_review_token();

  INSERT INTO public.review_links
    (client_id, token, storage_path, external_url, title, week_start, notes, created_by)
  VALUES
    (target, new_token, NULL, limpio, link_title, week, link_notes, auth.uid());

  RETURN new_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_review_link(uuid, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_review_url(uuid, text, text, date, text) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que el token sale (64 caracteres hexadecimales):
--
--   SELECT public.new_review_token();
--
-- Y desde la APLICACIÓN, que es donde fallaba:
--
--   · Histórico de revisiones → «Enlazar vídeo» con una dirección de YouTube.
--   · Estudio de fotos → un vídeo grabado → «Crear enlace».
--
-- Los dos devolvían «function gen_random_bytes(integer) does not exist». Ahora
-- tienen que crear la fila y devolver su token:
--
--   SELECT token, storage_path, external_url, week_start
--   FROM public.review_links ORDER BY created_at DESC LIMIT 5;
--
-- ── Si alguna vez se quiere volver a pgcrypto ───────────────────────────────
-- Haría falta instalarla y nombrarla explícitamente —`extensions.gen_random_bytes`—
-- o añadir su esquema al `search_path` de la función. No hace falta: esto no
-- depende de ninguna extensión.
-- ============================================================================
