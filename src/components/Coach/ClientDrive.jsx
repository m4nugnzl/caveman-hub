import { useEffect, useState } from 'react';
import { ExternalLink, FolderPlus, Link2, Share2 } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import { Field, Notice, Panel, Switch } from '@/components/ui/primitives';

/**
 * La carpeta compartida de ESTE cliente, en su ficha.
 *
 * ══ Por qué esto vive aquí y ya no en Ajustes ══════════════════════════════
 *
 * Estuvo en los dos sitios: en Ajustes → Integraciones había una lista de toda
 * la cartera con un botón de «crear carpeta» por persona. Y estaba mal, aunque
 * pareciera cómodo:
 *
 *   · Era **un segundo sitio donde gestionar clientes**, que es exactamente la
 *     partición que la cabecera de `ClientFile.jsx` cuenta que costó una pregunta
 *     a soporte. Todo lo de una persona cuelga de la persona.
 *   · Y obligaba a **preparar** algo antes de necesitarlo: treinta carpetas
 *     creadas por si acaso, en el Drive de alguien, para usar dos.
 *
 * Ajustes se queda con lo que de verdad es una decisión global —conectar la
 * cuenta— y el uso vive donde se usa. Que es esta pantalla, y el editor de un
 * paso del alta.
 *
 * ══ Y por eso la carpeta se crea SOLA ══════════════════════════════════════
 *
 * Nadie viene a «crear una carpeta»: viene a subirle algo o a dejar que él le
 * deje cosas. La carpeta es el requisito de eso, no una tarea aparte. La monta la
 * función de borde cuando hace falta (`montarCarpeta`), así que encender el
 * interruptor de abajo o subir un archivo desde el alta la crean sin preguntar.
 * El botón explícito se queda solo para el caso en que lo que quieres es la
 * carpeta EN SÍ: abrirla en Drive y llenarla tú desde allí.
 *
 * ══ Y desaparece entera sin Drive conectado ════════════════════════════════
 *
 * Sin integración no hay carpeta que enseñar, y una tarjeta que solo dice
 * «podrías conectar Drive» en la ficha de cada cliente es publicidad puesta en
 * medio del trabajo. Quien quiera conectarlo lo encuentra en el catálogo.
 */
export const ClientDrive = ({ client }) => {
  const { loadIntegration, loadClientFolder, runDrive, setClientFolder } = useActions();

  const [integrationId, setIntegrationId] = useState(null);
  const [folder, setFolder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [ask, setAsk] = useState('');
  const [editandoAsk, setEditandoAsk] = useState(false);

  /*
    Dos lecturas y no una: la integración dice si esto existe, la carpeta si ya
    está hecha. Van juntas en un solo efecto porque la segunda no significa nada
    sin la primera —una carpeta cuya integración se ha borrado es una fila
    huérfana— y separarlas dejaría un parpadeo con el bloque a medias.
  */
  useEffect(() => {
    let vivo = true;

    Promise.all([loadIntegration('google_drive'), loadClientFolder(client.id)]).then(
      ([integracion, carpeta]) => {
        if (!vivo) return;
        setIntegrationId(integracion?.hasToken ? integracion.integration.id : null);
        setFolder(carpeta.ok ? carpeta.folder : null);
        setAsk(carpeta.ok ? carpeta.folder?.ask || '' : '');
      }
    );

    return () => {
      vivo = false;
    };
  }, [client.id, loadIntegration, loadClientFolder]);

  if (!integrationId) return null;

  /**
   * Asegurarse de que la carpeta existe, y devolverla.
   *
   * La misma llamada sirve para crearla, para rescatarla si el entrenador la
   * borró desde Drive y para repasar el permiso del cliente: la función de borde
   * es idempotente. Por eso «Crear su carpeta» y «Volver a compartir» son el
   * mismo botón con dos nombres — lo que cambia es lo que ya había, no lo que se
   * pide.
   */
  const asegurar = async () => {
    setBusy(true);
    setAviso(null);
    const res = await runDrive({ action: 'folder', integrationId, clientId: client.id });
    setBusy(false);

    if (!res.ok) {
      setAviso({ tone: 'error', text: res.error });
      return null;
    }

    const siguiente = {
      folderId: res.folderId,
      url: res.folderUrl,
      uploads: folder?.uploads ?? false,
      ask: folder?.ask ?? '',
    };
    setFolder(siguiente);

    if (!res.shared) {
      setAviso({
        tone: 'warn',
        text: client.email
          ? `No se ha podido compartir con ${client.email}: comprueba que la dirección es correcta.`
          : 'La carpeta está lista, pero no se le puede compartir: no tiene correo en su ficha, arriba en «Quién es».',
      });
    }
    return siguiente;
  };

  /**
   * Cambiar lo que decides sobre su carpeta.
   *
   * Si todavía no existe, se monta primero: encender «puede dejar archivos aquí»
   * ES pedir la carpeta, y hacer que el interruptor no haga nada hasta que
   * alguien pulse otro botón antes es la clase de paso escondido que hace pensar
   * que algo está roto.
   */
  const cambiar = async (fields) => {
    let actual = folder;
    if (!actual) {
      actual = await asegurar();
      if (!actual) return;
    }

    /* Optimista: es un interruptor, y esperar al servidor para moverlo hace que
       parezca que no responde. El fallo, si lo hay, se dice y se deshace. */
    const antes = actual;
    setFolder({ ...actual, ...fields });
    const res = await setClientFolder(client.id, fields);
    if (!res.ok) {
      setFolder(antes);
      setAviso({ tone: 'error', text: res.error });
    }
  };

  return (
    <Panel
      title="Su carpeta"
      sub="Dentro de tu Drive, en «Caveman Hub». Tú le dejas ahí lo suyo y, si quieres, él te deja lo que le pidas."
      className="col gap-3"
      action={
        folder ? (
          <a
            className="btn btn-quiet btn-sm"
            href={folder.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            <ExternalLink size={13} /> Abrir en Drive
          </a>
        ) : (
          /* El botón explícito, para cuando lo que quieres es la carpeta EN SÍ:
             abrirla y llenarla tú desde Drive. Para todo lo demás se crea sola. */
          <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={asegurar}>
            <FolderPlus size={14} /> {busy ? 'Creando…' : 'Crear su carpeta'}
          </button>
        )
      }
    >
      {aviso && <Notice tone={aviso.tone}>{aviso.text}</Notice>}

      {!folder && (
        <p className="t-sm t-secondary">
          Todavía no tiene, y no hace falta que hagas nada: se crea sola la primera vez que la uses
          —al subirle algo desde un paso de su alta, o al encender lo de aquí abajo—.
        </p>
      )}

      {/*
        El permiso de subir, apagado de serie.

        Es lo único de todo esto que deja escribir a otra persona dentro del Drive
        de uno, así que no puede venir encendido ni ser un ajuste global: no es la
        misma decisión para quien te manda la analítica cada trimestre que para
        quien solo abre el vídeo de bienvenida.
      */}
      <Switch
        label="Puede dejar archivos aquí"
        hint="Le sale en su portal un botón para subir. Va a esta carpeta y a ninguna otra."
        checked={Boolean(folder?.uploads)}
        disabled={busy}
        onChange={(v) => cambiar({ uploads: v })}
      />

      {/* Qué le pides, solo si de verdad puede dejar algo. Un enunciado para un
          botón que no existe sería configurar el aire. */}
      {folder?.uploads &&
        (editandoAsk ? (
          <Field
            label="Qué le pides que deje"
            hint="Sale en su portal encima del botón. Sin esto, «tu carpeta» es una pregunta sin enunciado y llega cualquier cosa."
          >
            {(props) => (
              <div className="row gap-2 wrap">
                <input
                  {...props}
                  className="input grow"
                  maxLength={140}
                  autoFocus
                  value={ask}
                  placeholder="La analítica y el informe del fisio"
                  onChange={(e) => setAsk(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    cambiar({ ask: ask.trim() || null });
                    setEditandoAsk(false);
                  }}
                >
                  Guardar
                </button>
              </div>
            )}
          </Field>
        ) : (
          <button
            type="button"
            className="btn btn-plain btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setEditandoAsk(true)}
          >
            <Link2 size={13} /> {folder.ask ? `«${folder.ask}»` : 'Decirle qué tiene que dejar'}
          </button>
        ))}

      {/*
        Repasar el permiso, cuando ya hay carpeta y hay a quién.

        Es la salida de un callejón real: la carpeta nacía sin compartir porque el
        cliente no tenía correo, y a partir de ahí no quedaba ningún botón con el
        que intentarlo otra vez. Llama a la misma acción que crearla, que no crea
        otra — solo mira los permisos y añade el que falta.
      */}
      {folder && client.email && (
        <button
          type="button"
          className="btn btn-plain btn-sm"
          style={{ alignSelf: 'flex-start' }}
          disabled={busy}
          title={`Repasar el permiso de ${client.email}`}
          onClick={asegurar}
        >
          <Share2 size={13} /> {busy ? 'Compartiendo…' : 'Volver a compartir con él'}
        </button>
      )}

      {folder && !client.email && (
        <p className="t-xs t-warning">
          Él no puede abrirla: no tiene correo en su ficha, así que no hay a quién compartírsela.
          Ponlo arriba, en «Quién es», y vuelve aquí.
        </p>
      )}
    </Panel>
  );
};
