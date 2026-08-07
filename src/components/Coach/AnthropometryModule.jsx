import { useApp } from '@/context/AppContext';
import { Notice } from '@/components/ui/primitives';
import { AnthropometryPanel } from '@/components/anthropometry/AnthropometryPanel';

/**
 * Vista del entrenador sobre la antropometría del cliente activo.
 *
 * Es el MISMO panel que usa el cliente. Quien registra las medidas es él —así
 * lo pidió el producto— pero el entrenador conserva la posibilidad de añadir y
 * corregir registros, porque los pliegues se miden a veces en persona.
 */
export const AnthropometryModule = () => {
  const {
    activeClient,
    anthropometry,
    nutrition,
    addAnthropometryLog,
    removeAnthropometryLog,
    saveStatus,
    retrySave,
  } = useApp();

  return (
    <div className="stack">
      <Notice tone="info">
        El seguimiento lo lleva el cliente desde su portal: el peso es obligatorio en cada revisión y
        los pliegues y perímetros son opcionales. Desde aquí puedes añadir o corregir registros.
      </Notice>

      <AnthropometryPanel
        client={activeClient}
        anthropometry={anthropometry[activeClient.id]}
        nutritionPlan={nutrition[activeClient.id]}
        audience="coach"
        save={saveStatus('anthro', activeClient.id)}
        onRetry={() => retrySave('anthro', activeClient.id)}
        onAdd={(log) => addAnthropometryLog(activeClient.id, log)}
        onRemove={(logId) => removeAnthropometryLog(activeClient.id, logId)}
      />
    </div>
  );
};
