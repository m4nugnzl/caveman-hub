-- ============================================================================
-- Quitar lo que ya no lee nadie
-- ----------------------------------------------------------------------------
-- ⚠️  ESTA ES LA ÚNICA MIGRACIÓN DEL PROYECTO QUE DESTRUYE DATOS.
--     `DROP COLUMN` y `DROP TABLE` no se deshacen. Lo que se borre aquí solo
--     vuelve desde una copia de seguridad.
--
--     **NO LA APLIQUES A LA VEZ QUE DESPLIEGAS EL CÓDIGO.** Ver «Cuándo», abajo.
--
-- ══ Qué se quita y por qué ══════════════════════════════════════════════════
--
-- `docs/auditoria.md` §2 listaba seis columnas y una tabla como sobrantes, y
-- decía que retirarlas era «media hora y quita ruido». Al ir a hacerlo, la
-- realidad no coincidía con la lista: de las seis, **solo dos estaban muertas de
-- verdad**. Las demás se seguían usando o escondían algo peor que ruido.
--
--   · `clients.gym_equipment_link` — MUERTA. Un enlace a una carpeta de Drive del
--     flujo anterior. No lo leía ni una pantalla; solo existía en el mapeador.
--
--   · `clients.current_weight` — MUERTA AHORA, y no lo estaba: se pintaba en el
--     portal del cliente bajo «Peso actual» y en el roadmap. **Nadie la
--     escribía**, ni la aplicación ni ninguna migración, así que enseñaba el
--     valor congelado del día que se dejó de rellenar. Un dato viejo con etiqueta
--     de actual es peor que un hueco: el hueco se pregunta, la cifra se cree.
--     Las dos pantallas leen ya el histórico de pesajes (`latestWeight`).
--
--   · `videos` — MUERTA. La corrección de vídeos se retiró del producto y su
--     sustituto son los enlaces de revisión (0011 y 0040). Ninguna consulta la
--     nombra.
--
-- ══ Y lo que la auditoría daba por sobrante y NO lo está ═══════════════════
--
-- Se queda, y conviene que quede escrito para no volver a intentarlo:
--
--   · `clients.coach_id` — «duplica `assigned_to`». Puede ser, pero hoy la
--     nombran DIEZ migraciones y quince sitios del código, incluidas políticas de
--     RLS y `create_client`. Es carga estructural, no ruido. Retirarla es un
--     proyecto con su propio plan, no una línea de limpieza.
--
--   · `clients.posture_reviewed` — la usa `domain/intake.js` como columna de un
--     paso del alta. Está viva.
--
--   · `clients.youtube_explanation_url` — el portal del cliente PINTA ese enlace
--     dentro de su rutina (`ClientRoutine`). Está viva, aunque hoy se solape con
--     las revisiones en vídeo. Retirarla es una decisión de producto —quitarle
--     algo a quien lo esté usando—, no de limpieza.
--
-- ══ Cuándo aplicarla ═══════════════════════════════════════════════════════
--
-- **Después de que el código nuevo lleve un tiempo desplegado**, no a la vez.
--
-- El motivo no es teórico. Si se despliegan juntos y algo se hubiera pasado por
-- alto, la columna ya no existe y la única salida es restaurar. Separándolo, hay
-- una ventana en la que el código nuevo corre contra el esquema viejo: si algo la
-- seguía leyendo, se ve y no ha costado nada.
--
-- Una semana es razonable. Antes de ejecutarla, con el código nuevo en marcha:
--
--     -- Que la aplicación ya no la pide (0 filas es lo que se busca):
--     SELECT count(*) FROM public.videos;
--
-- Y sobre todo: **haz una copia antes** (`npm run backup`). Es la migración para
-- la que existe ese script.
-- ============================================================================

BEGIN;

/*
  ══ Primero la función, y esto casi se me escapa ═══════════════════════════

  `create_client` (migración 0032) INSERTA en `current_weight` y en
  `gym_equipment_link`. Borrar las columnas sin tocarla deja el alta de clientes
  rota con «column "current_weight" of relation "clients" does not exist» — es
  decir, **nadie puede dar de alta a nadie**, que es de los peores fallos
  posibles en este producto.

  No se dedujo leyendo: lo cazó `npm run test:db` al aplicar esta migración
  contra la base local. Los dos únicos sitios del código que las nombraban eran
  el mapeador y estas dos pantallas, así que una búsqueda por el código habría
  dado luz verde. La referencia estaba dentro de una función de Postgres.

  Va en la MISMA transacción que los `DROP`: si esto fallara, las columnas no se
  borran. No puede existir un instante con la función vieja y la columna ya
  quitada.

  Es la de la 0032 con dos columnas menos. Todo lo demás —los mensajes que
  nombran el rol y el equipo, el `assigned_to` por defecto— se conserva igual.
*/
CREATE OR REPLACE FUNCTION public.create_client(
  p_name   text,
  p_fields jsonb DEFAULT '{}'::jsonb
)
RETURNS public.clients
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_team uuid;
  v_role text;
  v_out  public.clients;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesión para dar de alta un cliente.';
  END IF;

  IF COALESCE(btrim(p_name), '') = '' THEN
    RAISE EXCEPTION 'El cliente necesita un nombre.';
  END IF;

  v_team := public.ensure_my_team();
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'Tu cuenta no tiene equipo y no se ha podido crear uno. Si entraste como cliente, no puedes dar de alta clientes.';
  END IF;

  v_role := public.my_team_role(v_team);

  IF v_role IS NULL THEN
    RAISE EXCEPTION
      'No perteneces al equipo % (tu usuario no tiene fila en team_members). Aplica 0029_owner_membership.sql o pide a quien lo creó que te añada.',
      v_team;
  END IF;

  IF v_role NOT IN ('owner', 'admin', 'trainer') THEN
    RAISE EXCEPTION
      'Tu rol en el equipo es «%», y dar de alta clientes requiere owner, admin o trainer.',
      v_role;
  END IF;

  INSERT INTO public.clients (
    coach_id, team_id, assigned_to,
    name, email, phone, gender, plan, status,
    start_date,
    cycle_type, cycle_pattern,
    youtube_explanation_url, avatar
  )
  VALUES (
    v_uid,
    v_team,
    COALESCE(NULLIF(p_fields ->> 'assigned_to', '')::uuid, v_uid),
    btrim(p_name),
    NULLIF(p_fields ->> 'email', ''),
    NULLIF(p_fields ->> 'phone', ''),
    NULLIF(p_fields ->> 'gender', ''),
    NULLIF(p_fields ->> 'plan', ''),
    COALESCE(NULLIF(p_fields ->> 'status', ''), 'active'),
    COALESCE(NULLIF(p_fields ->> 'start_date', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(p_fields ->> 'cycle_type', ''), 'weekly'),
    COALESCE(p_fields -> 'cycle_pattern', '{"train": 2, "rest": 1}'::jsonb),
    NULLIF(p_fields ->> 'youtube_explanation_url', ''),
    NULLIF(p_fields ->> 'avatar', '')
  )
  RETURNING * INTO v_out;

  RETURN v_out;
END;
$$;

-- Un enlace de Drive del flujo anterior. Ni una pantalla lo leía.
ALTER TABLE public.clients DROP COLUMN IF EXISTS gym_equipment_link;

/*
  El peso congelado. Lo sustituye `latestWeight(anthropometry.history)`, que lee
  lo que la persona rellena cada semana en vez de una copia que nadie mantenía.
*/
ALTER TABLE public.clients DROP COLUMN IF EXISTS current_weight;

/*
  La tabla de la corrección de vídeos, retirada del producto. Su sustituto son
  los enlaces de revisión (`review_links`, migraciones 0011 y 0040), que además
  admiten vídeo de fuera y llevan cuenta de si el cliente lo ha visto.

  Va después de las columnas y con su propio comentario porque es lo más caro de
  recuperar de esta migración: una columna se vuelve a añadir vacía sin drama, una
  tabla con filas dentro no.
*/
DROP TABLE IF EXISTS public.videos;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Las tres consultas tienen que devolver CERO filas:
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'clients'
--     AND column_name IN ('gym_equipment_link', 'current_weight');
--
--   SELECT to_regclass('public.videos');   -- NULL
--
-- Y desde la APLICACIÓN, que es donde importa: abrir el portal de un cliente y
-- comprobar que «Peso actual» sigue apareciendo con su último pesaje. Si sale
-- vacío es que ese cliente no tiene pesajes, no que esto haya roto nada — se
-- distingue mirando su pantalla de check-ins.
-- ============================================================================
