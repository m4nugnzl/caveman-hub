import { Check } from 'lucide-react';

import { ANGLES, fotosPorAngulo, photoWeek } from '@/domain/photos';
import { Thumb } from '@/components/photos/Thumb';

/**
 * LOS TRES ÁNGULOS, Y LA DE LA SEMANA PASADA DEBAJO DEL QUE FALTA. (`M-12`)
 *
 * ══ Qué sustituye ══════════════════════════════════════════════════════════
 *
 * A dos recuadros de aviso y una frase de consejo: «ya tienes 1 foto de esta
 * semana: frontal», «te falta lateral y espalda» y «hazlas siempre igual:
 * misma luz, misma distancia, misma pose». Tres párrafos para decir lo que un
 * dibujo de tres casillas dice de un vistazo — y el consejo, que es el más
 * importante de los tres, era el que iba en gris y al final.
 *
 * ══ Por qué la foto de la semana pasada ════════════════════════════════════
 *
 * Porque «hazlas siempre igual» es una instrucción que nadie puede cumplir de
 * memoria tres semanas seguidas. Se pide por WhatsApp una vez, se hace bien la
 * primera, y a la tercera la lateral está desde el otro lado y con otra luz —y
 * entonces la serie de fotos, que es la prueba de que algo está cambiando, deja
 * de comparar nada.
 *
 * La foto de la última vez, en miniatura y debajo del ángulo que falta, es esa
 * instrucción hecha dato: mismo sitio, misma luz, misma pose, sin leer nada.
 *
 * ── Es información, no una corrección ────────────────────────────────────
 * No dice «la hiciste mal» ni compara: enseña la de antes para que la de ahora
 * se le parezca. Y no bloquea nada — se puede terminar sin fotos, que es lo que
 * dice el paso.
 *
 * @param photos     Todas las fotos de esta persona.
 * @param semana     La semana que se está entregando, o `null` si no se sabe.
 * @param startDate  Su fecha de inicio, con la que se fecha cada foto.
 * @param yaEstan    Los ángulos ya cubiertos: los subidos de esta semana Y los
 *   que están esperando en el selector. Lo segundo importa —quien acaba de
 *   marcar «esta es la lateral» no tiene que ver que le sigue faltando—, y solo
 *   lo sabe el paso, que es quien tiene el lote.
 * @param tira       El traje de TIRA en vez del de rejilla: tres casillas que se
 *   deslizan y se salen por el canto de la pantalla. Es para «Tú», donde esto
 *   deja de ser el pie de un formulario y pasa a ser lo segundo que se ve —tres
 *   columnas de 110 px con su título y su descripción se leen como campos, no
 *   como fotos—. En el asistente y en el panel del entrenador manda la rejilla,
 *   que es donde hay que ver los tres a la vez sin deslizar nada.
 */
export const TresAngulos = ({ photos = [], semana, startDate, yaEstan = null, tira = false }) => {
  /* La última foto de cada ángulo ANTES de esta semana, y la de esta semana si
     ya está subida. Ver `fotosPorAngulo`, que comparte con el teléfono. */
  const { ahora: deAhora, antes: anteriores } = fotosPorAngulo(photos, semana, startDate);

  return (
    <ul className={`angulos${tira ? ' es-tira' : ''}`}>
      {ANGLES.map((angulo) => {
        const hecha = yaEstan ? yaEstan.has(angulo.id) : Boolean(deAhora.get(angulo.id));
        const antes = anteriores.get(angulo.id);

        return (
          <li className={`angulo${hecha ? ' es-hecha' : ''}`} key={angulo.id}>
            <span className="angulo-cab">
              {hecha && (
                <span className="tic" aria-hidden="true">
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
              <b>{angulo.label}</b>
            </span>

            {hecha ? (
              /*
                ── En la REJILLA se dice; en la TIRA se enseña ────────────────
                En el asistente, quien acaba de sacarse la foto no necesita verla
                otra vez, y tres miniaturas grandes empujarían el botón de
                terminar fuera de la pantalla. Ese argumento es del asistente.

                En «Tú» la tira ES las fotos: un hueco vacío marcado «Subida»
                entre dos fotos de la semana pasada se lee como un fallo de
                carga. Y la de esta semana es la que hay que poder mirar — es lo
                que acaba de entregar.
              */
              tira && deAhora.get(angulo.id)?.url ? (
                <span className="angulo-antes">
                  <Thumb
                    url={deAhora.get(angulo.id).url}
                    width={220}
                    alt={`Tu ${angulo.label.toLowerCase()} de esta semana`}
                  />
                  <span className="f">esta semana</span>
                </span>
              ) : (
                <span className="angulo-dice">Subida</span>
              )
            ) : (
              <>
                <span className="angulo-dice">{angulo.hint}</span>
                {antes && (
                  <span className="angulo-antes">
                    <Thumb
                      url={antes.url}
                      width={120}
                      alt={`Tu ${angulo.label.toLowerCase()} de la semana ${photoWeek(antes, startDate)}`}
                    />
                    <span className="f">semana {photoWeek(antes, startDate)}</span>
                  </span>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
};
