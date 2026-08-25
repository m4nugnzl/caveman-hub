-- ============================================================================
-- Lo que el cliente cuenta de sí mismo, en la ficha
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para los tres bloques nuevos de la ficha («Cómo entrena»,
--     «Cómo come» y «Su día»). Sin ella, guardar cualquiera de esos campos falla
--     con «Could not find the 'profile' column». Es ADITIVA: una columna que
--     nace vacía y ni un DROP.
--
-- ══ De dónde sale esto ═════════════════════════════════════════════════════
--
-- De un cuestionario de alta real, de trece páginas. Dentro había cuatro clases
-- de cosa distintas y solo una de ellas no tenía sitio en la aplicación:
--
--   1. Lo que YA tiene columna o tabla — peso, altura, nacimiento, teléfono,
--      lesiones y alergias (0077), objetivo, días de entrenamiento, fotos, y las
--      escalas del 1 al 10, que son las preguntas de `protocol.js`.
--   2. La NARRATIVA — doce meses de historia de peso, la dieta al decimal, la
--      rutina entera. Eso se queda en el PDF que cuelga del paso «Anamnesis», y
--      sus dos partes largas ya tienen importador (`PastePlanDialog`).
--   3. Lo que NO se guarda — el DNI. Hoy no lo usa nada, y es el dato que
--      convierte una filtración en una suplantación. Cuando la aplicación
--      facture, entrará como dato de FACTURACIÓN y no como dato de la persona.
--   4. Y esto: los quince o veinte HECHOS CORTOS que condicionan el plan y que
--      no caben en ningún sitio. Cuándo puede entrenar. Cuánto duerme. Dónde
--      entrena y con qué máquinas. Cuántas comidas hace y a qué hora. Qué otro
--      deporte practica. Si ha tenido entrenador antes.
--
-- Nada de eso decide nada solo. Lo lee el ENTRENADOR para montar el plan, que
-- es exactamente lo que es una ficha: un registro de la persona.
--
-- ══ Por qué un jsonb y no veinte columnas ══════════════════════════════════
--
-- Porque la lista NO está cerrada y no lo va a estar nunca. Cada entrenador
-- pregunta lo suyo: uno quiere saber el turno de trabajo, otro los kilómetros
-- que corre, otro si tiene hijos pequeños. Veinte columnas hoy son treinta el
-- mes que viene, y cada una con su migración.
--
-- Es el mismo razonamiento que hizo la 0060 con las respuestas del check-in:
-- «las preguntas las elige el entrenador y cambian cuando quiere; una tabla
-- normalizada obligaría a migrar cada vez que alguien añade una propia». Lo que
-- se guarda aquí es un mapa de id → valor, y la aplicación ignora las claves que
-- no conoce y rellena las que faltan (`domain/ficha.js`).
--
-- ── Y por qué NO va dentro de `clients.preferences`, que ya es un jsonb ─────
-- Por dos motivos, y los dos son concretos:
--
--   · `preferences` la escribe el propio CLIENTE a través de
--     `set_client_preferences` (0008), que recibe el objeto ENTERO. Esto son
--     datos que el entrenador registra sobre una persona; no comparten permiso.
--   · Esa columna tiene un tope de 8 KB COMPARTIDO entre cuatro sistemas —el
--     protocolo, el alta, el panel y el objetivo—. Meter aquí veinte campos de
--     texto es cómo el quinto rompe a los otros cuatro.
--
-- Y no se reutiliza ninguna columna existente con otro nombre. Ya hubo dos casos
-- así en este esquema (`meals` guardando el objetivo de los días de descanso,
-- `tag` guardando los metadatos de las fotos) y la 0005 dejó escrito que un
-- tercero convertiría el esquema en un acertijo. Esta columna se llama `profile`
-- y guarda el perfil.
--
-- ══ Lo que NO entra aquí, y conviene tenerlo escrito ═══════════════════════
--
-- Nada que EVOLUCIONE. El peso no, porque es una serie (`anthropometry`) y ya
-- costó una columna: la 0048 tuvo que borrar `current_weight` por enseñar el
-- valor congelado del día que se dejó de rellenar. Las lesiones tampoco, porque
-- son varias, tienen fechas y se resuelven — para eso está la 0077.
--
-- Aquí va lo que es verdad hoy y sigue siéndolo dentro de seis meses.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla clients.';
  END IF;
END $$;

BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_profile_check'
  ) THEN
    /*
      Objeto, y con tope.

      `clients` la escribe el entrenador con un UPDATE directo bajo RLS, así que
      no hay ninguna función donde comprobar lo que entra: si la comprobación no
      está en la columna, no está en ningún sitio.

      8 KB es el mismo tope que `preferences`, y aquí es cómodo de sobra: los
      diecinueve campos del catálogo, todos llenos y con los textos largos, no
      pasan de 2 KB. El resto es margen para los campos propios que vengan.

      `length(profile::text)` y no `pg_column_size`: un CHECK exige funciones
      inmutables y la segunda no lo es. La primera cuenta caracteres del JSON
      serializado, que para este propósito es la misma medida.
    */
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_profile_check
      CHECK (jsonb_typeof(profile) = 'object' AND length(profile::text) <= 8192);
  END IF;
END $$;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que la columna existe y nace vacía (todas las filas a `{}`):
--
--   SELECT count(*) FILTER (WHERE profile = '{}'::jsonb) AS vacias, count(*)
--   FROM public.clients;
--
-- Que el tope corta (tiene que dar error, no escribir):
--
--   UPDATE public.clients
--   SET profile = jsonb_build_object('x', repeat('a', 9000))
--   WHERE id = '<un-id>';
--
-- Que no admite cualquier cosa (también tiene que dar error):
--
--   UPDATE public.clients SET profile = '"hola"'::jsonb WHERE id = '<un-id>';
--
-- Desde la APLICACIÓN: Ficha → «Cómo entrena» → «Editar». Rellenar dos campos,
-- guardar y recargar. Los campos rellenados salen; los vacíos NO se pintan, que
-- es la regla de esta pantalla.
--
-- ── Sin aplicar ─────────────────────────────────────────────────────────────
-- Las consultas son `select('*')`, así que la columna llega `undefined` y el
-- mapeador la deja en `{}`: los tres bloques enseñan su estado vacío. Lo único
-- que falla es GUARDAR, y eso se ve con su aviso.
-- ============================================================================
