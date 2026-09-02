import { Suspense, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react';

import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { buildWeeklySeries, metricPoints } from '@/domain/analytics';
import { currentCheckInPeriod } from '@/domain/calendar';
import { groupByWeek, weekComparison } from '@/domain/photos';
import { checkinQuestions, clientProtocol } from '@/domain/protocol';
import { readingHeadline, weeklyReading, weightTrend } from '@/domain/reading';
import { effectiveGoal, phaseAt, phaseProgress } from '@/domain/roadmap';
import {
  answerTrend,
  pendingReviews,
  planSnapshot,
  reviewableWeeks,
  queueWeek,
  weekToReview,
} from '@/domain/reviews';
import { nutritionTrack, reviewTimeline, timelineSummary } from '@/domain/timeline';
import { clientWeek, exerciseHistory, latestActiveWeek } from '@/domain/week';
import { localeNumber, shortDate, todayISO } from '@/lib/dates';
import { modifierKey } from '@/lib/platform';
import { useElementWidth } from '@/lib/useElementWidth';
import { lazyRoute } from '@/lib/lazyRoute';
import { Delta } from '@/components/ui/metrics';
/* Las tarjetas se declaran con la clase `card` y no con `Panel`: `Panel` monta
   además su propia cabecera de rótulo en versalita, y aquí cada bloque lleva un
   TÍTULO de verdad con su frase debajo — que es media corrección de esta
   pantalla. Usar `Panel` obligaría a pasarle un `title` vacío y a montar la
   cabecera por fuera igualmente. */
import { EmptyState } from '@/components/ui/primitives';
import { Mando } from '@/components/ui/Mando';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Tarjeta } from '@/components/dashboard/Tarjeta';
import { Gallery } from '@/components/photos/Gallery';
import { useTimelineWindow } from '@/components/review/useTimelineWindow';
import { useReviewTrack } from '@/components/review/useReviewTrack';
import { BodyCard } from '@/components/review/BodyCard';
import { TrainingCard } from '@/components/review/TrainingCard';
import { NutritionCard } from '@/components/review/NutritionCard';
import { ReviewDecision } from '@/components/review/ReviewDecision';
import { fmt } from '@/lib/num';
import { clientPath } from '@/routes';
import { Anteriores } from '@/components/review/Anteriores';
import { useReviewRows } from '@/components/review/useReviewRows';
import { ReviewHistory } from '@/components/ReviewHistory';

/* La ventana del cuerpo a fondo es la MISMA del Resumen: se difiere igual. */
const PanelCuerpo = lazyRoute(() => import('@/components/dashboard/PanelCuerpo').then((m) => ({ default: m.PanelCuerpo })));

/**
 * LA REVISIÓN DE UN CLIENTE: lo que pasó a la izquierda, lo que le pusiste a la
 * derecha, y una decisión.
 *
 * ══ La forma ════════════════════════════════════════════════════════════════
 *
 *     Semana 24 · del 17 ago · Definición · espera tu respuesta    [1 de 4] ‹ ›
 *     ┌── CÓMO VA ──────────────────────────────┐ ┌ SU PLAN ESTA SEMANA ──┐
 *     │ 81,5 kg  ↑1,4  [en dirección contraria]  │ │ Calorías  2.300 ↓150  │
 *     │ 3 pesajes · 2,5 kg más que en la S1      │ │ Proteína  185 g  ↑5   │
 *     │ S15 · S16 · … · [S24 pendiente]   a fondo → │ │ Pasos     11.000      │
 *     │                                          │ │ Ajustar la dieta →    │
 *     └──────────────────────────────────────────┘ └───────────────────────┘
 *     ┌── SU CUERPO ─────────────────────────────┐ ┌ ANTERIORES  Ver todas ┐
 *     │ «llevo dos semanas durmiendo fatal»      │ │ Sem. del 17 ago 77,7  │
 *     │ Sueño 3/5 ↓1 · Hambre 4/5                │ │ Sem. del 10 ago 77,9  │
 *     │ [fotos de las semanas que las tienen]    │ └───────────────────────┘
 *     └──────────────────────────────────────────┘
 *     ┌── SU ENTRENO ────────────── Su rutina → ─┐
 *     │ Push A · 24 ago · 18 de 18 · sube en 5 › │
 *     └──────────────────────────────────────────┘
 *     ═══ la barra con la que se cierra ═══════════════════════════════════
 *
 * ══ Por qué DOS COLUMNAS, después de cinco tarjetas apiladas ═══════════════
 *
 * Entreno, Dieta y Resumen ya tienen esta forma: el trabajo a lo ancho y, al
 * lado, lo que se decidió una vez y se consulta muchas. La revisión era la única
 * pantalla del cliente que no —cinco tarjetas a lo ancho, a la medida de
 * lectura— y se notaba al saltar de pestaña: otro ancho, otra gramática.
 *
 * Lo que se ha ido:
 *   · El mapa del proceso entero al pie de la gráfica (TimelineSpine): una
 *     segunda curva del mismo peso; para el salto largo están las flechas.
 *   · El rótulo «Lo que pasó en la semana 15 · del 24 ago», que repetía la
 *     fila de mando de treinta líneas más arriba.
 *   · Las cinco escalas vacías con «igual que antes» debajo cuando no había
 *     contestado ninguna, y las once columnas de puntos de la tira de fotos.
 *   · El plan a lo ancho —cinco cifras ocupando una tarjeta entera— y el
 *     histórico completo debajo de todo: el plan está al lado, en la forma
 *     de «El plan» del Resumen; el histórico, en una ventana grande.
 *
 * ══ 1 · Aquí NO se dibuja la curva del peso ════════════════════════════════
 *
 * La tuvo —con la escalera de calorías debajo y el eje como selector de
 * semana— y era exactamente la misma gráfica que «El cuerpo» del Resumen, en
 * la pestaña de al lado. Dos pestañas con el mismo dibujo se leen como una
 * pantalla partida en dos. Lo que esta tarjeta tiene que decir de la semana es
 * su cifra, su variación y su veredicto; el selector son pastillas como las de
 * Entreno, y el análisis entero —la tabla semana a semana con peso, kcal, pasos
 * y lo que contestó, la tendencia, los perímetros— se abre «a fondo» en la
 * MISMA ventana que el Resumen (`PanelCuerpo`). Las dos pestañas dejan de
 * pisarse: Resumen lee el proceso, Revisiones cierra la semana.
 *
 * ══ 2 · Los tres bloques SON LOS TRES DOMINIOS de una asesoría ═════════════
 *
 *   · **Cuerpo** — la báscula, la cinta, las fotos y lo que él te cuenta. Los
 *     cuatro instrumentos del mismo examen, y por eso van juntos: es lo que
 *     impide bajarle la comida a alguien que no mueve la báscula pero ha perdido
 *     cinco centímetros de cintura. Ver `BodyCard`.
 *   · **Entreno** — una fila por ejercicio: su tope, si sube o baja, la forma
 *     de su recorrido y sus series. Ver `TrainingCard` y `ExerciseRow`.
 *   · **Nutrición** — qué le pusiste y cuándo lo cambiaste. La escalera contra
 *     su peso vive arriba, en la gráfica, que es donde se comparan las dos.
 *     Ver `NutritionCard`.
 *
 * Dentro del cuerpo, lo secundario va plegado con su resumen en el rótulo
 * —«cintura −5 cm», «6 fotos»—, así que **se sabe qué hay dentro sin abrirlo**.
 * Eso es lo que distingue plegar de esconder.
 *
 * ── 3 · Lo que DECIDE no está dentro de ningún bloque ──────────────────────
 * Siempre visibles: el veredicto y la cifra (arriba, juntos, porque el veredicto
 * juzga esa curva y estaba a ochocientos píxeles de ella), la gráfica —que es el
 * selector de semana— y la barra con la que se cierra (abajo). Dentro de los
 * bloques, lo que se CONSULTA para decidir. Un dato que hace falta para
 * contestar no puede estar a un clic, y lo que se consulta no puede ocupar
 * pantalla mientras contestas.
 *
 * Lo único que se abre en diálogo es el registro completo de un ejercicio, que
 * es salirse a consultar un archivo y volver. Ver `ExerciseSheet`.
 *
 * ── 4 · Y sigue pidiendo UNA consulta ──────────────────────────────────────
 * Los tres bloques salen de `domain/` sobre datos que ya están cargados. Lo único
 * que se pide es el historial de revisiones, y tampoco es nuevo: el panel del
 * final ya lo bajaba.
 */

/**
 * El tono del veredicto, en la chapa que ya usa el resto del producto. `unknown`
 * se queda sin color: «no hay datos suficientes» no es ni bueno ni malo, y
 * pintarlo de gris con color sería afirmar algo que nadie ha calculado.
 */
const TONO_BADGE = { good: 'badge-ok', warn: 'badge-warn', bad: 'badge-bad' };

export const WeekReview = () => {
  const {
    activeClient,
    clients,
    workoutData,
    anthropometry,
    progressPhotos,
    checkIns,
    nutrition,
    phases,
    ensurePhotoUrls,
  } = useApp();

  /*
    ══ Firmar sus fotos, o la comparativa sale vacía ══════════════════════════

    Las fotos se guardan por RUTA y su enlace se firma a demanda: en
    `progressPhotos` llegan con `url: null` hasta que alguien lo pide
    (`ensurePhotoUrls`). Lo pedían el estudio y el portal, y esta pantalla no —
    así que la comparativa pintaba los pies de foto, el peso y el intervalo, y
    entre medias nada. Un fallo mudo: `Thumb` sin url no devuelve una imagen
    rota, no devuelve nada.
  */
  useEffect(() => {
    if (activeClient?.id) ensurePhotoUrls(activeClient.id);
  }, [ensurePhotoUrls, activeClient?.id]);

  /* Su historial de revisiones. Hace falta para tres cosas: el panel de abajo,
     los hitos de la espina —dónde ya contestaste— y la foto del plan de la
     ÚLTIMA revisión cerrada, que es contra lo que se compara el plan de hoy para
     poder decir qué le estás cambiando ANTES de contestarle. */
  const {
    rows: revisiones,
    /* La lista CRUDA de entregas, que incluye las de semanas anteriores. Es lo
       que permite dibujar cómo evoluciona lo que te cuenta en vez de enseñar el
       número suelto de esta semana. Se llama distinto que el `checkIns` de
       `useApp()` —que es solo la última de cada cliente— porque son dos cosas. */
    checkIns: entregas,
    cargando: cargandoRevisiones,
    recargar,
  } = useReviewRows(activeClient?.id);

  /* Los `|| []` van dentro de un `useMemo`: un literal nuevo en cada render
     invalidaría todas las memorias de abajo y esta pantalla recalcularía la
     semana entera al escribir cada letra de la respuesta. */
  const microcycles = useMemo(
    () => workoutData[activeClient?.id]?.microcycles || [],
    [workoutData, activeClient?.id]
  );
  const history = useMemo(
    () => anthropometry[activeClient?.id]?.history || [],
    [anthropometry, activeClient?.id]
  );

  const photos = useMemo(
    () => progressPhotos.filter((p) => p.clientId === activeClient?.id),
    [progressPhotos, activeClient?.id]
  );

  /*
    ══ LAS FOTOS, agrupadas por semana ════════════════════════════════════════

    Las usan dos cosas de esta pantalla —la hoja de contactos y la tira de la
    línea de tiempo—, así que se agrupan una vez y arriba. Estaban declaradas
    cien líneas más abajo y la línea de tiempo las leía desde aquí: un
    `ReferenceError` en cada render, porque el `useMemo` de la línea corre en el
    sitio donde está escrito y no cuando alguien lo mira.
  */
  const porSemana = useMemo(
    () => groupByWeek(photos, activeClient?.startDate),
    [photos, activeClient?.startDate]
  );

  /*
    La semana elegida es estado LOCAL y arranca en la última con actividad. No
    viaja en la URL a propósito: es un sitio donde se está MIRANDO, no un sitio
    donde se está. Lo que se comparte de alguien es su ficha, no el instante
    concreto de su historial en el que estaba otra persona.

    ── Y guarda de QUIÉN es esa semana ──────────────────────────────────────
    Cambiar de cliente desde el selector no desmonta esta pantalla: React Router
    solo cambia un parámetro de la ruta, así que un `useState` a secas se
    quedaría pegado y al pasar de alguien con ocho semanas a alguien con dos se
    vería «Semana 6» de una persona que no la tiene. Guardando el cliente al lado
    del número, la elección caduca sola al cambiar de persona —sin ningún efecto
    que la limpie, que es de donde salen las selecciones rancias—.
  */
  const [elegida, setElegida] = useState(null);

  /* Qué foto de la tira se está mirando a pantalla completa, o `null`. */
  const [verFotos, setVerFotos] = useState(null);
  /* La ventana abierta: el histórico completo, o ninguna. */
  const [ventana, setVentana] = useState(null);

  const setSemanaElegida = (week) => setElegida({ clientId: activeClient?.id, week });

  /*
    El periodo de check-in vigente. Va delante de todo lo demás porque decide dos
    cosas: qué semanas se pueden abrir y en cuál se entra.
  */
  const periodo = useMemo(
    () => currentCheckInPeriod(activeClient?.preferences, activeClient?.startDate, todayISO()),
    [activeClient?.preferences, activeClient?.startDate]
  );
  const semanaDeLaCola = queueWeek({ startDate: activeClient?.startDate, period: periodo });

  /*
    ══ Las semanas que se pueden abrir, y no solo las que montaste ═══════════

    Salían de los microciclos, así que una semana sin rutina no existía para esta
    pantalla. El calendario de check-ins no espera a que la montes: avanza con la
    cadencia. Ver `reviewableWeeks` para el callejón sin salida que eso creaba.
  */
  const semanas = useMemo(
    () =>
      reviewableWeeks({
        programmed: microcycles.map((m) => m.weekNumber),
        startDate: activeClient?.startDate,
        submitted: checkIns[activeClient?.id],
        period: periodo,
      }),
    [microcycles, activeClient?.startDate, activeClient?.id, checkIns, periodo]
  );

  /*
    ══ POR QUÉ SEMANA SE ABRE ════════════════════════════════════════════════

    Tres reglas, y la que faltaba era la tercera:

      1. La que ENTREGÓ y espera respuesta. Es la razón por la que se entra aquí
         desde «Hoy»: sin ella, la pantalla hablaba de otra semana y el bloque de
         respuesta decía «cuando entregue su check-in» debajo de un aviso que
         acababa de decir lo contrario.
      2. La que LA PASADA está pidiendo — el periodo de check-in vigente.
      3. Y si no le toca nada, la última con actividad.

    La 2 no estaba, y de ahí salía un fallo que desde fuera era «le doy a cerrar
    y no pasa nada»: `buildPortfolio` descarta cualquier entrega ANTERIOR a
    `periodo.start` antes de mirar si está revisada, así que cerrar una semana
    vieja no quita al cliente de la lista. La escritura era correcta —el
    histórico se actualizaba y el recuento de cambios volvía a cero— pero se
    guardaba bajo la semana equivocada.

    La regla vive en `weekToReview` porque es una REGLA y no una maqueta, y
    porque una regla escrita dentro de un componente de setecientas líneas no se
    puede probar — que es exactamente por lo que esto llegó a producción.
  */
  const suya = elegida?.clientId === activeClient?.id && semanas.includes(elegida.week);
  const semana = suya
    ? elegida.week
    : weekToReview({
        weeks: semanas,
        startDate: activeClient?.startDate,
        submitted: checkIns[activeClient?.id],
        period: periodo,
        fallback: latestActiveWeek({
          microcycles,
          history,
          photos,
          startDate: activeClient?.startDate,
        }),
      });

  const datos = useMemo(
    () =>
      clientWeek({
        microcycles,
        history,
        photos,
        startDate: activeClient?.startDate,
        weekNumber: semana,
      }),
    [microcycles, history, photos, activeClient?.startDate, semana]
  );

  /* La comparación numérica necesita UN par concreto: el ángulo por defecto de
     la semana contra su anterior. La eligen las mismas reglas de siempre
     (`weekComparison`), sin que haya que tocarlas a mano. */
  const comparativa = useMemo(
    () => weekComparison({ photos, startDate: activeClient?.startDate, weekNumber: semana }),
    [photos, activeClient?.startDate, semana]
  );

  /*
    ══ LA EVOLUCIÓN, que es lo que faltaba ════════════════════════════════════

    Una revisión enseñaba el PUNTO de esta semana —81,5 kg— y con un punto no se
    decide nada. La forma de la curva es la información. Es la misma serie
    semanal que la analítica (`buildWeeklySeries`), sobre datos que ya están
    cargados: ni una consulta más.

    ── Y NO se corta en la semana que se está mirando ─────────────────────────
    Se cortaba, con el argumento de que revisando la semana 3 de ocho lo que pasó
    en la 4 «todavía no ha pasado» para quien revisa. El precio era que el
    instrumento se redibujaba entero al elegir otra semana —con otra escala, o
    sea con los mismos pesos a otra altura—, y un aparato que cambia de forma al
    señalarlo no se puede leer dos veces seguidas.

    La línea es el mapa y se queda quieta; lo que se mueve es el cursor. Quien
    habla solo de la semana elegida es todo lo que va debajo.
  */
  const serie = useMemo(
    () => buildWeeklySeries({ microcycles, history, gender: activeClient?.gender }),
    [microcycles, history, activeClient?.gender]
  );

  /*
    ══ LA LÍNEA DE TIEMPO: una fila por semana de programa, TODAS ════════════

    La regla de cómo se cruzan las tres fuentes —el peso, las calorías y sus
    fotos— vive en `domain/timeline.js`, que es donde se puede probar; aquí solo
    se le pasa lo que ya está cargado.
  */
  const linea = useMemo(
    () =>
      reviewTimeline({
        weeks: semanas,
        startDate: activeClient?.startDate,
        series: serie,
        reviews: revisiones,
        photoGroups: porSemana,
      }),
    [semanas, serie, revisiones, porSemana, activeClient?.startDate]
  );

  /*
    ══ Cuál de los dos estados se escribe en las pastillas ═════════════════════

    La regla de la tira ya estaba bien pensada: solo habla lo que tiene algo que
    decir, porque «catorce cerrada seguidas no informan; una sin cerrar sí». Lo
    que le faltaba era el caso en que la excepción NO es excepción.

    Con alguien que no tiene ni una semana cerrada —el que acaba de empezar, o el
    que llevabas sin atender— la condición se cumple en todas, y la tira sale con
    quince «sin cerrar» seguidas. Quince repeticiones de lo mismo informan
    exactamente igual que las catorce «cerrada» que la regla evitaba: nada. Y
    encima parten la tira en dos renglones y la convierten en la pieza más pesada
    de la tarjeta, por delante de la cifra.

    Así que la regla se aplica a sí misma: se etiqueta SIEMPRE la minoría. Si la
    mayoría está sin cerrar, lo que informa es cuál sí lo está.
  */
  const marcaMinoria = useMemo(() => {
    const sinCerrar = linea.filter((f) => !f.reviewed && f.week < semanaDeLaCola).length;
    const cerradas = linea.filter((f) => f.reviewed).length;
    return sinCerrar <= cerradas ? 'sin-cerrar' : 'cerrada';
  }, [linea, semanaDeLaCola]);

  /* Lo que pesa esta semana, lo que se ha movido y lo que lleva acumulado. Sale
     de la propia línea: con el peso de todas las semanas delante, «desde el
     inicio» es una resta y no una consulta. */
  const resumen = useMemo(() => timelineSummary(linea, semana), [linea, semana]);

  /*
    ══ Lo que necesita la ventana «a fondo» ═══════════════════════════════════
    Es `PanelCuerpo`, la misma del Resumen: la tabla semana a semana con peso,
    kcal, pasos y lo que contestó, la tendencia, los perímetros y las escalas.
    Aquí NO se dibuja la curva del peso: ya está en el Resumen, y repetirla era
    la mitad de la sensación de que las dos pestañas se pisan.
  */
  const track = useReviewTrack(revisiones);
  const protocolo = useMemo(() => clientProtocol(activeClient?.preferences), [activeClient?.preferences]);
  const pesoActual = metricPoints(serie, 'weight').slice(-1)[0]?.value ?? null;
  const trend = useMemo(() => weightTrend(serie), [serie]);
  const goal = useMemo(() => effectiveGoal(activeClient, phases, todayISO()), [activeClient, phases]);

  /*
    ══ QUÉ LE PUSISTE DE COMER, SEMANA A SEMANA ══════════════════════════════

    El objetivo de calorías no se mide: se pone, y sigue puesto hasta que lo
    cambias. Así que la línea de nutrición es una ESCALERA, y se arma con la foto
    del plan que guarda cada revisión cerrada más el plan de HOY para las semanas
    que aún no tienen revisión. Ver `nutritionTrack`.

    Es la misma foto que usa la barra de decisión para calcular el diff, hecha
    con la misma función: dos formas de leer el plan acabarían discrepando.
  */
  const planDeHoy = useMemo(
    () =>
      planSnapshot({
        nutrition: nutrition[activeClient?.id],
        program: workoutData[activeClient?.id],
      }),
    [nutrition, workoutData, activeClient?.id]
  );

  /*
    Y la línea que dibuja la gráfica: el peso de `reviewTimeline` y el plan que
    estuvo en vigor cada semana, en la misma fila. Es lo que permite que UNA sola
    gráfica enseñe las dos bandas — antes había dos dibujos de los mismos datos
    en la misma pantalla, uno pulsable y otro no.
  */
  const nutricion = useMemo(
    () => nutritionTrack({ rows: linea, reviews: revisiones, plan: planDeHoy }),
    [linea, revisiones, planDeHoy]
  );

  /*
    ══ LA VENTANA: qué trozo de la línea se mira de cerca ════════════════════

    Estado compartido entre la espina —que dibuja la banda— y los apartados —que
    dibujan el trozo—. Vive en un gancho porque las dos piezas no se contienen la
    una a la otra: la espina está fuera de los apartados. Ver `useTimelineWindow`.

    El ancho se mide AQUÍ y no dentro de cada apartado: dos de ellos dibujan la
    ventana y solo uno está montado cada vez, así que el que está oculto mediría
    cero y la ventana cambiaría de tamaño al cambiar de pestaña.
  */
  const [refAncho, ancho] = useElementWidth();
  const { visibles, elegir, vecina } = useTimelineWindow({
    weeks: linea,
    selected: semana,
    ancho,
  });

  const irA = (week) => elegir(week, setSemanaElegida);
  const paso = (n) => {
    const week = vecina(n);
    if (week !== null) irA(week);
  };

  /* Lo que recorre el visor cuando se abre desde la tira: las mismas fotos y en
     el mismo orden. Si «la siguiente» no fuera la de al lado, pasar fotos
     dejaría de tener sentido. */
  const album = useMemo(
    () =>
      linea
        .filter((s) => s.photo)
        .map((s) => ({
          id: s.photo.id ?? s.photo.path,
          url: s.photo.url,
          week: s.week,
          caption: `Semana ${s.week}${s.photo.date ? ` · ${shortDate(s.photo.date)}` : ''}`,
        })),
    [linea]
  );

  /*
    ══ QUÉ HA LEVANTADO: sus series, esta semana y la anterior ═══════════════

    Dos semanas, que es la comparación que decide si progresa. La historia
    completa de cada ejercicio se abre a un toque dentro del apartado, y se pide
    solo entonces (ver `TrainingPane`).
  */
  const historial = useMemo(
    () => exerciseHistory({ microcycles, weekNumber: semana }),
    [microcycles, semana]
  );

  /* Y repartidos por su DÍA, que es como se entrena y como se lee. Un entrenador
     piensa «el lunes hizo esto», no «el press banca de la semana». */
  const porDia = useMemo(() => {
    const agrupados = new Map();
    for (const ejercicio of historial) {
      const dia = ejercicio.dayName || '';
      if (!agrupados.has(dia)) agrupados.set(dia, []);
      agrupados.get(dia).push(ejercicio);
    }
    return agrupados;
  }, [historial]);

  /*
    ══ Si la media de peso se sostiene o no ═══════════════════════════════════

    La media de un solo pesaje no es una media: es un día, y un día con resaca
    pesa kilo y medio más. Decir «solo 1 de 3 pesajes» delante de la cifra es lo
    que impide bajarle las calorías a alguien por un dato que no lo aguanta —y
    el objetivo sale de `weeklyCheckIn`, que es quien lo define para todo el
    producto, no de un número escrito aquí.
  */
  const fiabilidad = datos.checkIn?.count
    ? datos.checkIn.complete
      ? `${datos.checkIn.count} pesajes · media de la semana`
      : `solo ${datos.checkIn.count} de ${datos.checkIn.target} pesajes`
    : 'sin pesajes esta semana';

  /*
    ══ LO QUE CALIFICA A LA CIFRA, en una línea ══════════════════════════════

    Tres cosas y en este orden: si el dato se sostiene, cuánto lleva acumulado y
    con cuántas calorías. Eran tres casillas con su rótulo, su cifra y su nota
    debajo —nueve renglones para decir esto— y dichas seguidas ocupan uno.

    Y el acumulado se dice con PALABRAS y no con otra píldora: la píldora de al
    lado de la cifra es la variación de ESTA semana, que es la que se mira para
    decidir. Dos píldoras juntas diciendo cosas de distinto plazo se leen como
    dos veces lo mismo, y la de al lado pierde su sitio.
  */
  const contexto = useMemo(() => {
    if (!resumen) return null;

    const acumulado =
      resumen.sinceStart === null || resumen.sinceStart === 0
        ? null
        : `${fmt(Math.abs(resumen.sinceStart), { decimals: 1 })} kg ${
            resumen.sinceStart < 0 ? 'menos' : 'más'
          } que en la semana ${resumen.from}`;

    /* Las calorías NO van aquí, y salieron a propósito. Estaban dichas tres
       veces en la misma pantalla —esta línea, la lectura del pie de la gráfica y
       la tarjeta del plan—, y un dato repetido tres veces no informa tres veces:
       hace dudar de si son el mismo dato. Aquí se queda lo que califica al PESO,
       que es de lo que habla esta cifra. */
    return [fiabilidad, acumulado].filter(Boolean).join(' · ');
  }, [resumen, fiabilidad]);

  /*
    La entrega que espera respuesta, si la hay. `checkIns` guarda solo la última
    de cada cliente (ver `AppContext`), así que contestar desde aquí vale para la
    semana que está esperando —que es por lo que se abre esta pantalla— y no para
    reabrir una de hace dos meses. Para eso está el histórico del final.
  */
  const entrega = checkIns[activeClient?.id] || null;
  const pendiente = entrega && !entrega.reviewedAt ? entrega : null;

  /*
    ══ Y si ESTA semana ya está cerrada ══════════════════════════════════════

    La barra preguntaba «¿qué le cambias?» y ofrecía «Cerrar la semana» estuviera
    cerrada o no, así que después de contestar la pantalla seguía pareciendo que
    quedaba trabajo por hacer. Una revisión cerrada está cerrada: lo que queda es
    verla, y reabrirla si te has equivocado.

    Se compara `weekStart` y no basta con `reviewedAt`: `checkIns` guarda una sola
    entrega por cliente —la última— así que sin la comparación, mirar una semana
    vieja de alguien que cerró la de esta semana la daría por cerrada también.
  */
  const cerrada =
    entrega && entrega.reviewedAt && entrega.weekStart === datos.weekStart ? entrega : null;

  /*
    ══ LO QUE LE ESTÁS CAMBIANDO: la BASE contra la que se mide ══════════════

    La foto del plan de su última revisión cerrada. El diff en sí lo calcula
    `ReviewDecision`, que es quien deja ajustar: el «280 → 240 g» es el acuse de
    recibo del control que acabas de tocar, y separarlo del control obligaría a
    dos componentes a saber lo mismo.
  */
  const base = revisiones[0]?.snapshot || null;

  /*
    ══ Y si lo que vas a cerrar NO es lo que «Hoy» te está pidiendo ═══════════

    Pasa en dos casos legítimos: una semana vieja elegida a mano en la gráfica, y
    una semana del periodo vigente que nunca llegaste a programar (y por tanto no
    está en la línea). En los dos, cerrar hace exactamente lo que dice —guarda la
    revisión de la semana que estás mirando— pero el cliente sigue en la pasada,
    porque allí se pregunta por el periodo de ahora.

    Eso, sin avisar, se lee como «le doy a cerrar y no pasa nada». Avisado, es una
    decisión: o cierras la que toca, o sabes que ésta no te lo quita de encima.
  */
  const aviso =
    !pendiente && semanaDeLaCola !== null && semana !== semanaDeLaCola
      ? `Cierras la semana ${semana}. La que tienes pendiente es la ${semanaDeLaCola}, y seguirá en tu pasada.`
      : null;

  /*
    ══ EL VEREDICTO ══════════════════════════════════════════════════════════

    «En rumbo: −0,4 kg/sem». Es la única línea que contesta la pregunta con la
    que se entra a revisar. Se calcula EXACTAMENTE igual que en la cartera
    —mismo `weeklyReading`, mismo filtro a `rate`, mismos microciclos vacíos—
    para que la ficha de alguien y la lista de clientes no puedan dar dos
    veredictos distintos de la misma persona.
  */
  /*
    ══ EL VEREDICTO SE JUZGA CONTRA EL BLOQUE, NO CONTRA EL OBJETIVO GENERAL ══

    Esto es un arreglo, no un añadido. `weeklyReading` acepta `phases` desde el
    principio y por dentro llama a `effectiveGoal`, que es lo que hace que el
    objetivo salga de la FASE que cubre el día leído y solo se caiga al
    `preferences.goal` cuando no hay ninguna. La cabecera de `domain/roadmap.js`
    lo dice con todas las letras: «el día que empieza el volumen, subir de peso
    pasa a leerse como en rumbo sin que nadie tenga que acordarse de tocar nada».

    No se le pasaban. Sin `phases`, el parámetro cae a `[]`, `phaseAt` no
    encuentra nada y el veredicto se calcula contra el objetivo general del
    cliente — así que a alguien en un bloque de volumen, subir de peso le salía
    como «en dirección contraria» aunque fuera exactamente lo que le habías
    pedido. Un veredicto que contradice tu propia prescripción es peor que no
    tener veredicto: enseña a ignorar la chapa.

    De las diecinueve pantallas, solo la analítica pasaba las fases. Aquí se
    arregla la revisión, que es donde ese veredicto decide algo.
  */
  const veredicto = useMemo(() => {
    if (!activeClient) return null;
    return readingHeadline(
      weeklyReading({
        client: activeClient,
        series: buildWeeklySeries({ microcycles: [], history, gender: activeClient.gender }),
        microcycles: [],
        history,
        today: todayISO(),
        phases,
      }).filter((f) => f.id === 'rate')
    );
  }, [activeClient, history, phases]);

  /*
    ══ CONTRA QUÉ se está revisando, dicho en la cabecera ═════════════════════

    Un veredicto sin etapa es un veredicto suelto: dice «+0,45 kg/semana, en
    dirección contraria» y no dice contraria A QUÉ. La etapa —«definición»,
    «volumen»— es lo que le da sentido, y ya está en `domain/roadmap.js`: tramos
    con objetivo y fechas, sin solape, con su progreso.

    ── Y NO es una periodización por bloques ──────────────────────────────────
    Se dice aquí porque el vocabulario importa: esto no es powerlifting y no hay
    bloques cerrados que se ejecutan y se evalúan. En culturismo se monta una
    rutina y se AJUSTA sobre la marcha; la etapa es solo la dirección en la que
    se está yendo durante una temporada, y muchos clientes no tendrán ninguna.

    Por eso esta línea solo aparece si el entrenador ha marcado una: sin etapa,
    la cabecera se queda exactamente como estaba.
  */
  const bloque = useMemo(() => {
    const fase = phaseAt(phases, datos.weekStart || todayISO());
    if (!fase) return null;
    const avance = phaseProgress(fase, datos.weekStart || todayISO());
    const semanaDeFase = avance ? Math.max(1, Math.ceil(avance.elapsed / 7)) : null;
    const totalDeFase = avance && avance.total ? Math.ceil(avance.total / 7) : null;
    return [
      fase.title,
      /* ── Por qué no dice «semana 8 de 12» ─────────────────────────────────
         Porque en esta pantalla ya hay otras tres cifras de semana —la del
         programa en la cabecera del cliente («Semana 16 · en curso»), la que
         estás revisando en el título de aquí al lado, y la misma del programa
         en la barra lateral («S16»)—, y esta cuarta hablaba de algo distinto:
         cuántas semanas llevas DENTRO DE LA FASE. Escrita como «semana 8 de
         12» y a tres palabras de un «Semana 15», se leía como si una de las dos
         estuviera mal. El posesivo la ancla a su fase y deja de competir. */
      semanaDeFase && totalDeFase
        ? `${semanaDeFase}.ª de sus ${totalDeFase} semanas`
        : semanaDeFase
          ? `${semanaDeFase}.ª semana de la fase`
          : null,
      /* Y el aviso de que la etapa se acaba, solo si el entrenador le puso
         fecha de fin. No decide nada ni propone nada: dice que la fecha que él
         mismo marcó está encima, que es lo que la aplicación sabía y no contaba
         en ninguna parte. Dónde se contesta ya existe, en «Progreso». */
      avance && !avance.open && avance.weeksLeft !== null && avance.weeksLeft <= 1
        ? 'su etapa termina esta semana'
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [phases, datos.weekStart]);

  /*
    ══ LA PASADA ═════════════════════════════════════════════════════════════

    A quién más le debes una respuesta ahora mismo. Es lo que convierte revisar a
    cuatro personas en UNA tarea con final en vez de en cuatro visitas sueltas, y
    no necesita ningún estado guardado: la lista se calcula sobre lo que ya está
    en memoria y se encoge sola al cerrar cada una (ver `pendingReviews`).
  */
  const pasada = useMemo(() => pendingReviews({ clients, checkIns }), [clients, checkIns]);
  const siguiente = pasada.find((p) => p.client.id !== activeClient?.id) || null;
  const navigate = useNavigate();
  const idxPasada = pasada.findIndex((p) => p.client.id === activeClient?.id);

  /*
    ══ La bandeja se vacía con el teclado ═════════════════════════════════════
    Revisar doce clientes un domingo tiene que sentirse como vaciar un correo:
    J y K saltan entre las personas que esperan respuesta, R lleva el cursor a
    la caja de escribir y ⌘/Ctrl + Intro cierra la semana. Las letras solo
    funcionan fuera de un campo de texto; el cierre, también dentro, que es
    donde uno está cuando termina de escribir.
  */
  useEffect(() => {
    const onKey = (e) => {
      const enCampo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const boton = document.querySelector('.cierre .btn-primary');
        if (boton) { e.preventDefault(); boton.click(); }
        return;
      }
      if (enCampo || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'j' || e.key === 'k') {
        if (pasada.length < 2) return;
        const paso = e.key === 'j' ? 1 : -1;
        const destino = pasada[(idxPasada + paso + pasada.length) % pasada.length];
        if (destino) { e.preventDefault(); navigate(clientPath(destino.client.id, 'semana')); }
      } else if (e.key === 'r') {
        const caja = document.querySelector('.cierre textarea');
        if (caja) { e.preventDefault(); caja.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pasada, idxPasada, navigate]);

  /* Las preguntas del check-in, para leer lo que contestó al entregar. Las de
     HOY: si el entrenador quitó una después, su respuesta deja de pintarse
     porque no hay forma de saber de qué escala era (mismo criterio que el
     histórico). */
  const preguntas = useMemo(
    () => checkinQuestions(clientProtocol(activeClient?.preferences)),
    [activeClient?.preferences]
  );

  /*
    Lo que contestó al entregar ESTA semana. La comparación de `weekStart` no
    sobra: `checkIns` guarda solo la última entrega de cada cliente, así que sin
    ella las respuestas de la semana pasada se pintarían debajo del carril puesto
    en la semana 3 como si fueran de la 3.
  */
  const respuestas = entrega?.weekStart === datos.weekStart ? entrega.answers || {} : {};

  /*
    ══ Y cómo ha ido cambiando lo que te cuenta ═══════════════════════════════

    Las escalas se COMPARAN y las palabras se LEEN, así que van por caminos
    distintos: las primeras a una tabla de antes/ahora sobre las últimas ocho
    entregas (`answerTrend`), y las de texto al bloque de respuestas de siempre.
  */
  const tendencia = useMemo(
    () => answerTrend({ checkIns: entregas, questions: preguntas, weekStart: datos.weekStart }),
    [entregas, preguntas, datos.weekStart]
  );
  const textos = useMemo(() => preguntas.filter((q) => q.kind === 'text'), [preguntas]);

  if (!activeClient) return null;

  if (semanas.length === 0) {
    return (
      <div className="stack">
        <Mando contexto="Todavía no tiene ninguna semana montada." />
        <EmptyState
          icon={ClipboardCheck}
          title="Aún no hay ninguna semana que cerrar"
          message="Móntale su primera semana en «Entreno» y aquí aparecerá lo que hace con ella, lo que entrega y el sitio para contestarle."
        />
      </div>
    );
  }

  /* La semana de al lado, para las flechas del mando. `vecina` devuelve null en
     los extremos, y ahí la flecha no se pinta: un botón apagado en una fila de
     mando es ruido. */
  const anterior = vecina(-1);
  const posterior = vecina(1);

  return (
    <div className="revision-pagina">
      {/*
        La fila de mando, la misma que en Entreno y Dieta: a la izquierda qué
        semana es y en voz baja de cuándo, contra qué etapa y si espera
        respuesta; a la derecha las flechas para pasar de semana —que es el
        gesto más frecuente de esta pantalla y hasta ahora solo estaba en el
        teclado y en el eje de la gráfica— y por dónde vas en la pasada.

        El veredicto de cómo va ÉL no va aquí: es un juicio sobre la curva y
        vive pegado a la cifra que juzga.
      */}
      <Mando
        /* «Semana 15» a secas competía con el «Semana 16 · en curso» de la
           cabecera del cliente: dos cifras de semana, una encima de otra, sin
           nada que dijera que una es la del programa y la otra la que tienes
           abierta. El verbo lo resuelve sin añadir una línea. */
        titulo={`Revisando la semana ${semana}`}
        contexto={[
          datos.weekStart && `del ${shortDate(datos.weekStart)}`,
          bloque,
          pendiente ? 'entregó y espera tu respuesta' : 'sin nada pendiente por tu parte',
        ]
          .filter(Boolean)
          .join(' · ')}
        acciones={
          <>
            {/* Aquí iba «{posicion} de {pasada.length}». Se ha quitado porque lo
                dice ya la bandeja de treinta píxeles más abajo, y mejor: cuenta
                sobre `pasada`, la MISMA lista, y las dos se pintan bajo la misma
                condición (`pasada.length > 1`), así que la chapa nunca aparecía
                sin la bandeja debajo. Además engañaba de sitio: vivía pegada a
                las flechas, que cambian de SEMANA, mientras ella contaba
                PERSONAS — dos ejes distintos en el mismo rincón. */}
            <div className="revision-paso" role="group" aria-label="Cambiar de semana">
              <button
                type="button"
                className="btn btn-icon"
                aria-label={anterior !== null ? `Semana ${anterior}` : 'No hay semana anterior'}
                disabled={anterior === null}
                onClick={() => paso(-1)}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="btn btn-icon"
                aria-label={posterior !== null ? `Semana ${posterior}` : 'No hay semana posterior'}
                disabled={posterior === null}
                onClick={() => paso(1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </>
        }
      />

      {/* La bandeja: quién más espera respuesta, con la persona abierta marcada.
          Es la lista de un correo, tumbada. Solo se pinta con dos o más. */}
      {pasada.length > 1 && (
        <nav className="bandeja" aria-label="Personas que esperan respuesta">
          <ul className="bandeja-lista">
            {pasada.map((p) => (
              <li key={p.client.id}>
                <Link
                  className={`bandeja-persona${p.client.id === activeClient.id ? ' is-abierta' : ''}`}
                  to={clientPath(p.client.id, 'semana')}
                  aria-current={p.client.id === activeClient.id ? 'page' : undefined}
                >
                  <Avatar name={p.client.name} src={p.client.avatar} size="xs" />
                  <span>{p.client.name.split(/s+/)[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
          <span className="bandeja-teclas" aria-hidden="true">
            {/* La modificadora, según el sistema: `⌘` en Apple y `Ctrl` en el
                resto (`lib/platform.js`). Estaba escrita a mano como «⌘↵», así
                que en Windows la aplicación anunciaba una tecla que ese teclado
                no tiene — el atajo funcionaba con Ctrl desde el principio, lo
                que mentía era el rótulo. */}
            <kbd className="kbd">J</kbd><kbd className="kbd">K</kbd> siguiente · <kbd className="kbd">R</kbd> responder · <kbd className="kbd">{modifierKey()} ↵</kbd> cerrar
          </span>
        </nav>
      )}

      {/*
        ══ DOS COLUMNAS, como Entreno, Dieta y Resumen ══════════════════════
        A la izquierda lo que PASÓ esa semana —cómo va, qué te cuenta y cómo se
        ve, qué levantó—, que es lo que se lee. A la derecha lo que le tenías
        PUESTO y lo que decidiste las semanas anteriores, que es lo que se
        consulta mientras decides. Antes eran cinco tarjetas apiladas a lo
        ancho y el plan —cinco cifras— ocupaba una tarjeta entera de ancho de
        página; el histórico, catorce filas más.
      */}
      <div className="revision">
        <div className="revision-trabajo">
          {/*
            ══ CÓMO VA: la cifra y la gráfica, en la misma tarjeta ═══════════
            La cifra ES la lectura de un punto de esa curva. Y la gráfica es el
            MANDO: se pulsa una semana y todo lo demás pasa a hablar de ella.

            El mapa del proceso entero que iba al pie (`TimelineSpine`) se ha
            quitado: era una segunda curva del mismo peso debajo de la primera,
            y para el salto largo están las flechas del mando y las del teclado.
            El proceso entero, además, ya está dibujado en «Resumen».
          */}
          <Tarjeta
            rotulo="Cómo va"
            span={12}
            className="revision-hero"
            accion={
              <button type="button" className="cab-accion is-puerta" aria-haspopup="dialog" onClick={() => setVentana('cuerpo')}>
                Ver a fondo
              </button>
            }
          >
            <div className="revision-hero-say">
              <p className="revision-hero-cifra">
                {/* En español: «77,3» y no «77.267». */}
                <span className="v">
                  {resumen?.weight === null || resumen?.weight === undefined
                    ? '—'
                    : localeNumber(resumen.weight, { maximumFractionDigits: 1 })}
                </span>
                {resumen?.weight !== null && resumen?.weight !== undefined && (
                  <span className="u">kg</span>
                )}
                {resumen?.delta !== null && resumen?.delta !== undefined && (
                  <Delta value={resumen.delta} unit=" kg" lowerIsBetter />
                )}
                {/* El veredicto, EN la línea de la cifra que juzga, y calculado
                    igual que en la lista de clientes para que los dos sitios no
                    puedan discrepar de la misma persona. */}
                {veredicto && (
                  <span className={`badge ${TONO_BADGE[veredicto.tone] || ''}`}>
                    {veredicto.text}
                  </span>
                )}
              </p>
              <p className="revision-hero-meta">{contexto}</p>
            </div>

            {/*
              ══ EL SELECTOR DE SEMANA: pastillas, como en Entreno ══════════════
              Era una gráfica del peso con las calorías debajo cuyo eje se
              pulsaba. La gráfica es la del Resumen —se dibujaba dos veces en dos
              pestañas contiguas— y como mando obligaba a apuntar a una marca de
              cincuenta píxeles. Las pastillas son el mismo control con el que se
              cambia de semana en la hoja de Entreno, y dicen además cuáles ya
              están cerradas y cuál es la que la pasada está pidiendo.
            */}
            <div className="hoja-semanas revision-semanas" role="tablist" aria-label="Semanas" ref={refAncho}>
              {linea.map((fila) => (
                <button
                  key={fila.week}
                  type="button"
                  role="tab"
                  aria-selected={fila.week === semana}
                  /* `is-hecha` la ponía la tira gemela de Entreno
                     (`WorkoutLogEditor`) y aquí no, aunque las dos pintan la
                     misma pastilla y el CSS ya tenía el estado escrito. Con la
                     marca, una semana cerrada se reconoce por el color aunque no
                     lleve palabra. */
                  className={`hoja-semana${fila.week === semana ? ' is-on' : ''}${
                    fila.week === semanaDeLaCola ? ' is-curso' : fila.reviewed ? ' is-hecha' : ''
                  }`}
                  onClick={() => irA(fila.week)}
                >
                  <span className="hoja-semana-n">S{fila.week}</span>
                  {/* Solo habla la minoría (ver `marcaMinoria`): la que la pasada
                      pide, y después o las cerradas o las que no lo están, las
                      que sean menos. Repetir el mismo estado quince veces no
                      informa más que repetirlo catorce. */}
                  {fila.week === semanaDeLaCola ? (
                    <span className="hoja-semana-estado">pendiente</span>
                  ) : marcaMinoria === 'sin-cerrar' && !fila.reviewed && fila.week < semanaDeLaCola ? (
                    <span className="hoja-semana-estado">sin cerrar</span>
                  ) : marcaMinoria === 'cerrada' && fila.reviewed ? (
                    <span className="hoja-semana-estado">cerrada</span>
                  ) : null}
                </button>
              ))}
            </div>
          </Tarjeta>

          <BodyCard
            weeks={visibles}
            selected={semana}
            onSelect={irA}
            onPhoto={(s) => setVerFotos(Math.max(0, album.findIndex((f) => f.week === s.week)))}
            comparativa={comparativa}
            history={history}
            groups={porSemana}
            preguntas={preguntas}
            respuestas={respuestas}
            tendencia={tendencia}
            textos={textos}
            client={activeClient}
          />

          <TrainingCard
            dias={datos.days}
            porDia={porDia}
            semana={semana}
            microcycles={microcycles}
            sesiones={datos.sessions}
            client={activeClient}
          />
        </div>

        <aside className="revision-lado">
          <NutritionCard track={nutricion} selected={semana} client={activeClient} />
          <Anteriores
            rows={revisiones}
            onVerTodas={() => setVentana('historial')}
            onAbrir={(fila) => setVentana({ revision: fila.id })}
          />
        </aside>
      </div>

      {/* Todas sus fotos, a pantalla completa y pasando con el dedo. */}
      {verFotos !== null && album.length > 0 && (
        <Gallery
          items={album}
          index={verFotos}
          onIndex={setVerFotos}
          onClose={() => setVerFotos(null)}
        />
      )}

      {/*
        El archivo de las otras semanas, en una ventana grande —la misma que
        abre el bloque de Entreno y el cuerpo «a fondo» del Resumen—. En la
        página eran catorce filas a lo ancho debajo de la revisión, y el
        histórico se usa al revés: se busca UNA cosa y se vuelve.
      */}
      <Suspense fallback={null}>
        {ventana === 'cuerpo' && (
          <PanelCuerpo
            open
            onClose={() => setVentana(null)}
            serie={serie}
            track={track}
            checkIns={entregas}
            protocol={protocolo}
            history={history}
            pesoActual={pesoActual}
            trend={trend}
            goal={goal}
          />
        )}
      </Suspense>

      {ventana !== null && ventana !== 'cuerpo' && (
        <Modal
          size="lg"
          title={
            ventana === 'historial'
              ? 'Revisiones anteriores'
              : `Revisión de la semana del ${shortDate(revisiones.find((r) => r.id === ventana.revision)?.weekStart)}`
          }
          onClose={() => setVentana(null)}
        >
          <ReviewHistory
            plain
            client={activeClient}
            audience="coach"
            /* Una sola, desplegada, cuando se llega desde su fila; todas cuando
               se pide el archivo entero. */
            rows={ventana === 'historial' ? revisiones : revisiones.filter((r) => r.id === ventana.revision)}
            abierta={ventana === 'historial' ? null : ventana.revision}
            recargar={recargar}
          />
        </Modal>
      )}

      {/*
        Y la barra con la que se cierra. Va la ÚLTIMA del flujo a propósito: al
        ser el último hijo, se queda pegada al canto de abajo mientras se recorre
        la revisión y ATERRIZA en su sitio al llegar al final, en vez de flotar
        para siempre encima del último bloque. Ver `review/ReviewDecision.jsx`.
      */}
      <ReviewDecision
        client={activeClient}
        pendiente={pendiente}
        weekStart={pendiente?.weekStart || datos.weekStart}
        /*
          ══ Y la semana que la pasada pide se cierra AUNQUE no haya subido nada ══

          Esto era `pendiente || pesajes || fotos`, o sea «hay algo que mirar». Y
          entonces el cliente que no sube nada —que es justo el que más veces
          aparece en la pasada— entraba a una barra que decía «nada que cerrar» y
          se quedaba en la lista para siempre: la única salida era el recordatorio
          por WhatsApp, que no cierra nada.

          Que no haya subido nada no es un motivo para no poder contestarle: es
          LA respuesta de esa semana, y cerrarla deja constancia de que la miraste.
          El acuse ya dice lo que se guarda —«seguimos igual»— y el histórico lo
          registra igual que cualquier otra.
        */
        hayQueRevisar={
          Boolean(pendiente) ||
          Boolean(datos.checkIn?.count) ||
          datos.photos.length > 0 ||
          semana === semanaDeLaCola
        }
        cerrada={cerrada}
        base={base}
        cargandoBase={cargandoRevisiones}
        siguiente={siguiente}
        /* Los que quedarán en la pasada tras cerrar a este: si él está en la
           lista se descuenta; si entraste a una semana fuera de la cola, la
           pasada no cambia. */
        restantes={Math.max(0, pasada.length - (idxPasada >= 0 ? 1 : 0))}
        aviso={aviso}
        onClosed={recargar}
      />
    </div>
  );
};
