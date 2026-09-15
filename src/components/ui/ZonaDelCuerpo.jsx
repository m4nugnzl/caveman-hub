import { ZONAS, zonaById, zonaEscrita, zonasDe } from '@/domain/protocol';
import { FiguraDeCuerpo } from '@/components/Coach/Taller/GuiaDeMedidas';

/**
 * DÓNDE TE HA MOLESTADO: el cuerpo, y se toca.
 *
 * ══ Lo que sustituye ═══════════════════════════════════════════════════════
 *
 * Un campo de texto. «¿Dónde te ha molestado?» y una raya en blanco, que produce
 * «hombro», «hombro dcho», «el deltoides» y «el mismo de siempre»: cuatro
 * respuestas a la misma pregunta que no se pueden contar, ni filtrar, ni poner
 * al lado de la del mes pasado para ver si aquello se ha movido de sitio. El
 * porqué entero está en `ZONAS`.
 *
 * ══ Por qué la MISMA figura de la guía de medición ═════════════════════════
 *
 * Porque es el mismo cuerpo. La silueta de trazo con la que esta aplicación
 * explica dónde va la cinta y dónde va el pellizco ya es un artefacto suyo —se
 * dibujó una vez, se decidió dos veces y tiene su lema escrito—, y señalar en
 * ella dónde duele no necesita otro dibujo. Un segundo monigote en otro estilo
 * dentro de la misma aplicación es exactamente de lo que sale que un producto se
 * vea «a cachos».
 *
 * Y las dos vistas, de frente y de espalda, por lo mismo que en los pliegues:
 * las lumbares y los isquios no se pueden señalar de frente sin mentir.
 *
 * ══ El dibujo Y la lista, no uno de los dos ════════════════════════════════
 *
 * La lista de debajo no es el respaldo accesible del dibujo: es la otra mitad.
 * Sobre la figura se acierta con el ratón y se falla con el pulgar —son discos
 * de 14 px en un cuerpo de 130—, así que lo que se toca de verdad en un teléfono
 * son los renglones, y la figura dice DÓNDE cae cada uno. Marcar en cualquiera
 * de los dos enciende el otro: es la misma respuesta dicha dos veces.
 *
 * Quien lee la pantalla oye solo los renglones, y está bien: el `svg` es un
 * `role="img"` con su resumen, así que sus puntos no se anuncian sueltos y nadie
 * se encuentra dos listas de veinte botones seguidas.
 *
 * @param valor       Un array de ids de zona. Una CADENA es una respuesta de las
 *   viejas, de cuando esto era texto libre: se enseña tal cual y no se pierde.
 * @param readOnly    Ya se contestó: el cuerpo con sus marcas, sin tocar.
 * @param soloLectura Así se va a ver: el control entero, apagado.
 */

/** Las zonas de una vista, en el orden del catálogo. */
const deVista = (vista) => ZONAS.filter((z) => z.vista === vista);

const VISTAS = [
  { id: 'frente', rotulo: 'De frente', dx: 0 },
  { id: 'espalda', rotulo: 'De espalda', dx: 160 },
];

export const ZonaDelCuerpo = ({
  valor,
  onChange,
  etiqueta,
  readOnly = false,
  soloLectura = false,
}) => {
  const puestas = zonasDe(valor);
  const escrita = zonaEscrita(valor);
  const marcada = (id) => puestas.includes(id);

  const alternar = (id) =>
    onChange(marcada(id) ? puestas.filter((x) => x !== id) : [...puestas, id]);

  /* Lo que se escribió cuando esto era un campo de texto. No hay forma de
     convertirlo en zonas —«el mismo de siempre» no es un id— y tirarlo sería
     borrar lo que alguien contestó, así que se lee como lo que es: una frase. */
  if (escrita) {
    return (
      <figure className="cita">
        <blockquote>{escrita}</blockquote>
        <figcaption>Lo escribió antes de que esto fuera un dibujo</figcaption>
      </figure>
    );
  }

  /* En lectura sin nada marcado no hay nada que enseñar: un cuerpo entero en
     blanco para decir «no le dolió nada» ocupa media pantalla. Lo dice quien
     monta la fila. */
  if (readOnly && puestas.length === 0) return null;

  return (
    <div className="zonas">
      <svg
        className="zonas-svg"
        viewBox="0 0 290 276"
        role="img"
        aria-label={`${etiqueta || 'Zonas'}: ${
          puestas.length === 0
            ? 'ninguna marcada'
            : puestas.map((id) => zonaById(id)?.label).join(', ')
        }`}
      >
        {VISTAS.map((v) => (
          <g key={v.id} transform={v.dx ? `translate(${v.dx} 0)` : undefined}>
            <FiguraDeCuerpo vista={v.id} rotulo={v.rotulo} />
            {deVista(v.id).map((z) => (
              <circle
                key={z.id}
                className="zonas-punto"
                cx={z.x}
                cy={z.y}
                r="7"
                data-on={marcada(z.id) ? '1' : undefined}
                /* El punto también se pulsa, para quien tiene ratón: señalar
                   sobre un cuerpo dónde duele es más rápido que buscar «Hombro
                   dcho.» en una lista de veinte renglones. */
                onClick={readOnly || soloLectura ? undefined : () => alternar(z.id)}
              >
                <title>{z.label}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>

      {/* Lo que se toca. En lectura, solo lo marcado. */}
      {readOnly ? (
        <span className="opciones-libres es-leida">
          {puestas.map((id) => (
            <span className="chip-op es-dada" key={id}>
              {zonaById(id)?.label}
            </span>
          ))}
        </span>
      ) : (
        <div className="opciones-libres" role="group" aria-label={etiqueta}>
          {ZONAS.map((z) => (
            <button
              key={z.id}
              type="button"
              className="chip-op"
              aria-pressed={marcada(z.id)}
              disabled={soloLectura}
              onClick={() => alternar(z.id)}
            >
              {z.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
