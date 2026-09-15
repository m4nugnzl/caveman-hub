import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Bell,
  Camera,
  CheckSquare,
  ChevronRight,
  Copy,
  FileText,
  Lock,
  Sparkles,
  Plus,
  Ruler,
  Scale,
  Send,
  SlidersHorizontal,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import {
  PREMISAS,
  QUE_CATALOGO,
  accionesDe,
  anadirAccion,
  cuentaAcciones,
  porPremisa,
  premisasDe,
  quitarAccion,
} from '@/domain/acciones';
import {
  DIAS,
  MAX_PROTOCOLOS,
  MAX_PROTOCOLO_NAME,
  REMIND_MAX,
  buildProtocolo,
  cadaCuanto,
  coachProtocolos,
  cuentaClientes,
  diaDe,
  guiaResuelta,
  protocolosToPreferences,
  sanitizeSchedule,
} from '@/domain/protocolos';
import {
  coachFormularios,
  cuentaPreguntas,
  formulariosMandables,
  formulariosToPreferences,
} from '@/domain/formularios';
import { agrupar, cuantasPorSalir } from '@/domain/envios';
import { deProtocolo, nombreDe } from '@/domain/automatizaciones';
import { BotonMas } from '@/components/ui/BotonMas';
import { CarrilAutomatizaciones } from './CarrilAutomatizaciones';
import { AQuienSeLoPones, QueLleva } from './AltaDeProtocolo';
import { AltaGuiada } from './AltaGuiada';
import { EditorDeFormulario } from './EditorDeFormulario';
import { LoQueSale } from './LoQueSale';
import { MandarAlgo } from '@/components/Coach/MandarAlgo';
import { EnvioAbierto, EnviosSeccion } from './Envios';
import { GuiaDeMedidas } from './GuiaDeMedidas';
import { ALERT_DAYS, ALERT_DAYS_MAX, activeServices } from '@/domain/protocol';
import { CHECKIN_CADENCES } from '@/domain/calendar';
import { setStepOwner, stepById } from '@/domain/intake';
import {
  citasDelProtocolo,
  necesitaSuPlan,
  parchePara,
  protegidoDeSuPlan,
} from '@/lib/protocolTemplate';
import { clampInt } from '@/lib/num';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { EmptyState, Field, Notice, RenombrarEnSitio, SegmentedControl } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { Cinta } from '@/components/ui/Cinta';
import { useMarcaDeslizante } from '@/components/ui/carril';

/**
 * PROTOCOLOS: tus formas de trabajar, leídas como lo que son.
 *
 * ══ La tesis ═══════════════════════════════════════════════════════════════
 *
 * **Un protocolo es una lista de acciones con su premisa.** Antes esta pantalla
 * decía qué EXISTE para una persona —cinco cajones de conmutadores con un
 * selector de destino arriba— y a la derecha, un índice que contaba la historia
 * que la izquierda no contaba: cinco momentos que enlazaban a los cajones, pero
 * debajo no había momentos, había ajustes.
 *
 * Ahora los rótulos son PREMISAS y cada renglón lleva un verbo y un sujeto:
 * «Pídele · Alta general», «Dale · Vídeo de bienvenida», «Avísame · si no
 * entrena». Se lee lo que le pasa a un cliente tuyo, y se edita en el mismo
 * sitio donde se lee.
 *
 * ══ Y son VARIOS, con nombre ═══════════════════════════════════════════════
 *
 * Había uno solo, cuando `intakeForms` ya permitía seis altas con nombre. Quien
 * lleva pérdida de grasa y powerlifting no podía tener dos formas de trabajar.
 * El modelo está en `domain/protocolos.js`, con el mismo patrón: sin lista, el
 * protocolo único de hoy ES la lista.
 *
 * ══ El cliente concreto ya no se edita aquí ════════════════════════════════
 *
 * Había un `TargetPicker` —«estás configurando: mi plantilla / Marta»— que
 * gobernaba la pantalla entera salvo un bloque, el cuestionario, que la
 * desobedecía y lo avisaba en un `Notice`. Un editor con un mando global que uno
 * de sus hijos ignora no se arregla con un aviso.
 *
 * Con protocolos con nombre, la lista YA es el «quién». Lo de una persona
 * concreta vive en su diálogo de la cartera, que es donde está ella. Lo que no
 * se pierde es lo que costó de verdad: quién se ha quedado atrás, quién tiene
 * excepción y el botón que los pone al día — eso sube a la cinta del protocolo,
 * donde se lee mejor que en un carril de cuarenta nombres.
 */

/* El icono de cada familia de acción. */
const ICONO = {
  form: FileText,
  medida: Ruler,
  entrega: Video,
  tarea: CheckSquare,
  aviso: Bell,
};

/*
  El matiz de cada familia, por `data-tono` — el mecanismo del avatar y de las
  etiquetas de la cartera. NO se usa la paleta `--data-*`: ésa es del dato dentro
  de un gráfico. El disco dice de qué CLASE es la acción; que se pueda tocar lo
  sigue diciendo el acento y solo el acento.
*/
const TONO = { form: 4, medida: 5, entrega: 2, tarea: 7, aviso: 0 };

/* El icono fino de un enchufe concreto, cuando la familia se queda corta. */
const ICONO_TIPO = { peso: Scale, perimeters: Ruler, folds: SlidersHorizontal, fotos: Camera };

const Disco = ({ familia, tipo }) => {
  const Icono = ICONO_TIPO[tipo] || ICONO[familia] || CheckSquare;
  return (
    <span className="f-disco" data-tono={TONO[familia] ?? 4} aria-hidden="true">
      <Icono size={13} />
    </span>
  );
};

/**
 * El camino de un protocolo, en orden. El porqué de que sean tres tramos de una
 * misma pantalla —y no una ventana, una pantalla y otra ventana— está en
 * `AltaDeProtocolo`.
 */
const PASOS = [
  { id: 'lleva', label: 'Qué lleva' },
  { id: 'acciones', label: 'Las acciones' },
  { id: 'quien', label: 'Quién lo lleva' },
];

export const ProtocolosPanel = () => {
  const {
    coachPrefs,
    clients,
    applyProtocolToClient,
    envioRows,
    automatizaciones,
  } = useApp();
  const {
    updateCoachPreferences,
    guardarAutomatizacion,
    quitarAutomatizacion,
    correrAutomatizaciones,
  } = useActions();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  /*
    Qué protocolo está abierto. Puede llegar puesto: de Formularios se vuelve
    aquí —«editarlo» va y vuelve— y también se entra desde la columna «Lo usan».
    Sin esto, el viaje de vuelta te dejaba en la lista de protocolos, o sea otra
    vez buscando de dónde habías salido.
  */
  const [abierto, setAbierto] = useState(() => location.state?.abrir || null);
  /* Qué formulario se está escribiendo SIN salir del protocolo. Ver `irAEditar`. */
  const [editando, setEditando] = useState(null);
  /*
    Por qué paso del camino va: ① qué lleva · ② las acciones · ③ quién lo
    lleva. Los tres son tramos de la MISMA pantalla —el porqué, en
    `AltaDeProtocolo`—, así que esto es lo que se dibuja debajo del raíl. Abrir
    un protocolo ya montado cae en ②, que es el trabajo.
  */
  const [paso, setPaso] = useState('acciones');
  /* Si están abiertas las tres preguntas del primer día. Ver `AltaGuiada`. */
  const [guiando, setGuiando] = useState(false);
  const [tocada, setTocada] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  /*
    El protocolo que se está montando y todavía no existe. Vive aquí, en
    memoria, y se escribe de una vez al pulsar «Seguir» en el paso ①: cerrar sin
    terminar no deja un protocolo huérfano en la lista. Ver `nuevo` y `seguir`.
  */
  const [borrador, setBorrador] = useState(null);
  /*
    Si se está MONTANDO uno, o sea recorriendo el camino de punta a punta.

    No basta con `borrador`: el borrador muere en el paso ①, que es donde el
    protocolo empieza a existir, y con él moría el verbo. Del ② al ③ no había
    forma de seguir —solo pulsar el tramo— cuando del ① al ② sí la hay (dueño,
    14 sep). Un camino que te suelta a mitad es peor que no numerar los pasos.

    Se enciende al pulsar «Protocolo nuevo» y se apaga al salir o al abrir otro:
    retocar uno ya montado no es recorrer nada, y ahí el raíl es solo navegación
    —el azul de esa pantalla es el de «ponérselo a alguien»—.
  */
  const [montando, setMontando] = useState(false);
  const [anadiendo, setAnadiendo] = useState(null);
  const [aplicando, setAplicando] = useState(false);
  const [aviso, setAviso] = useState(null);
  /* Lo de «una vez»: el envío abierto y el diálogo de mandar. */
  const [envioAbierto, setEnvioAbierto] = useState(null);
  const [mandando, setMandando] = useState(false);
  /*
    Qué tramo de la puerta se mira. El tercero —los formularios— es una RUTA y
    no un estado, así que puede llegar puesto al volver de ella: sin esto, salir
    de Formularios te devolvía a los protocolos y el raíl daba un salto.
  */
  const [tramo, setTramo] = useState(() => location.state?.tramo || 'protocolos');
  /* El reloj del repaso. Ver `guardarAuto`. */
  const relojRepaso = useRef(null);
  /* La marca que viaja por el raíl del camino. Arriba con los demás ganchos: la
     lista de protocolos sale por un `return` antes de llegar a la cabecera. */
  const carrilPasos = useMarcaDeslizante();

  const protocolos = coachProtocolos(coachPrefs);
  const formularios = coachFormularios(coachPrefs);
  /*
    Los que se pueden MANDAR, que no son todos: un alta o un check-in no viajan
    como acción suelta —sus preguntas no viven en `elementos`— y el carril los
    ofrecía igual, así que elegir «Alta» en un paso mandaba una hoja en blanco.
    El criterio es el mismo que usa «Mandar algo», escrito una vez en el
    dominio.
  */
  const mandables = formulariosMandables(coachPrefs);
  /* El borrador manda mientras exista: es un protocolo de verdad para todo lo
     que la pantalla dibuja, solo que todavía no está en la lista. */
  const protocolo = borrador || protocolos.find((p) => p.id === abierto) || null;

  /* Los envíos salen de agrupar las filas: un envío no es una fila de la base,
     es lo que se mandó de una vez (ver `domain/envios.js`). */
  const envios = useMemo(() => agrupar(envioRows || []), [envioRows]);
  const envio = envios.find((e) => e.id === envioAbierto) || null;

  const porCliente = useMemo(() => cuentaClientes(coachPrefs, clients), [coachPrefs, clients]);

  /*
    Lo que va a salir y todavía no ha salido. Es la cifra del tramo y la única de
    esta pantalla que caduca, así que es la única que se pone en la cinta.

    El corte lo hace `vigente`, la misma función con la que el portal del cliente
    decide qué enseñar: dos formas de contestar «¿esto ya está fuera?»
    acabarían discrepando, y el día que discrepen esta cifra diría que quedan
    cuatro cosas por salir cuando el cliente ya las tiene delante.
  */
  const porSalir = useMemo(() => cuantasPorSalir(envioRows || []), [envioRows]);

  /* Quién se ha quedado atrás y quién está protegido, POR PROTOCOLO. Cada
     cliente se compara contra el suyo — el porqué, en `planDeCliente`. */
  const conDesvio = useMemo(() => {
    const out = {};
    for (const c of clients) {
      const id = c.preferences?.protocolId || protocolos[0]?.id;
      if (!out[id]) out[id] = { atrasados: [], excepciones: [] };
      if (necesitaSuPlan(coachPrefs, c)) out[id].atrasados.push(c);
      else if (protegidoDeSuPlan(coachPrefs, c)) out[id].excepciones.push(c);
    }
    return out;
  }, [clients, coachPrefs, protocolos]);

  const guardarProtocolos = (lista) =>
    updateCoachPreferences('protocolos', protocolosToPreferences(lista));

  /*
    Guardar el PLAN entero: una acción de la semana no vive necesariamente en el
    protocolo —los bloques, los pesajes y las fotos son piezas de su formulario—,
    así que las dos mitades se escriben juntas o el cambio se ve a medias.
  */
  const guardarPlan = ({ protocolo: siguiente, formularios: sigForms }) => {
    guardarProtocolos(protocolos.map((p) => (p.id === siguiente.id ? siguiente : p)));
    if (sigForms !== formularios) {
      updateCoachPreferences('formularios', formulariosToPreferences(sigForms));
    }
  };

  const guardarUno = (siguiente) =>
    guardarProtocolos(protocolos.map((p) => (p.id === siguiente.id ? siguiente : p)));

  /*
    ══ LAS TRES PREGUNTAS DEL PRIMER DÍA ═════════════════════════════════════

    Se ofrecen a quien todavía tiene UN protocolo y no las ha resuelto. Quien ya
    tiene tres montados no está en su primer día y no se le pregunta nada.

    Y las dos salidas —montarlo o apartarlo— escriben en la MISMA llamada que el
    protocolo, no en dos: `updateCoachPreferences` fusiona por sección y dos
    llamadas seguidas se pisan, así que la marca vive dentro de `protocolos`.
    Ver `guiaResuelta`.
  */
  const ofreceGuia = !guiaResuelta(coachPrefs) && protocolos.length === 1;

  const apartarGuia = () => updateCoachPreferences('protocolos', { guiada: true });

  const montarGuia = (siguiente) => {
    updateCoachPreferences('protocolos', {
      ...protocolosToPreferences(protocolos.map((p) => (p.id === siguiente.id ? siguiente : p))),
      guiada: true,
    });
    setGuiando(false);
    toast({ text: 'Montado. Lo que acabas de contestar ya está en tu protocolo.' });
  };

  /*
    ══ LA CITA: quién tiene otro día ══════════════════════════════════════════

    El horario de este rótulo ya no es una segunda verdad sobre la revisión: es
    **el valor por defecto**, y siembra al cliente que todavía no tiene día. Lo
    que no hace —ni puede hacer callando— es moverle la cita a quien ya eligió la
    suya: el día de la revisión es la mañana en la que esa persona se pesa en
    ayunas y se hace las fotos, y puede haberla elegido ella.

    Así que se cuenta y se ofrece, con la misma gramática de consecuencias que el
    reparto de la dieta: se dice cuántos son, se pueden leer sus nombres antes de
    aceptar, y nadie se entera después. Ver `citasDelProtocolo`.
  */
  const citas = useMemo(
    () => (protocolo ? citasDelProtocolo(coachPrefs, protocolo, clients) : { sembrar: [], distintos: [] }),
    [coachPrefs, protocolo, clients]
  );

  const cambiarLasCitas = async () => {
    const gente = citas.distintos;
    if (gente.length === 0) return;
    const nombres = gente.map((c) => c.name).join(', ');
    const ok = await confirm({
      title: `¿Ponerles a todos el ${diaDe(protocolo.schedule)}?`,
      message: `${gente.length === 1 ? 'Cambia la cita de' : `Cambia la cita de los ${gente.length}:`} ${nombres}. A partir de ahora se les reclamará la revisión ese día${cadaCuanto(protocolo.schedule) ? `, ${cadaCuanto(protocolo.schedule)}` : ''}. Las fechas que hayas movido suelta a suelta se respetan.`,
      confirmLabel: 'Cambiárselo',
    });
    if (!ok) return;

    const { weekday, everyWeeks } = sanitizeSchedule(protocolo.schedule);
    setAplicando(true);
    let fallos = 0;
    /* En tandas de tres, como «poner al día»: con una cartera grande, cincuenta
       RPCs a la vez son cincuenta conexiones peleándose. */
    for (let i = 0; i < gente.length; i += 3) {
      const res = await Promise.allSettled(
        gente.slice(i, i + 3).map((c) =>
          /* Sin soltar la marca de excepción: aquí no se está igualando a nadie
             con la plantilla, se está moviendo UNA cosa. */
          applyProtocolToClient(c.id, { checkin: { weekday, everyWeeks } }, { clearException: false })
        )
      );
      fallos += res.filter((r) => r.status !== 'fulfilled' || !r.value?.ok).length;
    }
    setAplicando(false);

    const hechos = gente.length - fallos;
    setAviso(
      fallos === 0
        ? { tone: 'success', text: `Cambiada la cita de ${hechos} ${hechos === 1 ? 'cliente' : 'clientes'}.` }
        : { tone: 'error', text: `Cambiada en ${hechos}; ha fallado en ${fallos}. Vuelve a intentarlo.` }
    );
  };

  /*
    ══ UNA SOLA PUERTA: el formulario se escribe DENTRO del protocolo ════════

    Esto era `navigate('/formularios')` con un `state.volver` puesto a mano para
    que la flecha de atrás devolviera al protocolo abierto. Ese `volver` era la
    confesión: cuando hay que programar el camino de vuelta, el viaje sobraba.

    Y el viaje sobraba porque las dos mitades no son dos cosas. El protocolo dice
    CUÁNDO se le pide algo y el formulario dice QUÉ se le pregunta; separarlas en
    dos puertas obligaba a cada una a explicar por escrito qué mitad del trabajo
    le tocaba —el pie de Formularios lo decía con todas las letras— y a enlazarse
    la una a la otra en los dos sentidos.

    Es el mismo movimiento que juntó Ejercicios y Alimentos en la Librería: una
    puerta con el trabajo dentro, en vez de dos que se llaman entre sí. Lo que
    costaba montarlo no era el constructor, era lo que hay que saber para editar
    uno; eso vive ahora en `EditorDeFormulario` y se monta en una línea.
  */
  const irAEditar = (form) => setEditando(form.id);

  /*
    ══ EL ALTA ES UN CAMINO, y se recorre SIN CAMBIAR DE MUEBLE ══════════════

    Esto creaba el protocolo en el acto —copiando el primero— y te soltaba dentro
    con el nombre en modo edición. Se corrigió con una ventana delante, y la
    ventana arregló el orden pero no el recorrido: pulsabas «Seguir», el diálogo
    desaparecía y aparecía una pantalla entera sin parecido con lo que acababas
    de dejar. El paso ya dado reaparecía además como botón arriba a la derecha,
    o sea en el sitio de lo que viene después.

    Ahora los tres pasos son TRAMOS de esta misma pantalla —① qué lleva, ② las
    acciones, ③ quién lo lleva—, con su número en el raíl de la cinta. Lo único
    que cambia al avanzar es lo que hay debajo del raíl.

    Y nada se escribe hasta «Seguir»: el nuevo vive en `borrador` y cerrar sin
    terminar no deja nada en la lista.
  */
  const nuevo = () => {
    if (protocolos.length >= MAX_PROTOCOLOS) {
      toast({ text: `Ya tienes ${MAX_PROTOCOLOS} protocolos, que es el tope.` });
      return;
    }
    /* Sin nombre a propósito: `buildProtocolo` pone «Protocolo nuevo» y eso, en
       un campo, es texto que hay que borrar antes de escribir el tuyo. Vacío, el
       marcador de posición hace su trabajo y el nombre se pone al guardar. */
    setBorrador({ ...buildProtocolo({ name: '', desde: protocolos[0] || null }), name: '' });
    setMontando(true);
    setPaso('lleva');
    setTocada(null);
    setAviso(null);
  };

  /* El final del paso ①: aquí es donde el protocolo empieza a existir. */
  const seguir = () => {
    const creado = { ...borrador, name: borrador.name.trim().slice(0, MAX_PROTOCOLO_NAME) || 'Protocolo nuevo' };
    guardarProtocolos([...protocolos, creado]);
    setBorrador(null);
    setAbierto(creado.id);
    setPaso('acciones');
  };

  /* Salir del protocolo: el borrador se va con él, que es lo que hace que
     arrepentirse a mitad del paso ① no deje nada escrito. */
  const volver = () => {
    setBorrador(null);
    setMontando(false);
    setAbierto(null);
    setPaso('acciones');
  };

  /* Lo que edita el paso ①. Un borrador se guarda en memoria; uno de verdad, en
     la cuenta. Es la única diferencia entre montar uno nuevo y retocar uno que
     ya llevas puesto, y por eso el paso se dibuja igual en los dos casos. */
  const cambiarLleva = (siguiente) =>
    borrador ? setBorrador(siguiente) : guardarUno(siguiente);

  const duplicar = (p) => {
    if (protocolos.length >= MAX_PROTOCOLOS) {
      toast({ text: `Ya tienes ${MAX_PROTOCOLOS} protocolos, que es el tope.` });
      return;
    }
    guardarProtocolos([...protocolos, buildProtocolo({ name: `${p.name} (copia)`, desde: p })]);
  };

  const quitar = async (p) => {
    const suyos = porCliente[p.id] || 0;
    if (protocolos.length < 2) {
      toast({ text: 'Tiene que quedarte al menos un protocolo.' });
      return;
    }
    const ok = await confirm({
      title: `¿Quitar «${p.name}»?`,
      message: suyos
        ? `${suyos} ${suyos === 1 ? 'cliente lo lleva' : 'clientes lo llevan'}. No se les toca nada: conservan lo que tienen puesto y pasan a contar como del primero.`
        : 'No lo lleva nadie, así que no cambia nada para ningún cliente.',
      confirmLabel: 'Quitarlo',
      tone: 'danger',
    });
    if (!ok) return;
    guardarProtocolos(protocolos.filter((x) => x.id !== p.id));
    if (abierto === p.id) setAbierto(null);
  };

  /*
    Poner al día: se le escribe a quien se ha quedado atrás CON SU PROTOCOLO, y
    en tandas de tres esperando cada una. Con una cartera grande, cincuenta RPCs
    a la vez son cincuenta conexiones peleándose y aquí nadie tiene prisa.
  */
  const ponerAlDia = async (p) => {
    const pendientes = conDesvio[p.id]?.atrasados || [];
    if (pendientes.length === 0) return;
    setAviso(null);
    setAplicando(true);
    let fallos = 0;

    for (let i = 0; i < pendientes.length; i += 3) {
      const tanda = pendientes.slice(i, i + 3);
      const res = await Promise.allSettled(
        tanda.map((c) => applyProtocolToClient(c.id, parchePara(coachPrefs, c)))
      );
      fallos += res.filter((r) => r.status !== 'fulfilled' || !r.value?.ok).length;
    }

    setAplicando(false);
    const hechos = pendientes.length - fallos;
    const exc = conDesvio[p.id]?.excepciones?.length || 0;
    /* Las excepciones se dicen en el acuse: saltarlas en silencio dejaría la duda
       de si se han quedado fuera por un fallo. */
    const respetadas =
      exc === 0 ? '' : ` ${exc === 1 ? 'La excepción se queda' : `Las ${exc} excepciones se quedan`} como estaba${exc === 1 ? '' : 'n'}.`;

    setAviso(
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

  /*
    Ver el protocolo por los ojos de quien lo lleva.

    Antes esto daba un toast pidiendo que abrieras a alguien primero: la pantalla
    del Taller no habla de clientes, así que el gesto se quedaba a medias. Ahora
    el protocolo SABE quién lo lleva, así que si el cliente abierto no es de los
    suyos se cambia al primero que sí — cambiar de cliente y saltar al portal, en
    ese orden, que es lo que hace el botón de su ficha.
  */
  /*
    ══ Las tres de las automatizaciones ══════════════════════════════════════

    Guardar una CORRE el repaso detrás, y no es un adorno: lo que acabas de
    escribir tiene que materializarse para quien ya lo lleva puesto sin esperar
    al siguiente arranque. Es el §6.3 —lo que ya corrió no se toca; lo que no ha
    corrido, corre con la última versión— dicho en el único sitio donde se nota:
    el momento en que lo escribes.
  */
  const guardarAuto = async (auto) => {
    const res = await guardarAutomatizacion(auto);
    if (!res.ok) {
      toast({ text: res.error, tone: 'danger' });
      return;
    }
    /*
      El repaso va con su propio retardo, ENCIMA del que ya trae el carril.

      No es lo mismo que guardar: guardar es una fila, y el repaso recorre la
      cartera entera cruzándola con sus automatizaciones. Lanzarlo en cuanto se
      posa cada tecla sería pagar ese recorrido por cada palabra de un título, y
      el resultado del penúltimo no le sirve a nadie. Dos segundos y medio es
      «ya no está tocando esto».
    */
    clearTimeout(relojRepaso.current);
    relojRepaso.current = setTimeout(() => correrAutomatizaciones(), 2500);
  };

  const quitarAuto = async (auto) => {
    const ok = await confirm({
      title: `¿Quitar «${nombreDe(auto)}»?`,
      /* Lo ya mandado no se toca: es de quien lo recibió. Lo que no ha salido
         sigue en la cola y se quita desde ahí, que es donde se ve a quién le
         toca — decirlo aquí evita el «lo he borrado y le ha llegado igual». */
      message:
        'Deja de pasar a partir de ahora. Lo que ya le llegó a alguien se queda donde está, y lo que está en la cola y aún no ha salido se quita desde «Lo que sale».',
      confirmLabel: 'Quitarla',
      tone: 'danger',
    });
    if (!ok) return;
    const res = await quitarAutomatizacion(auto.id);
    if (!res.ok) toast({ text: res.error, tone: 'danger' });
  };

  /* Lanzarla a mano: la ocurrencia es el id de ESE empujón, así que mandarla dos
     veces manda dos veces — y eso es lo correcto, porque el que la lanza es el
     dedo y el dedo sabe lo que hace. Lo que el libro impide es que el mismo
     empujón se cuente dos veces por una pestaña de más. */
  const lanzarAuto = async (auto) => {
    const res = await correrAutomatizaciones({ manual: { automationId: auto.id } });
    toast({
      text: res.ok
        ? res.hechas === 0
          ? 'No le tocaba a nadie: nadie lleva este protocolo puesto.'
          : `Mandado. ${res.hechas} ${res.hechas === 1 ? 'cosa ha salido' : 'cosas han salido'}.`
        : `Han salido ${res.hechas}, y ${res.fallos} no. Vuelve a lanzarla: solo se reintenta lo que falta.`,
      tone: res.ok ? undefined : 'danger',
    });
  };

  /*
    ══ Aquí hubo un «Ver como cliente» y se retiró ═══════════════════════════

    Cogía al PRIMER cliente que llevara este protocolo, te cambiaba el cliente
    activo por debajo y te soltaba en `/mi/inicio`. O sea que enseñaba el portal
    de alguien, no el protocolo: un protocolo no es una persona y no tiene
    portal, así que el botón no podía cumplir lo que prometía.

    Lo que sí se quería ver desde aquí —cómo le llega un formulario— se ve donde
    se monta, contestándolo: ver `VistaPreviaFormulario`.
  */

  // ══ UN ENVÍO ABIERTO ═════════════════════════════════════════════════════
  if (envio) return <EnvioAbierto envio={envio} onVolver={() => setEnvioAbierto(null)} />;

  /*
    ══ UN FORMULARIO ABIERTO ════════════════════════════════════════════════

    Se monta en lugar del banco y no en una ventana: el constructor es una
    pantalla entera —su estantería, su lienzo y su ensayo— y meterla en un modal
    sería enseñarla por una rendija. Al volver, `abierto` y `tocada` siguen
    donde estaban, así que se vuelve a la acción de la que se salió.

    La comprobación de que todavía existe no es defensiva de más: se puede haber
    quitado desde la lista del tramo de al lado, y un id muerto dejaría la
    pantalla en blanco sin decir por qué.
  */
  if (editando && formularios.some((f) => f.id === editando)) {
    return <EditorDeFormulario formId={editando} onVolver={() => setEditando(null)} />;
  }

  // ══ LA LISTA ═════════════════════════════════════════════════════════════
  if (!protocolo) {
    return (
      <div className="stack cascada">
        <div className="taller">
          <Cinta
            titulo="Protocolos"
            /*
              Dos tramos, con el mecanismo de banda que el Taller ya tiene. La
              puerta sigue llamándose «Protocolos» y no «Automatizaciones»:
              renombrarla pondría el nombre en la máquina y no en la forma de
              trabajar, que es lo que el entrenador viene a definir.

              Y la cifra es la de lo que VA A SALIR, que es lo único de esta
              pantalla que caduca. Cuántos protocolos tienes ya lo dice la lista
              treinta píxeles más abajo.
            */
            tramos={[
              { id: 'protocolos', label: 'Protocolos' },
              { id: 'sale', label: 'Lo que sale', n: porSalir },
              /*
                ── Y LOS FORMULARIOS SON EL TERCER TRAMO, no una puerta ─────

                Eran una fila propia en la barra del Taller, y las dos se pasaban
                el trabajo la una a la otra: el protocolo enlazaba a Formularios
                para escribir uno y Formularios enlazaba de vuelta para saber
                quién lo pide. Una pantalla que necesita una nota al pie para
                explicar qué mitad del trabajo le toca está partida por donde no
                debía.

                El tramo ES la ruta, como en la Librería: `/formularios` sigue
                existiendo, se puede enlazar y el botón de atrás hace lo que
                tiene que hacer. Lo que cambia es que en la barra ocupan una fila
                y no dos.
              */
              { id: 'formularios', label: 'Formularios', n: formularios.length },
            ]}
            tramo={tramo}
            onTramo={(id) => (id === 'formularios' ? navigate('/formularios') : setTramo(id))}
            accion={
              <span className="row gap-2">
                {/*
                  ── ÉSTE EN SECUNDARIO, Y PRIMERO: en una cinta hay UN azul ──

                  Estuvo en primario con el argumento de que mandar algo se hace
                  todas las semanas y definir un protocolo se hace una vez. El
                  argumento es cierto y aun así sobraba el color: con los dos en
                  azul la cabecera no dice cuál es la acción de esta pantalla,
                  dice que hay dos igual de importantes, y entonces el acento
                  deja de señalar nada. La ley del color pide que invite; con
                  dos invitaciones seguidas no invita ninguna.

                  Y va a la IZQUIERDA del azul, que es el orden de cualquier
                  cabecera: lo secundario se atraviesa, el verbo de la pantalla
                  remata la línea.
                */}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMandando(true)}>
                  <Send size={15} /> Mandar algo
                </button>
                {/* Primario, como el alta de las otras tres puertas del Taller
                    (alimento, ejercicio, formulario): dar de alta una pieza es
                    la acción de la colección, y en la cinta solo hay una. */}
                <button type="button" className="btn btn-primary btn-sm" onClick={nuevo}>
                  <Plus size={15} /> Nuevo protocolo
                </button>
              </span>
            }
          />

          <div className="cartera-cuerpo">
            {tramo === 'sale' ? (
              <LoQueSale />
            ) : (
              <>
            {/*
              ── LA INVITACIÓN DEL PRIMER DÍA ───────────────────────────────

              Un protocolo bien montado es lo que hace que la aplicación haga
              algo sola, y para montarlo hay que entender seis palabras nuevas
              —protocolo, acción, premisa, formulario, plantilla, enchufe— antes
              de tocar nada. Quien viene de una hoja de cálculo no tiene dónde
              agarrarse.

              Aquí no se le explica el vocabulario: se le ofrecen tres preguntas
              que ya sabe contestar, y después la pantalla de siempre. Y se
              ofrece UNA vez: cerrarla la apaga para siempre, porque un
              asistente que reaparece es un paso muerto que hay que esquivar.

              ── Y NO ES UN AVISO, que es lo que estaba mal ──────────────────

              Era un `Notice` de tono informativo: una losa azul a todo el ancho
              de la hoja, con tres frases dentro y dos botones —uno azul y otro
              gris— metidos en el renglón. Tres cosas que no eran:

              · Un aviso teñido dice «hay algo que saber». Esto no informa de
                nada: es una PUERTA, y una puerta se abre. El color del aviso se
                gastaba en algo que no había pasado.
              · «Empezar» y «Ya lo monto yo» son dos verbos enfrentados para lo
                que en realidad es entrar o quitarlo de en medio. El segundo
                además obligaba a leerse para entender que era el «no».
              · Y tres frases para una oferta de un clic.

              Ahora es una sola línea que se pulsa entera —la fila ES el botón,
              con su punta a la derecha— y una equis para apartarla. Es lo que
              hace cualquier aplicación moderna con una sugerencia: entrar o
              cerrarla, sin un párrafo en medio.
            */}
            {ofreceGuia && (
              <div className="invita">
                <button
                  type="button"
                  className="invita-entrar"
                  onClick={() => setGuiando(true)}
                >
                  <Sparkles size={15} className="invita-glifo" aria-hidden="true" />
                  <span className="invita-dice">
                    <b>Móntalo en tres preguntas.</b> Qué le das, qué le pides y de qué quieres que
                    te avise.
                  </span>
                  <ChevronRight size={15} className="invita-punta" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn-icon invita-cerrar"
                  onClick={apartarGuia}
                  aria-label="Quitar la invitación: lo montas tú"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Dos rótulos y no dos pestañas: lo que pasa SIEMPRE y lo que pasó
                UNA VEZ son la misma clase de cosa —una acción con su gente y su
                momento— y se leen del tirón. */}
            <p className="rotulo-tramo">Siempre</p>
            {protocolos.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Todavía no has definido cómo trabajas"
                message="Un protocolo dice qué le pasa a un cliente tuyo y cuándo: qué le pides al entrar, qué le preguntas cada semana y cuándo quieres que te avisen."
              />
            ) : (
              <div className="plantilla">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Protocolo</th>
                      <th scope="col">Qué lleva</th>
                      <th scope="col">Acciones</th>
                      <th scope="col">Clientes</th>
                      <th scope="col" aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {protocolos.map((p) => {
                      const desvio = conDesvio[p.id] || { atrasados: [], excepciones: [] };
                      return (
                        <tr key={p.id}>
                          <td>
                            {renombrando === p.id ? (
                              <RenombrarEnSitio
                                value={p.name}
                                onRename={(name) => guardarUno({ ...p, name })}
                                onDone={() => setRenombrando(null)}
                                label="el nombre del protocolo"
                              />
                            ) : (
                              <span className="p-name f-nombre">
                                <span className="f-disco" data-tono="4" aria-hidden="true">
                                  <FileText size={13} />
                                </span>
                                <button
                                  type="button"
                                  className="p-abrir"
                                  onClick={() => {
                                    setAbierto(p.id);
                                    setMontando(false);
                                    setTocada(null);
                                    setPaso('acciones');
                                  }}
                                >
                                  {p.name}
                                </button>
                              </span>
                            )}
                          </td>
                          <td>{activeServices(p).map((s) => s.label).join(' · ')}</td>
                          <td>{cuentaAcciones({ protocolo: p, formularios })}</td>
                          <td>
                            {porCliente[p.id] || 0}
                            {desvio.atrasados.length > 0 && (
                              <span className="badge badge-warn p-chapa">
                                {desvio.atrasados.length} atrasados
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="row">
                              <button
                                type="button"
                                className="btn btn-icon"
                                aria-label={`Duplicar ${p.name}`}
                                onClick={() => duplicar(p)}
                              >
                                <Copy size={15} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-icon btn-icon-danger"
                                aria-label={`Quitar ${p.name}`}
                                onClick={() => quitar(p)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="t-xs t-tertiary taller-pie">
              {protocolos.length} de {MAX_PROTOCOLOS}. Cada cliente lleva uno puesto; lo que le
              cambies a él en su ficha se queda suyo y no se lo pisa ningún protocolo.
            </p>

            <p className="rotulo-tramo">Una vez</p>
            <EnviosSeccion
              envios={envios}
              onAbrir={setEnvioAbierto}
              onMandar={() => setMandando(true)}
            />
              </>
            )}
          </div>
        </div>

        {mandando && <MandarAlgo onCerrar={() => setMandando(false)} />}

        {guiando && (
          <AltaGuiada
            protocolo={protocolos[0]}
            formularios={formularios}
            onMontar={montarGuia}
            onCerrar={() => setGuiando(false)}
          />
        )}
      </div>
    );
  }

  // ══ EL BANCO DE ACCIONES ═════════════════════════════════════════════════
  const plan = { protocolo, formularios };
  const acciones = accionesDe(plan);
  const grupos = porPremisa(acciones);
  const desvio = conDesvio[protocolo.id] || { atrasados: [], excepciones: [] };
  const horario = sanitizeSchedule(protocolo.schedule);
  const susAutomatizaciones = deProtocolo(automatizaciones || [], protocolo.id);
  const activa = acciones.find((a) => a.id === tocada) || acciones[0] || null;

  return (
    <div className="taller">
      <header className="cartera-cab cinta-pagina">
        <div className="cartera-cab-in">
          <div className="cartera-cab-linea">
            <button
              type="button"
              className="cab-volver"
              onClick={volver}
              aria-label="Volver a los protocolos"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="cartera-cab-titulo">
              {borrador ? borrador.name.trim() || 'Protocolo nuevo' : protocolo.name}
            </h1>
            {/* De un borrador no hay nada que contar: no lo lleva nadie todavía
                y decir «0 clientes» al lado del nombre que estás escribiendo es
                un cero donde no ha pasado nada. */}
            {!borrador && (
              <span className="t-xs t-tertiary">
                {porCliente[protocolo.id] || 0} clientes
                {desvio.atrasados.length > 0 && ` · ${desvio.atrasados.length} atrasados`}
                {desvio.excepciones.length > 0 && ` · ${desvio.excepciones.length} excepciones`}
              </span>
            )}

            {/*
              ══ EL CAMINO, EN EL RAÍL DE LA CINTA ═══════════════════════════

              Aquí había dos verbos: «Qué lleva» en secundario y «A quién se lo
              pones» en azul. Los dos eran pasos del mismo camino —el primero y
              el último— puestos en el sitio de lo que viene DESPUÉS, así que
              volver atrás parecía avanzar y el recorrido no se veía por ningún
              lado: eran tres muebles distintos (ventana, pantalla, ventana) que
              se tapaban unos a otros.

              Son tres tramos de esta misma pantalla, con su número, en la misma
              anatomía de raíl que la cartera y el resto del Taller. La marca
              viaja entre ellos, así que se ve por dónde vas y de dónde vienes.

              Y la numeración se la gana: esto SÍ es una secuencia —no se elige
              qué preguntar al terminar de entrenar si no le llevas el
              entrenamiento, y no se le pone a nadie lo que no está montado—.
              Montado ya, los tres se pueden pulsar en cualquier orden: el
              número dice por dónde se empieza, no por dónde se puede pasar.
            */}
            <nav
              ref={carrilPasos}
              className="tabs tramos cartera-cab-tabs camino"
              role="tablist"
              aria-label="Los pasos del protocolo"
            >
              {PASOS.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={paso === p.id}
                  /* Mientras es un borrador, los dos de después están apagados y
                     a la vista: se ve lo que queda por delante sin poder saltar a
                     una pantalla que habla de un protocolo que aún no existe. */
                  disabled={Boolean(borrador) && p.id !== 'lleva'}
                  onClick={() => setPaso(p.id)}
                >
                  <span className="camino-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  {p.label}
                </button>
              ))}
              <span className="tabs-marca" aria-hidden="true" />
            </nav>

            <div className="cartera-cab-acciones">
              {/*
                ── EL VERBO DEL CAMINO, EN LOS DOS TRAMOS QUE TIENEN SIGUIENTE ──

                Montándolo, esta cinta lleva azul: lo que se viene a hacer es
                terminar el paso y pasar al de al lado. Estaba solo en el ①
                porque colgaba del borrador, y el borrador muere justo al
                terminarlo: llegabas al ② y el camino te soltaba sin decir cómo
                seguir. Ahora el verbo acompaña hasta el ③, que es la última
                parada y ya tiene el suyo —«ponérselo a alguien»—, así que ahí
                se apaga y no hay dos azules en pantalla.

                Con el protocolo ya montado no hay verbo de paso: el raíl es
                navegación y el acento vive donde ocurre la acción.
              */}
              {borrador ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={seguir}>
                  Seguir <ArrowRight size={15} />
                </button>
              ) : montando && paso === 'acciones' ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setPaso('quien')}
                >
                  Seguir <ArrowRight size={15} />
                </button>
              ) : (
                desvio.atrasados.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={aplicando}
                    onClick={() => ponerAlDia(protocolo)}
                  >
                    <Users size={15} /> {aplicando ? 'Poniendo al día…' : 'Poner al día'}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      {/*
        ══ LOS PASOS ① Y ③ ═══════════════════════════════════════════════════

        Una columna y nada más: ni los dos planos del banco ni el carril de la
        acción. Lo que cambia al moverse por el raíl es esto, y solo esto — la
        cinta, el nombre y el sitio de la página se quedan donde estaban, que es
        lo que hace que avanzar no se sienta como cambiar de pantalla.
      */}
      {paso !== 'acciones' && (
        <div className="cartera-cuerpo stack">
          {aviso && (
            <div className="proto-paso">
              <Notice tone={aviso.tone}>{aviso.text}</Notice>
            </div>
          )}

          {paso === 'lleva' ? (
            <QueLleva
              protocolo={protocolo}
              borrador={Boolean(borrador)}
              onCambiar={cambiarLleva}
            />
          ) : (
            <AQuienSeLoPones
              protocolo={protocolo}
              clients={clients}
              coachPrefs={coachPrefs}
              aplicarACliente={applyProtocolToClient}
              onHecho={({ hechos }) =>
                setAviso({
                  tone: 'success',
                  text: `Se lo has puesto a ${hechos} ${hechos === 1 ? 'cliente' : 'clientes'}.`,
                })
              }
            />
          )}
        </div>
      )}

      {paso === 'acciones' && (
      <div className="cartera-cuerpo stack proto-banco">
        {/*
          ── Y AQUÍ NO VA NADA MÁS QUE EL ACUSE ─────────────────────────────

          Había, antes de la primera acción, la lista de quién tiene excepción
          rematada con «y "Poner al día" no les toca nada». Tres cosas mal en un
          renglón: iba PRIMERA —antes que el trabajo, que son las acciones—,
          estaba escrita en negativo, y cuando todos son la excepción la
          excepción no informa de nada.

          Ahora se cuenta donde se cuenta la gente, que es «Quién lo lleva», y
          se dice por lo que hace y no por lo que no hace. Aquí queda el acuse
          de lo que acabas de lanzar, que sí es de este momento.
        */}
        {aviso && (
          <div className="proto-cab stack-sm">
            <Notice tone={aviso.tone}>{aviso.text}</Notice>
          </div>
        )}

        <div className="plano-lista stack">
          {grupos.map((g) => (
            <section className="page-section" key={g.id}>
              <div className="premisa">
                <span className="premisa-rot">{g.rot}</span>
                <span className="premisa-regla" aria-hidden="true" />
              </div>

              {/*
                ── EL CUÁNDO ES UNA FRASE, no dos cajas junto al rótulo ──────

                Los dos desplegables vivían DENTRO del rótulo, a tres píxeles de
                él, y con cadencia de dos la línea leía «CADA SEMANA · lunes ·
                cada 2 semanas»: una contradicción literal entre el nombre del
                tramo —que es la premisa, el momento de la vida del cliente— y
                el horario, que es otra cosa.

                Y los dos iban desnudos. El lector de pantalla sí sabía cuál era
                cuál (`aria-label`), pero quien MIRA tenía que deducir qué
                gobernaba «lunes» por lo que había dentro de la caja.

                Ahora es la frase que se diría en voz alta, con las dos palabras
                editables en su sitio —se escribe donde se lee, que es la
                gramática de la casa—. El rótulo vuelve a ser solo el momento.
              */}
              {g.id === 'semana' && (
                <p className="premisa-frase">
                  Le pides el check-in los{' '}
                  <select
                    className="input input-sm premisa-dia"
                    value={horario.weekday}
                    aria-label="Qué día se le pide el check-in"
                    onChange={(e) =>
                      guardarUno({
                        ...protocolo,
                        schedule: { ...horario, weekday: Number(e.target.value) },
                      })
                    }
                  >
                    {DIAS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.plural}
                      </option>
                    ))}
                  </select>
                  ,{' '}
                  <select
                    className="input input-sm premisa-dia"
                    value={horario.everyWeeks}
                    aria-label="Cada cuántas semanas se le pide"
                    onChange={(e) =>
                      guardarUno({
                        ...protocolo,
                        schedule: { ...horario, everyWeeks: Number(e.target.value) },
                      })
                    }
                  >
                    {CHECKIN_CADENCES.map((c) => (
                      <option key={c.weeks} value={c.weeks}>
                        {c.weeks === 1 ? 'todas las semanas' : `cada ${c.weeks} semanas`}
                      </option>
                    ))}
                  </select>
                  .
                </p>
              )}

              {/*
                Quién no lleva esta cita, dicho donde se decide. No es un aviso
                de error: es la consecuencia del mando que hay tres píxeles más
                arriba, y sin ella el entrenador cambia el día creyendo que
                cambia el de todos —que es exactamente lo que esta pantalla
                prometía y no cumplía—.
              */}
              {g.id === 'semana' && citas.distintos.length > 0 && (
                <p className="t-xs t-tertiary premisa-cita">
                  {citas.distintos.length === 1
                    ? `${citas.distintos[0].name} tiene otro día`
                    : `${citas.distintos.length} de tus ${porCliente[protocolo.id] || citas.distintos.length} clientes tienen otro día`}
                  : se lo quedan.{' '}
                  <button
                    type="button"
                    className="link"
                    disabled={aplicando}
                    onClick={cambiarLasCitas}
                  >
                    Ponerles el {diaDe(protocolo.schedule)}
                  </button>
                </p>
              )}

              {g.acciones.map((a) => (
                <FilaAccion
                  key={a.id}
                  accion={a}
                  tocada={activa?.id === a.id}
                  onTocar={() => setTocada(a.id)}
                  onQuitar={() => {
                    guardarPlan(quitarAccion(plan, a));
                    if (tocada === a.id) setTocada(null);
                  }}
                />
              ))}
            </section>
          ))}

          {/* El verbo de la casa, como en el constructor de formularios y en la
              hoja de Entreno. Ver `docs/producto.md` §5.8. */}
          <BotonMas palabra="acción" onClick={() => setAnadiendo({ paso: 'que' })} />

          {/*
            ══ Y debajo, lo que le pasa SOLO ══════════════════════════════════

            Las premisas de arriba y el carril de abajo contestan la misma
            pregunta —qué le pasa a esta persona— y por eso viven en la misma
            columna y no en dos pestañas. Lo que las separa es de dónde sale cada
            una: arriba, de lo que el protocolo ya sabía hacer (el alta, el
            check-in, la sesión); abajo, de lo que tú escribas.

            Que sigan siendo dos listas es un estado intermedio dicho en voz
            alta, no un descuido: el §2.4 del doc da por muerta la columna de
            conmutadores como forma de contar lo que le pasa a alguien, pero
            mudar el alta y el check-in a automatizaciones es mover el dato de
            cada cliente y eso no cabe en esta tanda.
          */}
          <p className="rotulo-tramo">Qué le pasa solo</p>
          <CarrilAutomatizaciones
            protocoloId={protocolo.id}
            automatizaciones={susAutomatizaciones}
            todas={automatizaciones}
            formularios={mandables}
            onGuardar={guardarAuto}
            onQuitar={quitarAuto}
            onLanzar={lanzarAuto}
          />

          <p className="t-xs t-tertiary taller-pie">
            Tus protocolos se guardan en tu cuenta y te siguen de un ordenador a otro. Lo que cada
            cliente tiene puesto vive en su ficha: cambiar el protocolo no toca a nadie hasta que
            pones al día, y a quien tenga una excepción no lo toca ni entonces.
          </p>
        </div>

        {/*
          ══ EL CARRIL SE QUEDA CON UNA COSA: LA ACCIÓN TOCADA ══════════════

          Tenía tres tramos —qué lleva, la acción, quién lo lleva— y solo el de
          en medio es el protocolo. Los otros dos eran las otras tres cosas que
          esta pantalla hacía a la vez: el alcance y las piezas (lo que se
          incluye), y la administración (cuánta gente, cuánta atrasada).

          · **Qué lleva** es ahora el paso ① del raíl: no ocurre en ningún
            momento, así que no cabe en una línea de tiempo, pero tampoco es una
            capa que se abre encima — es la primera parada del camino.
          · **Quién lo lleva** se fue de aquí, y no porque estorbara: porque lo
            REPETÍA. «6 clientes · 6 excepciones» es exactamente lo que dice la
            cabecera tres centímetros más arriba, y «1 cosa le pasa sola» es lo
            que cuenta el carril de automatizaciones que hay debajo, con sus
            pasos delante. La misma falta que tenía el detalle de la acción.
            Los nombres de quien tiene excepción los dice el acuse de «Poner al
            día» —«Las 6 excepciones se quedan como estaban»—, que es cuando
            importan, y la ficha de cada uno lo dice de esa persona. Repartirlo
            es otra cosa, y ésa es el paso ③.

          Lo que queda es lo que la pantalla ES: una lista de acciones con su
          premisa, y a su lado el detalle de la que estás tocando.

          ── Y va DESPUÉS de la lista en el marcado ───────────────────────────
          Iba antes, y a ≥1440 daba igual porque la rejilla coloca los dos
          planos a mano. Pero por debajo de ese ancho la rejilla no existe y
          manda el orden de las fuentes: la pantalla abría con el detalle de una
          acción que todavía no habías visto — se lee al revés.
        */}
        <aside className="plano-ficha proto-plano" aria-label="La acción">
          <section className="col gap-3" aria-labelledby="proto-accion">
            <h2 className="plano-ficha-tit" id="proto-accion">
              La acción
            </h2>
            {/* Nunca vacío — sin elección manda la primera, como en Ejercicios. */}
            {activa ? (
              <CarrilAccion
                accion={activa}
                plan={plan}
                onPlan={guardarPlan}
                onEditarFormulario={(form) => irAEditar(form)}
              />
            ) : (
              <p className="ajustes-nada">
                Este protocolo no hace nada todavía. Añade la primera acción y aparecerá aquí.
              </p>
            )}
          </section>

        </aside>
      </div>
      )}

      {anadiendo && (
        <SelectorAccion
          estado={anadiendo}
          onEstado={setAnadiendo}
          formularios={formularios}
          onAnadir={(datos) => {
            guardarPlan(anadirAccion(plan, datos));
            setAnadiendo(null);
          }}
        />
      )}
    </div>
  );
};

/* ══ La fila: un verbo y un sujeto ═══════════════════════════════════════ */

const FilaAccion = ({ accion, tocada, onTocar, onQuitar }) => (
  <div className={`q-card${tocada ? ' is-tocada' : ''}`}>
    <button type="button" className="q-cuerpo" onClick={onTocar}>
      <Disco familia={accion.familia} tipo={accion.tipo} />
      <span className="q-texto">
        <span className="a-verbo">{accion.verbo}</span>
        <span className="q-titulo">{accion.suj}</span>
        <span className="q-tipo">{accion.dice}</span>
      </span>
    </button>
    {accion.lleva && <span className="q-donde">{accion.lleva}</span>}
    <button
      type="button"
      className="btn btn-icon btn-icon-danger q-quitar"
      aria-label={`Quitar ${accion.suj}`}
      onClick={onQuitar}
    >
      <Trash2 size={13} />
    </button>
  </div>
);

/* ══ El carril: lo que se puede cambiar de la acción tocada ══════════════ */

const CarrilAccion = ({ accion, plan, onPlan, onEditarFormulario }) => {
  const { protocolo, formularios } = plan;
  const set = (next) => onPlan({ protocolo: next, formularios });
  /* Qué guía de medición está abierta en capa, si alguna. */
  const [guia, setGuia] = useState(null);

  const momento = accion.premisa === 'entrar' ? 'alta' : accion.premisa === 'sesion' ? 'sesion' : 'semana';
  const suyo = formularios.find((f) => f.id === accion.formId);

  return (
    <div className="col gap-3">
      {/*
        ── EL PANEL NO REPITE LA TARJETA ───────────────────────────────────

        Aquí debajo del nombre iba «{verbo} · {dice}», que es LITERALMENTE lo
        que ya dice la fila de la izquierda: con «Alta» tocada, la tarjeta leía
        «PÍDELE · Alta · El cuestionario que contesta en su portal» y el panel
        volvía a leer lo mismo. De todo el panel, lo único que la tarjeta no
        decía era con qué formulario se cumple la acción.

        Un panel que repite se lee dos veces buscando la diferencia. Se queda el
        NOMBRE, que es lo que ancla —dice de cuál de las filas estás viendo el
        detalle— y se va el eco. Y en el caso del check-in el eco era doble:
        `dice` es la enumeración de lo que se mide («su peso, sus perímetros y
        sus pliegues») y justo debajo está la lista entera, pieza a pieza.
      */}
      <div className="ajustes-cual">
        <b>{accion.suj}</b>
      </div>

      {/* ── Un formulario: cuál, y la puerta para editarlo ───────────────

          Sin el pie «Se escribe en Formularios; aquí se elige cuál se usa»:
          justo debajo está «14 preguntas · editarlo →», que dice lo mismo y
          además lleva a donde se escribe. Dos renglones para una sola idea, y
          el que sobraba era el que no hacía nada.

          Y el desplegable va en `select-sm`: a todo lo ancho del panel, un
          campo de 54 px para la palabra «Alta» era lo más ruidoso de una
          columna que se lee, no se rellena. */}
      {accion.tipo === 'form' && (
        <Field label="Qué formulario">
          <select
            className="select select-sm"
            value={suyo?.id || ''}
            onChange={(e) => {
              const clave = momento === 'alta' ? 'alta' : momento;
              set({ ...protocolo, forms: { ...protocolo.forms, [clave]: e.target.value } });
            }}
          >
            {formularios
              .filter((f) => f.momento === momento)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      {/*
        ── Lo que lleva dentro, en LECTURA ─────────────────────────────────

        Aquí había tres mandos —cuántos pesajes, y obligatorio/opcional por
        bloque— que escriben exactamente los mismos campos que los enchufes del
        constructor. El mando se queda en un solo sitio, el formulario, y aquí
        se lee lo que hay puesto: es lo que hace falta para decidir si este
        protocolo pide lo que tiene que pedir.

        Las de medida llevan su lámina, que es la misma que verá el cliente al
        rellenarlo. En capa y no en el carril porque la figura y su lista no
        caben en 400 px.
      */}
      {accion.piezas?.length > 0 && (
        <Field label="Qué se le mide" hint="Se enciende y se apaga dentro del formulario.">
          <ul className="carril-piezas">
            {accion.piezas.map((p) => (
              <li key={p.id}>
                <span className="carril-pieza-nm">{p.suj}</span>
                <span className="carril-pieza-lleva">{p.lleva}</span>
                {p.bloque && (
                  <button type="button" className="link" onClick={() => setGuia(p.bloque)}>
                    cómo se mide
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Field>
      )}

      {guia && (
        <Modal
          size="lg"
          title={guia === 'folds' ? 'Cómo se miden los pliegues' : 'Cómo se miden los perímetros'}
          onClose={() => setGuia(null)}
        >
          <GuiaDeMedidas que={guia === 'folds' ? 'pliegue' : 'cinta'} />
        </Modal>
      )}

      {accion.tipo === 'form' && suyo && (
        <button type="button" className="link self-start" onClick={() => onEditarFormulario(suyo)}>
          {cuentaPreguntas(suyo)} preguntas · editarlo →
        </button>
      )}

      {/* Sin formulario apuntado, el protocolo sigue pidiendo su check-in con
          las piezas heredadas y no hay nada que editar. Se dice, y el
          desplegable de arriba es la salida. */}
      {accion.id === 'form:semana' && !suyo && (
        <p className="ajustes-nota">
          Este protocolo no tiene formulario de la semana apuntado, así que lo que se le pide vive
          suelto en él. Elige uno arriba y podrás editarlo entero.
        </p>
      )}

      {/* ── Un paso del alta: de quién es ───────────────────────────────── */}
      {accion.stepId && (
        <PasoDelAlta accion={accion} protocolo={protocolo} onSet={set} />
      )}

      {/* ── Una vara de aviso ───────────────────────────────────────────── */}
      {accion.id?.startsWith('alert:') && (
        <Field
          label="A los cuántos días"
          hint="Sale en tu cola de Inicio. El cliente no se entera de esto."
        >
          <input
            className="input input-sm input-center"
            inputMode="numeric"
            style={{ width: 80 }}
            value={protocolo.alertDays?.[accion.id.slice(6)] || ''}
            aria-label={`Días antes de avisar: ${accion.suj}`}
            onChange={(e) =>
              set({
                ...protocolo,
                alertDays: {
                  ...protocolo.alertDays,
                  [accion.id.slice(6)]: clampInt(e.target.value, 1, ALERT_DAYS_MAX, 1),
                },
              })
            }
          />
        </Field>
      )}

      {/* ── El recordatorio ─────────────────────────────────────────────── */}
      {accion.id === 'recordatorio' && (
        <Field
          label="A los cuántos días se lo recuerdas"
          hint="Le llega como una novedad más en su portal, con el mismo descarte que las demás. Sin reproches."
        >
          <SegmentedControl
            value={sanitizeSchedule(protocolo.schedule).remindAfter || 1}
            onChange={(n) =>
              set({ ...protocolo, schedule: { ...sanitizeSchedule(protocolo.schedule), remindAfter: n } })
            }
            options={Array.from({ length: REMIND_MAX }, (_, i) => ({ id: i + 1, label: String(i + 1) }))}
            label="Días antes del recordatorio"
          />
        </Field>
      )}

      <p className="ajustes-nota">
        {accion.quien === 'client'
          ? 'Lo hace él, desde su portal.'
          : accion.quien === 'app'
            ? 'Lo hace la aplicación.'
            : 'Es tuyo: una casilla que marcas tú.'}
      </p>
    </div>
  );
};

/**
 * De quién es un paso del alta.
 *
 * Los tres AUTOMÁTICOS no se mueven, y se dice por qué: lo que los da por hechos
 * es que él los haya entregado, así que del lado del entrenador serían una
 * casilla que no se puede marcar.
 */
const PasoDelAlta = ({ accion, protocolo, onSet }) => {
  const paso = stepById(protocolo.intake, accion.stepId);
  if (!paso) return null;

  if (paso.auto) {
    return (
      <p className="ajustes-nota">
        <Lock size={13} className="icon-inline" aria-hidden="true" /> Se marca solo cuando él lo
        entrega, así que es suyo siempre.
      </p>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() =>
        onSet({
          ...protocolo,
          intake: setStepOwner(
            protocolo.intake,
            accion.stepId,
            accion.quien === 'client' ? 'coach' : 'client'
          ),
        })
      }
    >
      <ArrowLeftRight size={15} />
      {accion.quien === 'client' ? 'Pasar a que lo hagas tú' : 'Pasar a que lo entregue él'}
    </button>
  );
};

/* ══ El selector: «¿Qué pasa?» → «¿Y cuándo?» ════════════════════════════ */

const SelectorAccion = ({ estado, onEstado, formularios, onAnadir }) => {
  const { paso, que = null, cuando = null } = estado;
  const elegido = que ? QUE_CATALOGO.flatMap((g) => g.items).find((i) => i.id === que) : null;
  const premisas = que ? premisasDe(que).filter((p) => p.id !== 'mandada') : [];

  const momento = cuando === 'entrar' ? 'alta' : cuando === 'sesion' ? 'sesion' : 'semana';
  const candidatos = formularios.filter((f) => f.momento === momento);
  const [formId, setFormId] = useState('');

  return (
    <Modal
      size="lg"
      title={paso === 'que' ? '¿Qué quieres que pase?' : '¿Y cuándo?'}
      onClose={() => onEstado(null)}
    >
      {paso === 'que' ? (
        <div className="selector">
          <div className="selector-cab">
            <h2 className="selector-tit">¿Qué quieres que pase?</h2>
            <p className="selector-sub">Empieza por lo que quieres que ocurra.</p>
          </div>
          <div className="selector-grupos">
            {QUE_CATALOGO.map((g) => (
              <div className="selector-col" key={g.hace}>
                <p className="selector-rot">{g.rot}</p>
                {g.items.map((it) => {
                  const Icono = ICONO_TIPO[it.id] || ICONO[g.hace === 'avisar' ? 'aviso' : 'form'];
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className="pieza"
                      onClick={() => onEstado({ paso: 'cuando', que: it.id })}
                    >
                      <span className="q-glifo">
                        <Icono size={13} />
                      </span>
                      <span className="pieza-texto">
                        <span className="pieza-nom">{it.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="selector">
          <div className="selector-cab">
            <h2 className="selector-tit">¿Y cuándo?</h2>
            <p className="selector-sub">{elegido?.label}</p>
          </div>
          <div className="selector-grupos">
            <div className="selector-col">
              <p className="selector-rot">La premisa</p>
              {premisas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="pieza"
                  aria-pressed={cuando === p.id}
                  onClick={() => onEstado({ ...estado, cuando: p.id })}
                >
                  <span className="pieza-texto">
                    <span className="pieza-nom">{p.rot}</span>
                    <span className="pieza-dice">{p.hint}</span>
                  </span>
                </button>
              ))}
            </div>

            {cuando && que === 'form' && (
              <div className="selector-col">
                <p className="selector-rot">Cuál</p>
                <Field label="El formulario" hint="Se escribe en Formularios.">
                  <select
                    className="select"
                    value={formId || candidatos[0]?.id || ''}
                    onChange={(e) => setFormId(e.target.value)}
                  >
                    {candidatos.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
          </div>

          <div className="row-end gap-2" style={{ marginTop: 'var(--s5)' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEstado({ paso: 'que' })}>
              Atrás
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!cuando}
              onClick={() =>
                onAnadir({
                  que,
                  premisa: cuando,
                  formId: formId || candidatos[0]?.id || null,
                  label: elegido?.label,
                })
              }
            >
              Añadir la acción
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

/* Las premisas se exportan para la prueba que vigila que la pantalla y el
   dominio no puedan discrepar sobre cuántas hay. */
export { PREMISAS, ALERT_DAYS };
