import { localeNumber, shortDate } from '@/lib/dates';
import { Tarjeta, TarjetaVacia } from '@/components/dashboard/Tarjeta';

/** Cuántas se enseñan en la columna: las que caben sin desplazar. */
const ULTIMAS = 6;

/**
 * LAS REVISIONES ANTERIORES, en la columna de al lado.
 *
 * ══ Por qué una lista corta y una ventana ══════════════════════════════════
 *
 * El histórico entero iba debajo de la revisión, a lo ancho: catorce filas
 * plegadas que empezaban donde acababa el entreno y hacían la página el doble
 * de larga para contestar una pregunta que se hace pocas veces —«¿qué le cambié
 * en agosto?»—. Aquí van las últimas, en una línea cada una, que es lo que se
 * mira de reojo mientras se decide: cuánto pesaba y qué se le tocó las semanas
 * pasadas. Y el archivo entero, con sus respuestas y sus vídeos, en una ventana
 * grande, como el cuerpo y el entreno «a fondo» del Resumen.
 *
 * @param rows        Las revisiones cerradas, de `useReviewRows`, la más
 *                    reciente primero.
 * @param onVerTodas  Abre la ventana con el histórico completo.
 * @param onAbrir     Abre UNA revisión: lo que se hace al pulsar su fila. Una
 *                    fila que dice «6 cambios» y no deja ver cuáles es un cebo.
 */
/**
 * ══ LO ÚLTIMO QUE LE DIJISTE ════════════════════════════════════════════════
 *
 * La respuesta anterior, entera, al lado de donde se escribe la siguiente.
 *
 * ── Por qué faltaba, y qué costaba ──────────────────────────────────────────
 * Esta columna decía «con respuesta» y ahí se acababa. Pero lo que hace falta
 * en el instante de contestar no es SABER que contestaste: es acordarte de QUÉ
 * dijiste. Sin eso, cada semana se escribe desde cero —«sigue así»— y se
 * pierde lo único que convierte una sucesión de mensajes en un seguimiento:
 * poder decir «lo que te pedí la semana pasada ya te sale».
 *
 * Estaba a dos clics —abrir la ventana del histórico y buscar la fila—, que es
 * exactamente el precio que hace que no se haga nunca.
 *
 * Va literal y sin recortar a mitad de frase: se recorta con `line-clamp`, así
 * que se lee entera al abrirla y nunca se corta una palabra por la mitad.
 */
const UltimoDicho = ({ fila, onAbrir }) => {
  if (!fila) return null;

  return (
    <button type="button" className="dicho" aria-haspopup="dialog" onClick={() => onAbrir?.(fila)}>
      <span className="dicho-k">Lo último que le dijiste · semana del {shortDate(fila.weekStart)}</span>
      {fila.coachNotes ? (
        <q className="dicho-texto">{fila.coachNotes}</q>
      ) : (
        <span className="dicho-texto is-video">Le mandaste un vídeo, sin nota escrita.</span>
      )}
    </button>
  );
};

export const Anteriores = ({ rows = [], onVerTodas, onAbrir }) => {
  const ultimas = rows.slice(0, ULTIMAS);
  /* La última vez que le dijiste algo, sea texto o vídeo. No es «la anterior»:
     una semana cerrada sin comentario no tiene nada que recordar. */
  const dicho = rows.find((r) => r.coachNotes || r.video) || null;

  return (
    <Tarjeta
      rotulo="Revisiones anteriores"
      span={12}
      vacia={rows.length === 0}
      accion={
        rows.length > 0 ? (
          <button type="button" className="cab-accion is-puerta" aria-haspopup="dialog" onClick={onVerTodas}>
            Ver todas
          </button>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <TarjetaVacia>Todavía no has cerrado ninguna semana suya.</TarjetaVacia>
      ) : (
        <>
        <UltimoDicho fila={dicho} onAbrir={onAbrir} />
        <ul className="palancas">
          {ultimas.map((fila) => {
            const cambios = fila.changes.length + fila.structure.length;
            return (
              <li className="palanca is-pulsable" key={fila.id}>
                <button
                  type="button"
                  className="palanca-boton"
                  aria-haspopup="dialog"
                  onClick={() => onAbrir?.(fila)}
                >
                <span className="palanca-k">Semana del {shortDate(fila.weekStart)}</span>
                <span className="palanca-v">
                  {fila.weight ? (
                    <>
                      {localeNumber(fila.weight, { maximumFractionDigits: 1 })}
                      <small> kg</small>
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                <span className="palanca-s">
                  {[
                    /* Lo que se DECIDIÓ, que es a lo que se viene. Y los tres
                       casos son tres cosas: sin cambios, sin con qué comparar y
                       de antes del histórico. Ver `ReviewHistory`. */
                    cambios > 0
                      ? `${cambios} ${cambios === 1 ? 'cambio en su plan' : 'cambios en su plan'}`
                      : fila.comparable
                        ? 'sin cambios'
                        : null,
                    fila.coachNotes ? 'con respuesta' : fila.video ? 'con vídeo' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'cerrada sin comentario'}
                </span>
                </button>
              </li>
            );
          })}
        </ul>
        </>
      )}
    </Tarjeta>
  );
};
