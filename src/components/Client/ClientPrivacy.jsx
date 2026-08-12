import { useState } from 'react';
import { ChevronDown, ChevronRight, Download, ShieldCheck } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { CONSENT_POINTS, clientConsent, hasConsent, grantConsent, withdrawConsent } from '@/domain/privacy';
import { shortDate } from '@/lib/dates';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Notice, Panel } from '@/components/ui/primitives';

/**
 * Mis datos y privacidad — la versión del CLIENTE.
 *
 * ══ Por qué esto no puede vivir solo en la ficha del entrenador ═════════════
 *
 * Los derechos del RGPD son de la persona, no de quien guarda sus datos. Hasta
 * ahora exportar y borrar estaban solo en el panel del entrenador: el cliente
 * tenía que PEDÍRSELO y confiar en que lo hiciera. Eso convierte un derecho en un
 * favor.
 *
 * Aquí puede hacer por sí mismo las dos cosas que no necesitan permiso de nadie:
 * **descargar todo lo suyo** y **retirar el consentimiento**. El borrado no: es
 * destructivo e irreversible, y para eso sí tiene sentido que haya una persona al
 * otro lado — el texto le dice cómo pedirlo.
 *
 * ── Por qué va plegado y al final ───────────────────────────────────────────
 * Porque no es lo que viene a hacer. Un cliente abre esto para ver su rutina; la
 * privacidad tiene que estar disponible y no estorbando, que es exactamente el
 * sitio del pie de página.
 */
export const ClientPrivacy = ({ client }) => {
  const { exportClientData, updateClientPreferences } = useApp();
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const consent = clientConsent(client.preferences);
  const active = hasConsent(client.preferences);

  const download = async () => {
    setBusy(true);
    setFeedback(null);
    const result = await exportClientData(client.id);
    setBusy(false);

    if (!result.ok) {
      setFeedback({ tone: 'error', text: result.error });
      return;
    }

    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setFeedback({
      tone: 'success',
      text: 'Descargado. Los enlaces de tus fotos que lleva dentro caducan a los 7 días.',
    });
  };

  const withdraw = async () => {
    const ok = await confirm({
      title: '¿Retirar tu consentimiento?',
      message:
        'Tu entrenador dejará de poder tratar tus datos para seguir tu progreso. Tus fotos y tus medidas NO se borran solas: si además quieres que las elimine, pídeselo. Puedes volver a darlo cuando quieras.',
      confirmLabel: 'Retirar consentimiento',
      tone: 'danger',
    });
    if (!ok) return;

    updateClientPreferences(client.id, 'consent', withdrawConsent());
    setFeedback({
      tone: 'info',
      text: 'Consentimiento retirado. Díselo a tu entrenador para que sepa que tiene que parar.',
    });
  };

  return (
    <Panel tight className="col gap-3" style={{ marginTop: 'var(--s5)' }}>
      <button type="button" className="proto-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <ShieldCheck size={15} />
        <span className="grow">Mis datos y privacidad</span>
        {!active && <span className="badge badge-warn">sin consentimiento</span>}
      </button>

      {open && (
        <div className="col gap-3">
          {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

          <ul className="col gap-2 t-sm t-secondary" style={{ paddingLeft: '1.1em' }}>
            {CONSENT_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>

          <div className="card-inset col gap-2">
            <span className="section-label">Estado</span>
            {active ? (
              <span className="t-sm">
                Diste tu consentimiento el <strong>{shortDate(consent.acceptedAt)}</strong>.
              </span>
            ) : consent?.withdrawnAt ? (
              <span className="t-sm">
                Lo retiraste el <strong>{shortDate(consent.withdrawnAt)}</strong>. Tu entrenador no
                debería seguir tratando tus datos.
              </span>
            ) : (
              <span className="t-sm">Todavía no lo has dado.</span>
            )}
          </div>

          <div className="row wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={download} disabled={busy}>
              <Download size={14} /> {busy ? 'Preparando…' : 'Descargar mis datos'}
            </button>

            {active ? (
              <button type="button" className="btn btn-danger btn-sm" onClick={withdraw}>
                Retirar consentimiento
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => updateClientPreferences(client.id, 'consent', grantConsent())}
              >
                Dar mi consentimiento
              </button>
            )}
          </div>

          {/*
            El borrado no está aquí a propósito: es irreversible y no hay
            papelera. Se dice cómo pedirlo en vez de esconder que se puede.
          */}
          <p className="t-xs t-tertiary">
            ¿Quieres que borre todo lo que tiene de ti? Pídeselo a tu entrenador: puede eliminar tu
            ficha, tus medidas y tus fotos de forma definitiva.
          </p>
        </div>
      )}
    </Panel>
  );
};
