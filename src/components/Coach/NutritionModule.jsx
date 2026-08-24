import { useMemo, useState } from 'react';
import { Copy, FileSpreadsheet, Footprints, HeartPulse, Plus, Salad } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  buildFoodEntry,
  dayKcalRange,
  dayKcals,
  emptyNutrition,
  isEmptyDiet,
  mealsForVariant,
  targetsFor,
} from '@/domain/nutrition';
import { mergeCatalog } from '@/domain/catalog';
import { clientProtocol, isModuleOn, toggleModule } from '@/domain/protocol';
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
import { useToast } from '@/components/ui/ToastProvider';
import { MacroTargetCard } from '@/components/nutrition/MacroTargetCard';
import { MealCard } from '@/components/nutrition/MealCard';
import { DietNotes } from '@/components/nutrition/DietNotes';
import { MealStructure } from '@/components/nutrition/MealStructure';
import { GoalCard } from '@/components/nutrition/GoalCard';
import { PastePlanDialog } from './Import/PastePlanDialog';

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
    restoreMeal,
    restoreFoodInOption,
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
    swapFood,
    setFoodDisplay,
    defineFoodUnit,
    upsertLibraryFood,
    importDiet,
    importRoutine,
    ensureNutrition,
    updateClientPreferences,
    setFoodEquivalences,
  } = useApp();

  const confirm = useConfirm();
  const toast = useToast();
  const plan = nutrition[activeClient.id] || emptyNutrition();
  const save = saveStatus('nutrition', activeClient.id);

  const [dietView, setDietView] = useState('training');
  /* «Traer de un Excel»: la dieta que el cliente trae de fuera, pegada o subida
     —y, si el mismo fichero la trae, también su rutina—. */
  const [pegarAbierto, setPegarAbierto] = useState(false);
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

  /* El protocolo del cliente, del que cuelga si SU app enseña equivalencias.
     El entrenador las ve siempre al montar; esto decide lo que ve el cliente. */
  const protocolo = clientProtocol(activeClient.preferences);
  const clienteVeEquivalencias = isModuleOn(protocolo, 'dietSwaps');

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
              {/* A la vista y no dentro de un menú, por el mismo motivo que su
                  gemelo en la rutina: es la clase de función que nadie busca
                  porque nadie sospecha que exista, así que esconderla equivale
                  a no tenerla. Y es el primer día de cada cliente nuevo. */}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPegarAbierto(true)}
              >
                <FileSpreadsheet size={15} /> Traer de un Excel o PDF
              </button>
              <SegmentedControl
                value={plan.type}
                onChange={(type) => updateNutrition(activeClient.id, { type })}
                options={DIET_TYPES}
                label="Tipo de dieta"
              />
            </div>
          }
        />

        {pegarAbierto && (
          <PastePlanDialog
            foco="dieta"
            foods={alimentosDisponibles}
            dietaExistente={!isEmptyDiet(plan)}
            /* Con dos dietas hay que decir a cuál va lo que se trae, aunque la
               hoja traiga una sola. */
            dietaConVariantes={Boolean(plan.hasDayVariants)}
            onImportDiet={async (importado, nuevos) => {
              /* La dieta se relee antes de escribir: se lee por cliente y bajo
                 demanda, y escribir encima de un mapa a medio cargar no sería
                 importar, sería reemplazar el plan entero por lo que traiga la
                 hoja. Misma guardia que al copiar de otro cliente. */
              await ensureNutrition(activeClient.id);
              /* Lo escrito a mano se queda en la biblioteca: la dieta guarda una
                 foto de sus macros y funcionaría sin esto, pero la próxima que
                 se importe volvería a preguntar por los mismos alimentos. */
              nuevos.forEach((food) => upsertLibraryFood(food));
              importDiet(activeClient.id, importado);
            }}
            /* La rutina que venga en el mismo fichero. Aquí no se está mirando
               ninguna semana, así que la decide `importRoutine`: la última si ya
               hay programa, y una nueva si no lo hay. */
            onImportDays={(days) => importRoutine(activeClient.id, days)}
            onClose={() => setPegarAbierto(false)}
          />
        )}

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

          {/*
            ¿El cliente ve las equivalencias? Es un MÓDULO del protocolo —«el
            entrenador decide qué existe en su app»—, como el RIR en la rutina:
            la lista completa vive en Ajustes → Protocolo y aquí está el
            interruptor a mano, en la pantalla donde se echa en falta, para ESTE
            cliente. Apagado por defecto: dar margen es un acto, no un accidente.
            La excepción por alimento se decide dentro de cada lista de
            equivalencias; tú las ves siempre al montar, se enseñen o no.
          */}
          {meals.length > 0 && (
            <Switch
              label="Equivalencias en la dieta"
              hint={`${activeClient.name} verá con qué puede cambiar cada alimento sin descuadrar el macro de su grupo. Puedes quitárselas a un alimento concreto desde su lista.`}
              checked={clienteVeEquivalencias}
              onChange={() =>
                updateClientPreferences(activeClient.id, 'protocol', toggleModule(protocolo, 'dietSwaps'))
              }
            />
          )}

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
                catalogFoods={catalogFoods}
                clientSwapsOn={clienteVeEquivalencias}
                /* La excepción por alimento: nueces con margen, cornflakes sin
                   él. Se decide dentro de la propia lista de equivalencias. */
                onSetEquivalences={(optIndex, foodId, visible) =>
                  setFoodEquivalences(activeClient.id, variant, mealIndex, optIndex, foodId, visible)
                }
                /*
                  Cambiar un alimento por su equivalente, en su sitio.

                  Elegir un equivalente es elegir un alimento: si venía del
                  catálogo pasa a tu biblioteca, igual que al añadirlo desde el
                  buscador. Y como sustituye —no añade—, lleva su «Deshacer»:
                  la entrada anterior se captura entera y volver es reponerla.
                */
                onSwapFood={(optIndex, foodId, food, grams) => {
                  const previo = meal.options?.[optIndex]?.foods?.find((f) => f.id === foodId);
                  if (!previo) return;
                  upsertLibraryFood(food);
                  const { id: _descartado, ...campos } = buildFoodEntry(food, grams);
                  swapFood(activeClient.id, variant, mealIndex, optIndex, foodId, campos);
                  toast({
                    text: `«${previo.name}» cambiado por ${grams} g de ${food.name}.`,
                    action: {
                      label: 'Deshacer',
                      onClick: () =>
                        swapFood(activeClient.id, variant, mealIndex, optIndex, foodId, previo),
                    },
                  });
                }}
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
                onRemoveMeal={() => {
                  /* El aviso con su «Deshacer»: la comida se captura entera
                     antes de borrarla y el inverso la devuelve donde estaba. */
                  removeMeal(activeClient.id, variant, mealIndex);
                  toast({
                    text: `«${meal.name}» eliminada.`,
                    action: {
                      label: 'Deshacer',
                      onClick: () => restoreMeal(activeClient.id, variant, mealIndex, meal),
                    },
                  });
                }}
                onAddOption={() => addMealOption(activeClient.id, variant, mealIndex)}
                onRemoveOption={(optIndex) => removeMealOption(activeClient.id, variant, mealIndex, optIndex)}
                onAddFood={(optIndex, food) => handleAddFood(mealIndex, optIndex, food)}
                onRemoveFood={(optIndex, foodId) => {
                  const foods = meal.options?.[optIndex]?.foods || [];
                  const foodIdx = foods.findIndex((f) => f.id === foodId);
                  const food = foods[foodIdx];
                  removeFoodFromOption(activeClient.id, variant, mealIndex, optIndex, foodId);
                  if (!food) return;
                  toast({
                    text: `«${food.name}» quitado de ${meal.name}.`,
                    action: {
                      label: 'Deshacer',
                      onClick: () =>
                        restoreFoodInOption(activeClient.id, variant, mealIndex, optIndex, food, foodIdx),
                    },
                  });
                }}
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
            <Salad size={14} className="icon-inline" />
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
