import { useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { gruposOf } from '@/domain/gruposEquiv';

/*
  ══ LOS GRUPOS DE EQUIVALENCIA, DEL LADO DE QUIEN COME ═══════════════════════

  Con la convención de `useRoadmap.js`: un gancho por dominio, que posee su
  estado y recibe del proveedor solo lo que necesita.

  ── Por qué esto existe y no se lee de `coachPrefs` ────────────────────────
  Porque `coachPrefs` son las preferencias del ENTRENADOR y sus políticas son
  «el perfil propio» (0002) y «el equipo» (0006): un cliente no puede leerlas.
  Sus grupos llegan por la función `equiv_groups()` (0113), gemela exacta de
  `exercise_sheets()` (0100) — mismo problema, misma forma.

  ── Y por qué también se pide siendo entrenador ───────────────────────────
  Por «Ver como», igual que las fichas de ejercicio: el entrenador que se asoma
  al portal de su cliente tiene sus grupos cargados en `coachPrefs`, pero esa
  pantalla no los mira — mira lo que vería el cliente. Sin esto, «Ver como»
  enseñaría las listas largas y parecería que los grupos no se guardaron.

  ── Dos caminos para la misma cosa, y no es «dos de todo» ─────────────────
  El entrenador montando lee sus grupos de `coachPrefs`, que es donde los
  escribe y donde el cambio se ve en el mismo render. Esto es lo que le LLEGA a
  una persona concreta, de solo lectura y por la puerta que su sesión tiene.
  Son las dos mitades que ya distinguen `exerciseLibrary` y `sheetOf`.
*/

export const useEquivGroups = ({ session, clientId }) => {
  const [filas, setFilas] = useState([]);

  const userId = session?.user?.id || null;

  useEffect(() => {
    if (!userId) {
      setFilas([]);
      return undefined;
    }

    let cancelado = false;

    (async () => {
      /*
        `target` nulo significa «el cliente que soy», que es el caso del portal;
        con id, es un entrenador mirando. Y se manda SIEMPRE, explícitamente
        nulo: PostgREST resuelve las funciones por el nombre de sus parámetros y
        con `{}` buscaría una versión sin parámetros, que no existe.
      */
      const { data, error } = await supabase.rpc('equiv_groups', { target: clientId ?? null });

      if (cancelado) return;

      /*
        Sin la 0113 la función no existe, y eso NO es un fallo que deba llegar a
        la pantalla: sin grupos, las equivalencias son las calculadas, que es
        exactamente lo que había antes de que existieran. Cualquier otro error
        se traga igual pero se deja en consola — una lista de equivalencias que
        no carga no puede tumbar la pantalla donde alguien está mirando qué come
        hoy.
      */
      if (error) {
        if (!/does not exist|schema cache/i.test(error.message || '')) {
          console.error('equiv_groups:', error.message);
        }
        setFilas([]);
        return;
      }

      setFilas(data || []);
    })();

    return () => {
      cancelado = true;
    };
  }, [userId, clientId]);

  /*
    Por el mismo saneador que usa el entrenador, y no por uno propio: «qué es un
    grupo válido» —nombre, macro de los tres, dos alimentos por lo menos— se
    decide en `domain/gruposEquiv` y en ningún otro sitio. Dos criterios serían
    la lista del entrenador y la del cliente discrepando en los casos raros, que
    es justo donde nadie mira.
  */
  const gruposEquiv = useMemo(() => gruposOf({ gruposEquiv: { items: filas } }), [filas]);

  return { gruposEquiv };
};
