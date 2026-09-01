import { FileDown } from 'lucide-react';

import { useData } from '@/context/AppContext';
import { anamnesisFileName, buildAnamnesis } from '@/domain/anamnesis';
import { anamnesisHtml } from '@/lib/anamnesisDoc';

/**
 * Descargar la ficha de alguien como documento.
 *
 * ══ Por qué esto no es la exportación que ya existía ═══════════════════════
 *
 * `exportClientData` entrega un JSON con TODO —su rutina, sus pesajes, sus
 * fotos—: es la respuesta a «dame todo lo que guardas de mí», y cumple. Pero
 * nadie lee un JSON, así que como documento no vale para nada.
 *
 * Esto es lo contrario: una sola cosa —su anamnesis— escrita para que la lea una
 * persona. Es lo que se archiva, lo que se imprime y lo que se le enseña a un
 * fisioterapeuta cuando pregunta qué le pasa a esta rodilla.
 *
 * ══ Se descarga, no se abre en otra pestaña ════════════════════════════════
 *
 * Con `window.open` habría que pelearse con el bloqueador de ventanas, y lo que
 * se quiere es un ARCHIVO: algo que se guarda con su fecha en el nombre y se
 * puede volver a abrir dentro de dos años. Ctrl+P dentro lo convierte en PDF.
 *
 * El mismo camino que usa `ClientDataPanel` para su exportación: un Blob y un
 * enlace temporal. Sin servidor y sin que el archivo pase por ningún sitio —los
 * datos van de la memoria del navegador al disco y nada más, que en un documento
 * de salud es exactamente lo que hay que poder decir.
 */
export const DownloadAnamnesis = ({ client, label = 'Descargar su ficha', className = 'btn btn-secondary btn-sm' }) => {
  const { conditions, equipment, anthropometry } = useData();

  const descargar = () => {
    const doc = buildAnamnesis({
      client,
      conditions,
      equipment,
      history: anthropometry?.[client.id]?.history || [],
    });

    const blob = new Blob([anamnesisHtml(doc)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = anamnesisFileName(client);
    enlace.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button type="button" className={className} onClick={descargar}>
      <FileDown size={14} /> {label}
    </button>
  );
};
