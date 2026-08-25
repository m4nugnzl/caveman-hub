import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, FolderPlus, RefreshCw, ShieldCheck, Upload } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import { providerById } from '@/domain/integrations';
import { BrandMark } from '@/components/ui/BrandMark';
import { Loading, Notice, Panel } from '@/components/ui/primitives';

const DRIVE = providerById('google_drive');

/**
 * Google Drive: una carpeta por cliente, creada y compartida sola.
 *
 * ══ Qué resuelve, exactamente ══════════════════════════════════════════════
 *
 * Nada que el entrenador no pueda hacer a mano. Ésa es la cuestión: hoy lo hace a
 * mano, cliente a cliente —abrir Drive, crear la carpeta, compartirla, copiar el
 * enlace, volver a la aplicación, pegarlo— y del otro lado recibe por WhatsApp lo
 * que acaba subiendo él mismo a esa misma carpeta.
 *
 * Esto no se lleva su material a ninguna parte: **su Drive sigue siendo suyo y
 * las carpetas se quedan ahí si desconecta**. Lo que quita es el trajín.
 *
 * ══ Lo que esta pantalla NO puede ofrecer, y por qué ═══════════════════════
 *
 * Elegir una carpeta que ya tengas. La aplicación pide el permiso más pequeño que
 * existe (`drive.file`), que da acceso **solo a lo que ella crea** — y ése es
 * justo el motivo de que conectar esto no pase por la revisión de Google ni
 * caduque cada semana, al contrario que el calendario, que sigue aparcado por
 * eso mismo (`docs/google-calendar.md` §0). El motivo entero está en la migración
 * 0082, y hay que decirlo aquí porque quien busque el botón de «elegir carpeta»
 * merece saber por qué no está en vez de pensar que no lo encuentra.
 */
export const DriveSettings = ({ onChanged }) => {
  const { loadIntegration, saveIntegration, driveAuthorize, runDrive } = useActions();

  const [estado, setEstado] = useState(null);
  const [busy, setBusy] = useState(null);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => {
    const res = await loadIntegration('google_drive');
    setEstado(res);
  }, [loadIntegration]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /*
    ══ «Todavía no lo sé» NO es «no está conectado» ═══════════════════════════

    `estado` arranca en `null` y esto lo leía como desconectado, así que la
    pantalla abría SIEMPRE con la invitación a conectar y luego cambiaba. En una
    apertura normal es un parpadeo; volviendo de Google es un fallo de verdad:
    acabas de dar el permiso, vuelves, y lo que te encuentras es otra vez el
    botón de «Conectar mi Drive». La conclusión evidente —y equivocada— es que no
    ha funcionado.

    Es el mismo criterio que el catálogo ya tiene escrito para sus chapas: hasta
    que `loadIntegration` no contesta no se afirma nada, ni en un sentido ni en
    el otro.
  */
  const listo = estado !== null;
  const conectado = Boolean(estado?.hasToken);
  const integrationId = estado?.integration?.id;

  const conectar = async () => {
    setBusy('conectar');
    setAviso(null);

    /* La fila de la integración tiene que existir ANTES de ir a Google: el
       `state` del permiso cuelga de ella, y sin fila no hay a qué atar la vuelta.
       Si ya está, se reutiliza — `integrations` es única por (dueño, proveedor). */
    let id = integrationId;
    if (!id) {
      const creada = await saveIntegration({
        provider: 'google_drive',
        label: 'Google Drive',
        config: {},
      });
      if (!creada.ok) {
        setBusy(null);
        setAviso({ tone: 'error', text: creada.error });
        return;
      }
      id = creada.id;
    }

    const res = await driveAuthorize(id);
    setBusy(null);
    if (!res.ok) {
      setAviso({ tone: 'error', text: res.error });
      return;
    }
    /* Una navegación de verdad y no una ventana nueva: la pantalla de permiso de
       Google no se puede meter en un iframe, y una ventana emergente se la come
       cualquier bloqueador. Al terminar, Google devuelve a esta misma pantalla. */
    window.location.href = res.url;
  };

  const sincronizar = async () => {
    setBusy('sync');
    setAviso(null);
    const res = await runDrive({ action: 'sync', integrationId });
    setBusy(null);
    setAviso(
      res.ok
        ? { tone: 'success', text: `Todo en orden: ${res.summary}.` }
        : { tone: 'error', text: res.error }
    );
    cargar();
    onChanged?.();
  };

  const cuenta = estado?.integration?.config?.account;
  const raiz = estado?.integration?.config?.rootFolderUrl;

  /*
    El aviso, que vale para los dos estados y se pinta en el mismo sitio.

    `lastError` solo sale cuando no hay nada más reciente que decir: un fallo de
    hace tres días debajo del acuse de lo que acabas de hacer es ruido que hace
    dudar de si la última acción ha ido bien.
  */
  const mensaje =
    aviso ||
    (estado?.integration?.lastError
      ? { tone: 'error', text: estado.integration.lastError }
      : null);

  return (
    <div className="stack">
      {/*
        ══ Dos pantallas y no una con partes escondidas ═══════════════════════

        Antes era una sola: la cabecera con el botón arriba a la derecha, el
        párrafo de qué es esto, y el bloque del permiso — todo a la vez, conectado
        o no. El resultado era un muro con un botón flotando en una esquina, y
        además decía cosas sin sentido según el estado («lo que la aplicación
        puede ver de tu Drive» a quien ya lo tiene conectado hace un mes).

        Conectar es una DECISIÓN que se toma una vez: merece una pantalla que la
        explique en tres pasos y termine en un botón. Ya conectada, no queda nada
        que configurar aquí —lo de cada cliente se decide en su ficha— así que lo
        que hace falta es un panel de estado breve: con quién, dónde está la
        carpeta raíz y un botón para comprobar que el permiso sigue en pie.
      */}
      {!listo ? (
        <Loading label="Mirando si tienes Drive conectado…" />
      ) : !conectado ? (
        <Panel className="connect col gap-4">
          <BrandMark brand="google_drive" name="Google Drive" size={40} />

          <div className="col gap-2">
            <span className="connect-title">{DRIVE?.tagline}</span>
            <p className="t-sm t-secondary" style={{ maxWidth: '58ch' }}>
              {DRIVE?.what}
            </p>
          </div>

          {mensaje && <Notice tone={mensaje.tone}>{mensaje.text}</Notice>}

          {/* Los tres pasos, que es lo que de verdad se pregunta quien está
              decidiendo: «¿y esto qué me va a hacer?». Numerados y con el hilo
              entre ellos porque es una secuencia, no una lista de ventajas. */}
          <ol className="pitch">
            <li>
              <span className="n" aria-hidden="true">
                1
              </span>
              <span className="col gap-1">
                <span className="t-sm" style={{ fontWeight: 600 }}>
                  Conectas tu cuenta de Google
                </span>
                <span className="t-xs t-tertiary">
                  Una pantalla de Google y vuelves aquí. Nada que copiar ni pegar.
                </span>
              </span>
            </li>
            <li>
              <span className="n" aria-hidden="true">
                2
              </span>
              <span className="col gap-1">
                <span className="t-sm" style={{ fontWeight: 600 }}>
                  Cada cliente tendrá la suya cuando la uses
                </span>
                <span className="t-xs t-tertiary">
                  Se crea sola, dentro de «Caveman Hub», con su nombre y compartida con su correo.
                  No hay que preparar nada.
                </span>
              </span>
            </li>
            <li>
              <span className="n" aria-hidden="true">
                3
              </span>
              <span className="col gap-1">
                <span className="t-sm" style={{ fontWeight: 600 }}>
                  Y si quieres, él te deja cosas ahí
                </span>
                <span className="t-xs t-tertiary">
                  La analítica, el informe del fisio. Lo enciendes cliente a cliente; nace apagado.
                </span>
              </span>
            </li>
          </ol>

          <div className="row gap-3 wrap" style={{ alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy === 'conectar'}
              onClick={conectar}
            >
              {busy === 'conectar' ? 'Abriendo Google…' : 'Conectar mi Drive'}
            </button>
            <span className="row gap-2 t-xs t-tertiary">
              <ShieldCheck size={14} /> Permiso mínimo: solo lo que cree la aplicación
            </span>
          </div>

          {/*
            La letra pequeña, PLEGADA y no encima del botón.

            Es lo que contesta el susto de la pantalla de Google —«quiere acceder
            a tu Google Drive»— y hay que tenerla a mano, pero desplegada empuja
            el botón por debajo del pliegue y convierte una decisión de dos líneas
            en un documento. Quien la quiere, la abre.
          */}
          <details className="fineprint">
            <summary>Qué puede ver exactamente de tu Drive</summary>
            <p>
              Solo las carpetas que cree ella. El permiso que se pide (<code>drive.file</code>) no da
              acceso a nada más: ni a tus documentos, ni a tus fotos, ni a lo que ya tengas dentro.
              Por eso tampoco puede abrir una carpeta que ya tuvieras montada — hay que dejar que
              haga la suya.
            </p>
            <p>
              Si desconectas esto, las carpetas y todo lo que haya dentro se quedan en tu Drive. Lo
              único que se pierde es la puerta.
            </p>
          </details>
        </Panel>
      ) : (
        <Panel className="col gap-3">
          <div className="row between wrap gap-3">
            <div className="row gap-3" style={{ minWidth: 0 }}>
              <BrandMark brand="google_drive" name="Google Drive" size={26} />
              <div style={{ minWidth: 0 }}>
                <span className="section-title">Google Drive</span>
                <p className="t-sm t-secondary">
                  {cuenta ? `Conectado con ${cuenta}` : 'Conectado'}
                </p>
              </div>
            </div>

            <span className="row gap-2">
              <span className="badge badge-ok">
                <Check size={11} /> Conectado
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy === 'sync'}
                onClick={sincronizar}
              >
                <RefreshCw size={13} className={busy === 'sync' ? 'is-girando' : undefined} />
                {busy === 'sync' ? 'Comprobando…' : 'Comprobar'}
              </button>
            </span>
          </div>

          {mensaje && <Notice tone={mensaje.tone}>{mensaje.text}</Notice>}

          {raiz && (
            <a
              className="row gap-1 t-xs link"
              href={raiz}
              target="_blank"
              rel="noreferrer noopener"
            >
              <ExternalLink size={11} /> Abrir la carpeta «Caveman Hub» en tu Drive
            </a>
          )}
        </Panel>
      )}

      {/*
        ══ Y aquí NO hay una lista de clientes ═══════════════════════════════

        La hubo: toda la cartera con un botón de «crear carpeta» por persona. Se
        quitó por dos motivos, y el segundo pesa más que el primero:

          · Era **un segundo sitio donde gestionar clientes**. Este proyecto ya
            decidió que todo lo de una persona cuelga de la persona
            (`ClientFile.jsx`), y una pantalla de Ajustes con treinta nombres
            deshace esa decisión para una función menor.
          · Y obligaba a PREPARAR algo antes de necesitarlo: treinta carpetas
            creadas por si acaso, en el Drive de alguien, para acabar usando dos.

        Conectar la cuenta sí es una decisión global, y por eso se queda. Lo que
        se haga con cada cliente se decide mirando a ese cliente.
      */}
      {conectado && (
        <Panel title="Y a partir de aquí" className="col gap-3">
          <p className="t-sm t-secondary">
            No hay nada más que configurar. La carpeta de cada cliente se crea sola la primera vez
            que la usas: al subirle algo desde un paso de su alta, o al dejar que él te deje cosas
            —las dos decisiones están en <strong>su ficha</strong>, en «Su carpeta»—.
          </p>

          <div className="card-inset col gap-2 t-xs t-secondary">
            <span className="row gap-2">
              <FolderPlus size={14} className="shrink-0" />
              Cada carpeta se comparte con el correo de su ficha, así que la abre él y nadie más.
            </span>
            <span className="row gap-2">
              <Upload size={14} className="shrink-0" />
              Lo que suba tu cliente pasa por el servidor, nunca por su cuenta de Google: no
              necesita tener Drive ni saber qué es.
            </span>
            <span className="row gap-2">
              <ExternalLink size={14} className="shrink-0" />
              Y son tuyas: mueve «Caveman Hub» donde quieras dentro de tu Drive y mete ahí lo que te
              parezca. Lo que dejes en la carpeta de alguien, lo ve él.
            </span>
          </div>
        </Panel>
      )}
    </div>
  );
};
