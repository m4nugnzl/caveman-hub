import { useCallback, useEffect, useState } from 'react';

import { escucharConexion, hayRed } from '@/lib/conexion';
import { mapCajonFromDb } from '@/lib/mappers';
import { supabase } from '@/lib/supabaseClient';
import { CAJONES, construir } from '@/domain/cajon';
import { piecesOf } from '@/domain/pieces';
import { platosOf } from '@/domain/platos';
import { TIPO } from '@/lib/portapapeles';

/*
  ══ EL CAJÓN DEL ENTRENADOR ═════════════════════════════════════════════════

  Con la convención de `useCoachPrefs.js`: gancho que posee su estado y su
  carga, y que se vuelve a intentar cuando aparece la red.

  Lo que hay dentro y por qué está en una tabla y no en `preferences`, en
  `domain/cajon.js` y en la migración 0112. Aquí solo se lee, se guarda, se
  renombra y se tira.
*/

/*
  ── El puente hacia atrás, y por qué se lee y no se escribe ─────────────────

  Sin la 0112 aplicada, la tabla no existe y PostgREST contesta 42P01. Eso NO
  puede pintarse como «no has guardado nada»: los días y los platos que el
  entrenador tenía siguen estando en sus preferencias, y decirle que no hay nada
  es la clase de dato falso que este proyecto se ha comido varias veces con los
  403 de RLS.

  Así que sin tabla el cajón se lee de las preferencias y se ve entero. Lo que
  no se hace es escribir ahí: guardar sin la migración avisa de que falta, en
  vez de escribir en un sitio del que ya se está saliendo.
*/
const desdeLasPreferencias = (coachPrefs) => [
  ...piecesOf(coachPrefs).map(({ id, name, savedAt, exercises }) => ({
    id,
    kind: TIPO.HOJA,
    name,
    savedAt,
    carga: { exercises },
    deLasPreferencias: true,
  })),
  ...platosOf(coachPrefs).map(({ id, name, savedAt, foods }) => ({
    id,
    kind: TIPO.PLATO,
    name,
    savedAt,
    carga: { foods },
    deLasPreferencias: true,
  })),
];

/** El código de «esa relación no existe»: falta la 0112. */
const SIN_TABLA = '42P01';

export const useCajon = ({ session, team, coachPrefs, isCoach }) => {
  const [cajon, setCajon] = useState([]);
  /* Si la tabla está o no. Mientras no se sepa no se deja guardar: escribir a
     ciegas es lo que deja media biblioteca en cada sitio. */
  const [hayTabla, setHayTabla] = useState(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || !isCoach) {
      setCajon([]);
      setHayTabla(null);
      return undefined;
    }

    let cancelado = false;

    const leer = async () => {
      const { data, error } = await supabase
        .from('coach_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (cancelado) return;

      if (error) {
        /* Falta la migración: se enseña lo de las preferencias, que sigue ahí.
           Cualquier otro error —red, permiso— no es «no hay tabla», y entonces
           tampoco se puede afirmar que no la haya. */
        if (error.code === SIN_TABLA) setHayTabla(false);
        else console.error('coach_templates:', error.message);
        setCajon(desdeLasPreferencias(coachPrefs));
        return;
      }

      setHayTabla(true);
      setCajon((data || []).map(mapCajonFromDb));
    };

    leer();

    const baja = escucharConexion(() => {
      if (!cancelado && hayRed()) leer();
    });

    return () => {
      cancelado = true;
      baja();
    };
    /* `coachPrefs` NO va en las dependencias: solo se usa para el puente de
       cuando falta la tabla, y meterlo aquí recargaría el cajón cada vez que se
       guarda cualquier preferencia. Lo que se lea de más al arrancar sin la
       0112 lo arregla la propia migración. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isCoach]);

  /**
   * Guarda una pieza en el cajón, con su nombre ya desempatado por quien llama
   * —que es quien sabe qué hay en el tramo— y su carga ya limpia por
   * `construir`.
   *
   * @returns `{ ok, error }`. El aviso lo da la pantalla: aquí no hay `toast`.
   */
  const guardarEnCajon = useCallback(
    async ({ kind, name, carga }) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };
      if (hayTabla === false) {
        return { ok: false, error: 'Falta aplicar la migración 0112: el cajón todavía no existe.' };
      }

      const pieza = construir({ kind, name, carga });
      if (!pieza) return { ok: false, error: 'No hay nada que guardar.' };

      const { data, error } = await supabase
        .from('coach_templates')
        .insert({
          coach_id: userId,
          /* Solo si hay equipo: la columna acepta `NULL` y la política de la
             0112 contempla las dos, así que un entrenador sin equipo guarda lo
             suyo sin nacer huérfano —que es lo que le pasa a `exercises`—. */
          ...(team?.id ? { team_id: team.id } : {}),
          kind: pieza.kind,
          name: pieza.name,
          carga: pieza.carga,
        })
        .select()
        .single();

      if (error) return { ok: false, error: error.message };

      setCajon((antes) => [mapCajonFromDb(data), ...antes]);
      return { ok: true };
    },
    [session, team, hayTabla]
  );

  const renombrarEnCajon = useCallback(async (id, name) => {
    const nombre = String(name || '').trim();
    if (!nombre) return { ok: false, error: 'Una plantilla sin nombre no se encuentra.' };

    setCajon((antes) => antes.map((x) => (x.id === id ? { ...x, name: nombre } : x)));

    const { error } = await supabase.from('coach_templates').update({ name: nombre }).eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  const borrarDelCajon = useCallback(async (id) => {
    const antes = cajon;
    setCajon(antes.filter((x) => x.id !== id));

    const { error } = await supabase.from('coach_templates').delete().eq('id', id);
    /* Se repone lo que se quitó: media pantalla diciendo que se tiró y una fila
       que reaparece al recargar es peor que no haberla quitado. */
    if (error) {
      setCajon(antes);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }, [cajon]);

  /** Cuántas caben todavía de esta forma. Lo mira quien ofrece «Guardar». */
  const cabeEnCajon = useCallback(
    (kind) => {
      const tope = CAJONES[kind]?.tope;
      if (!tope) return false;
      return cajon.filter((x) => x.kind === kind).length < tope;
    },
    [cajon]
  );

  return { cajon, hayTabla, guardarEnCajon, renombrarEnCajon, borrarDelCajon, cabeEnCajon };
};
