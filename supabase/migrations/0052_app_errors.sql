-- ============================================================================
-- Qué se rompe de verdad
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Una tabla, sus políticas y nada más. No toca ninguna tabla,
--     ninguna columna ni ninguna política existente.
--
--     La aplicación funciona SIN esta migración, igual que con la 0045: si la
--     tabla no existe, `lib/diagnostics.js` deja de mandar y todo lo demás va
--     igual. Un fallo al registrar un fallo no puede ser un fallo más.
--
-- ══ Qué resuelve ════════════════════════════════════════════════════════════
--
-- `lib/diagnostics.js` ya recoge los fallos, pero **en memoria y solo de la
-- sesión en curso**, y únicamente viajan si esa persona se molesta en abrir un
-- ticket. Es decir: hoy solo se conocen los fallos de quien además tuvo la
-- paciencia de contarlos.
--
-- La mayoría de la gente no abre tickets. Cierra la pestaña. Así que el conjunto
-- de fallos que se conocen está sesgado justo hacia los usuarios más pacientes,
-- que son los que menos falta hace retener.
--
-- Con esto se puede contestar a lo que hoy no se puede:
--
--   · ¿Cuántas veces al día falla un guardado, y en qué pantalla?
--   · ¿Cuántas cuentas DISTINTAS ven ese fallo? (una es un caso raro; seis es un
--     error de verdad, y la diferencia decide si se arregla esta semana)
--   · ¿Está subiendo la tasa de conflictos de concurrencia? Es la señal que dice
--     si el JSONB de `auditoria.md` §1.4 ya está doliendo.
--
-- ══ Por qué aquí SÍ se instrumenta el portal del cliente ════════════════════
--
-- `lib/analytics.js` no apunta NADA desde `/mi/`, y esa decisión sigue en pie:
-- medir el comportamiento de la persona de la que esto guarda su peso, sus
-- pliegues y fotos de su cuerpo sería usar como sujeto de análisis a quien ya es
-- sujeto de los datos.
--
-- Un fallo no es comportamiento. No dice qué hizo esa persona, dice que el
-- software se rompió mientras lo intentaba. Enterarse de que el portal del
-- cliente lleva una semana sin dejar subir fotos PROTEGE al cliente; no
-- enterarse no le protege de nada. Son dos cosas distintas y por eso la decisión
-- es distinta.
--
-- ══ Y por qué aquí tampoco puede haber datos personales ═════════════════════
--
-- Ésta es más difícil que la 0045, y conviene decirlo sin adornos: allí el
-- contenido lo elige el programador (`'pantalla_vista'`) y basta un CHECK de
-- forma. Aquí el contenido lo escribe **Postgres**, y un mensaje de error real
-- puede llevar datos dentro:
--
--   duplicate key value violates unique constraint "clients_email_key"
--   DETAIL:  Key (email)=(ana@correo.com) already exists.
--
-- Así que hay DOS capas, y ninguna se fía de la otra:
--
--   1. EL CLIENTE SANEA (`lib/diagnostics.js`): corta por la primera línea,
--      sustituye lo que va entre `=(…)` —que es donde Postgres pone los valores—,
--      los identificadores y los correos.
--   2. LA BASE RECHAZA. Los CHECK de abajo tiran la fila si aun así llega un
--      correo o un identificador. No la limpian: la rechazan, y como el emisor se
--      traga los errores, ese fallo simplemente no se registra.
--
-- Perder el registro de un fallo es barato. Guardar el correo de alguien en una
-- tabla de diagnóstico no lo es.
--
-- Lo que NO se pretende: que esto sea infalible. Un mensaje de error de una
-- librería cualquiera podría colar un dato con una forma que no se ha previsto.
-- Por eso el plazo de conservación es corto (90 días, al final del archivo) y por
-- eso `message` está topado a 300 caracteres: se guarda lo justo para reconocer
-- el fallo, no para reconstruir la escena.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_errors (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Quién, de forma seudónima, y con el mismo trato que en la 0045: si alguien
  -- borra su cuenta, su rastro se va con ella. No se conserva «anonimizado».
  --
  -- Se guarda el actor —y no solo un recuento— porque es lo que distingue «un
  -- entrenador que se topa con esto doscientas veces» de «doscientos
  -- entrenadores que se topan una», y esas dos cosas se arreglan de forma
  -- distinta: la primera es un caso raro suyo, la segunda es un error del
  -- producto.
  actor   uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  team_id uuid        REFERENCES public.teams (id) ON DELETE SET NULL,

  -- Desde qué mitad del producto. Sin esto, un fallo del portal y uno del panel
  -- se leen como el mismo problema, y casi nunca lo son.
  rol     text        NOT NULL CHECK (rol IN ('coach', 'client')),

  -- De qué parte viene: 'guardado', 'carga', 'js', 'promesa'. Identificador
  -- corto por la misma razón que el nombre de evento de la 0045.
  source  text        NOT NULL CHECK (source ~ '^[a-z][a-z0-9_]{1,20}$'),

  /*
    La ruta NORMALIZADA: `/c/:id/rutina`, nunca `/c/8f3a…/rutina`.

    Es la columna con más riesgo de toda la tabla —la ruta real lleva dentro el
    identificador de un cliente— y por eso el patrón NO admite mayúsculas ni
    puntos ni el `%` de una URL escrita a mano. Un identificador con guiones
    encajaría en el patrón, así que la garantía de verdad la da el CHECK de más
    abajo, que rechaza cualquier UUID en cualquier columna de texto.
  */
  ruta    text        NOT NULL CHECK (ruta ~ '^/[a-z0-9/:_-]{0,60}$'),

  -- El código del error cuando lo hay: `42501` es RLS, `23505` clave duplicada.
  -- Vale más que el mensaje para agrupar, porque no cambia de idioma ni de
  -- redacción entre versiones de Postgres.
  code    text        CHECK (code IS NULL OR code ~ '^[A-Za-z0-9_.-]{1,24}$'),

  message text        NOT NULL CHECK (
                        char_length(message) BETWEEN 1 AND 300
                        -- Ningún correo. Es el dato personal que más fácil se
                        -- cuela en un mensaje de Postgres, y `@` lo caza entero.
                        AND message !~ '@'
                        -- Ningún identificador. Un `client_id` en un mensaje
                        -- ata esta fila a una persona concreta, que es justo lo
                        -- que la tabla promete no hacer.
                        AND message !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}'
                      ),

  -- Repeticiones agrupadas en el navegador antes de mandarlas. Sin esto, un
  -- fallo en bucle escribiría mil filas idénticas y además de no aportar nada
  -- convertiría la tabla en un problema por su cuenta.
  veces   integer     NOT NULL DEFAULT 1 CHECK (veces BETWEEN 1 AND 1000),

  at      timestamptz NOT NULL DEFAULT now()
);

/*
  Un solo índice, por el mismo motivo que en la 0045: la única consulta que se
  hace es «qué se ha roto en los últimos N días». La agrupación por mensaje, por
  ruta o por cuenta la hace `scripts/radiografia.mjs` sobre esa ventana, que a
  este volumen sale más barato que mantener índices que nadie usa en una tabla
  donde solo se escribe.
*/
CREATE INDEX IF NOT EXISTS app_errors_at_idx ON public.app_errors (at DESC);

COMMENT ON TABLE public.app_errors IS
  'Fallos de la aplicación, sin datos personales (ver la cabecera de la 0052). '
  'Desechable: se poda a los 90 días y no entra en la copia de seguridad.';

ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;

/*
  ══ Escribir sí, leer no ═══════════════════════════════════════════════════

  Idéntico a `product_events`, y por las mismas razones. Cualquiera con sesión
  puede apuntar lo suyo —y solo lo suyo—, y NADIE puede leer desde el navegador.

  Que un usuario no pueda leer esta tabla importa más de lo que parece: es un
  listado de por dónde falla la aplicación, con sus códigos de error y sus rutas.
  Es material de reconocimiento para quien quisiera buscarle las cosquillas a la
  seguridad, y no hay ninguna pantalla que lo necesite.

  Sin política de SELECT no hay lectura posible: con RLS activo, lo que no está
  permitido explícitamente está prohibido.
*/
DROP POLICY IF EXISTS "app_errors_insert_own" ON public.app_errors;
CREATE POLICY "app_errors_insert_own" ON public.app_errors
  FOR INSERT TO authenticated
  WITH CHECK (actor = auth.uid());

REVOKE ALL ON public.app_errors FROM anon;
GRANT INSERT ON public.app_errors TO authenticated;

COMMIT;


-- ============================================================================
-- Podarlo
-- ----------------------------------------------------------------------------
-- Noventa días, la mitad que los eventos de uso de la 0045, y a propósito: un
-- fallo de hace tres meses o está arreglado —y entonces solo estorba— o sigue
-- reproduciéndose hoy, y entonces ya está en la ventana. No hay ninguna pregunta
-- que necesite el histórico largo.
--
-- Con `pg_cron`, si está disponible:
--
--   SELECT cron.schedule('podar-fallos', '0 4 * * 0', $$
--     DELETE FROM public.app_errors WHERE at < now() - interval '90 days';
--   $$);
--
-- Y a mano, mientras tanto:
--
--   DELETE FROM public.app_errors WHERE at < now() - interval '90 days';
--
-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que las dos defensas de datos personales funcionan (las dos tienen que FALLAR):
--
--   INSERT INTO public.app_errors (actor, rol, source, ruta, message)
--   VALUES (auth.uid(), 'coach', 'guardado', '/c/:id/rutina',
--           'Key (email)=(ana@correo.com) already exists');
--
--   INSERT INTO public.app_errors (actor, rol, source, ruta, message)
--   VALUES (auth.uid(), 'coach', 'guardado', '/c/:id/rutina',
--           'no row found for 8f3a1c22-0000-4444-8888-abcdefabcdef');
--
-- Que la ruta sin normalizar no entra (tiene que FALLAR):
--
--   INSERT INTO public.app_errors (actor, rol, source, ruta, message)
--   VALUES (auth.uid(), 'coach', 'js', '/c/8f3a1c22-0000-4444-8888-abcdefabcdef/rutina', 'boom');
--
-- Que no se puede leer desde el navegador (tiene que devolver CERO filas):
--
--   SELECT * FROM public.app_errors;
--
-- Lo que se rompe y a cuánta gente, que es para lo que existe todo esto:
--
--   SELECT source, ruta, code, sum(veces) AS veces, count(DISTINCT actor) AS cuentas
--   FROM public.app_errors
--   WHERE at > now() - interval '7 days'
--   GROUP BY source, ruta, code ORDER BY veces DESC;
-- ============================================================================
