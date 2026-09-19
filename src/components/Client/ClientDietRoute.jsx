import { useMemo, useState } from 'react';

import { useData } from '@/context/AppContext';
import { clientCycleSlots, semanaDelCliente } from '@/domain/blocks';
import {
  abreviarUnidad,
  cycleMap,
  dayById,
  dayKcalTarget,
  dietNotes,
  dietaDeHoy,
  displayAsUnits,
  foodMacros,
  foodUnits,
  MACROS,
  mealsForVariant,
  optionKcals,
  optionName,
  planDays,
  repartoDelCiclo,
  siglasDeDietas,
  targetsFor,
} from '@/domain/nutrition';
import { clientProtocol, isModuleOn } from '@/domain/protocol';
import { dietLog } from '@/domain/timeline';
import { localeNumber, miles, todayISO, weekdayName } from '@/lib/dates';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useReviewRows } from '@/components/review/useReviewRows';
import { useOculto } from './Oculto';
import { DietaEnMonitor } from './DietaEnMonitor';
import { PantallaComer as ComerEnTelefono } from './movil/PantallaComer';

/**
 * `/mi/dieta` — LA CAPA DE DATOS de las dos pantallas de comer.
 *
 * ══ Lo que las dos comparten ═══════════════════════════════════════════════
 *
 * Las casillas del ciclo, la semana colocada en el calendario y el día que toca.
 * Las casillas son las MISMAS que usa su entrenador para repartirle la dieta
 * (`clientCycleSlots`): siete días con nombre si entrena por semanas, los del
 * microciclo —con sus descansos— si su ciclo es rotativo.
 *
 * `semanaDelCliente` coloca esas casillas en los siete días naturales, porque
 * `D1…D9` de calendario no dice nada: quien abre esto un martes no sabe si hoy
 * es su D4.
 *
 * ══ Y en qué se separan ════════════════════════════════════════════════════
 *
 *   · El monitor enseña las comidas como CAJAS en columna, con una opción a la
 *     vista, y al lado el plan entero (`pc/PantallaDieta`).
 *   · El teléfono, una caja por comida con sus opciones numeradas dentro, bajo
 *     lo pautado del día, y arriba la cinta de los siete (`movil/PantallaComer`).
 *
 * ══ La opción elegida no se guarda ═════════════════════════════════════════
 *
 * Y es deliberado: elegir «con avena» un martes no es una decisión que su
 * entrenador tenga que ver ni que la aplicación tenga que recordar. Es mirar la
 * otra mitad del menú.
 */
export const ClientDietRoute = () => {
  /* El catálogo también: es quien sabe de familias (fruta, carne…) y alimenta
     las equivalencias. Lo puede leer cualquier usuario (0046), y los grupos de
     su entrenador le llegan por `equiv_groups` (0113). */
  const { activeClient, nutrition, workoutData, anthropometry, catalogFoods, gruposEquiv } =
    useData();
  const enMonitor = useMediaQuery('(min-width: 1024px)');
  const oculto = useOculto();
  /* Qué opción se está mirando de cada comida, por id. Local: ver arriba. */
  const [opciones, setOpciones] = useState({});
  /* Qué dieta se mira, cuando tiene varias. Sin elegir, la de hoy. */
  const [diaElegido, setDiaElegido] = useState(null);
  /* Las revisiones traen la otra mitad del histórico de su pauta: la foto que
     queda escrita al cerrar cada una. Mismo gancho que usa «Progreso». */
  const { rows: reviews } = useReviewRows(activeClient?.id, { conEnlaces: false });

  const programa = workoutData?.[activeClient?.id];
  const casillas = useMemo(
    () => clientCycleSlots(activeClient, programa),
    [programa, activeClient]
  );
  const semana = useMemo(
    () => semanaDelCliente(activeClient, programa, casillas),
    [activeClient, programa, casillas]
  );

  if (!activeClient) return null;

  const plan = nutrition?.[activeClient.id];
  const casillaDeHoy = semana?.find((d) => d.esHoy)?.key || null;
  const deHoy = dietaDeHoy(plan, casillas, undefined, casillaDeHoy);
  const dias = planDays(plan);
  const siglas = siglasDeDietas(dias);
  const mapa = cycleMap(plan, casillas);
  const diaVisible = diaElegido ? dayById(plan, diaElegido) : deHoy ? dayById(plan, deHoy.id) : dias[0];

  const hoyISO = todayISO();
  const nombreDelDia = weekdayName(hoyISO);
  const fechado = `${nombreDelDia.charAt(0).toUpperCase()}${nombreDelDia.slice(1)} ${Number(hoyISO.slice(8, 10))}`;

  const comidasCrudas = diaVisible ? mealsForVariant(plan, diaVisible.id) : [];
  /*
    LO PAUTADO DE ESE DÍA, con los nombres de la casa traducidos una vez.

    `targetsFor` devuelve `targetKcals / proteinGrams / carbsGrams / fatsGrams`,
    que es como se guarda, y las kcal escritas pueden ser cero —en un plan por
    macros la cifra se deduce de ellos—. Por eso las kcal las da `dayKcalTarget`
    y no el campo: es la misma regla que usan la portada y la cinta de días, y
    escrita dos veces acabarían diciendo números distintos.
  */
  const crudo = diaVisible ? targetsFor(plan, diaVisible.id) : null;
  const objetivos = diaVisible
    ? {
        kcals: dayKcalTarget(plan, diaVisible.id),
        protein: Number(crudo?.proteinGrams) || 0,
        carbs: Number(crudo?.carbsGrams) || 0,
        fats: Number(crudo?.fatsGrams) || 0,
      }
    : null;
  const sinCifras = oculto.nutrition;

  /*
    ══ LAS ALTERNATIVAS DE CADA ALIMENTO ══════════════════════════════════════

    «150 g de plátano ≈ 250 g de manzana». Es la tabla de intercambios de toda la
    vida, calculada desde la propia dieta sobre el macro de la familia
    (`equivalencesFor`), y existía ENTERA desde hace semanas: la ve el entrenador
    montando, y su cliente no la veía en ningún sitio. Faltaba una sola cosa —el
    catálogo— y el portal no lo pasaba, así que `MealCard` apagaba el botón sin
    decir nada y el teléfono ni lo intentaba. El dueño el 14 sep: *«el problema
    de la dieta, tanto en PC como en móvil de cliente, es que no muestra las
    alternativas de cada alimento»*.

    Lo que SÍ decide si se enseñan es el módulo `dietSwaps` de su protocolo: hay
    quien quiere que su cliente cambie el plátano por fresas sin preguntar y
    quien prescribe cerrado. Apagado, no llega ni el catálogo ni los grupos, que
    es lo que apaga la lista en las dos pantallas — no hay un segundo
    interruptor del que alguien tenga que acordarse.

    Y la excepción por alimento (`food.equivHidden`) la sigue aplicando
    `MealCard`, que es donde vive desde que se escribió.
  */
  const verAlternativas = isModuleOn(clientProtocol(activeClient.preferences), 'dietSwaps');
  const catalogo = verAlternativas ? catalogFoods || [] : [];
  const grupos = verAlternativas ? gruposEquiv || [] : [];

  const comidas = comidasCrudas.map((meal) => {
    const lista = meal.options || [];
    const i = Math.min(Math.max(opciones[meal.id] ?? 0, 0), Math.max(lista.length - 1, 0));
    const option = lista[i];
    return {
      id: meal.id,
      nombre: meal.name,
      kcal: sinCifras ? null : optionKcals(option),
      opciones: lista.length,
      /*
        LAS OPCIONES, ENTERAS Y EN UN SOLO RENGLÓN.

        Primero fueron «Opción 1 de 4 · Cambiar», un pie que pasaba a la
        SIGUIENTE: para ver la cuarta había que pasar por la segunda y la
        tercera, o sea elegir a ciegas. Se sustituyeron por cajas con su cifra,
        y salió el problema contrario: cinco cajas de 96 px no caben en un
        teléfono, así que la tira se desbordaba a lo ancho y la quinta opción
        vivía fuera de la pantalla. El dueño pidió (14 sep) la comida en una caja
        y las opciones como *«opción 1, 2, 3, 4, 5 clicables»*.

        Así que la opción se nombra por su NÚMERO —`etiqueta`— salvo que su
        entrenador le haya puesto nombre, y entonces manda el nombre, que dice
        más que un ordinal. Siete números caben en el ancho del renglón; siete
        nombres se reparten en dos líneas y siguen cabiendo.

        Y la cifra de cada una ya no va dentro de su pastilla: las kcal de la
        comida están en su cabecera y cambian al elegir, que es lo mismo que
        decían las cinco cifras juntas —en la demo, 908 · 915 · 917 · 903— sin
        pedir que se comparen cuatro números casi iguales para desayunar.
      */
      lista: lista.map((o, j) => ({
        id: o.id || `${meal.id}-op-${j}`,
        nombre: optionName(o, j),
        etiqueta: String(o?.name ?? '').trim() || String(j + 1),
        puesta: j === i,
        onElegir: () => setOpciones((antes) => ({ ...antes, [meal.id]: j })),
      })),
      alimentos: (option?.foods || []).map((f, j) => ({
        id: f.id || `${meal.id}-${j}`,
        nombre: f.name,
        racion: racionDe(f),
        kcal: sinCifras ? '' : Math.round(foodMacros(f).kcal),
        /*
          LA ENTRADA EN CRUDO, para calcular sus alternativas. Va tal cual —la
          copia congelada con sus macros por 100 g— porque es lo que pide
          `equivalencesFor`, y la cuenta la hace la fila del teléfono, memoizada
          sobre el alimento. Nula si su entrenador le quitó el margen a ESTE
          alimento (`equivHidden`), que es la excepción que ya aplica `MealCard`.
        */
        entrada: f.equivHidden ? null : f,
      })),
    };
  });

  /* El reparto del ciclo, para poder decir qué dieta toca cuántos días cuando
     no hay menú que enseñar. La media del ciclo y los pasos los cuenta ahora el
     costado del taller (`LecturasDeLaDieta`), que es de donde salen sus dos
     renglones: contarlos aquí otra vez era arriesgar dos cifras. */
  const reparto = repartoDelCiclo(plan, casillas);
  const notas = dietNotes(plan?.habitsNotes);

  /* El histórico de su pauta, de lo más antiguo a lo más reciente, y desde
     cuándo lleva la de ahora — que es el dato de la frase. */
  const registros = dietLog({ history: anthropometry?.[activeClient.id]?.history || [], reviews });
  const pautas = registros.map((r) => Number(r.nutrition?.kcals) || 0).filter((n) => n > 0);
  const ultimoCambio = [...registros]
    .reverse()
    .find((r, i, lista) => {
      const previo = lista[i + 1];
      return previo && Number(previo.nutrition?.kcals) !== Number(r.nutrition?.kcals);
    });
  const desdeCuando = ultimoCambio?.date || registros[0]?.date || null;

  /* ── El monitor ───────────────────────────────────────────────────────── */
  /*
    ══ QUÉ CAMBIÓ EL 14 DE SEPTIEMBRE POR LA TARDE ═══════════════════════════

    Este bloque montaba una pantalla propia —cuatro teselas, una tabla de tres
    columnas por comida y un pie con «Opción 1 de 4 · Cambiar»—. El dueño la vio
    y dijo lo que había: *«dieta es feo, cambiar entre opciones se ve mal, son
    visiones planas y poco estéticas; en entrenador es mucho mejor»*.

    Así que el monitor deja de dibujar la dieta y monta las piezas con las que
    su entrenador la escribe: la comida (`MealCard`, que nace `editable: false`
    y ya traía escrito cómo se comporta en el portal), la cinta de días y el
    costado de lecturas. Lo que este bloque hace ahora es solo ENTREGARLES lo
    que ya calculaba.

    Ver `DietaEnMonitor`, y en particular por qué con las cifras ocultas no se
    monta ninguna de las tres.
  */
  const datosPC = {
    fecha: deHoy && !deHoy.unica ? `${fechado} · te toca ${deHoy.name}` : fechado,
    dias,
    diaVisible,
    onDia: setDiaElegido,
    /*
      ══ POR MACROS NO ES UNA DIETA VACÍA (19 sep) ════════════════════════════

      El monitor solo sabía pintar comidas con alimentos, y un plan por macros
      no tiene: o no tiene comidas —se pauta el día entero— o las tiene como
      filas del reparto, con sus cifras y sin menú. Las dos caían en «Cuando te
      la monten, aparecerá aquí» con el objetivo escrito en el costado: la
      dieta estaba y la pantalla decía que no. El taller la pinta como la
      prescripción del día o como la tabla del reparto, y el portal monta esas
      mismas dos piezas en lectura. Ver `DietaEnMonitor`.

      Con algo pautado: `emptyNutrition()` también nace por macros, y un plan
      sin una cifra sí es el vacío de «cuando te la monten».
    */
    porMacros:
      Boolean(plan) && plan.type !== 'closed' && ((objetivos?.kcals || 0) > 0 || comidasCrudas.length > 0),
    /* Las comidas EN CRUDO: `MealCard` trabaja sobre la comida del plan, con
       sus opciones y sus alimentos, no sobre una copia aplanada. */
    comidas: comidasCrudas,
    opcionDe: (id) => opciones[id] ?? 0,
    onOpcion: (id, j) => setOpciones((antes) => ({ ...antes, [id]: j })),
    /* Con qué se calculan las alternativas de cada alimento. Ver arriba. */
    catalogo,
    grupos,
    sinCifras,
    /* Y la versión sin una sola caloría, para cuando su entrenador se las
       oculta. Es la misma lista que ya se monta en el teléfono. */
    menuSinCifras: comidas,
    lecturas:
      sinCifras || !diaVisible
        ? null
        : {
            plan,
            variant: diaVisible.id,
            casillas,
            targets: crudo,
            /* El mapa de qué opción se mira, que es exactamente lo que el
               costado del taller llama `elegidas`. */
            elegidas: opciones,
            registros,
            cerrado: plan?.type === 'closed',
            /* Sin catálogo: el portal no lo carga y el costado solo lo usa para
               rellenar la fibra que la copia congelada de un alimento no diga.
               Ver «LA FIBRA QUE NO SUMABA» en `LecturasDeLaDieta`. */
            catalogo: null,
          },
    notas: notas.map((n) => ({ id: n.id, titulo: n.title, cuerpo: n.body })),
    vacia:
      dias.length > 1
        ? `Tus dietas: ${reparto.map((d) => `${d.name} · ${d.dias} días`).join(' · ')}`
        : 'Cuando te la monten, aparecerá aquí.',
  };

  /* ── Y el teléfono ────────────────────────────────────────────────────── */
  const datosMovil = {
    /*
      LAS KCAL NO VAN AQUÍ, y es la corrección del 14 sep: la cifra del día la
      dice la tarjeta que hay tres renglones más abajo, en 46 px. Escrita
      también en el subtítulo salía dos veces en la misma pantalla.
    */
    cabecera: {
      fecha: fechado,
      donde: deHoy && !deHoy.unica ? deHoy.name : '',
    },
    dias: (semana || []).map((d) => {
      /* Qué dieta le toca ese día. El mapa es el mismo con el que su entrenador
         reparte el ciclo, así que la sigla de la cinta y la dieta que se abre al
         pulsarla no pueden discrepar. */
      const dayId = mapa[d.key] || null;
      return {
        key: d.fecha,
        /* La LETRA de la dieta que toca ese día. Es lo que sustituyó a la
           muesca: una sigla dice CUÁL, un punto solo dice que hay algo. */
        sigla: dayId ? siglas[dayId] || '·' : '·',
        letra: d.corto,
        esHoy: d.esHoy,
        onElegir: dayId ? () => setDiaElegido(dayId) : null,
      };
    }),
    /*
      ══ LA TARJETA DEL DÍA DICE LO PAUTADO, Y SOLO LO PAUTADO (14 sep) ══════

      Decía «3.072 de 3.100 kcal»: la cifra grande era lo que suman las comidas
      escritas y la pequeña el objetivo, mientras los tres macros de debajo eran
      —esos sí— lo pautado. El dueño lo vio: *«muestra los macros reales, no los
      estipulados»*. Dos varas de medir en una pieza de cuatro cifras.

      Es la MISMA avería que se arregló quitando las barritas, y que había
      sobrevivido en el titular. Y tenía debajo algo peor: `dayMacros` suma
      siempre la PRIMERA opción de cada comida, así que la cifra no se movía al
      elegir otra —decía «lo que tienes abierto» sin serlo—.

      La app no trackea: nadie apunta lo que se come. Lo único cierto de esta
      pantalla es lo que le han pautado, y eso es lo que sale: kcal, proteína,
      carbos y grasas, las cuatro de la misma fuente (`targetsFor` +
      `dayKcalTarget`). Lo que suma cada opción sigue a la vista donde importa:
      en la cabecera de su comida.
    */
    dia:
      sinCifras || !objetivos
        ? null
        : {
            kcal: miles(objetivos.kcals || 0),
            /* Con su clave y su color de la casa: el teléfono dibuja qué parte
               de las kcal pone cada uno (`movil/PantallaComer · Arco`). */
            macros: [
              { key: 'protein', k: 'Proteína', v: Math.round(objetivos.protein || 0) },
              { key: 'carbs', k: 'Carbos', v: Math.round(objetivos.carbs || 0) },
              { key: 'fats', k: 'Grasas', v: Math.round(objetivos.fats || 0) },
            ].map((m) => ({ ...m, color: MACROS.find((x) => x.key === m.key)?.color })),
          },
    comidas,
    /* Lo que necesita la fila para calcular sus alternativas al desplegarse:
       el catálogo y los grupos de su entrenador, vacíos si no le toca verlas. */
    catalogo,
    grupos,
    sinCifras,
    /*
      CÓMO VAN TUS CALORÍAS: el dato y no quién lo escribió.

      La frase dice el hecho —«2.150 kcal desde el 2 de julio»— y no «tu
      entrenador no ha cambiado tus calorías desde que empezaste», que era la
      misma información con él de sujeto gramatical. Ley 1 de la voz.

      Los puntos salen de las DOS fuentes que guardan la pauta de cada día: la
      foto que viaja con cada pesaje y la que queda escrita al cerrar cada
      revisión (`dietLog`). Con una sola, quien se pesa desde el portal tiene
      decenas de pesajes sin foto y la línea sale plana por falta de datos, no
      por falta de cambios — que es justo lo contrario de lo que se quiere decir.
    */
    historia:
      !sinCifras && objetivos?.kcals && pautas.length > 0
        ? {
            frase: `${miles(objetivos.kcals)} kcal${
              desdeCuando ? ` desde el ${fechaCorta(desdeCuando)}` : ''
            }`,
            puntos: pautas,
          }
        : null,
  };

  return enMonitor ? <DietaEnMonitor datos={datosPC} /> : <ComerEnTelefono datos={datosMovil} />;
};

/** «165 g» o «1 reb»: la ración como la escribió quien montó la dieta. */
const racionDe = (food) => {
  if (!displayAsUnits(food)) return `${food.grams} g`;
  return `${String(foodUnits(food)).replace('.', ',')} ${abreviarUnidad(food.unitLabel)}`;
};

/* Aquí vivían `macroTesela` y `parte`.

   La primera armaba las cuatro teselas que abrían la pantalla del monitor, que
   ya no existe. La segunda calculaba el porcentaje de las barritas del teléfono
   —lo que suman las opciones abiertas contra lo pautado— y se fue con ellas: el
   menú se escribe PARA cuadrar con la pauta, así que las cuatro barras salían
   llenas todos los días de todo el mundo. Ver `movil/PantallaComer`. */

const fechaCorta = (iso) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

/** Sin uso fuera de aquí, pero deja escrito el formato de una cifra con coma. */
export const conComa = (n) => localeNumber(n, { maximumFractionDigits: 1 });
