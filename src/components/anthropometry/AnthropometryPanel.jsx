import { useMemo, useState } from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';

import {
  emptyAnthropometry,
  fatPercent,
  foldsSum,
  hasMeasurements,
  reverseChronological,
  rollingWeightAverage,
  seriesDelta,
  weeklyRateOfChange,
  weeklyWeightAverages,
  weightSeries,
} from '@/domain/anthropometry';
import { shortDate } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { medidaColor, metricColor } from '@/domain/metrics';
import { deltaDe, serieDe } from '@/domain/medidas';
import {
  clientProtocol,
  medidasDelProtocolo,
  medidasDiarias,
  weighInsTarget,
} from '@/domain/protocol';
import { Panel, SectionTitle } from '@/components/ui/primitives';
import { BandChart } from '@/components/ui/charts';
import { Delta, MetricCard, MetricRow } from '@/components/ui/metrics';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useOculto } from '@/components/Client/Oculto';
import { ReviewWizard } from './ReviewWizard';
import { WeeklyCheckIn } from './WeeklyCheckIn';

/**
 * Peso y medidas de un cliente: lo que hay registrado y por dónde se registra.
 *
 * Lo usan el cliente (que es quien entrega su semana) y el entrenador (que
 * consulta y puede corregir). Mismo componente para los dos: la única diferencia
 * son los textos, que cambian según `audience`.
 *
 * ══ Aquí ya no se rellena nada ═════════════════════════════════════════════
 *
 * Este panel tenía dentro el formulario completo de una revisión: fecha, peso,
 * seis pliegues, siete perímetros y un botón que abría OTRO diálogo para las
 * fotos. Veinte campos y un modal anidado delante de alguien que había venido a
 * subir tres fotos.
 *
 * Todo eso vive ahora en `ReviewWizard`, por pasos y detrás de un botón. Lo que
 * se queda aquí es lo que se LEE: las cifras de cabecera, el check-in semanal y
 * el historial. Es la misma separación que ya hacía el propio check-in cuando
 * sacó las fotos de la báscula —consultar y entregar son dos gestos con ritmos
 * distintos— llevada hasta el final.
 */
export const AnthropometryPanel = ({
  client,
  anthropometry,
  nutritionFoto,
  audience = 'client',
  save,
  onRetry,
  onAdd,
  onRemove,
  /* Apuntar UNA medida de UN día, sin tocar nada más de ese día: es la casilla
     de la rejilla de la semana. Sin ella el panel las enseña y no las escribe,
     que es lo correcto en una pantalla de solo lectura. Ver `apuntarMedida`. */
  onApuntarMedida = null,
  // Fotos del cliente y forma de subirlas. Si no llegan, la revisión solo cubre
  // el peso y las medidas, que es como funcionaba antes de que existieran.
  photos = null,
  onUploadPhoto = null,
  // Solo lo pasa el entrenador: el sexo es un dato de la ficha y el cliente no
  // edita su propia ficha (ver 0006). Sin esta función, el aviso explica el
  // problema pero no ofrece arreglarlo.
  onSetGender = null,
  /*
    ══ El asistente se puede abrir DESDE FUERA ════════════════════════════════

    Porque «Entregar mi semana» vive en `ClientWeek`, que es una tarjeta hermana
    de esta en la misma pantalla, y ahora tiene que abrir este asistente en vez
    de entregar a ciegas. Sin esto habría dos formas de entregar la semana en la
    misma pantalla — que es exactamente el problema que se está arreglando.

    Controlado solo si llegan las dos propiedades; si no, el panel se gobierna
    solo como hasta ahora. Es lo que mantiene intacto el camino del ENTRENADOR,
    que usa este mismo panel para anotar una medición y no entrega nada.
  */
  open = null,
  onOpenChange = null,
  onSubmitWeek = null,
  weekStart = null,
  weeks = 1,
}) => {
  const confirm = useConfirm();
  // Memoizado: `|| []` crearía un array nuevo en cada render e invalidaría los
  // seis cálculos derivados que dependen de él.
  const history = useMemo(
    () => anthropometry?.history || emptyAnthropometry().history,
    [anthropometry]
  );

  const [propio, setPropio] = useState(false);
  const controlado = open !== null && typeof onOpenChange === 'function';
  const asistente = controlado ? open : propio;
  const setAsistente = controlado ? onOpenChange : setPropio;

  const isClient = audience === 'client';

  /*
    ══ El pesaje que no vuelve ════════════════════════════════════════════════

    Esta pantalla es la báscula entera: cuatro cifras de cabecera, la semana con
    sus siete días, la tendencia y el historial. A quien tiene el peso oculto se
    le deja LO QUE HACE —anotar sus pesajes, entregar la semana— y se le quita
    todo lo que se lo devuelve. No es media pantalla: es la misma pantalla sin la
    parte que su entrenador ha decidido llevar él. Ver `Oculto.jsx`.
  */
  const oculto = useOculto();

  const protocolo = useMemo(() => clientProtocol(client?.preferences), [client?.preferences]);
  const objetivoDePesajes = useMemo(() => weighInsTarget(protocolo), [protocolo]);

  /*
    ══ LO QUE SE MIDE CON UN APARATO ══════════════════════════════════════════

    Dos ritmos y dos sitios, que es la distinción que hace `cuando`:

      · Las DIARIAS bajan a la rejilla de la semana, junto al pesaje del día.
      · Las de REVISIÓN se entregan en el asistente, con los pliegues.

    Y las dos se LEEN aquí, cada una con su serie, su color y su variación desde
    la anterior — que es lo que convierte un número apuntado en información.
  */
  const diarias = useMemo(() => medidasDiarias(protocolo), [protocolo]);
  const medidas = useMemo(() => medidasDelProtocolo(protocolo).filter((m) => !m.campos), [protocolo]);

  /* Solo las que tienen algo dibujado: una serie vacía es un hueco con título, y
     con seis medidas encendidas serían seis huecos antes de la primera toma. */
  const series = useMemo(
    () => medidas.map((m) => ({ medida: m, puntos: serieDe(history, m.id) })).filter((s) => s.puntos.length > 0),
    [medidas, history]
  );

  const weights = useMemo(() => weightSeries(history), [history]);
  const weekly = useMemo(() => weeklyWeightAverages(history), [history]);
  const rolling = useMemo(() => rollingWeightAverage(history, 3), [history]);
  const delta = useMemo(() => seriesDelta(weekly), [weekly]);
  const rate = useMemo(() => weeklyRateOfChange(history), [history]);
  const rows = useMemo(() => reverseChronological(history), [history]);
  /* El historial entero son meses de pesajes: se enseñan los últimos y el
     resto se pide. Una lista de sesenta filas debajo del check-in convertía la
     pantalla del cliente en dos metros de tabla. */
  const [todoElHistorial, setTodoElHistorial] = useState(false);
  const VISIBLES = 10;
  const filas = todoElHistorial ? rows : rows.slice(0, VISIBLES);

  const askRemove = async (log) => {
    const ok = await confirm({
      title: '¿Borrar este registro?',
      message: `Se borrará la medición del ${shortDate(log.date)}.`,
      confirmLabel: 'Borrar',
      tone: 'danger',
    });
    if (ok) onRemove(log.id);
  };

  /*
    ══ Las cuatro cifras del peso ═════════════════════════════════════════════

    Las CUATRO hablan del mismo dato —el peso— y salían de cuatro colores
    distintos: tiza, ámbar, rosa y azul. Eso no distingue nada, porque no hay
    nada de lo que distinguirse: no son cuatro series, son cuatro lecturas de
    una. Lo único que conseguía el reparto era que la pantalla pareciera tener
    cuatro asuntos.

    Ahora las cuatro van en el azul del peso, que es el mismo que tienen en el
    resumen y en la analítica, y lo que las diferencia es lo que siempre debió
    diferenciarlas: su etiqueta.

    Y van en `MetricRow` para que la fila no se quede en tres: con datos a
    medias —hay pesajes pero todavía no hay ritmo— esto pintaba tres tarjetas y
    un hueco mudo a la derecha.

    ── Del entrenador van arriba; del cliente, debajo ────────────────────────

    Son las mismas cuatro lecturas y cambia a qué contestan.

    El entrenador abre esta pantalla para LEER: «¿cuánto pesa, a qué ritmo, cuánto
    lleva?» es la pregunta entera, y las cuatro cifras la contestan de un vistazo
    antes de bajar al detalle.

    El cliente la abre para HACER: anotar su pesaje del día y entregar la semana.
    Con las cifras arriba, su revisión empezaba por cuatro tarjetas de lectura
    —las mismas, además, que su portada ya le dice al entrar— y la casilla donde
    de verdad escribe quedaba por debajo del pliegue. Bajan detrás de su semana:
    siguen enteras, dejan de ser lo primero. Ver §10.2 del replanteamiento.
  */
  const cifras = weights.length > 0 && !oculto.weight && (
    <MetricRow>
      <MetricCard
        title="Último peso"
        subtitle={shortDate(weights[weights.length - 1].date)}
        value={fmt(weights[weights.length - 1].value, { decimals: 1 })}
        unit="kg"
        color={metricColor('weight')}
      />
      <MetricCard
        title="Media últimos 3"
        subtitle={rolling ? `${rolling.count} ${rolling.count === 1 ? 'pesaje' : 'pesajes'}` : 'sin datos'}
        value={rolling ? fmt(rolling.average, { decimals: 1 }) : '—'}
        unit={rolling ? 'kg' : ''}
        color={metricColor('weight')}
      />
      {delta && (
        <MetricCard
          title="Variación total"
          subtitle={`de ${fmt(delta.from, { decimals: 1 })} a ${fmt(delta.to, { decimals: 1 })} kg`}
          value={`${delta.delta > 0 ? '+' : ''}${fmt(delta.delta, { decimals: 1 })}`}
          unit="kg"
          color={metricColor('weight')}
        />
      )}
      {rate !== null && (
        <MetricCard
          title="Ritmo semanal"
          subtitle="promedio por semana"
          value={`${rate > 0 ? '+' : ''}${fmt(rate, { decimals: 2 })}`}
          unit="kg"
          color={metricColor('rate')}
        />
      )}
    </MetricRow>
  );

  return (
    <div className="stack">
      {!isClient && cifras}

      {/* El check-in semanal va PRIMERO: es la acción de cada semana. Entregar la
          revisión completa es puntual, así que es un botón suyo. */}
      <WeeklyCheckIn
        history={history}
        audience={audience}
        /* Cuántos pesajes pide su entrenador. Sin número, la semana no se juzga:
           ver `weighInsTarget` en `domain/protocol`. */
        target={objetivoDePesajes}
        /* Y lo que se apunta cada día con un aparato: una fila más de la misma
           rejilla, porque es el mismo gesto de la misma mañana. */
        medidas={diarias}
        onApuntarMedida={onApuntarMedida}
        onAddWeight={onAdd}
        onRemoveEntry={onRemove}
        /*
          ══ Entregar la revisión es una ACCIÓN, no una sección ═══════════════

          Era un panel estático debajo del check-in, y desde fuera no se
          distinguía de «Tu semana»: dos tarjetas seguidas del mismo tamaño
          hablando las dos de lo mismo.

          Subir las fotos y medirse es algo que se HACE, una vez por semana y de
          una sentada. Eso es un botón y un asistente, no un apartado de la
          página ocupando sitio los otros seis días.
        */
        /*
          ══ Y en el portal no va, porque ya está arriba ══════════════════════

          En «Mi revisión» esto pintaba «Entregar mi revisión» a media pantalla
          de «Entregar mi semana» —el botón grande de `ClientWeek`—, y los dos
          abrían EL MISMO asistente. Dos nombres casi iguales para un gesto
          hacen dudar de si son dos cosas distintas y de cuál es la buena: es
          exactamente el fallo que la unificación del asistente vino a quitar,
          y que sobrevivió aquí porque el botón se monta desde este lado.

          El gesto vive donde está la semana que se entrega. Y de paso se cierra
          un camino que no debía existir: reabrir el asistente con la semana ya
          entregada la reenvía, y una reentrega borra de la pantalla la
          respuesta que el entrenador ya había escrito.
        */
        action={
          isClient ? null : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAsistente(true)}>
              <Camera size={15} /> Nueva revisión
            </button>
          )
        }
      />

      {asistente && (
        <ReviewWizard
          client={client}
          history={history}
          nutritionFoto={nutritionFoto}
          audience={audience}
          save={save}
          onRetry={onRetry}
          onAdd={onAdd}
          photos={photos}
          onUploadPhoto={onUploadPhoto}
          onSetGender={onSetGender}
          onSubmitWeek={onSubmitWeek}
          weekStart={weekStart}
          weeks={weeks}
          onClose={() => setAsistente(false)}
        />
      )}

      {/* Y en el portal, las cuatro cifras aquí: detrás de la casilla donde se
          escribe el pesaje del día. Ver el porqué arriba. */}
      {isClient && cifras}

      {/*
        ══ LO MEDIDO, cada uno con su gráfica ═════════════════════════════════

        Una medida sin su serie es un número apuntado en una libreta: lo que la
        convierte en información es poder verla en el tiempo. Misma forma que la
        tendencia del peso —`BandChart`, su color, su unidad— porque son lo
        mismo, y que se lean igual es medio valor de haberlas hecho.

        Y NO SE INTERPRETA: no hay rango «normal» pintado, no hay rojo por
        salirse de nada y no hay una palabra sobre lo que significa. La ley de la
        casa, escrita en `domain/medidas.js`.
      */}
      {series.length > 0 && (
        <Panel tight className="col gap-4">
          <SectionTitle>Lo que se mide</SectionTitle>
          <div className="col gap-5">
            {series.map(({ medida, puntos }) => {
              if (oculto.medidas?.[medida.id]) return null;
              const delta = deltaDe(history, medida.id);
              const ultimo = puntos[puntos.length - 1];
              return (
                <div className="col gap-2" key={medida.id}>
                  <div className="row between wrap gap-3">
                    <span className="section-label">
                      {medida.grupo ? `${medida.grupo} · ` : ''}
                      {medida.label}
                    </span>
                    <div className="metric-figure">
                      <span className="metric-value" style={{ fontSize: 'var(--fs-md)' }}>
                        {ultimo.value}
                      </span>
                      <span className="metric-unit">{medida.unit}</span>
                      {delta && (
                        <Delta
                          value={delta.delta}
                          unit={` ${medida.unit}`}
                          lowerIsBetter={medida.sentido === 'lowerIsBetter'}
                          /* Sin sentido declarado no hay bueno ni malo: el signo
                             se dice y no se juzga. */
                          neutral={medida.sentido === 'neutral'}
                        />
                      )}
                    </div>
                  </div>
                  <BandChart
                    labels={puntos.map((p) => p.date)}
                    series={[
                      {
                        id: medida.id,
                        label: medida.label,
                        color: medidaColor(medida),
                        unit: medida.unit ? ` ${medida.unit}` : '',
                        decimals: medida.decimals,
                        points: puntos.map((p) => ({ label: p.date, value: p.value })),
                      },
                    ]}
                    height={92}
                  />
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* La tendencia ya no vive aquí: está DENTRO del check-in, con los
          pesajes de los que sale. Ver `WeeklyCheckIn`. */}

      {/* Con el peso oculto y sin medidas, cada fila sería una fecha y una
          papelera: eso no es un historial, así que no se pinta. */}
      {rows.length > 0 && !(oculto.weight && !hasMeasurements(history) && oculto.nutrition) && (
        <Panel tight className="col gap-4">
          <SectionTitle>Historial de registros</SectionTitle>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  {!oculto.weight && <th scope="col" className="num">Peso</th>}
                  {hasMeasurements(history) && (
                    <>
                      <th scope="col" className="num">% Graso</th>
                      <th scope="col" className="num">Cintura</th>
                      <th scope="col" className="num">Σ Pliegues</th>
                    </>
                  )}
                  {!oculto.nutrition && <th scope="col" className="num">Kcal</th>}
                  <th scope="col" className="num">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((log) => {
                  const logPct = fatPercent(log.skinFolds, client.gender);
                  return (
                    <tr key={log.id || log.date}>
                      <td className="cell-strong">{shortDate(log.date)}</td>
                      {!oculto.weight && (
                        <td className="num cell-weight">{fmt(log.weight, { decimals: 1 })}</td>
                      )}
                      {hasMeasurements(history) && (
                        <>
                          <td className="num cell-pct">{logPct === null ? '—' : `${logPct}%`}</td>
                          <td className="num t-secondary">
                            {fmt(log.perimeters?.ombligo, { decimals: 1 })}
                          </td>
                          <td className="num t-secondary">{foldsSum(log.skinFolds) || '—'}</td>
                        </>
                      )}
                      {!oculto.nutrition && (
                        <td className="num t-secondary">{fmt(log.nutrition?.kcals)}</td>
                      )}
                      <td className="num">
                        <button
                          type="button"
                          className="btn btn-icon btn-icon-danger"
                          onClick={() => askRemove(log)}
                          aria-label={`Borrar el registro del ${log.date}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > VISIBLES && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTodoElHistorial((v) => !v)}>
              {todoElHistorial ? 'Ver solo los últimos' : `Ver los ${rows.length} registros`}
            </button>
          )}
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
              {!isClient
                ? 'Este cliente aún no tiene ningún pesaje registrado.'
                : oculto.weight
                  ? 'Anota tu primer pesaje arriba, en el día que te peses.'
                  : 'Registra tu primer peso arriba. Con dos o tres registros ya se empieza a ver la tendencia.'}
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
};
