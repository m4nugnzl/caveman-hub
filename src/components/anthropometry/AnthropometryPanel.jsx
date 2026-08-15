import { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Plus,
  Ruler,
  Save,
  Trash2,
} from 'lucide-react';

import {
  FOLDS_LABELS,
  PERIMETER_LABELS,
  buildAnthropometryLog,
  emptyAnthropometry,
  emptyFolds,
  emptyPerimeters,
  fatPercent,
  foldsSum,
  hasMeasurements,
  reverseChronological,
  rollingWeightAverage,
  seriesDelta,
  weeklyCheckIn,
  weeklyRateOfChange,
  weeklyWeightAverages,
  weightSeries,
} from '@/domain/anthropometry';
import { ANGLE_IDS, angleLabel, photoWeek, weekFromStart } from '@/domain/photos';
import { asksBlock, clientProtocol, requiredBlocks, requiresBlock } from '@/domain/protocol';
import { shortDate, todayISO } from '@/lib/dates';
import { fmt, toNum } from '@/lib/num';
import {
  Field,
  Notice,
  Panel,
  SaveIndicator,
  SectionTitle,
  StatCard,
} from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { PhotoUploadDialog } from '@/components/photos/PhotoUploadDialog';
import { WeeklyCheckIn } from './WeeklyCheckIn';

/** Rejilla de campos numéricos etiquetados (pliegues y perímetros). */
const MeasureGrid = ({ labels, values, unit, onChange }) => (
  <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
    {Object.entries(labels).map(([key, label]) => (
      <div className="card-inset row between gap-2" key={key} style={{ padding: '8px 12px' }}>
        <label className="t-sm t-secondary" htmlFor={`m-${key}`}>
          {label}
        </label>
        <input
          id={`m-${key}`}
          type="text"
          inputMode="decimal"
          className="input input-center"
          style={{ width: 58 }}
          value={values[key] ?? ''}
          onChange={(e) => onChange(key, e.target.value)}
          aria-label={`${label} en ${unit}`}
        />
      </div>
    ))}
  </div>
);

/**
 * Registro y seguimiento de peso y medidas.
 *
 * Lo usan el cliente (que es quien registra sus medidas) y el entrenador (que
 * consulta y puede corregir). Mismo componente para los dos: la única
 * diferencia son los textos, que cambian según `audience`.
 *
 * Regla de producto: **el peso es obligatorio en cada revisión**; pliegues y
 * perímetros son opcionales y van plegados para no estorbar, porque no se miden
 * todas las semanas.
 */
/**
 * Las fotos de la revisión: qué ángulos llevas y el botón para subirlas.
 *
 * ── Por qué la semana la decide HOY ─────────────────────────────────────────
 * Antes esto vivía dentro de la calculadora de pesajes y seguía a la semana que
 * se estuviera mirando ahí, que es una nicetad que costaba entender: cambiar de
 * semana en la báscula movía a dónde iban las fotos. Una revisión se sube el día
 * que se hace, así que la semana es la de hoy.
 */
const PhotoSlot = ({ client, photos, onUpload }) => {
  const [abierto, setAbierto] = useState(false);

  const semana = weekFromStart(client.startDate, todayISO());
  const deEstaSemana = (photos || []).filter((p) => photoWeek(p, client.startDate) === semana);
  const faltan = ANGLE_IDS.filter((id) => !deEstaSemana.some((p) => p.angle === id));

  return (
    <div className="card-inset row between wrap gap-3">
      <div className="col gap-1">
        <span className="section-label">Tus fotos de esta semana</span>
        <span className="t-sm">
          {deEstaSemana.length === 0 ? (
            <span className="t-secondary">Ninguna todavía</span>
          ) : (
            <>
              <strong>{deEstaSemana.length}</strong>{' '}
              {deEstaSemana.length === 1 ? 'foto' : 'fotos'}
              <span className="t-tertiary">
                {' · '}
                {ANGLE_IDS.filter((id) => deEstaSemana.some((p) => p.angle === id))
                  .map(angleLabel)
                  .join(', ')}
              </span>
            </>
          )}
        </span>
        {faltan.length > 0 && deEstaSemana.length > 0 && (
          <span className="t-xs" style={{ color: 'var(--warning)' }}>
            Falta {faltan.map(angleLabel).join(' y ').toLowerCase()}
          </span>
        )}
      </div>

      <button
        type="button"
        className={deEstaSemana.length === 0 ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
        onClick={() => setAbierto(true)}
      >
        <Camera size={14} />
        {deEstaSemana.length === 0 ? 'Subir mis fotos' : 'Añadir más'}
      </button>

      {abierto && (
        <PhotoUploadDialog
          client={client}
          existingPhotos={photos || []}
          defaultWeek={semana}
          onUpload={onUpload}
          onClose={() => setAbierto(false)}
        />
      )}
    </div>
  );
};

export const AnthropometryPanel = ({
  client,
  anthropometry,
  nutritionPlan,
  audience = 'client',
  save,
  onRetry,
  onAdd,
  onRemove,
  // Fotos del cliente y forma de subirlas. Si no llegan, el check-in solo cubre
  // el peso, que es como funcionaba antes.
  photos = null,
  onUploadPhoto = null,
  // Solo lo pasa el entrenador: el sexo es un dato de la ficha y el cliente no
  // edita su propia ficha (ver 0006). Sin esta función, el aviso explica el
  // problema pero no ofrece arreglarlo.
  onSetGender = null,
}) => {
  const confirm = useConfirm();
  // Memoizado: `|| []` crearía un array nuevo en cada render e invalidaría los
  // seis cálculos derivados que dependen de él.
  const history = useMemo(() => anthropometry?.history || emptyAnthropometry().history, [anthropometry]);

  const [date, setDate] = useState(todayISO);
  const [weight, setWeight] = useState('');
  const [folds, setFolds] = useState(emptyFolds);
  const [perimeters, setPerimeters] = useState(emptyPerimeters);
  const [feedback, setFeedback] = useState(null);

  /*
    ══ Qué se mide aquí lo decide el entrenador ═══════════════════════════════

    Pliegues y perímetros eran «opcional» para todo el mundo: plegados detrás de
    un botón. Ahora cada bloque puede estar en tres estados
    (`domain/protocol.js`), y esta pantalla es donde se notan los tres:

      · apagado    → no se pinta, y ni siquiera se ofrece desplegarlo.
      · opcional   → como siempre: plegado, y quien quiera lo abre.
      · obligatorio→ se abre SOLO y el check-in no se cierra sin él.

    Lo obligatorio empieza desplegado por la misma razón por la que es
    obligatorio: si hay que buscar dónde se rellena, no se rellena — y entonces
    lo único que hace la exigencia es dar un error al enviar.
  */
  const protocol = useMemo(() => clientProtocol(client.preferences), [client.preferences]);
  const pideFolds = asksBlock(protocol, 'folds');
  const pidePerimetros = asksBlock(protocol, 'perimeters');
  const obligatorios = useMemo(() => requiredBlocks(protocol), [protocol]);

  const [showMeasures, setShowMeasures] = useState(obligatorios.length > 0);

  /*
    ── El peso llega propuesto, no guardado ──────────────────────────────────
    Los pesajes que se van anotando arriba en el check-in ya dan un promedio de la
    semana, que es la cifra buena: filtra la variación diaria de agua. Tecleársela
    otra vez aquí para cerrar la revisión es copiar un número de una caja a otra de
    la misma pantalla.
    Así que el campo aparece RELLENO con ese promedio, pero **no se guarda nada
    hasta enviar el formulario**, y se puede sobrescribir: el cliente sabe si ese
    día se pesó en condiciones raras y su criterio manda sobre la media.
    `touched` es lo que impide que el prellenado pise lo que esté escribiendo: en
    cuanto toca el campo, deja de proponerse.
  */
  const [touched, setTouched] = useState(false);
  // El check-in completo, no solo el promedio: hace falta el número de pesajes
  // para poder decir de cuántos sale la media que se propone.
  const weekCheckIn = useMemo(() => weeklyCheckIn(history, todayISO()), [history]);
  const suggestedWeight = weekCheckIn.average;

  useEffect(() => {
    if (touched) return;
    setWeight(suggestedWeight === null ? '' : String(suggestedWeight));
  }, [suggestedWeight, touched]);

  const isClient = audience === 'client';
  /*
    ══ Al cliente, la revisión completa detrás de un paso ═════════════════════

    Este formulario tiene pliegues y perímetros, y es el mismo para los dos
    porque los cálculos son los mismos. Pero el trabajo real de un cliente en
    esta pantalla es pesarse tres días y subir tres fotos: los pliegues se miden
    con un plicómetro y casi siempre los toma su entrenador en persona.

    Enseñárselo desplegado convertía su check-in —que son tres casillas— en un
    formulario de quince campos que no va a rellenar. Sigue estando entero,
    porque quien mide en casa tiene que poder; solo deja de ser lo primero que
    ve. El entrenador lo tiene abierto: para él SÍ es la herramienta.
  */
  const [completaAbierta, setCompletaAbierta] = useState(false);

  const weights = useMemo(() => weightSeries(history), [history]);
  const weekly = useMemo(() => weeklyWeightAverages(history), [history]);
  const rolling = useMemo(() => rollingWeightAverage(history, 3), [history]);
  const delta = useMemo(() => seriesDelta(weekly), [weekly]);
  const rate = useMemo(() => weeklyRateOfChange(history), [history]);
  const rows = useMemo(() => reverseChronological(history), [history]);

  const sum = foldsSum(folds);
  const pct = fatPercent(folds, client.gender);

  /** Los campos de un bloque que están sin rellenar, por su nombre visible. */
  const sinRellenar = (values, labels) =>
    Object.entries(labels)
      .filter(([key]) => toNum(values[key]) === null)
      .map(([, label]) => label);

  const submit = (event) => {
    event.preventDefault();
    if (toNum(weight) === null) {
      setFeedback({ tone: 'error', text: 'El peso es obligatorio.' });
      return;
    }
    if (!date) {
      setFeedback({ tone: 'error', text: 'Indica la fecha del pesaje.' });
      return;
    }

    /*
      Un bloque obligatorio se pide ENTERO.

      No es rigidez: la suma de pliegues con cinco de seis no es un % graso más
      impreciso, es un número distinto que se pintaría en la misma serie que los
      completos y la estropearía sin avisar. Y para los perímetros, comparar la
      cintura de esta semana con la cadera de la anterior no significa nada.

      El error dice QUÉ falta —no «rellena los pliegues»— porque con seis casillas
      idénticas encontrar la vacía a ojo es el trabajo que debería hacer la
      aplicación.
    */
    for (const bloque of obligatorios) {
      const esPliegues = bloque.id === 'folds';
      const faltan = sinRellenar(
        esPliegues ? folds : perimeters,
        esPliegues ? FOLDS_LABELS : PERIMETER_LABELS
      );
      if (faltan.length > 0) {
        setShowMeasures(true);
        setFeedback({
          tone: 'error',
          text: `${isClient ? 'Tu entrenador pide' : 'Este cliente tiene como obligatorio'} ${bloque.label.toLowerCase()} en cada check-in. Falta${faltan.length === 1 ? '' : 'n'}: ${faltan.join(', ')}.`,
        });
        return;
      }
    }

    const existing = history.some((h) => h.date === date);

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

    // `touched` vuelve a false para que el campo recupere el promedio propuesto
    // en la siguiente revisión, en lugar de quedarse en blanco.
    setTouched(false);
    setFolds(emptyFolds());
    setPerimeters(emptyPerimeters());
    setDate(todayISO());
    // Se repliega salvo que haya algo obligatorio, que es como estaba al entrar.
    setShowMeasures(obligatorios.length > 0);
    setFeedback({
      tone: 'success',
      text: existing ? `Se ha actualizado el registro del ${date}.` : 'Registro guardado.',
    });
  };

  const askRemove = async (log) => {
    const ok = await confirm({
      title: '¿Eliminar este registro?',
      message: `Se borrará la medición del ${shortDate(log.date)}.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (ok) onRemove(log.id);
  };

  return (
    <div className="stack">
      {weights.length > 0 && (
        <div className="grid-auto">
          <StatCard
            label="Último peso"
            value={fmt(weights[weights.length - 1].value, { decimals: 1, unit: ' kg' })}
            color="var(--accent)"
            sub={weights[weights.length - 1].date}
          />
          <StatCard
            label="Media últimos 3"
            value={rolling ? `${rolling.average} kg` : '—'}
            color="var(--data-amber)"
            sub={rolling ? `${rolling.count} ${rolling.count === 1 ? 'pesaje' : 'pesajes'}` : 'sin datos'}
          />
          {delta && (
            <StatCard
              label="Variación total"
              value={`${delta.delta > 0 ? '+' : ''}${delta.delta} kg`}
              color={delta.delta <= 0 ? 'var(--accent)' : 'var(--data-rose)'}
              sub={`de ${delta.from} a ${delta.to} kg`}
            />
          )}
          {rate !== null && (
            <StatCard
              label="Ritmo semanal"
              value={`${rate > 0 ? '+' : ''}${rate} kg`}
              color="var(--data-blue)"
              sub="promedio por semana"
            />
          )}
        </div>
      )}

      {/* El check-in semanal va PRIMERO: es la acción de cada semana. El
          registro completo con pliegues y perímetros es puntual, así que queda
          debajo. */}
      <WeeklyCheckIn
        history={history}
        audience={audience}
        onAddWeight={onAdd}
        onRemoveEntry={onRemove}
        /*
          ══ Subir la revisión es una ACCIÓN, no una sección ══════════════════

          Era un panel estático debajo del check-in, y desde fuera no se
          distinguía de «Tu semana»: dos tarjetas seguidas del mismo tamaño
          hablando las dos de lo mismo. Ninguna de las dos decía qué la separaba
          de la otra.

          Subir las fotos y medirse es algo que se HACE, una vez por semana y de
          una sentada. Eso es un botón y un diálogo, no un apartado de la página
          ocupando sitio los otros seis días.
        */
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setCompletaAbierta(true)}
          >
            <Camera size={14} /> {isClient ? 'Subir mi revisión' : 'Nueva revisión'}
          </button>
        }
      />

      {completaAbierta && (
        <Modal
          title={isClient ? 'Subir mi revisión' : `Nueva revisión de ${client.name}`}
          size="lg"
          onClose={() => setCompletaAbierta(false)}
        >
          <form className="col gap-5" onSubmit={submit}>
            <div className="row between wrap gap-2">
              <span className="t-sm t-secondary">
                {isClient
                  ? 'Tus fotos y tus perímetros, del mismo día. Los pesajes de la semana van en el check-in.'
                  : 'El peso es el único dato obligatorio. Los pliegues y perímetros son opcionales.'}
              </span>
              <SaveIndicator status={save.status} error={save.error} onRetry={onRetry} />
            </div>

        <p className="t-sm t-secondary">
          {isClient
            ? 'Tus fotos y tus perímetros, del mismo día. Los pesajes de la semana van arriba, en el check-in.'
            : 'El peso es el único dato obligatorio. Los pliegues y perímetros son opcionales; normalmente los registra el cliente, pero puedes añadirlos tú si mides en persona.'}
        </p>

        {/* LAS FOTOS, aquí dentro: son la otra mitad de una revisión y se hacen
            el mismo día que se miden los perímetros. Estaban con la báscula, que
            es un gesto de cada dos días y de cinco segundos. */}
        {client && photos && onUploadPhoto && (
          <PhotoSlot client={client} photos={photos} onUpload={onUploadPhoto} />
        )}

        {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

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

          {/*
            Sin `hint`: el texto de ayuda solo bajo este campo hacía que la caja
            del peso midiera más que la de la fecha y el par quedaba desalineado.
            El asterisco del label ya indica que es obligatorio.
          */}
          <Field label="Peso (kg) *" className="grow">
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                className="input input-center"
                style={{ fontSize: '1.1rem' }}
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

          <button type="submit" className="btn btn-primary btn-lg shrink-0">
            <Save size={16} /> Guardar
          </button>
        </div>

        {/*
          De dónde sale el número, dicho DEBAJO de la fila y no al lado del campo.
          ----------------------------------------------------------------------
          Antes era una insignia hermana de los dos campos dentro de un `.row-end`:
          con `align-items: flex-end` quedaba pegada al borde inferior de las cajas
          y con `alignSelf: center` flotando a media altura entre ellas. En los dos
          casos parecía un trozo suelto, porque no estaba anclada a nada.

          Y decía menos de lo que hacía falta: «promedio de la semana» no dice
          CUÁNTO ni DE CUÁNTOS pesajes, que es lo que permite decidir si el valor
          propuesto sirve o hay que corregirlo. Ahora lo dice, ocupa el ancho
          completo —así no puede descolocar ninguna caja— y desaparece en cuanto
          se escribe encima, porque entonces ya no describe lo que hay.
        */}
        {suggestedWeight !== null && !touched && (
          <p className="t-xs t-tertiary">
            Propuesto: <strong>{suggestedWeight} kg</strong>, el promedio de{' '}
            {weekCheckIn.count === 1 ? 'tu pesaje' : `tus ${weekCheckIn.count} pesajes`} de esta
            semana. Escribe encima si quieres registrar otro valor.
          </p>
        )}

        {/*
          Con los dos bloques apagados aquí no hay nada: ni el botón. Un
          desplegable que abre un hueco vacío es peor que no tenerlo, y quien lo
          apagó ya dijo que su check-in es solo el peso.
        */}
        {(pideFolds || pidePerimetros) && (
        <div className="col gap-3">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ alignSelf: 'flex-start' }}
            aria-expanded={showMeasures}
            onClick={() => setShowMeasures((v) => !v)}
          >
            {showMeasures ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Ruler size={14} />{' '}
            {/* El botón nombra SOLO lo que se va a abrir, y dice si hay que
                rellenarlo: «(opcional)» encima de algo obligatorio era la forma
                más rápida de que nadie lo rellenara. */}
            Añadir{' '}
            {[pideFolds && 'pliegues', pidePerimetros && 'perímetros'].filter(Boolean).join(' y ')}
            {obligatorios.length > 0
              ? obligatorios.length === (pideFolds ? 1 : 0) + (pidePerimetros ? 1 : 0)
                ? ' (obligatorio)'
                : ' (uno es obligatorio)'
              : ' (opcional)'}
          </button>

          {showMeasures && (
            <>
              {/*
                ── El sexo, DONDE se nota que falta ──────────────────────────
                Hasta ahora esto decía «sexo registrado: sin definir» y ahí se
                acababa: el único sitio donde se podía elegir era el formulario
                de alta, así que un cliente creado sin él —o traído de Notion, que
                solo trae el nombre— se quedaba así para siempre.

                Y no es un dato cosmético: la fórmula de pliegues es distinta
                para hombre y mujer, y sin definir se estaba aplicando **la de
                hombre en silencio**. El porcentaje salía, parecía bueno y podía
                estar cuatro puntos desviado.

                Por eso el aviso cambia de tono cuando falta: no es información,
                es algo que hay que arreglar, y se arregla aquí mismo.
              */}
              {/* El sexo solo importa aquí por la fórmula de los pliegues: con
                  ese bloque apagado, el aviso hablaría de un cálculo que en esta
                  pantalla ya no se hace. */}
              {pideFolds && (client.gender ? (
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
                  Falta el sexo de {client.name}, y la fórmula de pliegues es
                  distinta para hombre y mujer.{' '}
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
                    <span className="badge badge-warn" style={{ marginLeft: 8 }}>
                      Obligatorio
                    </span>
                  )}
                </h4>
                <MeasureGrid
                  labels={FOLDS_LABELS}
                  values={folds}
                  unit="milímetros"
                  onChange={(k, v) => setFolds((f) => ({ ...f, [k]: v }))}
                />
                {sum > 0 && (
                  <div
                    className="row between wrap gap-3"
                    style={{
                      background: 'var(--info-soft)',
                      border: '1px solid var(--info)',
                      borderRadius: 'var(--r-md)',
                      padding: '12px 16px',
                    }}
                  >
                    <span className="t-sm" style={{ color: 'var(--data-blue)', fontWeight: 700 }}>
                      Suma: {sum} mm
                    </span>
                    <strong style={{ fontSize: '1.25rem' }}>% graso: {pct ?? '—'}%</strong>
                  </div>
                )}
              </div>
              )}

              {pidePerimetros && (
              <div className="col gap-3">
                <h4 className="section-label">
                  Perímetros corporales (cm)
                  {requiresBlock(protocol, 'perimeters') && (
                    <span className="badge badge-warn" style={{ marginLeft: 8 }}>
                      Obligatorio
                    </span>
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
        </div>
        )}
          </form>
        </Modal>
      )}

      {/* La tendencia ya no vive aquí: está DENTRO del check-in, con los
          pesajes de los que sale. Ver `WeeklyCheckIn`. */}

      {rows.length > 0 && (
        <Panel tight className="col gap-4">
          <SectionTitle>Historial de registros</SectionTitle>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col" className="num">Peso</th>
                  {hasMeasurements(history) && (
                    <>
                      <th scope="col" className="num">% Graso</th>
                      <th scope="col" className="num">Cintura</th>
                      <th scope="col" className="num">Σ Pliegues</th>
                    </>
                  )}
                  <th scope="col" className="num">Kcal</th>
                  <th scope="col" className="num">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => {
                  const logPct = fatPercent(log.skinFolds, client.gender);
                  return (
                    <tr key={log.id || log.date}>
                      <td style={{ fontWeight: 700 }}>{shortDate(log.date)}</td>
                      <td className="num" style={{ fontWeight: 800, color: 'var(--data-amber)' }}>
                        {fmt(log.weight, { decimals: 1 })}
                      </td>
                      {hasMeasurements(history) && (
                        <>
                          <td className="num" style={{ color: 'var(--data-blue)', fontWeight: 700 }}>
                            {logPct === null ? '—' : `${logPct}%`}
                          </td>
                          <td className="num t-secondary">
                            {fmt(log.perimeters?.ombligo, { decimals: 1 })}
                          </td>
                          <td className="num t-secondary">{foldsSum(log.skinFolds) || '—'}</td>
                        </>
                      )}
                      <td className="num t-secondary">{fmt(log.nutrition?.kcals)}</td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn btn-icon btn-icon-danger"
                          onClick={() => askRemove(log)}
                          aria-label={`Eliminar el registro del ${log.date}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {rows.length === 0 && (
        <Panel>
          <div className="empty">
            <span className="empty-icon">
              <Plus size={24} />
            </span>
            <h3>Sin registros todavía</h3>
            <p>
              {isClient
                ? 'Registra tu primer peso arriba. Con dos o tres registros ya se empieza a ver la tendencia.'
                : 'Este cliente aún no tiene ningún pesaje registrado.'}
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
};
