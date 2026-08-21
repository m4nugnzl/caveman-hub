import { useMemo } from 'react';
import { Ruler } from 'lucide-react';

import { PERIMETER_LABELS, fatPercent, weeklyWeightAverages } from '@/domain/anthropometry';
import { weekStart } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { Delta } from '@/components/ui/metrics';
import { Panel, SectionTitle } from '@/components/ui/primitives';

/**
 * Registro antropométrico más cercano a una fecha, dentro de una tolerancia.
 *
 * Las medidas no se toman el mismo día que las fotos —los pliegues se miden cada
 * tres o cuatro semanas—, así que exigir coincidencia exacta dejaría la tabla
 * vacía casi siempre. Diez días es el margen en el que una medida sigue
 * describiendo el mismo estado del cliente.
 */
const nearestLog = (history, date, maxDays = 10) => {
  if (!date) return null;
  const target = Date.parse(date);
  if (!Number.isFinite(target)) return null;

  let best = null;
  for (const log of history) {
    const when = Date.parse(log?.date);
    if (!Number.isFinite(when)) continue;
    const days = Math.abs(when - target) / 86400000;
    if (days > maxDays) continue;
    if (best === null || days < best.days) best = { log, days };
  }
  return best?.log || null;
};

/** Fila de la tabla: valor antes, valor después y su variación. */
const Row = ({ label, before, after, unit, decimals = 1, lowerIsBetter = false }) => {
  const a = toNum(before);
  const b = toNum(after);
  if (a === null && b === null) return null;

  return (
    <div className="compare-row">
      <span className="k">{label}</span>
      <span className="v">{a === null ? '—' : `${a}${unit}`}</span>
      <span className="v">{b === null ? '—' : `${b}${unit}`}</span>
      <span className="d">
        {a !== null && b !== null ? (
          <Delta value={b - a} unit={unit} decimals={decimals} lowerIsBetter={lowerIsBetter} />
        ) : (
          <span className="t-xs t-tertiary">—</span>
        )}
      </span>
    </div>
  );
};

/**
 * Los datos que acompañan a la comparativa de fotos.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Dos fotos lado a lado son una impresión. «−4,2 kg, cintura −5 cm, 2,1 puntos
 * menos de grasa» es la prueba. Antes esta pantalla solo tenía las fotos y una
 * tarjeta con la variación de peso, así que para acompañar la revisión con cifras
 * había que abrir la pestaña de check-ins en paralelo e ir mirando de una a otra.
 *
 * Todo sale de `anthropometry.history`, que ya está cargado: cero consultas.
 * Las filas sin dato en ninguna de las dos fechas no se pintan — una tabla con
 * ocho guiones no informa de nada.
 */
export const ComparisonData = ({ before, after, span = null, history, gender, notes = null }) => {
  /*
    El intervalo, en la cabecera del panel. Vivía en una tarjeta aparte junto a
    otra con la variación de peso; el peso ya es la primera fila de esta tabla,
    así que la tarjeta duplicada se fue y el intervalo —que la tabla NO dice—
    se quedó aquí, como remate del título.
  */
  const intervalo =
    span !== null ? `${span} ${span === 1 ? 'semana' : 'semanas'} entre fotos` : null;

  const data = useMemo(() => {
    if (!before || !after) return null;

    const weekly = weeklyWeightAverages(history);
    const avgAt = (date) => weekly.find((w) => w.date === weekStart(date))?.value ?? null;

    const logA = nearestLog(history, before.date);
    const logB = nearestLog(history, after.date);

    return {
      weightA: before.derivedWeight ?? avgAt(before.date),
      weightB: after.derivedWeight ?? avgAt(after.date),
      logA,
      logB,
      fatA: logA?.skinFolds ? fatPercent(logA.skinFolds, gender) : null,
      fatB: logB?.skinFolds ? fatPercent(logB.skinFolds, gender) : null,
    };
  }, [before, after, history, gender]);

  if (!data) return null;

  const perimeterRows = Object.entries(PERIMETER_LABELS).filter(
    ([key]) =>
      toNum(data.logA?.perimeters?.[key]) !== null || toNum(data.logB?.perimeters?.[key]) !== null
  );

  const hasAnything =
    data.weightA !== null || data.weightB !== null || data.fatA !== null || perimeterRows.length > 0;

  if (!hasAnything) {
    return (
      <Panel tight className="col gap-2">
        {notes && (
          <p className="t-sm t-secondary">
            <span className="t-strong">Sus notas:</span> {notes}
          </p>
        )}
        <p className="t-sm t-secondary">
          {intervalo && <>Hay {intervalo}. </>}
          Sin medidas registradas cerca de estas dos fechas. En «Check-ins» puedes añadir una
          revisión con pliegues y perímetros para que aquí salga la comparación numérica.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="col gap-3">
      <SectionTitle
        icon={Ruler}
        action={intervalo && <span className="t-xs t-tertiary">{intervalo}</span>}
      >
        Qué dicen los números
      </SectionTitle>

      <div className="compare-table">
        <div className="compare-row is-head">
          <span className="k">Medida</span>
          <span className="v">
            {before.week != null ? `Sem ${before.week}` : before.date}
          </span>
          <span className="v">{after.week != null ? `Sem ${after.week}` : after.date}</span>
          <span className="d">Cambio</span>
        </div>

        <Row label="Peso" before={data.weightA} after={data.weightB} unit=" kg" lowerIsBetter />
        <Row label="% graso" before={data.fatA} after={data.fatB} unit="%" lowerIsBetter />

        {perimeterRows.map(([key, label]) => (
          <Row
            key={key}
            label={label}
            before={data.logA?.perimeters?.[key]}
            after={data.logB?.perimeters?.[key]}
            unit=" cm"
            lowerIsBetter={key === 'ombligo' || key === 'cadera'}
          />
        ))}
      </div>

      {/* Lo que el cliente escribió al subir la foto reciente. Se lee aquí, con
          los números, porque es su contexto: «esa semana comí fuera» explica una
          fila de esta tabla, no el encuadre del lienzo. */}
      {notes && (
        <p className="t-sm t-secondary">
          <span className="t-strong">Sus notas:</span> {notes}
        </p>
      )}

      <p className="t-xs t-tertiary">
        El peso es el promedio del check-in de cada semana. Las medidas son la revisión más cercana a
        la fecha de cada foto, con un margen de diez días.
      </p>
    </Panel>
  );
};
