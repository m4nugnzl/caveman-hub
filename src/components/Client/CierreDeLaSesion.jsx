import { SessionFeedback } from '@/components/Coach/Workout/SessionFeedback';
import { miles } from '@/lib/dates';

/**
 * EL CIERRE DE LA SESIÓN — la pantalla 4 de `docs/la-sesion-manda.md`.
 *
 * ══ Qué corrige ════════════════════════════════════════════════════════════
 *
 * Una sesión no terminaba: se dejaba de hacer scroll. «Terminar» cerraba la
 * sesión y devolvía a la rutina sin decir nada, y dos cosas que el producto ya
 * calcula se quedaban sin pantalla:
 *
 *   · **el tonelaje y los récords** (`sessionTonnage`, `isRecord`), que es lo
 *     que hace que la app valga sin entrenador;
 *   · **y las preguntas de cómo ha ido** (`SessionFeedback`), que su entrenador
 *     configura en el protocolo y que el portal de antes preguntaba en un modal
 *     al terminar. La reconstrucción del portal del 14 de septiembre dejó el
 *     componente sin montar en ningún sitio del cliente: el protocolo las pedía
 *     y nadie las preguntaba.
 *
 * Aquí vuelven, en el momento en que se contestan solas: con la última serie
 * todavía en el cuerpo.
 *
 * ══ «Terminar la sesión», y no «Mandar a tu entrenador» ════════════════════
 *
 * El prototipo decía lo segundo, y es falso: las series, las respuestas y la
 * nota se guardan según se escriben, así que al pulsar no viaja nada. Lo que
 * pasa es que la sesión se cierra —queda con su hora de fin y deja de estar «a
 * medias»—. Un control dice lo que pasa al usarlo, y la cabecera ya decía
 * «Terminar»: el mismo verbo en los dos sitios.
 *
 * ══ Y se puede volver ══════════════════════════════════════════════════════
 *
 * «‹ Volver a la sesión», porque llegar aquí no cierra nada: quien pulsa
 * Terminar y ve que le falta un ejercicio vuelve a su hoja tal cual la dejó.
 */
export const CierreDeLaSesion = ({ datos }) => {
  const {
    nombre,
    tonelaje,
    series,
    minutos,
    records,
    ejercicios,
    preguntas,
    respuestas,
    onRespuesta,
    nota,
    onNota,
    onTerminar,
    onVolver,
  } = datos;

  const sub = [
    `${series} ${series === 1 ? 'serie' : 'series'}`,
    minutos ? `${minutos} min` : null,
    records.length > 0 ? `${records.length} ${records.length === 1 ? 'récord' : 'récords'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="fin-sesion" aria-label={`${nombre}, hecho`}>
      <button type="button" className="fin-sesion-volver" onClick={onVolver}>
        ‹ Volver a la sesión
      </button>

      <div>
        <span className="fin-sesion-rot">{nombre} · hecho</span>
        {/* Sin carga —una sesión de peso corporal— la cifra grande son las
            series: «0 kg levantados» sería un reproche. */}
        {tonelaje > 0 ? (
          <div className="fin-sesion-cifra">
            {miles(tonelaje)}
            <small>kg levantados</small>
          </div>
        ) : (
          <div className="fin-sesion-cifra">
            {series}
            <small>{series === 1 ? 'serie' : 'series'}</small>
          </div>
        )}
        <div className="fin-sesion-sub">{sub}</div>
      </div>

      {records.length > 0 ? (
        <ul className="fin-sesion-records">
          {records.map((r) => (
            <li key={r.nombre}>
              <span className="fin-sesion-marca" aria-hidden="true">
                ▲
              </span>
              <span className="fin-sesion-record-tx">
                <b>
                  {r.nombre} · {r.serie}
                </b>
                <span>tu mejor serie hasta hoy</span>
              </span>
              {r.mejora ? <span className="fin-sesion-mejora">{r.mejora}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {preguntas.length > 0 ? (
        <div className="fin-sesion-preguntas">
          <span className="fin-sesion-k">¿Cómo lo has llevado?</span>
          <SessionFeedback questions={preguntas} answers={respuestas} onChange={onRespuesta} title={false} />
        </div>
      ) : null}

      {onNota ? (
        <label className="fin-sesion-nota">
          <span className="fin-sesion-k">Tu cuaderno</span>
          <textarea
            rows={3}
            value={nota || ''}
            placeholder="Lo que quieras recordar de este entreno. Lo lee tu entrenador."
            onChange={(ev) => onNota(ev.target.value)}
          />
        </label>
      ) : null}

      <button type="button" className="fin-sesion-terminar" onClick={onTerminar}>
        Terminar la sesión
      </button>

      {ejercicios.length > 0 ? (
        <div className="fin-sesion-por-ej">
          <span className="fin-sesion-k">Por ejercicio</span>
          {ejercicios.map((e) => (
            <span className="fin-sesion-fila" key={e.nombre}>
              <b>{e.nombre}</b>
              <span>
                {e.series} {e.series === 1 ? 'serie' : 'series'}
                {e.kg > 0 ? ` · ${miles(e.kg)} kg` : ''}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
};
