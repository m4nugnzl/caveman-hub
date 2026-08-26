import { useEffect, useState } from 'react';

import { ANGLES, validatePhotoFile } from '@/domain/photos';
import { newId } from '@/lib/ids';

/**
 * Un lote de fotos a punto de subirse: los archivos elegidos, su ángulo y cómo
 * fue la subida de cada uno.
 *
 * ══ Por qué es un gancho y no vive dentro del diálogo ═══════════════════════
 *
 * Porque ahora hay DOS sitios que suben fotos y no son la misma pantalla: el
 * diálogo suelto del entrenador (biblioteca y estudio) y el paso de fotos del
 * asistente de revisión del cliente. La lógica es idéntica —validar, proponer
 * ángulo, subir en serie, marcar cuál falló— y la presentación no.
 *
 * Copiarla habría sido garantizar que dentro de tres meses una de las dos suba
 * en paralelo y la otra en serie, o que solo una valide el tamaño.
 *
 * ── Las subidas van en SERIE, no en paralelo ───────────────────────────────
 * Tres subidas simultáneas de 15 MB desde el móvil de un cliente en el gimnasio
 * saturan la conexión y fallan las tres. En serie, además, cada foto se marca
 * como subida o fallida por separado y se puede reintentar solo lo que falló.
 *
 * ══ Y ahora son TRES sitios: las máquinas del gimnasio ═════════════════════
 *
 * El mismo lote con otra etiqueta. Una foto de progreso lleva un ÁNGULO —frontal,
 * lateral, espalda— y una de maquinaria lleva un GRUPO MUSCULAR; lo demás
 * —validar, previsualizar, subir en serie, marcar cuál falló, poder reintentar
 * solo eso— es idéntico hasta la última línea.
 *
 * Por eso la etiqueta se parametriza en vez de copiarse el gancho: la cabecera
 * de arriba ya avisaba de lo que pasa al copiarlo, y con tres copias sería
 * cuestión de meses que una subiera en paralelo o dejara de validar el tamaño.
 *
 * `tagKey` es cómo se llama esa etiqueta en el objeto que recibe `onUpload`, y
 * `nextTag` decide cuál se propone al añadir un archivo: las fotos de progreso
 * reparten los ángulos que quedan libres, y las de maquinaria le ponen a todas
 * la misma —quien sube veinte máquinas de pecho no quiere que la aplicación se
 * invente un reparto—.
 */
export const usePhotoBatch = ({
  onUpload,
  tagKey = 'angle',
  nextTag = (usados) => ANGLES.find((a) => !usados.has(a.id))?.id || 'frontal',
}) => {
  /** items: [{ id, file, url, angle, status, error }] */
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Cada miniatura es un object URL: hay que revocarlos o se filtra memoria.
  useEffect(
    () => () => {
      items.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [items]
  );

  /**
   * Al añadir archivos se les propone un ángulo: el primero frontal, el segundo
   * lateral, el tercero espalda. Es el orden en que se hacen las fotos, así que
   * la mayoría de las veces acierta y no hay que tocar nada.
   */
  const addFiles = (files) => {
    const incoming = [...(files || [])];
    if (incoming.length === 0) return;

    const rejected = [];
    const accepted = [];

    for (const file of incoming) {
      const invalid = validatePhotoFile(file);
      if (invalid) rejected.push(`${file.name}: ${invalid}`);
      else accepted.push(file);
    }

    setError(rejected.length > 0 ? rejected.join(' · ') : null);

    setItems((prev) => {
      const used = new Set(prev.map((i) => i.tag));
      const next = [...prev];
      for (const file of accepted) {
        const tag = nextTag(used);
        used.add(tag);
        next.push({
          id: newId('up'),
          file,
          url: URL.createObjectURL(file),
          tag,
          status: 'pending',
          error: null,
        });
      }
      return next;
    });
  };

  const setTag = (id, tag) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, tag } : i)));

  const drop = (id) =>
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((i) => i.id !== id);
    });

  /**
   * Sube lo que quede pendiente. Devuelve `{ subidas, fallidas }` en lugar de un
   * booleano: quien llama tiene que poder decir «2 de 3 no se pudieron subir» y
   * dejar el diálogo abierto para reintentar solo esas.
   */
  const upload = async ({ clientId, week, notes = '' }) => {
    const pending = items.filter((i) => i.status !== 'done');
    if (pending.length === 0) return { subidas: 0, fallidas: 0 };

    setBusy(true);
    setError(null);
    let fallidas = 0;

    for (const item of pending) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading' } : i)));

      const result = await onUpload({
        clientId,
        file: item.file,
        week,
        [tagKey]: item.tag,
        notes,
      });

      if (result?.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'done', error: null } : i))
        );
      } else {
        fallidas += 1;
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'error', error: result?.error || 'No se pudo subir.' }
              : i
          )
        );
      }
    }

    setBusy(false);
    return { subidas: pending.length - fallidas, fallidas };
  };

  return {
    items,
    error,
    setError,
    busy,
    addFiles,
    setTag,
    drop,
    upload,
    /** Lo que aún no está arriba. Es lo que cuenta el botón de subir. */
    pendientes: items.filter((i) => i.status !== 'done').length,
    algunaSubida: items.some((i) => i.status === 'done'),
  };
};
