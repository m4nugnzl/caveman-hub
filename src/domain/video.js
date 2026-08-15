/**
 * Vídeo de fuera: YouTube y Loom.
 *
 * ══ Por qué solo estos dos ══════════════════════════════════════════════════
 *
 * Porque lo que se genera aquí acaba en el `src` de un `<iframe>`, y un iframe
 * ejecuta lo que haya al otro lado dentro de la página del cliente. Aceptar
 * «cualquier dirección de vídeo» sería dejar que quien pueda escribir en un
 * cliente le incruste lo que quiera en la pantalla donde están sus datos.
 *
 * Dos, y son los dos que usa la gente: YouTube para el vídeo que se queda, Loom
 * para la grabación rápida de pantalla. La misma comprobación está repetida en la
 * base de datos (`create_review_url`, migración 0040), y eso no es duplicar por
 * descuido: esto da el mensaje de error mientras se escribe, y aquello impide
 * que entre nada raro llamando a la API directamente.
 *
 * ══ Y por qué no se incrusta de golpe ══════════════════════════════════════
 *
 * `embedUrl` no se pone en el iframe al cargar la pantalla, sino al pulsar el
 * botón de reproducir (ver `VideoEmbed`). Un iframe de YouTube trae medio mega de
 * código y sus cookies ANTES de que nadie haya decidido ver nada; con tres
 * revisiones en la lista son tres. Cargándolo al pulsar, quien no ve el vídeo no
 * paga nada — ni en datos ni en rastreo.
 *
 * `youtube-nocookie.com` por lo mismo: es el dominio que YouTube ofrece para no
 * escribir cookies de seguimiento hasta que se reproduce. No lo arregla del todo,
 * pero es lo que hay sin renunciar a incrustar.
 */

const YOUTUBE_ID = /^[\w-]{11}$/;

/** El identificador de un vídeo de YouTube, venga en la forma que venga. */
const youtubeId = (url) => {
  // youtu.be/<id>
  if (/(^|\.)youtu\.be$/i.test(url.hostname)) {
    const id = url.pathname.slice(1).split('/')[0];
    return YOUTUBE_ID.test(id) ? id : null;
  }
  if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return null;

  // youtube.com/watch?v=<id>
  const v = url.searchParams.get('v');
  if (v && YOUTUBE_ID.test(v)) return v;

  // youtube.com/embed/<id>, /live/<id>, /shorts/<id>
  const partes = url.pathname.split('/').filter(Boolean);
  if (partes.length >= 2 && ['embed', 'live', 'shorts', 'v'].includes(partes[0])) {
    return YOUTUBE_ID.test(partes[1]) ? partes[1] : null;
  }
  return null;
};

/** El identificador de un vídeo de Loom: /share/<hex> o /embed/<hex>. */
const loomId = (url) => {
  if (!/(^|\.)loom\.com$/i.test(url.hostname)) return null;
  const partes = url.pathname.split('/').filter(Boolean);
  const idx = partes.findIndex((p) => p === 'share' || p === 'embed');
  const id = idx >= 0 ? partes[idx + 1] : null;
  return id && /^[0-9a-f]{16,}$/i.test(id) ? id : null;
};

/**
 * Qué hay al otro lado de una dirección.
 *
 * Devuelve `null` si no es ninguno de los dos sitios admitidos, y ese `null` es
 * lo que usa la interfaz para decir por qué no vale antes de guardar nada.
 */
export const parseVideoUrl = (raw) => {
  const texto = String(raw || '').trim();
  if (!texto) return null;

  let url;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  // Solo https: un iframe en http dentro de una página https no carga, así que
  // aceptarlo sería guardar algo que no se va a poder ver.
  if (url.protocol !== 'https:') return null;

  const yt = youtubeId(url);
  if (yt) {
    return {
      provider: 'youtube',
      label: 'YouTube',
      id: yt,
      watchUrl: `https://www.youtube.com/watch?v=${yt}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1`,
    };
  }

  const loom = loomId(url);
  if (loom) {
    return {
      provider: 'loom',
      label: 'Loom',
      id: loom,
      watchUrl: `https://www.loom.com/share/${loom}`,
      embedUrl: `https://www.loom.com/embed/${loom}`,
    };
  }

  return null;
};

/** Para el formulario: qué decirle a quien acaba de pegar algo que no vale. */
export const VIDEO_URL_HINT = 'Pega el enlace de un vídeo de YouTube (puede ser oculto) o de Loom.';
