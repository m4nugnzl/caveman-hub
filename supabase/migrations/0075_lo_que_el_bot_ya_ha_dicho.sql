-- ============================================================================
-- La memoria del bot: qué avisó y cuándo
-- ----------------------------------------------------------------------------
-- ⚠️  No toca nada existente. Una tabla nueva, pequeña y de solo añadir.
--
-- ══ Por qué el bot necesita memoria ═════════════════════════════════════════
--
-- Porque la regla que decide si un canal así sobrevive no es qué información
-- manda, sino **cuándo se calla**: solo habla cuando cambia el conjunto de cosas
-- que hay que atender. Y para saber si algo ha cambiado hace falta saber qué se
-- dijo la última vez.
--
-- Sin esta tabla el bot solo puede hacer dos cosas, y las dos son malas: mandar
-- un resumen cada vez que corre —que es el aviso diario que se silencia en dos
-- semanas— o no mandar nada.
--
-- ══ Por qué NO va en `platform_snapshots` ══════════════════════════════════
--
-- Parecen lo mismo —dos memorias del mismo informe— y no lo son:
--
--   · Una instantánea es una MEDIDA con cadencia de días: `dia` es su clave
--     primaria justamente para que solo haya una por día.
--   · Un aviso es un ACTO con cadencia de minutos: el bot puede hablar dos veces
--     el mismo día si algo cambia dos veces, y las dos veces cuentan.
--
-- Meter las dos en la misma tabla obligaría a soltar la clave por día, que es la
-- regla que impide que probar el script tres veces seguidas dibuje un dientecito
-- en las tendencias.
--
-- ══ Qué guarda, y qué NO ═══════════════════════════════════════════════════
--
-- Guarda los TÍTULOS de lo que había que atender, no el informe. El texto del
-- mensaje se guarda también, y eso sí es opcional: sirve para contestar «¿por
-- qué no me avisaste de esto?» sin tener que reconstruir nada.
--
-- No guarda a quién se le mandó. El destinatario es una lista blanca en un
-- secreto de la función, no un dato del producto.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),

  -- Lo que había que atender en ese momento. Es contra esto que se compara la
  -- vez siguiente para saber qué es nuevo y qué se ha arreglado.
  --
  -- Se guarda TAMBIÉN cuando no se habla (`hablado = false`): si solo se
  -- guardara al hablar, un día de silencio borraría la memoria y al siguiente
  -- todo volvería a parecer nuevo.
  titulos text[] NOT NULL DEFAULT '{}',

  -- Si de verdad se mandó algo. Distinguirlo es lo que permite depurar un bot
  -- que calla: se ve que corrió, qué vio y por qué decidió no hablar.
  hablado boolean NOT NULL DEFAULT false,
  porque text,
  mensaje text
);

CREATE INDEX IF NOT EXISTS platform_alerts_at_idx ON public.platform_alerts (at DESC);

ALTER TABLE public.platform_alerts ENABLE ROW LEVEL SECURITY;
-- Sin políticas, igual que las otras tres tablas de plataforma: no se lee ni se
-- escribe desde el navegador. La función edge la consulta con `service_role`,
-- que no pasa por RLS.

COMMIT;

-- ============================================================================
-- Después de aplicarla
-- ----------------------------------------------------------------------------
-- El primer aviso fija la línea base y lo dice en una línea, en vez de volcar
-- las veinte cosas que haya: volcar la lista entera es la forma de que el
-- segundo mensaje no se lea.
--
-- Para ver por qué el bot no ha dicho nada:
--
--   SELECT at, hablado, porque, cardinality(titulos) AS cuantas
--   FROM public.platform_alerts ORDER BY at DESC LIMIT 10;
-- ============================================================================
