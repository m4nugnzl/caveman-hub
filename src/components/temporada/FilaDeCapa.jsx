import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';

const PULSACION_LARGA = 450;

/**
 * UNA FILA DE LA GRÁFICA con su nombre a la izquierda (24 sep 2026).
 *
 * En reposo, solo el nombre. Al pasar el ratón por él (o con el foco, o con
 * una pulsación larga en táctil), un menú mínimo pegado al nombre: subir,
 * bajar y quitar. El peso no se quita. El nombre no es parte del lienzo: no
 * mueve la vista ni pone el cursor.
 *
 * @param abierta si el menú está abierto por una pulsación larga.
 * @param onAbrir abre (`true`) o cierra (`false`) el menú táctil.
 */
export const FilaDeCapa = ({ capa, alto, primera, ultima, abierta, onAbrir, onMover, onQuitar, arriba = false, children }) => {
  const espera = useRef(null);
  const ref = useRef(null);
  const parar = () => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
  };
  useEffect(() => parar, []);

  /* Abierto con el dedo, se cierra al tocar fuera. */
  useEffect(() => {
    if (!abierta) return undefined;
    const fuera = (e) => {
      if (!ref.current?.contains(e.target)) onAbrir(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierta, onAbrir]);

  const alBajar = (e) => {
    e.stopPropagation();
    if (e.pointerType !== 'touch') return;
    parar();
    espera.current = setTimeout(() => {
      espera.current = null;
      navigator.vibrate?.(8);
      onAbrir(true);
    }, PULSACION_LARGA);
  };
  const mandos = [
    !primera && { id: 'subir', icono: ArrowUp, dice: `Subir ${capa.nombre}`, run: () => onMover(-1) },
    !ultima && { id: 'bajar', icono: ArrowDown, dice: `Bajar ${capa.nombre}`, run: () => onMover(1) },
    !capa.fija && { id: 'quitar', icono: X, dice: `Quitar ${capa.nombre}`, run: onQuitar },
  ].filter(Boolean);

  return (
    <div className={`tl-fila${abierta ? ' is-abierta' : ''}`} style={{ '--alto': `${alto}px` }}>
      <div
        ref={ref}
        className={`tl-fila-nombre${arriba ? ' is-arriba' : ''}`}
        onPointerDown={alBajar}
        onPointerUp={parar}
        onPointerCancel={parar}
        onPointerLeave={parar}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.pointerType === 'touch' && e.preventDefault()}
      >
        <span className="tl-fila-texto" title={capa.nombre}>
          {capa.nombre}
        </span>
        {mandos.length > 0 && (
          <span className="tl-fila-menu" role="group" aria-label={`Fila ${capa.nombre}`}>
            {mandos.map((m) => (
              <button
                key={m.id}
                type="button"
                className="tl-fila-boton"
                aria-label={m.dice}
                title={m.dice}
                onClick={(e) => {
                  e.stopPropagation();
                  m.run();
                }}
              >
                <m.icono size={13} aria-hidden="true" />
              </button>
            ))}
          </span>
        )}
      </div>
      {children}
    </div>
  );
};
