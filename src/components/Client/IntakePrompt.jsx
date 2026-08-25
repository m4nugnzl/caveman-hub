import { Camera, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useData } from '@/context/AppContext';
import { Panel } from '@/components/ui/primitives';

/**
 * «Tu entrenador espera algo de ti»: la puerta a su alta.
 *
 * ══ Por qué aparece y desaparece ═══════════════════════════════════════════
 *
 * Porque una entrada permanente para una tarea que se hace UNA vez es cromo el
 * resto del tiempo. Es el mismo criterio con el que `ClientUpdates` vive encima
 * de esta misma pantalla: los avisos se encuentran, no se van a buscar, y
 * desaparecen solos cuando no hay nada.
 *
 * Con fotos subidas deja de pintarse. Si su entrenador quiere más, se lo pide —
 * y el sitio para subirlas sigue existiendo en `/mi/alta`, solo que ya no ocupa
 * la portada de nadie.
 *
 * ══ Por qué esto NO es una tarjeta que navega ══════════════════════════════
 *
 * `docs/producto.md` §5.6 lo prohíbe, y con razón: una tarjeta que lleva a otro
 * sitio no se distingue de una que enseña algo. Aquí la tarjeta CUENTA lo que
 * hace falta y quien navega es el enlace de dentro, que se lee como un enlace.
 */
export const IntakePrompt = ({ client }) => {
  const { equipment } = useData();

  /* Ya ha mandado sus fotos: nada que pedirle. La comprobación es «hay alguna» y
     no «hay suficientes» a propósito — cuántas son suficientes lo sabe su
     entrenador, no esta pantalla. */
  if (equipment.length > 0) return null;

  return (
    <Panel title="Te falta esto" className="col gap-3">
      <div className="row between wrap gap-3">
        <div className="col gap-1" style={{ minWidth: 0 }}>
          <span className="row gap-2 t-sm" style={{ fontWeight: 600 }}>
            <Camera size={15} /> Las fotos de tu gimnasio
          </span>
          <span className="t-xs t-tertiary">
            {client?.name ? `${client.name}, con` : 'Con'} ellas te montan la rutina con las
            máquinas que de verdad tienes, en vez de con las que suele haber.
          </span>
        </div>

        <Link className="btn btn-primary btn-sm" to="/mi/alta">
          Subirlas <ChevronRight size={14} />
        </Link>
      </div>
    </Panel>
  );
};
