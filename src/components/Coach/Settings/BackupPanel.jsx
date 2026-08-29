import { useState } from 'react';
import { Download, HardDriveDownload, ShieldAlert, Wand2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { Notice, PageHead, Panel } from '@/components/ui/primitives';

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
  /*
    La lista COMPLETA, con los archivados: una copia de seguridad que se dejara
    fuera a los que terminaron sería justo lo contrario de lo que promete. El
    volcado ya los incluye —lee el estado entero—, así que la cifra que se enseña
    tiene que contarlos también o diría menos clientes de los que trae el archivo.
  */
  const { allClients: clients, exportAllData } = useApp();
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
      <PageHead title="Copia de seguridad" sub="Llévate todo lo que guarda la aplicación, por si acaso." />

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
            <ShieldAlert size={12} className="icon-inline" />Lo que esta copia no hace
          </span>
          <ul className="col gap-1 t-xs t-secondary" style={{ paddingLeft: '1.1em' }}>
            <li>
              <strong>No es automática.</strong> Se descarga cuando pulsas el botón. Ponte un
              recordatorio: una copia de hace seis meses recupera muy poco.
            </li>
            <li>
              <strong>No incluye las fotos</strong>, solo la lista de cuáles hay y de qué semana
              son. Si necesitas los archivos, escríbenos desde Ajustes → Ayuda.
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

      <NormalizePanel />
    </div>
  );
};

/**
 * Normalizar los registros antiguos.
 *
 * ══ Qué arregla ════════════════════════════════════════════════════════════
 *
 * Antes los kilos se anotaban dentro del PLAN, sin fecha propia. Esos registros se
 * siguen viendo, pero fechados con la del microciclo en lugar de con el día en que
 * se entrenó —así que la progresión sale movida— y, peor, **desaparecen de la
 * analítica en cuanto ese mismo día tiene una sesión de verdad**, sin ningún aviso.
 *
 * Esto los convierte en sesiones con fecha, de una vez.
 *
 * ══ Por qué vive junto a la copia de seguridad ═════════════════════════════
 *
 * Porque es la única operación de la aplicación que reescribe el programa de
 * TODOS los clientes a la vez, y lo primero que hay que hacer antes de tocarla es
 * bajarse la copia que está justo encima. Ponerla en otra pantalla sería separarla
 * de su red de seguridad.
 *
 * Ensaya antes de escribir: el primer botón cuenta lo que haría y no toca nada.
 */
const NormalizePanel = () => {
  const { normalizeLegacySessions, legacyPending } = useApp();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [done, setDone] = useState(false);

  const run = async (apply) => {
    setBusy(true);
    const result = await normalizeLegacySessions({ apply });
    setBusy(false);
    setReport(result);
    setDone(apply);
  };

  const nada = report && report.converted === 0;

  return (
    <Panel className="col gap-4">
      <div className="row gap-3">
        <span className="day-icon">
          <Wand2 size={18} />
        </span>
        <div className="col gap-1">
          <span className="section-title">Normalizar registros antiguos</span>
          <p className="t-sm t-secondary">
            Los kilos que se anotaron dentro del plan, antes de que existieran las sesiones, no
            tienen fecha propia: llevan la del microciclo. Esto los convierte en sesiones con su
            fecha, sin cambiar ni un kilo.
          </p>
        </div>
      </div>

      {/*
        Lo dice la carga: mientras quede un solo cliente con registros antiguos,
        el arranque sigue descargando el programa completo de toda la cartera. Sin
        este aviso, la mejora de velocidad no llega y no hay forma de saber por qué.
      */}
      {legacyPending && !done && (
        <Notice tone="warn">
          Te quedan registros del formato antiguo. Mientras existan, la aplicación descarga al
          arrancar el programa completo de todos tus clientes en lugar de un resumen.
        </Notice>
      )}

      {report && (
        <Notice tone={done ? (report.failed.length > 0 ? 'warn' : 'success') : 'info'}>
          {nada
            ? 'No hay ningún registro antiguo que convertir. Tus datos ya están normalizados.'
            : done
              ? `Convertidos ${report.converted} en ${report.clients} ${report.clients === 1 ? 'cliente' : 'clientes'}.`
              : `Se convertirían ${report.converted} registros en ${report.clients} ${report.clients === 1 ? 'cliente' : 'clientes'}. No se ha escrito nada todavía.`}
          {report.skipped > 0 &&
            ` ${report.skipped} se quedan como están: su microciclo no tiene fecha, así que la sesión no sabría de qué día es.`}
        </Notice>
      )}

      {report?.failed.length > 0 && (
        <Notice tone="error">
          No se pudo guardar en: {report.failed.join(' · ')}. Vuelve a lanzarlo; lo que ya se
          convirtió no se repite.
        </Notice>
      )}

      <div className="row wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => run(false)} disabled={busy}>
          {busy && !done ? 'Contando…' : 'Ver qué cambiaría'}
        </button>

        {/* Escribir solo se ofrece después de haber ensayado y cuando hay algo que
            hacer: un botón que reescribe la cartera entera no debe poder pulsarse
            sin haber visto antes la cifra. */}
        {report && !nada && !done && (
          <button type="button" className="btn btn-danger" onClick={() => run(true)} disabled={busy}>
            {busy ? 'Convirtiendo…' : `Convertir ${report.converted}`}
          </button>
        )}
      </div>

      <p className="t-xs t-tertiary">
        Descarga la copia de arriba antes de convertir. Es una operación que no se deshace.
      </p>
    </Panel>
  );
};
