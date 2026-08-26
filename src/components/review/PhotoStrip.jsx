import { Thumb } from '@/components/photos/Thumb';

/**
 * SU CUERPO, SEMANA A SEMANA: una foto por semana, en el mismo orden y sobre
 * las mismas semanas que la gráfica.
 *
 * ══ Lo que era antes y por qué se ha quedado en esto ════════════════════════
 *
 * Era la tercera capa de un instrumento que dibujaba también la curva del peso y
 * las barras de las calorías. El problema es que esa curva ya está dibujada
 * arriba, en la gráfica de la revisión, así que la pantalla enseñaba **el mismo
 * gráfico dos veces**: uno arriba que no se podía pulsar y otro aquí dentro que
 * sí. Dos dibujos de los mismos datos con dos comportamientos y ninguna señal de
 * cuál era cuál.
 *
 * Lo que aporta esta tira es lo que la gráfica no puede: cómo SE VE. Así que se
 * queda con eso y nada más: una columna por semana de la ventana, en el mismo
 * orden, y la elegida a plena tinta.
 *
 * ── Sin alinear píxel a píxel con la gráfica, y a propósito ────────────────
 * Lo estuvo, mientras las dos vivían en la misma columna a sangre. Desde que
 * cada bloque es una tarjeta —y desde que la gráfica tiene su canal de números a
 * la izquierda— las columnas ya no pueden coincidir, y fingir que sí obligaría a
 * esta tira a reservar un canal vacío de cuarenta píxeles para nada. Lo que ata
 * las dos piezas es la semana elegida, que se marca igual en las dos.
 *
 * ── Un toque elige, el segundo abre ────────────────────────────────────────
 * Pulsar una semana la revisa; pulsar la que ya estás revisando abre su foto a
 * pantalla completa. El segundo toque sobre algo que ya está elegido no puede
 * volver a elegirlo, así que se le da el gesto que falta en vez de dejarlo
 * muerto.
 */
export const PhotoStrip = ({ weeks = [], selected = null, onSelect, onPhoto }) => {
  if (weeks.length === 0) return null;

  /* La parada de tabulador de la tira: la semana elegida, y la primera cuando
     no hay ninguna. Sin esta segunda mitad el tabulador se la salta entera. */
  const focal = weeks.some((s) => s.week === selected) ? selected : weeks[0]?.week;

  return (
    <div
      className="tira"
      style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      role="group"
      aria-label="Sus fotos, semana a semana"
    >
      {weeks.map((s) => (
        <button
          key={s.week}
          type="button"
          className={`tira-semana${s.week === selected ? ' is-now' : ''}`}
          aria-pressed={s.week === selected}
          tabIndex={s.week === focal ? 0 : -1}
          onClick={() => (s.week === selected ? onPhoto?.(s) : onSelect?.(s.week))}
        >
          <span className="tira-foto">
            {s.photo?.url ? (
              <Thumb url={s.photo.url} alt={`Su foto de la semana ${s.week}`} width={220} />
            ) : (
              /* La semana sin foto ocupa su sitio igual: si desapareciera, las
                 columnas dejarían de ser una por semana y la tira contaría una
                 historia más corta de la que hay. */
              <span className="tira-sinfoto" aria-hidden="true" />
            )}
          </span>
          <span className="tira-num">S{s.week}</span>
        </button>
      ))}
    </div>
  );
};
