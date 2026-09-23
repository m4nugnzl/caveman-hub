import { addDays } from '@/lib/dates';

/**
 * EL PESO REAL: los pesajes, la media de cada semana y los huecos.
 *
 * ══ Por qué es una pieza y no dos dibujos ══════════════════════════════════
 *
 * La gráfica de la temporada y las tiras de la portada de Revisiones enseñan lo
 * MISMO a distinto zoom. Hasta ahora lo dibujaban dos veces, con dos juegos de
 * clases y dos maneras de unir los puntos, y eso no es un detalle: si una pone
 * el pesaje en su día y la otra en el centro de la semana, el cliente ve dos
 * historias del mismo lunes y no hay forma de saber cuál es la buena.
 *
 * Aquí está una vez. Lo único que cambia entre los dos sitios son las dos
 * escalas, que entran como funciones:
 *
 *   · `X` — de día a píxel. Por fecha (`escalaX`) en la temporada, por columnas
 *     (`escalaPorColumnas`) en las tiras. El jueves cae en el centro de su
 *     semana en las dos.
 *   · `Y` — de kilo a píxel. Por ventana o por fase (`escalaDePeso`).
 *
 * ══ Lo que dice el trazo ═══════════════════════════════════════════════════
 *
 * Los pesajes van en SU DÍA y en voz baja; la media de la semana es el dato
 * gordo. Dos medias seguidas van unidas; donde falta una semana, el salto va
 * punteado: el dato que falta no se inventa, se dice que falta.
 *
 * No lleva lo esperado: eso es el plan, no el peso, y cada sitio lo cuenta a su
 * manera —la temporada con la recta de cada tramo, la tira con su línea—.
 */

const f1 = (n) => Math.round(n * 10) / 10;

export const TrazoDelPeso = ({
  semanas,
  X,
  Y,
  color,
  /* Los pesajes sueltos solo caben con la semana ancha: en la espina plegada
     son una nube que tapa la media. */
  conPesajes = true,
  /* Qué semanas llevan disco. La espina solo pinta el de la semana abierta. */
  punto = () => true,
  radio = () => 3.5,
  /* La que va más marcada: la de hoy en las tiras, la actual en la línea. */
  grueso = () => false,
}) => {
  /* Los tramos seguidos y los saltos, por FECHA y no por posición en la lista:
     una semana sin media parte el trazo aunque venga pegada en el array. */
  const tramos = [];
  const saltos = [];
  let previa = null;
  for (const s of semanas) {
    if (s.media === null || s.media === undefined) continue;
    const m = { s, x: f1(X(s.jueves)), y: Y(s.media) };
    const ultimo = tramos[tramos.length - 1];
    if (previa && previa.s.lunes === addDays(s.lunes, -7)) ultimo.push(m);
    else {
      if (previa) saltos.push([previa, m]);
      tramos.push([m]);
    }
    previa = m;
  }
  const medias = tramos.flat();

  return (
    <>
      {conPesajes &&
        semanas.flatMap((s) =>
          (s.pesajes || []).map((p) => (
            <circle key={`p-${p.date}`} className="progreso-pesaje" cx={f1(X(p.date))} cy={Y(p.weight)} r="2" fill={color} />
          ))
        )}

      {saltos.map(([a, b]) => (
        <line key={`s-${a.s.lunes}`} className="progreso-salto" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} />
      ))}
      {tramos
        .filter((t) => t.length > 1)
        .map((t) => (
          <polyline
            key={`t-${t[0].s.lunes}`}
            className="progreso-trazo"
            points={t.map((m) => `${m.x},${m.y}`).join(' ')}
            fill="none"
            stroke={color}
          />
        ))}
      {medias
        .filter((m) => punto(m.s))
        .map((m) => (
          <circle
            key={`m-${m.s.lunes}`}
            className={`progreso-punto${grueso(m.s) ? ' is-hoy' : ''}`}
            cx={m.x}
            cy={m.y}
            r={radio(m.s)}
            fill={color}
          />
        ))}
    </>
  );
};
