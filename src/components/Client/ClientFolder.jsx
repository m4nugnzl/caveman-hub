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
 * cromo, y el portal del cliente no lo lleva.
 *
 * ══ Y lo que hay dentro no se lista al entrar ══════════════════════════════
 *
 * Preguntárselo a Google cuesta un viaje de ida y vuelta, y esta pantalla se abre
 * todos los días para mirar otra cosa. Lo que se pinta de entrada es lo que ya se
 * sabe —que la carpeta existe y qué le piden— y el contenido se trae si lo pide.
 */
/**
 * @param carpeta  La carpeta ya consultada por quien monta esto. Va como
 *   parámetro desde que la puerta es una FILA en «Tú»: quien pinta la fila tiene
 *   que saber ANTES si hay carpeta —ofrecer «Tus documentos» para abrir una capa
 *   vacía es prometer algo que no existe—, y sin esto la consulta se haría dos
 *   veces, una para decidir la fila y otra al abrirla.
 * @param desnudo  Dentro de una capa, sin `Panel`: la ventana ya pone el título.
 */
export const ClientFolder = ({ client, carpeta = null, desnudo = false }) => {
  const { loadClientFolder, driveFiles, driveUpload } = useActions();
  const input = useRef(null);

  const [propia, setPropia] = useState(null);
  const [archivos, setArchivos] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState(null);

  const dada = carpeta !== null;
  const folder = dada ? carpeta : propia;

  useEffect(() => {
    if (dada) return undefined;
    let vivo = true;
    loadClientFolder(client.id).then((res) => {
      if (vivo && res.ok) setPropia(res.folder);
    });
    return () => {
      vivo = false;
    };
  }, [client.id, loadClientFolder, dada]);

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

  const abrir = (
    <a
      className="btn btn-secondary btn-sm"
      href={folder.url}
      target="_blank"
      rel="noreferrer noopener"
    >
      <ExternalLink size={13} /> Abrir
    </a>
  );

  const Marco = desnudo ? 'div' : Panel;
  const marcoProps = desnudo
    ? { className: 'col gap-3' }
    : {
        title: 'Tu carpeta',
        sub: 'Compartida con tu entrenador. Lo que dejes aquí lo tiene él sin buscarlo en un chat.',
        className: 'col gap-3',
        action: abrir,
      };

  return (
    <Marco {...marcoProps}>
      {/* Desnudo, el título lo pone la ventana y la frase que lo explicaba
          sobra: quien ha abierto «Tus documentos» ya sabe a qué ha entrado. Lo
          que no puede perderse es la puerta a Drive, así que baja al cuerpo. */}
      {desnudo && (
        <div className="row between wrap gap-2">
          <span className="t-sm t-secondary">Compartida con tu entrenador.</span>
          {abrir}
        </div>
      )}

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
              {subiendo ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
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
            {/* En cuadrícula, la misma pieza que lo que te dejó al empezar
                (`IntakeDeliverables`): lo que hay dentro de una carpeta se
                busca por el dibujo y por el sitio, no se lee renglón a
                renglón. Y con el nombre entero —antes se recortaba con puntos
                suspensivos en una línea, que es justo lo que hay que leer para
                saber cuál es. */}
            <div className="papeles">
              {archivos.map((f) => (
                <a
                  key={f.id}
                  className="papel"
                  href={f.webViewLink}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <span className="list-icon" aria-hidden="true">
                    <FileText size={15} />
                  </span>
                  <b>{f.name}</b>
                </a>
              ))}
            </div>
            {/* Abrirlo en Drive pide su cuenta de Google, que puede no ser la del
                correo con el que se compartió. Se dice aquí y no como error
                después: es lo único de esta pantalla que puede no funcionarle. */}
            <p className="t-2xs t-tertiary">
              Se abren con la cuenta de Google del correo que le diste a tu entrenador. Si te pide
              permiso, es que estás con otra cuenta.
            </p>
          </div>
        ))}
    </Marco>
  );
};
