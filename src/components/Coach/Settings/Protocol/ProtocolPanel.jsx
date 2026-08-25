import { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  CHECKIN_QUESTIONS,
  SESSION_QUESTIONS,
  activeQuestions,
  activeServices,
  checkinBlocks,
  checkinQuestions,
  clientProtocol,
  isModuleOn,
} from '@/domain/protocol';
import { clientIntake, intakeSteps, intakeToPreferences } from '@/domain/intake';
import {
  applyIntakeTemplate,
  clearLocalIntakeTemplate,
  defaultIntake,
  intakeTemplateFrom,
  intakeTemplateToPreferences,
  readLocalIntakeTemplate,
} from '@/lib/intakeTemplate';
import {
  clearLocalTemplate,
  defaultProtocol,
  isProtected,
  matchesTemplate,
  templateForClient,
  needsTemplate,
  readLocalTemplate,
  templateFrom,
} from '@/lib/protocolTemplate';
import { GroupHead, Notice, PageHead } from '@/components/ui/primitives';
import { IntakeSteps } from './IntakeSteps';
import { TargetPicker } from './TargetPicker';
import { ProtoNav } from './ProtoNav';
import { ServicesSection } from './ServicesSection';
import { PresetsSection } from './PresetsSection';
import { ModulesSection } from './ModulesSection';
import { CheckinBlocksSection } from './CheckinBlocksSection';
import { IntakeFormSection } from './IntakeFormSection';
import { QuestionEditor } from './QuestionEditor';

/**
 * Ajustes → Protocolo: el entrenador diseña su aplicación.
 *
 * ══ La decisión de estructura ═══════════════════════════════════════════════
 *
 * Un solo editor con un SELECTOR DE DESTINO arriba, y no dos pantallas.
 *
 * El protocolo se guarda por cliente (`clients.preferences.protocol`), pero se
 * piensa una vez para toda la cartera. Eso deja dos necesidades —«mi forma de
 * trabajar» y «con este cliente hago una excepción»— que son la MISMA operación
 * sobre distinto destino. Construirlas como dos pantallas significaría dos
 * copias del mismo editor que acabarían divergiendo; con un selector, lo que
 * cambia es a quién se le escribe.
 *
 * ── El reparto en ficheros ──────────────────────────────────────────────────
 * Esto eran 700 líneas con ocho bloques apilados. Aquí queda el ESTADO —el
 * destino, las plantillas, los dos guardados y «aplicar a todos»— y cada bloque
 * vive en su fichero como pieza de presentación que recibe `(protocol, onSave)`.
 * `ProtoNav` pone el mapa: cinco anclas que agrupan los bloques por asunto.
 *
 * ── Dónde vive cada cosa ────────────────────────────────────────────────────
 * La plantilla del entrenador se guarda en su cuenta (`profiles.preferences`,
 * migración 0035) y le sigue de un ordenador a otro; `lib/protocolTemplate.js`
 * queda solo como rescate one-shot de las plantillas que quedaron en
 * localStorage. El protocolo ya aplicado a cada cliente vive en su ficha
 * (`clients.preferences.protocol`): se puede perder la plantilla, nunca lo que
 * tus clientes tienen puesto.
 */
export const ProtocolPanel = () => {
  const {
    session,
    clients,
    saveClientException,
    openClientView,
    applyProtocolToClient,
    coachPrefs,
    coachPrefsReady,
    updateCoachPreferences,
  } = useApp();
  const userId = session?.user?.id;

  /** `null` = la plantilla; si no, el id del cliente que se está editando. */
  const [target, setTarget] = useState(null);
  const [feedback, setFeedback] = useState(null);
  /** «Aplicar a todos» en marcha: apaga el botón mientras escribe. */
  const [applying, setApplying] = useState(false);

  /*
    ══ Las plantillas ya no viven en el navegador ═════════════════════════════

    Están en `profiles.preferences` (0035), así que le siguen al entrenador de un
    ordenador a otro. Antes eran `localStorage` y se perdían al cambiar de
    máquina o al limpiar el navegador — con el agravante de que no se perdía un
    ajuste, se perdía su forma de trabajar.

    No hay estado local que mantener: la plantilla ES lo que hay en `coachPrefs`,
    y `updateCoachPreferences` ya lo actualiza de forma optimista, así que el
    cambio se ve al instante igual que antes. Duplicarlo en un `useState` sería
    la segunda copia de una verdad que ya tiene dueño.
  */
  const template = templateFrom(coachPrefs) || defaultProtocol();
  const intakeTemplate = intakeTemplateFrom(coachPrefs) || defaultIntake();

  /*
    ── El rescate de la que quedara en el navegador ────────────────────────────
    Una sola vez, y solo si el servidor no tiene ninguna: quien ya había
    configurado su plantilla no puede notar la mudanza. Se espera a que las
    preferencias estén LEÍDAS —no basta con que estén vacías— porque si no, en el
    primer render de cada arranque parecerían vacías y se subiría lo de siempre
    encima de lo suyo.
  */
  useEffect(() => {
    if (!coachPrefsReady || !userId) return;

    if (!templateFrom(coachPrefs)) {
      const local = readLocalTemplate(userId);
      if (local) {
        updateCoachPreferences('protocolTemplate', local);
        clearLocalTemplate(userId);
      }
    }
    if (!intakeTemplateFrom(coachPrefs)) {
      const local = readLocalIntakeTemplate(userId);
      if (local) {
        updateCoachPreferences('intakeTemplate', intakeTemplateToPreferences(local));
        clearLocalIntakeTemplate(userId);
      }
    }
  }, [coachPrefsReady, coachPrefs, userId, updateCoachPreferences]);

  const client = target ? clients.find((c) => c.id === target) : null;
  const protocol = client ? clientProtocol(client.preferences) : template;

  /*
    Los pasos del alta van por su propio carril. Comparten el selector de destino
    —se configuran para la plantilla o para un cliente, igual que el protocolo—
    pero NO comparten almacenamiento: `clientProtocol()` sanea y descarta lo que
    no conoce, así que colgarlos de `protocol` los borraría en el primer cambio
    que se hiciera aquí arriba.
  */
  const intake = client ? clientIntake(client.preferences) : intakeTemplate;

  /*
    Guardar es lo mismo con dos destinos: el cliente elegido o la plantilla. El
    fallo del servidor SÍ se enseña —antes solo se avisaba de que el navegador no
    dejaba escribir— porque ahora es una escritura de red y puede fallar por estar
    sin conexión, que es un caso frecuente y silencioso.

    Con un cliente delante se guarda por `saveClientException`, que además deja
    la marca: tocar algo aquí ES declarar la excepción, y a partir de ese momento
    «poner al día» no le pasa por encima. Ver `isException` en
    lib/protocolTemplate.
  */
  /*
    Entrar en el portal del cliente elegido, por su alta. Mismo gesto que el
    botón de su ficha: cambiar de modo y navegar, en ese orden.
  */
  const verSuAlta = () => {
    openClientView('/mi/alta');
  };

  const saveIntake = async (next) => {
    setFeedback(null);
    if (client) {
      saveClientException(client.id, { intake: intakeToPreferences(next) });
      return;
    }
    const res = await updateCoachPreferences('intakeTemplate', intakeTemplateToPreferences(next));
    if (!res?.ok) {
      setFeedback({ tone: 'error', text: `No se ha podido guardar tu plantilla: ${res?.error || ''}` });
    }
  };

  const save = async (next) => {
    setFeedback(null);
    if (client) {
      saveClientException(client.id, { protocol: next });
      return;
    }
    const res = await updateCoachPreferences('protocolTemplate', next);
    if (!res?.ok) {
      setFeedback({ tone: 'error', text: `No se ha podido guardar tu plantilla: ${res?.error || ''}` });
    }
  };

  const questions = useMemo(() => activeQuestions(protocol), [protocol]);
  const checkinList = useMemo(() => checkinQuestions(protocol), [protocol]);
  const pasos = useMemo(() => intakeSteps(intake), [intake]);

  /*
    Lo que lleva puesto cada apartado, para el índice de arriba. No es la misma
    unidad en todos —dos servicios, cinco módulos, seis preguntas— y no falta que
    lo sea: lo que se lee es «cuánto hay puesto aquí», que es la pregunta con la
    que se entra en esta pantalla y hasta ahora obligaba a recorrerla entera.
  */
  const cuentas = useMemo(
    () => ({
      servicios: activeServices(protocol).length,
      alta: pasos.length,
      app: (protocol.modules || []).length,
      sesion: questions.length,
      /* Las dos mitades de la revisión semanal: lo que se mide y lo que se
         pregunta. Contarlas por separado partiría en dos un apartado que
         justamente se juntó para leerse de una vez. */
      checkin: checkinBlocks(protocol).length + checkinList.length,
    }),
    [protocol, pasos, questions, checkinList]
  );

  /*
    ══ Los dos grupos que antes eran uno solo ═════════════════════════════════

    Estar «distinto de la plantilla» tapaba dos situaciones opuestas: el que se
    quedó atrás porque cambiaste la plantilla después de aplicársela, y aquel al
    que le montaste algo distinto a propósito. `needsTemplate` separa a los dos
    (el porqué, en lib/protocolTemplate).

    `pendientes` es a quien se le escribe al poner al día. `excepciones` no es su
    complementario —una excepción puede coincidir hoy con la plantilla y seguir
    protegida— y se calcula aparte porque hay que poder NOMBRARLA: un botón que
    salta clientes sin decir cuáles es un botón del que no te fías.
  */
  const pendientes = useMemo(
    () => clients.filter((c) => needsTemplate(template, intakeTemplate, c)),
    [clients, template, intakeTemplate]
  );
  const pendientesSet = useMemo(() => new Set(pendientes.map((c) => c.id)), [pendientes]);
  const excepciones = useMemo(
    () => clients.filter((c) => isProtected(template, intakeTemplate, c)),
    [clients, template, intakeTemplate]
  );
  const excepcionesSet = useMemo(() => new Set(excepciones.map((c) => c.id)), [excepciones]);

  /**
   * Ponerle a un cliente lo que dice la plantilla.
   *
   * Escribe las dos mitades —protocolo y alta—, no solo la primera: el desvío se
   * mide contra las dos, así que igualar solo el protocolo dejaba al cliente
   * marcado como distinto justo después de haberlo igualado. Y suelta la marca
   * de excepción, que es cosa de `applyProtocolToClient`.
   */
  const igualarA = (c) =>
    applyProtocolToClient(c.id, {
      /* La plantilla ADAPTADA a este cliente: todo lo suyo menos lo que es de él
         y no de ella. Hoy, qué le llevas — a quien solo entrena, «poner al día»
         le devolvía la nutrición y le reaparecía media aplicación en su portal.
         Ver `NOT_COMPARED_KEYS` en lib/protocolTemplate. */
      protocol: templateForClient(template, c.preferences),
      /* La plantilla decide QUÉ pasos hay; cada cliente conserva por cuáles va y
         qué tiene enlazado. Sobrescribirlo entero borraría los vídeos que se han
         ido pegando cliente a cliente, que es el trabajo que no se puede rehacer. */
      intake: intakeToPreferences(applyIntakeTemplate(intakeTemplate, c.preferences)),
    });

  /** Igualar al cliente que se está mirando, con su acuse de recibo. */
  const igualarAlCliente = async () => {
    if (!client) return;
    setFeedback(null);
    setApplying(true);
    const res = await igualarA(client);
    setApplying(false);
    setFeedback(
      res?.ok
        ? { tone: 'success', text: `${client.name} vuelve a tener tu plantilla.` }
        : { tone: 'error', text: `No se ha podido igualar a ${client.name}: ${res?.error || ''}` }
    );
  };

  /*
    En tandas de 3 y ESPERANDO cada tanda, no todo a la vez: con una cartera
    grande, cincuenta RPCs simultáneos son cincuenta conexiones peleándose, y
    aquí nadie tiene prisa. Y el mensaje final cuenta lo que pasó de verdad —
    antes se pintaba «Aplicado a N» sin haber mirado ni una respuesta.
  */
  const applyToAll = async () => {
    setApplying(true);
    let fallos = 0;

    for (let i = 0; i < pendientes.length; i += 3) {
      const tanda = pendientes.slice(i, i + 3);
      const results = await Promise.allSettled(tanda.map(igualarA));
      fallos += results.filter((r) => r.status !== 'fulfilled' || !r.value?.ok).length;
    }

    setApplying(false);
    const hechos = pendientes.length - fallos;
    /* Las excepciones se dicen en el acuse: saltarlas en silencio dejaría la duda
       de si se han quedado fuera por un fallo. Con más de una va el número y no
       la lista —quiénes son se ve en los chips— porque un aviso que crece con la
       cartera deja de leerse justo cuando más clientes hay. */
    const respetadas =
      excepciones.length === 0
        ? ''
        : excepciones.length === 1
          ? ` La excepción de ${excepciones[0].name} se queda como estaba.`
          : ` Las ${excepciones.length} excepciones se quedan como estaban.`;

    setFeedback(
      fallos === 0
        ? {
            tone: 'success',
            text: `Puesto al día ${hechos} ${hechos === 1 ? 'cliente' : 'clientes'}.${respetadas}`,
          }
        : {
            tone: 'error',
            text: `Puesto al día ${hechos}; ha fallado en ${fallos}. Vuelve a intentarlo: solo se reintenta lo que falta.`,
          }
    );
  };

  return (
    <div className="stack">
      <PageHead title="Protocolo" sub="Qué le pides a tus clientes y qué ve cada uno en su aplicación." />

      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

      <TargetPicker
        clients={clients}
        target={target}
        onTarget={setTarget}
        client={client}
        esIgual={Boolean(client) && matchesTemplate(template, protocol)}
        esExcepcion={Boolean(client) && excepcionesSet.has(client.id)}
        onIgualar={igualarAlCliente}
        pendientesSet={pendientesSet}
        excepcionesSet={excepcionesSet}
        pendientes={pendientes}
        excepciones={excepciones}
        applying={applying}
        onApplyAll={applyToAll}
      />

      <ProtoNav cuentas={cuentas} />

      {/*
        ══ La prosa fuera de la tarjeta ══════════════════════════════════════

        Cada apartado abre con su `GroupHead` —el nombre que dice el índice y una
        línea de qué se decide aquí— y la tarjeta de debajo contiene SOLO
        controles. Antes cada bloque llevaba dentro su propio titulito y un
        párrafo, así que los ocho tenían la misma silueta —texto, texto, mando— y
        la pantalla se leía como un formulario largo en vez de como cinco
        decisiones. Sacando la explicación al encabezado, la tarjeta vuelve a ser
        lo que se toca y el ojo puede saltarse lo que ya sabe.
      */}

      <section id="servicios" className="proto-section">
        <GroupHead
          title="Qué llevas"
          sub={
            client
              ? `Las secciones que existen para ${client.name}. Lo que quites desaparece de su portal y de tu carril; lo que tenga montado se queda guardado por si vuelves a encenderlo.`
              : 'Las secciones que existen para tus clientes. Puedes llevar solo el entrenamiento, solo la nutrición o las dos cosas.'
          }
        />
        <ServicesSection protocol={protocol} onSave={save} />
      </section>

      {/* El alta va la primera de las que configuran el seguimiento porque es lo
          primero que pasa: los pasos del alta se dan antes de que exista una
          sesión que puntuar. */}
      <section id="alta" className="proto-section">
        <GroupHead
          title="El alta"
          sub="Qué te entrega él para que puedas empezar, y qué haces tú con eso."
          action={
            /*
              Verlo como lo ve él, desde donde se configura.

              Solo con un cliente elegido: sin destino no hay portal que enseñar,
              y el modo de prueba necesita saber de quién. Es el mismo botón que
              hay en su ficha y lleva al mismo sitio — configurar el alta y no
              poder verla es la clase de hueco que obliga a abrir otra pestaña.
            */
            client && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={verSuAlta}>
                <Eye size={14} /> Ver su alta
              </button>
            )
          }
        />

        {/*
          ══ Los PASOS van antes que las preguntas ═════════════════════════════

          Porque contestan a quién hace qué, y las preguntas son el detalle de
          UNO de esos pasos. Al revés —que es como estaba— lo primero que se veía
          al abrir «El alta» eran diecinueve casillas de un cuestionario, y el
          reparto de tareas quedaba enterrado debajo: no había forma de ver que
          el onboarding y el análisis postural son tuyos y vienen DESPUÉS de que
          él entregue lo suyo.
        */}
        <IntakeSteps intake={intake} onChange={saveIntake} />
        <IntakeFormSection />
      </section>

      <section id="app" className="proto-section">
        <GroupHead
          title="La aplicación"
          sub="Qué piezas existen para esta persona. Lo que esté apagado no aparece: ni tú lo ves al programar, ni tu cliente al entrenar."
        />
        <PresetsSection protocol={protocol} onSave={save} />
        <ModulesSection protocol={protocol} onSave={save} />
      </section>

      <section id="sesion" className="proto-section">
        <GroupHead
          title="La sesión"
          sub="Qué le preguntas al terminar de entrenar. Cada pregunta de escala se convierte en una serie que puedes seguir en su panel; las de texto no se pueden medir."
        />
        <QuestionEditor
          notice={
            !isModuleOn(protocol, 'sessionFeedback') && (
              <Notice tone="info">
                El módulo de feedback está apagado, así que estas preguntas no se le harán. Enciéndelo
                arriba para que aparezcan.
              </Notice>
            )
          }
          protocol={protocol}
          list="questions"
          catalogo={SESSION_QUESTIONS}
          questions={questions}
          onSave={save}
          emptyText="No hay ninguna pregunta activa."
          addPlaceholder="Molestia en el hombro"
        />
      </section>

      {/* El check-in entero en una tanda: qué se mide (bloques) y qué se
          pregunta (cuestionario). Antes los bloques iban pegados a los módulos y
          el cuestionario tres pantallas más abajo; son las dos mitades de la
          misma revisión semanal y se leen juntas. */}
      <section id="checkin" className="proto-section">
        <GroupHead
          title="El check-in"
          sub="Su revisión semanal: lo que se mide y lo que se pregunta antes de entregarla."
        />
        <CheckinBlocksSection protocol={protocol} onSave={save} />
        <QuestionEditor
          title="Qué le preguntas al cerrar la semana"
          intro="Es lo que la báscula no mide: si ha podido seguir el plan, si ha pasado hambre, si le siguen quedando ganas."
          notice={
            checkinList.length === 0 ? (
              <Notice tone="info">
                Sin ninguna pregunta puesta no hay cuestionario: su revisión termina en las fotos,
                exactamente como hasta ahora. Añade las que quieras y aparecerá el paso.
              </Notice>
            ) : null
          }
          protocol={protocol}
          list="checkinQuestions"
          catalogo={CHECKIN_QUESTIONS}
          questions={checkinList}
          onSave={save}
          emptyText="Todavía no le preguntas nada al cerrar la semana."
          addPlaceholder="Cómo has llevado las comidas fuera"
        />
      </section>

      <p className="t-xs t-tertiary">
        Tu plantilla se guarda en tu cuenta y te sigue de un ordenador a otro. El protocolo ya
        aplicado a cada cliente vive en su ficha: cambiar la plantilla no toca a nadie hasta que
        pones al día, y a quien tenga una excepción no lo toca ni entonces.
      </p>
    </div>
  );
};
