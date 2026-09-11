import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowLeftRight,
  Bell,
  CalendarClock,
  Camera,
  CheckSquare,
  Copy,
  Eye,
  FileText,
  Lock,
  Plus,
  Ruler,
  Scale,
  Send,
  SlidersHorizontal,
  Trash2,
  Users,
  Video,
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
  EVERY_MAX,
  MAX_PROTOCOLOS,
  REMIND_MAX,
  buildProtocolo,
  coachProtocolos,
  cuentaClientes,
  protocolosToPreferences,
  sanitizeSchedule,
} from '@/domain/protocolos';
import {
  coachFormularios,
  cuentaPreguntas,
  formulariosMandables,
  formulariosToPreferences,
} from '@/domain/formularios';
import { agrupar, vigente } from '@/domain/envios';
import { cuentaPasos, deProtocolo, nombreDe } from '@/domain/automatizaciones';
import { CarrilAutomatizaciones } from './CarrilAutomatizaciones';
import { LoQueSale } from './LoQueSale';
import { MandarAlgo } from '@/components/Coach/MandarAlgo';
import { EnvioAbierto, EnviosSeccion } from './Envios';
import { GuiaDeMedidas } from './GuiaDeMedidas';
import { ALERT_DAYS, ALERT_DAYS_MAX, activeServices } from '@/domain/protocol';
import { setStepOwner, stepById } from '@/domain/intake';
import { necesitaSuPlan, parchePara, protegidoDeSuPlan } from '@/lib/protocolTemplate';
import { clampInt } from '@/lib/num';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { EmptyState, Field, Notice, RenombrarEnSitio, SegmentedControl } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { Cinta } from '@/components/ui/Cinta';
import { ServicesSection } from '@/components/Coach/Settings/Protocol/ServicesSection';
import { ModulesSection } from '@/components/Coach/Settings/Protocol/ModulesSection';

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

export const ProtocolosPanel = () => {
  const {
    coachPrefs,
    clients,
    activeClient,
    openClientView,
    applyProtocolToClient,
    setSelectedClientId,
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
  const [tocada, setTocada] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  const [anadiendo, setAnadiendo] = useState(null);
  const [aplicando, setAplicando] = useState(false);
  const [aviso, setAviso] = useState(null);
  /* Lo de «una vez»: el envío abierto y el diálogo de mandar. */
  const [envioAbierto, setEnvioAbierto] = useState(null);
  const [mandando, setMandando] = useState(false);
  /* Qué mitad de la puerta se mira: los protocolos, o lo que sale de ellos. */
  const [tramo, setTramo] = useState('protocolos');
  /* El reloj del repaso. Ver `guardarAuto`. */
  const relojRepaso = useRef(null);

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
  const protocolo = protocolos.find((p) => p.id === abierto) || null;

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
  const porSalir = useMemo(
    () => (envioRows || []).filter((f) => f.due && !vigente(f) && !f.submitted_at).length,
    [envioRows]
  );

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
    Editar el formulario de una acción SIN perder de vista de dónde vienes.

    Antes esto era `navigate('/formularios')` a secas: te dejaba en la lista, con
    el formulario que ibas a editar por buscar, y al volver, en la lista de
    protocolos. Las dos mitades del Taller son la misma cosa —el protocolo dice
    cuándo, el formulario dice qué— y moverse entre ellas no puede costar cuatro
    clics y un esfuerzo de memoria.
  */
  const irAEditar = (form) =>
    navigate('/formularios', {
      state: { abrir: form.id, volver: { to: '/protocolos', abrir: abierto } },
    });

  const nuevo = () => {
    if (protocolos.length >= MAX_PROTOCOLOS) {
      toast({ text: `Ya tienes ${MAX_PROTOCOLOS} protocolos, que es el tope.` });
      return;
    }
    const creado = buildProtocolo({ name: `Protocolo ${protocolos.length + 1}`, desde: protocolos[0] });
    guardarProtocolos([...protocolos, creado]);
    setAbierto(creado.id);
    setRenombrando(creado.id);
  };

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

  const verComoCliente = (p) => {
    const suyos = clients.filter((c) => (c.preferences?.protocolId || protocolos[0]?.id) === p.id);
    if (suyos.length === 0) {
      toast({ text: 'Todavía no lo lleva nadie: dáselo a alguien y podrás verlo desde su portal.' });
      return;
    }
    if (!suyos.some((c) => c.id === activeClient?.id)) setSelectedClientId(suyos[0].id);
    openClientView('/mi/inicio');
  };

  // ══ UN ENVÍO ABIERTO ═════════════════════════════════════════════════════
  if (envio) return <EnvioAbierto envio={envio} onVolver={() => setEnvioAbierto(null)} />;

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
            ]}
            tramo={tramo}
            onTramo={setTramo}
            accion={
              <span className="row gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={nuevo}>
                  <Plus size={15} /> Nuevo protocolo
                </button>
                {/* El verbo de la pantalla. Va en azul porque es lo que invita
                    (ver la ley del color) y porque es lo que se viene a hacer:
                    definir un protocolo se hace una vez, mandar algo se hace
                    todas las semanas. */}
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setMandando(true)}>
                  <Send size={15} /> Mandar algo
                </button>
              </span>
            }
          />

          <div className="cartera-cuerpo">
            {tramo === 'sale' ? (
              <LoQueSale />
            ) : (
              <>
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
                                    setTocada(null);
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
              onClick={() => setAbierto(null)}
              aria-label="Volver a los protocolos"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="cartera-cab-titulo">{protocolo.name}</h1>
            <span className="t-xs t-tertiary">
              {porCliente[protocolo.id] || 0} clientes
              {desvio.atrasados.length > 0 && ` · ${desvio.atrasados.length} atrasados`}
              {desvio.excepciones.length > 0 && ` · ${desvio.excepciones.length} excepciones`}
            </span>
            <div className="cartera-cab-acciones">
              {desvio.atrasados.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={aplicando}
                  onClick={() => ponerAlDia(protocolo)}
                >
                  <Users size={15} /> {aplicando ? 'Poniendo al día…' : 'Poner al día'}
                </button>
              )}
              <button type="button" className="cab-accion" onClick={() => verComoCliente(protocolo)}>
                <Eye size={15} aria-hidden="true" />
                <span>Ver como cliente</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="cartera-cuerpo stack proto-banco">
        <div className="proto-cab stack-sm">
          {aviso && <Notice tone={aviso.tone}>{aviso.text}</Notice>}
          {desvio.excepciones.length > 0 && (
            <p className="t-xs t-tertiary">
              {desvio.excepciones.map((c) => c.name).slice(0, 4).join(', ')}
              {desvio.excepciones.length > 4 && ` y ${desvio.excepciones.length - 4} más`}{' '}
              {desvio.excepciones.length === 1 ? 'tiene una excepción' : 'tienen excepciones'} y
              «Poner al día» no {desvio.excepciones.length === 1 ? 'le' : 'les'} toca nada.
            </p>
          )}
        </div>

        {/*
          El carril del banco, con dos cosas y en este orden: QUÉ LLEVA este
          protocolo —el alcance, que no es una acción porque no pasa en ningún
          momento— y debajo la acción tocada.

          Estaban a la izquierda, encabezando el trabajo, y con todo encendido
          eran ocho rectángulos de acento a lo ancho de la hoja: la pantalla
          abría sin enseñar ni una sola acción, que es lo que la pantalla ES. Un
          ajuste que se toca al montar el protocolo y no se vuelve a mirar no
          puede ocupar la primera pantalla del sitio donde se trabaja todas las
          semanas.
        */}
        {/*
          ══ Y ES UN PANEL DE TRES TRAMOS, no tres títulos seguidos ══════════

          Los tres rótulos eran `<h2>` del mismo cuerpo y peso que el título de
          una página, apilados con un hueco de 12 px y sin nada que los separe:
          se leían como tres cosas distintas puestas en la misma columna por
          casualidad, y competían con el nombre del protocolo que hay arriba.

          Aquí son RÓTULOS DE TRAMO —el mismo `.rotulo-tramo` que encabeza «Al
          entrar» o «Qué le pasa solo» en la columna de al lado— con su filete
          entre medias. El panel pasa a leerse como lo que es: un mueble con
          tres cajones, y lo que se mira dentro de cada uno es el dato, no su
          encabezado.
        */}
        <aside className="plano-ficha proto-plano" aria-label="Este protocolo">
          <section className="col gap-3 proto-lleva">
            <h2 className="plano-ficha-tit">Qué lleva</h2>
            <ServicesSection
              protocol={protocolo}
              onSave={(next) => guardarUno({ ...protocolo, ...next })}
              desnudo
            />
            <ModulesSection
              protocol={protocolo}
              onSave={(next) => guardarUno({ ...protocolo, ...next })}
              plegable
            />
          </section>

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

          {/*
            ══ Y el panel CUENTA, no receta ══════════════════════════════════

            Cuánta gente lo lleva, cuánta se ha quedado atrás y cuántas cosas le
            pasan solas. Ni una frase que proponga cambiar nada: el criterio es
            del entrenador y esta columna es información. Lo que sí hace es
            llevar a donde se arregla — la cifra de la cola es un enlace, porque
            «4 cosas van a salir» sin poder ver cuáles es una cifra que inquieta
            y no informa.
          */}
          <section className="col gap-3" aria-labelledby="proto-quien">
            <h2 className="plano-ficha-tit" id="proto-quien">
              Quién lo lleva
            </h2>
            <p className="t-sm">
              {porCliente[protocolo.id] || 0}{' '}
              {(porCliente[protocolo.id] || 0) === 1 ? 'cliente' : 'clientes'}
              {desvio.atrasados.length > 0 && ` · ${desvio.atrasados.length} atrasados`}
              {desvio.excepciones.length > 0 &&
                ` · ${desvio.excepciones.length} ${desvio.excepciones.length === 1 ? 'excepción' : 'excepciones'}`}
            </p>
            <p className="t-xs t-tertiary">
              {cuentaPasos(susAutomatizaciones) === 0
                ? 'No le pasa nada solo.'
                : `${cuentaPasos(susAutomatizaciones)} ${
                    cuentaPasos(susAutomatizaciones) === 1 ? 'cosa le pasa sola' : 'cosas le pasan solas'
                  }.`}
            </p>
            {/* Un enlace y no un botón a todo lo ancho. Esto no es el verbo de
                la pantalla —la pantalla se usa para montar el protocolo, no
                para mirar la cola—: es la puerta a donde se ve lo que la cifra
                de arriba está contando, y una puerta se lee, no se pulsa por
                accidente. La ley de los gestos: el verbo va en azul. */}
            <button
              type="button"
              className="link proto-plano-link"
              onClick={() => {
                setAbierto(null);
                setTramo('sale');
              }}
            >
              <CalendarClock size={13} aria-hidden="true" />
              {porSalir === 0 ? 'Ver lo que sale' : `Ver lo que sale · ${porSalir}`}
            </button>
          </section>
        </aside>

        <div className="plano-lista stack">
          {grupos.map((g) => (
            <section className="page-section" key={g.id}>
              <div className="premisa">
                <span className="premisa-rot">{g.rot}</span>
                {/* El cuándo del check-in, donde se lee: en el rótulo de su
                    premisa. Es el «schedule» que no existía. */}
                {g.id === 'semana' && (
                  <>
                    <select
                      className="input input-sm premisa-dia"
                      value={horario.day}
                      aria-label="Qué día se le pide el check-in"
                      onChange={(e) =>
                        guardarUno({
                          ...protocolo,
                          schedule: { ...horario, day: Number(e.target.value) },
                        })
                      }
                    >
                      {DIAS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.corto}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input input-sm premisa-dia"
                      value={horario.every}
                      aria-label="Cada cuántas semanas se le pide"
                      onChange={(e) =>
                        guardarUno({
                          ...protocolo,
                          schedule: { ...horario, every: Number(e.target.value) },
                        })
                      }
                    >
                      {Array.from({ length: EVERY_MAX }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n === 1 ? 'todas las semanas' : `cada ${n} semanas`}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <span className="premisa-regla" aria-hidden="true" />
              </div>

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

          <button type="button" className="btn anadir-pregunta" onClick={() => setAnadiendo({ paso: 'que' })}>
            <Plus size={15} /> Añadir acción
          </button>

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
      </div>

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
      <div className="ajustes-cual">
        <b>{accion.suj}</b>
        <span>
          {accion.verbo} · {accion.dice}
        </span>
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
