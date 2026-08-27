import { ArrowRightLeft } from 'lucide-react';

import { MACROS, displayAsUnits, hasUnits, unitsLabel } from '@/domain/nutrition';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/primitives';

/**
 * La ración de un equivalente, en las palabras del alimento.
 *
 * Si se cuenta en piezas, la pieza va delante y los gramos detrás entre
 * paréntesis —«1,5 manzanas (250 g)»—: es como se va a servir, y los gramos
 * quedan para quien pesa. La conversión es la de siempre (`unitsLabel`).
 */
const racion = ({ food, grams }) => {
  const pseudo = { grams, unitLabel: food.unitLabel ?? null, unitGrams: food.unitGrams ?? null };
  return hasUnits(pseudo) ? `${unitsLabel(pseudo)} (${grams} g)` : `${grams} g`;
};

/**
 * Las equivalencias de un alimento de la dieta, como diálogo.
 *
 * ══ La misma lista para los dos, con un verbo de diferencia ═════════════════
 *
 * Es la tabla de intercambios de toda la vida —«150 g de plátano ≈ 250 g de
 * manzana»— calculada desde la propia dieta, así que nunca se desactualiza ni
 * vive en un PDF aparte.
 *
 * · El ENTRENADOR la usa montando: «Usar» sustituye el alimento con los gramos
 *   ya cuadrados, en su sitio.
 * · El CLIENTE la consulta: está en la frutería sin plátanos y necesita saber
 *   cuántas fresas son. Solo lee — su plan sigue siendo lo estipulado, y por
 *   eso aquí no hay ningún botón que lo cambie.
 *
 * Las kcal de cada ración se enseñan a propósito: igualar el macro del grupo
 * deja libres los otros dos, y esa diferencia es información que el que elige
 * debe ver, no un desajuste que esconder.
 */
export const FoodEquivalences = ({
  food,
  equivalences,
  onSwap,
  /* La excepción por alimento: si ESTA lista se le enseña al cliente. Solo
     existe programando (`onSetVisible`), y aquí y no en la fila porque es aquí
     donde se está mirando lo que el cliente vería. */
  onSetVisible,
  clientSwapsOn = false,
  onClose,
}) => {
  const macro = MACROS.find((m) => m.key === equivalences.macro);
  const nombre = (macro?.label || '').toLowerCase();
  const cantidad = displayAsUnits(food) ? `${unitsLabel(food)} (${food.grams} g)` : `${food.grams} g`;

  return (
    <Modal title={`Equivalencias de ${food.name}`} onClose={onClose}>
      <div className="col gap-4">
        <p className="t-sm t-secondary">
          {/* La cuenta a la vista: de dónde sale la lista. Sin esto, los gramos
              de abajo parecen sacados de una tabla mágica. */}
          <strong>{cantidad}</strong> de {food.name.toLowerCase()} aportan{' '}
          <strong>
            {equivalences.macroGrams} g de {nombre}
          </strong>
          . Estas raciones aportan lo mismo:
        </p>

        <ul className="equiv-list">
          {equivalences.items.map((item) => (
            <li key={item.food.id || item.food.name} className="equiv-row">
              <span className="who">
                <span className="name">{item.food.name}</span>
                {/* Las DOS cifras que definen el cambio: los gramos del macro
                    del grupo y las kcal, cada una con lo que se separa de la
                    tuya. La ración se elige cuadrando ambas, así que enseñar
                    solo una escondería en qué se pagó la otra. En tinta de dato;
                    el color, solo en las diferencias. */}
                <span className="sub">
                  {item.macroGrams} g de {nombre}
                  {item.macroDiff ? <b className={`dif${item.macroDiff > 0 ? ' is-mas' : ' is-menos'}`}>{item.macroDiff > 0 ? '+' : ''}{item.macroDiff}</b> : null}
                  <span className="sep">·</span>
                  {item.kcal} kcal
                  {item.kcalDiff ? <b className={`dif${item.kcalDiff > 0 ? ' is-mas' : ' is-menos'}`}>{item.kcalDiff > 0 ? '+' : ''}{item.kcalDiff}</b> : null}
                </span>
                {item.gramsKcal && (
                  <span className="sub equiv-kcal">
                    {onSwap ? (
                      <button
                        type="button"
                        className="equiv-kcal-usar"
                        onClick={() => onSwap({ ...item, grams: item.gramsKcal })}
                        aria-label={`Cambiar ${food.name} por ${item.gramsKcal} g de ${item.food.name}, con las mismas kcal`}
                      >
                        o {item.gramsKcal} g para las mismas kcal
                      </button>
                    ) : (
                      `o ${item.gramsKcal} g para las mismas kcal`
                    )}
                  </span>
                )}
              </span>
              <span className="amount">{racion(item)}</span>
              {onSwap && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => onSwap(item)}
                  aria-label={`Cambiar ${food.name} por ${racion(item)} de ${item.food.name}`}
                >
                  <ArrowRightLeft size={13} /> Usar
                </button>
              )}
            </li>
          ))}
        </ul>

        <p className="t-xs t-tertiary">
          {onSwap
            ? `Cada ración se ajusta para cuadrar a la vez ${nombre} y kcal: manda el macro del grupo, con un margen del 10 % para no descuadrar el día.`
            : `Cualquiera de estas raciones vale por la tuya: llevan ${nombre} y kcal muy parecidas. La pequeña diferencia va escrita debajo de cada una.`}
        </p>

        {/*
          ── Si el cliente ve ESTA lista ──────────────────────────────────────
          La regla general la pone el módulo «Equivalencias en la dieta» del
          protocolo; esto es la excepción de este alimento en esta comida: las
          nueces con margen, los cornflakes son esos y no otros. Con el módulo
          apagado el interruptor se enseña igualmente pero inerte, diciendo
          dónde se enciende lo general — un control que desaparece sin explicar
          por qué enseña a desconfiar de la pantalla.
        */}
        {onSetVisible && (
          <Switch
            label="Tu cliente ve esta lista"
            hint={
              clientSwapsOn
                ? 'Apágalo si este alimento en concreto no admite cambio.'
                : 'Ahora mismo no ve ninguna: enciende «Equivalencias en la dieta», encima del menú.'
            }
            checked={!food.equivHidden}
            disabled={!clientSwapsOn}
            onChange={(visible) => onSetVisible(visible)}
          />
        )}
      </div>
    </Modal>
  );
};
