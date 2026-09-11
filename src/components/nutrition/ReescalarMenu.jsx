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
 *
 * ══ Y ahora reescala por DOS medidas ═══════════════════════════════════════
 *
 * Por kcal es el ajuste de siempre: bajas el objetivo del día y bajan hidratos
 * y grasas. Por HIDRATOS es la operación de un ciclado —duplicas «Alto», le
 * quitas cien gramos de hidratos y se mueve solo la fuente de hidratos, con la
 * proteína Y LAS GRASAS quietas—. Sin la segunda, montar un alto/bajo obligaba a
 * recorrer las veinte filas a mano, que es exactamente lo que esta ventana
 * existe para evitar.
 *
 * Es la misma ventana porque es la misma pregunta y la misma respuesta: qué
 * gramos se van a mover. Lo único que cambia son las palabras, y salen del
 * propio cálculo (`res.unidad`, `res.sinNada`).
 *
 * @param {'kcals'|'carbs'} medida  Con qué se reescala.
 * @param {number} from  El valor anterior de esa medida.
 * @param {number} to    El nuevo.
 */
export const ReescalarMenu = ({ plan, variant, medida = 'kcals', from, to, onApply, onClose }) => {
  const meals = mealsForVariant(plan, variant);
  const porHidratos = medida === 'carbs';
  const res = useMemo(
    () =>
      rescaleMeals(
        meals,
        porHidratos ? { fromCarbs: from, toCarbs: to } : { fromKcals: from, toKcals: to }
      ),
    [meals, porHidratos, from, to]
  );

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
      title={porHidratos ? `Reajustar el menú a ${to} g de hidratos` : `Reajustar el menú a ${to} kcal`}
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
          El objetivo pasó de {from} a {to} {res.unidad}.{' '}
          {porHidratos
            ? 'Esto mueve solo las fuentes de hidratos de cada opción, en la misma proporción; la proteína, las grasas y lo que se cuenta por unidades no se tocan.'
            : 'Esto escala los hidratos y las grasas de cada opción en la misma proporción; la proteína y lo que se cuenta por unidades no se tocan.'}{' '}
          Los gramos se redondean a medida de cocina.
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
              ? `«${res.sinTocar[0].meal}» (opción ${res.sinTocar[0].option}) ${res.sinNada} y se queda como está.`
              : `${res.sinTocar.length} opciones ${res.sinNada.replace('tiene', 'tienen')} y se quedan como están.`}
          </Notice>
        )}
      </div>
    </Modal>
  );
};
