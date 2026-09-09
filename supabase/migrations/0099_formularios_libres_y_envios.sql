-- ============================================================================
-- Formularios libres: lo que le mandas a alguien, y lo que te contesta
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para «Mandar algo». Sin ella, la pantalla de Protocolos no
--     puede mandar un formulario y el portal del cliente no tiene nada que
--     contestar. El resto de la aplicación funciona igual que antes.
--
-- ══ El problema que resuelve ═══════════════════════════════════════════════
--
-- Hasta hoy un cuestionario solo podía llegarle a un cliente por una de tres
-- puertas —el alta, el parte de la sesión y el check-in de la semana— y las tres
-- estaban clavadas en el protocolo. «Que estos cinco me contesten esto hoy» no
-- tenía dónde escribirse. Y hay dos motivos por los que no era cuestión de
-- añadir un botón:
--
--   1. **Solo cabía uno.** `clients.preferences.intakeForm` es un objeto, no una
--      lista: mandarle un segundo formulario a alguien le pisaba el primero.
--
--   2. **Las respuestas no tenían entrega.** Lo que el cliente contesta en el
--      alta se mezcla en `clients.profile` con la clave de cada campo
--      (`set_client_profile`, 0080). O sea que la misma pregunta hecha dos veces
--      no da dos respuestas: da una, y la de enero desaparece.
--
-- Los otros dos cuestionarios SÍ funcionan, y funcionan justamente porque tienen
-- entrega: el check-in guarda en `check_ins.answers` con su semana (0060) y el
-- parte en el feedback de la sesión (0016). Lo que falta aquí es la entrega del
-- tercero, y eso es una tabla.
--
-- ══ Lo que esta migración NO hace ══════════════════════════════════════════
--
-- No toca el alta, ni el check-in, ni el parte. Siguen exactamente donde están y
-- por el camino de siempre. Moverlos sería una migración de datos a cambio de
-- elegancia, y este proyecto ya decidió dos veces que no (ver el docblock de
-- `domain/formularios.js` sobre por qué no se unificó el almacenamiento de las
-- preguntas).
--
-- Tampoco mueve la BIBLIOTECA del entrenador: sus formularios siguen en
-- `profiles.preferences.formularios.items`. Se estudió sacarlos a su tabla y se
-- descartó por una razón concreta: `newClientPreferences`, `resolveProtocolo` y
-- `planDe` son funciones PURAS sobre las preferencias, y el alta las llama para
-- sembrar el protocolo de un cliente nuevo. Con la biblioteca en una tabla que
-- se carga aparte, esas tres pasan a depender de una carga asíncrona y el alta
-- puede sembrar un protocolo a medias. El tope de elementos por formulario
-- (`MAX_ELEMENTOS`) mantiene esa columna en tamaño razonable. Cuando deje de
-- serlo, lo que cambia es dónde vive la biblioteca, no esta tabla.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'Falta el esquema base: no existe `clients`.';
  END IF;
  /*
    `to_regprocedure` y no `to_regproc`: el primero entiende la firma con sus
    argumentos, el segundo solo el nombre pelado y devuelve NULL en cuanto ve un
    paréntesis. Con `to_regproc` esta guarda saltaba SIEMPRE —dijera lo que
    dijera la base— y acusaba de faltar una migración ya aplicada. Está avisado
    por escrito en la 0027 y aun así se coló.
  */
  IF to_regprocedure('public.app_can_write_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existen los ayudantes de RLS.';
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_forms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /*
    De qué envío viene.

    Un «envío» —«esto, a estos cinco, hoy»— no tiene tabla propia a propósito:
    sería una cabecera que repite lo que sus filas ya dicen y que se
    desincronizaría en cuanto alguien borrara una. Se agrupa por esta columna al
    leer (`domain/envios.js`, `agrupar`), que es la misma decisión que tomó
    `updates.js` al no crear una tabla de novedades.
  */
  envio_id     uuid NOT NULL,

  client_id    uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,

  /*
    De qué formulario de la biblioteca salió. **Sin clave foránea y anulable**:
    la biblioteca vive en un JSONB, no en una tabla, y además borrar un
    formulario no puede llevarse por delante lo que la gente ya contestó. Sirve
    para agrupar y para decir «este formulario tiene un envío vivo», nada más.
  */
  form_id      text,

  -- Cómo se llamaba el día que se mandó. Renombrarlo después no reescribe la
  -- historia: en la tabla de resultados sigue leyéndose lo que él vio.
  title        text NOT NULL,

  /*
    EL ESQUEMA, CONGELADO.

    La decisión más importante de la tabla. Guardar una referencia y resolverla
    al leer haría que cambiar el formulario mañana cambiara lo que alguien
    contestó ayer —y lo que tiene a medias en la pantalla—. Congelándolo, el
    versionado sale gratis: cada envío es la foto del formulario que se mandó.

    Dentro van los `elementos` (ver `domain/formulario.js`) y la `audiencia` con
    la que se mandó, que es lo que permite decir «a los 5 con la etiqueta
    presencial» meses después sin recalcular nada.
  */
  schema       jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Lo que contesta. NULL mientras no haya entregado, que no es lo mismo que un
  -- objeto vacío: vacío sería «entregó sin contestar nada».
  answers      jsonb,

  /*
    Para cuándo.

    NULL o pasada, le toca ya. Una fecha futura existe desde que se manda pero no
    se le enseña hasta su día: no hay servidor que dispare nada —ni `pg_cron` ni
    funciones programadas—, así que lo programado se decide AL LEER, igual que
    las novedades. La comprobación está en `vigente()` y la hacen los dos lados.
  */
  due          date,

  sent_at      timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,

  /*
    Que no se le mande dos veces lo mismo en el mismo envío.

    Sin esto, un doble clic en «Mandárselo a 5» deja diez filas y la tabla de
    resultados cuenta «3 de 10». Es el mismo cinturón que `check_ins` lleva sobre
    (cliente, semana).
  */
  CONSTRAINT client_forms_una_por_envio UNIQUE (envio_id, client_id)
);

/*
  Sin `coach_id`.

  Sería la segunda copia de algo que `clients.coach_id` ya dice, y se quedaría
  vieja en cuanto un cliente cambiara de entrenador dentro de un equipo — que es
  exactamente lo que `app_can_write_client` contempla y una columna copiada no.
  El permiso lo resuelven los ayudantes desde `client_id`.
*/

CREATE INDEX IF NOT EXISTS client_forms_client_idx
  ON public.client_forms (client_id, submitted_at);
CREATE INDEX IF NOT EXISTS client_forms_envio_idx
  ON public.client_forms (envio_id);

ALTER TABLE public.client_forms ENABLE ROW LEVEL SECURITY;

/*
  Leer: el entrenador que puede ver al cliente, Y EL PROPIO CLIENTE.

  `app_can_read_client` está escrita para el lado del panel y no incluye al
  cliente, así que el `OR app_is_client` no es redundante: sin él, el portal no
  vería lo que se le ha pedido y la pantalla saldría vacía sin ningún error.
*/
DROP POLICY IF EXISTS "client_forms_read" ON public.client_forms;
CREATE POLICY "client_forms_read" ON public.client_forms
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id) OR public.app_is_client(client_id));

/*
  Escribir: solo el entrenador.

  Mandar, dejar de pedir y corregir el título son suyos. El cliente NO escribe
  aquí ni una columna por esta vía: sus respuestas entran por
  `submit_client_form`, más abajo, que es lo único que puede tocar y solo de su
  propia fila. Darle UPDATE aquí le dejaría cambiar el enunciado de lo que se le
  preguntó, que es peor que no poder contestar.
*/
DROP POLICY IF EXISTS "client_forms_write" ON public.client_forms;
CREATE POLICY "client_forms_write" ON public.client_forms
  FOR ALL TO authenticated
  USING (public.app_can_write_client(client_id))
  WITH CHECK (public.app_can_write_client(client_id));

/*
  ══ Y EL GRANT, que es la otra mitad ═══════════════════════════════════════

  Una política decide QUÉ FILAS; el GRANT decide si se puede mirar la tabla. Sin
  el segundo, la primera no llega a evaluarse y PostgREST devuelve 403 (42501).
  Este proyecto ya se comió ese fallo tres veces (0088, 0089, 0090) y el síntoma
  nunca es un error visible: es un dato falso —«no te ha pedido nada»— porque
  quien llama se traga el 403 y pinta el vacío.

  Se concede lo que las pantallas usan y nada más: el entrenador manda (INSERT),
  lee (SELECT), corrige (UPDATE) y deja de pedir (DELETE). La escritura del
  cliente no necesita GRANT porque pasa por una función SECURITY DEFINER.
*/
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_forms TO authenticated;

-- ── Lo que el cliente contesta ──────────────────────────────────────────────

/*
  Calcada de `submit_check_in` (0060), y por los mismos motivos.

  Es invocable directamente con la anon key, así que no puede fiarse de que la
  aplicación mande algo sensato: comprueba quién llama, que las respuestas sean
  un objeto y que quepan. El tope es de 8 KB y no de 4 como el del check-in
  porque aquí caben veinticuatro elementos con texto largo, mientras que un
  check-in son ocho escalas.
*/
CREATE OR REPLACE FUNCTION public.submit_client_form(
  target  uuid,
  answers jsonb
)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dueno   uuid;
  cuando  timestamptz;
BEGIN
  SELECT cf.client_id INTO dueno FROM public.client_forms cf WHERE cf.id = target;

  IF dueno IS NULL THEN
    RAISE EXCEPTION 'No existe ese formulario';
  END IF;

  IF NOT (public.app_is_client(dueno) OR public.app_can_write_client(dueno)) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese formulario';
  END IF;

  IF jsonb_typeof(answers) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Las respuestas tienen que ser un objeto JSON';
  END IF;

  IF pg_column_size(answers) > 8192 THEN
    RAISE EXCEPTION 'Las respuestas son demasiado largas';
  END IF;

  /*
    Reentregar SÍ sobrescribe, al revés que el check-in.

    Un check-in es la foto de una semana y reabrirlo desharía la revisión del
    entrenador. Un formulario es una respuesta a una pregunta: si el cliente se
    equivocó al poner sus kilos, corregirlo tiene que valer. Lo que no se toca es
    `sent_at`, para que la fila siga sabiendo cuándo se pidió.
  */
  UPDATE public.client_forms
  SET answers      = submit_client_form.answers,
      submitted_at = COALESCE(submitted_at, now())
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
REVOKE ALL ON FUNCTION public.submit_client_form(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_client_form(uuid, jsonb) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Que la tabla tiene RLS Y GRANT (las dos capas, no una):
--
--   SELECT relrowsecurity,
--          has_table_privilege('authenticated', 'public.client_forms', 'SELECT') AS puede_leer,
--          has_table_privilege('authenticated', 'public.client_forms', 'INSERT') AS puede_mandar
--   FROM pg_class WHERE oid = 'public.client_forms'::regclass;
--
-- 2) Que el cliente NO puede escribir la tabla por su cuenta (debe dar 0 filas
--    con la sesión de un cliente):
--
--   UPDATE public.client_forms SET title = 'no' WHERE id = '<un id suyo>';
--
-- 3) Que la función solo deja una versión viva:
--
--   SELECT oid::regprocedure FROM pg_proc WHERE proname = 'submit_client_form';
-- ============================================================================
