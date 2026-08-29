import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarClock, Receipt, TrendingUp, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabaseClient';
import { mapPaymentFromDb } from '@/lib/mappers';
import {
  FORECAST_MONTHS,
  HISTORY_MONTHS,
  byPeriod,
  collectionBoard,
  concentration,
  forecast,
  incomePerClient,
  money,
  paymentsByMonth,
  paymentsTotals,
  recurringMonthly,
} from '@/domain/money';
import { feeLabel } from '@/domain/billing';
import { clientPath } from '@/routes';
import { addMonths, shortDate, todayISO } from '@/lib/dates';
import { useToast } from '@/components/ui/ToastProvider';
import { BarBandChart, MeterList } from '@/components/ui/charts';
import { ChartCard, RangeChips } from '@/components/ui/ChartCard';
import { Delta, MetricRow, MetricCard } from '@/components/ui/metrics';
import { EmptyState, GroupHead, Loading, Notice, PageHead, Panel } from '@/components/ui/primitives';

/*
  ══ Por qué esta pantalla existe ═════════════════════════════════════════════

  Un entrenador tenía en la aplicación TODOS los datos de sus ingresos y ninguna
  forma de verlos juntos: la tarifa vive en la ficha de cada cliente, el
  vencimiento en la bandeja de «Hoy» y el histórico en una tabla que no pintaba
  nadie. La única pregunta económica de su semana —«¿cuánto voy a ingresar este
  mes y quién me debe?»— obligaba a entrar cliente por cliente y sumar de
  memoria, que es exactamente la hoja de cálculo aparte que el producto vino a
  sustituir.

  ── Por qué es una sección de nivel 1 y no un apartado de Ajustes ───────────
  Porque Ajustes es lo que se configura una vez y no se toca a diario, y esto es
  de cada semana. Y porque no repite a las otras tres, que es la prueba que
  tuvieron que pasar «Cartera» y «Calendario»: «Hoy» cuenta lo que HA PASADO,
  «Clientes» lo que FALTA, «Calendario» lo que VIENE, y ésta CUÁNTO. Ninguna de
  las cuatro contesta la de otra.

  ── El orden de la pantalla, que es el de las preguntas ─────────────────────
  Cuatro cifras · lo que hay que cobrar · lo que va a entrar · lo que entró · de
  qué depende. Primero lo accionable y luego lo que solo se mira: una deuda se
  reclama, un histórico no.

  Y las dos series NO se mezclan en una gráfica. Una previsión y un ingreso son
  cosas distintas, y una sola línea que cambia de significado a mitad de camino
  es la forma más rápida de que alguien lea como cobrado algo que solo está
  previsto.

  ── Y lo que esta pantalla NO es ────────────────────────────────────────────
  No es tu facturación como cliente de Caveman Hub: eso es Ajustes → Plan, y son
  dos dineros distintos que no se suman nunca (ver la cabecera de
  `domain/money.js`). Tampoco es una contabilidad: no emite facturas, no calcula
  IVA y no sustituye a una gestoría. Es el cuadro de mando de lo que cobras.
*/

/** Cuántos meses se pueden mirar hacia atrás. */
const TRAMOS = [
  { id: 6, label: '6 meses' },
  { id: HISTORY_MONTHS, label: '12 meses' },
  { id: 24, label: '2 años' },
];

/**
 * Una fila del tablero de cobros: quién, cuánto, desde cuándo y el botón.
 *
 * El botón hace lo MISMO que el de la bandeja de «Hoy» y el de la ficha —la
 * acción `markClientPaid`— porque es el mismo gesto. Tres pantallas con tres
 * formas de dar por cobrado algo acabarían dejando tres estados distintos.
 */
const FilaDeCobro = ({ fila, onPaid }) => (
  <div className="list-row" key={fila.client.id}>
    <span className="list-row-label">
      <Link className="title" to={clientPath(fila.client.id, 'ficha')}>
        {fila.client.name}
      </Link>
      <span className="sub">
        {fila.estado.label}
        {fila.client.billingPeriod ? ` · ${feeLabel(fila.client)}` : ''}
      </span>
    </span>

    <span className="row-value">{money(fila.amount)}</span>

    <button type="button" className="chip" onClick={() => onPaid(fila.client.id)}>
      Cobrado
    </button>
  </div>
);

export const IncomePanel = () => {
  const { clients, markClientPaid } = useApp();
  const toast = useToast();

  const [payments, setPayments] = useState(null);
  const [error, setError] = useState(null);
  const [meses, setMeses] = useState(HISTORY_MONTHS);

  const today = todayISO();

  /*
    El histórico se pide AQUÍ y no en el arranque de la aplicación, que es la
    convención de las pantallas que traen datos suyos (Ajustes → Equipo, el panel
    de datos de un cliente). Son filas que solo mira esta pantalla y que crecen
    con los años: meterlas en `AppContext` haría más lento el arranque de todo el
    mundo para que la mayoría no las abra nunca.

    El tramo va en la consulta y no en un filtro del navegador por lo mismo:
    pedir dos años de cobros para dibujar seis meses es tráfico que no se usa.
  */
  const cargar = useCallback(async (tramo) => {
    setError(null);

    const desde = addMonths(`${todayISO().slice(0, 7)}-01`, -(tramo - 1));
    const { data, error: err } = await supabase
      .from('client_payments')
      .select(
        'id, client_id, external_label, amount, currency, paid_on, period_end, status, is_paid, source, payment_failed, subscription_status'
      )
      .gte('paid_on', desde)
      .order('paid_on', { ascending: false });

    if (err) {
      /* Se dice qué ha fallado y se deja la pantalla en pie: el recurrente y los
         cobros pendientes salen de `clients`, que ya está cargado, así que la
         mitad útil de la pantalla funciona sin esto. Vaciar todo por un fallo del
         histórico sería castigar lo que sí se puede contestar. */
      setError(err.message || 'No se ha podido cargar el histórico de cobros.');
      setPayments([]);
      return;
    }

    setPayments((data || []).map(mapPaymentFromDb));
  }, []);

  useEffect(() => {
    cargar(meses);
  }, [cargar, meses]);

  const recurrente = useMemo(() => recurringMonthly(clients), [clients]);
  const tablero = useMemo(() => collectionBoard(clients, today), [clients, today]);
  const reparto = useMemo(() => byPeriod(clients), [clients]);
  const riesgo = useMemo(() => concentration(clients), [clients]);
  const prevision = useMemo(() => forecast(clients, { months: FORECAST_MONTHS, today }), [clients, today]);

  const serie = useMemo(
    () => paymentsByMonth(payments || [], { months: meses, today }),
    [payments, meses, today]
  );
  const totales = useMemo(() => paymentsTotals(payments || []), [payments]);
  const porCliente = useMemo(() => incomePerClient(payments || [], clients), [payments, clients]);

  /* El mes en curso es la última casilla de la serie: no se vuelve a sumar por
     separado, que es como acaban existiendo dos cifras del mismo mes. */
  const esteMes = serie.at(-1);
  const mesPasado = serie.at(-2);

  /*
    La variación contra el mes anterior, y solo cuando ese mes tuvo cobros. Con un
    mes anterior a cero el porcentaje es infinito, y «+∞ %» en la casilla donde se
    espera un dato es peor que no enseñar nada. Tampoco se pinta en los primeros
    días del mes con un criterio distinto: un mes empezado va por detrás de uno
    entero y eso es información, no un error — lo dice el pie de la tarjeta.
  */
  const variacion =
    payments !== null && mesPasado?.total > 0
      ? {
          value: (esteMes?.total ?? 0) - mesPasado.total,
          percent: (((esteMes?.total ?? 0) - mesPasado.total) / mesPasado.total) * 100,
        }
      : null;

  /* La previsión del mes que viene: la primera casilla que no es el mes en curso.
     Es la cifra con la que se decide si hace falta buscar a alguien. */
  const mesQueViene = prevision[1];

  const cobrar = (clientId) => {
    const res = markClientPaid(clientId);
    if (res?.ok === false) {
      setError(res.error);
      return;
    }

    const nombre = clients.find((c) => c.id === clientId)?.name || 'el cliente';
    toast({
      text: `Cobro de ${nombre} anotado y fecha adelantada.`,
      action: { label: 'Deshacer', onClick: () => res.undo().then(() => cargar(meses)) },
    });

    /* El apunte acaba de entrar en la tabla y la gráfica está dibujada con lo que
       había antes. Se recarga cuando el servidor confirma —no antes— para que lo
       que se ve sea lo que hay guardado y no una suma optimista. */
    res.apunte.then(() => cargar(meses));
  };

  return (
    <div className="stack">
      <PageHead
        title="Ingresos"
        sub="Lo que factura tu cartera, lo que falta por cobrar y lo que ha entrado. No es tu plan de Caveman Hub: eso está en Ajustes."
      />

      {error && <Notice tone="error">{error}</Notice>}

      {/*
        Las cuatro cifras de cabecera, en el orden en que se preguntan: cuánto
        vale la cartera, cuánto ha entrado este mes, cuánto falta por cobrar y
        cuánto toca el mes que viene. Dos de compromiso y dos de hecho — y el
        subtítulo de cada una dice de cuál se trata, porque mezclarlas es el
        error que convierte una previsión en un ingreso.
      */}
      <MetricRow>
        <MetricCard
          title="Recurrente al mes"
          subtitle="Previsión, no cobrado"
          value={money(recurrente.total)}
          foot={
            recurrente.missing > 0
              ? `De ${recurrente.counted} de tus ${recurrente.clients} clientes. A ${recurrente.missing} les falta la tarifa en su ficha.`
              : `De los ${recurrente.counted} clientes con tarifa anotada.`
          }
        />
        <MetricCard
          title="Cobrado este mes"
          subtitle="Hecho"
          value={payments === null ? '—' : money(esteMes?.total ?? 0)}
          /* La variación contra el mes anterior es lo que convierte una cifra en
             una tendencia. Va aquí y no en su propia tarjeta: es el mismo dato
             mirado de otra forma, y separarlo obligaría a compararlas a ojo. */
          delta={variacion ? <Delta value={variacion.value} unit=" €" percent={variacion.percent} decimals={0} /> : null}
          foot={
            esteMes?.count
              ? `${esteMes.count} ${esteMes.count === 1 ? 'cobro apuntado' : 'cobros apuntados'}${mesPasado?.total > 0 ? `, contra ${money(mesPasado.total)} el mes pasado — que está entero.` : '.'}`
              : 'Todavía no has apuntado ningún cobro este mes.'
          }
        />
        <MetricCard
          title="Por cobrar"
          subtitle="Vencido y de hoy"
          value={money(tablero.overdueTotal + tablero.dueTotal)}
          color={tablero.pending.length > 0 ? 'var(--negative)' : undefined}
          foot={
            tablero.pending.length > 0
              ? `${tablero.pending.length} ${tablero.pending.length === 1 ? 'cliente' : 'clientes'}. Otros ${tablero.soon.length} renuevan en unos días.`
              : 'Nadie te debe nada ahora mismo.'
          }
        />
        {/*
          La cuarta es la única que mira hacia delante, y es la que decide si hay
          que hacer algo: un mes que viene flojo se arregla buscando gente ahora,
          no cuando llegue. El recurrente no lo dice —promedia— y el histórico
          tampoco, porque todavía no ha pasado.
        */}
        <MetricCard
          title="Toca cobrar el mes que viene"
          subtitle="Previsión"
          value={money(mesQueViene?.total ?? 0)}
          foot={
            mesQueViene?.count
              ? `${mesQueViene.count} ${mesQueViene.count === 1 ? 'cobro' : 'cobros'} con fecha puesta. Da por hecho que todos pagan.`
              : 'Ningún cobro con fecha en ese mes.'
          }
        />
      </MetricRow>

      {/*
        Lo que hay que cobrar va inmediatamente después de las cifras y antes que
        cualquier gráfico: es lo único de esta pantalla que es TRABAJO. Un
        histórico se mira; una deuda se reclama.
      */}
      <section className="stack">
        <GroupHead
          title="Por cobrar"
          sub="Lo vencido y lo que vence hoy. El botón es el mismo gesto que en «Hoy» y en la ficha."
        />

        {tablero.pending.length === 0 ? (
          <Panel tight>
            <EmptyState
              icon={Banknote}
              title="No hay nada pendiente"
              message="Ningún cobro ha vencido. Los que renuevan en los próximos días salen más abajo."
            />
          </Panel>
        ) : (
          <Panel tight>
            <div className="list">
              {tablero.pending.map((fila) => (
                <FilaDeCobro key={fila.client.id} fila={fila} onPaid={cobrar} />
              ))}
            </div>
          </Panel>
        )}

        {tablero.soon.length > 0 && (
          <Panel tight title="Renuevan pronto" sub={`${money(tablero.soonTotal)} en los próximos días.`}>
            <div className="list">
              {tablero.soon.map((fila) => (
                <div className="list-row" key={fila.client.id}>
                  <span className="list-icon">
                    <CalendarClock size={14} />
                  </span>
                  <span className="list-row-label">
                    <Link className="title" to={clientPath(fila.client.id, 'ficha')}>
                      {fila.client.name}
                    </Link>
                    <span className="sub">{fila.estado.label}</span>
                  </span>
                  <span className="row-value">{money(fila.amount)}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </section>

      {/*
        La previsión va ANTES del histórico porque se puede actuar sobre ella y
        sobre el histórico no. Y va en su propia gráfica, no pegada al pasado en
        una sola línea: es la regla de esta pantalla —lo previsto y lo cobrado no
        se mezclan— y una serie que cambia de significado a media altura es
        justo lo que hace que alguien cuente como ingreso algo que no ha entrado.
      */}
      {prevision.some((mes) => mes.total > 0) && (
        <section className="stack">
          <GroupHead
            title="Lo que va a entrar"
            sub="Los cobros que ya tienen fecha, mes a mes. Da por hecho que todo el mundo paga y que nadie se va."
          />

          <ChartCard
            icon={CalendarClock}
            title="Previsión de cobros"
            subtitle="Cada cobro en el mes en que toca, sin promediar. Es lo que enseña los meses valle."
            note="Un cliente anual aporta al recurrente todos los meses, pero su dinero entra uno solo. Quien no tenga fecha de cobro en su ficha no aparece aquí."
          >
            <BarBandChart
              bars={prevision.map((mes) => ({ label: mes.label, value: mes.total }))}
              unit=" €"
              emptyMessage="Ningún cliente tiene todavía una fecha de cobro puesta."
            />
          </ChartCard>
        </section>
      )}

      <section className="stack">
        <GroupHead title="Lo que ha entrado" sub="El histórico de cobros, apuntados a mano o traídos por una integración." />

        {payments === null ? (
          <Panel tight>
            <Loading label="Cargando el histórico…" />
          </Panel>
        ) : (
          <>
            <ChartCard
              icon={TrendingUp}
              title="Ingresos por mes"
              subtitle="Solo lo cobrado. Los meses en blanco son meses sin ningún cobro apuntado."
              controls={<RangeChips value={meses} onChange={setMeses} options={TRAMOS} />}
              /*
                El total del tramo va al pie de su propia gráfica y no a una
                tarjeta de cabecera: describe estos datos, cambia cuando se cambia
                el tramo, y arriba obligaría a acordarse de qué tramo estaba
                puesto para poder leerla.

                El reparto entre conciliado y apuntado a mano dice cuánto te
                puedes creer la cifra, que es lo que hace falta saber antes de
                usarla para nada.
              */
              note={[
                totales.count > 0
                  ? `${money(totales.total)} en ${totales.count} cobros. ${
                      totales.manualCount > 0
                        ? `${money(totales.manual)} apuntados a mano y ${money(totales.integration)} conciliados por una integración.`
                        : 'Todos conciliados por una integración.'
                    }`
                  : null,
                totales.unmatched > 0
                  ? `${totales.unmatched} cobros importados siguen sin cliente asignado, así que no aparecen en el reparto por cliente. Se concilian en Ajustes → Integraciones.`
                  : null,
              ]
                .filter(Boolean)
                .join(' ') || undefined}
            >
              <BarBandChart
                bars={serie.map((mes) => ({ label: mes.label, value: mes.total }))}
                unit=" €"
                emptyMessage="Todavía no hay ningún cobro apuntado."
              />
            </ChartCard>

            <Panel
              tight
              title="Por cliente"
              sub="Cuánto ha pagado cada uno en el tramo. No es rentabilidad: la aplicación no sabe lo que te cuesta llevar a cada persona."
            >
              {porCliente.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="Sin cobros que repartir"
                  message="En cuanto marques un cobro como hecho, aparecerá aquí."
                />
              ) : (
                <div className="list">
                  {porCliente.map((fila) => (
                    <div className="list-row" key={fila.clientId}>
                      <span className="list-row-label">
                        <Link className="title" to={clientPath(fila.clientId, 'ficha')}>
                          {fila.name}
                        </Link>
                        <span className="sub">
                          {fila.count} {fila.count === 1 ? 'cobro' : 'cobros'}
                          {fila.last ? ` · el último el ${shortDate(fila.last)}` : ''}
                        </span>
                      </span>
                      <span className="row-value">{money(fila.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </>
        )}
      </section>

      {/*
        El reparto por periodicidad va el último porque contesta la pregunta más
        lenta de las cuatro: no «cuánto gano» sino «de qué depende lo que gano».
        Un recurrente con la mitad en anuales no se comporta como uno todo
        mensual, aunque la cifra grande sea la misma.
      */}
      {reparto.length > 0 && (
        <Panel
          title="De dónde sale el recurrente"
          sub="Cuánto aporta al mes cada periodicidad. Los pagos únicos no salen: no se repiten."
        >
          <MeterList
            items={reparto.map((fila) => ({
              label: `${fila.label} · ${fila.clients} ${fila.clients === 1 ? 'cliente' : 'clientes'}`,
              value: Math.round(fila.monthly),
              pct: recurrente.total > 0 ? (fila.monthly / recurrente.total) * 100 : 0,
              /* Sin color propio: el medidor ya trae el suyo, y es el mismo con
                 el que esta pantalla dibuja el dinero dos paneles más arriba.
                 Aquí ponía `--accent` —tinta plena— y tres barras negras a lo
                 ancho eran lo más pesado de Cobros para decir un reparto. */
            }))}
          />

          {/*
            La concentración va aquí abajo y en voz baja, sin color de alarma. Es
            la única cifra de la pantalla que habla de RIESGO y no de tarea: no se
            arregla pulsando nada, se tiene en cuenta al decidir a quién buscar.
            Pintarla en rojo la convertiría en un pendiente que nadie puede cerrar.
          */}
          {riesgo && (
            <p className="t-xs t-tertiary">
              Tus {riesgo.top} clientes más grandes son {money(riesgo.amount)} de esos{' '}
              {money(riesgo.total)}: el {Math.round(riesgo.share)} % de tu recurrente depende de ellos.
            </p>
          )}
        </Panel>
      )}

      {/*
        La nota del final y no un aviso arriba: quien no tiene ninguna tarifa
        anotada ve una pantalla llena de ceros, y eso ya lo dice. Lo que hace
        falta es saber dónde se arregla.
      */}
      {recurrente.missing > 0 && (
        <Notice tone="info">
          A {recurrente.missing} {recurrente.missing === 1 ? 'cliente' : 'clientes'} les falta la tarifa o la
          periodicidad en su ficha, así que no cuentan en el recurrente. Se anota en su ficha, en «Cobro».
        </Notice>
      )}

      {clients.length === 0 && (
        <Panel tight>
          <EmptyState
            icon={Users}
            title="Todavía no hay cartera"
            message="Cuando des de alta a tu primer cliente y le pongas su tarifa, esta pantalla empieza a contar."
            action={
              <Link className="btn btn-primary" to="/clientes">
                Ir a clientes
              </Link>
            }
          />
        </Panel>
      )}
    </div>
  );
};
