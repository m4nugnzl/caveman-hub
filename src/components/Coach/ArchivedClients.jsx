import { Archive, ArchiveRestore } from 'lucide-react';

import { useActions, useData } from '@/context/AppContext';
import { Panel, SectionTitle } from '@/components/ui/primitives';

/**
 * Los que terminaron. Se recuperan desde aquí y siguen enteros.
 *
 * Va al final de la pantalla y no arriba: es un archivo, no una bandeja. Se entra
 * a buscar algo concreto, no se pasa por aquí todos los días.
 */
export const ArchivedClients = () => {
  const { archivedClients } = useData();
  const { setClientArchived } = useActions();

  if (archivedClients.length === 0) return null;

  return (
    <Panel className="col gap-3">
      <SectionTitle icon={Archive}>Archivados · {archivedClients.length}</SectionTitle>
      <p className="t-sm t-secondary">
        No aparecen en la lista ni cuentan para tu plan. Su rutina, sus medidas y sus fotos siguen
        guardadas: si vuelven, vuelven con su historial.
      </p>

      <div className="col gap-2">
        {archivedClients.map((client) => (
          <div key={client.id} className="card-inset row between wrap gap-2">
            <div className="col gap-1">
              <strong className="t-sm">{client.name}</strong>
              <span className="t-xs t-tertiary">{client.email || 'Sin email'}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setClientArchived(client.id, false)}
            >
              <ArchiveRestore size={14} /> Recuperar
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
};
