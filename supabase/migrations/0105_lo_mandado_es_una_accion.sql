-- ============================================================================
-- Lo que le mandas a alguien es una ACCIÓN, no un formulario
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para mandar algo que no sea un cuestionario. Sin ella, la
--     aplicación se comporta exactamente como antes.
--
-- ══ El problema que resuelve ═══════════════════════════════════════════════
--
-- La 0099 le dio entrega al formulario suelto y con eso lo convirtió en la única
-- acción de primera clase del producto: tiene fecha (`due`), estado
-- (`submitted_at`), agrupación (`envio_id`) e historia (el esquema congelado).
-- Todo lo demás que un entrenador le manda a alguien —un vídeo, un documento,
-- «mándame la foto de tu báscula»— se escribe como un paso del ALTA, dentro de
-- `clients.preferences.intake.custom`, y de ahí salen cinco averías que no son
-- de pantalla sino de sitio:
--
--   1. No tiene «cuándo». La fecha se pregunta en el asistente y se descarta.
--   2. Cae en la lista del alta, así que un vídeo mandado en el mes ocho le
--      reabre el onboarding al cliente.
--   3. Un paso propio nace del lado del ENTRENADOR (`stepOwner` cae a `coach`),
--      así que «mándame el vídeo de tu sentadilla» no se lo pide a nadie.
--   4. Caben seis por cliente, y comparten los 8 KB de `preferences` (0008).
--   5. Se guarda por `saveClientException`, o sea que mandar un vídeo DECLARA
--      excepción de protocolo y saca a esa persona de los «poner al día»
--      futuros. Un efecto que nadie relacionaría con haber mandado un vídeo.
--
-- La quinta es la que decide la forma: un envío no tiene nada que ver con el
-- protocolo de esa persona, y mientras se escriba en sus preferencias lo va a
-- parecer.
--
-- ══ Lo que hace esta migración ═════════════════════════════════════════════
--
-- `client_forms` pasa a llamarse `client_actions` y gana `tipo`, `link` y
-- `body`. El formulario deja de ser el caso especial y pasa a ser un tipo más:
-- los cuatro comparten fecha, estado, agrupación y mensaje, y solo el formulario
-- usa `schema`/`answers`.
--
-- El nombre no es cosmética: una tabla llamada «formularios» que guarda vídeos
-- vuelve a poner el formulario en el centro, que es justo el vicio que esto
-- viene a quitar. En el navegador solo la nombra `context/useEnvios.js`.
--
-- ══ Lo que esta migración NO hace ══════════════════════════════════════════
--
-- No mueve nada de lo que ya está escrito en `intake.custom` de clientes vivos.
-- Se sigue leyendo desde donde está y lo nuevo va por el carril nuevo, que es el
-- mismo criterio que tomó la 0099 con el check-in y el parte: no se migran datos
-- a cambio de elegancia.
--
-- Tampoco deshace las marcas de excepción que ya se hayan escrito por haber
-- mandado algo. Distinguir cuáles vinieron de un envío y cuáles de un cambio de
-- verdad sería adivinar, y equivocarse significa que el siguiente «aplicar a
-- todos» le pisa a alguien un protocolo hecho a mano. Se corrigen una a una
-- desde la ficha, que ya sabe hacerlo.
--
-- Y la casilla privada del entrenador («repasar su vídeo el jueves») NO entra
-- aquí: se va a `client_events`, que ya tiene fecha, agenda y bandeja. Va en su
-- propia migración porque toca una política de lectura y eso se despliega solo.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'Falta el esquema base: no existe `clients`.';
  END IF;
  /*
    `to_regprocedure` y no `to_regproc`: el primero entiende la firma con sus
    argumentos y el segundo devuelve NULL en cuanto ve un paréntesis, así que la
    guarda saltaría siempre. Está avisado en la 0027 y en la 0099.
  */
  IF to_regprocedure('public.app_can_write_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existen los ayudantes de RLS.';
  END IF;
END $$;

BEGIN;

-- ── 1. La mudanza del nombre ────────────────────────────────────────────────
--
-- Las políticas, los índices y la restricción única siguen a la tabla en un
-- `RENAME`, pero se quedan con el nombre viejo. Se renombran también: un índice
-- llamado `client_forms_envio_idx` sobre una tabla de acciones es una pista
-- falsa para el siguiente que abra el esquema.

DO $$
BEGIN
  IF to_regclass('public.client_actions') IS NULL
     AND to_regclass('public.client_forms') IS NOT NULL THEN
    ALTER TABLE public.client_forms RENAME TO client_actions;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_forms_una_por_envio') THEN
      ALTER TABLE public.client_actions
        RENAME CONSTRAINT client_forms_una_por_envio TO client_actions_una_por_envio;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_forms_client_id_fkey') THEN
      ALTER TABLE public.client_actions
        RENAME CONSTRAINT client_forms_client_id_fkey TO client_actions_client_id_fkey;
    END IF;

    ALTER INDEX IF EXISTS public.client_forms_pkey RENAME TO client_actions_pkey;
    ALTER INDEX IF EXISTS public.client_forms_client_idx RENAME TO client_actions_client_idx;
    ALTER INDEX IF EXISTS public.client_forms_envio_idx RENAME TO client_actions_envio_idx;
  END IF;
END $$;

-- ── 2. Y si la 0099 nunca llegó a aplicarse, la tabla nace ya con su forma ──

CREATE TABLE IF NOT EXISTS public.client_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /*
    De qué envío viene. Un «envío» —«esto, a estos cinco, hoy»— no tiene tabla
    propia a propósito: sería una cabecera que repite lo que sus filas ya dicen y
    que se desincronizaría en cuanto alguien borrara una. Se agrupa al leer.
  */
  envio_id     uuid NOT NULL,

  client_id    uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,

  /*
    De qué formulario de la biblioteca salió. Sin clave foránea y anulable: la
    biblioteca vive en un JSONB, y borrar un formulario no puede llevarse por
    delante lo que la gente ya contestó. En las acciones que no son formulario
    va en blanco.
  */
  form_id      text,

  -- Cómo se llamaba el día que se mandó. Renombrarlo después no reescribe la
  -- historia.
  title        text NOT NULL,

  schema       jsonb NOT NULL DEFAULT '{}'::jsonb,
  answers      jsonb,
  due          date,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,

  CONSTRAINT client_actions_una_por_envio UNIQUE (envio_id, client_id)
);

CREATE INDEX IF NOT EXISTS client_actions_client_idx
  ON public.client_actions (client_id, submitted_at);
CREATE INDEX IF NOT EXISTS client_actions_envio_idx
  ON public.client_actions (envio_id);

-- ── 3. Las tres columnas que convierten la tabla en lo que dice su nombre ───

ALTER TABLE public.client_actions
  /*
    Qué clase de acción es.

      · `form`       — le pides que conteste. Usa `schema` y `answers`.
      · `documento`  — le das algo que abrir (un PDF, una hoja, un enlace).
      · `video`      — igual, y se distingue del documento solo para poder
                       decirlo con su palabra y su icono: «mira este vídeo» y
                       «léete esto» no son el mismo recado.
      · `pide`       — le pides algo que no es un cuestionario. La marca él.

    `DEFAULT 'form'` no es un valor por comodidad: es lo que hace que todas las
    filas que ya existen queden bien clasificadas sin tocarlas, porque hasta hoy
    lo único que cabía aquí eran formularios.
  */
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'form',

  -- Lo que se abre. Solo `documento` y `video`.
  ADD COLUMN IF NOT EXISTS link text,

  /*
    El recado que acompaña a la acción: «esto es el de la analítica, mándamelo
    antes del jueves».

    Vale para los cuatro tipos, y sustituye a `schema.nota`, que era el mismo
    dato metido dentro del esquema congelado porque el esquema era lo único que
    había. Congelarlo tenía sentido cuando iba con las preguntas; como columna se
    lee sin abrir el JSON y existe también donde no hay preguntas.
  */
  ADD COLUMN IF NOT EXISTS body text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_actions_tipo_valido') THEN
    ALTER TABLE public.client_actions
      ADD CONSTRAINT client_actions_tipo_valido
      CHECK (tipo IN ('form', 'documento', 'video', 'pide'));
  END IF;

  /*
    Una fila que promete algo que abrir y no trae con qué abrirlo es una fila
    rota: al cliente le sale un renglón sin destino y no hay forma de saber si es
    un fallo del envío o que el entrenador no puso nada.
  */
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_actions_entrega_con_link') THEN
    ALTER TABLE public.client_actions
      ADD CONSTRAINT client_actions_entrega_con_link
      CHECK (tipo NOT IN ('documento', 'video') OR link IS NOT NULL);
  END IF;
END $$;

-- ── 4. El recado se saca del esquema ────────────────────────────────────────
--
-- Se COPIA, no se mueve: `schema.nota` se queda donde está en las filas viejas.
-- Es un esquema congelado —la foto de lo que esa persona vio— y reescribirlo
-- para ganar limpieza sería justo lo que la 0099 juró no hacer. Lo que lee la
-- aplicación mira primero la columna y luego el esquema, así que las viejas y
-- las nuevas se leen igual.

UPDATE public.client_actions
SET body = schema->>'nota'
WHERE body IS NULL
  AND schema ? 'nota'
  AND length(trim(schema->>'nota')) > 0;

-- ── 5. RLS: lo mismo que tenía, con el nombre nuevo ─────────────────────────

ALTER TABLE public.client_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_forms_read" ON public.client_actions;
DROP POLICY IF EXISTS "client_forms_write" ON public.client_actions;

/*
  Leer: el entrenador que puede ver al cliente, Y EL PROPIO CLIENTE.
  `app_can_read_client` está escrita para el lado del panel y no incluye al
  cliente, así que el `OR app_is_client` no es redundante: sin él, el portal no
  vería lo que se le ha mandado y la pantalla saldría vacía sin ningún error.
*/
DROP POLICY IF EXISTS "client_actions_read" ON public.client_actions;
CREATE POLICY "client_actions_read" ON public.client_actions
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id) OR public.app_is_client(client_id));

/*
  Escribir: solo el entrenador. El cliente no toca ni una columna por esta vía;
  lo suyo entra por `marcar_accion`, que solo puede marcar y contestar su propia
  fila. Darle UPDATE aquí le dejaría cambiar el enunciado de lo que se le pidió,
  que es peor que no poder contestarlo.
*/
DROP POLICY IF EXISTS "client_actions_write" ON public.client_actions;
CREATE POLICY "client_actions_write" ON public.client_actions
  FOR ALL TO authenticated
  USING (public.app_can_write_client(client_id))
  WITH CHECK (public.app_can_write_client(client_id));

/*
  Y el GRANT, que es la otra mitad: una política decide QUÉ FILAS, el GRANT
  decide si se puede mirar la tabla. Sin el segundo, la primera no llega a
  evaluarse y PostgREST devuelve 403 (42501) — y el síntoma no es un error, es un
  dato falso: «no te ha pedido nada». Este proyecto ya se lo comió tres veces.

  El `RENAME` conserva los privilegios de la tabla, así que esto es por si la
  tabla se acaba de crear en el paso 2.
*/
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_actions TO authenticated;

-- ── 6. Lo que el cliente marca o contesta ───────────────────────────────────

/*
  `submit_client_form` se generaliza a `marcar_accion`.

  Es la misma función y por los mismos motivos —invocable con la anon key, así
  que comprueba quién llama y qué le mandan—, con una sola diferencia: las
  respuestas ahora son OPCIONALES. Un vídeo no se contesta, se abre; un «pide» no
  se contesta, se marca. Los tres gestos son el mismo hecho —esta acción ya está
  hecha— y por eso comparten función y comparten columna (`submitted_at`).
*/
CREATE OR REPLACE FUNCTION public.marcar_accion(
  target  uuid,
  answers jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dueno  uuid;
  clase  text;
  cuando timestamptz;
BEGIN
  SELECT ca.client_id, ca.tipo INTO dueno, clase
  FROM public.client_actions ca
  WHERE ca.id = target;

  IF dueno IS NULL THEN
    RAISE EXCEPTION 'No existe esa acción';
  END IF;

  IF NOT (public.app_is_client(dueno) OR public.app_can_write_client(dueno)) THEN
    RAISE EXCEPTION 'No tienes permiso sobre esa acción';
  END IF;

  IF marcar_accion.answers IS NOT NULL THEN
    IF clase IS DISTINCT FROM 'form' THEN
      RAISE EXCEPTION 'Solo un formulario guarda respuestas';
    END IF;

    IF jsonb_typeof(marcar_accion.answers) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Las respuestas tienen que ser un objeto JSON';
    END IF;

    IF pg_column_size(marcar_accion.answers) > 8192 THEN
      RAISE EXCEPTION 'Las respuestas son demasiado largas';
    END IF;
  END IF;

  /*
    Reentregar SÍ sobrescribe las respuestas, al revés que el check-in: aquello
    es la foto de una semana y reabrirlo desharía la revisión del entrenador;
    esto es una respuesta a una pregunta, y corregir los kilos que se puso mal
    tiene que valer. Lo que no se toca nunca es `sent_at`, para que la fila siga
    sabiendo cuándo se pidió, ni `submitted_at` una vez puesto: la fecha que
    interesa es la de la primera vez.

    Y marcar sin respuestas no borra las que hubiera: `COALESCE` deja lo que
    estaba. Sin eso, abrir dos veces un formulario ya contestado lo vaciaría.
  */
  UPDATE public.client_actions
  SET answers      = COALESCE(marcar_accion.answers, client_actions.answers),
      submitted_at = COALESCE(client_actions.submitted_at, now())
  WHERE id = target
  RETURNING submitted_at INTO cuando;

  RETURN cuando;
END;
$$;

/*
  El REVOKE a `anon` es explícito y no solo a `public`: una función recién creada
  nace con EXECUTE concedido a `anon` por los privilegios por defecto del esquema
  de Supabase, y `REVOKE ... FROM public` no lo retira (lo documenta la 0047).
*/
REVOKE ALL ON FUNCTION public.marcar_accion(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_accion(uuid, jsonb) TO authenticated;

/*
  Y la vieja se retira. Dejarla viva sería un segundo camino de escritura a la
  misma columna, que es exactamente lo que este trabajo viene a quitar.

  Se retira DESPUÉS de crear la nueva y en la misma transacción, así que no hay
  ningún instante en el que un cliente no pueda entregar. Lo que sí puede pasar
  es que una pestaña abierta con el bundle viejo llame a la función que ya no
  existe: se arregla recargando, y es el mismo precio que cualquier despliegue.
*/
DROP FUNCTION IF EXISTS public.submit_client_form(uuid, jsonb);

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Que la tabla existe con su forma nueva y conserva las dos capas:
--
--   SELECT relrowsecurity,
--          has_table_privilege('authenticated', 'public.client_actions', 'SELECT') AS puede_leer,
--          has_table_privilege('authenticated', 'public.client_actions', 'INSERT') AS puede_mandar
--   FROM pg_class WHERE oid = 'public.client_actions'::regclass;
--
-- 2) Que no quedan filas mal clasificadas ni recados perdidos (0 y 0):
--
--   SELECT count(*) FILTER (WHERE tipo IS NULL) AS sin_tipo,
--          count(*) FILTER (WHERE body IS NULL AND schema ? 'nota') AS recado_perdido
--   FROM public.client_actions;
--
-- 3) Que solo hay una función viva, y con la firma nueva:
--
--   SELECT oid::regprocedure FROM pg_proc
--   WHERE proname IN ('marcar_accion', 'submit_client_form');
--
-- 4) Que un vídeo sin enlace no entra (debe fallar):
--
--   INSERT INTO public.client_actions (envio_id, client_id, title, tipo)
--   VALUES (gen_random_uuid(), '<un cliente tuyo>', 'prueba', 'video');
-- ============================================================================
