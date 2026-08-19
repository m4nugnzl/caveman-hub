import { useMemo, useState } from 'react';
import { Copy, Footprints, HeartPulse, Plus, Salad } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { dayKcalRange, dayKcals, emptyNutrition, mealsForVariant, targetsFor } from '@/domain/nutrition';
import { mergeCatalog } from '@/domain/catalog';
import {
  GroupHead,
  Notice,
  PageHead,
  Panel,
  SaveIndicator,
  SegmentedControl,
  Switch,
} from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { MacroTargetCard } from '@/components/nutrition/MacroTargetCard';
import { MealCard } from '@/components/nutrition/MealCard';
import { DietNotes } from '@/components/nutrition/DietNotes';
import { MealStructure } from '@/components/nutrition/MealStructure';
import { GoalCard } from '@/components/nutrition/GoalCard';

const DIET_TYPES = [
  { id: 'macros', label: 'Por macros' },
  { id: 'closed', label: 'Menú cerrado' },
];

const VARIANT_OPTIONS = [
  { id: 'training', label: 'Días de entreno' },
  { id: 'rest', label: 'Días de descanso' },
];

export const NutritionModule = () => {
  const {
    activeClient,
    nutrition,
    foodLibrary,
    catalogFoods,
    saveStatus,
    retrySave,
    updateNutrition,
    updateNutritionTargets,
    setHasDayVariants,
    addMeal,
    removeMeal,
    updateMealName,
    updateMealNote,
    updateMealTarget,
    copyVariantMeals,
    copyMealToVariant,
    copyOptionToVariant,
    moveMeal,
    moveFood,
    duplicateMeal,
    duplicateOption,
    addMealOption,
    removeMealOption,
    addFoodToOption,
    removeFoodFromOption,
    updateFoodGrams,
    setFoodDisplay,
    defineFoodUnit,
    upsertLibraryFood,
  } = useApp();

  const confirm = useConfirm();
  const plan = nutrition[activeClient.id] || emptyNutrition();
  const save = saveStatus('nutrition', activeClient.id);

  const [dietView, setDietView] = useState('training');
  const variant = plan.hasDayVariants ? dietView : 'default';
  const meals = mealsForVariant(plan, variant);

  const [copiado, setCopiado] = useState(null);

  const dayTotal = dayKcals(meals);
  const dayRange = dayKcalRange(meals);

  /*
    Tu biblioteca y el catálogo común, en una sola lista. Ver `domain/catalog.js`:
    lo tuyo gana cuando el nombre se repite, y lo que viene del catálogo se copia
    a tu biblioteca al elegirlo —por el mismo `upsertLibraryFood` de abajo, que ya
    lo hacía con los alimentos escritos a mano—.
  */
  const alimentosDisponibles = useMemo(
    () => mergeCatalog(foodLibrary, catalogFoods),
    [foodLibrary, catalogFoods]
  );

  // La variante que NO se está viendo, que es de donde se copia.
  const otraVariante = VARIANT_OPTIONS.find((v) => v.id !== dietView) || VARIANT_OPTIONS[0];

  /**
   * Traer el menú de la otra variante.
   *
   * Sustituye, así que se pregunta antes — y el mensaje dice explícitamente que
   * el objetivo de kcal y macros NO se toca: es lo que distingue a las dos
   * dietas, y alguien que espere que también se copie se llevaría una sorpresa
   * al día siguiente, cuando las cuentas del día de descanso no cuadren.
   */
  const traerLaOtra = async () => {
    const destino = VARIANT_OPTIONS.find((v) => v.id === dietView);
    const ok = await confirm({
      title: `¿Copiar de ${otraVariante.label.toLowerCase()}?`,
      message: `El menú de ${destino.label.toLowerCase()} pasará a ser una copia del de ${otraVariante.label.toLowerCase()}.`,
      detail:
        meals.length > 0
          ? 'Se SUSTITUYEN las comidas que hay ahora aquí. El objetivo de kcal y macros no se toca. No se puede deshacer.'
          : 'El objetivo de kcal y macros no se toca, solo las comidas.',
      confirmLabel: 'Copiar',
      tone: meals.length > 0 ? 'danger' : 'default',
    });
    if (!ok) return;
    copyVariantMeals(activeClient.id, otraVariante.id, dietView);
  };

  /**
   * Copiar al otro día ocurre EN LA OTRA PESTAÑA, así que no se ve.
   *
   * Sin decirlo, el gesto no tiene ninguna consecuencia visible y se lee como que
   * no ha funcionado — que es exactamente lo que lleva a pulsarlo tres veces y
   * acabar con tres cenas duplicadas. El aviso dice a dónde ha ido.
   */
  const avisarCopia = (nombre, texto) => {
    if (!nombre) return;
    setCopiado(`${texto} en ${otraVariante.label.toLowerCase()}.`);
  };

  /** Al elegir o crear un alimento se guarda también en la biblioteca del coach. */
  const handleAddFood = (mealIndex, optIndex, food) => {
    upsertLibraryFood(food);
    // Sin cantidad: la elige `buildFoodEntry` según el alimento —una unidad entera
    // si la tiene, 100 g si se pesa—. Fijar 100 aquí metía «casi dos huevos» cada
    // vez que se añadía uno.
    addFoodToOption(activeClient.id, variant, mealIndex, optIndex, food);
  };

  return (
    <div className="stack">
      <section className="col gap-4">
        <PageHead
          title="Plan nutricional"
          sub={`Objetivo, menú cerrado por alimentos y tus pautas para ${activeClient.name}.`}
          action={
            <div className="row gap-3 wrap">
              <SaveIndicator
                status={save.status}
                error={save.error}
                onRetry={() => retrySave('nutrition', activeClient.id)}
              />
              <SegmentedControl
                value={plan.type}
                onChange={(type) => updateNutrition(activeClient.id, { type })}
                options={DIET_TYPES}
                label="Tipo de dieta"
              />
            </div>
          }
        />

        {/* Un interruptor y no una casilla: esto no es «incluir esto en una
            operación», es un ajuste del plan que se queda puesto. Y encenderlo
            cambia la pantalla entera —aparecen dos objetivos y dos menús—, así
            que la pista dice qué va a pasar antes de tocarlo. */}
        <Switch
          label="Dos dietas distintas para días de entreno y de descanso"
          hint="Aparecerán dos objetivos de calorías y dos menús, uno para cada tipo de día."
          checked={Boolean(plan.hasDayVariants)}
          onChange={(on) => setHasDayVariants(activeClient.id, on)}
        />

        {/*
          Con variantes activas hay DOS objetivos, no uno: activar la opción
          implica que las calorías y el reparto de macros cambian entre un día de
          entreno y uno de descanso, que es justo el motivo de separarlos.
        */}
        {plan.hasDayVariants ? (
          <div className="grid-2">
            <MacroTargetCard
              plan={plan}
              variant="training"
              title="Objetivo · días de entreno"
              editable
              onSave={(fields) => updateNutritionTargets(activeClient.id, 'training', fields)}
            />
            <MacroTargetCard
              plan={plan}
              variant="rest"
              title="Objetivo · días de descanso"
              editable
              onSave={(fields) => updateNutritionTargets(activeClient.id, 'rest', fields)}
            />
          </div>
        ) : (
          <MacroTargetCard
            plan={plan}
            variant="default"
            title="Objetivo diario"
            editable
            onSave={(fields) => updateNutritionTargets(activeClient.id, 'default', fields)}
          />
        )}

        {/*
          La actividad, fuera de las tarjetas de objetivo y a lo ancho.

          Es del PLAN, no de una variante: con dos dietas vivía solo en la
          tarjeta de entreno —en la de descanso se escondía a mano— y quien
          empezara por el día de descanso no encontraba dónde ponerla. Aquí está
          una vez, valga para los días que valga.

          Y son DOS, porque el gasto tiene dos mitades que se prescriben por
          separado: la actividad de base —los pasos— y el trabajo duro. El
          segundo no existía en ningún campo, así que acababa escrito como una
          pauta suelta entre «bebe 2 L de agua», o directamente en WhatsApp.
        */}
        <GoalCard
          icon={Footprints}
          label="Pasos diarios"
          value={plan.stepsGoal}
          unit="pasos"
          placeholder="10000"
          numeric
          editable
          onSave={(stepsGoal) => updateNutrition(activeClient.id, { stepsGoal })}
        />

        <GoalCard
          icon={HeartPulse}
          label="Cardio de alta intensidad"
          value={plan.cardioGoal}
          placeholder="2 sesiones de 10 rondas 30/30 en bici"
          hint="Sesiones, duración y protocolo. Lo escribes como se lo dirías."
          editable
          onSave={(cardioGoal) => updateNutrition(activeClient.id, { cardioGoal })}
        />
      </section>

      {plan.type === 'closed' && (
        <section className="col gap-4">
          {/* Una TANDA de bloques, no otra pantalla: antes esto era un segundo
              `h2` idéntico al de arriba. Ver `GroupHead`. */}
          <GroupHead
            title="Menú estructurado"
            sub={
              meals.length === 0
                ? 'Sin comidas todavía.'
                : `${Math.round(dayTotal)} kcal/día con la primera opción de cada comida` +
                  (dayRange.min !== dayRange.max
                    ? ` · entre ${Math.round(dayRange.min)} y ${Math.round(dayRange.max)} según las opciones`
                    : '')
            }
          />

          {plan.hasDayVariants && (
            <div className="row gap-3 wrap">
              <SegmentedControl
                value={dietView}
                /* Al cambiar de día se borra el aviso: hablaba de lo que había
                   pasado en el otro, y ahora se está viendo. */
                onChange={(v) => {
                  setCopiado(null);
                  setDietView(v);
                }}
                options={VARIANT_OPTIONS}
                label="Variante de dieta"
              />

              {/*
                Traer el menú de la otra variante.

                Un día de descanso casi nunca es una dieta distinta: es la misma
                con menos hidratos. Partir de una copia y quitar es el flujo real,
                y sin esto había que rehacer seis comidas a mano.

                Solo aparece si la otra variante tiene algo que traer: un botón
                que al pulsarlo no hace nada enseña a desconfiar de la pantalla.
              */}
              {mealsForVariant(plan, otraVariante.id).length > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={traerLaOtra}>
                  <Copy size={14} /> Copiar desde {otraVariante.label.toLowerCase()}
                </button>
              )}
            </div>
          )}

          {copiado && <Notice tone="success">{copiado}</Notice>}

          {/* El reparto va ANTES de las comidas: es la primera decisión que se
              toma y la que hace cómodo todo lo de debajo. */}
          <MealStructure
            meals={meals}
            dayTarget={targetsFor(plan, variant).targetKcals}
            onChange={(mealIndex, field, value) =>
              updateMealTarget(activeClient.id, variant, mealIndex, field, value)
            }
          />

          <div className="col gap-4">
            {meals.map((meal, mealIndex) => (
              <MealCard
                key={meal.id}
                meal={meal}
                editable
                firstMeal={mealIndex === 0}
                lastMeal={mealIndex === meals.length - 1}
                foodLibrary={alimentosDisponibles}
                onMoveMeal={(delta) =>
                  moveMeal(activeClient.id, variant, mealIndex, mealIndex + delta)
                }
                onDuplicateMeal={() => duplicateMeal(activeClient.id, variant, mealIndex)}
                onDuplicateOption={(optIndex) =>
                  duplicateOption(activeClient.id, variant, mealIndex, optIndex)
                }
                /* Copiar al otro día solo existe si hay otro día. */
                otherVariantLabel={plan.hasDayVariants ? otraVariante.label.toLowerCase() : ''}
                onCopyMeal={
                  plan.hasDayVariants
                    ? () => {
                        const nombre = copyMealToVariant(
                          activeClient.id,
                          variant,
                          otraVariante.id,
                          mealIndex
                        );
                        avisarCopia(nombre, `«${nombre}» copiada`);
                      }
                    : null
                }
                onCopyOption={
                  plan.hasDayVariants
                    ? (optIndex) => {
                        const nombre = copyOptionToVariant(
                          activeClient.id,
                          variant,
                          otraVariante.id,
                          mealIndex,
                          optIndex
                        );
                        avisarCopia(nombre, `Opción ${optIndex + 1} copiada a «${nombre}»`);
                      }
                    : null
                }
                onMoveFood={(optIndex, from, to) =>
                  moveFood(activeClient.id, variant, mealIndex, optIndex, from, to)
                }
                onRenameMeal={(name) => updateMealName(activeClient.id, variant, mealIndex, name)}
                onNote={(note) => updateMealNote(activeClient.id, variant, mealIndex, note)}
                onRemoveMeal={() => removeMeal(activeClient.id, variant, mealIndex)}
                onAddOption={() => addMealOption(activeClient.id, variant, mealIndex)}
                onRemoveOption={(optIndex) => removeMealOption(activeClient.id, variant, mealIndex, optIndex)}
                onAddFood={(optIndex, food) => handleAddFood(mealIndex, optIndex, food)}
                onRemoveFood={(optIndex, foodId) =>
                  removeFoodFromOption(activeClient.id, variant, mealIndex, optIndex, foodId)
                }
                onGrams={(optIndex, foodId, grams) =>
                  updateFoodGrams(activeClient.id, variant, mealIndex, optIndex, foodId, grams)
                }
                onSetDisplay={(optIndex, foodId, mode) =>
                  setFoodDisplay(activeClient.id, variant, mealIndex, optIndex, foodId, mode)
                }
                onDefineUnit={(optIndex, food, label, grams) =>
                  defineFoodUnit(activeClient.id, variant, mealIndex, optIndex, food, label, grams)
                }
              />
            ))}

            <button
              type="button"
              className="btn btn-tinted"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => addMeal(activeClient.id, variant)}
            >
              <Plus size={15} /> Añadir comida
            </button>
          </div>
        </section>
      )}

      {plan.type === 'macros' && (
        <Panel tight>
          <p className="t-sm t-secondary">
            <Salad size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
            Plan por macros: el cliente reparte los alimentos como quiera mientras cuadre las cifras del
            objetivo. Cambia a «Menú cerrado» si prefieres detallar las comidas.
          </p>
        </Panel>
      )}

      {/* Las pautas van al final: se escriben cuando el plan ya está montado, y
          explican lo que las cifras de arriba no pueden explicar. */}
      <DietNotes
        notes={plan.habitsNotes}
        onChange={(habitsNotes) => updateNutrition(activeClient.id, { habitsNotes })}
      />
    </div>
  );
};
