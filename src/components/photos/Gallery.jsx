import { useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Thumb } from './Thumb';

/**
 * EL VISOR: una foto a pantalla completa, y las de al lado a un gesto.
 *
 * ══ Qué problema resuelve ══════════════════════════════════════════════════
 *
 * Las fotos del gimnasio se veían en una rejilla de miniaturas de 160 px y no se
 * podían abrir. Y son fotos que existen para MIRARSE de cerca: la pregunta que
 * contestan es «¿la prensa es de placas o de discos?, ¿el remo lleva pecho
 * apoyado?», y a ese tamaño no se contesta ninguna de las dos. Había que abrir
 * la carpeta de Drive en otra pestaña, que es exactamente lo que esta pantalla
 * existía para no tener que hacer.
 *
 * ══ Se comporta como la galería de un móvil, y esa es toda la intención ═════
 *
 * Nadie tiene que aprender esto. Se toca una foto y se abre; se pasa a la
 * siguiente con la flecha, con el dedo o con el teclado; se cierra con Escape, con
 * la X o tocando fuera. Son los cuatro gestos que ya sabe cualquiera, y por eso
 * el visor no enseña ni un solo botón que explique cómo se usa.
 *
 * ── Y recorre el ÁLBUM entero, no su carpeta ────────────────────────────────
 * Se abre una foto de «Pecho» y se sigue pasando hasta «Espalda», como en el
 * carrete del teléfono. Cortar en el grupo obligaría a cerrar y volver a abrir
 * doce veces para recorrer un gimnasio, que es justo lo que se hace la primera
 * vez que llegan las fotos de alguien.
 *
 * ── Da la vuelta por los extremos ───────────────────────────────────────────
 * De la última a la primera. Una galería que se queda muerta al final obliga a
 * recordar por dónde ibas; dando la vuelta, seguir pasando siempre hace algo.
 *
 * @param items    `[{ id, url, caption }]`, en el orden en que se ven en la
 *                 rejilla. El orden de la pantalla ES el del visor: pasar a «la
 *                 siguiente» tiene que llevar a la que estaba al lado.
 * @param index    Cuál se está mirando.
 * @param onIndex  Moverse. Lo lleva quien abre, porque es quien conoce la lista.
 */
export const Gallery = ({ items = [], index = 0, onIndex, onClose }) => {
  const total = items.length;
  const actual = items[index];
  const tactoRef = useRef(null);

  const mover = useCallback(
    (paso) => {
      if (total === 0) return;
      onIndex((index + paso + total) % total);
    },
    [index, onIndex, total]
  );

  /*
    El teclado, que es la mitad de por qué esto se siente como una galería: con
    el visor abierto, las flechas pasan fotos y no desplazan la página de detrás.

    `capture` no hace falta —no hay nada más escuchando— pero sí `preventDefault`
    en las flechas: sin él, la página de debajo se desplaza mientras se pasan
    fotos y al cerrar apareces en otro sitio.
  */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        mover(e.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKey);

    /* Y la página de detrás no se desplaza mientras esto está abierto: es la
       misma regla que el diálogo, y sin ella cerrar el visor te deja a mitad de
       una pantalla que no habías movido tú. */
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previo;
    };
  }, [mover, onClose]);

  if (!actual) return null;

  /*
    El dedo. Cincuenta píxeles de umbral: menos que eso es un toque tembloroso y
    pasaría fotos sin querer al intentar cerrar.
  */
  const alSoltar = (e) => {
    const desde = tactoRef.current;
    tactoRef.current = null;
    if (desde === null) return;
    const recorrido = e.clientX - desde;
    if (Math.abs(recorrido) > 50) mover(recorrido < 0 ? 1 : -1);
  };

  return (
    /*
      El fondo cierra, la foto no: `stopPropagation` en el marco. Sin eso, pasar
      una foto tocando cerca del borde cerraría el visor.

      `role="dialog"` con su nombre, y el foco al propio contenedor: es una capa
      modal, y sin esto un lector de pantalla seguiría leyendo la ficha de detrás.
    */
    <div
      className="visor"
      role="dialog"
      aria-modal="true"
      aria-label={actual.caption || 'Foto'}
      onClick={onClose}
    >
      <button type="button" className="visor-cerrar" aria-label="Cerrar" onClick={onClose}>
        <X size={20} />
      </button>

      {total > 1 && (
        <button
          type="button"
          className="visor-paso is-prev"
          aria-label="Anterior"
          onClick={(e) => {
            e.stopPropagation();
            mover(-1);
          }}
        >
          <ChevronLeft size={22} />
        </button>
      )}

      <figure
        className="visor-marco"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          tactoRef.current = e.clientX;
        }}
        onPointerUp={alSoltar}
      >
        {/*
          `key` sobre la foto: sin él React reutiliza el mismo `<img>` y el
          navegador deja la anterior en pantalla hasta que la nueva termina de
          bajar, así que pasar fotos parecía no hacer nada durante un segundo.

          Y se pide GRANDE (1400 px) porque el visor existe justo para eso; la
          miniatura de la rejilla mide 320 y aquí se vería reventada.
        */}
        <Thumb key={actual.id ?? actual.url} url={actual.url} alt={actual.caption || ''} width={1400} />

        <figcaption className="visor-pie">
          <span>{actual.caption}</span>
          {total > 1 && (
            <span className="t-tertiary tnum">
              {index + 1} de {total}
            </span>
          )}
        </figcaption>
      </figure>

      {total > 1 && (
        <button
          type="button"
          className="visor-paso is-next"
          aria-label="Siguiente"
          onClick={(e) => {
            e.stopPropagation();
            mover(1);
          }}
        >
          <ChevronRight size={22} />
        </button>
      )}
    </div>
  );
};
