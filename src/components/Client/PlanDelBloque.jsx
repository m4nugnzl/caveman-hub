import { blockPlan, untrainedWeeksOfDay, weeksOfBlock } from '@/domain/blocks';
import { WEEK_DAYS, rotatingSlots } from '@/domain/training';

/**
 * EL PLAN DEL BLOQUE, como lo lee el cliente: sus sesiones en columnas.
 *
 * ══ Qué contesta, y por qué no lo contestaba nada ══════════════════════════
 *
 * «¿Qué es este bloque?». El portal enseñaba UNA sesión —la de hoy— y la tira
 * para saltar entre ellas, y eso basta dentro del gimnasio. Delante de un
 * ordenador la pregunta es otra: qué le han montado, cuánto hay de cada cosa y
 * cómo encaja la semana. Eso es el plan entero a la vista, que es exactamente
 * lo que su entrenador mira en `VistaBloque`.
 *
 * ══ Por qué es un componente aparte y no `VistaBloque` con un interruptor ══
 *
 * Porque `VistaBloque` no es una vista: es un EDITOR. Cada columna suya lleva
 * asa de arrastre, nombre renombrable al doble clic, menú de acciones, campos
 * de series y repeticiones que se escriben en el sitio, papelera por ejercicio
 * y un alta al pie. Volverlo de doble audiencia serían quince condicionales
 * repartidos por trescientas líneas, y cada una de ellas un sitio donde un
 * cliente podría acabar tocando el plan que le han puesto.
 *
 * Aquí se lee. Es el mismo reparto que ya hay entre `ExerciseList` y
 * `HojaDeSeries` —dos dibujos de un día para dos trabajos distintos— y por eso
 * usa LAS MISMAS clases (`plan-col`, `plan-ejs`, `plan-ej`…): comparten
 * aspecto sin compartir mandos, así que tocar el diseño de una hoja del plan
 * sigue siendo un solo sitio.
 *
 * ══ Y no aparece en el teléfono ════════════════════════════════════════════
 *
 * Cuatro columnas de plan en 390 px son cuatro columnas de 90, o un carril que
 * se arrastra para leer lo que ya se sabe. En el móvil se viene a apuntar
 * series, no a repasar el mesociclo: ahí manda la sesión. Lo decide
 * `ClientRoutine` con la media query, no este archivo.
 */
export const PlanDelBloque = ({ program, bloque, cliente, unidad, unidades, onAbrirHoja }) => {
  const plan = blockPlan(program, bloque);
  const semanas = weeksOfBlock(program, bloque);
  const rotativo = (cliente?.cycleType || 'weekly') === 'rotating';
  const split = bloque?.weeklySplit || program?.weeklySplit || {};
  const slots = rotativo ? rotatingSlots(cliente?.cyclePattern, plan.sessions) : [];

  /* Cuándo cae cada hoja: los días que la llevan, o su sitio en el ciclo. La
     misma lectura que hace el plan del entrenador. */
  const cuandoCae = (dayName) => {
    if (rotativo) return slots.find((s) => !s.rest && s.name === dayName)?.lead || null;
    const dias = WEEK_DAYS.filter((d) => split[d] === dayName).map((d) => d.slice(0, 3));
    return dias.length > 0 ? dias.join(' · ') : null;
  };

  if (plan.sessions.length === 0) {
    return (
      <p className="t-sm t-secondary">
        Este bloque todavía no tiene ninguna sesión montada. En cuanto tu entrenador la ponga, la
        verás aquí.
      </p>
    );
  }

  return (
    <section className="plan-tramo" aria-label={`Las sesiones de ${bloque.name}`}>
      <div className="plan-tramo-cab">
        <h3 className="plan-titulo">Tus sesiones</h3>
        <span className="plan-tramo-meta">
          {`${plan.sessions.length} en cada ${unidad.toLowerCase()} · pulsa una para abrirla y apuntar`}
        </span>
      </div>

      <div className="plan-rejilla" role="list">
        {plan.sessions.map((hoja) => {
          /* Cuántas veces la ha entrenado en este bloque. El plan del entrenador
             dice «entrenada» cuando ya no queda dónde escribir; al cliente le
             sirve más la cuenta, que es su marca de avance dentro del bloque. */
          const pendientes = untrainedWeeksOfDay(program, bloque, hoja.dayName).length;
          const hechas = Math.max(0, semanas.length - pendientes);
          const cae = cuandoCae(hoja.dayName);

          return (
            <section className="plan-col" role="listitem" key={hoja.dayName}>
              <header className="plan-col-cab">
                <div className="plan-col-say">
                  {/* El nombre ES la puerta, igual que en el plan del entrenador. */}
                  <button
                    type="button"
                    className="plan-col-nombre"
                    onClick={() => onAbrirHoja(hoja.dayName)}
                    title={`Abrir ${hoja.dayName} y apuntar tus series`}
                  >
                    {hoja.dayName}
                  </button>
                  <span className="plan-col-sub">
                    {[cae, `${hoja.series} series`, `${hoja.exercises.length} ejercicios`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              </header>

              <ol className="plan-ejs">
                {hoja.exercises.map((ex) => (
                  <li className="plan-ej" key={ex.id}>
                    <span className="plan-ej-nombre">{ex.name}</span>
                    <span className="plan-ej-fila">
                      <span className="plan-series is-lectura">{ex.series}</span>
                      <span className="plan-por" aria-hidden="true">
                        ×
                      </span>
                      <span className="plan-reps is-lectura">{ex.targetReps ?? 'varias'}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <div className="plan-col-pie">
                <span
                  className="plan-col-cerrada"
                  title={`La has entrenado ${hechas} de las ${semanas.length} ${unidades} de este bloque`}
                >
                  {hechas === 0
                    ? 'sin entrenar todavía'
                    : `entrenada ${hechas} de ${semanas.length}`}
                </span>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
};
