import { Pencil } from 'lucide-react';

import { useOculto } from '@/components/Client/Oculto';
import { usePlanDelRoadmap } from '@/components/roadmap/usePlanDelRoadmap';
import { directionById } from '@/domain/goals';
import { situacionDelPlan } from '@/domain/semanasDelPlan';
import { localeNumber, shortDate } from '@/lib/dates';
import { Tarjeta } from './Tarjeta';
import { Palanca } from './TarjetaPlan';

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signoKg = (v) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${kg(Math.abs(v))}`;
const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

/**
 * EL ROADMAP, EN EL RESUMEN: dónde está y qué viene.
 *
 * Tres filas y ninguna gráfica —la línea vive en la espina de Revisiones—:
 *
 *   · **La fase** y en qué semana de ella va.
 *   · **El peso contra lo esperado**, o los días sin pesarse si el último
 *     pesaje es viejo: una media vieja con aspecto de actual engaña.
 *   · **Lo siguiente**: los días al cruce o al destino.
 *
 * Cada fila lleva a Revisiones con la espina desplegada en la semana de hoy
 * (`aRevisiones`). El lápiz abre el plan para editarlo (`onPlan`). Es la
 * puerta al roadmap que antes estaba escondida en la fila «Objetivo» de «El
 * plan».
 *
 * Informa, no juzga: el desvío va con su signo y en tinta. El sistema enseña la
 * desviación; no sugiere replanteos, no reajusta solo, no avisa.
 */
export const TarjetaRoadmap = ({ aRevisiones = null, onPlan = null, isClient = false }) => {
  const { plan } = usePlanDelRoadmap();
  const oculto = useOculto() || {};
  if (!plan) return null;

  const { ahora, destino, cruce } = situacionDelPlan(plan);
  const hayPlan = Boolean(ahora?.fase || plan.grupos.some((g) => g.fase) || destino);

  /* Sin fases ni destino, al cliente no se le enseña nada; al entrenador, la
     invitación a ponerlas. */
  if (!hayPlan && isClient) return null;

  const filas = [];
  if (!hayPlan) {
    filas.push(<Palanca key="fase" k="Fase" texto valor={<span className="palanca-invita">Marca sus fases</span>} a={onPlan} />);
  } else {
    filas.push(
      <Palanca
        key="fase"
        k="Fase"
        texto
        valor={
          ahora?.fase ? (
            <span className="tarjeta-roadmap-fase">
              <span className="roadmap-punto" style={{ background: directionById(ahora.fase.direction)?.color }} aria-hidden="true" />
              {ahora.fase.title}
            </span>
          ) : (
            'Sin fase hoy'
          )
        }
        sub={ahora?.fase && ahora.semana ? `Semana ${ahora.semana}${ahora.total ? ` de ${ahora.total}` : ''}` : null}
        a={aRevisiones}
      />
    );

    if (ahora && !oculto.weight) {
      filas.push(
        ahora.media === null || !ahora.reciente ? (
          <Palanca
            key="peso"
            k="Peso"
            texto
            valor="Sin pesajes"
            sub={ahora.ultimoPesaje ? `desde el ${shortDate(ahora.ultimoPesaje)}` : 'todavía no se ha pesado'}
            a={aRevisiones}
          />
        ) : (
          <Palanca
            key="peso"
            k="Contra lo esperado"
            valor={ahora.desvio !== null ? `${signoKg(ahora.desvio)} kg` : `${kg(ahora.media)} kg`}
            sub={ahora.desvio !== null ? `media ${kg(ahora.media)} · esperado ${kg(ahora.esperado)}` : 'media de la semana'}
            a={aRevisiones}
          />
        )
      );
    }

    if (cruce && cruce.dias !== null && cruce.dias >= 0) {
      filas.push(
        <Palanca
          key="cruce"
          k="Cruce"
          valor={cruce.dias === 0 ? 'Hoy' : `En ${dias(cruce.dias)}`}
          sub={cruce.pregunta || `se decide el ${shortDate(cruce.decide)}`}
          a={aRevisiones}
        />
      );
    } else if (destino?.cuenta) {
      const c = destino.cuenta;
      filas.push(
        <Palanca
          key="destino"
          k={destino.titulo}
          valor={c.dias === 0 ? 'Hoy' : c.semanas ? `En ${c.semanas} semanas` : `En ${dias(c.dias)}`}
          sub={shortDate(destino.fecha)}
          a={aRevisiones}
        />
      );
    }
  }

  return (
    <Tarjeta
      rotulo={isClient ? 'Tu roadmap' : 'Roadmap'}
      span={12}
      className="tarjeta-roadmap"
      accion={
        onPlan && hayPlan ? (
          <button type="button" className="cab-icono" aria-haspopup="dialog" aria-label="Editar el plan" title="Editar el plan" onClick={onPlan}>
            <Pencil size={15} strokeWidth={2} />
          </button>
        ) : null
      }
    >
      <ul className="palancas">{filas}</ul>
    </Tarjeta>
  );
};
