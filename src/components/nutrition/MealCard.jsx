import { useState } from 'react';
import { Edit3, Plus, Trash2 } from 'lucide-react';

import { foodMacros, mealKcalRange, optionMacros } from '@/domain/nutrition';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { AddFoodControl } from './AddFoodControl';

/**
 * Una comida del menú cerrado.
 *
 * ── El problema de estructura que resuelve ──────────────────────────────────
 * Antes esto eran tres niveles de cajas anidadas: la comida contenía una caja
 * por cada opción, y cada opción una caja por cada alimento. Con tres comidas y
 * dos opciones cada una, la pantalla era una sucesión de rectángulos dentro de
 * rectángulos donde no se distinguía qué pertenecía a qué.
 *
 * Ahora hay dos niveles:
 *   · Las opciones son PESTAÑAS. Además de aplanar el anidamiento, comunica lo
 *     que de verdad significan: se elige UNA, no se comen todas.
 *   · Los alimentos son una TABLA con columnas alineadas (gramos, P, C, G,
 *     kcal). Comparar dos alimentos o revisar que los macros cuadran era
 *     imposible cuando cada uno era una fila con su propio formato.
 *
 * El mismo componente sirve para el entrenador y para el cliente: `editable`
 * decide si se puede tocar. Antes eran dos renderizados distintos del mismo
 * dato, con aspecto diferente.
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
    <article className="meal-card">
      {/* ── Cabecera: nombre y kcal ── */}
      <header className="meal-card-head">
        {editingName && editable ? (
          <input
            autoFocus
            className="input grow"
            style={{ fontWeight: 800, fontSize: '1rem' }}
            value={meal.name}
            onChange={(e) => onRenameMeal(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
            aria-label="Nombre de la comida"
          />
        ) : (
          <h4 className="meal-card-title">
            {meal.name}
            {editable && (
              <button
                type="button"
                className="btn btn-icon"
                style={{ width: 26, height: 26 }}
                onClick={() => setEditingName(true)}
                aria-label={`Renombrar ${meal.name}`}
              >
                <Edit3 size={12} />
              </button>
            )}
          </h4>
        )}

        <div className="row gap-2 shrink-0">
          <span className="meal-card-kcal">
            {kcal.first} kcal
            {kcal.varies && (
              <span className="text-xs" style={{ opacity: 0.7, fontWeight: 600 }}>
                {' '}
                ({kcal.min}–{kcal.max} según la opción)
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

      {/* ── Pestañas de opción ── */}
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
              <span className="text-xs" style={{ opacity: 0.75 }}>
                {Math.round(optionMacros(opt).kcal)} kcal
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
        <p className="text-xs text-dim">
          Elige UNA de las {options.length} opciones, la que mejor te encaje ese día.
        </p>
      )}

      {/* ── Tabla de alimentos ── */}
      {foods.length === 0 ? (
        <p className="text-sm text-muted">
          {editable ? 'Sin alimentos todavía.' : 'Tu entrenador no ha detallado esta opción.'}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="table table-compact">
            <caption className="sr-only">
              Alimentos de {meal.name}, opción {index + 1}
            </caption>
            <thead>
              <tr>
                <th scope="col">Alimento</th>
                <th scope="col" className="num">Gramos</th>
                <th scope="col" className="num">P</th>
                <th scope="col" className="num">C</th>
                <th scope="col" className="num">G</th>
                <th scope="col" className="num">Kcal</th>
                {editable && <th scope="col" className="num"><span className="sr-only">Quitar</span></th>}
              </tr>
            </thead>
            <tbody>
              {foods.map((food) => {
                const macros = foodMacros(food);
                return (
                  <tr key={food.id}>
                    <td style={{ fontWeight: 700 }}>{food.name}</td>
                    <td className="num">
                      {editable ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          className="input input-center input-sm"
                          style={{ width: 64 }}
                          value={food.grams ?? ''}
                          onChange={(e) => onGrams(index, food.id, e.target.value)}
                          aria-label={`Gramos de ${food.name}`}
                        />
                      ) : (
                        <strong>{food.grams} g</strong>
                      )}
                    </td>
                    <td className="num text-muted">{macros.protein.toFixed(0)}</td>
                    <td className="num text-muted">{macros.carbs.toFixed(0)}</td>
                    <td className="num text-muted">{macros.fats.toFixed(0)}</td>
                    <td className="num" style={{ fontWeight: 800, color: 'var(--accent-amber)' }}>
                      {Math.round(macros.kcal)}
                    </td>
                    {editable && (
                      <td className="num">
                        <button
                          type="button"
                          className="btn btn-icon btn-icon-danger"
                          onClick={() => onRemoveFood(index, food.id)}
                          aria-label={`Quitar ${food.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="meal-card-totals">
                <td style={{ fontWeight: 800 }}>Total</td>
                <td className="num" />
                <td className="num">{totals.protein.toFixed(0)}</td>
                <td className="num">{totals.carbs.toFixed(0)}</td>
                <td className="num">{totals.fats.toFixed(0)}</td>
                <td className="num" style={{ color: 'var(--accent-amber)' }}>
                  {Math.round(totals.kcal)}
                </td>
                {editable && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editable && (
        <div className="row between wrap gap-2">
          <div className="grow" style={{ minWidth: 220 }}>
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
