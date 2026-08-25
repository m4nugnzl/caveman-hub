import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { buildEquipmentPath, cleanEquipment } from '@/domain/equipment';
import { shrinkImage } from '@/lib/shrinkImage';
import { traduceStorageError } from '@/lib/dbErrors';
import { BUCKET, SIGNED_URL_TTL_SECONDS } from '@/context/media';

/*
  ══ La maquinaria del gimnasio, fuera de AppContext ══════════════════════════

  Con la convención de `useRoadmap.js`, y con el mismo alcance que los
  condicionantes: la del cliente ABIERTO. Las dos pantallas que la miran —su
  ficha y su rutina— hablan de la persona que tienes delante.

  ── Lo que este gancho tiene y los otros no: archivos ───────────────────────
  Una pieza son DOS cosas —una fila y un objeto en el bucket— y no hay
  transacción entre las dos. El orden importa y está elegido:

    · Al AÑADIR se sube primero y se inserta después. Si falla el INSERT queda
      un archivo huérfano ocupando cuota, que es feo y no rompe nada; al revés
      quedaría una fila apuntando a una foto que no existe, o sea un hueco en el
      álbum sin explicación.
    · Al BORRAR se quita primero la fila y después el archivo. Si falla el
      segundo pasa lo mismo: sobra un archivo, no falta una foto.

  En los dos casos el fallo posible es «ocupa de más», nunca «enseña roto».
*/

const explicarError = (error) => {
  const texto = String(error?.message || '');
  if (/does not exist|schema cache/i.test(texto)) {
    /* Dos migraciones distintas caen aquí: la 0079 crea la tabla y la 0080 la
       función que ordena. Se nombran las dos porque quien lee esto no puede
       saber cuál falta, y aplicar la que ya está aplicada no hace nada. */
    return 'Falta aplicar las migraciones 0079 y 0080 para poder guardar su maquinaria.';
  }
  if (error?.code === '23505') {
    /* La única única de la tabla es la ruta, y dos rutas iguales solo salen de
       un doble clic en «Subir» dentro del mismo milisegundo. */
    return 'Esa foto ya está subida.';
  }
  if (error?.code === '42501') {
    return 'No tienes permiso para tocar la ficha de este cliente. Si tu suscripción no está activa, queda en solo lectura.';
  }
  return texto || 'No se ha podido guardar la foto.';
};

export const useEquipment = ({ activeClientId, userId, isCoach = true }) => {
  const [equipment, setEquipment] = useState([]);
  /*
    ══ Cuántas fotos tiene CADA cliente ═══════════════════════════════════════

    El detalle es del cliente abierto —esa es la regla de este gancho— y para
    saber si alguien ha terminado su alta hace falta una sola cifra de TODOS: si
    ha mandado fotos o no. Sin esto, «Hoy» no puede avisar de quién ya está listo
    para que le montes el plan, que es justo la pregunta con la que se abre.

    Una consulta y de una columna: RLS filtra a los tuyos, así que ni siquiera
    hace falta decir de quién. Veinte clientes con cuarenta máquinas son
    ochocientos uuid, unos treinta kilobytes — el mismo orden que una sola foto
    de las que ya se descargan.
  */
  const [counts, setCounts] = useState({});

  /**
   * Carga y firma.
   *
   * Las URL se firman EN BLOQUE y no una por foto: cuarenta máquinas son
   * cuarenta peticiones si se hace mal, y `createSignedUrls` acepta la lista
   * entera. Es lo mismo que hacen las fotos de progreso.
   */
  const cargar = useCallback(async (clientId) => {
    const { data, error } = await supabase
      .from('client_equipment')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at');

    /* Sin la migración 0079 la tabla no existe. Se traga, igual que el roadmap
       con la 0028: un álbum vacío deja la aplicación como estaba antes. */
    if (error) return [];

    const piezas = (data || [])
      .map((row) =>
        cleanEquipment({
          id: row.id,
          clientId: row.client_id,
          muscleGroup: row.muscle_group,
          name: row.name,
          photoPath: row.photo_path,
        })
      )
      .filter(Boolean);

    if (piezas.length === 0) return [];

    const firmadas = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(
        piezas.map((p) => p.photoPath),
        SIGNED_URL_TTL_SECONDS
      );

    const porRuta = new Map(
      (firmadas.data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl])
    );

    /* La pieza que no se pueda firmar se queda SIN url y no se descarta: la
       tarjeta enseña su nombre y su grupo, que sigue siendo información, en vez
       de desaparecer sin decir nada. */
    return piezas.map((p) => ({ ...p, url: porRuta.get(p.photoPath) || null }));
  }, []);

  useEffect(() => {
    if (!userId) {
      setCounts({});
      return undefined;
    }

    let cancelado = false;
    supabase
      .from('client_equipment')
      .select('client_id')
      .then(({ data, error }) => {
        if (cancelado || error) return;
        const cuenta = {};
        for (const fila of data || []) {
          cuenta[fila.client_id] = (cuenta[fila.client_id] || 0) + 1;
        }
        setCounts(cuenta);
      });

    return () => {
      cancelado = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!activeClientId) {
      setEquipment([]);
      return undefined;
    }

    let cancelado = false;
    setEquipment([]);

    cargar(activeClientId).then((piezas) => {
      /* Cambiar de cliente rápido puede hacer que llegue antes la respuesta del
         anterior. Aquí eso sería enseñar el gimnasio de otra persona sobre la
         rutina que estás montando. */
      if (!cancelado) setEquipment(piezas);
    });

    return () => {
      cancelado = true;
    };
  }, [activeClientId, cargar]);

  /**
   * Subir una foto de máquina.
   *
   * Pasa por `shrinkImage` como todas las demás: una foto de móvil son 4 MB y
   * reducida a 1600 px son ~0,3 MB. Con cuarenta máquinas, la diferencia entre
   * 12 MB y 160 MB de la cuota del plan (0067).
   */
  const addEquipment = useCallback(
    async (clientId, { file, muscleGroup, name }) => {
      if (!file) return { ok: false, error: 'No se ha seleccionado ninguna foto.' };

      const reducida = await shrinkImage(file);
      const path = buildEquipmentPath({ clientId, muscleGroup });

      const subida = await supabase.storage
        .from(BUCKET)
        .upload(path, reducida, { contentType: reducida.type || 'image/webp', upsert: false });

      if (subida.error) {
        const capado = traduceStorageError(subida.error, { cliente: !isCoach });
        return { ok: false, error: capado || `No se pudo subir la foto: ${subida.error.message}` };
      }

      const { data, error } = await supabase
        .from('client_equipment')
        .insert({
          client_id: clientId,
          muscle_group: muscleGroup,
          name: name?.trim() || null,
          photo_path: path,
        })
        .select()
        .single();

      if (error) {
        /* La fila no entró, así que el archivo sobra. Se intenta retirar y no se
           comprueba: si tampoco se puede, lo peor que pasa es que ocupa. */
        await supabase.storage.from(BUCKET).remove([path]);
        return { ok: false, error: explicarError(error) };
      }

      const pieza = cleanEquipment({
        id: data.id,
        clientId: data.client_id,
        muscleGroup: data.muscle_group,
        name: data.name,
        photoPath: data.photo_path,
      });

      const firmada = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

      const conUrl = { ...pieza, url: firmada.data?.signedUrl || null };
      if (clientId === activeClientId) setEquipment((prev) => [...prev, conUrl]);
      return { ok: true, item: conUrl };
    },
    [activeClientId, isCoach]
  );

  /**
   * Decir de qué es una máquina. El archivo NO se mueve: ver la ruta.
   *
   * ══ Por qué una función de la base y no un UPDATE ══════════════════════════
   *
   * Porque quien más va a usar esto es el CLIENTE, y la 0079 le dio INSERT y no
   * UPDATE — con razón: una política de UPDATE es por FILA, así que le dejaría
   * cambiar también `photo_path` y apuntar su foto a otro archivo.
   *
   * `set_equipment_group` (0080) escribe UNA columna después de comprobar quién
   * llama, y vale para los dos: el entrenador ordena desde la ficha y el cliente
   * desde su alta, por el mismo camino. Dos caminos para la misma escritura es
   * cómo se acaba con dos comportamientos y solo uno probado.
   */
  const setEquipmentGroup = useCallback(async (id, muscleGroup) => {
    const { error } = await supabase.rpc('set_equipment_group', { item: id, grupo: muscleGroup });
    if (error) return { ok: false, error: explicarError(error) };

    setEquipment((prev) => prev.map((p) => (p.id === id ? { ...p, muscleGroup } : p)));
    return { ok: true };
  }, []);

  const removeEquipment = useCallback(async (item) => {
    const { error } = await supabase.from('client_equipment').delete().eq('id', item.id);
    if (error) return { ok: false, error: explicarError(error) };

    setEquipment((prev) => prev.filter((p) => p.id !== item.id));
    /* El archivo, después. Un fallo aquí deja un huérfano que ocupa cuota y no
       se ve; devolver error obligaría a la pantalla a decir que no se pudo
       borrar una foto que ya no está en el álbum. */
    await supabase.storage.from(BUCKET).remove([item.photoPath]);
    return { ok: true };
  }, []);

  /*
    El recuento, con el cliente abierto SIEMPRE al día.

    La consulta de arriba se hace una vez por sesión, así que subir o borrar una
    foto la dejaría rancia — y el aviso de «ya puedes empezar» aparecería o no
    según cuándo se recargó la página. Para el que se está mirando manda la lista
    de verdad, que es la que acaba de cambiar; para los demás, el recuento.
  */
  const equipmentCounts = useMemo(
    () => (activeClientId ? { ...counts, [activeClientId]: equipment.length } : counts),
    [counts, activeClientId, equipment.length]
  );

  return { equipment, equipmentCounts, addEquipment, setEquipmentGroup, removeEquipment };
};
