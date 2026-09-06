import { useMemo, useState } from 'react';
import { Camera } from 'lucide-react';

import { angleLabel, photoWeight } from '@/domain/photos';
import { shortDate } from '@/lib/dates';
import { Gallery } from '@/components/photos/Gallery';
import { Thumb } from '@/components/photos/Thumb';

/**
 * Una casilla de la hoja: la foto, o el hueco de cuando aún no hay par.
 *
 * ── Por qué vive AQUÍ y no dentro de la hoja ────────────────────────────────
 * Estaba declarada dentro de `PhotoContactSheet`. Un componente definido dentro
 * de otro es un TIPO NUEVO en cada render, así que React no lo actualiza: lo
 * desmonta y lo vuelve a montar. Y aquí cada casilla es un `Thumb`, que guarda
 * en estado si la miniatura cargó o si hubo que caer a la original.
 *
 * El resultado era que abrir el visor —o pasar una sola foto dentro de él, que
 * llama a `onIndex` y repinta la hoja— desmontaba las seis miniaturas de detrás:
 * los `<img>` se vaciaban, volvían a decodificar y la decisión del respaldo se
 * perdía. Fuera del componente el tipo es estable y React se limita a
 * actualizar lo que cambia.
 */
const Foto = ({ foto, week, angle, onOpen }) =>
  foto?.url ? (
    <button
      type="button"
      className="contacto-foto"
      aria-label={`Comparar ${angleLabel(angle).toLowerCase()} de la semana ${week} en grande`}
      onClick={() => onOpen(angle)}
    >
      <Thumb url={foto.url} alt={`${angleLabel(angle)} de la semana ${week}`} width={420} />
    </button>
  ) : (
    /* Sin par anterior se dice, y no se deja un hueco mudo: es su primera de
       ese ángulo, y la comparación empieza a existir la próxima vez. */
    <div className="contacto-hueco">
      <span className="t-2xs t-tertiary">
        <Camera size={13} className="icon-inline" />
        Primera
      </span>
    </div>
  );

/*
  Cuánto pesaba en la semana de esa foto. No se teclea en ninguna parte: sale del
  promedio de pesajes de esa semana, que es lo que convierte «se ve distinto» en
  un dato. Fuera del componente porque el álbum del visor lo usa dentro de un
  `useMemo`, y una función redefinida en cada render lo invalidaría siempre.
*/
const pie = (foto, week, history) => {
  const peso = photoWeight(foto, history);
  return [`S${week}`, peso === null ? null : `${peso} kg`].filter(Boolean).join(' · ');
};

/** El mismo pie con la fecha: en grande hay sitio, y la fecha sitúa la foto. */
const pieLargo = (foto, week, history) =>
  [pie(foto, week, history), foto?.date ? shortDate(foto.date) : null].filter(Boolean).join(' · ');

/**
 * LA HOJA DE CONTACTOS: los tres ángulos y sus dos épocas, a la vez.
 *
 * ══ Por qué se cae el comparador de un ángulo ═══════════════════════════════
 *
 * Enseñaba UNA comparación: dos fotos grandes de un ángulo, con chips para
 * cambiar de ángulo y chips para elegir contra qué semana. Tres problemas, y los
 * tres del mismo sitio:
 *
 *   · **Para ver la espalda había que dejar de ver el frontal.** Un entrenador
 *     mira los tres; la espalda explica lo que el frontal no dice.
 *   · **Dos fotos a proporción 3/4 ocupaban media pantalla**, así que lo demás
 *     de la revisión quedaba a un scroll de distancia de la impresión que acaba
 *     de formarse.
 *   · **Dos filas de chips** —ángulo y semana— antes de ver una sola foto, en
 *     una pantalla que ya tenía su carril de semanas arriba.
 *
 * Aquí están los seis a la vez y pequeños. Es una HOJA DE CONTACTOS: sirve para
 * ver el conjunto y decidir cuál mirar, no para mirarla.
 *
 * ══ Y lo que se abre es EL PAR, no una foto suelta ══════════════════════════
 *
 * El visor enseñaba las seis fotos en fila —«1 de 6»— y pasaba de una en una.
 * Eso es un carrete, y aquí no se viene a mirar una foto: se viene a comparar
 * dos. Con el carrete había que pasar de la de la semana 3 a la de la 4 y
 * recordar la anterior de memoria, que es exactamente lo que la comparación
 * existe para no tener que hacer.
 *
 * Ahora cada ángulo abre su PAR a pantalla completa, las flechas pasan de
 * ángulo —frontal, lateral, espalda— y debajo están las semanas contra las que
 * se puede comparar, a un toque y sin cerrar. Elegir otra cambia también la
 * hoja de detrás: es la misma decisión, no dos.
 *
 * ── El «antes» por defecto es la anterior de ESE ángulo ─────────────────────
 * No la de la semana anterior a secas: de una semana a la siguiente muchas veces
 * no hay foto de ese ángulo, y el hueco convertiría media hoja en cajas vacías.
 * Se busca hacia atrás, y el pie dice de qué semana es — sin eso, dos fotos
 * juntas no se pueden juzgar.
 *
 * @param groups  `[{ week, photos: [...] }]` de `groupByWeek`, de la más nueva a
 *   la más vieja o al revés: aquí se ordena.
 */
export const PhotoContactSheet = ({ groups = [], weekNumber, history = [] }) => {
  /* Qué ángulo se está mirando en grande. El índice del visor ES la posición del
     ángulo en la hoja, así que pasar de foto es pasar de ángulo. */
  const [abierto, setAbierto] = useState(null);
  /* Contra qué semana se compara CADA ángulo. Vacío es «la anterior que tenga
     ese ángulo», que es la respuesta buena mientras nadie pida otra. */
  const [contra, setContra] = useState({});

  const angulos = useMemo(() => {
    const previos = [...groups]
      .filter((g) => g.week !== null && g.week <= weekNumber)
      .sort((a, b) => b.week - a.week);

    const deEsta = previos.find((g) => g.week === weekNumber);
    if (!deEsta) return [];

    /* Los ángulos que ha subido ESTA semana, en el orden en que llegaron. Los de
       otras semanas no abren columna: la hoja es de la semana que se revisa. */
    const ids = [...new Set((deEsta.photos || []).map((p) => p.angle).filter(Boolean))];

    return ids.map((angle) => {
      const ahora = (deEsta.photos || []).find((p) => p.angle === angle) || null;

      /* Todas las semanas anteriores que TIENEN este ángulo, de la más cercana a
         la más lejana. Son las que se pueden ofrecer: un chip que llevara a un
         hueco vacío sería ofrecer una comparación que no existe. */
      const opciones = previos
        .filter((g) => g.week < weekNumber && (g.photos || []).some((p) => p.angle === angle))
        .map((g) => g.week);

      const elegida = contra[angle];
      const antesWeek = opciones.includes(elegida) ? elegida : (opciones[0] ?? null);
      const antes =
        antesWeek === null
          ? null
          : previos.find((g) => g.week === antesWeek)?.photos.find((p) => p.angle === angle) || null;

      return { angle, ahora, antes, antesWeek, opciones };
    });
  }, [groups, weekNumber, contra]);

  /* El álbum del visor: UN par por ángulo, en el orden de la hoja. */
  const album = useMemo(
    () =>
      angulos.map(({ angle, ahora, antes, antesWeek }) => ({
        id: angle,
        caption: angleLabel(angle),
        pair: [
          antes?.url ? { url: antes.url, pie: pieLargo(antes, antesWeek, history) } : null,
          ahora?.url ? { url: ahora.url, pie: pieLargo(ahora, weekNumber, history) } : null,
        ].filter(Boolean),
      })),
    [angulos, weekNumber, history]
  );

  if (angulos.length === 0) return null;

  const abrir = (angle) => {
    const i = angulos.findIndex((a) => a.angle === angle);
    if (i >= 0) setAbierto(i);
  };

  const enGrande = abierto === null ? null : angulos[abierto];

  return (
    <>
      <div className="contactos">
        {angulos.map(({ angle, ahora, antes, antesWeek }) => (
          <figure className="contacto" key={angle}>
            <span className="section-label">{angleLabel(angle)}</span>

            <div className="contacto-par">
              <Foto foto={antes} week={antesWeek} angle={angle} onOpen={abrir} />
              <Foto foto={ahora} week={weekNumber} angle={angle} onOpen={abrir} />
            </div>

            <figcaption className="row between gap-2 t-2xs t-tertiary">
              <span>{antes ? pie(antes, antesWeek, history) : '—'}</span>
              <span>{ahora ? pie(ahora, weekNumber, history) : '—'}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      {enGrande && album[abierto] && (
        <Gallery
          items={album}
          index={abierto}
          onIndex={setAbierto}
          onClose={() => setAbierto(null)}
          /* Cambiar contra qué semana se compara, sin salir de la foto. Solo si
             hay más de una: un carril de un chip no decide nada. */
          controls={
            enGrande.opciones.length > 1 ? (
              <div className="row gap-2 wrap" style={{ justifyContent: 'center' }}>
                <span className="t-2xs t-tertiary" style={{ alignSelf: 'center' }}>
                  Comparar con
                </span>
                {enGrande.opciones.map((week) => (
                  <button
                    key={week}
                    type="button"
                    className="chip"
                    aria-pressed={week === enGrande.antesWeek}
                    onClick={() => setContra((previo) => ({ ...previo, [enGrande.angle]: week }))}
                  >
                    {/* La distancia y no solo el número: «hace 3 semanas» se
                        entiende sin saberse de memoria por qué semana va. */}
                    S{week}
                    <span className="t-tertiary">
                      {weekNumber - week === 1 ? ' · anterior' : ` · −${weekNumber - week} sem`}
                    </span>
                  </button>
                ))}
              </div>
            ) : null
          }
        />
      )}
    </>
  );
};
