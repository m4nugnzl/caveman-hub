-- ============================================================================
-- Tu voz en el ejercicio (el Taller · movimiento 3)
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y sin riesgo: tres columnas nuevas en `exercises`, la biblioteca
--     del EQUIPO. No toca el catálogo, ni permisos, ni ninguna rutina.
--
-- ══ Y esto contradice a la 0094, así que se explica ═════════════════════════
--
-- La 0094 dejó escrito que «la biblioteca del entrenador NO gana columnas: la
-- ficha es del catálogo, y quien quiera leerla la busca por nombre». Esa regla
-- se mantiene entera para lo que decía: `equipment` y `description` son datos de
-- REFERENCIA —el press banca necesita una barra en todas las bibliotecas del
-- mundo— y copiarlos aquí sería repartir mil copias del mismo hecho.
--
-- Lo que se añade abajo no es eso. Es la capa del ENTRENADOR, que el catálogo no
-- puede tener porque no es un hecho del ejercicio, es un hecho suyo:
--
--   · `video_url`     el vídeo en el que ÉL lo explica. Un enlace (YouTube,
--                     Drive, Vimeo), nunca un fichero: subir vídeo es
--                     almacenamiento, moderación y copias de seguridad a cambio
--                     de nada que un enlace no dé. Es la decisión del dueño del
--                     8 sep — «sí, pero eso ha de poder decidirlo él».
--   · `cue`           lo que le dice siempre al cliente delante de la máquina:
--                     «que no rebote», «si el hombro molesta, cierra un dedo el
--                     agarre». Su criterio, en una línea.
--   · `alternatives`  con qué se cambia cuando el gimnasio está lleno o la
--                     máquina no está. Nombres, no ids: apuntan a la misma
--                     lista mezclada (biblioteca + catálogo) en la que se
--                     escriben, y un id obligaría a decidir de cuál de las dos.
--
-- Las tres son opcionales y NULL significa «no dice», que es la verdad de todas
-- las filas de hoy. Un ejercicio sin enlace no enseña ningún vídeo: si no lo
-- pone el entrenador, no existe.
--
-- ── Por qué en la biblioteca del equipo y no en la del entrenador ──────────
-- Porque desde la 0006 la biblioteca ES del equipo, y sus políticas ya dicen
-- quién puede escribir. Si dos entrenadores del mismo equipo comparten el
-- «Press banca», comparten también el vídeo con el que lo explican — que es
-- justo lo que un equipo quiere. Quién puede corregir la fila lo sigue
-- decidiendo el producto (`canEditLibraryItem`), como hasta ahora.
-- ============================================================================

BEGIN;

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS cue text;

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS alternatives text[] NOT NULL DEFAULT '{}';

COMMIT;
