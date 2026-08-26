import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { buildWeeklySeries } from '@/domain/analytics';
import { currentCheckInPeriod } from '@/domain/calendar';
import { groupByWeek, weekComparison } from '@/domain/photos';
import { checkinQuestions, clientProtocol } from '@/domain/protocol';
import { readingHeadline, weeklyReading } from '@/domain/reading';
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
import { shortDate, todayISO } from '@/lib/dates';
import { useElementWidth } from '@/lib/useElementWidth';
import { Delta } from '@/components/ui/metrics';
/* Las tarjetas se declaran con la clase `card` y no con `Panel`: `Panel` monta
   además su propia cabecera de rótulo en versalita, y aquí cada bloque lleva un
   TÍTULO de verdad con su frase debajo — que es media corrección de esta
   pantalla. Usar `Panel` obligaría a pasarle un `title` vacío y a montar la
   cabecera por fuera igualmente. */
import { EmptyState, PageHead } from '@/components/ui/primitives';
import { Gallery } from '@/components/photos/Gallery';
import { TimelineSpine } from '@/components/review/TimelineSpine';
import { useTimelineWindow } from '@/components/review/useTimelineWindow';
import { ReviewChart } from '@/components/review/ReviewChart';
import { BodyCard } from '@/components/review/BodyCard';
import { TrainingCard } from '@/components/review/TrainingCard';
import { NutritionCard } from '@/components/review/NutritionCard';
import { ReviewDecision } from '@/components/review/ReviewDecision';
import { useReviewRows } from '@/components/review/useReviewRows';
import { ReviewHistory } from '@/components/ReviewHistory';

/**
 * LA REVISIÓN DE UN CLIENTE: cuatro tarjetas y una decisión.
 *
 * ══ La forma ════════════════════════════════════════════════════════════════
 *
 *     Revisión de Javier                                      [1 de 4]
 *     Semana 24 · del 17 ago · espera tu respuesta
 *
 *     ┌ CÓMO VA ────────────────────────────────────────────────────┐
 *     │  PESO MEDIO DE LA SEMANA          [en dirección contraria]  │
 *     │  81,5 kg  ↑1,4                                              │
 *     │  solo 1 de 3 pesajes · 2,5 kg más que en la S1 · 2 500 kcal  │
 *     │                                                             │
 *     │  PESO                                                       │
 *     │  84 ┼···········································___·······  │
 *     │  82 ┼·····╱‾‾╲______······················___╱···╲__●·····  │
 *     │  ├──────────────────────────────────────────────────────    │
 *     │  KCAL OBJETIVO                                              │
 *     │  2600 ┼▔▔▔▔╲______                                          │
 *     │  2200 ┼···········▔▔▔▔▔▔▔▔╲______________________________  │
 *     │    S15  S16  S17  S18  S19  S20  S21  S22  S23  [S24]       │
 *     │    Semana 24 · 81,5 kg · 2 300 kcal                         │
 *     └─────────────────────────────────────────────────────────────┘
 *     ┌ SU CUERPO ── qué te cuenta · cómo se ve · sus medidas ───────┐
 *     ┌ SU ENTRENO ── qué levantó, serie a serie ────────────────────┐
 *     ┌ SU PLAN ── con qué comía y cuánto andaba ────────────────────┐
 *     ═══ la barra con la que se cierra ════════════════════════════
 *
 * ══ 0 · Por qué son TARJETAS, y ésta fue la corrección grande ══════════════
 *
 * La pantalla se montó como «un documento»: ni una superficie, todo separado por
 * filetes de un píxel y rotulado con la misma versalita diminuta. El resultado
 * eran doce rótulos del mismo tamaño y del mismo gris —PESO MEDIO DE LA SEMANA,
 * ENTRENO, NUTRICIÓN, CUERPO, CALORÍAS, PROTEÍNA, HIDRATOS…— o sea una pantalla
 * SIN jerarquía: nada empieza, nada manda, y el ojo no tiene por dónde entrar.
 * El resto del producto usa tarjetas y ésta era la única que no.
 *
 * Ahora cada bloque es una tarjeta con su título de verdad y su frase, y el
 * orden es el de la lectura de una revisión: cómo va, qué te cuenta y cómo se
 * ve, qué levantó, y con qué plan lo hizo — que es justo el que estás a punto de
 * tocar en la barra de abajo.
 *
 * ── Y NO hay rejilla de dos columnas ───────────────────────────────────────
 * La hubo, con el entreno a la izquierda y la nutrición a la derecha. Son cuatro
 * días de ejercicios contra cinco cifras: la columna estrecha quedaba con un
 * palmo de blanco tan alto como toda la lista de al lado. A lo ancho, cada
 * bloque ocupa exactamente lo que tiene que decir — y las cinco cifras del plan,
 * en fila, se leen de un barrido.
 *
 * ══ 1 · UNA curva del peso, y con ejes ═════════════════════════════════════
 *
 * Había TRES dibujos de la misma serie en la misma pantalla: la espina, la banda
 * del peso de la gráfica y —dentro del pliegue de las fotos— la tira. Con un
 * cliente de treinta semanas la espina se defiende (una es el mapa y la otra la
 * ventana); con uno de tres semanas no hay ventana que recortar, así que salían
 * dos dibujos idénticos de tres puntos, uno encima del otro.
 *
 * Ahora hay una, dentro de la tarjeta de la cifra —porque la cifra ES la lectura
 * de un punto de esa curva—, con rejilla, números en el canal izquierdo, área
 * bajo la línea y una lectura en palabras de la semana elegida. Y el mapa del
 * proceso entero queda como PIE suyo, y solo cuando la ventana recorta de
 * verdad. Ver `ReviewChart` y `TimelineSpine`.
 *
 * ══ 2 · Los tres bloques SON LOS TRES DOMINIOS de una asesoría ═════════════
 *
 *   · **Cuerpo** — la báscula, la cinta, las fotos y lo que él te cuenta. Los
 *     cuatro instrumentos del mismo examen, y por eso van juntos: es lo que
 *     impide bajarle la comida a alguien que no mueve la báscula pero ha perdido
 *     cinco centímetros de cintura. Ver `BodyCard`.
 *   · **Entreno** — una tarjeta por ejercicio con LA RECTA de su carga, la cifra
 *     de la semana que señales con el dedo y sus series debajo. Fue una fila de
 *     cifras derivadas —un dibujito, «45 → 45» y una palabra— y luego una tabla
 *     de dos sesiones al lado; las dos contestaban media pregunta, porque en dos
 *     columnas la FORMA no se ve. Ver `TrainingCard` y `ExerciseCard`.
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

  /* Lo que pesa esta semana, lo que se ha movido y lo que lleva acumulado. Sale
     de la propia línea: con el peso de todas las semanas delante, «desde el
     inicio» es una resta y no una consulta. */
  const resumen = useMemo(() => timelineSummary(linea, semana), [linea, semana]);

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
  const { desde, hasta, visibles, elegir, vecina } = useTimelineWindow({
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
        : `${Math.abs(resumen.sinceStart)} kg ${
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
  const veredicto = useMemo(() => {
    if (!activeClient) return null;
    return readingHeadline(
      weeklyReading({
        client: activeClient,
        series: buildWeeklySeries({ microcycles: [], history, gender: activeClient.gender }),
        microcycles: [],
        history,
        today: todayISO(),
      }).filter((f) => f.id === 'rate')
    );
  }, [activeClient, history]);

  /*
    ══ LA PASADA ═════════════════════════════════════════════════════════════

    A quién más le debes una respuesta ahora mismo. Es lo que convierte revisar a
    cuatro personas en UNA tarea con final en vez de en cuatro visitas sueltas, y
    no necesita ningún estado guardado: la lista se calcula sobre lo que ya está
    en memoria y se encoge sola al cerrar cada una (ver `pendingReviews`).
  */
  const pasada = useMemo(() => pendingReviews({ clients, checkIns }), [clients, checkIns]);
  const posicion = pasada.findIndex((p) => p.client.id === activeClient?.id) + 1;
  const siguiente = pasada.find((p) => p.client.id !== activeClient?.id) || null;

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
        <PageHead
          title="Revisión"
          sub={`Todavía no le has montado ningún microciclo a ${activeClient.name}.`}
        />
        <EmptyState
          icon={ClipboardCheck}
          title="Aún no hay ninguna semana que cerrar"
          message="Móntale su primera semana en «Rutina» y aquí aparecerá lo que hace con ella, lo que entrega y el sitio para contestarle."
        />
      </div>
    );
  }

  return (
    <div className="stack">
      {/*
        El título dice lo que estás HACIENDO y el subtítulo de qué semana va —que
        es el dato, no la tarea—. Y las dos chapas de estado juntas: cómo va esta
        persona, y por dónde vas tú.
      */}
      <PageHead
        title="Revisión"
        remate={`de ${activeClient.name.split(' ')[0]}`}
        sub={[
          `Semana ${semana}`,
          datos.weekStart ? `del ${shortDate(datos.weekStart)}` : null,
          pendiente ? 'entregó y espera tu respuesta' : 'sin nada pendiente por tu parte',
        ]
          .filter(Boolean)
          .join(' · ')}
        /*
          Aquí va solo POR DÓNDE VAS TÚ. El veredicto de cómo va ÉL bajó a la
          tarjeta de la cifra: es un juicio sobre esa curva —«en dirección
          contraria: +0,45 kg/semana»— y estaba a ochocientos píxeles del número
          que juzga, en la esquina opuesta de la pantalla. Un veredicto lejos de
          su dato es una etiqueta suelta.
        */
        action={
          pasada.length > 1 && posicion > 0 ? (
            <span className="badge">
              {posicion} de {pasada.length}
            </span>
          ) : null
        }
      />

      {/*
        ══ CÓMO VA: la cifra y la gráfica, en la misma tarjeta ═══════════════

        Estaban en dos bloques a sangre separados por filetes, y con ellos la
        espina —una TERCERA curva del peso, con la misma serie que la gráfica de
        debajo—. Con un cliente de tres semanas eso eran dos dibujos idénticos de
        tres puntos, uno encima del otro, que es justo el defecto que la gráfica
        vino a arreglar.

        Ahora la cifra y su gráfica son una sola pieza —la cifra ES la lectura de
        un punto de esa curva— y el proceso entero queda como PIE de la gráfica,
        y solo cuando la ventana recorta algo de verdad. Ver `ReviewChart`.
      */}
      <section className="card revision-hero" aria-label="Cómo va">
        <header className="revision-hero-head">
          <div className="revision-hero-say">
            <span className="section-label">Peso medio de la semana</span>

            <p className="revision-hero-cifra">
              <span className="v">{resumen?.weight ?? '—'}</span>
              {resumen?.weight !== null && resumen?.weight !== undefined && (
                <span className="u">kg</span>
              )}
              {resumen?.delta !== null && resumen?.delta !== undefined && (
                <Delta value={resumen.delta} unit=" kg" lowerIsBetter />
              )}
            </p>

            <p className="revision-hero-meta">{contexto}</p>
          </div>

          {/* El veredicto, al lado de la cifra que juzga. Es la única línea que
              contesta la pregunta con la que se entra a revisar, y se calcula
              EXACTAMENTE igual que en la lista de clientes —mismo
              `weeklyReading`, mismo filtro— para que la ficha de alguien y la
              lista no puedan dar dos veredictos distintos de la misma persona. */}
          {veredicto && (
            <span className={`badge ${TONO_BADGE[veredicto.tone] || ''}`}>{veredicto.text}</span>
          )}
        </header>

        {/* El ancho se mide en este envoltorio y no en la tarjeta: la tarjeta
            lleva relleno, así que su medida es 44 px más ancha que el sitio donde
            de verdad cabe el dibujo — y el dibujo se salía por los dos cantos. */}
        <div className="revision-grafica" ref={refAncho}>
          <ReviewChart
            weeks={nutricion.slice(desde, hasta)}
            selected={semana}
            onSelect={irA}
            onStep={paso}
            ancho={ancho}
            /* El proceso entero, como pie y solo cuando la ventana recorta: es
               el salto largo —irse a la semana 5 de un cliente de seis meses sin
               pasar por las otras diecinueve— y con una ventana que las abarca
               todas no recorta nada, así que no se pinta. */
            mapa={
              hasta - desde < linea.length ? (
                <TimelineSpine
                  weeks={linea}
                  selected={semana}
                  onSelect={irA}
                  desde={desde}
                  hasta={hasta}
                />
              ) : null
            }
          />
        </div>
      </section>

      {/*
        ══ LA SEMANA ELEGIDA, bloque a bloque ════════════════════════════════

        Cuatro tarjetas a lo ancho y en el orden en que se lee una revisión: cómo
        va (arriba), qué te cuenta y cómo se ve, qué levantó, y con qué plan lo
        hizo — que es el que estás a punto de tocar en la barra de abajo.

        Estaban en una rejilla de dos columnas con el entreno a la izquierda y la
        nutrición a la derecha. Son cuatro días de ejercicios contra cinco cifras:
        la columna derecha quedaba con un palmo de blanco tan alto como toda la
        lista de al lado. Cada bloque a lo ancho ocupa lo que tiene que decir.

        Lo que sí se abre en diálogo es el registro completo de un ejercicio, que
        es consultar un archivo y volver. Ver `ExerciseSheet`.
      */}
      <div className="tablero">
        {/*
          El marcador de tramo: de aquí abajo, todo habla de la semana que está
          señalada en la gráfica. Hace falta porque esa semana SE CAMBIA —la
          gráfica es el mando— y sin él tres tarjetas seguidas no dicen de cuándo
          hablan; la cabecera de la pantalla nombra la que se abrió, no la que
          estás mirando ahora.

          Y es un rótulo de tramo con su filete, no una línea de texto pequeño:
          separa dos partes de la pantalla que responden a cosas distintas —lo
          que va arriba vale para todo el proceso, lo de abajo solo para esta
          semana—.
        */}
        <div className="tablero-head">
          <span className="section-label is-group">Lo que pasó en la semana {semana}</span>
          <span className="t-xs t-tertiary">
            {datos.weekStart ? `del ${shortDate(datos.weekStart)}` : ''}
          </span>
        </div>

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

        <NutritionCard track={nutricion} selected={semana} client={activeClient} />
      </div>

      {/* Y lo que se decidió las semanas anteriores. Va al final y conserva su
          superficie: no es un bloque de esta revisión, es el archivo de las
          otras. */}
      <ReviewHistory client={activeClient} audience="coach" rows={revisiones} recargar={recargar} />

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
        aviso={aviso}
        onClosed={recargar}
      />
    </div>
  );
};
