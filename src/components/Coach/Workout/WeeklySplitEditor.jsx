import { Calendar } from 'lucide-react';
import { WEEK_DAYS } from '@/domain/training';
import { Panel, SectionTitle } from '@/components/ui/primitives';

/**
 * Qué se entrena cada día de la semana natural. Solo tiene sentido con
 * `cycleType: 'weekly'`; en ciclo rotativo no hay semana a la que atarse.
 *
 * En móvil la rejilla de 7 columnas pasa a scroll horizontal (.split-grid en
 * index.css) en vez de comprimir cada día a 40 px ilegibles.
 */
export const WeeklySplitEditor = ({ split, onChange }) => (
  <Panel tight className="col gap-4">
    <SectionTitle icon={Calendar}>
      Planificación semanal
    </SectionTitle>

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
  </Panel>
);
