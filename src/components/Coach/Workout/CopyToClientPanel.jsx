import { useState } from 'react';
import { Copy, Dumbbell, Salad, Waves } from 'lucide-react';

import { unitLabelPlural } from '@/domain/training';
import { Field, Notice, OptionCard, Panel } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';

/**
 * Réplica de un cliente a otro.
 *
 * Antes solo copiaba días o semanas del entrenamiento, y dejaba fuera la
 * estructura semanal y el tipo de ciclo — así que el programa llegaba a medias:
 * los días existían pero no la planificación de la semana. Y no había forma de
 * traerse la dieta, que es la otra mitad del trabajo cuando montas a un cliente
 * nuevo como otro que ya tienes.
 *
 * Ahora se elige **entrenamiento, dieta o las dos cosas**. Copiar SUSTITUYE lo
 * que el destino tuviera de esos bloques, así que la confirmación lo dice
 * explícitamente antes de tocar nada.
 */
export const CopyToClientPanel = ({
  clients,
  activeClient,
  cycleType,
  weekCount,
  hasProgram,
  hasDiet,
  hasWarmup,
  onReplicate,
  onClose,
}) => {
  const confirm = useConfirm();
  const [sourceId, setSourceId] = useState('');
  /*
    ══ Nada viene marcado ═════════════════════════════════════════════════════

    Copiar SUSTITUYE lo que el destino tuviera, así que llegar con una casilla ya
    puesta es llegar armado: basta con elegir de quién y pulsar para reemplazar
    doce semanas de programa sin haber decidido nada.

    Y era además lo que rompía la movilidad: «Entrenamiento» venía marcado y la
    casilla del calentamiento estaba `disabled` mientras lo estuviera, así que
    NACÍA BLOQUEADA. Para poder pulsarla había que descubrir primero que hay que
    desmarcar la de arriba, cosa que no dice nadie.
  */
  const [training, setTraining] = useState(false);
  const [warmup, setWarmup] = useState(false);
  const [diet, setDiet] = useState(false);
  const [result, setResult] = useState(null);

  const others = clients.filter((c) => c.id !== activeClient.id);
  const source = others.find((c) => c.id === sourceId) || null;
  const nothingSelected = !training && !diet && !warmup;

  const handleCopy = async () => {
    if (!source || nothingSelected) return;

    const parts = [
      training && 'el programa de entrenamiento',
      !training && warmup && 'el calentamiento',
      diet && 'el plan nutricional',
    ]
      .filter(Boolean)
      .join(' y ');

    /*
      Qué se pierde, dicho antes de tocar nada. El calentamiento solo aparece
      aquí cuando va SUELTO: dentro de «entrenamiento» ya está incluido en «su
      programa actual», y nombrarlo dos veces haría dudar de si son dos cosas.
    */
    const overwrites = [
      training && hasProgram && 'su programa actual',
      !training && warmup && hasWarmup && 'su calentamiento actual',
      diet && hasDiet && 'su dieta actual',
    ]
      .filter(Boolean)
      .join(' y ');

    const ok = await confirm({
      title: `¿Copiar de ${source.name}?`,
      message: `Se traerá ${parts} de ${source.name} a ${activeClient.name}.`,
      detail: overwrites
        ? `Atención: esto SUSTITUYE ${overwrites}. No se puede deshacer.`
        : `${activeClient.name} no tiene nada configurado en esos bloques, así que no se sobrescribe nada.`,
      confirmLabel: 'Copiar',
      tone: overwrites ? 'danger' : 'default',
    });
    if (!ok) return;

    const done = await onReplicate(sourceId, { training, diet, warmup });
    const copied = [
      done.training && 'entrenamiento',
      done.warmup && 'calentamiento',
      done.diet && 'dieta',
    ].filter(Boolean);

    setResult(
      copied.length > 0
        ? { tone: 'success', text: `Copiado de ${source.name}: ${copied.join(' y ')}.` }
        : { tone: 'warn', text: `${source.name} no tiene datos en los bloques seleccionados.` }
    );
  };

  if (others.length === 0) {
    return (
      <Panel tight>
        <Notice tone="info">Necesitas al menos dos clientes para copiar entre ellos.</Notice>
      </Panel>
    );
  }

  return (
    <Panel tight className="col gap-4">
      {result && <Notice tone={result.tone}>{result.text}</Notice>}

      <div className="row-end wrap gap-4">
        <Field label="Copiar desde" hint="El cliente que ya tiene lo que quieres replicar">
          {(props) => (
            <select
              {...props}
              className="select"
              style={{ minWidth: 200 }}
              value={sourceId}
              onChange={(e) => {
                setSourceId(e.target.value);
                setResult(null);
              }}
            >
              <option value="">Selecciona cliente…</option>
              {others.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/*
          ══ Por qué esto ya no son tres tics ═══════════════════════════════════

          Eran tres casillas del sistema operativo con una frase al lado, y la
          primera sustituye doce semanas de programa de otra persona. Un control
          de 16 px, idéntico al de «acepto las condiciones», para una operación
          irreversible.

          Ahora cada una es una tarjeta con su icono, su nombre y qué se lleva
          exactamente. La consecuencia se lee antes de marcarla, no después en el
          diálogo de confirmación.
        */}
        <Field label="Qué se copia">
          <div className="opt-group">
            <OptionCard
              icon={Dumbbell}
              label="Entrenamiento"
              hint={`Estructura semanal, ${weekCount} ${unitLabelPlural(cycleType)}, tipo de ciclo y su calentamiento.`}
              checked={training}
              onChange={setTraining}
            />
            {/*
              ══ El calentamiento, suelto y SIEMPRE pulsable ══════════════════

              Va aparte de «Entrenamiento» porque es lo que MÁS se repite entre
              clientes —la misma pauta articular para media cartera— mientras que
              el programa es lo que menos. Mezclarlos obligaba a sustituir doce
              semanas de trabajo para traerse cuatro estiramientos.

              Y ya no se desactiva. Estaba `disabled` mientras «Entrenamiento»
              estuviera marcado —que era siempre, porque venía marcado de
              serie—, así que en la práctica no se podía pulsar nunca. La
              redundancia se DICE, que es lo que hacía falta; no se prohíbe.
            */}
            <OptionCard
              icon={Waves}
              label="Calentamiento y movilidad"
              hint={
                training
                  ? 'Ya va incluido con el entrenamiento.'
                  : 'Solo la pauta previa a entrenar, sin tocar su programa.'
              }
              checked={warmup || training}
              onChange={setWarmup}
            />
            <OptionCard
              icon={Salad}
              label="Dieta"
              hint="Objetivo, macros, menú cerrado y tus pautas."
              checked={diet}
              onChange={setDiet}
            />
          </div>
        </Field>

        <div className="row gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCopy}
            disabled={!sourceId || nothingSelected}
          >
            <Copy size={15} /> Copiar
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      <p className="t-xs t-tertiary">
        No se copian las sesiones registradas: son el registro de lo que ejecutó otra persona y no tienen
        sentido en esta ficha.
      </p>
    </Panel>
  );
};
