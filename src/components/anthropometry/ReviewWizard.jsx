import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, Ruler, Save, Scale } from 'lucide-react';

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
import { asksBlock, clientProtocol, requiredBlocks, requiresBlock } from '@/domain/protocol';
import { todayISO } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { Field, Notice, SaveIndicator } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { PhotoPicker } from '@/components/photos/PhotoPicker';
import { usePhotoBatch } from '@/components/photos/usePhotoBatch';

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
  onClose,
}) => {
  const isClient = audience === 'client';

  const protocol = useMemo(() => clientProtocol(client.preferences), [client.preferences]);
  const pideFolds = asksBlock(protocol, 'folds');
  const pidePerimetros = asksBlock(protocol, 'perimeters');
  const obligatorios = useMemo(() => requiredBlocks(protocol), [protocol]);
  const puedeSubirFotos = Boolean(photos && onUploadPhoto);

  /* Los pasos que de verdad tiene ESTE cliente. El peso siempre; los otros dos,
     solo si hay algo que rellenar en ellos. */
  const pasos = useMemo(
    () =>
      [
        { id: 'peso', titulo: 'El peso', icono: Scale },
        (pideFolds || pidePerimetros) && { id: 'medidas', titulo: 'Las medidas', icono: Ruler },
        puedeSubirFotos && { id: 'fotos', titulo: 'Las fotos', icono: Camera },
      ].filter(Boolean),
    [pideFolds, pidePerimetros, puedeSubirFotos]
  );

  const [indice, setIndice] = useState(0);
  const paso = pasos[indice];
  const ultimo = indice === pasos.length - 1;

  const [date, setDate] = useState(todayISO);
  const [weight, setWeight] = useState('');
  const [folds, setFolds] = useState(emptyFolds);
  const [perimeters, setPerimeters] = useState(emptyPerimeters);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  /* `touched` impide que el prellenado pise lo que se esté escribiendo: en
     cuanto se toca el campo, deja de proponerse. */
  const [touched, setTouched] = useState(false);
  const weekCheckIn = useMemo(() => weeklyCheckIn(history, todayISO()), [history]);
  const suggestedWeight = weekCheckIn.average;

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

    /* Las fotos NO bloquean. Alguien puede estar entregando la semana desde el
       vestuario y hacérselas en casa; obligar aquí solo consigue que se cierre
       el asistente y no se registre ni el peso. */
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
   * Terminar: se guarda el registro y DESPUÉS se suben las fotos.
   *
   * Ese orden importa. El registro es lo obligatorio y es instantáneo —va por la
   * cola de guardado optimista—; las fotos pueden tardar y pueden fallar. Al
   * revés, una subida que falla dejaría sin guardar un peso que ya estaba
   * escrito, que es la peor forma de perder el trabajo de alguien.
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
              {guardando || lote.busy ? 'Guardando…' : 'Terminar y guardar'}
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

        {error && <Notice tone="error">{error}</Notice>}

        {/* La `key` remonta el panel al cambiar de paso, así que la animación de
            entrada se reproduce y el desplazamiento del diálogo vuelve arriba. */}
        <div className="wiz-panel" key={paso.id}>
          {paso.id === 'peso' && (
            <>
              <p className="t-sm t-secondary">
                {isClient
                  ? 'Confirma con qué peso cierras la semana. Viene puesto con el promedio de tus pesajes, que es la cifra que filtra el agua del día a día.'
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
                      placeholder="81.5"
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
                  {weekCheckIn.count === 1 ? 'tu pesaje' : `tus ${weekCheckIn.count} pesajes`} de
                  esta semana. Escribe encima si quieres registrar otro valor.
                </p>
              )}
              {suggestedWeight === null && (
                <p className="t-xs t-tertiary">
                  {isClient
                    ? 'Esta semana no has anotado ningún pesaje, así que no hay promedio que proponerte. Escríbelo a mano.'
                    : 'Sin pesajes esta semana: no hay promedio que proponer.'}
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

              {pideFolds && (
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
              )}

              {pidePerimetros && (
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
              )}
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
                onSetAngle={lote.setAngle}
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
        </div>

        <div className="wiz-foot">
          <SaveIndicator status={save.status} error={save.error} onRetry={onRetry} />
        </div>
      </div>
    </Modal>
  );
};
