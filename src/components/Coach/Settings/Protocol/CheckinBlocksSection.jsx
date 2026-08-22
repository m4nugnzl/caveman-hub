import { CHECKIN_BLOCKS, CHECKIN_MODES, checkinMode, setCheckinMode } from '@/domain/protocol';
import { Panel, SegmentedControl } from '@/components/ui/primitives';

/**
 * Qué mide cada check-in. Es lo mismo que los módulos —qué existe para este
 * cliente— con una posición más: aquí se puede además EXIGIR.
 */
export const CheckinBlocksSection = ({ protocol, onSave }) => (
  <Panel
    title="Qué se mide"
    sub="El peso siempre se pide. Estos dos los decides tú."
  >
    <div className="proto-blocks">
      {CHECKIN_BLOCKS.map((bloque) => {
        const modo = checkinMode(protocol, bloque.id);
        return (
          <div className="proto-block" key={bloque.id}>
            <span className="col" style={{ gap: 1, minWidth: 0 }}>
              <span className="t-sm" style={{ fontWeight: 600 }}>
                {bloque.label}
              </span>
              <span className="t-xs t-tertiary">{bloque.hint}</span>
            </span>

            <SegmentedControl
              value={modo}
              onChange={(siguiente) => onSave(setCheckinMode(protocol, bloque.id, siguiente))}
              options={CHECKIN_MODES.map((m) => ({ id: m.id, label: m.label }))}
              label={`Cómo se pide: ${bloque.label}`}
            />

            {/* Lo que significa el estado elegido, debajo y en una línea. Tres
                palabras sueltas —«Obligatorio · Opcional · Apagado»— no dicen qué
                cambia para el cliente, que es lo único que se está decidiendo. */}
            <span className="say t-2xs t-tertiary">
              {CHECKIN_MODES.find((m) => m.id === modo)?.hint}
            </span>
          </div>
        );
      })}
    </div>
  </Panel>
);
