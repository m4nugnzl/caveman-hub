import { optionMacros } from '@/domain/nutrition';
import { toNum0 } from '@/lib/num';
import { MACRO_META, Medidor, opcionElegida } from './macros';

/**
 * EL DÍA, encima de las comidas de la hoja: cuánto llevas del objetivo.
 *
 *     Macros del día  con las opciones abiertas: 1 · 1 · 1        Ver el día ↗
 *
 *     KCAL           │  ● PROTEÍNA    ● CARBOS       ● GRASAS
 *     3072/3100      │  111/120 g     521/531 g      60/55 g
 *     cuadra         │  −9 g          −10 g          +5 g
 *
 * ── Tres gráficos descartados antes de no poner ninguno ─────────────────────
 * 1. Un anillo junto a una barra: los arcos eran el reparto de macros pero el
 *    centro del anillo llevaba el porcentaje del objetivo, que era lo que ya
 *    pintaba la barra. Dos gráficos para un dato.
 * 2. Cuatro barras de progreso. Una dieta montada va siempre por el 95-105 %
 *    de lo pautado: las cuatro salían llenas, cuatro franjas de color y ni una
 *    lectura.
 * 3. Un medidor de desvío con lo pautado en el centro. Medía lo correcto, pero
 *    cuatro ejes independientes con una rayita cada uno se leían como un fallo
 *    de pintado.
 *
 * No había nada que dibujar: son cuatro diferencias de una o dos cifras, y
 * «−9 g» ES el gráfico. Lo que faltaba era poder leer las cuatro columnas en
 * horizontal, y para eso las cuatro cifras van del mismo tamaño —el tamaño
 * extra de las kcal era lo que desalineaba los renglones—. El total queda
 * separado por un filete de los tres macros que lo descomponen.
 *
 * Las sumas usan la opción ABIERTA en cada comida: cambiar de alternativa en
 * cualquiera mueve estas cifras, que es como se ve la situación de un día
 * concreto («si hoy elige la 2 en el desayuno y la 3 en la cena…»).
 */
const lecturaDe = (real, objetivo) => {
  if (!objetivo) return 'sin objetivo en el plan';
  const diff = real - objetivo;
  const margen = objetivo * 0.05;
  if (Math.abs(diff) <= margen) return 'cuadra';
  return diff > 0 ? `${diff} de más` : `faltan ${Math.abs(diff)}`;
};

export const DiaResumen = ({ meals, targets, elegidas = {}, onAbrir }) => {
  const real = meals.reduce(
    (acc, meal) => {
      const m = optionMacros(opcionElegida(meal, elegidas));
      return { protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fats: acc.fats + m.fats, kcal: acc.kcal + m.kcal };
    },
    { protein: 0, carbs: 0, fats: 0, kcal: 0 }
  );
  const kcalReal = Math.round(real.kcal);
  const objetivoKcal = toNum0(targets?.targetKcals);

  /* Qué opción está abierta en cada comida, para que se vea con qué se suma. */
  const abiertas = meals.map((meal) => Math.min((elegidas[meal.id] ?? 0) + 1, Math.max(1, (meal.options || []).length)));
  const hayAlternativas = meals.some((meal) => (meal.options || []).length > 1);

  return (
    <section className="dia-resumen" aria-label="Macros del día">
      <header className="dia-resumen-cab">
        <span className="dia-resumen-rotulo">
          <span className="section-label">Macros del día</span>
          <span className="dia-resumen-sub">
            {hayAlternativas ? `con las opciones abiertas: ${abiertas.join(' · ')}` : 'con lo que hay en cada comida'}
          </span>
        </span>
        <button type="button" className="cab-accion dia-resumen-mas" onClick={onAbrir} title="Lo real contra lo esperado y el reparto por comida">
          Ver el día ↗
        </button>
      </header>

      <div className="medidores">
        {/* Las kcal son el total: van primero y con el veredicto debajo. Los
            tres macros, al otro lado del filete, dicen de qué está hecho. */}
        <Medidor total label="Kcal" valor={kcalReal} objetivo={objetivoKcal} lectura={lecturaDe(kcalReal, objetivoKcal)} />
        {MACRO_META.map(({ key, label, color }) => {
          const valor = Math.round(real[key]);
          const objetivo = toNum0(targets?.[`${key}Grams`]);
          const diff = valor - objetivo;
          return (
            <Medidor
              key={key}
              label={label}
              color={color}
              valor={valor}
              objetivo={objetivo}
              unidad="g"
              lectura={objetivo ? (diff === 0 ? 'clavado' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} g`) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
};
