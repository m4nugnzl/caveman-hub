-- ============================================================================
-- Lo que el cliente escribe de lo suyo
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para dos cosas del portal del cliente: clasificar por grupo
--     muscular las fotos que sube de su gimnasio, y contestar su cuestionario de
--     alta. Sin ella las dos fallan con «permission denied». Es ADITIVA: dos
--     funciones nuevas y ni un ALTER sobre nada existente.
--
-- ══ El problema, y por qué no se arregla con una política ══════════════════
--
-- `0002_rls_hardening.sql` deja `clients` en SOLO LECTURA para el cliente, y con
-- razón: RLS filtra FILAS, no columnas, así que darle UPDATE sobre su propia
-- fila le devuelve el poder de ponerse `payment_status = 'paid'` o reasignarse de
-- entrenador.
--
-- El candado por columna (`REVOKE UPDATE … GRANT UPDATE (profile) …`) tampoco
-- sirve: el entrenador y el cliente usan el MISMO rol de Postgres
-- (`authenticated`) y un GRANT no distingue entre ellos. Lo que se le quita a
-- uno se le quita al otro.
--
-- La salida es la que ya tomó la 0008 con las preferencias del panel: una
-- función `SECURITY DEFINER` que escribe EXACTAMENTE lo que tiene que escribir
-- después de comprobar quién llama. El permiso deja de ser «puede escribir en
-- esta fila» y pasa a ser «puede hacer esta operación concreta».
--
-- ══ 1. `set_client_profile` — sus respuestas al cuestionario ═══════════════
--
-- ── Por qué MEZCLA en vez de sustituir ─────────────────────────────────────
-- Ésta es la diferencia importante con `set_client_preferences`, que recibe el
-- objeto entero y lo reemplaza. Aquí no se puede: en esa columna conviven lo que
-- contesta el cliente y lo que apunta el entrenador —el enlace a la carpeta de
-- las fotos, por ejemplo—, y un reemplazo desde el portal borraría lo segundo
-- cada vez que alguien guardara el formulario.
--
-- `profile || data` es la concatenación de jsonb: añade las claves nuevas y pisa
-- las repetidas, sin tocar el resto. Es poco código y es la única forma de que
-- las dos manos escriban en la misma columna sin quitarse el trabajo.
--
-- ══ 2. `set_equipment_group` — de qué es cada máquina ══════════════════════
--
-- La 0079 le dio al cliente INSERT y no UPDATE, con este razonamiento: «que
-- pueda quitar de un plumazo la referencia con la que se le montó la rutina no
-- aporta nada». Sigue siendo cierto para BORRAR y para cambiar la foto — y era
-- demasiado para el grupo muscular.
--
-- Ordenar sus fotos ES trabajo suyo: es él quien está delante de la máquina y
-- sabe si esa polea es de dorsal o de tríceps, y dejar cuarenta fotos sin
-- clasificar para que las coloque el entrenador es devolverle el trabajo que
-- esto venía a quitarle.
--
-- Una función y no una política de UPDATE porque una política es por FILA: le
-- dejaría cambiar también `photo_path` —apuntar su foto a otro archivo— y
-- `client_id`. Esta función escribe una columna y ninguna más.
--
-- ══ Quién usa cada una, y por qué no las usan los dos ══════════════════════
--
-- Las dos comprueban `app_is_client(...) OR app_can_write_client(...)`, así que
-- el entrenador PUEDE llamarlas. En la práctica:
--
--   · `set_equipment_group` la usan los dos. Ordenar una foto es la misma
--     escritura la haga quien la haga, y tenerla en un solo sitio evita acabar
--     con dos comportamientos y solo uno probado.
--   · `set_client_profile` la usa SOLO el cliente. El entrenador escribe la
--     columna entera con un UPDATE directo desde la ficha, y esa diferencia es
--     deliberada: mezclar no puede BORRAR una clave, y él sí tiene que poder
--     vaciar un campo. Al cliente, en cambio, mezclar es justo lo que hay que
--     darle — así no se lleva por delante lo que apuntó su entrenador.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.app_can_write_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existen las funciones app_*_client.';
  END IF;
  IF to_regclass('public.client_equipment') IS NULL THEN
    RAISE EXCEPTION 'Falta 0079_la_maquinaria_de_su_gimnasio.sql.';
  END IF;
END $$;

BEGIN;

-- ── 1. Las respuestas del cuestionario ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_client_profile(target uuid, data jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  /* La función es invocable directamente con la anon key, así que no puede
     confiar en que la aplicación haya mandado algo sensato. */
  IF jsonb_typeof(data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'El perfil tiene que ser un objeto JSON';
  END IF;

  /* El mismo tope que el CHECK de la columna (0078). Se comprueba aquí ADEMÁS
     de allí porque el mensaje de un CHECK violado nombra el constraint y no dice
     qué hacer, y esto lo lee un cliente en su portal. */
  IF length(data::text) > 8192 THEN
    RAISE EXCEPTION 'El formulario es demasiado largo';
  END IF;

  UPDATE public.clients
  SET profile = public.clients.profile || data
  WHERE id = target
    AND (public.app_can_write_client(target) OR client_profile_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tienes permiso para escribir en la ficha de ese cliente';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_client_profile(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_client_profile(uuid, jsonb) TO authenticated;

-- ── 2. De qué es cada máquina ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_equipment_group(item uuid, grupo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  duenyo uuid;
BEGIN
  /* `SECURITY DEFINER` salta RLS, así que esta lectura ve la fila exista de
     quien exista — y por eso el permiso se comprueba a mano justo debajo. */
  SELECT client_id INTO duenyo FROM public.client_equipment WHERE id = item;

  IF duenyo IS NULL THEN
    RAISE EXCEPTION 'Esa foto ya no existe';
  END IF;

  IF NOT (public.app_is_client(duenyo) OR public.app_can_write_client(duenyo)) THEN
    RAISE EXCEPTION 'No tienes permiso sobre esa foto';
  END IF;

  /* El mismo tope que el CHECK de la columna. El catálogo de grupos vive en el
     navegador (`MUSCLE_GROUPS`) y aquí no se replica a propósito: replicarlo
     obligaría a una migración cada vez que se añada uno, y la 0079 ya decidió
     que lo que no reconozca el catálogo se pinte en «Otros» en vez de perderse. */
  IF length(btrim(grupo)) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Ese grupo muscular no es válido';
  END IF;

  UPDATE public.client_equipment SET muscle_group = grupo WHERE id = item;
END;
$$;

REVOKE ALL ON FUNCTION public.set_equipment_group(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_equipment_group(uuid, text) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que anon no puede llamarlas (las dos tienen que dar `f`):
--
--   SELECT has_function_privilege('anon', 'public.set_client_profile(uuid, jsonb)', 'EXECUTE'),
--          has_function_privilege('anon', 'public.set_equipment_group(uuid, text)', 'EXECUTE');
--
-- Que el perfil se MEZCLA y no se reemplaza (la segunda llamada tiene que dejar
-- las dos claves, no solo la última):
--
--   SELECT public.set_client_profile('<id>', '{"sleepHours": 7}'::jsonb);
--   SELECT public.set_client_profile('<id>', '{"mealsPerDay": 4}'::jsonb);
--   SELECT profile FROM public.clients WHERE id = '<id>';
--   -- → {"sleepHours": 7, "mealsPerDay": 4}
--
-- Desde la APLICACIÓN: entrar COMO CLIENTE en «Tu alta», contestar dos preguntas
-- y guardar; después subir una foto y cambiarle el grupo. Las dos cosas tienen
-- que verse desde la ficha del entrenador sin recargar nada suyo.
--
-- ── Sin aplicar ─────────────────────────────────────────────────────────────
-- El portal del cliente enseña las dos pantallas y las dos fallan al GUARDAR,
-- con su aviso. Lo del entrenador no cambia: él escribe por UPDATE directo.
-- ============================================================================
