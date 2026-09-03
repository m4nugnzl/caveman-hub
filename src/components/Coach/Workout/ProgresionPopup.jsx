import { useMemo } from 'react';

import { exerciseTrend } from '@/domain/week';
import { estimatedOneRm } from '@/domain/training';
import { metricColor } from '@/domain/metrics';
import { shortDate } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { Modal } from '@/components/ui/Modal';
import { BandChart } from '@/components/ui/charts';

/**
 * La progresión de un ejercicio, en grande.
 *
 * La tarjeta de al lado de la hoja enseña las últimas seis semanas y cinco
 * series: lo que cabe. Aquí está TODO: la curva del tope y del 1RM estimado
 * con sus ejes, y la tabla entera —todas las semanas, todas las series—
 * para leer la progresión de este ejercicio de principio a fin.
 */
const numero = toNum;

export const ProgresionPopup = ({ open, onClose, microcycles, name, weekNumber , etiqueta = (w) => `S${w}` }) => {
  const trend = useMemo(() => (name ? exerciseTrend({ microcycles, name, weekNumber }) : null), [microcycles, name, weekNumber]);
  const sesiones = trend?.sessions || [];
  const series = Math.max(0, ...sesiones.map((s) => s.sets.length));
  const labels = sesiones.map((s) => etiqueta(s.week));
  const tope = sesiones.map((s) => ({ label: etiqueta(s.week), value: s.topKg }));
  const rm = sesiones.map((s) => ({ label: etiqueta(s.week), value: estimatedOneRm(s.top?.kg, s.top?.reps) }));

  return (
    <Modal open={open} size="lg" title={name ? `Progresión · ${name}` : 'Progresión'} onClose={onClose}>
      {!trend ? (
        <p className="t-sm t-tertiary">Todavía no hay ninguna serie anotada de este ejercicio.</p>
      ) : (
        <div className="progresion">
          <div className="bloque-cifras is-3">
            <div className="bloque-cifra"><span className="v">{trend.to ?? '—'}</span><span className="k">kg tope ahora</span></div>
            <div className="bloque-cifra">
              <span className="v">{trend.from !== null && trend.to !== null ? `${trend.to - trend.from > 0 ? '+' : ''}${Math.round((trend.to - trend.from) * 10) / 10}` : '—'}</span>
              <span className="k">kg desde S{sesiones[0]?.week}</span>
            </div>
            <div className="bloque-cifra"><span className="v">{trend.weeks}</span><span className="k">{trend.weeks === 1 ? 'sesión registrada' : 'sesiones registradas'}</span></div>
          </div>

          <BandChart
            labels={labels}
            series={[
              { id: 'top', label: 'Kg tope', color: metricColor('topKg'), unit: ' kg', decimals: 1, points: tope },
              { id: 'rm', label: '1RM estimado', color: metricColor('tonnage'), unit: ' kg', decimals: 0, points: rm },
            ]}
            height={200}
            showArea={false}
            emptyMessage="Sin series con kilos todavía."
          />

          <div className="progresion-tabla" role="table" aria-label={`${name}: todos los microciclos`}>
            <div className="progresion-fila is-head" role="row" style={{ gridTemplateColumns: `56px 88px repeat(${series}, minmax(0, 1fr))` }}>
              <span>Sem.</span>
              <span>Fecha</span>
              {Array.from({ length: series }, (_, i) => (
                <span key={i}>Serie {i + 1}</span>
              ))}
            </div>
            {sesiones.map((s, fila) => (
              <div key={s.week} className={`progresion-fila${s.week === weekNumber ? ' is-actual' : ''}`} role="row" style={{ gridTemplateColumns: `56px 88px repeat(${series}, minmax(0, 1fr))` }}>
                <span className="progresion-sem">S{s.week}</span>
                <span className="progresion-fecha">{s.date ? shortDate(s.date) : '—'}</span>
                {Array.from({ length: series }, (_, i) => {
                  const set = s.sets[i];
                  if (!set) return <span key={i} className="progresion-celda is-vacia">·</span>;
                  const kg = numero(set.kg);
                  const antes = numero(sesiones[fila - 1]?.sets[i]?.kg);
                  const tono = kg !== null && antes !== null ? (kg > antes ? 'is-sube' : kg < antes ? 'is-baja' : '') : '';
                  return (
                    <span key={i} className={`progresion-celda${tono ? ` ${tono}` : ''}`}>
                      <b>{set.kg ?? '—'}</b>×{set.reps ?? '—'}
                      {set.rir !== null && set.rir !== undefined && set.rir !== '' && <small>@{set.rir}</small>}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};
