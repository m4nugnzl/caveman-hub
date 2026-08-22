/**
 * El dinero de la cartera: lo que entra cada mes, lo que falta por cobrar y lo
 * que ya entró.
 *
 * ══ Las dos capas de dinero, que NO son la misma ════════════════════════════
 *
 * Y confundirlas es el error fácil, porque las dos se llaman «pagos»:
 *
 *   1. Lo que el entrenador te paga a TI —su plan, `team_subscriptions`—. Eso es
 *      Ajustes → Plan, y no aparece por aquí ni una vez.
 *   2. Lo que sus clientes le pagan a ÉL. Eso es esto.
 *
 * Este módulo es solo la segunda. Es la misma separación que ya hace
 * `scripts/radiografia/dinero.mjs`, escrita con el rótulo delante para que nunca
 * se sumen por error.
 *
 * ══ Y las dos preguntas del entrenador, que tampoco son la misma ════════════
 *
 * Todo lo de aquí contesta a una de estas dos, y llevan datos distintos:
 *
 *   · «¿Cuánto FACTURO?» — el compromiso: la tarifa anotada de cada cliente
 *     activo, normalizada a mes. Sale de `clients` y es una previsión: dice lo
 *     que debería entrar si todos pagan.
 *
 *   · «¿Cuánto ENTRÓ?» — el hecho: los apuntes de `client_payments`. Es
 *     histórico y no se puede predecir con él.
 *
 * Están separadas a propósito y ninguna se calcula a partir de la otra. Deducir
 * el histórico de la tarifa daría una gráfica bonita de dinero que nadie ha
 * cobrado, y esa cifra —con aspecto de dato y origen de adivinanza— es la que se
 * acaba repitiendo en una decisión.
 *
 * ── Por qué la periodicidad se normaliza a mes y no a año ───────────────────
 * Porque el mes es la unidad en la que un entrenador piensa su sueldo, y porque
 * es lo que permite sumar en la misma columna a quien cobra mensual y a quien
 * cobra por trimestres. Un anual de 600 € son 50 € al mes en esta suma: no es
 * que se cobren, es lo que representa. La pantalla lo dice con esas palabras.
 */

import { BILLING_PERIODS, billingPeriod, paymentState } from '@/domain/billing';
import { isArchived } from '@/domain/portfolio';
import { addMonths, localeNumber, todayISO } from '@/lib/dates';
import { toNum } from '@/lib/num';

/**
 * Una cantidad de dinero, escrita como se lee: «1.240 €».
 *
 * Sin decimales cuando es redonda y con dos cuando no lo es. Escribir «1.240,00
 * €» en una cifra que es exacta añade ruido a lo único que se venía a mirar; y
 * redondear 59,50 a 60 es mentir por un lado que se nota.
 *
 * La moneda es el euro y va escrita, no configurada: la 0058 ya decidió que un
 * entrenador cobra en una sola y que el día que haya dos, la divisa será suya y
 * vivirá en sus preferencias — no en la fila de cada cliente.
 */
export const money = (amount) => {
  const n = toNum(amount);
  if (n === null) return '—';
  const decimales = Number.isInteger(n) ? 0 : 2;
  return `${localeNumber(n, { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} €`;
};

/**
 * Lo que representa al mes la tarifa de un cliente.
 *
 * `null` en los tres casos en que no se puede saber, que NO son un cero:
 *
 *   · Sin importe anotado — falta el dato en su ficha.
 *   · Sin periodicidad — 180 € puede ser un mes de uno o un trimestre de otro.
 *   · Pago único — entró una vez y no se repite. Meterlo en una suma mensual
 *     inflaría el recurrente con dinero que no va a volver.
 *
 * Quien llame tiene que distinguir «no se repite» de «no lo sé», y por eso la
 * pantalla cuenta aparte cuántos clientes caen en cada caso en vez de enseñar
 * una suma a la que le faltan personas sin decirlo.
 */
export const monthlyFee = (client) => {
  const importe = toNum(client?.feeAmount);
  if (importe === null) return null;

  const periodo = billingPeriod(client?.billingPeriod);
  if (!periodo || periodo.months === null) return null;

  return importe / periodo.months;
};

/**
 * El recurrente de la cartera: cuánto representa al mes lo que hay contratado.
 *
 * ── Por qué se cuenta lo que falta y no solo lo que suma ────────────────────
 * Porque una suma sola no se puede interpretar. «2.400 € al mes» significa una
 * cosa si es de veinte clientes y otra muy distinta si es de doce con ocho sin
 * tarifa anotada — y en el segundo caso la cifra de verdad es otra. Devolver
 * `missing` es lo que permite que la pantalla lo diga en vez de dar por buena
 * una suma incompleta.
 *
 * Los archivados quedan fuera: no pagan. Los de pago único también, pero se
 * cuentan aparte de los que no tienen tarifa, porque no es lo mismo un dato que
 * falta que un dato que existe y no es recurrente.
 */
export const recurringMonthly = (clients = []) => {
  const activos = clients.filter((c) => !isArchived(c));

  let total = 0;
  let counted = 0;
  let missing = 0;
  let oneOff = 0;

  for (const client of activos) {
    const mensual = monthlyFee(client);
    if (mensual !== null) {
      total += mensual;
      counted += 1;
      continue;
    }
    if (billingPeriod(client?.billingPeriod)?.months === null && toNum(client?.feeAmount) !== null) {
      oneOff += 1;
    } else {
      missing += 1;
    }
  }

  return { total, counted, missing, oneOff, clients: activos.length };
};

/**
 * El reparto del recurrente por periodicidad: quién cobra mensual, quién anual.
 *
 * Sirve para una sola pregunta y es una buena: **cuánto de tu sueldo depende de
 * renovaciones que solo ocurren una vez al año**. Un recurrente de 2.000 € con
 * la mitad en anuales no se comporta como uno de 2.000 € todo mensual, aunque la
 * cifra grande sea idéntica.
 *
 * Solo los que suman: los de pago único y los que no tienen tarifa no tienen
 * sitio en un reparto de recurrente.
 */
export const byPeriod = (clients = []) => {
  const activos = clients.filter((c) => !isArchived(c));

  return BILLING_PERIODS.filter((p) => p.months !== null)
    .map((periodo) => {
      const suyos = activos.filter(
        (c) => c.billingPeriod === periodo.id && monthlyFee(c) !== null
      );
      return {
        id: periodo.id,
        label: periodo.label,
        clients: suyos.length,
        monthly: suyos.reduce((n, c) => n + monthlyFee(c), 0),
      };
    })
    .filter((fila) => fila.clients > 0);
};

/**
 * Lo que hay que cobrar, en tres tandas y con el importe delante.
 *
 * El criterio de en qué punto está cada cobro NO se decide aquí: lo decide
 * `paymentState` (`domain/billing.js`), que es donde se decidió una vez para
 * toda la aplicación. Esta función solo agrupa y suma — si volviera a mirar
 * fechas por su cuenta, esta pantalla acabaría diciendo que Marta debe algo
 * mientras la bandeja de «Hoy» dice que no.
 *
 * `amount` es el importe del cobro, no el mensualizado: lo que se le reclama a
 * quien paga por trimestres son sus 180 €, no 60.
 */
export const collectionBoard = (clients = [], today = todayISO()) => {
  const tandas = { overdue: [], due: [], soon: [] };

  for (const client of clients) {
    if (isArchived(client)) continue;

    const estado = paymentState(client, today);
    if (!(estado.state in tandas)) continue;

    tandas[estado.state].push({ client, estado, amount: toNum(client.feeAmount) });
  }

  /* Lo más vencido primero dentro de cada tanda: `days` es negativo en lo
     vencido, así que el orden ascendente pone arriba lo que lleva más tiempo
     sin cobrarse, que es por donde se empieza. */
  for (const tanda of Object.values(tandas)) {
    tanda.sort((a, b) => (a.estado.days ?? 0) - (b.estado.days ?? 0));
  }

  const suma = (filas) => filas.reduce((n, f) => n + (f.amount ?? 0), 0);

  return {
    ...tandas,
    pending: [...tandas.overdue, ...tandas.due],
    overdueTotal: suma(tandas.overdue),
    dueTotal: suma(tandas.due),
    soonTotal: suma(tandas.soon),
  };
};

/** Cuántos meses de histórico se enseñan por defecto. Un año es un ciclo entero. */
export const HISTORY_MONTHS = 12;

/** '2026-03-14' → '2026-03'. Sobre la cadena, sin pasar por `Date`. */
const monthKey = (value) => (typeof value === 'string' ? value.slice(0, 7) : null);

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-03' → 'mar', y 'mar 26' cuando el tramo cruza de año. */
const monthLabel = (key, { conAno = false } = {}) => {
  const [ano, mes] = key.split('-');
  const nombre = MONTH_NAMES[Number(mes) - 1] || mes;
  return conAno ? `${nombre} ${ano.slice(2)}` : nombre;
};

/**
 * El eje de meses de una gráfica, hacia atrás o hacia delante desde hoy.
 *
 * Se cuenta en meses absolutos —año × 12 + mes— y no sumando fechas: así cruzar
 * el año es una división y no un caso especial, que es donde se cuelan los
 * errores de «diciembre + 1 = mes 13».
 *
 * El año entra en la etiqueta solo si el tramo cruza de año. Sin esa condición,
 * dos «ene» en la misma gráfica no se distinguen; con ella siempre, se repite un
 * dato que no aporta en los once meses en que no hace falta.
 */
const monthAxis = (today, months, { forward = false } = {}) => {
  const base = Number(today.slice(0, 4)) * 12 + (Number(today.slice(5, 7)) - 1);

  const claves = [];
  for (let i = 0; i < months; i += 1) {
    const total = forward ? base + i : base - (months - 1 - i);
    claves.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`);
  }

  const cruzaAno = new Set(claves.map((k) => k.slice(0, 4))).size > 1;
  return claves.map((clave) => ({ month: clave, label: monthLabel(clave, { conAno: cruzaAno }) }));
};

/**
 * Lo que entró cada mes, con los meses vacíos incluidos.
 *
 * ══ Por qué se rellenan los meses sin cobros ════════════════════════════════
 *
 * Porque una gráfica que solo dibuja los meses que tienen datos MIENTE sobre la
 * forma: un entrenador que cobró en enero y en junio vería dos barras juntas y
 * leería continuidad donde hay cuatro meses en blanco. El hueco es el dato.
 *
 * Solo se suma lo cobrado (`isPaid`). Un cobro fallido de Stripe está en la
 * tabla —y es la señal más accionable que hay— pero no es dinero que haya
 * entrado, y esta serie es de dinero que ha entrado.
 */
export const paymentsByMonth = (payments = [], { months = HISTORY_MONTHS, today = todayISO() } = {}) => {
  const porMes = new Map();

  for (const pago of payments) {
    if (!pago?.isPaid) continue;
    const clave = monthKey(pago.paidOn);
    if (!clave) continue;

    const fila = porMes.get(clave) || { total: 0, count: 0 };
    fila.total += toNum(pago.amount) ?? 0;
    fila.count += 1;
    porMes.set(clave, fila);
  }

  /* El tramo se construye hacia atrás desde el mes en curso y no desde el primer
     cobro: la pregunta es «¿cómo van los últimos doce meses?», y un entrenador
     que lleva tres meses tiene que ver sus tres meses dentro de un año, no tres
     barras ocupando la pantalla entera. */
  return monthAxis(today, months).map((mes) => ({
    ...mes,
    total: porMes.get(mes.month)?.total ?? 0,
    count: porMes.get(mes.month)?.count ?? 0,
  }));
};

/** Cuántos meses de previsión se enseñan. Medio año es lo que se puede planear. */
export const FORECAST_MONTHS = 6;

/**
 * Lo que TOCA cobrar en los próximos meses, ciclo a ciclo.
 *
 * ══ Por qué esto no es «el recurrente repetido seis veces» ══════════════════
 *
 * Porque el recurrente mensualiza y esto NO. Un cliente anual de 600 € aporta 50
 * € al recurrente todos los meses, pero **el dinero entra un solo mes** y los
 * otros once no entra nada suyo. La media es la respuesta correcta a «¿cuánto
 * vale mi cartera?» y la respuesta equivocada a «¿llego a fin de mes?».
 *
 * Un entrenador con seis clientes trimestrales bien repartidos y otro con los
 * seis cobrando en enero tienen el mismo recurrente y dos vidas distintas. Esa
 * diferencia —los meses valle— es lo único que esta serie enseña y no enseña
 * ninguna otra cifra de la pantalla.
 *
 * ── Qué se proyecta y qué no ────────────────────────────────────────────────
 * Se parte de `nextPaymentDate` y se avanza con la periodicidad. Por tanto:
 *
 *   · Sin fecha de cobro un cliente NO entra, aunque tenga tarifa: no se sabe
 *     cuándo pagaría, y repartirlo «a ojo» inventaría el valle o lo taparía.
 *   · Un pago único cuenta UNA vez, en su mes. Es exactamente lo que va a pasar.
 *   · Lo ya vencido no aparece: sus ciclos pasados caen fuera del eje. Eso es
 *     correcto —una deuda de julio no es una previsión de agosto— y por eso el
 *     tablero de cobros va aparte y antes que esto.
 *
 * Es una previsión, no un ingreso: da por hecho que todo el mundo paga y que
 * nadie se va. La pantalla lo dice con esas palabras.
 */
export const forecast = (clients = [], { months = FORECAST_MONTHS, today = todayISO() } = {}) => {
  const eje = monthAxis(today, months, { forward: true });
  const cubos = new Map(eje.map((mes) => [mes.month, { total: 0, count: 0 }]));
  const ultimo = eje.at(-1)?.month ?? monthKey(today);

  for (const client of clients) {
    if (isArchived(client)) continue;

    const importe = toNum(client.feeAmount);
    if (importe === null || !client.nextPaymentDate) continue;

    const periodo = billingPeriod(client.billingPeriod);
    let fecha = client.nextPaymentDate;

    /*
      El tope de vueltas no es paranoia: un cliente mensual con una fecha de cobro
      de hace tres años daría 36 iteraciones antes de asomar por el eje, y una
      fila con datos corruptos podría no salir nunca del bucle. Con 400 caben
      treinta y tres años de ciclos mensuales, que es más de lo que puede pedir
      cualquier pantalla de seis meses.
    */
    for (let vuelta = 0; vuelta < 400; vuelta += 1) {
      const clave = monthKey(fecha);
      if (!clave || clave > ultimo) break;

      const cubo = cubos.get(clave);
      if (cubo) {
        cubo.total += importe;
        cubo.count += 1;
      }

      if (!periodo || periodo.months === null) break;
      fecha = addMonths(fecha, periodo.months);
    }
  }

  return eje.map((mes) => ({ ...mes, ...cubos.get(mes.month) }));
};

/**
 * Cuánto de tu sueldo depende de tus clientes más grandes.
 *
 * ══ Por qué esta cifra y no «el cliente más rentable» ═══════════════════════
 *
 * Porque es la única de la pantalla que habla de RIESGO, y el riesgo de una
 * cartera pequeña es siempre el mismo: que se vaya el que más paga. Dos
 * entrenadores con 2.000 € de recurrente no están igual de tranquilos si a uno
 * los tres primeros le suponen el 30 % y al otro el 75 %.
 *
 * No es una cifra que se pueda «mejorar» pulsando nada, y por eso va en voz baja
 * y sin color de alarma: es contexto para decidir a quién buscar, no una tarea.
 *
 * ── Por qué devuelve `null` con pocos clientes ──────────────────────────────
 * Con tres clientes o menos, «tus tres mayores son el 100 %» es verdad y no dice
 * nada: es una propiedad de la aritmética, no de la cartera. Una cifra que
 * siempre sale igual enseña a no mirarla.
 */
export const concentration = (clients = [], top = 3) => {
  const mensuales = clients
    .filter((c) => !isArchived(c))
    .map(monthlyFee)
    .filter((v) => v !== null)
    .sort((a, b) => b - a);

  if (mensuales.length <= top) return null;

  const suma = (xs) => xs.reduce((n, v) => n + v, 0);
  const total = suma(mensuales);
  if (total <= 0) return null;

  const amount = suma(mensuales.slice(0, top));
  return { top, amount, total, share: (amount / total) * 100 };
};

/**
 * El total cobrado de un conjunto de apuntes, y de dónde salió cada euro.
 *
 * El reparto entre lo conciliado y lo apuntado a mano no es curiosidad: dice
 * **cuánto de esta cifra te puedes creer**. Un total que es 90 % manual es la
 * memoria del entrenador; uno que es 90 % de Stripe es contabilidad.
 */
export const paymentsTotals = (payments = []) => {
  const cobrados = payments.filter((p) => p?.isPaid);

  const suma = (filas) => filas.reduce((n, p) => n + (toNum(p.amount) ?? 0), 0);
  const manuales = cobrados.filter((p) => p.source === 'manual');

  return {
    total: suma(cobrados),
    count: cobrados.length,
    manual: suma(manuales),
    manualCount: manuales.length,
    integration: suma(cobrados.filter((p) => p.source !== 'manual')),
    /* Los que llegaron de fuera y todavía no se han podido casar con nadie. No
       suman en ningún reparto por cliente, y ocultarlos haría que las columnas
       no cuadraran con el total sin explicación. */
    unmatched: cobrados.filter((p) => !p.clientId).length,
  };
};

/**
 * Cuánto ha pagado cada cliente, de más a menos.
 *
 * ── Por qué esto y no «el cliente más rentable» ─────────────────────────────
 * Porque rentable exige saber cuánto trabajo cuesta cada uno, y eso la
 * aplicación no lo sabe. Lo que sí sabe —y es lo que un entrenador no tiene en
 * ningún sitio— es quién ha aportado más dinero desde que entró. La lectura la
 * pone él.
 *
 * Los cobros sin conciliar se quedan fuera de esta lista por definición: no
 * tienen a quién atribuirse. `paymentsTotals().unmatched` los cuenta para que la
 * pantalla pueda avisar de que faltan.
 */
export const incomePerClient = (payments = [], clients = []) => {
  const nombres = new Map(clients.map((c) => [c.id, c.name]));
  const porCliente = new Map();

  for (const pago of payments) {
    if (!pago?.isPaid || !pago.clientId) continue;

    const fila = porCliente.get(pago.clientId) || { clientId: pago.clientId, total: 0, count: 0, last: null };
    fila.total += toNum(pago.amount) ?? 0;
    fila.count += 1;
    if (!fila.last || (pago.paidOn && pago.paidOn > fila.last)) fila.last = pago.paidOn;
    porCliente.set(pago.clientId, fila);
  }

  return [...porCliente.values()]
    .map((fila) => ({ ...fila, name: nombres.get(fila.clientId) || 'Cliente dado de baja' }))
    .sort((a, b) => b.total - a.total);
};
