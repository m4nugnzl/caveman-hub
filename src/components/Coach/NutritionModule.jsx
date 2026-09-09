import { useMemo, useState } from 'react';
import { Copy, FileUp, Footprints, HeartPulse, Plus, Users } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  buildFoodEntry,
  dayKcalRange,
  dayKcals,
  emptyNutrition,
  isEmptyDiet,
  mealTarget,
  mealTargetsTotal,
  mealsForVariant,
  optionMacros,
  targetsFor,
} from '@/domain/nutrition';
import {
  MAX_PLATOS,
  buildPlato,
  freePlatoName,
  platoFoods,
  platoKcals,
  platosOf,
  scalePlatoTo,
} from '@/domain/platos';
import { mergeCatalog } from '@/domain/catalog';
import { clientProtocol, isModuleOn, toggleModule } from '@/domain/protocol';
import { toNum0 } from '@/lib/num';
import { SaveIndicator } from '@/components/ui/primitives';
import { Mando, MandoTab, MandoTabs } from '@/components/ui/Mando';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { AjustesPlan } from '@/components/nutrition/AjustesPlan';
import { UnaSolaDieta } from '@/components/nutrition/UnaSolaDieta';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { ConditionsNote } from '@/components/conditions/ConditionsNote';
import { MacroTargetCard } from '@/components/nutrition/MacroTargetCard';
import { MealCard } from '@/components/nutrition/MealCard';
import { DietNotes } from '@/components/nutrition/DietNotes';
import { DiaPopup } from '@/components/nutrition/DiaPopup';
import { DiaResumen } from '@/components/nutrition/DiaResumen';
import { GoalCard } from '@/components/nutrition/GoalCard';
import { ReescalarMenu } from '@/components/nutrition/ReescalarMenu';
import { PastePlanDialog } from './Import/PastePlanDialog';
import { CopyToClientPanel } from './Workout/CopyToClientPanel';
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
 * ══ Y la otra forma: por macros, sin menú ══════════════════════════════════
 *
 *     Por macros: reparte los alimentos como quiera        Traer de fuera · ⚙
 *     ┌ objetivo ───────────────────────────────────────────────────────────┐
 *     │ 2.600 kcal · P 115 g · C 411 g · G 55 g                             │
 *     └─────────────────────────────────────────────────────────────────────┘
 *     ┌ pasos ─────────────────────┐ ┌ cardio ────────────────────────────┐
 *     └────────────────────────────┘ └────────────────────────────────────┘
 *     tus pautas
 *
 * Sin menú, la columna ancha se quedaba con las pautas y nada más —media
 * pantalla en blanco— mientras lo único que de verdad se pauta, el objetivo,
 * vivía apretado en la columna estrecha. Esa columna existe para ACOMPAÑAR a un
 * menú, y aquí no hay menú al que acompañar: una sola columna, en el orden en
 * que se decide, y con el ancho de un documento.
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
    /* Para traer la dieta de otro: la lista de a quién, y el mismo `replicateClient`
       que usa Entreno —una sola forma de copiar de un cliente a otro—. */
    clients,
    replicateClient,
    nutrition,
    foodLibrary,
    catalogFoods,
    /* Tus platos viven en tus preferencias, como las piezas de entreno: son
       criterio tuyo y no de un cliente. Ver `domain/platos.js`. */
    coachPrefs,
    updateCoachPreferences,
    saveStatus,
    retrySave,
    updateNutrition,
    updateNutritionTargets,
    applyRescaledMeals,
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
    addFoodsToOption,
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
  /* «Traer de un fichero»: la dieta que el cliente trae de fuera —y, si el
     mismo fichero la trae, también su rutina—. */
  const [pegarAbierto, setPegarAbierto] = useState(false);
  /* «Traer la dieta de otro cliente»: el panel de réplica, el mismo de Entreno
     pero ofreciendo solo la dieta. */
  const [copiaAbierta, setCopiaAbierta] = useState(false);
  /* Reordenar comidas arrastrándolas por el asa, como los ejercicios de la
     hoja de Entreno: quién se arrastra y sobre quién se está soltando. */
  const [arrastre, setArrastre] = useState({ desde: null, sobre: null });
  /* La ventana del día: se abre desde la tarjeta del objetivo de una variante. */
  const [diaAbierto, setDiaAbierto] = useState(null);
  /* El reescalado ofrecido tras cambiar el objetivo de kcal: {variant, from, to}.
     Se ofrece, no se aplica: el objetivo ya quedó guardado y esta ventana solo
     pone encima la aritmética de recuadrar el menú (ver `ReescalarMenu`). */
  const [reescala, setReescala] = useState(null);
  /* La opción abierta en cada comida, por id: el resumen del día suma con ellas. */
  const [elegidas, setElegidas] = useState({});
  /* Apagar «dos dietas» pregunta con cuál se queda: ver `UnaSolaDieta`. */
  const [unificar, setUnificar] = useState(false);
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

  /*
    ══ Y traer la dieta de OTRO CLIENTE ═══════════════════════════════════════

    Montar a alguien igual que a otro es la mitad del trabajo de dar de alta, y
    aquí no existía: la ruta vivía dentro del panel de réplica de Entreno —donde
    la dieta es una casilla más—, así que quien ya tenía el entreno montado no
    volvía a pasar por allí y se copiaba el menú comida a comida.

    Es el MISMO panel, no otro: `bloques={['diet']}`. Solo existe si hay de quién
    traer; ofrecérselo a quien tiene un cliente lleva a un aviso que dice que
    hacen falta dos, que es una puerta que solo sirve para decirte que no pasas.
  */
  const hayDeQuienTraer = clients.length > 1;
  const panelDeCopia = copiaAbierta && (
    <CopyToClientPanel
      clients={clients}
      activeClient={activeClient}
      bloques={['diet']}
      /* Tener fila en `nutrition_plans` no es tener dieta: la fila nace al tocar
         cualquier cosa. Avisar de que «esto SUSTITUYE su dieta actual» por un
         plan en blanco es asustar por nada. */
      hasDiet={!isEmptyDiet(plan)}
      onReplicate={(sourceId, what) => replicateClient(sourceId, activeClient.id, what)}
      onClose={() => setCopiaAbierta(false)}
    />
  );

  /* El panel se pinta arriba —es donde tiene que verse— y el menú que lo abre
     puede estar al pie de doce comidas: sin llevar la pantalla hasta él, se
     abriría fuera de cuadro y el gesto parecería no haber hecho nada. */
  const abrirCopia = () => {
    setCopiaAbierta(true);
    window.setTimeout(
      () => document.getElementById('traer-dieta')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      50
    );
  };

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

  /**
   * Guardar el objetivo de una variante y, si sus kcal cambiaron y hay menú,
   * OFRECER el reescalado. Ofrecer: el objetivo ya está guardado pase lo que
   * pase, y cerrar la ventana deja el menú intacto para cuadrarlo a mano.
   */
  const guardarObjetivo = (v) => (fields) => {
    const antes = toNum0(targetsFor(plan, v).targetKcals);
    updateNutritionTargets(activeClient.id, v, fields);
    const despues = toNum0(fields.targetKcals);
    if (cerrado && antes && despues && antes !== despues && mealsForVariant(plan, v).length > 0) {
      setReescala({ variant: v, from: antes, to: despues });
    }
  };

  /** Al elegir o crear un alimento se guarda también en la biblioteca del coach. */
  /*
    ══ TUS PLATOS ═════════════════════════════════════════════════════════════

    La ración guardada con nombre, que es la unidad con la que se pauta de
    verdad: nadie pauta «avena», pauta 80 g de avena con 200 ml de leche y un
    plátano. El gemelo de la pieza de Entreno, con su mismo reparto de gestos:
    **se guarda desde donde se monta y se pone desde donde se monta**; la
    vitrina de `/plantillas` solo exhibe.
  */
  const platos = platosOf(coachPrefs);

  const guardarPlato = (mealIndex, optIndex) => {
    const meal = meals[mealIndex];
    const foods = meal?.options?.[optIndex]?.foods || [];
    if (foods.length === 0) return;

    if (platos.length >= MAX_PLATOS) {
      toast({ text: `Ya tienes ${MAX_PLATOS} platos. Quita alguno desde Plantillas para guardar este.` });
      return;
    }

    /* El nombre de la comida, desempatado como se desempata el de una hoja al
       poner una pieza: «Desayuno», «Desayuno 2». Sin diálogo y sin preguntar
       —igual que al guardar un día desde el cajón del bloque—: el nombre se
       cambia en la vitrina, que es donde se ve la lista entera y donde el
       nombre de verdad significa algo. */
    const name = freePlatoName(meal.name, platos.map((p) => p.name));
    const plato = buildPlato({ name, foods, savedAt: new Date().toISOString() });
    updateCoachPreferences('platos', { items: [...platos, plato] });
    toast({ text: `Guardado como «${name}». Está en Plantillas, para cualquier cliente.` });
  };

  /**
   * Poner un plato: DESPLIEGA sus alimentos, no enlaza.
   *
   * Y después ofrece cuadrarlo, que es la mitad útil de un generador de dietas
   * sin que la app recete nada: el plato lo has elegido tú, el objetivo lo
   * pusiste tú, y esto es la aritmética que hacías a mano. Se ofrece en un
   * aviso con su verbo —nunca se aplica solo— y solo cuando la comida tiene
   * objetivo y la diferencia se sale del 5 %, que es el mismo margen con el que
   * `optionGaps` decide que una opción no cuadra.
   */
  const ponerPlato = (mealIndex, optIndex, plato) => {
    const meal = meals[mealIndex];
    const entradas = platoFoods(plato);
    addFoodsToOption(activeClient.id, variant, mealIndex, optIndex, entradas);

    const objetivo = mealTarget(meal);
    const hueco = objetivo?.kcals
      ? objetivo.kcals - Math.round(optionMacros(meal?.options?.[optIndex]).kcal)
      : 0;
    const puesto = platoKcals(plato);
    const cabe = hueco > 0 && Math.abs(puesto - hueco) > objetivo.kcals * 0.05;

    if (!cabe) {
      toast({ text: `«${plato.name}» puesto en ${meal.name}.` });
      return;
    }

    /* Las entradas ya llevan sus ids, así que cuadrar es cambiarles los gramos
       —lo mismo que teclear en la casilla— y no hace falta ninguna acción nueva
       ni adivinar qué filas de la opción eran del plato. */
    toast({
      text: `«${plato.name}» son ${puesto} kcal y a ${meal.name} le quedaban ${hueco}.`,
      action: {
        label: 'Cuadrarlo',
        onClick: () => {
          const res = scalePlatoTo(entradas, hueco);
          if (!res) {
            toast({
              text: `«${plato.name}» no se puede cuadrar: todo lo que lleva es proteína o se cuenta por unidades.`,
            });
            return;
          }
          for (const f of res.foods) {
            updateFoodGrams(activeClient.id, variant, mealIndex, optIndex, f.id, f.grams);
          }
          toast({ text: `«${plato.name}» cuadrado a ${hueco} kcal.` });
        },
      },
    });
  };

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
        { icon: FileUp, label: 'Traer de un fichero', run: () => setPegarAbierto(true) },
        /* La otra mudanza: la dieta que ya le has montado a otro. Cuelga del
           mismo botón porque es lo mismo —otra forma de meter comidas en la
           lista—, y no de un menú de ajustes donde nadie la buscaría. */
        hayDeQuienTraer && {
          icon: Users,
          label: 'Traer la dieta de otro cliente',
          run: abrirCopia,
        },
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

      {/* De quién se trae la dieta. En el mismo sitio que en Entreno: arriba. */}
      {panelDeCopia && <div id="traer-dieta">{panelDeCopia}</div>}

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
            {/* Con plan por macros no hay comidas que añadir —«+ comida» no se
                pinta—, así que las dos mudanzas se quedan aquí: el fichero y la
                dieta de otro cliente. Con un solo cliente no hay menú que abrir:
                queda el botón de siempre. */}
            {!cerrado &&
              (hayDeQuienTraer ? (
                <MenuAcciones
                  label="Traer"
                  ariaLabel="Traer una dieta de fuera"
                  items={[
                    { icon: FileUp, label: 'De un fichero', run: () => setPegarAbierto(true) },
                    { icon: Users, label: 'La dieta de otro cliente', run: abrirCopia },
                  ]}
                />
              ) : (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPegarAbierto(true)}>
                  Traer de un fichero
                </button>
              ))}
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
              /*
                Encenderlas no pregunta nada: la dieta única se copia a las dos y
                no se pierde nada. APAGARLAS sí, porque hay que decidir cuál de
                las dos pasa a ser la dieta. Con el plan en blanco no hay nada
                que decidir y la pregunta sobraría.
              */
              onDosDietas={(on) => {
                if (!on && !isEmptyDiet(plan)) return setUnificar(true);
                setHasDayVariants(activeClient.id, on, 'training');
              }}
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

      <div className={`dieta${cerrado ? '' : ' is-macros'}`}>
        {/* ── El menú: el trabajo, a lo ancho ─────────────────────────────── */}
        <div className="dieta-menu">
          {/* El vacío nombra las tres rutas, que es donde de verdad se decide:
              acabas de dar de alta a alguien y lo normal es montarle la dieta
              como a otro que ya tienes, o traerla del Excel donde la escribiste.
              Las tres cuelgan del mismo «+ comida» de aquí debajo. */}
          {cerrado && meals.length === 0 && (
            <p className="t-sm t-tertiary">
              {hayDeQuienTraer
                ? 'Empieza por «+ comida», tráele la dieta de un Excel o un PDF y se monta sola, o cópiale la de alguien a quien ya se la tengas montada.'
                : 'Empieza por «+ comida», o tráele la dieta de un Excel o PDF y se monta sola.'}
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
                platos={platos}
                onAddPlato={(optIndex, plato) => ponerPlato(mealIndex, optIndex, plato)}
                onSavePlato={(optIndex) => guardarPlato(mealIndex, optIndex)}
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
          {/* Uno, o dos si hay dietas de entreno y de descanso. Sin menú se
              reparten el ancho; con menú van apilados en su columna. */}
          <div className="dieta-objetivos">
          {plan.hasDayVariants ? (
            <>
              <MacroTargetCard
                plan={plan}
                variant="training"
                title="Objetivo · Días de entreno"
                editable
                onAbrir={cerrado ? () => setDiaAbierto('training') : null}
                onSave={guardarObjetivo('training')}
              />
              <MacroTargetCard
                plan={plan}
                variant="rest"
                title="Objetivo · Días de descanso"
                editable
                onAbrir={cerrado ? () => setDiaAbierto('rest') : null}
                onSave={guardarObjetivo('rest')}
              />
            </>
          ) : (
            <MacroTargetCard
              plan={plan}
              variant="default"
              title="Objetivo · Diario"
              editable
              onAbrir={cerrado ? () => setDiaAbierto('default') : null}
              onSave={guardarObjetivo('default')}
            />
          )}
          </div>

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

          {/*
            La vista previa del reescalado, si se acaba de cambiar el objetivo.
            Lee el plan YA guardado —por eso no recibe el campo tecleado— y no
            escribe nada hasta «Aplicar», que lleva su «Deshacer»: el menú
            anterior se captura entero y volver es reponerlo.
          */}
          {reescala && (
            <ReescalarMenu
              plan={plan}
              variant={reescala.variant}
              fromKcals={reescala.from}
              toKcals={reescala.to}
              onClose={() => setReescala(null)}
              onApply={(mealsNuevas) => {
                const viejas = mealsForVariant(plan, reescala.variant);
                const { variant: v, to } = reescala;
                applyRescaledMeals(activeClient.id, v, mealsNuevas);
                setReescala(null);
                toast({
                  text: `Menú reajustado al objetivo de ${to} kcal.`,
                  action: {
                    label: 'Deshacer',
                    onClick: () => applyRescaledMeals(activeClient.id, v, viejas),
                  },
                });
              }}
            />
          )}

          {/* La actividad: del PLAN, no de una variante. */}
          <div className="dieta-actividad">
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
          </div>
        </aside>
      </div>

      {/*
        Juntar las dos dietas en una. La pregunta y sus consecuencias viven en
        la ventana; aquí solo se escribe lo elegido y se dice qué ha pasado, que
        es un cambio grande y sin vuelta atrás por otro camino.
      */}
      {unificar && (
        <UnaSolaDieta
          open
          plan={plan}
          cerrado={cerrado}
          onClose={() => setUnificar(false)}
          onConfirm={(quedarse) => {
            /* El plan entero de antes, para el «Deshacer»: juntar dos dietas
               descarta una, y la pareja honesta de descartar es poder volver.
               `updateNutrition` reescribe todos los campos, así que reponerlo es
               devolver el objeto tal cual estaba. */
            const antes = plan;

            /*
              ── La ventana se cierra ANTES de escribir ────────────────────────
              El orden importa, y no por estilo: si la escritura lanza, todo lo
              que venga detrás —el cierre incluido— no llega a ejecutarse, y lo
              que ve quien está delante es un botón que no hace nada. Un clic que
              acierta tiene que responder siempre; qué pasó con lo escrito se
              cuenta después, y si falla se dice, no se traga (regla 13).
            */
            setUnificar(false);
            setDietView('training');

            try {
              setHasDayVariants(activeClient.id, false, quedarse);
            } catch (error) {
              toast({
                text: `No se pudieron juntar las dietas: ${error?.message || 'fallo desconocido'}. Su dieta se queda como estaba.`,
              });
              return;
            }

            toast({
              text: `${quedarse === 'rest' ? 'La dieta de descanso' : 'La dieta de entreno'} es ahora su dieta única.`,
              action: {
                label: 'Deshacer',
                onClick: () => updateNutrition(activeClient.id, antes),
              },
            });
          }}
        />
      )}
    </div>
  );
};
