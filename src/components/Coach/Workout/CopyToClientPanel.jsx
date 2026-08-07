import { useState } from 'react';
import { Copy } from 'lucide-react';

import { unitLabel, unitLabelPlural } from '@/domain/training';
import { Field, Notice, Panel, SegmentedControl } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';

/**
 * Copia un día, una semana o el programa completo a otro cliente.
 *
 * Muchos clientes llevan rutinas muy parecidas, así que esto ahorra reescribir
 * a mano. Copiar SIEMPRE añade al final del programa destino: nunca sustituye
 * lo que el otro cliente ya tuviera.
 */
export const CopyToClientPanel = ({
  clients,
  activeClient,
  cycleType,
  dayName,
  weekCount,
  onCopyDay,
  onCopyWeek,
  onCopyProgram,
  onClose,
}) => {
  const confirm = useConfirm();
  const [targetId, setTargetId] = useState('');
  const [scope, setScope] = useState('day');
  const [result, setResult] = useState(null);

  const unit = unitLabel(cycleType);
  const others = clients.filter((c) => c.id !== activeClient.id);

  const scopeOptions = [
    ...(dayName ? [{ id: 'day', label: `Solo «${dayName}»` }] : []),
    { id: 'week', label: `${unit} completa` },
    { id: 'program', label: `Programa entero (${weekCount} ${unitLabelPlural(cycleType)})` },
  ];

  const handleCopy = async () => {
    const target = others.find((c) => c.id === targetId);
    if (!target) return;

    const ok = await confirm({
      title: `¿Copiar a ${target.name}?`,
      message:
        scope === 'program'
          ? `Se añadirán ${weekCount} ${unitLabelPlural(cycleType)} al final del programa de ${target.name}.`
          : `Se añadirá al programa de ${target.name}, sin borrar nada de lo que ya tenga.`,
      confirmLabel: 'Copiar',
    });
    if (!ok) return;

    const copied =
      scope === 'program'
        ? onCopyProgram(targetId)
        : scope === 'week'
          ? onCopyWeek(targetId)
          : onCopyDay(targetId);

    setResult(
      copied
        ? { tone: 'success', text: `Copiado a ${target.name}.` }
        : { tone: 'error', text: 'No había nada que copiar.' }
    );
    if (copied) setTargetId('');
  };

  if (others.length === 0) {
    return (
      <Panel tight>
        <Notice tone="info">
          Necesitas al menos dos clientes para poder copiar rutinas entre ellos.
        </Notice>
      </Panel>
    );
  }

  return (
    <Panel tight className="col gap-4">
      {result && <Notice tone={result.tone}>{result.text}</Notice>}

      <div className="row-end wrap gap-4">
        <Field label="Cliente destino">
          {(props) => (
            <select
              {...props}
              className="select"
              style={{ minWidth: 190 }}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
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

        <Field label="Qué copiar">
          <SegmentedControl value={scope} onChange={setScope} options={scopeOptions} label="Qué copiar" />
        </Field>

        <div className="row gap-2">
          <button type="button" className="btn btn-primary" onClick={handleCopy} disabled={!targetId}>
            <Copy size={15} /> Copiar
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </Panel>
  );
};
