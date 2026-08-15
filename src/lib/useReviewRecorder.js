import { useCallback, useEffect, useRef, useState } from 'react';

import { cameraBox, cameraFit, outputSize, sourceFit } from '@/domain/recorder';

/**
 * Grabación de revisiones con cámara superpuesta, en el navegador y sin servidor.
 *
 * ── Por qué hace falta un compositor y no basta con grabar la pantalla ──────
 * Para que la cámara se VEA en el vídeo hay que mezclarla con la fuente antes de
 * grabar. No hay forma de superponer dos flujos en el propio `MediaRecorder`: solo
 * acepta un flujo de vídeo. Así que:
 *
 *   fuente (lienzo del montaje o pantalla)  ──┐
 *                                             ├─→ lienzo mezclador ─→ MediaRecorder
 *   cámara (getUserMedia)                   ──┘
 *
 * El lienzo mezclador se dibuja en cada fotograma y es TAMBIÉN la vista previa, así
 * que lo que se ve durante la grabación es exactamente lo que se graba. Sin eso,
 * la posición de la cámara sería una apuesta hasta ver el resultado.
 *
 * Ese diseño da gratis tres cosas que se pidieron: ver la cámara mientras grabas,
 * cambiar su forma y tamaño en caliente, y arrastrarla — porque cambiar los
 * parámetros solo cambia lo que dibuja el siguiente fotograma.
 *
 * ── Detalles que se aprenden porque fallan ──────────────────────────────────
 *  · El usuario puede cortar la compartición desde el aviso del navegador. Hay que
 *    escuchar el `ended` de la pista o la grabación se queda colgada.
 *  · Los códecs varían por navegador: se prueba una lista en vez de fijar uno y
 *    romper en Safari.
 *  · Todas las pistas hay que pararlas a mano, o la luz de la webcam se queda
 *    encendida después de terminar.
 *  · El bucle de dibujo tiene que seguir vivo mientras se ajusta la cámara SIN
 *    grabar: si no, la vista previa se congela y parece que se ha roto.
 */

const CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

const pickMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || null;
};

export const recorderSupport = () => {
  const recorder = typeof MediaRecorder !== 'undefined' && Boolean(pickMimeType());
  return {
    recorder,
    screen: recorder && Boolean(navigator.mediaDevices?.getDisplayMedia),
    camera: recorder && Boolean(navigator.mediaDevices?.getUserMedia),
    canvas:
      recorder &&
      typeof HTMLCanvasElement !== 'undefined' &&
      'captureStream' in HTMLCanvasElement.prototype,
  };
};

/** Vídeo oculto que sirve de fuente de dibujo para un flujo. */
const videoFor = (stream) => {
  const el = document.createElement('video');
  el.srcObject = stream;
  el.muted = true;
  el.playsInline = true;
  // `play()` puede rechazar si la pestaña está en segundo plano; no es fatal,
  // el bucle de dibujo simplemente no tendrá fotogramas hasta que vuelva.
  el.play().catch(() => {});
  return el;
};

/**
 * El presupuesto de datos de una grabación, en un solo sitio.
 *
 * `BYTES_PER_SECOND` no se mide: se deriva de los otros dos, porque es lo que el
 * codificador va a escribir. Sirve para enseñar el tamaño MIENTRAS se graba, que
 * es la única forma de que quien graba sepa lo que está gastando antes de
 * gastarlo — y de que se entienda por qué una revisión larga va por enlace.
 */
export const VIDEO_BPS = 900_000;
export const AUDIO_BPS = 96_000;
export const CAPTURE_FPS = 15;
const BYTES_PER_SECOND = (VIDEO_BPS + AUDIO_BPS) / 8;

/** Lo que ocupará una grabación de `seconds` segundos, en MB y redondeado. */
export const estimatedMb = (seconds) =>
  Math.round(((Number(seconds) || 0) * BYTES_PER_SECOND) / 1024 / 1024);

export function useReviewRecorder() {
  const [status, setStatus] = useState('idle'); // idle | preview | recording | ready | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [size, setSize] = useState({ width: 1280, height: 720 });

  /** Lienzo mezclador. Es la vista previa y la fuente de la grabación. */
  const mixRef = useRef(null);
  const cameraRef = useRef(null); // parámetros vivos, sin re-render por fotograma
  const sourceVideoRef = useRef(null);
  const camVideoRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const streamsRef = useRef([]);
  const rafRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef(null);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const releaseAll = useCallback(() => {
    stopLoop();
    for (const stream of streamsRef.current) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamsRef.current = [];
    sourceVideoRef.current = null;
    camVideoRef.current = null;
    sourceCanvasRef.current = null;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, [stopLoop]);

  useEffect(
    () => () => {
      try {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      } catch {
        // Ya estaba muerto; no hay nada que rescatar.
      }
      releaseAll();
    },
    [releaseAll]
  );

  /** Un fotograma: la fuente al fondo y la cámara encima, recortada a su forma. */
  const draw = useCallback(() => {
    const mix = mixRef.current;
    const ctx = mix?.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, mix.width, mix.height);

    // Fondo: o el lienzo del montaje, o el vídeo de la pantalla compartida.
    const sourceCanvas = sourceCanvasRef.current;
    const sourceVideo = sourceVideoRef.current;

    if (sourceCanvas) {
      const fit = sourceFit({
        videoWidth: sourceCanvas.width,
        videoHeight: sourceCanvas.height,
        width: mix.width,
        height: mix.height,
      });
      if (fit) ctx.drawImage(sourceCanvas, fit.dx, fit.dy, fit.drawW, fit.drawH);
    } else if (sourceVideo?.videoWidth) {
      const fit = sourceFit({
        videoWidth: sourceVideo.videoWidth,
        videoHeight: sourceVideo.videoHeight,
        width: mix.width,
        height: mix.height,
      });
      if (fit) ctx.drawImage(sourceVideo, fit.dx, fit.dy, fit.drawW, fit.drawH);
    }

    // Cámara encima.
    const camera = cameraRef.current;
    const cam = camVideoRef.current;
    if (camera?.enabled && cam?.videoWidth) {
      const box = cameraBox({ width: mix.width, height: mix.height, camera });
      const fit = cameraFit({ videoWidth: cam.videoWidth, videoHeight: cam.videoHeight, box });

      if (fit) {
        ctx.save();
        ctx.beginPath();
        // `roundRect` no está en todos los navegadores: con radio 0 el rectángulo
        // normal vale, y para el círculo hay `arc`.
        if (camera.shape === 'circle') {
          ctx.arc(box.x + box.size / 2, box.y + box.size / 2, box.size / 2, 0, Math.PI * 2);
        } else if (box.radius > 0 && ctx.roundRect) {
          ctx.roundRect(box.x, box.y, box.size, box.size, box.radius);
        } else {
          ctx.rect(box.x, box.y, box.size, box.size);
        }
        ctx.clip();

        if (camera.mirror) {
          // Espejo: la gente espera verse como en un espejo, no invertida.
          ctx.translate(box.x * 2 + box.size, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(cam, fit.dx, fit.dy, fit.drawW, fit.drawH);
        ctx.restore();

        // Borde: sobre un fondo claro, una cámara sin borde se funde con la
        // imagen y no se distingue dónde acaba.
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(2, Math.round(box.size * 0.02));
        ctx.beginPath();
        if (camera.shape === 'circle') {
          ctx.arc(box.x + box.size / 2, box.y + box.size / 2, box.size / 2, 0, Math.PI * 2);
        } else if (box.radius > 0 && ctx.roundRect) {
          ctx.roundRect(box.x, box.y, box.size, box.size, box.radius);
        } else {
          ctx.rect(box.x, box.y, box.size, box.size);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  /**
   * Prepara la mezcla y arranca la vista previa, SIN grabar.
   *
   * Separar preparar de grabar es lo que permite colocar la cámara antes de
   * empezar. Grabar y luego descubrir que tapaba la cintura del cliente obliga a
   * repetirlo todo.
   */
  const prepare = useCallback(
    async ({ source = 'canvas', canvas = null, camera, withMic = true, fps = 30 }) => {
      setError(null);
      setResult(null);
      setSeconds(0);
      releaseAll();
      cameraRef.current = camera;

      if (!pickMimeType()) {
        setError('Este navegador no puede grabar vídeo.');
        setStatus('error');
        return false;
      }

      try {
        let outSize;

        if (source === 'canvas') {
          if (!canvas) throw new Error('No hay montaje que grabar.');
          sourceCanvasRef.current = canvas;
          outSize = outputSize({ videoWidth: canvas.width, videoHeight: canvas.height });
        } else {
          const display = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: fps },
            audio: false,
          });
          streamsRef.current.push(display);
          sourceVideoRef.current = videoFor(display);

          const settings = display.getVideoTracks()[0]?.getSettings() || {};
          outSize = outputSize({
            videoWidth: settings.width || 1280,
            videoHeight: settings.height || 720,
          });

          display.getVideoTracks()[0]?.addEventListener('ended', () => {
            if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
            else {
              releaseAll();
              setStatus('idle');
            }
          });
        }

        if (camera.enabled) {
          try {
            const cam = await navigator.mediaDevices.getUserMedia({
              video: { width: 1280, height: 720, facingMode: 'user' },
              audio: false,
            });
            streamsRef.current.push(cam);
            camVideoRef.current = videoFor(cam);
          } catch {
            // Cámara denegada: se sigue sin ella. Mejor un vídeo sin cara que un
            // error después de haber preparado todo.
            cameraRef.current = { ...camera, enabled: false };
            setError('No se pudo abrir la cámara: la grabación irá sin ella.');
          }
        }

        if (withMic) {
          try {
            const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamsRef.current.push(mic);
          } catch {
            setError((prev) => prev || 'No se pudo usar el micrófono: la grabación irá sin voz.');
          }
        }

        // El lienzo mezclador se crea aquí, con el tamaño de salida definitivo.
        if (!mixRef.current) mixRef.current = document.createElement('canvas');
        mixRef.current.width = outSize.width;
        mixRef.current.height = outSize.height;
        setSize(outSize);

        stopLoop();
        rafRef.current = requestAnimationFrame(draw);
        setStatus('preview');
        return true;
      } catch (e) {
        releaseAll();
        const cancelled = e?.name === 'NotAllowedError';
        setError(cancelled ? null : e?.message || 'No se pudo preparar la grabación.');
        setStatus(cancelled ? 'idle' : 'error');
        return false;
      }
    },
    [draw, releaseAll, stopLoop]
  );

  const record = useCallback(() => {
    const mix = mixRef.current;
    const mimeType = pickMimeType();
    if (!mix || !mimeType) return false;

    /*
      ══ La calidad se FIJA, y esto no es una preferencia ═══════════════════

      Antes se creaba el `MediaRecorder` sin decir nada, así que el navegador
      elegía por su cuenta: entre 2,5 y 5 Mbps para un lienzo de 1600 px a 30
      fotogramas. Son unos 22 MB por minuto, y el bucket admite 80.

      Es decir: **la grabación reventaba a los tres o cuatro minutos**, y una
      revisión de verdad —quince o veinte— no llegaba a subirse nunca. El
      síntoma que llegaba era «no me deja guardar el vídeo», que suena a permiso
      y era aritmética.

      ── Por qué estos números y no otros ────────────────────────────────────
      Lo que se graba aquí es una pantalla quieta con una voz encima: una hoja
      de rutina, una gráfica, una cara en una esquina. Nada de eso se mueve.

        · 900 kbps de vídeo — suficiente para que se lea un número en una tabla.
          El resto del presupuesto en un vídeo así se gasta en codificar dos
          veces el mismo fotograma.
        · 96 kbps de audio — la voz es lo ÚNICO que no se puede escatimar: un
          vídeo pixelado se entiende y uno con la voz rota no.

      Salen unos 7,5 MB por minuto: veinte minutos entran en 150 MB… que sigue
      sin caber en 80. Por eso las revisiones largas van por enlace de YouTube o
      Loom (migración 0040) y el grabador se queda para lo corto, que es donde
      gana: tres minutos sin salir de la aplicación ni pegar nada.

      Los quince fotogramas los pone `captureStream`. Treinta era el doble de
      datos para un contenido que no se mueve.
    */
    const tracks = [...mix.captureStream(CAPTURE_FPS).getVideoTracks()];
    for (const stream of streamsRef.current) tracks.push(...stream.getAudioTracks());

    const recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType,
      videoBitsPerSecond: VIDEO_BPS,
      audioBitsPerSecond: AUDIO_BPS,
    });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      releaseAll();
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        mimeType,
        seconds: Math.round((Date.now() - startedAtRef.current) / 1000),
      });
      setStatus('ready');
    };

    // Trozos de un segundo: un cierre brusco pierde un segundo, no la grabación.
    recorder.start(1000);
    startedAtRef.current = Date.now();
    tickRef.current = setInterval(
      () => setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000)),
      500
    );
    setStatus('recording');
    return true;
  }, [releaseAll]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    releaseAll();
    setStatus('idle');
    setError(null);
  }, [releaseAll]);

  const discard = useCallback(() => {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setStatus('idle');
    setSeconds(0);
    setError(null);
  }, [result]);

  /** Actualiza la cámara en caliente: el siguiente fotograma ya la dibuja así. */
  const setCamera = useCallback((camera) => {
    cameraRef.current = camera;
  }, []);

  return {
    status,
    error,
    result,
    seconds,
    size,
    mixCanvas: mixRef,
    prepare,
    record,
    stop,
    cancel,
    discard,
    setCamera,
    support: recorderSupport(),
  };
}
