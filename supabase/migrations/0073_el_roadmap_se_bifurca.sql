-- ============================================================================
-- El roadmap se bifurca: los caminos posibles al final de una fase
-- ----------------------------------------------------------------------------
-- Requiere `0028_client_roadmap.sql`. Se para sola si falta.
--
-- ⚠️  Aditiva: una columna que nace nula, dos CHECK y un índice parcial. No
--     reescribe ninguna fila ni toca el constraint de exclusión. Con la columna
--     a nulo —que es como queda todo lo existente— la aplicación se comporta
--     exactamente igual que antes.
--
-- ══ Qué le falta hoy al roadmap ════════════════════════════════════════════
--
-- Un roadmap es hoy una línea recta: definición, mantenimiento, volumen, una
-- detrás de otra. Y se planifica así porque la base obliga a decidir HOY lo que
-- viene dentro de tres meses.
--
-- Pero eso no es como se entrena. Lo que se piensa de verdad es:
--
--   «Doce semanas de recomposición. Si el punto ha bajado lo suficiente,
--    metemos volumen; si todavía no, seis semanas más de definición.»
--
-- Hay dos futuros y un momento en el que se elige entre ellos. Hoy eso no cabe
-- en ningún sitio: o se inventa una continuación que probablemente no sea la
-- buena, o se deja el plan cortado y el cliente vuelve a no ver más allá de la
-- fase en la que está — que es justo lo que el roadmap venía a arreglar.
--
-- ══ Por qué NO son fases ═══════════════════════════════════════════════════
--
-- Es la primera idea que se le ocurre a cualquiera: un `parent_id` y un árbol
-- en esta misma tabla. Y rompe lo único que sostiene todo esto.
--
-- «Volumen, 16 semanas» y «Definición, 6 semanas» arrancan el mismo día: son
-- dos tramos que cubren las mismas fechas. Para guardarlos habría que quitar el
-- `EXCLUDE USING gist` de la 0028, y con él se cae la propiedad de la que
-- depende la analítica entera — que `phaseAt(hoy)` devuelva UNA fase o ninguna,
-- nunca dos. El día que devuelva dos, «el objetivo de hoy» deja de tener
-- respuesta y `effectiveGoal` tiene que elegir una arbitrariamente.
--
-- El giro que lo resuelve: **los caminos no son fases**. Son borradores con una
-- frase al lado, y solo uno llega a existir. Al decidir, el elegido se inserta
-- como fase normal —con sus fechas, su exclusión y sus políticas de siempre— y
-- los otros desaparecen, porque nunca fueron nada.
--
-- ══ Por qué una columna y no una tabla ═════════════════════════════════════
--
-- La 0028 razonó al revés para las fases, y con motivo: el cliente tenía que
-- verlas, se preguntan por fechas y a través de la cartera, y se solapan si
-- nadie lo impide. Un camino sin recorrer no cumple ninguna de las tres.
--
-- Lo que sí gana viviendo aquí:
--
--   · **Ni una política nueva.** Hereda las cuatro de la 0028 tal cual. El
--     entrenador escribe con la suscripción al día, el cliente lee. Que el
--     cliente vea los dos caminos es medio motivo de que esto exista, y sale
--     gratis: ya lee esta tabla entera.
--   · **Ni un join.** El cruce se dibuja con las fases que la ficha ya tiene
--     cargadas.
--   · **`ends_on` al lado.** La fecha en la que se decide ES el final de la
--     fase, así que no hay dos sitios donde pueda decir cosas distintas.
--
-- Y encaja con lo que esta tabla ya era: una fase tiene dos incógnitas —cuándo
-- acaba y qué viene después—. La primera lleva aquí desde la 0028, como
-- `ends_on NULL`. La segunda es la misma clase de cosa.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.client_phases') IS NULL THEN
    RAISE EXCEPTION 'Falta 0028_client_roadmap.sql: esta columna cuelga de sus fases.';
  END IF;
END $$;

BEGIN;

/*
  Los caminos posibles al final de esta fase. NULL = no hay cruce, que es el
  caso de casi todas las filas y el de todo lo que ya existe.

  La forma de cada elemento, que vive en `domain/fork.js`:

    {
      "when":      "Si el punto ha bajado lo suficiente",
      "title":     "Volumen",
      "direction": "bulk",
      "ratePct":   0.25,
      "weeks":     16
    }

  ── `when` es una frase y no una regla ──────────────────────────────────────
  No se compara con nada ni se evalúa: es como el entrenador llama a ese camino,
  igual que `title` convive con `direction` porque «Bajar para la boda» y
  «Definición» no dicen lo mismo.

  Un criterio evaluable —«grasa ≤ 12 %»— parecería mejor y sería peor: en cuanto
  existe algo que una máquina puede comprobar, aparece la presión para que la
  aplicación avance sola, y el día que se equivoque el entrenador se entera de
  que su cliente lleva tres semanas en volumen sin que él lo decidiera. Con una
  frase eso es imposible de construir, que es exactamente lo que se busca.

  La evidencia no hace falta guardarla aquí: el día que toca decidir,
  `domain/reading.js` ya está calculando en esa misma ficha el veredicto de
  ritmo, la adherencia y la fuerza. El cruce no mide nada — trae la decisión al
  momento en el que esa lectura ya está en la mesa.

  ── `weeks` y no fechas ─────────────────────────────────────────────────────
  Un camino se planifica en semanas antes de saber el día exacto en que
  empezaría, y si la fase que lo precede se alarga, unas fechas absolutas
  quedarían mintiendo. El inicio se deriva al elegir: el día siguiente al final
  de esta fase. Es la misma decisión que ya tomó `PHASE_WEEKS_RANGE`.
*/
ALTER TABLE public.client_phases
  ADD COLUMN IF NOT EXISTS next_options jsonb;

/*
  Dos caminos o tres. Ni uno —eso es la fase siguiente, y se crea como siempre—
  ni cuatro: más de tres caminos no es una decisión, es no tener criterio.
*/
ALTER TABLE public.client_phases
  DROP CONSTRAINT IF EXISTS client_phases_next_options_shape;
ALTER TABLE public.client_phases
  ADD CONSTRAINT client_phases_next_options_shape CHECK (
    next_options IS NULL OR (
      jsonb_typeof(next_options) = 'array'
      AND jsonb_array_length(next_options) BETWEEN 2 AND 3
    )
  );

/*
  Sin fecha de fin no hay fecha de decisión.

  Una fase abierta no acaba nunca, así que un cruce colgado de ella no se
  decidiría jamás y no habría día sobre el que avisar. La regla se escribe aquí
  y no solo en la interfaz porque es la que hace que el índice de abajo
  signifique algo: toda fila con caminos tiene un `ends_on` por el que ordenar.
*/
ALTER TABLE public.client_phases
  DROP CONSTRAINT IF EXISTS client_phases_fork_needs_end;
ALTER TABLE public.client_phases
  ADD CONSTRAINT client_phases_fork_needs_end CHECK (
    next_options IS NULL OR ends_on IS NOT NULL
  );

/*
  ── Lo que a propósito NO se comprueba aquí ─────────────────────────────────

  La forma de cada camino —que la dirección sea una de las tres, que las semanas
  estén entre 1 y 24, que la frase no esté vacía— se valida en `domain/fork.js`
  y no con un `jsonpath` en un CHECK.

  No es dejadez: un camino es un BORRADOR, y para convertirse en registro tiene
  que pasar por `validatePhase` y por los CHECK que esta tabla ya tiene sobre
  `direction` y `rate_pct`. Lo peor que puede hacer un borrador malformado es
  pintar una tarjeta rara. Escribir esas reglas dos veces, una de ellas en
  jsonpath ilegible, garantiza sobre todo que el día que haya una cuarta
  dirección haya que acordarse de las dos.

  Y la que no se puede escribir en un CHECK: **el cruce va en la ÚLTIMA fase**.
  Depende de las demás filas, así que la comprueban `domain/fork.js` y la
  interfaz. Si aparecen caminos en una fase que ya tiene otra detrás, la
  decisión estaba tomada y esos caminos son basura: `staleForks()` los encuentra
  para poder limpiarlos.
*/

/*
  «¿A quién le toca decidir esta semana?»

  Parcial y diminuto: solo las fases con cruce abierto, que son unas pocas de
  toda la tabla. Es el hermano de `client_phases_ending_idx`, y sirve al mismo
  gesto —la bandeja de «Hoy»— con la diferencia de que aquí no vence un tramo:
  vence una decisión, y esa no la puede tomar nadie más.
*/
CREATE INDEX IF NOT EXISTS client_phases_decision_idx
  ON public.client_phases (ends_on)
  WHERE next_options IS NOT NULL;

COMMIT;

-- ============================================================================
-- Sobre RLS no hay nada que hacer, y ese es el punto
-- ----------------------------------------------------------------------------
-- Las cuatro políticas de la 0028 son `FOR SELECT`/`FOR ALL` sobre la fila
-- entera, así que la columna nueva entra sola: el entrenador la escribe con la
-- suscripción al día (`can_write_client_active`) y el cliente la lee
-- (`app_is_client`). Una tabla aparte habría exigido repetir las cuatro.
-- ============================================================================

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Un cruce al final de una fase (sustituye el uuid por uno con `ends_on`):
--
--   UPDATE public.client_phases SET next_options = '[
--     {"when":"Si el punto ha bajado lo suficiente","title":"Volumen","direction":"bulk","ratePct":0.25,"weeks":16},
--     {"when":"Si todavía no","title":"Definición","direction":"cut","ratePct":0.5,"weeks":6}
--   ]'::jsonb WHERE id = '...';
--
-- Un solo camino no es un cruce — esto tiene que fallar:
--
--   UPDATE public.client_phases SET next_options = '[{"title":"Volumen"}]'::jsonb WHERE id = '...';
--   -- ERROR: violates check constraint "client_phases_next_options_shape"
--
-- Y un cruce en una fase abierta tampoco — esto también tiene que fallar:
--
--   UPDATE public.client_phases SET ends_on = NULL WHERE next_options IS NOT NULL;
--   -- ERROR: violates check constraint "client_phases_fork_needs_end"
--
-- A quién le toca decidir en los próximos 14 días:
--
--   SELECT client_id, title, ends_on, jsonb_array_length(next_options)
--   FROM public.client_phases
--   WHERE next_options IS NOT NULL
--     AND ends_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
--   ORDER BY ends_on;
-- ============================================================================
