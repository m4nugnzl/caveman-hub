import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * UNA VENTANA QUE SE QUEDA MIENTRAS TRABAJAS.
 *
 * ══ Por qué la casa necesitaba un mueble más ═══════════════════════════════
 *
 * Había dos formas de enseñar algo encima de otra cosa y ninguna sirve aquí:
 *
 *   · **El visor** (`photos/Gallery`) toma la pantalla entera. Es lo correcto
 *     para mirar una foto y nada más, y lo contrario de lo que hace falta
 *     mientras se escribe: tapa justo la hoja que estabas escribiendo.
 *   · **`Modal size="side"`** entra por el canto derecho sin velo, que se acerca
 *     más… y sigue sin valer por tres cosas: le quita ancho a la hoja, atrapa el
 *     foco —así que no puedes seguir escribiendo en el programa— y se cierra al
 *     pulsar fuera, que es exactamente lo que haces al volver a la hoja.
 *
 * Lo que falta es la tercera forma: una ventana **no modal**. No hay velo, no
 * atrapa el foco, no bloquea el fondo y no se cierra sola. Se coloca donde no
 * estorbe —se arrastra por su barra, se estira por la esquina— y se queda ahí
 * mientras se hace otra cosa debajo. Es una ventana del escritorio de toda la
 * vida, y esa familiaridad es el diseño entero.
 *
 * ══ Se acuerda de dónde la dejaste ═════════════════════════════════════════
 *
 * Colocarla es trabajo, y un mueble que hay que recolocar cada vez que se abre
 * acaba sin usarse. La posición y el tamaño se guardan por `clave` en el
 * aparato —`localStorage`, mismo criterio que la barra plegada y el tema: el
 * mismo entrenador quiere una cosa en el monitor del despacho y otra en el
 * portátil—. No es un dato de la persona y no sube a su perfil.
 *
 * ══ Nunca se puede perder fuera de la pantalla ═════════════════════════════
 *
 * El fallo clásico de una ventana arrastrable: se lleva al borde, se cambia de
 * monitor o se encoge la ventana del navegador, y la próxima vez se abre en
 * coordenadas que ya no existen. Se sujeta al entrar, al arrastrar y cada vez
 * que cambia el tamaño de la ventana, dejando siempre visible la barra: con la
 * barra a la vista siempre se puede recuperar.
 *
 * ── Por debajo de los diálogos, por encima de todo lo demás ─────────────────
 * 150: pasa las cabeceras pegajosas (100) y se queda bajo `Modal` (200). Si
 * confirmas un borrado, el diálogo tiene que tapar esto y no al revés.
 *
 * @param titulo    Lo que se está mirando.
 * @param sub       El dato en voz baja de la barra: «Dorsal · 3 de 6».
 * @param clave     Dónde se recuerda su sitio. Una por uso, no por apertura.
 * @param acciones  Lo que va en la barra, a la izquierda de la equis.
 */

const MIN_ANCHO = 260;
const MIN_ALTO = 220;
/* Lo que se deja siempre a la vista al sujetarla: la barra completa por arriba
   y un buen trozo de su ancho por los lados. */
const ASOMO = 120;
const ALTO_ASA = 38;

const almacen = (clave) => `caveman-ventana-${clave}`;

const guardada = (clave) => {
  try {
    const crudo = JSON.parse(localStorage.getItem(almacen(clave)) || 'null');
    return crudo && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(crudo[k])) ? crudo : null;
  } catch {
    /* Un almacén bloqueado o con basura dentro no puede impedir que la ventana
       se abra: se cae al sitio por defecto, que es igual de válido. */
    return null;
  }
};

const guardar = (clave, caja) => {
  try {
    localStorage.setItem(almacen(clave), JSON.stringify(caja));
  } catch {
    /* Navegación privada con el almacén lleno. Se pierde la preferencia y ya:
       no hay nada que decirle a nadie por esto. */
  }
};

/** El sitio de la primera vez: a la derecha, alta y estrecha como una foto. */
const porDefecto = () => {
  const w = Math.min(420, Math.max(MIN_ANCHO, window.innerWidth * 0.28));
  const h = Math.min(560, Math.max(MIN_ALTO, window.innerHeight * 0.66));
  return { x: Math.max(8, window.innerWidth - w - 24), y: 96, w, h };
};

/** Dentro de la pantalla, siempre con la barra alcanzable. */
const sujetar = ({ x, y, w, h }) => {
  const ancho = Math.min(Math.max(w, MIN_ANCHO), window.innerWidth - 16);
  const alto = Math.min(Math.max(h, MIN_ALTO), window.innerHeight - 16);
  return {
    w: ancho,
    h: alto,
    x: Math.min(Math.max(x, ASOMO - ancho), window.innerWidth - ASOMO),
    y: Math.min(Math.max(y, 0), window.innerHeight - ALTO_ASA),
  };
};

export const VentanaFlotante = ({ titulo, sub, clave, onClose, acciones = null, children }) => {
  const [caja, setCaja] = useState(() => sujetar(guardada(clave) || porDefecto()));
  /* Qué gesto está en marcha: de dónde se agarró y con qué caja se empezó. Va en
     una `ref` porque cambia en cada fotograma del arrastre y no pinta nada por
     sí mismo — lo que pinta es `caja`. */
  const gesto = useRef(null);

  useEffect(() => {
    guardar(clave, caja);
  }, [clave, caja]);

  /* Si encoge la ventana del navegador, la flotante vuelve a la pantalla. */
  useEffect(() => {
    const alRedimensionar = () => setCaja((c) => sujetar(c));
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, []);

  const alMover = useCallback((event) => {
    const g = gesto.current;
    if (!g) return;
    const dx = event.clientX - g.desdeX;
    const dy = event.clientY - g.desdeY;

    setCaja(
      sujetar(
        g.que === 'mover'
          ? { ...g.caja, x: g.caja.x + dx, y: g.caja.y + dy }
          : { ...g.caja, w: g.caja.w + dx, h: g.caja.h + dy }
      )
    );
  }, []);

  /* Se desengancha el movimiento al soltar: dejarlo puesto haría que cada
     movimiento de ratón de la sesión llamara a una función para nada. */
  const alSoltar = useCallback(() => {
    gesto.current = null;
    window.removeEventListener('pointermove', alMover);
  }, [alMover]);

  /*
    Los escuchas van en la VENTANA y no en el elemento: arrastrando rápido el
    puntero se sale del asa —es una barra de 38 px— y con los escuchas en el
    elemento la ventana se quedaría clavada a media mudanza. Se ponen mientras
    dura el gesto y se quitan al soltar.
  */
  const agarrar = (que) => (event) => {
    /* Solo el botón principal: con el derecho se abre el menú del navegador y
       nunca llega el `pointerup`, así que la ventana se quedaría pegada. */
    if (event.button !== 0) return;
    event.preventDefault();
    gesto.current = { que, desdeX: event.clientX, desdeY: event.clientY, caja };

    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar, { once: true });
  };

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
    },
    [alMover, alSoltar]
  );

  const contenido = (
    /*
      `role="dialog"` SIN `aria-modal`: hay que decir que es una ventana con
      nombre, y hay que NO decir que el resto de la página está inerte, porque no
      lo está — se sigue escribiendo debajo. Poner `aria-modal` aquí haría que un
      lector de pantalla dejara de ver el programa, que es justo lo contrario.

      Escape cierra solo con el foco dentro: en la hoja, Escape ya es «deja este
      campo», y una ventana lateral no puede robar una tecla del trabajo.
    */
    <section
      className="vflota"
      role="dialog"
      aria-label={titulo}
      style={{ left: `${caja.x}px`, top: `${caja.y}px`, width: `${caja.w}px`, height: `${caja.h}px` }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      {/* El asa. Doble clic devuelve la ventana a su sitio de fábrica, que es la
          salida cuando uno la ha dejado en un sitio raro. */}
      <header className="vflota-asa" onPointerDown={agarrar('mover')} onDoubleClick={() => setCaja(porDefecto())}>
        <span className="vflota-tit">{titulo}</span>
        {sub && <span className="vflota-sub">{sub}</span>}

        {/* Los verbos NO arrastran: `stopPropagation` en su envoltorio, o pulsar
            la equis movería la ventana un par de píxeles antes de cerrarla. */}
        <div className="vflota-verbos" onPointerDown={(e) => e.stopPropagation()}>
          {acciones}
          <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Cerrar la ventana" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </header>

      <div className="vflota-cuerpo">{children}</div>

      {/* La esquina de estirar. `aria-hidden` y sin foco: no es una acción con
          nombre, es una superficie — quien no usa el ratón tiene el tamaño por
          defecto, que es un tamaño útil. */}
      <span className="vflota-esquina" aria-hidden="true" onPointerDown={agarrar('estirar')} />
    </section>
  );

  return typeof document === 'undefined' ? contenido : createPortal(contenido, document.body);
};
