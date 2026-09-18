import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import {
  reverseChronological,
  weeklyCheckIn,
  weeklyWeightAverages,
} from '@/domain/anthropometry';
import { clientCycleSlots } from '@/domain/blocks';
import { periodoAEntregar } from '@/domain/calendar';
import { cycleFoto } from '@/domain/nutrition';
import { weekFromStart } from '@/domain/photos';
import { checkinQuestions, clientProtocol, weighInsTarget } from '@/domain/protocol';
import { shortDate, todayISO, weekStart } from '@/lib/dates';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { ReviewWizard } from '@/components/anthropometry/ReviewWizard';
import { useReviewRows } from '@/components/review/useReviewRows';
import { pasosDeLaEntrega } from './PasosDeLaEntrega';
import { useOculto } from './Oculto';
import { RevisionEnMonitor } from './RevisionEnMonitor';
import { PantallaRevision as RevisionEnTelefono } from './movil/PantallaRevision';

/**
 * «TU REVISIÓN»: el cuarto destino, y lo único que el cliente le DEBE a su
 * entrenador.
 *
 * ══ De dónde sale esta pantalla ════════════════════════════════════════════
 *
 * El ritual estuvo tres sitios en una semana. Fue una pestaña permanente
 * («Mi revisión»); se replegó dentro de «Tú» con el argumento de que una pestaña
 * apagada seis días de cada siete no se gana el sitio; y el 12 de septiembre el
 * dueño la devolvió a la barra mirando el prototipo (`D-10`).
 *
 * Lo que el argumento del repliegue no pesaba: **de las tres misiones del
 * cliente, esta es la única que le cuesta dinero a la otra persona si no la
 * hace**. Apuntar una serie se le olvida y no pasa nada; no entregar la semana
 * deja a su entrenador sin con qué trabajar. Ver `CLIENT_SECTIONS`.
 *
 * ══ Cómo está ordenada ═════════════════════════════════════════════════════
 *
 *   1. **Tu peso de hoy** — la casilla, con la cifra puesta y su verbo. Es lo
 *      que se hace a diario y lo único que no puede costar cuatro pantallas.
 *   2. **Lo que te falta para entregar** — los renglones con su verbo, y el
 *      botón de mandarla. El estado de la entrega, que se mira una vez a la
 *      semana.
 *   3. **Tus fotos de esta semana** — en grande, deslizables. Se suben dentro
 *      del asistente; aquí se ven, que es lo que dice si están.
 *   4. **Lo que te fue contestando** — el rastro, y la báscula.
 *
 * El orden es el del prototipo y lo decidió el dueño el 13 de septiembre: *«en
 * vez de ir pulsando y que vayan saliendo pantallas que te piden cosas… la
 * revisión debería ser sencilla de hacer»*. Lo diario, arriba y a la vista; el
 * asistente, solo para lo que de verdad es un formulario (las medidas y el
 * cuestionario).
 *
 * Entregada la semana, lo que queda es leer la respuesta de su entrenador, que
 * baja en `datos.respuesta` a las dos pantallas. La casilla del peso se queda:
 * pesarse es diario y no depende de la entrega (ver `datos.peso`).
 *
 * ── Y la báscula entera: depende del aparato ──────────────────────────────
 * Anotar los nueve perímetros y los seis pliegues es un formulario largo. En el
 * MONITOR va al pie de esta misma pantalla (`SemanasAnteriores`): hay sitio, y
 * el recorrido natural es apuntar, entregar y mirar atrás sin cambiar de sitio.
 * En el TELÉFONO sigue detrás de su fila, en `/mi/evolucion/medidas`, porque en
 * 390 px apilarla dejaría lo que hay que hacer perdido arriba de un scroll
 * largo. Ver `SemanasAnteriores`, que es la misma pieza en los dos.
 */
export const ClientRevisionRoute = () => {
  const {
    activeClient,
    anthropometry,
    nutrition,
    progressPhotos,
    checkIns,
    workoutData,
    addAnthropometryLog,
    uploadProgressPhoto,
    submitCheckIn,
    saveStatus,
    retrySave,
    ensurePhotoUrls,
  } = useApp();

  const location = useLocation();
  const navigate = useNavigate();
  const oculto = useOculto();
  /* El corte del chasis, el mismo con el que navega la barra del pulgar: por
     encima hay dos carriles, por debajo uno. */
  const enEscritorio = useMediaQuery('(min-width: 1024px)');

  /* Qué paso abre el asistente, o `null` con el asistente cerrado. Una sola
     variable y no un booleano más un paso: el estado real es «cerrado» o
     «abierto por X», y con dos banderas sueltas se puede escribir el imposible
     de estar cerrado por el paso de las fotos. */
  const [asistente, setAsistente] = useState(null);

  const { rows: revisiones, checkIns: historial } = useReviewRows(activeClient?.id);

  /*
    El lunes del periodo ABIERTO, no el de esta semana. Dos razones, y las dos
    acaban en la misma fila equivocada de `check_ins`, que tiene una por
    (cliente, semana):

      · Con cadencia quincenal el periodo empezó hace dos, así que entregar
        contra el lunes de hoy crearía una fila distinta de la que la cola del
        entrenador está mirando.
      · Y entregarse con dos días de retraso archivaba la revisión en la semana
        NUEVA, consumiéndola sin haberla vivido y dejando la vieja sin entregar.
        Una entrega y dos semanas contadas — ver `periodoAEntregar`.
  */
  const entrega = checkIns?.[activeClient?.id];
  const periodo = activeClient
    ? periodoAEntregar({
        preferences: activeClient.preferences,
        startDate: activeClient.startDate,
        entrega,
        today: todayISO(),
      })
    : null;
  const semana = periodo?.start || weekStart(todayISO());
  const semanasDelPeriodo = periodo?.everyWeeks || 1;

  const deEste = entrega?.weekStart >= semana ? entrega : null;
  const yaEntregada = Boolean(deEste?.submittedAt);

  /*
    ══ LO QUE CIERRA LA PANTALLA ES TU RESPUESTA, NO SU ENTREGA ══════════════

    Entregada la semana, el bloque de pasos desaparecía entero y no quedaba
    ningún verbo: quien se daba cuenta de que había subido la foto que no era, o
    de que se dejó el cuestionario a medias, no tenía por dónde arreglarlo.

    Ahora los pasos siguen puestos con el verbo cambiado —«Volver a entregar»—
    hasta que el entrenador la revisa. La base ya lo hacía bien: `submit_check_in`
    actualiza la misma fila sin tocar `submitted_at` ni la respuesta, así que
    rehacerla no reabre nada ni pierde nada (migración 0060).

    Revisada, ahí sí se acaba: reentregar contra una fila ya contestada no
    volvería a la cola del entrenador, o sea que sería mandar algo que nadie va a
    ver. Si subió algo mal y ya le contestaste, eso es una conversación.
  */
  const cerrada = Boolean(deEste?.reviewedAt);

  const photos = useMemo(
    () => progressPhotos.filter((p) => p.clientId === activeClient?.id),
    [progressPhotos, activeClient?.id]
  );

  /* Las fotos se cargan sin enlace firmado (ver `loadForUser`) y se firman en la
     pantalla que las va a enseñar. */
  useEffect(() => {
    if (activeClient?.id) ensurePhotoUrls(activeClient.id);
  }, [ensurePhotoUrls, activeClient?.id]);

  /*
    Quien llega PIDIENDO entregar la semana, la empieza. La intención viaja con la
    navegación (`state.abrirCheckIn`) desde los avisos y desde «Hoy», y se consume
    al llegar: si se quedara en el historial, volver atrás desde cualquier otra
    pantalla lo reabriría sin que nadie lo haya pedido.

    Solo si NO ha entregado todavía, y no `porEntregar`: rehacer una entrega se
    puede, pero es un gesto suyo —el botón «Volver a entregar»— y no algo que le
    pase por llegar aquí desde un enlace. Un asistente que se abre solo encima de
    algo ya mandado parece que se ha perdido lo anterior.
  */
  useEffect(() => {
    if (!location.state?.abrirCheckIn) return;
    navigate(location.pathname, { replace: true, state: null });
    if (!yaEntregada) setAsistente('peso');
  }, [location.state, location.pathname, navigate, yaEntregada]);

  /*
    LA FOTO DEL PLAN que se guarda con el pesaje. Hace falta el CICLO de esta
    persona para poder ponderar la media: con el plan crudo se guardaba
    `targetKcals`, que en un alto/bajo es siempre el alto y sin decirlo.
  */
  const fotoDelPlan = useMemo(
    () =>
      activeClient
        ? cycleFoto(
            nutrition[activeClient.id],
            clientCycleSlots(activeClient, workoutData?.[activeClient.id])
          )
        : null,
    [nutrition, workoutData, activeClient]
  );

  const history = useMemo(
    () => anthropometry?.[activeClient?.id]?.history || [],
    [anthropometry, activeClient?.id]
  );

  const protocol = useMemo(
    () => (activeClient ? clientProtocol(activeClient.preferences) : null),
    [activeClient]
  );

  if (!activeClient) return null;

  /* La semana de las FOTOS se cuenta desde su alta y no es la misma cifra que el
     lunes del periodo: una fecha para agrupar entregas, un ordinal para fechar
     fotos. Ver `domain/photos`. */
  const semanaFoto = weekFromStart(activeClient.startDate, todayISO());
  const hechas = new Set(
    photos
      .filter((p) => p.angle && (p.week ?? weekFromStart(activeClient.startDate, p.date)) === semanaFoto)
      .map((p) => p.angle)
  );

  /*
    Los pesajes DEL PERIODO QUE SE ENTREGA, no los de la semana de hoy. Miraba
    `todayISO()`, que es la ventana equivocada dos veces: con cadencia quincenal
    contaba una semana de las dos (el fallo que `ClientWeek` ya tenía escrito), y
    con la ventana de gracia abierta contaba los de esta semana para una entrega
    que va a la anterior. El asistente ya proponía la media buena —sale de
    `weekStart`—, así que el renglón y el asistente decían números distintos.
  */
  const resumen = weeklyCheckIn(history, semana, {
    target: weighInsTarget(protocol),
    weeks: semanasDelPeriodo,
  });

  const pasos = pasosDeLaEntrega({
    protocol,
    resumen,
    history,
    fotos: hechas,
    preguntas: checkinQuestions(protocol),
    respuestas: deEste?.answers ?? null,
    sinPeso: oculto.weight,
  });

  /* La última revisión con algo escrito. Es lo que se lee mientras se prepara la
     siguiente: «¿qué me dijo la vez pasada?». */
  const ultimaRespuesta = revisiones.find((r) => r.coachNotes);

  /*
    ══ AQUÍ VIVÍAN LA CURVA, «CÓMO PESARTE» Y LAS TRES PUERTAS ══════════════

    Un costado con la curva semana a semana, el consejo de la báscula y tres
    filas de archivo. Se han ido con el rediseño del 14 de septiembre, y no por
    espacio: el dueño dijo que en esta pantalla «no entiende el cliente que al
    final lo que ha de hacer es subir su revisión», y nueve cajas para un
    mandado que es uno son ocho de más.

    Lo que se fue no se ha perdido: la curva está entera en «Progreso», el
    consejo de la báscula bajó a una línea dentro de la propia casilla del peso
    —que es donde se duda— y las semanas anteriores viven detrás de su verbo,
    arriba a la derecha.
  */

  /* LO PRIMERO QUE FALTA, que es lo que titula la caja de la entrega. */
  const siguientePaso = pasos.find((paso) => !paso.hecho) || null;
  /* Cuántas semanas se quedaron sin entregar. Es la cuenta que el renglón del
     pie enseña, y sale del historial: una fila de `check_ins` sin `submittedAt`
     es una semana que se abrió y no se cerró. */
  const atrasadas = historial.filter((c) => !c.submittedAt && c.weekStart < semana).length;

  const datos = {
    periodo: [
      semanaFoto ? `Semana ${semanaFoto}` : null,
      `del ${shortDate(semana)}`,
    ]
      .filter(Boolean)
      .join(' · '),
    pasos,
    entrega: {
      /*
        EL TITULAR ES EL VERBO. «Revisión» es el nombre del sitio; lo que hay
        que hacer es entregar la semana, y eso es lo que va escrito en grande.
        Entregada, el titular dice lo que pasó y no lo que falta.
      */
      titular: cerrada ? 'Tu semana, revisada' : yaEntregada ? 'Semana entregada' : 'Entrega tu semana',
      /* Revisada no queda nada que hacer contra ella: el rótulo deja de
         reclamar y el verbo desaparece (ver «Revisada, ahí sí se acaba»). */
      rotulo: cerrada
        ? 'Tu entrega'
        : siguientePaso
          ? `Te ${siguientePaso.id === 'fotos' ? 'faltan' : 'falta'} ${siguientePaso.titulo.toLowerCase()}`
          : 'Lo tienes todo',
      verbo: cerrada ? null : yaEntregada ? 'Volver a entregar' : 'Entregar mi semana',
      cerrada,
      /*
        El monitor monta `PasosDeLaEntrega`, que escribe su propio verbo y su
        propio pie a partir de estos dos: entregada, el botón baja de tono y la
        frase pasa a contar la ventana de gracia. El teléfono se queda con
        `verbo` y `rotulo`, ya escritos, porque su lista es otra pieza.
      */
      yaEntregada,
      entregadaEl: deEste?.submittedAt || null,
      onEntregar: () => setAsistente(pasos[0]?.id || 'peso'),
      onPaso: (id) => setAsistente(id),
    },
    /*
      LA BÁSCULA NO DEPENDE DE LA ENTREGA. Iba atada a `porEntregar` y, con la
      semana ya revisada, desaparecía: quien se pesa a diario se quedaba de
      miércoles a domingo sin dónde apuntarlo, con un «hecho» por toda
      respuesta. El pesaje va al historial, no a la entrega, así que se apunta
      siempre; solo el peso oculto la quita.
    */
    peso:
      !oculto.weight
        ? {
            resumen,
            semana,
            ultimo: history.length > 0 ? reverseChronological(history)[0] : null,
            foto: fotoDelPlan,
            onApuntar: (log) => addAnthropometryLog(activeClient.id, log),
          }
        : null,
    /*
      LA MEDIA, que es lo que «el sistema va haciendo de cara a la revisión».
      Va aparte de `peso` a propósito: la báscula se retira al entregar —ya no
      hay nada que apuntar contra esa semana— y la media sigue siendo la cifra
      por la que se lee lo entregado. Con el peso oculto no existe ninguna de
      las dos. Ver `RevisionEnMonitor · TuMedia`.
    */
    media: oculto.weight
      ? null
      : {
          ahora: resumen.average,
          anterior: resumen.previousAverage,
          pesajes: (resumen.entries || []).length,
          pedidos: weighInsTarget(protocol),
          /* Las medias SEMANALES y no los pesajes sueltos, la misma decisión
             que ya tomó «Tú»: cuarenta puntos diarios son ruido con forma de
             dato. */
          puntos: weeklyWeightAverages(history).map((p) => p.value),
        },
    atrasadas,
    respuesta: ultimaRespuesta
      ? {
          texto: ultimaRespuesta.coachNotes,
          cuando: ultimaRespuesta.reviewedAt
            ? `Revisión del ${shortDate(ultimaRespuesta.reviewedAt)}`
            : null,
        }
      : null,
  };

  return (
    <>
      {enEscritorio ? (
        <RevisionEnMonitor datos={datos} />
      ) : (
        <RevisionEnTelefono datos={datos} />
      )}

      {asistente && (
        <ReviewWizard
          client={activeClient}
          history={history}
          nutritionFoto={fotoDelPlan}
          audience="client"
          save={saveStatus('anthro', activeClient.id)}
          onRetry={() => retrySave('anthro', activeClient.id)}
          onAdd={(log) => addAnthropometryLog(activeClient.id, log)}
          photos={photos}
          onUploadPhoto={uploadProgressPhoto}
          onSubmitWeek={(datos) => submitCheckIn(activeClient.id, datos)}
          weekStart={semana}
          weeks={semanasDelPeriodo}
          pasoInicial={asistente}
          onClose={() => setAsistente(null)}
        />
      )}
    </>
  );
};
