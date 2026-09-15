import { MessageSquare } from 'lucide-react';

import { hayRespuesta, seVe } from '@/domain/protocol';
import { Contador } from '@/components/ui/Contador';
import { Escala } from '@/components/ui/Escala';
import { Opciones } from '@/components/ui/Opciones';
import { ZonaDelCuerpo } from '@/components/ui/ZonaDelCuerpo';

/**
 * EL CONTROL DE UNA PREGUNTA, por su tipo.
 *
 * Un `switch` y no un componente por tipo repartido por la aplicación: aquí es
 * donde se decide con qué se contesta cada clase de pregunta, y el día que entre
 * una nueva hay un sitio al que ir. Las piezas son las mismas que monta el
 * formulario suelto (`Client/CampoLibre`) — `ui/Escala`, `ui/Opciones`,
 * `ui/ZonaDelCuerpo` — porque el cliente contesta los dos formularios y no tiene
 * por qué encontrarse dos maneras de decir que sí.
 *
 * El texto no pasa por aquí: es el único que en lectura se cita en vez de
 * pintarse, y en edición es un `textarea` con su propio sitio en la hoja.
 */
const Control = ({ question, value, readOnly, soloLectura, onChange }) => {
  const comunes = {
    etiqueta: question.label,
    readOnly,
    soloLectura,
    onChange,
  };

  if (question.kind === 'bool' || question.kind === 'choice' || question.kind === 'multi') {
    return (
      <Opciones
        {...comunes}
        ops={question.kind === 'bool' ? null : question.ops}
        /* El sí/no no es «elegir una de dos». Son las dos únicas respuestas que
           existen, las mismas en todas las preguntas, y una de ellas confirma y
           la otra niega: por eso van con su marca y no como dos píldoras
           iguales con dos palabras dentro. Ver `ui/Opciones`. */
        sino={question.kind === 'bool'}
        varias={question.kind === 'multi'}
        valor={value}
      />
    );
  }

  if (question.kind === 'zone') return <ZonaDelCuerpo {...comunes} valor={value} />;

  if (question.kind === 'number') {
    /* Una cifra suelta —días, horas, veces—, sin unidad y sin rango: lo que
       lleva unidad es una medida y tiene su propia pieza (`RejillaDeMedidas`).
       En lectura es la cifra y nada más: una casilla apagada con un 3 dentro se
       lee peor que un 3. */
    if (readOnly) return <strong className="feedback-cifra">{value}</strong>;
    return <Contador {...comunes} valor={value} />;
  }

  return (
    <Escala
      {...comunes}
      min={question.min ?? 1}
      max={question.max ?? 10}
      valor={value}
      color={question.color}
      /* CON QUÉ se contesta y qué significan sus dos puntas: lo que hace que
         ésta no sea la misma rampa que la de arriba —el sueño va en estrellas y
         la energía en un depósito, mientras el RPE sigue siendo la rampa de 1 a
         10 de siempre—. Ver `instrumento` y `anclas` en `domain/protocol.js`. */
      instrumento={question.instrumento}
      anclas={question.anclas}
    />
  );
};

/**
 * Cómo ha ido la sesión.
 *
 * ── Por qué una escala es una FILA DE BOTONES y no un deslizador ────────────
 * Un deslizador de 1 a 10 en un móvil es un blanco de 30 px que hay que arrastrar
 * con precisión, y devuelve un número que nadie ha querido decir exactamente.
 * Aquí cada valor es su propio objetivo táctil: se contesta con un toque, se ve
 * lo que has contestado sin leer una cifra aparte, y no hay forma de poner un 7
 * queriendo poner un 8.
 *
 * ── Por qué no hay botón de guardar ─────────────────────────────────────────
 * Cada respuesta se guarda al pulsarla, igual que los kilos. Un formulario con
 * «Enviar» al final introduce un estado nuevo —contestado pero sin mandar— y una
 * forma de perder lo escrito: cerrar la pestaña. El indicador de guardado de la
 * pantalla ya dice si ha ido bien.
 *
 * ── Modo lectura ────────────────────────────────────────────────────────────
 * El mismo componente lo usa el entrenador para VER lo que le han contestado.
 * No es una copia con otro formato: que la respuesta se lea en el mismo sitio y
 * con la misma forma en que se dio es lo que evita que las dos versiones
 * divergan.
 *
 * ── `title={false}`: sin rótulo propio ──────────────────────────────────────
 * Para cuando este bloque YA cuelga de un rótulo. En la revisión ocupa un panel
 * entero titulado «Lo que te cuenta» y encima pintaba su propia troquelada, así
 * que eran dos rótulos seguidos diciendo lo mismo con distintas palabras — la
 * clase de costura de la que sale que una pantalla parezca un collage.
 */

/*
  ── `soloLectura` no es lo mismo que `readOnly`, y la diferencia importa ─────
  `readOnly` es «ya se contestó»: el control se pinta sin poder tocarse. Y se
  pinta ENTERO —la rampa con lo andado teñido—, porque una escala dice lo que
  dice por su longitud: el 8 solo significa algo al lado del 10 que no se marcó.
  `soloLectura` es «así se va a ver»: el control entero, apagado. Lo usa el
  constructor de formularios para enseñar la pregunta tal como le llegará al
  cliente antes de que la conteste.

  Es la misma decisión que ya está tomada en `Client/IntakeQuestions.jsx`, y por
  el mismo motivo: un segundo renderizador para la muestra se queda atrás el día
  que se añada una clase de pregunta, y entonces la muestra miente — que es peor
  que no tenerla.
*/

/**
 * @param numerado La hoja con su carril de números a la izquierda. Ver el
 *   bloque «LA HOJA NUMERADA» más abajo; por defecto NO, porque este componente
 *   también se monta de una pregunta suelta (la muestra del constructor) y de
 *   lectura, y ahí un «01» solo dice que hay uno.
 */
export const SessionFeedback = ({
  questions,
  answers = {},
  onChange,
  readOnly = false,
  soloLectura = false,
  numerado = false,
  title,
}) => {
  if (questions.length === 0) return null;

  /*
    ══ LO QUE HOY NO VIENE A CUENTO NO SE PREGUNTA ════════════════════════════

    «¿Dónde te ha molestado?» —un cuerpo de dos figuras y veinte zonas— estaba en
    la hoja TODAS las semanas, y la semana en que no te ha dolido nada, que es la
    mayoría, eso es medio formulario que hay que leer para concluir que no va
    contigo. Aparece al marcar dolor, en su sitio y sin cambiar de pantalla.

    El constructor (`soloLectura`) es la excepción: ahí se enseña el formulario
    ENTERO, porque lo que se viene a ver es qué preguntas lleva. Esconderle al
    entrenador la mitad de su propio cuestionario sería peor que enseñarle una
    que su cliente no siempre verá.

    Ver `seVe` y `depende` en `domain/protocol.js`.
  */
  /* Y lo CONTESTADO no se esconde nunca, aunque su condición ya no se cumpla.
     Una respuesta guardada que la pantalla no enseña es un dato que el cliente
     no puede corregir y que el entrenador no sabe que existe — hay semanas
     entregadas con una zona marcada y el dolor en blanco, de cuando esto no era
     una condición. Sale, y al contestar la de arriba se limpia (ver
     `responder`). */
  const visibles = soloLectura
    ? questions
    : questions.filter((q) => seVe(q, answers, questions) || hayRespuesta(answers[q.id]));

  /*
    Y la respuesta HUÉRFANA se borra: marcar un 4 de dolor, señalar el hombro y
    bajar el dolor a 0 dejaba guardada una zona que ya no se ve en ninguna
    pantalla —el cliente no puede quitarla y el entrenador la lee como si le
    siguiera doliendo—. Se limpia al contestar la de la que depende, que es el
    único momento en que puede quedarse huérfana.
  */
  const responder = (question, value) => {
    onChange(question.id, value);
    for (const otra of questions) {
      if (otra.depende?.de !== question.id) continue;
      if (seVe(otra, { ...answers, [question.id]: value }, questions)) continue;
      if (hayRespuesta(answers[otra.id])) onChange(otra.id, Array.isArray(answers[otra.id]) ? [] : '');
    }
  };

  const answered = visibles.filter((q) => hayRespuesta(answers[q.id])).length;

  /* En lectura, sin una sola respuesta no hay nada que enseñar. En edición sí:
     el formulario ES lo que hay que enseñar. */
  if (readOnly && answered === 0) return null;

  return (
    <section className="feedback-block">
      {title !== false && (
        <header className="row between wrap gap-2">
          <span className="section-label">
            <MessageSquare size={13} className="icon-inline" />{title || 'Cómo ha ido'}
          </span>
          {!readOnly && visibles.length > 1 && (
            <span className="t-2xs t-tertiary">
              {answered} de {visibles.length}
            </span>
          )}
        </header>
      )}

      {/*
        ══ LA HOJA NUMERADA ══════════════════════════════════════════════════

        Esto era una pila de seis preguntas idénticas: el enunciado y su ayuda
        en la MISMA línea separados por un punto medio, y debajo el control. Sin
        jerarquía —el cómo se contesta pesaba lo mismo que el qué se pregunta—,
        sin separación entre una pregunta y la siguiente, y sin ninguna señal de
        por dónde vas que no fuera el contador de la cabecera.

        Ahora cada pregunta ocupa su renglón con su número a la izquierda, y el
        número SE ENCIENDE al contestarla. Es la única pieza de color de la hoja
        y hace tres cosas a la vez: numera (un formulario sí es una secuencia,
        que es la única licencia para numerar algo), separa, y dice cuánto
        llevas sin tener que leer una cifra aparte.

        La ayuda baja a su propia línea y en voz baja: dice CÓMO se contesta, y
        eso se lee después del enunciado, no compitiendo con él.
      */}
      <div className={`feedback-list${numerado ? ' es-hoja' : ''}`}>
        {visibles.map((question, i) => {
          const value = answers[question.id] ?? '';
          const hecha = hayRespuesta(value);
          const n = numerado ? (
            <span className="feedback-n" data-hecha={hecha ? '1' : undefined} aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
          ) : null;
          const clase = `feedback-q${numerado ? ' es-numerada' : ''}`;

          if (question.kind === 'text') {
            if (readOnly) {
              return String(value).trim() === '' ? null : (
                <div className={clase} key={question.id}>
                  {n}
                  <span className="k">{question.label}</span>
                  <p className="feedback-text">{value}</p>
                </div>
              );
            }
            return (
              <label className={clase} key={question.id}>
                {n}
                <span className="k">{question.label}</span>
                {question.hint && <span className="hint">{question.hint}</span>}
                <textarea
                  className="textarea"
                  rows={3}
                  disabled={soloLectura}
                  placeholder="Opcional"
                  value={value}
                  onChange={(e) => responder(question, e.target.value)}
                />
              </label>
            );
          }

          if (readOnly && !hayRespuesta(value)) return null;

          return (
            <div className={clase} key={question.id}>
              {n}
              <span className="k">{question.label}</span>
              {question.hint && !readOnly && <span className="hint">{question.hint}</span>}
              <Control
                question={question}
                value={value}
                readOnly={readOnly}
                soloLectura={soloLectura}
                onChange={(next) => responder(question, next)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
};
