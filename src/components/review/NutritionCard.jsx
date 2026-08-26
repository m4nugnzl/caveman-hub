import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Apple, Footprints, HeartPulse, SlidersHorizontal } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { metricColor } from '@/domain/metrics';
import { macroColor } from '@/domain/nutrition';
import { clientProtocol, isServiceOn } from '@/domain/protocol';
import { clientPath } from '@/routes';
import { Delta } from '@/components/ui/metrics';
import { Modal } from '@/components/ui/Modal';
import { GoalCard } from '@/components/nutrition/GoalCard';
import { MacroTargetCard } from '@/components/nutrition/MacroTargetCard';

/**
 * LO QUE LE PUSISTE DE COMER esa semana: calorías, macros, pasos y cardio.
 *
 * ══ Por qué es una TIRA y no una columna ════════════════════════════════════
 *
 * Estaba en la mitad derecha de una rejilla de dos columnas, al lado del
 * entreno. Y el entreno son cuatro días con sus ejercicios mientras que esto son
 * cinco cifras: la columna de la derecha quedaba con las cifras arriba y un
 * palmo de blanco debajo, tan alto como toda la lista de al lado. No era un
 * problema de esta pieza —es corta y está bien que lo sea—, era la rejilla
 * pidiéndole que midiera lo que no mide.
 *
 * A lo ancho, las cinco cifras se leen de un barrido y el bloque ocupa
 * exactamente lo que tiene que decir:
 *
 *     SU PLAN ESTA SEMANA                       desde la semana 4 · [Su dieta]
 *     CALORÍAS      PROTEÍNA    HIDRATOS    GRASAS     PASOS
 *     2 300 kcal    190 g       220 g       68 g       12 000
 *     ↓200          ↑10         ↓60                    ↑3 000
 *     Cardio · 3 días de 25 min
 *
 * ── Y contra qué se compara ────────────────────────────────────────────────
 * Contra el plan anterior, no contra la semana anterior. Entre dos revisiones no
 * hay cambio —el plan sigue puesto— así que comparar con la semana de al lado
 * daría «sin cambios» siempre y las flechas no dirían nada nunca. Se busca hacia
 * atrás el último plan DISTINTO, que es lo que de verdad cambiaste.
 */

/** «12.000» y no «12000»: cinco dígitos seguidos hay que contarlos. */
const cifra = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('es-ES') : v);

/** Una macro, con lo que cambió respecto del plan anterior. */
const Macro = ({ id, label, valor, antes, unidad = ' g', color, mayor = false }) => {
  if (valor === null || valor === undefined) return null;
  const delta = antes === null || antes === undefined ? null : valor - antes;

  return (
    <div className={`macro${mayor ? ' is-mayor' : ''}`}>
      {/* El color del macro va en el RÓTULO y no en la cifra: es el mismo con el
          que se dibuja en la dieta, así que sirve para reconocerlo de un vistazo,
          y en la cifra competiría con el resto de la pantalla. */}
      <span className="k" style={{ color: color || macroColor(id) || undefined }}>
        {label}
      </span>
      <span className="v">
        {cifra(valor)}
        {unidad.trim() && <span className="u">{unidad.trim()}</span>}
      </span>
      {/* El hueco del delta se reserva siempre: sin él, la fila de cifras baila
          media línea según cuántas hayan cambiado esta semana. */}
      <span className="d">
        {delta !== null && delta !== 0 && <Delta value={delta} unit={unidad} decimals={0} />}
      </span>
    </div>
  );
};

export const NutritionCard = ({ track = [], selected, client }) => {
  const { nutrition, updateNutrition, updateNutritionTargets } = useApp();
  const [ajustando, setAjustando] = useState(false);

  const fila = track.find((f) => f.week === selected) || null;

  /*
    ══ AJUSTAR SE HACE AQUÍ, y no en la barra de abajo ════════════════════════

    El botón vivía en la barra de cierre, junto al de ir a su entreno. Los dos
    sobraban allí: la barra ya tenía el enlace a la dieta DE ESTA MISMA TARJETA
    tres centímetros más arriba, así que la pantalla ofrecía dos veces lo mismo y
    ensanchaba la única zona que no tiene por qué crecer.

    Una acción va al lado de lo que modifica. Éste es el bloque que enseña las
    calorías, los macros y los pasos: es donde se busca el botón de cambiarlos.

    El recuento de cambios de la barra sigue subiendo solo al guardar aquí, sin
    que ninguna de las dos piezas sepa nada de la otra: las dos leen el mismo
    plan del contexto (ver `ReviewDecision`).
  */
  const plan = nutrition[client?.id];
  const puedeAjustar = isServiceOn(clientProtocol(client?.preferences), 'nutrition') && Boolean(plan);
  const nombre = client?.name?.split(' ')[0] || '';

  /* El último plan DISTINTO, hacia atrás. Ver la cabecera. */
  const previa = useMemo(() => {
    const i = track.findIndex((f) => f.week === selected);
    if (i < 0) return null;
    return (
      [...track.slice(0, i)]
        .reverse()
        .find((f) => f.kcals !== null && f.kcals !== undefined && f.kcals !== fila?.kcals) || null
    );
  }, [track, selected, fila]);

  const sinPlan = !fila || (fila.kcals === null && fila.protein === null && fila.steps === null);

  return (
    <section className="card bloque" aria-label="Su nutrición">
      <div className="bloque-head">
        <div className="bloque-say">
          <h2 className="bloque-titulo">Su plan esta semana</h2>
          <p className="bloque-sub">
            {previa
              ? `Lo tiene puesto desde la semana ${previa.week + 1}.`
              : 'Lo que tenía puesto de comer y de moverse.'}
          </p>
        </div>
        <div className="row gap-2 wrap">
          {puedeAjustar && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setAjustando(true)}
            >
              <SlidersHorizontal size={13} /> Ajustar
            </button>
          )}
          <Link className="btn btn-secondary btn-sm" to={clientPath(client?.id, 'nutricion')}>
            <Apple size={13} /> Su dieta
          </Link>
        </div>
      </div>

      {sinPlan ? (
        <p className="t-sm t-tertiary">
          Esa semana no hay constancia de qué plan tenía puesto. El plan queda registrado al cerrar
          una revisión, así que las semanas anteriores a la primera salen vacías.
        </p>
      ) : (
        <>
          <div className="plan">
            <Macro
              id="kcals"
              label="Calorías"
              valor={fila.kcals}
              antes={previa?.kcals}
              unidad=" kcal"
              color={metricColor('kcals')}
              mayor
            />
            <Macro id="protein" label="Proteína" valor={fila.protein} antes={previa?.protein} />
            <Macro id="carbs" label="Hidratos" valor={fila.carbs} antes={previa?.carbs} />
            <Macro id="fats" label="Grasas" valor={fila.fats} antes={previa?.fats} />
            <Macro id="steps" label="Pasos" valor={fila.steps} antes={previa?.steps} unidad="" />
          </div>

          {/* El cardio es texto —«3 días de 25 min»— y por eso no va en la
              rejilla de cifras: una pauta no es una magnitud. */}
          {fila.cardio && (
            <p className="plan-cardio">
              <span className="k">Cardio</span> {fila.cardio}
            </p>
          )}
        </>
      )}

      {/*
        ══ El ajuste, en un DIÁLOGO ══════════════════════════════════════════

        Tocar los números es un gesto corto y con final —abres, cambias, guardas,
        vuelves— y mientras lo haces no necesitas la revisión detrás. Al cerrarlo,
        el recuento de la barra ya lo dice.

        Son los MISMOS controles de «Nutrición», con su mismo `onSave`: un segundo
        formulario de calorías es un segundo sitio donde arreglar el día que
        cambie el modelo.
      */}
      {ajustando && puedeAjustar && (
        <Modal
          size="lg"
          title={`Ajustar la dieta de ${nombre}`}
          onClose={() => setAjustando(false)}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setAjustando(false)}>
              Listo
            </button>
          }
        >
          <div className="col gap-3">
            {/* Se guarda solo, a cada campo, como en «Nutrición». El botón de
                abajo cierra: no hay un estado «cambiado pero sin mandar». */}
            {plan.hasDayVariants ? (
              <div className="grid-2">
                <MacroTargetCard
                  plan={plan}
                  variant="training"
                  title="Objetivo · días de entreno"
                  editable
                  onSave={(fields) => updateNutritionTargets(client.id, 'training', fields)}
                />
                <MacroTargetCard
                  plan={plan}
                  variant="rest"
                  title="Objetivo · días de descanso"
                  editable
                  onSave={(fields) => updateNutritionTargets(client.id, 'rest', fields)}
                />
              </div>
            ) : (
              <MacroTargetCard
                plan={plan}
                variant="default"
                title="Objetivo diario"
                editable
                onSave={(fields) => updateNutritionTargets(client.id, 'default', fields)}
              />
            )}

            <GoalCard
              icon={Footprints}
              label="Pasos diarios"
              value={plan.stepsGoal}
              unit="pasos"
              placeholder="10000"
              numeric
              editable
              onSave={(stepsGoal) => updateNutrition(client.id, { stepsGoal })}
            />

            <GoalCard
              icon={HeartPulse}
              label="Cardio de alta intensidad"
              value={plan.cardioGoal}
              placeholder="2 sesiones de 10 rondas 30/30 en bici"
              hint="Sesiones, duración y protocolo. Lo escribes como se lo dirías."
              editable
              onSave={(cardioGoal) => updateNutrition(client.id, { cardioGoal })}
            />

            {/* El menú y los alimentos no caben aquí: son el plan entero, no el
                ajuste de una semana. */}
            <p className="t-xs t-tertiary">
              Para tocarle el menú, los alimentos o las equivalencias,{' '}
              <Link
                className="link"
                to={clientPath(client.id, 'nutricion')}
                state={{ revisionDe: client.id, revisionNombre: client.name }}
              >
                abre su nutrición
              </Link>
              .
            </p>
          </div>
        </Modal>
      )}
    </section>
  );
};
