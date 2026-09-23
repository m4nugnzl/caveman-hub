import { Link } from 'react-router-dom';
import { Ruler } from 'lucide-react';

import { clientPath } from '@/routes';
import { Fold } from '@/components/ui/primitives';
import { Delta } from '@/components/ui/metrics';
/* Los dos tramos que pueden quedarse sin nada —lo que te cuenta y sus fotos—
   decían el vacío con una frase gris suelta, cada uno de una forma. Es lo que
   `TarjetaVacia` vino a quitar: un vacío tiene que leerse como un sitio que
   todavía no se ha llenado, no como algo que ha fallado. */
import { Tarjeta, TarjetaVacia } from '@/components/dashboard/Tarjeta';
import { ComparisonData } from '@/components/review/ComparisonData';
import { ComparaFotos } from '@/components/review/ComparaFotos';
import { SessionFeedback } from '@/components/Coach/Workout/SessionFeedback';
import { hayRespuesta } from '@/domain/protocol';

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
 * ══ Lo que se ve sin abrir nada, y lo que se pliega ═════════════════════════
 *
 *   · **Lo que escribió**, como CITA: es lo único de toda la revisión escrito
 *     por una persona y pesa más en la decisión que medio kilo de báscula.
 *   · **Sus escalas**, solo las que contestó. Salían las cinco con una raya y
 *     un «igual que antes» debajo cuando no había contestado ninguna: cinco
 *     casillas para decir «nada», que es lo que ahora dice una línea.
 *   · **Sus fotos**, los cuatro ángulos de dos semanas en parejas.
 *
 * Lo que se pliega es lo que se CONSULTA cuando ya sospechas algo: la tabla de
 * perímetros y pliegues. Y lleva su resumen en el rótulo, así que se sabe qué
 * hay dentro sin abrirlo.
 *
 * ── Sin puertas en la cabecera ─────────────────────────────────────────────
 * Tuvo «Sus fotos →» y «Pesajes y medidas →». La primera es el archivo del
 * cuerpo a lo largo del tiempo y vive en «El cuerpo» del Resumen; la segunda
 * es ANOTAR datos y va dentro del pliegue de las medidas, al lado de ellas.
 */

/**
 * «Sueño 3 de 5, ↓1». Las escalas se comparan; por eso van en fila.
 *
 * ── Solo habla la que se MUEVE ─────────────────────────────────────────────
 * Cada escala quieta decía «igual que antes» debajo, y con cinco quietas era
 * la misma frase cinco veces en fila — justo el patrón que este mismo producto
 * prohíbe en las pastillas de semana (la regla de la minoría de
 * `marcaMinoria`). La quieta calla; si TODAS están quietas, una sola línea lo
 * dice por todas (ver más abajo).
 */
const Escala = ({ fila }) => (
  <div className="escala">
    <span className="k">{fila.label}</span>
    <span className="v">
      {fila.value}
      <span className="u">de {fila.max}</span>
    </span>
    <span className="d">
      {fila.delta !== null && fila.delta !== 0 && <Delta value={fila.delta} decimals={0} />}
    </span>
  </div>
);

export const BodyCard = ({
  selected,
  comparativa,
  history = [],
  groups = [],
  preguntas = [],
  respuestas = {},
  tendencia = [],
  textos = [],
  /* Lo que contestó marcando —sí/no, opciones, zonas—. Ver el tramo 1. */
  marcadas = [],
  /* Sus fases: el Antes por defecto de las fotos es el inicio de la fase. */
  phases = [],
  client,
}) => {
  /* Las semanas con alguna foto: sin ninguna no hay nada que comparar. */
  const conFoto = groups.filter((g) => g.week !== null && g.photos?.length);

  /* Lo que escribió, ya contestado. Una pregunta sin respuesta no abre cita: una
     cita vacía dice que no dijo nada, y lo que pasó es que no le preguntaste. */
  const dichos = textos
    .map((q) => ({ ...q, texto: String(respuestas[q.id] ?? '').trim() }))
    .filter((q) => q.texto !== '');
  /* Y las escalas que contestó ESTA semana. Las de valor nulo son preguntas
     activas sin respuesta, y no hay nada que enseñar de ellas. */
  const escalas = tendencia.filter((fila) => fila.value !== null && fila.value !== undefined);
  /* Si NINGUNA se movió respecto a la entrega anterior, se dice UNA vez y no
     cinco: hace falta que al menos una tenga con qué compararse (`from`) —la
     primera entrega no está «igual que antes», está sola— y que ninguna de las
     comparables se haya movido. */
  const todoIgual =
    escalas.length > 0 &&
    escalas.some((fila) => fila.from !== null && fila.from !== undefined) &&
    escalas.every((fila) => fila.delta === null || fila.delta === 0);

  /* Lo marcado cuenta como contestar. Sin esto, quien solo conteste el sí/no y
     las zonas ve «no contestó a tus preguntas esta semana» justo encima de lo
     que contestó. */
  const hayMarcadas = marcadas.some((q) => hayRespuesta(respuestas[q.id]));
  const hayRespuestas = escalas.length > 0 || dichos.length > 0 || hayMarcadas;
  const nombre = client?.name?.split(' ')[0] || 'Tu cliente';

  return (
    <Tarjeta rotulo="Su cuerpo" span={12}>
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

        {escalas.length > 0 && (
          <>
            <div className="escalas">
              {escalas.map((fila) => (
                <Escala fila={fila} key={fila.id} />
              ))}
            </div>
            {todoIgual && (
              <span className="t-2xs t-tertiary">Todo igual que en su entrega anterior.</span>
            )}
          </>
        )}

        {/*
          Lo que contestó MARCANDO: sí/no, las opciones, las zonas del cuerpo.
          No es una cantidad —no se compara con la semana pasada— ni son sus
          palabras —no se cita—, así que va por su propio camino y con el mismo
          control con el que se dio. Que la respuesta se lea con la forma en que
          se contestó es lo que evita que las dos versiones divergan
          (`SessionFeedback`), y en el caso de las zonas es además lo único que
          se entiende de un vistazo: «hombro dcho., lumbares» escrito en una
          línea no dice que las dos llevan tres semanas seguidas.
        */}
        <SessionFeedback questions={marcadas} answers={respuestas} title={false} readOnly />

        {!hayRespuestas &&
          (preguntas.length === 0 ? (
            /* Sin preguntas configuradas la casa no riñe ni manda a buscar el
               ajuste: invita con el gesto al lado. La caja punteada queda para
               el vacío que se llenará solo (él no contestó). */
            <div className="vacio-invita">
              <p>Aún no le preguntas nada al entregar la semana.</p>
              <Link className="cab-accion is-puerta" to="/protocolos">
                Elegir preguntas
              </Link>
            </div>
          ) : (
            <TarjetaVacia>{`${nombre} no contestó a tus preguntas esta semana.`}</TarjetaVacia>
          ))}
      </div>

      {/* ── 2 · CÓMO SE VE ──────────────────────────────────────────────────
          Los cuatro ángulos de dos semanas a la vez, con una sola cabecera que
          dice cuáles y cuánto pesaba en cada una (`ComparaFotos`, 22 sep). Por
          defecto, el inicio de la fase contra ahora. */}
      <div className="cuerpo-tramo">
        {conFoto.length > 0 ? (
          <>
            <ComparaFotos
              groups={groups}
              semana={selected}
              history={history}
              startDate={client?.startDate}
              phases={phases}
              clientId={client?.id}
            />
            <Link className="cab-accion is-puerta fotos-estudio" to={clientPath(client?.id, 'revision/estudio')}>
              Collage y vídeo en el estudio
            </Link>
          </>
        ) : (
          <>
            <span className="section-label">Cómo se ve</span>
            <TarjetaVacia>
              Todavía no ha subido ninguna foto. Sin ellas, la báscula decide sola — y no distingue
              un estancamiento de una recomposición.
            </TarjetaVacia>
          </>
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
          <div className="col gap-3">
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
                No hay pliegues ni perímetros cerca de esta semana. Cuando la báscula no se mueve,
                son lo único que distingue un estancamiento de una recomposición.
              </p>
            )}
            {/* Anotar es ENTRAR datos —cuando le mides tú—, y va al lado de las
                medidas, no como botón de cabecera de toda la tarjeta. */}
            <Link className="cab-accion is-puerta" to={clientPath(client?.id, 'revision')}>
              Anotar pesajes y medidas
            </Link>
          </div>
        </Fold>
      </div>
    </Tarjeta>
  );
};
