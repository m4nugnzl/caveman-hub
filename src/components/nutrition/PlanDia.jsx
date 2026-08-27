import { carbsFromRest, mealTarget, mealTargetsTotal, optionMacros } from '@/domain/nutrition';
import { toNum0 } from '@/lib/num';
import { opcionElegida } from './macros';

/**
 * EL PLAN DEL DÍA: una sola tabla, y todo en las mismas columnas.
 *
 *                                 KCAL     P      C      G    PESO
 *     OBJETIVO DEL PLAN           3100   120    531     55
 *     1  Desayuno                 [900]  [40]  [140]   [20]   29 %
 *     2  Comida                  [1100]  [40]  [190]   [20]   35 %
 *     3  Cena                    [1100]  [40]  [201]   [15]   35 %
 *     REPARTIDAS                  3100   120    531     55   cuadra
 *     SUMAN (opciones abiertas)   3072   111    521     60   99 %
 *
 * Arriba lo que pide el plan; en medio, lo que se le asigna a cada comida (se
 * escribe aquí); abajo, lo repartido y lo que suman de verdad los alimentos con
 * las opciones abiertas, celda a celda y en color según cuadre con el objetivo.
 * Lo esperado y lo real, alineados con sus macros: no hay que buscar nada.
 *
 * Hubo cajas con barras, anillos y una columna de «opciones · reparto». Sobraban:
 * la comparación ya está en la última fila, y qué opción está abierta lo dice la
 * hoja.
 */
const CAMPOS = [
  { key: 'kcals', label: 'kcal', plan: 'targetKcals', real: 'kcal' },
  { key: 'protein', label: 'P', plan: 'proteinGrams', real: 'protein' },
  { key: 'carbs', label: 'C', plan: 'carbsGrams', real: 'carbs' },
  { key: 'fats', label: 'G', plan: 'fatsGrams', real: 'fats' },
];

const estadoDe = (real, objetivo) => {
  if (!objetivo) return '';
  const margen = objetivo * 0.05;
  return real - objetivo > margen ? ' is-over' : objetivo - real > margen ? ' is-under' : ' is-ok';
};

export const PlanDia = ({ meals, targets, elegidas = {}, onTarget, onIrA }) => {
  const objetivoKcal = toNum0(targets?.targetKcals);
  const reparto = mealTargetsTotal(meals, objetivoKcal);

  /* Lo que suman los alimentos con la opción abierta en cada comida. */
  const suma = meals.reduce(
    (acc, meal) => {
      const m = optionMacros(opcionElegida(meal, elegidas));
      return { protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fats: acc.fats + m.fats, kcal: acc.kcal + m.kcal };
    },
    { protein: 0, carbs: 0, fats: 0, kcal: 0 }
  );

  /* El peso de cada comida dentro del día: su objetivo o, sin él, lo que suma. */
  const pesos = meals.map((meal) => {
    const objetivo = mealTarget(meal);
    return objetivo ? objetivo.kcals : Math.round(optionMacros(opcionElegida(meal, elegidas)).kcal);
  });
  const basePeso = Math.max(objetivoKcal, pesos.reduce((s, p) => s + p, 0), 1);

  const lectura =
    reparto.meals === 0
      ? objetivoKcal
        ? 'sin repartir'
        : ''
      : reparto.left === null
        ? ''
        : reparto.left === 0
          ? 'cuadra'
          : reparto.left > 0
            ? `quedan ${reparto.left}`
            : `te pasas ${Math.abs(reparto.left)}`;
  const pctDia = objetivoKcal && suma.kcal ? `${Math.round((suma.kcal / objetivoKcal) * 100)} %` : '';

  return (
    <section className="plan-dia" aria-label="Plan del día">
      <div className="plan-dia-tabla">
        <div className="plan-dia-fila is-cab" aria-hidden="true">
          <span />
          <span className="is-nombre" />
          {CAMPOS.map((c) => (
            <span key={c.key} className="is-num">{c.label}</span>
          ))}
          <span className="is-peso">Peso</span>
        </div>

        {/* Lo que pide el plan: la referencia de todo lo de abajo. */}
        <div className="plan-dia-fila is-plan">
          <span />
          <span className="is-nombre">Objetivo del plan</span>
          {CAMPOS.map((c) => (
            <span key={c.key} className="is-num">{toNum0(targets?.[c.plan]) || '—'}</span>
          ))}
          <span className="is-peso" />
        </div>

        {meals.map((meal, i) => {
          const target = meal.target || {};
          /* Los hidratos que cuadrarían la comida, como sugerencia en el hueco
             vacío: al enfocarlo se acepta. No se escriben solos —hay planes
             donde el resto NO son hidratos—. */
          const sugerido = carbsFromRest(target);
          const faltaCarbs = !toNum0(target.carbs);
          const pct = Math.round((pesos[i] / basePeso) * 100);
          return (
            <div key={meal.id} className="plan-dia-fila">
              <span className="plan-dia-n">{i + 1}</span>
              <button type="button" className="plan-dia-nombre" onClick={() => onIrA?.(i)} title="Ir a la comida">
                {meal.name}
              </button>
              {CAMPOS.map((campo) => {
                const ofrece = campo.key === 'carbs' && faltaCarbs && sugerido !== null;
                return (
                  <span key={campo.key} className="is-num">
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`hoja-celda${ofrece ? ' is-suggested' : ''}`}
                      placeholder={ofrece ? String(sugerido) : '—'}
                      value={target[campo.key] ?? ''}
                      onChange={(e) => onTarget(i, campo.key, e.target.value)}
                      onFocus={() => ofrece && onTarget(i, 'carbs', String(sugerido))}
                      aria-label={`${campo.label} objetivo de ${meal.name}`}
                      title={ofrece ? `Los ${sugerido} g que cuadran esta comida` : undefined}
                    />
                  </span>
                );
              })}
              <span className="is-peso">{pesos[i] ? `${pct} %` : ''}</span>
            </div>
          );
        })}

        <div className="plan-dia-fila is-total">
          <span />
          <span className="is-nombre">Repartidas</span>
          {CAMPOS.map((c) => (
            <span key={c.key} className="is-num">
              {reparto.meals > 0 ? reparto[c.key] : '—'}
            </span>
          ))}
          <span className={`is-peso plan-dia-lectura${reparto.left === 0 && reparto.meals > 0 ? ' is-ok' : reparto.left < 0 ? ' is-over' : ''}`}>
            {lectura}
          </span>
        </div>

        {/* Lo real, celda a celda contra el objetivo del plan. */}
        <div className="plan-dia-fila is-suma">
          <span />
          <span className="is-nombre">
            Suman <small>con las opciones abiertas</small>
          </span>
          {CAMPOS.map((c) => {
            const valor = Math.round(suma[c.real]);
            return (
              <span key={c.key} className={`is-num${estadoDe(valor, toNum0(targets?.[c.plan]))}`}>
                {valor || '—'}
              </span>
            );
          })}
          <span className={`is-peso plan-dia-lectura${estadoDe(Math.round(suma.kcal), objetivoKcal)}`}>{pctDia}</span>
        </div>
      </div>
    </section>
  );
};
