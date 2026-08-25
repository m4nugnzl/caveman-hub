import { useState } from 'react';
import { ArrowLeftRight, Lock, Plus, X } from 'lucide-react';

import {
  INTAKE_CATALOG,
  MAX_CUSTOM_STEPS,
  addCustomStep,
  clientSteps,
  coachSteps,
  intakeSteps,
  removeCustomStep,
  setStepOwner,
  toggleStep,
} from '@/domain/intake';
import { newId } from '@/lib/ids';
import { Field, Notice, Panel, TextInput } from '@/components/ui/primitives';

/**
 * El alta, en Ajustes → Protocolo.
 *
 * ══ Dos listas y no una ════════════════════════════════════════════════════
 *
 * Un alta es «que me mande esto, y con esto yo hago aquello». Estaba montada
 * como UNA lista numerada donde se mezclaban las dos mitades, así que para saber
 * qué se le impone al cliente había que reconocer cuál era cuál — y lo primero
 * que hay que poder ver aquí es precisamente eso.
 *
 * Partirla en dos hace además evidente el orden real del trabajo: lo de arriba
 * pasa antes, y lo de abajo no se puede hacer sin ello.
 *
 * ══ Y el reparto se puede cambiar ══════════════════════════════════════════
 *
 * «El cliente te manda su vídeo de postura» es suyo para quien se lo pide y es
 * un recordatorio privado para quien lo graba en persona. Un paso propio —«prueba
 * de fuerza inicial»— puede ser cualquiera de las dos cosas. Así que se mueve, y
 * moverlo es un botón: no hay que aprender ningún concepto para usarlo.
 *
 * Los tres AUTOMÁTICOS no se mueven, y se dice por qué en su candado: lo que los
 * da por hechos es que él los haya entregado, así que del lado del entrenador
 * serían una casilla que no se puede marcar.
 *
 * ══ Sin flechas de ordenar ═════════════════════════════════════════════════
 *
 * Las había, y con dos listas dejan de tener sentido: subir una fila la haría
 * saltar de grupo a mitad de recorrido. Cada lista conserva el orden en que se
 * añadieron los pasos, que para tres o cuatro es suficiente — y es una cosa
 * menos que decidir en una pantalla que hay que entender el primer día.
 */
const StepRow = ({ step, propio, bloqueado, onSwap, onRemove }) => (
  <li className="proto-q">
    <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
      <span className="t-sm" style={{ fontWeight: 600 }}>
        {step.label}
      </span>
      <span className="ask-hint t-2xs t-tertiary">
        {step.hint || (propio ? 'Paso tuyo' : '')}
        {step.link ? ' · admite un enlace para el cliente' : ''}
      </span>
    </span>

    <span className="row gap-1 shrink-0">
      {bloqueado ? (
        <span
          className="btn btn-icon"
          title="Este se marca solo cuando él lo entrega, así que es suyo siempre."
          aria-hidden="true"
        >
          <Lock size={14} />
        </span>
      ) : (
        <button
          type="button"
          className="btn btn-icon"
          onClick={onSwap}
          aria-label={`Cambiar de lado ${step.label}`}
          title="Cambiarlo de lado"
        >
          <ArrowLeftRight size={15} />
        </button>
      )}
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

const Lista = ({ titulo, sub, pasos, vacio, propio, onSwap, onRemove }) => (
  <div className="col gap-2">
    <span className="section-label">{titulo}</span>
    <p className="t-xs t-tertiary" style={{ marginTop: -4 }}>
      {sub}
    </p>

    {pasos.length === 0 ? (
      <p className="t-sm t-tertiary">{vacio}</p>
    ) : (
      <ul className="proto-list">
        {pasos.map((step) => (
          <StepRow
            key={step.id}
            step={step}
            propio={propio(step.id)}
            bloqueado={Boolean(step.auto)}
            onSwap={() => onSwap(step)}
            onRemove={() => onRemove(step)}
          />
        ))}
      </ul>
    )}
  </div>
);

export const IntakeSteps = ({ intake, onChange }) => {
  const [draft, setDraft] = useState('');

  const activos = intakeSteps(intake);
  const suyos = clientSteps(intake);
  const tuyos = coachSteps(intake);

  const disponibles = INTAKE_CATALOG.filter((s) => !intake.steps.includes(s.id));
  const pendientesDelCliente = disponibles.filter((s) => s.owner === 'client');
  const propio = (id) => intake.custom.some((s) => s.id === id);

  const quitar = (step) =>
    onChange(propio(step.id) ? removeCustomStep(intake, step.id) : toggleStep(intake, step.id));

  const cambiarLado = (step, destino) => onChange(setStepOwner(intake, step.id, destino));

  const addPropio = () => {
    const next = addCustomStep(intake, newId('paso'), draft);
    if (next === intake) return;
    onChange(next);
    setDraft('');
  };

  return (
    <Panel className="col gap-5">
      {/*
        El atajo para montar el circuito entero de una vez. Las tres entregas
        están en la lista de disponibles, entre otras siete, y reconocerlas una a
        una son tres búsquedas para una sola decisión: «que me lo mande él».
      */}
      {suyos.length === 0 && pendientesDelCliente.length > 0 && (
        <Notice
          tone="info"
          action={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() =>
                onChange(
                  pendientesDelCliente.reduce((acc, step) => toggleStep(acc, step.id), intake)
                )
              }
            >
              <Plus size={14} /> Pedírselo
            </button>
          }
        >
          No le pides nada a él: tu alta son solo pasos tuyos. Lo habitual es que te entregue el
          cuestionario, las fotos de su gimnasio y un primer check-in — y con eso ya puedes montarle
          el plan.
        </Notice>
      )}

      {activos.length === 0 ? (
        <p className="t-sm t-tertiary">
          Sin pasos: al dar de alta a un cliente no se te pedirá nada y no aparecerá ningún aviso.
          Es una respuesta válida.
        </p>
      ) : (
        <>
          <Lista
            titulo="Te lo entrega él"
            sub="Le sale como tareas en su portal. Se marcan solas en cuanto las entrega."
            pasos={suyos}
            vacio="Nada todavía. Lo que muevas aquí le aparecerá a él."
            propio={propio}
            onSwap={(step) => cambiarLado(step, 'coach')}
            onRemove={quitar}
          />

          <Lista
            titulo="Lo haces tú"
            sub="Con lo que te ha entregado. Solo lo ves tú, en su ficha, y lo marcas a mano."
            pasos={tuyos}
            vacio="Nada todavía: todo lo del alta lo entrega él."
            propio={propio}
            onSwap={(step) => cambiarLado(step, 'client')}
            onRemove={quitar}
          />
        </>
      )}

      {disponibles.length > 0 && (
        <Field
          label="Añadir uno de estos"
          hint="Los tres primeros se marcan solos: la aplicación sabe cuándo están hechos."
        >
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
          hint="Lo que tú haces y no está en la lista. Después puedes pasarlo a lo que entrega él."
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
