import { mealsForVariant, planDays, targetsFor } from '@/domain/nutrition';
import { localeNumber } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/primitives';

/**
 * QUITAR UN DÍA DE LA DIETA: qué se lleva por delante.
 *
 * ══ Qué era antes, y por qué ya no vale ════════════════════════════════════
 *
 * Era `UnaSolaDieta`: un diálogo que solo podía existir con exactamente dos
 * días —«¿con cuál de las dos te quedas?»— y que se abría desde un interruptor
 * escondido en los ajustes del plan. Con N días la pregunta ya no es cuál se
 * queda: es cuál se va, y eso ya lo ha dicho quien pulsó su «···».
 *
 * ══ Por qué sigue habiendo una ventana y no una confirmación seca ══════════
 *
 * Porque quitar un día se lleva SU MENÚ, y eso son seis comidas montadas a
 * mano. Un «¿seguro?» no dice qué hay dentro de lo que se va, y ese es el único
 * dato con el que se puede decidir. Aquí se enseña: cuántas comidas y qué
 * objetivo tenía.
 *
 * ── El «Deshacer» sí existe ───────────────────────────────────────────────
 * Lo pone quien llama (`NutritionModule`), capturando el plan entero antes de
 * escribir. Esta ventana avisa igualmente: un aviso pasajero se pierde si te
 * levantas de la silla, y el menú que se va no.
 */
export const QuitarElDia = ({ open, plan, dia, cerrado, onClose, onConfirm }) => {
  const comidas = mealsForVariant(plan, dia?.id).length;
  const kcal = targetsFor(plan, dia?.id).targetKcals;
  const quedan = planDays(plan).filter((d) => d.id !== dia?.id);

  const dentro = [
    cerrado ? `${comidas} ${comidas === 1 ? 'comida' : 'comidas'}` : null,
    kcal ? `${localeNumber(Math.round(kcal))} kcal` : null,
  ].filter(Boolean);

  return (
    <Modal
      open={open}
      title={`Quitar «${dia?.name || 'este día'}»`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            Quitar el día
          </button>
        </>
      }
    >
      <div className="col gap-4">
        <p className="t-sm t-secondary">
          {dentro.length > 0
            ? `Este día lleva ${dentro.join(' y ')}. Se va con su menú y con su objetivo.`
            : 'Este día está vacío: no se lleva nada por delante.'}
        </p>

        {/* Con qué se queda esta persona. Es la otra mitad de la decisión: quitar
            el día que era su dieta entera no es lo mismo que quitar el tercero de
            un ciclado, y la lista lo dice sin tener que explicarlo. */}
        <p className="t-sm t-secondary">
          Se queda con{' '}
          {quedan.length === 1
            ? `${quedan[0].name.toLowerCase()}, que pasa a ser su dieta.`
            : `${quedan.length} días: ${quedan.map((d) => d.name.toLowerCase()).join(', ')}.`}
        </p>

        <Notice tone="warn">
          Si esta persona tenía la semana repartida, los días que apuntaban a este
          se quedan sin asignar. Puedes deshacerlo desde el aviso, justo después.
        </Notice>
      </div>
    </Modal>
  );
};
