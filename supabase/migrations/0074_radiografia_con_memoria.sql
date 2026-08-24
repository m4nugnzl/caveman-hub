-- ============================================================================
-- La radiografía deja de acordarse en un archivo
-- ----------------------------------------------------------------------------
-- ⚠️  No toca ninguna tabla existente y no borra nada. Añade dos tablas nuevas
--     que hasta ahora eran `informes/estado.json`.
--
-- ══ El problema ═════════════════════════════════════════════════════════════
--
-- La radiografía recuerda dos cosas entre ejecuciones, y las dos viven en un
-- archivo de 6 KB en el disco de una sola máquina:
--
--   1. Qué hallazgos de seguridad se dieron por buenos, y POR QUÉ.
--   2. Las cifras de cada ejecución, que son lo que convierte un número suelto
--      en una tendencia.
--
-- Eso funcionaba mientras el informe solo existía en esa máquina. Desde que hay
-- un panel dentro de la aplicación y un bot (`docs/plataforma.md`), un archivo
-- local es memoria a la que dos de los tres consumidores no llegan: la función
-- edge no tiene disco al que asomarse, y sin lo aceptado la sección de seguridad
-- vuelve a ser la lista de 239 hallazgos que nadie mira.
--
-- ══ Por qué son DOS tablas y no una ════════════════════════════════════════
--
-- Porque guardan cosas de naturaleza distinta y con reglas opuestas:
--
--   · Una MEDIDA es un hecho que se repite. La de hoy sustituye a la de hoy.
--   · Una DECISIÓN es un acto de alguien. No se sustituye nunca: se añade, y si
--     se cambia de opinión se añade la contraria.
--
-- Mezclarlas obligaría a que la tabla admitiera las dos reglas, y la que se
-- llevaría la peor parte sería la decisión — que es la que hay que poder
-- defender dentro de seis meses.
--
-- ══ Lo que se pierde, dicho en voz alta ════════════════════════════════════
--
-- `informes/estado.json` se versiona A PROPÓSITO: `observabilidad.md` §1 dice
-- que «es una decisión, no un dato, y tiene que poder revisarse en un diff».
-- Con las aceptaciones aquí dentro, eso deja de poder hacerse.
--
-- Se acepta el cambio por dos motivos, y el segundo es el que decide:
--
--   1. El diff decía QUÉ cambió, nunca QUIÉN. Aquí va `quien`.
--   2. Una línea de un archivo se puede borrar y el archivo sigue pareciendo
--      entero. Aquí no: retirar una aceptación es una fila NUEVA que apunta a la
--      que retira, y las dos se quedan. Para algo cuyo único propósito es poder
--      explicar por qué se dio por bueno un hallazgo crítico, un registro que
--      solo crece vale más que un archivo que cualquiera puede editar sin dejar
--      constancia.
--
-- `estado.json` no se borra: el script lo lee una última vez para sembrar estas
-- tablas, y a partir de ahí manda la base.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla `profiles`.';
  END IF;
  IF to_regclass('public.platform_admins') IS NULL THEN
    RAISE EXCEPTION 'Falta `platform_admins` (migración 0034): sin ella no hay a quién atribuir una aceptación.';
  END IF;
END $$;

BEGIN;

-- ══ Las medidas ═════════════════════════════════════════════════════════════
--
-- `dia` es la clave primaria, y con eso queda dicha la regla que el script traía
-- escrita en JavaScript: **manda la última ejecución de cada día**. Al mirar esto
-- una vez por semana, probar el script tres veces seguidas dibujaría un
-- dientecito que no significa nada.
--
-- `claves` son las de NOVEDAD de esa ejecución (`claveNovedad` en
-- `src/domain/radiografia/estado.js`), que es contra lo que se compara la
-- siguiente para saber qué es nuevo. Sin ellas, cada informe sería el primero.
--
-- Sin tope de filas, a diferencia del archivo, que guardaba 26. Una fila son
-- unos cientos de bytes y una vez por semana: cien años de informes ocupan menos
-- que una foto de progreso. El tope existía porque era un archivo de
-- configuración y no podía crecer para siempre; aquí no hay ese problema, y
-- media década de tendencia es exactamente lo que no se puede reconstruir
-- después.
CREATE TABLE IF NOT EXISTS public.platform_snapshots (
  dia date PRIMARY KEY,
  generado timestamptz NOT NULL,
  metricas jsonb NOT NULL,
  claves text[] NOT NULL DEFAULT '{}'
);

ALTER TABLE public.platform_snapshots ENABLE ROW LEVEL SECURITY;
-- Sin políticas, igual que `platform_admins`: nadie la lee ni la escribe desde
-- el navegador. La función edge la consulta con `service_role`, que no pasa por
-- RLS, y el panel recibe el resultado ya masticado.

-- ══ Las decisiones ══════════════════════════════════════════════════════════
--
-- `clave` es la ESTRICTA (`claveDe`): incluye el texto del hallazgo, no solo el
-- objeto. Así, si `videos` pasa de una política SELECT a una ALL, el texto
-- cambia, la clave cambia y la aceptación deja de aplicar. Se acepta un hallazgo
-- concreto, nunca un objeto para siempre.
CREATE TABLE IF NOT EXISTS public.platform_acceptances (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave text NOT NULL,
  -- El motivo es obligatorio y lo impone un CHECK, no una convención. Dar por
  -- bueno un hallazgo de seguridad sin dejar dicho por qué es cómo empiezan los
  -- agujeros que luego nadie sabe explicar. Tres caracteres es el mismo mínimo
  -- que ya exigía `--aceptar-todo`: no evita un motivo malo, evita el vacío y
  -- el punto suelto.
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 3),
  nivel text,
  objeto text,
  -- Quién. Es lo que el diff de git nunca dijo. `SET NULL` y no `CASCADE`: si
  -- una cuenta se borra, la decisión no desaparece — queda sin autor, que es
  -- información distinta de que nunca hubiera existido.
  quien uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now(),
  -- Retirar una aceptación es AÑADIR una fila que apunta a la que retira. Las
  -- dos se quedan para siempre.
  retira bigint REFERENCES public.platform_acceptances (id),
  -- Una retirada no acepta nada, así que no puede traer nivel ni objeto nuevos,
  -- y tiene que apuntar a algo. Sin esto, una fila con `retira` y `nivel` a la
  -- vez sería ambigua y cada lector la interpretaría a su manera.
  CONSTRAINT retira_o_acepta CHECK (retira IS NULL OR (nivel IS NULL AND objeto IS NULL))
);

CREATE INDEX IF NOT EXISTS platform_acceptances_clave_idx
  ON public.platform_acceptances (clave, at);

ALTER TABLE public.platform_acceptances ENABLE ROW LEVEL SECURITY;
-- Sin políticas, por lo mismo que la de arriba.

-- ══ Y que «solo se añade» no sea una buena intención ════════════════════════
--
-- Se podría dejar dicho en un comentario y confiar. No se hace: el valor entero
-- de esta tabla es que su historia no se pueda reescribir, y una regla que solo
-- vive en la documentación se salta sin querer desde el editor SQL del panel un
-- martes por la tarde.
--
-- El disparador la impone pase lo que pase con los permisos. Un REVOKE se puede
-- volver a conceder sin darse cuenta —la 0069 documenta que en este proyecto eso
-- ha pasado tres veces—; esto no depende de ningún GRANT.
--
-- Para corregir de verdad un error hay que quitar el disparador a mano, y eso ya
-- es un acto deliberado que deja rastro en el registro del servidor.
CREATE OR REPLACE FUNCTION public.platform_acceptances_solo_anadir()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'platform_acceptances es de solo añadir. Para retirar una aceptación, inserta una fila nueva con `retira` apuntando a la que retiras.';
END $$;

DROP TRIGGER IF EXISTS platform_acceptances_inmutable ON public.platform_acceptances;
CREATE TRIGGER platform_acceptances_inmutable
  BEFORE UPDATE OR DELETE ON public.platform_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.platform_acceptances_solo_anadir();

-- La 0069 hace que las funciones nuevas nazcan sin EXECUTE para nadie, así que
-- no hay nada que revocar aquí. Se deja escrito de todos modos porque el patrón
-- es el que se lee para auditar, y una ausencia no se distingue de un olvido.
REVOKE ALL ON FUNCTION public.platform_acceptances_solo_anadir() FROM public;

COMMIT;

-- ============================================================================
-- Después de aplicarla
-- ----------------------------------------------------------------------------
-- `npm run radiografia` siembra las dos tablas desde `informes/estado.json` la
-- primera vez que corre, y a partir de ahí escribe aquí. El archivo se queda
-- donde está, sin tocar, por si hay que mirarlo.
--
-- Comprobar que el disparador hace lo que dice:
--
--   UPDATE public.platform_acceptances SET motivo = 'otra cosa' WHERE id = 1;
--   -- ERROR: platform_acceptances es de solo añadir.
-- ============================================================================
