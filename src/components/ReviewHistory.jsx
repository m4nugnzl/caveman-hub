import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, History, Link2, MessageSquareQuote, Pencil, Trash2, Video } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import { groupChanges, reviewHistory } from '@/domain/reviews';
import { VIDEO_URL_HINT, parseVideoUrl } from '@/domain/video';
import { shortDate } from '@/lib/dates';
import { Notice, Panel, SectionTitle } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';

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
 */
/**
 * Hasta tres nombres y el resto contado.
 *
 * La lista completa de un día reprogramado son treinta nombres que nadie lee. El
 * recuento va delante —es lo que se busca— y estos tres sirven para reconocer de
 * qué se está hablando.
 */
const nombres = (lista) => {
  const primeros = lista.slice(0, 3).join(', ');
  return lista.length > 3 ? `${primeros} y ${lista.length - 3} más` : primeros;
};

export const ReviewHistory = ({ client, audience = 'coach', excludeId = null }) => {
  const {
    loadCheckInHistory,
    listReviewLinks,
    createReviewUrl,
    publishUpdate,
    reviewCheckIn,
    deleteCheckIn,
  } = useActions();
  const confirm = useConfirm();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [enlazando, setEnlazando] = useState(null); // weekStart de la fila abierta
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(null); // id de la revisión que se edita
  const [nota, setNota] = useState('');

  const esEntrenador = audience === 'coach';
  const clientId = client?.id;

  const recargar = useCallback(async () => {
    if (!clientId) return;
    const [historial, enlaces] = await Promise.all([
      loadCheckInHistory(clientId),
      listReviewLinks(clientId),
    ]);
    /*
      Lo que ya se está enseñando arriba no vuelve a salir aquí.

      En el «Hoy» del cliente, la revisión de esta semana ocupa su propio bloque
      —con la respuesta y todo—, así que repetirla en «anteriores» la contaba dos
      veces y hacía dudar de si eran dos revisiones distintas. «Anteriores»
      significa anteriores.
    */
    setFilas(
      reviewHistory({ checkIns: historial.checkIns, links: enlaces.links || [] }).filter(
        (f) => f.id !== excludeId
      )
    );
    setCargando(false);
  }, [clientId, loadCheckInHistory, listReviewLinks, excludeId]);

  useEffect(() => {
    setCargando(true);
    recargar();
  }, [recargar]);

  /**
   * Reescribir el comentario de una revisión ya cerrada.
   *
   * Va por la misma función que la cierra: vuelve a marcarla revisada —ya lo
   * estaba— y sustituye la nota. No hace falta nada nuevo en la base, y el
   * cliente ve el texto corregido donde ya lo estaba leyendo.
   */
  const guardarNota = async (fila) => {
    const res = await reviewCheckIn(fila.id, nota.trim());
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

  /* Cargando no se anuncia: esto va debajo de otras cosas y un «cargando» que
     aparece y desaparece en 200 ms es un parpadeo, no información. */
  /* Sin revisiones no hay panel: una revisión es la RESPUESTA a algo que el
     cliente entregó, así que no hay nada que ofrecer aquí cuando no ha entregado
     nunca. */
  if (cargando || filas.length === 0) return null;

  return (
    <Panel className="col gap-4">
      <SectionTitle icon={History}>
        {esEntrenador ? 'Revisiones anteriores' : 'Tus revisiones anteriores'}
      </SectionTitle>

      {error && <Notice tone="error">{error}</Notice>}


      <div className="col gap-3">
        {filas.map((fila) => (
          <div className="card-inset col gap-2" key={fila.id}>
            <div className="row between wrap gap-2">
              <span className="t-sm" style={{ fontWeight: 650 }}>
                Semana del {shortDate(fila.weekStart)}
              </span>
              <span className="row gap-2 t-2xs t-tertiary">
                {fila.weight ? `${fila.weight} kg · ` : ''}
                revisada el {shortDate(fila.reviewedAt)}
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
              LO QUE CAMBIÓ, en rojo lo de antes y en verde lo de ahora.

              Es la razón de existir de esta pantalla: la cifra anterior y la
              nueva, no un «se ajustó la dieta». El color no dice si es bueno o
              malo —bajar calorías puede ser lo correcto—: dice qué se retiró y
              qué se puso, que es lo que se busca al mirar atrás.
            */}
            {fila.changes.length > 0 && (
              <div className="col gap-1">
                {fila.changes.map((c) => (
                  <span className="row gap-2 wrap t-xs" key={c.key}>
                    <span className="t-secondary" style={{ minWidth: 92 }}>
                      {c.label}
                    </span>
                    <span className="diff-out">
                      {c.from}
                      {c.unit}
                    </span>
                    <ArrowRight size={11} style={{ color: 'var(--text-tertiary)' }} />
                    <span className="diff-in">
                      {c.to}
                      {c.unit}
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/*
              Y los cambios de estructura, que no son una cifra que sube o baja
              sino algo que entra o sale. Por eso se pintan con signo y no con
              flecha: «− Prensa» y «+ Hack» se leen de un vistazo, y «de Prensa a
              Hack» obligaría a inventar una correspondencia que no existe.
            */}
            {fila.structure.length > 0 && (
              <div className="col gap-1">
                {groupChanges(fila.structure).map((g) => (
                  <div className="col gap-1" key={g.sitio}>
                    <span className="row gap-2 wrap t-xs">
                      <span className="t-secondary" style={{ minWidth: 92, fontWeight: 600 }}>
                        {g.sitio}
                      </span>

                      {/*
                        Lo que entró y lo que salió, CONTADO y con hasta tres
                        nombres. Reprogramar una semana cambia treinta
                        ejercicios, y treinta líneas no son un resumen: son el
                        volcado que hay que leer entero para enterarse de que se
                        rehízo el día. El recuento se lee de un vistazo y los
                        nombres son el detalle.
                      */}
                      {g.removed.length > 0 && (
                        <span className="diff-out">
                          −{g.removed.length} {nombres(g.removed)}
                        </span>
                      )}
                      {g.added.length > 0 && (
                        <span className="diff-in">
                          +{g.added.length} {nombres(g.added)}
                        </span>
                      )}
                    </span>

                    {/*
                      Los cambios de cifra, uno por línea y SIN envolver.

                      Estaban en una fila con `wrap` y un hueco de 92 px delante,
                      así que en cuanto no cabían se partían en tres renglones y
                      «Hack Squat / 2 / 3 series» dejaba de leerse como una cosa.
                      Un solo `span` con el texto seguido no se puede romper mal.
                    */}
                    {g.changed.map((c) => (
                      <span className="t-xs" key={c.label} style={{ paddingLeft: 100 }}>
                        <span className="t-secondary">{c.label} </span>
                        <span className="diff-out">{c.from}</span>
                        <span className="t-tertiary"> → </span>
                        <span className="diff-in">
                          {c.to}
                          {c.unit}
                        </span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}

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
              <p className="t-xs t-secondary" style={{ whiteSpace: 'pre-wrap' }}>
                Él anotó: {fila.notes}
              </p>
            )}

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
                    <p className="t-sm grow" style={{ whiteSpace: 'pre-wrap', minWidth: 0 }}>
                      <MessageSquareQuote
                        size={12}
                        style={{ display: 'inline', verticalAlign: -1, marginRight: 5, color: 'var(--text-tertiary)' }}
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
        ))}
      </div>
    </Panel>
  );
};
