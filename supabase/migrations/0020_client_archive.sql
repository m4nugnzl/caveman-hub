-- ============================================================================
-- Archivar clientes
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y sin riesgo. No crea tablas ni cambia permisos: pone reglas sobre
--     una columna que ya existía y no se usaba.
--
-- ══ Por qué hace falta AHORA ═══════════════════════════════════════════════
--
-- La `0019` puso un tope de clientes por plan. Con `clients.status` sin usar, la
-- única forma de bajar de ese tope era **borrar a alguien**, y borrar un cliente
-- se lleva su historial entero: su año de entrenamientos, sus pesajes y sus
-- fotos. Un plan que para caber obliga a destruir el trabajo de una persona que
-- terminó su etapa está mal hecho.
--
-- Archivar es la salida correcta: el cliente deja de contar y deja de aparecer,
-- y todo lo suyo sigue ahí. Si vuelve dentro de un año, vuelve con su historia.
--
-- ══ Lo que ya estaba y lo que se añade ═════════════════════════════════════
--
-- La columna existe desde el principio, con `DEFAULT 'active'`, y nadie escribía
-- en ella. El disparador de la `0019` ya cuenta `status IS DISTINCT FROM
-- 'archived'`, así que la mitad de servidor de esto ya funcionaba. Aquí se
-- añaden las dos cosas que le faltaban: que el valor no pueda ser cualquiera, y
-- que contar sea barato.
-- ============================================================================

BEGIN;

/*
  ── Por qué NOT VALID ───────────────────────────────────────────────────────
  Comprueba las filas nuevas y las que se modifiquen, pero no revisa las que ya
  están. Es deliberado: la columna llevaba años siendo texto libre y no se puede
  saber desde aquí qué hay escrito en cada proyecto. Con `VALID`, una fila
  antigua con cualquier otro valor haría fallar la migración entera.

  Si algún día se quiere apretar, primero se mira qué hay:

    SELECT status, count(*) FROM public.clients GROUP BY status;

  y después `ALTER TABLE public.clients VALIDATE CONSTRAINT clients_status_check;`

  NULL entra en la lista porque las filas anteriores al `DEFAULT` pueden tenerlo,
  y un NULL aquí significa lo mismo que 'active': no archivado.
*/
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_check
  CHECK (status IS NULL OR status IN ('active', 'archived'))
  NOT VALID;

/*
  El índice que usa el disparador de la 0019 en cada alta. Es parcial —solo
  indexa lo que no está archivado— porque la pregunta que se hace siempre es
  «¿cuántos clientes VIVOS tiene este equipo?», y así el índice no crece con los
  archivados, que son justo los que no se cuentan nunca.
*/
CREATE INDEX IF NOT EXISTS clients_team_active_idx
  ON public.clients (team_id)
  WHERE status IS DISTINCT FROM 'archived';

COMMIT;

-- ============================================================================
-- Lo que NO cambia, y conviene saberlo
-- ----------------------------------------------------------------------------
-- · **Los permisos.** Archivar es un UPDATE de `clients`, así que lo puede hacer
--   quien ya podía escribir la ficha. No se le pide el rol de borrar (owner o
--   admin) porque archivar es reversible y borrar no.
--
-- · **El portal del cliente.** Un cliente archivado que tenga cuenta sigue
--   entrando y viendo sus datos: sus políticas se apoyan en `is_me`, no en el
--   estado. Es lo correcto —son SUS datos— y además es lo que permite que se
--   descargue lo suyo después de terminar.
--
-- · **Lo que ocupa.** Archivar no libera nada de almacenamiento: sus fotos
--   siguen en el bucket. Para eso está borrar, que sigue existiendo.
-- ============================================================================
