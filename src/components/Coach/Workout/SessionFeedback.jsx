import { MessageSquare } from 'lucide-react';

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

const Scale = ({ question, value, onChange, readOnly }) => {
  const min = question.min ?? 1;
  const max = question.max ?? 10;
  const steps = [];
  for (let i = min; i <= max; i += 1) steps.push(i);

  const current = String(value ?? '');

  return (
    <div
      className="scale-picker"
      role={readOnly ? undefined : 'group'}
      aria-label={readOnly ? undefined : question.label}
    >
      {steps.map((step) => {
        const active = current === String(step);

        /* En lectura solo se pinta el valor dado: una fila de diez botones
           deshabilitados es un control que invita a pulsarlo y no hace nada. */
        if (readOnly) {
          return (
            <span
              key={step}
              className={`scale-step${active ? ' is-on' : ''}`}
              style={active ? { background: question.color, borderColor: question.color } : undefined}
              aria-hidden={!active}
            >
              {step}
            </span>
          );
        }

        return (
          <button
            key={step}
            type="button"
            className={`scale-step${active ? ' is-on' : ''}`}
            style={active ? { background: question.color, borderColor: question.color } : undefined}
            aria-pressed={active}
            /* Volver a pulsar el valor elegido lo borra. Sin esto no hay forma de
               deshacer una respuesta dada por error, y dejar un dato falso es peor
               que no tener dato. */
            onClick={() => onChange(active ? '' : String(step))}
          >
            {step}
          </button>
        );
      })}
    </div>
  );
};

export const SessionFeedback = ({ questions, answers = {}, onChange, readOnly = false, title }) => {
  if (questions.length === 0) return null;

  const answered = questions.filter((q) => String(answers[q.id] ?? '').trim() !== '').length;

  /* En lectura, sin una sola respuesta no hay nada que enseñar. En edición sí:
     el formulario ES lo que hay que enseñar. */
  if (readOnly && answered === 0) return null;

  return (
    <section className="feedback-block">
      {title !== false && (
        <header className="row between wrap gap-2">
          <span className="section-label">
            <MessageSquare size={12} /> {title || 'Cómo ha ido'}
          </span>
          {!readOnly && questions.length > 1 && (
            <span className="t-2xs t-tertiary">
              {answered} de {questions.length}
            </span>
          )}
        </header>
      )}

      <div className="feedback-list">
        {questions.map((question) => {
          const value = answers[question.id] ?? '';

          if (question.kind === 'text') {
            if (readOnly) {
              return String(value).trim() === '' ? null : (
                <div className="feedback-q" key={question.id}>
                  <span className="k">{question.label}</span>
                  <p className="feedback-text">{value}</p>
                </div>
              );
            }
            return (
              <label className="feedback-q" key={question.id}>
                <span className="k">{question.label}</span>
                <textarea
                  className="textarea"
                  rows={2}
                  placeholder="Opcional"
                  value={value}
                  onChange={(e) => onChange(question.id, e.target.value)}
                />
              </label>
            );
          }

          if (readOnly && String(value).trim() === '') return null;

          return (
            <div className="feedback-q" key={question.id}>
              <span className="k">
                {question.label}
                {question.hint && !readOnly && <span className="hint"> · {question.hint}</span>}
              </span>
              <Scale
                question={question}
                value={value}
                readOnly={readOnly}
                onChange={(next) => onChange(question.id, next)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
};
