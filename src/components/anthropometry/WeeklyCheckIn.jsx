import { useMemo, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';

import { buildWeightLog, weekDates, weeklyCheckIn } from '@/domain/anthropometry';
import { shortDate, todayISO, weekStart } from '@/lib/dates';
import { fmt, toNum } from '@/lib/num';
import { Delta } from '@/components/ui/metrics';
import { Panel } from '@/components/ui/primitives';

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Check-in semanal de peso.
 *
 * ── Por qué así ─────────────────────────────────────────────────────────────
 * El seguimiento de un cliente no es un pesaje suelto: es un check-in semanal.
 * Se pesa varios días, se promedia —lo que filtra la variación diaria de agua y
 * glucógeno, que puede pasar del kilo entre dos días seguidos— y ese promedio es
 * lo que se compara con la semana anterior.
 *
 * Antes había que introducir un registro completo cada vez, y el promedio no
 * existía como concepto. Aquí el cliente ve los siete días de su semana, anota
 * el peso el día que se pesa, y el promedio se calcula solo.
 *
 * Cada pesaje se guarda como un registro normal del historial, así que la
 * analítica lo ve inmediatamente: el check-in es una forma de LEER y RELLENAR la
 * semana, no un tipo de dato aparte.
 *
 * ── Y aquí SOLO se pesa ─────────────────────────────────────────────────────
 * Las fotos estaban dentro, y era una mezcla de dos ritmos: pesarse son cinco
 * segundos que se repiten cada dos días, y hacerse las fotos es un acto de una
 * vez por semana que además se hace desnudo delante de un espejo. Metidos en la
 * misma tarjeta, la herramienta de la báscula cargaba con el peso de la otra.
 *
 * Las fotos y los perímetros van juntos, detrás de «Subir mi revisión», que es
 * como se llama de verdad lo que se hace ahí.
 */
export const WeeklyCheckIn = ({ history, onAddWeight, onRemoveEntry, audience = 'client' }) => {
  const [reference, setReference] = useState(() => weekStart(todayISO()));
  const [drafts, setDrafts] = useState({});

  const checkIn = useMemo(() => weeklyCheckIn(history, reference), [history, reference]);
  const days = useMemo(() => weekDates(checkIn.weekStart), [checkIn.weekStart]);

  const byDate = useMemo(
    () => new Map(checkIn.entries.map((entry) => [entry.date, entry])),
    [checkIn.entries]
  );

  const today = todayISO();
  const isClient = audience === 'client';



  const shift = (weeks) => {
    const base = Date.parse(`${checkIn.weekStart}T00:00:00Z`);
    setReference(new Date(base + weeks * 7 * 86400000).toISOString().slice(0, 10));
    setDrafts({});
  };

  const commit = (date) => {
    const value = toNum(drafts[date]);
    if (value === null) return;
    onAddWeight(buildWeightLog({ date, weight: value }));
    setDrafts((d) => ({ ...d, [date]: '' }));
  };

  return (
    <Panel className="col gap-5">
      <div className="row between wrap gap-3">
        <div>
          <span className="section-label">Check-in semanal</span>
          <h3 className="section-title">Semana del {shortDate(checkIn.weekStart)}</h3>
        </div>

        <div className="row gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => shift(-1)}>
            Anterior
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => shift(1)}
            disabled={checkIn.weekStart >= weekStart(today)}
          >
            Siguiente
          </button>
        </div>
      </div>

      {/*
        ══ Los siete días, en UNA fila ════════════════════════════════════════

        Iban en una rejilla que se adapta al ancho con un mínimo de 158 px por
        celda, así que en cuanto el contenedor bajaba de 1.100 px la semana se
        partía en dos filas — y una semana partida en dos deja de leerse como una
        semana: hay que contar para saber qué día es cuál.

        Siete columnas iguales, pase lo que pase. Las celdas se estrechan, que es
        exactamente lo que tiene que pasar: lo que va dentro es un día de tres
        letras y un número.
      */}
      <div className="checkin-week">
        {days.map((date, index) => {
          const entry = byDate.get(date);
          const future = date > today;

          return (
            <div
              className={`card-inset col gap-2${date === today ? ' is-today' : ''}`}
              key={date}
              style={{ opacity: future ? 0.5 : 1 }}
            >
              <span className="section-label">{DAY_NAMES[index]}</span>

              {entry ? (
                <div className="row between gap-2">
                  <span className="metric-value" style={{ fontSize: 'var(--fs-md)' }}>
                    {fmt(entry.weight, { decimals: 1, unit: ' kg' })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-danger"
                    style={{ width: 24, height: 24 }}
                    onClick={() => onRemoveEntry(entry.id)}
                    aria-label={`Borrar el pesaje del ${date}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ) : (
                <div className="row gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input input-sm input-center"
                    placeholder="—"
                    disabled={future}
                    value={drafts[date] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [date]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && commit(date)}
                    onBlur={() => commit(date)}
                    aria-label={`Peso del ${date}`}
                  />
                  {toNum(drafts[date]) !== null && (
                    <button
                      type="button"
                      className="btn btn-icon"
                      style={{ width: 26, height: 26, color: 'var(--accent)' }}
                      onClick={() => commit(date)}
                      aria-label="Guardar"
                    >
                      <Check size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>


      {/* Resultado del check-in: el promedio y su variación contra la semana
          anterior, que es la cifra con la que de verdad se decide. */}
      <div className="row between wrap gap-4" style={{ paddingTop: 'var(--s3)', borderTop: '1px solid var(--hairline)' }}>
        <div className="col gap-1">
          <span className="section-label">Promedio de la semana</span>
          <div className="metric-figure">
            <span className="metric-value">{checkIn.average === null ? '—' : checkIn.average}</span>
            <span className="metric-unit">kg</span>
            <Delta value={checkIn.delta} unit=" kg" lowerIsBetter />
          </div>
          <span className="metric-foot">
            {checkIn.count === 0
              ? 'Sin pesajes esta semana.'
              : `${checkIn.count} ${checkIn.count === 1 ? 'pesaje' : 'pesajes'}` +
                (checkIn.complete
                  ? ' · media fiable'
                  : ` · con ${checkIn.target - checkIn.count} más la media es más fiable`)}
          </span>
        </div>

        {checkIn.previousAverage !== null && (
          <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
            <span className="section-label">Semana anterior</span>
            <span className="row-value">{checkIn.previousAverage} kg</span>
          </div>
        )}
      </div>

      <p className="t-xs t-tertiary">
        {isClient
          ? 'Pésate por la mañana, en ayunas y después de ir al baño. Lo ideal son 3 días alternos: el promedio filtra la variación diaria de agua y es lo que de verdad indica si tu peso sube o baja.'
          : 'El promedio semanal filtra el ruido diario. Es la cifra que conviene mirar para decidir ajustes, no un pesaje suelto.'}
      </p>

    </Panel>
  );
};
