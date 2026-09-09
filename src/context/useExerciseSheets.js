import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { norm } from '@/lib/texto';

/*
  ══ LA FICHA DEL EJERCICIO, DEL LADO DE QUIEN ENTRENA ════════════════════════

  Con la convención de `useRoadmap.js`: un gancho por dominio, que posee su
  estado y recibe del proveedor solo lo que necesita.

  ── Por qué esto existe y no se lee de `exerciseLibrary` ──────────────────
  Porque `exerciseLibrary` es la biblioteca del EQUIPO y sus políticas son de
  equipo (0027): un cliente no puede leerla. Su vídeo y sus pautas llegan por la
  función `exercise_sheets()` (0100), que devuelve solo la ficha de los
  ejercicios que aparecen en SU plan.

  ── Y por qué también se pide siendo entrenador ───────────────────────────
  Por «Ver como». El entrenador que se asoma al portal de su cliente tiene la
  biblioteca entera cargada, sí, pero esta pantalla no la mira: mira lo que
  vería el cliente. Si el gancho no pidiera nada con sesión de entrenador, «Ver
  como» enseñaría la rutina sin una sola ficha y parecería que no se guardó
  nada. Se pide con el id explícito, que es para lo que la función lo acepta.
*/

/** La ficha vacía: lo que devuelve `sheetOf` cuando no hay nada que abrir. */
const NADA = null;

export const useExerciseSheets = ({ session, clientId }) => {
  const [sheets, setSheets] = useState([]);

  const userId = session?.user?.id || null;

  useEffect(() => {
    if (!userId) {
      setSheets([]);
      return undefined;
    }

    let cancelado = false;

    (async () => {
      /*
        `target` nulo significa «el cliente que soy», que es el caso del portal:
        la función lo resuelve por `auth.uid()`. Con id, es un entrenador
        mirando.

        Y se manda SIEMPRE, explícitamente nulo, en vez de no mandar nada:
        PostgREST resuelve las funciones por el nombre de sus parámetros, y con
        `{}` busca una versión SIN parámetros —que no existe, porque la nuestra
        tiene uno con valor por defecto—. Mandarlo en nulo apunta a la firma que
        hay y deja que el `IF target IS NULL` de dentro haga su trabajo.
      */
      const { data, error } = await supabase.rpc('exercise_sheets', {
        target: clientId ?? null,
      });

      if (cancelado) return;

      /*
        Sin la 0100 la función no existe, y eso NO es un fallo que deba llegar a
        la pantalla: es la misma decisión que toma el catálogo en el proveedor
        —«el catálogo es una ayuda, no un requisito»—. Sin fichas, el renglón del
        ejercicio es exactamente el de siempre.

        Cualquier otro error se traga igual pero se deja en consola: una lista de
        vídeos que no carga no puede tumbar la pantalla con la que alguien está
        registrando su sesión en el gimnasio.
      */
      if (error) {
        if (!/does not exist|schema cache/i.test(error.message || '')) {
          console.error('exercise_sheets:', error.message);
        }
        setSheets([]);
        return;
      }

      setSheets(
        (data || [])
          .map((row) => ({
            name: row.exercise,
            videoUrl: row.video_url ?? null,
            cue: row.cue ?? null,
          }))
          .filter((f) => f.name && (f.videoUrl || f.cue))
      );
    })();

    return () => {
      cancelado = true;
    };
  }, [userId, clientId]);

  /*
    Por nombre normalizado, que es como el producto entero ata un ejercicio de un
    plan con su fila de biblioteca: `norm` quita tildes y mayúsculas, igual que
    `mergeCatalog` y `findByName`. Comparar en crudo dejaría «Press Banca» sin
    ficha porque la hoja lo escribió con mayúscula.
  */
  const porNombre = useMemo(() => {
    const mapa = new Map();
    for (const ficha of sheets) {
      const clave = norm(String(ficha.name || '').trim());
      if (clave && !mapa.has(clave)) mapa.set(clave, ficha);
    }
    return mapa;
  }, [sheets]);

  /**
   * La ficha de un ejercicio, o `null`.
   *
   * Devuelve `null` —y no un objeto vacío— a propósito: es lo que la lista
   * pregunta para decidir si pinta marca, y un objeto siempre presente
   * obligaría a mirar dentro en cada renglón.
   */
  const sheetOf = useCallback(
    (name) => {
      const clave = norm(String(name || '').trim());
      if (!clave) return NADA;
      return porNombre.get(clave) || NADA;
    },
    [porNombre]
  );

  return { exerciseSheets: sheets, sheetOf };
};
