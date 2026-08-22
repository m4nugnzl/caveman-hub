import { MODULES, isModuleOn, toggleModule } from '@/domain/protocol';
import { OptionCard, Panel } from '@/components/ui/primitives';

/** Los módulos: lo que esté apagado no existe, ni al programar ni al entrenar. */
export const ModulesSection = ({ protocol, onSave }) => (
  <Panel title="Las piezas, una a una" sub="Enciende solo lo que vayas a usar.">
    {/* Una tarjeta por módulo. Antes era `.proto-module` —una caja que se
        iluminaba al marcar— con una casilla del sistema dentro: dos formas
        de decir lo mismo, y la de dentro pintada por el navegador. La
        tarjeta ya es el control. */}
    <ul className="proto-modules">
      {MODULES.map((mod) => (
        <li key={mod.id}>
          <OptionCard
            label={mod.label}
            hint={mod.hint}
            checked={isModuleOn(protocol, mod.id)}
            onChange={() => onSave(toggleModule(protocol, mod.id))}
          />
        </li>
      ))}
    </ul>
  </Panel>
);
