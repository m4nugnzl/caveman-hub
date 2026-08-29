import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Footprints, HeartPulse } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { clientProtocol, isServiceOn } from '@/domain/protocol';
import { clientPath } from '@/routes';
import { Delta } from '@/components/ui/metrics';
import { Modal } from '@/components/ui/Modal';
import { Tarjeta, TarjetaVacia } from '@/components/dashboard/Tarjeta';
import { GoalCard } from '@/components/nutrition/GoalCard';
import { MacroTargetCard } from '@/components/nutrition/MacroTargetCard';

/**
 * LO QUE LE PUSISTE DE COMER esa semana: calorías, macros, pasos y cardio.
 *
 * ══ Por qué va en la columna de al lado ═════════════════════════════════════
 *
 * Es la RECETA de la semana, no lo que pasó en ella. Entreno, Dieta y Resumen
 * ya tienen esta forma —el trabajo a lo ancho y, al lado, lo que se decidió una
 * vez y se consulta muchas— y la revisión la sigue: el plan se mira mientras se
 * decide qué tocarle, así que va pegado a la barra que lo cambia y no a media
 * página de distancia, ocupando el ancho entero con cinco cifras.
 *
 * Es la misma tarjeta que «El plan» del Resumen, con una fila por palanca; lo
 * que añade es lo que cambió respecto del plan ANTERIOR, que es lo que aquí
 * importa.
 *
 * ── Y contra qué se compara ────────────────────────────────────────────────
 * Contra el plan anterior, no contra la semana anterior. Entre dos revisiones no
 * hay cambio —el plan sigue puesto— así que comparar con la semana de al lado
 * daría «sin cambios» siempre y las flechas no dirían nada nunca. Se busca hacia
 * atrás el último plan DISTINTO, que es lo que de verdad cambiaste.
 */

/** «12.000» y no «12000»: cinco dígitos seguidos hay que contarlos. */
const cifra = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('es-ES') : v);

/** Una palanca, con lo que cambió respecto del plan anterior. */
const Palanca = ({ label, valor, antes, unidad = 'g' }) => {
  if (valor === null || valor === undefined) return null;
  const delta = antes === null || antes === undefined ? null : valor - antes;

  return (
    <li className="palanca">
      <span className="palanca-k">{label}</span>
      <span className="palanca-v is-fila">
        {cifra(valor)}
        {unidad && <small> {unidad}</small>}
        {delta !== null && delta !== 0 && (
          <Delta value={delta} unit={unidad ? ` ${unidad}` : ''} decimals={0} />
        )}
      </span>
    </li>
  );
};

export const NutritionCard = ({ track = [], selected, client }) => {
  const { nutrition, updateNutrition, updateNutritionTargets } = useApp();
  const [ajustando, setAjustando] = useState(false);

  const fila = track.find((f) => f.week === selected) || null;

  /*
    ══ AJUSTAR SE HACE AQUÍ, y no en la barra de abajo ════════════════════════
    Una acción va al lado de lo que modifica. El recuento de cambios de la barra
    sube solo al guardar aquí, sin que ninguna de las dos piezas sepa nada de la
    otra: las dos leen el mismo plan del contexto (ver `ReviewDecision`).
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
    <Tarjeta
      rotulo="Su plan esta semana"
      span={12}
      vacia={sinPlan}
      accion={
        <Link className="cab-accion" to={clientPath(client?.id, 'nutricion')}>
          Su dieta →
        </Link>
      }
    >
      {sinPlan ? (
        <TarjetaVacia>
          Esa semana no hay constancia de qué plan tenía puesto: el plan queda registrado al cerrar
          una revisión.
        </TarjetaVacia>
      ) : (
        <>
          <p className="tarjeta-meta">
            {previa ? `Lo tiene puesto desde la semana ${previa.week + 1}.` : 'Lo que tenía puesto de comer y de moverse.'}
          </p>

          <ul className="palancas">
            <Palanca label="Calorías" valor={fila.kcals} antes={previa?.kcals} unidad="kcal" />
            <Palanca label="Proteína" valor={fila.protein} antes={previa?.protein} />
            <Palanca label="Hidratos" valor={fila.carbs} antes={previa?.carbs} />
            <Palanca label="Grasas" valor={fila.fats} antes={previa?.fats} />
            <Palanca label="Pasos" valor={fila.steps} antes={previa?.steps} unidad="" />
            {/* El cardio es texto —«3 días de 25 min»—: una pauta, no una magnitud. */}
            {fila.cardio && (
              <li className="palanca">
                <span className="palanca-k">Cardio</span>
                <span className="palanca-v is-texto">{fila.cardio}</span>
              </li>
            )}
          </ul>
        </>
      )}

      {puedeAjustar && (
        <footer className="tarjeta-pie-accion">
          <button type="button" className="cab-accion is-principal" aria-haspopup="dialog" onClick={() => setAjustando(true)}>
            Ajustar la dieta →
          </button>
        </footer>
      )}

      {/*
        ══ El ajuste, en un PANEL AL LADO ════════════════════════════════════
        La cifra que se pone sale de lo que se está mirando —cuánto ha bajado,
        cuántos pesajes hay, qué dice la curva—, así que un diálogo con velo
        tapaba justo eso. En el panel las dos cosas están a la vez. Son los
        MISMOS controles de «Dieta», con su mismo `onSave`.
      */}
      {ajustando && puedeAjustar && (
        <Modal
          size="side"
          title={`Ajustar la dieta de ${nombre}`}
          onClose={() => setAjustando(false)}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setAjustando(false)}>
              Listo
            </button>
          }
        >
          <div className="col gap-3">
            {/* Se guarda solo, a cada campo, como en «Dieta». El botón de
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
    </Tarjeta>
  );
};
