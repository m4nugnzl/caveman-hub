import { useMemo } from 'react';

import { metricColor } from '@/domain/metrics';
import { makeScale, smoothPath } from '@/components/ui/charts';

/**
 * LA GRÁFICA DE LA REVISIÓN. Una, con ejes, y es el mando de la pantalla.
 *
 * ══ Lo que estaba mal, dicho sin rodeos ═════════════════════════════════════
 *
 * Era un instrumento a medio hacer. Tenía las dos bandas bien elegidas y las
 * dibujaba SIN NINGUNA DE LAS TRES COSAS que hacen legible un gráfico:
 *
 *   · **Sin rejilla y sin eje.** El único número era un «82 – 78 kg» de diez
 *     píxeles en la esquina, así que un punto a media altura no se podía leer:
 *     había que estimarlo interpolando de cabeza entre dos extremos escritos en
 *     otro sitio. La curva era una FORMA, no una medida.
 *   · **Sin relleno.** Una línea de dos píxeles sobre un lienzo vacío flota; el
 *     área bajo la curva es lo que la apoya en su eje y la convierte en una
 *     magnitud. Es lo que hacen todos los demás gráficos del producto
 *     (`BandChart`), y éste era el único que no.
 *   · **Sin lectura.** Se elegía una semana y no había forma de saber qué valían
 *     sus dos bandas sin bajar a buscarlo al tablero.
 *
 * Y encima **no era la única curva del peso en pantalla**: la espina de arriba
 * dibujaba la misma serie completa un centímetro más arriba. Con un cliente de
 * treinta semanas eso se defiende —una es el mapa y la otra la ventana—, pero un
 * cliente de tres semanas no tiene ventana que recortar, así que salían dos
 * dibujos idénticos de tres puntos, uno encima del otro. Que es exactamente el
 * defecto que esta pieza vino a arreglar.
 *
 * Ahora el mapa es un PIE de esta gráfica y solo aparece cuando de verdad
 * recorta algo (ver `TimelineSpine` y el `mapa` de aquí abajo).
 *
 * ══ La forma ════════════════════════════════════════════════════════════════
 *
 *      PESO                                                  ● S24 · 81,5 kg
 *   84 ┼·······················································
 *      │        ___                                  ___
 *   82 ┼·······/···╲______······················____/····╲__●··
 *      │ ____╱             ╲______________╱‾
 *   80 ┼········································································
 *      ├────────────────────────────────────────────────────────
 *      KCAL OBJETIVO                                      2 300 kcal
 * 2600 ┼▔▔▔▔▔╲______
 * 2200 ┼·············▔▔▔▔▔▔▔▔╲_______________________________
 *      S15  S16  S17  S18  S19  S20  S21  S22  S23  [S24]
 *
 * Dos bandas y no dos líneas en un eje: 2.300 kcal y 81 kg no caben en la misma
 * escala, y forzarlas a una obliga a elegir cuánto se parecen las dos curvas —
 * que es como se «demuestra» cualquier correlación moviendo los topes. Apiladas,
 * con el mismo eje de semanas y cada una con su rejilla, la correlación se lee
 * mirando hacia abajo y nadie ha decidido por ti cuánto se parecen.
 *
 * ── Y las calorías en ESCALERA, no en barras ni en curva ───────────────────
 * Un objetivo de calorías no se mide: **se pone, y sigue puesto hasta que lo
 * cambias**. Su forma es una escalera con un punto en cada peldaño, y así la
 * pregunta «¿cuánto llevaba con 2.400 antes de que se parase el peso?» se
 * contesta midiendo un tramo. Suavizarla la convertiría en una rampa, que dice
 * que el objetivo fue bajando poco a poco — que es justo lo que no pasó.
 *
 * ══ Es el mando ═════════════════════════════════════════════════════════════
 *
 * Se pulsa una semana y todo el tablero de abajo pasa a hablar de ella. La tira
 * de semanas ES el eje horizontal: son las mismas marcas, en las mismas
 * columnas, y por eso está pegada al dibujo y no separada por un hueco. Un eje
 * que además se pulsa, en vez de un eje y unos botones diciendo lo mismo.
 */

/* Los altos de las dos bandas y el hueco entre ellas. La del peso manda —es la
   que se lee con detalle— y la de las calorías solo tiene que dejar ver el
   peldaño, que es lo único que se mira ahí. */
const ALTO_PESO = 132;
const ALTO_KCAL = 66;
/* El hueco era de 26 y los dos ejes se leían como uno solo: el último número
   del peso y el primero de las calorías quedaban a catorce píxeles, en la misma
   columna y con la misma tinta, así que «78,3 · 2.576» parecía una escala de
   cinco valores. Con 34 y el filete cruzando también el canal (ver abajo) son
   dos instrumentos, que es lo que son. */
const HUECO = 34;
const ALTO = ALTO_PESO + HUECO + ALTO_KCAL;

/* El canal de la izquierda, donde viven los números de las dos rejillas. Es la
   diferencia entre leer un valor y estimarlo, y por eso es fijo: con un canal
   que se ajustara al texto, dos clientes con pesos de distinto número de cifras
   tendrían el dibujo empezando en sitios distintos. */
const CANAL = 40;
const MARGEN_D = 10;

/* Aire de arriba para el rótulo de cada banda, que va DENTRO del dibujo. */
const CEJA = 16;

const TICKS = 3;

/** Un número de kilos como se dice: 81,5 y no 81.5. */
const kg = (v) => (Math.round(v * 10) / 10).toLocaleString('es-ES');
/** Y de calorías, con su separador de millar. */
const kcal = (v) => Math.round(v).toLocaleString('es-ES');

export const ReviewChart = ({
  weeks = [],
  selected = null,
  onSelect,
  onStep,
  ancho = 0,
  /* El pie del mapa: lo pinta la pantalla y solo cuando la ventana recorta de
     verdad. Va aquí dentro y no encima porque es SUBORDINADO a este dibujo —es
     dónde cae este trozo dentro del proceso entero— y arriba, suelto, se leía
     como una segunda gráfica del mismo dato. */
  mapa = null,
  /*
    ── Solo mirar ─────────────────────────────────────────────────────────────
    Este dibujo nació siendo EL MANDO de la revisión: su eje horizontal se pulsa
    y todo el tablero de abajo pasa a hablar de esa semana. En «Progreso» no hay
    tablero que mandar — se entra a leer la historia entera, no a elegir una
    semana— y una tira de botones que no llevan a ninguna parte es un control
    falso: promete algo y no lo cumple.

    Con `soloLectura` el eje sigue siendo el eje, con sus marcas bajo sus
    columnas, pero deja de ser un grupo de botones y pasa a ser lo que parece:
    rótulos. El dibujo, la rejilla, las dos bandas y la lectura del pie no
    cambian, que es el motivo de reutilizarlo en vez de dibujar otro.
  */
  soloLectura = false,
  /* Dónde empezó cada bloque de entreno: `[{ week, name }]`. Un cambio de
     rutina es tan decisión tuya como un peldaño de calorías, y se marca. */
  cambios = [],
}) => {
  /*
    Las flechas recorren la línea entera y, al llegar al borde de la ventana,
    ésta pasa página sola (de eso se encarga `onStep`). Es el gesto con el que se
    compara de verdad —«a ver la anterior, y la anterior»— y con el ratón obliga
    a apuntar a un objetivo de cincuenta píxeles cada vez.
  */
  const teclas = (event) => {
    const paso = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (paso === 0) return;
    event.preventDefault();
    onStep?.(paso);
  };

  const geo = useMemo(() => {
    const n = weeks.length;
    if (n === 0 || ancho < 200) return null;

    const W = Math.max(280, ancho);
    const util = W - CANAL - MARGEN_D;
    /* Las columnas: el punto de una semana cae en el centro de la suya, que es
       donde cae también su marca en la tira de abajo y su foto en la tira de
       fotos. Las tres piezas comparten esta cuenta a propósito. */
    const columna = util / n;
    const x = (i) => CANAL + (i + 0.5) * columna;

    // ── Banda del peso ────────────────────────────────────────────────────
    const pesos = weeks.map((f) => f.weight).filter((v) => v !== null && v !== undefined);
    const escalaPeso = makeScale(pesos, { padRatio: 0.25 });
    const techoPeso = CEJA;
    const sueloPeso = ALTO_PESO;
    const yPeso = (v) => {
      if (!escalaPeso) return (techoPeso + sueloPeso) / 2;
      const t = (v - escalaPeso.min) / (escalaPeso.max - escalaPeso.min || 1);
      return sueloPeso - t * (sueloPeso - techoPeso);
    };

    const puntos = weeks
      .map((f, i) =>
        f.weight === null || f.weight === undefined ? null : { i, x: x(i), y: yPeso(f.weight) }
      )
      .filter(Boolean);

    const trazo = puntos.length > 1 ? smoothPath(puntos) : '';
    /* El área bajo la curva. Cierra contra el suelo de la banda —no contra cero,
       que está fuera del dibujo— porque lo que apoya la línea es su propia
       rejilla, no un origen que nadie ve. */
    const area =
      puntos.length > 1
        ? `${trazo} L ${puntos[puntos.length - 1].x.toFixed(1)} ${sueloPeso} L ${puntos[0].x.toFixed(1)} ${sueloPeso} Z`
        : '';

    const ticksPeso = escalaPeso
      ? Array.from({ length: TICKS }, (_, k) => {
          const v = escalaPeso.min + ((escalaPeso.max - escalaPeso.min) * k) / (TICKS - 1);
          return { v, y: yPeso(v) };
        })
      : [];

    // ── Banda de las calorías ─────────────────────────────────────────────
    const kcals = weeks.map((f) => f.kcals).filter((v) => v !== null && v !== undefined);
    /*
      La escala arranca por debajo del mínimo y no en cero: entre 2.100 y 2.400,
      con base cero, la escalera sale plana y el peldaño —que es lo único que se
      mira aquí— desaparece.
    */
    const escalaKcal = makeScale(kcals, { padRatio: 0.45 });
    const techoKcal = ALTO_PESO + HUECO + CEJA;
    const sueloKcal = ALTO;
    const yKcal = (v) => {
      if (!escalaKcal) return (techoKcal + sueloKcal) / 2;
      const t = (v - escalaKcal.min) / (escalaKcal.max - escalaKcal.min || 1);
      return sueloKcal - t * (sueloKcal - techoKcal);
    };

    /*
      La escalera, dibujada a mano y no con `smoothPath`. Cada semana ocupa su
      columna entera, así que el trazo va de canto a canto de la columna y salta
      en vertical al cambiar de valor: eso es lo que dibuja el peldaño.

      El relleno va aparte y cierra contra el suelo, igual que el del peso: sin
      él la escalera es un alambre suspendido, que es como se veía.
    */
    let escalera = '';
    let relleno = '';
    let abierta = null;
    weeks.forEach((f, i) => {
      const izq = x(i) - columna / 2;
      const der = x(i) + columna / 2;

      if (f.kcals === null || f.kcals === undefined) {
        if (abierta !== null) {
          relleno += ` L ${abierta.x.toFixed(1)} ${sueloKcal} Z`;
          abierta = null;
        }
        return;
      }

      const y = yKcal(f.kcals);
      if (abierta === null) {
        escalera += ` M ${izq.toFixed(1)} ${y.toFixed(1)}`;
        relleno += ` M ${izq.toFixed(1)} ${sueloKcal} L ${izq.toFixed(1)} ${y.toFixed(1)}`;
      } else {
        escalera += ` L ${izq.toFixed(1)} ${y.toFixed(1)}`;
        relleno += ` L ${izq.toFixed(1)} ${y.toFixed(1)}`;
      }
      escalera += ` L ${der.toFixed(1)} ${y.toFixed(1)}`;
      relleno += ` L ${der.toFixed(1)} ${y.toFixed(1)}`;
      abierta = { x: der };
    });
    if (abierta !== null) relleno += ` L ${abierta.x.toFixed(1)} ${sueloKcal} Z`;

    /* Dos marcas y no tres: la banda mide la mitad, y el dato que se lee aquí es
       «de cuánto a cuánto», no un valor intermedio. */
    const ticksKcal = escalaKcal
      ? [escalaKcal.min, escalaKcal.max].map((v) => ({ v, y: yKcal(v) }))
      : [];

    const iSel = weeks.findIndex((f) => f.week === selected);

    return {
      W,
      x,
      columna,
      escalaPeso,
      puntos,
      trazo,
      area,
      ticksPeso,
      escalera,
      relleno,
      ticksKcal,
      yPeso,
      yKcal,
      iSel,
    };
  }, [weeks, ancho, selected]);

  if (weeks.length === 0) return null;

  /* La lectura de la semana elegida, arriba a la derecha y en una sola línea. Es
     lo que convierte el cursor en una medida: sin ella, elegir una semana movía
     una raya y no decía nada. */
  const fila = weeks.find((f) => f.week === selected) || null;

  return (
    <div className="grafica">
      {geo && (
        <svg
          className="grafica-svg"
          width={geo.W}
          height={ALTO}
          viewBox={`0 0 ${geo.W} ${ALTO}`}
          role="img"
          aria-label={`Su peso y las calorías que le pusiste, de la semana ${weeks[0].week} a la ${weeks[weeks.length - 1].week}`}
        >
          {/* ── La rejilla de las dos bandas, debajo de todo ───────────── */}
          <g className="grafica-rejilla">
            {geo.ticksPeso.map((t) => (
              <line key={`gp-${t.v}`} x1={CANAL} x2={geo.W - MARGEN_D} y1={t.y} y2={t.y} />
            ))}
            {geo.ticksKcal.map((t) => (
              <line key={`gk-${t.v}`} x1={CANAL} x2={geo.W - MARGEN_D} y1={t.y} y2={t.y} />
            ))}
          </g>

          {/*
            La marca de la semana elegida: una regleta de brasa de arriba abajo,
            debajo de los datos. Señala, no tapa.

            ── Era una COLUMNA rellena, y de ancho variable ───────────────────
            Medía `geo.columna`, o sea el hueco entero de una semana. Con seis
            meses de historia eso son cuarenta píxeles y se leía como lo que
            quería ser; con un cliente de cuatro semanas en una tarjeta de 1.200
            px son TRESCIENTOS píxeles de brasa al 14 % cruzando las dos bandas,
            que es una mancha de alerta encima de los datos y no una marca.

            Una raya no depende del número de semanas. Y es la misma marca que
            usa el producto en todas partes —el canto de la barra lateral, la
            raya de la pestaña activa— alineada además con el subrayado de la
            semana en la tira de abajo: sube y baja el mismo trazo.
          */}
          {geo.iSel >= 0 && (
            <line
              className="grafica-marca"
              x1={geo.x(geo.iSel)}
              x2={geo.x(geo.iSel)}
              y1="0"
              y2={ALTO}
            />
          )}

          {/* ── Los cambios de bloque: una raya discontinua en el canto de la
              semana en que empezó, con su nombre en el canal entre bandas. ── */}
          {cambios.map((c) => {
            const i = weeks.findIndex((f) => f.week === c.week);
            if (i < 0) return null;
            const x = geo.x(i) - geo.columna / 2;
            return (
              <g key={`b-${c.week}`} className="grafica-cambio">
                <line x1={x} x2={x} y1={0} y2={ALTO} />
                <text x={x + 5} y={ALTO_PESO + HUECO / 2 - 5}>{c.name}</text>
              </g>
            );
          })}

          {/* ── Banda 1 · el peso ──────────────────────────────────────── */}
          <text className="banda-rotulo" x={CANAL} y="9">
            PESO
          </text>

          {geo.area && <path className="banda-area" d={geo.area} fill={metricColor('weight')} />}
          {geo.trazo && (
            <path
              className="banda-trazo"
              d={geo.trazo}
              fill="none"
              stroke={metricColor('weight')}
            />
          )}

          {/* Un punto por semana con pesaje, y el de la elegida más grande y con
              anillo del color del lienzo: es lo que lo despega de la línea sin
              añadir otra tinta. */}
          {geo.puntos.map((p) => (
            <circle
              key={`p-${weeks[p.i].week}`}
              className={`banda-punto${weeks[p.i].week === selected ? ' is-now' : ''}`}
              cx={p.x}
              cy={p.y}
              r={weeks[p.i].week === selected ? 5 : 2.5}
              fill={metricColor('weight')}
            />
          ))}

          {/* Los números de la rejilla, ENCIMA del área para que no se los coma
              el relleno. Al canto del canal, alineados a la derecha, que es como
              se comparan dos cifras de distinto número de dígitos. */}
          <g className="grafica-eje">
            {geo.ticksPeso.map((t) => (
              <text key={`tp-${t.v}`} x={CANAL - 8} y={t.y} textAnchor="end" dominantBaseline="middle">
                {kg(t.v)}
              </text>
            ))}
          </g>

          {/* El filete que separa las dos bandas: son dos escalas distintas y hay
              que verlo, o vuelven a leerse como un solo gráfico.

              Empieza en cero y no en `CANAL`, que es donde empiezan las líneas
              de la rejilla: la rejilla vive dentro del dibujo, pero esto tiene
              que cortar también el canal de los números — que es justo donde las
              dos escalas se confundían. */}
          <line
            className="banda-corte"
            x1={0}
            x2={geo.W - MARGEN_D}
            y1={ALTO_PESO + HUECO / 2}
            y2={ALTO_PESO + HUECO / 2}
          />

          {/* ── Banda 2 · las calorías, en escalera ───────────────────── */}
          <text className="banda-rotulo" x={CANAL} y={ALTO_PESO + HUECO + 9}>
            KCAL OBJETIVO
          </text>

          {geo.relleno && (
            <path className="banda-area" d={geo.relleno} fill={metricColor('kcals')} />
          )}
          <path
            className="banda-escalera"
            d={geo.escalera}
            fill="none"
            stroke={metricColor('kcals')}
          />

          {/* Los peldaños: dónde TÚ cambiaste algo. Es la marca que convierte el
              dibujo en el registro de tus decisiones. */}
          {weeks.map((f, i) =>
            f.changed && f.kcals !== null && f.kcals !== undefined ? (
              <circle
                key={`c-${f.week}`}
                className="banda-escalon"
                cx={geo.x(i)}
                cy={geo.yKcal(f.kcals)}
                r="3.5"
                fill={metricColor('kcals')}
              />
            ) : null
          )}

          <g className="grafica-eje">
            {geo.ticksKcal.map((t) => (
              <text key={`tk-${t.v}`} x={CANAL - 8} y={t.y} textAnchor="end" dominantBaseline="middle">
                {kcal(t.v)}
              </text>
            ))}
          </g>
        </svg>
      )}

      {/* ── El eje horizontal, que además se pulsa ──────────────────────────
          Son las mismas columnas del dibujo, así que la marca de la semana 20
          cae bajo su punto. Marcas pequeñas y no cajas anchas: una caja llena del
          ancho de la columna se lee como un bloque de datos, no como un botón. */}
      <div
        className="grafica-tira"
        style={{
          gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
          marginLeft: geo ? CANAL : 0,
          marginRight: geo ? MARGEN_D : 0,
        }}
        role={soloLectura ? undefined : 'group'}
        aria-label={soloLectura ? undefined : 'Elegir qué semana revisar'}
        onKeyDown={soloLectura ? undefined : teclas}
      >
        {weeks.map((f) =>
          soloLectura ? (
            <span
              key={f.week}
              className={`grafica-semana${f.reviewed ? ' is-hecha' : ''}`}
              aria-hidden="true"
            >
              S{f.week}
            </span>
          ) : (
            <button
              key={f.week}
              type="button"
              className={`grafica-semana${f.week === selected ? ' is-now' : ''}${
                f.reviewed ? ' is-hecha' : ''
              }`}
              aria-pressed={f.week === selected}
              /* Roving tabindex: una sola parada para toda la tira, y dentro se
                 anda con las flechas. Veinte paradas seguidas para elegir una
                 semana es lo que convierte el tabulador en algo que se evita. */
              tabIndex={f.week === selected ? 0 : -1}
              onClick={() => onSelect?.(f.week)}
            >
              S{f.week}
            </button>
          )
        )}
      </div>

      {/* ── La lectura de la semana elegida ────────────────────────────────
          Va debajo del eje y no flotando sobre el dibujo: una etiqueta que se
          mueve con el cursor tapa justo la parte de la curva que se compara.

          Y dice las CALORÍAS, no el peso. El peso está tres centímetros más
          arriba, a cuarenta píxeles de alto y con su variación al lado: decirlo
          aquí otra vez no informaba dos veces, hacía dudar de si eran el mismo
          dato. Lo que la cifra grande no cuenta es la otra banda. */}
      {fila && (
        <p className="grafica-lectura" aria-live="polite">
          <span className="s">Semana {fila.week}</span>
          <span className="v" style={{ color: metricColor('kcals') }}>
            {fila.kcals === null || fila.kcals === undefined
              ? 'sin plan registrado'
              : `${kcal(fila.kcals)} kcal`}
          </span>
          {fila.changed && <span className="n">se lo cambiaste esta semana</span>}
        </p>
      )}

      {/* Y el mapa, cuando la ventana recorta de verdad. Ver la cabecera. */}
      {mapa}
    </div>
  );
};
