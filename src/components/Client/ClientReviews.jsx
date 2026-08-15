import { useEffect, useMemo, useState } from 'react';
import { Check, Video } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { parseVideoUrl } from '@/domain/video';
import { Panel, SectionTitle } from '@/components/ui/primitives';
import { VideoEmbed, VideoExternalLink } from '@/components/ui/VideoEmbed';

/**
 * Las revisiones que le ha grabado su entrenador.
 *
 * ══ Por qué esto vive aquí y no en WhatsApp ═════════════════════════════════
 *
 * El aviso sigue siendo de WhatsApp: ahí hay una persona, y decirle «te he dejado
 * la revisión» es parte del trato. Lo que WhatsApp hace mal es **guardarlo**: a
 * las dos semanas el enlace está enterrado bajo cien mensajes y la revisión, que
 * costó veinte minutos de grabar, no se vuelve a ver nunca.
 *
 * Aquí están todas, por fecha, y siguen estando dentro de un mes.
 *
 * ══ Dos orígenes, una sola lista ════════════════════════════════════════════
 *
 * Una revisión puede ser un vídeo grabado en la aplicación —guardado en el bucket
 * privado, y por tanto con URL firmada que caduca— o un enlace de YouTube oculto
 * o de Loom (migración 0040). Para quien la mira son lo mismo, así que se pintan
 * igual y en la misma lista; lo único que cambia es el reproductor.
 *
 * ── Las últimas seis ────────────────────────────────────────────────────────
 * Y no todas. Una lista sin fin de vídeos en el móvil es una pantalla que tarda
 * en cargar para enseñar algo que nadie va a bajar a buscar. Lo de más atrás se
 * consulta pidiéndoselo al entrenador, que es lo que se hacía igualmente.
 */
const CUANTAS = 6;

export const ClientReviews = ({ client }) => {
  const { listReviewLinks, signPaths, markReviewViewed } = useApp();
  const [links, setLinks] = useState([]);
  const [urls, setUrls] = useState(() => new Map());
  const [vistas, setVistas] = useState(() => new Set());

  const clientId = client?.id;

  useEffect(() => {
    if (!clientId) return undefined;
    let vivo = true;

    listReviewLinks(clientId).then(async (res) => {
      if (!vivo || !res.ok) return;
      /* Las revocadas no se enseñan: el entrenador las retiró a propósito, y una
         fila que no se puede abrir solo genera la pregunta de por qué. */
      const vivas = res.links.filter((l) => !l.revokedAt).slice(0, CUANTAS);
      setLinks(vivas);

      /* Las grabadas aquí hay que firmarlas; las de fuera no. Una sola llamada
         para todas las que la necesiten. */
      const rutas = vivas.map((l) => l.path).filter(Boolean);
      if (rutas.length > 0) {
        const mapa = await signPaths(rutas);
        if (vivo) setUrls(mapa);
      }
    });

    return () => {
      vivo = false;
    };
  }, [clientId, listReviewLinks, signPaths]);

  /* El vídeo de fuera, ya resuelto. Se calcula una vez y no en cada render: son
     expresiones regulares sobre una URL, y hay una por fila. */
  const videos = useMemo(
    () => new Map(links.map((l) => [l.id, l.externalUrl ? parseVideoUrl(l.externalUrl) : null])),
    [links]
  );

  if (links.length === 0) return null;

  /*
    «Visto» se marca al DARLE AL PLAY, no al aparecer en pantalla.

    Pasar por delante de una tarjeta no es haber visto una revisión de quince
    minutos, y contarlo como visita le daría al entrenador una señal falsa —que es
    peor que no darle ninguna—. Se marca una vez por sesión: volver a pulsar play
    para retomar el vídeo no son dos visitas.
  */
  const marcar = (id) => {
    if (vistas.has(id)) return;
    setVistas((previas) => new Set(previas).add(id));
    markReviewViewed(id);
  };

  return (
    <Panel className="col gap-4">
      <SectionTitle icon={Video} color="var(--data-rose)">
        Tus revisiones
      </SectionTitle>

      <div className="col gap-4">
        {links.map((link) => {
          const video = videos.get(link.id);
          const firmada = link.path ? urls.get(link.path) : null;
          const visto = vistas.has(link.id) || Boolean(link.firstViewedAt);

          return (
            <div className="col gap-2" key={link.id}>
              <div className="row between wrap gap-2">
                <span className="col" style={{ gap: 1, minWidth: 0 }}>
                  <span className="t-sm" style={{ fontWeight: 650 }}>
                    {link.title || (link.weekStart ? `Revisión del ${link.weekStart}` : 'Revisión')}
                  </span>
                  <span className="t-2xs t-tertiary">{fecha(link.createdAt)}</span>
                </span>

                {/* Que ya la has visto, dicho para ti — y contado para él, que es
                    la única señal que le llega de vuelta sin escribirse nada. */}
                {visto && (
                  <span className="badge badge-ok">
                    <Check size={11} /> Vista
                  </span>
                )}
              </div>

              {video ? (
                <>
                  <VideoEmbed video={video} title={link.title} onPlay={() => marcar(link.id)} />
                  <VideoExternalLink video={video} />
                </>
              ) : firmada ? (
                /* Grabada en la aplicación: reproductor del navegador con la URL
                   firmada. `preload="none"` para no descargar megas de vídeo por
                   entrar en la pantalla; `playsInline` porque en iPhone, sin eso,
                   el vídeo salta a pantalla completa al empezar. */
                <video
                  style={{
                    width: '100%',
                    borderRadius: 'var(--r-md)',
                    /* Hundido, no negro: un literal de color se salta el sistema
                       de tokens y sobre papel dejaba un rectángulo negro donde el
                       resto de la pantalla es blanco. */
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--edge)',
                  }}
                  src={firmada}
                  controls
                  preload="none"
                  playsInline
                  onPlay={() => marcar(link.id)}
                />
              ) : (
                <p className="t-xs t-tertiary">
                  Esta revisión no se puede abrir ahora mismo. Recarga la página; si sigue igual,
                  díselo a tu entrenador.
                </p>
              )}

              {link.notes && (
                <p className="t-sm t-secondary" style={{ whiteSpace: 'pre-wrap' }}>
                  {link.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

/** «12 mar» — sin hora: de una revisión importa el día, no el minuto. */
const fecha = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mismoAno = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: mismoAno ? undefined : 'numeric',
  });
};
