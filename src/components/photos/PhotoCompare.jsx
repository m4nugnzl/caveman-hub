import { ArrowRight, Camera } from 'lucide-react';

import { angleLabel, photoWeight, weightDelta } from '@/domain/photos';
import { shortDate } from '@/lib/dates';
import { Delta } from '@/components/ui/metrics';
import { Thumb } from './Thumb';

/**
 * La comparativa de un check-in: su foto de esta semana contra una anterior.
 *
 * ══ Por qué esto y no las miniaturas que había ══════════════════════════════
 *
 * «Su semana» enseñaba cuatro miniaturas de 54 px de la semana que se revisa. Eso
 * dice «hay fotos», que es un recuento, no un dato: para ver algo había que
 * abrir el estudio, elegir el par a mano y volver. Y revisar un check-in es
 * exactamente mirar si ha cambiado.
 *
 * ── Y por qué se puede elegir contra cuál ───────────────────────────────────
 * Porque de una semana a la siguiente no se ve nada, y dos fotos idénticas al
 * lado no informan: parecen un fallo. Los chips ofrecen las semanas anteriores
 * que TIENEN ese mismo ángulo (ver `weekComparison`), así que ninguno lleva a un
 * hueco vacío, y por defecto entra la más cercana — que es la que contesta la
 * pregunta del check-in.
 *
 * ── El peso no se teclea ────────────────────────────────────────────────────
 * Sale de `photoWeight`: el promedio de la semana de esa foto. Dos fotos son una
 * impresión; «−1,4 kg entre las dos» es lo que la convierte en un dato.
 *
 * ── Esto no sustituye al estudio ────────────────────────────────────────────
 * Comparar tres semanas en cuadrícula, montar el collage y grabar el vídeo
 * siguen siendo suyos, y el enlace está ahí mismo. Aquí solo cabe la comparación
 * que se mira mientras se contesta.
 */
/* Sin `action`: llevaba el enlace al estudio, y ahora ese enlace vive en el
   rótulo del tramo que envuelve a esto (ver `Coach/WeekReview.jsx`). Un hueco de
   acción que nadie rellena es una decisión de diseño que ya no se toma aquí. */
export const PhotoCompare = ({ comparison, history = [], weekNumber, onAngle, onAgainst }) => {
  if (!comparison) return null;

  const { angle, angles, before, after, against, options, span } = comparison;
  const delta = weightDelta(before, after, history);

  const pie = (foto, week) => {
    const peso = photoWeight(foto, history);
    return [
      week === null ? 'Ahora' : `Semana ${week}`,
      peso === null ? null : `${peso} kg`,
      foto?.date ? shortDate(foto.date) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <div className="col gap-3">
      {/* Qué se está comparando y contra qué. Dos carriles y no un desplegable:
          es una elección de un toque que se hace y se deshace mirando.

          El ángulo solo si hay más de uno esa semana: un carril de un solo chip
          es un control que no decide nada. */}
      {angles.length > 1 && (
        <div className="row gap-2 wrap">
          {angles.map((id) => (
            <button
              key={id}
              type="button"
              className="chip"
              aria-pressed={id === angle}
              onClick={() => onAngle?.(id)}
            >
              {angleLabel(id)}
            </button>
          ))}
        </div>
      )}

      {options.length > 1 && (
        <div className="row gap-2 wrap">
          <span className="t-2xs t-tertiary" style={{ alignSelf: 'center' }}>
            Comparar con
          </span>
          {options.map((week) => (
            <button
              key={week}
              type="button"
              className="chip"
              aria-pressed={week === against}
              onClick={() => onAgainst?.(week)}
            >
              {/* La distancia y no solo el número: «hace 3 semanas» se entiende
                  sin saberse de memoria en qué semana va el cliente. */}
              S{week}
              <span className="t-tertiary">
                {weekNumber - week === 1 ? ' · anterior' : ` · −${weekNumber - week} sem`}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="shot-pair">
        {before ? (
          <figure className="shot">
            <Thumb url={before.url} width={480} alt={`${angleLabel(angle)} de la semana ${against}`} />
            <figcaption className="t-2xs t-tertiary">{pie(before, against)}</figcaption>
          </figure>
        ) : (
          /* Sin par anterior se dice, y no se deja un hueco. Es su primera foto de
             ese ángulo: la comparativa empieza a existir la próxima vez. */
          <div className="shot">
            <div className="shot-empty">
              <span className="t-xs t-tertiary">
                <Camera size={14} className="icon-inline" />
                Es su primera {angleLabel(angle).toLowerCase()}. Desde la próxima entrega habrá con
                qué compararla.
              </span>
            </div>
          </div>
        )}

        <figure className="shot">
          <Thumb url={after.url} width={480} alt={`${angleLabel(angle)} de la semana ${weekNumber}`} />
          <figcaption className="t-2xs t-tertiary">{pie(after, weekNumber)}</figcaption>
        </figure>
      </div>

      {/* El intervalo y el peso, que es lo que las dos fotos no dicen. */}
      {before && (
        <div className="row gap-2 wrap t-xs t-secondary">
          <span>
            {span} {span === 1 ? 'semana' : 'semanas'} entre las dos
          </span>
          {delta !== null && (
            <>
              <ArrowRight size={11} style={{ color: 'var(--text-tertiary)' }} />
              <Delta value={delta} unit=" kg" lowerIsBetter />
            </>
          )}
        </div>
      )}
    </div>
  );
};
