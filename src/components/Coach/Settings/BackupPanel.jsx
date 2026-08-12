import { useState } from 'react';
import { Download, HardDriveDownload, ShieldAlert } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { Notice, Panel } from '@/components/ui/primitives';

/**
 * Copia de seguridad de la cartera.
 *
 * ══ Por qué hace falta habiendo Supabase detrás ═════════════════════════════
 *
 * Las copias de Supabase son de la base ENTERA y dependen del plan contratado.
 * No sirven para lo que de verdad pasa: «devuélveme el programa de Marta como
 * estaba el martes». Restaurar una copia completa para recuperar a un cliente
 * significa tirar el trabajo de los otros diecinueve.
 *
 * Y el modelo lo hace más grave: el trabajo de un año de cada cliente vive en
 * unas pocas filas jsonb que se reescriben enteras en cada guardado. Un UPDATE
 * mal hecho, un borrado por error o una pestaña vieja guardando encima se llevan
 * doce meses sin dejar rastro.
 *
 * Esto NO es un sistema de copias —no hay automatismo, ni cifrado, ni retención—
 * y la pantalla lo dice con esas palabras en vez de aparentar lo contrario. Es un
 * volcado que el entrenador se lleva, y con el que se puede reconstruir a mano.
 * Es poco. Es infinitamente más que nada, que es lo que había.
 */
export const BackupPanel = () => {
  const { clients, exportAllData } = useApp();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const download = async () => {
    setBusy(true);
    setFeedback(null);
    const result = await exportAllData();
    setBusy(false);

    if (!result.ok) {
      setFeedback({ tone: 'error', text: result.error });
      return;
    }

    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `caveman-copia-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);

    const size = Math.round(blob.size / 1024);
    setFeedback({
      tone: 'success',
      text: `Descargada: ${result.data._clientes} ${result.data._clientes === 1 ? 'cliente' : 'clientes'}, ${size} KB. Guárdala fuera de este ordenador.`,
    });
  };

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Copia de seguridad</h2>
          <p>Llévate todo lo que guarda la aplicación, por si acaso.</p>
        </div>
      </div>

      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

      <Panel className="col gap-4">
        <div className="row gap-3">
          <span className="day-icon">
            <HardDriveDownload size={18} />
          </span>
          <div className="col gap-1">
            <span className="section-title">Descargar toda la cartera</span>
            <p className="t-sm t-secondary">
              Un archivo con tus {clients.length}{' '}
              {clients.length === 1 ? 'cliente' : 'clientes'}: sus fichas, rutinas, historiales de
              peso y medidas, nutrición, check-ins y calendario.
            </p>
          </div>
        </div>

        <button type="button" className="btn btn-primary" onClick={download} disabled={busy || clients.length === 0}>
          <Download size={15} /> {busy ? 'Preparando…' : 'Descargar copia'}
        </button>

        {/*
          Lo que esto NO es, dicho antes de que alguien se confíe. Una pantalla que
          se llama «copia de seguridad» y no aclara sus límites es peor que no
          tenerla: hace creer que el problema está resuelto.
        */}
        <div className="card-inset col gap-2">
          <span className="section-label">
            <ShieldAlert size={12} /> Lo que esta copia no hace
          </span>
          <ul className="col gap-1 t-xs t-secondary" style={{ paddingLeft: '1.1em' }}>
            <li>
              <strong>No es automática.</strong> Se descarga cuando pulsas el botón. Ponte un
              recordatorio: una copia de hace seis meses recupera muy poco.
            </li>
            <li>
              <strong>No incluye las fotos</strong>, solo sus rutas en el almacenamiento. Las
              imágenes hay que bajarlas desde Supabase.
            </li>
            <li>
              <strong>No se restaura sola.</strong> Es un JSON legible con el que reconstruir a
              mano lo que haga falta.
            </li>
            <li>
              <strong>Contiene datos de salud.</strong> Fotos no, pero sí pesos, medidas y
              pliegues de personas concretas: guárdala cifrada y no la mandes por correo.
            </li>
          </ul>
        </div>
      </Panel>
    </div>
  );
};
