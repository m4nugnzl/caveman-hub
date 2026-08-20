import { useState } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import { WEEK_DAYS } from '@/domain/training';
import { Panel, SectionTitle } from '@/components/ui/primitives';

/**
 * Qué se entrena cada día de la semana natural. Solo tiene sentido con
 * `cycleType: 'weekly'`; en ciclo rotativo no hay semana a la que atarse.
 *
 * ══ Plegable, y en el móvil empieza plegado ═════════════════════════════════
 * Es configuración que se toca cada varias semanas, y en un móvil sus siete
 * filas eran una pantalla entera ANTES del primer ejercicio — recorriendo la
 * rutina a 390 px, el preámbulo medía más que el día. La cabecera resume lo que
 * el editor diría («4 días de entreno») y se abre cuando toca cambiarlo. En
 * escritorio empieza abierto: allí cabe en una fila y plegarlo sería esconderlo.
 * El estado inicial se decide una vez al montar, como la bandeja de «Hoy».
 */
export const WeeklySplitEditor = ({ split, onChange }) => {
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 1023.98px)').matches
  );

  const dias = WEEK_DAYS.filter(
    (day) => (split?.[day] ?? 'Descanso').trim().toLowerCase() !== 'descanso'
  ).length;

  return (
    <Panel tight className="col gap-4">
      <button type="button" className="panel-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <SectionTitle icon={Calendar}>
          Planificación semanal
        </SectionTitle>
        <span className="t-xs t-tertiary">
          {dias === 0 ? 'sin días de entreno' : `${dias} ${dias === 1 ? 'día' : 'días'} de entreno`}
        </span>
        <ChevronRight size={15} className="chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="split-grid">
          {WEEK_DAYS.map((day) => {
            const value = split?.[day] ?? 'Descanso';
            const isRest = value.trim().toLowerCase() === 'descanso';
            return (
              <div className="col gap-1" key={day}>
                <label className="section-label" style={{ textAlign: 'center' }} htmlFor={`split-${day}`}>
                  {day}
                </label>
                <input
                  id={`split-${day}`}
                  className="input input-center"
                  style={{
                    background: isRest ? 'var(--surface-sunken)' : 'var(--accent-soft)',
                    borderColor: isRest ? 'var(--hairline)' : 'var(--accent)',
                    color: isRest ? 'var(--text-secondary)' : 'var(--accent)',
                    fontSize: 'var(--fs-sm)',
                  }}
                  value={value}
                  onChange={(e) => onChange(day, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
};
