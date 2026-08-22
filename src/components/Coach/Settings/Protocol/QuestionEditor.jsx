import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';

import {
  MAX_CUSTOM,
  addCustomQuestion,
  moveQuestion,
  removeCustomQuestion,
  toggleQuestion,
} from '@/domain/protocol';
import { Field, Panel, SegmentedControl, TextInput } from '@/components/ui/primitives';

const QuestionRow = ({ question, index, total, onMove, onRemove, canDelete, onDelete }) => (
  <li className="proto-q">
    <span className="n">{index + 1}</span>

    <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
      <span className="t-sm" style={{ fontWeight: 600 }}>
        {question.label}
      </span>
      <span className="t-2xs t-tertiary">
        {question.kind === 'scale'
          ? `Escala ${question.min ?? 1}–${question.max ?? 10}${question.lowerIsBetter ? ' · menos es mejor' : ''}`
          : 'Texto libre · no se puede medir'}
      </span>
    </span>

    <span className="row gap-1 shrink-0">
      <button
        type="button"
        className="btn btn-icon"
        onClick={() => onMove('up')}
        disabled={index === 0}
        aria-label={`Subir ${question.label}`}
      >
        <ChevronUp size={15} />
      </button>
      <button
        type="button"
        className="btn btn-icon"
        onClick={() => onMove('down')}
        disabled={index === total - 1}
        aria-label={`Bajar ${question.label}`}
      >
        <ChevronDown size={15} />
      </button>
      <button
        type="button"
        className="btn btn-icon btn-icon-danger"
        onClick={canDelete ? onDelete : onRemove}
        aria-label={`Quitar ${question.label}`}
        title={canDelete ? 'Borrar esta pregunta tuya' : 'Quitarla del protocolo'}
      >
        <X size={15} />
      </button>
    </span>
  </li>
);

/**
 * El editor de UNA lista de preguntas: las activas en su orden, el catálogo del
 * que añadir y el formulario de pregunta propia.
 *
 * ══ Por qué es un componente y no dos bloques de JSX ═══════════════════════
 *
 * Porque hay dos listas —lo que se pregunta al terminar de entrenar y lo que se
 * pregunta al cerrar la semana— y son la MISMA operación sobre distinto destino,
 * igual que la plantilla y el cliente en el selector de arriba. Copiadas serían
 * sesenta líneas duplicadas donde solo cambian el título y el nombre de la clave,
 * y en tres meses una de las dos tendría un arreglo que la otra no.
 *
 * Lo que cambia entra por propiedades. Lo que no cambia —el orden importa, las
 * escalas se miden y las de texto no, el tope de seis preguntas propias— vive
 * aquí una vez.
 *
 * ── `title` es opcional ─────────────────────────────────────────────────────
 * Cuando el editor ES el apartado —la sesión, que no tiene nada más— el nombre
 * ya lo pone el `GroupHead` de arriba y repetirlo dentro de la tarjeta serían
 * dos títulos iguales a dos centímetros. Con título solo va donde comparte
 * apartado con otro bloque, que es el check-in.
 *
 * ── El borrador es SUYO ─────────────────────────────────────────────────────
 * Cada instancia guarda su propia pregunta a medio escribir. Antes los dos
 * borradores vivían en el panel padre —«un borrador POR LISTA», decía el
 * comentario— y eso es exactamente lo que el estado por instancia da gratis:
 * empezar a escribir en la sesión y bajar al check-in no arrastra nada.
 */
export const QuestionEditor = ({
  title,
  intro,
  notice,
  protocol,
  list,
  catalogo,
  questions,
  onSave,
  emptyText,
  addPlaceholder,
}) => {
  const [draft, setDraft] = useState({ label: '', max: '10', lowerIsBetter: false });

  const disponibles = catalogo.filter((q) => !(protocol[list] || []).includes(q.id));
  const propias = protocol.custom || [];

  /* Las propias que NO están en esta lista se pueden añadir aquí también: se
     escribieron una vez y valen para las dos. Sin esto, la única forma de usar
     «Molestia en el hombro» en el check-in sería volver a escribirla, y acabarían
     dos preguntas iguales con dos series distintas. */
  const propiasFuera = propias.filter((q) => !(protocol[list] || []).includes(q.id));

  const addCustom = () => {
    const next = addCustomQuestion(
      protocol,
      { label: draft.label, max: Number(draft.max) || 10, lowerIsBetter: draft.lowerIsBetter },
      list
    );
    if (next === protocol) return;
    onSave(next);
    setDraft({ label: '', max: '10', lowerIsBetter: false });
  };

  return (
    <Panel title={title} sub={intro} className="col gap-4">
      {notice}

      {questions.length === 0 ? (
        <p className="t-sm t-tertiary">{emptyText}</p>
      ) : (
        <ul className="proto-list">
          {questions.map((question, index) => (
            <QuestionRow
              key={question.id}
              question={question}
              index={index}
              total={questions.length}
              onMove={(dir) => onSave(moveQuestion(protocol, question.id, dir, list))}
              onRemove={() => onSave(toggleQuestion(protocol, question.id, list))}
              /* Borrar de verdad solo se ofrece con las propias, y quitarlas las
                 saca de LAS DOS listas: una pregunta que ya no existe no puede
                 seguir haciéndose en la otra pantalla. */
              canDelete={Boolean(propias.find((q) => q.id === question.id))}
              onDelete={() => onSave(removeCustomQuestion(protocol, question.id))}
            />
          ))}
        </ul>
      )}

      {(disponibles.length > 0 || propiasFuera.length > 0) && (
        <div className="col gap-2">
          <span className="section-label">Añadir del catálogo</span>
          <div className="rail-wrap">
            {[...disponibles, ...propiasFuera].map((question) => (
              <button
                key={question.id}
                type="button"
                className="chip chip-dashed"
                onClick={() => onSave(toggleQuestion(protocol, question.id, list))}
                title={question.hint}
              >
                <Plus size={12} /> {question.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Preguntas propias ──────────────────────────────────────────── */}
      <div className="col gap-2">
        <span className="section-label">
          Tu propia pregunta ({propias.length}/{MAX_CUSTOM})
        </span>

        {propias.length >= MAX_CUSTOM ? (
          <p className="t-xs t-tertiary">
            Has llegado al máximo. El tope existe porque toda la configuración de un cliente comparte
            una columna acotada a 8 KB.
          </p>
        ) : (
          <div className="row-end wrap gap-2">
            <Field label="Qué quieres preguntar" className="grow">
              {(props) => (
                <TextInput
                  {...props}
                  value={draft.label}
                  onChange={(v) => setDraft({ ...draft, label: v })}
                  placeholder={addPlaceholder}
                />
              )}
            </Field>

            <Field label="Escala de 1 a">
              {(props) => (
                <TextInput
                  {...props}
                  value={draft.max}
                  onChange={(v) => setDraft({ ...draft, max: v })}
                  className="input-center"
                  style={{ width: 68 }}
                />
              )}
            </Field>

            <Field label="Dirección" hint="Qué significa que suba">
              <SegmentedControl
                label="Dirección de la escala"
                value={draft.lowerIsBetter ? 'lower' : 'higher'}
                onChange={(v) => setDraft({ ...draft, lowerIsBetter: v === 'lower' })}
                options={[
                  { id: 'higher', label: 'Mejor' },
                  { id: 'lower', label: 'Peor' },
                ]}
              />
            </Field>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={addCustom}
              disabled={!draft.label.trim()}
            >
              <Plus size={15} /> Añadir
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
};
