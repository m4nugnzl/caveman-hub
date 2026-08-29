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
import { metricColor } from '@/domain/metrics';
import { Panel, SectionTitle } from '@/components/ui/primitives';
import { MetricCard, MetricRow } from '@/components/ui/metrics';
import { useConfirm } from '@/components/ui/ConfirmProvider';
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
  nutritionPlan,
  audience = 'client',
  save,
  onRetry,
  onAdd,
  onRemove,
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
      title: '¿Eliminar este registro?',
      message: `Se borrará la medición del ${shortDate(log.date)}.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (ok) onRemove(log.id);
  };

  return (
    <div className="stack">
      {/*
        ══ Las cuatro cifras del peso ═════════════════════════════════════════

        Las CUATRO hablan del mismo dato —el peso— y salían de cuatro colores
        distintos: tiza, ámbar, rosa y azul. Eso no distingue nada, porque no hay
        nada de lo que distinguirse: no son cuatro series, son cuatro lecturas de
        una. Lo único que conseguía el reparto era que la pantalla pareciera tener
        cuatro asuntos.

        Ahora las cuatro van en el azul del peso, que es el mismo que tienen en el
        resumen y en la analítica, y lo que las diferencia es lo que siempre
        debió diferenciarlas: su etiqueta.

        Y van en `MetricRow` para que la fila no se quede en tres: con datos a
        medias —hay pesajes pero todavía no hay ritmo— esto pintaba tres tarjetas
        y un hueco mudo a la derecha.
      */}
      {weights.length > 0 && (
        <MetricRow>
          <MetricCard
            title="Último peso"
            subtitle={weights[weights.length - 1].date}
            value={fmt(weights[weights.length - 1].value, { decimals: 1 })}
            unit="kg"
            color={metricColor('weight')}
          />
          <MetricCard
            title="Media últimos 3"
            subtitle={rolling ? `${rolling.count} ${rolling.count === 1 ? 'pesaje' : 'pesajes'}` : 'sin datos'}
            value={rolling ? rolling.average : '—'}
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
              value={`${rate > 0 ? '+' : ''}${rate}`}
              unit="kg"
              color={metricColor('rate')}
            />
          )}
        </MetricRow>
      )}

      {/* El check-in semanal va PRIMERO: es la acción de cada semana. Entregar la
          revisión completa es puntual, así que es un botón suyo. */}
      <WeeklyCheckIn
        history={history}
        audience={audience}
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
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAsistente(true)}>
            <Camera size={14} /> {isClient ? 'Entregar mi revisión' : 'Nueva revisión'}
          </button>
        }
      />

      {asistente && (
        <ReviewWizard
          client={client}
          history={history}
          nutritionPlan={nutritionPlan}
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
                {filas.map((log) => {
                  const logPct = fatPercent(log.skinFolds, client.gender);
                  return (
                    <tr key={log.id || log.date}>
                      <td className="cell-strong">{shortDate(log.date)}</td>
                      <td className="num cell-weight">{fmt(log.weight, { decimals: 1 })}</td>
                      {hasMeasurements(history) && (
                        <>
                          <td className="num cell-pct">{logPct === null ? '—' : `${logPct}%`}</td>
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
