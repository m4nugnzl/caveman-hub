import { useMemo } from 'react';
import { Lock } from 'lucide-react';

import { mealTarget, mealTargetsTotal, repartoAlObjetivo } from '@/domain/nutrition';
import { Switch } from '@/components/ui/primitives';
import { toNum0 } from '@/lib/num';

/**
 * EL REPARTO: lo que le toca a cada comida cuando el día cambia de cifra.
 *
 * ══ El paso que faltaba entre los macros y el menú ══════════════════════════
 *
 * El ajuste bajaba de las kilocalorías del día a los gramos de cada alimento de
 * un salto, y en medio hay un piso: lo que se le pide a cada comida. Ese piso
 * estaba escrito a mano y no seguía a nadie — cuatro comidas de 600 seguían
 * pidiendo 600 con el día ya en 2.250—, así que el reajuste del menú apuntaba a
 * la cifra vieja y el día decía «145 de más» para siempre. Ver
 * `repartoAlObjetivo` en el dominio, que es donde está la cuenta y el porqué.
 *
 * Aquí solo se ENSEÑA antes de guardar, que es la diferencia entre seguir al
 * objetivo y reescribirle el trabajo a nadie por detrás. Y con su interruptor:
 * el reparto es del entrenador y tiene que poder decir que no.
 *
 * ── Lo que no hace ─────────────────────────────────────────────────────────
 * Editar. Las cifras se tocan en la mesa del reparto, que es donde se leen todo
 * el año; aquí se mira la consecuencia de lo que se acaba de teclear. El
 * candado de una comida también se pone allí — es una decisión de la dieta, no
 * de este ajuste.
 */

const MACROS = [
  { key: 'protein', letra: 'P' },
  { key: 'carbs', letra: 'C' },
  { key: 'fats', letra: 'G' },
];

/**
 * El reparto que saldría con lo que hay tecleado ahora mismo.
 *
 * En un gancho porque el resultado lo necesitan los dos: esta lista para
 * pintarlo y la ventana para guardarlo — y, sobre todo, el paso del menú, que
 * tiene que reajustar los gramos contra el reparto NUEVO y no contra el viejo.
 */
export const useRepartoDelAjuste = ({ meals = [], objetivo = null, seguir = true }) =>
  useMemo(() => (seguir ? repartoAlObjetivo(meals, objetivo) : null), [meals, objetivo, seguir]);

export const RepartoDelAjuste = ({ meals = [], objetivo = null, reparto = null, seguir = true, onSeguir }) => {
  const antes = mealTargetsTotal(meals, null);
  const ahora = mealTargetsTotal(reparto?.meals || meals, null);
  const pide = toNum0(objetivo?.kcals);
  const conCandado = meals.filter((m) => m?.fijo === true).length;

  return (
    <div className="col gap-3">
      <div className="reparto-asa">
        <div className="col gap-1">
          <span className="t-sm">
            {`Tus ${meals.length} comidas tienen repartidas ${antes.kcals} kcal y el día pide ${pide}.`}
          </span>
          <span className="t-xs t-tertiary">
            {conCandado > 0
              ? `Cada una se ajusta en la proporción que ya tiene; ${
                  conCandado === 1 ? 'la que lleva candado se queda' : `las ${conCandado} con candado se quedan`
                } donde está.`
              : 'Cada una se ajusta en la proporción que ya tiene. El candado de la mesa deja fija la que no quieras mover.'}
          </span>
        </div>
        <Switch checked={seguir} onChange={onSeguir} label="Ajustar el reparto" />
      </div>

      {seguir && reparto && (
        <div className="reparto-comidas card-inset">
          <div className="reparto-fila es-cab" aria-hidden="true">
            <span />
            <span className="cifra es-antes">Antes</span>
            <span className="es-flecha" />
            <span className="cifra es-ahora">Ahora</span>
            <span className="cifra es-macros">P · C · G</span>
          </div>

          {meals.map((meal, i) => {
            const de = mealTarget(meal);
            const a = mealTarget(reparto.meals[i]);
            const fija = meal?.fijo === true;
            const igual = toNum0(de?.kcals) === toNum0(a?.kcals);
            return (
              <div className={`reparto-fila${igual ? ' es-igual' : ''}`} key={meal.id || meal.name}>
                <span className="nm">
                  {fija && <Lock size={13} aria-label="No se mueve" />}
                  {meal.name}
                </span>
                <span className="cifra es-antes">{de ? `${de.kcals} kcal` : '—'}</span>
                <span className="cifra es-flecha" aria-hidden="true">
                  →
                </span>
                {/* El «antes» de una fila que no se mueve baja la voz y su
                    «ahora» lo dice con la palabra: un «600 → 600» se lee como un
                    cambio que no ha pasado. Ver `.macro-fila.es-igual`. */}
                <span className={`cifra es-ahora${igual ? '' : ' es-viva'}`}>
                  {igual ? (fija ? 'fija' : 'igual') : `${a.kcals} kcal`}
                </span>
                <span className="cifra es-macros">
                  {MACROS.map(({ key, letra }) => `${a?.[key] ?? 0} ${letra}`).join(' · ')}
                </span>
              </div>
            );
          })}

          <div className="reparto-fila es-total">
            <span className="nm">Repartidas</span>
            <span className="cifra es-antes">{antes.kcals} kcal</span>
            <span className="es-flecha" />
            <span className="cifra es-ahora es-viva">{ahora.kcals} kcal</span>
            <span className="cifra es-macros">
              {MACROS.map(({ key, letra }) => `${ahora[key]} ${letra}`).join(' · ')}
            </span>
          </div>
        </div>
      )}

      {!seguir && (
        <p className="t-xs t-tertiary">
          El reparto se queda en {antes.kcals} kcal. El menú se ajustará a esas comidas y no al
          objetivo del día.
        </p>
      )}
    </div>
  );
};
