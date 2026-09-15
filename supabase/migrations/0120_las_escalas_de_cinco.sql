-- ============================================================================
-- Las escalas de cinco: lo contestado se convierte con el instrumento
-- ----------------------------------------------------------------------------
-- ⚠️  MODIFICA DATOS YA GUARDADOS. Es la única de su clase hasta ahora: no
--     añade nada ni cambia permisos, reescribe respuestas. Se ejecuta una sola
--     vez y es IDEMPOTENTE — una segunda pasada no encuentra nada que convertir,
--     porque solo toca valores mayores que 5 (ver más abajo por qué eso basta).
--
-- ⚠️  Se despliega ANTES que el código, pero el orden importa poco: con la
--     migración puesta y el código viejo, las ocho preguntas se verían con la
--     rampa de 0 a 10 y la respuesta pintada baja (un 4 donde antes había un 8).
--     Con el código nuevo y sin migración, los gráficos del entrenador
--     enseñarían las semanas viejas topadas al máximo. Las dos cosas se
--     arreglan solas en cuanto van las dos.
--
-- ══ Qué ha cambiado arriba ═════════════════════════════════════════════════
--
-- El cuestionario del cliente deja de contestarse siempre con la misma rampa de
-- diez pasos. Ocho preguntas estrenan INSTRUMENTO (`domain/protocol.js`):
--
--   · estrellas — adherencia, sueño (sesión y semana), digestiones
--   · caras     — sensaciones, ganas de seguir
--   · depósito  — energía (sesión y semana)
--
-- Y un instrumento manda sobre su rango: cinco estrellas son cinco, no diez
-- medias estrellas. Las ocho bajan de 1-10 a 1-5.
--
-- ══ Por qué hay que tocar lo guardado ══════════════════════════════════════
--
-- Porque una serie que cambia de regla a mitad de camino MIENTE, y calladamente.
-- El gráfico de adherencia normaliza por el `max` de la pregunta
-- (`ui/Subjetivo`, `domain/readiness`), así que a partir de hoy un 4 vale el
-- 80 %. Las semanas de antes guardaron un 8 que significaba ese mismo 80 %, y
-- sin convertirlas se pintarían al 160 %: recortadas al techo. El entrenador
-- vería una línea plana en lo más alto durante meses y una caída en seco el día
-- del despliegue, y esa caída no ocurrió.
--
-- ══ La conversión, y por qué CEIL y no ROUND ═══════════════════════════════
--
--   ceil(v / 2):  1,2 → 1   3,4 → 2   5,6 → 3   7,8 → 4   9,10 → 5
--
-- `round` mandaría el 1 a cero, y cero no existe en una escala que empieza en
-- uno: una respuesta dada se convertiría en un hueco. `ceil` conserva las cinco
-- casillas y reparte los diez valores de dos en dos.
--
-- ── Y por qué solo se tocan los valores > 5 ────────────────────────────────
-- Es lo que hace la migración idempotente sin llevar una marca aparte. Un 6 o
-- más solo puede venir de la escala vieja, así que se convierte. Un 5 o menos ya
-- está en rango y se queda como está: puede ser una respuesta nueva (un 4 = 4
-- estrellas) o una vieja baja (un 4 de 10 que «debería» ser 2). Ese segundo caso
-- es el precio, y es el barato: son las respuestas de la mitad floja de la
-- escala, donde el error es de un escalón. Lo caro —la mitad alta recortada al
-- techo— es justo lo que sí se arregla. La alternativa era marcar cada respuesta
-- con la escala en la que se dio, o sea cambiar el formato de todo lo guardado
-- para poder convertir una vez.
--
-- ══ Dónde vive cada respuesta ══════════════════════════════════════════════
--
--   · el check-in semanal → `check_ins.answers`, un jsonb plano de id → valor.
--   · el parte de la sesión → `workout_data.microcycles`, y ahí dentro
--     `[*].sessions[*].feedback`, que es el mismo mapa un par de pisos más
--     abajo. Las sesiones HEREDADAS (las que `legacySession` fabrica a partir de
--     `days`) no tienen feedback, así que no hay un tercer sitio.
--
-- Los valores se guardan como TEXTO en los dos sitios (la escala devuelve
-- texto), así que se convierten con cuidado: solo los que son un número entero
-- escrito, y se devuelven como texto.
-- ============================================================================


BEGIN;

/*
  La conversión de un valor suelto. Devuelve el mismo jsonb si no hay nada que
  convertir, de modo que quien la llama puede comparar y no escribir.

  `pg_temp` y no `public`: es una herramienta de esta migración y no parte del
  esquema. Al acabar la sesión desaparece sola y no queda una función huérfana
  con nombre de verbo en la base de datos de nadie.
*/
CREATE FUNCTION pg_temp.a_cinco(v jsonb) RETURNS jsonb AS $$
DECLARE
  n numeric;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) NOT IN ('string', 'number') THEN
    RETURN v;
  END IF;

  BEGIN
    n := (v #>> '{}')::numeric;
  EXCEPTION WHEN OTHERS THEN
    -- Lo que no es un número se queda intacto. No debería haberlo, pero una
    -- migración que revienta por un dato raro deja la mitad del trabajo hecha.
    RETURN v;
  END;

  IF n <= 5 THEN
    RETURN v;
  END IF;

  -- De vuelta a texto, que es como lo escribe el cliente.
  RETURN to_jsonb(ceil(n / 2)::int::text);
END;
$$ LANGUAGE plpgsql IMMUTABLE;


/*
  Las ocho preguntas, repartidas por dónde se contestan. Escritas a mano y no
  leídas de ningún sitio: la base de datos no conoce el catálogo, y meterlo aquí
  sería una segunda copia de `domain/protocol.js`.
*/
CREATE FUNCTION pg_temp.de_la_semana() RETURNS text[] AS $$
  SELECT ARRAY['adherence', 'week_sleep', 'week_energy', 'digestion', 'motivation'];
$$ LANGUAGE sql IMMUTABLE;

CREATE FUNCTION pg_temp.de_la_sesion() RETURNS text[] AS $$
  SELECT ARRAY['sleep', 'energy', 'mood'];
$$ LANGUAGE sql IMMUTABLE;


-- ── 1 · El check-in semanal ────────────────────────────────────────────────
-- Un jsonb plano: se recorren las cinco claves y se reescribe la que cambie.
UPDATE public.check_ins AS c
SET answers = (
  SELECT COALESCE(jsonb_object_agg(
    clave,
    CASE WHEN clave = ANY (pg_temp.de_la_semana()) THEN pg_temp.a_cinco(valor) ELSE valor END
  ), '{}'::jsonb)
  FROM jsonb_each(c.answers) AS respuesta(clave, valor)
)
WHERE c.answers IS NOT NULL
  AND jsonb_typeof(c.answers) = 'object'
  /* Solo las filas que de verdad tienen algo que convertir. Sin esto, la
     migración reescribe todos los check-ins de la base para dejarlos igual. */
  AND EXISTS (
    SELECT 1
    FROM jsonb_each(c.answers) AS respuesta(clave, valor)
    WHERE clave = ANY (pg_temp.de_la_semana())
      AND pg_temp.a_cinco(valor) IS DISTINCT FROM valor
  );


-- ── 2 · El parte de cada sesión ────────────────────────────────────────────
/*
  Aquí las respuestas están dos pisos más abajo, así que hay que reconstruir el
  jsonb entero: microciclos → sesiones → feedback. Se hace con `jsonb_agg` y
  `WITH ORDINALITY` en los dos niveles, porque **el orden de los microciclos y
  el de las sesiones es dato** —el programa se lee en orden— y un `jsonb_agg`
  sin ordenar no lo garantiza.

  Todo lo que no es `feedback` se conserva tal cual con `||`: la sesión mantiene
  sus series, sus notas y sus sellos, y el microciclo sus días. Esta fila
  contiene el programa entero de una persona y esta migración solo tiene permiso
  moral para tocar ocho claves.
*/
UPDATE public.workout_data AS w
SET microcycles = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(micro -> 'sessions') = 'array' THEN
        micro || jsonb_build_object('sessions', (
          SELECT COALESCE(jsonb_agg(
            CASE
              WHEN jsonb_typeof(sesion -> 'feedback') = 'object' THEN
                sesion || jsonb_build_object('feedback', (
                  /* COALESCE porque `jsonb_object_agg` de cero filas devuelve
                     NULL, y una sesión con `feedback: {}` —las hay: se abre el
                     parte y no se contesta— se habría quedado con un
                     `feedback: null` que no había escrito nadie. */
                  SELECT COALESCE(jsonb_object_agg(
                    clave,
                    CASE WHEN clave = ANY (pg_temp.de_la_sesion()) THEN pg_temp.a_cinco(valor) ELSE valor END
                  ), '{}'::jsonb)
                  FROM jsonb_each(sesion -> 'feedback') AS respuesta(clave, valor)
                ))
              ELSE sesion
            END
            ORDER BY orden_sesion
          ), '[]'::jsonb)
          FROM jsonb_array_elements(micro -> 'sessions') WITH ORDINALITY AS s(sesion, orden_sesion)
        ))
      ELSE micro
    END
    ORDER BY orden_micro
  )
  FROM jsonb_array_elements(w.microcycles) WITH ORDINALITY AS m(micro, orden_micro)
)
WHERE jsonb_typeof(w.microcycles) = 'array'
  AND jsonb_array_length(w.microcycles) > 0
  /* Igual que arriba: no se reescribe el programa de nadie que no tenga una
     respuesta que convertir. */
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(w.microcycles) AS micro
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(micro -> 'sessions') = 'array' THEN micro -> 'sessions' ELSE '[]'::jsonb END
    ) AS sesion
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sesion -> 'feedback') = 'object' THEN sesion -> 'feedback' ELSE '{}'::jsonb END
    ) AS respuesta(clave, valor)
    WHERE clave = ANY (pg_temp.de_la_sesion())
      AND pg_temp.a_cinco(valor) IS DISTINCT FROM valor
  );

COMMIT;
