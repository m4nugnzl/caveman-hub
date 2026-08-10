import { ArrowRight, CheckCircle2, CircleDashed, RotateCw, Settings } from 'lucide-react';

import { clampInt } from '@/lib/num';
import { Field, Panel, SegmentedControl } from '@/components/ui/primitives';

const CYCLE_OPTIONS = [
  { id: 'weekly', label: 'Semanal', hint: 'Atada a lunes–domingo' },
  { id: 'rotating', label: 'Rotativa', tone: 'tone-cyan', hint: 'Ciclo que se repite sin fin' },
];

/** Cadena visual del patrón: Entreno → Entreno → Descanso → … */
const PatternChain = ({ pattern }) => {
  const items = [
    ...Array.from({ length: pattern.train }, (_, i) => ({ key: `t${i}`, train: true })),
    ...Array.from({ length: pattern.rest }, (_, i) => ({ key: `r${i}`, train: false })),
  ];

  return (
    <div className="row wrap gap-2">
      <span className="t-sm t-secondary" style={{ fontWeight: 700 }}>
        Patrón:
      </span>
      {items.map((item, index) => (
        <span className="row gap-2" key={item.key}>
          <span
            className="badge"
            style={
              item.train
                ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                : { background: 'var(--fill-subtle)', color: 'var(--text-secondary)' }
            }
          >
            {item.train ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
            {item.train ? 'Entreno' : 'Descanso'}
          </span>
          {index < items.length - 1 && <ArrowRight size={13} color="var(--text-tertiary)" />}
        </span>
      ))}
    </div>
  );
};

export const CycleSettings = ({ client, open, onToggle, onChange, saveIndicator }) => {
  const cycleType = client.cycleType || 'weekly';
  const pattern = client.cyclePattern || { train: 2, rest: 1 };

  return (
    <Panel tight className="col gap-4">
      <div className="row between wrap gap-3">
        <div className="row gap-3">
          <span
            style={{
              background: 'var(--info-soft)',
              padding: 8,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <RotateCw size={19} color="var(--data-blue)" />
          </span>
          <div>
            <span className="section-label">Estructura del programa</span>
            <h4 style={{ fontSize: '1.02rem', fontWeight: 800 }}>
              {cycleType === 'weekly' ? 'Semana natural (lunes–domingo)' : 'Ciclo rotativo ininterrumpido'}
            </h4>
          </div>
        </div>

        <div className="row gap-3 wrap">
          {saveIndicator}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onToggle} aria-expanded={open}>
            <Settings size={15} /> Configurar
          </button>
        </div>
      </div>

      {cycleType === 'rotating' && !open && <PatternChain pattern={pattern} />}

      {open && (
        <>
          <hr className="divider" />
          <div className="row-end wrap gap-5">
            <Field label="Tipo de estructura">
              <SegmentedControl
                value={cycleType}
                onChange={(value) => onChange({ cycleType: value })}
                options={CYCLE_OPTIONS}
                label="Tipo de estructura"
              />
            </Field>

            {cycleType === 'rotating' && (
              <>
                <Field label="Días de entreno" className="shrink-0">
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      inputMode="numeric"
                      className="input input-center"
                      style={{ width: 84 }}
                      value={pattern.train}
                      onChange={(e) =>
                        onChange({
                          cyclePattern: { ...pattern, train: clampInt(e.target.value, 1, 14, 1) },
                        })
                      }
                    />
                  )}
                </Field>
                <Field label="Días de descanso" className="shrink-0">
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      inputMode="numeric"
                      className="input input-center"
                      style={{ width: 84 }}
                      value={pattern.rest}
                      onChange={(e) =>
                        onChange({
                          cyclePattern: { ...pattern, rest: clampInt(e.target.value, 0, 14, 0) },
                        })
                      }
                    />
                  )}
                </Field>
              </>
            )}
          </div>
        </>
      )}
    </Panel>
  );
};
