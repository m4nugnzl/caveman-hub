import { useMemo, useState } from 'react';
import { History, Link2, MessageSquareQuote, Pencil, Trash2, Video } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import { checkinQuestions, clientProtocol } from '@/domain/protocol';
import { PlanChanges } from '@/components/review/PlanChanges';
import { VIDEO_URL_HINT, parseVideoUrl } from '@/domain/video';
import { shortDate } from '@/lib/dates';
import { Fold, Notice, Panel, SectionTitle } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { SessionFeedback } from '@/components/Coach/Workout/SessionFeedback';

/**
 * Las revisiones anteriores de un cliente: qué se decidió cada semana.
 *
 * ══ Qué contesta ═══════════════════════════════════════════════════════════
 *
 * «¿Qué le cambié en agosto?», que hasta ahora no tenía respuesta en ninguna
 * parte. El plan guarda el ESTADO —las calorías de hoy— y no la historia, así que
 * al bajarle los hidratos las cifras anteriores desaparecían. La nota decía «te
 * bajo un poco» y dentro de dos meses nadie sabía cuánto era «un poco».
 *
 * Cada fila junta lo que ya existía suelto: lo que él entregó, lo que tú
 * contestaste, **lo que cambiaste** —comparando la foto del plan con la de la
 * revisión anterior (migración 0042)— y el vídeo de esa semana.
 *
 * ══ El vídeo se puede enganchar DESPUÉS ════════════════════════════════════
 *
 * Se empareja por semana, no por una columna que los una, y esa decisión es la
 * que permite cerrar la revisión el lunes y pegar el enlace de YouTube el jueves,
 * cuando lo tengas subido. Es como se trabaja de verdad: primero se decide, luego
 * se graba.
 *
 * El mismo componente sirve a los dos. Al cliente se le enseña lo mismo salvo
 * poder enlazar: eso es del entrenador.
 *
 * ══ Las filas llegan de fuera ══════════════════════════════════════════════
 *
 * Antes las cargaba él. El problema es que las dos pantallas que lo llevan
 * dentro necesitan lo mismo para otra cosa —el portal, para saber qué semanas
 * quedan por entregar; «Su semana», para saber contra qué comparar el plan de
 * hoy— así que la misma consulta se hacía dos veces seguidas en la misma
 * pantalla. Ahora carga el dueño (`useReviewRows`) y aquí solo se pinta.
 *
 * @param rows      Las revisiones cerradas, de `useReviewRows`.
 * @param recargar  Volver a leerlas: enlazar un vídeo o corregir una nota cambia
 *                  lo que hay que enseñar, y quien lo hace es este panel.
 */
export const ReviewHistory = ({
  client,
  audience = 'coach',
  rows = [],
  recargar = () => {},
  excludeId = null,
}) => {
  const { createReviewUrl, publishUpdate, updateCheckInNotes, deleteCheckIn } = useActions();
  const confirm = useConfirm();
  const [enlazando, setEnlazando] = useState(null); // weekStart de la fila abierta
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(null); // id de la revisión que se edita
  const [nota, setNota] = useState('');

  const esEntrenador = audience === 'coach';
  const clientId = client?.id;

  /* Las preguntas que se le hacen HOY, para resolver lo que contestó ENTONCES.

     Si el entrenador quitó una pregunta después, su respuesta deja de pintarse:
     no hay forma de saber cómo se llamaba ni de qué escala era, y enseñar
     «hunger: 7» sin etiqueta ni rango es peor que no enseñar nada. Lo que se
     guardó sigue en la base por si vuelve a activarla. */
  const preguntasCheckIn = useMemo(
    () => checkinQuestions(clientProtocol(client?.preferences)),
    [client?.preferences]
  );

  /*
    Lo que ya se está enseñando arriba no vuelve a salir aquí.

    En el portal del cliente, la revisión de esta semana ocupa su propio bloque
    —con la respuesta y los cambios—, así que repetirla en «anteriores» la contaba
    dos veces y hacía dudar de si eran dos revisiones distintas. «Anteriores»
    significa anteriores.
  */
  const filas = useMemo(() => rows.filter((f) => f.id !== excludeId), [rows, excludeId]);

  /**
   * Reescribir el comentario de una revisión ya cerrada.
   *
   * ══ Por qué NO va por la función que la cierra ══════════════════════════════
   *
   * Iba, y parecía gratis: «vuelve a marcarla revisada, que ya lo estaba». No lo
   * era. `review_check_in` sella `reviewed_at = now()` y `reviewed_by =
   * auth.uid()` sin condiciones, y además el envoltorio avisa al cliente. O sea
   * que corregir una errata en una nota de hace dos semanas:
   *
   *   · movía la fecha de la revisión a hoy —y este mismo panel escribe «revisada
   *     el {fecha}» dos líneas más arriba, así que el histórico se contradecía a
   *     sí mismo—;
   *   · ponía como autor a quien corrige, borrando en silencio quién revisó de
   *     verdad, que es exactamente lo que en un equipo hay que poder demostrar;
   *   · y le saltaba al cliente «tu entrenador ha revisado tu semana» por un
   *     texto que ya había leído.
   *
   * Cerrar una revisión y corregir su texto son dos cosas distintas, así que son
   * dos funciones distintas (migración 0051).
   */
  const guardarNota = async (fila) => {
    const res = await updateCheckInNotes(fila.id, nota.trim());
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditando(null);
    setError('');
    await recargar();
  };

  /**
   * Borrar una revisión entera.
   *
   * Hace falta más de lo que parece: el «Todo ok» de la barra CREA la fila si el
   * cliente no había entregado, así que un clic en la persona equivocada deja una
   * revisión inventada en su historial y hasta ahora no había forma de quitarla.
   *
   * Se avisa de lo que NO deshace —los cambios que se hicieran en el plan esa
   * semana— porque es justo lo que se espera de un botón que dice «eliminar» y no
   * es lo que hace.
   */
  const borrar = async (fila) => {
    const ok = await confirm({
      title: `¿Eliminar la revisión del ${shortDate(fila.weekStart)}?`,
      message: 'Se borra la revisión, tu respuesta y lo que entregó esa semana.',
      detail:
        'Los cambios que hicieras entonces en su dieta o en su rutina NO se deshacen: el plan se queda como está ahora. No se puede deshacer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;

    const res = await deleteCheckIn(fila.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError('');
    await recargar();
  };

  const enlazar = async (fila) => {
    const video = parseVideoUrl(url);
    if (!video) {
      setError(VIDEO_URL_HINT);
      return;
    }
    const res = await createReviewUrl({
      clientId,
      url: video.watchUrl,
      title: `Revisión del ${shortDate(fila.weekStart)}`,
      // La semana de la REVISIÓN, no la de hoy: es lo que empareja el vídeo con
      // su fila, y lo que permite enlazarlo tres días después.
      weekStart: fila.weekStart,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    publishUpdate(clientId, 'review');
    setUrl('');
    setEnlazando(null);
    setError('');
    await recargar();
  };

  /* Mientras carga tampoco se anuncia nada: esto va debajo de otras cosas y un
     «cargando» que aparece y desaparece en 200 ms es un parpadeo, no
     información. Con las filas vacías el panel simplemente no está.

     Sin revisiones no hay panel: una revisión es la RESPUESTA a algo que el
     cliente entregó, así que no hay nada que ofrecer aquí cuando no ha entregado
     nunca. */
  if (filas.length === 0) return null;

  return (
    <Panel className="col gap-4">
      <SectionTitle icon={History}>
        {esEntrenador ? 'Revisiones anteriores' : 'Tus revisiones anteriores'}
      </SectionTitle>

      {error && <Notice tone="error">{error}</Notice>}


      {/*
        ══ UNA REVISIÓN PASADA ES UNA LÍNEA, Y SE ABRE LA QUE INTERESE ═════════

        Cada fila enseñaba a la vez su peso, el diff del plan, lo que anotó él,
        la respuesta del entrenador, el vídeo y las respuestas del cuestionario.
        Con veinte semanas de historia eso es un muro, y el histórico se usa
        justo al revés: se busca UNA cosa —«¿qué le cambié en agosto?»— y hay que
        recorrerlo entero para encontrarla.

        Plegada, la línea ya contesta esa pregunta: «Semana del 11 ago · 81,5 kg
        · bajaste los hidratos». Y se abre la que interese. Es el mismo gesto que
        los días del entreno y que la anamnesis de la ficha: resumen en la fila,
        detalle a un toque, nada escondido.
      */}
      <div className="col">
        {filas.map((fila) => (
          <Fold
            key={fila.id}
            title={`Semana del ${shortDate(fila.weekStart)}`}
            summary={[
              fila.weight ? `${fila.weight} kg` : null,
              /* Lo que se DECIDIÓ, que es a lo que se viene: cuántas cosas se
                 movieron del plan, o que no se movió ninguna. */
              fila.changes.length + fila.structure.length > 0
                ? `${fila.changes.length + fila.structure.length} ${
                    fila.changes.length + fila.structure.length === 1 ? 'cambio' : 'cambios'
                  }`
                : fila.comparable
                  ? 'sin cambios'
                  : null,
              fila.coachNotes ? 'con respuesta' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          >
          <div className="col gap-2">
            <div className="row between wrap gap-2">
              <span className="t-2xs t-tertiary">revisada el {shortDate(fila.reviewedAt)}</span>
              <span className="row gap-2 t-2xs t-tertiary">
                {esEntrenador && (
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-danger"
                    style={{ width: 24, height: 24 }}
                    aria-label={`Eliminar la revisión del ${shortDate(fila.weekStart)}`}
                    onClick={() => borrar(fila)}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </span>
            </div>

            {/*
              LO QUE CAMBIÓ esa semana. El render vive en `PlanChanges` porque el
              mismo diff hace falta en tres momentos —mientras decides, cuando él
              lo lee y aquí, dos meses después— y tres copias habrían divergido.
            */}
            <PlanChanges changes={fila.changes} structure={fila.structure} />

            {/*
              Los tres casos, y son tres cosas distintas:

                · no cambió nada         → se pudo comparar y salió igual
                · no hay con qué comparar → es la primera con foto guardada
                · de antes del histórico  → entonces no se guardaba nada

              Decir «sin cambios» en los dos últimos era afirmar algo que no se
              sabe, justo delante de alguien que acaba de hacer un cambio.
            */}
            {/*
              Cuando la estructura no se puede comparar se dice, aunque las cifras
              sí hayan salido. Callarse dejaría creer que el entrenamiento no se
              tocó esa semana.
            */}
            {fila.structureStale && (
              <span className="t-2xs t-tertiary">
                El entrenamiento de esta semana no se puede comparar: la revisión anterior se guardó
                sin los nombres de los días. Desde la siguiente vuelve a compararse.
              </span>
            )}

            {fila.changes.length === 0 &&
              fila.structure.length === 0 &&
              !fila.structureStale &&
              (fila.comparable ? (
                <span className="t-2xs t-tertiary">Sin cambios en el plan.</span>
              ) : fila.hasSnapshot ? (
                <span className="t-2xs t-tertiary">
                  Primera revisión con seguimiento de cambios: desde la siguiente se verá qué se
                  movió.
                </span>
              ) : (
                <span className="t-2xs t-tertiary">De antes de que se guardaran los cambios.</span>
              ))}

            {/*
              La respuesta, y para el entrenador EDITABLE.

              Una revisión se cierra deprisa —muchas veces con el «todo ok» de un
              toque— y después se recuerda algo que sí había que decirle. Sin
              poder editarla, la única salida era escribir otra revisión de la
              misma semana, que no existe, o mandarlo por WhatsApp y que aquí
              quedara una versión incompleta de lo que se dijo.
            */}
            {/* Lo que escribió él al entregar. Solo al entrenador: el cliente ya
                sabe lo que puso. */}
            {esEntrenador && fila.notes && (
              <p className="t-xs t-secondary pre-wrap">Él anotó: {fila.notes}</p>
            )}

            {/*
              ══ Y lo que contestó al cuestionario de esa semana ════════════════

              Aquí, dentro de su fila, y no en una pantalla aparte: la gracia de
              tener las respuestas guardadas es poder leerlas AL LADO de lo que
              se decidió esa semana. «Adherencia 4» junto a «te bajo los hidratos»
              explica la decisión tres meses después, que es justo lo que este
              histórico existe para contestar.

              El mismo componente con el que se contestaron, en modo lectura: que
              la respuesta se lea con la forma en que se dio es lo que evita que
              las dos versiones acaben divergiendo. Sin respuestas no pinta nada.
            */}
            <SessionFeedback
              readOnly
              questions={preguntasCheckIn}
              answers={fila.answers || {}}
              title={esEntrenador ? 'Lo que contestó' : 'Lo que contestaste'}
            />

            {/*
              ══ LA RESPUESTA: el texto y el vídeo son la misma cosa ═══════════

              Estaban como dos elementos sueltos de la fila, y el vídeo parecía ir
              por su lado — cuando es exactamente lo mismo que la nota, dicho de
              otra forma: «te lo explico aquí». Ahora van dentro del mismo bloque,
              con su marca a la izquierda, y se leen como una sola respuesta.

              El lápiz cuelga del bloque entero, no de la línea de texto: se edita
              la respuesta, y da igual si lo que hay dentro es una frase, un vídeo
              o las dos cosas.
            */}
            {(fila.coachNotes || fila.video || esEntrenador) && (
              <div className="review-answer">
                {editando === fila.id ? (
                  <form
                    className="col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      guardarNota(fila);
                    }}
                  >
                    <textarea
                      autoFocus
                      className="textarea"
                      rows={3}
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      aria-label="Lo que le dices de esta semana"
                    />
                    <div className="row gap-2">
                      <button type="submit" className="btn btn-primary btn-sm" disabled={!nota.trim()}>
                        Guardar
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEditando(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="row between wrap gap-2">
                    <p className="t-sm grow pre-wrap">
                      <MessageSquareQuote
                        size={12}
                        className="icon-inline"
                        style={{ color: 'var(--text-tertiary)' }}
                      />
                      {fila.coachNotes || (
                        <span className="t-tertiary">
                          {fila.video ? 'Se lo explicas en el vídeo.' : 'Sin comentario.'}
                        </span>
                      )}
                    </p>
                    {esEntrenador && (
                      <button
                        type="button"
                        className="btn btn-icon"
                        aria-label="Editar la respuesta"
                        onClick={() => {
                          setEditando(fila.id);
                          setNota(fila.coachNotes || '');
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                )}

                {/* El vídeo, dentro de la respuesta. Sin él, «Enlazar vídeo» es
                    lo que ofrece completarla. */}
                {fila.video ? (
                  <a
                    className="row gap-1 t-xs link"
                    href={fila.video.externalUrl || fila.video.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Video size={12} /> Ver la revisión en vídeo
                  </a>
                ) : (
                  esEntrenador &&
                  editando !== fila.id &&
                  (enlazando === fila.weekStart ? (
                    <form
                      className="row gap-2 wrap"
                      onSubmit={(e) => {
                        e.preventDefault();
                        enlazar(fila);
                      }}
                    >
                      <input
                        autoFocus
                        className="input grow"
                        style={{ minWidth: 200 }}
                        value={url}
                        placeholder="https://youtu.be/… o https://loom.com/share/…"
                        onChange={(e) => {
                          setUrl(e.target.value);
                          setError('');
                        }}
                      />
                      <button type="submit" className="btn btn-primary btn-sm" disabled={!url.trim()}>
                        Enlazar
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setEnlazando(null);
                          setError('');
                        }}
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="chip chip-dashed"
                      style={{ alignSelf: 'flex-start' }}
                      onClick={() => {
                        setEnlazando(fila.weekStart);
                        setUrl('');
                      }}
                    >
                      <Link2 size={12} /> Enlazar vídeo
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          </Fold>
        ))}
      </div>
    </Panel>
  );
};
