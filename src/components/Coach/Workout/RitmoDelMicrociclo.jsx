import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

import { cadenaDe } from '@/domain/training';
import { useCapaFlotante } from '@/lib/useCapaFlotante';
import { useDismissable } from '@/lib/useDismissable';
import { useEsTelefono } from '@/lib/useMediaQuery';
import { Hoja } from '@/components/ui/Hoja';
import { EditorDelMicrociclo } from './EditorDelMicrociclo';

/**
 * EL RITMO DEL MICROCICLO, en la barra de arriba de la vista de bloque.
 *
 *     M1  M2 · en curso  + microciclo │ ●●○ ●●○ ●●○ ▾   + hoja
 *
 * SOLO LOS PUNTOS —uno por día, lleno si se entrena y hueco si se descansa—,
 * agrupados por tanda y con más aire entre grupos que entre puntos. La cadena
 * escrita («2-1») decía exactamente lo mismo que los puntos y en el mismo
 * renglón: vive dentro del editor, donde además se escribe. Aquí queda en el
 * rótulo del ratón y en el nombre accesible del mando.
 *
 * Abre el editor entero (`EditorDelMicrociclo`): popover en el escritorio, hoja
 * inferior en el teléfono. Nada fijo en la página: la vista del bloque es de
 * las hojas, y dónde cae cada una ya lo dice (y lo cambia) el rótulo de su
 * columna.
 *
 * Mide lo mismo que los demás mandos de la barra porque ES la misma caja que
 * «+ hoja» (`.tira-mas`), con sus puntos dentro.
 *
 * El popover del escritorio NO sube al top layer (`capaSuperior: false`): el
 * editor pregunta antes de pisar un día ocupado, y el diálogo de esa pregunta
 * tiene que verse por encima. Sale por un portal y lleva su `z-index`.
 *
 * Y se alinea por el canto DERECHO de la pastilla (`alineado: 'derecha'`). Con
 * el canto izquierdo, un editor que mide lo que mide su contenido se iba por la
 * derecha de la ventana y la colocación lo empujaba de vuelta, así que acababa
 * lejos del mando que lo abre. La pastilla vive en la punta derecha de la
 * barra: es ese canto el que tienen en común.
 */
export const RitmoDelMicrociclo = ({ microciclo, hojas, onCambiar, onQuitarHoja = null, diaEnCurso = null }) => {
  const esTelefono = useEsTelefono();
  const [abierto, setAbierto] = useState(false);
  const botonRef = useRef(null);
  const vida = useDismissable(abierto && !esTelefono);
  const capa = useCapaFlotante(vida.mounted, botonRef, vida.ref, { alineado: 'derecha', capaSuperior: false });

  /* Se cierra al pulsar fuera, pero «fuera» no es lo que el propio editor abre
     encima: su menú de un día (top layer, dentro de la capa en el DOM), el
     diálogo que pregunta antes de pisar un día y el aviso con su Deshacer. */
  useEffect(() => {
    if (!abierto || esTelefono) return undefined;
    const fuera = (e) => {
      const t = e.target;
      if (vida.ref.current?.contains(t) || botonRef.current?.contains(t)) return;
      if (t.closest?.('.modal-backdrop, .toast, .micro-menu')) return;
      setAbierto(false);
    };
    /* En burbuja: el menú de un día y el diálogo cortan Escape antes, en
       captura, y así cierra la capa de arriba y solo esa. */
    const tecla = (e) => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      botonRef.current?.focus();
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto, esTelefono, vida.ref]);

  if (!microciclo) return null;
  const { dias } = microciclo;
  const rotativo = microciclo.tipo === 'rotativo';
  const texto = rotativo ? cadenaDe(dias) : `${dias.length} días`;

  /* Los puntos van en grupos por tanda —un hueco tras cada descanso—, que es
     como se lee «2-1 2-1 3-1» sin tener que contar. En semanal, un grupo. */
  const grupos = dias.reduce((gs, d, i) => {
    const corte = rotativo && i > 0 && !d.descanso && dias[i - 1].descanso;
    if (i === 0 || corte) gs.push([]);
    gs[gs.length - 1].push(d);
    return gs;
  }, []);

  const editor = (
    <EditorDelMicrociclo
      microciclo={microciclo}
      hojas={hojas}
      onCambiar={onCambiar}
      onQuitarHoja={onQuitarHoja}
      diaEnCurso={diaEnCurso}
    />
  );

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        className="tira-mas micro-ritmo"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={`Microciclo ${rotativo ? 'rotativo' : 'semanal'}: ${texto}`}
        title={rotativo ? `Rotativo, tandas ${texto}` : 'Semanal, de lunes a domingo'}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="micro-ritmo-puntos" aria-hidden="true">
          {grupos.map((g, k) => (
            <span key={k} className="micro-ritmo-tanda">
              {g.map((d, j) => (
                <span key={j} className={`micro-ritmo-punto${d.descanso ? ' is-descanso' : ''}`} />
              ))}
            </span>
          ))}
        </span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {esTelefono ? (
        <Hoja abierta={abierto} onCerrar={() => setAbierto(false)} etiqueta="Microciclo">
          <div className="micro-en-hoja">{editor}</div>
        </Hoja>
      ) : (
        vida.mounted &&
        createPortal(
          <div
            ref={vida.ref}
            className="popover micro-pop"
            style={capa.estilo}
            data-state={vida.closing ? 'closing' : 'open'}
            role="dialog"
            aria-label="Microciclo"
          >
            {editor}
          </div>,
          document.body,
        )
      )}
    </>
  );
};
