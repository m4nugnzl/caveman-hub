-- ============================================================================
-- El cobro a mano también deja rastro
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva sobre `client_payments`: una columna, dos restricciones que se
--     aflojan, dos políticas nuevas y un índice. No borra ni reescribe ninguna
--     fila existente. Sin ella, todo sigue funcionando exactamente igual — solo
--     que la pantalla de Ingresos enseña el histórico vacío a quien no use Notion
--     ni Stripe, que hoy es casi todo el mundo.
--
-- ══ Qué falta hoy ═══════════════════════════════════════════════════════════
--
-- `client_payments` (migración 0010) es el libro de cobros del entrenador y está
-- bien pensado: guarda el importe, la fecha, el estado y de dónde salió. El
-- problema es quién puede escribir en él. `integration_id NOT NULL` significa
-- que **solo existe un cobro si vino de fuera**.
--
-- Y el gesto que de verdad se hace cada semana no viene de fuera: es pulsar
-- «Cobrado» en la bandeja de «Hoy» (`markClientPaid`). Ese gesto adelanta
-- `next_payment_date` y pone `payment_status` a `paid`, y con eso la ficha queda
-- al día — pero no queda constancia de que ese cobro ocurrió. Al mes siguiente
-- se ha sobrescrito la fecha y no hay forma de saber que en marzo entraron
-- 1.240 €.
--
-- El resultado es que el producto lleva desde la 0010 acumulando un histórico
-- que la mayoría de sus usuarios no está generando. Cualquier gráfica de
-- ingresos construida sobre esto le saldría vacía justamente a quien más falta
-- le hace: el que hoy lo lleva en una hoja de cálculo.
--
-- ══ Por qué una columna `source` y no una tabla nueva ═══════════════════════
--
-- Porque es el mismo hecho: entró dinero de un cliente, tanto, tal día. Que lo
-- haya dicho Stripe o lo haya pulsado el entrenador cambia CUÁNTO te puedes
-- fiar, no QUÉ es. Dos tablas obligarían a unir por fechas y a sumar dos veces
-- en cada pantalla, que es la forma habitual de acabar enseñando el doble de
-- ingresos de los que hay.
--
-- `source` distingue la confianza, que es lo único que hay que distinguir:
--
--   'integration' — lo dijo Notion o Stripe. Es un cobro conciliado.
--   'manual'      — lo dijo el entrenador al pulsar «Cobrado».
--
-- El proveedor concreto NO se guarda aquí: se sabe siguiendo `integration_id`
-- hasta `integrations.provider`. Copiarlo sería un segundo sitio donde puede
-- decir otra cosa.
--
-- ── Por qué `integration_id` pasa a admitir nulo, y qué se lleva por delante ─
-- Un cobro a mano no pertenece a ninguna integración. Ponerle una inventada, o
-- crear una integración «manual» de mentira por entrenador, sería falsificar el
-- origen del dato justo en la columna que existe para decirlo.
--
-- Lo que esto toca es `UNIQUE (integration_id, external_id)`, que es lo que hace
-- IDEMPOTENTE la sincronización. Sigue intacta para lo que la necesita: en
-- Postgres los nulos son distintos entre sí dentro de un UNIQUE, así que dos
-- cobros a mano nunca chocan entre ellos ni con los de nadie. La idempotencia
-- era una propiedad de la importación, y la importación sigue trayendo su
-- `integration_id` y su `external_id` como siempre.
--
-- `external_id` también pasa a admitir nulo por lo mismo: un cobro que nace de
-- un botón no tiene identidad en ningún sistema externo. Rellenarlo con un uuid
-- fabricado aquí sería un identificador que no identifica nada.
--
-- ── El CHECK que impide el estado a medias ──────────────────────────────────
-- Sin él existirían filas que no son ninguna de las dos cosas: 'manual' con
-- integración, o 'integration' sin ella. Son estados que ningún camino del
-- código produce hoy, y por eso mismo son los que aparecen dentro de dos años
-- después de un `INSERT` a mano en una consola. La regla se escribe donde no se
-- puede saltar.
--
-- ══ Por qué hay una política de INSERT y otra de DELETE ═════════════════════
--
-- `client_payments` tenía SELECT y UPDATE, y ningún INSERT: la escritura era
-- cosa de la Edge Function con `service_role`, así que el navegador no podía
-- meter filas. Correcto entonces, imposible ahora — «Cobrado» se pulsa en el
-- navegador.
--
-- La de INSERT solo deja escribir filas manuales sobre un cliente que puedes
-- editar. Las de integración siguen sin poder crearse desde el navegador: eso lo
-- garantiza la propia condición, no la buena voluntad de quien llame.
--
-- La de DELETE existe por el «Deshacer» del aviso. Marcar cobrado es un toque
-- sin confirmación y su pareja honesta es poder volver atrás — y volver atrás
-- tiene que borrar también el apunte, o el histórico acumula cobros que el
-- entrenador dijo que no habían pasado. Solo borra lo manual: un cobro que dijo
-- Stripe no lo desdice un botón de esta aplicación.
-- ============================================================================

BEGIN;

ALTER TABLE public.client_payments
  ALTER COLUMN integration_id DROP NOT NULL,
  ALTER COLUMN external_id DROP NOT NULL;

ALTER TABLE public.client_payments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'integration';

/*
  Las filas que ya existen son todas de integración —era la única forma de que
  existieran—, así que el DEFAULT las deja correctamente clasificadas y el CHECK
  se puede validar sin tocar nada.
*/
ALTER TABLE public.client_payments
  DROP CONSTRAINT IF EXISTS client_payments_source_check;
ALTER TABLE public.client_payments
  ADD CONSTRAINT client_payments_source_check CHECK (
    (source = 'integration' AND integration_id IS NOT NULL)
    OR (source = 'manual' AND integration_id IS NULL AND client_id IS NOT NULL)
  );

/*
  El índice de la 0010 es `(client_id, paid_on DESC)`: sirve para la ficha de UNA
  persona. La pantalla de Ingresos pregunta lo contrario —todos los cobros de un
  tramo de meses, de toda la cartera— y ahí ese índice no entra, porque la
  primera columna no está en el filtro.

  Parcial sobre `is_paid` porque lo que se suma son ingresos: un cobro fallido de
  Stripe está en la tabla y no es dinero que haya entrado.
*/
CREATE INDEX IF NOT EXISTS client_payments_cobrados_idx
  ON public.client_payments (paid_on DESC)
  WHERE is_paid;

COMMIT;


-- ============================================================================
-- Quién puede apuntar un cobro a mano
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "payments_manual_insert" ON public.client_payments;
CREATE POLICY "payments_manual_insert" ON public.client_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    source = 'manual'
    AND integration_id IS NULL
    AND client_id IS NOT NULL
    AND public.app_can_write_client(client_id)
  );

DROP POLICY IF EXISTS "payments_manual_delete" ON public.client_payments;
CREATE POLICY "payments_manual_delete" ON public.client_payments
  FOR DELETE TO authenticated
  USING (
    source = 'manual'
    AND client_id IS NOT NULL
    AND public.app_can_write_client(client_id)
  );

/*
  La lectura NO se toca, y conviene decir por qué: `payments_read` (0010) ya
  cubre estas filas por su segunda rama —`client_id IS NOT NULL AND
  app_can_read_client(client_id)`—, y un cobro manual siempre tiene cliente
  porque el CHECK de arriba se lo exige. La primera rama,
  `app_owns_integration(NULL)`, devuelve falso sin error.

  El efecto secundario que sí hay que tener presente: **el cliente puede leer sus
  propios cobros**, porque `app_can_read_client` incluye su fila. Es correcto —es
  lo que él ha pagado— y es la misma decisión que ya se tomó con `fee_amount` en
  la 0058. Escribir no puede: las dos políticas de arriba piden
  `app_can_write_client`, que es del entrenador.
*/

COMMIT;
