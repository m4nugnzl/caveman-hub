import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, RotateCcw, Users, X } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  CHECKIN_BLOCKS,
  CHECKIN_MODES,
  MAX_CUSTOM,
  MODULES,
  PROTOCOL_PRESETS,
  SESSION_QUESTIONS,
  activeQuestions,
  addCustomQuestion,
  checkinMode,
  clientProtocol,
  isModuleOn,
  matchingPreset,
  moveQuestion,
  removeCustomQuestion,
  setCheckinMode,
  toggleModule,
  toggleQuestion,
} from '@/domain/protocol';
import { clientIntake, intakeToPreferences } from '@/domain/intake';
import {
  applyIntakeTemplate,
  clearLocalIntakeTemplate,
  defaultIntake,
  intakeTemplateFrom,
  intakeTemplateToPreferences,
  readLocalIntakeTemplate,
} from '@/lib/intakeTemplate';
import {
  clearLocalTemplate,
  defaultProtocol,
  matchesTemplate,
  readLocalTemplate,
  templateFrom,
} from '@/lib/protocolTemplate';
import { Field, Notice, Panel, SegmentedControl, TextInput } from '@/components/ui/primitives';
import { IntakeSteps } from './IntakeSteps';

/**
 * Ajustes → Protocolo: el entrenador diseña su aplicación.
 *
 * ══ La decisión de estructura ═══════════════════════════════════════════════
 *
 * Un solo editor con un SELECTOR DE DESTINO arriba, y no dos pantallas.
 *
 * El protocolo se guarda por cliente (`clients.preferences.protocol`), pero se
 * piensa una vez para toda la cartera. Eso deja dos necesidades —«mi forma de
 * trabajar» y «con este cliente hago una excepción»— que son la MISMA operación
 * sobre distinto destino. Construirlas como dos pantallas significaría dos
 * copias del mismo editor que acabarían divergiendo; con un selector, lo que
 * cambia es a quién se le escribe.
 *
 * ── La plantilla vive en el navegador ───────────────────────────────────────
 * No hay tabla de ajustes del entrenador en el esquema, así que la plantilla se
 * guarda localmente (ver `lib/protocolTemplate.js`). Lo que sí está en la base de
 * datos es el protocolo ya aplicado a cada cliente: se puede perder la plantilla,
 * nunca lo que tus clientes tienen puesto. El aviso lo dice en la pantalla, no
 * solo en el código.
 */

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

export const ProtocolPanel = () => {
  const { session, clients, updateClientPreferences, coachPrefs, coachPrefsReady, updateCoachPreferences } =
    useApp();
  const userId = session?.user?.id;

  /** `null` = la plantilla; si no, el id del cliente que se está editando. */
  const [target, setTarget] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [draft, setDraft] = useState({ label: '', max: '10', lowerIsBetter: false });

  /*
    ══ Las plantillas ya no viven en el navegador ═════════════════════════════

    Están en `profiles.preferences` (0035), así que le siguen al entrenador de un
    ordenador a otro. Antes eran `localStorage` y se perdían al cambiar de
    máquina o al limpiar el navegador — con el agravante de que no se perdía un
    ajuste, se perdía su forma de trabajar.

    No hay estado local que mantener: la plantilla ES lo que hay en `coachPrefs`,
    y `updateCoachPreferences` ya lo actualiza de forma optimista, así que el
    cambio se ve al instante igual que antes. Duplicarlo en un `useState` sería
    la segunda copia de una verdad que ya tiene dueño.
  */
  const template = templateFrom(coachPrefs) || defaultProtocol();
  const intakeTemplate = intakeTemplateFrom(coachPrefs) || defaultIntake();

  /*
    ── El rescate de la que quedara en el navegador ────────────────────────────
    Una sola vez, y solo si el servidor no tiene ninguna: quien ya había
    configurado su plantilla no puede notar la mudanza. Se espera a que las
    preferencias estén LEÍDAS —no basta con que estén vacías— porque si no, en el
    primer render de cada arranque parecerían vacías y se subiría lo de siempre
    encima de lo suyo.
  */
  useEffect(() => {
    if (!coachPrefsReady || !userId) return;

    if (!templateFrom(coachPrefs)) {
      const local = readLocalTemplate(userId);
      if (local) {
        updateCoachPreferences('protocolTemplate', local);
        clearLocalTemplate(userId);
      }
    }
    if (!intakeTemplateFrom(coachPrefs)) {
      const local = readLocalIntakeTemplate(userId);
      if (local) {
        updateCoachPreferences('intakeTemplate', intakeTemplateToPreferences(local));
        clearLocalIntakeTemplate(userId);
      }
    }
  }, [coachPrefsReady, coachPrefs, userId, updateCoachPreferences]);

  const client = target ? clients.find((c) => c.id === target) : null;
  const protocol = client ? clientProtocol(client.preferences) : template;

  /*
    Los pasos del alta van por su propio carril. Comparten el selector de destino
    —se configuran para la plantilla o para un cliente, igual que el protocolo—
    pero NO comparten almacenamiento: `clientProtocol()` sanea y descarta lo que
    no conoce, así que colgarlos de `protocol` los borraría en el primer cambio
    que se hiciera aquí arriba.
  */
  const intake = client ? clientIntake(client.preferences) : intakeTemplate;

  /*
    Guardar es lo mismo con dos destinos: el cliente elegido o la plantilla. El
    fallo del servidor SÍ se enseña —antes solo se avisaba de que el navegador no
    dejaba escribir— porque ahora es una escritura de red y puede fallar por estar
    sin conexión, que es un caso frecuente y silencioso.
  */
  const saveIntake = async (next) => {
    setFeedback(null);
    if (client) {
      updateClientPreferences(client.id, 'intake', intakeToPreferences(next));
      return;
    }
    const res = await updateCoachPreferences('intakeTemplate', intakeTemplateToPreferences(next));
    if (!res?.ok) {
      setFeedback({ tone: 'error', text: `No se ha podido guardar tu plantilla: ${res?.error || ''}` });
    }
  };

  const save = async (next) => {
    setFeedback(null);
    if (client) {
      updateClientPreferences(client.id, 'protocol', next);
      return;
    }
    const res = await updateCoachPreferences('protocolTemplate', next);
    if (!res?.ok) {
      setFeedback({ tone: 'error', text: `No se ha podido guardar tu plantilla: ${res?.error || ''}` });
    }
  };

  const questions = useMemo(() => activeQuestions(protocol), [protocol]);
  const available = useMemo(
    () => SESSION_QUESTIONS.filter((q) => !protocol.questions.includes(q.id)),
    [protocol.questions]
  );

  const preset = matchingPreset(protocol);

  /* Cuántos clientes NO tienen puesta la plantilla. Es el número que dice si
     «aplicar a todos» va a cambiar algo, y evita el botón que no hace nada. */
  const drifted = useMemo(
    () =>
      clients.filter((c) => {
        if (!matchesTemplate(template, clientProtocol(c.preferences))) return true;
        /* Los pasos del alta cuentan para el desvío. Sin esto, cambiar solo los
           pasos dejaba «Aplicar a todos» apagado y no había forma de empujarlos. */
        const suyo = clientIntake(c.preferences);
        return (
          suyo.steps.join() !== intakeTemplate.steps.join() ||
          JSON.stringify(suyo.custom) !== JSON.stringify(intakeTemplate.custom)
        );
      }).length,
    [clients, template, intakeTemplate]
  );

  const applyToAll = () => {
    clients.forEach((c) => {
      updateClientPreferences(c.id, 'protocol', template);
      /* La plantilla decide QUÉ pasos hay; cada cliente conserva por cuáles va y
         qué tiene enlazado. Sobrescribirlo entero borraría los vídeos que se han
         ido pegando cliente a cliente, que es el trabajo que no se puede rehacer. */
      updateClientPreferences(
        c.id,
        'intake',
        intakeToPreferences(applyIntakeTemplate(intakeTemplate, c.preferences))
      );
    });
    setFeedback({
      tone: 'success',
      text: `Aplicado a ${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'}.`,
    });
  };

  const addCustom = () => {
    const next = addCustomQuestion(protocol, {
      label: draft.label,
      max: Number(draft.max) || 10,
      lowerIsBetter: draft.lowerIsBetter,
    });
    if (next === protocol) return;
    save(next);
    setDraft({ label: '', max: '10', lowerIsBetter: false });
  };

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Protocolo</h2>
          <p>Qué le pides a tus clientes y qué ve cada uno en su aplicación.</p>
        </div>
      </div>

      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

      {/* ── A quién se le está escribiendo ──────────────────────────────── */}
      <Panel tight className="col gap-3">
        <Field
          label="Estás configurando"
          hint={
            client
              ? 'Una excepción para este cliente. No cambia tu plantilla ni al resto.'
              : 'Tu forma de trabajar. Se usa para los clientes nuevos y puedes aplicarla a los que ya tienes.'
          }
        >
          <div className="rail-wrap" role="group" aria-label="A quién se aplica">
            <button
              type="button"
              className="chip"
              aria-pressed={target === null}
              onClick={() => setTarget(null)}
            >
              Mi plantilla
            </button>
            {clients.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                aria-pressed={target === c.id}
                onClick={() => setTarget(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </Field>

        {client ? (
          <div className="row between wrap gap-2">
            <span className="t-xs t-tertiary">
              {matchesTemplate(template, protocol)
                ? 'Ahora mismo es igual que tu plantilla.'
                : 'Este cliente tiene una configuración propia.'}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => save(template)}
              disabled={matchesTemplate(template, protocol)}
            >
              <RotateCcw size={14} /> Igualar a mi plantilla
            </button>
          </div>
        ) : (
          <div className="row between wrap gap-2">
            <span className="t-xs t-tertiary">
              {clients.length === 0
                ? 'Todavía no tienes clientes a los que aplicarla.'
                : drifted === 0
                  ? 'Todos tus clientes tienen esta configuración.'
                  : `${drifted} ${drifted === 1 ? 'cliente no la tiene' : 'clientes no la tienen'}.`}
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={applyToAll}
              disabled={clients.length === 0 || drifted === 0}
            >
              <Users size={14} /> Aplicar a todos
            </button>
          </div>
        )}
      </Panel>

      {/* ── El alta ──────────────────────────────────────────────────────────
          Va la primera porque es lo primero que pasa: los pasos del alta se dan
          antes de que exista una sesión que puntuar. */}
      <IntakeSteps intake={intake} onChange={saveIntake} forClient={Boolean(client)} />

      {/* ── Perfiles ─────────────────────────────────────────────────────── */}
      <Panel className="col gap-3">
        <div>
          <span className="section-title">Empieza por un perfil</span>
          <p className="t-sm t-secondary">
            Cada uno responde a una forma de llevar clientes. Debajo puedes afinar lo que quieras.
          </p>
        </div>

        <div className="proto-presets">
          {PROTOCOL_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="proto-preset"
              aria-pressed={preset?.id === item.id}
              onClick={() => save({ ...protocol, ...item.protocol })}
            >
              <span className="nm">{item.label}</span>
              <span className="hint">{item.hint}</span>
            </button>
          ))}
        </div>
      </Panel>

      {/* ── Módulos ──────────────────────────────────────────────────────── */}
      <Panel className="col gap-3">
        <div>
          <span className="section-title">Qué existe en la aplicación</span>
          <p className="t-sm t-secondary">
            Lo que esté apagado no aparece: ni tú lo ves al programar, ni tu cliente al entrenar.
          </p>
        </div>

        <ul className="proto-modules">
          {MODULES.map((mod) => {
            const on = isModuleOn(protocol, mod.id);
            return (
              <li className={`proto-module${on ? ' is-on' : ''}`} key={mod.id}>
                <label className="checkbox-row">
                  <input type="checkbox" checked={on} onChange={() => save(toggleModule(protocol, mod.id))} />
                  <span className="col" style={{ gap: 1 }}>
                    <span className="t-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {mod.label}
                    </span>
                    <span className="t-xs t-tertiary">{mod.hint}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* ── Qué se mide en el check-in ───────────────────────────────────────
          Va justo detrás de los módulos porque es lo mismo —qué existe para este
          cliente— con una posición más: aquí se puede además EXIGIR. */}
      <Panel className="col gap-3">
        <div>
          <span className="section-title">Qué mide en cada check-in</span>
          <p className="t-sm t-secondary">
            El peso siempre se pide. Estos dos los decides tú: si los exiges, no podrá cerrar el
            check-in sin rellenarlos; apagados, ni le aparecen.
          </p>
        </div>

        <div className="col gap-3">
          {CHECKIN_BLOCKS.map((bloque) => (
            <div className="card-inset col gap-2" key={bloque.id}>
              <div className="col" style={{ gap: 1 }}>
                <span className="t-sm" style={{ fontWeight: 600 }}>
                  {bloque.label}
                </span>
                <span className="t-xs t-tertiary">{bloque.hint}</span>
              </div>

              <SegmentedControl
                value={checkinMode(protocol, bloque.id)}
                onChange={(modo) => save(setCheckinMode(protocol, bloque.id, modo))}
                options={CHECKIN_MODES.map((m) => ({ id: m.id, label: m.label }))}
                label={`Cómo se pide: ${bloque.label}`}
              />

              {/* Lo que significa el estado elegido, debajo y en una línea. Tres
                  palabras sueltas —«Obligatorio · Opcional · Apagado»— no dicen qué
                  cambia para el cliente, que es lo único que se está decidiendo. */}
              <span className="t-2xs t-tertiary">
                {CHECKIN_MODES.find((m) => m.id === checkinMode(protocol, bloque.id))?.hint}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Preguntas ────────────────────────────────────────────────────── */}
      <Panel className="col gap-4">
        <div>
          <span className="section-title">Qué le preguntas al terminar de entrenar</span>
          <p className="t-sm t-secondary">
            El orden es el orden en que las contesta. Cada pregunta de escala se convierte en una
            serie que puedes seguir en su panel; las de texto no se pueden medir.
          </p>
        </div>

        {!isModuleOn(protocol, 'sessionFeedback') && (
          <Notice tone="info">
            El módulo de feedback está apagado, así que estas preguntas no se le harán. Enciéndelo
            arriba para que aparezcan.
          </Notice>
        )}

        {questions.length === 0 ? (
          <p className="t-sm t-secondary">No hay ninguna pregunta activa.</p>
        ) : (
          <ul className="proto-list">
            {questions.map((question, index) => (
              <QuestionRow
                key={question.id}
                question={question}
                index={index}
                total={questions.length}
                onMove={(dir) => save(moveQuestion(protocol, question.id, dir))}
                onRemove={() => save(toggleQuestion(protocol, question.id))}
                canDelete={Boolean((protocol.custom || []).find((q) => q.id === question.id))}
                onDelete={() => save(removeCustomQuestion(protocol, question.id))}
              />
            ))}
          </ul>
        )}

        {available.length > 0 && (
          <div className="col gap-2">
            <span className="section-label">Añadir del catálogo</span>
            <div className="rail-wrap">
              {available.map((question) => (
                <button
                  key={question.id}
                  type="button"
                  className="chip chip-dashed"
                  onClick={() => save(toggleQuestion(protocol, question.id))}
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
            Tu propia pregunta ({(protocol.custom || []).length}/{MAX_CUSTOM})
          </span>

          {(protocol.custom || []).length >= MAX_CUSTOM ? (
            <p className="t-xs t-tertiary">
              Has llegado al máximo. El tope existe porque toda la configuración de un cliente
              comparte una columna acotada a 8 KB.
            </p>
          ) : (
            <div className="row-end wrap gap-2">
              <Field label="Qué quieres preguntar" className="grow">
                {(props) => (
                  <TextInput
                    {...props}
                    value={draft.label}
                    onChange={(v) => setDraft({ ...draft, label: v })}
                    placeholder="Molestia en el hombro"
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

      <p className="t-xs t-tertiary">
        Tu plantilla se guarda en este navegador, así que no te sigue a otro ordenador. Lo que sí
        está a salvo es el protocolo ya aplicado a cada cliente, que vive en la base de datos.
      </p>
    </div>
  );
};
