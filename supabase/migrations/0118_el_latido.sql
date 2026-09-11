-- ============================================================================
-- El latido: lo que no provoca nadie
-- ----------------------------------------------------------------------------
-- ⚠️  No crea tablas ni columnas: dos funciones. Antes de aplicarla el
--     disparador nuevo del carril —«Cuando lleve tiempo sin…»— se puede escribir
--     y guardar, y no pasa nada; después, pasa. Se puede desplegar antes o
--     después del código sin romper nada en ninguno de los dos órdenes.
--
-- ══ El motor 3, y por qué necesita que alguien mire ════════════════════════
--
-- Los otros dos cuelgan de un hecho. El motor 1 sabe la fecha del disparo antes
-- de que llegue —el alta de alguien, el lunes que viene— y escribe la fila por
-- adelantado. El motor 2 espera a que el hecho ocurra y le cuelga un disparador
-- de tabla (0117).
--
-- Aquí lo que dispara es **una ausencia**, y una ausencia no escribe ninguna
-- fila. No hay a qué colgarse: quien no entrena no deja rastro, y por eso la
-- única forma de enterarse es que alguien lo mire. Mirarlo todos los días a la
-- misma hora es el latido de las 07:00, que ya estaba desplegado
-- (`wrangler.jsonc` → `worker.mjs`) y solo servía para el bot de la radiografía.
-- Lo que cambia con esta migración es QUIÉN llama, no lo que se hace.
--
-- ══ La ocurrencia de una ausencia: EL SILENCIO, no el día ══════════════════
--
-- Ésta es la decisión de la migración y es la que evita el aviso diario.
--
-- La `ocurrencia` de la 0116 dice «qué vez es». En el motor 2 es el id del hecho
-- y con eso basta. Aquí no hay hecho, y lo primero que se le ocurre a cualquiera
-- —la fecha de hoy— sería lo peor posible: quien lleva veinte días sin entrenar
-- recibiría el mismo mensaje veinte mañanas seguidas.
--
-- Así que la ocurrencia es **el silencio**, y un silencio se nombra por dónde
-- empieza: `sin:entrenar:2026-08-01` es «la racha que arranca el día que entrenó
-- por última vez». Mientras siga callado la clave no cambia y el índice único de
-- la 0116 rebota el segundo intento. El día que entrene, la referencia se mueve
-- sola, y si vuelve a desaparecer eso es OTRO silencio con su propia clave y su
-- propio aviso.
--
-- Una sola cadena de texto convierte «avísame si lleva diez días sin entrenar»
-- en «avísame UNA vez por cada vez que se calle». Sin contadores y sin estado.
--
-- ══ Sin rastro y sin alta no se mide ═══════════════════════════════════════
--
-- Quien nunca ha entrenado no tiene última sesión, así que la referencia es su
-- ALTA: contar desde que empezó contigo es lo que hace que el que no arranca
-- —que es justo el que hay que atender— no se quede fuera para siempre. Y quien
-- no tiene ni alta se queda fuera hasta que la tenga, igual que en `disparosDe`:
-- ponerle «hoy» sería inventarle un comienzo.
--
-- ══ Y una diferencia con el §12.4, dicha en voz alta ═══════════════════════
--
-- Para el motor 1 se decidió que escribir una regla no la ejecuta hacia atrás:
-- una automatización nueva no reparte las altas de marzo. Aquí NO se aplica esa
-- puerta, y no es un olvido: un silencio no es pasado, **es un estado presente**.
-- Quien lleva tres meses sin pesarse lo lleva hoy, y es exactamente la persona
-- por la que el entrenador escribe la regla. La consecuencia hay que conocerla:
-- la primera mañana después de encenderla puede salir un aviso por cada cliente
-- que ya esté callado. Es una vez por persona y por silencio, no un goteo.
-- ============================================================================

DO $guardas$
BEGIN
  IF to_regclass('public.coach_automations') IS NULL THEN
    RAISE EXCEPTION 'Falta 0116_lo_que_pasa_solo.sql: no existe `coach_automations`.';
  END IF;
  IF to_regprocedure(
       'public.app_correr_una_automatizacion(uuid, uuid, text, date, jsonb, text, int, uuid[])'
     ) IS NULL THEN
    RAISE EXCEPTION 'Falta 0117_lo_que_provoca_el_cliente.sql: no existe `app_correr_una_automatizacion()`.';
  END IF;
  IF to_regprocedure('public.app_protocolo_de_cliente(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0117_lo_que_provoca_el_cliente.sql: no existe `app_protocolo_de_cliente()`.';
  END IF;
END
$guardas$;

BEGIN;

-- ── 1. Cuándo fue la última vez ─────────────────────────────────────────────
--
-- Las tres ausencias que se pueden vigilar, cada una leída de donde ya se lee:
--
--   entrenar   la sesión anotada en su microciclo. Lo mismo que
--              `training_summaries()` (0110) y que `trainingSummary.lastTraining`
--              en `domain/sessions.js`: el máximo de las que TIENEN fecha.
--   pesarse    una entrada de su evolución. Lo mismo que `lastWeight` en
--              `domain/portfolio.js`.
--   contestar  lo que ENTREGA él —un formulario contestado, un «pídele»
--              marcado—. Es la misma definición que dispara «Cuando te conteste»
--              en la 0117, y tiene que serlo: dos definiciones de «contestar» en
--              la misma pantalla serían dos verdades.
--
-- El texto se comprueba con una expresión regular ANTES de convertirlo, por lo
-- mismo que la 0110 con `reps`: una fecha escrita a mano en un JSONB de hace dos
-- años tumbaría la consulta entera, y con ella el latido de todo el mundo.

CREATE OR REPLACE FUNCTION public.app_ultimo_de(p_client uuid, p_que text)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_iso text;
BEGIN
  IF p_que = 'entrenar' THEN
    SELECT max(s->>'date') INTO v_iso
    FROM public.workout_data w,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(w.microcycles) = 'array' THEN w.microcycles ELSE '[]'::jsonb END
         ) m,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(m->'sessions') = 'array' THEN m->'sessions' ELSE '[]'::jsonb END
         ) s
    WHERE w.client_id = p_client
      AND s->>'date' ~ '^\d{4}-\d{2}-\d{2}$';

  ELSIF p_que = 'pesarse' THEN
    SELECT max(h->>'date') INTO v_iso
    FROM public.anthropometry a,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(a.history) = 'array' THEN a.history ELSE '[]'::jsonb END
         ) h
    WHERE a.client_id = p_client
      AND h->>'date' ~ '^\d{4}-\d{2}-\d{2}$';

  ELSIF p_que = 'contestar' THEN
    SELECT max(ca.submitted_at)::date::text INTO v_iso
    FROM public.client_actions ca
    WHERE ca.client_id = p_client
      AND ca.submitted_at IS NOT NULL
      AND ca.tipo IN ('form', 'pide');

  ELSE
    RETURN NULL;
  END IF;

  RETURN v_iso::date;
END;
$fn$;

REVOKE ALL ON FUNCTION public.app_ultimo_de(uuid, text) FROM public, anon, authenticated;

-- ── 2. El latido ────────────────────────────────────────────────────────────
--
-- Una vez al día, para todos. Recorre a quien pueda estar callado, mira desde
-- cuándo lo está y reparte lo que su automatización diga.
--
-- ══ Por qué llama a `app_correr_una_automatizacion` y no al motor 2 ════════
--
-- `correr_automatizaciones_del_cliente` (0117) corre TODAS las del disparador de
-- golpe, porque su unidad de trabajo es un hecho: pasó algo, que corra lo que
-- escuche. Aquí la unidad es otra —una automatización concreta, con SU umbral y
-- SU «sin qué», para una persona concreta—, y dos reglas de silencio distintas
-- del mismo protocolo tienen que dispararse por separado o cada una acabaría
-- mandando lo de la otra.
--
-- Lo que sí se comparte es el núcleo, que es donde vive todo lo que puede
-- equivocarse: recorrer los pasos, comprobar que están completos, pedir vez en
-- el libro y escribir la fila. Una segunda copia de eso sería una segunda
-- versión de lo que el cliente recibe.
--
-- ══ Las tres puertas cerradas ══════════════════════════════════════════════
--
--   · **Ni pausados ni archivados.** La misma puerta que `activo()` en el
--     dominio y que el motor 2: a quien no está contigo no se le manda nada.
--   · **Solo la gente de quien tiene alguna regla de silencio.** Sin el `EXISTS`
--     el latido resolvería el protocolo de la base entera cada mañana para no
--     hacer nada con casi ninguno.
--   · **Cada automatización en su propio bloque**, que en PL/pgSQL es una
--     subtransacción. Una rota —un `dias` que no es un número, un paso
--     imposible— se deshace sola y las demás siguen. Con un `EXCEPTION` alrededor
--     del bucle, la primera rota borraría lo que ya hubieran escrito las
--     anteriores y el latido entero devolvería cero sin decir por qué.

CREATE OR REPLACE FUNCTION public.correr_el_latido()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  MIN_DIAS constant int := 3;    -- el suelo y el techo son `MIN_SILENCIO` y
  MAX_DIAS constant int := 90;   -- `MAX_SILENCIO`, en `domain/automatizaciones.js`

  v_cli    record;
  v_auto   record;
  v_coach  uuid := NULL;
  v_prefs  jsonb;
  v_proto  text;
  v_que    text;
  v_dias   int;
  v_ultimo date;
  v_hechas int := 0;
BEGIN
  FOR v_cli IN
    SELECT c.id, c.coach_id, c.start_date
    FROM public.clients c
    WHERE COALESCE(c.status, '') NOT IN ('paused', 'archived')
      AND EXISTS (
        SELECT 1 FROM public.coach_automations a
        WHERE a.coach_id = c.coach_id AND a.activa AND a.disparador = 'silencio'
      )
    /* Por entrenador, para leer sus preferencias UNA vez: ahí dentro están los
       formularios que un paso `form` necesita, y son el objeto más grande que
       toca esta función. */
    ORDER BY c.coach_id, c.id
  LOOP
    IF v_coach IS DISTINCT FROM v_cli.coach_id THEN
      v_coach := v_cli.coach_id;
      SELECT p.preferences INTO v_prefs FROM public.profiles p WHERE p.id = v_coach;
    END IF;

    /* Resolver antes de comparar: `preferences->>'protocolId'` devuelve lo
       ESCRITO y casi nadie tiene nada escrito. Ya costó una tarde en la tanda 2. */
    v_proto := public.app_protocolo_de_cliente(v_cli.id);

    FOR v_auto IN
      SELECT a.* FROM public.coach_automations a
      WHERE a.coach_id = v_cli.coach_id
        AND a.protocolo_id = v_proto
        AND a.activa
        AND a.disparador = 'silencio'
      ORDER BY a.orden, a.id
    LOOP
      BEGIN
        v_que := COALESCE(v_auto.valor->>'que', 'entrenar');
        CONTINUE WHEN v_que NOT IN ('entrenar', 'pesarse', 'contestar');

        v_dias := GREATEST(LEAST(COALESCE((v_auto.valor->>'dias')::int, 10), MAX_DIAS), MIN_DIAS);

        /* Sin rastro, desde su alta. Sin alta tampoco, fuera hasta que la tenga. */
        v_ultimo := COALESCE(public.app_ultimo_de(v_cli.id, v_que), v_cli.start_date);
        CONTINUE WHEN v_ultimo IS NULL;
        CONTINUE WHEN current_date - v_ultimo < v_dias;

        /*
          El día del disparo es HOY —la mañana en que se nota—, no el día en que
          se cumplió el plazo. Con lo segundo, quien ya llevaba tres meses callado
          cuando se escribió la regla tendría un disparo fechado en el pasado que
          el propio motor descartaría por viejo: la persona por la que se escribió
          la regla sería la única a la que nunca le llegaría.
        */
        v_hechas := v_hechas + public.app_correr_una_automatizacion(
          v_auto.id,
          v_cli.id,
          'sin:' || v_que || ':' || v_ultimo::text,
          current_date,
          v_prefs,
          v_proto,
          0,
          ARRAY[v_auto.id]
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'latido: automatización % del cliente %: %', v_auto.id, v_cli.id, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  RETURN v_hechas;
END;
$fn$;

/*
  ══ Quién puede llamarlo: NADIE con sesión ═════════════════════════════════

  Esto reparte a la cartera entera de todos los entrenadores de golpe y corre con
  `SECURITY DEFINER`, así que no es de un usuario: es del reloj. Lo llama la
  función `latido` con la clave de servicio, y la función `latido` solo abre la
  puerta al que trae `LATIDO_CRON_SECRET`.

  `authenticated` incluido en el REVOKE, a diferencia de las de la 0117: aquéllas
  las llama un disparador de tabla dentro de la sesión del cliente y por eso
  bastaba con quitárselo a `public` y `anon`. Ésta no la llama nadie desde una
  sesión, nunca.

  ── Y el GRANT, que aquí SÍ hace falta ────────────────────────────────────
  Quitárselo a `public` se lo quita a todo el mundo, `service_role` incluido: en
  PostgreSQL el `EXECUTE` de una función lo concede `PUBLIC` por defecto y no hay
  ningún privilegio propio del rol de servicio debajo. Sin esta línea el latido
  contesta `42501` todas las mañanas —«permiso denegado»— y el único sitio donde
  se vería es el registro del worker. Es el 403 invisible de siempre
  (`politicas-rls-sin-grant`), esta vez en una función.

  Es además donde queda dicho quién puede: uno.
*/
REVOKE ALL ON FUNCTION public.correr_el_latido() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correr_el_latido() TO service_role;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Que la función está y no la puede llamar el navegador:
--
--   SELECT public.correr_el_latido();          -- con service_role: un entero
--   -- con la clave anónima desde PostgREST: 42501, permiso denegado
--
-- 2) Que una racha solo avisa una vez. Con una automatización de disparador
--    `silencio` (`{"que":"entrenar","dias":10}`) y un cliente sin sesiones:
--
--   SELECT public.correr_el_latido();   -- escribe sus pasos
--   SELECT public.correr_el_latido();   -- 0: la ocurrencia ya está en el libro
--   SELECT ocurrencia FROM public.automation_runs ORDER BY ran_at DESC LIMIT 1;
--   -- 'sin:entrenar:<su fecha de alta>'
--
-- 3) Que el reloj llama de verdad, una vez desplegado:
--
--   npx wrangler tail        ← «cron latido 200 {"ok":true,…}» a las 07:00 UTC
--
-- Y la de verdad, la que está escrita:
-- `supabase/tests/automatizaciones-motor3.test.js`.
-- ============================================================================
