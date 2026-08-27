import { useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';
import { SegmentedControl, Switch } from '@/components/ui/primitives';

/**
 * LOS AJUSTES DEL PLAN, con controles de verdad.
 *
 * ══ Qué había antes ═════════════════════════════════════════════════════════
 *
 * Los cuatro ajustes eran cuatro líneas de texto en el «···», marcadas con una
 * casilla. Tres cosas fallaban:
 *
 *   1. Las dos primeras —«menú cerrado» y «plan por macros»— son UNA elección
 *      con dos caras, no dos interruptores. Puestas como dos casillas marcables,
 *      parecía que se podían tener las dos o ninguna.
 *   2. Lo marcado se pinta en el color de acento, así que lo que estaba PUESTO
 *      salía en rojo y lo que no, en blanco: se leía al revés, y tres líneas
 *      rojas seguidas parecen un aviso.
 *   3. Ninguna decía qué hace. «Plan por macros, sin menú» es media explicación
 *      y «Dos dietas: entreno y descanso», un titular.
 *
 * ══ Lo que hay ahora ════════════════════════════════════════════════════════
 *
 * El mismo sitio —estos ajustes se tocan una vez al mes y no merecen una fila
 * permanente en la pantalla— pero un PANEL en vez de una lista: la elección del
 * tipo de plan es un carril de dos opciones con su explicación debajo, que
 * cambia según cuál esté puesta, y lo que sí son interruptores son
 * interruptores, con su letra pequeña diciendo qué encienden.
 *
 * El botón deja de ser el «···» de más acciones y pasa a ser el de ajustes: lo
 * que hay aquí dentro no son cosas que se hacen, son cosas que se configuran.
 */
export const AjustesPlan = ({
  cerrado,
  onTipo,
  dosDietas,
  onDosDietas,
  equivalencias,
  onEquivalencias,
}) => {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setAbierto(false), abierto);
  const pop = useDismissable(abierto);

  return (
    <div ref={ref} className="menu-acciones">
      <button
        type="button"
        className="btn btn-icon"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label="Ajustes del plan"
        title="Ajustes del plan"
        onClick={() => setAbierto((v) => !v)}
      >
        <SlidersHorizontal size={16} />
      </button>

      {pop.mounted && (
        <div
          ref={pop.ref}
          className="popover popover-right ajustes-plan"
          data-state={pop.closing ? 'closing' : 'open'}
        >
          <div className="ajustes-plan-grupo">
            <span className="ajustes-plan-k">Cómo se le pauta</span>
            <SegmentedControl
              ancho
              label="Tipo de plan"
              value={cerrado ? 'closed' : 'macros'}
              onChange={onTipo}
              options={[
                { id: 'closed', label: 'Menú cerrado' },
                { id: 'macros', label: 'Por macros' },
              ]}
            />
            <p className="ajustes-plan-pie">
              {cerrado
                ? 'Le montas las comidas una a una, con sus alimentos y sus alternativas.'
                : 'Solo el objetivo de kcal y macros: qué come lo decide él.'}
            </p>
          </div>

          <hr className="menu-sep" />

          <div className="ajustes-plan-grupo">
            {/* Encenderlo cambia la pantalla entera —aparecen dos objetivos y
                dos menús—: es un ajuste del plan que se queda puesto. */}
            <Switch
              label="Dos dietas"
              hint="Una para los días de entreno y otra para los de descanso."
              checked={dosDietas}
              onChange={onDosDietas}
            />
            {/* Solo con menú cerrado: sin alimentos pautados no hay nada por lo
                que cambiar nada. */}
            {cerrado && (
              <Switch
                label="El cliente ve las equivalencias"
                hint="En su app puede cambiar un alimento por otro del mismo grupo."
                checked={equivalencias}
                onChange={onEquivalencias}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
