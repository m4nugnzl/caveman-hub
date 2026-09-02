import { useCallback } from 'react';

import { useApp } from '@/context/AppContext';
import { planSnapshot } from '@/domain/reviews';
import { VIDEO_URL_HINT, parseVideoUrl } from '@/domain/video';
import { useToast } from '@/components/ui/ToastProvider';

/** Lo que se guarda al cerrar sin cambios. Es texto y no un booleano porque va a
    la misma nota que escribirías tú, y así el histórico se lee de corrido. */
export const SIN_CAMBIOS = 'Sin cambios: seguimos igual.';

/**
 * Cerrar una revisión. UNA sola forma, para las cuatro pantallas que la cierran.
 *
 * ══ Por qué esto no puede vivir en cada pantalla ════════════════════════════
 *
 * Porque cerrar una revisión son cinco cosas y no una, y cada sitio se dejaba
 * alguna:
 *
 *   1. Si el cliente no llegó a entregar, **crear la fila** — la cola da por
 *      lista una semana con pesajes y foto aunque no exista `check_ins`.
 *   2. **La foto del plan** tal y como queda ahora (migración 0042). Es lo que
 *      produce el «2400 → 2200 kcal» del histórico, y se toma AL CERRAR: lo que
 *      interesa guardar es lo que decidiste, no lo que había al entrar.
 *   3. **Marcarla revisada** con su nota.
 *   4. **El aviso con su «Deshacer»**, cuyo inverso depende de cómo llegó la
 *      fila: si existía se le quita el sello (0063); si la acabamos de crear,
 *      deshacer es borrarla entera (0044) — dejarla sin sello sería inventarle
 *      una entrega que él nunca hizo.
 *   5. **No cerrar si falla**, que es lo que distingue un error de un éxito.
 *
 * La bandeja de «Hoy» lo hacía sin la foto —es opcional en la firma— así que
 * cerrar por un lado o por el otro dejaba rastros distintos: unas revisiones con
 * su plan congelado y otras con `null` según por dónde se hubiera pulsado. Y ese
 * hueco no se puede rellenar después.
 *
 * Devuelve `{ ok }` o `{ ok: false, error }`. Quien llama decide qué hacer con el
 * error: una respuesta a un cliente que se cree enviada no puede acabar en la
 * consola.
 */
export const useCloseReview = () => {
  const {
    reviewCheckIn,
    unreviewCheckIn,
    deleteCheckIn,
    submitCheckIn,
    createReviewUrl,
    uploadReview,
    createReviewLink,
    publishUpdate,
    nutrition,
    workoutData,
  } = useApp();
  const toast = useToast();

  const close = useCallback(
    /* `restantes`: cuántas revisiones quedan en la pasada DESPUÉS de esta. Es
       opcional porque no todos los que cierran conocen la cola; cuando llega,
       el acuse cuenta el trabajo acabándose — que es la mitad de la gracia de
       una bandeja. */
    async ({ clientId, name, checkInId = null, weekStart, notes = SIN_CAMBIOS, restantes = null }) => {
      /* Sin la entrega del cliente no existe fila en `check_ins`, pero la cola sí
         lo da por listo. Se crea y se marca revisada en el mismo gesto: si has
         mirado su semana, esa semana existe — la haya entregado él o no. */
      let id = checkInId;
      if (!id) {
        const creada = await submitCheckIn(clientId, { weekStart });
        if (!creada.ok) return creada;
        id = creada.id;
      }

      const res = await reviewCheckIn(
        id,
        notes,
        planSnapshot({ nutrition: nutrition[clientId], program: workoutData[clientId] })
      );
      if (!res.ok) return res;

      const creada = !checkInId;
      const cola =
        restantes === null
          ? ''
          : restantes === 0
            ? ' No queda ninguna por revisar.'
            : restantes === 1
              ? ' Queda 1 por revisar.'
              : ` Quedan ${restantes} por revisar.`;
      toast({
        text: `Semana de ${name} cerrada.${cola}`,
        action: {
          label: 'Deshacer',
          onClick: () => (creada ? deleteCheckIn(id) : unreviewCheckIn(id)),
        },
      });

      return { ok: true, id };
    },
    [
      submitCheckIn,
      reviewCheckIn,
      unreviewCheckIn,
      deleteCheckIn,
      toast,
      nutrition,
      workoutData,
    ]
  );

  /**
   * Enlazar un vídeo a esta revisión y cerrarla con él.
   *
   * El vídeo ES la respuesta, así que cierra: pedir además un «todo ok» después
   * de haberle grabado veinte minutos sobra.
   *
   * La semana es la de la REVISIÓN y no la de hoy: `reviewHistory` empareja cada
   * vídeo con su fila comparando `weekStart` exacto, y con cadencia quincenal —o
   * al cerrar una atrasada— no son la misma. Con la de hoy el vídeo se guardaba
   * huérfano.
   */
  const closeWithVideo = useCallback(
    async ({ clientId, name, checkInId = null, weekStart, url, restantes = null }) => {
      const video = parseVideoUrl(url);
      if (!video) return { ok: false, error: VIDEO_URL_HINT };

      const res = await createReviewUrl({
        clientId,
        url: video.watchUrl,
        title: `Revisión de ${name}`,
        weekStart,
      });
      if (!res.ok) return res;

      publishUpdate(clientId, 'review');
      return close({ clientId, name, checkInId, weekStart, notes: 'Te lo explico en el vídeo.', restantes });
    },
    [createReviewUrl, publishUpdate, close]
  );

  /**
   * Cerrar con un vídeo GRABADO aquí mismo.
   *
   * ══ Por qué es una tercera función y no un parámetro de la anterior ════════
   *
   * Porque el camino hasta tener una URL es distinto y puede fallar en dos
   * sitios más: hay que SUBIR el archivo al almacén del entrenador y luego
   * pedirle a la base su enlace permanente. Un `if` dentro de `closeWithVideo`
   * tendría que decidir cuál de los dos errores enseñar y acabaría siendo dos
   * funciones con una bandera delante.
   *
   * ── Y aterriza en la MISMA lista que un enlace de YouTube ──────────────────
   * `create_review_link` (0011) y `create_review_url` (0040) escriben en la misma
   * tabla, y `reviewHistory` empareja los dos por `weekStart`. Para el cliente
   * «la revisión de la semana 7» es una sola cosa: dónde está alojado el vídeo es
   * un detalle de infraestructura que no le toca conocer.
   *
   * ── El orden importa ──────────────────────────────────────────────────────
   * Primero el archivo, luego el enlace, y solo entonces se cierra la semana. Al
   * revés, un fallo de subida dejaría una revisión cerrada diciendo «te lo
   * explico en el vídeo» sin ningún vídeo — que es la peor de las respuestas
   * posibles, porque el cliente la lee y se va a buscar algo que no existe.
   */
  const closeWithRecording = useCallback(
    async ({ clientId, name, checkInId = null, weekStart, blob, mimeType, restantes = null }) => {
      const subida = await uploadReview({ clientId, blob, mimeType, label: `revision-${name}` });
      if (!subida.ok) return subida;

      const enlace = await createReviewLink({
        clientId,
        path: subida.path,
        title: `Revisión de ${name}`,
        weekStart,
      });
      if (!enlace.ok) return enlace;

      publishUpdate(clientId, 'review');
      return close({ clientId, name, checkInId, weekStart, notes: 'Te lo explico en el vídeo.', restantes });
    },
    [uploadReview, createReviewLink, publishUpdate, close]
  );

  return { close, closeWithVideo, closeWithRecording };
};
