import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

import {
  buildWeightLog,
  weekDates,
  weeklyCheckIn,
  weeklyWeightAverages,
} from '@/domain/anthropometry';
import { metricColor } from '@/domain/metrics';
import { problemaDeMedida, valorDeMedida } from '@/domain/medidas';
import { BandChart } from '@/components/ui/charts';
import { shortDate, todayISO, weekStart } from '@/lib/dates';
import { fmt, toNum } from '@/lib/num';
import { Delta } from '@/components/ui/metrics';
import { HUECO_CIFRA, Panel } from '@/components/ui/primitives';
import { useOculto } from '@/components/Client/Oculto';

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Check-in semanal de peso.
 *
 * ── Por qué así ─────────────────────────────────────────────────────────────
 * El seguimiento de un cliente no es un pesaje suelto: es un check-in semanal.
 * Se pesa varios días, se promedia —lo que filtra la variación diaria de agua y
 * glucógeno, que puede pasar del kilo entre dos días seguidos— y ese promedio es
 * lo que se compara con la semana anterior.
 *
 * Antes había que introducir un registro completo cada vez, y el promedio no
 * existía como concepto. Aquí el cliente ve los siete días de su semana, anota
 * el peso el día que se pesa, y el promedio se calcula solo.
 *
 * Cada pesaje se guarda como un registro normal del historial, así que la
 * analítica lo ve inmediatamente: el check-in es una forma de LEER y RELLENAR la
 * semana, no un tipo de dato aparte.
 *
 * ── Y aquí SOLO se pesa ─────────────────────────────────────────────────────
 * Las fotos estaban dentro, y era una mezcla de dos ritmos: pesarse son cinco
 * segundos que se repiten cada dos días, y hacerse las fotos es un acto de una
 * vez por semana que además se hace desnudo delante de un espejo. Metidos en la
 * misma tarjeta, la herramienta de la báscula cargaba con el peso de la otra.
 *
 * Las fotos y los perímetros van juntos, detrás de «Subir mi revisión», que es
 * como se llama de verdad lo que se hace ahí.
 */
/**
 * @param target  Pesajes que pide el entrenador a la semana, de su protocolo.
 *   `0` —el valor de serie— es «no los pide»: entonces esta tarjeta cuenta los
 *   que hay y no dice que falte ninguno. Lo pasa `AnthropometryPanel`, que es
 *   quien tiene al cliente y por tanto su protocolo.
 */
export const WeeklyCheckIn = ({
  history,
  onAddWeight,
  onRemoveEntry,
  /*
    ── Y lo que se apunta A DIARIO ───────────────────────────────────────────
    Las medidas de cadencia diaria —una temperatura basal, una frecuencia
    cardíaca en reposo— son una FILA MÁS de esta misma rejilla. No una tarjeta
    aparte: se toman en el mismo gesto y en el mismo momento que el pesaje de la
    mañana, y partirlas en dos sitios convertiría un gesto de cinco segundos en
    dos pantallas. Ver `domain/medidas.js`.
  */
  medidas = [],
  onApuntarMedida = null,
  audience = 'client',
  action = null,
  target = 0,
}) => {
  const [reference, setReference] = useState(() => weekStart(todayISO()));
  const [drafts, setDrafts] = useState({});

  const checkIn = useMemo(
    () => weeklyCheckIn(history, reference, { target }),
    [history, reference, target]
  );
  const tendencia = useMemo(() => weeklyWeightAverages(history), [history]);
  const days = useMemo(() => weekDates(checkIn.weekStart), [checkIn.weekStart]);

  const byDate = useMemo(
    () => new Map(checkIn.entries.map((entry) => [entry.date, entry])),
    [checkIn.entries]
  );

  /*
    Lo medido de cada día, por fecha, SACADO DEL HISTORIAL ENTERO y no de
    `checkIn.entries`: esa lista es la de los PESAJES —descarta lo que no tiene
    peso— y un día en el que solo se tomó la temperatura no está en ella. Con
    ella, la casilla de una medida aparecía vacía el día después de escribirla.
  */
  const medidasPorFecha = useMemo(() => {
    const map = new Map();
    for (const log of history || []) {
      if (log?.date && log.medidas) map.set(log.date, log.medidas);
    }
    return map;
  }, [history]);

  const today = todayISO();
  const isClient = audience === 'client';

  /*
    ══ Pesarse a ciegas ═══════════════════════════════════════════════════════

    Con el peso oculto, el gesto de la semana no cambia —se anota el pesaje del
    día igual— y lo que cambia es que la aplicación no lo devuelve: la casilla
    rellena dice «anotado» en vez de la cifra, y se van la tendencia, el promedio
    y la semana anterior. Queda la papelera, porque quien se equivoca al teclear
    tiene que poder corregirlo sin llamar a su entrenador. Ver `Oculto.jsx`.
  */
  const oculto = useOculto();



  const shift = (weeks) => {
    const base = Date.parse(`${checkIn.weekStart}T00:00:00Z`);
    setReference(new Date(base + weeks * 7 * 86400000).toISOString().slice(0, 10));
    setDrafts({});
  };

  const commit = (date) => {
    const value = toNum(drafts[date]);
    if (value === null) return;
    onAddWeight(buildWeightLog({ date, weight: value }));
    setDrafts((d) => ({ ...d, [date]: '' }));
  };

  /* Las diarias que este cliente tiene encendidas y se pueden escribir desde
     aquí. Sin verbo para escribirlas —una pantalla de solo lectura— no se
     pintan: una casilla que no guarda nada es peor que no tenerla. */
  const diarias = onApuntarMedida ? medidas : [];

  /* Lo tecleado en la fila de una medida, por fecha. Se guarda al salir del
     campo y con Enter, como el peso: el mismo gesto en la misma rejilla. */
  const [medidaDrafts, setMedidaDrafts] = useState({});

  const commitMedida = (medida, date) => {
    const clave = `${medida.id}:${date}`;
    const crudo = medidaDrafts[clave];
    if (crudo === undefined) return;
    const limpio = String(crudo).trim();
    /* Vaciar la casilla BORRA la medida de ese día. Es la otra mitad de la ley:
       `null` es «no la tomé», y dejar el valor anterior convertiría una
       corrección en un dato que nadie escribió. */
    const valor = limpio === '' ? null : valorDeMedida(medida, limpio);
    if (limpio !== '' && valor === null) return;
    if (limpio !== '' && problemaDeMedida(medida, valor)) return;
    onApuntarMedida(date, medida.id, valor);
    setMedidaDrafts((d) => {
      const { [clave]: _fuera, ...resto } = d;
      return resto;
    });
  };

  return (
    <Panel className="col gap-5">
      <div className="row between wrap gap-3">
        <div>
          <span className="section-label">Check-in semanal</span>
          <h3 className="section-title">Semana del {shortDate(checkIn.weekStart)}</h3>
        </div>

        <div className="row gap-2 wrap">
          {action}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => shift(-1)}>
            Anterior
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => shift(1)}
            disabled={checkIn.weekStart >= weekStart(today)}
          >
            Siguiente
          </button>
        </div>
      </div>

      {/*
        ══ Los siete días, en UNA fila ════════════════════════════════════════

        Iban en una rejilla que se adapta al ancho con un mínimo de 158 px por
        celda, así que en cuanto el contenedor bajaba de 1.100 px la semana se
        partía en dos filas — y una semana partida en dos deja de leerse como una
        semana: hay que contar para saber qué día es cuál.

        Siete columnas iguales, pase lo que pase. Las celdas se estrechan, que es
        exactamente lo que tiene que pasar: lo que va dentro es un día de tres
        letras y un número.
      */}
      <div className="checkin-week">
        {days.map((date, index) => {
          const entry = byDate.get(date);
          const future = date > today;

          return (
            <div
              className={`card-inset col gap-2${date === today ? ' is-today' : ''}`}
              key={date}
              style={{ opacity: future ? 0.5 : 1 }}
            >
              <span className="section-label">{DAY_NAMES[index]}</span>

              {entry ? (
                <div className="row between gap-2">
                  {oculto.weight ? (
                    <span className="t-xs t-secondary">anotado</span>
                  ) : (
                    <span className="metric-value" style={{ fontSize: 'var(--fs-md)' }}>
                      {fmt(entry.weight, { decimals: 1, unit: ' kg' })}
                    </span>
                  )}
                  {/* Compacto por CLASE, no por estilo en línea: el tamaño en
                      línea le ganaba a la regla táctil y en el móvil seguía
                      siendo un blanco de 24 px. */}
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-compact btn-icon-danger"
                    onClick={() => onRemoveEntry(entry.id)}
                    aria-label={`Borrar el pesaje del ${date}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ) : (
                /*
                  Sin botón de confirmar: guardar ya dispara al salir del campo
                  y con Enter, así que el tick solo confirmaba lo confirmado — y
                  de paso le robaba la mitad del ancho al campo en una celda que
                  a 390 px mide ~80 px. `enterKeyHint` pone «Listo» en la tecla
                  de enviar del teclado del móvil, que es el gesto que queda.
                */
                <input
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  className="input input-sm input-center"
                  placeholder={HUECO_CIFRA}
                  disabled={future}
                  value={drafts[date] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [date]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && commit(date)}
                  onBlur={() => commit(date)}
                  aria-label={`Peso del ${date}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/*
        ══ Y una fila por medida diaria ═══════════════════════════════════════

        La MISMA rejilla de siete columnas, debajo de la del peso y con su
        rótulo a la izquierda: se lee como lo que es, otra cosa que se anota cada
        día, y no como una tarjeta nueva.

        Cada casilla dice su unidad una vez, en el rótulo de la fila, y no siete
        veces. Lo que la casilla enseña es el número — que es lo que hay que
        comparar de un día a otro.
      */}
      {diarias.map((medida) => {
        const escondida = oculto.medidas?.[medida.id] === true;
        return (
          <div className="col gap-2" key={medida.id}>
            <span className="section-label">
              {medida.label}
              {medida.unit ? ` · ${medida.unit}` : ''}
            </span>
            <div className="checkin-week">
              {days.map((date, index) => {
                const clave = `${medida.id}:${date}`;
                const guardado = medidasPorFecha.get(date)?.[medida.id];
                const future = date > today;
                return (
                  <div
                    className={`card-inset col gap-2${date === today ? ' is-today' : ''}`}
                    key={date}
                    style={{ opacity: future ? 0.5 : 1 }}
                  >
                    <span className="section-label">{DAY_NAMES[index]}</span>
                    {escondida && guardado !== undefined ? (
                      /* Con la medida oculta, el gesto no cambia —se anota
                         igual— y lo que cambia es que la aplicación no la
                         devuelve. La misma ley que el peso. Ver `Oculto.jsx`. */
                      <span className="t-xs t-secondary">anotado</span>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="done"
                        className="input input-sm input-center"
                        placeholder={HUECO_CIFRA}
                        disabled={future}
                        value={medidaDrafts[clave] ?? (guardado ?? '')}
                        onChange={(e) =>
                          setMedidaDrafts((d) => ({ ...d, [clave]: e.target.value }))
                        }
                        onKeyDown={(e) => e.key === 'Enter' && commitMedida(medida, date)}
                        onBlur={() => commitMedida(medida, date)}
                        aria-label={`${medida.label} del ${date}, en ${medida.unit}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/*
        ══ La tendencia, DENTRO del check-in ══════════════════════════════════

        Estaba en un panel suelto más abajo, después de la revisión y del
        historial. Y es la lectura de lo que se acaba de escribir aquí arriba:
        los pesajes de la semana y la línea que forman son la misma herramienta
        —la báscula y lo que dice—, no dos cosas que casualmente hablan de peso.

        Con el promedio al lado, además, se ve de dónde sale el punto de esta
        semana.

        ── Y su hueco existe desde el primer día ─────────────────────────────
        Estaba condicionado a tener dos semanas de pesajes, así que hasta la
        segunda semana la sección NO EXISTÍA: el gráfico no es que estuviera
        vacío, es que no había ni sitio donde mirarlo — y quien acaba de empezar
        no tiene forma de saber que va a aparecer.

        Ahora el hueco está siempre y `BandChart` dice qué falta para llenarlo.
        Reservar el sitio es además lo que evita que la pantalla dé un salto la
        semana que por fin hay datos.
      */}
      {!oculto.weight && (
        <div className="col gap-2">
            <span className="section-label">Tendencia · promedio de cada semana</span>
            <BandChart
              labels={tendencia.map((w) => w.date)}
              series={[
                {
                  id: 'w',
                  label: 'Peso',
                  color: metricColor('weight'),
                  unit: ' kg',
                  decimals: 1,
                  points: tendencia.map((w) => ({ label: w.date, value: w.value })),
                },
              ]}
              height={104}
              emptyMessage={
                tendencia.length === 1
                  ? 'Con una semana más de pesajes ya se ve la tendencia.'
                  : // El hueco habla con quien mira: al cliente de «tu peso» y al
                    // entrenador del peso de SU cliente. Con el posesivo fijo, la
                    // pantalla del entrenador le hablaba al que no estaba.
                    isClient
                    ? 'Aquí verás cómo evoluciona tu peso, semana a semana.'
                    : 'Aquí verás cómo evoluciona su peso, semana a semana.'
              }
            />
          </div>
      )}

      {/* Resultado del check-in: el promedio y su variación contra la semana
          anterior, que es la cifra con la que de verdad se decide. */}
      {oculto.weight ? (
        /* Sin cifras, lo único que queda del cierre de la semana es el hecho:
           cuántas veces se ha pesado, y si eso llega a lo que le pidieron. */
        <p className="metric-foot" style={{ paddingTop: 'var(--s3)', borderTop: '1px solid var(--hairline)' }}>
          {checkIn.count === 0
            ? 'Sin pesajes esta semana.'
            : checkIn.asked
              ? `${checkIn.count} de ${checkIn.target} pesajes esta semana.`
              : `${checkIn.count} ${checkIn.count === 1 ? 'pesaje' : 'pesajes'} esta semana.`}
        </p>
      ) : (
        <div className="row between wrap gap-4" style={{ paddingTop: 'var(--s3)', borderTop: '1px solid var(--hairline)' }}>
          <div className="col gap-1">
            <span className="section-label">Promedio de la semana</span>
            {/*
              `is-hero` y no el cuerpo de una tarjeta más: la firma de Revisión
              es «la cifra con su veredicto» (`tokens.css`), y esta es esa
              cifra — la pantalla lo dice con todas las letras tres renglones
              más abajo: «es la cifra que conviene mirar para decidir ajustes,
              no un pesaje suelto». Estaba a 30, el mismo cuerpo que los cuatro
              apuntes de arriba, así que el promedio era el quinto de cinco
              números iguales y el veredicto colgaba de ninguno en particular.
            */}
            <div className="metric-figure">
              <span className="metric-value is-hero">{checkIn.average === null ? '—' : checkIn.average}</span>
              <span className="metric-unit">kg</span>
              <Delta value={checkIn.delta} unit=" kg" lowerIsBetter />
            </div>
            {/* «Media fiable» y «con dos más» son juicios, y sin un número pedido
                no hay con qué juzgar: queda el recuento, que es el hecho. */}
            <span className="metric-foot">
              {checkIn.count === 0
                ? 'Sin pesajes esta semana.'
                : `${checkIn.count} ${checkIn.count === 1 ? 'pesaje' : 'pesajes'}` +
                  (!checkIn.asked
                    ? ''
                    : checkIn.complete
                      ? ' · media fiable'
                      : ` · con ${checkIn.target - checkIn.count} más la media es más fiable`)}
            </span>
          </div>

          {checkIn.previousAverage !== null && (
            <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
              <span className="section-label">Semana anterior</span>
              <span className="row-value">{checkIn.previousAverage} kg</span>
            </div>
          )}
        </div>
      )}

      <p className="t-xs t-tertiary">
        {isClient
          ? oculto.weight
            ? 'Pésate por la mañana, en ayunas y después de ir al baño. Lo ideal son 3 días alternos: tu entrenador lee el promedio, que es lo que filtra la variación diaria de agua.'
            : 'Pésate por la mañana, en ayunas y después de ir al baño. Lo ideal son 3 días alternos: el promedio filtra la variación diaria de agua y es lo que de verdad indica si tu peso sube o baja.'
          : 'El promedio semanal filtra el ruido diario. Es la cifra que conviene mirar para decidir ajustes, no un pesaje suelto.'}
      </p>

    </Panel>
  );
};
