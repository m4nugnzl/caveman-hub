import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Eye,
  ExternalLink,
  FileText,
  FolderOpen,
  Link2,
  Mail,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Send,
  TriangleAlert,
  Upload,
  UserCheck,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { clientPath } from '@/routes';

import { useApp } from '@/context/AppContext';
import { ATTACHMENT_ACCEPT, attachmentName } from '@/domain/attachments';
import { BILLING_PERIODS, billingPeriod, nextPaymentAfter, paymentState } from '@/domain/billing';
import { latestWeight } from '@/domain/anthropometry';
import { MAX_AGE, MIN_AGE, age, birthDateForAge, identityFacts } from '@/domain/ficha';
import { onboardingState } from '@/domain/onboardingState';
import { PROFILE_GROUPS, cleanProfile } from '@/domain/profile';
import { shortDate } from '@/lib/dates';
import { fmt, toNum } from '@/lib/num';
import {
  clientIntake,
  clientSteps,
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
  Notice,
  NumberInput,
  SegmentedControl,
} from '@/components/ui/primitives';
import { Mando } from '@/components/ui/Mando';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { ConditionsPanel } from '@/components/conditions/ConditionsPanel';
import { ClientDataPanel, DatosPersonalesPie, useConsent } from './ClientDataPanel';
import { ClientDrive, useClientDrive } from './ClientDrive';
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
    /* Se teclea la EDAD y se guarda la FECHA. El porqué de las dos mitades está
       en `birthDateForAge`; aquí solo viajan las dos, porque la fecha exacta de
       quien la tenga no se puede perder por haber abierto el formulario. */
    edad: age(client.birthDate) ?? '',
    birthDate: client.birthDate || '',
    heightCm: client.heightCm ?? '',
    plan: client.plan || '',
  });

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const limpio = form.name.trim();

  /*
    ══ La edad se escribe; la fecha se recalcula SOLO si cambia ═══════════════

    Quien tenga guardado su día exacto de nacimiento no lo pierde por abrir la
    ficha: mientras la edad tecleada siga siendo la que ya tenía, la fecha se
    queda como estaba. Reescribirla «por si acaso» cambiaría un 15 de junio por
    un 26 de agosto sin que nadie lo hubiera pedido.
  */
  const edadOriginal = age(client.birthDate);
  const setEdad = (e) => {
    const edad = e.target.value;
    setForm((f) => ({
      ...f,
      edad,
      birthDate:
        edad === ''
          ? ''
          : Number(edad) === edadOriginal
            ? client.birthDate || ''
            : birthDateForAge(edad) || '',
    }));
  };

  /* Un dedo de más y la ficha diría «4 años» o «204». Se corta aquí y con
     palabras, en vez de dejar que lo rechace la restricción de la base con su
     mensaje de Postgres. */
  const edadMal =
    form.edad !== '' && (!Number.isFinite(Number(form.edad)) || birthDateForAge(form.edad) === null);

  return (
    <form
      className="col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!limpio || edadMal) return;
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
        {/*
          ══ Se pregunta la EDAD, no el día que nació ═══════════════════════

          Era un selector de fecha del navegador, y para poner un dato de dos
          dígitos había que desplegar ochenta años y recorrerlos. Nadie se sabe
          el cumpleaños de la persona a la que entrena; su edad, sí.

          Por dentro se sigue guardando la fecha —una edad escrita en la base
          miente sola al cabo de un año— y quien tenga el día exacto no lo
          pierde. Ver `birthDateForAge`.
        */}
        <Field
          label="Edad"
          hint="Se guarda como fecha, para que no envejezca sola. Entra en el gasto energético y en sus zonas de pulso."
          error={edadMal ? `Entre ${MIN_AGE} y ${MAX_AGE} años.` : null}
        >
          {(props) => (
            <div className="input-suffix">
              <NumberInput
                {...props}
                center={false}
                placeholder="34"
                value={form.edad}
                onChange={(v) => setEdad({ target: { value: v } })}
              />
              <span aria-hidden="true">años</span>
            </div>
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
        <button type="submit" className="btn btn-primary btn-sm" disabled={!limpio || edadMal}>
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
 * La anatomía: los cuatro hechos de la persona, en la fila de mando.
 *
 * ══ Por qué esto ya no es una tarjeta ══════════════════════════════════════
 *
 * Fue «Quién es»: un panel con la inicial, el nombre, la línea de plan y
 * antigüedad y una rejilla de cuatro hechos. Y estaba diciendo por segunda vez
 * lo que la cabecera del cliente dice cien píxeles más arriba — la misma
 * inicial, el mismo nombre y, literalmente, la misma cadena: `identitySubtitle`
 * compone «Sin plan · desde 11 ago» con los mismos dos campos y en el mismo
 * orden que el subtítulo del selector (`CoachLayout`). Una ficha que abre
 * repitiéndose gasta su mejor franja en no decir nada nuevo.
 *
 * Lo que sí era suyo son los cuatro hechos, y suben a la fila de mando, que
 * estaba vacía: `Mando` se llamaba sin título y sin contexto, o sea una banda de
 * botones flotando a la derecha encima de un panel. Ahora esa fila dice lo que
 * hay que saber de esta persona antes de decidir nada —34 años, 178 cm, 81,4 kg,
 * hombre— y a la derecha, lo que se puede hacer con ella.
 *
 * ══ El hueco invita; no se pinta como una raya ═════════════════════════════
 *
 * Los cuatro hechos se preguntan siempre y el hueco informa (`domain/ficha.js`),
 * pero cuatro guiones en fila no informan: parecen una pantalla rota. En un
 * cliente recién dado de alta, la tira más ancha de la ficha era «— — — —».
 *
 * Así que lo que falta se junta en UN gesto —«+ Altura, Peso»— que abre el mismo
 * editor. Sigue diciendo qué no le has tomado, y además ofrece tomarlo.
 *
 * ── Y el aviso del sexo se va con él ────────────────────────────────────────
 * El cartel ámbar de «sin el sexo, los pliegues usan la fórmula de hombre» era
 * la tercera alarma encendida en la ficha de alguien que acaba de entrar y al
 * que no le pasa nada: solo está vacío. La condición no se pierde —viaja en el
 * signo del hueco y el cartel entero está dentro del editor, que es donde se
 * arregla— pero deja de gritar desde una pantalla donde no hay nada roto.
 */
const Anatomia = ({ client, weight, onEditar }) => {
  const facts = identityFacts({ client, weight });
  const puestos = facts.filter((f) => f.value);
  const faltan = facts.filter((f) => !f.value);
  const faltaSexo = faltan.some((f) => f.id === 'gender');

  return (
    <div className="anatomia">
      {puestos.map((fact) => (
        /* Sin etiqueta: las unidades ya la dicen —«34 años», «178 cm», «81,4 kg»,
           «Hombre»—. La etiqueta viaja en el título para quien la necesite. */
        <span key={fact.id} className="anatomia-dato" title={fact.label}>
          {fact.value}
        </span>
      ))}

      {faltan.length > 0 && (
        <button
          type="button"
          className="anatomia-hueco"
          onClick={onEditar}
          title={
            faltaSexo
              ? 'Sin el sexo, el % graso por pliegues se calcula con la fórmula de hombre.'
              : undefined
          }
        >
          {faltaSexo ? <TriangleAlert size={12} /> : <Plus size={12} />}
          {faltan.map((f) => f.label).join(', ')}
        </button>
      )}

      {/* El correo y el teléfono de una ficha son para escribirle y para
          llamarle. Estaban como dos filas de texto plano que había que copiar a
          mano; aquí se pulsan. */}
      {client.email && (
        <a className="anatomia-contacto" href={`mailto:${client.email}`} title="Escribirle">
          <Mail size={13} />
          {client.email}
        </a>
      )}
      {client.phone && (
        <a className="anatomia-contacto" href={`tel:${client.phone.replace(/\s+/g, '')}`} title="Llamarle">
          <Phone size={13} />
          {client.phone}
        </a>
      )}
    </div>
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
 * ── Y por qué ya no es una tarjeta, sino la hoja de una celda del pulso ─────
 * Porque el cobro se decía TRES veces en la misma pantalla: la chapa de la
 * cabecera del cliente, el segmentado «Al día / Pendiente» y el cartel rojo de
 * «vencido hace 28 días». Y lo que se pregunta al abrir una ficha —«¿cuánto y
 * cuándo me paga?»— es una CIFRA, no un formulario de cuatro controles.
 *
 * Ahora la cifra está arriba, en su celda del pulso, y esto es lo que hay
 * detrás al pulsarla. El formulario no ha cambiado: ha dejado de ocupar media
 * columna para contestar algo que cabe en una línea.
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
    <div className="col gap-4">

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
                /*
                  El ÚNICO campo de la ficha que se teclea contra la base, y por
                  eso el único que va con debounce. Todo lo demás de esta
                  pantalla —identidad, perfil— se edita en un borrador y se
                  guarda con un botón; aquí no, porque son cuatro controles
                  sueltos y un «Guardar» para cuatro controles que ya se
                  entienden solos sería un paso de más.

                  Con `immediate` —que es el valor de serie de `updateClient`—
                  cada dígito de «1250» era un PATCH a Postgres. La cola acumula
                  los parches por cliente (ver `useClients`), así que agruparlos
                  no pierde ninguno, y `flushAll` los suelta al cerrar la pestaña.
                */
                onChange={(v) => onUpdate({ feeAmount: toNum(v) }, { immediate: false })}
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
        {!client.plan && 'Sin plan escrito: ponlo en «Editar». '}
        {!periodo && 'Sin periodicidad, la fecha la llevas tú. '}
        Con Notion o Stripe conectados, estado y fecha se actualizan solos.
      </p>
    </div>
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
  const confirm = useConfirm();

  /*
    ══ Cuando el cliente ha perdido su cuenta (migración 0083) ════════════════

    Esta rama enseñaba solo la insignia de «tiene su cuenta enlazada», y era un
    callejón sin salida: el día que un cliente olvida su contraseña, pide el
    correo de recuperación y no le llega —el SMTP compartido de Supabase, ver
    `docs/correo-transaccional.md`—, su entrenador abría esta pantalla, leía que
    todo estaba bien y no tenía ni un botón que pulsar. La única salida era
    entrar al panel de Supabase.

    El gesto no toca la cuenta de nadie: suelta la ficha y emite un enlace nuevo,
    el mismo de siempre. El historial cuelga de la ficha, así que no se pierde
    nada al entrar con otra cuenta.
  */
  const reemitir = async () => {
    const ok = await confirm({
      title: `¿Volver a dar acceso a ${client.name}?`,
      message:
        'Su cuenta actual dejará de estar enlazada a esta ficha y no podrá entrar con ella. Te damos un enlace nuevo para que se cree otra —o entre con Google— y recupere la ficha entera: su rutina, su dieta, sus registros y sus fotos siguen aquí. Úsalo cuando haya perdido la contraseña o el correo con el que se registró.',
      confirmLabel: 'Emitir acceso nuevo',
      tone: 'danger',
    });
    if (ok) send(client, { reemitir: true });
  };

  if (client.clientProfileId) {
    return (
      <div className="card-inset col gap-2">
        <div className="row between wrap gap-2 t-sm">
          <span className="t-secondary">Acceso al portal</span>
          <div className="row gap-2">
            <span className="badge badge-ok">
              <UserCheck size={11} /> Tiene su cuenta enlazada
            </span>
            {/*
              Secundario y a la derecha de la insignia: casi nunca hace falta, y
              lo que esta línea dice normalmente es «esto está bien». Un botón
              primario aquí invitaría a pulsarlo por curiosidad, y lo que hay
              detrás echa a alguien de su cuenta.
            */}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={reemitir}
              disabled={busy}
            >
              {busy ? 'Generando…' : 'Perdió el acceso'}
            </button>
          </div>
        </div>

        {result &&
          (result.ok ? (
            <Notice tone={result.copied ? 'success' : 'info'}>{inviteMessage(result)}</Notice>
          ) : (
            <Notice tone="error">{result.error}</Notice>
          ))}
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
    <div className="row between wrap gap-2 t-sm">
      <span className="t-xs t-tertiary">
        Archivarle le quita de la lista y de tu plan; todo lo suyo se conserva.
      </span>
      <button
        type="button"
        className="cab-accion is-puerta"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setClientArchived(client.id, true);
        }}
      >
        Archivar
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
const StepRow = ({
  step,
  hecho,
  sinPortal,
  url,
  file,
  revisiones = [],
  carpeta = null,
  onToggle,
  onLink,
  onFile,
  onDriveList,
  onDriveUpload,
}) => {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState(url || '');
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef(null);

  /* Lo que hay en su carpeta de Drive. `null` es «no lo he preguntado», que no es
     lo mismo que «está vacía»: la primera no ha costado una llamada a Google y la
     segunda sí, y la pantalla dice cosas distintas. */
  const [driveDocs, setDriveDocs] = useState(null);
  const [cargandoDrive, setCargandoDrive] = useState(false);
  const [subiendoDrive, setSubiendoDrive] = useState(false);
  const driveInput = useRef(null);

  const verSuDrive = async () => {
    setCargandoDrive(true);
    setError('');
    const res = await onDriveList();
    setCargandoDrive(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDriveDocs(res.files || []);
  };

  /*
    Subir a su carpeta y dejar el enlace PUESTO en el borrador, no guardado.

    Guardarlo solo sería más corto y quitaría la última mirada: lo que queda en
    el paso es lo que el cliente va a abrir, y comprobar que apunta donde toca es
    media revisión (es el mismo argumento por el que el enlace se ve siempre, no
    solo al editar). Así que se rellena el campo y se guarda con el mismo botón
    que todo lo demás.
  */
  const subirASuDrive = async (elegido) => {
    if (!elegido) return;
    setSubiendoDrive(true);
    setError('');
    const res = await onDriveUpload(elegido);
    setSubiendoDrive(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDraft(res.file?.webViewLink || '');
    /* La lista se queda vieja en cuanto se sube algo: si estaba abierta, se
       vuelve a pedir para que lo recién subido aparezca donde se espera. */
    if (driveDocs !== null) verSuDrive();
  };

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
            ══ O de su carpeta de Drive ═══════════════════════════════════════

            La regla que esto sigue: **donde la aplicación pregunta «¿de dónde
            sale esto?», Drive tiene que ser una de las respuestas**. Aquí ya
            preguntaba —enlace, revisión grabada, archivo subido— y Drive faltaba,
            justo cuando es donde el entrenador tiene su material de verdad.

            Encaja sin inventar nada porque un archivo de Drive acaba siendo un
            ENLACE: no hay ruta nueva, ni almacenamiento nuevo, ni migración. Lo
            que se pega en el paso es su `webViewLink`, igual que si lo hubiera
            copiado a mano — que es exactamente lo que hacía hasta ahora.

            Solo aparece si este cliente tiene carpeta. Sin ella no hay nada que
            listar, y ofrecer «elige de su Drive» para contestar «no tiene» es
            hacer trabajar al otro para nada.
          */}
          {carpeta && (
            <div className="col gap-1">
              <span className="t-2xs t-tertiary">O de su carpeta de Drive:</span>
              <div className="rail-wrap" role="group" aria-label="Archivos de su carpeta de Drive">
                {/* No se pide al abrir el editor: es una llamada a Google, y la
                    mayoría de las veces se viene aquí a pegar un enlace de
                    YouTube. Se trae cuando se pide. */}
                {driveDocs === null ? (
                  <button
                    type="button"
                    className="chip chip-dashed"
                    disabled={cargandoDrive}
                    onClick={verSuDrive}
                  >
                    <FolderOpen size={12} /> {cargandoDrive ? 'Mirando…' : 'Ver qué hay en su carpeta'}
                  </button>
                ) : driveDocs.length === 0 ? (
                  <span className="t-2xs t-tertiary">Su carpeta está vacía.</span>
                ) : (
                  driveDocs.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      className="chip chip-dashed"
                      onClick={() => setDraft(doc.webViewLink)}
                      title={doc.name}
                    >
                      <FileText size={12} /> {doc.name}
                    </button>
                  ))
                )}

                {/*
                  Y subir ahí, que es la otra mitad de «usar Drive».

                  Va a SU carpeta, así que queda con el resto de lo suyo y él lo
                  abre con su cuenta de Google. Es distinto del botón de abajo, y
                  la diferencia se dice: aquello se guarda en la aplicación y se
                  abre desde ella, con una dirección que caduca.
                */}
                <input
                  ref={driveInput}
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    subirASuDrive(e.target.files?.[0] || null);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="chip chip-dashed"
                  disabled={subiendoDrive}
                  onClick={() => driveInput.current?.click()}
                >
                  <Upload size={12} /> {subiendoDrive ? 'Subiendo a Drive…' : 'Subir a su Drive'}
                </button>
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
            {/* Con Drive delante hay dos botones de subir, y la diferencia hay
                que decirla o se elige a cara o cruz: lo de aquí se guarda EN LA
                APLICACIÓN y él lo abre desde su portal con una dirección que
                caduca; lo de Drive queda en su carpeta y lo abre con su cuenta de
                Google. Sin Drive conectado la frase de siempre vale y no sobra
                nada. */}
            <span className="t-2xs t-tertiary">
              {carpeta
                ? 'O guárdalo en la aplicación, y lo abre desde su portal:'
                : 'O súbelo, si no está en ninguna parte:'}
            </span>
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
 * El alta de este cliente: lo que hay detrás de su celda del pulso.
 *
 * Los pasos son los que el entrenador haya decidido en Ajustes → Protocolo. Si no
 * ha decidido nada, son los dos que la aplicación traía de siempre; si ha
 * decidido que no quiere ninguno, no hay ni celda ni hoja — que es exactamente
 * la diferencia entre proponer una forma de trabajar e imponerla.
 *
 * ══ Lo que se sabe del alta ya no se calcula dos veces ═════════════════════
 *
 * El reparto (`intake`), los pasos y el progreso los calcula la pantalla y
 * bajan por props: la celda del pulso y esta hoja tienen que estar de acuerdo
 * sobre cuántos pasos hay y cuántos van hechos, y dos llamadas a
 * `intakeProgress` con los mismos datos son dos sitios donde equivocarse.
 *
 * ══ Y las revisiones se piden al ABRIR, no al entrar en la ficha ═══════════
 *
 * Antes este bloque estaba siempre montado, así que `listReviewLinks` salía a la
 * base cada vez que alguien miraba la ficha de cualquiera —aunque no fuese a
 * tocar el alta—. Dentro de la hoja, la consulta sale cuando de verdad hay algo
 * que enlazar. La carpeta ya ni siquiera se pide aquí: la trae la pantalla, que
 * la necesita también para la celda de «Carpeta», y era la misma fila leída dos
 * veces (ver `useClientDrive`).
 */
const Alta = ({ client, estado, intake, steps, progress, carpeta, onProbar, onUpdate, onPreferences }) => {
  const { listReviewLinks, uploadIntakeFile, driveFiles, driveUpload } = useApp();
  const { done, total, complete } = progress;
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
    <div className="col gap-4">
      {/*
        ══ «Ver su alta» está SIEMPRE ═══════════════════════════════════════

        Nació dentro del aviso de «todavía no le has invitado», y ahí estaba mal
        por dos motivos: solo aparecía en el hueco entre crear un cliente e
        invitarle —que dura un rato— y desaparecía justo cuando más se quiere,
        que es después de cambiar lo que se le pide para ver cómo le queda.

        El marco ya tiene un «Ver su portal» permanente en la cabecera del
        cliente, pero deja a uno en el INICIO del cliente. Éste va a su alta,
        que es lo que se acaba de configurar aquí.

        La barra de progreso NO se repite: la lleva la celda del pulso, que sigue
        a la vista con la hoja abierta —para eso entra por el canto y no tapa—.
      */}
      <div className="row between wrap gap-2">
        <span className={`badge ${complete ? 'badge-ok' : ''}`}>
          {complete ? <Check size={11} /> : null} {done} de {total}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onProbar}>
          <Eye size={14} /> Ver su alta
        </button>
      </div>

      {/*
        El aviso que faltaba y que dejaba el alta en un callejón: sin cuenta
        enlazada, el cliente no tiene dónde entrar, así que las tareas suyas no
        se van a marcar por mucho que se espere. Va arriba del todo y con el
        camino puesto, porque lo que hay que hacer no es nada de esta lista.
      */}
      {!client.clientProfileId && steps.some((s) => s.owner === 'client') && (
        <Notice tone="warn">
          Todavía no le has dado acceso, así que él no puede contestarte. Invítale desde «Acceso y
          baja» — o pruébalo tú con «Ver su alta»: sobre tus propios clientes escribes igual que
          ellos, así que lo que rellenes ahí se guarda de verdad.
        </Notice>
      )}

      {/*
        ══ «A esta persona no le pides NADA», dicho como un aviso ═════════════

        Era una línea gris de letra pequeña al final del bloque, y la letra
        pequeña gris es donde no se mira. El resultado fue el que tenía que ser:
        se da de alta a alguien, se entra en su portal a ver cómo le queda, y está
        vacío — sin cuestionario, sin fotos, sin nada que entregar. Desde ahí lo
        que se concluye es que la aplicación está rota, no que el alta de uno no
        pide nada.

        Y le pasa a más gente de la que parece. Quien guardó su plantilla del alta
        ANTES de que existieran las entregas del cliente tiene guardado un reparto
        sin ellas, y esa plantilla se copia tal cual a cada cliente nuevo: el que
        nunca tocó esa pantalla recibe el valor de serie —que sí las trae— y el
        que la tocó una vez hace meses no las verá nunca más, en silencio.

        Se pregunta con `clientSteps` y no con `steps.some(s => s.owner === …)`,
        que es como estaba: aquello mira el dueño del CATÁLOGO e ignora el reparto
        que haya puesto el entrenador (`intake.owners`), así que un paso que él se
        hubiera pasado a su lado seguía contando como del cliente. Dos formas de
        contestar la misma pregunta, y una mal.
      */}
      {clientSteps(intake).length === 0 && (
        <p className="t-xs alta-aviso">
          <TriangleAlert size={12} aria-hidden="true" />
          <span>
            No le pides nada a él: su portal no tendrá cuestionario ni entregas. Se encienden en{' '}
            <Link to="/ajustes/protocolo#alta">Ajustes → Protocolo</Link>.
          </span>
        </p>
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
            carpeta={carpeta}
            /* Las dos de Drive se pasan ya atadas a ESTE cliente: la fila no
               tiene por qué saber de quién es la carpeta que está enseñando. */
            onDriveList={() => driveFiles(client.id)}
            onDriveUpload={(archivo) => driveUpload(client.id, archivo)}
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
    </div>
  );
};

/**
 * Una celda del pulso.
 *
 * Es un dato con su frase y un gesto: se lee sin abrir nada, y abre su hoja al
 * pulsarla. La frase de abajo lleva el juicio —`veredicto`, el mismo de toda la
 * casa— y por eso es lo único con color aquí: la ley del color dice que el
 * semáforo va pegado a la cifra que valora, y no en el borde de una tarjeta.
 *
 * ── Por qué no es `.tile` ───────────────────────────────────────────────────
 * Porque `.tile` es la voz de una CIFRA —30 px, tabulares, para «4 sin
 * entrenar»— y aquí la mitad de los valores son palabras: «Con cuenta», «Sin
 * crear». A 30 px, cuatro palabras en fila gritan. Misma superficie y mismo
 * tacto; otra voz.
 */
const CeldaPulso = ({ rotulo, valor, frase, tono, children, onClick }) => (
  <button type="button" className="ficha-pulso-celda" onClick={onClick}>
    <span className="k">{rotulo}</span>
    <span className="v">{valor}</span>
    {children}
    <span className={`veredicto${tono ? ` is-${tono}` : ''}`}>{frase}</span>
  </button>
);

export const ClientFile = () => {
  const {
    activeClient,
    anthropometry,
    equipment,
    checkIns,
    updateClient,
    updateClientPreferences,
    markClientPaid,
    openClientView,
  } = useApp();
  const toast = useToast();
  /* Qué hoja está abierta: `identidad`, `alta`, `cobro`, `acceso` o `carpeta`.
     Una sola, y en un solo estado: dos banderas independientes acabarían con dos
     hojas abiertas a la vez el día que alguien añada la tercera. */
  const [hoja, setHoja] = useState(null);
  const cerrar = () => setHoja(null);

  /* Su carpeta y si hay Drive, leído una vez para toda la pantalla: lo usan la
     celda de «Carpeta», su hoja y los pasos del alta que ofrecen subir algo. */
  const drive = useClientDrive(activeClient || { id: null });
  /* El consentimiento lo lee la pantalla porque lo enseña el PIE, que está a la
     vista; la hoja de datos personales solo lo usa detrás. */
  const consent = useConsent(activeClient?.id);

  /* El marco ya redirige cuando el id no existe; esto solo cubre el instante
     entre montar la ruta y tener el cliente cargado. */
  if (!activeClient) return null;

  /* Leído de su serie de pesajes, no de una copia guardada en la ficha. Ver el
     comentario de `Anatomia` y la migración 0048. */
  const peso = latestWeight(anthropometry[activeClient.id]?.history || []);
  /*
    Entrar en su portal por donde importa.

    El modo de prueba ya existía y se enciende desde el marco, pero deja a uno en
    el inicio del cliente — y lo que se quiere comprobar después de configurar el
    alta es su alta. Las dos cosas juntas convierten «a ver cómo le queda» en un
    clic en vez de en tres.
  */
  const probarSuPortal = () => {
    openClientView('/mi/alta');
  };

  const estadoDelAlta = onboardingState({
    client: activeClient,
    equipment,
    checkIn: checkIns?.[activeClient.id],
  });

  /* El alta se cuenta AQUÍ y una sola vez: la celda del pulso y la hoja tienen
     que estar de acuerdo sobre cuántos pasos hay y cuántos van hechos. */
  const intake = clientIntake(activeClient.preferences);
  const pasosDelAlta = intakeSteps(intake);
  const progresoDelAlta = intakeProgress(activeClient, intake, estadoDelAlta);

  const pago = paymentState(activeClient);
  const periodo = billingPeriod(activeClient.billingPeriod);

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

  const editar = (fields, opciones) => updateClient(activeClient.id, fields, opciones);

  return (
    <div className="ficha-pagina cascada">
      {/*
        ══ LA FILA DE MANDO LLEVA LA ANATOMÍA ════════════════════════════════

        Estaba vacía: `Mando` sin título y sin contexto, o sea dos botones
        flotando a la derecha de una banda de aire, encima del panel que repetía
        el nombre que ya dice la cabecera del cliente. Ahora esta línea contesta
        lo que se pregunta al abrir la ficha de alguien —qué años tiene, cuánto
        mide, cuánto pesa y cómo contactarle— y la derecha sigue siendo lo que se
        puede hacer con él. La misma gramática que las otras cuatro pestañas.
      */}
      <Mando
        acciones={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setHoja('identidad')}
            >
              <Pencil size={13} /> Editar
            </button>
            <Link className="cab-accion is-principal" to={clientPath(activeClient.id, 'calendario')}>
              Su calendario
            </Link>
            <DownloadAnamnesis client={activeClient} className="btn btn-secondary btn-sm" />
          </>
        }
      >
        <Anatomia
          client={activeClient}
          weight={peso}
          onEditar={() => setHoja('identidad')}
        />
      </Mando>

      {/*
        ══ EL PULSO: en qué punto está esta persona contigo ══════════════════

        Era una columna de 340 px con cuatro tarjetas —alta, cobro, acceso,
        carpeta— y tenía tres problemas a la vez. Pesaban lo mismo que los ocho
        paneles de al lado, así que nada destacaba. Contestaban con formularios
        preguntas que son cifras: «¿cuánto me paga?» se leía en cuatro cajas de
        texto. Y por debajo de 1200 px la columna caía al FONDO de la página, o
        sea que en un portátil pequeño «cuándo cobra» volvía a estar a dos mil
        píxeles de scroll — justo el defecto que las dos columnas venían a
        arreglar.

        Como banda son cuatro datos que se leen de un vistazo, no caen nunca al
        fondo, y cada uno abre la hoja donde se toca. Esa hoja entraba por el
        canto derecho «para no tapar el pulso», y era un argumento falso: detrás
        no hay nada que comparar mientras se escribe un importe. Ahora se abre
        CENTRADA, como todo lo que se decide (ver «LAS HOJAS» más abajo).

        Las celdas que no existen no se pintan: sin pasos de alta no hay alta que
        seguir, y sin Drive conectado no hay carpeta. La banda es lo que esta
        asesoría tiene, no una plantilla con huecos.
      */}
      <div className="ficha-pulso">
        {pasosDelAlta.length > 0 && (
          <CeldaPulso
            rotulo="Alta"
            valor={`${progresoDelAlta.done} de ${progresoDelAlta.total}`}
            frase={progresoDelAlta.complete ? 'Terminada' : 'Pasos por cerrar'}
            tono={progresoDelAlta.complete ? 'good' : ''}
            onClick={() => setHoja('alta')}
          >
            {/*
              La misma barra que ve él en su portal. No es decoración duplicada:
              es que las dos pantallas hablen el mismo idioma sobre lo mismo. El
              cliente ve cuánto lleva; el entrenador veía una fracción que hay que
              leer y comparar, y con nueve pasos «cómo va el alta de este» es una
              pregunta de un vistazo — que es lo que contesta una barra.
            */}
            <span
              className="form-progress"
              role="progressbar"
              aria-valuenow={progresoDelAlta.done}
              aria-valuemin={0}
              aria-valuemax={progresoDelAlta.total}
              aria-label="Pasos del alta terminados"
            >
              <i
                style={{
                  width: `${progresoDelAlta.total ? (progresoDelAlta.done / progresoDelAlta.total) * 100 : 0}%`,
                }}
              />
            </span>
          </CeldaPulso>
        )}

        <CeldaPulso
          rotulo="Cobro"
          /* La pregunta económica de un entrenador es «cuánto y cada cuánto», y
             en una línea. El formulario que la escribe está detrás. */
          valor={
            activeClient.feeAmount
              ? `${fmt(activeClient.feeAmount, { unit: ' €' })}${periodo?.short ? ` / ${periodo.short}` : ''}`
              : 'Sin importe'
          }
          frase={pago.state === 'no_date' && !activeClient.feeAmount ? 'Ponle lo que te paga' : pago.label}
          tono={pago.tone === 'bad' ? 'bad' : pago.tone === 'warn' ? 'warn' : ''}
          onClick={() => setHoja('cobro')}
        />

        <CeldaPulso
          rotulo="Acceso"
          valor={activeClient.clientProfileId ? 'Con cuenta' : 'Sin invitar'}
          /*
            Sin tono: que alguien recién dado de alta no tenga aún su enlace no es
            una avería, es el minuto uno. El ámbar de esta línea era la cuarta
            alarma encendida en una ficha donde no pasaba nada.
          */
          frase={
            activeClient.clientProfileId ? 'Entra a su portal' : 'Mándale su enlace de entrada'
          }
          onClick={() => setHoja('acceso')}
        />

        {drive.conectado && (
          <CeldaPulso
            rotulo="Carpeta"
            valor={drive.folder ? 'Creada' : 'Sin crear'}
            frase={
              drive.folder
                ? drive.folder.uploads
                  ? 'Él también puede dejar cosas'
                  : 'Solo dejas tú'
                : 'Se crea sola al usarla'
            }
            onClick={() => setHoja('carpeta')}
          />
        )}
      </div>

      {/*
        ══ EL CUERPO: una hoja, no cinco tarjetas ════════════════════════════

        Con datos de verdad —diecinueve campos, veintitrés fotos— la rejilla de
        tarjetas se veía como lo que era: cinco cajas con cinco cantos, cinco
        fondos, cinco subtítulos explicando de qué iba cada una y cinco botones
        de editar, todas contestando a LA MISMA pregunta —«¿qué sé de esta
        persona antes de montarle el programa?»—. El dibujo pesaba más que el
        dato, y las cajas acababan a alturas distintas.

        Aquí no hay más que un asunto, así que hay una sola superficie. Los
        bloques son `desnudo`: rótulo, su gesto callado a la derecha y el
        contenido, separados por aire y un filete. El orden es el de trabajo — lo
        que le VETA algo, lo que te contó de su entreno, lo que te contó de su
        comida, lo que le preguntaste tú, y su gimnasio al final, que es lo que
        se consulta desde su rutina y no desde aquí.
      */}
      <div className="ficha-cuerpo">
        <ConditionsPanel client={activeClient} />

        {PROFILE_GROUPS.map((grupo) => (
          <ProfileBlock
            key={grupo.id}
            client={activeClient}
            group={grupo.id}
            onSave={(profile) => editar({ profile: cleanProfile(profile) })}
          />
        ))}

        <CustomAnswers client={activeClient} />

        <EquipmentPanel client={activeClient} onSaveProfile={(profile) => editar({ profile })} />
      </div>

      <DatosPersonalesPie
        client={activeClient}
        consent={consent}
        onAbrir={() => setHoja('datos')}
      />

      {/*
        ══ LAS HOJAS ════════════════════════════════════════════════════════

        Todo lo que esta ficha EDITA se abre en el CENTRO, y siempre igual: un
        gesto, un sitio.

        Estuvo por el canto derecho, con el argumento de que el importe o los
        pasos del alta se deciden mirando lo que hay debajo. No se sostenía: la
        ficha no enseña el importe en ningún otro sitio, ni los pasos del alta,
        así que detrás del panel no había nada con lo que comparar — solo la
        misma ficha, tapada a medias y en una columna estrecha.

        `side` es para MIRAR un detalle sin soltar el trabajo (ver `ui/Modal`, y
        la progresión de un ejercicio o lo que pasó en una semana, que sí lo
        son). Aquí se DECIDE, y decidir pide el centro y el velo: es la misma
        regla que ya seguían los ajustes del programa en `WorkoutLogEditor` y la
        que ahora sigue también el objetivo de la dieta.
      */}
      <Modal open={hoja === 'identidad'} title="Quién es" onClose={cerrar}>
        <div className="hoja-ficha">
          <ClientEditor
            client={activeClient}
            onCancel={cerrar}
            onSave={(fields) => {
              editar(fields);
              cerrar();
            }}
          />

          {/* El aviso vive aquí, que es donde se arregla: el desplegable del sexo
              está a dos dedos. En la ficha era un cartel ámbar sobre algo que no
              está roto. */}
          {!activeClient.gender && (
            <Notice tone="warn">
              Sin el sexo, el % graso por pliegues se calcula con la fórmula de hombre. Ponlo aquí y
              los pliegues pasan a usar la que toca.
            </Notice>
          )}
        </div>
      </Modal>

      <Modal open={hoja === 'alta'} size="lg" title="Su alta" onClose={cerrar}>
        <div className="hoja-ficha">
          <Alta
            client={activeClient}
            estado={estadoDelAlta}
            intake={intake}
            steps={pasosDelAlta}
            progress={progresoDelAlta}
            carpeta={drive.folder}
            onProbar={probarSuPortal}
            onUpdate={editar}
            onPreferences={(siguiente) =>
              updateClientPreferences(activeClient.id, 'intake', intakeToPreferences(siguiente))
            }
          />
        </div>
      </Modal>

      <Modal open={hoja === 'cobro'} title="Cobro" onClose={cerrar}>
        <div className="hoja-ficha">
          <Cobro client={activeClient} onUpdate={editar} onMarkPaid={marcarCobrado} />
        </div>
      </Modal>

      <Modal open={hoja === 'acceso'} title="Acceso y baja" onClose={cerrar}>
        <div className="hoja-ficha col gap-3">
          <PortalAccess client={activeClient} />
          <ArchiveRow client={activeClient} />
        </div>
      </Modal>

      <Modal open={hoja === 'datos'} size="lg" title="Datos personales" onClose={cerrar}>
        <div className="hoja-ficha">
          <ClientDataPanel client={activeClient} />
        </div>
      </Modal>

      <Modal open={hoja === 'carpeta'} title="Su carpeta" onClose={cerrar}>
        <div className="hoja-ficha">
          <ClientDrive client={activeClient} drive={drive} />
        </div>
      </Modal>
    </div>
  );
};
