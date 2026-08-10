import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

import { foodMacros, mealKcalRange, optionMacros } from '@/domain/nutrition';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { AddFoodControl } from './AddFoodControl';
import { MACRO_META, MacroRing } from './macros';

/**
 * Encabezado de la tabla de alimentos.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Antes cada fila llevaba escrito «P 38  C 85  G 8». Con cinco alimentos eran
 * quince letras repetidas que no informaban de nada y que hacían leer las cifras
 * como texto en lugar de como una columna.
 *
 * Las etiquetas van una sola vez, aquí, y con el color de su macro: los mismos
 * del anillo de arriba, de modo que la tabla y el gráfico son el mismo lenguaje.
 */
const FoodTableHead = ({ editable }) => (
  <div className="food-head" aria-hidden="true">
    <span>Alimento</span>
    <span>Cantidad</span>
    {MACRO_META.map(({ key, short, color }) => (
      <span key={key} style={{ color }}>
        {short}
      </span>
    ))}
    <span>Kcal</span>
    {editable && <span />}
  </div>
);

const CELL = ['is-p', 'is-c', 'is-f'];

/** Un alimento: solo números, alineados con el encabezado. */
const FoodRow = ({ food, editable, onGrams, onRemove }) => {
  const macros = foodMacros(food);

  return (
    <div className="food-row">
      <span className="name">{food.name}</span>

      <span className="grams">
        {editable ? (
          <input
            type="text"
            inputMode="decimal"
            className="input input-sm input-center"
            style={{ width: 58 }}
            value={food.grams ?? ''}
            onChange={(e) => onGrams(e.target.value)}
            aria-label={`Gramos de ${food.name}`}
          />
        ) : (
          <span className="fixed">{food.grams}</span>
        )}
        <span className="unit">g</span>
      </span>

      {MACRO_META.map(({ key, short, label }, index) => (
        <span
          key={key}
          className={`n ${CELL[index]}`}
          data-macro={short}
          aria-label={`${label} de ${food.name}`}
        >
          {Math.round(macros[key])}
        </span>
      ))}

      <span className="kcal">{Math.round(macros.kcal)}</span>

      {editable && (
        <button
          type="button"
          className="btn btn-icon btn-icon-danger del"
          style={{ width: 26, height: 26 }}
          onClick={onRemove}
          aria-label={`Quitar ${food.name}`}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
};

/**
 * Una comida del menú cerrado.
 *
 * Dos niveles, no tres: la comida es una tarjeta, **las opciones son pestañas**
 * —lo que además comunica que se elige UNA, no todas— y los alimentos son cajas
 * flotantes. Antes eran cajas dentro de cajas dentro de cajas.
 *
 * El mismo componente sirve al entrenador y al cliente; `editable` decide.
 */
export const MealCard = ({
  meal,
  editable = false,
  foodLibrary = [],
  onRenameMeal,
  onRemoveMeal,
  onAddOption,
  onRemoveOption,
  onAddFood,
  onRemoveFood,
  onGrams,
}) => {
  const confirm = useConfirm();
  const [activeOption, setActiveOption] = useState(0);
  const [editingName, setEditingName] = useState(false);

  const options = meal.options || [];
  const index = Math.min(activeOption, Math.max(0, options.length - 1));
  const option = options[index];
  const kcal = mealKcalRange(meal);
  const totals = optionMacros(option);
  const foods = option?.foods || [];

  const askRemoveMeal = async () => {
    const ok = await confirm({
      title: `¿Eliminar «${meal.name}»?`,
      message: `Se borrarán sus ${options.length} ${options.length === 1 ? 'opción' : 'opciones'} y todos sus alimentos.`,
      confirmLabel: 'Eliminar comida',
      tone: 'danger',
    });
    if (ok) onRemoveMeal();
  };

  const askRemoveOption = async () => {
    const ok = await confirm({
      title: `¿Eliminar la opción ${index + 1}?`,
      message: `Se borrarán sus ${foods.length} alimentos.`,
      confirmLabel: 'Eliminar opción',
      tone: 'danger',
    });
    if (ok) {
      onRemoveOption(index);
      setActiveOption(Math.max(0, index - 1));
    }
  };

  return (
    <article className="meal">
      <header className="meal-head">
        {editingName && editable ? (
          <input
            autoFocus
            className="input grow"
            style={{ fontWeight: 650 }}
            value={meal.name}
            onChange={(e) => onRenameMeal(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
            aria-label="Nombre de la comida"
          />
        ) : (
          <h4 className="meal-title">
            {meal.name}
            {editable && (
              <button
                type="button"
                className="btn btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={() => setEditingName(true)}
                aria-label={`Renombrar ${meal.name}`}
              >
                <Pencil size={12} />
              </button>
            )}
          </h4>
        )}

        <div className="row gap-2 shrink-0">
          <span className="meal-kcal">
            {kcal.first} kcal
            {kcal.varies && (
              <span className="t-xs" style={{ opacity: 0.75, fontWeight: 550 }}>
                {' '}
                ({kcal.min}–{kcal.max})
              </span>
            )}
          </span>
          {editable && (
            <button
              type="button"
              className="btn btn-icon btn-icon-danger"
              onClick={askRemoveMeal}
              aria-label={`Eliminar ${meal.name}`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </header>

      {(options.length > 1 || editable) && (
        <div className="rail" role="tablist" aria-label={`Opciones de ${meal.name}`}>
          {options.map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              className="chip"
              aria-pressed={i === index}
              aria-selected={i === index}
              onClick={() => setActiveOption(i)}
            >
              Opción {i + 1}
              <span className="t-xs" style={{ opacity: 0.75 }}>
                {Math.round(optionMacros(opt).kcal)}
              </span>
            </button>
          ))}
          {editable && (
            <button type="button" className="chip chip-dashed" onClick={onAddOption}>
              <Plus size={13} /> Alternativa
            </button>
          )}
        </div>
      )}

      {options.length > 1 && !editable && (
        <p className="t-xs t-tertiary">
          Elige UNA de las {options.length} opciones, la que mejor te encaje ese día.
        </p>
      )}

      {/*
        El reparto de ESTA opción, como anillo.
        --------------------------------------------------------------------
        Es lo que permite ver de un vistazo si una opción está desequilibrada y
        comparar dos alternativas de la misma comida sin hacer cuentas: dos
        anillos con el mismo lenguaje al lado. El total del día usa una barra
        —otra forma para otra escala— y la diferencia es intencionada.
      */}
      {foods.length > 0 && (
        <div className="card-inset">
          <MacroRing
            protein={totals.protein}
            carbs={totals.carbs}
            fats={totals.fats}
            kcals={totals.kcal}
            size={86}
            caption={options.length > 1 ? `Opción ${index + 1} de ${options.length}` : undefined}
          />
        </div>
      )}

      {foods.length === 0 ? (
        <p className="t-sm t-secondary">
          {editable ? 'Sin alimentos todavía.' : 'Tu entrenador no ha detallado esta opción.'}
        </p>
      ) : (
        <div className="food-table">
          <FoodTableHead editable={editable} />
          {foods.map((food) => (
            <FoodRow
              key={food.id}
              food={food}
              editable={editable}
              onGrams={(grams) => onGrams(index, food.id, grams)}
              onRemove={() => onRemoveFood(index, food.id)}
            />
          ))}
        </div>
      )}

      {editable && (
        <div className="row between wrap gap-2">
          <div className="grow" style={{ minWidth: 210 }}>
            <AddFoodControl foodLibrary={foodLibrary} onAdd={(food) => onAddFood(index, food)} />
          </div>
          {options.length > 1 && (
            <button type="button" className="btn btn-danger btn-sm" onClick={askRemoveOption}>
              <Trash2 size={13} /> Quitar opción {index + 1}
            </button>
          )}
        </div>
      )}
    </article>
  );
};
