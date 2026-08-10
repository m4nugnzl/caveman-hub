import { CalendarRange } from 'lucide-react';

import { ANGLES } from '@/domain/photos';
import { Field, Panel, SectionTitle } from '@/components/ui/primitives';

/**
 * Selección del montaje en matriz: qué semanas y qué ángulos entran.
 *
 * ── Por qué sustituye a elegir hueco por hueco ──────────────────────────────
 * Para montar el frontal y la espalda de las semanas 1, 6 y 12 hacían falta seis
 * huecos, asignados a mano uno a uno desde la biblioteca, y sin garantía de que
 * las columnas quedaran alineadas. Aquí se marcan tres semanas y dos ángulos —
 * cinco toques — y la cuadrícula se monta sola.
 *
 * Las celdas sin foto se conservan vacías a propósito: si a la semana 6 le falta
 * el de espaldas, el hueco se queda en blanco y las columnas siguen cuadrando.
 * Descolocarlas haría que se compararan semanas distintas sin darse cuenta.
 */
export const WeekAnglePicker = ({
  weeks,
  angles,
  pickedWeeks,
  pickedAngles,
  onToggleWeek,
  onToggleAngle,
  matrix,
}) => {
  const filled = matrix.cells.filter((c) => c.photoId).length;
  const total = matrix.cells.length;

  return (
    <Panel className="col gap-4">
      <SectionTitle icon={CalendarRange} color="var(--data-blue)">
        Qué comparar
      </SectionTitle>

      <Field label={`Semanas (${pickedWeeks.length} de ${weeks.length})`}>
        <div className="rail-wrap" role="group" aria-label="Semanas a comparar">
          {weeks.map((week) => (
            <button
              key={week}
              type="button"
              className="chip"
              aria-pressed={pickedWeeks.includes(week)}
              onClick={() => onToggleWeek(week)}
            >
              Sem {week}
            </button>
          ))}
        </div>
      </Field>

      {/*
        Se ofrecen SIEMPRE los tres ángulos, aunque alguno no tenga fotos todavía.
        Antes se filtraban a los disponibles, y el resultado era que «Espalda»
        simplemente no aparecía: parecía que la aplicación no admitía ese ángulo, en
        lugar de que a ese cliente le faltaran esas fotos. Los que no tienen se
        marcan como vacíos y se pueden elegir igual —la fila saldrá en blanco, que
        es información útil: dice que hay que pedírselas.
      */}
      <Field label="Ángulos">
        <div className="rail-wrap" role="group" aria-label="Ángulos a comparar">
          {ANGLES.map((angle) => {
            const has = angles.includes(angle.id);
            return (
              <button
                key={angle.id}
                type="button"
                className="chip"
                aria-pressed={pickedAngles.includes(angle.id)}
                onClick={() => onToggleAngle(angle.id)}
                title={has ? angle.hint : `${angle.hint} — todavía sin fotos`}
              >
                {angle.label}
                {!has && (
                  <span className="t-xs" style={{ opacity: 0.6 }}>
                    sin fotos
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Field>

      {total === 0 ? (
        <p className="t-sm t-secondary">
          Marca al menos una semana para montar la comparativa.
        </p>
      ) : (
        <p className="t-xs t-tertiary">
          {matrix.cols} {matrix.cols === 1 ? 'semana' : 'semanas'} × {matrix.rows}{' '}
          {matrix.rows === 1 ? 'ángulo' : 'ángulos'} · {filled} de {total} huecos con foto.
          {filled < total && ' Los huecos vacíos se conservan para que las columnas queden alineadas.'}
        </p>
      )}
    </Panel>
  );
};
