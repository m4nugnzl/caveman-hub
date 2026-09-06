import { useState } from 'react';
import { Dumbbell, Moon } from 'lucide-react';

import { mealsForVariant, targetsFor } from '@/domain/nutrition';
import { localeNumber } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { Notice, OptionCard } from '@/components/ui/primitives';

/**
 * VOLVER A UNA SOLA DIETA: con cuál se queda.
 *
 * ══ Por qué hay que preguntar ══════════════════════════════════════════════
 *
 * Apagar «dos dietas» era bajar una bandera y ya. Pero la dieta única y las dos
 * de variante viven en campos distintos, así que al apagarla la pantalla volvía
 * a enseñar lo de ANTES de separarlas —normalmente nada— y las dos dietas
 * montadas se quedaban guardadas sin ninguna puerta por la que volver a verlas.
 * El entrenador se encontraba la pantalla en blanco y volvía a montar el menú
 * entero de cero.
 *
 * No es una confirmación de «¿seguro?»: es la pregunta que faltaba. Juntar dos
 * dietas en una obliga a decir cuál es esa una, y no hay forma de acertarla
 * adivinando —el día de entreno tiene más calorías, pero el de descanso puede
 * ser el que se acaba de ajustar—.
 *
 * ── Se enseña lo que hay en cada una ───────────────────────────────────────
 * Comidas y kcal de cada variante, antes de elegir. Elegir a ciegas entre dos
 * cosas que se llaman «entreno» y «descanso» es lo mismo que no elegir.
 */
export const UnaSolaDieta = ({ open, plan, cerrado, onClose, onConfirm }) => {
  const [quedarse, setQuedarse] = useState('training');

  const resumen = (id) => {
    const comidas = mealsForVariant(plan, id).length;
    const kcal = targetsFor(plan, id).targetKcals;
    return [
      cerrado ? `${comidas} ${comidas === 1 ? 'comida' : 'comidas'}` : null,
      kcal ? `${localeNumber(Math.round(kcal))} kcal` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const descartada = quedarse === 'rest' ? 'training' : 'rest';
  const cual = (id) => (id === 'rest' ? 'de descanso' : 'de entreno');

  return (
    <Modal
      open={open}
      title="Volver a una sola dieta"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(quedarse)}>
            Dejar solo esta
          </button>
        </>
      }
    >
      <div className="col gap-4">
        <p className="t-sm t-secondary">
          Este cliente tiene dos dietas. Al juntarlas se queda una: elige cuál sigue siendo su dieta.
        </p>

        {/* Las dos con lo que tienen dentro, a la vez: si hay que cambiar de
            opción para saber qué lleva cada una, no se elige, se adivina. */}
        <div className="opt-group" role="group" aria-label="Con cuál se queda">
          <OptionCard
            icon={Dumbbell}
            label="Días de entreno"
            hint={resumen('training') || 'Sin nada escrito.'}
            checked={quedarse === 'training'}
            onChange={() => setQuedarse('training')}
          />
          <OptionCard
            icon={Moon}
            label="Días de descanso"
            hint={resumen('rest') || 'Sin nada escrito.'}
            checked={quedarse === 'rest'}
            onChange={() => setQuedarse('rest')}
          />
        </div>

        <Notice tone="warn">
          Se queda la dieta {cual(quedarse)}, con su menú y su objetivo. La {cual(descartada)} se
          descarta; si vuelves a separarlas más adelante, se parte de la que te quedes.
        </Notice>
      </div>
    </Modal>
  );
};
