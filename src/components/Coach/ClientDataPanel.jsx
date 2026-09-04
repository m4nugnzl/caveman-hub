import { useEffect, useState } from 'react';
import { Download, History, ShieldAlert, Trash2 } from 'lucide-react';

import { useActions, useSession } from '@/context/AppContext';
import { consentFromRow } from '@/domain/privacy';
import { supabase } from '@/lib/supabaseClient';
import { shortDate, timeOfDay } from '@/lib/dates';
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
  client_conditions: 'Condicionantes',
  client_equipment: 'Maquinaria',
};
const AUDIT_ACTION = { INSERT: 'creado', UPDATE: 'modificado', DELETE: 'borrado' };

/**
 * El estado del consentimiento de este cliente.
 *
 * Sale de `client_consents` vía `consent_state` (migración 0050), que es donde
 * vive la prueba. Antes se leía de las preferencias del cliente, o sea del OTRO
 * sistema de consentimiento, y podía contradecir a la puerta.
 *
 * Es un hook porque lo pide el PIE de la ficha —una línea que hay que poder leer
 * sin abrir nada— y no el panel, que ahora vive dentro de una hoja.
 */
export const useConsent = (clientId) => {
  const [consent, setConsent] = useState(null);

  useEffect(() => {
    let vivo = true;
    /* Con `error` a la vista: sin el `GRANT SELECT` de la 0088 esta llamada
       devolvía 42501 en silencio y el panel daba por no consentido a todo el
       mundo. Un permiso que falta no puede parecer un dato. */
    supabase.rpc('consent_state', { p_client: clientId }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) {
        console.error('consent_state:', error.message);
        return;
      }
      setConsent(consentFromRow(Array.isArray(data) ? data[0] : data));
    });
    return () => {
      vivo = false;
    };
  }, [clientId]);

  return consent;
};

/**
 * El consentimiento, dicho en una chapa.
 *
 * En modo lectura y sin botón: lo da el cliente desde su portal, y un
 * consentimiento que marca el entrenador por él no es un consentimiento.
 */
export const ChapaDeConsentimiento = ({ client, consent }) => {
  if (consent && !consent.granted) {
    /* Retirado: es lo más importante que puede decir esta línea. Significa que
       hay que dejar de tratar sus datos, así que se dice en rojo y con la fecha,
       no como «pendiente». */
    return <span className="badge badge-bad">Retirado el {shortDate(consent.at)}</span>;
  }
  if (consent) return <span className="badge badge-ok">Dado el {shortDate(consent.at)}</span>;
  if (client.clientProfileId) {
    return <span className="badge badge-warn">Pendiente de que lo acepte</span>;
  }
  /* Sin ámbar: que alguien recién dado de alta no haya aceptado nada no es un
     aviso —todavía no tiene dónde—, y en ámbar era una alarma más encendida en
     una ficha donde no pasa nada. */
  return <span className="badge">Aún no tiene acceso al portal</span>;
};

/**
 * El pie de la ficha: una línea, no un bloque.
 *
 * ══ Por qué esto dejó de ser una tarjeta ═══════════════════════════════════
 *
 * Porque es lo que se hace el día que alguien ENTRA o SALE —descargar lo suyo,
 * mirar quién le tocó los datos, borrarle— y estaba ocupando el mismo rango que
 * sus lesiones al final de todas las fichas: un rótulo, una chapa, un párrafo
 * legal, un enlace y dos botones, uno de ellos rojo. Seis piezas para algo que
 * casi nunca se usa, debajo de lo que se usa siempre.
 *
 * Queda la única parte que sí hay que poder leer de un vistazo —si consintió— y
 * una puerta. Lo demás está detrás.
 */
export const DatosPersonalesPie = ({ client, consent, onAbrir }) => (
  <footer className="ficha-pie">
    <span className="row gap-2">
      <ShieldAlert size={13} className="icon-inline" />
      Datos personales
    </span>
    <ChapaDeConsentimiento client={client} consent={consent} />
    <button type="button" className="cab-accion is-puerta" onClick={onAbrir}>
      Descargar o borrar sus datos
    </button>
  </footer>
);

export const ClientDataPanel = ({ client }) => {
  const { exportClientData, deleteClientCompletely, loadAuditLog } = useActions();
  const { plan } = useSession();
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
        /* El entrenador NO tiene acceso a la base de datos, así que decirle que lo
           limpie a mano es dejarle con una obligación legal a medias y una
           instrucción que no puede seguir. Se le da la salida que sí tiene. */
        text: `Se borró la ficha, pero esto no: ${result.problems.join(' · ')}. Vuelve a intentarlo; si sigue igual, escríbenos desde Ajustes → Ayuda con este mensaje y lo terminamos nosotros.`,
      });
    }
  };

  const nameMatches = typed.trim().toLowerCase() === client.name.trim().toLowerCase();

  return (
    <div className="col gap-3">

      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

      {/* El consentimiento lo dice el pie de la ficha, que es donde se lee sin
          abrir esto. Repetirlo aquí sería el mismo dato a dos clics de sí mismo. */}
      <p className="t-xs t-tertiary">
        Tu cliente puede pedirte todo lo que guardas de él, y puede pedirte que lo borres. Son
        datos de salud: las dos cosas son obligatorias, no un favor.
      </p>

      {/*
        La traza, bajo demanda. No se carga al abrir la ficha: es una consulta
        puntual —se mira cuando hay una duda— y pedirla siempre para veinte
        clientes sería repetir el problema que tiene la carga inicial.
      */}
      {plan?.hasAuditLog === false ? (
        /*
          El capado de la 0066. RLS filtra un SELECT sin decir nada, así que si
          aquí se dejara el botón, quien no lo tiene vería «todavía no consta
          ningún cambio» — mentira, y de las caras: la traza SÍ se está
          escribiendo. Se dice lo que pasa, sin nombrar el plan que lo lleva:
          qué plan lo incluye lo decide una columna de la base y esta frase no
          puede quedarse anticuada mirándola desde aquí.

          Solo con `false` explícito: `null` es «migración pendiente» y entonces
          la política antigua sigue enseñándolo a todos, como siempre.
        */
        <p className="t-xs t-tertiary">
          El registro de quién cambia los datos no entra en tu plan. Puedes ampliarlo en Ajustes →
          Plan.
        </p>
      ) : audit === null ? (
        <button type="button" className="btn btn-plain btn-sm" onClick={showAudit} disabled={busy !== null}>
          <History size={14} /> Ver quién ha cambiado sus datos
        </button>
      ) : audit.missing ? (
        <Notice tone="info">
          El registro de cambios todavía no está activo en tu cuenta, así que no queda constancia de quién toca el plan de un cliente. Escríbenos desde Ajustes → Ayuda.
        </Notice>
      ) : audit.rows.length === 0 ? (
        <p className="t-xs t-tertiary">Todavía no consta ningún cambio.</p>
      ) : (
        <ul className="log-list">
          {audit.rows.map((row) => (
            <li className="log-entry" key={row.id}>
              <div className="log-when">
                <span className="d">{shortDate(row.at)}</span>
                <span className="s">{timeOfDay(row.at)}</span>
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
