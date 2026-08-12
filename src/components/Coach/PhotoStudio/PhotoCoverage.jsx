import { useMemo } from 'react';
import { MessageCircle } from 'lucide-react';

import { angleShort, availableAngles, photoCoverage } from '@/domain/photos';

/**
 * El historial de fotos, con sus huecos.
 *
 * ══ Qué le faltaba al estudio ═══════════════════════════════════════════════
 *
 * La biblioteca lateral enseña LO QUE HAY, agrupado por semana. Eso lo convierte
 * en un explorador de archivos: se ve lo subido y no se ve lo que falta.
 *
 * Y un entrenador que abre las fotos de un cliente se hace DOS preguntas, no una:
 *
 *   1. ¿Cómo ha cambiado? — para eso está el comparador, y está bien resuelto.
 *   2. ¿Tengo material para compararlo? — «me faltan la 5, la 7 y la 9, y de la 8
 *      solo tengo el frontal».
 *
 * La segunda es la que genera trabajo —hay que escribirle— y era invisible,
 * porque una semana sin fotos simplemente no aparecía en la lista y no dejaba
 * hueco. Aquí las semanas vacías ocupan su sitio, que es todo el asunto: un
 * historial al que le faltan los huecos no es un historial, es una selección.
 *
 * ── Por qué los ángulos se deducen del cliente ──────────────────────────────
 * Se marcan como incompletas las semanas a las que les falta un ángulo QUE ESE
 * CLIENTE SE HACE. Usar los tres siempre daría una pantalla llena de avisos para
 * quien solo se fotografía de frente, y un aviso que siempre está encendido deja
 * de mirarse.
 */
export const PhotoCoverage = ({ photos, startDate, phone }) => {
  /* Los ángulos que este cliente usa de verdad, no los tres del catálogo. */
  const angles = useMemo(() => availableAngles(photos), [photos]);
  const coverage = useMemo(
    () => photoCoverage({ photos, startDate, angles }),
    [photos, startDate, angles]
  );

  if (coverage.length <= 1) return null;

  const missing = coverage.filter((w) => w.empty).map((w) => w.week);
  const partial = coverage.filter((w) => !w.empty && !w.complete).length;

  return (
    <section className="coverage">
      <header className="row between wrap gap-2">
        <span className="section-label">
          Historial · {coverage.length} semanas, de la {coverage[0].week} a la{' '}
          {coverage[coverage.length - 1].week}
        </span>

        {missing.length > 0 && phone && (
          <a
            className="chip"
            href={`https://wa.me/${String(phone).replace(/[^\d]/g, '')}?text=${encodeURIComponent(
              `¡Hola! Me faltan tus fotos de ${missing.length === 1 ? 'la semana' : 'las semanas'} ${missing.join(', ')}. ¿Puedes subirlas cuando puedas?`
            )}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            <MessageCircle size={12} /> Pedírselas
          </a>
        )}
      </header>

      {/*
        Se LEE, no se pulsa. La tentación es convertir cada semana en un selector,
        y sería un tercer camino para elegir una foto: la biblioteca está justo al
        lado y el selector de semanas de la matriz, debajo. Tres formas de hacer lo
        mismo obligan a aprender cuál hace qué.

        Esto contesta una pregunta distinta —«¿tengo material?»— y con contestarla
        ya ha hecho su trabajo.
      */}
      <div className="coverage-strip">
        {coverage.map((week) => (
          <span
            key={week.week}
            className={`coverage-week${week.empty ? ' is-empty' : week.complete ? ' is-full' : ' is-partial'}`}
            title={
              week.empty
                ? `Semana ${week.week}: sin fotos`
                : `Semana ${week.week}: ${week.angles
                    .filter((a) => a.has)
                    .map((a) => angleShort(a.angle))
                    .join(', ')}`
            }
          >
            <span className="w">{week.week}</span>
            <span className="dots" aria-hidden="true">
              {week.angles.map((a) => (
                <span key={a.angle} className={`dot${a.has ? ' is-on' : ''}`} />
              ))}
            </span>
          </span>
        ))}
      </div>

      {(missing.length > 0 || partial > 0) && (
        <p className="t-xs t-tertiary">
          {missing.length > 0 &&
            `Sin fotos: ${missing.length === 1 ? 'la semana' : 'las semanas'} ${missing.join(', ')}. `}
          {partial > 0 &&
            `${partial} ${partial === 1 ? 'semana está' : 'semanas están'} a medias.`}
        </p>
      )}
    </section>
  );
};
