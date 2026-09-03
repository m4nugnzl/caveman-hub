import { useMemo } from 'react';

import { mealsForVariant, rescaleMeals } from '@/domain/nutrition';
import { Modal } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/primitives';

/**
 * LA VISTA PREVIA DEL REESCALADO: qué gramos se moverían para cuadrar el menú
 * con el objetivo que se acaba de guardar.
 *
 * ══ Por qué hay vista previa y no un «se ha reajustado» ═════════════════════
 *
 * Porque toca la comida de una persona en veinte sitios a la vez. El cálculo es
 * del dominio (`rescaleMeals`) y sus reglas están ahí escritas —proteína y
 * unidades quietas, redondeo de cocina—; lo que esta ventana añade es la última
 * mirada: cada gramo que va a cambiar, dicho antes de escribir nada. Quien
 * prefiera cuadrar a mano cierra y cuadra como siempre — el objetivo ya quedó
 * guardado, esto solo ofrece la aritmética.
 *
 * Nada se aplica hasta pulsar el botón, y aplicar lleva su «Deshacer» (lo pone
 * quien llama, que es quien guarda el menú anterior).
 */
export const ReescalarMenu = ({ plan, variant, fromKcals, toKcals, onApply, onClose }) => {
  const meals = mealsForVariant(plan, variant);
  const res = useMemo(() => rescaleMeals(meals, { fromKcals, toKcals }), [meals, fromKcals, toKcals]);

  /* Agrupado por comida y opción, que es como se va a comprobar contra la hoja. */
  const grupos = useMemo(() => {
    if (!res) return [];
    const porSitio = new Map();
    for (const c of res.cambios) {
      const clave = `${c.meal} · opción ${c.option}`;
      if (!porSitio.has(clave)) porSitio.set(clave, []);
      porSitio.get(clave).push(c);
    }
    return [...porSitio.entries()];
  }, [res]);

  /* Sin nada que mover —todo proteína y unidades— no hay ventana que enseñar:
     el objetivo ya está guardado y el menú se cuadra a mano, como siempre. */
  if (!res) return null;

  return (
    <Modal
      title={`Reajustar el menú a ${toKcals} kcal`}
      onClose={onClose}
      footer={
        <div className="row gap-2">
          <button type="button" className="btn btn-primary" onClick={() => onApply(res.meals)}>
            Aplicar al menú
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Dejarlo como está
          </button>
        </div>
      }
    >
      <div className="col gap-4">
        <p className="t-sm t-secondary" style={{ margin: 0 }}>
          El objetivo pasó de {fromKcals} a {toKcals} kcal. Esto escala los hidratos y las grasas
          de cada opción en la misma proporción; la proteína y lo que se cuenta por unidades no se
          tocan, y los gramos se redondean a medida de cocina.
        </p>

        <div className="col gap-3">
          {grupos.map(([sitio, cambios]) => (
            <div className="card-inset col gap-2" key={sitio}>
              <span className="t-sm" style={{ fontWeight: 650 }}>{sitio}</span>
              <div className="col gap-1">
                {cambios.map((c) => (
                  <div className="row between gap-2 t-sm" key={`${sitio}-${c.food}`}>
                    <span className="t-secondary">{c.food}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {c.from} → <b>{c.to} g</b>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {res.sinTocar.length > 0 && (
          <Notice tone="info">
            {res.sinTocar.length === 1
              ? `«${res.sinTocar[0].meal}» (opción ${res.sinTocar[0].option}) no tiene hidratos ni grasas que mover y se queda como está.`
              : `${res.sinTocar.length} opciones no tienen hidratos ni grasas que mover y se quedan como están.`}
          </Notice>
        )}
      </div>
    </Modal>
  );
};
