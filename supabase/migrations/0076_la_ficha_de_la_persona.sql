-- ============================================================================
-- La ficha empieza a saber quién es la persona
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para editar la ficha. Sin ella, guardar la altura o la fecha de
--     nacimiento falla con «Could not find the 'height_cm' column» y el aviso de
--     «No se guardó» con su botón de reintentar. Es ADITIVA: dos columnas que
--     nacen a NULL y ni un DROP, ni un DELETE, ni un dato que se toque.
--
-- ══ Qué sabía la aplicación de un cliente hasta hoy ═════════════════════════
--
-- Su nombre, su correo, su teléfono, su sexo y lo que te paga. Nada más. Toda la
-- información con la que de verdad se decide un entrenamiento o una dieta —la
-- edad, la altura, sus lesiones, sus intolerancias— vivía fuera: en la cabeza
-- del entrenador, en WhatsApp, o como mucho en el PDF que cuelga del paso
-- «Anamnesis» del alta (`domain/intake.js`), donde está guardada pero la
-- aplicación NO PUEDE LEERLA.
--
-- Esta migración abre la ficha por donde tiene consecuencias inmediatas.
--
-- ══ Por qué estas dos y no un jsonb con todo dentro ═════════════════════════
--
-- Porque las dos ALIMENTAN CUENTAS, y una cuenta no puede depender de que
-- alguien haya escrito «178» y no «1,78 m» en un campo de texto libre:
--
--   · `birth_date` da la edad, que es lo que le falta a cualquier fórmula de
--     gasto energético y a las zonas de frecuencia cardíaca del objetivo de
--     cardio (migración 0059).
--   · `height_cm` da el ratio cintura/altura. La cintura ya se mide (está en los
--     perímetros) y ya tiene color propio en `domain/metrics.js`; sin la altura
--     es un número suelto, con ella es un indicador con lectura.
--
-- Es exactamente el sitio donde ya vive `gender`, que es de la misma clase de
-- dato y por el mismo motivo: decide qué fórmula de pliegues se aplica.
--
-- Lo que SÍ irá en un jsonb son los parámetros que cada entrenador se invente
-- —esos cambian sin avisar y una tabla normalizada obligaría a migrar cada vez,
-- que es el razonamiento que ya hizo la 0060 con las respuestas del check-in—.
-- Pero eso es otra migración y otro problema.
--
-- ══ La edad se DERIVA, no se guarda ════════════════════════════════════════
--
-- Guardar «34» sería guardar algo que caduca solo, y el año que viene la ficha
-- mentiría sin que nadie tocara nada. Es el mismo error que costó una columna:
-- `clients.current_weight` enseñaba «Peso actual» con el valor congelado del día
-- que se dejó de rellenar, y la 0048 tuvo que borrarla. Un dato viejo con
-- etiqueta de actual es peor que un hueco: el hueco se pregunta, la cifra se
-- cree.
--
-- Y por lo mismo el PESO no vuelve aquí. La ficha lo ENSEÑA, leyéndolo del
-- histórico de pesajes (`latestWeight`), pero no guarda una copia suya.
--
-- ══ Los topes ═════════════════════════════════════════════════════════════
--
-- `clients` la escribe el entrenador con un UPDATE directo bajo RLS, así que no
-- hay ninguna función donde comprobar lo que entra: si la comprobación no está
-- en la columna, no está en ningún sitio. Son deliberadamente laxos —cortan el
-- disparate, no la excepción—: 300 cm deja pasar a cualquier persona viva, y
-- 1900 cualquier fecha de nacimiento plausible.
--
-- El tope de arriba de `birth_date` no puede ser `CURRENT_DATE`: Postgres exige
-- funciones inmutables en un CHECK y esa no lo es. Que no esté en el futuro lo
-- comprueba la aplicación, que además es donde se puede decir con palabras.
-- ============================================================================

BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS height_cm  numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_height_cm_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_height_cm_check
      CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm < 300));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_birth_date_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_birth_date_check
      CHECK (birth_date IS NULL OR birth_date > DATE '1900-01-01');
  END IF;
END $$;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que las dos columnas existen (dos filas):
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'clients' AND column_name IN ('birth_date', 'height_cm');
--
-- Que el tope corta de verdad (tiene que dar error, no escribir):
--
--   UPDATE public.clients SET height_cm = 450 WHERE id = '<un-id>';
--
-- Desde la APLICACIÓN: entrar en un cliente → Ficha → «Editar». Poner altura y
-- fecha de nacimiento, guardar, y recargar la página. La cabecera de la ficha
-- tiene que decir la edad en años y la altura en centímetros.
--
-- ── Sin aplicar ─────────────────────────────────────────────────────────────
-- La aplicación no se rompe: las consultas son `select('*')`, las dos columnas
-- llegan `undefined` y la ficha las enseña como lo que son, un hueco. Lo único
-- que falla es GUARDARLAS, y eso se ve con su aviso.
-- ============================================================================
