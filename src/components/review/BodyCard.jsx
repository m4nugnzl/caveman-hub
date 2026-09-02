import { Link } from 'react-router-dom';
import { Images, Ruler } from 'lucide-react';

import { clientPath } from '@/routes';
import { Fold } from '@/components/ui/primitives';
import { Delta } from '@/components/ui/metrics';
/* Los dos tramos que pueden quedarse sin nada —lo que te cuenta y sus fotos—
   decían el vacío con una frase gris suelta, cada uno de una forma. Es lo que
   `TarjetaVacia` vino a quitar: un vacío tiene que leerse como un sitio que
   todavía no se ha llenado, no como algo que ha fallado. */
import { Tarjeta, TarjetaVacia } from '@/components/dashboard/Tarjeta';
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
 * ══ Lo que se ve sin abrir nada, y lo que se pliega ═════════════════════════
 *
 *   · **Lo que escribió**, como CITA: es lo único de toda la revisión escrito
 *     por una persona y pesa más en la decisión que medio kilo de báscula.
 *   · **Sus escalas**, solo las que contestó. Salían las cinco con una raya y
 *     un «igual que antes» debajo cuando no había contestado ninguna: cinco
 *     casillas para decir «nada», que es lo que ahora dice una línea.
 *   · **La tira de fotos**, solo de las semanas que tienen foto. Una columna
 *     vacía por semana sin foto convertía la tira en once rectángulos de puntos
 *     y una foto; la ventana de la gráfica ya dice qué semanas hay.
 *
 * Lo que se pliega es lo que se CONSULTA cuando ya sospechas algo: la hoja de
 * contactos a tamaño de comparar y la tabla de perímetros y pliegues. Y llevan
 * su resumen en el rótulo, así que se sabe qué hay dentro sin abrirlo.
 *
 * ── Sin puertas en la cabecera ─────────────────────────────────────────────
 * Tuvo «Sus fotos →» y «Pesajes y medidas →». La primera es el archivo del
 * cuerpo a lo largo del tiempo y vive en «El cuerpo» del Resumen; la segunda
 * es ANOTAR datos y va dentro del pliegue de las medidas, al lado de ellas.
 */

/** «Sueño 3 de 5, antes 4». Las escalas se comparan; por eso van en fila. */
const Escala = ({ fila }) => (
  <div className="escala">
    <span className="k">{fila.label}</span>
    <span className="v">
      {fila.value}
      <span className="u">de {fila.max}</span>
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
  /* Solo las semanas con foto: la tira enseña cómo SE VE, y una semana sin foto
     no enseña nada. */
  const conFoto = weeks.filter((s) => s.photo);
  /*
    ── La historia en tres fotos ──────────────────────────────────────────────
    Con historial largo, la tira entera son diez miniaturas del mismo tamaño:
    una enumeración, no una historia. Se cura a la narrativa del progreso —la
    PRIMERA, la MITAD y la ÚLTIMA— que es como se cuenta un cambio físico; el
    archivo completo sigue a un pliegue («Compararlas de cerca») y en «Sus
    fotos». La semana que se está revisando, si tiene foto, no puede quedarse
    fuera: ocupa el sitio de la mitad.
  */
  const tresFotos = (() => {
    if (conFoto.length <= 4) return conFoto;
    const primera = conFoto[0];
    const ultima = conFoto[conFoto.length - 1];
    const elegida = conFoto.find((s) => s.week === selected);
    const mitad =
      elegida && elegida !== primera && elegida !== ultima
        ? elegida
        : conFoto[Math.floor(conFoto.length / 2)];
    return [primera, mitad, ultima];
  })();

  /* Lo que escribió, ya contestado. Una pregunta sin respuesta no abre cita: una
     cita vacía dice que no dijo nada, y lo que pasó es que no le preguntaste. */
  const dichos = textos
    .map((q) => ({ ...q, texto: String(respuestas[q.id] ?? '').trim() }))
    .filter((q) => q.texto !== '');
  /* Y las escalas que contestó ESTA semana. Las de valor nulo son preguntas
     activas sin respuesta, y no hay nada que enseñar de ellas. */
  const escalas = tendencia.filter((fila) => fila.value !== null && fila.value !== undefined);

  const hayRespuestas = escalas.length > 0 || dichos.length > 0;
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
          <div className="escalas">
            {escalas.map((fila) => (
              <Escala fila={fila} key={fila.id} />
            ))}
          </div>
        )}

        {!hayRespuestas &&
          (preguntas.length === 0 ? (
            /* Sin preguntas configuradas la casa no riñe ni manda a buscar el
               ajuste: invita con el gesto al lado. La caja punteada queda para
               el vacío que se llenará solo (él no contestó). */
            <div className="vacio-invita">
              <p>Aún no le preguntas nada al entregar la semana.</p>
              <Link className="cab-accion is-puerta" to="/ajustes/protocolo">
                Elegir preguntas
              </Link>
            </div>
          ) : (
            <TarjetaVacia>{`${nombre} no contestó a tus preguntas esta semana.`}</TarjetaVacia>
          ))}
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
            {tresFotos.length < conFoto.length
              ? `la primera, la mitad y la última de sus ${conFoto.length} semanas con foto`
              : deEstaSemana > 0
                ? `${deEstaSemana} de esta semana`
                : 'esta semana no ha subido ninguna'}
          </span>
        </div>

        {conFoto.length > 0 ? (
          <>
            <div className="tira-marco">
              <PhotoStrip weeks={tresFotos} selected={selected} onSelect={onSelect} onPhoto={onPhoto} />
            </div>

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
                  <Link className="cab-accion is-puerta" to={clientPath(client?.id, 'revision/estudio')}>
                    El estudio
                  </Link>
                </div>
              </div>
            </Fold>
          </>
        ) : (
          <TarjetaVacia>
            Todavía no ha subido ninguna foto. Sin ellas, la báscula decide sola — y no distingue
            un estancamiento de una recomposición.
          </TarjetaVacia>
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
