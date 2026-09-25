import { useRef, useState } from 'react';
import { Check, ChevronDown, MoreHorizontal } from 'lucide-react';

import { useCapaFlotante } from '@/lib/useCapaFlotante';
import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';

/**
 * Un botón con menú, el mismo en toda la aplicación.
 *
 * Nació en la hoja de Entreno y es el menú de cualquier fila de mando: con
 * etiqueta es un botón silencioso con su flecha («+ comida ▾»); sin etiqueta
 * es el «···» de más acciones. Los ítems son
 * `{ label, icon, danger, on, run, desactivado, titulo }`; un `null` en la
 * lista pinta un separador.
 *
 * `desactivado` apaga el ítem sin retirarlo, con su porqué en el rótulo del
 * ratón (`titulo`): un menú que cambia de ítems según el estado hay que volver
 * a aprenderlo cada vez, y «no se puede, y por esto» informa donde la ausencia
 * solo deja una duda. Lo estrenó «Quitar el bloque» con un único bloque.
 *
 * `on` (true/false) convierte el ítem en un AJUSTE que se marca: la casilla de
 * verificación va delante y el ítem se lee como «esto está puesto». Es la forma
 * de sacar de la pantalla los interruptores que se tocan una vez al mes sin
 * esconder en qué estado están. Mismo popover y mismos ítems en todas partes:
 * nada de controles nativos.
 *
 * `sub` cuelga un dato en voz baja al canto derecho del ítem. Existe porque
 * este menú pasó a ser también un NAVEGADOR —los bloques del programa, los
 * microciclos del bloque— y ahí el nombre solo no basta para elegir: hace
 * falta desde cuándo va, cuánto duró o cuántos entrenamientos lleva. En un
 * menú de acciones no se usa: una acción se nombra, no se describe.
 *
 * `descriptivo` es la tercera cosa que este menú acabó siendo: un SELECTOR DE
 * CLASE —qué disparador, qué verbo— donde el `sub` ya no es un dato de tres
 * palabras sino la frase que explica en qué se diferencia una opción de otra.
 * Al canto derecho eso no cabe: `.menu-sub` no se encoge, así que el techo de
 * 380 px lo pagaba el rótulo —«Cuando se la mandes tú» partido en cuatro
 * renglones de una palabra— mientras la frase se quedaba entera al otro lado.
 * Con `descriptivo` la frase baja DEBAJO del rótulo, que es donde se lee una
 * explicación, y el menú puede ser más ancho porque ya no compite consigo mismo.
 */
/**
 * `alineado` y `hacia` son PREFERENCIAS, no órdenes: el menú sube al top layer
 * (`useCapaFlotante`), y allí se ciñe a la ventana y vuelca de lado cuando no
 * cabe. `hacia="arriba"` sigue existiendo para los menús que viven al pie —la
 * mano del portapapeles—, donde abrir hacia abajo es lo que nunca se quiere
 * aunque quepa por los pelos.
 */
export const MenuAcciones = ({
  label = null,
  items,
  alineado = 'derecha',
  hacia = 'abajo',
  ariaLabel,
  clase = null,
  sinFlecha = false,
  descriptivo = false,
  /* El rótulo del ratón, cuando el visible no se basta: una casilla del ciclo
     dice «D4» y hace falta saber qué día le toca sin abrir el menú. */
  titulo = null,
}) => {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setAbierto(false), abierto);
  const menu = useDismissable(abierto);
  /* El ancla es el envoltorio y no el botón: mide lo mismo —`.menu-acciones` se
     ciñe a él— y así el menú sigue pegado aunque un día el botón lleve algo al
     lado. */
  const capa = useCapaFlotante(menu.mounted, ref, menu.ref, { alineado, hacia });
  /* Primero fuera los huecos (`undefined`, `false`), luego los separadores sobrantes. */
  const limpios = items.filter((it) => it !== undefined && it !== false);
  const visibles = limpios.filter((it, i, arr) => !(it === null && (i === 0 || i === arr.length - 1 || arr[i - 1] === null)));

  return (
    <div ref={ref} className="menu-acciones">
      <button
        type="button"
        className={clase || (label ? 'btn btn-secondary btn-sm' : 'btn btn-icon')}
        aria-haspopup="menu"
        aria-expanded={abierto}
        /* `ariaLabel` MANDA sobre `label`: quien pasa los dos lo hace porque el
           rótulo visible no se basta —«+ comida» frente a «Añadir comida», o un
           rótulo que no es texto sino dos piezas («LUN · Push A»), que como
           nombre accesible saldría convertido en un objeto—. Iba al revés y los
           tres sitios que pasaban `ariaLabel` con `label` lo tenían ignorado. */
        aria-label={ariaLabel || label || 'Más acciones'}
        {...(titulo ? { title: titulo } : {})}
        onClick={() => setAbierto((v) => !v)}
      >
        {label ? (
          <>
            {label}
            {!sinFlecha && <ChevronDown size={13} aria-hidden="true" />}
          </>
        ) : (
          <MoreHorizontal size={15} />
        )}
      </button>
      {menu.mounted && (
        <div
          ref={menu.ref}
          className={`popover${alineado === 'derecha' ? ' popover-right' : ''}${
            hacia === 'arriba' ? ' popover-arriba' : ''
          } menu-acciones-popover${descriptivo ? ' es-descriptivo' : ''}`}
          style={capa.estilo}
          {...capa.atributos}
          data-state={menu.closing ? 'closing' : 'open'}
          role="menu"
        >
          {visibles.map((it, i) =>
            it === null ? (
              <hr key={`sep-${i}`} className="menu-sep" />
            ) : it.grupo ? (
              /* `{ grupo }` rotula lo que sigue: un menú agrupado («Pauta»,
                 «Sensaciones»…), sin ser un ítem. */
              <p key={`grupo-${it.grupo}`} className="menu-grupo" role="presentation">
                {it.grupo}
              </p>
            ) : (
              <button
                key={it.label}
                type="button"
                role={it.on === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.on === undefined ? undefined : it.on}
                className={`menu-item${it.danger ? ' menu-item-danger' : ''}${it.on === undefined ? '' : ' menu-item-toggle'}${it.on ? ' is-on' : ''}`}
                disabled={it.desactivado || undefined}
                {...(it.titulo ? { title: it.titulo } : {})}
                onClick={() => {
                  setAbierto(false);
                  it.run();
                }}
              >
                {it.on !== undefined && <Check size={15} className="menu-check" aria-hidden="true" />}
                {it.icon && <it.icon size={15} aria-hidden="true" />}{' '}
                {descriptivo ? (
                  <span className="menu-texto">
                    <span className="menu-nm">{it.label}</span>
                    {it.sub && <span className="menu-sub">{it.sub}</span>}
                  </span>
                ) : (
                  <>
                    {it.label}
                    {it.sub && <span className="menu-sub">{it.sub}</span>}
                  </>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};
