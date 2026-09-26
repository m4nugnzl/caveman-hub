import { useMemo } from 'react';
import { Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { clientGoal, directionById } from '@/domain/goals';
import { sortPhases } from '@/domain/roadmap';
import { situacionDelPlan } from '@/domain/semanasDelPlan';
import { localeNumber, shortDate } from '@/lib/dates';
import { useElementWidth } from '@/lib/useElementWidth';
import { clientPath } from '@/routes';
import { usePlanDelRoadmap } from '@/components/roadmap/usePlanDelRoadmap';
import { limitesDe } from '@/components/temporada/escalaDeTiempo';
import { MiniTemporada } from '@/components/temporada/MiniTemporada';
import { Tarjeta, TarjetaVacia } from './Tarjeta';

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* «Faltan 14 semanas», «Faltan 5 días», «Hoy». */
const faltan = (cuenta) => {
  if (!cuenta || cuenta.dias === null || cuenta.dias === undefined || cuenta.dias < 0) return null;
  if (cuenta.dias === 0) return 'Hoy';
  if (cuenta.semanas) return `Faltan ${cuenta.semanas} ${cuenta.semanas === 1 ? 'semana' : 'semanas'}`;
  return `Faltan ${cuenta.dias} ${cuenta.dias === 1 ? 'día' : 'días'}`;
};

/**
 * LA TEMPORADA, EN EL RESUMEN DEL ENTRENADOR (26 sep 2026): la ruta de fases
 * y la línea del peso en miniatura (`MiniTemporada`), en qué fase va, a dónde
 * va y cuánto le falta. La caja entera abre la pestaña «Temporada», que es
 * donde se lee y se trabaja.
 *
 * Sustituye, para el entrenador, a la tarjeta de tres filas del roadmap
 * (`TarjetaRoadmap`), que se queda en el portal del cliente. El lápiz lleva
 * también a la Temporada: desde el 26 sep 2026 todo el plan se crea y se
 * cambia allí (la ventana «El plan» se retiró).
 *
 * Informa, no juzga: ni avisos ni sugerencias.
 */
export const TarjetaTemporada = () => {
  const { activeClient, phases } = useApp();
  const { plan } = usePlanDelRoadmap();
  const [refAncho, ancho] = useElementWidth(320);
  const fases = useMemo(() => sortPhases(phases), [phases]);
  const limites = useMemo(() => (plan ? limitesDe({ plan, fases }) : null), [plan, fases]);
  if (!plan || !activeClient) return null;

  const { ahora, destino } = situacionDelPlan(plan);
  const hayPlan = Boolean(ahora?.fase || plan.grupos.some((g) => g.fase) || destino);
  const objetivoKg = clientGoal(activeClient)?.targetWeightKg ?? null;
  const aTemporada = clientPath(activeClient.id, 'temporada');

  if (!hayPlan) {
    return (
      <Tarjeta rotulo="Temporada" span={12} className="tarjeta-temporada" vacia>
        <TarjetaVacia
          accion={
            <Link className="cab-accion is-puerta" to={aTemporada}>
              Marca sus fases
            </Link>
          }
        >
          Sin fases ni destino todavía.
        </TarjetaVacia>
      </Tarjeta>
    );
  }

  const cuenta = faltan(destino?.cuenta);

  return (
    <Tarjeta
      rotulo="Temporada"
      span={12}
      className="tarjeta-temporada"
      accion={
        <Link className="cab-icono" to={aTemporada} aria-label="Editar el plan en su temporada" title="Editar el plan en su temporada">
          <Pencil size={15} strokeWidth={2} />
        </Link>
      }
      puerta={<Link className="task-hit" to={aTemporada} aria-label="Abrir su temporada" />}
    >
      <p className="tarjeta-temporada-fase">
        {ahora?.fase ? (
          <>
            <span className="roadmap-punto" style={{ background: directionById(ahora.fase.direction)?.color }} aria-hidden="true" />
            <b>{ahora.fase.title}</b>
            {ahora.semana ? <span className="tnum"> · semana {ahora.semana}{ahora.total ? ` de ${ahora.total}` : ''}</span> : null}
          </>
        ) : (
          <b>Sin fase hoy</b>
        )}
      </p>
      <div ref={refAncho} className="tarjeta-temporada-mini">
        {limites && ancho > 0 && (
          <MiniTemporada limites={limites} ancho={ancho} fases={fases} semanas={plan.semanas} hoy={plan.hoy} destino={plan.destino} />
        )}
      </div>
      <p className="tarjeta-temporada-destino">
        {destino ? (
          <>
            <span className="tarjeta-temporada-que">
              <b>{destino.titulo}</b>
              <span className="tnum">
                {shortDate(destino.fecha)}
                {objetivoKg ? ` · ${kg(objetivoKg)} kg` : ''}
              </span>
            </span>
            {cuenta && <span className="tarjeta-temporada-faltan tnum">{cuenta}</span>}
          </>
        ) : (
          <span className="tarjeta-temporada-sin">Sin destino</span>
        )}
      </p>
    </Tarjeta>
  );
};
