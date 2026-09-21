import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  MessageSquare,
  Ruler,
  Save,
  Scale,
} from 'lucide-react';

import {
  FOLDS_LABELS,
  PERIMETER_LABELS,
  buildAnthropometryLog,
  emptyFolds,
  emptyPerimeters,
  fatPercent,
  foldsSum,
  weeklyCheckIn,
} from '@/domain/anthropometry';
import { ANGLES, photoWeek, weekFromStart } from '@/domain/photos';
import {
  asksBlock,
  checkinQuestions,
  clientProtocol,
  hayRespuesta,
  medidasDeRevision,
  requiredBlocks,
  requiresBlock,
} from '@/domain/protocol';
import { compactMedidas, problemaDeMedida } from '@/domain/medidas';
import { todayISO } from '@/lib/dates';
import { enumeraEs } from '@/lib/texto';
import { toNum } from '@/lib/num';
import { Field, HUECO_CIFRA, Notice, SaveIndicator } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { CarrilDePasos } from '@/components/ui/Asistente';
import { MedirConGuia } from './MedirConGuia';
import { PhotoPicker } from '@/components/photos/PhotoPicker';
import { RejillaDeMedidas } from './RejillaDeMedidas';
import { AngulosDeLaSemana } from './AngulosDeLaSemana';
import { usePhotoBatch } from '@/components/photos/usePhotoBatch';
import { SessionFeedback } from '@/components/Coach/Workout/SessionFeedback';
import { useOculto } from '@/components/Client/Oculto';

/**
 * El asistente de revisión: la semana entregada, por pasos.
 *
 * ══ Por qué deja de ser un formulario de golpe ══════════════════════════════
 *
 * Lo que hay que hacer una vez por semana son tres cosas seguidas y de distinta
 * naturaleza: confirmar el peso, medirse si tu entrenador lo pide, y hacerte las
 * fotos. Enseñadas a la vez en un solo diálogo, eso eran veinte campos y dos
 * avisos delante de alguien que ha abierto la aplicación para subir sus fotos.
 *
 * Y había algo peor que la longitud: las fotos vivían detrás de un botón que
 * abría **otro diálogo encima de este**. Dos modales apilados atrapan el foco dos
 * veces y el `Escape` cierra el que no toca, así que la mitad importante de la
 * revisión estaba detrás de la interacción más frágil de la pantalla.
 *
 * Por pasos, cada pantalla hace UNA pregunta, se puede validar antes de avanzar
 * —no se llega al final para enterarse de que faltaba el peso— y las fotos son un
 * paso más en lugar de un diálogo dentro de otro.
 *
 * ══ Cuántos pasos hay lo decide el protocolo ═══════════════════════════════
 *
 * Ni tres fijos ni uno por tabla. Si el entrenador apagó los pliegues, el paso
 * de los pliegues NO EXISTE —no aparece vacío ni deshabilitado—, y si no hay
 * forma de subir fotos, tampoco el suyo. Un paso que no se puede rellenar es un
 * paso que solo sirve para hacer la tarea más larga.
 *
 * Es la misma regla que sostiene el resto del producto: lo que está apagado no
 * existe (ver `domain/protocol.js`).
 *
 * ══ Y el peso llega puesto ═════════════════════════════════════════════════
 *
 * Los pesajes que se anotan en el check-in ya dan el promedio de la semana, que
 * es la cifra buena porque filtra la variación diaria de agua. Tecleársela otra
 * vez para cerrar la revisión es copiar un número de una caja a otra de la misma
 * pantalla. Se propone, no se guarda: hasta que no se termina el asistente no se
 * escribe nada, y se puede sobrescribir —el cliente sabe si ese día se pesó en
 * condiciones raras y su criterio manda sobre la media—.
 */

/**
 * @param onSubmitWeek  Entrega la semana al terminar. Solo lo pasa el portal del
 *   CLIENTE: el entrenador usa este mismo asistente para anotar una medición
 *   suya, y eso no puede entregar la semana de nadie ni marcarla como algo que
 *   espera respuesta.
 * @param weekStart  El lunes del periodo que se está entregando. Necesario
 *   porque con cadencia quincenal no es el lunes de hoy.
 * @param weeks  Cuántas semanas naturales abarca ese periodo. Es la ventana con
 *   la que se promedian los pesajes para proponer el peso, y tiene que ser la
 *   misma con la que se entrega: si no, se propone el promedio de una ventana y
 *   se guarda el de otra.
 * @param ensayo  EL ENSAYO DEL ENTRENADOR: este mismo asistente montado desde el
 *   constructor del check-in, con un cliente de mentira hecho del lienzo que hay
 *   delante. Cambia dos cosas y ninguna más —lo dice el pie y terminar no
 *   escribe—, porque lo que se viene a ver es exactamente esto. Ver
 *   `Coach/Taller/VistaPreviaFormulario`.
 * @param soloMedidas  EL TELÉFONO DEL CLIENTE desde el 18 sep 2026: ahí la
 *   revisión es una lista de pasos que se guardan sueltos y se entrega con un
 *   botón aparte, así que este asistente solo toma las medidas —pliegues,
 *   perímetros, aparatos— y guarda sin entregar. Ver `ClientRevisionRoute`.
 * @param respuestasIniciales  Lo que ya estaba contestado: el borrador que el
 *   teléfono guarda en la fila de la semana (migración 0121). Sin esto el
 *   cuestionario del monitor empezaría en blanco encima de algo ya contestado.
 */
export const ReviewWizard = ({
  client,
  history,
  nutritionFoto,
  audience = 'client',
  save,
  onRetry,
  onAdd,
  photos = null,
  onUploadPhoto = null,
  onSetGender = null,
  onSubmitWeek = null,
  weekStart = null,
  weeks = 1,
  pasoInicial = null,
  ensayo = false,
  soloMedidas = false,
  respuestasIniciales = null,
  onClose,
}) => {
  const isClient = audience === 'client';

  const protocol = useMemo(() => clientProtocol(client.preferences), [client.preferences]);
  const pideFolds = asksBlock(protocol, 'folds');
  const pidePerimetros = asksBlock(protocol, 'perimeters');
  const obligatorios = useMemo(() => requiredBlocks(protocol), [protocol]);
  /* El paso de fotos existe si hay dónde subirlas Y su check-in las pide. Antes
     solo lo primero: el interruptor del formulario no gobernaba nada, así que
     apagarlas no las apagaba. Se apaga solo con un `false` explícito, de modo
     que quien no haya tocado nada las sigue teniendo. */
  const puedeSubirFotos = Boolean(photos && onUploadPhoto && protocol.askPhotos !== false);

  /*
    ══ El cuestionario, y solo cuando el entrenador lo ha montado ═════════════

    Es la mitad de la información con la que se decide un ajuste y no había forma
    de recogerla: la revisión entregaba peso, medidas y fotos —todo lo que se
    MIDE— y ni una palabra de si el cliente ha podido seguir el plan.

    Va de ÚLTIMO paso a propósito. El peso y las fotos son lo obligatorio y lo
    que cuesta hacer; las preguntas se contestan sentado y con la tarea ya
    prácticamente cerrada. Puestas al principio, alargan la parte que ya cuesta
    que se haga cada semana.

    Y solo se lo enseña al cliente: el entrenador que anota una medición no puede
    contestar por él cómo ha dormido.
  */
  const preguntas = useMemo(() => (isClient ? checkinQuestions(protocol) : []), [isClient, protocol]);

  /*
    ══ Y a quien tiene el peso oculto no se le pide ═══════════════════════════

    El primer paso de este asistente es una casilla de peso QUE VIENE PUESTA con
    el promedio de sus pesajes: la cifra más grande de la pantalla, en el sitio
    donde su entrenador ha decidido que no debe haber cifra. Así que el paso no
    se pinta, y la semana se cierra igual con ese mismo promedio —que la
    aplicación ya sabe— sin enseñárselo. Ver `Oculto.jsx` y `HIDDEN_INFO`.

    Si además no se le piden medidas, fotos ni cuestionario, queda un paso que
    solo confirma la entrega: un asistente sin ningún paso no tendría dónde
    pintar el botón de entregar.
  */
  const oculto = useOculto();
  const sinPeso = isClient && oculto.weight;

  /* Los pasos que de verdad tiene ESTE cliente. El peso salvo que esté oculto;
     los demás, solo si hay algo que rellenar en ellos. */
  /*
    ══ Y LAS MEDIDAS QUE EL ENTRENADOR HAYA PEDIDO ═══════════════════════════

    Un número con unidad tomado con un aparato —una glucosa en ayunas, una
    temperatura basal—, que hasta ahora no cabía en ninguna parte: el
    cuestionario las habría capado a enteros de 0 a 10 sin unidad.

    Tienen SU PASO, detrás del plicómetro y de la cinta: es el orden en que se
    hace y no es el mismo gesto —ni se toma con las manos ni sale de la lámina de
    medición—. Las de a diario no salen aquí — su
    sitio es la rejilla de la semana, que es donde se anota cada día. Ver
    `domain/medidas.js`.

    Lo que el protocolo apaga NO EXISTE: no aparece vacío ni deshabilitado.
  */
  const medidas = useMemo(() => medidasDeRevision(protocol), [protocol]);
  const medidasObligatorias = useMemo(
    () => medidas.filter((m) => requiresBlock(protocol, m.id)),
    [medidas, protocol]
  );

  /*
    ══ UN PASO POR TÉCNICA, y no uno llamado «Las medidas» ════════════════════

    Era uno solo con todo dentro: el aviso de la fórmula del % graso, la guía
    detrás de un enlace, seis pliegues, nueve perímetros y las medidas de
    aparato. Quince casillas idénticas en cinco columnas debajo de una lámina
    que explicaba seis sitios: los dos trozos no se conocían y la guía se leía
    como algo pegado encima del formulario.

    El pellizco y la cinta son dos gestos distintos, con dos aparatos distintos
    y dos láminas distintas, y se hacen uno después del otro. Son dos pasos. Y
    lo que se toma con un aparato —una glucosa, una tensión— es un tercero: ni
    se mide con las manos ni sale de la lámina.

    Partirlo además deja caer dos estados: los bloques opcionales ya no empiezan
    recogidos detrás de un «+ pliegues» —el paso ES el bloque, y el que no lo
    quiera rellenar pasa de largo— ni hay que elegir qué guía está abierta,
    porque cada paso tiene la suya. Ver `MedirConGuia`.
  */
  const pasos = useMemo(
    () => {
      const lista = [
        !sinPeso && { id: 'peso', titulo: 'El peso', icono: Scale },
        pideFolds && { id: 'pliegues', titulo: 'Los pliegues', icono: Ruler },
        pidePerimetros && { id: 'perimetros', titulo: 'Los perímetros', icono: Ruler },
        medidas.length > 0 && { id: 'aparatos', titulo: 'Los aparatos', icono: Ruler },
        puedeSubirFotos && { id: 'fotos', titulo: 'Las fotos', icono: Camera },
        preguntas.length > 0 && { id: 'cuestionario', titulo: 'Tu semana', icono: MessageSquare },
      ].filter(Boolean);
      const suyos = soloMedidas
        ? lista.filter((p) => ['pliegues', 'perimetros', 'aparatos'].includes(p.id))
        : lista;
      return suyos.length > 0 ? suyos : [{ id: 'entrega', titulo: 'Tu semana', icono: Check }];
    },
    [sinPeso, pideFolds, pidePerimetros, medidas.length, puedeSubirFotos, preguntas.length, soloMedidas]
  );

  /*
    ══ POR QUÉ PUEDE ABRIRSE POR UN PASO ══════════════════════════════════════

    «Lo que te falta para entregar» lleva un verbo por renglón: te falta la foto
    de espalda y pulsas «Subirla». Si el asistente abriera siempre por el peso,
    ese verbo mentiría — arreglar una cosa costaría pasar por las tres que ya
    estaban bien, que es exactamente lo que la lista vino a quitar.

    Es el estado INICIAL y no un control: se puede seguir avanzando y retrocediendo
    con los mandos de siempre. Un paso que este cliente no tiene —medidas, cuando
    su entrenador no se las pide— cae a 0 en vez de dejar el asistente en blanco.
    Ver `PasosDeLaEntrega`.
  */
  const [indice, setIndice] = useState(() => {
    /* «Tus medidas» sigue siendo UN renglón en la lista de lo que falta —lo que
       le falta al cliente es medirse, no visitar dos pantallas—, así que su
       verbo pide un paso que desde que esto se partió ya no existe con ese
       nombre. Cae en el primero de los tres que lo sustituyen en vez de
       devolverlo al peso. Ver `PasosDeLaEntrega`. */
    const alias =
      pasoInicial === 'medidas'
        ? ['pliegues', 'perimetros', 'aparatos'].find((id) => pasos.some((p) => p.id === id))
        : pasoInicial;
    const i = pasos.findIndex((p) => p.id === alias);
    return i >= 0 ? i : 0;
  });
  const paso = pasos[indice];
  const ultimo = indice === pasos.length - 1;

  const [date, setDate] = useState(todayISO);
  const [weight, setWeight] = useState('');
  const [folds, setFolds] = useState(emptyFolds);
  const [perimeters, setPerimeters] = useState(emptyPerimeters);
  /* Lo apuntado con aparato, por id de medida. Como los pliegues: texto mientras
     se escribe, número al guardar (ver `compactMedidas`). */
  const [valores, setValores] = useState({});
  const [answers, setAnswers] = useState(() => respuestasIniciales || {});
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  /* `touched` impide que el prellenado pise lo que se esté escribiendo: en
     cuanto se toca el campo, deja de proponerse. */
  const [touched, setTouched] = useState(false);

  /*
    ══ El promedio del PERIODO que se entrega, no el de la semana de hoy ══════

    Miraba `todayISO()` con la ventana de una semana natural, y eso es la ventana
    equivocada en dos casos:

      · Con cadencia quincenal el periodo empezó hace dos semanas. Quien se pesó
        solo en la primera abría el asistente con la casilla VACÍA, aunque
        tuviera tres pesajes registrados, y tenía que buscar el número a mano.
      · Al entregar una semana atrasada, el peso que se propone tiene que ser el
        de aquella semana y no el de esta.

    Es el mismo fallo que ya se corrigió en `ClientWeek` —donde el contador decía
    «3 de 3» mirando una ventana y el peso salía de otra— y que aquí seguía vivo.
    Ahora la ventana del prellenado es LA MISMA con la que se entrega.
  */
  const weekCheckIn = useMemo(
    () => weeklyCheckIn(history, weekStart || todayISO(), { weeks }),
    [history, weekStart, weeks]
  );
  const suggestedWeight = weekCheckIn.average;

  /* El peso que se registra y se entrega. Sin paso de peso es el promedio de sus
     propios pesajes —exactamente el que habría confirmado— y, si esa semana no
     se pesó, no hay ninguno: se entrega sin él, como una semana atrasada. */
  /* Con `soloMedidas` no se confirma ningún peso, pero el registro del día se
     guarda ENTERO (`addAnthropometryLog` sustituye la fila de la fecha): lleva
     el peso que ya hubiera apuntado ese día, o se lo borraría. */
  const pesoDelDia = history.find((h) => h.date === date)?.weight;
  const pesoEfectivo = soloMedidas
    ? pesoDelDia === null || pesoDelDia === undefined
      ? ''
      : String(pesoDelDia)
    : sinPeso
      ? suggestedWeight === null
        ? ''
        : String(suggestedWeight)
      : weight;

  /* Cómo se llama la ventana en la frase que explica de dónde sale el número.
     «de esta semana» sería mentira con cadencia quincenal, y «del periodo» es
     jerga cuando el periodo es una semana normal. */
  const ventana = weeks > 1 ? `estas ${weeks} semanas` : 'esta semana';

  useEffect(() => {
    if (touched || sinPeso) return;
    setWeight(suggestedWeight === null ? '' : String(suggestedWeight));
  }, [suggestedWeight, touched, sinPeso]);

  const lote = usePhotoBatch({ onUpload: onUploadPhoto || (async () => ({ ok: false })) });

  const semana = weekFromStart(client.startDate, todayISO());
  const yaSubidas = (photos || []).filter((p) => photoWeek(p, client.startDate) === semana);
  const cubiertos = new Set([
    ...yaSubidas.map((p) => p.angle),
    ...lote.items.map((i) => i.angle),
  ]);
  /* Lo elegido en el selector cuenta como cubierto aunque todavía no haya
     subido: quien acaba de marcar «esta es la lateral» no tiene que ver que le
     sigue faltando. Ver `AngulosDeLaSemana`. */

  const sum = foldsSum(folds);
  const pct = fatPercent(folds, client.gender);

  /** Los campos de un bloque que están sin rellenar, por su nombre visible. */
  const sinRellenar = (values, labels) =>
    Object.entries(labels)
      .filter(([key]) => toNum(values[key]) === null)
      .map(([, label]) => label);

  /**
   * ¿Se puede salir de este paso? Devuelve el problema o `null`.
   *
   * Validar AL AVANZAR y no al terminar es la mitad del valor de partir esto en
   * pasos: enterarse en la pantalla tres de que faltaba el peso de la uno
   * obliga a volver, y volver es donde se abandona.
   */
  const problemaDe = (id) => {
    if (id === 'peso') {
      if (toNum(weight) === null) return 'Hace falta el peso para cerrar la revisión.';
      if (!date) return 'Indica la fecha.';
      return null;
    }

    if (id === 'pliegues' || id === 'perimetros') {
      /*
        Un bloque obligatorio se pide ENTERO.

        No es rigidez: la suma de pliegues con cinco de seis no es un % graso más
        impreciso, es un número distinto que se pintaría en la misma serie que
        los completos y la estropearía sin avisar. Y comparar la cintura de esta
        semana con la cadera de la anterior no significa nada.

        El error dice QUÉ falta —no «rellena los pliegues»— porque con seis
        casillas idénticas encontrar la vacía a ojo es el trabajo que debería
        hacer la aplicación.
      */
      const esPliegues = id === 'pliegues';
      const bloque = obligatorios.find((b) => b.id === (esPliegues ? 'folds' : 'perimeters'));
      if (!bloque) return null;

      const faltan = sinRellenar(
        esPliegues ? folds : perimeters,
        esPliegues ? FOLDS_LABELS : PERIMETER_LABELS
      );
      if (faltan.length > 0) {
        return `${isClient ? 'Tu entrenador pide' : 'Este cliente tiene como obligatorio'} ${bloque.label.toLowerCase()} en cada revisión. Falta${faltan.length === 1 ? '' : 'n'}: ${faltan.join(', ')}.`;
      }
      return null;
    }

    if (id === 'aparatos') {
      /* Una medida obligatoria se pide entera, como un bloque: media serie de
         glucosas no es una serie menos precisa, es una serie con huecos. */
      for (const medida of medidasObligatorias) {
        if (toNum(valores[medida.id]) === null) {
          return `${isClient ? 'Tu entrenador pide' : 'Este cliente tiene como obligatorio'} ${medida.label.toLowerCase()} en cada revisión.`;
        }
      }

      /* Y el filtro de dedazos: un 950 de glucosa es un dedo de más, no una
         hipoglucemia. No juzga el valor — solo que quepa. Ver la ley de la casa
         en `domain/medidas.js`. */
      for (const medida of medidas) {
        const problema = problemaDeMedida(medida, valores[medida.id]);
        if (problema) return problema;
      }
      return null;
    }

    /* Ni las fotos ni el cuestionario bloquean. Alguien puede estar entregando la
       semana desde el vestuario y hacerse las fotos en casa; obligar aquí solo
       consigue que se cierre el asistente y no se registre ni el peso.

       Con las preguntas la razón es la misma y una más: una respuesta forzada
       para poder cerrar es una respuesta inventada, y ensucia una serie que
       después se lee como si significara algo. */
    return null;
  };

  const avanzar = () => {
    const problema = problemaDe(paso.id);
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setIndice((i) => i + 1);
  };

  const retroceder = () => {
    setError(null);
    setIndice((i) => Math.max(0, i - 1));
  };

  /**
   * Terminar: se guarda el registro, DESPUÉS se suben las fotos y por último se
   * entrega la semana.
   *
   * ══ Ese orden no es casual ═════════════════════════════════════════════════
   *
   * El registro es lo obligatorio y es instantáneo —va por la cola de guardado
   * optimista—; las fotos pueden tardar y pueden fallar. Al revés, una subida
   * que falla dejaría sin guardar un peso que ya estaba escrito, que es la peor
   * forma de perder el trabajo de alguien.
   *
   * Y la entrega va la ÚLTIMA porque es lo que avisa al entrenador: entregar
   * antes de que las fotos estén arriba le pondría en la cola una revisión que
   * al abrirla no tiene fotos.
   *
   * ══ Terminar el asistente ES entregar la semana ════════════════════════════
   *
   * Antes eran dos gestos separados: este asistente guardaba el registro, y
   * «entregar» era otro botón en otra tarjeta de la misma pantalla. O sea que un
   * cliente podía confirmar su peso, medirse y subir sus fotos —todo lo que
   * él entiende por «mandar mi semana»— y no enterarse de que aún le faltaba
   * pulsar algo. Al entrenador no le llegaba nada, y la semana quedaba en la
   * cola como «sin subir» con todos los datos dentro.
   *
   * Un fallo aquí NO deshace lo anterior, y se dice: el peso y las fotos están a
   * salvo, lo único que no ha ocurrido es el aviso.
   */
  const terminar = async () => {
    /* En el ensayo no hay nada que terminar: no hay registro, no hay fotos que
       subir y no hay semana de nadie que entregar. Se cierra, y el pie ya venía
       diciendo que esto no se guarda. Validar tampoco: el entrenador está
       mirando su formulario, no entregando su revisión. */
    if (ensayo) {
      onClose();
      return;
    }

    for (const p of pasos) {
      const problema = problemaDe(p.id);
      if (problema) {
        setIndice(pasos.indexOf(p));
        setError(problema);
        return;
      }
    }

    setGuardando(true);
    setError(null);

    /*
      El registro, salvo que no haya nada que registrar.

      Puede pasar desde que el peso se puede ocultar: sin ese paso, sin medidas y
      sin pesajes que promediar, esto escribiría una fila con la fecha de hoy y
      nada dentro — una medición vacía en su historial y un punto muerto en cada
      serie. Entregar la semana sí sigue pasando: son dos cosas distintas.
    */
    const registro = buildAnthropometryLog({
      date,
      weight: pesoEfectivo,
      folds,
      perimeters,
      /* Ya redondeadas a los decimales de cada una, y sin las que no se
         rellenaron: `null` es «no medido» y no cero. */
      medidas: compactMedidas(medidas, valores),
      /* Foto de las kcal y macros vigentes, para poder cruzar después dieta con
         evolución de peso: la tabla de nutrición no guarda histórico. Llega
         HECHA (`cycleFoto`): en un ciclado, la cifra que significa algo es la
         media del ciclo, y para ponderarla hacen falta sus casillas — que las
         sabe la pantalla, no este asistente. */
      nutritionFoto,
    });
    if (registro.weight !== null || registro.skinFolds || registro.perimeters || registro.medidas) {
      onAdd(registro);
    }

    if (lote.pendientes > 0) {
      const total = lote.pendientes;
      const { fallidas } = await lote.upload({
        clientId: client.id,
        week: semana ?? 1,
        notes: '',
      });
      if (fallidas > 0) {
        setGuardando(false);
        setError(
          `Tu peso y tus medidas están guardados, pero ${fallidas} de ${total} fotos no subieron. Puedes reintentarlo sin perder nada.`
        );
        return;
      }
    }

    if (onSubmitWeek) {
      /* Solo las contestadas. Mandar las vacías guardaría una cadena en blanco
         por pregunta, y al leerlas «no contestó» y «contestó vacío» se
         parecerían demasiado.

         Por `hayRespuesta` y no por `String(v).trim()`: desde que una respuesta
         puede ser una LISTA —las zonas, elegir varias—, marcar una zona y
         quitarla dejaba un array vacío que se guardaba como «[]». */
      const dadas = Object.fromEntries(
        Object.entries(answers).filter(([, v]) => hayRespuesta(v))
      );

      const res = await onSubmitWeek({
        weekStart,
        weight: toNum(pesoEfectivo),
        answers: Object.keys(dadas).length > 0 ? dadas : null,
      });

      if (res && res.ok === false) {
        setGuardando(false);
        setError(
          `Tus datos están guardados, pero la semana no llegó a entregarse: ${res.error}. Vuelve a intentarlo.`
        );
        return;
      }
    }

    setGuardando(false);
    onClose();
  };

  return (
    <Modal
      title={
        soloMedidas
          ? 'Tus medidas'
          : isClient
            ? 'Mi revisión de la semana'
            : `Nueva revisión de ${client.name}`
      }
      size="lg"
      onClose={onClose}
      footer={
        <>
          {/* Lo que el ensayo tiene que decir, y en el único sitio donde no se
              puede leer tarde: al lado del botón que parece entregar. */}
          {ensayo && (
            <span className="wiz-ensayo">
              Es un ensayo: lo que contestes aquí no se guarda en ningún sitio.
            </span>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={indice === 0 ? onClose : retroceder}
            disabled={guardando || lote.busy}
          >
            {indice === 0 ? (
              'Cancelar'
            ) : (
              <>
                <ArrowLeft size={15} /> Atrás
              </>
            )}
          </button>

          {ultimo ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={terminar}
              disabled={guardando || lote.busy}
            >
              <Save size={15} />
              {/* «Entregar» y no «guardar» cuando de verdad se entrega: son dos
                  cosas distintas y el cliente tiene que saber cuál está a punto
                  de hacer. Guardar es para él; entregar te avisa a ti. */}
              {/* En el ensayo, el verbo del CLIENTE aunque aquí no entregue
                  nada: enseñarle al entrenador «Terminar y guardar» sería
                  enseñarle un botón que su cliente no tiene. */}
              {guardando || lote.busy
                ? 'Enviando…'
                : onSubmitWeek || ensayo
                  ? 'Terminar y entregar'
                  : soloMedidas
                    ? 'Guardar mis medidas'
                    : 'Terminar y guardar'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={avanzar}>
              Siguiente <ArrowRight size={15} />
            </button>
          )}
        </>
      }
    >
      <div className="wiz">
        {/*
          El carril de pasos (`ui/Asistente`). No es decoración: dice cuántos
          quedan, que es lo único que hace tolerable un formulario partido. Sin
          él, «Siguiente» es una puerta a un número desconocido de pantallas.
        */}
        <CarrilDePasos pasos={pasos} indice={indice} />

        {error && <Notice tone="error">{error}</Notice>}

        {/* La `key` remonta el panel al cambiar de paso, así que la animación de
            entrada se reproduce y el desplazamiento del diálogo vuelve arriba. */}
        <div className="wiz-panel" key={paso.id}>
          {/* El único paso de quien no tiene peso, ni medidas, ni fotos, ni
              cuestionario: decir qué va a pasar al pulsar «entregar». */}
          {paso.id === 'entrega' && (
            <p className="t-sm t-secondary">
              Al entregar, tu semana le llega a tu entrenador con lo que hayas registrado. Te
              contesta por aquí.
            </p>
          )}

          {paso.id === 'peso' && (
            <>
              <p className="t-sm t-secondary">
                {isClient
                  ? suggestedWeight !== null
                    ? 'Confirma con qué peso cierras la semana. Viene puesto con el promedio de tus pesajes, que es la cifra que filtra el agua del día a día.'
                    : 'Confirma con qué peso cierras la semana.'
                  : 'El peso es el único dato obligatorio de una revisión.'}
              </p>

              {/*
                ══ LA PLACA, y por qué tiene ANCHURA PROPIA ══════════════════

                Esto eran dos campos con `grow` repartidos a mitades: la casilla
                del peso medía media anchura del diálogo —más de 400 px— con un
                número de 30 px flotando en el centro. Un dato de cuatro
                caracteres pintado en una caja de cuarenta no se lee como un
                dato: se lee como un campo estirado.

                Una cifra se escribe en una caja del tamaño de la cifra. La
                placa mide lo que mide un peso (`5ch` en cifras tabulares: hasta
                «105,5») y lleva el «kg» PEGADO, dentro del mismo recuadro, en
                vez de en el rótulo —la unidad es parte de lo que se está
                escribiendo, no una aclaración de arriba—. Es la misma ley que
                `input-suffix` aplica en el resto de la casa, aquí en la voz de
                las cifras y con el foco viviendo en el recuadro entero.

                Y la FECHA baja a su sitio. No es lo que se viene a confirmar
                —viene puesta en hoy y casi nadie la toca—, así que deja de
                pesar lo mismo que el peso y de ir la primera.

                ══ Y LAS DOS SON LA MISMA PLACA ═════════════════════════════

                Dos días con la placa al lado de un `.input` corriente: 52 px de
                alto contra 40, con sus dos rótulos a distinta altura pidiendo
                las dos mitades del mismo dato. La jerarquía la pone la LETRA
                —30 px la cifra, 16 la fecha, y la fecha además en voz
                secundaria—, no el tamaño de la caja. Ver `.placa`.
              */}
              <div className="row-end wrap gap-4">
                <Field label="Peso">
                  {(props) => (
                    <span className="placa placa-peso">
                      <input
                        {...props}
                        type="text"
                        inputMode="decimal"
                        /*
                          El ejemplo era «81.5», que es un peso perfectamente
                          creíble escrito en gris y en grande. Con la casilla
                          vacía —cuando no hay pesajes que promediar— no había
                          forma de distinguir a simple vista si eso era lo que se
                          iba a guardar o un hueco por rellenar. Un marcador de
                          posición no puede parecerse al dato.

                          Y el hueco es la RAYA DE CIFRA, no el guion largo que
                          vino después: la casilla va alineada a la derecha y el
                          guion largo mide casi dos dígitos, así que el hueco se
                          pintaba a quince píxeles de donde luego cae el número.
                          El porqué medido, en `HUECO_CIFRA`.
                        */
                        placeholder={HUECO_CIFRA}
                        value={weight}
                        onChange={(e) => {
                          setTouched(true);
                          setWeight(e.target.value);
                        }}
                        required
                      />
                      <span className="placa-u" aria-hidden="true">
                        kg
                      </span>
                    </span>
                  )}
                </Field>

                <Field label="Fecha" className="campo-fecha">
                  {(props) => (
                    <span className="placa placa-fecha">
                      <input
                        {...props}
                        type="date"
                        value={date}
                        max={todayISO()}
                        onChange={(e) => setDate(e.target.value)}
                        required
                      />
                    </span>
                  )}
                </Field>
              </div>

              {/* De dónde sale el número. Desaparece en cuanto se escribe encima,
                  porque entonces ya no describe lo que hay. */}
              {suggestedWeight !== null && !touched && (
                <p className="t-xs t-tertiary">
                  Propuesto: <strong>{suggestedWeight} kg</strong>, el promedio de{' '}
                  {weekCheckIn.count === 1 ? 'tu pesaje' : `tus ${weekCheckIn.count} pesajes`} de{' '}
                  {ventana}. Escribe encima si quieres registrar otro valor.
                </p>
              )}
              {suggestedWeight === null && (
                <p className="t-xs t-tertiary">
                  {isClient
                    ? `No has anotado ningún pesaje ${
                        weeks > 1 ? 'en este periodo' : 'esta semana'
                      }, así que no hay promedio que proponerte. Escríbelo a mano.`
                    : `Sin pesajes ${weeks > 1 ? 'en el periodo' : 'esta semana'}: no hay promedio que proponer.`}
                </p>
              )}
            </>
          )}

          {paso.id === 'pliegues' && (
            <>
              <p className="t-sm t-secondary">
                {requiresBlock(protocol, 'folds')
                  ? 'Esto sí hace falta para cerrar la revisión.'
                  : 'Opcional. Si esta semana no te los has tomado, pasa al siguiente paso.'}
              </p>

              {/*
                ── El sexo, DONDE se nota que falta ──────────────────────────
                La fórmula de pliegues es distinta para hombre y mujer, y sin
                definir se aplica **la de hombre en silencio**: el porcentaje
                sale, parece bueno y puede estar cuatro puntos desviado. Por eso
                el aviso cambia de tono cuando falta, y se arregla aquí mismo.

                Y vive en ESTE paso y no en el de los perímetros, que es el otro
                sitio donde podía caer: la fórmula solo afecta a los pliegues.
              */}
              {client.gender ? (
                <Notice tone="info">
                  Fórmula de 6 pliegues ·{' '}
                  {client.gender === 'Mujer'
                    ? '% graso = 3,5803 + (Σ mm × 0,1548)'
                    : '% graso = 2,59 + (Σ mm × 0,1051)'}{' '}
                  · sexo registrado: {client.gender}
                </Notice>
              ) : (
                <Notice
                  tone="warn"
                  action={
                    onSetGender ? (
                      <span className="row gap-2 shrink-0">
                        {['Hombre', 'Mujer'].map((sexo) => (
                          <button
                            key={sexo}
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => onSetGender(sexo)}
                          >
                            {sexo}
                          </button>
                        ))}
                      </span>
                    ) : null
                  }
                >
                  Falta el sexo de {client.name}, y la fórmula de pliegues es distinta para hombre y
                  mujer.{' '}
                  {onSetGender
                    ? 'Mientras no se defina se aplica la de hombre, así que el % graso puede estar desviado.'
                    : 'Pídeselo a tu entrenador: mientras tanto el % graso puede estar desviado.'}
                </Notice>
              )}

              <MedirConGuia
                que="pliegue"
                labels={FOLDS_LABELS}
                values={folds}
                unit="milímetros"
                unidad="mm"
                onChange={(k, v) => setFolds((f) => ({ ...f, [k]: v }))}
              />

              {sum > 0 && (
                <div className="row between wrap gap-3 folds-sum">
                  <span className="t-sm folds-sum-k">Suma: {sum} mm</span>
                  <strong className="folds-sum-v">% graso: {pct ?? '—'}%</strong>
                </div>
              )}
            </>
          )}

          {paso.id === 'perimetros' && (
            <>
              <p className="t-sm t-secondary">
                {requiresBlock(protocol, 'perimeters')
                  ? 'Esto sí hace falta para cerrar la revisión.'
                  : 'Opcional. Si esta semana no te has medido, pasa al siguiente paso.'}
              </p>

              <MedirConGuia
                que="cinta"
                labels={PERIMETER_LABELS}
                values={perimeters}
                unit="centímetros"
                unidad="cm"
                onChange={(k, v) => setPerimeters((p) => ({ ...p, [k]: v }))}
              />
            </>
          )}

          {/*
            ══ Y lo que se toma con un aparato ═══════════════════════════════

            Su propio paso, detrás de la cinta y del plicómetro, porque es el
            orden en que se hace y porque son las que menos gente tiene
            encendidas. Agrupadas por su rótulo cuando lo llevan —la sistólica y
            la diastólica son dos series y una sola toma—.

            Cada una dice SU unidad al lado del campo, que es lo que una pregunta
            de escala no podía hacer y toda la razón de que esto exista. Lo que no
            dice es si el número está bien: ver la ley en `domain/medidas.js`.

            La rejilla está extraída (`RejillaDeMedidas`) porque su entrenador la
            ensaya antes de encenderle una: dos copias de este formulario
            divergirían, y la vieja sería la que él mira.
          */}
          {paso.id === 'aparatos' && (
            <>
              <p className="t-sm t-secondary">
                {medidasObligatorias.length > 0
                  ? 'Lo que tomas con un aparato. Lo marcado hace falta para cerrar la revisión.'
                  : 'Lo que tomas con un aparato. Apunta lo que tengas; lo que no, se queda en blanco.'}
              </p>

              <RejillaDeMedidas
                titulo={null}
                medidas={medidas.map((m) => ({ ...m, obligatoria: requiresBlock(protocol, m.id) }))}
                valores={valores}
                onChange={(id, texto) => setValores((v) => ({ ...v, [id]: texto }))}
              />
            </>
          )}

          {paso.id === 'fotos' && (
            <>
              <p className="t-sm t-secondary">
                {semana === null
                  ? 'Se guardarán en la semana 1: este cliente no tiene fecha de inicio.'
                  : `Se guardarán en la semana ${semana}. ${enumeraEs(ANGLES.map((a) => a.label))}: puedes elegirlas todas de una vez y decir cuál es cuál.`}
              </p>

              {/*
                Los ángulos, con la de la semana pasada debajo del que falta.
                Sustituye a dos recuadros de aviso y a la frase de «hazlas
                siempre igual», que era el consejo más importante del paso y el
                único que iba en gris. Ver `AngulosDeLaSemana` y `M-12`.
              */}
              <AngulosDeLaSemana
                photos={photos}
                semana={semana}
                startDate={client.startDate}
                yaEstan={cubiertos}
              />

              {lote.error && <Notice tone="error">{lote.error}</Notice>}

              <PhotoPicker
                items={lote.items}
                busy={lote.busy}
                onAddFiles={lote.addFiles}
                onSetTag={lote.setTag}
                onDrop={lote.drop}
                compacto
              />

              {/*
                Aquí vivían el «te falta lateral y espalda» y el consejo de hacerlas
                siempre igual. Los dice mejor el dibujo de arriba: el ángulo que
                falta se ve sin contarlo, y «misma luz, misma pose» es la foto de
                la semana pasada puesta debajo. Lo que NO se ha ido es que se
                pueda terminar sin fotos — eso no era un aviso, era un permiso, y
                sigue estando en el botón del pie.
              */}
            </>
          )}

          {paso.id === 'cuestionario' && (
            <>
              <p className="t-sm t-secondary">
                Lo que la báscula no cuenta. Contesta lo que quieras: ninguna es obligatoria, y en
                blanco tu entrenador ve que no la has contestado en vez de un número inventado.
              </p>

              {/*
                El MISMO componente con el que se contesta el feedback de una
                sesión, y con el que tú lees las respuestas después. Que la
                pregunta se dé y se lea con la misma forma es lo que evita que
                las dos versiones diverjan (ver `SessionFeedback`).
              */}
              <SessionFeedback
                questions={preguntas}
                answers={answers}
                title="Cómo ha ido tu semana"
                /* La hoja numerada: son seis preguntas seguidas y éste es el
                   sitio donde más falta hace saber por dónde vas sin tener que
                   leer el contador de la cabecera. Ver `SessionFeedback`. */
                numerado
                onChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
              />
            </>
          )}
        </div>

        {/* El indicador de guardado no existe en el ensayo: no hay cola, no hay
            nada que guardar, y un «guardado ✓» ahí sería la única línea de esta
            pantalla que miente. */}
        {!ensayo && (
          <div className="wiz-foot">
            <SaveIndicator status={save.status} error={save.error} onRetry={onRetry} />
          </div>
        )}
      </div>
    </Modal>
  );
};
