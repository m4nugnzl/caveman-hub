import { Beef, Droplet, Flame, Footprints, Wheat } from 'lucide-react';

import { MACRO_COLORS, macroSplit } from '@/domain/nutrition';
import { fmt } from '@/lib/num';
import { Panel } from '@/components/ui/primitives';

const MACROS = [
  { key: 'proteinGrams', share: 'protein', label: 'Proteína', icon: Beef },
  { key: 'carbsGrams', share: 'carbs', label: 'Carbos', icon: Wheat },
  { key: 'fatsGrams', share: 'fats', label: 'Grasas', icon: Droplet },
];

/**
 * Primer bloque del panel: kcal objetivo y reparto de macronutrientes.
 *
 * Va arriba a propósito. Es el dato que se consulta más veces al día —tanto el
 * entrenador como el cliente— y antes estaba enterrado a media página, dentro de
 * un «resumen de nutrición» al que había que bajar a buscarlo.
 */
export const NutritionHeadline = ({ plan }) => {
  const macros = macroSplit(plan);
  const hasTarget = macros.total > 0 || plan?.targetKcals;

  if (!hasTarget) {
    return (
      <Panel tight>
        <p className="text-sm text-muted">
          Todavía no hay objetivo calórico definido. Se configura en la pestaña de nutrición.
        </p>
      </Panel>
    );
  }

  // Si las kcal objetivo no están puestas a mano, se deducen de los macros.
  const kcals = plan?.targetKcals ?? (macros.total > 0 ? Math.round(macros.total) : null);
  const derived = !plan?.targetKcals && macros.total > 0;

  return (
    <Panel
      className="col gap-4"
      style={{
        background: 'linear-gradient(135deg, rgba(248,113,113,0.12) 0%, rgba(245,158,11,0.06) 100%)',
        borderColor: 'rgba(248,113,113,0.25)',
      }}
    >
      <div className="row between wrap gap-4">
        <div className="row gap-4">
          <span
            style={{
              width: 52,
              height: 52,
              borderRadius: 18,
              background: 'rgba(248,113,113,0.16)',
              border: '1px solid rgba(248,113,113,0.3)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Flame size={24} color="var(--accent-coral)" />
          </span>
          <div>
            <span className="uppercase-label">Objetivo diario</span>
            <div className="row gap-2" style={{ alignItems: 'baseline' }}>
              <strong style={{ fontSize: '2.1rem', fontWeight: 900, lineHeight: 1 }}>
                {fmt(kcals)}
              </strong>
              <span className="text-sm text-muted">kcal</span>
            </div>
            {derived && <span className="text-xs text-dim">calculadas a partir de los macros</span>}
          </div>
        </div>

        <div className="row wrap gap-4">
          {MACROS.map(({ key, share, label, icon: Icon }) => (
            <div className="col gap-1" key={key} style={{ minWidth: 84 }}>
              <span className="row gap-1 text-xs" style={{ color: MACRO_COLORS[share], fontWeight: 800 }}>
                <Icon size={12} /> {label}
              </span>
              <span style={{ fontSize: '1.3rem', fontWeight: 900 }}>{fmt(plan?.[key], { unit: 'g' })}</span>
              <span className="text-xs text-dim">{macros.pct[share]}% de las kcal</span>
            </div>
          ))}

          {plan?.stepsGoal && (
            <div className="col gap-1" style={{ minWidth: 84 }}>
              <span className="row gap-1 text-xs" style={{ color: 'var(--accent-cyan)', fontWeight: 800 }}>
                <Footprints size={12} /> Pasos
              </span>
              <span style={{ fontSize: '1.3rem', fontWeight: 900 }}>{plan.stepsGoal}</span>
              <span className="text-xs text-dim">al día</span>
            </div>
          )}
        </div>
      </div>

      {macros.total > 0 && (
        <div className="col gap-1">
          <div className="macro-bar" style={{ height: 14 }}>
            <div style={{ width: `${macros.pct.protein}%`, background: MACRO_COLORS.protein }} />
            <div style={{ width: `${macros.pct.carbs}%`, background: MACRO_COLORS.carbs }} />
            <div style={{ width: `${macros.pct.fats}%`, background: MACRO_COLORS.fats }} />
          </div>
          {plan?.targetKcals && Math.abs(macros.total - plan.targetKcals) > 50 && (
            <span className="text-xs" style={{ color: 'var(--accent-amber)' }}>
              Los macros suman {Math.round(macros.total)} kcal, {Math.round(macros.total - plan.targetKcals) > 0 ? 'por encima' : 'por debajo'} del
              objetivo de {plan.targetKcals}.
            </span>
          )}
        </div>
      )}
    </Panel>
  );
};
