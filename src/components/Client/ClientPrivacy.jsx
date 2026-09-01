import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, ShieldCheck } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import { CONSENT_POINTS, consentFromRow } from '@/domain/privacy';
import { supabase } from '@/lib/supabaseClient';
import { CONSENT_VERSION } from '@/components/Auth/ConsentNotice';
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
  const { exportClientData } = useActions();
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  /*
    El estado sale de `client_consents` —la tabla que guarda la prueba— y no de
    las preferencias del cliente. Eran dos sistemas a la vez que no se miraban
    entre sí; ver `domain/privacy.js`.
  */
  const [consent, setConsent] = useState(null);
  /* No es lo mismo «no consta» que «no se ha podido leer», y decir lo primero
     cuando pasa lo segundo es acusar a alguien de no haber consentido. */
  const [estadoRoto, setEstadoRoto] = useState(false);

  /*
    El error NO se traga (regla 13 de `CLAUDE.md`), y aquí hubo un motivo caro
    para escribirlo: `client_consents` tenía su política de lectura pero no el
    `GRANT SELECT` que la hace evaluable, así que esta llamada devolvía siempre
    `42501` y el estado se quedaba en `null` — o sea, «no ha consentido nunca».
    La pantalla lo decía con chapa de aviso a quien acababa de aceptar, y como
    RETIRAR solo se ofrece cuando consta, el derecho a retirarlo quedó apagado
    durante todo ese tiempo sin un solo error a la vista. Lo arregla la migración
    0088; esto es para que la próxima vez se vea.
  */
  const leerEstado = useCallback(async () => {
    const { data, error } = await supabase.rpc('consent_state', { p_client: client.id });
    if (error) {
      console.error('consent_state:', error.message);
      setEstadoRoto(true);
      return;
    }
    setEstadoRoto(false);
    setConsent(consentFromRow(Array.isArray(data) ? data[0] : data));
  }, [client.id]);

  useEffect(() => {
    leerEstado();
  }, [leerEstado]);

  const active = Boolean(consent?.granted && consent.version === CONSENT_VERSION);

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

    const { error } = await supabase.rpc('withdraw_my_consent', { p_version: CONSENT_VERSION });
    if (error) {
      setFeedback({ tone: 'error', text: error.message });
      return;
    }
    await leerEstado();
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
        {!active && !estadoRoto && <span className="badge badge-warn">sin consentimiento</span>}
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
            {estadoRoto ? (
              <span className="t-sm t-secondary">
                No hemos podido consultar tu consentimiento ahora mismo. Vuelve a entrar en un
                rato; si sigue igual, díselo a tu entrenador.
              </span>
            ) : active ? (
              <span className="t-sm">
                Diste tu consentimiento el <strong>{shortDate(consent.at)}</strong>.
              </span>
            ) : consent && !consent.granted ? (
              <span className="t-sm">
                Lo retiraste el <strong>{shortDate(consent.at)}</strong>. Tu entrenador no debería
                seguir tratando tus datos.
              </span>
            ) : consent ? (
              /* Aceptó, pero una versión anterior: el texto ha cambiado desde
                 entonces, así que lo que dio no cubre lo de ahora. */
              <span className="t-sm">
                Lo que aceptaste el <strong>{shortDate(consent.at)}</strong> ha cambiado. Vuelve a
                darlo para seguir.
              </span>
            ) : (
              <span className="t-sm">Todavía no lo has dado.</span>
            )}
          </div>

          <div className="row wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={download} disabled={busy}>
              <Download size={14} /> {busy ? 'Preparando…' : 'Descargar mis datos'}
            </button>

            {/* Sin saber el estado no se ofrece ni darlo ni retirarlo: las dos
                acciones escriben una fila en la prueba, y escribirla a ciegas
                es peor que esperar. Descargar sí, que no depende de esto. */}
            {estadoRoto ? null : active ? (
              <button type="button" className="btn btn-danger btn-sm" onClick={withdraw}>
                Retirar consentimiento
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  const { error } = await supabase.rpc('record_my_consent', {
                    p_version: CONSENT_VERSION,
                  });
                  if (error) setFeedback({ tone: 'error', text: error.message });
                  else await leerEstado();
                }}
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
