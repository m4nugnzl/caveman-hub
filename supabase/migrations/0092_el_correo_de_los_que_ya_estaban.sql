-- ============================================================================
-- El correo de los que ya estaban
-- ----------------------------------------------------------------------------
-- ⚠️  PASADA DE DATOS, y la única de este proyecto que PISA valores escritos a
--     mano. No crea nada, no borra ninguna fila y no cambia ninguna función: lo
--     que hace es poner en `clients.email` la dirección de la cuenta enlazada,
--     para las fichas que ya lo estaban antes de la 0091.
--
-- ══ Por qué hace falta ═════════════════════════════════════════════════════
--
-- La 0091 sella el correo de la cuenta en dos momentos —al canjear la invitación
-- y al guardar «Quién eres»—, y los dos miran hacia adelante: el primero solo
-- pasa por quien entre a partir de ahora, y el segundo por quien abra su alta y
-- le dé a guardar. Un cliente enlazado hace tres meses que no vuelva a tocar esa
-- pantalla se queda con lo que su entrenador tecleó de memoria el día que lo dio
-- de alta, y esa dirección no la ha verificado nadie nunca.
--
-- ══ MIRA ESTO ANTES DE APLICARLA ═══════════════════════════════════════════
--
-- Esta pasada no se puede deshacer: `clients` no tiene disparador de auditoría
-- (la 0017 solo los pone en `workout_data`, `anthropometry`, `nutrition_plans` y
-- `check_ins`), así que la dirección anterior no queda registrada en ninguna
-- parte. Lo que se pisa es un dato de contacto que escribió el entrenador.
--
-- Con esto se ve exactamente qué va a cambiar, y en cuántas fichas, antes de
-- tocar nada:
--
--   SELECT c.name,
--          c.email                AS ahora,
--          btrim(u.email)         AS pasara_a_ser
--   FROM public.clients c
--   JOIN auth.users u ON u.id = c.client_profile_id
--   WHERE NULLIF(btrim(u.email), '') IS NOT NULL
--     AND c.email IS DISTINCT FROM btrim(u.email)
--   ORDER BY c.name;
--
-- Si de esa lista hay alguna que quieras conservar, cópiala a un lado —o a las
-- notas de esa ficha— antes de seguir.
--
-- ══ A quién NO toca ════════════════════════════════════════════════════════
--
--   · A las fichas SIN cuenta enlazada (`client_profile_id IS NULL`): no hay
--     ninguna dirección verificada que poner, así que se queda la del entrenador,
--     que es lo único que hay. Son, además, las que todavía no han recibido su
--     invitación.
--   · A las cuentas SIN correo —hay proveedores que no lo dan—: se queda lo que
--     hubiera, que es mejor que un hueco.
--   · A las que ya coinciden. `IS DISTINCT FROM` deja fuera también el caso del
--     `NULL`, y es lo que hace que aplicar esto dos veces sea aplicarlo una.
-- ============================================================================

BEGIN;

/*
  ── Devuelve las filas que cambia, y no un aviso ───────────────────────────

  Esto empezó siendo un `DO` con `RAISE NOTICE 'cambiadas: %'`, que es lo que
  parece natural para una pasada de datos y aquí es justo lo que no vale: **el
  editor SQL de Supabase no enseña los NOTICE**, solo filas. Aplicarla salía en
  verde y sin una palabra, indistinguible de no haber hecho nada.

  Con `RETURNING` dentro de un CTE, lo que se ve al aplicarla es la lista exacta
  de fichas tocadas con su correo nuevo — y una tabla vacía significa «no había
  nada que cambiar», que también es una respuesta. Sigue siendo idempotente: la
  segunda vez no devuelve ninguna fila porque ya no queda ninguna descuadrada.
*/
WITH cambiadas AS (
  UPDATE public.clients c
  SET email = btrim(u.email)
  FROM auth.users u
  /* El JOIN ya deja fuera a las fichas sin cuenta: `NULL = u.id` no es cierto
     para ninguna fila, así que no hace falta decirlo dos veces. */
  WHERE u.id = c.client_profile_id
    AND NULLIF(btrim(u.email), '') IS NOT NULL
    AND c.email IS DISTINCT FROM btrim(u.email)
  RETURNING c.name, c.email
)
SELECT name AS ficha, email AS correo_puesto FROM cambiadas ORDER BY name;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que no queda ninguna descuadrada (tiene que dar 0):
--
--   SELECT count(*)
--   FROM public.clients c
--   JOIN auth.users u ON u.id = c.client_profile_id
--   WHERE NULLIF(btrim(u.email), '') IS NOT NULL
--     AND c.email IS DISTINCT FROM btrim(u.email);
--
-- Cómo ha quedado cada ficha enlazada:
--
--   SELECT c.name, c.email, u.email AS cuenta
--   FROM public.clients c
--   JOIN auth.users u ON u.id = c.client_profile_id
--   ORDER BY c.name;
--
-- ── Si no ha cambiado nada, esto dice por qué ──────────────────────────────
-- Cuatro cifras y una sola consulta. La respuesta casi siempre es la segunda
-- columna a cero: sin cuentas enlazadas no hay ninguna dirección verificada que
-- coger, porque `client_profile_id` solo se rellena cuando el cliente ACEPTA su
-- invitación. Mientras no lo haga, su ficha se queda con lo que tecleaste tú, y
-- esta pasada no tiene nada que hacer.
--
--   SELECT count(*)                                        AS fichas,
--          count(c.client_profile_id)                      AS con_cuenta_enlazada,
--          count(u.email)                                  AS con_correo_en_la_cuenta,
--          count(*) FILTER (
--            WHERE NULLIF(btrim(u.email), '') IS NOT NULL
--              AND c.email IS DISTINCT FROM btrim(u.email)
--          )                                               AS pendientes
--   FROM public.clients c
--   LEFT JOIN auth.users u ON u.id = c.client_profile_id;
--
-- Y quién está enlazado y quién no, uno a uno:
--
--   SELECT c.name, c.email AS en_la_ficha, u.email AS en_la_cuenta,
--          c.client_profile_id IS NOT NULL AS enlazado
--   FROM public.clients c
--   LEFT JOIN auth.users u ON u.id = c.client_profile_id
--   ORDER BY enlazado, c.name;
--
-- Desde la APLICACIÓN: abrir la ficha de un cliente que ya estuviera enlazado y
-- mirar el correo. Tiene que ser con el que él entra, no el que se tecleó el día
-- del alta.
--
-- ── Sin aplicar ─────────────────────────────────────────────────────────────
-- No falla nada. Los clientes enlazados antes de la 0091 conservan el correo que
-- escribió su entrenador hasta que abran «Quién eres» y guarden, que es cuando
-- la 0091 lo sella por su cuenta. Esto solo adelanta ese momento para todos a la
-- vez.
-- ============================================================================
