import { useMemo, useState } from 'react';
import { Copy, FileSpreadsheet, Footprints, HeartPulse, Plus } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  buildFoodEntry,
  dayKcalRange,
  dayKcals,
  emptyNutrition,
  isEmptyDiet,
  mealTargetsTotal,
  mealsForVariant,
  targetsFor,
} from '@/domain/nutrition';
import { mergeCatalog } from '@/domain/catalog';
import { clientProtocol, isModuleOn, toggleModule } from '@/domain/protocol';
import { SaveIndicator } from '@/components/ui/primitives';
import { Mando, MandoTab, MandoTabs } from '@/components/ui/Mando';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { AjustesPlan } from '@/components/nutrition/AjustesPlan';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { ConditionsNote } from '@/components/conditions/ConditionsNote';
import { MacroTargetCard } from '@/components/nutrition/MacroTargetCard';
import { MealCard } from '@/components/nutrition/MealCard';
import { DietNotes } from '@/components/nutrition/DietNotes';
import { DiaPopup } from '@/components/nutrition/DiaPopup';
import { DiaResumen } from '@/components/nutrition/DiaResumen';
import { GoalCard } from '@/components/nutrition/GoalCard';
import { PastePlanDialog } from './Import/PastePlanDialog';
import { VueltaALaRevision } from '@/components/review/VueltaALaRevision';

const VARIANT_OPTIONS = [
  { id: 'training', label: 'Días de entreno' },
  { id: 'rest', label: 'Días de descanso' },
];

/**
 * Dieta: la pestaña ES el menú.
 *
 * ══ La forma, la misma que Entreno ══════════════════════════════════════════
 *
 *     Días de entreno · Días de descanso   5 comidas · 2.340 kcal/día   guardado · ⚙
 *     ┌ menú ───────────────────────────────────────┐ ┌ objetivo ─────────┐
 *     │ el día: 3.072 de 3.100 · cuadra             │ │ 2.400 kcal        │
 *     │ desayuno · comida · cena…                   │ │ P/C/G             │
 *     │ + comida ▾                                  │ │ pasos · cardio    │
 *     │ tus pautas                                  │ └───────────────────┘
 *     └─────────────────────────────────────────────┘
 *
 * Una fila de mando —a la izquierda dónde estás, a la derecha qué puedes hacer—
 * y debajo dos columnas: el trabajo (el menú) a lo ancho y el objetivo al lado,
 * que es contra lo que se cuadra cada comida. Antes el objetivo, los pasos y el
 * cardio eran cuatro filas ENCIMA del menú, y la pantalla abría por lo que se
 * toca una vez al mes.
 *
 * ── Dónde vive cada cosa ────────────────────────────────────────────────────
 * · AÑADIR una comida está al pie de la lista y en un solo sitio, que es donde
 *   va a aparecer. Traer de fuera (la otra dieta, un Excel) cuelga de ahí
 *   mismo: es otra forma de meter comidas en la lista. Antes había dos botones
 *   para lo mismo, arriba y abajo, con distinta forma.
 * · Los AJUSTES del plan —cerrado o por macros, dos dietas, equivalencias— van
 *   en su panel (`AjustesPlan`): se tocan una vez al mes y no merecen una fila
 *   permanente, pero dentro son controles de verdad y no una lista de texto.
 */
export const NutritionModule = () => {
  const {
    session,
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
    editFood,
    upsertLibraryFood,
    importDiet,
    importRoutine,
    ensureNutrition,
    saveClientException,
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
  /* Reordenar comidas arrastrándolas por el asa, como los ejercicios de la
     hoja de Entreno: quién se arrastra y sobre quién se está soltando. */
  const [arrastre, setArrastre] = useState({ desde: null, sobre: null });
  /* La ventana del día: se abre desde la tarjeta del objetivo de una variante. */
  const [diaAbierto, setDiaAbierto] = useState(null);
  /* La opción abierta en cada comida, por id: el resumen del día suma con ellas. */
  const [elegidas, setElegidas] = useState({});
  const variant = plan.hasDayVariants ? dietView : 'default';
  const meals = mealsForVariant(plan, variant);
  const cerrado = plan.type === 'closed';

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
  const laOtraTieneMenu = plan.hasDayVariants && mealsForVariant(plan, otraVariante.id).length > 0;

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
   * acabar con tres cenas duplicadas. El aviso dice a dónde ha ido, y es un
   * aviso pasajero como el resto de los de esta pantalla: no una franja que se
   * queda hasta que alguien la cierra.
   */
  const avisarCopia = (nombre, texto) => {
    if (!nombre) return;
    toast({ text: `${texto} en ${otraVariante.label.toLowerCase()}.` });
  };

  /** Al elegir o crear un alimento se guarda también en la biblioteca del coach. */
  const handleAddFood = (mealIndex, optIndex, food) => {
    upsertLibraryFood(food);
    // Sin cantidad: la elige `buildFoodEntry` según el alimento —una unidad entera
    // si la tiene, 100 g si se pesa—. Fijar 100 aquí metía «casi dos huevos» cada
    // vez que se añadía uno.
    addFoodToOption(activeClient.id, variant, mealIndex, optIndex, food);
  };

  /*
    La línea gris: de qué habla la pantalla ahora mismo.

    ── Dos cosas que decían lo mismo con números distintos ────────────────────
    Aquí ponía «3.100 kcal/día» sumando la PRIMERA opción de cada comida,
    mientras la tira de debajo suma la opción ABIERTA y decía «3.072»: dos
    totales del mismo día a diez centímetros uno de otro. Y las dos acababan en
    «cuadra», que además significaba cosas distintas —aquí, que el reparto por
    comidas cuadra con el objetivo; allí, que lo que suman los alimentos cuadra—.

    Con varias alternativas, el día no es UN número: es un rango, y eso sí lo
    dice solo esta línea. Con una sola opción por comida no hay rango ni hay dos
    lecturas posibles, así que ahí la cifra vuelve. Y el veredicto dice de qué
    habla: el reparto.
  */
  const reparto = mealTargetsTotal(meals, targetsFor(plan, variant).targetKcals);
  const cuadra =
    reparto.meals === 0 || reparto.left === null
      ? null
      : reparto.left === 0
        ? 'el reparto cuadra'
        : reparto.left > 0
          ? `quedan ${reparto.left} kcal por repartir`
          : `el reparto se pasa ${Math.abs(reparto.left)} kcal`;
  const contexto = !cerrado
    ? 'Por macros: reparte los alimentos como quiera mientras cuadre el objetivo.'
    : meals.length === 0
      ? 'Sin comidas todavía.'
      : `${meals.length} ${meals.length === 1 ? 'comida' : 'comidas'}` +
        (dayRange.min !== dayRange.max
          ? ` · entre ${Math.round(dayRange.min)} y ${Math.round(dayRange.max)} kcal según la alternativa`
          : ` · ${Math.round(dayTotal)} kcal/día`) +
        (cuadra ? ` · ${cuadra}` : '');

  /*
    AÑADIR UNA COMIDA, en un solo sitio: al pie de la lista.
    ──────────────────────────────────────────────────────────────────────────
    Había dos botones para lo mismo —«+ comida ▾» en la fila de mando y
    «+ Añadir comida» al final del menú—, y con seis comidas los dos estaban en
    pantalla a la vez con distinta forma. El pie es el sitio correcto: es donde
    aparece la comida nueva, y es el mismo gesto que añadir un alimento al pie
    de una comida. Con él se va también lo de traer de fuera, que es otra forma
    de meter comidas en la lista.
  */
  const masComida = (
    <MenuAcciones
      label="+ comida"
      sinFlecha
      ariaLabel="Añadir comida"
      items={[
        { icon: Plus, label: 'Nueva comida', run: () => addMeal(activeClient.id, variant) },
        laOtraTieneMenu && {
          icon: Copy,
          label: `Copiar el menú de ${otraVariante.label.toLowerCase()}`,
          run: traerLaOtra,
        },
        null,
        { icon: FileSpreadsheet, label: 'Traer de un Excel o PDF', run: () => setPegarAbierto(true) },
      ]}
    />
  );

  return (
    <div className="stack dieta-pagina">
      {/* Si has llegado aquí desde una revisión, el camino de vuelta. Solo
          entonces: no es un modo, viaja en la navegación (`VueltaALaRevision`). */}
      <VueltaALaRevision />

      {/* Sus alergias, intolerancias y patologías con impacto metabólico, si
          tiene alguna. Lo mismo que en la rutina y por el mismo motivo: un
          condicionante que hay que ir a buscar llega después de la decisión. */}
      <ConditionsNote area="nutrition" />

      {pegarAbierto && (
        <PastePlanDialog
          foco="dieta"
          foods={alimentosDisponibles}
          dietaExistente={!isEmptyDiet(plan)}
          /* Con dos dietas hay que decir a cuál va lo que se trae, aunque la
             hoja traiga una sola. */
          dietaConVariantes={Boolean(plan.hasDayVariants)}
          onImportDiet={async (importado, nuevos) => {
            /*
              La dieta se relee antes de escribir: se lee por cliente y bajo
              demanda, y escribir encima de un mapa a medio cargar no sería
              importar, sería reemplazar el plan entero por lo que traiga la
              hoja. Misma guardia que al copiar de otro cliente.

              Y si esa lectura falla, NO se importa y se dice. Antes esto era
              un `await` a secas: cualquier fallo se lo tragaba la promesa y lo
              único que se veía era que la dieta no se guardaba, sin motivo.
            */
            if (!(await ensureNutrition(activeClient.id).catch(() => null))) {
              toast({
                text: 'No he podido leer la dieta que tiene ahora, así que no he importado nada. Inténtalo otra vez.',
              });
              return;
            }
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

      {/*
        ══ La fila de mando ═══════════════════════════════════════════════════
        Izquierda: las dos dietas como pestañas (solo si las hay) y el contexto.
        Derecha: el guardado, «+ comida» y los ajustes del plan en «···».
      */}
      <Mando
        contexto={contexto}
        acciones={
          <>
            <SaveIndicator
              status={save.status}
              error={save.error}
              onRetry={() => retrySave('nutrition', activeClient.id)}
            />
            {/* Con plan por macros no hay comidas que añadir: lo único que se
                puede traer es una dieta de fuera, y ese botón se queda aquí. */}
            {!cerrado && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPegarAbierto(true)}>
                Traer de un Excel o PDF
              </button>
            )}
            {/*
              Los ajustes del plan. Las equivalencias del cliente son un MÓDULO
              del protocolo —«el entrenador decide qué existe en su app»—, como
              el RIR en la rutina: la lista completa vive en Ajustes → Protocolo
              y aquí está el ajuste a mano, para ESTE cliente. Por
              `saveClientException` y no por `updateClientPreferences`:
              encenderlas para esta persona es una excepción a la plantilla, y
              sin la marca el siguiente «poner al día» se las apagaba.
            */}
            <AjustesPlan
              cerrado={cerrado}
              onTipo={(type) => updateNutrition(activeClient.id, { type })}
              dosDietas={Boolean(plan.hasDayVariants)}
              onDosDietas={(on) => setHasDayVariants(activeClient.id, on)}
              equivalencias={clienteVeEquivalencias}
              onEquivalencias={() =>
                saveClientException(activeClient.id, { protocol: toggleModule(protocolo, 'dietSwaps') })
              }
            />
          </>
        }
      >
        {plan.hasDayVariants && (
          <MandoTabs label="Variante de dieta">
            {VARIANT_OPTIONS.map((v) => (
              <MandoTab key={v.id} on={dietView === v.id} onClick={() => setDietView(v.id)}>
                {v.label}
              </MandoTab>
            ))}
          </MandoTabs>
        )}
      </Mando>

      <div className="dieta">
        {/* ── El menú: el trabajo, a lo ancho ─────────────────────────────── */}
        <div className="dieta-menu">
          {cerrado && meals.length === 0 && (
            <p className="t-sm t-tertiary">
              Empieza por «+ comida», o tráele la dieta de un Excel o PDF y se monta sola.
            </p>
          )}

          {cerrado && meals.length > 0 && (
            <div className="dieta-hoja">
            {/* El día: cuánto lleva del objetivo, y la puerta a su ventana. */}
            <DiaResumen meals={meals} targets={targetsFor(plan, variant)} elegidas={elegidas} onAbrir={() => setDiaAbierto(variant)} />
            {meals.map((meal, mealIndex) => (
              <MealCard
                key={meal.id}
                meal={meal}
                numero={mealIndex + 1}
                opcion={elegidas[meal.id] ?? 0}
                onOpcion={(i) => setElegidas((e) => ({ ...e, [meal.id]: i }))}
                arrastre={{
                  dragging: arrastre.desde === mealIndex,
                  dropTarget: arrastre.sobre === mealIndex && arrastre.desde !== mealIndex,
                  onDragStart: (e) => {
                    setArrastre({ desde: mealIndex, sobre: null });
                    e.dataTransfer.effectAllowed = 'move';
                  },
                  onDragEnd: () => setArrastre({ desde: null, sobre: null }),
                  onDragOver: (e) => {
                    e.preventDefault();
                    setArrastre((a) => (a.sobre === mealIndex ? a : { ...a, sobre: mealIndex }));
                  },
                  onDragLeave: () => setArrastre((a) => (a.sobre === mealIndex ? { ...a, sobre: null } : a)),
                  onDrop: (e) => {
                    e.preventDefault();
                    if (arrastre.desde !== null && arrastre.desde !== mealIndex) {
                      moveMeal(activeClient.id, variant, arrastre.desde, mealIndex);
                    }
                    setArrastre({ desde: null, sobre: null });
                  },
                }}
                editable
                firstMeal={mealIndex === 0}
                lastMeal={mealIndex === meals.length - 1}
                foodLibrary={alimentosDisponibles}
                coachId={session?.user?.id || null}
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
                onEditFood={(optIndex, food, cambios) =>
                  editFood(activeClient.id, variant, mealIndex, optIndex, food, cambios)
                }
              />
            ))}
            {/* El único sitio desde el que se añade: dentro de la hoja y al pie
                de las comidas, que es donde va a aparecer la nueva —el mismo
                gesto que «+ alimento» al pie de cada comida—. */}
            <div className="dieta-alta">{masComida}</div>
            </div>
          )}

          {/* Sin comidas no hay hoja donde meterlo: el párrafo de arriba explica
              y este botón es por dónde se empieza. */}
          {cerrado && meals.length === 0 && <div className="dieta-alta">{masComida}</div>}

          {/* Las pautas van al final: se escriben cuando el plan ya está montado, y
              explican lo que las cifras de arriba no pueden explicar. */}
          <DietNotes
            notes={plan.habitsNotes}
            onChange={(habitsNotes) => updateNutrition(activeClient.id, { habitsNotes })}
          />
        </div>

        {/*
          ── El objetivo, al lado ──────────────────────────────────────────────
          Es contra lo que se cuadra cada comida, así que acompaña al menú en
          vez de precederlo. Con dos dietas hay DOS objetivos: activar la opción
          implica que las calorías y el reparto cambian entre un día de entreno
          y uno de descanso, que es justo el motivo de separarlos.

          Los pasos y el cardio son del PLAN, no de una variante —lo que esta
          persona hace cada día, entrene o no—, y van una vez, debajo.
        */}
        <aside className="dieta-lado" aria-label="Objetivo del plan">
          {plan.hasDayVariants ? (
            <>
              <MacroTargetCard
                plan={plan}
                variant="training"
                title="Objetivo · Días de entreno"
                editable
                onAbrir={cerrado ? () => setDiaAbierto('training') : null}
                onSave={(fields) => updateNutritionTargets(activeClient.id, 'training', fields)}
              />
              <MacroTargetCard
                plan={plan}
                variant="rest"
                title="Objetivo · Días de descanso"
                editable
                onAbrir={cerrado ? () => setDiaAbierto('rest') : null}
                onSave={(fields) => updateNutritionTargets(activeClient.id, 'rest', fields)}
              />
            </>
          ) : (
            <MacroTargetCard
              plan={plan}
              variant="default"
              title="Objetivo · Diario"
              editable
              onAbrir={cerrado ? () => setDiaAbierto('default') : null}
              onSave={(fields) => updateNutritionTargets(activeClient.id, 'default', fields)}
            />
          )}

          {/*
            La ventana del día de una variante: el anillo de lo que suma, las
            cifras contra el objetivo y la tabla del plan —donde se reparte—.
            Se abre desde el título de la tarjeta, como la progresión en
            Entreno. Al abrir la de la otra dieta, la hoja pasa a ella: lo que
            se ve y lo que se toca son la misma variante.
          */}
          {diaAbierto && (
            <DiaPopup
              open
              label={
                diaAbierto === 'default'
                  ? 'diario'
                  : VARIANT_OPTIONS.find((v) => v.id === diaAbierto)?.label.toLowerCase()
              }
              meals={mealsForVariant(plan, diaAbierto)}
              targets={targetsFor(plan, diaAbierto)}
              elegidas={elegidas}
              onTarget={(mealIndex, field, value) => updateMealTarget(activeClient.id, diaAbierto, mealIndex, field, value)}
              onIrA={(i) => {
                if (diaAbierto !== 'default') setDietView(diaAbierto);
                const id = mealsForVariant(plan, diaAbierto)[i]?.id;
                window.setTimeout(() => document.getElementById(`comida-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
              }}
              onClose={() => setDiaAbierto(null)}
            />
          )}

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
        </aside>
      </div>
    </div>
  );
};
