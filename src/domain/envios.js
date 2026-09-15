/**
 * LOS ENVÍOS: el «a quién» y el «cuándo» que a las acciones les faltaban.
 *
 * ══ La tesis, corregida ════════════════════════════════════════════════════
 *
 * `domain/acciones.js` construyó la acción con dos respuestas —QUÉ y CUÁNDO— y
 * dio la tercera por supuesta: a quién le pasa. Era siempre «el que lleve este
 * protocolo». Por eso «que estos cinco rellenen esto hoy, porque sí» no cabía en
 * ninguna parte: no faltaba un botón, faltaba la pregunta.
 *
 *   **Una acción son tres respuestas: qué, a quién y cuándo.**
 *
 * Un protocolo es la acción cuya audiencia es «los que lo llevan» y cuyo momento
 * es un tramo de la vida del cliente. Un envío es la MISMA clase de cosa con la
 * audiencia dicha a mano y el momento dicho ahora. Se leen con la misma gramática
 * y por eso viven en la misma pantalla.
 *
 * ══ Y la cuarta, que es la que reparte el trabajo ══════════════════════════
 *
 * Faltaba **de quién es**. De ella salen los dos carriles, y los dos ya
 * existían a medias:
 *
 *   · **Suya** — le pides o le das algo. Tiene entrega, así que necesita tabla:
 *     `client_actions` (0105), que hasta esa migración solo admitía formularios
 *     y por eso el formulario era la única acción de primera clase del producto.
 *   · **Tuya** — te acuerdas de hacer algo con esa persona un día. Tiene fecha,
 *     y ya tiene carril: `client_events` (0009), con su agenda, sus vencidos y
 *     su bandeja montadas en `domain/today.js`. Una segunda lista de deberes
 *     tuyos aquí sería un segundo sitio donde mirar la misma pregunta.
 *
 * ══ Lo que NO se inventa aquí ══════════════════════════════════════════════
 *
 * Ni una audiencia nueva. El producto ya sabe decir a quién: los marcados en la
 * cartera, una etiqueta (`clients.tags`, 0093), un protocolo
 * (`preferences.protocolId`), un tramo (`portfolio.js`) o todos. Inventar
 * «segmentos» habría sido un cuarto sitio donde decir lo mismo.
 *
 * Y ni un canal nuevo. Lo que no es un formulario —un vídeo, un documento, una
 * casilla tuya— ya tenía primitiva: `mandarleAlgo` de `acciones.js`, que escribe
 * un paso propio en el alta del cliente y que su portal ya pinta. Aquí solo se
 * reparte a varios. El único que necesitaba sitio nuevo era el formulario, y el
 * porqué está en la migración 0099: hasta hoy solo cabía uno por cliente y sus
 * respuestas se machacaban entre sí.
 *
 * ══ Y nada «llega» ═════════════════════════════════════════════════════════
 *
 * No hay servidor que dispare nada: ni `pg_cron` desplegado ni funciones
 * programadas. Todo lo que la aplicación hace «sola» lo hace cuando alguien abre
 * la pantalla. Así que un envío es una ESCRITURA en el momento de pulsar, y lo
 * que se le promete al entrenador es lo único cierto: **lo verá la próxima vez
 * que entre**. El texto de la pantalla lo dice así a propósito.
 */

import { isArchived, isPaused } from './portfolio';
import { clientProtocoloId } from './protocolos';
import { cuentaElementos } from './formulario';
import { newUuid } from '@/lib/ids';

/**
 * Tope de personas por envío.
 *
 * No es una regla de producto, es una consecuencia: cada persona es una fila y
 * las filas se escriben desde el navegador, de una en una. Con cuarenta ya hay
 * que contar los fallos en vez de dar el viaje por bueno, y con doscientas la
 * pantalla se queda colgada sin decir por qué. Cuando haga falta más, lo que
 * cambia es dónde se escriben, no este número.
 */
export const MAX_DESTINATARIOS = 60;

/**
 * Tope del mensaje que acompaña a un envío.
 *
 * Corto a propósito, y por dos motivos. Uno de tamaño: se COPIA en cada fila
 * —sesenta personas, sesenta copias—. Y otro de producto: esto es la nota que va
 * grapada a lo que le mandas («esto es el de la analítica, mándamelo antes del
 * jueves»), no un canal de conversación. La conversación sigue siendo de
 * WhatsApp, igual que en el aviso.
 */
export const MAX_NOTA = 280;

/** El mensaje, saneado: sin espacios de sobra y sin pasarse de largo. */
export const sanitizeNota = (raw) => String(raw ?? '').trim().slice(0, MAX_NOTA);

// ── El qué ─────────────────────────────────────────────────────────────────

/**
 * Las clases de acción que caben en la tabla (`tipo`, migración 0105).
 *
 * No es el catálogo de la pantalla —ese es `QUE_MANDAR`, más abajo—: es lo que
 * la tabla sabe guardar, con el idioma de cada una. Están separados porque no
 * dicen lo mismo: la casilla privada del entrenador se puede mandar y NO vive
 * aquí (vive en su agenda), y `pide` vive aquí desde que existe la tabla aunque
 * la pantalla todavía no lo ofrezca.
 *
 * `hecho` es lo que se lee en la columna «Cómo va», y cada tipo lo dice con su
 * palabra: un formulario se contesta, un vídeo se abre, lo demás se hace. Decir
 * «3 de 5 entregados» de un vídeo obligaría a traducir mentalmente cada vez.
 */
export const TIPOS = [
  { id: 'form', familia: 'pedir', verbo: 'Le pediste', hecho: 'contestados', uno: 'Contestado' },
  { id: 'documento', familia: 'dar', verbo: 'Le diste', hecho: 'lo han abierto', uno: 'Lo abrió' },
  { id: 'video', familia: 'dar', verbo: 'Le diste', hecho: 'lo han abierto', uno: 'Lo abrió' },
  { id: 'pide', familia: 'pedir', verbo: 'Le pediste', hecho: 'hechos', uno: 'Hecho' },
];

export const tipoById = (id) => TIPOS.find((t) => t.id === id) || TIPOS[0];

/** Los que entregan algo que abrir, y por eso no pueden ir sin enlace. */
const ENTREGAN = ['documento', 'video'];

/**
 * Lo que se puede mandar desde la pantalla, en el orden en que se piensa:
 * lo que le pides, lo que le das, y lo tuyo.
 *
 * `carril` dice dónde acaba cada cosa, y son dos porque son dos clases de
 * trabajo:
 *
 *   · `accion` — fila en `client_actions` (0105): es SUYO. Con su fecha, su
 *     estado, su recado y su sitio en «UNA VEZ».
 *   · `agenda` — fila en `client_events` (0009) marcada como privada (0106): es
 *     TUYO. Tu trabajo pendiente ya tiene reloj —la agenda y la bandeja—, y una
 *     segunda lista de deberes tuyos sería un segundo sitio donde mirar la misma
 *     pregunta.
 *
 * `pide` es la que faltaba y la que el encargo pedía: pedirle algo que no es un
 * cuestionario. Antes se escribía como un paso del alta que nacía del lado del
 * ENTRENADOR, así que no se le pedía a nadie.
 */
export const QUE_MANDAR = [
  {
    id: 'form',
    label: 'Un formulario',
    hint: 'Le pides que conteste, y lo que conteste te vuelve.',
    carril: 'accion',
    tipo: 'form',
    tono: 'pregunta',
  },
  {
    id: 'pide',
    label: 'Algo que te mande él',
    hint: 'Un vídeo suyo, una analítica, una foto. Él lo marca cuando lo tenga.',
    carril: 'accion',
    tipo: 'pide',
    tono: 'pregunta',
  },
  {
    id: 'documento',
    label: 'Un documento',
    hint: 'Un PDF, una hoja, lo que tengas en un enlace.',
    carril: 'accion',
    tipo: 'documento',
    tono: 'entrega',
  },
  {
    id: 'video',
    label: 'Un vídeo',
    hint: 'Le aparece entre sus pendientes hasta que lo abre.',
    carril: 'accion',
    tipo: 'video',
    tono: 'entrega',
  },
  {
    /*
      El aviso: una frase tuya, sin nada que hacer con ella.

      Vivía en su propia hoja lateral de la cartera, con su propio campo de texto
      y su propio botón, y era la TERCERA forma distinta de darle algo a alguien
      —con `MandarAlgo` y con el «mandarle algo» de la ficha—. Tres gestos para
      una sola pregunta: qué le hago llegar a esta gente.

      Lo que no se unifica es dónde cae, y por eso tiene carril propio: un aviso
      no es un pendiente. No se contesta, no se abre y no se marca; se lee y se
      descarta, como cualquier otra novedad del portal. Meterlo en la tabla de lo
      mandado le habría puesto al cliente deberes que no existen.
    */
    id: 'aviso',
    label: 'Un aviso',
    hint: 'Una frase tuya. La lee y ya está: no tiene que hacer nada.',
    carril: 'aviso',
    tipo: null,
    tono: 'aviso',
  },
  {
    id: 'tarea',
    label: 'Una casilla tuya',
    hint: 'Para acordarte tú. Va a tu agenda y él no la ve.',
    carril: 'agenda',
    tipo: null,
    tono: 'tarea',
  },
];

/**
 * ¿Se puede dejar para más adelante?
 *
 * Solo lo que tiene dónde guardar una fecha. El aviso no: es una novedad que
 * pisa a la anterior en las preferencias del cliente (`updates.note`), sin sitio
 * para un «cuándo» — y prometer que se manda el martes sin nada que lo dispare
 * sería la misma mentira que esta pantalla acaba de quitarse de encima.
 */
export const sePuedeProgramar = (queId) => queById(queId).carril !== 'aviso';

export const queById = (id) => QUE_MANDAR.find((q) => q.id === id) || QUE_MANDAR[0];

/** Los que llevan enlace, para que la pantalla sepa qué campos pedir. */
export const pideEnlace = (queId) => ENTREGAN.includes(queById(queId).tipo);

// ── El a quién ─────────────────────────────────────────────────────────────

/**
 * Las audiencias.
 *
 * `marcados` es la primera porque es la que trae el gesto: se llega aquí desde
 * la cartera con gente marcada, y la barra de lote ya existía —solo sabía
 * avisar, etiquetar y pausar—.
 */
export const AUDIENCIAS = [
  { id: 'marcados', label: 'A los que marqué', pide: null },
  { id: 'etiqueta', label: 'Con una etiqueta', pide: 'etiqueta' },
  { id: 'protocolo', label: 'De un protocolo', pide: 'protocolo' },
  { id: 'todos', label: 'A todos los activos', pide: null },
];

export const audienciaById = (id) => AUDIENCIAS.find((a) => a.id === id) || AUDIENCIAS[0];

/**
 * ¿A quién le toca?
 *
 * ── Los pausados y los archivados no entran, nunca ────────────────────────
 * Un cliente en pausa está de vacaciones o medio de vuelta, y el archivo ya no
 * es cliente. Mandarles deberes es el peor error que puede cometer esta
 * pantalla, porque el que lo recibe no está para eso y el que lo manda no se
 * entera. `marcados` es la única excepción, y a propósito: ahí la elección es
 * una por una y explícita, y el entrenador sabe a quién está marcando.
 */
export const destinatarios = ({ tipo, valor = null, marcados = [] }, clients = []) => {
  const vivos = clients.filter((c) => !isArchived(c) && !isPaused(c));

  if (tipo === 'marcados') {
    const set = new Set(marcados);
    return clients.filter((c) => set.has(c.id)).slice(0, MAX_DESTINATARIOS);
  }
  if (tipo === 'etiqueta') {
    if (!valor) return [];
    return vivos.filter((c) => (c.tags || []).includes(valor)).slice(0, MAX_DESTINATARIOS);
  }
  if (tipo === 'protocolo') {
    if (!valor) return [];
    return vivos
      .filter((c) => (clientProtocoloId(c.preferences) || null) === valor)
      .slice(0, MAX_DESTINATARIOS);
  }
  return vivos.slice(0, MAX_DESTINATARIOS);
};

/** Cómo se dice la audiencia de un envío ya mandado, en su fila. */
export const audienciaLegible = ({ tipo, valor = null }, { protocolos = [] } = {}) => {
  if (tipo === 'etiqueta') return `con la etiqueta ${valor}`;
  if (tipo === 'protocolo') {
    const p = protocolos.find((x) => x.id === valor);
    return p ? `de ${p.name}` : 'de un protocolo';
  }
  if (tipo === 'marcados') return 'elegidos a mano';
  return 'todos los activos';
};

// ── El cuándo ──────────────────────────────────────────────────────────────

/**
 * Los tres cuándos de un envío.
 *
 * `dia` y `semanas` NO los dispara nadie: la fila nace con su fecha y el portal
 * del cliente la enseña cuando llega, igual que `updates.js` calcula las
 * novedades comparando fechas al leer. Sin servidor no hay otra forma honesta, y
 * fingir un envío programado que nadie manda sería peor que no tenerlo.
 */
export const CUANDOS = [
  { id: 'ahora', label: 'Ahora', dice: 'Lo verá la próxima vez que entre.' },
  { id: 'dia', label: 'El día…', pide: 'fecha', dice: 'Le aparecerá ese día, no antes.' },
  {
    id: 'semanas',
    label: 'A las N semanas de empezar',
    pide: 'semanas',
    dice: 'A cada uno le llega cuando le toque, contando desde su alta.',
  },
];

export const cuandoById = (id) => CUANDOS.find((c) => c.id === id) || CUANDOS[0];

// ── Construir el envío ─────────────────────────────────────────────────────

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * Desde cuándo cuenta el alta de una persona.
 *
 * ── Y por qué acepta los dos nombres ──────────────────────────────────────
 * Porque hay dos formas de un cliente en este proyecto y las dos son legítimas:
 * la FILA de la base (`start_date`) y el objeto que reparte el contexto, que
 * pasa por `mappers.js` y sale en `startDate`. Este módulo lo llaman los dos
 * lados —«Mandar algo» con clientes del contexto, las pruebas con filas— y leer
 * solo uno no da ningún error: da `null`, y `null` aquí significa «no tiene
 * alta», o sea que «a las 6 semanas de empezar» se convierte en «ahora» y se lo
 * manda a todo el mundo hoy. Sin ruido. Se cazó el 11 de septiembre, con la
 * aplicación delante.
 */
export const altaDe = (cliente) => cliente?.startDate || cliente?.start_date || null;

/** La fecha en la que le toca a cada uno, según el cuándo elegido. */
export const fechaPara = (cuando, cliente, hoy = new Date()) => {
  if (cuando.tipo === 'dia') return cuando.valor || null;
  if (cuando.tipo === 'semanas') {
    const alta = altaDe(cliente);
    const desde = alta ? new Date(alta) : null;
    if (!desde || Number.isNaN(desde.getTime())) return null;
    const n = Number(cuando.valor) || 0;
    const d = new Date(desde);
    d.setDate(d.getDate() + n * 7);
    return iso(d);
  }
  return iso(hoy);
};

/** El título con el que se guarda, saneado. Es lo que él ve y lo que tú lees. */
const sanitizeTitulo = (raw) => String(raw ?? '').trim().slice(0, 80);

/**
 * Las filas que hay que escribir.
 *
 * ── Vale para los cuatro tipos, y esa es la novedad ────────────────────────
 * Antes solo sabía construir formularios porque solo el formulario tenía dónde
 * caer. Con la 0105 los cuatro comparten fecha, estado y agrupación, así que lo
 * único que cambia entre uno y otro es qué columnas lleva puestas: el formulario
 * su esquema, la entrega su enlace, y todos el recado.
 *
 * **El esquema se congela aquí**, y es la decisión más importante del módulo:
 * cambiar el formulario mañana no puede cambiar lo que alguien contestó ayer ni
 * lo que tiene a medias. El versionado sale gratis por no referenciar.
 *
 * ── Lo que se rechaza, y por qué en silencio ──────────────────────────────
 * Sin destinatarios, sin título, o una entrega sin enlace, devuelve cero filas.
 * No lanza: quien llama ya tiene su botón apagado hasta que la cosa está
 * completa, y una excepción aquí solo convertiría un botón mal habilitado en una
 * pantalla en blanco. La base lo vuelve a comprobar con su `CHECK`, que es donde
 * de verdad no se puede colar.
 */
export const filasDeEnvio = (
  {
    tipo = 'form',
    formulario = null,
    titulo = '',
    enlace = '',
    audiencia,
    cuando,
    clientes,
    coachId,
    nota = '',
    origen = null,
  },
  hoy = new Date()
) => {
  if (!TIPOS.some((t) => t.id === tipo)) return [];
  if (!clientes || clientes.length === 0) return [];

  const esForm = tipo === 'form';
  if (esForm && !formulario) return [];

  const link = String(enlace ?? '').trim();
  if (ENTREGAN.includes(tipo) && !link) return [];

  const nombre = esForm ? sanitizeTitulo(formulario.name) : sanitizeTitulo(titulo);
  if (!nombre) return [];

  /*
    ══ Un uuid PELADO, y no `newId('env')` ════════════════════════════════════

    `client_actions.envio_id` es `uuid NOT NULL` desde la 0099, y `newId` devuelve
    `env_3f2a…`: Postgres lo rechaza con `22P02 invalid input syntax for type
    uuid`, así que **ninguna fila de un envío ha llegado a escribirse nunca**. El
    prefijo es un lujo de los ids que viven dentro de un JSONB, donde solo sirve
    para leer registros; en una columna `uuid` es un error de tipo.

    Se cazó el 11 de septiembre, construyendo las automatizaciones: se apoyan en
    esta misma función, y lo que no escribe un envío tampoco lo escribe un paso.
    Lo tapaba que el fallo llega como `error` del insert y se enseña con el texto
    de Postgres, que nadie relaciona con esto.
  */
  const envioId = newUuid();
  const recado = sanitizeNota(nota);
  const deQuien = { tipo: audiencia.tipo, valor: audiencia.valor ?? null };

  return clientes.slice(0, MAX_DESTINATARIOS).map((c) => ({
    envio_id: envioId,
    client_id: c.id,
    coach_id: coachId,
    tipo,
    form_id: esForm ? formulario.id : null,
    title: nombre,
    /*
      El recado es COLUMNA y ya no `schema.nota`.

      Iba dentro del esquema congelado porque el esquema era lo único que había,
      y ahí sobraba de las dos maneras: se lee abriendo un JSON, y en un vídeo no
      hay esquema donde meterlo. Vacío se escribe `null` y no cadena vacía, que
      es lo que deja que la base distinga «sin recado» de «recado en blanco».
    */
    body: recado || null,
    link: ENTREGAN.includes(tipo) ? link : null,
    schema: {
      /*
        COPIA, no referencia.

        Con `formulario.elementos` a secas, «congelado» era mentira: las filas
        apuntaban al mismo array que el constructor sigue editando, y añadir un
        elemento después de mandar cambiaba lo ya mandado —dentro de la misma
        sesión, antes de escribir en la base—. Lo cazó su prueba.
      */
      ...(esForm ? { elementos: (formulario.elementos || []).map((el) => ({ ...el })) } : null),
      /* La audiencia se queda en el esquema también para lo que no es
         formulario: es lo que permite leer «a los 5 con la etiqueta presencial»
         meses después sin recalcular nada, y eso vale igual para un vídeo. */
      audiencia: deQuien,
      /*
        QUIÉN LO MANDÓ: tú, o una automatización con su nombre.

        Va aquí y no en una columna nueva por lo mismo que el resto del esquema:
        es una COPIA congelada. Renombrar la automatización mañana no puede
        reescribir lo que salió ayer, igual que renombrar un formulario no
        reescribe su `title`. Y sin `origen` no se escribe la clave: una fila sin
        procedencia es una fila tuya, que es como han sido todas hasta hoy.
      */
      ...(origen ? { origen } : null),
    },
    due: fechaPara(cuando, c, hoy),
  }));
};

// ── Leer lo que ha vuelto ──────────────────────────────────────────────────

/**
 * ¿Está hecha?
 *
 * Una sola columna (`submitted_at`) y un solo concepto para los cuatro tipos,
 * porque contestar un formulario, abrir un vídeo y marcar lo que te pidieron son
 * el mismo hecho: esta acción ya no está pendiente. Dos columnas para el mismo
 * hecho es la clase de cosa que acaba discrepando.
 *
 * Se llamaba `entregada`, que era verdad cuando lo único que cabía era un
 * cuestionario y una mentira en cuanto entró un vídeo: un vídeo no se entrega.
 */
export const hecha = (fila) => Boolean(fila?.submitted_at);

/**
 * ¿Está contestada y sin leer?
 *
 * ══ Por qué hace falta una marca, y no basta `submitted_at` ════════════════
 *
 * Porque «lo han contestado» es cierto para siempre y «te falta leerlo» deja de
 * serlo en cuanto lo abres. Con la fecha de entrega a secas, la cola de la
 * bandeja saldría con todo lo contestado desde el principio y no habría forma de
 * vaciarla — y una cola que no se puede vaciar deja de mirarse, y se lleva por
 * delante a las que tiene al lado. La marca es `seen_at` (migración 0108).
 *
 * ── Y solo el formulario ──────────────────────────────────────────────────
 * De los cuatro tipos es el único que DEVUELVE algo que leer. Un vídeo que se
 * abre y un encargo que se marca son noticias —y buenas—, pero no hay nada que
 * abrir: pedir un «visto» sobre ellos sería ceremonia, un clic para quitar de en
 * medio una fila sin contenido. Lo que esos dos hacen al marcarse es dejar de
 * contar en `pendientesPorCliente`, que es la vuelta que les corresponde.
 */
export const sinLeer = (fila) => (fila?.tipo || 'form') === 'form' && hecha(fila) && !fila?.seen_at;

/** Las que están esperando lectura. Quien llama solo necesita sus ids. */
export const porLeer = (filas = []) => (filas || []).filter(sinLeer);

/**
 * Cuántas respuestas sin leer tiene cada uno, para la CARTERA.
 *
 * Viaja contada y no en filas por lo mismo que `pendientesPorCliente`: la regla
 * de qué cuenta vive aquí una sola vez, y `domain/portfolio.js` no puede
 * importar de este módulo sin cerrar un ciclo.
 *
 * Sin fecha, al contrario que las pendientes: una respuesta es una respuesta el
 * día que llega, y `due` solo decide cuándo se le enseña a él.
 */
export const contestadasPorCliente = (filas = []) => {
  const out = {};
  for (const f of porLeer(filas)) {
    out[f.client_id] = (out[f.client_id] || 0) + 1;
  }
  return out;
};

/**
 * El recado que acompañaba a la acción.
 *
 * Mira la columna primero y el esquema después: lo mandado antes de la 0105 lo
 * lleva dentro del esquema congelado, y ese esquema no se reescribe —es la foto
 * de lo que esa persona vio—. Así las viejas y las nuevas se leen igual y sin
 * que ninguna pantalla tenga que saber cuál es cuál.
 */
export const notaDe = (fila) => String(fila?.body || fila?.schema?.nota || '').trim();

/**
 * ¿Quién lo mandó: tú, o algo que le pasa solo?
 *
 * `null` es «tú», y no por descuido: todas las filas anteriores a las
 * automatizaciones las mandó una persona, así que la ausencia de procedencia ya
 * significa exactamente eso. Poner `origen: {tipo:'mano'}` en cada envío habría
 * sido escribir en cada fila lo que ya se sabe.
 */
export const origenDe = (fila) => fila?.schema?.origen || null;

/**
 * Quién lo manda, en una palabra: «Tú», o el nombre de la automatización.
 *
 * Sin el «Se lo mandó» delante, aunque el vocabulario del §7 lo escriba así en
 * prosa. Donde esto se lee es una COLUMNA que ya se titula «Quién lo manda», y
 * repetir el verbo en cada renglón son seis filas que empiezan con las mismas
 * cuatro palabras y una sola que cambia. El rótulo pregunta; la celda contesta.
 */
export const origenDice = (fila) => origenDe(fila)?.nombre || 'Tú';

/**
 * ¿Le toca ya?
 *
 * Una fila programada existe desde que se manda, pero al cliente no se le enseña
 * hasta su día. Se decide al leer, en los dos lados, con la misma función.
 */
export const vigente = (fila, hoy = iso(new Date())) => !fila?.due || fila.due <= hoy;

/**
 * Cuántas cosas están escritas y todavía no le tocan a nadie.
 *
 * Es la cifra del tramo «Lo que sale» y la única de esa puerta que caduca. Vive
 * aquí y no en la pantalla porque ahora se lee desde los dos tramos, y dos
 * copias de un corte acabarían discrepando: el día que discreparan, una diría
 * que quedan cuatro cosas por salir mientras el cliente ya las tiene delante.
 *
 * El corte lo hace `vigente`, la misma función con la que el portal decide qué
 * enseñar. Una sola respuesta a «¿esto ya está fuera?».
 */
export const cuantasPorSalir = (filas = []) =>
  filas.filter((f) => f.due && !vigente(f) && !f.submitted_at).length;

/**
 * Las filas agrupadas en envíos, que es como se leen en la pantalla.
 *
 * Un envío no es una fila de la base: es lo que se mandó de una vez. Se agrupa
 * por `envio_id` en vez de guardarse aparte porque una tabla de cabeceras sería
 * la segunda copia de algo que las propias filas ya dicen, y se
 * desincronizaría en cuanto alguien borrara una.
 */
export const agrupar = (filas = []) => {
  const mapa = new Map();

  for (const f of filas) {
    const id = f.envio_id || f.id;
    if (!mapa.has(id)) {
      mapa.set(id, {
        id,
        title: f.title,
        /* Sin `tipo` es un formulario: es lo único que cabía antes de la 0105, y
           la columna nació con ese mismo valor por defecto. */
        tipo: f.tipo || 'form',
        link: f.link || null,
        nota: notaDe(f),
        formId: f.form_id,
        sentAt: f.sent_at,
        due: f.due,
        audiencia: f.schema?.audiencia || { tipo: 'marcados', valor: null },
        elementos: f.schema?.elementos || [],
        filas: [],
      });
    }
    const envio = mapa.get(id);
    envio.filas.push(f);
    /* La fecha del envío es la de la primera fila escrita: todas se escriben en
       el mismo gesto, pero llegan con milisegundos distintos. */
    if (f.sent_at && (!envio.sentAt || f.sent_at < envio.sentAt)) envio.sentAt = f.sent_at;
  }

  return [...mapa.values()]
    .map((e) => ({
      ...e,
      mandados: e.filas.length,
      entregados: e.filas.filter(hecha).length,
      /* Cuántas respuestas suyas te faltan por leer (0108). Va en el envío
         porque es lo que decide si su fila del Taller trae algo nuevo: sin
         esto, la única diferencia entre «tres contestados» de ayer y de hoy es
         acordarse. */
      nuevas: porLeer(e.filas).length,
      preguntas: cuentaElementos(e.elementos),
    }))
    .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));
};

/**
 * «3 de 5 contestados», y la parte que va llena de la barra.
 *
 * La frase lleva el verbo del tipo porque la columna se lee de un vistazo y sin
 * él hay que acordarse de qué era cada fila: «9 de 12» no dice si nueve
 * contestaron o nueve lo abrieron, y son dos cosas distintas de saber.
 */
export const avanceDe = (envio) => {
  const cuantos = `${envio.entregados} de ${envio.mandados}`;
  return {
    dice: `${cuantos} ${tipoById(envio.tipo).hecho}`,
    /* Sin el verbo, para donde no cabe: la chapa de la ficha y el pie del envío
       abierto, que ya dicen de qué son. */
    cuenta: cuantos,
    parte: envio.mandados > 0 ? envio.entregados / envio.mandados : 0,
    cerrado: envio.mandados > 0 && envio.entregados === envio.mandados,
  };
};

/** Los que todavía la tienen pendiente, para el botón de dejar de pedirlo. */
export const pendientesDe = (envio) => envio.filas.filter((f) => !hecha(f));

/** Lo que un cliente tiene pendiente, para su portal y su ficha. */
export const pendientesDeCliente = (filas = [], hoy = iso(new Date())) =>
  filas.filter((f) => !hecha(f) && vigente(f, hoy));

/**
 * Cuántas cosas tiene pendientes cada uno, para la CARTERA.
 *
 * ══ Por qué una cifra por persona y no las filas ═══════════════════════════
 *
 * Porque es lo que la cartera necesita saber —«a Marta le falta algo tuyo»— y
 * porque `domain/portfolio.js` no puede importar de aquí: este módulo ya importa
 * de él (`isArchived`, `isPaused`), y hacerlo en los dos sentidos cierra un ciclo
 * de dependencias.
 *
 * Así que la regla de qué cuenta como pendiente se queda donde vive —aquí, una
 * sola vez, la misma que usan el portal y la ficha— y a la cartera le llega ya
 * contada. Es exactamente lo que ya hace `equipmentCounts`, por el mismo motivo.
 */
export const pendientesPorCliente = (filas = [], hoy = iso(new Date())) => {
  const out = {};
  for (const f of pendientesDeCliente(filas, hoy)) {
    out[f.client_id] = (out[f.client_id] || 0) + 1;
  }
  return out;
};
