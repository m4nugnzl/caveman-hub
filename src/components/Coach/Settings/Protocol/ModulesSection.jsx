import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { MODULES, isModuleOn, isServiceOn, toggleModule } from '@/domain/protocol';
import { Panel, Switch } from '@/components/ui/primitives';

/**
 * Los módulos: lo que esté apagado no existe, ni al programar ni al entrenar.
 *
 * ── Solo las piezas de lo que le llevas ────────────────────────────────────
 * Un módulo cuelga de una sección (`area`), y a quien no le llevas nutrición no
 * se le puede encender «Equivalencias en la dieta»: es una pieza de una parte
 * del producto que esa persona no tiene. Se enseñaba igual, y encenderla no
 * hacía nada en ningún sitio. Lo guardado no se toca —vuelve a aparecer tal
 * cual si se recupera el servicio—, solo deja de ofrecerse.
 *
 * ── Y en el carril, plegadas ───────────────────────────────────────────────
 * Con `plegable` el bloque se resume en una línea que dice lo que hay
 * encendido, y se abre para tocarlo. No es esconder: el resumen NOMBRA lo que
 * está apagado, que es lo único que se necesita saber de un vistazo. Se usa
 * donde estos interruptores son el contexto y no el trabajo (la pantalla de
 * protocolos, cuyo trabajo son las acciones).
 */
export const ModulesSection = ({ protocol, onSave, plegable = false }) => {
  const [abierto, setAbierto] = useState(false);

  const piezas = MODULES.filter((mod) => isServiceOn(protocol, mod.area));
  const apagadas = piezas.filter((mod) => !isModuleOn(protocol, mod.id));

  const lista = (
    <ul className="proto-modules">
      {piezas.map((mod) => (
        <li key={mod.id}>
          <Switch
            label={mod.label}
            hint={mod.hint}
            checked={isModuleOn(protocol, mod.id)}
            onChange={() => onSave(toggleModule(protocol, mod.id))}
          />
        </li>
      ))}
    </ul>
  );

  if (!plegable) {
    return (
      <Panel title="Las piezas, una a una" sub="Enciende solo lo que vayas a usar.">
        {lista}
      </Panel>
    );
  }

  return (
    <div className="col gap-2">
      <button
        type="button"
        className="proto-toggle"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="grow">Las piezas</span>
        <span className="t-xs t-tertiary">
          {apagadas.length === 0
            ? `las ${piezas.length}`
            : `${piezas.length - apagadas.length} de ${piezas.length}`}
        </span>
      </button>

      {abierto ? (
        lista
      ) : (
        apagadas.length > 0 && (
          <p className="t-xs t-tertiary">
            Apagado: {apagadas.map((m) => m.label).join(', ')}.
          </p>
        )
      )}
    </div>
  );
};
