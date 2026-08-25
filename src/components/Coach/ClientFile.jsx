import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Check,
  Eye,
  ExternalLink,
  FileText,
  Link2,
  Paperclip,
  Pencil,
  Send,
  UserCheck,
  Video,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { ATTACHMENT_ACCEPT, attachmentName } from '@/domain/attachments';
import { BILLING_PERIODS, billingPeriod, nextPaymentAfter, paymentState } from '@/domain/billing';
import { latestWeight } from '@/domain/anthropometry';
import { identityFacts, identitySubtitle } from '@/domain/ficha';
import { onboardingState } from '@/domain/onboardingState';
import { PROFILE_GROUPS, cleanProfile, isProfileEmpty } from '@/domain/profile';
import { dayMonthMaybeYear, shortDate, todayISO } from '@/lib/dates';
import { initials } from '@/lib/initials';
import { toNum } from '@/lib/num';
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
import {
  Field,
  GroupHead,
  Notice,
  NumberInput,
  PageHead,
  Panel,
  SegmentedControl,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/ToastProvider';
import { ConditionsPanel } from '@/components/conditions/ConditionsPanel';
import { ClientDataPanel } from './ClientDataPanel';
import { EquipmentPanel } from '@/components/equipment/EquipmentPanel';
import { CustomAnswers } from './CustomAnswers';
import { DownloadAnamnesis } from './DownloadAnamnesis';
import { ProfileBlock } from './ProfileBlock';
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
 *
 * ── Y ahora son siete: la fecha de nacimiento y la altura ───────────────────
 * Las dos por el mismo motivo que el sexo: no son ficha de contacto, son datos
 * que ENTRAN EN CUENTAS. La edad la piden las fórmulas de gasto energético y las
 * zonas de frecuencia cardíaca; la altura convierte la cintura —que ya se
 * mide— en un ratio con lectura. Ver `domain/ficha.js` y la migración 0076.
 */
const ClientEditor = ({ client, onSave, onCancel }) => {
  const [form, setForm] = useState({
    name: client.name || '',
    email: client.email || '',
    phone: client.phone || '',
    gender: client.gender || '',
    birthDate: client.birthDate || '',
    heightCm: client.heightCm ?? '',
    plan: client.plan || '',
  });

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const limpio = form.name.trim();
  /* Un dedo de más al teclear el año en el selector de fecha, y la ficha diría
     «−4 años». Se corta aquí y con palabras, en vez de dejar que lo rechace la
     restricción de la base con su mensaje de Postgres. */
  const futuro = Boolean(form.birthDate) && form.birthDate > todayISO();

  return (
    <form
      className="col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!limpio || futuro) return;
        /*
          Se manda TODO el formulario, incluidos los campos vacíos: dejar un
          correo en blanco tiene que poder borrarlo. Filtrar los vacíos —que es
          la tentación— convertiría «quitar el teléfono» en algo imposible.

          Los dos que van a columnas tipadas se convierten antes: una cadena
          vacía es texto válido para `text` y basura para `date` y `numeric`, así
          que borrar la altura fallaría con un error de Postgres en vez de
          dejarla en blanco.
        */
        onSave({
          ...form,
          name: limpio,
          birthDate: form.birthDate || null,
          heightCm: toNum(form.heightCm),
        });
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
        <Field
          label="Fecha de nacimiento"
          hint="De aquí sale su edad. No se guarda la edad: se calcula, para que no envejezca sola."
          error={futuro ? 'Esa fecha todavía no ha llegado.' : null}
        >
          {(props) => (
            <input
              {...props}
              type="date"
              className="input"
              /* Ni el día de mañana ni el año 3000: el navegador ya sabe cortar
                 por arriba, y así el aviso de abajo es el segundo cinturón. */
              max={todayISO()}
              value={form.birthDate}
              onChange={set('birthDate')}
            />
          )}
        </Field>
      </div>

      <div className="grid-2">
        <Field label="Altura" hint="En centímetros. Con ella, su cintura pasa a ser un ratio.">
          {(props) => (
            <div className="input-suffix">
              <NumberInput
                {...props}
                center={false}
                placeholder="175"
                value={form.heightCm}
                onChange={(v) => setForm({ ...form, heightCm: v })}
              />
              <span aria-hidden="true">cm</span>
            </div>
          )}
        </Field>
        <Field label="Plan" hint="El tuyo, el que le cobras. Texto libre.">
          {(props) => <input {...props} className="input" value={form.plan} onChange={set('plan')} />}
        </Field>
      </div>

      <div className="row gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!limpio || futuro}>
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

/**
 * Quién es: la cabecera de la ficha.
 *
 * ══ Por qué la ficha empieza por un retrato y no por un formulario ══════════
 *
 * Porque era cinco tarjetas idénticas apiladas —alta, datos, cobro, acceso,
 * datos personales— y ninguna decía de quién estabas leyendo. El nombre solo
 * aparecía en el selector del marco, o sea fuera de la pantalla, así que la
 * ficha de Marta y la de Javier eran el mismo dibujo. Y esto es lo que más va a
 * crecer: con los condicionantes y los parámetros del entrenador detrás, sin
 * una cabecera que ancle a la persona serían nueve tarjetas de scroll.
 *
 * La inicial, el nombre y la línea de voz baja son la misma gramática que la
 * tarjeta de la lista de clientes, porque son la misma persona: esto es esa
 * tarjeta, abierta.
 *
 * ══ Los cuatro hechos, y por qué el peso está entre ellos sin guardarse ═════
 *
 * Edad, altura, peso y sexo son lo que se mira antes de decidir nada. Los tres
 * primeros no estaban en ninguna parte de la aplicación; el cuarto sí, escondido
 * en una fila de texto.
 *
 * El peso se LEE del histórico de pesajes y no se copia aquí. `clients` llegó a
 * tener una columna `current_weight` y la 0048 tuvo que borrarla porque enseñaba
 * el valor congelado del día que alguien dejó de rellenarla mientras la serie
 * decía otra cosa. Un dato viejo con etiqueta de actual es peor que un hueco.
 *
 * ══ Lo que está sin poner NO se pinta ══════════════════════════════════════
 *
 * Salvo en los cuatro hechos, que son la anatomía de una persona y cuyo hueco
 * informa (`domain/ficha.js`). Las filas de abajo —correo, teléfono, plan— solo
 * salen si tienen valor. Antes cada hueco decía «sin poner» en gris, y con cuatro
 * filas se aguantaba; con las quince que vienen detrás, la ficha de alguien
 * recién dado de alta sería una columna de grises que nadie va a rellenar por
 * leerla. El hueco se ofrece una vez, en «Editar».
 */
const Identidad = ({ client, weight, onUpdate }) => {
  const [editando, setEditando] = useState(false);

  const facts = identityFacts({ client, weight });
  /*
    El PLAN no está aquí, y estuvo: salía en la línea de voz baja del retrato y
    otra vez como fila, a diez píxeles. Dos veces el mismo dato en el mismo
    bloque no es redundancia inofensiva —hace dudar de si son dos cosas
    distintas—. Se queda arriba, que es donde acompaña a la antigüedad y donde ya
    lo dice el selector de cliente del marco.
  */
  const filas = [
    ['Correo', client.email],
    ['Teléfono', client.phone],
  ].filter(([, valor]) => valor);

  return (
    <Panel
      title="Quién es"
      className="col gap-4"
      action={
        !editando && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEditando(true)}
          >
            <Pencil size={13} /> Editar
          </button>
        )
      }
    >
      <div className="ficha-head">
        <span className="folio-mark" aria-hidden="true">
          {initials(client.name)}
        </span>
        <span className="who">
          <span className="name">{client.name}</span>
          <span className="sub">
            {identitySubtitle(client, dayMonthMaybeYear(client.startDate))}
          </span>
        </span>
      </div>

      {editando ? (
        <div className="swap-in">
          <ClientEditor
            client={client}
            onCancel={() => setEditando(false)}
            onSave={(fields) => {
              onUpdate(fields);
              setEditando(false);
            }}
          />
        </div>
      ) : (
        <div className="swap-in col gap-4">
          <div className="ficha-facts">
            {facts.map((fact) => (
              <div key={fact.id} className="ficha-fact">
                <span className="k">{fact.label}</span>
                <span className={`v${fact.value ? '' : ' is-empty'}`}>{fact.value ?? '—'}</span>
              </div>
            ))}
          </div>

          {filas.length > 0 && (
            <div className="col gap-2 t-sm">
              {filas.map(([label, valor]) => (
                <div key={label} className="row between gap-2">
                  <span className="t-secondary">{label}</span>
                  <span style={{ fontWeight: 600 }}>{valor}</span>
                </div>
              ))}
            </div>
          )}

          {!client.gender && (
            <Notice tone="warn">
              Sin el sexo, el % graso por pliegues se calcula con la fórmula de hombre. Ponlo aquí y
              los pliegues pasan a usar la que toca.
            </Notice>
          )}
        </div>
      )}
    </Panel>
  );
};

/**
 * El cobro.
 *
 * ══ Por qué esto tiene que estar aquí ═══════════════════════════════════════
 *
 * «Pago al día» / «Pago pendiente» se enseña en la cabecera de las SIETE
 * secciones de un cliente, así que acompaña al entrenador todo el rato. Y hasta
 * ahora la única forma de cambiarlo era la bandeja de «Hoy», y solo cuando el
 * cobro ya había vencido y había generado una tarea.
 *
 * O sea: si alguien te pagaba antes de tiempo, o querías volver a marcarle como
 * pendiente porque le devolvieron el recibo, **no había ningún sitio donde
 * hacerlo**. Un dato que se enseña en todas partes y no se puede tocar en
 * ninguna es peor que no enseñarlo: invita a buscar el botón que no existe.
 *
 * La bandeja de «Hoy» conserva su atajo, porque ahí es donde se despacha lo
 * vencido sin entrar en nadie. Esto es el sitio donde se mira y se corrige.
 *
 * ── Y por qué la fecha se puede escribir a mano ─────────────────────────────
 * Porque `next_payment_date` la escriben también las integraciones desde el
 * servidor al conciliar con Notion o Stripe. Quien no tenga ninguna conectada
 * —que es casi todo el mundo al empezar— necesita poder ponerla; quien sí, verá
 * que la próxima sincronización manda sobre lo que escriba aquí, y se dice.
 */
const Cobro = ({ client, onUpdate, onMarkPaid }) => {
  const alDia = client.paymentStatus === 'paid';
  const pago = paymentState(client);
  const periodo = billingPeriod(client.billingPeriod);
  const siguiente = nextPaymentAfter(client.nextPaymentDate, client.billingPeriod);

  return (
    <Panel title="Cobro" className="col gap-4">

      {/*
        ══ Cuánto, antes que cuándo ═══════════════════════════════════════════

        La ficha sabía la fecha de renovación y el nombre del plan, pero no el
        precio: la única pregunta económica que se hace un entrenador —«¿cuánto
        me tiene que pagar?»— no tenía respuesta aquí, y acababa en una hoja de
        cálculo aparte que se desincroniza a la tercera semana.

        La periodicidad no es un adorno del importe: es lo que convierte «marcar
        como pagado» en un gesto completo, porque adelanta la fecha sola. Sin
        ella hay que acordarse de moverla a mano, y la ficha del mes que viene
        miente.

        ── Los cuatro campos en UNA fila que envuelve ─────────────────────────
        Y no en dos filas de dos. Eran dos porque se añadieron en dos momentos, y
        el resultado es que los cuatro controles del mismo bloque se alineaban de
        dos maneras distintas —la de arriba por el borde inferior, la de abajo
        por el centro— con las etiquetas a cuatro alturas. En una sola fila la
        alineación es una, y al estrecharse la pantalla envuelven donde quepan en
        vez de saltar de dos en dos.
      */}
      <div className="row-end wrap gap-4">
        <Field label="Importe" hint="Lo que te paga cada ciclo" className="grow">
          {(props) => (
            <div className="input-suffix">
              <NumberInput
                {...props}
                center={false}
                placeholder="60"
                value={client.feeAmount ?? ''}
                onChange={(v) => onUpdate({ feeAmount: toNum(v) })}
              />
              <span aria-hidden="true">€</span>
            </div>
          )}
        </Field>

        <Field label="Cada cuánto" className="grow">
          {(props) => (
            <select
              {...props}
              className="select"
              value={client.billingPeriod || ''}
              onChange={(e) => onUpdate({ billingPeriod: e.target.value || null })}
            >
              <option value="">Sin definir</option>
              {BILLING_PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Próximo cobro" className="grow">
          {(props) => (
            <input
              {...props}
              type="date"
              className="input"
              value={client.nextPaymentDate || ''}
              onChange={(e) => onUpdate({ nextPaymentDate: e.target.value || null })}
            />
          )}
        </Field>

        <Field label="Estado">
          <SegmentedControl
            label="Estado del cobro"
            value={alDia ? 'paid' : 'pending'}
            /*
              Marcar «Al día» adelanta además la fecha al ciclo siguiente, que es
              lo que acaba de pasar de verdad. Volver a «Pendiente» NO la retrasa:
              deshacer una fecha adivinando cuál era la anterior es cómo se
              pierde el dato bueno.
            */
            onChange={(value) => (value === 'paid' ? onMarkPaid() : onUpdate({ paymentStatus: 'pending' }))}
            options={[
              { id: 'paid', label: 'Al día' },
              { id: 'pending', label: 'Pendiente' },
            ]}
          />
        </Field>
      </div>

      {/* En qué punto está, dicho con las mismas palabras que la cabecera y la
          bandeja de «Hoy». Si aquí dijera otra cosa, no habría forma de saber
          cuál de las dos es la buena. */}
      {pago.state !== 'no_date' && (
        <Notice tone={pago.tone === 'bad' ? 'error' : pago.tone === 'warn' ? 'warn' : 'info'}>
          {pago.label}. {pago.detail}
          {siguiente && pago.state !== 'overdue' && ` Al cobrarlo pasará al ${shortDate(siguiente)}.`}
        </Notice>
      )}

      <p className="t-xs t-tertiary">
        {client.plan
          ? `Su plan es «${client.plan}». Se cambia arriba, en Datos.`
          : 'No tiene plan escrito. Ponlo arriba, en Datos, para saber qué le vendiste.'}{' '}
        {!periodo && 'Sin periodicidad, la fecha del próximo cobro la llevas tú. '}
        Si conectas Notion o Stripe, la sincronización actualiza el estado y la fecha sola.
      </p>
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
const StepRow = ({ step, hecho, sinPortal, url, file, revisiones = [], onToggle, onLink, onFile }) => {
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
    <div className={`card-inset col gap-2 step-row${hecho ? ' is-done' : ''}`}>
      <div className="row between wrap gap-2">
        {/* Sigue siendo una casilla, y a propósito: un paso del alta es una
            TAREA que se marca hecha, no una opción que se incluye ni un ajuste
            que se enciende. Lo que cambia es que el cuadro ya no lo pinta el
            sistema operativo. Ver `.checkbox-row` en el CSS. */}
        {/*
          Un paso AUTOMÁTICO no se marca a mano: lo sabe la aplicación —tiene sus
          respuestas, sus fotos o su check-in— y la casilla se desactiva. Dejarla
          pulsable sería el peor de los dos mundos: el clic no cambiaría nada
          (`stepDone` ni mira la lista de hechos para estos) y el entrenador
          creería que se le ha roto algo.
        */}
        <label className="checkbox-row is-block grow" style={{ minWidth: 0 }}>
          <input
            type="checkbox"
            checked={hecho}
            disabled={Boolean(step.auto)}
            onChange={() => onToggle(!hecho)}
          />
          <span className="col gap-1" style={{ minWidth: 0 }}>
            {/*
              Lo HECHO baja de tono y lo pendiente se queda en tinta plena. En una
              lista de nueve pasos la única diferencia entre uno y otro era el
              cuadro de 18 px, así que había que leerlos todos para ver cuál
              faltaba — que es justo lo que este bloque existe para contestar.

              Bajar de tono y no tachar: un paso terminado no está cancelado.
            */}
            <span className={`t-sm${hecho ? ' t-secondary' : ''}`} style={{ fontWeight: hecho ? 500 : 600 }}>
              {step.label}
            </span>
            {step.hint && <span className="t-2xs t-tertiary">{step.hint}</span>}
            {step.auto && !hecho && (
              /*
                Decir que está esperando al cliente, y no solo que no está hecho:
                es la diferencia entre una tarea tuya y una que no depende de ti.

                Y si TODAVÍA NO PUEDE, decir eso en su lugar. Un cliente recién
                creado y sin invitar no tiene portal donde entregar nada, así que
                «esperando a que lo entregue él» era una espera que no iba a
                terminar nunca — y el entrenador no tenía por qué deducir que el
                paso que falta es otro, tres bloques más abajo.
              */
              <span className="t-2xs t-tertiary">
                {sinPortal ? 'Todavía no puede: no tiene acceso al portal.' : 'Esperando a que lo entregue él.'}
              </span>
            )}
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
const Alta = ({ client, estado, onProbar, onUpdate, onPreferences }) => {
  const { listReviewLinks, uploadIntakeFile } = useApp();
  const intake = clientIntake(client.preferences);
  const steps = intakeSteps(intake);
  const { done, total, complete } = intakeProgress(client, intake, estado);
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
    <Panel
      title="Alta"
      className="col gap-4"
      action={
        <span className={`badge ${complete ? 'badge-ok' : ''}`}>
          {complete ? <Check size={11} /> : null} {done} de {total}
        </span>
      }
    >

      {/*
        El aviso que faltaba y que dejaba el alta en un callejón: sin cuenta
        enlazada, el cliente no tiene dónde entrar, así que las tareas suyas no
        se van a marcar por mucho que se espere. Va arriba del todo y con el
        camino puesto, porque lo que hay que hacer no es nada de esta lista.
      */}
      {!client.clientProfileId && steps.some((s) => s.owner === 'client') && (
        <Notice
          tone="warn"
          action={
            /*
              Probarlo uno mismo NO necesita invitar a nadie: el portal de prueba
              es la misma aplicación con los mismos permisos, y sobre tus propios
              clientes tú puedes escribir igual que ellos. Sin este botón había
              que saber que existe el modo, entrar en él y buscar la pantalla —
              tres pasos para comprobar lo que acabas de configurar.
            */
            <button type="button" className="btn btn-secondary btn-sm" onClick={onProbar}>
              <Eye size={14} /> Probarlo yo
            </button>
          }
        >
          Todavía no le has dado acceso, así que él no puede contestarte. Invítale desde «Acceso y
          baja» — o pruébalo tú mismo: lo que rellenes en su portal se guarda de verdad.
        </Notice>
      )}

      <div className="col gap-2">
        {steps.map((step) => (
          <StepRow
            key={step.id}
            step={step}
            hecho={stepDone(step, client, intake, estado)}
            sinPortal={!client.clientProfileId}
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
  const {
    activeClient,
    anthropometry,
    conditions,
    equipment,
    checkIns,
    updateClient,
    updateClientPreferences,
    markClientPaid,
    setViewMode,
  } = useApp();
  const toast = useToast();
  const navigate = useNavigate();

  /* El marco ya redirige cuando el id no existe; esto solo cubre el instante
     entre montar la ruta y tener el cliente cargado. */
  if (!activeClient) return null;

  /* Leído de su serie de pesajes, no de una copia guardada en la ficha. Ver el
     comentario de `Identidad` y la migración 0048. */
  const peso = latestWeight(anthropometry[activeClient.id]?.history || []);
  /*
    Entrar en su portal por donde importa.

    El modo de prueba ya existía y se enciende desde el marco, pero deja a uno en
    el inicio del cliente — y lo que se quiere comprobar después de configurar el
    alta es su alta. Las dos cosas juntas convierten «a ver cómo le queda» en un
    clic en vez de en tres.
  */
  const probarSuPortal = () => {
    setViewMode('client');
    navigate('/mi/alta');
  };

  const estadoDelAlta = onboardingState({
    client: activeClient,
    equipment,
    checkIn: checkIns?.[activeClient.id],
  });

  /* El mismo aviso con «Deshacer» que en la bandeja de «Hoy»: es el mismo gesto
     y tiene que dejar la misma señal, se pulse donde se pulse. */
  const marcarCobrado = () => {
    const res = markClientPaid(activeClient.id);
    if (res?.ok === false) return;
    toast({
      text: `Cobro de ${activeClient.name} anotado y fecha adelantada.`,
      action: { label: 'Deshacer', onClick: () => res.undo() },
    });
  };

  return (
    <div className="stack">
      <PageHead
        title="Ficha"
        sub={`Quién es ${activeClient.name}, su acceso al portal, su cobro y su baja.`}
        /* Una acción y solo una, como manda §5.1: llevarse esto en un documento.
           Lo demás de esta pantalla se edita bloque a bloque. */
        action={<DownloadAnamnesis client={activeClient} />}
      />

      {/*
        ══ Los dos grupos, y por qué la ficha los necesitaba ═══════════════════

        Eran cinco bloques seguidos con el mismo peso, y no son del mismo asunto:
        uno habla de la PERSONA y cuatro de la RELACIÓN que tienes con ella —lo
        que le has entregado, lo que te paga, cómo entra y cómo sale—. Sin nada
        que lo dijera, la ficha se leía como una lista de cosas administrativas
        con los datos de alguien traspapelados en medio.

        Es el caso exacto para el que existe `GroupHead` (`docs/producto.md`
        §5.1 bis): dos tandas de bloques con asuntos distintos, nombradas en
        troquelada para que ordenen la pantalla sin competir con su título.

        El primero tiene un solo bloque HOY. Se queda igualmente, porque es donde
        entran los condicionantes —lesiones, alergias, patologías— y los
        parámetros propios del entrenador, y porque el grupo es lo que explica
        por qué el alta y el cobro están más abajo y no en medio.
      */}
      <GroupHead title="La persona" sub="Lo que no cambia de una semana a otra." />

      <Identidad
        client={activeClient}
        weight={peso}
        onUpdate={(fields) => updateClient(activeClient.id, fields)}
      />

      {/*
        La primera vez, una frase que dice de qué van los cuatro bloques de
        abajo. Sin ella, un entrenador que abre la ficha de alguien recién dado
        de alta ve cuatro tarjetas vacías y no tiene por qué adivinar que ahí es
        donde aterriza lo que le ha contado su cliente.

        Desaparece en cuanto hay algo, que es lo que la diferencia de un texto de
        ayuda: se lee una vez, no mil.
      */}
      {isProfileEmpty(activeClient.profile) && conditions.length === 0 && (
        <Notice tone="info">
          Aquí va lo que te cuenta de sí mismo al empezar: sus lesiones, cuándo puede entrenar, qué
          maquinaria tiene y cómo come. No decide nada solo — es lo que lees tú para montarle el
          onboarding, la rutina y la dieta.
        </Notice>
      )}

      {/* Lo que condiciona lo que le puedes poner. Va delante de los tres
          bloques de perfil porque es lo único de esta tanda que además AVISA:
          sale por su cuenta en su rutina y en su dieta. */}
      <ConditionsPanel client={activeClient} />

      {/*
        Los tres bloques del perfil, a dos columnas. Salen del catálogo
        (`domain/profile.js`), así que esta lista no crece cuando crecen los
        campos — solo cuando se añade una tanda entera.

        A dos columnas y no apilados porque son filas cortas de etiqueta y valor:
        a ancho completo dejan un río de blanco en el centro que es exactamente
        lo que hacía que la ficha se leyera como un formulario abandonado.
      */}
      <div className="grid-2">
        {PROFILE_GROUPS.map((grupo) => (
          <ProfileBlock
            key={grupo.id}
            client={activeClient}
            group={grupo.id}
            onSave={(profile) => updateClient(activeClient.id, { profile: cleanProfile(profile) })}
          />
        ))}
      </div>

      {/* Sus respuestas a las preguntas propias del cuestionario, si las hay.
          Aparte de los dos bloques de arriba porque esas preguntas no están en
          el catálogo del perfil: las inventa cada entrenador. */}
      <CustomAnswers client={activeClient} />

      {/*
        Su maquinaria, a ancho completo y al final del grupo.

        Completo porque es una rejilla de fotos y no una lista de filas: en media
        columna caben dos miniaturas por fila y cuarenta máquinas se convierten en
        una tira de veinte filas.

        Al final porque es lo último que se rellena —hay que pedirle las fotos— y
        lo primero que se consulta después, pero desde su RUTINA y no desde aquí.
      */}
      <EquipmentPanel
        client={activeClient}
        onSaveProfile={(profile) => updateClient(activeClient.id, { profile })}
      />

      <GroupHead title="Vuestra relación" sub="Su puesta en marcha, su cobro y su acceso." />

      {/* El alta va la primera del grupo: es lo que está sin terminar cuando
          alguien acaba de entrar, y lo que se viene a mirar en las primeras
          semanas. */}
      <Alta
        client={activeClient}
        /* Lo que ha entregado él. Sale del mismo sitio que su portal
           (`domain/onboardingState.js`), así que los dos no pueden discrepar
           sobre si el cuestionario está contestado. */
        estado={estadoDelAlta}
        onProbar={probarSuPortal}
        onUpdate={(fields) => updateClient(activeClient.id, fields)}
        onPreferences={(intake) =>
          updateClientPreferences(activeClient.id, 'intake', intakeToPreferences(intake))
        }
      />

      <Cobro
        client={activeClient}
        onUpdate={(fields) => updateClient(activeClient.id, fields)}
        onMarkPaid={marcarCobrado}
      />

      <Panel title="Acceso y baja" className="col gap-3">
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
