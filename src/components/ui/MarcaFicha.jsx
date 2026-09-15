import { ChevronRight, Link2, Quote } from 'lucide-react';

/**
 * LA MARCA DEL EJERCICIO: que hay algo que abrir, y qué.
 *
 * ══ Una marca y no tres cosas en el renglón ════════════════════════════════
 *
 * El primer boceto ponía en la misma línea el ▶, la clave escrita y las
 * alternativas. Son tres elementos peleándose por 390 px, que es el ancho real
 * donde esto se usa: un teléfono en el gimnasio. Así que va una marca junto al
 * nombre y detrás está todo.
 *
 * ── Qué glifo, y por qué tres ──────────────────────────────────────────────
 * El mismo vocabulario que ya usa la columna «Lo tuyo» del Taller (`ej-marcas`):
 *
 *   · **cadena** si hay vídeo. Es el glifo correcto porque promete algo que
 *     está FUERA, y es el que pidió el dueño — tres veces: al estrenar la
 *     marca, el 12 de septiembre con el prototipo delante («que en vez de ese
 *     icono del vídeo tuviese una cadenita, y pulsases, en pequeño») y el 13
 *     mirando la hoja del cliente, donde el nombre entero era un enlace azul:
 *     *«los vídeos con enlace de la rutina creo que deberían tener simplemente
 *     un icono de cadena o link al lado del texto y ya»*.
 *   · **comillas** si solo hay pautas. El mismo con el que esta lista ya rotula
 *     «Nota de X» tres pantallas más abajo.
 *   · **el ángulo** si su entrenador no ha puesto nada. Desde `M-03` la ficha
 *     tiene cuatro tramos y tres salen de las series de la propia persona —lo
 *     que hiciste, tu marca y tu nota—, así que hay algo detrás igual. Un
 *     ángulo dice «hay más» sin prometer un vídeo.
 *
 * Nunca dos a la vez: dos glifos por fila es exactamente el ruido que se evita.
 *
 * ══ Por qué vive en `ui/` y no dentro de una lista ═════════════════════════
 *
 * Porque la usan las DOS formas de la sesión —la tabla ancha del escritorio
 * (`Coach/Workout/ExerciseList`) y la hoja de una columna del portal
 * (`Client/HojaDelCliente`)— y mientras estuvo dentro de la primera, la segunda
 * resolvió lo mismo por su cuenta: pintaba el NOMBRE ENTERO en azul y
 * subrayado al pasar por encima. Eso rompe dos reglas de la casa a la vez —el
 * azul invita a pulsar pero no se pinta sobre un dato, y un nombre de ejercicio
 * es un dato— y además prometía un vídeo donde a lo mejor solo había una nota.
 *
 * Una pieza, un glifo, dos monturas.
 *
 * @param ficha  Lo que hay detrás: `{ videoUrl, cue, … }` o `null`. Sin ficha no
 *   se pinta nada — la regla de la 0098: si no lo pone el entrenador, no existe.
 * @param onOpen Qué hacer al pulsarla.
 */
export const MarcaFicha = ({ ficha, onOpen }) => {
  if (!ficha) return null;

  const conVideo = Boolean(ficha.videoUrl);
  const conPautas = Boolean(String(ficha.cue || '').trim());
  const dice = conVideo
    ? 'Ver cómo lo hace tu entrenador'
    : conPautas
      ? 'Leer las pautas de tu entrenador'
      : 'Lo que hiciste, tu marca y tu nota';

  return (
    <button type="button" className="ej-marca" onClick={onOpen} title={dice} aria-label={dice}>
      {/* La escala de iconos de la casa es 13/15/20. Las comillas van al escalón
          de abajo y rellenas: al mismo tamaño que la cadena pesan más que ella,
          porque son dos formas macizas contra un trazo. */}
      {conVideo ? (
        <Link2 size={15} />
      ) : conPautas ? (
        <Quote size={13} fill="currentColor" />
      ) : (
        <ChevronRight size={15} />
      )}
    </button>
  );
};
