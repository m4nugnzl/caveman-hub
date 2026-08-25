-- ============================================================================
-- El cliente declara lo suyo: lesiones, alergias, patologías
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para el apartado de salud del cuestionario de alta. Sin ella, el
--     cliente ve las preguntas y al guardar falla con «permission denied». Es
--     ADITIVA: una política nueva sobre una tabla que ya existe (0077).
--
-- ══ Lo que estaba mal ══════════════════════════════════════════════════════
--
-- La 0077 dejó los condicionantes en manos del entrenador y al cliente solo con
-- LECTURA, con este argumento: «lo que aquí se apunta condiciona lo que el
-- entrenador prescribe, y una fila que aparece sola en mitad de un programa ya
-- montado no es un dato, es una sorpresa».
--
-- El argumento vale para un cliente EN MARCHA y no vale para uno que acaba de
-- entrar. Y el resultado era una contradicción que se veía a simple vista: el
-- cuestionario de alta preguntaba a qué hora entrena y cuántas comidas hace, y
-- **no preguntaba por sus lesiones ni por sus alergias**. Eso no es una
-- anamnesis: es una ficha de preferencias con nombre de historial.
--
-- Quien sabe que tiene una hernia es él. Que lo cuente por WhatsApp para que su
-- entrenador lo teclee es exactamente el trabajo que esto vino a quitar — y es
-- además donde se pierde: en un hilo de mensajes.
--
-- ══ Añadir sí; tocar lo que ya hay, no ═════════════════════════════════════
--
-- Solo INSERT, igual que con las fotos de su maquinaria (0079). No UPDATE y no
-- DELETE, y la diferencia importa más aquí que allí:
--
--   · Lo que el ENTRENADOR apunta es su criterio profesional —«sin peso muerto
--     libre hasta que la resonancia diga otra cosa»— y el cliente no puede
--     borrarlo ni suavizarlo.
--   · Marcar una lesión como RESUELTA es una decisión clínica, no una
--     administrativa. Que la cure quien la valoró.
--
-- Lo que declare él aparece en la ficha de su entrenador como una fila más, y
-- desde ahí se corrige, se detalla o se retira. Que llegue «duele el hombro» y
-- acabe siendo «pinzamiento subacromial, sin press militar» es exactamente el
-- trabajo del entrenador — pero no puede hacerlo sobre algo que no le ha llegado.
--
-- ══ Por qué NO se le deja poner la gravedad ════════════════════════════════
--
-- La columna `severity` distingue «tenlo en cuenta» de «no se le puede poner», y
-- eso segundo es un veto que cambia lo que se prescribe. Lo decide quien
-- prescribe. La aplicación manda siempre `note` desde el portal —lo hace el
-- navegador, no esta política, porque una política no puede mirar columnas
-- concretas de una fila que entra— y el entrenador sube a veto lo que toque.
--
-- La política no puede impedirlo, así que esto es una regla de la interfaz y hay
-- que decirlo en voz alta: un cliente decidido podría insertar un veto suyo con
-- la anon key. El daño máximo es que su propio plan se le muestre más
-- restringido de lo que su entrenador decidió, y ese lado del error es el que se
-- puede vivir.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.client_conditions') IS NULL THEN
    RAISE EXCEPTION 'Falta 0077_condicionantes.sql.';
  END IF;
END $$;

BEGIN;

DROP POLICY IF EXISTS "conditions_client_insert" ON public.client_conditions;
CREATE POLICY "conditions_client_insert" ON public.client_conditions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_client(client_id)
    /*
      Lo que declara el cliente nace SIN resolver. Sin esto podría insertar una
      lesión ya marcada como curada: una fila que consta y que no avisa de nada,
      que es la peor manera de que un dato de salud exista.
    */
    AND resolved_at IS NULL
  );

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que el cliente NO puede borrar ni cambiar los suyos (las dos, cero filas
-- afectadas, ejecutándolas con su sesión):
--
--   DELETE FROM public.client_conditions WHERE client_id = '<su-id>';
--   UPDATE public.client_conditions SET label = 'x' WHERE client_id = '<su-id>';
--
-- Desde la APLICACIÓN: entrar como cliente en «Tu alta», declarar una lesión y
-- guardar. Tiene que aparecer en la ficha de su entrenador, en «Condicionantes»,
-- y en la cabecera de su rutina.
--
-- ── Sin aplicar ─────────────────────────────────────────────────────────────
-- El apartado de salud del cuestionario se ve y falla al guardar, con su aviso.
-- Lo del entrenador no cambia en nada.
-- ============================================================================
