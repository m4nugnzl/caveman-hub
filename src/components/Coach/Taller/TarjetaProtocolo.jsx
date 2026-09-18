import { BarChart3, Bell, CalendarRange, ChevronRight, ClipboardList, ContactRound } from 'lucide-react';

/**
 * UN PROTOCOLO, EN SU TARJETA (Figma 98:86, 18 sep).
 *
 * La cabecera dice cuál es y qué lleva; debajo, un renglón por momento —el
 * alta, el parte, el check-in y los avisos— con su «cuándo» y su «cuánto».
 * Se lee de un vistazo lo que le pasa a quien lo lleva, que es lo que la tabla
 * de antes no decía: contaba acciones, no las nombraba.
 *
 * La comparten la página de Protocolos (una por protocolo) y la pestaña
 * «Protocolo» de cada cliente (la suya). Lo que cambia entre las dos es qué
 * hace un renglón al pulsarlo, y eso lo decide quien la monta:
 *
 *   · `onMomento(id)` sin `cuerpo`: el renglón es una puerta (la página abre
 *     el protocolo).
 *   · con `cuerpo(id)`: el renglón se DESPLIEGA en su sitio y enseña su mando
 *     (la pestaña del cliente). Es la ley de los gestos: la caja se enciende,
 *     no se viaja a otra pantalla.
 *
 * El color de los discos dice de qué clase es el momento, con la rueda de
 * `data-tono` de siempre; que algo se pueda tocar lo sigue diciendo el acento.
 */

const MOMENTO = {
  alta: { icono: ContactRound, tono: 4 },
  parte: { icono: BarChart3, tono: 2 },
  checkin: { icono: CalendarRange, tono: 6 },
  avisos: { icono: Bell, tono: 0 },
};

/**
 * Los renglones «qué · cuándo · cuánto ›», sueltos.
 *
 * Existen aparte de la tarjeta porque la pestaña del cliente los usa también
 * para «Su app»: dos cajas con la misma gramática se leen como una página, y
 * una caja de renglones al lado de una de doce interruptores abiertos, no.
 */
export const Renglones = ({ items, abierto = null, onPulsar, cuerpo = null }) => (
  <ul className="proto-momentos">
    {items.map((m) => {
      const Icono = m.icono;
      const desplegado = cuerpo && abierto === m.id;
      return (
        <li className={`proto-momento${desplegado ? ' is-abierto' : ''}`} key={m.id}>
          <button
            type="button"
            className="proto-momento-linea"
            aria-expanded={cuerpo ? desplegado : undefined}
            onClick={() => onPulsar(m.id)}
          >
            <span className="f-disco es-baldosa" data-tono={m.tono} aria-hidden="true">
              <Icono size={15} />
            </span>
            <span className="proto-momento-rot">{m.rot}</span>
            <span className="proto-momento-cuando">{m.cuando}</span>
            <span className={`proto-momento-cuanto${m.apagado ? ' is-apagado' : ''}`}>
              {m.cuanto}
            </span>
            <ChevronRight size={15} className="proto-momento-punta" aria-hidden="true" />
          </button>
          {desplegado && <div className="proto-momento-cuerpo">{cuerpo(m.id)}</div>}
        </li>
      );
    })}
  </ul>
);

export const TarjetaProtocolo = ({
  nombre,
  servicios = [],
  cifras = null,
  momentos,
  activo = false,
  onNombre = null,
  onMomento,
  abierto = null,
  cuerpo = null,
}) => (
  <article className={`proto-tarjeta${activo ? ' is-activa' : ''}`}>
    <header className="proto-tarjeta-cab">
      <span className="proto-tarjeta-ico" aria-hidden="true">
        <ClipboardList size={20} />
      </span>
      <div className="proto-tarjeta-quien">
        {onNombre ? (
          <button type="button" className="proto-tarjeta-nombre" onClick={onNombre}>
            {nombre}
          </button>
        ) : (
          <h3 className="proto-tarjeta-nombre">{nombre}</h3>
        )}
        {servicios.length > 0 && (
          <span className="proto-tarjeta-chapas">
            {servicios.map((s) => (
              <span className="proto-chapa" key={s}>
                {s}
              </span>
            ))}
          </span>
        )}
      </div>
      {cifras && <div className="proto-tarjeta-cifras">{cifras}</div>}
    </header>

    <Renglones
      items={momentos.map((m) => ({ ...m, ...(MOMENTO[m.id] || MOMENTO.alta) }))}
      abierto={abierto}
      onPulsar={onMomento}
      cuerpo={cuerpo}
    />
  </article>
);
