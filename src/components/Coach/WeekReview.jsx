import { Suspense, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react';

import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { kindMeta } from '@/domain/calendar';
import { metricColor } from '@/domain/metrics';
import { resolvedMicrocycles } from '@/domain/blocks';
import { buildWeeklySeries, metricPoints } from '@/domain/analytics';
import { currentCheckInPeriod, periodoQueEmpieza } from '@/domain/calendar';
import { groupByWeek, weekComparison } from '@/domain/photos';
import {
  checkinQuestions,
  clientProtocol,
  esRespuesta,
  esTexto,
  weighInsTarget,
} from '@/domain/protocol';
import { clientGoal } from '@/domain/goals';
import { readingHeadline, weeklyReading, weekSignals, weightTrend } from '@/domain/reading';
import { effectiveGoal, phaseAt, phaseProgress } from '@/domain/roadmap';
import {
  afterLastClose,
  answerTrend,
  pendingReviews,
  planSnapshot,
  reviewableWeeks,
} from '@/domain/reviews';
import { nutritionTrack, reviewTimeline, timelineSummary } from '@/domain/timeline';
import { clientWeek, exerciseHistory } from '@/domain/week';
import { addDays, daysBetween, localeNumber, shortDate, todayISO, weekStart } from '@/lib/dates';
import { modifierKey } from '@/lib/platform';
import { lazyRoute } from '@/lib/lazyRoute';
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
import { useReviewTrack } from '@/components/review/useReviewTrack';
import { BodyCard } from '@/components/review/BodyCard';
import { TrainingCard } from '@/components/review/TrainingCard';
import { NutritionCard } from '@/components/review/NutritionCard';
import { ReviewDecision } from '@/components/review/ReviewDecision';
import { fmt } from '@/lib/num';
import { clientPath, semanaPath, temporadaPath } from '@/routes';
import { Anteriores } from '@/components/review/Anteriores';
import { useReviewRows } from '@/components/review/useReviewRows';
import { useSemanasDeRevision } from '@/components/review/useSemanasDeRevision';
import { SemanaPorDias } from '@/components/review/SemanaPorDias';
import { ReviewHistory } from '@/components/ReviewHistory';
import { EntregaFueraDePlazo } from '@/components/review/EntregaFueraDePlazo';
import { comoLlego } from '@/domain/revisionesPasadas';
import { rangoAParam, rangoDeParam } from '@/domain/resumenDelRango';

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

/*
  La chapa de la semana, por el estado de su casilla (`estadosDeSemana`). La
  pendiente es la única en azul: es la que te toca. Las demás van en voz
  baja, sin semáforo: dicen en qué punto está la revisión, no si fue bien.
*/
const CHAPA = {
  revisada: 'Revisada',
  curso: 'En curso',
  sin: 'Sin check-in',
  futura: 'Planificada',
};

const kg1 = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const conSigno = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${kg1(Math.abs(v))}`;
const esLunesISO = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && weekStart(v) === v;

/**
 * Un cambio del plan, dicho en corto para la línea de «tras tu último cierre»:
 * «−150 kcal», «+2.000 pasos». Los que estrenan o pierden valor no tienen dos
 * cifras que restar y se dicen con su nombre; el sufijo es la unidad, y si el
 * campo no la tiene (los pasos), su propio nombre en voz baja.
 */
const cambioEnCorto = (c) => {
  const sufijo = c.unit && c.unit.trim() ? c.unit : ` ${c.label.toLowerCase()}`;
  if (c.from !== null && c.to !== null) {
    const d = c.to - c.from;
    return `${d > 0 ? '+' : '−'}${localeNumber(Math.abs(d))}${sufijo}`;
  }
  if (c.to === null) return `${c.label.toLowerCase()} fuera`;
  return `${c.label.toLowerCase()}: ${localeNumber(c.to)}${c.unit || ''}`;
};

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
  /* Con el plan del bloque ya puesto en cada semana; sin bloques migrados son
     los mismos objetos. Ver `resolvedMicrocycles`. */
  const microcycles = useMemo(
    () => resolvedMicrocycles(workoutData[activeClient?.id]),
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
    ══ LA SEMANA VIAJA EN LA URL, por su lunes (22 sep 2026) ═══════════════════

    Fue estado local a propósito —«es un sitio donde se está MIRANDO, no un
    sitio donde se está»— y el argumento se cayó con la portada de Revisiones:
    primero las semanas, después la revisión. Cada semana es ahora un sitio con
    su dirección (`/c/:id/semana/<lunes>`): se abre desde su casilla, se pasa
    con ‹ ›, «Revisar» en Inicio aterriza en la que espera y un enlace
    compartido abre la misma semana. Se nombra por su LUNES y no por su número
    porque las revisiones se guardan por (cliente, lunes) y el número depende
    de la fecha de alta: si la alta cambia, el enlace no se rompe.

    Cambiar de cliente ya no deja una semana rancia: `sameSectionFor` lleva a la
    portada del otro, cuyas semanas son otras.
  */
  const { lunes: lunesDeLaURL } = useParams();
  const lunes = esLunesISO(lunesDeLaURL) ? lunesDeLaURL : null;

  /* La ventana abierta: el histórico completo, o ninguna. */
  const [ventana, setVentana] = useState(null);

  /*
    El periodo de check-in vigente. Va delante de todo lo demás porque decide dos
    cosas: qué semanas se pueden abrir y en cuál se entra.
  */
  const periodo = useMemo(
    () => currentCheckInPeriod(activeClient?.preferences, activeClient?.startDate, todayISO()),
    [activeClient?.preferences, activeClient?.startDate]
  );

  /*
    ══ Las semanas que se pueden abrir, y no solo las que montaste ═══════════

    Salían de los microciclos, así que una semana sin rutina no existía para esta
    pantalla. El calendario de check-ins no espera a que la montes: avanza con la
    cadencia. Ver `reviewableWeeks` para el callejón sin salida que eso creaba.
  */
  /* Y las que tienen datos: los días que se pesó y las semanas que entregó. */
  const conDatos = useMemo(
    () => [...history.map((h) => h.date), ...entregas.map((c) => c.weekStart)].filter(Boolean),
    [history, entregas]
  );
  const semanas = useMemo(
    () =>
      reviewableWeeks({
        programmed: microcycles.map((m) => m.weekNumber),
        startDate: activeClient?.startDate,
        submitted: checkIns[activeClient?.id],
        period: periodo,
        active: conDatos,
      }),
    [microcycles, activeClient?.startDate, activeClient?.id, checkIns, periodo, conDatos]
  );

  /*
    ══ Semana de programa y semana natural ═══════════════════════════════════
    La revisión cuenta semanas de programa y el roadmap, lunes. Se casan por
    `weekStartOfProgramWeek`, que es con lo que se guarda cada revisión
    cerrada: la semana 15 es la del lunes que dice ahí.

    Qué semana se abre ya no lo decide esta pantalla (`weekToReview`): lo
    decide quien enlaza, con el lunes. Inicio y la cabecera del cliente llevan
    a la que espera respuesta (`row.review.weekStart`); la portada, a la
    casilla que se pulsa.
  */
  const semanaDe = (l) => {
    const inicio = weekStart(activeClient?.startDate);
    const dias = inicio && l ? daysBetween(inicio, l) : null;
    return dias === null ? null : Math.round(dias / 7) + 1;
  };
  const semana = lunes ? semanaDe(lunes) : null;

  /* Los pesajes que TÚ le pides. Sin número pedido, la semana no se califica por
     cuántos hizo: ver `weighInsTarget` en `domain/protocol`. */
  const pesajesPedidos = useMemo(
    () => weighInsTarget(clientProtocol(activeClient?.preferences)),
    [activeClient?.preferences]
  );

  const datos = useMemo(
    () =>
      clientWeek({
        microcycles,
        history,
        photos,
        startDate: activeClient?.startDate,
        weekNumber: semana,
        weighIns: pesajesPedidos,
      }),
    [microcycles, history, photos, activeClient?.startDate, semana, pesajesPedidos]
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
  /* Con la semana abierta dentro aunque no tenga datos: la URL puede abrir
     cualquiera, y su dieta y su «tras tu último cierre» se leen de esta línea. */
  const semanasDeLaLinea = useMemo(
    () => [...new Set([...semanas, semana].filter((w) => Number.isFinite(w) && w >= 1))].sort((a, b) => a - b),
    [semanas, semana]
  );
  const linea = useMemo(
    () =>
      reviewTimeline({
        weeks: semanasDeLaLinea,
        startDate: activeClient?.startDate,
        series: serie,
        reviews: revisiones,
        photoGroups: porSemana,
      }),
    [semanasDeLaLinea, serie, revisiones, porSemana, activeClient?.startDate]
  );

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

  /* Sus semanas con el estado de cada casilla: la MISMA cuenta que la
     portada, para que la semana sepa si es la que te toca. */
  const { plan: planDelRoadmap, estados } = useSemanasDeRevision({ revisiones, entregas });
  const fila = (lunes && estados?.porLunes.get(lunes)) || null;
  /* Mientras llega su historial no se sabe en qué punto está: sin estado, ni
     chapa ni barra. Si no, la semana que espera respuesta se anunciaba un
     instante como «Sin check-in». */
  const estado = cargandoRevisiones
    ? null
    : fila?.revision5 ?? (lunes && lunes > weekStart(todayISO()) ? 'futura' : 'sin');
  const filaPrevia = (lunes && planDelRoadmap?.semanas.find((s) => s.lunes === addDays(lunes, -7))) || null;
  /* Las semanas de al lado, dentro del plan: las flechas no llevan a una
     semana que la portada no enseña. */
  const primerLunes = estados?.semanas[0]?.lunes || null;
  const ultimoLunes = estados?.semanas[estados.semanas.length - 1]?.lunes || null;
  /* Llegando desde un rango de la línea de tiempo («Abrir revisiones de estas
     semanas»), las flechas recorren ese rango y nada más, y la vuelta lleva a
     él. Una semana de fuera del rango lo ignora. */
  const [params] = useSearchParams();
  const rangoPedido = rangoDeParam(params.get('rango'));
  const rango = rangoPedido && lunes && lunes >= rangoPedido.desde && lunes <= rangoPedido.hasta ? rangoPedido : null;
  const tope = (l) => !rango || (l >= rango.desde && l <= rango.hasta);
  const anterior = lunes && primerLunes && addDays(lunes, -7) >= primerLunes && tope(addDays(lunes, -7)) ? addDays(lunes, -7) : null;
  const posterior = lunes && ultimoLunes && addDays(lunes, 7) <= ultimoLunes && tope(addDays(lunes, 7)) ? addDays(lunes, 7) : null;
  const enElRango = rango
    ? { n: Math.round((daysBetween(rango.desde, lunes) ?? 0) / 7) + 1, de: Math.round(((daysBetween(rango.desde, rango.hasta) ?? 0) + 1) / 7) }
    : null;
  const protocolo = useMemo(() => clientProtocol(activeClient?.preferences), [activeClient?.preferences]);
  const pesoActual = metricPoints(serie, 'weight').slice(-1)[0]?.value ?? null;
  const trend = useMemo(() => weightTrend(serie), [serie]);
  const goal = useMemo(() => effectiveGoal(activeClient, phases, todayISO()), [activeClient, phases]);

  /*
    ══ EL DESTINO: hacia dónde va esta persona ═══════════════════════════════

    La cifra de esta semana estaba en el aire: «72,4 kg» viniendo de 80 y «72,4»
    camino de 70 son dos pantallas distintas, y la única que lo decía era la
    ficha, a dos clics de donde se decide. Con el peso objetivo puesto
    (`clientGoal`, opcional a propósito: sin él no se inventa ninguno), la
    cabecera dibuja el camino entero — empezó → hoy → objetivo — y deja escrita
    la nota de su meta si la hay.

    Es el objetivo GENERAL del cliente, no el de la fase: la fase juzga el
    ritmo de esta semana (el veredicto de arriba); esto dice dónde acaba el
    proceso. «Sin reproches» sigue: informa del destino, no juzga el paso.
  */
  const destino = useMemo(() => clientGoal(activeClient), [activeClient]);
  const primerPeso = useMemo(() => {
    const conFecha = history
      .filter((h) => h.date && Number.isFinite(Number(h.weight)))
      .sort((a, b) => a.date.localeCompare(b.date));
    return conFecha.length > 0 ? Number(conFecha[0].weight) : null;
  }, [history]);

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
        /* Y quién es: sin su ciclo no hay reparto que ponderar y la foto se
           queda en el primer día del plan. Ver `cycleFoto`. */
        client: activeClient,
      }),
    [nutrition, workoutData, activeClient]
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

  const navigate = useNavigate();

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
  /* Y si no le pides un número de pesajes, aquí no se califica ninguno: queda
     cuántos hay, que es lo que sostiene —o no— la cifra de al lado. */
  const fiabilidad = datos.checkIn?.count
    ? !datos.checkIn.asked
      ? `${datos.checkIn.count} ${datos.checkIn.count === 1 ? 'pesaje' : 'pesajes'} esta semana`
      : datos.checkIn.complete
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
    ══ La entrega de ESTA semana ═══════════════════════════════════════════════

    Era `checkIns[id]`, la ÚLTIMA de cada cliente, así que solo se podía
    contestar la más reciente y había que comparar su `weekStart` en cada uso
    para no pintar respuestas de otra semana. Ahora sale de la casilla
    (`estadosDeSemana`), que la busca en todas sus entregas por PERIODO: una
    entrega vieja sin contestar se abre y se cierra en su propia semana.
  */
  const entrega = fila?.entrega || null;
  const pendiente = estado === 'pendiente' && entrega?.submittedAt && !entrega.reviewedAt ? entrega : null;
  /* El lunes con el que se archiva: el del periodo, que con cadencia quincenal
     no es el de la semana abierta si es la segunda. */
  const lunesDelCierre = pendiente?.weekStart || fila?.periodo?.inicio || datos.weekStart;
  /* La revisión cerrada de esta semana, para leer lo que decidiste. */
  const revisionCerrada = useMemo(
    () =>
      estado === 'revisada' && fila
        ? revisiones.find(
            (r) => r.weekStart >= fila.periodo.inicio && r.weekStart < addDays(fila.periodo.inicio, fila.periodo.semanas * 7)
          ) || null
        : null,
    [estado, fila, revisiones]
  );

  /*
    ══ LO QUE LE ESTÁS CAMBIANDO: la BASE contra la que se mide ══════════════

    La foto del plan de su última revisión cerrada. El diff en sí lo calcula
    `ReviewDecision`, que es quien deja ajustar: el «280 → 240 g» es el acuse de
    recibo del control que acabas de tocar, y separarlo del control obligaría a
    dos componentes a saber lo mismo.
  */
  const base = revisiones[0]?.snapshot || null;

  /*
    Aquí vivía el aviso de «cierras la semana 12 y la pendiente es la 14»: se
    podía cerrar cualquier semana elegida a mano. Desde el 22 sep la barra de
    cierre solo sale en la semana PENDIENTE, que es la que pide la cola, así que
    lo que se cierra siempre saca al cliente de la pasada.
  */

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
        if (destino) { e.preventDefault(); navigate(semanaPath(destino.client.id, destino.checkIn?.weekStart)); }
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
    Lo que contestó al entregar ESTA semana: la entrega de su periodo, que ya
    viene buscada entre todas (`estadosDeSemana`). Sin entrega, nada.
  */
  const respuestas = entrega?.answers || {};

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
  const textos = useMemo(() => preguntas.filter(esTexto), [preguntas]);
  /* Y lo que contestó marcando: sí/no, las opciones y las zonas. Ni se compara
     —no es una cantidad— ni se cita —no son sus palabras—, así que es un tercer
     camino y no un caso raro de los otros dos. Ver `esRespuesta`. */
  const marcadas = useMemo(() => preguntas.filter(esRespuesta), [preguntas]);

  /*
    ══ LO QUE PASÓ CON TU ÚLTIMO CAMBIO, y LAS SEÑALES ═══════════════════════

    Las dos piezas que cierran el bucle, y ninguna receta nada (la doctrina está
    en `domain/reading.js`): `afterLastClose` junta el diff del último cierre
    —que `reviewHistory` ya calculaba— con la respuesta del peso desde entonces;
    `weekSignals` reúne hasta tres hechos que cualifican al veredicto — la
    racha contra el rumbo, la hoja sin entrenar, la escala que salta.
  */
  const tras = useMemo(() => afterLastClose({ rows: revisiones, timeline: linea }), [revisiones, linea]);
  const senales = useMemo(
    () => weekSignals({ goal, series: serie, tendencia, microcycles, semana }),
    [goal, serie, tendencia, microcycles, semana]
  );

  if (!activeClient) return null;

  /* Una dirección que no es un lunes se corrige a su lunes; una que no es
     fecha, a la portada. */
  if (!lunes) {
    const suyo = /^\d{4}-\d{2}-\d{2}$/.test(String(lunesDeLaURL || '')) ? weekStart(lunesDeLaURL) : null;
    return <Navigate to={semanaPath(activeClient.id, suyo)} replace />;
  }

  /* Las semanas de programa se cuentan desde el alta: sin ella no hay «semana
     11» que abrir. El vacío lleva el verbo que lo resuelve. */
  if (semana === null) {
    return (
      <div className="stack">
        <EmptyState
          icon={ClipboardCheck}
          title="Sus semanas se cuentan desde la fecha de alta"
          message="Ponle la fecha en la que empezó y aquí verás cada semana, lo que hizo y lo que te entregó."
          action={
            <Link className="btn btn-primary" to={clientPath(activeClient.id, 'ficha')}>
              Poner la fecha de alta
            </Link>
          }
        />
      </div>
    );
  }

  const color = metricColor('weight');
  const media = fila?.media ?? null;
  const esperado = fila?.esperado ?? null;
  const desvio = media !== null && esperado !== null ? media - esperado : null;
  const nPesajes = fila?.pesajes?.length || 0;
  const revisadaEl = revisionCerrada?.reviewedAt || entrega?.reviewedAt || null;
  /* Una entrega RECUPERADA —completada cuando su ventana ya se había cerrado—
     no se confunde con una a tiempo: la chapa lo dice. El detalle, en «La
     entrega». */
  const recuperada =
    pendiente &&
    comoLlego({
      entrega: pendiente,
      periodo: periodoQueEmpieza(activeClient.preferences, pendiente.weekStart),
      siguiente: periodoQueEmpieza(
        activeClient.preferences,
        addDays(pendiente.weekStart, (fila?.periodo?.semanas || 1) * 7)
      ),
    })?.tipo === 'recuperada';
  const chapa =
    estado === 'pendiente'
      ? pendiente
        ? recuperada
          ? 'Recuperada · espera tu respuesta'
          : 'Entregó · espera tu respuesta'
        : 'Sin subir · te toca revisarla'
      : estado === 'revisada' && revisadaEl
        ? `Revisada el ${shortDate(revisadaEl)}`
        : CHAPA[estado] || null;
  const irA = (l) => navigate(`${semanaPath(activeClient.id, l)}${rango ? `?rango=${rangoAParam(rango)}` : ''}`);
  const nombreDe = (l) => {
    const n = semanaDe(l);
    return n && n >= 1 ? `S${n}` : shortDate(l);
  };

  return (
    <div className="revision-pagina cascada">
      {/*
        La fila de mando, la misma que en Entreno y Dieta: qué semana es, en qué
        punto está su revisión (la chapa, que es la casilla dicha en palabras),
        de cuándo y contra qué fase. A la derecha, la vuelta a todas sus
        semanas y las flechas para pasar a la de al lado.
      */}
      <Mando
        titulo={`Semana ${semana}`}
        contexto={[`del ${shortDate(lunes)}`, bloque, enElRango && `${enElRango.n} de ${enElRango.de} del rango`]
          .filter(Boolean)
          .join(' · ')}
        acciones={
          <>
            {rango ? (
              <Link className="cab-accion" to={temporadaPath(activeClient.id, { desde: rango.desde, hasta: rango.hasta })}>
                Volver a la gráfica
              </Link>
            ) : (
              <>
                {/* Esta semana en la línea de tiempo, con su lectura en el
                    inspector (26 sep 2026). */}
                <Link className="cab-accion" to={temporadaPath(activeClient.id, { semana: lunes })}>
                  Ver en la temporada
                </Link>
                <Link className="cab-accion" to={semanaPath(activeClient.id)}>
                  Todas sus semanas
                </Link>
              </>
            )}
            <div className="revision-paso" role="group" aria-label="Cambiar de semana">
              <button
                type="button"
                className="btn btn-icon"
                aria-label={anterior ? `Semana ${nombreDe(anterior)}` : 'No hay semana anterior'}
                title={anterior ? nombreDe(anterior) : undefined}
                disabled={!anterior}
                onClick={() => irA(anterior)}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="btn btn-icon"
                aria-label={posterior ? `Semana ${nombreDe(posterior)}` : 'No hay semana posterior'}
                title={posterior ? nombreDe(posterior) : undefined}
                disabled={!posterior}
                onClick={() => irA(posterior)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </>
        }
      >
        {chapa && <span className={`badge${estado === 'pendiente' ? ' badge-info' : ''}`}>{chapa}</span>}
      </Mando>

      {/* La bandeja: quién más espera respuesta, con la persona abierta marcada.
          Es la lista de un correo, tumbada. Solo se pinta con dos o más. */}
      {pasada.length > 1 && (
        <nav className="bandeja" aria-label="Personas que esperan respuesta">
          <ul className="bandeja-lista">
            {pasada.map((p) => (
              <li key={p.client.id}>
                <Link
                  className={`bandeja-persona${p.client.id === activeClient.id ? ' is-abierta' : ''}`}
                  to={semanaPath(p.client.id, p.checkIn?.weekStart)}
                  aria-current={p.client.id === activeClient.id ? 'page' : undefined}
                >
                  <Avatar name={p.client.name} src={p.client.avatar} size="xs" />
                  {/* `\s+`, no `s+`: sin la barra se partía por la LETRA ese y
                      «Alex Vessel» salía como «Alex Ve» en la bandeja. */}
                  <span>{p.client.name.split(/\s+/)[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
          <span className="bandeja-teclas" aria-hidden="true">
            {/* La modificadora, según el sistema: `⌘` en Apple y `Ctrl` en el
                resto (`lib/platform.js`). */}
            <kbd className="kbd">J</kbd><kbd className="kbd">K</kbd> siguiente · <kbd className="kbd">R</kbd> responder · <kbd className="kbd">{modifierKey()} ↵</kbd> cerrar
          </span>
        </nav>
      )}

      {estado === 'futura' ? (
        /*
          ══ LA FUTURA: lo planificado para ella ══════════════════════════════
          Todavía no ha pasado nada, así que no hay peso, ni fotos, ni barra. Lo
          que sí hay es el plan: el peso que se espera, en qué semana de la fase
          y del bloque cae, y lo que tiene marcado. La pauta no se proyecta
          (`semanasDelPlan`): será la que tenga ese lunes.
        */
        <div className="revision">
          <div className="revision-trabajo">
            <Tarjeta rotulo="Planificado" span={12}>
              <dl className="semana-cifras">
                {esperado !== null && (
                  <div>
                    <dt>Esperado</dt>
                    <dd>
                      {kg1(esperado)}
                      <small> kg</small>
                    </dd>
                  </div>
                )}
                {fila?.fase && fila.semanaFase && (
                  <div>
                    <dt>{fila.fase.title}</dt>
                    <dd>
                      {fila.semanaFase}.ª{fila.totalFase && <small> de {fila.totalFase}</small>}
                    </dd>
                  </div>
                )}
                {fila?.bloque && (
                  <div>
                    <dt>{fila.bloque.nombre}</dt>
                    <dd>
                      {fila.bloque.semana}.ª<small> de {fila.bloque.total}</small>
                    </dd>
                  </div>
                )}
              </dl>
              <dl className="semana-filas">
                {(fila?.hechos || []).map((h) => (
                  <div key={h.id || `${h.kind}-${h.date}`}>
                    <dt>{kindMeta(h.kind).label}</dt>
                    <dd>{h.hasta && h.hasta !== h.date ? `${shortDate(h.date)} – ${shortDate(h.hasta)}` : shortDate(h.date)}</dd>
                  </div>
                ))}
                <div>
                  <dt>Pauta</dt>
                  <dd className="is-suave">La que tenga vigente ese lunes</dd>
                </div>
                {planDelRoadmap?.destino && (
                  <div>
                    <dt>{planDelRoadmap.destino.title}</dt>
                    <dd>{shortDate(planDelRoadmap.destino.date)}</dd>
                  </div>
                )}
              </dl>
            </Tarjeta>
          </div>
        </div>
      ) : (
        <div className="revision">
          <div className="revision-trabajo">
            {/* Cómo llegó, lo que llegó después y reabrirla. Solo cuando hay
                algo que decir: una entrega a tiempo no lo necesita. */}
            <EntregaFueraDePlazo
              lunes={lunes}
              entregas={entregas}
              history={history}
              photos={photos}
              recargar={recargar}
            />

            {/*
              ══ LA REVISADA se lee: lo que decidiste y lo que le dijiste ══════
              Es la fila de su histórico, desplegada: los cambios del plan
              contra la anterior y la nota o el vídeo que le llegó.
            */}
            {revisionCerrada && (
              <Tarjeta rotulo="Lo que decidiste" span={12}>
                <ReviewHistory
                  plain
                  client={activeClient}
                  audience="coach"
                  rows={[revisionCerrada]}
                  abierta={revisionCerrada.id}
                  recargar={recargar}
                />
              </Tarjeta>
            )}

            {/*
              ══ PESO CONTRA ESPERADO, y la semana por dentro ══════════════════
              La media, lo esperado y el desvío, y debajo los días de lunes a
              domingo (`SemanaPorDias`). Las medias semanales están en la
              portada; aquí se ve lo que forma la de esta semana.
            */}
            <Tarjeta
              rotulo="Peso contra esperado"
              span={12}
              className="revision-hero"
              accion={
                <button type="button" className="cab-accion is-puerta" aria-haspopup="dialog" onClick={() => setVentana('cuerpo')}>
                  Ver a fondo
                </button>
              }
            >
              <div className="revision-hero-say">
                <div className="row between wrap gap-3">
                  <dl className="semana-cifras">
                    <div>
                      <dt>{nPesajes ? `Media · ${nPesajes} ${nPesajes === 1 ? 'pesaje' : 'pesajes'}` : 'Media'}</dt>
                      <dd>
                        {media === null ? '—' : kg1(media)}
                        {media !== null && <small> kg</small>}
                      </dd>
                    </div>
                    {esperado !== null && (
                      <div>
                        <dt>Esperado</dt>
                        <dd>
                          {kg1(esperado)}
                          <small> kg</small>
                        </dd>
                      </div>
                    )}
                    {desvio !== null && (
                      <div>
                        <dt>Desvío</dt>
                        <dd>
                          {conSigno(desvio)}
                          <small> kg</small>
                        </dd>
                      </div>
                    )}
                  </dl>
                  {/* El veredicto es de HOY (se calcula igual que en la
                      cartera), así que solo va en la semana que se decide. */}
                  {veredicto && (estado === 'pendiente' || estado === 'curso') && (
                    <span className={`badge ${TONO_BADGE[veredicto.tone] || ''}`}>{veredicto.text}</span>
                  )}
                </div>

                {/* Sin check-in se dice en una línea, y lo que sí hay se enseña
                    igual: una semana sin entrega no es un hueco. */}
                {estado === 'sin' && <p className="semana-linea">No entregó el check-in esta semana.</p>}

                <SemanaPorDias
                  lunes={lunes}
                  pesajes={fila?.pesajes || []}
                  previos={filaPrevia?.pesajes || []}
                  nPrevia={semana > 1 ? semana - 1 : null}
                  media={media}
                  esperado={esperado}
                  color={color}
                />
                {contexto && <p className="revision-hero-meta">{contexto}</p>}

                {estado === 'pendiente' && (() => {
                  /* EL DESTINO, si está puesto: empezó → hoy → objetivo. Solo
                     con las tres cifras de verdad. */
                  const meta = destino?.targetWeightKg ?? null;
                  const actual = resumen?.weight ?? pesoActual;
                  if (meta === null || primerPeso === null || actual === null) return null;
                  const total = primerPeso - meta;
                  if (Math.abs(total) < 0.1) return null;
                  const pct = Math.max(0, Math.min(100, ((primerPeso - actual) / total) * 100));
                  return (
                    <div
                      className="revision-destino"
                      role="img"
                      aria-label={`Empezó en ${localeNumber(primerPeso, { maximumFractionDigits: 1 })} kg, hoy ${localeNumber(actual, { maximumFractionDigits: 1 })}, objetivo ${localeNumber(meta, { maximumFractionDigits: 1 })}`}
                    >
                      <div className="destino-via">
                        <span className="destino-lleno" style={{ width: `${pct}%` }} />
                        <span className="destino-hoy" style={{ left: `${pct}%` }} />
                      </div>
                      <div className="destino-cifras">
                        <span>
                          Empezó
                          <b>{localeNumber(primerPeso, { maximumFractionDigits: 1 })}</b>
                        </span>
                        <span className="es-hoy">
                          Hoy
                          <b>{localeNumber(actual, { maximumFractionDigits: 1 })}</b>
                        </span>
                        <span className="es-meta">
                          Objetivo
                          <b>{localeNumber(meta, { maximumFractionDigits: 1 })}</b>
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {estado === 'pendiente' && destino?.note && <p className="revision-meta-frase">«{destino.note}»</p>}

                {/* LO QUE PASÓ CON LO QUE CAMBIASTE: el diff de tu último cierre
                    y la respuesta del peso desde entonces, un hecho al lado del
                    otro. Se queda en la semana que se decide. */}
                {estado === 'pendiente' && tras && (
                  <p className="revision-tras">
                    Tras tu último cierre (
                    {[
                      ...tras.changes.map(cambioEnCorto),
                      tras.otherCount > 0
                        ? `${tras.otherCount} ${tras.otherCount === 1 ? 'cambio más' : 'cambios más'} en el plan`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    ):{' '}
                    {tras.delta === null ? (
                      'aún sin pesajes desde entonces'
                    ) : tras.delta === 0 ? (
                      'el peso no se ha movido desde entonces'
                    ) : (
                      <b>{`${tras.delta > 0 ? '+' : '−'}${localeNumber(Math.abs(tras.delta))} kg desde entonces`}</b>
                    )}
                    .
                  </p>
                )}

                {/* Las señales: hasta tres hechos que cualifican al veredicto.
                    Solo la racha lleva semáforo. */}
                {estado === 'pendiente' && senales.length > 0 && (
                  <p className="revision-senales">
                    {senales.map((s) => (
                      <span key={s.id} className={s.tone !== 'unknown' ? `is-${s.tone}` : undefined}>
                        {s.text}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </Tarjeta>

            <BodyCard
              selected={semana}
              comparativa={comparativa}
              history={history}
              groups={porSemana}
              preguntas={preguntas}
              respuestas={respuestas}
              tendencia={tendencia}
              textos={textos}
              marcadas={marcadas}
              phases={phases}
              client={activeClient}
            />

            <TrainingCard
              dias={datos.days}
              porDia={porDia}
              semana={semana}
              microcycles={microcycles}
              sesiones={datos.sessions}
              tonelaje={datos.tonnage}
              client={activeClient}
            />
          </div>

          <aside className="revision-lado">
            <NutritionCard track={nutricion} selected={semana} client={activeClient} />
            <Anteriores
              rows={revisiones}
              onVerTodas={() => setVentana('historial')}
              onAbrir={(r) => setVentana({ revision: r.id })}
            />
          </aside>
        </div>
      )}

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

      {/*
        El archivo de las otras semanas, en una ventana grande —la misma que
        abre el bloque de Entreno y el cuerpo «a fondo» del Resumen—.
      */}
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
            rows={ventana === 'historial' ? revisiones : revisiones.filter((r) => r.id === ventana.revision)}
            abierta={ventana === 'historial' ? null : ventana.revision}
            recargar={recargar}
          />
        </Modal>
      )}

      {/*
        ══ LA BARRA DE CIERRE, solo en la PENDIENTE ═════════════════════════════
        Cerrar, ajustar e igualar son la respuesta a la semana que te toca, así
        que solo salen en ella (22 sep 2026). La revisada se lee arriba; la
        futura y la de sin check-in no tienen nada que cerrar. Va la última del
        flujo: se pega al canto de abajo y aterriza en su sitio al final. Ver
        `review/ReviewDecision.jsx`.

        Una pendiente sin nada subido también se cierra: que no haya subido nada
        es la respuesta de esa semana, y cerrarla deja constancia de que la
        miraste.
      */}
      {estado === 'pendiente' && (
        <ReviewDecision
          client={activeClient}
          pendiente={pendiente}
          weekStart={lunesDelCierre}
          hayQueRevisar
          cerrada={null}
          base={base}
          cargandoBase={cargandoRevisiones}
          siguiente={siguiente}
          /* Los que quedarán en la pasada tras cerrar a este. */
          restantes={Math.max(0, pasada.length - (idxPasada >= 0 ? 1 : 0))}
          onClosed={recargar}
          semanaDelPlan={fila}
          revisiones={revisiones}
        />
      )}
    </div>
  );
};
