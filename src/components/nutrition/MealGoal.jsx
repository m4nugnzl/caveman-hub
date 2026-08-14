import { mealTarget, optionGaps } from '@/domain/nutrition';
import { MACRO_META } from './macros';

/**
 * El objetivo de una comida.
 *
 * ══ Dos lecturas de lo mismo, y por eso un solo componente ══════════════════
 *
 * Lo que el entrenador reparte por comida es **la prescripción**: «tu desayuno
 * son 520 kcal con 40 g de proteína». Eso es de la persona que va a comérselo, y
 * esconderlo era el error de la versión anterior — el cliente veía la lista de
 * alimentos sin saber nunca qué se esperaba de esa comida.
 *
 * Al entrenador le hace falta lo mismo Y una cosa más: **cuánto se desvía de lo
 * que ha montado**. Es la diferencia entre leer un plan y comprobarlo.
 *
 * Un solo componente con un interruptor, y no dos: son la misma tabla con una
 * columna más. Dos componentes acabarían divergiendo en los colores y en el
 * redondeo, que es justo donde se nota.
 *
 * ── Por qué barras y no solo cifras ────────────────────────────────────────
 * Porque «40 de 45» y «120 de 500» son la misma resta y no el mismo problema. La
 * barra dice la PROPORCIÓN, que es lo que decide si hay que tocar algo, y deja
 * las cifras para cuando ya has decidido tocarlo.
 */

/** Las cuatro filas. Las kcal primero: es la cifra con la que se decide. */
const FILAS = [
  { key: 'kcals', label: 'kcal', color: 'var(--warning)', unit: '' },
  ...MACRO_META.map(({ key, short, color }) => ({ key, label: short, color, unit: ' g' })),
];

export const MealGoal = ({ meal, optionIndex = 0, showGap = false }) => {
  const target = mealTarget(meal);
  if (!target) return null;

  /* Lo que hay montado en ESTA opción. Solo hace falta para la desviación, así
     que al cliente ni se le calcula. */
  const gap = showGap ? optionGaps(meal)[optionIndex] || null : null;

  return (
    <div className={`meal-goal${showGap ? ' is-coach' : ''}`}>
      <span className="k">{showGap ? 'Objetivo de esta comida' : 'Lo que busca esta comida'}</span>

      <div className="rows">
        {FILAS.map(({ key, label, color, unit }) => {
          const objetivo = target[key];
          if (!objetivo) return null;

          const actual = gap ? objetivo + gap.diff[key] : null;
          const diff = gap ? gap.diff[key] : null;
          /*
            La barra se corta al 100 %: lo que se sale se dice con el color y con
            la cifra, no estirando la barra fuera de su carril. Una barra que se
            desborda deja de ser comparable con las de al lado, que es lo único
            para lo que sirve tener cuatro juntas.
          */
          const pct = actual === null ? 100 : Math.min(100, Math.round((actual / objetivo) * 100));
          const pasado = diff !== null && diff > objetivo * 0.05;
          const corto = diff !== null && diff < -objetivo * 0.05;

          return (
            <div className="fila" key={key}>
              <span className="n" style={{ color }}>
                {label}
              </span>

              <span className="track">
                <span
                  className="fill"
                  style={{ width: `${pct}%`, background: pasado ? 'var(--negative)' : color }}
                />
              </span>

              <span className="v">
                {objetivo}
                {unit}
              </span>

              {gap && (
                <span className={`d${pasado ? ' is-over' : corto ? ' is-under' : ' is-ok'}`}>
                  {pasado || corto ? `${diff > 0 ? '+' : ''}${diff}` : '✓'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
