import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Check,
  ContactRound,
  ExternalLink,
  FileText,
  ListChecks,
  Link2,
  Paperclip,
  Pencil,
  Send,
  UserCheck,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { ATTACHMENT_ACCEPT, attachmentName } from '@/domain/attachments';
import {
  clientIntake,
  intakeProgress,
  intakeSteps,
  intakeToPreferences,
  markStep,
  safeLink,
  setStepFile,
  setStepLink,
  stepDone,
  stepFile,
  stepLink,
} from '@/domain/intake';
import { Field, Notice, Panel, SectionTitle } from '@/components/ui/primitives';
import { ClientDataPanel } from './ClientDataPanel';
import { inviteMessage, useInvite } from './useInvite';

/**
 * La ficha administrativa de UN cliente: `/c/:clientId/ficha`.
 *
 * ══ Por qué esto es una sección del cliente y no una pantalla aparte ════════
 *
 * Hasta ahora vivía en «Clientes», mezclada con la lista y el alta. Eso partía la
 * aplicación en dos sitios distintos para hablar de la misma persona: su rutina y
 * su nutrición dentro de `/c/:id/…`, y sus datos, su acceso y su archivado fuera.
 *
 * El síntoma de esa partición no fue estético. Un entrenador nuevo entra por
 * «Clientes» —que es donde acaba de crear a alguien—, pulsa sobre el cliente y lo
 * que se abre es administración. La pregunta que llegó a soporte fue literalmente
 * «¿dónde hago la rutina?».
 *
 * Ahora el clic entra en la persona y todo lo suyo cuelga de ahí, incluida esta
 * ficha. Una sola respuesta a «¿dónde está lo de este cliente?»: dentro de él.
 */

/**
 * Editar los datos de un cliente ya dado de alta.
 *
 * Estos cinco campos solo se podían poner **en el formulario de alta**. A partir
 * de ahí quedaban congelados: un correo mal escrito no se podía corregir, y un
 * cliente traído de Notion —que llega solo con el nombre— se quedaba sin correo,
 * sin teléfono y sin sexo para siempre.
 *
 * Lo del sexo no era cosmético: la fórmula de pliegues es distinta para hombre y
 * mujer, y sin definir se aplicaba **la de hombre en silencio**. El porcentaje
 * graso salía, parecía bueno, y podía estar varios puntos desviado.
 */
const ClientEditor = ({ client, onSave, onCancel }) => {
  const [form, setForm] = useState({
    name: client.name || '',
    email: client.email || '',
    phone: client.phone || '',
    gender: client.gender || '',
    plan: client.plan || '',
  });

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const limpio = form.name.trim();

  return (
    <form
      className="col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!limpio) return;
        /*
          Se manda TODO el formulario, incluidos los campos vacíos: dejar un
          correo en blanco tiene que poder borrarlo. Filtrar los vacíos —que es
          la tentación— convertiría «quitar el teléfono» en algo imposible.
        */
        onSave({ ...form, name: limpio });
      }}
    >
      <Field label="Nombre">
        {(props) => (
          <input {...props} autoFocus className="input" value={form.name} onChange={set('name')} />
        )}
      </Field>

      <div className="grid-2">
        <Field label="Correo">
          {(props) => (
            <input {...props} type="email" className="input" value={form.email} onChange={set('email')} />
          )}
        </Field>
        <Field label="Teléfono">
          {(props) => (
            <input {...props} type="tel" className="input" value={form.phone} onChange={set('phone')} />
          )}
        </Field>
      </div>

      <div className="grid-2">
        <Field
          label="Sexo"
          hint="Cambia la fórmula del % graso por pliegues, así que conviene tenerlo."
        >
          {(props) => (
            <select {...props} className="select" value={form.gender} onChange={set('gender')}>
              <option value="">Sin definir</option>
              <option value="Hombre">Hombre</option>
              <option value="Mujer">Mujer</option>
            </select>
          )}
        </Field>
        <Field label="Plan" hint="El tuyo, el que le cobras. Texto libre.">
          {(props) => <input {...props} className="input" value={form.plan} onChange={set('plan')} />}
        </Field>
      </div>

      <div className="row gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!limpio}>
          Guardar
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancelar
        </button>
        {!limpio && <span className="t-xs t-tertiary">El nombre no puede quedar vacío.</span>}
      </div>
    </form>
  );
};

/** Los datos, en modo lectura. Editar los sustituye en su sitio. */
const Datos = ({ client, onUpdate }) => {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <Panel className="col gap-4">
        <SectionTitle icon={ContactRound}>Datos</SectionTitle>
        <ClientEditor
          client={client}
          onCancel={() => setEditando(false)}
          onSave={(fields) => {
            onUpdate(fields);
            setEditando(false);
          }}
        />
      </Panel>
    );
  }

  const filas = [
    ['Correo', client.email],
    ['Teléfono', client.phone],
    ['Sexo', client.gender],
    ['Plan', client.plan],
  ];

  return (
    <Panel className="col gap-4">
      <div className="row between wrap gap-2">
        <SectionTitle icon={ContactRound}>Datos</SectionTitle>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditando(true)}>
          <Pencil size={13} /> Editar
        </button>
      </div>

      <div className="card-inset col gap-2 t-sm">
        {filas.map(([label, valor]) => (
          <div key={label} className="row between gap-2">
            <span className="t-secondary">{label}</span>
            {valor ? (
              <span style={{ fontWeight: 600 }}>{valor}</span>
            ) : (
              /* Sin poner se dice en gris, salvo el sexo: ese cambia un cálculo
                 que se hace igualmente, así que se avisa. */
              <span className="t-tertiary">sin poner</span>
            )}
          </div>
        ))}
      </div>

      {!client.gender && (
        <Notice tone="warn">
          Sin el sexo, el % graso por pliegues se calcula con la fórmula de hombre. Ponlo aquí y los
          pliegues pasan a usar la que toca.
        </Notice>
      )}
    </Panel>
  );
};

/**
 * Acceso del cliente a su portal.
 *
 * Va lo primero de la ficha porque, mientras el cliente no pueda entrar, todo lo
 * demás que se haga aquí da igual: no va a ver la rutina ni a registrar nada.
 */
const PortalAccess = ({ client }) => {
  const { result, busy, send } = useInvite();

  if (client.clientProfileId) {
    return (
      <div className="card-inset row between wrap gap-2 t-sm">
        <span className="t-secondary">Acceso al portal</span>
        <span className="badge badge-ok">
          <UserCheck size={11} /> Tiene su cuenta enlazada
        </span>
      </div>
    );
  }

  return (
    <div className="card-inset col gap-2">
      <div className="row between wrap gap-2 t-sm">
        <span className="t-secondary">Acceso al portal</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => send(client)} disabled={busy}>
          <Send size={14} /> {busy ? 'Generando…' : 'Invitar'}
        </button>
      </div>

      {result &&
        (result.ok ? (
          <Notice tone={result.copied ? 'success' : 'info'}>{inviteMessage(result)}</Notice>
        ) : (
          <Notice tone="error">{result.error}</Notice>
        ))}

      {!result && (
        <span className="t-xs t-tertiary">
          Genera un enlace de un solo uso que caduca en 14 días. Se copia solo: mándaselo por
          WhatsApp y, al abrirlo, se crea su cuenta y queda enlazada a esta ficha.
        </span>
      )}
    </div>
  );
};

/**
 * Terminar con un cliente sin borrarle.
 *
 * Porque el plan tiene un tope de clientes y borrar es irreversible: se lleva su
 * año de entrenamientos, sus pesajes y sus fotos. Sin esto, caber en el plan
 * obligaba a destruir el trabajo de alguien que solo había terminado su etapa.
 *
 * No pregunta «¿seguro?» a propósito: es reversible desde «Clientes», y un
 * diálogo de confirmación para algo que se deshace en un clic solo enseña a
 * ignorar los diálogos de confirmación.
 */
const ArchiveRow = ({ client }) => {
  const { setClientArchived } = useApp();
  const [busy, setBusy] = useState(false);

  return (
    <div className="card-inset row between wrap gap-2 t-sm">
      <div className="col gap-1">
        <span className="t-secondary">Terminar con este cliente</span>
        <span className="t-xs t-tertiary">
          Deja de aparecer en la lista y de contar para tu plan. Todo lo suyo se conserva.
        </span>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setClientArchived(client.id, true);
        }}
      >
        <Archive size={14} /> Archivar
      </button>
    </div>
  );
};

/**
 * Un paso del alta: marcarlo y, si entrega algo, enlazarlo.
 *
 * ── Por qué un paso puede llevar contenido ──────────────────────────────────
 * Porque «vídeo de bienvenida: hecho» no le sirve de nada al cliente, que es
 * quien tiene que verlo. Con el enlace pegado aquí, el paso deja de ser el
 * recordatorio privado del entrenador y pasa a ser la cosa que se entrega: al
 * cliente le aparece en su portal y le queda guardada.
 */
const StepRow = ({ step, hecho, url, file, revisiones = [], onToggle, onLink, onFile }) => {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState(url || '');
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef(null);

  const guardar = () => {
    const limpio = draft.trim();
    if (limpio && !safeLink(limpio)) {
      setError('Pega una dirección que empiece por https://');
      return;
    }
    onLink(limpio);
    setError('');
    setEditando(false);
  };

  /*
    Se sube AL ELEGIR el archivo, sin pasar por «Guardar».

    Elegir un archivo en un diálogo del sistema ya es una confirmación —hay que
    buscarlo y pulsar «Abrir»—, y pedir una segunda deja el caso de quien elige,
    ve el nombre puesto y se va creyendo que está subido. Como es una sola acción,
    lo que se enseña mientras tanto es el estado: «Subiendo…».
  */
  const subir = async (elegido) => {
    if (!elegido) return;
    setSubiendo(true);
    setError('');
    const fallo = await onFile(elegido);
    setSubiendo(false);
    if (fallo) setError(fallo);
    else setEditando(false);
  };

  return (
    <div className="card-inset col gap-2">
      <div className="row between wrap gap-2">
        <label className="row gap-2 grow" style={{ minWidth: 0, cursor: 'pointer' }}>
          <input type="checkbox" checked={hecho} onChange={() => onToggle(!hecho)} />
          <span className="col gap-1" style={{ minWidth: 0 }}>
            <span className="t-sm" style={{ fontWeight: 600 }}>
              {step.label}
            </span>
            {step.hint && <span className="t-2xs t-tertiary">{step.hint}</span>}
          </span>
        </label>

        {step.link && !editando && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setDraft(url || '');
              setEditando(true);
            }}
          >
            <Link2 size={13} /> {url || file ? 'Cambiar' : 'Añadir contenido'}
          </button>
        )}
      </div>

      {/* Lo que hay puesto se ve SIEMPRE, no solo al editar: es lo que el cliente
          va a abrir, y comprobar que apunta a donde toca es media revisión. */}
      {url && !editando && (
        <a
          className="row gap-1 t-xs link"
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          style={{ minWidth: 0 }}
        >
          <ExternalLink size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {url}
          </span>
        </a>
      )}

      {/* Del archivo se enseña su NOMBRE, no su ruta: `c1/intake/1738-anam.pdf`
          no le dice nada a nadie. No se enlaza aquí porque abrirlo exige firmar la
          URL, y esta pantalla es la de montar el alta, no la de consultarla; el
          cliente sí lo abre desde su portal. */}
      {file && !editando && (
        <span className="row gap-1 t-xs t-secondary" style={{ minWidth: 0 }}>
          <FileText size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {attachmentName(file)}
          </span>
        </span>
      )}

      {editando && (
        <div className="col gap-2">
          <Field
            label="Enlace para el cliente"
            hint="YouTube, Loom, Drive… lo que uses. Lo verá en su portal."
            error={error}
          >
            {(props) => (
              <input
                {...props}
                autoFocus
                type="url"
                className="input"
                value={draft}
                placeholder="https://"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    guardar();
                  }
                }}
              />
            )}
          </Field>
          {/*
            Las revisiones que ya has grabado para este cliente.

            El grabador del estudio de fotos guarda el vídeo y crea un enlace
            propio (`/r/:token`). Sin esto había que ir allí, copiar el enlace,
            volver aquí y pegarlo — cuatro pasos para unir dos cosas que ya
            existían. Aquí es un clic.
          */}
          {revisiones.length > 0 && (
            <div className="col gap-1">
              <span className="t-2xs t-tertiary">O una revisión que ya has grabado:</span>
              <div className="rail-wrap" role="group" aria-label="Revisiones grabadas">
                {revisiones.map((rev) => (
                  <button
                    key={rev.id}
                    type="button"
                    className="chip chip-dashed"
                    onClick={() => setDraft(rev.url)}
                    title={rev.url}
                  >
                    <Video size={12} /> {rev.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/*
            ══ O un archivo, para lo que no vive en ninguna parte ═════════════

            El enlace de arriba vale para el vídeo de bienvenida, que está en
            YouTube o en Loom. No vale para la anamnesis en PDF ni para la hoja de
            la primera medición: para eso había que subirlas a Drive, hacerlas
            públicas y pegar aquí ese enlace — tres pasos fuera de la aplicación, y
            los datos de salud de alguien colgando de una dirección sin caducidad.

            Subiéndolo va al mismo sitio privado que sus fotos, y el cliente lo
            abre con una URL firmada que caduca.

            Poner un archivo retira el enlace y al revés: el paso entrega UNA cosa
            (`domain/intake.js`).
          */}
          <div className="col gap-1">
            <span className="t-2xs t-tertiary">O súbelo, si no está en ninguna parte:</span>
            <input
              ref={input}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => {
                subir(e.target.files?.[0] || null);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ alignSelf: 'flex-start' }}
              disabled={subiendo}
              onClick={() => input.current?.click()}
            >
              <Paperclip size={13} /> {subiendo ? 'Subiendo…' : 'Subir archivo'}
            </button>
            {file && (
              <span className="t-2xs t-tertiary">
                Ahora mismo: {attachmentName(file)}
              </span>
            )}
          </div>

          <div className="row gap-2 wrap">
            <button type="button" className="btn btn-primary btn-sm" onClick={guardar}>
              Guardar enlace
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setEditando(false);
                setError('');
              }}
            >
              Cancelar
            </button>
            {(url || file) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  /* Quitar lo que haya: solo hay una de las dos cosas, así que se
                     limpian las dos y da igual cuál estuviera puesta. */
                  if (file) onFile(null);
                  else onLink('');
                  setEditando(false);
                }}
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * El alta de este cliente.
 *
 * Los pasos son los que el entrenador haya decidido en Ajustes → Protocolo. Si no
 * ha decidido nada, son los dos que la aplicación traía de siempre; si ha
 * decidido que no quiere ninguno, este panel no aparece — que es exactamente la
 * diferencia entre proponer una forma de trabajar e imponerla.
 */
const Alta = ({ client, onUpdate, onPreferences }) => {
  const { listReviewLinks, uploadIntakeFile } = useApp();
  const intake = clientIntake(client.preferences);
  const steps = intakeSteps(intake);
  const { done, total, complete } = intakeProgress(client, intake);
  const [revisiones, setRevisiones] = useState([]);

  /* Solo se piden si hay algún paso que admita contenido: sin eso, la consulta
     no tendría dónde usarse. Los revocados se caen — ofrecer un enlace muerto es
     peor que no ofrecer ninguno. */
  const admiteEnlace = steps.some((s) => s.link);
  useEffect(() => {
    if (!admiteEnlace) return undefined;
    let vivo = true;
    listReviewLinks(client.id).then((res) => {
      if (!vivo || !res.ok) return;
      setRevisiones(
        res.links
          .filter((l) => !l.revokedAt)
          .slice(0, 6)
          .map((l) => ({
            id: l.id,
            title: l.title || (l.weekStart ? `Revisión ${l.weekStart}` : 'Revisión'),
            url: `${window.location.origin}/r/${l.token}`,
          }))
      );
    });
    return () => {
      vivo = false;
    };
  }, [client.id, admiteEnlace, listReviewLinks]);

  if (total === 0) return null;

  const toggle = (step, valor) => {
    const result = markStep(intake, step, valor);
    if (result.fields) onUpdate(result.fields);
    if (result.intake !== intake) onPreferences(result.intake);
  };

  return (
    <Panel className="col gap-4">
      <div className="row between wrap gap-2">
        <SectionTitle icon={ListChecks}>Alta</SectionTitle>
        <span className={`badge ${complete ? 'badge-ok' : ''}`}>
          {complete ? <Check size={11} /> : null} {done} de {total}
        </span>
      </div>

      <div className="col gap-2">
        {steps.map((step) => (
          <StepRow
            key={step.id}
            step={step}
            hecho={stepDone(step, client, intake)}
            url={stepLink(intake, step.id)}
            file={stepFile(intake, step.id)}
            revisiones={revisiones}
            onToggle={(valor) => toggle(step, valor)}
            onLink={(url) => onPreferences(setStepLink(intake, step.id, url))}
            /* Devuelve el fallo —o null— porque quien lo enseña es la fila: el
               archivo se elige ahí y ahí es donde se mira si ha ido bien. */
            onFile={async (archivo) => {
              if (!archivo) {
                onPreferences(setStepFile(intake, step.id, null));
                return null;
              }
              const res = await uploadIntakeFile({
                clientId: client.id,
                stepId: step.id,
                file: archivo,
              });
              if (!res.ok) return res.error;
              onPreferences(setStepFile(intake, step.id, res.path));
              return null;
            }}
          />
        ))}
      </div>

      <p className="t-xs t-tertiary">
        Estos pasos los eliges tú en <Link to="/ajustes/protocolo">Ajustes → Protocolo</Link>. Lo que
        enlaces aquí es de este cliente.
      </p>
    </Panel>
  );
};

export const ClientFile = () => {
  const { activeClient, updateClient, updateClientPreferences } = useApp();

  /* El marco ya redirige cuando el id no existe; esto solo cubre el instante
     entre montar la ruta y tener el cliente cargado. */
  if (!activeClient) return null;

  return (
    <div className="stack">
      {/* El alta va la primera: es lo que está sin terminar cuando alguien acaba
          de entrar, y lo que se viene a mirar en las primeras semanas. */}
      <Alta
        client={activeClient}
        onUpdate={(fields) => updateClient(activeClient.id, fields)}
        onPreferences={(intake) =>
          updateClientPreferences(activeClient.id, 'intake', intakeToPreferences(intake))
        }
      />

      <Datos client={activeClient} onUpdate={(fields) => updateClient(activeClient.id, fields)} />

      <Panel className="col gap-3">
        <SectionTitle icon={Send}>Acceso y baja</SectionTitle>
        <PortalAccess client={activeClient} />
        <ArchiveRow client={activeClient} />
      </Panel>

      {/* Exportar y borrar sus datos personales. Es lo que se hace cuando un
          cliente entra o SALE, no mientras se trabaja con él, así que va al
          final de la ficha y no en el carril de secciones. */}
      <ClientDataPanel client={activeClient} />
    </div>
  );
};
