import { WEEKDAYS, kindMeta, weekdayIndex } from '@/domain/calendar';
import { Panel } from '@/components/ui/primitives';

/**
 * La semana, en tablero.
 *
 * ══ Qué cambia respecto de lo que había ═════════════════════════════════════
 *
 * Era la misma rejilla de siete columnas, y las tarjetas eran UNA línea: el
 * título y nada más. Con eso, la semana del entrenador —donde cada tarjeta es de
 * una persona distinta— no se podía leer: siete columnas de títulos sueltos sin
 * decir de quién.
 *
 * Ahora cada tarjeta tiene dos líneas y el orden es el que hace que se lea de un
 * vistazo:
 *
 *   1. **De quién o de qué**, arriba, en el color del tipo. Es lo que separa una
 *      tarjeta de la de al lado, así que va primero y lleva el color.
 *   2. **Qué es**, debajo, en tinta plena.
 *
 * La segunda línea es la que se lee despacio; la primera es la que se busca.
 * Invertirlas —el título arriba, la etiqueta debajo— obliga a leer las dos para
 * saber si esta tarjeta te interesa.
 *
 * ── Y el día vacío dice que está vacío ─────────────────────────────────────
 * Antes el hueco era un `+` que solo aparecía al pasar el ratón, o sea que en
 * táctil no existía y el día se veía sencillamente en blanco. Un día libre es
 * información —es donde cabe una cita— y por eso ahora se dibuja siempre.
 *
 * ── Por qué el componente no sabe de dónde salen las tarjetas ──────────────
 * `cardsFor` las pide por celda. Así el mismo tablero sirve para la semana de un
 * cliente —donde la línea de arriba es el tipo de evento— y para la agenda del
 * entrenador —donde es el nombre de la persona—, sin que el tablero tenga que
 * saber en cuál de las dos está.
 */

/**
 * @param cardsFor  (celda) → [{ id, kind, when, what, done }]
 *   `when` es la línea de arriba y `what` la de abajo. `kind` solo elige el
 *   color: los tipos los declara `domain/calendar`.
 */
export const WeekBoard = ({
  title,
  action,
  cells,
  cardsFor,
  onOpenDay,
  emptyLabel = 'Libre',
  labelFor,
}) => (
  <Panel title={title} action={action}>
    <div className="wk">
      {cells.map((cell) => {
        const cards = cardsFor(cell);

        return (
          <button
            type="button"
            key={cell.date}
            className={`wk-day${cell.isToday ? ' is-today' : ''}`}
            onClick={() => onOpenDay(cell.date)}
            aria-label={labelFor ? labelFor(cell, cards) : undefined}
          >
            <span className="wk-dow">
              {WEEKDAYS[weekdayIndex(cell.date)]} <b>{cell.day}</b>
            </span>

            <span className="wk-cards">
              {cards.map((card) => (
                <span
                  key={card.id}
                  className={`wk-card${card.done ? ' is-done' : ''}`}
                  style={{ borderColor: kindMeta(card.kind).color }}
                >
                  <span className="wk-card-when" style={{ color: kindMeta(card.kind).color }}>
                    {card.when}
                  </span>
                  <span className="wk-card-what">{card.what}</span>
                </span>
              ))}

              {cards.length === 0 && emptyLabel && (
                <span className="wk-add" aria-hidden="true">
                  {emptyLabel}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  </Panel>
);

/**
 * Qué significa cada color, en fila.
 *
 * Va en la cabecera del tablero y no debajo: es la clave para leer lo que hay
 * en pantalla, y una leyenda que aparece después de lo que explica llega tarde.
 */
export const KindLegend = ({ kinds }) => (
  <span className="cal-key" aria-hidden="true">
    {kinds.map((k) => (
      <span className="cal-key-item" key={k.id}>
        <span className="cal-dot" style={{ background: k.color }} />
        {k.label}
      </span>
    ))}
  </span>
);
