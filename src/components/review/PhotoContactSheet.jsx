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
      aria-label={`Ver ${angleLabel(angle).toLowerCase()} de la semana ${week} en grande`}
      onClick={() => onOpen(foto)}
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
 * ver el conjunto y decidir cuál mirar, no para mirarla. Y cualquiera se abre a
 * pantalla completa en el visor, que es donde se mira de verdad y donde además
 * se pasa de una a otra con el dedo (ver `photos/Gallery.jsx`).
 *
 * ── El «antes» es la anterior de ESE ángulo ─────────────────────────────────
 * No la de la semana anterior a secas: de una semana a la siguiente muchas veces
 * no hay foto de ese ángulo, y el hueco convertiría media hoja en cajas vacías.
 * Se busca hacia atrás, y el pie dice de qué semana es — sin eso, dos fotos
 * juntas no se pueden juzgar.
 *
 * @param groups  `[{ week, photos: [...] }]` de `groupByWeek`, de la más nueva a
 *   la más vieja o al revés: aquí se ordena.
 */
export const PhotoContactSheet = ({ groups = [], weekNumber, history = [] }) => {
  const [abierta, setAbierta] = useState(null);

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
      const antesGrupo = previos.find(
        (g) => g.week < weekNumber && (g.photos || []).some((p) => p.angle === angle)
      );
      const antes = antesGrupo ? antesGrupo.photos.find((p) => p.angle === angle) : null;

      return { angle, ahora, antes, antesWeek: antesGrupo?.week ?? null };
    });
  }, [groups, weekNumber]);

  /* El álbum del visor: todas las de la hoja, en el orden en que se ven. Si
     «la siguiente» no es la que está al lado, pasar fotos deja de tener
     sentido. */
  const album = useMemo(
    () =>
      angulos.flatMap(({ angle, ahora, antes, antesWeek }) =>
        [
          antes && { foto: antes, week: antesWeek, angle },
          ahora && { foto: ahora, week: weekNumber, angle },
        ]
          .filter((x) => x && x.foto.url)
          .map(({ foto, week }) => ({
            id: foto.id ?? foto.path,
            url: foto.url,
            caption: `${angleLabel(angle)} · Semana ${week}${
              foto.date ? ` · ${shortDate(foto.date)}` : ''
            }`,
          }))
      ),
    [angulos, weekNumber]
  );

  if (angulos.length === 0) return null;

  const abrir = (foto) => {
    const i = album.findIndex((f) => f.id === (foto.id ?? foto.path));
    if (i >= 0) setAbierta(i);
  };

  const pie = (foto, week) => {
    const peso = photoWeight(foto, history);
    return [`S${week}`, peso === null ? null : `${peso} kg`].filter(Boolean).join(' · ');
  };

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
              <span>{antes ? pie(antes, antesWeek) : '—'}</span>
              <span>{ahora ? pie(ahora, weekNumber) : '—'}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      {abierta !== null && album[abierta] && (
        <Gallery
          items={album}
          index={abierta}
          onIndex={setAbierta}
          onClose={() => setAbierta(null)}
        />
      )}
    </>
  );
};
