-- ============================================================================
-- Lo que le pasa a un cliente sin que tú lo mandes
-- ----------------------------------------------------------------------------
-- ⚠️  Dos tablas nuevas y nada más: no toca `client_actions`, ni `clients`, ni
--     `profiles`. Antes de aplicarla la aplicación funciona igual —el carril
--     sale vacío y no corre nada—, así que se puede desplegar antes que el
--     código sin ningún riesgo. Al revés NO: el código sin la migración deja el
--     carril sin dónde guardar.
--
-- ══ Qué es una automatización ══════════════════════════════════════════════
--
-- Un disparador y unos pasos con su desfase. Vive DENTRO de un protocolo y no
-- lleva audiencia propia: a quién le pasa lo contesta el protocolo puesto.
--
-- El motor de esta tanda es el 1: **materializar por adelantado**. No hay nadie
-- mandando nada a ninguna hora; lo que hay es que la fila de `client_actions` se
-- escribe CON SU FECHA y el portal solo enseña las vigentes (`vigente`, en
-- `domain/envios.js`). Automatizar, aquí, es calcular qué filas tendrían que
-- existir ya y escribirlas. Cero infraestructura.
--
-- ══ Por qué en tabla y no en `preferences` ═════════════════════════════════
--
-- El argumento entero ya está escrito en la 0112 y vale igual: `preferences` se
-- lee ENTERA al arrancar y se REESCRIBE ENTERA en cada guardado, así que dos
-- pestañas abiertas se pisan el trabajo. Y aquí no vale el contraargumento de la
-- 0099 —«los formularios se quedan porque los siembra una función pura»—: una
-- automatización no se siembra, **se dispara**, y lo que se dispara necesita
-- dejar constancia de que se disparó.
--
-- Los PROTOCOLOS sí se quedan en `preferences` y por eso `protocolo_id` es
-- `text` sin clave ajena: apunta al id de un objeto que vive en un JSONB. La
-- huérfana no es un problema —`deProtocolo` filtra por ese id y una que no
-- coincide con ningún protocolo no se lee— y meter aquí una FK exigiría sacar
-- los protocolos de las preferencias, que es otro trabajo y no éste.
--
-- ══ Y la segunda tabla, que es la que evita el desastre ════════════════════
--
-- `automation_runs` es el libro de a quién le ha corrido qué, y su índice único
-- es la única cosa de esta migración que no se puede quitar. El fallo que evita
-- —el vídeo de bienvenida mandado dos veces— es el único de este producto que no
-- se puede corregir después: la disculpa llega cuando el cliente ya lo ha visto.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'Falta 0001: no existe `clients`.';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Falta 0001: no existe `profiles`.';
  END IF;
  IF to_regprocedure('public.app_can_read_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existe `app_can_read_client()`.';
  END IF;
  IF to_regprocedure('public.app_can_write_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existe `app_can_write_client()`.';
  END IF;
END $$;

BEGIN;

-- ── 1. La automatización ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coach_automations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /*
    De quién es. Del ENTRENADOR y no del equipo, a diferencia de
    `coach_templates`: una automatización es de un protocolo, y los protocolos
    viven en `profiles.preferences`, que es de cada perfil. Colgarla del equipo
    la dejaría apuntando con `protocolo_id` a un protocolo que los demás no
    tienen.
  */
  coach_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,

  -- De qué protocolo es. Ver la cabecera: `text` y sin FK, a propósito.
  protocolo_id text NOT NULL,

  /*
    Opcional. Sin nombre se llama como su disparador —«Cuando empieza contigo»,
    «Cada lunes»—, que es lo que la mayoría va a querer y lo que evita el campo
    obligatorio que nadie sabe rellenar el primer día.
  */
  nombre       text,

  /*
    QUÉ LA DISPARA. Sin CHECK, por el mismo criterio que `coach_templates.kind`:
    el catálogo de disparadores es una decisión de producto que ya se hace
    cumplir en `domain/automatizaciones.js` (`DISPARADORES`, y el saneado
    descarta lo que no conoce), y clavarlo aquí obligaría a una migración para
    añadir el quinto. Una fila con un disparador que el código no conoce se sanea
    a `alta` al leerla y no rompe nada.

    Los de esta tanda son los cuatro que se pueden fechar por adelantado:
    `alta` · `semana` · `manual` · `cadena`. Los que provoca el cliente —se pesa,
    contesta, entrena— tienen que correr EN LA BASE porque el cliente no puede
    escribir en `client_actions` (0105), y ésa es la tanda 3.
  */
  disparador   text NOT NULL,

  -- Lo que el disparador necesita saber: `{"day":1,"every":2}` en el semanal.
  valor        jsonb,

  /*
    LOS PASOS, dentro y no en su tabla.

    Un paso no tiene vida propia: no se consulta suelto, no se comparte y se
    edita siempre con su automatización delante. Lo que sí tiene vida propia
    —cada ejecución— es lo que tiene fila, abajo.

      [{ id, dia, que, formId, titulo, enlace, nota, saltaA }]

    `dia` es el desfase DESDE EL DISPARO, no desde el paso anterior: es lo que
    permite meter un paso en medio sin recolocar lo que va detrás.
  */
  pasos        jsonb NOT NULL DEFAULT '[]'::jsonb,

  activa       boolean NOT NULL DEFAULT true,
  orden        int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_automations_coach_idx
  ON public.coach_automations (coach_id, protocolo_id);

ALTER TABLE public.coach_automations ENABLE ROW LEVEL SECURITY;

/*
  Suyas y de nadie más. Ni del equipo ni del cliente: lo que el cliente ve es lo
  que le llega a su lista de pendientes, no la regla que lo mandó.
*/
DROP POLICY IF EXISTS "coach_automations_all" ON public.coach_automations;
CREATE POLICY "coach_automations_all" ON public.coach_automations
  FOR ALL TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_automations TO authenticated;

-- ── 2. El libro de lo que ya corrió ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id     uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,

  /*
    CASCADE: borrar una automatización se lleva su libro.

    Parece peligroso y es justo lo contrario. Los ids de una automatización
    nueva son nuevos, así que un libro viejo no protege de nada: lo único que
    haría es crecer para siempre. Y lo ya mandado no se pierde — vive en
    `client_actions`, que es de quien lo recibió.
  */
  automation_id uuid NOT NULL REFERENCES public.coach_automations (id) ON DELETE CASCADE,

  -- Qué paso de esa automatización. El id que viaja en el JSONB de arriba.
  paso_id       text NOT NULL,

  /*
    ══ LA LLAVE, y el motivo de esta tabla ═════════════════════════════════

    `ocurrencia` dice QUÉ VEZ ES:

        Cuando empieza contigo   →  'once'
        Cada semana              →  '2026-W37'      (semana ISO)
        Cuando se la mandes tú   →  el id de ese envío
        Cuando termine otra      →  la ocurrencia de quien la llama

    **Una sola columna distingue lo que pasa una vez de lo que se repite**, y por
    eso el índice único de abajo vale para los cuatro casos sin ramificar.

    La última línea no es un detalle: si una encadenada usara `'once'`, «cada
    lunes → empieza X» dispararía X una sola vez en la vida.
  */
  ocurrencia    text NOT NULL,

  /*
    Qué salió: una de las dos, y SIEMPRE una.

    Sin clave ajena y anulables, por dos motivos distintos. Sin clave ajena,
    porque borrar lo mandado no puede llevarse por delante el apunte de que se
    mandó —y si se lo llevara, volvería a salir—. Y anulables porque se escriben
    en dos tiempos: primero se pide vez (se apunta la fila) y solo después sale
    lo que sea.

    ── Y que las dos estén vacías es una SEÑAL, no un estado válido ──────────
    Entre pedir vez y mandar hay un instante, y el navegador puede desaparecer
    justo ahí: se cierra la pestaña, se va la red. Queda entonces un apunte que
    dice «ya corrió» sin que haya salido nada y sin nadie que lo reintente — el
    doble disparo al revés, y tan callado como él. Por eso un apunte viejo con
    las dos vacías se barre al empezar cada repaso
    (`limpiarApuntesAMedias`), y por eso los pasos que NO mandan nada —los
    saltos— no se apuntan aquí: si se apuntaran, esta señal no distinguiría nada.
  */
  action_id     uuid,
  event_id      uuid,

  ran_at        timestamptz NOT NULL DEFAULT now()
);

/*
  ══ El índice único: donde el doble disparo deja de ser posible ════════════

  No es una optimización, es LA regla, y está aquí y no en JavaScript porque
  aquí es el único sitio donde puede ser cierta. Dos pestañas abiertas, un
  reintento de red o dos disparadores encadenados llegan a la vez; el navegador
  solo puede comprobar lo que sabe, y lo que sabe es de hace un segundo.

  Quien escribe hace `ON CONFLICT DO NOTHING` y mira cuántas filas entraron: cero
  significa «lo está haciendo otro», que es exactamente la respuesta correcta.
*/
CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_llave
  ON public.automation_runs (client_id, automation_id, paso_id, ocurrencia);

/* Para leer «qué le ha pasado a esta persona» sin recorrer la tabla entera. */
CREATE INDEX IF NOT EXISTS automation_runs_client_idx
  ON public.automation_runs (client_id, ran_at DESC);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

/*
  Se lee si se puede ver a esa persona y se escribe si se le puede escribir: las
  mismas dos funciones que gobiernan todo lo que cuelga de un cliente (0064).

  **Sin `app_is_client`**, y a diferencia de `client_actions`. Aquí no hay nada
  que el cliente necesite: lo que le llega es la fila de su lista de pendientes,
  y este libro es la contabilidad del entrenador. Dársela sería enseñarle el
  mecanismo de algo que para él tiene que ser, simplemente, lo que su entrenador
  le pide.
*/
DROP POLICY IF EXISTS "automation_runs_read" ON public.automation_runs;
CREATE POLICY "automation_runs_read" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id));

DROP POLICY IF EXISTS "automation_runs_write" ON public.automation_runs;
CREATE POLICY "automation_runs_write" ON public.automation_runs
  FOR ALL TO authenticated
  USING (public.app_can_write_client(client_id))
  WITH CHECK (public.app_can_write_client(client_id));

/*
  ══ Y EL GRANT, que es la otra mitad ═══════════════════════════════════════
  Una política decide QUÉ FILAS; el GRANT, si se puede mirar la tabla. Sin el
  segundo, la primera no llega a evaluarse y PostgREST devuelve 403 (42501).
  Este proyecto se lo ha comido cuatro veces y el síntoma nunca es un error: es
  un dato falso. Aquí el dato falso sería el peor de todos —«esto no ha corrido»
  cuando sí corrió—, o sea, el doble disparo por la puerta de atrás.
*/
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_runs TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT count(*) FROM public.coach_automations;   -- 0: nace vacía
--
--   -- Que la llave sea llave de verdad (con una automatización y un cliente
--   -- tuyos, desde la aplicación y no con service_role):
--   INSERT INTO public.automation_runs (client_id, automation_id, paso_id, ocurrencia)
--   VALUES ('<cliente>', '<auto>', 'paso_1', 'once');
--   INSERT INTO public.automation_runs (client_id, automation_id, paso_id, ocurrencia)
--   VALUES ('<cliente>', '<auto>', 'paso_1', 'once');
--   -- ERROR: duplicate key value violates unique constraint
--   --        "automation_runs_llave"    ← esto es lo que tiene que pasar
--
-- Y la de verdad, la que está escrita: `supabase/tests/automatizaciones.test.js`
-- lo comprueba con dos sesiones reales y con la clave anónima, que es la que
-- tiene el navegador.
-- ============================================================================
