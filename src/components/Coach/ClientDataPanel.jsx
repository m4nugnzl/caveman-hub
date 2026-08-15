import { useState } from 'react';
import { Download, History, ShieldAlert, Trash2 } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import { clientConsent } from '@/domain/privacy';
import { shortDate } from '@/lib/dates';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Notice } from '@/components/ui/primitives';

/**
 * Los datos personales de un cliente: sacarlos y borrarlos.
 *
 * ══ Por qué esto no es una función de producto ══════════════════════════════
 *
 * La aplicación guarda fotos corporales, peso, pliegues cutáneos y perímetros.
 * Eso es categoría especial del RGPD, y con clientes reales en la UE tu cliente
 * tiene derecho a pedirte **todo lo que tienes de él** y a pedirte que lo
 * **borres**. Las dos cosas con plazo.
 *
 * Hasta ahora no existía ninguna de las dos, y la segunda ni siquiera era
 * posible: las tablas de bloque apuntan a `clients` sin cascada, así que borrar
 * la ficha fallaba por clave foránea — y sus fotos se quedaban en el bucket para
 * siempre, que es exactamente lo que no puede pasar.
 *
 * ── Por qué el borrado pide escribir el nombre ──────────────────────────────
 * No es fricción decorativa. Es la única acción de toda la aplicación que
 * destruye datos que no se pueden recuperar de ningún sitio: no hay papelera, no
 * hay deshacer y la copia de seguridad de Supabase es de la base entera. Un
 * diálogo de «¿seguro?» se acepta sin leerlo; escribir el nombre obliga a mirar
 * a quién estás borrando.
 */
/** Los nombres de tabla, dichos como los llama el entrenador. */
const AUDIT_LABEL = {
  workout_data: 'Rutina',
  anthropometry: 'Peso y medidas',
  nutrition_plans: 'Nutrición',
  check_ins: 'Check-in',
};
const AUDIT_ACTION = { INSERT: 'creado', UPDATE: 'modificado', DELETE: 'borrado' };

export const ClientDataPanel = ({ client }) => {
  const { exportClientData, deleteClientCompletely, loadAuditLog } = useActions();
  const confirm = useConfirm();
  const [audit, setAudit] = useState(null);

  const showAudit = async () => setAudit(await loadAuditLog(client.id));

  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [typed, setTyped] = useState('');
  const [confirming, setConfirming] = useState(false);

  const download = async () => {
    setBusy('export');
    setFeedback(null);
    const result = await exportClientData(client.id);
    setBusy(null);

    if (!result.ok) {
      setFeedback({ tone: 'error', text: result.error });
      return;
    }

    /*
      Se descarga desde el navegador con un Blob y un enlace temporal. Sin
      servidor, sin dependencias y sin que el archivo pase por ningún sitio: los
      datos van del navegador al disco del entrenador y nada más.
    */
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `caveman-${client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setFeedback({
      tone: 'success',
      text: 'Descargado. Los enlaces de las fotos que lleva dentro caducan a los 7 días.',
    });
  };

  const remove = async () => {
    const ok = await confirm({
      title: `¿Borrar a ${client.name} y todos sus datos?`,
      message:
        'Se borran su rutina, su historial de peso y medidas, su nutrición, sus check-ins, su calendario y TODAS sus fotos del almacenamiento. No hay deshacer y no queda copia. Si te lo ha pedido él, descarga antes su exportación.',
      confirmLabel: 'Borrar definitivamente',
      tone: 'danger',
    });
    if (!ok) return;

    setBusy('delete');
    setFeedback(null);
    const result = await deleteClientCompletely(client.id);
    setBusy(null);
    setConfirming(false);
    setTyped('');

    if (!result.ok) {
      setFeedback({ tone: 'error', text: result.error });
      return;
    }
    if (result.problems.length > 0) {
      /* Un borrado a medias hay que poder terminarlo a mano, y para eso hay que
         saber qué quedó. Decir «hecho» escondiendo esto sería mentir sobre datos
         personales, que es justo donde no se puede. */
      setFeedback({
        tone: 'warn',
        text: `Se borró la ficha, pero esto no: ${result.problems.join(' · ')}. Hay que limpiarlo a mano en Supabase.`,
      });
    }
  };

  const nameMatches = typed.trim().toLowerCase() === client.name.trim().toLowerCase();
  const consent = clientConsent(client.preferences);

  return (
    <div className="card-inset col gap-3">
      <span className="section-label">
        <ShieldAlert size={12} /> Datos personales
      </span>

      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

      {/*
        El estado del consentimiento, en modo lectura. Aquí no hay botón para
        darlo: lo da el cliente desde su portal, y un consentimiento que marca el
        entrenador por él no es un consentimiento.
      */}
      <div className="row between wrap gap-2">
        <span className="t-xs t-secondary">Consentimiento de datos</span>
        {consent?.withdrawnAt ? (
          /* Retirado: es lo más importante que puede decir esta línea. Significa
             que hay que dejar de tratar sus datos, así que se dice en rojo y con
             la fecha, no como «pendiente». */
          <span className="badge badge-bad">Retirado el {shortDate(consent.withdrawnAt)}</span>
        ) : consent?.acceptedAt ? (
          <span className="badge badge-ok">Dado el {shortDate(consent.acceptedAt)}</span>
        ) : (
          <span className="badge badge-warn">
            {client.clientProfileId ? 'Pendiente de que lo acepte' : 'Aún no tiene acceso al portal'}
          </span>
        )}
      </div>

      <p className="t-xs t-tertiary">
        Tu cliente puede pedirte todo lo que guardas de él, y puede pedirte que lo borres. Son
        datos de salud: las dos cosas son obligatorias, no un favor.
      </p>

      {/*
        La traza, bajo demanda. No se carga al abrir la ficha: es una consulta
        puntual —se mira cuando hay una duda— y pedirla siempre para veinte
        clientes sería repetir el problema que tiene la carga inicial.
      */}
      {audit === null ? (
        <button type="button" className="btn btn-plain btn-sm" onClick={showAudit} disabled={busy !== null}>
          <History size={14} /> Ver quién ha cambiado sus datos
        </button>
      ) : audit.missing ? (
        <Notice tone="info">
          El registro de cambios necesita la migración <code>0017_audit_log.sql</code>. Sin ella no
          queda constancia de quién toca el plan de un cliente.
        </Notice>
      ) : audit.rows.length === 0 ? (
        <p className="t-xs t-tertiary">Todavía no consta ningún cambio.</p>
      ) : (
        <ul className="log-list">
          {audit.rows.map((row) => (
            <li className="log-entry" key={row.id}>
              <div className="log-when">
                <span className="d">{shortDate(row.at)}</span>
                <span className="s">{new Date(row.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="log-body">
                <span className="t-sm">
                  {AUDIT_LABEL[row.table] || row.table}
                  <span className="t-tertiary"> · {AUDIT_ACTION[row.action] || row.action}</span>
                </span>
                <span className="t-2xs t-tertiary">{row.who || 'sin identificar'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="row wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={download}
          disabled={busy !== null}
        >
          <Download size={14} /> {busy === 'export' ? 'Preparando…' : 'Descargar sus datos'}
        </button>

        {!confirming && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setConfirming(true)}
            disabled={busy !== null}
          >
            <Trash2 size={14} /> Borrar cliente y datos
          </button>
        )}
      </div>

      {confirming && (
        <div className="col gap-2">
          <label className="col gap-1">
            <span className="t-xs t-secondary">
              Escribe <strong>{client.name}</strong> para confirmar que sabes a quién estás borrando.
            </span>
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={client.name}
              autoFocus
            />
          </label>
          <div className="row gap-2 wrap">
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={remove}
              disabled={!nameMatches || busy !== null}
            >
              <Trash2 size={14} /> {busy === 'delete' ? 'Borrando…' : 'Borrar definitivamente'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setConfirming(false);
                setTyped('');
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
