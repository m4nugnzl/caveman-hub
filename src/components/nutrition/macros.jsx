import { KCAL_PER_GRAM, MACROS, claseDe } from '@/domain/nutrition';
import { round, toNum0 } from '@/lib/num';
import { MacroDonut } from '@/components/ui/charts';

/**
 * Los tres macros, con todo lo que la interfaz necesita saber de ellos en un
 * solo sitio: cómo se llaman, de qué color son y cuántas kcal aporta cada gramo.
 *
 * ── Aquí vivían un filete, una espiga y una gota ────────────────────────────
 * Tres iconos de lucide, uno por macro, pintados del color del macro. Repetían
 * en dibujo la palabra que tenían al lado —«🥩 Proteína»— y eran, junto con la
 * barra de la tarjeta, el único sitio de la aplicación donde el color decía una
 * CATEGORÍA en vez de comparar o juzgar. En una pantalla en la que el ámbar
 * significa «ojo con esto» pegado a una cifra, el ámbar no puede significar
 * además «carbos». Ver [[ley-del-color]].
 *
 * El color sobrevive donde sí distingue series: dentro del anillo (MacroRing,
 * MacroDonut) y en la barra del editor, con la leyenda que le corresponde.
 */
export const MACRO_META = MACROS;

/**
 * Reparto calórico a partir de los gramos.
 *
 * ── Dos cosas que antes se hacían mal ───────────────────────────────────────
 * 1. Los gramos se pintaban tal cual. Los de una opción son una SUMA de
 *    alimentos («100 g de avena + 30 g de whey»), así que salían valores como
 *    45.599999999999994 en pantalla. Aquí se redondean una sola vez, en el
 *    origen, y ya nadie tiene que acordarse.
 * 2. Los porcentajes se calculaban sobre los gramos en algunos sitios. Un gramo
 *    de grasa aporta 9 kcal y uno de carbohidrato 4: el reparto solo significa
 *    algo medido en kcal.
 */
export const macroBreakdown = ({ protein, carbs, fats, kcals } = {}) => {
  const grams = {
    protein: round(toNum0(protein)),
    carbs: round(toNum0(carbs)),
    fats: round(toNum0(fats)),
  };
  const energy = {
    protein: grams.protein * KCAL_PER_GRAM.protein,
    carbs: grams.carbs * KCAL_PER_GRAM.carbs,
    fats: grams.fats * KCAL_PER_GRAM.fats,
  };
  const total = energy.protein + energy.carbs + energy.fats;

  const pct = { protein: 0, carbs: 0, fats: 0 };
  if (total > 0) {
    // Se reparte el resto para que los tres porcentajes sumen exactamente 100:
    // redondear los tres por separado da 33/33/33 o 34/33/34 según el caso, y en
    // pantalla se ve como un error de cuentas.
    let acc = 0;
    MACRO_META.forEach(({ key }, index) => {
      if (index === MACRO_META.length - 1) {
        pct[key] = 100 - acc;
      } else {
        pct[key] = Math.round((energy[key] / total) * 100);
        acc += pct[key];
      }
    });
  }

  const shown = toNum0(kcals) > 0 ? Math.round(toNum0(kcals)) : Math.round(total);

  return { grams, energy, pct, total: Math.round(total), kcals: shown, empty: total === 0 };
};

/**
 * El objetivo mientras se teclea: la cifra, la barra de reparto y su leyenda.
 *
 * ── Dónde vive, y por qué SOLO ahí ──────────────────────────────────────────
 * Esta pieza es la vista previa del EDITOR del objetivo, y nada más. Ahí la
 * barra hace un trabajo que ningún número hace: se teclean 120 de proteína y el
 * tramo crece delante de ti, así que el reparto se decide viéndolo.
 *
 * En la tarjeta del costado la barra no hacía ese trabajo. Estaba quieta, decía
 * lo mismo que los tres porcentajes escritos debajo, y encima obligaba a pintar
 * los tres macros de tres colores en una pantalla donde el ámbar significa «ojo
 * con esto» a doscientos píxeles de distancia. Ahí ahora va `MacroLista`.
 *
 * ── La leyenda perdió el filete, la espiga y la gota ────────────────────────
 * Eran tres iconos ilustrativos —de aplicación de contar calorías— y su único
 * trabajo era repetir en dibujo la palabra que tenían al lado. Lo que la leyenda
 * de un gráfico necesita es decir de quién es cada tramo, y para eso la casa ya
 * tiene su marca: el cuadradito de serie de `.medidor`. Ver [[ley-del-color]]:
 * los discos distinguen series, y solo dentro de un gráfico.
 */
export const MacroBar = ({ protein, carbs, fats, kcals, caption }) => {
  const macros = macroBreakdown({ protein, carbs, fats, kcals });

  return (
    <div className="macro-summary">
      <div className="macro-summary-head">
        <span className="figure">
          <span className="v">{macros.kcals > 0 ? macros.kcals : '—'}</span>
          <span className="u">kcal</span>
        </span>
        {caption && <span className="caption">{caption}</span>}
      </div>

      <div className="macro-bar macro-bar-lg">
        {macros.empty ? (
          <div style={{ width: '100%', background: 'var(--fill)' }} />
        ) : (
          MACRO_META.map(({ key, label, color }) => (
            <div
              key={key}
              style={{ width: `${macros.pct[key]}%`, background: color }}
              title={`${label}: ${macros.pct[key]}%`}
            />
          ))
        )}
      </div>

      <div className="macro-legend">
        {MACRO_META.map(({ key, label, color }) => (
          <span className="macro-legend-item" key={key}>
            <i style={{ background: color }} />
            <span className="k">{label}</span>
            <span className="g">{macros.grams[key]} g</span>
            {!macros.empty && <span className="p">{macros.pct[key]}%</span>}
          </span>
        ))}
      </div>
    </div>
  );
};

/**
 * El objetivo en reposo: tres renglones, y a plomo con «El día».
 *
 * ══ POR QUÉ ESTA FORMA Y NO LA BARRA ═══════════════════════════════════════
 *
 * En el costado de la dieta hay dos tarjetas pegadas —«Objetivo» y «El día»—
 * que listan LOS MISMOS TRES MACROS. Hasta hoy lo hacían con dos dibujos
 * distintos y a veinte píxeles de distancia: arriba una barra de tres colores
 * con un filete, una espiga y una gota y los porcentajes en píldoras; debajo
 * tres renglones sobrios con el desvío y los g/kg. La misma información,
 * dibujada dos veces, en dos idiomas.
 *
 * Es exactamente la avería que ya se corrigió una vez —«El día» y «El reparto»
 * eran dos tarjetas seguidas con la misma lista— y que había vuelto por arriba.
 *
 * Ahora las dos usan `Medidor` en renglón, así que las cifras caen en la MISMA
 * VERTICAL: el gramaje bajo el gramaje y el apunte en voz baja bajo el apunte
 * (aquí el reparto en %, abajo los g/kg). Lee como una tarjeta partida en dos,
 * que es lo que de verdad es.
 *
 * El color se retira entero: sin barra que interpretar, un rosa pegado a la
 * palabra «Proteína» no compara ni juzga nada. Ver [[ley-del-color]], ley 4.
 */
export const MacroLista = ({ protein, carbs, fats }) => {
  const macros = macroBreakdown({ protein, carbs, fats });

  return (
    <div className="medidores is-filas">
      {MACRO_META.map(({ key, label }) => (
        <Medidor
          key={key}
          fila
          juzga={false}
          label={label}
          campo={key}
          valor={macros.grams[key]}
          unidad="g"
          apunte={macros.empty ? '' : `${macros.pct[key]} %`}
        />
      ))}
    </div>
  );
};

/**
 * Reparto de una comida o de una opción: anillo de reparto + leyenda.
 *
 * ── El cambio respecto a lo anterior ────────────────────────────────────────
 * Antes había un anillo SIEMPRE COMPLETO de un solo color con las kcal dentro, y
 * al lado tres barras de progreso que en realidad no medían un progreso contra
 * nada. Dos gráficos, cero información: el anillo no variaba nunca y las barras
 * repetían el porcentaje que ya estaba escrito debajo.
 *
 * Ahora el anillo es el reparto —tres arcos proporcionales a las kcal de cada
 * macro— y la leyenda dice de quién es cada color con su cifra. Una sola lectura,
 * y comparar dos opciones de la misma comida es comparar dos anillos.
 */
export const MacroRing = ({ protein, carbs, fats, kcals, caption, size = 92 }) => {
  const macros = macroBreakdown({ protein, carbs, fats, kcals });

  return (
    <div className="macro-ring">
      <MacroDonut
        size={size}
        thickness={Math.round(size * 0.13)}
        slices={MACRO_META.map(({ key, label, color }) => ({
          key,
          label,
          color,
          value: macros.energy[key],
        }))}
        label={macros.kcals > 0 ? macros.kcals : '—'}
        unit="kcal"
      />

      <div className="macro-ring-side">
        {caption && <span className="tray-title">{caption}</span>}

        {/*
          Una columna por macro, no una lista de filas.
          --------------------------------------------------------------------
          En filas, el nombre, los gramos y el porcentaje quedaban a distancias
          distintas del anillo y la vista tenía que saltar de un lado a otro. En
          columnas, cada macro es un bloque compacto —color, nombre, gramos, %— y
          los tres se comparan de una pasada horizontal, que es la misma dirección
          en la que se lee el anillo.
        */}
        <div className="macro-ring-legend">
          {MACRO_META.map(({ key, label, color }) => (
            <div className="macro-cell" key={key}>
              <span className="k">
                <span className="dot" style={{ background: color }} />
                {label}
              </span>
              <span className="g">{macros.grams[key]} g</span>
              <span className="p">{macros.empty ? '—' : `${macros.pct[key]}%`}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * El reparto de macros en MINIATURA: una barra de tres tramos y nada más.
 *
 * Para la cabecera de una comida y las filas del plan del día: dice de un
 * vistazo si una comida es de proteína o de hidratos sin gastar un anillo ni
 * una leyenda. Los colores son los del dominio, como en la barra grande.
 */
export const MacroMini = ({ protein, carbs, fats, title }) => {
  const m = macroBreakdown({ protein, carbs, fats });
  if (m.empty) return null;
  return (
    <span
      className="macro-mini"
      role="img"
      aria-label={`Proteína ${m.pct.protein} %, carbos ${m.pct.carbs} %, grasas ${m.pct.fats} %`}
      title={title || `P ${m.pct.protein} % · C ${m.pct.carbs} % · G ${m.pct.fats} %`}
    >
      {MACRO_META.map(({ key, color }) => (
        <span key={key} style={{ width: `${m.pct[key]}%`, background: color }} />
      ))}
    </span>
  );
};

/**
 * La opción ELEGIDA de una comida, para sumar el día con lo que está abierto.
 * `elegidas` es `{ [meal.id]: índice }`; sin entrada, la primera.
 */
export const opcionElegida = (meal, elegidas) => {
  const n = (meal?.options || []).length;
  const i = elegidas?.[meal?.id] ?? 0;
  return meal?.options?.[Math.min(Math.max(0, i), Math.max(0, n - 1))];
};

/**
 * ¿Cuadra, se pasa o se queda corto?
 *
 * El margen ya no se decide aquí: lo pone `estadoDe` en el dominio, con su
 * suelo y en un solo sitio para toda la dieta. Esta función se queda porque el
 * medidor quiere la clase sin el espacio de delante, y nada más.
 */
export const estadoMacro = (real, objetivo, campo = 'kcals') =>
  claseDe(real, objetivo, campo).trim();

/**
 * UNA COLUMNA DE LA TIRA DEL DÍA: rótulo, lo que va sobre lo pedido, y de
 * cuánto es la diferencia.
 *
 * ══ Por qué aquí no hay gráfico ═════════════════════════════════════════════
 *
 * Se probaron tres y los tres estorbaban:
 *
 *   1. Un anillo junto a una barra. Los arcos del anillo eran el reparto de
 *      macros pero su centro llevaba el porcentaje del objetivo —lo que ya
 *      pintaba la barra—: dos gráficos para un dato, y el anillo diciendo dos
 *      cosas distintas a la vez.
 *   2. Cuatro barras de progreso. Una dieta montada va siempre por el 95-105 %
 *      de lo pautado, así que las cuatro salían llenas: cuatro franjas de color
 *      sin más lectura que su propio color.
 *   3. Un medidor de desvío, con lo pautado en el centro. Medía lo correcto,
 *      pero cada columna tenía su propio eje y cuatro rayitas sueltas a distinta
 *      altura se leían como un fallo de pintado, no como un dato.
 *
 * El problema de fondo es que aquí no hay nada que dibujar: son cuatro
 * diferencias de una o dos cifras. «−9 g» ES el gráfico, y escrito ocupa menos
 * y se entiende antes. Lo que sí hacía falta era que las cuatro columnas se
 * pudieran leer en horizontal, y para eso las cuatro cifras van del MISMO
 * tamaño —el tamaño extra de las kcal era lo que desalineaba las filas— y cada
 * renglón queda a la altura de su vecino.
 *
 * ── El color, donde hay algo que corregir ───────────────────────────────────
 * Las cifras van en tinta de dato. Cuatro números en verde por cuadrar son la
 * misma señal cuatro veces y dejan de ser señal: el color vive en la línea de
 * la diferencia, y solo cuando se sale del margen.
 *
 * @param {string} [color]     Color del macro, para el punto del rótulo. En el
 *                             costado NO se pasa: allí cada renglón lleva su
 *                             nombre escrito y el punto no distinguía nada.
 * @param {string} [lectura]   Línea de pie: «cuadra», «−9 g», «+3».
 * @param {boolean} [total]    La columna del total (las kcal): va separada de
 *                             las tres que la descomponen.
 * @param {string} [campo]     Cuál de los cuatro es, para el suelo del margen:
 *                             ±25 kcal en el total y ±3 g en cada macro.
 * @param {boolean} [juzga]    Con `false` la cifra se enseña y no se colorea.
 *                             Es lo que ve el cliente: el descuadre del plan es
 *                             del trabajo de su entrenador, no suyo.
 * @param {boolean} [fila]     En RENGLÓN y no en columna: el nombre a la
 *                             izquierda y las cifras alineadas a la derecha. Es
 *                             la forma del costado, donde los tres macros son
 *                             una lista y en rejilla dejaban un hueco.
 * @param {string} [apunte]    Un dato más en voz baja al final del renglón —los
 *                             gramos por kilo—. Solo tiene sitio en `fila`.
 */
export const Medidor = ({
  label,
  color,
  valor,
  objetivo,
  unidad = '',
  lectura,
  apunte,
  total = false,
  fila = false,
  campo = 'kcals',
  juzga = true,
}) => {
  const estado = juzga ? estadoMacro(valor, objetivo, campo) : '';

  return (
    <div className={`medidor${total ? ' is-total' : ''}${fila ? ' is-fila' : ''}${estado ? ` ${estado}` : ''}`}>
      <span className="k">
        {color && <i style={{ background: color }} />}
        {label}
      </span>
      <span className="v">
        <b>{valor}</b>
        {objetivo ? <small>/{objetivo}{unidad ? ` ${unidad}` : ''}</small> : unidad ? <small> {unidad}</small> : null}
      </span>
      {/* En renglón las celdas se pintan siempre, aunque vayan vacías: si
          desaparecieran, las cifras de las tres filas dejarían de estar en la
          misma vertical y la lista se leería como tres frases sueltas. */}
      {(lectura || fila) && <span className="lectura">{lectura || ''}</span>}
      {fila && <span className="apunte">{apunte || ''}</span>}
    </div>
  );
};
