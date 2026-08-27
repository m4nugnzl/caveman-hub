import { useRef, useState } from 'react';
import { Check, ChevronDown, MoreHorizontal } from 'lucide-react';

import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';

/**
 * Un botón con menú, el mismo en toda la aplicación.
 *
 * Nació en la hoja de Entreno y es el menú de cualquier fila de mando: con
 * etiqueta es un botón silencioso con su flecha («+ comida ▾»); sin etiqueta
 * es el «···» de más acciones. Los ítems son `{ label, icon, danger, on, run }`;
 * un `null` en la lista pinta un separador.
 *
 * `on` (true/false) convierte el ítem en un AJUSTE que se marca: la casilla de
 * verificación va delante y el ítem se lee como «esto está puesto». Es la forma
 * de sacar de la pantalla los interruptores que se tocan una vez al mes sin
 * esconder en qué estado están. Mismo popover y mismos ítems en todas partes:
 * nada de controles nativos.
 */
export const MenuAcciones = ({ label = null, items, alineado = 'derecha', ariaLabel, clase = null, sinFlecha = false }) => {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setAbierto(false), abierto);
  const menu = useDismissable(abierto);
  /* Primero fuera los huecos (`undefined`, `false`), luego los separadores sobrantes. */
  const limpios = items.filter((it) => it !== undefined && it !== false);
  const visibles = limpios.filter((it, i, arr) => !(it === null && (i === 0 || i === arr.length - 1 || arr[i - 1] === null)));

  return (
    <div ref={ref} className="menu-acciones">
      <button
        type="button"
        className={clase || (label ? 'btn btn-quiet btn-sm' : 'btn btn-icon')}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={label || ariaLabel || 'Más acciones'}
        onClick={() => setAbierto((v) => !v)}
      >
        {label ? (
          <>
            {label}
            {!sinFlecha && <ChevronDown size={13} aria-hidden="true" />}
          </>
        ) : (
          <MoreHorizontal size={16} />
        )}
      </button>
      {menu.mounted && (
        <div
          ref={menu.ref}
          className={`popover${alineado === 'derecha' ? ' popover-right' : ''} menu-acciones-popover`}
          data-state={menu.closing ? 'closing' : 'open'}
          role="menu"
        >
          {visibles.map((it, i) =>
            it === null ? (
              <hr key={`sep-${i}`} className="menu-sep" />
            ) : (
              <button
                key={it.label}
                type="button"
                role={it.on === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.on === undefined ? undefined : it.on}
                className={`menu-item${it.danger ? ' menu-item-danger' : ''}${it.on === undefined ? '' : ' menu-item-toggle'}${it.on ? ' is-on' : ''}`}
                onClick={() => {
                  setAbierto(false);
                  it.run();
                }}
              >
                {it.on !== undefined && <Check size={14} className="menu-check" aria-hidden="true" />}
                {it.icon && <it.icon size={15} aria-hidden="true" />} {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};
