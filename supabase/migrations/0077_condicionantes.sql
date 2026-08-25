-- ============================================================================
-- Lo que condiciona el plan: lesiones, patologías, alergias
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para el bloque «Condicionantes» de la ficha. Sin ella la
--     aplicación no se rompe —trata la tabla ausente como «este cliente no tiene
--     ninguno», igual que hace con `check_ins` desde la 0009— pero no se puede
--     apuntar ni uno. Es ADITIVA: una tabla nueva y ni un DROP.
--
-- ══ Qué había hasta hoy ════════════════════════════════════════════════════
--
-- Un paso del alta llamado «Anamnesis / historial», cuya pista dice literalmente
-- «Lesiones, patologías, horarios, lo que condiciona el plan», y que es una
-- CASILLA con un PDF colgado (`domain/intake.js`). El dato está guardado y la
-- aplicación no puede leerlo: no sale en ninguna pantalla, no avisa de nada y no
-- entra en ninguna decisión.
--
-- El síntoma concreto, y es el que paga esta migración: al programar el jueves
-- nada te recuerda que tiene una hernia, y al montar el menú nada te recuerda
-- que es intolerante a la lactosa. La información existe, está a dos clics, y
-- llega tarde.
--
-- ══ Por qué una TABLA y no un jsonb en `preferences` ═══════════════════════
--
-- El proyecto mete en `clients.preferences` casi todo lo que es configuración
-- —el protocolo, el alta, el objetivo, el panel— y con razón: cambian sin avisar
-- y una columna por cada cosa sería una migración por cada idea. Esto NO es de
-- esa familia, por tres motivos:
--
--   1. **Son varios y con estructura.** Un cliente tiene cero condicionantes o
--      cinco, cada uno con su área, su gravedad y sus fechas. Eso es una
--      relación, no un ajuste.
--   2. **Los lee otra pantalla.** La rutina pregunta por los de entrenamiento y
--      la dieta por los de nutrición. Un blob que hay que traer entero y filtrar
--      en el navegador para eso es el modelo equivocado.
--   3. **Son datos de salud del artículo 9 del RGPD**, la misma categoría que
--      las fotos corporales y los pliegues. Merecen su política, su rastro en la
--      traza de cambios (0017) y su borrado. Y `set_client_preferences` (0008)
--      es escribible POR EL PROPIO CLIENTE y con un tope de 8 KB compartido
--      entre cuatro sistemas: no es sitio para un historial clínico.
--
-- ══ `area`, y por qué existe «las dos» ═════════════════════════════════════
--
-- Porque una hernia condiciona el entrenamiento y una intolerancia la dieta,
-- pero una diabetes condiciona las dos — y obligar a apuntarla dos veces
-- produciría dos filas que hay que acordarse de cambiar a la vez. Quien lee
-- pregunta por su área y se lleva también las de `both`.
--
-- ══ `severity`: dos valores y no cinco ═════════════════════════════════════
--
--   · `note`  — tenlo en cuenta. Es el 90 % de los casos y el valor por defecto.
--   · `block` — esto no se le puede poner.
--
-- Una escala de cinco obligaría a decidir entre «moderado» y «alto» cada vez que
-- se apunta algo, y esa decisión no cambia nada de lo que hace la aplicación. Lo
-- que sí cambia es el tono con el que se dice: un aviso o un veto.
--
-- ══ `resolved_at`: se resuelven, no se borran ══════════════════════════════
--
-- Una lesión se cura. Borrar la fila entonces sería tirar el motivo por el que
-- durante cuatro meses no hubo peso muerto en el programa — y eso es justo lo
-- que hay que poder mirar cuando se repite. La fila se queda con su fecha de
-- alta y su fecha de resolución, y deja de avisar.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla clients.';
  END IF;
  /* Las tres funciones de autorización que usan las políticas de abajo. Sin
     ellas la tabla se crearía ABIERTA de par en par, que es peor que no
     crearla. */
  IF to_regprocedure('public.app_can_read_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existen las funciones app_can_*_client.';
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_conditions (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  /*
    Con CASCADA, y es lo primero que hay que mirar de esta tabla.

    Las tablas de bloque apuntan a `clients` SIN cascada, y por eso borrar a un
    cliente falla por clave ajena si antes no se han vaciado a mano una por una
    (ver `deleteClientCompletely`). Esa lista escrita a mano es exactamente cómo
    se olvida una tabla, y olvidarse de ESTA sería dejar sin borrar datos de
    salud de alguien que ha pedido que se borren. Aquí lo garantiza la base.

    La aplicación la borra igualmente antes que la ficha: la cascada es la red,
    no la única cuerda.
  */
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  area        text NOT NULL DEFAULT 'training',
  label       text NOT NULL,
  detail      text,
  severity    text NOT NULL DEFAULT 'note',
  since       date,
  resolved_at date,
  created_at  timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at  timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT client_conditions_pkey PRIMARY KEY (id),
  CONSTRAINT client_conditions_area_check
    CHECK (area IN ('training', 'nutrition', 'both')),
  CONSTRAINT client_conditions_severity_check
    CHECK (severity IN ('note', 'block')),
  /*
    El nombre no puede quedar vacío: una fila sin etiqueta es una fila que no se
    puede leer ni borrar desde la interfaz, porque no tiene nada donde pulsar. Y
    el tope corta el pegado accidental de media anamnesis en la casilla del
    nombre — lo largo va en `detail`, que para eso está.
  */
  CONSTRAINT client_conditions_label_check
    CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  CONSTRAINT client_conditions_detail_check
    CHECK (detail IS NULL OR length(detail) <= 2000)
);

/* La consulta que hace la aplicación es siempre «los de este cliente». */
CREATE INDEX IF NOT EXISTS client_conditions_client_idx
  ON public.client_conditions (client_id);

ALTER TABLE public.client_conditions ENABLE ROW LEVEL SECURITY;

-- ── El entrenador: lee y escribe los de sus clientes ───────────────────────
DROP POLICY IF EXISTS "conditions_coach_read" ON public.client_conditions;
CREATE POLICY "conditions_coach_read" ON public.client_conditions
  FOR SELECT TO authenticated USING (public.app_can_read_client(client_id));

DROP POLICY IF EXISTS "conditions_coach_write" ON public.client_conditions;
CREATE POLICY "conditions_coach_write" ON public.client_conditions
  FOR ALL TO authenticated
  USING (public.app_can_write_client(client_id))
  WITH CHECK (public.app_can_write_client(client_id));

/*
  ── El cliente: los LEE y no los escribe ──────────────────────────────────
  Los lee porque son suyos: son sus lesiones y sus intolerancias, y por el RGPD
  puede pedirlos igualmente. Esconderlos en la aplicación y entregarlos en la
  exportación sería la peor combinación de las dos.

  No los escribe todavía, y es una decisión: lo que aquí se apunta condiciona lo
  que el entrenador prescribe, y una fila que aparece sola en mitad de un
  programa ya montado no es un dato, es una sorpresa. Que el cliente los declare
  en su alta —con el entrenador revisándolos— es otra fase y otra política.
*/
DROP POLICY IF EXISTS "conditions_client_read" ON public.client_conditions;
CREATE POLICY "conditions_client_read" ON public.client_conditions
  FOR SELECT TO authenticated USING (public.app_is_client(client_id));

/*
  `anon` explícito, no solo `public`. Es la lección de la 0047: en este proyecto
  los objetos nuevos nacen con permisos concedidos a `anon` por los
  `ALTER DEFAULT PRIVILEGES` del esquema de Supabase, y un REVOKE a `public` no
  los retira. En una tabla de datos de salud eso no es un detalle.
*/
REVOKE ALL ON public.client_conditions FROM public, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_conditions TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que anon no la ve (las cuatro tienen que dar `f`):
--
--   SELECT has_table_privilege('anon', 'public.client_conditions', p)
--   FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p;
--
-- Que la cascada funciona (tiene que devolver 0 después de borrar):
--
--   -- sobre un cliente de prueba, NUNCA sobre uno real
--   DELETE FROM public.clients WHERE id = '<id-de-prueba>';
--   SELECT count(*) FROM public.client_conditions WHERE client_id = '<id-de-prueba>';
--
-- Desde la APLICACIÓN: Ficha → «Condicionantes» → «Añadir». Uno de entreno y uno
-- de nutrición. El de entreno tiene que salir en la cabecera de su Rutina y el de
-- nutrición en la de su Nutrición, y ninguno de los dos en la sección del otro.
--
-- ── Sin aplicar ─────────────────────────────────────────────────────────────
-- La carga inicial ignora el error de «no existe la tabla» y deja el mapa vacío,
-- así que la ficha enseña su estado vacío y las dos secciones no enseñan nada.
-- ============================================================================
