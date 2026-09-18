import { useMemo, useState } from 'react';
import { ClipboardCopy, ClipboardPaste, Copy, CopyPlus, FileUp, Footprints, HeartPulse, Plus, Trash2, Users } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { TIPO, copiar as copiarAlPortapapeles, usePortapapeles, useZonasDeSoltar } from '@/lib/portapapeles';
import { useAtajosDeCopia } from '@/lib/useAtajosDeCopia';
import {
  buildFoodEntry,
  buildOption,
  cloneOption,
  emptyNutrition,
  hasCycleMap,
  isEmptyDiet,
  mealTarget,
  mealsForVariant,
  optionMacros,
  planDays,
  targetsFor,
  cycleMap,
  cycleMatchesSplit,
} from '@/domain/nutrition';
import { cycleSlots } from '@/domain/training';
import { blockPlan, currentBlock, structureOfBlock } from '@/domain/blocks';
import { dietLog } from '@/domain/timeline';
import { rollingWeightAverage, weightSeries } from '@/domain/anthropometry';
import { piezaDePlato, platoFoods, platoKcals, scalePlatoTo } from '@/domain/platos';
import { comoLista } from '@/domain/cajon';
import { MAX_GRUPOS, buildGrupo, gruposOf } from '@/domain/gruposEquiv';
import { mergeCatalog } from '@/domain/catalog';
import { ajusteDe, clientProtocol, isModuleOn, toggleModule } from '@/domain/protocol';
import { toNum0 } from '@/lib/num';
import { norm } from '@/lib/texto';
import { SaveIndicator, SegmentedControl } from '@/components/ui/primitives';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { Destino } from '@/components/ui/Portapapeles';
import { useGuardarEnPlantillas } from '@/components/Coach/guardarEnPlantillas';
import { AjustesPlan } from '@/components/nutrition/AjustesPlan';
import { QuitarElDia } from '@/components/nutrition/QuitarElDia';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { ConditionsNote } from '@/components/conditions/ConditionsNote';
import { EditarObjetivo } from '@/components/nutrition/EditarObjetivo';
import { MacroTargetCard } from '@/components/nutrition/MacroTargetCard';
import { MealCard } from '@/components/nutrition/MealCard';
import { DietNotes } from '@/components/nutrition/DietNotes';
import { DiaPopup } from '@/components/nutrition/DiaPopup';
import { GoalCard } from '@/components/nutrition/GoalCard';
import { LecturasDeLaDieta } from '@/components/nutrition/LecturasDeLaDieta';
import { PlanDia } from '@/components/nutrition/PlanDia';
import { RepartoComparado } from '@/components/nutrition/RepartoComparado';
import { TiraDeLaDieta } from '@/components/nutrition/TiraDeLaDieta';
import { TarjetasDeDia } from '@/components/nutrition/TarjetasDeDia';
import { PieDeProtocolo } from './ClientSettings';
import { PastePlanDialog } from './Import/PastePlanDialog';
import { CopyToClientPanel } from './Workout/CopyToClientPanel';
import { VueltaALaRevision } from '@/components/review/VueltaALaRevision';
import { useReviewRows } from '@/components/review/useReviewRows';

/**
 * Dieta: una mesa y un costado, como Entreno.
 *
 * ══ La anatomía, y ahora es UNA para las dos formas de plan ════════════════
 *
 *     5 comidas · el menú suma 2.887 de 3.050 kcal · faltan 163   guardado · ⚙
 *     ┌ la hoja ────────────────────────────┐ ┌ el costado ────────────┐
 *     │ ▌Días de entreno  Días de descanso  │ │ Objetivo · 3.050 kcal  │
 *     ├─────────────────────────────────────┤ │ El día     3.072/3.100 │
 *     │ desayuno · comida · cena…           │ │ El reparto  2,1 g/kg   │
 *     │ + comida ▾                          │ │ La semana              │
 *     │ pasos · cardio · tus pautas         │ │ La evolución  −2,4 kg  │
 *     └─────────────────────────────────────┘ └────────────────────────┘
 *
 * Una fila de mando —de qué habla la pantalla, y qué puedes hacer—, y debajo
 * las dos columnas: en la mesa lo que se pauta, en el costado con qué se juzga.
 * Igual que en Entreno y en el mismo canto de la pantalla.
 *
 * ── Lo que cambia según el plan es LA MESA, no la pantalla ─────────────────
 * · CERRADA   → la mesa son las comidas.
 * · POR MACROS→ la mesa es el reparto por comida (`PlanDia`), plegado hasta que
 *               se toca: quien pone «por macros» a veces lo hace precisamente
 *               para no repartir nada.
 *
 * Antes un plan por macros era otra pantalla —una columna de 980 px con el
 * costado subido arriba— y era además el chasis de fábrica, o sea lo primero
 * que ve cualquier cliente nuevo. Medido: 175 px de columna de trabajo contra
 * 323 de costado. Estaba del revés y era una excepción por pantalla, que es lo
 * que la ley de la hoja prohíbe.
 *
 * ── Dónde vive cada cosa ────────────────────────────────────────────────────
 * · LOS DÍAS del plan están en la CINTA, que es la cabecera de la hoja
 *   (`TiraDeLaDieta`) — no en unas pestañas de la fila de mando. Y de ahí
 *   cuelga el día que se añade.
 * · AÑADIR está al pie de lo que hay y en un solo sitio, que es donde va a
 *   aparecer lo nuevo. Traer de fuera (la otra dieta, un Excel, la dieta de
 *   otro cliente) cuelga de ahí mismo: es otra forma de meter comidas.
 * · LAS LECTURAS —el día, el reparto en g/kg, la semana, la evolución— están en
 *   el costado (`LecturasDeLaDieta`), que antes eran 2.250 px vacíos.
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
    /* Los pesajes de esta persona: la evolución de la dieta se dibuja contra
       ellos, y el g/kg se lee contra su peso. Ver `LecturasDeLaDieta`. */
    anthropometry,
    foodLibrary,
    catalogFoods,
    /* Tus platos viven en el CAJÓN, como los días de entreno: son criterio tuyo
       y no de un cliente, y desde la 0112 están en la tabla `coach_templates`
       del equipo. Ver `domain/cajon.js`. */
    cajon,
    /* Tus grupos de equivalencia SÍ se quedan en las preferencias: un grupo no
       se coloca en ningún sitio —se aplica solo donde salga alguno de sus
       alimentos—, así que no es una pieza del portapapeles y no tiene cajón.
       Ver §8 de `docs/replanteamiento-lo-guardado.md`. */
    coachPrefs,
    updateCoachPreferences,
    saveStatus,
    retrySave,
    updateNutrition,
    updateNutritionTargets,
    applyRescaledMeals,
    /* Los días del plan: añadir, duplicar, renombrar y quitar. Estaban en un
       solo interruptor de Ajustes («dos dietas») y ahora cuelgan de la cinta,
       que es donde se ven los días. Ver `useNutrition`. */
    addDietDay,
    duplicateDietDay,
    renameDietDay,
    removeDietDay,
    setDietCycleSlot,
    repartirPorElEntreno,
    /* El programa, solo para «Repartir por el entreno»: de ahí sale qué días
       entrena esta persona, que la aplicación ya sabía y aun así preguntaba. */
    workoutData,
    addMeal,
    appendMeal,
    removeMeal,
    removeMealsById,
    restoreMeal,
    restoreFoodInOption,
    updateMealName,
    updateMealNote,
    updateMealTarget,
    toggleMealFijo,
    moveMeal,
    moveFood,
    duplicateOption,
    addMealOption,
    setMealOptions,
    renameMealOption,
    removeMealOption,
    addFoodToOption,
    addFoodsToOption,
    removeFoodFromOption,
    updateFoodGrams,
    swapFood,
    setFoodDisplay,
    setFoodFixed,
    editFood,
    upsertLibraryFood,
    importDiet,
    importRoutine,
    ensureNutrition,
    saveClientException,
    updateClientPreferences,
    setFoodEquivalences,
  } = useApp();

  const confirm = useConfirm();
  const toast = useToast();
  /* Guardar un plato en el cajón, que es el mismo gesto —y el mismo tope, y el
     mismo desempate de nombre— que guardar un día o un bloque. */
  const guardarEnPlantillas = useGuardarEnPlantillas();
  /* Lo copiado que esta pantalla sabe pegar. La dieta entra en el portapapeles
     por lo mismo que Entreno: montar a alguien igual que a otro es la mitad del
     alta, y hasta ahora eso era un panel de réplica escondido en un menú que
     solo sabía traerlo TODO. Ver `lib/portapapeles`. */
  const comidasCopiadas = usePortapapeles(TIPO.COMIDA);
  /* Y la ración suelta, que es la pieza pequeña de la dieta: lo que antes solo
     sabía moverse con un «copiar a otro día» dentro de esta misma persona. Ver
     `TIPO.PLATO` en `lib/portapapeles`. */
  const platosCopiados = usePortapapeles(TIPO.PLATO);
  const menusCopiados = usePortapapeles(TIPO.DIA_DIETA);
  const plan = nutrition[activeClient.id] || emptyNutrition();
  const save = saveStatus('nutrition', activeClient.id);

  /* El día abierto. Arranca a nulo, y entonces manda el primero: con los días
     en una lista, partir de un id fijo —«training»— era una suposición sobre lo
     que este plan tiene dentro. */
  const [dietView, setDietView] = useState(null);
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
  /* Qué día tiene el editor de su objetivo abierto. Guarda el ID y no un
     booleano por lo mismo que `diaAbierto`: la ventana dice de qué día habla en
     su título y guarda sobre ese día, no sobre el que esté delante cuando se
     pulse «Guardar». */
  const [objetivoAbierto, setObjetivoAbierto] = useState(null);
  /* La opción abierta en cada comida, por id: el resumen del día suma con ellas. */
  const [elegidas, setElegidas] = useState({});
  /* Quitar un día pregunta antes, y enseña lo que se lleva: ver `QuitarElDia`. */
  const [quitando, setQuitando] = useState(null);
  /* El reparto de un plan por macros. Ver `elReparto` más abajo: sin nada
     repartido no es una tabla plegada, es una decisión sin tomar. */
  const [repartoAbierto, setRepartoAbierto] = useState(null);
  /*
    ══ ⌘C Y ⌘V TAMBIÉN AQUÍ ═══════════════════════════════════════════════════

    En Entreno el gesto existe desde que hay portapapeles y en la dieta no, que
    es media herramienta: se copia y se pega lo mismo —una pieza que viaja— y el
    teclado contestaba en una pantalla y no en la otra.

    La pieza es LA COMIDA EN FOCO, que aquí no había que inventar: la comida en
    la que se está trabajando es aquella dentro de la cual está el cursor. Sin
    ninguna, la primera —igual que la hoja copia el primer ejercicio cuando no
    hay ninguno señalado—, y lo que ha entrado lo dice la mano dos segundos, que
    es la ley II del portapapeles.

    Las tres guardas —dentro de un campo manda el navegador, con texto
    seleccionado también, y no se toca el del sistema— viven en el gancho, que es
    el mismo que usa la hoja de series. Ver `lib/useAtajosDeCopia`.
  */
  const atajos = useAtajosDeCopia();
  const [focoComida, setFocoComida] = useState(null);
  /*
    Y una comida copiada se puede ARRASTRAR desde la mano hasta la comida que la
    recibe. Aquí es donde hace falta y no en la mano: el menú tiene seis comidas
    y un clic no puede decir en cuál entra. El verbo de la mano sigue pegando al
    final del menú, que sí es un sitio único. Ver `useZonasDeSoltar`.
  */
  const deLaMano = useZonasDeSoltar([TIPO.COMIDA, TIPO.PLATO]);

  /*
    LOS DÍAS DEL PLAN, y salen del dominio.

    Esta pantalla llevaba su propia pareja escrita a mano —y era una de las
    CINCO copias de la misma lista repartidas por el código—. Hoy son los que
    haya: uno, dos o siete. Ver «LOS DÍAS DE LA DIETA» en `domain/nutrition.js`.
  */
  const dias = planDays(plan);
  /* El día que se está mirando. `dietView` puede quedarse rancio —se quita el
     día abierto, se recarga el plan— y entonces manda el primero, que es lo que
     `dayById` ya resuelve: aquí solo se recoge su id para no pedir dos veces lo
     mismo. */
  const variant = (dias.find((d) => d.id === dietView) || dias[0]).id;
  const diaActual = dias.find((d) => d.id === variant) || dias[0];
  const meals = mealsForVariant(plan, variant);
  const cerrado = plan.type === 'closed';
  const variosDias = dias.length > 1;

  /* Sin decidir (null), el reparto se enseña si ya hay algo repartido. */
  const repartoVisible = repartoAbierto === null ? meals.length > 0 : repartoAbierto;
  /*
    ── Cuándo el objetivo baja a la mesa ──────────────────────────────────────
    Cuando el plan es por macros y NO hay reparto por comidas, que es el único
    caso en el que la mesa se queda sin trabajo: entonces el objetivo es todo lo
    que se pauta, y lo que se pauta va en la mesa. Con reparto puesto la mesa ya
    tiene su tabla (`PlanDia`) y el objetivo vuelve al costado, contra el que se
    cuadra fila a fila. Ver `MacroTargetCard`, forma «mesa».
  */
  const objetivoEnLaMesa = !cerrado && !repartoVisible;

  /*
    ── «Un día | Todos»: el reparto de todos los días en la misma mesa ─────────
    Comparar la comida del día de descanso con la del de entreno era cambiar de
    pestaña y acordarse de las cifras. Con «Todos» la mesa es `RepartoComparado`
    y se escribe en cualquier día sin salir. Solo existe donde hay algo que
    comparar: por macros, con reparto y con más de un día. Pulsar un día de la
    cinta vuelve a «Un día» con ese día abierto.
  */
  const [comparar, setComparar] = useState(false);
  const puedeComparar = !cerrado && repartoVisible && variosDias;
  const comparando = comparar && puedeComparar;

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

  /*
    ── LA FICHA DE REFERENCIA DE CADA ALIMENTO DEL MENÚ, por su nombre ───────
    Solo para rellenar lo que la copia congelada de una entrada de dieta no diga
    del ENVASE: la fibra de una avena pautada antes de que existieran esas
    columnas. Los macros no se tocan nunca. Ver `declaredMicro` y la cabecera de
    «LA FIBRA QUE NO SUMABA» en `LecturasDeLaDieta`.

    Por `norm` y no por el nombre crudo: es la misma clave con la que el catálogo
    decide que dos alimentos son el mismo («Pan Integral» y «pan integral »).
  */
  const fichaDelAlimento = useMemo(() => {
    const porNombre = new Map(alimentosDisponibles.map((f) => [norm(f?.name), f]));
    return (entrada) => porNombre.get(norm(entrada?.name)) || null;
  }, [alimentosDisponibles]);

  /*
    ── Las opciones avanzadas del entrenador ─────────────────────────────────
    De él y no de este cliente: quien pauta fibra la pauta en todos. Ver el
    interruptor en `AjustesPlan`.
  */
  const avanzado = Boolean(coachPrefs?.dieta?.micros);

  /*
    ── Cambiar de «el día» a «cada comida», y al revés ───────────────────────
    Vivía dentro de `ComoSePauta`, en la mesa; el mando se ha mudado al panel de
    ajustes y la regla se queda aquí, que es donde está el plan. Volver a «el
    día» con filas escritas se lleva el reparto entero: se pregunta antes, y se
    dice cuántas filas son.
  */
  const cambiarReparto = async (quiere) => {
    if (!quiere && meals.length > 0) {
      const ok = await confirm({
        title: '¿Quitar el reparto?',
        message: `Se borran las ${meals.length} comidas del reparto de ${diaActual.name.toLowerCase()}.`,
        detail: 'El objetivo de kcal y macros se queda. No se puede deshacer.',
        confirmLabel: 'Quitar el reparto',
        tone: 'danger',
      });
      if (!ok) return;
      applyRescaledMeals(activeClient.id, variant, []);
    }
    setRepartoAbierto(quiere);
  };

  /*
    ══ COPIAR Y PEGAR DIETA ═══════════════════════════════════════════════════
    Las mismas dos piezas que en Entreno y por el mismo motivo: aquí ya se podía
    copiar una comida a la otra variante y el menú entero de otro cliente, pero
    las dos rutas decidían origen y destino en el mismo gesto. Copiar la cena de
    Marta al lunes de Luis no era lento: no existía.

    De qué VARIANTE salió se guarda en el origen y no en la carga: al pegar, la
    comida cae en la variante que se esté mirando, que es la que el entrenador
    tiene delante. Traérsela con su variante de casa la mandaría a la pestaña que
    no está abierta, que es la forma más rápida de que un «pegar» parezca no
    haber hecho nada.
  */
  const dondeEstoy = variosDias ? `dieta · ${diaActual.name.toLowerCase()}` : 'dieta';

  /*
    ── EL OBJETIVO DEL DÍA VIAJA CON LO COPIADO ──────────────────────────────
    En el origen y no en la carga: no es parte del menú, es de dónde salió. Lo
    necesita el reparto a varios clientes, que entra el menú REESCALADO al
    objetivo que el destinatario ya tiene —mandar la misma dieta a ocho no es
    darles la misma dieta— y para escalar hace falta saber desde qué cifra. Sin
    esto, quien pega recibe los gramos de otra persona. Ver `domain/reparto`.
  */
  const deQueObjetivo = toNum0(targetsFor(plan, variant).targetKcals) || null;
  const deDondeSale = { cliente: activeClient?.name || null, objetivoKcals: deQueObjetivo };

  const copiarComida = (mealIdx) => {
    const comida = meals[mealIdx];
    if (!comida) return;
    const opciones = (comida.options || []).length;
    copiarAlPortapapeles({
      tipo: TIPO.COMIDA,
      titulo: comida.name || 'Comida',
      detalle: `${opciones} ${opciones === 1 ? 'opción' : 'opciones'}`,
      origen: { ...deDondeSale, donde: dondeEstoy, dia: diaActual?.name || null },
      carga: comida,
    });
    /* Sin aviso, a propósito: es la ley II de la mano del portapapeles (ver
       `ui/Portapapeles`). El aviso es de lo que CAMBIA —copiar no le cambia
       nada a nadie— y la mano es de lo que LLEVAS; los dos a la vez eran dos
       voces para un mismo gesto. */
  };

  /*
    ══ Y UNA ALTERNATIVA SUELTA, QUE ES UN PLATO ══════════════════════════════

    La misma carga que se guarda en la vitrina, y por eso la misma función:
    `piezaDePlato` poda y bautiza igual para los dos, así que un plato copiado y
    un plato guardado son la misma cosa con y sin caducidad. Quien pega no tiene
    que saber de cuál de las dos viene.
  */
  const copiarPlato = (mealIdx, optIdx) => {
    const comida = meals[mealIdx];
    const opcion = comida?.options?.[optIdx];
    /* Cómo se llama la ración: el suyo si lo tiene, y si no el de la comida de
       la que sale —«Desayuno»—, que es lo que un plato guardado lleva escrito.
       «Opción 2» diría dónde estaba en una lista, no qué es, y eso viajando a
       otra persona no significa nada. Ver `optionName`. */
    const pieza = piezaDePlato({
      name: String(opcion?.name || '').trim() || comida?.name,
      foods: opcion?.foods,
      origen: { ...deDondeSale, donde: dondeEstoy, dia: diaActual?.name || null },
    });
    if (pieza) copiarAlPortapapeles(pieza);
  };

  /*
    ── Y lo pegado se deshace ────────────────────────────────────────────────
    La otra mitad de la ley de la casa: lo que escribe en el plan de alguien se
    ve antes y se deshace después. Aquí es donde más falta hacía —pegar un menú
    son seis comidas al final de la lista, y quitarlas a mano, seis gestos con
    su pregunta cada uno—. Se quita POR ID y no por posición: el aviso vive seis
    segundos y en ese rato se puede haber movido o añadido cualquier otra.
  */
  /*
    ── Y PUEDE CAER EN UN DÍA QUE NO ES EL ABIERTO ───────────────────────────
    Por defecto, aquí: es lo que significa el verbo de la mano, que habla del
    menú que se está mirando. Con un día por destino es lo que se ha soltado
    sobre su pestaña de la cinta, y entonces el aviso tiene que decir DÓNDE ha
    caído —el cambio ocurre en una pantalla que no se ve, y sin decirlo se lee
    como que no ha pasado nada—.
  */
  const pegarComida = (pieza, destinoId = variant) => {
    const puesta = appendMeal(activeClient.id, destinoId, pieza.carga);
    const dia = destinoId === variant ? null : dias.find((d) => d.id === destinoId);
    toast({
      text: dia
        ? `«${pieza.titulo}» pegada en ${dia.name.toLowerCase()}.`
        : `«${pieza.titulo}» pegada al final del menú.`,
      action: {
        label: 'Deshacer',
        onClick: () => removeMealsById(activeClient.id, destinoId, [puesta.id]),
      },
    });
  };

  /*
    ══ Y UNA COMIDA CAE TAMBIÉN DENTRO DE OTRA ════════════════════════════════

    `pegarComida` la pone al final del menú, que es «una comida más». El otro
    gesto —«la cena de Marta, como ALTERNATIVA de esta cena»— es lo que la
    estructura de opciones pide desde que existe y no se podía hacer: había que
    pegar la comida al final, abrirla, copiar sus alimentos uno a uno en una
    opción nueva de la de arriba y borrar la pegada.

    Es la misma ley que la pauta de un ejercicio en la hoja: lo que viaja es el
    contenido, y la identidad —el nombre de la comida, su sitio en el día— es de
    la que ya está puesta. Por eso aquí no hay «Deshacer» que borre nada: se
    añaden alternativas y el inverso es la lista de antes.

    ── Cómo se llama lo que entra ────────────────────────────────────────────
    Una opción sin nombre se lee «Opción 2», que dice dónde está en una lista y
    no qué es (ver `optionName`) — y justo aquí es cuando más falta hace, porque
    lo que entra viene de otra comida y a veces de otra persona. Así que la que
    llega sin nombre toma el de la comida de la que salió; con varias, cada una
    lleva además su ordinal para que dos alternativas de la misma cena no se
    llamen igual.
  */
  const pegarComoOpcion = (pieza, mealIdx) => {
    const comida = meals[mealIdx];
    const antes = comida?.options || [];
    /* Sin pieza no hay nada que meter: la mano puede haberse vaciado en otra
       pestaña entre pintar el verbo y pulsarlo. */
    const suyas = pieza?.carga?.options || [];
    if (!comida || suyas.length === 0) return;
    const nuevas = suyas.map((opcion, i) => {
      const clon = cloneOption(opcion);
      if (clon.name) return clon;
      return { ...clon, name: suyas.length === 1 ? pieza.titulo : `${pieza.titulo} ${i + 1}` };
    });
    setMealOptions(activeClient.id, variant, mealIdx, [...antes, ...nuevas]);
    /* Y se ABRE la primera que ha entrado. Sin esto, pegar deja la comida
       enseñando la alternativa de antes y el gesto se lee como que no ha hecho
       nada — que es lo que lleva a pulsarlo tres veces. Es lo mismo que hace
       `onDuplicateOption` al duplicar, y por lo mismo. */
    setElegidas((e) => ({ ...e, [comida.id]: antes.length }));
    toast({
      text: `«${pieza.titulo}» entra en «${comida.name}» como ${
        nuevas.length === 1 ? 'otra alternativa' : `${nuevas.length} alternativas más`
      }.`,
      action: {
        label: 'Deshacer',
        onClick: () => setMealOptions(activeClient.id, variant, mealIdx, antes),
      },
    });
  };

  const copiarMenu = () => {
    if (meals.length === 0) {
      toast({ text: 'Este menú está vacío: no hay nada que copiar.' });
      return;
    }
    copiarAlPortapapeles({
      tipo: TIPO.DIA_DIETA,
      titulo: variosDias ? `Menú de ${diaActual.name.toLowerCase()}` : 'Menú del día',
      detalle: `${meals.length} ${meals.length === 1 ? 'comida' : 'comidas'}`,
      origen: { ...deDondeSale, donde: null },
      carga: { meals },
    });
    /* Sin aviso: lo dice la mano. Ver `copiarComida`. El de arriba se queda —«no
       hay nada que copiar» es de algo que NO ha pasado—. */
  };

  /*
    ══ LA DIETA ENTERA, que es la única pieza de nutrición que SUSTITUYE ══════

    Copiar el menú de un día lleva UN día y al pegarlo se añade. Esto lleva el
    plan completo —todos sus días, con sus nombres y sus menús— y ponerlo en
    alguien le borra el suyo. Por eso es otra pieza y no una opción de la de
    arriba: lo que hace al pegarse es distinto, y las consecuencias también.

    ── Lo que viaja aquí, y solo aquí, es la PROPORCIÓN ───────────────────────
    De cada día se guarda cuánto pide respecto al primero, no sus calorías. Un
    alto/bajo del 20 % puesto en alguien de 1.800 kcal tiene que seguir siendo
    del 20 %: lo que define un ciclado es la distancia entre sus días, no las
    cifras. Sin objetivo de origen la proporción es 1 y la dieta entra tal cual,
    dicho en la columna del reparto. Ver `replaceDietDays`.

    No viajan sus objetivos, ni las pautas, ni los pasos, ni el cardio, ni las
    equivalencias: son de la persona.
  */
  const copiarLaDieta = () => {
    const conMenu = dias.filter((d) => (d.meals || []).length > 0);
    if (conMenu.length === 0) {
      toast({ text: 'Esta dieta no tiene ninguna comida: no hay nada que copiar.' });
      return;
    }
    const base = toNum0(targetsFor(plan, dias[0]?.id).targetKcals) || 0;
    const comidas = dias.reduce((n, d) => n + (d.meals?.length || 0), 0);
    copiarAlPortapapeles({
      tipo: TIPO.DIETA,
      titulo: `Dieta de ${activeClient.name?.split(' ')[0] || 'este cliente'}`,
      detalle: `${dias.length} ${dias.length === 1 ? 'día' : 'días'} · ${comidas} ${comidas === 1 ? 'comida' : 'comidas'}`,
      origen: { ...deDondeSale, donde: dondeEstoy, objetivoKcals: base || null },
      carga: {
        days: dias.map((d) => ({
          name: d.name,
          meals: d.meals || [],
          /* Contra el PRIMERO, que es el que manda el objetivo del plan. */
          proporcion: base ? (toNum0(targetsFor(plan, d.id).targetKcals) || base) / base : 1,
        })),
      },
    });
  };

  /*
    Se AÑADE al final; nunca sustituye. Es la misma ley que `copyMealToVariant`:
    copiar no debería poder borrar. Si acaban saliendo dos cenas se ve al momento
    y se quita una, que es un error reversible — al revés que perder el menú que
    había.
  */
  const pegarMenu = (pieza, destinoId = variant) => {
    const comidas = pieza.carga?.meals || [];
    const puestas = comidas.map((comida) => appendMeal(activeClient.id, destinoId, comida));
    const dia = destinoId === variant ? null : dias.find((d) => d.id === destinoId);
    const cuantas = `${comidas.length} ${comidas.length === 1 ? 'comida añadida' : 'comidas añadidas'}`;
    toast({
      text: dia ? `${cuantas} en ${dia.name.toLowerCase()}.` : `${cuantas} al final del menú.`,
      action: {
        label: 'Deshacer',
        onClick: () => removeMealsById(activeClient.id, destinoId, puestas.map((m) => m.id)),
      },
    });
  };

  /*
    ── Y ESTE MENÚ SE REGISTRA COMO DESTINO ──────────────────────────────────
    Para que la mano del portapapeles pueda decir dónde cae lo que llevas en vez
    de esconderlo dentro del «+ comida». Acepta las dos formas de la dieta —una
    comida suelta y el menú entero— y las dos se resuelven con los verbos de
    arriba: aquí no hay operación nueva, hay un verbo a la vista.

    El nombre es EL DEL MENÚ y no el de la pantalla: con dos variantes montadas,
    «en la dieta» no dice a cuál de las dos, que es justo lo que hay que saber
    antes de pulsar.
  */
  const elMenu = variosDias ? `el menú de ${diaActual.name.toLowerCase()}` : 'el menú del día';
  const pegarEnElMenu = (pieza, destinoId = variant) =>
    pieza.tipo === TIPO.DIA_DIETA ? pegarMenu(pieza, destinoId) : pegarComida(pieza, destinoId);

  /*
    ══ Y LAS PESTAÑAS DE LOS DÍAS SON DONDE CAE ═══════════════════════════════

    La ley del arrastre de la casa: **se arrastra cuando hay que elegir cuál; se
    pulsa cuando el sitio es uno** (ver `useZonasDeSoltar`). A qué día va esta
    comida ES elegir cuál, y hasta ahora se contestaba con un ⇄ en la fila de la
    comida que abría una lista de días — un mando que además solo llegaba a los
    días de ESTA persona, mientras la mano llega a cualquiera.

    Ahora se contesta como en la rejilla del bloque, que tenía exactamente el
    mismo problema con sus columnas: se suelta encima del día. La cinta ya está
    delante mientras se trabaja, así que el destino no hay que ir a buscarlo.

    Y lo que se suelta cae SIN cambiar de día: se sigue mirando lo que se estaba
    montando, y lo que ha pasado allí lo dice el aviso con su «Deshacer».

    ── Y en táctil, donde no hay arrastre ───────────────────────────────────
    Se pulsa el día y se usa el verbo de la mano, que dice «Pegar «Comida 1» en
    el menú de bajo». No hace falta nada más: el `Destino` de abajo ya lo
    enciende. Es la misma pareja de caminos que la rejilla del bloque.
  */
  const alDia = useZonasDeSoltar([TIPO.COMIDA, TIPO.DIA_DIETA]);

  /*
    ── QUÉ SE OFRECE PEGAR DENTRO DE UNA COMIDA, CUANDO LLEVAS DE LAS DOS ────
    Dos formas caben ahí dentro —una comida entera y un plato— y la fila de la
    alternativa tiene UN verbo de pegar, no dos: dos iconos iguales seguidos
    obligarían a distinguirlos por el orden.

    Manda lo ÚLTIMO copiado, que es la ley de ⌘V y la que ya sigue el resto de
    esta pantalla. Las dos listas llegan ordenadas por fecha desde la bandeja,
    así que basta comparar sus cabezas.
  */
  const loQueCabeDentro =
    [comidasCopiadas[0], platosCopiados[0]]
      .filter(Boolean)
      .sort((a, b) => (b.fecha || 0) - (a.fecha || 0))[0] || null;

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

  /*
    ══ EL REPARTO DEL CICLO ═══════════════════════════════════════════════════

    A qué día de dieta le toca cada casilla del ciclo de esta persona. Es UN
    dato —el mapa— y dos maneras de rellenarlo: a mano, casilla a casilla, o de
    un botón que lo copia del entreno. La regla vive en el dominio; aquí se leen
    las dos fuentes y se juntan.

    ── Y las casillas no siempre son siete ──────────────────────────────────
    Eran los siete días de la semana, escritos aquí mismo. A quien entrena por
    ciclo rotativo —«2 y 1»— eso le pedía decir qué come los martes, que en un
    ciclo de tres días no significa nada: su alto/bajo no se podía repartir.
    Ahora las pone `cycleSlots` desde el ciclo del cliente, y esta pantalla no
    sabe si son siete días con nombre o los nueve de un microciclo.

    El botón lee el bloque EN CURSO —el `weeklySplit` en el semanal, y en el
    rotativo el propio patrón, que ya dice qué casillas son descanso—, que es lo
    que la aplicación ya sabía de esta persona y aun así le preguntaba al
    cliente. Y copia una vez: no queda enlazado, porque el split es por bloque y
    una dieta que se recoloca sola el día que cambias el entreno es la
    aplicación decidiendo por ti.
  */
  const programa = workoutData[activeClient.id];
  const casillas = useMemo(() => {
    const bloque = currentBlock(programa);
    const rotativo = (activeClient.cycleType || 'weekly') === 'rotating';
    return cycleSlots({
      cycleType: activeClient.cycleType,
      pattern: activeClient.cyclePattern,
      sessions: rotativo && bloque ? blockPlan(programa, bloque).sessions : [],
      weeklySplit: bloque ? structureOfBlock(programa, bloque).weeklySplit || {} : {},
    });
  }, [programa, activeClient.cycleType, activeClient.cyclePattern]);

  /* El botón solo existe si el ciclo dice algo: una semana entera en blanco no
     reparte nada, y el mapa a mano sigue estando. En el rotativo el patrón
     siempre lo dice, así que siempre hay de dónde copiar. */
  const hayEntreno = casillas.some((c) => !c.rest);

  /* Qué día de dieta es el «de entreno» y cuál el «de descanso» para el botón:
     el que se está mirando y el siguiente. Con más de dos días no se adivina —un
     ciclado de hidratos no sigue al entreno— y por eso el botón solo existe con
     exactamente dos. */
  const parejaParaElSplit = dias.length === 2 ? { entreno: dias[0].id, descanso: dias[1].id } : null;

  const mapaCiclo = cycleMap(plan, casillas);
  /* Cuántas casillas del ciclo le tocan a cada día: el «×6 días» de su tarjeta.
     Sin ciclo repartido no hay cuenta que dar y el mapa sale vacío, que es lo
     correcto —la tarjeta calla en vez de decir «×0 días»—. */
  const vecesEnElCiclo = useMemo(() => {
    const cuenta = {};
    for (const dayId of Object.values(mapaCiclo)) {
      if (dayId) cuenta[dayId] = (cuenta[dayId] || 0) + 1;
    }
    return cuenta;
  }, [mapaCiclo]);
  const cicloRepartido = hasCycleMap(plan);
  const cicloCuadra =
    hayEntreno && parejaParaElSplit ? cycleMatchesSplit(plan, casillas, parejaParaElSplit) : true;

  /*
    ══ EL REGISTRO FECHADO DE LA DIETA ════════════════════════════════════════

    «Las kcals no las coge en la gráfica, cuando este cliente tuvo varios cambios
    que sí se recogen en la página de resumen.»

    Y las dos pantallas leían sitios distintos: la revisión, la foto del plan que
    queda al cerrar cada revisión; esta, solo la foto que se guarda al registrar
    un pesaje —que un cliente que se pesa desde el portal casi nunca tiene—. La
    regla de juntar las dos vive en el dominio (`dietLog`), y las revisiones las
    trae el mismo gancho que usan la revisión y el expediente: una sola consulta
    y una sola forma de pedirla.
  */
  const { rows: revisiones } = useReviewRows(activeClient?.id, { conEnlaces: false });
  const registrosDeLaDieta = useMemo(
    () => dietLog({ history: anthropometry[activeClient.id]?.history || [], reviews: revisiones }),
    [anthropometry, activeClient.id, revisiones]
  );

  /* El peso contra el que se leen los g/kg: la media móvil de tres pesajes, la
     misma que usa el costado y por el mismo motivo —un pesaje suelto se mueve un
     kilo por la sal de anoche—. Hace falta aquí desde que el objetivo por macros
     los pinta en la mesa (ver `MacroTargetCard`, forma «mesa»). */
  const pesoMedio = rollingWeightAverage(registrosDeLaDieta, 3);
  const ultimoPesaje = useMemo(() => {
    const puntos = weightSeries(registrosDeLaDieta);
    return puntos.length > 0 ? puntos[puntos.length - 1].date : null;
  }, [registrosDeLaDieta]);

  /*
    ── LO QUE LA VENTANA DEL OBJETIVO NECESITA PARA ENSEÑAR EL MENÚ ──────────
    El menú del día, el catálogo —de él sale la CESTA, o sea de dónde se
    recorta: sin categorías el recorte vuelve a la densidad del macro y la fruta
    baja con el arroz— y de dónde salieron las calorías la última vez con esta
    persona. Con el plan por macros no hay menú y la ventana es el formulario de
    siempre. Ver `EditarObjetivo`.

    En un memo porque de él cuelga el reescalado entero: un objeto nuevo en cada
    render volvería a recorrer las veinte opciones del menú en cada tecla.
  */
  /*
    Y va TAMBIÉN con el plan por macros, donde no hay un gramo que mover. Aquí
    estuvo un `cerrado ?` que lo dejaba en `null`, y con él se iba el piso de en
    medio: un plan por macros es reparto y nada más —es literalmente lo único
    que se pauta—, así que era justo el que más falta le hacía que el reparto
    siguiera al objetivo. Sin menú, el paso del menú sigue sin aparecer solo.
  */
  const reajusteDelObjetivo = useMemo(
    () => ({
      meals: mealsForVariant(plan, objetivoAbierto || variant),
      catalog: alimentosDisponibles,
      ajuste: ajusteDe(protocolo),
    }),
    [plan, objetivoAbierto, variant, alimentosDisponibles, protocolo]
  );

  /**
   * Guardar el objetivo de una variante y, con él, el menú reajustado si la
   * ventana traía uno.
   *
   * ══ Antes eran dos gestos y ahora es uno ═══════════════════════════════════
   *
   * Esto guardaba el objetivo y OFRECÍA el reescalado en una segunda ventana:
   * el objetivo quedaba escrito pasara lo que pasara, así que cerrar aquella
   * ventana dejaba el objetivo nuevo con el menú viejo sin que nada lo dijera.
   * Ahora la decisión entera se toma en una sola ventana —el objetivo, de dónde
   * sale y qué gramos se mueven— y aquí solo se escribe lo que traiga.
   *
   * @param extra  `{ meals, ajuste }` de `EditarObjetivo`. `meals` es el menú ya
   *   reajustado —o `null` si no hay nada que aplicar, incluido el caso de haber
   *   apartado todas las filas— y `ajuste`, el ancla a recordar para la próxima
   *   vez con esta persona.
   */
  const guardarObjetivo = (v) => (fields, extra = null) => {
    const antes = targetsFor(plan, v);
    updateNutritionTargets(activeClient.id, v, fields);

    /*
      Y lo elegido se queda para la próxima. Por `updateClientPreferences` y NO
      por `saveClientException`, al revés que las equivalencias de aquí al lado:
      `ajuste` está en `NOT_COMPARED_KEYS`, así que no hay nada que proteger de
      «poner al día» — y marcar a alguien como excepción a la plantilla por haber
      contestado una pregunta dentro de una ventana sería escribirle una
      consecuencia que no ha pedido. Ver `AJUSTES` en `domain/protocol`.
    */
    if (extra?.ajuste) {
      updateClientPreferences(activeClient.id, 'protocol', { ajuste: extra.ajuste });
    }

    if (extra?.meals) {
      const viejas = mealsForVariant(plan, v);
      applyRescaledMeals(activeClient.id, v, extra.meals);
      /* Un gesto, un paso: deshacer devuelve las dos cosas, porque las dos las
         ha escrito el mismo «Guardar». Ver [[deshacer-el-plan]]. */
      toast({
        /* Y se dice lo que se ha escrito de verdad: el objetivo puede mover
           solo el reparto por comida sin tocar un gramo del menú. Decir
           «menú reajustado» ahí sería contar un trabajo que no se ha hecho. */
        text: extra.menu
          ? 'Objetivo guardado y menú reajustado.'
          : 'Objetivo guardado y reparto ajustado.',
        action: {
          label: 'Deshacer',
          onClick: () => {
            updateNutritionTargets(activeClient.id, v, antes);
            applyRescaledMeals(activeClient.id, v, viejas);
          },
        },
      });
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
  /* Desde la 0112 viven en el CAJÓN —`coach_templates`, del equipo— y no en
     `profiles.preferences`. `comoLista` los devuelve con la forma plana de
     siempre, así que el buscador de la comida no se entera del cambio. */
  const platos = comoLista(cajon, TIPO.PLATO);

  /*
    Y guardar es el gesto de las tres puertas (`useGuardarEnPlantillas`): el
    tope, el desempate del nombre —«Desayuno», «Desayuno 2»— y el aviso los pone
    él, que es el que también los pone al guardar un día desde el cajón del
    bloque y al llegar a `/plantillas` con algo en la mano. Sin diálogo y sin
    preguntar: el nombre se cambia en la vitrina, que es donde se ve la lista
    entera y donde el nombre de verdad significa algo.
  */
  const guardarPlato = (mealIndex, optIndex) => {
    const meal = meals[mealIndex];
    const foods = meal?.options?.[optIndex]?.foods || [];
    if (foods.length === 0) return;
    guardarEnPlantillas({ tipo: TIPO.PLATO, titulo: meal.name, carga: { foods } });
  };

  /*
    ── TUS GRUPOS DE EQUIVALENCIA ────────────────────────────────────────────
    Qué vale por qué, dicho por ti. Viven donde los platos y por lo mismo: es
    criterio tuyo con nombre, no de un cliente (`domain/gruposEquiv`). Se montan
    desde la ventana de un alimento, que es el sitio donde se está viendo la
    lista de cinco huevos que sobra.
  */
  const grupos = gruposOf(coachPrefs);

  const guardarGrupo = ({ id, name, macro, foods }) => {
    if (!id && grupos.length >= MAX_GRUPOS) {
      toast({ text: `Ya tienes ${MAX_GRUPOS} grupos. Quita alguno desde Plantillas para guardar este.` });
      return;
    }

    const items = id
      ? grupos.map((g) => (g.id === id ? { ...g, name, macro, foods } : g))
      : [...grupos, buildGrupo({ name, macro, foods, savedAt: new Date().toISOString() })];

    updateCoachPreferences('gruposEquiv', { items });
    toast({
      text: id
        ? `«${name}»: ${foods.length} alimentos que valen uno por otro.`
        : `Guardado como «${name}». Donde salga alguno de sus ${foods.length} alimentos, se ofrecen estos.`,
    });
  };

  const quitarGrupo = (id) => {
    const fuera = grupos.find((g) => g.id === id);
    updateCoachPreferences('gruposEquiv', { items: grupos.filter((g) => g.id !== id) });
    /* Qué pasa a partir de ahora, que es lo que hace falta saber: no se pierde
       la lista, se vuelve a la calculada. */
    toast({
      text: `«${fuera?.name || 'El grupo'}» fuera. Esos alimentos vuelven a ofrecer las equivalencias del catálogo.`,
    });
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

  /**
   * Y el plato que se LLEVA entra como una alternativa más de esta comida.
   *
   * ── Por qué una alternativa nueva y no dentro de la abierta ───────────────
   * Porque es lo que sustituye: el «copiar la alternativa a otro día» que había
   * añadía una opción, no mezclaba sus alimentos con los de otra. Y es lo que
   * significa traerse la cena de Marta a la de Luis — otra manera de cenar, no
   * dos cenas sumadas. Meter los alimentos en la que está abierta es el otro
   * gesto y lo hace el buscador, que es donde se está componiendo UNA ración.
   *
   * Y a partir de ahí es `ponerPlato`: los mismos alimentos desplegados con ids
   * nuevos y la misma oferta de cuadrarlo al hueco de la comida. Un plato de la
   * mano y uno de tu vitrina no pueden comportarse distinto.
   */
  const pegarPlato = (pieza, mealIdx) => {
    const comida = meals[mealIdx];
    const foods = pieza?.carga?.foods || [];
    /* La mano puede haberse vaciado en otra pestaña entre pintar el verbo y
       pulsarlo. Misma guarda que `pegarComoOpcion`. */
    if (!comida || foods.length === 0) return;

    const nombre = pieza.carga?.name || pieza.titulo || 'Plato';
    const antes = comida.options || [];
    setMealOptions(activeClient.id, variant, mealIdx, [...antes, { ...buildOption(), name: nombre }]);
    /* Y se abre, por lo mismo que en `pegarComoOpcion`: lo que entra tiene que
       verse, o el gesto se lee como que no ha pasado nada. */
    setElegidas((e) => ({ ...e, [comida.id]: antes.length }));
    /* `ponerPlato` lee la opción de la comida del render —todavía sin ésta—, y
       eso es exactamente lo que hace falta: la alternativa recién creada está
       vacía, así que el hueco es el objetivo entero de la comida. Escribe sobre
       el estado, que el espejo de `useMirroredState` ya tiene al día. */
    ponerPlato(mealIdx, antes.length, { name: nombre, foods });
  };

  const handleAddFood = (mealIndex, optIndex, food) => {
    upsertLibraryFood(food);
    // Sin cantidad: la elige `buildFoodEntry` según el alimento —una unidad entera
    // si la tiene, 100 g si se pesa—. Fijar 100 aquí metía «casi dos huevos» cada
    // vez que se añadía uno.
    addFoodToOption(activeClient.id, variant, mealIndex, optIndex, food);
  };

  /*
    ══ AQUÍ VIVÍA LA LÍNEA GRIS, Y SE HA IDO ═════════════════════════════════

    Decía «3 comidas · el menú suma 3.072 de 3.100 kcal · cuadra», flotando
    sobre el lienzo por encima de la hoja. Tres cosas estaban mal con ella:

    1. REPETÍA EL COSTADO PALABRA POR PALABRA. «El día» da esas mismas cifras y
       ese mismo veredicto —3.072/3.100, «cuadra»— a dos dedos de distancia y
       con más contexto: los gramos de cada macro, el desvío y los g/kg. Era la
       enésima cifra de kcal de la pantalla y la única que no llevaba al sitio
       donde se corrige.
    2. ERA UNA CABECERA DE MÁS. Debajo, la cinta de la hoja YA es la cabecera de
       esta pantalla: dice qué día se está mirando y de ella cuelgan sus verbos.
       Dos cabeceras seguidas —una flotando sin caja sobre el lienzo y otra
       dentro de la caja— es lo que hace que una pantalla se lea como un
       documento con encabezado en vez de como una pantalla.
    3. SE LLEVABA LOS MANDOS FUERA DEL OBJETO SOBRE EL QUE ACTÚAN. El guardado,
       «copiar el menú» y los ajustes del plan vivían en el lienzo, no en la
       hoja que modifican. Ahora están al canto derecho de la cinta, que es la
       barra de esta hoja.

    Con ella se van `sumaDelDia`, `objetivoDelDia`, `faltan` y `verbo`: la
    cuenta del día se hace UNA vez y se lee donde se juzga, que es el costado.
  */

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
  /* Con «Todos», una comida nueva entra en TODOS los días: una fila que solo
     existe en uno descuadra el emparejado por posición de la mesa comparada.
     Pegar y traer se quedan en «Un día», que es donde se sabe en cuál caen. */
  const masComida = comparando ? (
    <MenuAcciones
      label="+ comida"
      sinFlecha
      ariaLabel="Añadir comida"
      items={[
        {
          icon: Plus,
          label: 'Nueva comida en todos los días',
          run: () => dias.forEach((d) => addMeal(activeClient.id, d.id)),
        },
      ]}
    />
  ) : (
    <MenuAcciones
      label="+ comida"
      sinFlecha
      ariaLabel="Añadir comida"
      items={[
        { icon: Plus, label: 'Nueva comida', run: () => addMeal(activeClient.id, variant) },
        /*
          ── AQUÍ HABÍA UN «COPIAR EL MENÚ DE …» POR CADA DÍA ────────────────
          Y era el ⇄ de la comida mirado desde el otro lado: la misma operación
          tirando en vez de empujando, con la lista de días repetida en un
          segundo sitio. Con siete días eran siete ítems en este menú.

          Lo hace la mano y con los mismos dos gestos: el ⧉ de la cinta copia el
          menú del día que sea, y aquí abajo aparece como «Añadir 5 comidas de
          «Menú de alto»» —que es la línea que ya estaba y sigue estando—.
          Montar un día NUEVO igual que éste tampoco lo necesitaba: eso es
          «Duplicar «Alto»», en el «···» de la cinta.
        */
        /* Lo del portapapeles va antes de «traer de fuera»: es lo que el
           entrenador acaba de copiar hace un minuto, así que es lo más probable
           y lo más cerca de la mano. */
        comidasCopiadas.length + menusCopiados.length > 0 ? null : undefined,
        ...comidasCopiadas.map((pieza) => ({
          icon: ClipboardPaste,
          label: `Pegar «${pieza.titulo}»`,
          sub: [pieza.detalle, pieza.origen?.cliente].filter(Boolean).join(' · '),
          run: () => pegarComida(pieza),
        })),
        ...menusCopiados.map((pieza) => ({
          icon: ClipboardPaste,
          label: `Añadir ${pieza.detalle} de «${pieza.titulo}»`,
          sub: pieza.origen?.cliente || null,
          run: () => pegarMenu(pieza),
        })),
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

  /*
    Lo que leen ⌘C y ⌘V, al final del render y no en un efecto: es donde ya
    existen los verbos y se sabe qué hay delante (ver `useAtajosDeCopia`).

    Solo con el menú a la vista: en un plan por macros sin comidas no hay ninguna
    pieza que copiar, y ⌘V pegaría en una lista que no se está mirando. ⌘V pone
    la comida AL FINAL del menú, que es lo que significa pegar aquí; meterla
    dentro de otra como alternativa es una decisión sobre cuál, y eso se pide
    en la comida (ver `pegarComoOpcion`).
  */
  const enFoco = Math.max(0, meals.findIndex((m) => m.id === focoComida));
  atajos.current = {
    copiar: cerrado && meals.length > 0 ? () => copiarComida(enFoco) : null,
    pegar: cerrado && comidasCopiadas[0] ? () => pegarComida(comidasCopiadas[0]) : null,
  };

  return (
    <div className="stack dieta-pagina">
      {/* Aquí cae una comida o un menú entero. No pinta nada: enciende el verbo
          de la mano del portapapeles con el nombre de este menú. */}
      <Destino tipos={[TIPO.COMIDA, TIPO.DIA_DIETA]} donde={elMenu} pegar={pegarEnElMenu} />

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
          dietaConVariantes={variosDias}
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
        ══ UNA SOLA ANATOMÍA, CON LA MESA DISTINTA ═══════════════════════════

        `.dieta.is-macros` era una EXCEPCIÓN POR PANTALLA —la rejilla de dos
        columnas se convertía en una columna de 980 px y el costado se subía
        arriba con `order: -1`—, que es justo la figura que la ley de la hoja
        prohíbe. Y era además el chasis de fábrica: `emptyNutrition()` nace por
        macros, así que la primera dieta que ve cualquier cliente nuevo se
        pintaba con el peor de los dos.

        Un plan por macros no es otra pantalla: es la misma con menos que poner.
        Mesa y costado, como la cerrada y como Entreno. Lo único que cambia es
        qué hay sobre la mesa — las comidas, o el reparto.
      */}
      <div className="dieta">
        {/* ── La mesa: el trabajo, a lo ancho ─────────────────────────────── */}
        <div className="dieta-menu">
          <div className="dieta-hoja">
            {/*
              ══ LOS DÍAS, EN TARJETAS (frame 64:88) ═══════════════════════

              Eran pastillas dentro de la cinta y ahora son tarjetas del ancho
              de la mesa, con lo que distingue a un día de otro dentro: sus
              macros, cuántas veces cae en el ciclo, cuánto menú tiene montado
              y su cifra. Ver `TarjetasDeDia`.

              Y aquí es donde CAE la comida que llevas en la mano: encima del
              día al que vaya. Nunca sobre el abierto —pegar en el menú que ya
              se está mirando es el verbo de la mano, no un arrastre—, y por eso
              la pieza filtra el activo.
            */}
            <TarjetasDeDia
              dias={dias}
              activo={comparando ? null : variant}
              onDia={(id) => {
                setComparar(false);
                setDietView(id);
              }}
              onRenombrar={(id, nombre) => renameDietDay(activeClient.id, id, nombre)}
              veces={vecesEnElCiclo}
              soltar={alDia.pieza ? { sobre: alDia.sobre, zona: alDia.zona, pegar: pegarEnElMenu } : null}
            />

            {/*
              ══ Y DEBAJO LA BARRA, no encima (frame 64:107) ════════════════

              El orden del dibujo es el de la pregunta: primero QUÉ DÍA se mira
              —las tarjetas—, y solo después a qué casillas del ciclo le toca
              ese día, cómo se le pauta y qué se puede hacer con el plan. Con la
              barra arriba, las casillas hablaban de un día que todavía no se
              había elegido.
            */}
            <TiraDeLaDieta
              dias={dias}
              /* Qué día está abierto: sus casillas del ciclo van en acento. */
              activo={comparando ? null : variant}
              /* Cómo se le pauta: la ficha técnica del plan, al canto derecho y
                 en voz de rótulo (frame 64:109). Fue chapa junto a un titular
                 que ya no existe. */
              tipo={cerrado ? 'dieta cerrada' : 'por macros'}
              /* «+ día», a secas. Decía «+ día de descanso» porque lo único que
                 sabía hacer el plan era encender su segunda columna; ahora el
                 día nuevo puede ser el alto en hidratos, el de piernas o el
                 domingo, y el nombre lo pone quien lo añade —pulsando el día
                 abierto, que es donde se lee—. */
              onMas={() => {
                const antes = planDays(plan).length;
                addDietDay(activeClient.id, { desde: variant });
                toast({
                  text:
                    antes === 1
                      ? 'Día añadido. Púlsalo para ponerle nombre, y reparte el ciclo debajo.'
                      : 'Día añadido. Púlsalo para ponerle nombre.',
                });
              }}
              onRenombrar={(id, nombre) => renameDietDay(activeClient.id, id, nombre)}
              /*
                ══ LA BARRA DE MANDOS DE LA CINTA, TODA EN EL MISMO CANTO ══════

                Aquí hubo un «···» de tres ítems al otro lado de la fila, y por
                un rato dos de esos tres colgando del «+ día». Las dos veces era
                la misma avería: para saber qué se puede hacer había que mirar a
                dos sitios. «Creo que deberían ir todos a la derecha.»

                Así que esta fila se lee igual que la de Entreno —los nombres a
                la izquierda, el hueco elástico, y TODOS los verbos después—, y
                en el mismo orden que allí: lo que copia, lo que ajusta y, al
                final y separada por lo que es, la papelera.

                    Alto  Bajo  + día ······ por macros ✓  ⧉+ ⧉ 📋  ⚙  🗑

                Lo que hacía falta para poder sacar la papelera de un menú —una
                pregunta antes de borrar— ya lo pone `QuitarElDia`, igual que
                hizo falta para las de Entreno.
              */
              derecha={
                <>
                  {puedeComparar && (
                    <SegmentedControl
                      label="Días del reparto a la vista"
                      value={comparando ? 'todos' : 'uno'}
                      onChange={(v) => setComparar(v === 'todos')}
                      options={[
                        { id: 'uno', label: 'Un día' },
                        { id: 'todos', label: 'Todos', hint: 'El reparto de todos los días, comida a comida' },
                      ]}
                    />
                  )}
                  {/* Cómo se le pauta se fue a la chapa del nombre (frame
                      62:469): es de lo que habla el titular, no un verbo. */}
                  <SaveIndicator
                    status={save.status}
                    error={save.error}
                    onRetry={() => retrySave('nutrition', activeClient.id)}
                  />
                  {/* Con «Todos» no hay día abierto, y duplicar o quitar «el
                      abierto» actuaría sobre uno que no se ve. */}
                  {!comparando && (
                  <>
                  {/* Duplicar el día abierto con su menú. `CopyPlus` y no
                      `Copy`: la ley del dibujo de la casa —`Copy` es siempre
                      «al portapapeles» y `CopyPlus` siempre «otra igual aquí»—.
                      Esto añade un día más al plan; los dos ⧉ de al lado se
                      llevan algo a la mano. Ver `MealCard`. */}
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-compact"
                    title={`Duplicar «${diaActual.name}» con su menú`}
                    aria-label={`Duplicar «${diaActual.name}»`}
                    onClick={() => {
                      duplicateDietDay(activeClient.id, variant);
                      toast({ text: `«${diaActual.name}» duplicado con su menú.` });
                    }}
                  >
                    <CopyPlus size={15} />
                  </button>
                  </>
                  )}
                  {/* Copiar el menú del día entero: es del DÍA y no de ninguna
                      comida, así que va en la cinta que lleva los días. Es la
                      pareja de «Traer», que cuelga del «+ comida» del pie: uno
                      se lleva y el otro trae. */}
                  {cerrado && meals.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-compact"
                      title="Copiar este menú al portapapeles"
                      aria-label="Copiar este menú al portapapeles"
                      onClick={copiarMenu}
                    >
                      <Copy size={15} />
                    </button>
                  )}
                  {/* Y LA DIETA ENTERA, que es la pieza con la que se monta a
                      alguien igual que a otro: todos sus días con sus menús y la
                      proporción entre ellos. Va justo después del ⧉ del día
                      porque son el mismo verbo a dos tamaños, y con dibujo
                      distinto porque lo que hacen al pegarse no lo es: uno AÑADE
                      un menú y esta SUSTITUYE la dieta de quien la reciba. Ver
                      `copiarLaDieta`. */}
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-compact"
                    title="Copiar la dieta entera al portapapeles"
                    aria-label="Copiar la dieta entera al portapapeles"
                    onClick={copiarLaDieta}
                  >
                    <ClipboardCopy size={15} />
                  </button>
                  {/*
                    Los ajustes del plan. Las equivalencias del cliente son un
                    MÓDULO del protocolo —«el entrenador decide qué existe en su
                    app»—, como el RIR en la rutina: la lista completa vive en
                    Ajustes → Protocolo y aquí está el ajuste a mano, para ESTE
                    cliente. Por `saveClientException` y no por
                    `updateClientPreferences`: encenderlas para esta persona es
                    una excepción a la plantilla, y sin la marca el siguiente
                    «poner al día» se las apagaba.
                  */}
                  <AjustesPlan
                    cerrado={cerrado}
                    onTipo={(type) => updateNutrition(activeClient.id, { type })}
                    equivalencias={clienteVeEquivalencias}
                    onEquivalencias={() =>
                      saveClientException(activeClient.id, {
                        protocol: toggleModule(protocolo, 'dietSwaps'),
                      })
                    }
                    /* Y de dónde sale ese interruptor, que hasta ahora no se
                       decía en ninguna parte: es un módulo del protocolo de esta
                       persona, y tocarlo aquí lo separa de su plantilla. */
                    pie={
                      <PieDeProtocolo client={activeClient} />
                    }
                    /* El segundo peldaño de la misma elección, que vivía en la
                       mesa como dos tarjetas. Ver «AQUÍ ESTABAN LAS DOS MANERAS
                       DE PAUTAR» más abajo. */
                    reparte={repartoVisible}
                    onReparto={cambiarReparto}
                    /* Y las cuatro del envase, que son del ENTRENADOR: quien
                       mira la sal la mira en todos sus clientes. Por eso van en
                       sus preferencias y no en el protocolo de esta persona. */
                    avanzado={avanzado}
                    onAvanzado={(v) => updateCoachPreferences('dieta', { micros: v })}
                  />
                  {/* ── LA PAPELERA, LA ÚLTIMA Y SEPARADA POR LO QUE HACE ─────
                      Al final de la barra y en tinta de peligro, que es donde
                      está la del bloque y la de la hoja en Entreno: lo que borra
                      no se mezcla con lo que copia, aunque quepa al lado.

                      Y solo existe si queda otro día: un plan sin ninguno no es
                      un plan vacío, es una pantalla sin sitio donde escribir. */}
                  {variosDias && !comparando && (
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-compact btn-icon-danger"
                      title={`Quitar «${diaActual.name}»`}
                      aria-label={`Quitar «${diaActual.name}»`}
                      onClick={() => setQuitando(diaActual)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </>
              }
              /*
                ── El reparto del ciclo, en la segunda fila de la cinta ────────
                Solo con más de un día: repartir el ciclo entre un único día es
                contestar una pregunta que nadie ha hecho.

                Las casillas las pone el ciclo del cliente. «Lun», «Mar», «Mié»…
                y no la inicial: L-M-M-J-V-S-D repite la M en martes y miércoles,
                que es justo el par que hay que distinguir para leer un ciclado.
                En el rotativo son «D1, D2, D3…» con la sesión que cae en cada
                una debajo — que ahí es lo que hace reconocible la casilla.
              */
              casillas={
                variosDias
                  ? casillas.map((casilla) => ({
                      ...casilla,
                      dia: dias.find((d) => d.id === mapaCiclo[casilla.key]) || null,
                      items: [
                        ...dias.map((d) => ({
                          label: d.name,
                          on: mapaCiclo[casilla.key] === d.id,
                          run: () => setDietCycleSlot(activeClient.id, casilla.key, d.id),
                        })),
                        null,
                        {
                          label: 'Sin asignar',
                          on: !mapaCiclo[casilla.key],
                          run: () => setDietCycleSlot(activeClient.id, casilla.key, null),
                        },
                      ],
                    }))
                  : null
              }
              /*
                ── Y el aviso, que es información con su verbo al lado ─────────
                Nunca un movimiento solo: el `weeklySplit` es por bloque y los
                bloques cambian, así que la dieta no se recoloca por su cuenta.
                Se dice que ya no coinciden y el botón está ahí mismo.
              */
              avisoCiclo={
                hayEntreno && parejaParaElSplit && !cicloCuadra ? (
                  <span className="dieta-semana-aviso">
                    {cicloRepartido && 'No coincide con su entreno.'}
                    <button
                      type="button"
                      className="cab-accion"
                      onClick={() => {
                        repartirPorElEntreno(activeClient.id, casillas, parejaParaElSplit);
                        toast({
                          text: `Ciclo repartido: ${dias[0].name.toLowerCase()} los días que entrena, ${dias[1].name.toLowerCase()} los que no.`,
                        });
                      }}
                    >
                      Repartir por el entreno
                    </button>
                  </span>
                ) : null
              }
            />

            <div className="dieta-cuerpo">
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

              {/*
                ── POR MACROS: LA MESA ES EL REPARTO ────────────────────────────
                Y esa tabla ya existía, ya se editaba y ya estaba probada: es
                `PlanDia`, que vivía escondida detrás de un enlace («Ver el día ↗»)
                en la única pantalla que no tenía nada más que enseñar. Medido: la
                columna de trabajo de un plan por macros eran 175 px de alto contra
                323 px de costado — la pantalla estaba del revés.

                Nace PLEGADA cuando no hay nada repartido: quien pone «por macros» a
                veces lo hace precisamente para no repartir nada, y encontrarse una
                tabla vacía que rellenar es una tarea que nadie ha pedido. Cuando ya
                hay comidas repartidas, la tabla ES el trabajo hecho y se enseña.
              */}
              {/*
                ══ AQUÍ ESTABAN LAS DOS MANERAS DE PAUTAR, Y SE HAN IDO ARRIBA ══

                «No tiene sentido que te muestre permanentemente esa decisión:
                eso tendría que estar en ajustes de la dieta.»

                Eran dos tarjetas grandes con icono, título y explicación
                (`ComoSePauta`) al principio de la mesa. Se eligen una vez cada
                varios meses y ocupaban lo primero y lo más grande de la hoja —en
                un plan «solo el objetivo», más que el objetivo mismo—, con la
                decisión ya tomada dibujada como una pregunta abierta.

                Ahora son el segundo peldaño de «cómo se le pauta», dentro del
                panel de ajustes del plan, que es donde ya vivía la primera mitad
                de la misma elección. Ver `AjustesPlan`: la mesa se queda con lo
                que se pauta y el panel con cómo se pauta.
              */}

              {/*
                Debajo de la elección, porque es su consecuencia: has dicho que
                no repartes, así que esto es lo que le pides al día. Y encima de
                las pautas, que son lo que no cabe en una cifra.
              */}
              {objetivoEnLaMesa && (
                <MacroTargetCard
                  forma="mesa"
                  plan={plan}
                  variant={variant}
                  title={dias.length > 1 ? `Lo que le pides · ${diaActual.name.toLowerCase()}` : 'Lo que le pides al día'}
                  editable
                  onSave={guardarObjetivo(variant)}
                  avanzado={avanzado}
                  /* Los g/kg bajan con el objetivo: aquí no hay «El día» al
                     costado que los diga. Ver la cabecera de la forma «mesa». */
                  peso={pesoMedio?.average ?? null}
                  cuando={ultimoPesaje}
                />
              )}

              {!cerrado && repartoVisible && (
                <section className="dieta-reparto" aria-label="El reparto del día">
                  {/* Aquí estuvo un asa que plegaba la tabla, y era el mismo
                      mando que la elección de arriba con otro dibujo: plegar «el
                      reparto» y elegir «solo el objetivo» acababan en la misma
                      pantalla. Queda el rótulo, que no manda nada. */}
                  <div className="dieta-reparto-asa">
                    <span className="section-label">El reparto</span>
                    <span className="dieta-reparto-dice">
                      {comparando
                        ? `${dias.length} días · se compara con ${dias[0].name.toLowerCase()}`
                        : meals.length === 0
                          ? 'Ponle a cada comida sus kcal y sus macros'
                          : `${meals.length} ${meals.length === 1 ? 'comida' : 'comidas'}`}
                    </span>
                  </div>

                  {comparando && (
                    <RepartoComparado
                      /* Por cliente: qué comidas están separadas es de esta
                         dieta, no de la del siguiente cliente que se abra. */
                      key={activeClient.id}
                      dias={dias}
                      elegidas={elegidas}
                      onTarget={(dayId, mealIndex, field, value) =>
                        updateMealTarget(activeClient.id, dayId, mealIndex, field, value)
                      }
                      onFijar={(dayId, mealIndex) => toggleMealFijo(activeClient.id, dayId, mealIndex)}
                      onEditarObjetivo={(dayId) => setObjetivoAbierto(dayId)}
                    />
                  )}

                  {repartoVisible && !comparando && (
                    <PlanDia
                      meals={meals}
                      targets={targetsFor(plan, variant)}
                      elegidas={elegidas}
                      onTarget={(mealIndex, field, value) =>
                        updateMealTarget(activeClient.id, variant, mealIndex, field, value)
                      }
                      /* Aquí no hay comida a la que ir —no hay tarjetas debajo—, así
                         que el nombre hace lo que hace en la hoja: se renombra donde
                         se lee. Y la papelera es la pareja del «+ comida» del pie:
                         sin ella, una fila añadida por error no se puede quitar. */
                      onRename={(mealIndex, name) => updateMealName(activeClient.id, variant, mealIndex, name)}
                      /* El candado del reparto: esta comida no se mueve cuando
                         cambie el objetivo del día. Ver `repartoAlObjetivo`. */
                      onFijar={(mealIndex) => toggleMealFijo(activeClient.id, variant, mealIndex)}
                      onRemove={(mealIndex) => {
                        const comida = meals[mealIndex];
                        removeMeal(activeClient.id, variant, mealIndex);
                        toast({
                          text: `«${comida?.name || 'Comida'}» quitada del reparto.`,
                          action: {
                            label: 'Deshacer',
                            onClick: () => restoreMeal(activeClient.id, variant, mealIndex, comida),
                          },
                        });
                      }}
                    />
                  )}
                </section>
              )}

              {cerrado && meals.length > 0 && (
                <>
                {meals.map((meal, mealIndex) => {
                  /* Dónde cae lo que se arrastra desde la mano: en ESTA comida,
                     como otra alternativa. Vacío mientras no viaje nada, así que
                     los manejadores del reordenar de abajo siguen mandando en
                     reposo — los dos arrastres no coinciden nunca. */
                  const cae = deLaMano.zona(meal.id, (pieza) =>
                    pieza.tipo === TIPO.PLATO
                      ? pegarPlato(pieza, mealIndex)
                      : pegarComoOpcion(pieza, mealIndex)
                  );
                  return (
                  <MealCard
                    key={meal.id}
                    meal={meal}
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
                      /* Manda la mano cuando hay algo viajando desde ella; si
                         no, el reordenar de siempre. */
                      onDragOver:
                        cae.onDragOver ||
                        ((e) => {
                          e.preventDefault();
                          setArrastre((a) => (a.sobre === mealIndex ? a : { ...a, sobre: mealIndex }));
                        }),
                      onDragLeave:
                        cae.onDragLeave ||
                        (() => setArrastre((a) => (a.sobre === mealIndex ? { ...a, sobre: null } : a))),
                      onDrop:
                        cae.onDrop ||
                        ((e) => {
                          e.preventDefault();
                          if (arrastre.desde !== null && arrastre.desde !== mealIndex) {
                            moveMeal(activeClient.id, variant, arrastre.desde, mealIndex);
                          }
                          setArrastre({ desde: null, sobre: null });
                        }),
                    }}
                    recibiendo={deLaMano.sobre === meal.id}
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
                    onCopiarComida={() => copiarComida(mealIndex)}
                    /* Lo que se lleva y cabe dentro de una comida: una comida
                       entera con sus alternativas, o un plato que es una sola.
                       La última copiada de las dos, misma regla que ⌘V. */
                    enMano={loQueCabeDentro}
                    onPegarEnMano={() =>
                      loQueCabeDentro?.tipo === TIPO.PLATO
                        ? pegarPlato(loQueCabeDentro, mealIndex)
                        : pegarComoOpcion(loQueCabeDentro, mealIndex)
                    }
                    onFoco={() => setFocoComida(meal.id)}
                    onDuplicateOption={(optIndex) =>
                      duplicateOption(activeClient.id, variant, mealIndex, optIndex)
                    }
                    /* Y la alternativa sale de aquí como un PLATO, que es lo que
                       es. Antes esto era «copiarla al otro día» y solo llegaba a
                       los días de esta persona; ahora cae donde tú digas. */
                    onCopiarPlato={(optIndex) => copiarPlato(mealIndex, optIndex)}
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
                    onRenameOption={(optIndex, name) =>
                      renameMealOption(activeClient.id, variant, mealIndex, optIndex, name)
                    }
                    onRemoveOption={(optIndex) => removeMealOption(activeClient.id, variant, mealIndex, optIndex)}
                    onAddFood={(optIndex, food) => handleAddFood(mealIndex, optIndex, food)}
                    platos={platos}
                    onAddPlato={(optIndex, plato) => ponerPlato(mealIndex, optIndex, plato)}
                    onSavePlato={(optIndex) => guardarPlato(mealIndex, optIndex)}
                    grupos={grupos}
                    onSaveGrupo={guardarGrupo}
                    onRemoveGrupo={quitarGrupo}
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
                    /* Lo que la cesta no acierte: el plátano de después de
                       entrenar, el aceite de la ensalada. Ver `setFoodFixed`. */
                    onSetFixed={(optIndex, foodId, fijo) =>
                      setFoodFixed(activeClient.id, variant, mealIndex, optIndex, foodId, fijo)
                    }
                    onEditFood={(optIndex, food, cambios) =>
                      editFood(activeClient.id, variant, mealIndex, optIndex, food, cambios)
                    }
                  />
                  );
                })}
                </>
              )}

              {/* El único sitio desde el que se añade: dentro de la hoja y al pie de
                  lo que hay, que es donde va a aparecer lo nuevo —el mismo gesto que
                  «+ alimento» al pie de cada comida—. En un plan por macros añade la
                  fila del reparto; en uno cerrado, la comida entera.

                  Con el reparto plegado no se pinta: añadir una comida a una tabla
                  que no está a la vista es un gesto sin acuse de recibo. Ahí el
                  verbo es el propio rótulo del reparto, que la abre. */}
              {(cerrado || repartoVisible) && <div className="dieta-alta">{masComida}</div>}

              {/* Las pautas van al final: se escriben cuando el plan ya está montado, y
                  explican lo que las cifras de arriba no pueden explicar. */}
              <DietNotes
                notes={plan.habitsNotes}
                onChange={(habitsNotes) => updateNutrition(activeClient.id, { habitsNotes })}
              />
            </div>
          </div>
        </div>

        {/*
          ══ EL COSTADO: contra qué se cuadra, y cómo va ═══════════════════════

          Arriba el OBJETIVO del día que se está mirando —es contra lo que se
          cuadra cada comida, así que acompaña al menú en vez de precederlo— y
          debajo las cuatro lecturas (`LecturasDeLaDieta`).

          ── Y ahora es UN objetivo, no dos ──────────────────────────────────
          Con dos dietas se pintaban las dos tarjetas a la vez, y era la única
          forma que había de ver los dos objetivos de un vistazo. Desde que la
          cinta lleva los días, dos tarjetas son el conmutador dibujado por
          segunda vez: se edita el objetivo del día que NO está delante, con la
          mesa enseñando el otro. Lo que se ve y lo que se toca son el mismo
          día. La comparación no se pierde: «La semana» dice lo que pide cada
          uno, y pulsar en ella cambia de día.

          Los pasos y el cardio son del PLAN, no de un día —lo que esta persona
          hace cada día, entrene o no—, y van una vez, al final.

          ── Y NO ES UN PANEL: SON CAJAS SUELTAS (frame 64:244) ──────────────
          Llevó `es-panel`, que funde la columna en una caja con las secciones
          separadas por un filete. El frame las dibuja como TRES CAJAS con su
          canto y dieciséis píxeles de papel entre cada dos, igual que la mesa
          de la izquierda separa una comida de la siguiente. Es la misma regla
          en las dos columnas: desde que el panel se fue, lo que separa una cosa
          de otra es su propio canto.

          `es-panel` sigue en pie donde se escribió —el costado del Resumen y el
          del portal—: esto es lo que dice ESTE frame de ESTA pantalla.
        */}
        <aside className="dieta-lado" aria-label="El objetivo y cómo va">
          {/*
            ══ AQUÍ ESTABA LA TARJETA «OBJETIVO», Y SE HA FUNDIDO CON «EL DÍA» ═

            Eran dos cajas pegadas listando LOS MISMOS TRES MACROS: arriba
            «Proteína 120 g · 15 %», debajo «Proteína 111/120 g · −9 g». Y dos
            cifras de kcal para la misma pregunta —3.100 arriba, 3.072/3.100
            abajo—. Lo que le pides y lo que suma su menú no son dos lecturas:
            son las dos columnas de la MISMA, y «111/120 g» ya las dice las dos.

            Ahora es una sección con el nombre del día, su lápiz y la cifra
            grande, y debajo los cuatro renglones. Ver `ObjetivoDelDia`.

            ── SALVO CUANDO EL OBJETIVO SE HA MUDADO A LA MESA ────────────────
            En un plan por macros sin reparto el objetivo ES el trabajo y baja a
            la hoja (`objetivoEnLaMesa`). Entonces esta sección vuelve a ser «El
            día» a secas —sin título ni cifra grande ni lápiz—, porque
            repetirlos aquí sería la tercera lista de macros de la pantalla.
          */}
          <LecturasDeLaDieta
            plan={plan}
            variant={variant}
            dias={dias}
            casillas={casillas}
            meals={meals}
            targets={targetsFor(plan, variant)}
            elegidas={elegidas}
            registros={registrosDeLaDieta}
            cerrado={cerrado}
            onAbrirDia={() => setDiaAbierto(variant)}
            onDia={setDietView}
            tituloObjetivo={objetivoEnLaMesa ? null : diaActual.name}
            onEditarObjetivo={objetivoEnLaMesa ? null : () => setObjetivoAbierto(variant)}
            catalogo={fichaDelAlimento}
            avanzado={avanzado}
            conElDia={!objetivoEnLaMesa}
          />

          {/* El editor del objetivo, colgado del lápiz de arriba. Es la misma
              ventana que abre la sección de la mesa y las de la revisión: una
              pieza (`EditarObjetivo`), tres sitios donde se lee. */}
          <EditarObjetivo
            open={Boolean(objetivoAbierto)}
            onClose={() => setObjetivoAbierto(null)}
            title={`Ajustar objetivo · ${dias.find((d) => d.id === objetivoAbierto)?.name || diaActual.name}`}
            targets={targetsFor(plan, objetivoAbierto || variant)}
            onSave={guardarObjetivo(objetivoAbierto || variant)}
            avanzado={avanzado}
            /*
              Y las comidas del día, para que la ventana enseñe qué le hace el
              objetivo nuevo antes de escribir nada: primero al reparto —lo que
              se le pide a cada comida— y después a los gramos del menú. Con el
              plan por macros solo hay lo primero.

              El catálogo va con él porque de él sale la CESTA —de dónde se
              recorta—: sin categorías, el recorte vuelve a la densidad del macro
              y la fruta baja con el arroz. Ver `CESTAS` en `domain/nutrition`.
            */
            reajuste={reajusteDelObjetivo}
          />

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
              label={(dias.find((v) => v.id === diaAbierto)?.name || 'el día').toLowerCase()}
              meals={mealsForVariant(plan, diaAbierto)}
              targets={targetsFor(plan, diaAbierto)}
              elegidas={elegidas}
              onTarget={(mealIndex, field, value) => updateMealTarget(activeClient.id, diaAbierto, mealIndex, field, value)}
              dias={dias}
              onTargetDia={(dayId, mealIndex, field, value) =>
                updateMealTarget(activeClient.id, dayId, mealIndex, field, value)
              }
              onIrA={(i) => {
                setDietView(diaAbierto);
                const id = mealsForVariant(plan, diaAbierto)[i]?.id;
                window.setTimeout(() => document.getElementById(`comida-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
              }}
              onClose={() => setDiaAbierto(null)}
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
        Quitar un día. Lo que se lleva por delante se enseña en la ventana; aquí
        solo se escribe y se dice qué ha pasado, con su «Deshacer».
      */}
      {quitando && (
        <QuitarElDia
          open
          plan={plan}
          dia={quitando}
          cerrado={cerrado}
          onClose={() => setQuitando(null)}
          onConfirm={() => {
            /* El plan entero de antes, para el «Deshacer»: quitar un día se lleva
               su menú, y la pareja honesta de eso es poder volver.
               `updateNutrition` reescribe todos los campos, así que reponerlo es
               devolver el objeto tal cual estaba. */
            const antes = plan;
            const nombre = quitando.name;
            const otro = dias.find((d) => d.id !== quitando.id);

            /*
              ── La ventana se cierra ANTES de escribir ────────────────────────
              El orden importa, y no por estilo: si la escritura lanza, todo lo
              que venga detrás —el cierre incluido— no llega a ejecutarse, y lo
              que ve quien está delante es un botón que no hace nada. Un clic que
              acierta tiene que responder siempre; qué pasó con lo escrito se
              cuenta después, y si falla se dice, no se traga (regla 13).
            */
            setQuitando(null);
            if (otro) setDietView(otro.id);

            try {
              removeDietDay(activeClient.id, quitando.id);
            } catch (error) {
              toast({
                text: `No se pudo quitar «${nombre}»: ${error?.message || 'fallo desconocido'}. Su dieta se queda como estaba.`,
              });
              return;
            }

            toast({
              text: `«${nombre}» quitado de su dieta.`,
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
