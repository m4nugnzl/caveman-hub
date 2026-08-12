import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Circle,
  Copy,
  Download,
  ExternalLink,
  Link2Off,
  Mic,
  MicOff,
  Monitor,
  Share2,
  Square,
  Trash2,
  Video,
  VideoOff,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { useReviewRecorder } from '@/lib/useReviewRecorder';
import {
  CAMERA_ANCHORS,
  CAMERA_SHAPES,
  CAMERA_SIZES,
  anchorPosition,
  cameraBox,
  defaultCamera,
  hitsCamera,
} from '@/domain/recorder';
import { todayISO, weekStart } from '@/lib/dates';
import { Notice, Panel, SectionTitle } from '@/components/ui/primitives';

const mmss = (total) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
const megabytes = (bytes) => (bytes == null ? '' : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/**
 * Grabar la revisión y mandársela al cliente.
 *
 * ── Cómo está pensada la pantalla ───────────────────────────────────────────
 * Tres estados y en cada uno solo se ve lo que toca, porque antes estaba todo a la
 * vez —opciones, botones y lista de vídeos— y no se sabía por dónde empezar:
 *
 *   1. **Elegir** qué se graba (el montaje o la pantalla).
 *   2. **Colocar**: vista previa EN VIVO de la mezcla, con la cámara arrastrable.
 *      Este paso es el que faltaba: sin él, colocabas la cámara a ciegas y
 *      descubrías que tapaba la cintura del cliente al ver el vídeo terminado.
 *   3. **Grabar** y revisar antes de subir.
 *
 * La vista previa es el MISMO lienzo que se graba, así que lo que ves es
 * literalmente lo que se guarda: no hay dos rutas de dibujo que puedan divergir.
 */
export const ReviewRecorder = ({ client, canvasRef }) => {
  const { uploadReview, listReviews, deleteReview, createReviewLink, listReviewLinks, revokeReviewLink } = useApp();
  const recorder = useReviewRecorder();

  const [camera, setCameraState] = useState(defaultCamera);
  const [withMic, setWithMic] = useState(true);
  const [source, setSource] = useState('canvas');
  const [reviews, setReviews] = useState([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [copied, setCopied] = useState(null);
  const [links, setLinks] = useState([]);

  const previewRef = useRef(null);
  const dragRef = useRef(false);

  /** Un solo sitio donde cambia la cámara: el estado y el compositor a la vez. */
  const updateCamera = useCallback(
    (patch) => {
      setCameraState((prev) => {
        const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
        recorder.setCamera(next);
        return next;
      });
    },
    [recorder]
  );

  const refresh = useCallback(async () => {
    const [files, shared] = await Promise.all([listReviews(client.id), listReviewLinks(client.id)]);
    setReviews(files.reviews);
    setLinks(shared.links || []);
  }, [client.id, listReviews, listReviewLinks]);

  /** Enlace permanente de un archivo, si ya se creó. */
  const linkFor = (path) => links.find((link) => link.path === path && !link.revokedAt) || null;

  useEffect(() => {
    refresh();
  }, [refresh]);

  /*
    La vista previa refleja el lienzo mezclador copiándolo en cada fotograma.
    ------------------------------------------------------------------------
    No se muestra el mezclador directamente porque tiene el tamaño de salida
    (hasta 1600 px) y hay que enseñarlo escalado; copiarlo a un lienzo visible del
    tamaño de la caja es más simple que meterlo en el DOM y pelearse con el CSS.
  */
  useEffect(() => {
    if (recorder.status !== 'preview' && recorder.status !== 'recording') return undefined;

    let frame;
    const tick = () => {
      const source = recorder.mixCanvas.current;
      const target = previewRef.current;
      if (source && target) {
        if (target.width !== source.width || target.height !== source.height) {
          target.width = source.width;
          target.height = source.height;
        }
        target.getContext('2d')?.drawImage(source, 0, 0);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [recorder.status, recorder.mixCanvas]);

  /** Arrastrar la cámara sobre la vista previa. */
  const pointToCanvas = (event) => {
    const el = previewRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * el.width,
      y: ((event.clientY - rect.top) / rect.height) * el.height,
      width: el.width,
      height: el.height,
    };
  };

  const onPointerDown = (event) => {
    if (!camera.enabled) return;
    const point = pointToCanvas(event);
    if (!point) return;
    const box = cameraBox({ width: point.width, height: point.height, camera });
    if (!hitsCamera({ x: point.x, y: point.y, box })) return;
    dragRef.current = true;
    previewRef.current?.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragRef.current) return;
    const point = pointToCanvas(event);
    if (!point) return;
    // Se guarda en fracciones: la posición elegida aquí vale igual a resolución
    // completa, aunque la vista previa esté escalada.
    updateCamera({ x: point.x / point.width, y: point.y / point.height });
  };

  const onPointerUp = (event) => {
    dragRef.current = false;
    previewRef.current?.releasePointerCapture?.(event.pointerId);
  };

  const prepare = async (which) => {
    setSource(which);
    setFeedback(null);
    await recorder.prepare({
      source: which,
      canvas: canvasRef?.current,
      camera,
      withMic,
    });
  };

  const save = async () => {
    if (!recorder.result) return;
    setBusy(true);
    setFeedback(null);
    const result = await uploadReview({
      clientId: client.id,
      blob: recorder.result.blob,
      mimeType: recorder.result.mimeType,
      label: `revision-${client.name}`,
    });
    setBusy(false);

    if (!result.ok) {
      setFeedback({ tone: 'error', text: result.error });
      return;
    }
    recorder.discard();
    await refresh();
    setFeedback({ tone: 'success', text: 'Vídeo guardado. Copia el enlace y mándaselo.' });
  };

  const copy = async (url, path) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(path);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setFeedback({ tone: 'warn', text: 'No se pudo copiar. Abre el vídeo y copia la URL a mano.' });
    }
  };

  if (!recorder.support.recorder) {
    return (
      <Panel tight>
        <p className="t-sm t-secondary">
          Este navegador no puede grabar vídeo. Prueba en Chrome, Edge o Firefox actualizados.
        </p>
      </Panel>
    );
  }

  const live = recorder.status === 'preview' || recorder.status === 'recording';

  return (
    <Panel className="col gap-4">
      <div className="row between wrap gap-2">
        <SectionTitle icon={Video} color="var(--data-rose)">
          Grabar la revisión
        </SectionTitle>
        {recorder.status === 'recording' && (
          <span className="rec-live">
            <Circle size={10} /> {mmss(recorder.seconds)}
          </span>
        )}
      </div>

      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
      {recorder.error && <Notice tone="warn">{recorder.error}</Notice>}

      {/* ── 1. Elegir la fuente ───────────────────────────────────────────── */}
      {recorder.status === 'idle' && (
        <>
          <div className="rec-choice">
            <button
              type="button"
              className="rec-option"
              disabled={!recorder.support.canvas}
              onClick={() => prepare('canvas')}
            >
              <Video size={22} />
              <strong>Solo el montaje</strong>
              <span>
                Graba el lienzo y nada más. Sin permisos y sin riesgo de que salga otra pestaña o la
                ficha de otro cliente.
              </span>
            </button>

            <button
              type="button"
              className="rec-option"
              disabled={!recorder.support.screen}
              onClick={() => prepare('screen')}
            >
              <Monitor size={22} />
              <strong>Pantalla</strong>
              <span>
                Te deja moverte por la aplicación mientras hablas. Pide permiso y graba todo lo que
                se vea.
              </span>
            </button>
          </div>

          <div className="rail-wrap">
            <button
              type="button"
              className="chip"
              aria-pressed={camera.enabled}
              onClick={() => updateCamera({ enabled: !camera.enabled })}
            >
              {camera.enabled ? <Video size={13} /> : <VideoOff size={13} />} Cámara
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={withMic}
              onClick={() => setWithMic((v) => !v)}
            >
              {withMic ? <Mic size={13} /> : <MicOff size={13} />} Micrófono
            </button>
          </div>
        </>
      )}

      {/* ── 2 y 3. Colocar y grabar ───────────────────────────────────────── */}
      {live && (
        <>
          <div className={`rec-stage${camera.enabled ? ' is-draggable' : ''}`}>
            <canvas
              ref={previewRef}
              className="rec-canvas"
              style={{ aspectRatio: `${recorder.size.width} / ${recorder.size.height}` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              role="img"
              aria-label="Vista previa de la grabación"
            />
            {camera.enabled && recorder.status === 'preview' && (
              <span className="rec-hint">Arrastra la cámara para colocarla</span>
            )}
          </div>

          {/* Los ajustes siguen disponibles GRABANDO: cambiar la forma o mover la
              cámara a mitad de la explicación es normal, y bloquearlo obligaría a
              parar y repetir. */}
          <div className="col gap-3">
            <div className="rail-wrap">
              <button
                type="button"
                className="chip"
                aria-pressed={camera.enabled}
                onClick={() => updateCamera({ enabled: !camera.enabled })}
              >
                {camera.enabled ? <Video size={13} /> : <VideoOff size={13} />}
                {camera.enabled ? 'Cámara activa' : 'Sin cámara'}
              </button>
            </div>

            {camera.enabled && (
              <div className="rec-controls">
                <div className="col gap-2">
                  <span className="section-label">Forma</span>
                  <div className="rail-wrap">
                    {CAMERA_SHAPES.map((shape) => (
                      <button
                        key={shape.id}
                        type="button"
                        className="chip"
                        aria-pressed={camera.shape === shape.id}
                        onClick={() => updateCamera({ shape: shape.id })}
                      >
                        {shape.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="col gap-2">
                  <span className="section-label">Tamaño</span>
                  <div className="rail-wrap">
                    {CAMERA_SIZES.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="chip"
                        aria-pressed={Math.abs(camera.size - option.value) < 0.01}
                        onClick={() => updateCamera({ size: option.value })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="col gap-2">
                  <span className="section-label">Esquina</span>
                  <div className="rail-wrap">
                    {CAMERA_ANCHORS.map((anchor) => (
                      <button
                        key={anchor.id}
                        type="button"
                        className="chip"
                        onClick={() => updateCamera(anchorPosition(anchor.id, camera.size))}
                      >
                        {anchor.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={camera.mirror}
                      onClick={() => updateCamera({ mirror: !camera.mirror })}
                      title="Verte como en un espejo, que es lo natural al hablar a cámara"
                    >
                      Espejo
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="row wrap gap-2">
            {recorder.status === 'preview' ? (
              <>
                <button type="button" className="btn btn-primary" onClick={recorder.record}>
                  <Circle size={14} /> Empezar a grabar
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={recorder.cancel}>
                  Cancelar
                </button>
                <span className="t-xs t-tertiary" style={{ alignSelf: 'center' }}>
                  {source === 'canvas' ? 'Grabando el montaje' : 'Grabando la pantalla'} ·{' '}
                  {recorder.size.width}×{recorder.size.height}
                </span>
              </>
            ) : (
              <button type="button" className="btn btn-danger" onClick={recorder.stop}>
                <Square size={14} /> Parar
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Resultado ─────────────────────────────────────────────────────── */}
      {recorder.status === 'ready' && recorder.result && (
        <div className="col gap-3">
          {/* Se ve antes de subir: un vídeo de dos minutos con un fallo al
              principio no se manda, se vuelve a grabar. */}
          <video src={recorder.result.url} controls className="rec-canvas" />
          <div className="row wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
              {busy ? 'Subiendo…' : `Guardar (${mmss(recorder.result.seconds)})`}
            </button>
            <a
              className="btn btn-secondary btn-sm"
              href={recorder.result.url}
              download={`revision-${client.name}.${recorder.result.mimeType.includes('mp4') ? 'mp4' : 'webm'}`}
            >
              <Download size={14} /> Descargar
            </a>
            <button type="button" className="btn btn-secondary btn-sm" onClick={recorder.discard}>
              Descartar y repetir
            </button>
          </div>
        </div>
      )}

      {/* ── Los vídeos ya guardados ───────────────────────────────────────── */}
      {reviews.length > 0 && recorder.status === 'idle' && (
        <>
          <hr className="divider" />
          <span className="section-label">Vídeos de {client.name}</span>

          <div className="list">
            {reviews.map((review) => (
              <div className="list-row" key={review.path}>
                <span className="list-row-label">
                  <span className="title">
                    {review.createdAt
                      ? new Date(review.createdAt).toLocaleString('es-ES')
                      : review.name}
                  </span>
                  <span className="sub">
                    {megabytes(review.size)}
                    {/* Lo que de verdad quiere saber el entrenador: si lo ha visto. */}
                    {(() => {
                      const link = linkFor(review.path);
                      if (!link) return ' · sin compartir';
                      if (link.viewCount === 0) return ' · compartido, sin ver';
                      return ` · visto ${link.viewCount} ${link.viewCount === 1 ? 'vez' : 'veces'}`;
                    })()}
                  </span>
                </span>

                {/*
                  Compartir crea un enlace PERMANENTE, no una URL firmada.
                  ----------------------------------------------------------------
                  La URL firmada caduca a los 7 días, así que el cliente que vuelve
                  en marzo a la revisión de enero se encuentra un enlace muerto — y
                  volver a verla es justo lo que hace útil el vídeo. El enlace
                  permanente apunta a una página que firma el archivo al abrirlo, y
                  además se puede revocar.
                */}
                {linkFor(review.path) ? (
                  <>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => copy(linkFor(review.path).url, review.path)}
                    >
                      <Copy size={12} /> {copied === review.path ? 'Copiado' : 'Copiar enlace'}
                    </button>
                    <a
                      className="chip"
                      href={linkFor(review.path).url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <ExternalLink size={12} /> Abrir
                    </a>
                    <button
                      type="button"
                      className="chip"
                      title="El enlace deja de funcionar. Se conserva que existió y sus visitas."
                      onClick={async () => {
                        const outcome = await revokeReviewLink(linkFor(review.path).id);
                        if (outcome.ok) refresh();
                        else setFeedback({ tone: 'error', text: outcome.error });
                      }}
                    >
                      <Link2Off size={12} /> Revocar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="chip"
                    onClick={async () => {
                      const outcome = await createReviewLink({
                        clientId: client.id,
                        path: review.path,
                        title: `Revisión de ${client.name}`,
                        weekStart: weekStart(todayISO()),
                      });
                      if (!outcome.ok) {
                        setFeedback({ tone: 'error', text: outcome.error });
                        return;
                      }
                      await refresh();
                      copy(outcome.url, review.path);
                    }}
                  >
                    <Share2 size={12} /> Crear enlace
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-icon btn-icon-danger"
                  onClick={async () => {
                    const result = await deleteReview(review.path);
                    if (result.ok) refresh();
                    else setFeedback({ tone: 'error', text: result.error });
                  }}
                  aria-label="Borrar este vídeo"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <p className="t-xs t-tertiary">
            El enlace que se copia NO caduca: apunta a una página que firma el vídeo al abrirse, así
            que el archivo sigue privado. Si se reenvía a quien no debía, se revoca y deja de servir.
          </p>
        </>
      )}
    </Panel>
  );
};
