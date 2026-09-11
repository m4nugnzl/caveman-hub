-- ============================================================================
-- El motor 2: lo que dispara el cliente
-- ----------------------------------------------------------------------------
-- ⚠️  No crea tablas ni columnas: una función y dos disparadores de tabla.
--     Antes de aplicarla, los dos disparadores nuevos del carril
--     —«Cuando te conteste» y «Cuando se pese»— se pueden escribir y guardar,
--     y no pasa nada; después, pasan. Se puede desplegar antes o después del
--     código sin romper nada en ninguno de los dos órdenes.
--
-- ══ Por qué esto tiene que vivir aquí y no en el navegador ═════════════════
--
-- El motor 1 (0116) materializa POR ADELANTADO: sabe la fecha del disparo antes
-- de que llegue —el alta de alguien, el lunes que viene— así que puede escribir
-- la fila con su `due` y dejar que el portal la enseñe el día que toca. Cero
-- infraestructura.
--
-- El motor 2 no puede: lo que lo dispara es un hecho del cliente que nadie sabe
-- cuándo va a pasar —contesta, se pesa— y cuando pasa, **el que está delante es
-- él**. Y el cliente no puede escribir en `client_actions`: se lo prohíbe la
-- política de la 0105, a propósito, porque darle escritura ahí le dejaría
-- cambiar el enunciado de lo que se le pidió.
--
-- Así que el reparto corre en la base, con `SECURITY DEFINER`, colgado del hecho
-- por un disparador de tabla. No es una preferencia de arquitectura: es lo único
-- que respeta a la vez las dos cosas que no se negocian —que el cliente no
-- escriba lo del entrenador, y que lo que le prometes que le va a pasar, pase—.
--
-- ══ Un disparador de tabla y no una llamada al final de la RPC ═════════════
--
-- El plan decía «la llaman al final las RPC de entrega que ya existen». Va como
-- disparador por dos motivos que se ven al mirar el código:
--
--   1. **El pesaje no tiene RPC.** El cliente escribe él mismo en
--      `anthropometry` (política `anthro_client_update`, 0002): el historial es
--      un JSONB que se reescribe entero. No hay ningún sitio donde «llamar al
--      final».
--   2. **Contestar tiene más de una puerta.** `marcar_accion` es la del cliente,
--      pero el entrenador también puede dar por entregada una acción desde su
--      lado. Colgarlo de la RPC dejaría fuera esa mitad, y el síntoma sería el
--      de siempre en este proyecto: no un error, un dato que falta.
--
-- El disparador cuelga del HECHO, que es lo que la regla dice. Quien lo provoque
-- da igual.
--
-- ══ Y nunca puede romperle el gesto al cliente ═════════════════════════════
--
-- Todo lo que sale de aquí va dentro de un `EXCEPTION` que se lo traga. Un paso
-- mal escrito, un formulario borrado, un enlace que falta: lo que no puede pasar
-- es que alguien no consiga entregar su check-in porque una automatización del
-- entrenador está rota. La automatización se queda sin correr —sin apuntar, así
-- que se podrá reintentar— y la entrega sigue su camino.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.coach_automations') IS NULL THEN
    RAISE EXCEPTION 'Falta 0116_lo_que_pasa_solo.sql: no existe `coach_automations`.';
  END IF;
  IF to_regclass('public.automation_runs') IS NULL THEN
    RAISE EXCEPTION 'Falta 0116_lo_que_pasa_solo.sql: no existe `automation_runs`.';
  END IF;
  IF to_regclass('public.client_actions') IS NULL THEN
    RAISE EXCEPTION 'Falta 0105_lo_mandado_es_una_accion.sql: no existe `client_actions`.';
  END IF;
  IF to_regclass('public.client_events') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existe `client_events`.';
  END IF;
END $$;

BEGIN;

-- ── 1. Qué protocolo lleva puesto ───────────────────────────────────────────
--
-- El gemelo en SQL de `protocoloDeCliente` (`domain/protocolos.js`), y hay que
-- escribirlo porque los protocolos viven en `profiles.preferences` y desde aquí
-- no se puede llamar a JavaScript.
--
-- **RESOLVER ANTES DE COMPARAR**, que es el riesgo 3 del plan y ya costó una
-- tarde en la tanda 2: `preferences->>'protocolId'` devuelve lo ESCRITO, y casi
-- nadie tiene nada escrito. Quien nunca eligió lleva el PRIMERO de la lista, y
-- comparando contra el valor crudo a la cartera entera no le corre nada — sin un
-- solo error, que es lo que lo hace difícil de ver.

CREATE OR REPLACE FUNCTION public.app_protocolo_de_cliente(p_client uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_puesto text;
  v_items  jsonb;
  v_proto  text;
BEGIN
  SELECT c.preferences->>'protocolId', p.preferences->'protocolos'->'items'
  INTO v_puesto, v_items
  FROM public.clients c
  JOIN public.profiles p ON p.id = c.coach_id
  WHERE c.id = p_client;

  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    /* Sin lista guardada, el protocolo de siempre ES la lista: `heredado()` en
       `domain/protocolos.js` le pone este id fijo. */
    RETURN 'proto_general';
  END IF;

  SELECT e->>'id' INTO v_proto
  FROM jsonb_array_elements(v_items) e
  WHERE e->>'id' = v_puesto
  LIMIT 1;

  RETURN COALESCE(v_proto, v_items->0->>'id');
END;
$$;

REVOKE ALL ON FUNCTION public.app_protocolo_de_cliente(uuid) FROM public, anon;

-- ── 2. Una automatización, con su cadena ────────────────────────────────────
--
-- Aparte y recursiva porque la cadena lo es: un paso `salta` empieza otra
-- automatización, y la que empieza corre CON LA OCURRENCIA DE QUIEN LA LLAMA
-- (§10.1 del plan). Sin eso, «cada vez que me conteste → empieza X» dispararía X
-- una sola vez en la vida.
--
-- `p_cadena` es por dónde ha pasado ya: cortar el ciclo es lo que impide que A
-- llame a B y B a A escribiendo filas hasta que alguien lo vea.

CREATE OR REPLACE FUNCTION public.app_correr_una_automatizacion(
  p_auto       uuid,
  p_client     uuid,
  p_ocurrencia text,
  p_desde      date,
  p_prefs      jsonb,
  p_proto      text,
  p_saltos     int,
  p_cadena     uuid[]
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  MAX_SALTOS constant int := 5;

  v_auto   public.coach_automations%ROWTYPE;
  v_nombre text;
  v_paso   jsonb;
  v_pasoid text;
  v_que    text;
  v_dia    int;
  v_due    date;
  v_apunte uuid;
  v_form   jsonb;
  v_titulo text;
  v_enlace text;
  v_nota   text;
  v_accion uuid;
  v_evento uuid;
  v_destino uuid;
  v_hechas int := 0;
BEGIN
  IF p_saltos > MAX_SALTOS THEN RETURN 0; END IF;

  SELECT * INTO v_auto FROM public.coach_automations WHERE id = p_auto;
  IF v_auto.id IS NULL OR NOT v_auto.activa THEN RETURN 0; END IF;

  /*
    Cómo se llama, para congelarlo en la procedencia de lo que salga. Es el
    gemelo de `nombreDe`, recortado: aquí solo hacen falta las etiquetas de los
    disparadores que pueden llegar a este motor —el suyo y el de las encadenadas—
    y es texto que se copia, no se referencia: renombrar la automatización mañana
    no puede reescribir lo que salió hoy.
  */
  v_nombre := COALESCE(NULLIF(TRIM(v_auto.nombre), ''), CASE v_auto.disparador
    WHEN 'contesta' THEN 'Cuando te conteste'
    WHEN 'pesaje'   THEN 'Cuando se pese'
    WHEN 'cadena'   THEN 'Cuando termine otra'
    WHEN 'alta'     THEN 'Cuando empieza contigo'
    WHEN 'manual'   THEN 'Cuando se la mandes tú'
    ELSE 'Cada semana'
  END);

  FOR v_paso IN
    SELECT x FROM jsonb_array_elements(COALESCE(v_auto.pasos, '[]'::jsonb)) x
    ORDER BY COALESCE((x->>'dia')::int, 0)
  LOOP
    v_pasoid := v_paso->>'id';
    v_que    := v_paso->>'que';
    v_dia    := GREATEST(LEAST(COALESCE((v_paso->>'dia')::int, 0), 180), 0);
    v_due    := p_desde + v_dia;
    v_titulo := NULLIF(TRIM(LEFT(COALESCE(v_paso->>'titulo', ''), 80)), '');
    v_enlace := NULLIF(TRIM(LEFT(COALESCE(v_paso->>'enlace', ''), 500)), '');
    v_nota   := NULLIF(TRIM(LEFT(COALESCE(v_paso->>'nota', ''), 280)), '');

    IF v_pasoid IS NULL THEN CONTINUE; END IF;

    -- ── El salto: no manda nada, sigue la cadena ───────────────────────────
    --
    -- Y **no se apunta**, igual que en el navegador: un apunte sin acción y sin
    -- evento es la señal de una corrida a medias, y si los saltos se apuntaran
    -- esa señal dejaría de distinguir nada. Lo que decide si los pasos de la
    -- llamada salen es la corrida DE ESOS pasos, cada uno con su clave.
    IF v_que = 'salta' THEN
      v_destino := NULLIF(v_paso->>'saltaA', '')::uuid;
      IF v_destino IS NOT NULL AND NOT (v_destino = ANY(p_cadena)) THEN
        v_hechas := v_hechas + public.app_correr_una_automatizacion(
          v_destino, p_client, p_ocurrencia, v_due, p_prefs, p_proto,
          p_saltos + 1, p_cadena || v_destino
        );
      END IF;
      CONTINUE;
    END IF;

    -- ── Lo que el paso necesita para poder salir ───────────────────────────
    --
    -- El gemelo de `pasoListo` + las guardas de `filasDeEnvio`. Un paso a medio
    -- escribir no se intenta: `client_actions` lo rechazaría por su propio
    -- CHECK —una entrega sin enlace es una fila rota—, y el apunte se quedaría
    -- puesto diciendo que corrió.
    v_form := NULL;
    IF v_que = 'form' THEN
      /*
        Solo los MANDABLES: un formulario de alta o el check-in no viajan como
        acción suelta porque sus preguntas no viven en `elementos`, y congelar
        `elementos: []` le manda al cliente una hoja en blanco. Es el mismo
        criterio que `formulariosMandables` en el dominio, comprobado otra vez
        aquí porque la base no puede fiarse de quién escribió la fila.
      */
      SELECT f INTO v_form
      FROM jsonb_array_elements(COALESCE(p_prefs->'formularios'->'items', '[]'::jsonb)) f
      WHERE f->>'id' = v_paso->>'formId'
        AND f->>'momento' = 'libre'
        AND jsonb_typeof(f->'elementos') = 'array'
        AND jsonb_array_length(f->'elementos') > 0
      LIMIT 1;
      IF v_form IS NULL THEN CONTINUE; END IF;
      v_titulo := NULLIF(TRIM(LEFT(COALESCE(v_form->>'name', ''), 80)), '');
    END IF;

    IF v_titulo IS NULL THEN CONTINUE; END IF;
    IF v_que IN ('documento', 'video') AND v_enlace IS NULL THEN CONTINUE; END IF;
    IF v_que NOT IN ('form', 'pide', 'documento', 'video', 'tarea') THEN CONTINUE; END IF;

    -- ── 1. Pedir vez ───────────────────────────────────────────────────────
    --
    -- El índice único de la 0116 es quien impide de verdad el doble disparo, y
    -- aquí es más simple que en el navegador: si la fila no llega a escribirse,
    -- esta transacción se va entera y el apunte con ella.
    v_apunte := NULL;
    INSERT INTO public.automation_runs (client_id, automation_id, paso_id, ocurrencia)
    VALUES (p_client, v_auto.id, v_pasoid, p_ocurrencia)
    ON CONFLICT (client_id, automation_id, paso_id, ocurrencia) DO NOTHING
    RETURNING id INTO v_apunte;

    IF v_apunte IS NULL THEN CONTINUE; END IF;   -- ya estaba: lo hizo otro

    -- ── 2. Hacer lo que el paso diga ───────────────────────────────────────
    IF v_que = 'tarea' THEN
      /* Lo tuyo: una casilla en tu agenda, PRIVADA (0106). El cliente no ve que
         te has puesto un recordatorio sobre él. */
      INSERT INTO public.client_events (client_id, date, kind, title, privada, created_by)
      VALUES (p_client, v_due, 'note', v_titulo, true, v_auto.coach_id)
      RETURNING id INTO v_evento;

      UPDATE public.automation_runs SET event_id = v_evento WHERE id = v_apunte;
    ELSE
      /*
        Y la fila con la misma forma que escribe `filasDeEnvio`, sin una sola
        diferencia que el cliente pueda notar: el esquema se COPIA —congelado, no
        referenciado— para que corregir una pregunta mañana no cambie lo que
        alguien tiene a medias hoy; la audiencia queda escrita para poder leer
        meses después de dónde salió; y `origen` dice que esto no lo mandaste tú.
      */
      INSERT INTO public.client_actions (
        envio_id, client_id, form_id, tipo, title, body, link, schema, due
      ) VALUES (
        gen_random_uuid(),
        p_client,
        CASE WHEN v_que = 'form' THEN v_form->>'id' ELSE NULL END,
        v_que,
        v_titulo,
        v_nota,
        CASE WHEN v_que IN ('documento', 'video') THEN v_enlace ELSE NULL END,
        CASE WHEN v_que = 'form'
          THEN jsonb_build_object('elementos', v_form->'elementos')
          ELSE '{}'::jsonb
        END
        || jsonb_build_object(
             'audiencia', jsonb_build_object('tipo', 'protocolo', 'valor', p_proto),
             'origen', jsonb_build_object('tipo', 'auto', 'id', v_auto.id, 'nombre', v_nombre)
           ),
        v_due
      )
      RETURNING id INTO v_accion;

      -- ── 3. Rematar: qué salió de este apunte ─────────────────────────────
      -- Es lo que permite cancelar la fila desde la cola y que la corrida siga
      -- contando como hecha, o sea que cancelar no sea «vuélvemelo a mandar».
      UPDATE public.automation_runs SET action_id = v_accion WHERE id = v_apunte;
    END IF;

    v_hechas := v_hechas + 1;
  END LOOP;

  RETURN v_hechas;
END;
$$;

REVOKE ALL ON FUNCTION
  public.app_correr_una_automatizacion(uuid, uuid, text, date, jsonb, text, int, uuid[])
  FROM public, anon;

-- ── 3. El motor ─────────────────────────────────────────────────────────────
--
-- Recibe UN hecho —de quién, de qué clase, cuál es y de qué día— y escribe lo
-- que ese hecho tenga que desencadenar.
--
-- ══ Lo que NO hay que calcular aquí, y por eso esto cabe ══════════════════
--
-- Todo el criterio difícil de `loQueToca` —las semanas ISO, el horizonte de 35
-- días, contar la cadencia desde el alta de cada uno— es del motor 1, porque el
-- motor 1 tiene que ADIVINAR cuándo toca. Aquí el disparo ya ha pasado: su día
-- es el día del hecho y su `ocurrencia` es el id del hecho. Lo único que queda
-- es recorrer los pasos y escribir sus filas, que es una forma, no un juicio.
--
-- ══ Las tres escrituras, sin la danza del navegador ═══════════════════════
--
-- En `useAutomatizaciones` hay que apuntar la corrida, hacer lo que diga el paso
-- y borrar el apunte si falla, porque entre las tres puede desaparecer el
-- navegador. Aquí las tres van en la misma transacción: si la fila no se
-- escribe, el apunte tampoco existe. No hay apuntes a medias que barrer, y el
-- índice único sigue siendo quien impide el doble disparo.
--
-- ══ Y el pasado no se reparte ═════════════════════════════════════════════
--
-- Dos puertas, y las dos hacen falta:
--
--   · **Nada anterior a la regla** (`created_at`). Es la decisión del §12.4 del
--     plan, ya tomada para el motor 1: escribir una regla no la ejecuta hacia
--     atrás.
--   · **Nada más viejo que la ventana.** Un pesaje se apunta con SU fecha, y el
--     entrenador puede cargar tres meses de historial de golpe: sin esto, cada
--     una de esas noventa filas sería un disparo. Catorce días es lo que tarda
--     cualquiera en pasar a limpio un peso de la semana pasada.

CREATE OR REPLACE FUNCTION public.correr_automatizaciones_del_cliente(
  p_client     uuid,
  p_disparador text,
  p_ocurrencia text,
  p_desde      date,
  p_forma      text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  /* Cuánto puede haber pasado entre el hecho y su apunte para que siga
     contando como que acaba de pasar. Ver la cabecera. */
  VENTANA  constant int := 14;

  v_coach  uuid;
  v_estado text;
  v_prefs  jsonb;
  v_proto  text;
  v_auto   public.coach_automations%ROWTYPE;
  v_hechas int := 0;
BEGIN
  IF p_client IS NULL OR p_ocurrencia IS NULL OR p_desde IS NULL THEN
    RETURN 0;
  END IF;

  /* Ni pausados ni archivados, nunca. Es la misma puerta que `activo()` en el
     dominio: a quien no está contigo no se le manda nada. */
  SELECT c.coach_id, c.status INTO v_coach, v_estado
  FROM public.clients c WHERE c.id = p_client;
  IF v_coach IS NULL OR v_estado IN ('paused', 'archived') THEN
    RETURN 0;
  END IF;

  IF p_desde < current_date - VENTANA THEN
    RETURN 0;
  END IF;

  SELECT p.preferences INTO v_prefs FROM public.profiles p WHERE p.id = v_coach;
  v_proto := public.app_protocolo_de_cliente(p_client);

  FOR v_auto IN
    SELECT a.* FROM public.coach_automations a
    WHERE a.coach_id = v_coach
      AND a.protocolo_id = v_proto
      AND a.activa
      AND a.disparador = p_disparador
      /* Escribir una regla no la ejecuta hacia atrás (§12.4). */
      AND p_desde >= a.created_at::date
      /*
        Y el filtro del propio disparador. `contesta` puede ir acotado a UN
        formulario: sin acotar, «cuando conteste su alta, mándale el vídeo» le
        mandaría el vídeo también con cada check-in. La comparación es de texto
        contra texto —`client_actions.form_id`— así que la base acierta sin
        saber qué es un formulario.
      */
      AND (
        p_disparador <> 'contesta'
        OR a.valor->>'formId' IS NULL
        OR a.valor->>'formId' = p_forma
      )
    ORDER BY a.orden, a.id
  LOOP
    /*
      ══ UNA ROTA NO SE LLEVA A LAS DEMÁS ═══════════════════════════════════

      Cada automatización va en su propio bloque, que en PL/pgSQL es una
      subtransacción: si una revienta —un `saltaA` que no es un uuid, un paso con
      un día imposible— se deshace lo suyo y las otras siguen. Con un solo
      `EXCEPTION` alrededor del bucle, la primera rota borraba también lo que ya
      habían escrito las anteriores, y sin decir nada.
    */
    BEGIN
      v_hechas := v_hechas + public.app_correr_una_automatizacion(
        v_auto.id, p_client, p_ocurrencia, p_desde, v_prefs, v_proto, 0, ARRAY[v_auto.id]
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'automatización % del cliente %: %', v_auto.id, p_client, SQLERRM;
    END;
  END LOOP;

  RETURN v_hechas;
EXCEPTION WHEN OTHERS THEN
  /*
    Y la red de fuera. El que está delante es el cliente entregando su check-in,
    y lo que no puede pasar es que no pueda entregarlo porque una automatización
    del entrenador está rota. Se anota en el registro del servidor y se sigue.
  */
  RAISE WARNING 'automatizaciones: % (cliente %, disparador %)', SQLERRM, p_client, p_disparador;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.correr_automatizaciones_del_cliente(uuid, text, text, date, text)
  FROM public, anon;

-- ── 4. «Cuando te conteste» ─────────────────────────────────────────────────
--
-- El hecho es que `submitted_at` pasa de vacío a tener fecha. La `ocurrencia` es
-- **el id de esa acción**, que es lo que hace que esto sea idempotente para
-- siempre sin ninguna cuenta: una acción se entrega una vez, y corregir lo
-- contestado después no vuelve a disparar (`marcar_accion` conserva
-- `submitted_at` con un `COALESCE`, así que `OLD` ya no está vacío).

CREATE OR REPLACE FUNCTION public.tg_automatizaciones_al_contestar()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  /*
    Y solo lo que ENTREGA él: un formulario contestado o un «pídele» marcado.
    Un vídeo o un documento también pasan por `marcar_accion` —abrirlo lo da por
    hecho— pero eso es algo que le mandas tú, no algo que te contesta, y hacer
    que «cuando te conteste» saltara al abrir un vídeo sería mentirle al verbo.
  */
  IF NEW.submitted_at IS NOT NULL
     AND OLD.submitted_at IS NULL
     AND NEW.tipo IN ('form', 'pide') THEN
    PERFORM public.correr_automatizaciones_del_cliente(
      NEW.client_id, 'contesta', NEW.id::text, NEW.submitted_at::date, NEW.form_id
    );
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_automatizaciones_al_contestar() FROM public, anon;

DROP TRIGGER IF EXISTS client_actions_automatiza ON public.client_actions;
/*
  `AFTER UPDATE` y solo UPDATE: lo que este motor escribe son INSERT con
  `submitted_at` vacío, así que no hay forma de que se llame a sí mismo. Es la
  puerta cerrada al bucle, y es estructural — no una comprobación que alguien
  pueda quitar sin darse cuenta.
*/
CREATE TRIGGER client_actions_automatiza
  AFTER UPDATE OF submitted_at ON public.client_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_automatizaciones_al_contestar();

-- ── 5. «Cuando se pese» ─────────────────────────────────────────────────────
--
-- Aquí no hay fila por pesaje: `anthropometry` tiene una fila por cliente y un
-- `history` (jsonb) que se reescribe entero en cada guardado. Así que el hecho
-- es **una entrada que antes no estaba**, y la `ocurrencia` es su `id`.
--
-- Comparar contra `OLD.history` y no contar el largo: un guardado puede añadir
-- una entrada y corregir otra a la vez, y contar diría que hay una nueva sin
-- saber cuál.

CREATE OR REPLACE FUNCTION public.tg_automatizaciones_al_pesarse()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_viejos text[] := ARRAY[]::text[];
  v_entrada jsonb;
  v_dia    date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(x->>'id'), ARRAY[]::text[]) INTO v_viejos
    FROM jsonb_array_elements(COALESCE(OLD.history, '[]'::jsonb)) x
    WHERE x->>'id' IS NOT NULL;
  END IF;

  FOR v_entrada IN
    SELECT x FROM jsonb_array_elements(COALESCE(NEW.history, '[]'::jsonb)) x
  LOOP
    CONTINUE WHEN v_entrada->>'id' IS NULL OR v_entrada->>'id' = ANY(v_viejos);

    /* Una fecha ilegible no tumba el guardado de nadie: esa entrada se queda sin
       disparar y las demás siguen. */
    BEGIN
      v_dia := (v_entrada->>'date')::date;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    PERFORM public.correr_automatizaciones_del_cliente(
      NEW.client_id, 'pesaje', v_entrada->>'id', v_dia, NULL
    );
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_automatizaciones_al_pesarse() FROM public, anon;

DROP TRIGGER IF EXISTS anthropometry_automatiza ON public.anthropometry;
CREATE TRIGGER anthropometry_automatiza
  AFTER INSERT OR UPDATE OF history ON public.anthropometry
  FOR EACH ROW EXECUTE FUNCTION public.tg_automatizaciones_al_pesarse();

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Que los disparadores están puestos (dos filas):
--
--   SELECT tgname, tgrelid::regclass FROM pg_trigger
--   WHERE tgname IN ('client_actions_automatiza', 'anthropometry_automatiza');
--
-- 2) Que contestar dispara. Con una automatización tuya de disparador
--    `contesta` y un paso completo, y una acción sin entregar de un cliente que
--    lleve ese protocolo:
--
--   SELECT public.marcar_accion('<id de la acción>', '{"q1":"7"}'::jsonb);
--   SELECT count(*) FROM public.automation_runs WHERE ocurrencia = '<id de la acción>';
--   -- 1 por cada paso que mande algo. Repetir `marcar_accion` NO añade ninguna.
--
-- 3) Que un pesaje viejo no reparte historia:
--
--   UPDATE public.anthropometry
--   SET history = history || jsonb_build_array(
--     jsonb_build_object('id', 'anth_prueba', 'date', (current_date - 90)::text, 'weight', 80))
--   WHERE client_id = '<cliente>';
--   SELECT count(*) FROM public.automation_runs WHERE ocurrencia = 'anth_prueba';  -- 0
--
-- Y la de verdad, la que está escrita:
-- `supabase/tests/automatizaciones-motor2.test.js`, con dos sesiones reales.
-- ============================================================================
