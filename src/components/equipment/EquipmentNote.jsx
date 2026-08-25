import { Dumbbell, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useData } from '@/context/AppContext';
import { muscleColor } from '@/domain/training';
import { byMuscle, equipmentHeadline } from '@/domain/equipment';
import { fieldText } from '@/domain/profile';
import { Fold } from '@/components/ui/primitives';
import { Thumb } from '@/components/photos/Thumb';

/**
 * Su maquinaria, en la pantalla donde se programa.
 *
 * ══ Por qué esto es la mitad que importa ═══════════════════════════════════
 *
 * Guardar las fotos en la ficha no cambia nada por sí solo: seguirían estando en
 * «otro sitio», solo que el otro sitio ya no sería Drive. Lo que cambia el
 * trabajo es tenerlas AQUÍ, plegadas encima del programa, mientras se elige el
 * ejercicio del jueves.
 *
 * Es el mismo razonamiento que `ConditionsNote`: un dato que hay que ir a buscar
 * llega después de la decisión.
 *
 * ── Cerrado de partida y con el recuento en el titular ──────────────────────
 * Quien programa cada semana ya se sabe el gimnasio de su cliente; quien acaba
 * de cogerlo, no. El titular dice cuántas hay y de cuántos grupos, así que
 * cerrado ya informa, y abrirlo es un clic — a diferencia de los condicionantes,
 * aquí no hay nada que pueda ser un veto, así que nunca se abre solo.
 */
export const EquipmentNote = () => {
  const { equipment, activeClient } = useData();
  const tandas = byMuscle(equipment);
  const carpeta = fieldText(activeClient?.profile, 'gymFolder');

  /* Sin fotos y sin carpeta no se dice nada. Un hueco permanente con un estado
     vacío encima del programa es cromo que se lee una vez y estorba mil. */
  if (tandas.length === 0 && !carpeta) return null;

  return (
    <Fold
      icon={Dumbbell}
      title="Su maquinaria"
      summary={equipmentHeadline(equipment) || 'En tu carpeta de fuera'}
    >
      {tandas.length > 0 ? (
        <div className="col gap-4">
          {tandas.map((tanda) => (
            <div key={tanda.group} className="col gap-2">
              <span className="section-label" style={{ color: muscleColor(tanda.group) }}>
                {tanda.group} · {tanda.items.length}
              </span>
              <div className="gym-grid">
                {tanda.items
                  .filter((pieza) => pieza.url)
                  .map((pieza) => (
                    <figure key={pieza.id} className="gym-shot">
                      <Thumb url={pieza.url} alt={pieza.name || tanda.group} width={320} />
                      {pieza.name && (
                        <figcaption className="t-2xs t-tertiary">{pieza.name}</figcaption>
                      )}
                    </figure>
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="t-sm t-secondary">
          Sus fotos están fuera de la aplicación. Puedes subirlas a su ficha y tenerlas aquí sin
          cambiar de pestaña.
        </p>
      )}

      <p className="t-xs t-tertiary">
        {carpeta && (
          <>
            <a href={carpeta} target="_blank" rel="noreferrer noopener">
              <ExternalLink size={11} /> Abrir su carpeta
            </a>
            {' · '}
          </>
        )}
        Se suben y se ordenan en su <Link to={`/c/${activeClient?.id}/ficha`}>ficha</Link>.
      </p>
    </Fold>
  );
};
