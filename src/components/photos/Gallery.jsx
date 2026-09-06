import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
 * ══ Va a `document.body`, y esto NO es un detalle de implementación ═════════
 *
 * Se declaraba donde se usa, así que en la revisión quedaba dentro de un bloque
 * que ya tiene su propio contexto de apilado (la cascada de entrada anima
 * `opacity`, y eso crea uno). Un `z-index: 300` dentro de un contexto ajeno no
 * compite con nada de fuera: la cabecera del cliente y la barra de cerrar la
 * semana se pintaban ENCIMA del visor, y lo que se veía era una foto atrapada
 * entre dos franjas de la aplicación, con el fondo de la página bloqueado. La
 * captura del entrenador que lo reportó es exactamente eso.
 *
 * Con el portal, la capa cuelga del `body` —igual que `ui/Modal`— y cubre lo que
 * tiene que cubrir. La regla, para quien venga: una capa modal se declara donde
 * tiene sentido leerla y se pinta en la raíz.
 *
 * @param items    En el orden en que se ven en la rejilla. El orden de la
 *   pantalla ES el del visor: pasar a «la siguiente» tiene que llevar a la que
 *   estaba al lado. Cada elemento es una foto —`{ id, url, caption }`— o un PAR
 *   —`{ id, caption, pair: [{ url, pie }, { url, pie }] }`—, ver abajo.
 * @param index    Cuál se está mirando.
 * @param onIndex  Moverse. Lo lleva quien abre, porque es quien conoce la lista.
 * @param controls Lo que se puede decidir sin cerrar: los chips de «comparar
 *   con» de la hoja de contactos. Va bajo el pie, y lo monta quien abre porque
 *   es quien sabe qué se está comparando.
 */
export const Gallery = ({ items = [], index = 0, onIndex, onClose, controls = null }) => {
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

  /* Un par se pide GRANDE igual que una suelta, pero cada mitad ocupa la mitad
     del ancho: pedir 1400 px para una foto que se va a pintar a 600 es bajar el
     doble de bytes por nada. */
  const par = Array.isArray(actual.pair) ? actual.pair.filter((f) => f?.url) : null;

  const contenido = (
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
        {par ? (
          <div className="visor-par">
            {par.map((foto) => (
              <figure className="visor-mitad" key={foto.url}>
                <Thumb key={foto.url} url={foto.url} alt={foto.pie || ''} width={900} />
                {foto.pie && <figcaption className="visor-pie">{foto.pie}</figcaption>}
              </figure>
            ))}
          </div>
        ) : (
          <Thumb key={actual.id ?? actual.url} url={actual.url} alt={actual.caption || ''} width={1400} />
        )}

        <figcaption className="visor-pie">
          <span>{actual.caption}</span>
          {total > 1 && (
            <span className="t-tertiary tnum">
              {index + 1} de {total}
            </span>
          )}

          {/* Lo que se decide sin cerrar, en su propio renglón. Va DENTRO del
              pie —y no como hermano suyo— porque un `figcaption` tiene que ser
              el primer o el último hijo de su `figure`, y dentro del marco
              porque fuera un clic en un chip caería en el fondo y cerraría. */}
          {controls && <div className="visor-controles">{controls}</div>}
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

  /* Sin documento no hay dónde portar: el build prerenderiza la portada con
     `renderToStaticMarkup` y ahí `createPortal` revienta. Es la misma guarda que
     `ui/Modal`, y en la portada no hay ningún visor abierto. */
  return typeof document === 'undefined' ? contenido : createPortal(contenido, document.body);
};
