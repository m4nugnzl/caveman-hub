import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';

import {
  INTAKE_CATALOG,
  MAX_CUSTOM_STEPS,
  addCustomStep,
  intakeSteps,
  moveStep,
  removeCustomStep,
  toggleStep,
} from '@/domain/intake';
import { newId } from '@/lib/ids';
import { Field, Panel, TextInput } from '@/components/ui/primitives';

/**
 * Los pasos del alta, en Ajustes → Protocolo.
 *
 * ══ Qué se configura aquí y qué no ══════════════════════════════════════════
 *
 * Aquí se decide QUÉ PASOS EXISTEN. Lo hecho y el contenido de cada paso —el
 * vídeo de la rutina de esta persona— son de cada cliente y se tocan en su ficha:
 * un vídeo explicando la rutina de Marta no le vale a Luis.
 *
 * Es la misma división que tienen las preguntas justo encima: la forma de
 * trabajar se piensa una vez, las respuestas son de cada uno.
 *
 * Sin cabecera ni pie propios: los dice el `GroupHead` del apartado. Dentro de
 * la tarjeta solo va lo que se toca.
 */
const StepRow = ({ step, index, total, propio, onMove, onRemove }) => (
  <li className="proto-q">
    <span className="n">{index + 1}</span>

    <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
      <span className="t-sm" style={{ fontWeight: 600 }}>
        {step.label}
      </span>
      <span className="t-2xs t-tertiary">
        {step.hint || (propio ? 'Paso tuyo' : '')}
        {step.link ? ' · admite un enlace para el cliente' : ''}
      </span>
    </span>

    <span className="row gap-1 shrink-0">
      <button
        type="button"
        className="btn btn-icon"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        aria-label={`Subir ${step.label}`}
      >
        <ChevronUp size={15} />
      </button>
      <button
        type="button"
        className="btn btn-icon"
        onClick={() => onMove(1)}
        disabled={index === total - 1}
        aria-label={`Bajar ${step.label}`}
      >
        <ChevronDown size={15} />
      </button>
      <button
        type="button"
        className="btn btn-icon btn-icon-danger"
        onClick={onRemove}
        aria-label={`Quitar ${step.label}`}
        title={propio ? 'Borrar este paso tuyo' : 'Quitarlo del alta'}
      >
        <X size={15} />
      </button>
    </span>
  </li>
);

export const IntakeSteps = ({ intake, onChange }) => {
  const [draft, setDraft] = useState('');

  const activos = intakeSteps(intake);
  const disponibles = INTAKE_CATALOG.filter((s) => !intake.steps.includes(s.id));
  const propio = (id) => intake.custom.some((s) => s.id === id);

  const addPropio = () => {
    const next = addCustomStep(intake, newId('paso'), draft);
    if (next === intake) return;
    onChange(next);
    setDraft('');
  };

  return (
    <Panel className="col gap-4">
      {activos.length === 0 ? (
        <p className="t-sm t-tertiary">
          Sin pasos: al dar de alta a un cliente no se te pedirá nada y no aparecerá ningún aviso.
          Es una respuesta válida.
        </p>
      ) : (
        <ul className="proto-list">
          {activos.map((step, index) => (
            <StepRow
              key={step.id}
              step={step}
              index={index}
              total={activos.length}
              propio={propio(step.id)}
              onMove={(delta) => onChange(moveStep(intake, step.id, delta))}
              onRemove={() =>
                onChange(
                  propio(step.id) ? removeCustomStep(intake, step.id) : toggleStep(intake, step.id)
                )
              }
            />
          ))}
        </ul>
      )}

      {disponibles.length > 0 && (
        <Field label="Añadir uno de estos" hint="Los habituales, para no escribirlos a mano.">
          <div className="rail-wrap" role="group" aria-label="Pasos disponibles">
            {disponibles.map((step) => (
              <button
                key={step.id}
                type="button"
                className="chip chip-dashed"
                title={step.hint}
                onClick={() => onChange(toggleStep(intake, step.id))}
              >
                <Plus size={12} /> {step.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {intake.custom.length < MAX_CUSTOM_STEPS && (
        <Field
          label="O escribe el tuyo"
          hint="Lo que tú haces y no está en la lista. Admite enlace, así que puede entregar algo."
        >
          {(props) => (
            <div className="row gap-2 wrap">
              <TextInput
                {...props}
                className="grow"
                value={draft}
                onChange={setDraft}
                placeholder="Ej: Prueba de fuerza inicial"
                maxLength={60}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  addPropio();
                }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addPropio}
                disabled={!draft.trim()}
              >
                <Plus size={15} /> Añadir
              </button>
            </div>
          )}
        </Field>
      )}
    </Panel>
  );
};
