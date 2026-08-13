import { useState } from 'react';
import { Copy, Dumbbell, Salad } from 'lucide-react';

import { unitLabelPlural } from '@/domain/training';
import { Field, Notice, Panel } from '@/components/ui/primitives';
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
  onReplicate,
  onClose,
}) => {
  const confirm = useConfirm();
  const [sourceId, setSourceId] = useState('');
  const [training, setTraining] = useState(true);
  const [diet, setDiet] = useState(false);
  const [result, setResult] = useState(null);

  const others = clients.filter((c) => c.id !== activeClient.id);
  const source = others.find((c) => c.id === sourceId) || null;
  const nothingSelected = !training && !diet;

  const handleCopy = async () => {
    if (!source || nothingSelected) return;

    const parts = [training && 'el programa de entrenamiento', diet && 'el plan nutricional']
      .filter(Boolean)
      .join(' y ');

    const overwrites = [training && hasProgram && 'su programa actual', diet && hasDiet && 'su dieta actual']
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

    const done = await onReplicate(sourceId, { training, diet });
    const copied = [done.training && 'entrenamiento', done.diet && 'dieta'].filter(Boolean);

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

        <Field label="Qué se copia">
          <div className="col gap-2">
            <label className="checkbox-row">
              <input type="checkbox" checked={training} onChange={(e) => setTraining(e.target.checked)} />
              <Dumbbell size={13} />
              Entrenamiento
              <span className="t-xs t-tertiary">
                (estructura semanal, {weekCount} {unitLabelPlural(cycleType)} y tipo de ciclo)
              </span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={diet} onChange={(e) => setDiet(e.target.checked)} />
              <Salad size={13} />
              Dieta
              <span className="t-xs t-tertiary">(objetivo, macros, menú y hábitos)</span>
            </label>
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
