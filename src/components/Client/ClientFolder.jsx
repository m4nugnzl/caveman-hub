import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, FolderOpen, Loader2, Upload } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import { ATTACHMENT_ACCEPT, validateAttachment } from '@/domain/attachments';
import { Notice, Panel } from '@/components/ui/primitives';

/**
 * Tu carpeta: lo que tu entrenador te deja y lo que tú le dejas a él.
 *
 * ══ Qué sustituye ══════════════════════════════════════════════════════════
 *
 * El hilo de WhatsApp. La analítica de sangre, el informe del fisio, la foto de
 * la hoja del médico: hoy eso viaja por mensajes, y a las tres semanas está
 * enterrado bajo cien fotos de comida. El entrenador acaba descargándolo uno a
 * uno para subirlo a la carpeta que él ya tiene montada en su Drive.
 *
 * Esto es esa carpeta, con la puerta puesta en los dos lados.
 *
 * ══ Por qué no aparece casi nunca ══════════════════════════════════════════
 *
 * Solo si su entrenador tiene Drive conectado Y le ha hecho su carpeta. Sin las
 * dos cosas, este bloque no existe — no hay «conecta tu Drive» ni «pídesela a tu
 * entrenador»: una sección que solo sirve para anunciar lo que no tienes es
 * cromo, y el portal del cliente no lo lleva (ver `IntakePrompt`).
 *
 * ══ Y lo que hay dentro no se lista al entrar ══════════════════════════════
 *
 * Preguntárselo a Google cuesta un viaje de ida y vuelta, y esta pantalla se abre
 * todos los días para mirar otra cosa. Lo que se pinta de entrada es lo que ya se
 * sabe —que la carpeta existe y qué le piden— y el contenido se trae si lo pide.
 */
export const ClientFolder = ({ client }) => {
  const { loadClientFolder, driveFiles, driveUpload } = useActions();
  const input = useRef(null);

  const [folder, setFolder] = useState(null);
  const [archivos, setArchivos] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    let vivo = true;
    loadClientFolder(client.id).then((res) => {
      if (vivo && res.ok) setFolder(res.folder);
    });
    return () => {
      vivo = false;
    };
  }, [client.id, loadClientFolder]);

  if (!folder) return null;

  const subir = async (archivo) => {
    if (!archivo) return;

    /*
      La comprobación del navegador, con las mismas reglas que el servidor
      (`domain/attachments.js` y la función de borde). No protege nada —quien
      quiera se la salta llamando a la API— pero evita el peor momento posible
      para enterarse: después de esperar la subida entera.
    */
    const problema = validateAttachment(archivo);
    if (problema) {
      setAviso({ tone: 'error', text: problema });
      return;
    }

    setSubiendo(true);
    setAviso(null);
    const res = await driveUpload(client.id, archivo);
    setSubiendo(false);

    if (!res.ok) {
      setAviso({ tone: 'error', text: res.error });
      return;
    }
    setAviso({ tone: 'success', text: `Subido: ${res.file?.name || archivo.name}.` });
    /* Si estaba enseñando la lista, se refresca: dejarla como estaba diría que
       lo que se acaba de subir no ha llegado. */
    if (archivos) verContenido();
  };

  const verContenido = async () => {
    const res = await driveFiles(client.id);
    setArchivos(res.ok ? res.files || [] : []);
    if (!res.ok) setAviso({ tone: 'error', text: res.error });
  };

  return (
    <Panel
      title="Tu carpeta"
      sub="Compartida con tu entrenador. Lo que dejes aquí lo tiene él sin buscarlo en un chat."
      className="col gap-3"
      action={
        <a
          className="btn btn-secondary btn-sm"
          href={folder.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          <ExternalLink size={13} /> Abrir
        </a>
      }
    >
      {aviso && <Notice tone={aviso.tone}>{aviso.text}</Notice>}

      {folder.uploads ? (
        <div className="card-inset col gap-2">
          {/* Lo que te piden, si te lo han dicho. Un botón de subir sin enunciado
              es una pregunta sin hacer, y lo que llega entonces es cualquier
              cosa. */}
          <span className="row gap-2 t-sm">
            <FolderOpen size={15} />
            {folder.ask || 'Deja aquí lo que te pida tu entrenador.'}
          </span>
          <span className="t-xs t-tertiary">
            Imágenes o PDF, hasta 10 MB. No hace falta que tengas Google Drive ni cuenta de nada:
            se sube desde aquí.
          </span>

          <div className="row gap-2 wrap">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={subiendo}
              onClick={() => input.current?.click()}
            >
              {subiendo ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
              {subiendo ? 'Subiendo…' : 'Subir un archivo'}
            </button>
            <input
              ref={input}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              hidden
              onChange={(e) => {
                subir(e.target.files?.[0] || null);
                e.target.value = '';
              }}
            />
            {archivos === null && (
              <button type="button" className="btn btn-plain btn-sm" onClick={verContenido}>
                Ver lo que hay
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Sin permiso de subir, la carpeta es solo de lectura: lo que su
           entrenador le deja. Decirlo evita buscar un botón que no está. */
        <p className="t-sm t-secondary">
          Aquí te deja tu entrenador lo que sea tuyo. Para mandarle algo, díselo a él.
        </p>
      )}

      {archivos !== null &&
        (archivos.length === 0 ? (
          <p className="t-xs t-tertiary">Todavía no hay nada dentro.</p>
        ) : (
          <div className="col gap-2">
            {archivos.map((f) => (
              <a
                key={f.id}
                className="card-inset row between wrap gap-2"
                href={f.webViewLink}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span className="row gap-2 t-sm" style={{ minWidth: 0 }}>
                  <FileText size={14} className="shrink-0" />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.name}
                  </span>
                </span>
                <span className="t-xs link shrink-0">Abrir</span>
              </a>
            ))}
            {/* Abrirlo en Drive pide su cuenta de Google, que puede no ser la del
                correo con el que se compartió. Se dice aquí y no como error
                después: es lo único de esta pantalla que puede no funcionarle. */}
            <p className="t-2xs t-tertiary">
              Se abren con la cuenta de Google del correo que le diste a tu entrenador. Si te pide
              permiso, es que estás con otra cuenta.
            </p>
          </div>
        ))}
    </Panel>
  );
};
