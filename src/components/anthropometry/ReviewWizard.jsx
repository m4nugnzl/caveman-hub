import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  MessageSquare,
  Plus,
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
import { ANGLE_IDS, angleLabel, photoWeek, weekFromStart } from '@/domain/photos';
import {
  asksBlock,
  checkinQuestions,
  clientProtocol,
  requiredBlocks,
  requiresBlock,
} from '@/domain/protocol';
import { todayISO } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { Field, Notice, SaveIndicator } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { PhotoPicker } from '@/components/photos/PhotoPicker';
import { usePhotoBatch } from '@/components/photos/usePhotoBatch';
import { SessionFeedback } from '@/components/Coach/Workout/SessionFeedback';

/**
 * El asistente de revisión: la semana entregada, por pasos.
 *
 * ══ Por qué deja de ser un formulario de golpe ══════════════════════════════
 *
 * Lo que hay que hacer una vez por semana son tres cosas seguidas y de distinta
 * naturaleza: confirmar el peso, medirse si tu entrenador lo pide, y hacerte las
 * fotos. Enseñadas a la vez en un solo diálogo, eso eran veinte campos y dos
 * avisos delante de alguien que ha abierto la aplicación para subir tres fotos.
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
 * Ni tres fijos ni uno por tabla. Si el entrenador apagó pliegues y perímetros,
 * el paso de medidas NO EXISTE —no aparece vacío ni deshabilitado—, y si no hay
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

/** Rejilla de campos numéricos etiquetados (pliegues y perímetros). */
const MeasureGrid = ({ labels, values, unit, onChange }) => (
  <div className="measure-grid">
    {Object.entries(labels).map(([key, label]) => (
      <div className="card-inset row between gap-2 measure-cell" key={key}>
        <label className="t-sm t-secondary" htmlFor={`m-${key}`}>
          {label}
        </label>
        <input
          id={`m-${key}`}
          type="text"
          inputMode="decimal"
          className="input input-center input-measure"
          value={values[key] ?? ''}
          onChange={(e) => onChange(key, e.target.value)}
          aria-label={`${label} en ${unit}`}
        />
      </div>
    ))}
  </div>
);

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
 */
export const ReviewWizard = ({
  client,
  history,
  nutritionPlan,
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
  onClose,
}) => {
  const isClient = audience === 'client';

  const protocol = useMemo(() => clientProtocol(client.preferences), [client.preferences]);
  const pideFolds = asksBlock(protocol, 'folds');
  const pidePerimetros = asksBlock(protocol, 'perimeters');
  const obligatorios = useMemo(() => requiredBlocks(protocol), [protocol]);
  const puedeSubirFotos = Boolean(photos && onUploadPhoto);

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

  /* Los pasos que de verdad tiene ESTE cliente. El peso siempre; los demás, solo
     si hay algo que rellenar en ellos. */
  const pasos = useMemo(
    () =>
      [
        { id: 'peso', titulo: 'El peso', icono: Scale },
        (pideFolds || pidePerimetros) && { id: 'medidas', titulo: 'Las medidas', icono: Ruler },
        puedeSubirFotos && { id: 'fotos', titulo: 'Las fotos', icono: Camera },
        preguntas.length > 0 && { id: 'cuestionario', titulo: 'Tu semana', icono: MessageSquare },
      ].filter(Boolean),
    [pideFolds, pidePerimetros, puedeSubirFotos, preguntas.length]
  );

  const [indice, setIndice] = useState(0);
  const paso = pasos[indice];
  const ultimo = indice === pasos.length - 1;

  const [date, setDate] = useState(todayISO);
  const [weight, setWeight] = useState('');
  const [folds, setFolds] = useState(emptyFolds);
  const [perimeters, setPerimeters] = useState(emptyPerimeters);
  /*
    Los bloques OPCIONALES empiezan recogidos. Quince campos de medidas que casi
    nunca se rellenan alargaban el paso para todo el mundo, y un formulario largo
    se entrega menos (es el hallazgo del informe de estado: 0 % de uso). Quien sí
    mide, lo abre con un toque; lo obligatorio sale siempre abierto.
  */
  const [abiertos, setAbiertos] = useState({ folds: false, perimeters: false });
  const [answers, setAnswers] = useState({});
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

  /* Cómo se llama la ventana en la frase que explica de dónde sale el número.
     «de esta semana» sería mentira con cadencia quincenal, y «del periodo» es
     jerga cuando el periodo es una semana normal. */
  const ventana = weeks > 1 ? `estas ${weeks} semanas` : 'esta semana';

  useEffect(() => {
    if (touched) return;
    setWeight(suggestedWeight === null ? '' : String(suggestedWeight));
  }, [suggestedWeight, touched]);

  const lote = usePhotoBatch({ onUpload: onUploadPhoto || (async () => ({ ok: false })) });

  const semana = weekFromStart(client.startDate, todayISO());
  const yaSubidas = (photos || []).filter((p) => photoWeek(p, client.startDate) === semana);
  const cubiertos = new Set([
    ...yaSubidas.map((p) => p.angle),
    ...lote.items.map((i) => i.angle),
  ]);
  const faltanAngulos = ANGLE_IDS.filter((id) => !cubiertos.has(id));

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

    if (id === 'medidas') {
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
      for (const bloque of obligatorios) {
        const esPliegues = bloque.id === 'folds';
        const faltan = sinRellenar(
          esPliegues ? folds : perimeters,
          esPliegues ? FOLDS_LABELS : PERIMETER_LABELS
        );
        if (faltan.length > 0) {
          return `${isClient ? 'Tu entrenador pide' : 'Este cliente tiene como obligatorio'} ${bloque.label.toLowerCase()} en cada revisión. Falta${faltan.length === 1 ? '' : 'n'}: ${faltan.join(', ')}.`;
        }
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
   * cliente podía confirmar su peso, medirse y subir sus tres fotos —todo lo que
   * él entiende por «mandar mi semana»— y no enterarse de que aún le faltaba
   * pulsar algo. Al entrenador no le llegaba nada, y la semana quedaba en la
   * cola como «sin subir» con todos los datos dentro.
   *
   * Un fallo aquí NO deshace lo anterior, y se dice: el peso y las fotos están a
   * salvo, lo único que no ha ocurrido es el aviso.
   */
  const terminar = async () => {
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

    onAdd(
      buildAnthropometryLog({
        date,
        weight,
        folds,
        perimeters,
        // Foto de las kcal y macros vigentes, para poder cruzar después dieta
        // con evolución de peso: la tabla de nutrición no guarda histórico.
        nutritionPlan,
      })
    );

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
         parecerían demasiado. */
      const dadas = Object.fromEntries(
        Object.entries(answers).filter(([, v]) => String(v ?? '').trim() !== '')
      );

      const res = await onSubmitWeek({
        weekStart,
        weight: toNum(weight),
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
      title={isClient ? 'Mi revisión de la semana' : `Nueva revisión de ${client.name}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
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
              {guardando || lote.busy
                ? 'Enviando…'
                : onSubmitWeek
                  ? 'Terminar y entregar'
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
          El carril de pasos. No es decoración: dice cuántos quedan, que es lo
          único que hace tolerable un formulario partido. Sin él, «Siguiente» es
          una puerta a un número desconocido de pantallas.
        */}
        <ol className="wiz-rail">
          {pasos.map((p, i) => (
            <li
              className={`wiz-mark${i === indice ? ' is-on' : ''}${i < indice ? ' is-done' : ''}`}
              key={p.id}
              aria-current={i === indice ? 'step' : undefined}
            >
              <span className="wiz-mark-n" aria-hidden="true">
                {i < indice ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className="wiz-mark-k">{p.titulo}</span>
            </li>
          ))}
        </ol>

        {/* En estrecho los nombres de los pasos se esconden (ver `.wiz-count`):
            esta línea mantiene dicho el total. */}
        <p className="wiz-count">
          Paso {indice + 1} de {pasos.length}
        </p>

        {error && <Notice tone="error">{error}</Notice>}

        {/* La `key` remonta el panel al cambiar de paso, así que la animación de
            entrada se reproduce y el desplazamiento del diálogo vuelve arriba. */}
        <div className="wiz-panel" key={paso.id}>
          {paso.id === 'peso' && (
            <>
              <p className="t-sm t-secondary">
                {isClient
                  ? suggestedWeight !== null
                    ? 'Confirma con qué peso cierras la semana. Viene puesto con el promedio de tus pesajes, que es la cifra que filtra el agua del día a día.'
                    : 'Confirma con qué peso cierras la semana.'
                  : 'El peso es el único dato obligatorio de una revisión.'}
              </p>

              <div className="row-end wrap gap-4">
                <Field label="Fecha" className="grow">
                  {(props) => (
                    <input
                      {...props}
                      type="date"
                      className="input"
                      value={date}
                      max={todayISO()}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  )}
                </Field>

                <Field label="Peso (kg)" className="grow">
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      inputMode="decimal"
                      className="input input-center input-hero"
                      /*
                        El ejemplo era «81.5», que es un peso perfectamente
                        creíble escrito en gris y en grande. Con la casilla vacía
                        —cuando no hay pesajes que promediar— no había forma de
                        distinguir a simple vista si eso era lo que se iba a
                        guardar o un hueco por rellenar. Un marcador de posición
                        no puede parecerse al dato.
                      */
                      placeholder="— kg —"
                      value={weight}
                      onChange={(e) => {
                        setTouched(true);
                        setWeight(e.target.value);
                      }}
                      required
                    />
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

          {paso.id === 'medidas' && (
            <>
              <p className="t-sm t-secondary">
                {obligatorios.length > 0
                  ? 'Esto sí hace falta para cerrar la revisión.'
                  : 'Opcional. Si esta semana no te has medido, pasa al siguiente paso.'}
              </p>

              {/*
                ── El sexo, DONDE se nota que falta ──────────────────────────
                La fórmula de pliegues es distinta para hombre y mujer, y sin
                definir se aplica **la de hombre en silencio**: el porcentaje
                sale, parece bueno y puede estar cuatro puntos desviado. Por eso
                el aviso cambia de tono cuando falta, y se arregla aquí mismo.
              */}
              {pideFolds &&
                (client.gender ? (
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
                    Falta el sexo de {client.name}, y la fórmula de pliegues es distinta para hombre
                    y mujer.{' '}
                    {onSetGender
                      ? 'Mientras no se defina se aplica la de hombre, así que el % graso puede estar desviado.'
                      : 'Pídeselo a tu entrenador: mientras tanto el % graso puede estar desviado.'}
                  </Notice>
                ))}

              {pideFolds &&
                (requiresBlock(protocol, 'folds') || abiertos.folds || sum > 0 ? (
                  <div className="col gap-3">
                    <h4 className="section-label">
                      Pliegues cutáneos (mm)
                      {requiresBlock(protocol, 'folds') && (
                        <span className="badge badge-warn wiz-badge">Obligatorio</span>
                      )}
                    </h4>
                    <MeasureGrid
                      labels={FOLDS_LABELS}
                      values={folds}
                      unit="milímetros"
                      onChange={(k, v) => setFolds((f) => ({ ...f, [k]: v }))}
                    />
                    {sum > 0 && (
                      <div className="row between wrap gap-3 folds-sum">
                        <span className="t-sm folds-sum-k">Suma: {sum} mm</span>
                        <strong className="folds-sum-v">% graso: {pct ?? '—'}%</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm self-start"
                    onClick={() => setAbiertos((a) => ({ ...a, folds: true }))}
                  >
                    <Plus size={14} /> Añadir pliegues cutáneos
                  </button>
                ))}

              {pidePerimetros &&
                (requiresBlock(protocol, 'perimeters') ||
                abiertos.perimeters ||
                Object.values(perimeters).some((v) => v !== '' && v != null) ? (
                  <div className="col gap-3">
                    <h4 className="section-label">
                      Perímetros corporales (cm)
                      {requiresBlock(protocol, 'perimeters') && (
                        <span className="badge badge-warn wiz-badge">Obligatorio</span>
                      )}
                    </h4>
                    <MeasureGrid
                      labels={PERIMETER_LABELS}
                      values={perimeters}
                      unit="centímetros"
                      onChange={(k, v) => setPerimeters((p) => ({ ...p, [k]: v }))}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm self-start"
                    onClick={() => setAbiertos((a) => ({ ...a, perimeters: true }))}
                  >
                    <Plus size={14} /> Añadir perímetros
                  </button>
                ))}
            </>
          )}

          {paso.id === 'fotos' && (
            <>
              <p className="t-sm t-secondary">
                {semana === null
                  ? 'Se guardarán en la semana 1: este cliente no tiene fecha de inicio.'
                  : `Se guardarán en la semana ${semana}. Frontal, lateral y espalda: puedes elegirlas todas de una vez y decir cuál es cuál.`}
              </p>

              {/* Lo que ya hay de esta semana. Sin esto, quien subió el lunes la
                  frontal no tiene forma de saber si le falta algo. */}
              {yaSubidas.length > 0 && (
                <Notice tone="success">
                  Ya tienes {yaSubidas.length} {yaSubidas.length === 1 ? 'foto' : 'fotos'} de esta
                  semana: {ANGLE_IDS.filter((id) => yaSubidas.some((p) => p.angle === id))
                    .map(angleLabel)
                    .join(', ')
                    .toLowerCase()}
                  .
                </Notice>
              )}

              {lote.error && <Notice tone="error">{lote.error}</Notice>}

              <PhotoPicker
                items={lote.items}
                busy={lote.busy}
                onAddFiles={lote.addFiles}
                onSetTag={lote.setTag}
                onDrop={lote.drop}
                compacto
              />

              {faltanAngulos.length > 0 && (
                <Notice tone={faltanAngulos.length === ANGLE_IDS.length ? 'info' : 'warn'}>
                  {faltanAngulos.length === ANGLE_IDS.length
                    ? 'Con los tres ángulos —frontal, lateral y espalda— se ven cambios que la báscula no cuenta. Puedes terminar sin fotos y subirlas luego.'
                    : `Te falta ${faltanAngulos.map(angleLabel).join(' y ').toLowerCase()}.`}
                </Notice>
              )}

              {/* Consejo, no aviso: dos recuadros de color seguidos diciendo cosas
                  de distinta urgencia hacen que no se lea ninguno de los dos. */}
              <p className="t-xs t-tertiary">
                Hazlas siempre igual: misma luz, misma distancia, misma pose y a ser posible el
                mismo día de la semana. Es lo que hace que la comparación signifique algo.
              </p>
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
                onChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
              />
            </>
          )}
        </div>

        <div className="wiz-foot">
          <SaveIndicator status={save.status} error={save.error} onRetry={onRetry} />
        </div>
      </div>
    </Modal>
  );
};
