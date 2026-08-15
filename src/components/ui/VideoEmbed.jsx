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
/**
 * ── Y por qué la fachada es una FILA y no un marco 16:9 ─────────────────────
 *
 * Porque un marco de 16:9 ocupa media pantalla de móvil, y en la lista de
 * revisiones de un cliente hay una por semana: cuatro rectángulos vacíos, cada
 * uno con su botón de play en medio, para ver como mucho el de arriba. La
 * pantalla se llenaba de huecos.
 *
 * Sin reproducir, un vídeo no es un vídeo: es un enlace con una miniatura que no
 * se puede cargar sin llamar a YouTube. Así que se dice como lo que es —una
 * línea que se puede pulsar— y el marco aparece cuando de verdad hay algo que
 * enseñar.
 *
 * ── El enlace de salida va DENTRO ───────────────────────────────────────────
 * Antes era un componente aparte que se pintaba debajo, así que la pantalla
 * quedaba con «Ver en YouTube» y justo debajo «Abrir en YouTube»: dos controles
 * seguidos que hacen casi lo mismo y que obligan a leer los dos para descubrir
 * en qué se diferencian. Ahora hay una acción principal —verlo aquí— y la
 * salida a la aplicación de YouTube es un icono al final de la misma fila.
 */
/**
 * El reproductor, sin disparador.
 *
 * Se saca aparte porque el BOTÓN de reproducir no puede ser el mismo en todas
 * partes: en el histórico de revisiones el vídeo es la fila entera, y en un
 * ejercicio de calentamiento es un detalle de un ejercicio que ya tiene su
 * nombre y su prescripción. Un mismo disparador para los dos acababa poniendo
 * «Ver la revisión en vídeo» encima de una movilidad de cadera.
 */
export const VideoPlayer = ({ video, title }) => {
  if (!video) return null;
  return (
    <div className="video-frame">
      <iframe
        src={`${video.embedUrl}${video.embedUrl.includes('?') ? '&' : '?'}autoplay=1`}
        title={title || `Vídeo de ${video.label}`}
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
};

export const VideoEmbed = ({ video, title, onPlay, label = 'Ver la revisión en vídeo' }) => {
  const [playing, setPlaying] = useState(false);

  if (!video) return null;

  if (!playing) {
    return (
      <div className="video-row">
        <button
          type="button"
          className="video-row-play"
          onClick={() => {
            setPlaying(true);
            onPlay?.();
          }}
        >
          <span className="mark" aria-hidden="true">
            <Play size={13} fill="currentColor" />
          </span>
          <span className="grow">{label}</span>
        </button>

        {/* La salida a su aplicación, sin repetir la acción principal. */}
        <a
          className="video-row-out"
          href={video.watchUrl}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Abrir en ${video.label}`}
          title={`Abrir en ${video.label}`}
        >
          <ExternalLink size={13} />
        </a>
      </div>
    );
  }

  return <VideoPlayer video={video} title={title} />;
};
