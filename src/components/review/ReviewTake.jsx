import { useEffect, useRef, useState } from 'react';
import { Circle, Monitor, RotateCcw, Square } from 'lucide-react';

import { defaultCamera } from '@/domain/recorder';
import { estimatedMb, useReviewRecorder } from '@/lib/useReviewRecorder';
import { Notice, Switch } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';

const mmss = (total) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

/**
 * GRABAR LA EXPLICACIÓN, sin salir de la revisión.
 *
 * ══ Por qué esto y no el grabador del estudio ═══════════════════════════════
 *
 * El motor es EL MISMO —`lib/useReviewRecorder.js`, que mezcla la fuente y la
 * cámara en un lienzo y de ahí saca el `MediaRecorder`—. Lo que cambia es para
 * qué se abre, y eso cambia la pantalla entera:
 *
 *   · **En el estudio** es un banco de trabajo: graba el montaje de fotos, deja
 *     arrastrar la cámara por encima y elegir su forma, su tamaño y su anclaje,
 *     y debajo tiene la biblioteca de lo ya grabado con sus enlaces. Se entra a
 *     producir.
 *   · **Aquí** hay UNA cosa que hacer y dura tres minutos: contarle a esta
 *     persona por qué le cambias esto, recorriéndole la revisión que tienes
 *     delante. No hay montaje que grabar —ése vive en el estudio— ni biblioteca
 *     que consultar, y una rejilla de anclajes de cámara delante de alguien que
 *     va a hablar treinta segundos es un banco de trabajo pidiendo que lo
 *     configuren.
 *
 * Dos pantallas para dos momentos, un solo motor. Duplicar el motor sería el
 * error; duplicar los controles del banco de trabajo, también.
 *
 * ══ Y por eso graba LA PANTALLA con tu cara encima ══════════════════════════
 *
 * No es una limitación heredada, es lo que hace útil a este vídeo: lo que hay
 * que explicar está en la pantalla —sus fotos, su peso, el cambio de hidratos—
 * y una explicación que señala vale por diez líneas escritas. La cara va en una
 * esquina porque es quien habla, no el asunto.
 *
 * (El motor mezcla una fuente —el lienzo del montaje o la pantalla— con la
 * cámara ENCIMA; la cámara no es una fuente por sí sola. Aquí no hay lienzo, así
 * que la fuente es la pantalla y no hay nada que elegir: un selector de una sola
 * opción es un control que no decide nada.)
 *
 * ── El vídeo NO se sube al parar ────────────────────────────────────────────
 * Se queda en memoria y se lo lleva quien llama (`onReady`), porque quien decide
 * si esto se guarda es el botón de cerrar la semana. Subir el archivo al almacén
 * del entrenador y luego no cerrar dejaría un vídeo huérfano al que no llega
 * nadie y que sigue ocupando cuota todos los meses. Ver
 * `useCloseReview.closeWithRecording`.
 */
export const ReviewTake = ({ nombre, onReady, onClose }) => {
  const recorder = useReviewRecorder();
  const [conCamara, setConCamara] = useState(true);
  const [conMicro, setConMicro] = useState(true);
  const vistaRef = useRef(null);

  const { support, status, error, result, seconds, mixCanvas, prepare, record, stop, discard } =
    recorder;

  /*
    La vista previa copia el lienzo mezclador fotograma a fotograma.

    No se enseña el mezclador directamente porque tiene el tamaño de SALIDA
    —hasta 1600 px— y aquí hay que verlo escalado. Copiarlo a un lienzo del
    tamaño de la caja es más simple que meter el grande en el DOM y pelearse con
    el CSS para encogerlo. Es el mismo truco que usa el grabador del estudio, y
    tiene que serlo: lo que se ve mientras grabas ES lo que se graba, y dos
    formas de escalarlo serían dos encuadres distintos.
  */
  useEffect(() => {
    if (status !== 'preview' && status !== 'recording') return undefined;

    let frame;
    const tick = () => {
      const origen = mixCanvas?.current;
      const destino = vistaRef.current;
      if (origen && destino) {
        if (destino.width !== origen.width || destino.height !== origen.height) {
          destino.width = origen.width;
          destino.height = origen.height;
        }
        destino.getContext('2d')?.drawImage(origen, 0, 0);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, mixCanvas]);

  /* Grabando no se cierra por descuido: se para primero, y así el archivo queda
     entero por si se cerró sin querer. */
  const cerrar = () => {
    if (status === 'recording') stop();
    onClose();
  };

  const preparar = () =>
    prepare({
      source: 'screen',
      camera: { ...defaultCamera(), enabled: conCamara },
      withMic: conMicro,
    });

  const usar = () => {
    if (!result) return;
    onReady({ blob: result.blob, mimeType: result.mimeType, seconds: result.seconds });
    onClose();
  };

  return (
    <Modal
      size="lg"
      title={`Grabarle la revisión a ${nombre}`}
      onClose={cerrar}
      footer={
        status === 'ready' ? (
          <div className="row gap-2 wrap">
            <button type="button" className="btn btn-secondary" onClick={discard}>
              <RotateCcw size={15} /> Repetir
            </button>
            <button type="button" className="btn btn-primary" onClick={usar}>
              Usar esta grabación
            </button>
          </div>
        ) : null
      }
    >
      <div className="col gap-3">
        {/* Un navegador sin `MediaRecorder` no se arregla escondiendo el botón:
            se dice, y se ofrece el camino que sí funciona. */}
        {!support.recorder || !support.screen ? (
          <Notice tone="warn">
            Este navegador no puede grabar la pantalla. Grábalo con la herramienta que uses y pega
            el enlace en «Enlace».
          </Notice>
        ) : (
          <>
            {status === 'idle' && (
              <>
                <p className="t-sm t-secondary">
                  Comparte esta pantalla y recórrele la semana señalando lo que le cambias. Tres
                  minutos explicando valen por diez líneas escritas.
                </p>

                <Switch
                  checked={conCamara}
                  onChange={setConCamara}
                  label="Salir tú en una esquina"
                  hint="Tu cámara encima de la pantalla, abajo a la derecha."
                />
                <Switch
                  checked={conMicro}
                  onChange={setConMicro}
                  label="Grabar tu voz"
                  hint="Sin esto sale un vídeo mudo, que es la mitad de la explicación."
                />

                <button type="button" className="btn btn-primary" onClick={preparar}>
                  <Monitor size={15} /> Elegir qué compartir
                </button>
              </>
            )}

            {(status === 'preview' || status === 'recording') && (
              <>
                {/* Lo que se ve aquí es exactamente lo que se graba. */}
                <canvas ref={vistaRef} className="take-preview" />

                <div className="row between wrap gap-2">
                  <span className="t-xs t-tertiary">
                    {status === 'recording' ? (
                      <>
                        Grabando · <span className="tnum">{mmss(seconds)}</span>
                        {/* Lo que va a ocupar, MIENTRAS se graba: es la única
                            forma de que se entienda por qué una revisión de
                            veinte minutos va por enlace y no por aquí. */}
                        {' · '}~{estimatedMb(seconds)} MB
                      </>
                    ) : (
                      'Listo. Cuando le des, empieza a contar.'
                    )}
                  </span>

                  {status === 'preview' ? (
                    <button type="button" className="btn btn-primary" onClick={record}>
                      <Circle size={13} /> Empezar a grabar
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={stop}>
                      <Square size={13} /> Parar
                    </button>
                  )}
                </div>
              </>
            )}

            {status === 'ready' && result && (
              <>
                {/* Se ve antes de mandarla. Mandarle a alguien una explicación
                    que no has visto es la forma más rápida de mandarle treinta
                    segundos de silencio. */}
                <video className="take-preview" src={result.url} controls playsInline />
                <p className="t-xs t-tertiary">
                  <span className="tnum">{mmss(result.seconds)}</span> · ~
                  {estimatedMb(result.seconds)} MB. Se sube al cerrar la semana.
                </p>
              </>
            )}

            {error && <Notice tone="error">{error}</Notice>}
          </>
        )}
      </div>
    </Modal>
  );
};
