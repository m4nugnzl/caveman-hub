import { Beef, Droplet, Wheat } from 'lucide-react';

import { KCAL_PER_GRAM, MACROS } from '@/domain/nutrition';
import { round, toNum0 } from '@/lib/num';
import { MacroDonut } from '@/components/ui/charts';

/**
 * Los tres macros, con todo lo que la interfaz necesita saber de ellos en un
 * solo sitio: cómo se llaman, de qué color son, qué icono los representa y
 * cuántas kcal aporta cada gramo.
 */
const ICONS = { protein: Beef, carbs: Wheat, fats: Droplet };

/** La tripleta del dominio más su icono. El color NO se decide aquí. */
export const MACRO_META = MACROS.map((macro) => ({ ...macro, Icon: ICONS[macro.key] }));

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
 * Total del día: cifra calórica, barra segmentada por macro e iconos.
 *
 * ── Por qué esta forma y no un anillo ───────────────────────────────────────
 * Es la misma que en el resumen y la misma que tenía antes la hoja, y eso no es
 * casualidad: el objetivo del día es UNA cifra con su reparto, y una barra a lo
 * ancho aprovecha el ancho de la tarjeta y admite las tres etiquetas al lado. El
 * anillo se reserva para las comidas y las opciones, donde hay varias piezas
 * pequeñas que comparar entre sí.
 */
export const MacroBar = ({
  protein,
  carbs,
  fats,
  kcals,
  caption,
  size = 'lg',
  // Dentro de una tarjeta de métrica la cifra ya la pone la tarjeta; repetirla
  // aquí sería el mismo número dos veces, una encima de la otra.
  showTotal = true,
}) => {
  const macros = macroBreakdown({ protein, carbs, fats, kcals });

  return (
    <div className="macro-summary">
      {(showTotal || caption) && (
        <div className="macro-summary-head">
          {showTotal && (
            <span className="figure">
              <span className="v">{macros.kcals > 0 ? macros.kcals : '—'}</span>
              <span className="u">kcal</span>
            </span>
          )}
          {caption && <span className="caption">{caption}</span>}
        </div>
      )}

      <div className={`macro-bar${size === 'lg' ? ' macro-bar-lg' : ''}`}>
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
        {MACRO_META.map(({ key, label, color, Icon }) => (
          <span className="macro-legend-item" key={key}>
            <Icon size={14} color={color} />
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

/** El margen dentro del cual un macro «cuadra»: el 5 % de lo pautado. */
export const MARGEN = 0.05;

/**
 * ¿Cuadra, se pasa o se queda corto? El mismo margen con el que la ventana del
 * día cuenta las comidas que cuadran.
 */
export const estadoMacro = (real, objetivo) => {
  if (!objetivo) return '';
  const diff = real - objetivo;
  const margen = objetivo * MARGEN;
  return diff > margen ? 'is-over' : diff < -margen ? 'is-under' : 'is-ok';
};

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
 * @param {string} [color]     Color del macro, para el punto del rótulo.
 * @param {string} [lectura]   Línea de pie: «cuadra», «−9 g», «+3».
 * @param {boolean} [total]    La columna del total (las kcal): va separada de
 *                             las tres que la descomponen.
 */
export const Medidor = ({ label, color, valor, objetivo, unidad = '', lectura, total = false }) => {
  const estado = estadoMacro(valor, objetivo);

  return (
    <div className={`medidor${total ? ' is-total' : ''}${estado ? ` ${estado}` : ''}`}>
      <span className="k">
        {color && <i style={{ background: color }} />}
        {label}
      </span>
      <span className="v">
        <b>{valor}</b>
        {objetivo ? <small>/{objetivo}{unidad ? ` ${unidad}` : ''}</small> : unidad ? <small> {unidad}</small> : null}
      </span>
      {lectura && <span className="lectura">{lectura}</span>}
    </div>
  );
};
