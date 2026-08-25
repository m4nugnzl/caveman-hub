import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { mapLibraryExerciseFromDb, mapLibraryFoodFromDb } from '@/lib/mappers';
import { toNum } from '@/lib/num';

/*
  ══ Las bibliotecas del coach (ejercicios y alimentos), fuera de AppContext ══

  Con la convención de `useRoadmap.js` y la variante de `useCheckIns.js`: el
  arranque siembra las dos listas con los setters que este gancho devuelve.

  `editFood` NO está aquí: escribe a la vez en la dieta abierta y en la
  biblioteca, así que es el puente entre dos dominios y vive en el proveedor.
*/

export const useLibraries = ({ session, team }) => {
  const [exerciseLibrary, setExerciseLibrary] = useState([]);
  const [foodLibrary, setFoodLibrary] = useState([]);

  /**
   * `exercises` y `foods` NO tienen constraint UNIQUE (coach_id, name), así que
   * un `upsert` con `onConflict: 'coach_id,name'` falla con «no unique or
   * exclusion constraint matching the ON CONFLICT specification».
   *
   * Mientras no exista esa constraint hay que buscar primero y decidir después.
   * Cuesta una petición extra; la alternativa es la migración que hay preparada
   * en `supabase/migrations/`, que permitiría volver a un único upsert.
   */
  /**
   * Alta o actualización de una entrada de biblioteca, buscándola por su nombre.
   *
   * ── El `team_id` no es opcional, aunque la columna lo permita ────────────────
   * Se escribía solo `coach_id`, que era correcto antes de los equipos y dejó de
   * serlo con la 0006: desde entonces las bibliotecas son del EQUIPO y sus
   * políticas preguntan por `team_id`. Una fila nueva sin él nace huérfana —fuera
   * de la biblioteca compartida— y, con las políticas de la 0027, ni se puede
   * escribir ni se puede leer por la vía del equipo.
   *
   * ── Y por eso también se busca por equipo ───────────────────────────────────
   * Buscar por `coach_id` en un equipo significa que si el dueño ya tiene «Pollo»
   * y lo añade un entrenador suyo, salen dos «Pollo» con macros propios. Es
   * exactamente la divergencia de bibliotecas que `modelo-de-equipo.md` daba como
   * motivo para compartirlas.
   *
   * ══ Se busca en la de todos y se ESCRIBE solo en lo tuyo ═══════════════════
   *
   * Es el otro lado de lo anterior, y sin él la búsqueda por equipo tiene un
   * agujero que se abre solo: dar de alta «Pollo» cuando un compañero ya lo tenía
   * NO creaba un segundo «Pollo» —bien—, pero le REESCRIBÍA los macros a los
   * suyos sin decir nada, y con ellos todas las dietas que montara a partir de
   * entonces. No hacía falta ni querer editar nada: pasaba al añadir.
   *
   * La regla es la de `canEditLibraryItem`: se corrige lo que has dado de alta
   * tú. Aquí, que es por donde pasan TODAS las escrituras de biblioteca —los
   * alimentos y los ejercicios, el alta, la corrección y el «recordar» de la
   * rutina—, se hace cumplir una sola vez.
   *
   * La base no la va a hacer cumplir por nosotros: las políticas de la 0006 y la
   * 0027 dejan a cualquier miembro escribir cualquier fila del equipo, y está
   * bien que sea así —es una biblioteca compartida, no cuatro—. Esto es una
   * decisión de producto y por eso vive en el producto.
   *
   * Cuando la fila es de otro se devuelve TAL CUAL está, sin tocarla: quien llama
   * refresca su copia local con la verdad de la base en vez de quedarse creyendo
   * que escribió. Lo que estuviera montando en una dieta no se pierde —la entrada
   * de una dieta es una copia congelada y es suya—, simplemente no se propaga a
   * la biblioteca de nadie.
   */
  const upsertByName = useCallback(async (table, coachId, teamId, name, fields) => {
    const trimmed = name.trim();

    /* `*` y no `id`: hace falta el `coach_id` para saber de quién es, y la fila
       entera para poder devolverla sin una segunda petición cuando no es tuya. */
    let find = supabase.from(table).select('*').eq('name', trimmed);
    find = teamId ? find.eq('team_id', teamId) : find.eq('coach_id', coachId);

    const { data: existing, error: findErr } = await find.maybeSingle();
    if (findErr) return { error: findErr };

    if (existing) {
      if (existing.coach_id !== coachId) return { data: existing, error: null };
      return supabase.from(table).update(fields).eq('id', existing.id).select().single();
    }

    return supabase
      .from(table)
      // `coach_id` se sigue escribiendo porque es NOT NULL y su retirada va en
      // otra migración (ver 0006). Y ahora además es lo que decide quién puede
      // corregir esta entrada después, así que menos prescindible que nunca.
      // `team_id`, solo si hay equipo: sin la 0006 esa columna no existe y
      // PostgREST rechazaría la fila entera.
      .insert({ coach_id: coachId, ...(teamId ? { team_id: teamId } : {}), name: trimmed, ...fields })
      .select()
      .single();
  }, []);

  const upsertLibraryExercise = useCallback(
    async (name, muscle) => {
      const userId = session?.user?.id;
      if (!userId || !name?.trim()) return null;

      const { data, error } = await upsertByName('exercises', userId, team?.id || null, name, {
        muscle_group: muscle,
      });

      if (error) {
        console.error('upsertLibraryExercise:', error.message);
        return null;
      }

      const mapped = mapLibraryExerciseFromDb(data);
      setExerciseLibrary((prev) => {
        const exists = prev.some((e) => e.id === mapped.id);
        return exists
          ? prev.map((e) => (e.id === mapped.id ? mapped : e))
          : [...prev, mapped].sort((a, b) => a.name.localeCompare(b.name));
      });
      return mapped;
    },
    [session, team, upsertByName]
  );

  const upsertLibraryFood = useCallback(
    async (food) => {
      const userId = session?.user?.id;
      if (!userId || !food?.name?.trim()) return null;

      /*
        Las dos columnas de unidad viajan juntas o no viajan (CHECK de la 0030).
        Una etiqueta en blanco se manda como NULL en las DOS para poder quitarle la
        unidad a un alimento: mandar solo `unit_label: null` dejaría los gramos
        huérfanos y la fila la rechazaría la base.
      */
      const etiqueta = String(food.unitLabel || '').trim();
      const gramosPorUnidad = toNum(food.unitGrams);
      const unidad =
        etiqueta && gramosPorUnidad && gramosPorUnidad > 0
          ? { unit_label: etiqueta, unit_grams: gramosPorUnidad }
          : { unit_label: null, unit_grams: null };

      const { data, error } = await upsertByName('foods', userId, team?.id || null, food.name, {
        protein_per_100g: toNum(food.proteinPer100) ?? 0,
        carbs_per_100g: toNum(food.carbsPer100) ?? 0,
        fats_per_100g: toNum(food.fatsPer100) ?? 0,
        ...unidad,
      });

      if (error) {
        console.error('upsertLibraryFood:', error.message);
        return null;
      }

      const mapped = mapLibraryFoodFromDb(data);
      setFoodLibrary((prev) => {
        const exists = prev.some((f) => f.id === mapped.id);
        return exists
          ? prev.map((f) => (f.id === mapped.id ? mapped : f))
          : [...prev, mapped].sort((a, b) => a.name.localeCompare(b.name));
      });
      return mapped;
    },
    [session, team, upsertByName]
  );

  return {
    exerciseLibrary,
    setExerciseLibrary,
    foodLibrary,
    setFoodLibrary,
    upsertLibraryExercise,
    upsertLibraryFood,
  };
};
