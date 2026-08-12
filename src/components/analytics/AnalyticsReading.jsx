import { AlertTriangle, ArrowRight, Check, CircleHelp, Target, TrendingUp } from 'lucide-react';

import { GOAL_DIRECTIONS, directionById, targetRateKg } from '@/domain/goals';
import { EVIDENCE_GROUPS, sortedReading } from '@/domain/reading';
import { Panel } from '@/components/ui/primitives';

const TONE_ICON = { good: Check, warn: AlertTriangle, bad: AlertTriangle, unknown: CircleHelp };
const groupLabel = (id) => EVIDENCE_GROUPS.find((g) => g.id === id)?.label || null;

/**
 * La lectura de la semana: lo que la analítica dice, antes de lo que dibuja.
 *
 * ── Por qué esto va primero y no otro gráfico ───────────────────────────────
 * Un entrenador no abre la analítica para ver diez gráficos: la abre con una
 * pregunta —«¿esto está funcionando?»—. Con diez gráficos delante, la síntesis la
 * tenía que hacer él: mirar el peso, acordarse de qué se pretendía, estimar si la
 * bajada es real o es agua, comprobar si el cliente ha registrado algo, mirar si la
 * fuerza sube y concluir. Cada semana, para cada cliente.
 *
 * Con veinte clientes son doscientas síntesis mentales que la aplicación tiene
 * todos los datos para hacer. Aquí las hace, y los gráficos pasan a ser lo que
 * siempre debieron ser: la prueba de cada frase, para quien quiera comprobarla.
 *
 * El cálculo entero está en `domain/reading.js`, sin React: aquí solo se pinta.
 */
export const AnalyticsReading = ({
  findings,
  goal,
  weight,
  canEditGoal,
  onSetGoal,
  openGroup,
  onOpenGroup,
}) => {
  const ordered = sortedReading(findings);
  const direction = goal ? directionById(goal.direction) : null;
  const target = targetRateKg(goal, weight);

  return (
    <Panel className="col gap-4">
      <div className="row between wrap gap-3">
        <h2 className="section-title">
          <TrendingUp size={17} /> Lectura de la semana
        </h2>

        {/*
          El objetivo, aquí arriba y no en una pantalla de ajustes.
          --------------------------------------------------------------------
          Es la referencia contra la que se juzga todo lo de abajo: si está en otro
          sitio, se lee una conclusión sin saber contra qué se ha medido. Y cuando
          falta, esto es lo primero que hay que rellenar.
        */}
        {canEditGoal ? (
          <div className="goal-set" role="group" aria-label="Objetivo del cliente">
            <Target size={13} />
            <span className="k">Objetivo</span>
            {GOAL_DIRECTIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                className="chip"
                aria-pressed={goal?.direction === d.id}
                title={d.hint}
                onClick={() => onSetGoal(goal?.direction === d.id ? null : d.id)}
              >
                {d.short}
              </button>
            ))}
          </div>
        ) : (
          direction && (
            <span className="badge">
              <Target size={11} /> {direction.label}
              {target ? ` · ${target > 0 ? '+' : ''}${target} kg/sem` : ''}
            </span>
          )
        )}
      </div>

      {ordered.length === 0 ? (
        <p className="t-sm t-secondary">
          Todavía no hay suficientes datos para leer nada. Aparecerá en cuanto haya pesajes de varias
          semanas y series registradas.
        </p>
      ) : (
        <ul className="reading">
          {ordered.map((finding) => {
            const Icon = TONE_ICON[finding.tone] || CircleHelp;
            const label = groupLabel(finding.evidence);
            const isOpen = finding.evidence === openGroup;

            /*
              Cada conclusión es un enlace a su prueba.
              ----------------------------------------------------------------
              Es lo que convierte la lectura en el índice de la página. Sin esto,
              «estancado» y los gráficos que demuestran que está estancado están en
              dos sitios que el usuario tiene que relacionar de memoria — y con diez
              gráficos, adivinando cuál era.

              Los hallazgos sin grupo (no debería haberlos, pero el dominio puede
              crecer) se pintan como texto y no como botón: un botón que no lleva a
              ninguna parte es peor que ninguno.
            */
            const body = (
              <>
                <span className="read-mark">
                  <Icon size={13} />
                </span>
                <span className="read-body">
                  <strong>{finding.title}</strong>
                  <span className="t-xs t-secondary">{finding.detail}</span>
                </span>
                {label && !isOpen && (
                  <span className="read-go">
                    {label} <ArrowRight size={12} />
                  </span>
                )}
              </>
            );

            return (
              <li key={finding.id}>
                {label && onOpenGroup ? (
                  <button
                    type="button"
                    className={`read is-${finding.tone} is-link`}
                    onClick={() => onOpenGroup(finding.evidence)}
                    aria-label={`${finding.title}. Ver la prueba en ${label}.`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={`read is-${finding.tone}`}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Se dice explícitamente lo que esto NO es. Una lista de frases con
          semáforos invita a leerlas como instrucciones, y no lo son: son hechos.
          Lo que se hace con ellos depende de lo que el entrenador sabe del cliente
          y no está en ninguna tabla. */}
      <p className="t-xs t-tertiary">
        Son observaciones sobre los datos registrados, no recomendaciones. Pulsa cualquiera para ver
        los gráficos que la sostienen.
      </p>
    </Panel>
  );
};
