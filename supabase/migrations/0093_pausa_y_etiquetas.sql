-- ============================================================================
-- La pausa y las etiquetas: dos estados de la vida real de una cartera
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y sin riesgo: un valor nuevo en un CHECK que ya existía y dos
--     columnas con valor por defecto. No toca permisos ni datos.
--
-- ══ 1 · La pausa ═══════════════════════════════════════════════════════════
--
-- El cliente lesionado que vuelve en octubre no cabía en ningún estado: activo
-- genera alertas falsas durante dos meses —«60 días sin entrenar» de alguien a
-- quien su entrenador le ha dicho que pare— y archivado lo saca de la cartera
-- como si hubiera terminado. `paused` es la verdad: sigue siendo su cliente,
-- no está entrenando, y los dos lo saben.
--
-- `paused_until` es la fecha en la que quedaron. No hay ningún proceso que
-- despause a medianoche: la aplicación DERIVA el estado —pasada la fecha, la
-- pausa vence y las alertas vuelven a contar solas (ver `pauseOf` en
-- domain/portfolio.js)— y la fila conserva su `paused` hasta que el entrenador
-- reanuda desde la ficha. Es la misma filosofía que la edad, que no se guarda
-- porque caduca sola (0048).
--
-- ── El tope del plan NO cambia, y es a propósito ────────────────────────────
-- El disparador de la 0019/0064 cuenta `status IS DISTINCT FROM 'archived'`,
-- así que un cliente en pausa SIGUE contando para el límite de asientos. Es
-- deliberado: sigue siendo un cliente que va a volver, y descontarlo abriría
-- la puerta a pausar media cartera para caber en un plan más barato — el
-- disparador solo corre en el alta y no vería el despausado. Quien termina de
-- verdad se archiva, que para eso está. El índice parcial de la 0020 tampoco
-- cambia: indexa lo no archivado, y los pausados no están archivados.
--
-- ══ 2 · Las etiquetas ══════════════════════════════════════════════════════
--
-- Con 20+ clientes, «los de pérdida de grasa» o «los presenciales» no se
-- podían encontrar de ninguna manera: no había ni una columna donde esa
-- información pudiera vivir. Texto libre y en lista —`text[]`— porque las
-- etiquetas son vocabulario del entrenador, no un catálogo de la aplicación:
-- inventar un enum aquí sería decidir por él cómo segmenta su cartera.
--
-- El saneo (largo máximo, cuántas) vive en la aplicación, que es quien las
-- escribe; la base solo garantiza que la columna existe y nunca es NULL, para
-- que leerla no obligue a preguntar si hay lista.
-- ============================================================================

BEGIN;

/*
  El CHECK de la 0020, con el estado nuevo. Mismo criterio que entonces:
  NOT VALID porque las filas históricas pueden traer cualquier cosa y esta
  migración no es quién para hacerlas fallar; NULL sigue significando «no
  archivado» (filas de antes del DEFAULT).
*/
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_check
  CHECK (status IS NULL OR status IN ('active', 'archived', 'paused'))
  NOT VALID;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS paused_until date;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

COMMIT;

-- ============================================================================
-- Lo que NO cambia, y conviene saberlo
-- ----------------------------------------------------------------------------
-- · **Los permisos.** Pausar y etiquetar son UPDATEs de `clients`: lo puede
--   hacer quien ya podía escribir la ficha. Ningún GRANT nuevo.
--
-- · **El portal del cliente.** Un cliente en pausa sigue entrando y viendo lo
--   suyo, igual que el archivado (0020): sus políticas se apoyan en `is_me`,
--   no en el estado.
--
-- · **Las alertas.** Silenciarlas mientras la pausa está vigente es regla de
--   producto y vive en domain/portfolio.js, no aquí: la base no opina de qué
--   es un reproche.
-- ============================================================================
