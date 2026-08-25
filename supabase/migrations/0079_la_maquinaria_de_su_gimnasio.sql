-- ============================================================================
-- La maquinaria de su gimnasio
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para el bloque «Su maquinaria» de la ficha. Sin ella la
--     aplicación no se rompe —trata la tabla ausente como «no hay fotos», igual
--     que hace con la 0077— pero no se puede subir ninguna. Es ADITIVA: una
--     tabla nueva y ni un DROP.
--
-- ══ El problema, contado por un cliente de verdad ══════════════════════════
--
-- De un cuestionario de alta: «hasta ahora entrenaba en un Planet Fitness, pero
-- me voy a cambiar a un Fitness Park porque hay mejor maquinaria. **Respecto de
-- mi cambio de gimnasio, tendré que ajustar desde cero el peso de la maquinaria,
-- por eso no he incluido los pesos en la rutina.**»
--
-- Un cambio de gimnasio invalida todas las cargas de una persona y cambia qué
-- ejercicios se le pueden prescribir. La aplicación no tenía ni dónde apuntar
-- qué máquinas tiene delante.
--
-- Y el flujo que ya existe fuera es exactamente este: el entrenador le pide
-- fotos de la maquinaria, las sube a una carpeta de Drive, y **monta la rutina
-- mirando esas fotos en otra pestaña**. Eso es la aplicación pidiendo que la
-- construyan.
--
-- ══ Por qué esto NO es un campo de texto ═══════════════════════════════════
--
-- Se intentó y duró un día: «Dónde entrena: Fitness Park, máquinas Matrix». Esa
-- línea no contesta la pregunta que se hace programando, que es «¿tiene prensa
-- de placas o de discos?, ¿el remo es de pecho apoyado?». Eso solo lo contesta
-- una foto.
--
-- El campo de texto se queda, pero para lo que sí es: el NOMBRE del sitio. Y
-- junto a él un enlace a la carpeta de fuera, para quien ya la tenga montada en
-- Drive y no quiera moverla — la aplicación no le pide que abandone lo que le
-- funciona, le ofrece tenerlo dentro.
--
-- ══ Por qué el grupo muscular es la carpeta ════════════════════════════════
--
-- Porque `MUSCLE_GROUPS` (`domain/training.js`) ya es el vocabulario con el que
-- está escrito todo el entrenamiento: los ejercicios de la biblioteca, el
-- volumen semanal, los colores de la analítica. Un árbol de carpetas propio
-- sería un segundo vocabulario para lo mismo, y la primera vez que alguien
-- escribiera «Espalda» en vez de «Dorsal» se acabó la correspondencia.
--
-- Con el grupo muscular como carpeta, programando el día de pecho se puede
-- enseñar lo que tiene PARA PECHO, que es la única forma en que este álbum deja
-- de ser un álbum.
--
-- ══ Por qué por CLIENTE y no por gimnasio ══════════════════════════════════
--
-- Un modelo de «sitios» compartidos entre clientes sería más correcto sobre el
-- papel y peor aquí: en asesoría online cada cliente entrena en un gimnasio
-- distinto, así que la tabla de sitios tendría una fila por cliente igualmente
-- —más una pantalla para asignarlos y una política nueva, porque un gimnasio no
-- es «de» un cliente y `folder_is_my_client` dejaría de valer—.
--
-- Cuando dos clientes coincidan de verdad, la salida barata es «copiar la
-- maquinaria de otro cliente», que es un patrón que la aplicación ya tiene para
-- las rutinas. No hace falta cambiar el modelo para eso.
--
-- ══ El almacenamiento: CERO políticas nuevas ═══════════════════════════════
--
-- Las fotos van a `<clientId>/gym/<archivo>` del bucket `client-media`. Las
-- políticas de la 0007 autorizan por el PRIMER SEGMENTO de la ruta
-- (`folder_is_my_client` para el entrenador, `folder_is_me` para el cliente), así
-- que esta carpeta queda cubierta sin tocar nada — y con ella la posibilidad de
-- que sea el propio cliente quien las suba desde el móvil, que es quien está en
-- el gimnasio.
--
-- Y la cuota de la 0067 las cuenta por el mismo sitio, sin cambios: suma todo lo
-- que cuelga del id de un cliente. Un gimnasio de cuarenta máquinas son ~12 MB
-- después de `shrinkImage` (0,3 MB por foto), así que hasta en el plan gratuito
-- —512 MB— cabe de sobra. Por eso aquí no hay un tope propio de piezas: el que
-- importa ya existe y es el del plan.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla clients.';
  END IF;
  IF to_regprocedure('public.app_can_read_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existen las funciones app_can_*_client.';
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_equipment (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  /* Con cascada, por lo mismo que la 0077: el borrado de un cliente no puede
     depender de que alguien se acuerde de añadir la tabla a una lista. Los
     ARCHIVOS los borra la aplicación aparte — de esos la base no sabe nada. */
  client_id    uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  /*
    El grupo muscular es la carpeta. Texto libre y no un enum a propósito:
    `MUSCLE_GROUPS` vive en el navegador y ha cambiado de contenido antes; un
    enum en la base obligaría a una migración cada vez que se añada uno, y a que
    las dos listas no divergieran nunca. Lo que llega y no reconoce el catálogo
    se pinta en «Otros», que es donde se ve en vez de desaparecer.
  */
  muscle_group text NOT NULL DEFAULT 'Otros',
  /* Opcional: la foto ya dice qué es. El nombre está para lo que la foto no
     distingue —«prensa 45°» y «prensa horizontal»— y para poder buscarla. */
  name         text,
  /* La RUTA del bucket, no una URL. Las URL se firman al cargar y caducan; una
     guardada aquí sería un enlace muerto dentro de ocho horas. Es la misma
     lección que dejó escrita `SIGNED_URL_TTL_SECONDS`. */
  photo_path   text NOT NULL,
  created_at   timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by   uuid REFERENCES public.profiles(id),

  CONSTRAINT client_equipment_pkey PRIMARY KEY (id),
  CONSTRAINT client_equipment_name_check
    CHECK (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT client_equipment_group_check
    CHECK (length(btrim(muscle_group)) BETWEEN 1 AND 40),
  /*
    Una foto, una fila. Sin esto, un doble clic en «Subir» deja dos filas
    apuntando al mismo archivo y borrar una rompe la otra — el fallo es que la
    segunda enseña un hueco y nadie sabe por qué.
  */
  CONSTRAINT client_equipment_photo_key UNIQUE (photo_path)
);

/* La consulta que hace la aplicación es siempre «la de este cliente», y se pinta
   agrupada por músculo: el índice lleva las dos columnas en ese orden. */
CREATE INDEX IF NOT EXISTS client_equipment_client_idx
  ON public.client_equipment (client_id, muscle_group);

ALTER TABLE public.client_equipment ENABLE ROW LEVEL SECURITY;

-- ── El entrenador: lee y escribe la de sus clientes ────────────────────────
DROP POLICY IF EXISTS "equipment_coach_read" ON public.client_equipment;
CREATE POLICY "equipment_coach_read" ON public.client_equipment
  FOR SELECT TO authenticated USING (public.app_can_read_client(client_id));

DROP POLICY IF EXISTS "equipment_coach_write" ON public.client_equipment;
CREATE POLICY "equipment_coach_write" ON public.client_equipment
  FOR ALL TO authenticated
  USING (public.app_can_write_client(client_id))
  WITH CHECK (public.app_can_write_client(client_id));

/*
  ── El cliente: lee, y además AÑADE ───────────────────────────────────────
  Es la única tabla de esta tanda donde el cliente escribe, y tiene su motivo:
  **quien está en el gimnasio es él**. Pedirle que mande cuarenta fotos por
  WhatsApp para que el entrenador las suba una a una es exactamente el trabajo
  que esta aplicación existe para quitar.

  Y el riesgo es pequeño de los dos lados: lo que añade es una foto de una
  máquina —no toca su plan, no toca sus datos— y el almacenamiento ya está
  acotado por la cuota del plan (0067), que le corta a él igual que al
  entrenador.

  Lo que NO puede es BORRAR ni MODIFICAR: sin `USING` para UPDATE y DELETE, esas
  dos operaciones no le alcanzan. Que pueda quitar de un plumazo la referencia
  con la que se le montó la rutina no aporta nada.
*/
DROP POLICY IF EXISTS "equipment_client_read" ON public.client_equipment;
CREATE POLICY "equipment_client_read" ON public.client_equipment
  FOR SELECT TO authenticated USING (public.app_is_client(client_id));

DROP POLICY IF EXISTS "equipment_client_insert" ON public.client_equipment;
CREATE POLICY "equipment_client_insert" ON public.client_equipment
  FOR INSERT TO authenticated WITH CHECK (public.app_is_client(client_id));

/* `anon` explícito, no solo `public`: la lección de la 0047. */
REVOKE ALL ON public.client_equipment FROM public, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_equipment TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que anon no la ve (las cuatro tienen que dar `f`):
--
--   SELECT has_table_privilege('anon', 'public.client_equipment', p)
--   FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p;
--
-- Que no admite dos filas para la misma foto (la segunda tiene que fallar):
--
--   INSERT INTO public.client_equipment (client_id, photo_path)
--   VALUES ('<id>', 'x/gym/1.webp'), ('<id>', 'x/gym/1.webp');
--
-- Desde la APLICACIÓN: Ficha → «Su maquinaria» → subir dos fotos con grupos
-- musculares distintos. Tienen que salir agrupadas, y las mismas tienen que
-- aparecer al abrir su Rutina, plegadas bajo «Su maquinaria».
--
-- ── Sin aplicar ─────────────────────────────────────────────────────────────
-- El gancho se traga el «no existe la tabla» y deja la lista vacía: el bloque
-- enseña su estado vacío y la rutina no enseña nada. Lo único que falla es
-- SUBIR, y eso se ve con su aviso.
--
-- ── Los archivos, si algún día se retira ────────────────────────────────────
-- Viven en `<clientId>/gym/` del bucket `client-media`. Un DROP de esta tabla
-- los dejaría huérfanos ocupando cuota: hay que vaciar esa carpeta a mano.
-- ============================================================================
