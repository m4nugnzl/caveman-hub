-- ============================================================================
-- Quién escribió el programa
-- ----------------------------------------------------------------------------
-- Añade UNA columna y nada más. Sin trigger: ese es la 0131, que se aplica
-- DESPUÉS de publicar la versión de la app que rellena esta columna.
--
-- ══ Para qué ═══════════════════════════════════════════════════════════════
--
-- Una pestaña abierta —o la PWA del teléfono— sigue ejecutando la versión de
-- la app que cargó aunque se publique otra, y el entrenador guarda el programa
-- ENTERO en cada escritura. Una versión vieja lo reescribía con sus reglas
-- encima de lo que había dejado la nueva. La app ya se entera y deja de
-- guardar (`src/lib/version.js`), pero solo la que tiene ese código: las que
-- ya están abiertas hoy no lo tienen.
--
-- Para pararlas hace falta distinguir en el servidor quién escribe. Desde esta
-- versión, cada guardado del programa lleva en `escrito_por` su build y algo
-- que no se repite (`firmaDeEscritura`). Una versión anterior no conoce la
-- columna, así que su UPDATE la deja como estaba: eso es lo que mirará la 0131.
--
-- Nullable y sin valor por defecto: las filas de hoy se quedan en NULL hasta
-- su próximo guardado, y una versión vieja puede seguir escribiendo mientras
-- no exista la 0131. Por los permisos no hay que hacer nada: la 0046 los da
-- sobre la tabla entera, columnas nuevas incluidas.
-- ============================================================================

ALTER TABLE public.workout_data ADD COLUMN IF NOT EXISTS escrito_por text;

COMMENT ON COLUMN public.workout_data.escrito_por IS
  'Firma de la última escritura del programa desde la app: build y un valor que no se repite. La 0131 rechaza un cambio del plan que no la cambie.';
