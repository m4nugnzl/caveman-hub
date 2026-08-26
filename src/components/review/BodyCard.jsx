import { Link } from 'react-router-dom';
import { Camera, Columns2, Images, Ruler } from 'lucide-react';

import { clientPath } from '@/routes';
import { Fold } from '@/components/ui/primitives';
import { Delta } from '@/components/ui/metrics';
import { ComparisonData } from '@/components/review/ComparisonData';
import { PhotoContactSheet } from '@/components/review/PhotoContactSheet';
import { PhotoStrip } from '@/components/review/PhotoStrip';

/**
 * EL CUERPO: lo que te cuenta, cómo se ve y lo que dice la cinta métrica.
 *
 * ══ Por qué van los tres juntos ═════════════════════════════════════════════
 *
 * La báscula, la cinta métrica, las fotos y lo que él cuenta son cuatro
 * instrumentos del mismo examen. La báscula está arriba, en la gráfica, porque
 * es la que se mira primero y la que se compara con las calorías; los otros tres
 * están aquí, y juntos, porque decidir con uno delante y tres de memoria es
 * exactamente el error que se comete cuando la báscula no se mueve y no miras
 * los perímetros.
 *
 * ══ Y por qué DOS de ellos ya no se pliegan ═════════════════════════════════
 *
 * Fueron tres pliegues iguales, uno detrás de otro. Eso hacía dos cosas mal:
 *
 *   · **Enterraba lo único escrito por una persona.** Lo que el cliente cuenta
 *     —«llevo dos semanas durmiendo fatal»— pesa más en la decisión que medio
 *     kilo de báscula, y salía como una fila de menú con una flecha. Ahora es una
 *     CITA, con su tipografía y su aire, que es como se lee lo que alguien dice.
 *   · **Escondía las fotos detrás de un clic.** Una foto se juzga mirándola, no
 *     decidiendo si merece la pena abrirla. La tira de miniaturas cuesta ochenta
 *     píxeles de alto y contesta sola la mitad de las preguntas de una revisión.
 *
 * Lo que sí sigue plegado es lo que se CONSULTA cuando ya sospechas algo: la hoja
 * de contactos a tamaño grande y la tabla de perímetros y pliegues. Y llevan su
 * resumen en el rótulo —«cintura −1 cm»— así que se sabe qué hay dentro sin
 * abrirlo, que es lo que distingue plegar de esconder.
 */

/** «Sueño 3 de 5, antes 4». Las escalas se comparan; por eso van en fila. */
const Escala = ({ fila }) => (
  <div className="escala">
    <span className="k">{fila.label}</span>
    <span className="v">
      {fila.value === null ? '—' : fila.value}
      {fila.value !== null && <span className="u">de {fila.max}</span>}
    </span>
    <span className="d">
      {fila.delta !== null && fila.delta !== 0 ? (
        <Delta value={fila.delta} decimals={0} />
      ) : (
        fila.from !== null && <span className="t-2xs t-tertiary">igual que antes</span>
      )}
    </span>
  </div>
);

export const BodyCard = ({
  weeks = [],
  selected,
  onSelect,
  onPhoto,
  comparativa,
  history = [],
  groups = [],
  preguntas = [],
  respuestas = {},
  tendencia = [],
  textos = [],
  client,
}) => {
  const deEstaSemana = groups.find((g) => g.week === selected)?.photos.length || 0;
  const hayFotos = weeks.some((s) => s.photo);

  /* Lo que escribió, ya contestado. Una pregunta sin respuesta no abre cita: una
     cita vacía dice que no dijo nada, y lo que pasó es que no le preguntaste. */
  const dichos = textos
    .map((q) => ({ ...q, texto: String(respuestas[q.id] ?? '').trim() }))
    .filter((q) => q.texto !== '');

  const hayRespuestas = tendencia.length > 0 || dichos.length > 0;

  /* El resumen de sus medidas: la que más se ha movido, que es la que merece que
     abras el pliegue. Una lista de seis no cabe en un rótulo. */
  const nombre = client?.name?.split(' ')[0] || 'Tu cliente';

  return (
    <section className="card bloque" aria-label="Su cuerpo">
      <div className="bloque-head">
        <div className="bloque-say">
          <h2 className="bloque-titulo">Su cuerpo</h2>
          <p className="bloque-sub">
            Lo que te cuenta, cómo se ve y lo que dice la cinta métrica.
          </p>
        </div>
        {/* Las dos puertas al archivo, y las dos aquí: éste es el bloque que
            enseña el cuerpo, así que es donde se busca «déjame ver el resto».
            Estaban una en la cabecera y otra enterrada dentro de un pliegue. */}
        <div className="row gap-2 wrap">
          <Link className="btn btn-secondary btn-sm" to={clientPath(client?.id, 'revision/fotos')}>
            <Camera size={13} /> Sus fotos
          </Link>
          <Link className="btn btn-secondary btn-sm" to={clientPath(client?.id, 'revision')}>
            <Ruler size={13} /> Pesajes y medidas
          </Link>
        </div>
      </div>

      {/* ── 1 · LO QUE TE CUENTA ────────────────────────────────────────────
          Lo único de toda la revisión escrito por una persona, y lo que más
          cambia la respuesta. Va lo primero y sin pliegue. */}
      <div className="cuerpo-tramo">
        <span className="section-label">Qué te cuenta</span>

        {dichos.length > 0 && (
          <div className="citas">
            {dichos.map((q) => (
              <figure className="cita" key={q.id}>
                <blockquote>{q.texto}</blockquote>
                <figcaption>{q.label}</figcaption>
              </figure>
            ))}
          </div>
        )}

        {tendencia.length > 0 && (
          <div className="escalas">
            {tendencia.map((fila) => (
              <Escala fila={fila} key={fila.id} />
            ))}
          </div>
        )}

        {!hayRespuestas && (
          <p className="t-sm t-tertiary">
            {preguntas.length === 0
              ? 'No le haces ninguna pregunta al entregar la semana. Se configuran en Ajustes › Protocolo.'
              : `${nombre} no contestó a tus preguntas esta semana.`}
          </p>
        )}
      </div>

      {/* ── 2 · CÓMO SE VE ──────────────────────────────────────────────────
          La tira, siempre a la vista: una foto se juzga mirándola, no decidiendo
          si merece la pena abrirla. Lo que se pliega es la hoja de contactos —los
          tres ángulos a tamaño de comparar—, que es lo que se abre cuando ya
          sospechas algo. */}
      <div className="cuerpo-tramo">
        <div className="row between wrap gap-3">
          <span className="section-label">Cómo se ve</span>
          <span className="t-xs t-tertiary">
            {deEstaSemana > 0
              ? `${deEstaSemana} de esta semana`
              : 'esta semana no ha subido ninguna'}
          </span>
        </div>

        {hayFotos ? (
          <>
            <PhotoStrip weeks={weeks} selected={selected} onSelect={onSelect} onPhoto={onPhoto} />

            <Fold
              icon={Images}
              title="Compararlas de cerca"
              summary={
                comparativa
                  ? `contra la semana ${comparativa.before?.week ?? '—'}`
                  : 'los tres ángulos, grandes'
              }
            >
              <div className="col gap-4">
                <PhotoContactSheet groups={groups} weekNumber={selected} history={history} />
                <div className="row between wrap gap-3">
                  <span className="t-xs t-tertiary">
                    El collage y el vídeo de comparación son del estudio.
                  </span>
                  <Link
                    className="btn btn-secondary btn-sm"
                    to={clientPath(client?.id, 'revision/estudio')}
                  >
                    <Columns2 size={13} /> El estudio
                  </Link>
                </div>
              </div>
            </Fold>
          </>
        ) : (
          <p className="t-sm t-tertiary">
            Todavía no ha subido ninguna foto. Sin ellas, la báscula decide sola — y no distingue
            un estancamiento de una recomposición.
          </p>
        )}
      </div>

      {/* ── 3 · SUS MEDIDAS ─────────────────────────────────────────────────
          Plegado: es lo que se consulta cuando la báscula no se mueve, no lo que
          se mira de entrada. */}
      <div className="cuerpo-tramo">
        <Fold
          icon={Ruler}
          title="Sus medidas"
          summary={
            comparativa ? `contra la semana ${comparativa.before?.week ?? '—'}` : 'sin medidas cerca'
          }
        >
          {comparativa ? (
            <ComparisonData
              bare
              before={comparativa.before}
              after={comparativa.after}
              span={comparativa.span}
              history={history}
              gender={client?.gender}
            />
          ) : (
            <p className="t-sm t-tertiary">
              No hay pliegues ni perímetros cerca de esta semana. Cuando la báscula no se mueve, son
              lo único que distingue un estancamiento de una recomposición.
            </p>
          )}
        </Fold>
      </div>
    </section>
  );
};
