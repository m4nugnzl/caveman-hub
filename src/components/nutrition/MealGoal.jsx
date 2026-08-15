import { optionGaps } from '@/domain/nutrition';
import { MACRO_META } from './macros';

/**
 * El objetivo de una comida frente a lo que lleva montado.
 *
 * ══ Solo para quien programa ════════════════════════════════════════════════
 *
 * Al cliente se le dejó el anillo de macros y nada más. La versión anterior le
 * enseñaba también esto, y no encajaba por dos motivos: le ocupaba media tarjeta
 * con una comparación que no puede resolver, y al meterse en la misma fila que
 * el anillo estrujaba la tabla de alimentos hasta dejar los nombres en dos
 * letras. Su pantalla es de consulta; la de comparar es esta.
 *
 * ══ Por qué la barra es corta y fija ════════════════════════════════════════
 *
 * La primera versión la hacía elástica y ocupaba todo el ancho sobrante. Una
 * barra de 300 px no se lee mejor que una de 72: el ojo compara ALTURAS DE
 * RELLENO entre filas, y para eso lo que hace falta es que las cuatro midan
 * exactamente lo mismo y quepan en una mirada. Elástica, además, era lo que
 * empujaba a la tabla de alimentos fuera de su sitio.
 *
 * ── Y por qué el exceso no la alarga ────────────────────────────────────────
 * Porque una barra que se sale de su carril deja de ser comparable con las de
 * arriba y abajo, que es lo único para lo que sirve tener cuatro juntas. Pasarse
 * se dice de otra forma: el carril entero se tiñe y la cifra sale en rojo.
 */

/** Las cuatro filas. Las kcal primero: es la cifra con la que se decide. */
const FILAS = [
  { key: 'kcals', label: 'kcal', color: 'var(--warning)' },
  ...MACRO_META.map(({ key, short, color }) => ({ key, label: short, color })),
];

export const MealGoal = ({ meal, optionIndex = 0 }) => {
  const gap = optionGaps(meal)[optionIndex] || null;
  if (!gap || gap.tone === 'none') return null;

  return (
    <div className="meal-goal">
      <span className="k">Objetivo de esta comida</span>

      <div className="rows">
        {FILAS.map(({ key, label, color }) => {
          const objetivo = gap.target[key];
          if (!objetivo) return null;

          const actual = objetivo + gap.diff[key];
          const margen = objetivo * 0.05;
          const estado =
            gap.diff[key] > margen ? 'over' : gap.diff[key] < -margen ? 'under' : 'ok';

          return (
            <div className={`fila is-${estado}`} key={key}>
              <span className="n" style={{ color }}>
                {label}
              </span>

              <span className="track">
                <span
                  className="fill"
                  style={{
                    width: `${Math.min(100, Math.round((actual / objetivo) * 100))}%`,
                    background: estado === 'over' ? 'var(--negative)' : color,
                  }}
                />
              </span>

              {/* Lo puesto y lo pedido, en ese orden: lo que se está moviendo va
                  primero y el objetivo queda como referencia detrás. */}
              <span className="v">
                {Math.round(actual)}
                <span className="of">/{objetivo}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
