-- ============================================================================
-- El plato es una pieza: el `kind` del cajón deja de llamarse «comida»
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para que sigan viéndose los platos guardados. Aditiva en el
--     sentido que importa: no crea, no borra y no cambia ninguna carga —solo
--     reescribe una etiqueta—.
--
-- ⚠️  ORDEN DE DESPLIEGUE: da igual, y es a propósito. `mapCajonFromDb` traduce
--     'comida' → 'plato' al leer, así que el código nuevo entiende las filas
--     viejas y esta migración no puede llegar tarde. Ese puente se retira
--     cuando esto esté aplicado en todas partes.
--
-- ══ Qué pasaba ═════════════════════════════════════════════════════════════
--
-- La 0112 guardó los platos con `kind = 'comida'` porque el cajón se describe
-- con el vocabulario del portapapeles (`domain/cajon.js`: «`kind` es uno de
-- `TIPO`… y `carga` es EXACTAMENTE lo que viaja en la bandeja»), y ahí la forma
-- de la dieta era la COMIDA.
--
-- Pero para los platos esa frase no era cierta, y se veía en la propia tabla:
--
--     kind = 'comida'  →  carga = { foods }       ← una ración
--     TIPO.COMIDA      →  carga = { name, options[] }  ← una comida entera
--
-- Dos cosas distintas con el mismo nombre. La consecuencia visible es que un
-- plato no podía volver a la mano (`alaMano: null` en `CAJONES`): soltar una
-- ración donde va una comida habría pegado otra cosa. Y de ahí colgaba la única
-- pieza de la dieta que no viajaba —la ALTERNATIVA de una comida—, que tenía
-- que moverse con un «copiar a otro día» que solo llegaba a los días de la
-- misma persona.
--
-- Con `TIPO.PLATO` en el portapapeles la ración tiene forma propia, el `kind`
-- vuelve a decir la verdad y el plato guardado se puede poner en cualquier
-- comida de cualquiera, cuadrado a su objetivo.
--
-- ══ Por qué no hace falta tocar `carga` ════════════════════════════════════
--
-- Porque ya era `{ foods }`: lo que estaba mal era el nombre de la forma, no lo
-- que había dentro. Por eso esto es un UPDATE de una columna y no una copia.
--
-- ══ Y por qué no hay CHECK sobre `kind` ════════════════════════════════════
--
-- La 0112 lo dejó escrito y sigue valiendo: qué formas tienen cajón es una
-- decisión de producto que vive en `CAJONES`, y clavarla aquí obligaría a una
-- migración por cada forma nueva. Esta migración es la prueba de lo contrario
-- de lo que se temía: renombrar una forma cuesta un UPDATE, no un ALTER.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.coach_templates') IS NULL THEN
    RAISE EXCEPTION 'Falta 0112_el_cajon_del_entrenador.sql: no existe `coach_templates`.';
  END IF;
END $$;

/*
  Idempotente por construcción: aplicarla dos veces no encuentra nada la
  segunda. Y no toca las filas de las otras formas —'hoja', 'bloque'—, que se
  llaman igual que antes.
*/
UPDATE public.coach_templates
   SET kind = 'plato'
 WHERE kind = 'comida';

COMMENT ON TABLE public.coach_templates IS
  'El cajón del entrenador: bloques, días y platos guardados con nombre. Ver domain/cajon.js y docs/replanteamiento-lo-guardado.md.';

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT kind, count(*) FROM public.coach_templates GROUP BY kind;
--
-- No debe quedar ninguna fila con kind = 'comida'.
-- ============================================================================
