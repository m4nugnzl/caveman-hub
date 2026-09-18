import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Plus, Receipt, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabaseClient';
import { mapPaymentFromDb } from '@/lib/mappers';
import { traduceDbError } from '@/lib/dbErrors';
import {
  FORECAST_MONTHS,
  HISTORY_MONTHS,
  collectionBoard,
  concentration,
  forecast,
  incomePerClient,
  money,
  monthlyFee,
  paymentsByMonth,
  paymentsTotals,
  recurringMonthly,
} from '@/domain/money';
import { feeLabel, paymentState } from '@/domain/billing';
import { clientPath } from '@/routes';
import { LOCALE, addMonths, shortDate, todayISO } from '@/lib/dates';
import { useToast } from '@/components/ui/ToastProvider';
import { BarBandChart } from '@/components/ui/charts';
import { RangeChips } from '@/components/ui/ChartCard';
import { Delta } from '@/components/ui/metrics';
import { Modal } from '@/components/ui/Modal';
import { Cinta } from '@/components/ui/Cinta';
import { EmptyState, Loading, Notice } from '@/components/ui/primitives';

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

/** «2026-10-01» → «1 de octubre». La fecha de un cobro, dicha entera. */
const diaYMes = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** «2026-01» → «Enero». El mes de la previsión, cuando va en una frase. */
const nombreDelMes = (clave) => {
  const nombre = new Date(`${clave}-01T00:00:00Z`).toLocaleDateString(LOCALE, { month: 'long', timeZone: 'UTC' });
  return nombre[0].toUpperCase() + nombre.slice(1);
};

/*
  ══ LAS PIEZAS DE LA PANTALLA (frame 164:2160 de Figma, 18 sep 2026) ═══════
  Cobros pasa de bandas sueltas sobre el papel a CAJAS sobre una hoja hundida,
  como la cartera: las cifras de cabecera, la previsión y de dónde sale el
  recurrente son cada una su caja. Las piezas son de esta pantalla y viven
  aquí: `MetricCard` y `ChartCard` siguen como estaban para las otras que las
  montan (el panel de plataforma, la antropometría).
*/

/** La chapa de una caja: la cifra que resume lo que hay debajo. */
const Chapa = ({ tono = 'info', children }) => <span className={`cobros-chapa is-${tono}`}>{children}</span>;

/** Una caja con su titular, su frase y, si la trae, su chapa o su mando. */
const Caja = ({ titulo, sub, chapa = null, accion = null, className = '', children }) => (
  <section className={['cobros-caja', className].filter(Boolean).join(' ')}>
    <header className="cobros-caja-cab">
      <div className="cobros-caja-rotulo">
        <h2>{titulo}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {chapa}
      {accion}
    </header>
    {children}
  </section>
);

/** Una cifra de cabecera: qué es, cuánto, y de dónde sale. */
const Cifra = ({ titulo, chapa = null, valor, color, delta = null, pie, children }) => (
  <article className="cobros-caja cobros-cifra">
    <header className="cobros-cifra-cab">
      <h2>{titulo}</h2>
      {chapa}
    </header>
    <p className="cobros-cifra-valor">
      <span style={color ? { color } : undefined}>{valor}</span>
      {delta}
    </p>
    {pie && <p className="cobros-cifra-pie">{pie}</p>}
    {children}
  </article>
);

/** Una barra de proporción. La cifra la dice quien la monta, al lado. */
const Medidor = ({ pct, color, etiqueta }) => (
  <span className="cobros-medidor" role="img" aria-label={etiqueta}>
    <span style={{ width: `${Math.max(0, Math.min(100, pct))}%`, ...(color ? { background: color } : {}) }} />
  </span>
);

/**
 * La previsión en columnas, con la cifra encima de cada una.
 *
 * No es `BarBandChart`: son seis meses, y a seis columnas la cifra cabe
 * escrita sobre su barra, que es lo que dibuja el frame. Un eje con tres
 * rayas obliga a leer la altura contra una regla; la cifra encima se lee sin
 * más. Los meses a cero se dejan como un filete a ras: el valle es el dato.
 */
const ColumnasDePrevision = ({ meses }) => {
  const tope = Math.max(...meses.map((m) => m.total), 1);
  return (
    <figure
      className="cobros-columnas"
      role="img"
      aria-label={`Previsión por mes: ${meses.map((m) => `${m.label}, ${money(m.total)}`).join('; ')}`}
    >
      {meses.map((mes) => (
        <div className={`cobros-columna${mes.total > 0 ? '' : ' is-cero'}`} key={mes.month}>
          <div className="cobros-columna-pista">
            {mes.total > 0 && <span className="cobros-columna-cifra">{money(mes.total)}</span>}
            <span className="cobros-columna-barra" style={{ '--alto': mes.total / tope }} />
          </div>
          <span className="cobros-columna-mes">{mes.label}</span>
        </div>
      ))}
    </figure>
  );
};

/**
 * En qué punto está el ciclo de un cliente, dicho en una chapa.
 *
 * «Cobrado» es lo que ya ha entrado de este ciclo; lo vencido y lo de hoy
 * toman el semáforo porque son una tarea. El resto es «Pendiente» en gris: no
 * se ha cobrado, pero tampoco toca todavía, y pintarlo en ámbar sería juzgar
 * una fecha que no ha llegado.
 */
const estadoDelCiclo = (client, today) => {
  if (client.paymentStatus === 'paid') return { texto: 'Cobrado', tono: 'ok' };
  const estado = paymentState(client, today);
  if (estado.state === 'overdue') return { texto: 'Vencido', tono: 'bad' };
  if (estado.state === 'due') return { texto: 'Vence hoy', tono: 'warn' };
  return { texto: 'Pendiente', tono: 'neutro' };
};

/** Cuántas personas enseña de entrada la lista del recurrente. */
const FILAS_DEL_RECURRENTE = 6;

/**
 * Una fila del tablero de cobros: quién, cuánto, desde cuándo y el botón.
 *
 * El botón hace lo MISMO que el de la bandeja de «Hoy» y el de la ficha —la
 * acción `markClientPaid`— porque es el mismo gesto. Tres pantallas con tres
 * formas de dar por cobrado algo acabarían dejando tres estados distintos.
 */
const FilaDeCobro = ({ client, detalle, amount, onPaid }) => (
  <div className="list-row">
    <span className="list-row-label">
      <Link className="title" to={clientPath(client.id, 'ficha')}>
        {client.name}
      </Link>
      <span className="sub">{detalle}</span>
    </span>

    <span className="row-value">{money(amount)}</span>

    {onPaid && (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPaid(client.id)}>
        Cobrado
      </button>
    )}
  </div>
);

/**
 * «Registrar cobro»: el mismo gesto que el botón de cada fila, para quien no
 * sale en ninguna — el que paga por adelantado, el que paga sin fecha puesta.
 *
 * No crea un apunte suelto: marca cobrado al cliente, que es lo que apunta el
 * cobro en el libro y adelanta su fecha. Un segundo camino que solo escribiera
 * en el libro dejaría la ficha diciendo «Vencido» de alguien que ya ha pagado.
 * La hoja se queda abierta: se cobra a varios seguidos.
 */
const RegistrarCobro = ({ clients, today, onPaid, onClose }) => {
  const filas = useMemo(() => {
    const peso = (client) => {
      const estado = paymentState(client, today).state;
      return estado === 'overdue' || estado === 'due' ? 0 : 1;
    };
    return [...clients].sort((a, b) => peso(a) - peso(b) || a.name.localeCompare(b.name));
  }, [clients, today]);

  return (
    <Modal
      title="Registrar cobro"
      sub="Marca a quién le has cobrado. Se apunta en el histórico y su fecha pasa al ciclo siguiente."
      onClose={onClose}
    >
      <div className="list">
        {filas.map((client) => (
          <FilaDeCobro
            key={client.id}
            client={client}
            detalle={`${paymentState(client, today).label} · ${feeLabel(client)}`}
            amount={client.feeAmount}
            onPaid={onPaid}
          />
        ))}
      </div>
    </Modal>
  );
};

/**
 * Qué se le dice a un entrenador cuando el histórico no ha podido cargarse.
 *
 * Lo de leer no es lo mismo que lo de guardar, y `traduceDbError` está escrito
 * para lo segundo («no tienes permiso para GUARDAR esto»), así que el caso de
 * permisos se dice aquí con las palabras de esta pantalla. Para todo lo demás
 * —sin red, migración sin aplicar— la traducción compartida ya es la correcta y
 * no se duplica.
 */
const mensajeDeCarga = (err) => {
  const code = err?.code || '';
  const message = err?.message || '';
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'No se ha podido leer tu histórico de cobros: esta cuenta no tiene permiso sobre esos datos. Lo de arriba —lo recurrente y lo que está por cobrar— sale de tus clientes y sí es correcto. Si esto no debería pasar, escríbenos desde Ajustes → Ayuda.';
  }
  return traduceDbError(err) || 'No se ha podido cargar el histórico de cobros.';
};

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
         histórico sería castigar lo que sí se puede contestar.

         ── Pero lo que se dice es una frase, no el error de Postgres ─────────
         Aquí se pintaba `err.message` tal cual, y por eso esta pantalla llegó a
         enseñarle a un entrenador «permission denied for table client_payments».
         Eso no es un mensaje: es una traza. No dice qué ha pasado en sus
         términos, no dice qué hacer, y de paso publica el nombre de una tabla.

         El texto técnico no se pierde —va a la consola, que es donde sirve para
         algo— y en pantalla queda lo que la persona necesita: qué se ha quedado
         sin cargar, qué SÍ es fiable de lo que está viendo, y qué hacer. */
      console.error('client_payments:', err);
      setError(mensajeDeCarga(err));
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

  /*
    ── Solo lo vivo es tarjeta, también aquí ──────────────────────────────────
    La misma ley que las colas de Inicio: una cifra de cabecera existe si su
    dato de fondo existe. «Cobrado este mes: 0 €» es información cuando hay un
    histórico detrás (un mes flojo se ve); en una cuenta sin un solo cobro es
    una tarjeta gastada en anunciar que no hay nada — y en la demo eran las
    cuatro. Vivo no significa «mayor que cero»: significa que hay tarifas, hay
    histórico, hay vencimientos o hay fechas.
  */
  const hayTarifas = recurrente.counted > 0;
  const hayHistorico = payments !== null && totales.count > 0;
  const hayVencimientos = tablero.pending.length > 0 || tablero.soon.length > 0;
  const hayPrevision = prevision.some((mes) => mes.total > 0);
  const cifrasVivas = hayTarifas || hayHistorico || hayVencimientos || hayPrevision;

  /*
    ── Por cobrar: la tinta es de la CIFRA, no de la lista ────────────────────
    El rojo lo decidía `pending.length`, y esas dos cosas no son la misma: un
    cliente vencido al que le falta la tarifa en su ficha suma cero, así que la
    tarjeta pintaba «0 €» en rojo. Es el semáforo juzgando un cero — un reproche
    por algo que no ha pasado, en la tinta que esta casa reserva para lo que va
    mal de verdad. Una deuda de cero euros no es una deuda.

    Y cuando no queda nada que sumar —todos los vencidos sin tarifa— la cifra
    tampoco es cero: es que NO SE SABE. Eso se dice con la raya, la misma que
    usa el histórico mientras carga, y el pie explica qué falta para poder
    contarlo. Un cero ahí sería decir que no te deben nada, que es falso.
  */
  const porCobrar = tablero.overdueTotal + tablero.dueTotal;
  const sinTarifa = tablero.pending.filter((fila) => !fila.amount).length;

  const pieDePorCobrar = () => {
    const n = tablero.pending.length;
    if (n === 0) return 'Nadie te debe nada ahora mismo.';

    const quienes = n === 1 ? '1 cliente.' : `${n} clientes.`;
    /* «Otros 0 renuevan en unos días» es contar una ausencia: si no hay nadie
       cerca de renovar, la frase no existe. */
    const luego =
      tablero.soon.length === 0
        ? ''
        : tablero.soon.length === 1
          ? ' Otro renueva en unos días.'
          : ` Otros ${tablero.soon.length} renuevan en unos días.`;
    const falta =
      sinTarifa === 0
        ? ''
        : sinTarifa === 1
          ? ' A uno le falta la tarifa en su ficha, así que lo suyo no entra en la suma.'
          : ` A ${sinTarifa} les falta la tarifa en su ficha, así que lo suyo no entra en la suma.`;

    return `${quienes}${luego}${falta}`;
  };

  const [registrando, setRegistrando] = useState(false);
  const [recurrenteEntero, setRecurrenteEntero] = useState(false);

  /* Quién puede cobrar algo: tiene importe en su ficha, sea recurrente o único. */
  const conImporte = useMemo(
    () => clients.filter((c) => c.status !== 'archived' && Number.isFinite(Number(c.feeAmount)) && c.feeAmount !== null && c.feeAmount !== ''),
    [clients]
  );

  /*
    ── De dónde sale el recurrente: las personas, no las periodicidades ──────
    Aquí hubo un reparto por periodicidad (mensual / trimestral / anual). El
    frame lo cambia por la lista de quién aporta y cómo va su ciclo, que es
    la pregunta que se hace al mirar el recurrente: ¿esto de quién es y está
    cobrado? La periodicidad no se pierde: va en el `title` de cada importe.
  */
  const aportan = useMemo(
    () =>
      clients
        .filter((c) => c.status !== 'archived' && monthlyFee(c) !== null)
        .map((client) => ({ client, mensual: monthlyFee(client), estado: estadoDelCiclo(client, today) }))
        .sort((a, b) => b.mensual - a.mensual || a.client.name.localeCompare(b.client.name)),
    [clients, today]
  );
  const cobradoMensual = aportan.filter((f) => f.estado.tono === 'ok').reduce((n, f) => n + f.mensual, 0);
  const pendienteMensual = recurrente.total - cobradoMensual;

  /* La previsión en cifras que se leen sin la gráfica: la media del tramo y el
     primer mes que sube sobre el anterior. Sin subida no hay «salto» que contar,
     y la casilla no sale. */
  const previsionTotal = prevision.reduce((n, mes) => n + mes.total, 0);
  const salto = prevision.findIndex((mes, i) => i > 0 && mes.total > prevision[i - 1].total);

  /* El siguiente cobro con fecha, para la línea de «al día». */
  const siguienteCobro = prevision.flatMap((mes) => mes.cobros).find((c) => c.date >= today) || null;

  const cobrosDelMesQueViene = mesQueViene?.cobros || [];

  return (
    <div className="stack cascada">
      <div className="cobros">
      {/* ── La misma cinta que Clientes y el Taller ────────────────────────
          Cobros era una de las dos pantallas del panel que seguían con la
          cabecera vieja: titular de 42 px en la fuente ancha, suelto sobre el
          cuerpo. Sus vecinas de la barra —Clientes arriba, Protocolos abajo—
          llevaban la cinta desde hace tandas, así que bajar de una a otra
          cambiaba el tamaño del nombre y su posición. Es la misma queja que ya
          se pagó en `/clientes` («están en distinta posición que resumen»), y
          la respuesta es la misma pieza: `ui/Cinta`.

          El frame dibuja la cabecera como una caja con icono y subtítulo; no
          se copia, por la misma razón que en la cartera (18 sep): «la cabecera
          no se rediseña por pantalla». Lo que sí se toma es su verbo,
          «Registrar cobro», en la esquina de la cinta. */}
      <Cinta
        titulo="Cobros"
        accion={
          conImporte.length > 0 && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setRegistrando(true)}>
              <Plus size={15} /> Registrar cobro
            </button>
          )
        }
      />

      {/* El cuerpo, con el sangrado de la casa. */}
      <div className="cartera-cuerpo cobros-cuerpo">
        {error && <Notice tone="error">{error}</Notice>}

      {/*
        ── La tarea, cuando la pantalla aún no puede contar nada ──────────────
        Sin una sola tarifa anotada no hay recurrente, ni previsión, ni
        recordatorio: la única verdad útil de la pantalla es esa carencia, y se
        dice UNA vez, como tarea con su gesto — no como cuatro ceros con una
        nota al pie. Con tarifas a medias, la nota «Atención» del recurrente
        sigue haciendo ese trabajo.
      */}
      {clients.length > 0 && !hayTarifas && recurrente.missing > 0 && (
        <div className="cobros-caja cobros-tarea">
          <span className="cifra">{recurrente.missing}</span>
          <p>
            {recurrente.missing === 1 ? 'ficha sin tarifa' : 'fichas sin tarifa'}
            <span>
              Sin tarifa no hay previsión ni recordatorio: es lo único que esta pantalla necesita de
              ti hoy. Se anota en cada ficha, en «Cobro».
            </span>
          </p>
          <Link className="btn btn-primary btn-sm" to="/clientes">
            Poner tarifas
          </Link>
        </div>
      )}

      {/*
        Lo que hay que cobrar va ARRIBA, antes que las cifras: es lo único de
        esta pantalla que es TRABAJO. Un histórico se mira; una deuda se
        reclama.

        ── Y al día, la sección entera es un renglón ─────────────────────────
        La buena noticia se dice en la banda verde del frame, con el siguiente
        cobro al otro canto: es lo que se quiere saber justo después de «no te
        debe nadie». Solo con tarifas: sin ninguna, «al día» es falso — no se
        sabe.
      */}
      {hayTarifas && !hayVencimientos && (
        <p className="cobros-aldia" role="status">
          <span>
            <Check size={15} aria-hidden="true" />
            Nada vencido ni por cobrar: al día
          </span>
          {siguienteCobro && <span className="cobros-aldia-luego">Siguiente cobro el {diaYMes(siguienteCobro.date)}</span>}
        </p>
      )}

      {tablero.pending.length > 0 && (
        <Caja
          titulo="Por cobrar"
          sub="Lo vencido y lo que vence hoy. El botón es el mismo gesto que en «Hoy» y en la ficha."
          chapa={porCobrar > 0 ? <Chapa tono="bad">{money(porCobrar)}</Chapa> : null}
        >
          <div className="list">
            {tablero.pending.map((fila) => (
              <FilaDeCobro
                key={fila.client.id}
                client={fila.client}
                detalle={`${fila.estado.label}${fila.client.billingPeriod ? ` · ${feeLabel(fila.client)}` : ''}`}
                amount={fila.amount}
                onPaid={cobrar}
              />
            ))}
          </div>
        </Caja>
      )}

      {tablero.pending.length === 0 && tablero.soon.length > 0 && (
        <p className="cobros-aldia" role="status">
          <span>
            <Check size={15} aria-hidden="true" />
            Nada vencido: {tablero.soon.length === 1 ? 'uno renueva' : `${tablero.soon.length} renuevan`} en los
            próximos días
          </span>
        </p>
      )}

      {tablero.soon.length > 0 && (
        <Caja titulo="Renuevan pronto" sub={`${money(tablero.soonTotal)} en los próximos días.`}>
          <div className="list">
            {tablero.soon.map((fila) => (
              <FilaDeCobro key={fila.client.id} client={fila.client} detalle={fila.estado.label} amount={fila.amount} />
            ))}
          </div>
        </Caja>
      )}

      {/*
        Las cifras de cabecera, en el orden en que se preguntan: cuánto vale la
        cartera, cuánto ha entrado este mes, cuánto falta por cobrar y cuánto
        toca el mes que viene. Dos de compromiso y dos de hecho — y el pie de
        cada una dice de cuál se trata, porque mezclarlas es el error que
        convierte una previsión en un ingreso.
      */}
      {cifrasVivas && (
        <div className="cobros-cifras">
          {hayTarifas && (
            <Cifra
              titulo="Recurrente al mes"
              chapa={
                <Chapa tono={recurrente.missing > 0 ? 'info' : 'ok'}>
                  {recurrente.counted} de {recurrente.clients} {recurrente.clients === 1 ? 'cliente' : 'clientes'}
                </Chapa>
              }
              valor={money(recurrente.total)}
              pie={
                recurrente.missing > 0
                  ? `Previsión, no cobrado. De ${recurrente.counted} de tus ${recurrente.clients} clientes: a ${recurrente.missing} les falta la tarifa en su ficha.`
                  : `Previsión, no cobrado. De los ${recurrente.counted} clientes con tarifa anotada.`
              }
            >
              {/* Cuánta cartera cuenta. Solo si falta alguien: una barra llena
                  no dice nada que no diga ya la chapa. */}
              {recurrente.missing > 0 && recurrente.clients > 0 && (
                <div className="cobros-cifra-medida">
                  <Medidor
                    pct={(recurrente.counted / recurrente.clients) * 100}
                    etiqueta={`${recurrente.counted} de ${recurrente.clients} clientes con tarifa`}
                  />
                  <b>{Math.round((recurrente.counted / recurrente.clients) * 100)} %</b>
                </div>
              )}
            </Cifra>
          )}
          {hayHistorico && (
            <Cifra
              titulo="Cobrado este mes"
              valor={payments === null ? '—' : money(esteMes?.total ?? 0)}
              /* La variación contra el mes anterior es lo que convierte una
                 cifra en una tendencia. Va aquí y no en su propia caja: es el
                 mismo dato mirado de otra forma. */
              delta={variacion ? <Delta value={variacion.value} unit=" €" percent={variacion.percent} decimals={0} /> : null}
              pie={
                esteMes?.count
                  ? `Hecho. ${esteMes.count} ${esteMes.count === 1 ? 'cobro apuntado' : 'cobros apuntados'}${mesPasado?.total > 0 ? `, contra ${money(mesPasado.total)} el mes pasado — que está entero.` : '.'}`
                  : 'Todavía no has apuntado ningún cobro este mes.'
              }
            />
          )}
          {hayVencimientos && (
            <Cifra
              titulo="Por cobrar"
              valor={tablero.pending.length > 0 && porCobrar === 0 ? '—' : money(porCobrar)}
              color={porCobrar > 0 ? 'var(--negative)' : undefined}
              pie={pieDePorCobrar()}
            />
          )}
          {/*
            La cuarta es la única que mira hacia delante, y es la que decide si
            hay que hacer algo: un mes que viene flojo se arregla buscando gente
            ahora, no cuando llegue. Debajo, QUIÉN hay detrás de la cifra.
          */}
          {hayPrevision && (
            <Cifra
              titulo="Toca cobrar el mes que viene"
              chapa={
                mesQueViene?.count ? (
                  <Chapa>
                    {mesQueViene.count} {mesQueViene.count === 1 ? 'cobro' : 'cobros'}
                  </Chapa>
                ) : null
              }
              valor={money(mesQueViene?.total ?? 0)}
              pie={
                mesQueViene?.count
                  ? 'Previsión: los cobros con fecha puesta. Da por hecho que todos pagan.'
                  : 'Ningún cobro con fecha en ese mes.'
              }
            >
              {cobrosDelMesQueViene.length > 0 && (
                <ul className="cobros-quien">
                  {cobrosDelMesQueViene.slice(0, 4).map((cobro) => (
                    <li key={`${cobro.client.id}-${cobro.date}`}>
                      <span>
                        {diaYMes(cobro.date)} ·{' '}
                        <Link to={clientPath(cobro.client.id, 'ficha')}>{cobro.client.name}</Link>
                      </span>
                      <b>{money(cobro.amount)}</b>
                    </li>
                  ))}
                  {cobrosDelMesQueViene.length > 4 && (
                    <li className="cobros-quien-mas">Y {cobrosDelMesQueViene.length - 4} más.</li>
                  )}
                </ul>
              )}
            </Cifra>
          )}
        </div>
      )}

      {/*
        ── La mesa: lo que va a entrar y de quién ─────────────────────────────
        La previsión va ANTES del histórico porque se puede actuar sobre ella y
        sobre el histórico no. Y va en su propia gráfica, no pegada al pasado:
        lo previsto y lo cobrado no se mezclan, y una serie que cambia de
        significado a media altura es justo lo que hace que alguien cuente como
        ingreso algo que no ha entrado. Al lado, de dónde sale el recurrente.
      */}
      {(hayPrevision || aportan.length > 0) && (
        <div className="cobros-mesa">
          {hayPrevision && (
            <Caja
              titulo="Previsión de cobros"
              sub="Cada cobro en el mes en que toca, sin promediar. Es lo que enseña los meses valle."
              chapa={<Chapa>{money(previsionTotal)} en {FORECAST_MONTHS} meses</Chapa>}
            >
              <div className="cobros-hundido">
                <ColumnasDePrevision meses={prevision} />
              </div>

              <div className="cobros-teselas">
                <div className="cobros-tesela">
                  <span className="cobros-tesela-rotulo">Promedio {FORECAST_MONTHS} meses</span>
                  <b>{money(Math.round(previsionTotal / prevision.length))}</b>
                  <span className="cobros-tesela-pie">Al mes, con lo que tiene fecha</span>
                </div>
                {salto > 0 && (
                  <div className="cobros-tesela">
                    <span className="cobros-tesela-rotulo">Próximo salto</span>
                    <b>+{money(prevision[salto].total - prevision[salto - 1].total)}</b>
                    <span className="cobros-tesela-pie">
                      {nombreDelMes(prevision[salto].month)}, sobre el mes anterior
                    </span>
                  </div>
                )}
              </div>

              <p className="cobros-nota">
                Un cliente anual aporta al recurrente todos los meses, pero su dinero entra uno solo. Quien no
                tenga fecha de cobro en su ficha no aparece aquí.
              </p>
            </Caja>
          )}

          {aportan.length > 0 && (
            <Caja
              titulo="De dónde sale el recurrente"
              sub={`${money(recurrente.total)} al mes con ${aportan.length} ${aportan.length === 1 ? 'cliente' : 'clientes'}.`}
            >
              <ul className="cobros-aportan">
                {(recurrenteEntero ? aportan : aportan.slice(0, FILAS_DEL_RECURRENTE)).map(({ client, mensual, estado }) => (
                  <li key={client.id}>
                    <span className={`cobros-punto is-${estado.tono}`} aria-hidden="true" />
                    <Link className="cobros-aportan-quien" to={clientPath(client.id, 'ficha')}>
                      {client.name}
                    </Link>
                    <span className="cobros-aportan-cuanto" title={feeLabel(client)}>
                      {money(Math.round(mensual))}/mes
                    </span>
                    <span className={`cobros-estado is-${estado.tono}`}>{estado.texto}</span>
                  </li>
                ))}
              </ul>
              {aportan.length > FILAS_DEL_RECURRENTE && (
                <button
                  type="button"
                  className="cobros-ver"
                  aria-expanded={recurrenteEntero}
                  onClick={() => setRecurrenteEntero((v) => !v)}
                >
                  {recurrenteEntero ? 'Ver menos' : `Ver los ${aportan.length}`}
                </button>
              )}

              {/* El reparto del recurrente por estado del ciclo: cuánto de lo
                  que vale la cartera al mes ya ha entrado y cuánto no. */}
              <div className="cobros-reparto">
                <div className="cobros-reparto-cab">
                  <span>Reparto del recurrente</span>
                  <b>{money(recurrente.total)}</b>
                </div>
                <div className="cobros-reparto-fila">
                  <span>Cobrado</span>
                  <b className="is-ok">{money(Math.round(cobradoMensual))}</b>
                  <Medidor
                    pct={recurrente.total > 0 ? (cobradoMensual / recurrente.total) * 100 : 0}
                    color="var(--positive-grafico)"
                    etiqueta={`Cobrado: ${money(Math.round(cobradoMensual))}`}
                  />
                </div>
                <div className="cobros-reparto-fila">
                  <span>Sin cobrar</span>
                  <b>{money(Math.round(pendienteMensual))}</b>
                  <Medidor
                    pct={recurrente.total > 0 ? (pendienteMensual / recurrente.total) * 100 : 0}
                    color="var(--text-tertiary)"
                    etiqueta={`Sin cobrar: ${money(Math.round(pendienteMensual))}`}
                  />
                </div>
              </div>

              {/*
                La concentración va aquí abajo y en voz baja, sin color de
                alarma. Es la única cifra de la pantalla que habla de RIESGO y
                no de tarea: no se arregla pulsando nada, se tiene en cuenta al
                decidir a quién buscar.
              */}
              {riesgo && (
                <p className="cobros-nota">
                  Tus {riesgo.top} clientes más grandes son {money(riesgo.amount)} de esos{' '}
                  {money(riesgo.total)}: el {Math.round(riesgo.share)} % de tu recurrente depende de ellos.
                </p>
              )}

              {/* La nota de las tarifas que faltan, en la caja cuya cifra
                  dejan incompleta. Solo con tarifas A MEDIAS: sin ninguna, la
                  tarea de arriba ya lo dice con su gesto. */}
              {recurrente.missing > 0 && (
                <div className="cobros-atencion">
                  <b>Faltan tarifas</b>
                  <p>
                    A {recurrente.missing} {recurrente.missing === 1 ? 'cliente' : 'clientes'} les falta la tarifa o
                    la periodicidad en su ficha, así que no cuentan en el recurrente ni en la previsión. Se anota
                    en su ficha, en «Cobro».
                  </p>
                </div>
              )}
            </Caja>
          )}
        </div>
      )}

      {/*
        ── El histórico vacío no se dibuja ────────────────────────────────────
        Una gráfica de doce meses a cero es una línea plana con eje 0–1: el
        dibujo de nada. Sin un solo cobro, la sección entera es una invitación
        de dos renglones — los apuntes nacen al marcar «Cobrado», o los trae
        una integración. La gráfica, el total y el reparto por cliente vuelven
        con el primer apunte, que es cuando significan algo.
      */}
      {payments !== null && totales.count === 0 && !error ? (
        <div className="vacio-invita">
          <p>Todavía no hay ningún cobro apuntado. Nacen al marcar «Cobrado» — o los trae una integración.</p>
          <Link className="cab-accion is-puerta" to="/ajustes/integraciones">
            Conectar una integración
          </Link>
        </div>
      ) : (
        <div className="cobros-mesa">
          <Caja
            titulo="Lo que ha entrado"
            sub="Solo lo cobrado, mes a mes. Los meses en blanco son meses sin ningún cobro apuntado."
            accion={<RangeChips value={meses} onChange={setMeses} options={TRAMOS} />}
          >
            {payments === null ? (
              <Loading label="Cargando el histórico…" />
            ) : (
              <>
                <BarBandChart
                  bars={serie.map((mes) => ({ label: mes.label, value: mes.total }))}
                  unit=" €"
                  emptyMessage="Todavía no hay ningún cobro apuntado."
                />
                {/*
                  El total del tramo va al pie de su propia gráfica: describe
                  estos datos y cambia cuando se cambia el tramo. El reparto
                  entre conciliado y apuntado a mano dice cuánto te puedes creer
                  la cifra, que es lo que hace falta saber antes de usarla.
                */}
                {totales.count > 0 && (
                  <p className="cobros-nota">
                    {money(totales.total)} en {totales.count} cobros.{' '}
                    {totales.manualCount > 0
                      ? `${money(totales.manual)} apuntados a mano y ${money(totales.integration)} conciliados por una integración.`
                      : 'Todos conciliados por una integración.'}
                    {totales.unmatched > 0 &&
                      ` ${totales.unmatched} cobros importados siguen sin cliente asignado, así que no aparecen en el reparto por cliente. Se concilian en Ajustes → Integraciones.`}
                  </p>
                )}
              </>
            )}
          </Caja>

          {payments !== null && (
            <Caja
              titulo="Por cliente"
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
            </Caja>
          )}
        </div>
      )}

      {clients.length === 0 && (
        <div className="cobros-caja">
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
        </div>
      )}

      {/* La frase que separa esta pantalla de la factura del propio
          entrenador, al pie: es contexto, no lo primero que hay que leer. */}
      <p className="cobros-nota">
        Lo que factura tu cartera, lo que falta por cobrar y lo que ha entrado. No es tu plan de Caveman
        Hub: eso está en Ajustes.
      </p>
      </div>

      {registrando && (
        <RegistrarCobro
          clients={conImporte}
          today={today}
          onPaid={cobrar}
          onClose={() => setRegistrando(false)}
        />
      )}
      </div>
    </div>
  );
};
