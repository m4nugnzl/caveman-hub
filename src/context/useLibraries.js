import { useCallback, useState } from 'react';

import { findByName } from '@/domain/catalog';
import { supabase } from '@/lib/supabaseClient';
import { foodMicrosToDb, mapLibraryExerciseFromDb, mapLibraryFoodFromDb } from '@/lib/mappers';
import { toNum } from '@/lib/num';

/*
  ══ Las bibliotecas del coach (ejercicios y alimentos), fuera de AppContext ══

  Con la convención de `useRoadmap.js` y la variante de `useCheckIns.js`: el
  arranque siembra las dos listas con los setters que este gancho devuelve.

  `editFood` NO está aquí: escribe a la vez en la dieta abierta y en la
  biblioteca, así que es el puente entre dos dominios y vive en la puerta del
  editor de dieta (`useEditorDeDieta`).
*/

/*
  `catalogFoods` y `catalogExercises` entran aquí para una sola cosa: saber qué
  nombres son GENERALES. Son de referencia y no se reescriben —ni desde la
  pantalla, que ya no ofrece el lápiz, ni desde una importación, que llama a
  estas funciones una vez por alimento del PDF—.
*/
/**
 * Un alimento traducido a columnas. Vive fuera del gancho porque lo usan las DOS
 * puertas de escritura —el alta/corrección por nombre (`upsertLibraryFood`) y la
 * corrección por id (`editLibraryFood`, la única por la que el nombre cambia)—,
 * y dos traducciones del mismo objeto acabarían divergiendo en la columna que se
 * añada mañana.
 *
 * ── Las dos columnas de unidad viajan juntas o no viajan ──────────────────
 * Lo garantiza un CHECK (0030). Una etiqueta en blanco se manda como NULL en las
 * DOS para poder quitarle la unidad a un alimento: mandar sólo `unit_label: null`
 * dejaría los gramos huérfanos y la fila la rechazaría la base.
 *
 * ── Los HECHOS, sólo si vienen ────────────────────────────────────────────
 * Etiquetas, las cuatro del envase, la nota y la categoría se escriben **sólo
 * cuando quien llama los trae**, y por un motivo que ya costó un fallo: el lápiz
 * de una dieta manda macros y unidad y nada más, y si aquí se escribieran «por
 * defecto», corregir los gramos de un pan desde una dieta le borraría el gluten
 * y la nota.
 */
const columnasDeAlimento = (fuente) => {
  const etiqueta = String(fuente.unitLabel || '').trim();
  const gramosPorUnidad = toNum(fuente.unitGrams);

  const out = {
    protein_per_100g: toNum(fuente.proteinPer100) ?? 0,
    carbs_per_100g: toNum(fuente.carbsPer100) ?? 0,
    fats_per_100g: toNum(fuente.fatsPer100) ?? 0,
    ...foodMicrosToDb(fuente),
    ...(etiqueta && gramosPorUnidad && gramosPorUnidad > 0
      ? { unit_label: etiqueta, unit_grams: gramosPorUnidad }
      : { unit_label: null, unit_grams: null }),
  };

  /* `tags` se sanea a nombres con algo dentro: la columna es `NOT NULL DEFAULT
     '{}'` y un `null` la haría fallar. */
  if (Array.isArray(fuente.tags)) {
    out.tags = fuente.tags.map((t) => String(t || '').trim()).filter(Boolean);
  }
  if ('note' in fuente) out.note = String(fuente.note || '').trim() || null;
  if ('category' in fuente) out.category = String(fuente.category || '').trim() || null;

  return out;
};

export const useLibraries = ({ session, team, catalogFoods = [], catalogExercises = [] }) => {
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
  /**
   * @param alCrear  Columnas que se escriben **sólo si la fila nace aquí**, y
   *   nunca al corregir una que ya está. Existe porque adivinarlo desde fuera
   *   costó un fallo de verdad: `saveExerciseSheet` miraba la `exerciseLibrary`
   *   del render para decidir si mandaba el grupo muscular, y esa lista está
   *   VIEJA cuando en el mismo gesto se acaba de crear o de renombrar la fila
   *   —el alta de un ejercicio y el cambio de nombre pasan las dos veces por
   *   aquí seguidas—. Resultado: mandaba `muscle_group: null` sobre una fila que
   *   existía, y Postgres devolvía «null value in column "muscle_group" […]
   *   violates not-null constraint». La fila quedaba bien y salía un aviso rojo.
   *
   *   Quien sabe de verdad si la fila existe es esta función, que la acaba de
   *   buscar en la BASE. Así que la decisión se toma aquí y no en quien llama.
   */
  const upsertByName = useCallback(async (table, coachId, teamId, name, fields, esGeneral = false, alCrear = {}) => {
    const trimmed = name.trim();

    /* `*` y no `id`: hace falta el `coach_id` para saber de quién es, y la fila
       entera para poder devolverla sin una segunda petición cuando no es tuya. */
    let find = supabase.from(table).select('*').eq('name', trimmed);
    find = teamId ? find.eq('team_id', teamId) : find.eq('coach_id', coachId);

    const { data: existing, error: findErr } = await find.maybeSingle();
    if (findErr) return { error: findErr };

    if (existing) {
      /* Ni la de otro ni la de un general: las dos se devuelven tal cual, y quien
         llama refresca su copia local con la verdad de la base. */
      if (esGeneral || existing.coach_id !== coachId) return { data: existing, error: null };
      return supabase.from(table).update(fields).eq('id', existing.id).select().single();
    }

    return supabase
      .from(table)
      // `coach_id` se sigue escribiendo porque es NOT NULL y su retirada va en
      // otra migración (ver 0006). Y ahora además es lo que decide quién puede
      // corregir esta entrada después, así que menos prescindible que nunca.
      // `team_id`, solo si hay equipo: sin la 0006 esa columna no existe y
      // PostgREST rechazaría la fila entera.
      .insert({
        coach_id: coachId,
        ...(teamId ? { team_id: teamId } : {}),
        name: trimmed,
        ...alCrear,
        ...fields,
      })
      .select()
      .single();
  }, []);

  const upsertLibraryExercise = useCallback(
    async (name, muscle) => {
      const userId = session?.user?.id;
      if (!userId || !name?.trim()) return null;

      /* De un ejercicio del catálogo, el grupo muscular lo pone el CATÁLOGO y no
         quien lo escribe: si «Press banca» es de pecho, lo es en las cuatro
         bibliotecas. Ver `canEditLibraryItem`. */
      const general = findByName(catalogExercises, name);

      const { data, error } = await upsertByName(
        'exercises',
        userId,
        team?.id || null,
        name,
        { muscle_group: general ? general.muscle : muscle },
        Boolean(general)
      );

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
    [session, team, catalogExercises, upsertByName]
  );

  /**
   * La ficha del ejercicio: TU vídeo, TU clave y TUS alternativas (0098).
   *
   * ══ Por qué no pasa por `esGeneral` ════════════════════════════════════════
   *
   * `upsertLibraryExercise` protege los generales: de un ejercicio del catálogo,
   * el grupo muscular lo pone el catálogo y nadie lo reescribe. Esto es lo
   * contrario y a propósito: **el press banca del catálogo tiene que poder
   * llevar tu vídeo**. Lo que se escribe no es el dato de referencia —ese sigue
   * intocable en `catalog_exercises`— sino una fila TUYA con el mismo nombre,
   * que es exactamente lo que la biblioteca es desde la 0033.
   *
   * Lo que sí se respeta es la otra mitad de la regla: si la fila la dio de alta
   * un compañero de equipo, `upsertByName` la devuelve tal cual sin tocarla y
   * quien llama se entera comparando el `coachId` de lo que vuelve. Un
   * entrenador no le reescribe la clave técnica a otro sin que se entere.
   */
  const saveExerciseSheet = useCallback(
    async (name, { videoUrl = null, cue = null, muscle = null } = {}) => {
      const userId = session?.user?.id;
      if (!userId || !name?.trim()) return null;

      /* Un ejercicio que todavía no está en la biblioteca nace aquí, y necesita
         grupo muscular porque la columna es NOT NULL: el del catálogo si lo
         conoce, y si no el que tenga puesto la ficha que llama.

         Va por `alCrear` y no entre los campos normales, que es lo que arregla
         el fallo: antes se decidía aquí mirando la `exerciseLibrary` del render
         —vieja en cuanto el mismo gesto acababa de crear o renombrar la fila—,
         y acababa mandando `muscle_group: null` sobre una fila que existía. El
         porqué largo, en `upsertByName`. */
      const general = findByName(catalogExercises, name);

      const { data, error } = await upsertByName(
        'exercises',
        userId,
        team?.id || null,
        name,
        {
          video_url: String(videoUrl || '').trim() || null,
          cue: String(cue || '').trim() || null,
          /* `alternatives` ya NO se escribe ni se lee. Primero salió de la ficha
             («material y con qué se cambia en ejercicios no me gusta tenerlo») y
             el 9 sep 2026 cayó también la idea entera, plan incluido: «no me
             gusta la idea de dar alternativas». La columna se queda con lo que
             tuviera —borrarla es una migración destructiva y no se hace de
             paso— y el modelo ya no la mapea (`mapLibraryExerciseFromDb`). */
        },
        false,
        { muscle_group: general?.muscle || muscle || null }
      );

      if (error) {
        console.error('saveExerciseSheet:', error.message);
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
    [session, team, catalogExercises, upsertByName]
  );

  const upsertLibraryFood = useCallback(
    async (food) => {
      const userId = session?.user?.id;
      if (!userId || !food?.name?.trim()) return null;

      /*
        ── De un GENERAL se copia el catálogo, no lo que traiga quien llama ──
        Un alimento del catálogo es de referencia y tiene que valer lo mismo en
        todas las bibliotecas. Si existe ya, no se toca (`esGeneral` abajo); y si
        no existe —la primera vez que se usa, que es cuando se copia—, lo que se
        guarda son los macros del CATÁLOGO.

        Sin esto, importar una dieta de un PDF con «Pechuga de pollo» metía los
        macros del PDF en tu biblioteca como si fueran los buenos, y encima
        quedaban bloqueados por ser un nombre general.
      */
      const general = findByName(catalogFoods, food.name);
      const fuente = general || food;

      /* La traducción a columnas vive en `columnasDeAlimento`, arriba: la
         comparten esta puerta y la de por id, y ahí está escrito por qué los
         hechos sólo se escriben cuando quien llama los trae. */
      const columnas = columnasDeAlimento(fuente);
      /* De un GENERAL, la categoría la sigue diciendo el catálogo y no se copia:
         la pantalla ya la lee de allí por nombre, y escribirla en tu fila sería
         repartir copias del mismo hecho —lo que evitaron la 0033 y la 0094—.
         `foods.category` (0103) es para lo que el catálogo no sabe: tus marcas. */
      if (general) delete columnas.category;

      const { data, error } = await upsertByName(
        'foods',
        userId,
        team?.id || null,
        food.name,
        columnas,
        Boolean(general)
      );

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
    [session, team, catalogFoods, upsertByName]
  );

  /**
   * TU NOTA en un alimento (0100). La hermana de `saveExerciseSheet`, y por el
   * mismo motivo exacto.
   *
   * ══ Por qué esta tampoco pasa por `esGeneral` ══════════════════════════════
   *
   * `upsertLibraryFood` protege los generales: de un alimento del catálogo, los
   * macros los pone el catálogo y nadie los reescribe —la pechuga de pollo tiene
   * los mismos en todas las bibliotecas del mundo—. Eso se mantiene entero.
   *
   * Pero **el arroz del catálogo tiene que poder llevar tu nota**. «El de grano
   * largo, no el vaporizado» no es un hecho del arroz: es un hecho TUYO, y el
   * catálogo no puede tenerlo porque no es de nadie. Lo que se escribe no es el
   * dato de referencia —ese sigue intocable en `catalog_foods`— sino una fila
   * tuya con el mismo nombre, que es lo que la biblioteca es desde la 0033.
   *
   * Lo que sí se respeta es la otra mitad de la regla: si la fila la dio de alta
   * un compañero de equipo, `upsertByName` la devuelve tal cual sin tocarla.
   */
  const saveFoodSheet = useCallback(
    async (name, { note = null } = {}) => {
      const userId = session?.user?.id;
      if (!userId || !name?.trim()) return null;

      /* Un alimento que todavía no está en la biblioteca nace aquí, y necesita
         macros: los del catálogo si los conoce, y si no ceros. `upsertByName`
         solo escribe los campos que se le pasan, así que en una actualización
         esto ni se manda. */
      const general = findByName(catalogFoods, name);
      const yaEsta = findByName(foodLibrary, name);

      const { data, error } = await upsertByName('foods', userId, team?.id || null, name, {
        ...(yaEsta
          ? {}
          : {
              protein_per_100g: toNum(general?.proteinPer100) ?? 0,
              carbs_per_100g: toNum(general?.carbsPer100) ?? 0,
              fats_per_100g: toNum(general?.fatsPer100) ?? 0,
            }),
        note: String(note || '').trim() || null,
      });

      if (error) {
        console.error('saveFoodSheet:', error.message);
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
    [session, team, catalogFoods, foodLibrary, upsertByName]
  );

  /**
   * ══ CORREGIR UNA FILA TUYA, POR ID ═════════════════════════════════════════
   *
   * La puerta que faltaba, y la única por la que **el NOMBRE puede cambiar**.
   *
   * ── Por qué no valía la de siempre ────────────────────────────────────────
   * `upsertByName` identifica por nombre: renombrar por ahí no corrige nada,
   * busca el nombre NUEVO, no lo encuentra y **crea una segunda fila**, dejando
   * la vieja donde estaba. O sea que la única manera de arreglar una errata era
   * fabricar el duplicado que la Librería existe para limpiar.
   *
   * Aquí se escribe contra el `id`, que es lo que no cambia, y por eso esta
   * puerta puede tocar el nombre, el músculo y la categoría — las tres cosas que
   * el dueño no podía corregir: «no se pueden editar ni ejercicios ni alimentos
   * aunque sean tuyos».
   *
   * ── Y sólo lo TUYO, con el filtro en la consulta ──────────────────────────
   * `.eq('coach_id', userId)`, igual que `borrarDeLaBiblioteca` y por lo mismo:
   * desde la 0006 la biblioteca es del EQUIPO y sus políticas dejan a cualquier
   * miembro escribir cualquier fila, así que la regla de «no se le reescribe la
   * voz a un compañero sin que se entere» la tiene que poner el producto. Con el
   * filtro, corregir la de otro no falla: no encuentra nada, que es lo correcto.
   *
   * ── Lo que esto NO arrastra ───────────────────────────────────────────────
   * Renombrar un ejercicio **no reescribe las hojas ya montadas**: el plan guarda
   * el nombre y la ficha se busca por él (0094), así que las semanas escritas
   * siguen con el nombre viejo y se quedan sin tu vídeo. No es un descuido, es el
   * modelo; quien ofrezca el verbo tiene que decirlo antes. En un alimento no
   * pasa nada: una entrada de dieta es una copia congelada y sigue siendo cierta.
   *
   * @returns la fila ya mapeada, o `null` si no era tuya o falló la escritura.
   */
  const corregirEnLaBiblioteca = useCallback(
    async (tabla, id, columnas, poner, mapear) => {
      const userId = session?.user?.id;
      if (!userId || !id) return null;

      const { data, error } = await supabase
        .from(tabla)
        .update(columnas)
        .eq('id', id)
        .eq('coach_id', userId)
        .select()
        .maybeSingle();

      if (error) {
        console.error(`corregir en ${tabla}:`, error.message);
        return null;
      }
      /* Cero filas no es un error de red: es «esa fila no es tuya». Quien llama
         necesita distinguirlo para no decir «guardado» sobre algo que no cambió. */
      if (!data) return null;

      const mapped = mapear(data);
      poner((prev) =>
        prev
          .map((item) => (item.id === mapped.id ? mapped : item))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      return mapped;
    },
    [session]
  );

  /** El nombre y el músculo de un ejercicio que diste de alta tú. */
  const editLibraryExercise = useCallback(
    (id, { name, muscle }) =>
      corregirEnLaBiblioteca(
        'exercises',
        id,
        { name: String(name || '').trim(), muscle_group: muscle || null },
        setExerciseLibrary,
        mapLibraryExerciseFromDb
      ),
    [corregirEnLaBiblioteca]
  );

  /**
   * El nombre y todo lo demás de un alimento que diste de alta tú.
   *
   * Los macros, la unidad, las etiquetas, las cuatro del envase, la categoría y
   * tu nota pasan por el MISMO traductor que el alta (`columnasDeAlimento`), así
   * que una columna nueva se añade en un sitio y no en dos.
   */
  const editLibraryFood = useCallback(
    (id, food) =>
      corregirEnLaBiblioteca(
        'foods',
        id,
        { name: String(food?.name || '').trim(), ...columnasDeAlimento(food || {}) },
        setFoodLibrary,
        mapLibraryFoodFromDb
      ),
    [corregirEnLaBiblioteca]
  );

  /**
   * ══ QUITAR UNA ENTRADA DE LA BIBLIOTECA ════════════════════════════════════
   *
   * La primera puerta de este gancho que no escribe. Y hacía falta: las cuatro
   * de arriba dan de alta y corrigen, así que una biblioteca solo podía crecer
   * —y el camino de crecimiento de `foods` **es** la duplicación, porque los
   * macros de tu marca obligan a un nombre nuevo—. La pantalla se llamaba «tu
   * material» y no tenía manera de tirar nada.
   *
   * ── Quién puede, y por qué NO lo decide `canEditLibraryItem` ─────────────
   * Ésa contesta «¿se corrigen sus macros?», y dice que no para todo nombre que
   * esté en el catálogo — con razón, porque eso es lo que los protege. Aquí la
   * pregunta es otra: **de quién es la FILA**. Un «Press banca» del catálogo que
   * tienes en tu biblioteca es una fila tuya y se puede quitar; lo que no se
   * puede es tirar la de un compañero, que es la misma regla de siempre —no se
   * le reescribe la voz a otro sin que se entere— aplicada al caso extremo.
   *
   * Y borrar la fila no borra el alimento del CATÁLOGO: eso no es de nadie y no
   * se toca. Vuelve a estar donde estaba, en el buscador de la dieta.
   *
   * ── Lo que esto NO comprueba, y quién sí ────────────────────────────────
   * Si está puesto en la dieta de alguien. No porque dé igual, sino porque la
   * respuesta ya la tiene la pantalla (`foodClientsByName`) y allí se puede
   * decir a quién; aquí solo se sabría que sí. La ficha no ofrece el verbo
   * cuando hay alguien detrás. Y si se colara, las dietas montadas no se
   * enteran: una entrada de dieta es una copia congelada (`buildFoodEntry`) y
   * sigue siendo cierta sin su fila de biblioteca.
   */
  const borrarDeLaBiblioteca = useCallback(
    async (tabla, id, quitar) => {
      const userId = session?.user?.id;
      if (!userId || !id) return false;

      /* `coach_id` en el filtro y no solo el `id`: las políticas del equipo
         (0006/0027) dejan a cualquier miembro escribir cualquier fila, así que
         la regla de «solo lo tuyo» la tiene que poner el producto. Con el
         filtro, borrar la de otro no falla — no encuentra nada, que es lo que
         tiene que pasar. */
      const { data, error } = await supabase
        .from(tabla)
        .delete()
        .eq('id', id)
        .eq('coach_id', userId)
        .select('id');

      if (error) {
        console.error(`borrar de ${tabla}:`, error.message);
        return false;
      }
      /* Cero filas no es un error de red: es «esa fila no es tuya». Quien llama
         necesita distinguirlo para no decir «borrado» sobre algo que sigue ahí. */
      if (!data?.length) return false;

      quitar((prev) => prev.filter((item) => item.id !== id));
      return true;
    },
    [session]
  );

  const deleteLibraryFood = useCallback(
    (id) => borrarDeLaBiblioteca('foods', id, setFoodLibrary),
    [borrarDeLaBiblioteca]
  );

  const deleteLibraryExercise = useCallback(
    (id) => borrarDeLaBiblioteca('exercises', id, setExerciseLibrary),
    [borrarDeLaBiblioteca]
  );

  return {
    exerciseLibrary,
    setExerciseLibrary,
    foodLibrary,
    setFoodLibrary,
    upsertLibraryExercise,
    saveExerciseSheet,
    upsertLibraryFood,
    saveFoodSheet,
    editLibraryExercise,
    editLibraryFood,
    deleteLibraryFood,
    deleteLibraryExercise,
  };
};
