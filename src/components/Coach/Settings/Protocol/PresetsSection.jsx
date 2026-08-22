import { Check } from 'lucide-react';

import { PROTOCOL_PRESETS, matchingPreset } from '@/domain/protocol';
import { Panel } from '@/components/ui/primitives';

/**
 * Perfiles de partida: cada uno responde a una forma de llevar clientes.
 *
 * ── La marca, y por qué hacía falta ─────────────────────────────────────────
 * El estado elegido lo llevaba SOLO el color del canto, que en una rejilla de
 * cuatro cajas iguales es la diferencia más fácil de no ver —y en el tema claro,
 * un gris contra otro—. Ahora la tarjeta activa lleva su tic, igual que el resto
 * de controles del producto (`OptionCard`).
 *
 * Y cuando no coincide ninguno se DICE, en la cabecera del bloque: si no,
 * afinar un perfil apaga las cuatro tarjetas y parece que se ha perdido algo.
 */
export const PresetsSection = ({ protocol, onSave }) => {
  const preset = matchingPreset(protocol);

  return (
    <Panel
      title="Empieza por un perfil"
      sub="Un punto de partida. Debajo puedes afinar lo que quieras."
      action={
        !preset && <span className="t-2xs t-tertiary">Ahora no coincide con ninguno</span>
      }
    >
      <div className="proto-presets">
        {PROTOCOL_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="proto-preset"
            aria-pressed={preset?.id === item.id}
            onClick={() => onSave({ ...protocol, ...item.protocol })}
          >
            <span className="mark" aria-hidden="true">
              <Check size={12} strokeWidth={3} />
            </span>
            <span className="nm">{item.label}</span>
            <span className="hint">{item.hint}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
};
