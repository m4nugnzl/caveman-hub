import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';

/**
 * Un vídeo de fuera, dentro de la aplicación.
 *
 * ══ Por qué el iframe NO se pinta hasta pulsar ══════════════════════════════
 *
 * Un reproductor de YouTube incrustado descarga medio mega de código —y planta
 * sus cookies— **antes de que nadie haya decidido ver nada**. En una pantalla con
 * tres revisiones son tres reproductores cargándose a la vez, en el móvil del
 * cliente y con sus datos, para que probablemente vea uno.
 *
 * Así que lo que se pinta de entrada es una fachada: un marco con el botón de
 * reproducir. Al pulsar, el iframe se monta con `autoplay` y el vídeo arranca
 * solo. Para quien lo ve, la diferencia es que ha pulsado el play que iba a
 * pulsar igualmente; para quien no, la diferencia es que no ha pagado nada.
 *
 * Es también lo que hace defendible incrustar en una aplicación que guarda el
 * peso y las fotos del cuerpo de una persona: sin reproducir, YouTube no se
 * entera de que esta página existe.
 *
 * ── El proporcional 16:9 ────────────────────────────────────────────────────
 * `aspect-ratio` en el contenedor y el iframe al 100 %: así el hueco lo reserva
 * el marco antes de cargar nada y la página no da un salto cuando el vídeo
 * aparece.
 */
export const VideoEmbed = ({ video, title, onPlay }) => {
  const [playing, setPlaying] = useState(false);

  if (!video) return null;

  const marco = {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: 'var(--r-md)',
    overflow: 'hidden',
    background: 'var(--surface-sunken)',
    border: '1px solid var(--edge)',
  };

  if (playing) {
    return (
      <div style={marco}>
        <iframe
          src={`${video.embedUrl}${video.embedUrl.includes('?') ? '&' : '?'}autoplay=1`}
          title={title || `Vídeo de ${video.label}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          /* `sandbox` no: los dos reproductores necesitan scripts y pantalla
             completa, y con la lista de permisos que haría falta no queda
             restricción real. Lo que acota de verdad es que la dirección solo
             puede ser de YouTube o Loom (`domain/video.js` y migración 0040). */
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return (
    <div style={marco}>
      <button
        type="button"
        onClick={() => {
          setPlaying(true);
          onPlay?.();
        }}
        aria-label={`Reproducir ${title || 'la revisión'} en ${video.label}`}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          color: 'var(--text-secondary)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-sm)',
            color: 'var(--text)',
          }}
        >
          <Play size={22} fill="currentColor" />
        </span>
        <span className="t-xs">Ver en {video.label}</span>
      </button>
    </div>
  );
};

/** El enlace de salida, para quien prefiera abrirlo en su aplicación. */
export const VideoExternalLink = ({ video }) =>
  video ? (
    <a
      className="row gap-1 t-xs link"
      href={video.watchUrl}
      target="_blank"
      rel="noreferrer noopener"
    >
      Abrir en {video.label} <ExternalLink size={11} />
    </a>
  ) : null;
