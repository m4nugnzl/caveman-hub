/**
 * La plantilla de protocolo del entrenador.
 *
 * ══ Dónde vive, y por qué ha cambiado ══════════════════════════════════════
 *
 * En `profiles.preferences.protocolTemplate` (migración 0035), que es la columna
 * donde ya vivían sus preferencias de panel.
 *
 * Antes vivía en `localStorage`, con un compromiso explícito: **no seguía al
 * entrenador si cambiaba de ordenador o borraba los datos del navegador**. Eso se
 * asumió cuando no había dónde guardarla en el servidor. Ya lo hay —la 0035 la
 * añadió para otra cosa— así que el compromiso deja de tener contrapartida:
 * mantenerlo solo significaba perder la forma de trabajar de alguien por abrir la
 * aplicación en el portátil.
 *
 * ── Lo guardado en el navegador no se tira ──────────────────────────────────
 * `readLocalTemplate` sigue existiendo para una sola cosa: rescatar la plantilla
 * de quien ya tenía una. La pantalla la sube al servidor la primera vez que entra
 * y limpia la copia local. A partir de ahí este archivo solo sabe leer la del
 * servidor.
 *
 * Se guardaba por identificador de usuario para que dos entrenadores que usaran
 * el mismo ordenador no se pisaran la suya; el rescate respeta esa misma clave.
 */

import {
  CHECKIN_BLOCKS,
  checkinMode,
  clientProtocol,
  defaultProtocol,
} from '@/domain/protocol';
import { clientIntake } from '@/domain/intake';
import { coachIntakeForm } from '@/domain/intakeForm';
import { intakeTemplateFrom, intakeTemplateToPreferences } from '@/lib/intakeTemplate';

const key = (userId) => `caveman-protocol:${userId || 'anon'}`;

/**
 * La plantilla del entrenador, sacada de sus preferencias.
 *
 * `null` —y no el protocolo por defecto— cuando no tiene ninguna guardada: es la
 * diferencia entre «no ha configurado nada» y «configuró justo lo de serie», y de
 * ella depende que el rescate del navegador se dispare o no.
 */
export const templateFrom = (coachPrefs) => {
  const raw = coachPrefs?.protocolTemplate;
  if (!raw || typeof raw !== 'object') return null;
  // Mismo saneado que lo de cada cliente: viene de una columna jsonb abierta.
  return clientProtocol({ protocol: raw });
};

/** La que quedara en el navegador, para subirla una vez. `null` si no hay. */
export const readLocalTemplate = (userId) => {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    return clientProtocol({ protocol: JSON.parse(raw) });
  } catch {
    // Modo privado, almacenamiento bloqueado o JSON corrupto: no hay nada que
    // rescatar, y no es un error que deba enseñarse a nadie.
    return null;
  }
};

export const clearLocalTemplate = (userId) => {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* Si no se puede limpiar, la copia vieja se queda ahí sin hacer daño: el
       rescate solo se dispara cuando el servidor no tiene plantilla, y a partir
       de ahora la tiene. */
  }
};

export { defaultProtocol };

/**
 * ¿El protocolo de este cliente coincide con la plantilla?
 *
 * ══ Se comparan TODAS las partes, y hay que acordarse al añadir una ═════════
 *
 * De esta función cuelga el botón «Aplicar a todos»: si dice que todo coincide,
 * el botón se apaga. Así que una parte que se deje fuera no produce una
 * comparación un poco peor — produce **una pantalla que afirma que tus clientes
 * ya tienen algo que no tienen**, y sin forma de dárselo.
 *
 * Ya ha pasado dos veces. La primera con los bloques del check-in: cambiar «pide
 * perímetros» dejaba el botón apagado. La segunda con el cuestionario del
 * check-in, que se añadió al protocolo y no aquí: elegir las preguntas de la
 * semana no llegaba a ningún cliente, y el paso no aparecía nunca en su revisión.
 *
 * Por eso ahora se recorre la lista de claves en vez de encadenar comparaciones
 * a mano: `protocol.test.js` comprueba que esta lista cubre el protocolo entero,
 * así que añadir una clave sin tocar esto rompe una prueba en vez de una pantalla.
 */

/** Las listas ordenadas del protocolo. El orden cuenta: es el de la pantalla. */
const LISTAS = ['modules', 'questions', 'checkinQuestions'];

export const matchesTemplate = (template, protocol) =>
  LISTAS.every((k) => (template[k] || []).join() === (protocol[k] || []).join()) &&
  JSON.stringify(template.custom) === JSON.stringify(protocol.custom) &&
  CHECKIN_BLOCKS.every((b) => checkinMode(template, b.id) === checkinMode(protocol, b.id));

/** Lo que compara `matchesTemplate`. Lo usa la prueba que vigila que no falte nada. */
export const COMPARED_KEYS = [...LISTAS, 'custom', 'checkin'];

/**
 * Lo que está en el protocolo y NO se compara con la plantilla, con su motivo.
 *
 * ══ `services`: qué le llevas a esta persona ════════════════════════════════
 *
 * Estuvo dentro, con este argumento: «es la parte que MÁS cambia lo que ve el
 * cliente, y dejarla fuera apagaría Aplicar a todos justo cuando lo que acabas
 * de cambiar es que tus clientes nuevos son solo de entrenamiento».
 *
 * El argumento era correcto sobre los clientes NUEVOS y equivocado sobre los que
 * ya tienes, y la diferencia costó trabajo de verdad: a un cliente al que le
 * llevas solo el entrenamiento, «poner al día» le devolvía la nutrición. Su
 * portal recuperaba una sección entera que nadie le está llevando, y el
 * entrenador se enteraba al abrirle la ficha.
 *
 * Porque esto no es una preferencia de protocolo —como preguntar por el dolor de
 * hombro—: **es lo que le has vendido a esta persona**. Se decide una vez, por
 * cliente, y no hay ninguna plantilla que pueda saberlo mejor.
 *
 * Cambiar la plantilla sigue afectando a los clientes NUEVOS, que es donde ese
 * argumento sí valía: `newClientPreferences` la copia entera, servicios
 * incluidos. Lo que ya no pasa es que empuje hacia atrás.
 *
 * Es el mismo trato que ya recibían los pasos del alta: la plantilla decide QUÉ
 * pasos hay y cada cliente conserva por cuáles va y qué tiene enlazado.
 */
export const NOT_COMPARED_KEYS = {
  services:
    'Qué le llevas a ESTA persona: es lo que le has vendido, no una preferencia de tu protocolo. ' +
    'La plantilla lo siembra al darle de alta y no vuelve a tocarlo — antes «poner al día» le ' +
    'devolvía la nutrición a quien solo entrena.',
};

/**
 * La plantilla, adaptada a un cliente concreto antes de escribírsela.
 *
 * Es lo que se le aplica al «poner al día»: todo lo de la plantilla, MENOS lo
 * que es suyo y no de ella. Hoy solo los servicios; lo que se añada a
 * `NOT_COMPARED_KEYS` tiene que pasar por aquí también, porque las dos listas
 * contestan la misma pregunta desde los dos lados —qué no se compara y qué no se
 * pisa— y si discrepan, un cliente se queda marcado como distinto justo después
 * de haberlo igualado.
 */
export const templateForClient = (template, clientPreferences) => ({
  ...template,
  services: clientProtocol(clientPreferences).services,
});

/**
 * ¿Este cliente se desvía de la plantilla?
 *
 * Es `matchesTemplate` más los pasos del alta: cambiar solo los pasos dejaba
 * «Aplicar a todos» apagado y no había forma de empujarlos. Vive aquí —y no
 * inline en la pantalla— porque lo usan dos sitios que no pueden discrepar: el
 * recuento del botón y la marca «propia» de cada cliente en el selector.
 */
export const clientDrifts = (template, intakeTemplate, client) => {
  if (!matchesTemplate(template, clientProtocol(client.preferences))) return true;
  const suyo = clientIntake(client.preferences);
  return (
    suyo.steps.join() !== intakeTemplate.steps.join() ||
    JSON.stringify(suyo.custom) !== JSON.stringify(intakeTemplate.custom)
  );
};

/**
 * ¿Este cliente es una excepción PUESTA A PROPÓSITO?
 *
 * ══ Por qué hace falta preguntarlo, si ya se sabe quién es distinto ═════════
 *
 * Porque «distinto» tapaba dos cosas que no se parecen en nada:
 *
 *   · El que se quedó ATRÁS. Le aplicaste la plantilla, luego la cambiaste, y él
 *     sigue con la de antes. Quiere lo nuevo; nadie ha decidido lo contrario.
 *   · La EXCEPCIÓN. Le montaste algo distinto tú, sabiendo lo que hacías: no le
 *     preguntas el dolor porque lo lleva fatal, o le encendiste las
 *     equivalencias porque viaja.
 *
 * `clientDrifts` dice que los dos son distintos, y era verdad; el problema es que
 * de ahí colgaba «Aplicar a todos», que empujaba la plantilla a los dos por
 * igual. Cada vez que tocabas una pregunta, el trabajo hecho a mano se iba —y sin
 * aviso, porque desde fuera la operación decía «aplicado a 12 clientes», que es lo
 * que habías pedido.
 *
 * ── La marca no se pone en un mando, se pone al editar ──────────────────────
 * La escribe `saveClientException` (context/useClients): cualquier guardado de
 * protocolo o de alta sobre un cliente concreto la deja puesta. Un interruptor
 * de «proteger a este cliente» habría sido un paso más que dar DESPUÉS de haber
 * dicho ya, con los hechos, que este cliente va por libre.
 *
 * Se suelta desde `applyProtocolToClient`, que es lo que hacen «poner al día» e
 * «igualar a mi plantilla».
 *
 * ══ Y el que NUNCA pasó por aquí ═══════════════════════════════════════════
 *
 * La marca tiene tres estados, no dos, y el tercero es el que costó trabajo de
 * verdad:
 *
 *   · `true`  — excepción declarada. Se respeta.
 *   · `false` — le pusiste la plantilla y la aceptó. Se le vuelve a poner.
 *   · AUSENTE — nadie ha decidido nada. Son todos los clientes anteriores a que
 *     esta marca existiera.
 *
 * El tercero se trataba como `false`, con este argumento: «nadie se queda de
 * golpe fuera del alcance de su plantilla por un valor que nunca escribió». El
 * argumento era razonable y la consecuencia no: a un cliente al que le habías
 * quitado preguntas hace seis meses, el primer «poner al día» se las devolvía
 * todas. Sin aviso, y sin forma de recuperar lo que había.
 *
 * Ahora un cliente sin marca está protegido **si además se desvía**. Los dos a
 * la vez, no uno: sin desvío no hay nada que proteger, así que quien coincide
 * con la plantilla sigue recibiéndola normalmente y nadie se queda fuera por no
 * haber hecho nada.
 *
 * Cuesta un clic —«Igualar a mi plantilla» sobre ese cliente— y ese clic escribe
 * la marca a `false`, así que solo hay que darlo una vez. Lo que se gana es que
 * la operación irreversible deja de ser la que ocurre por defecto.
 */
export const isException = (client) => client?.preferences?.protocolException?.on === true;

/**
 * Nadie ha decidido nada sobre este cliente: la marca no está ni a sí ni a no.
 *
 * Son los anteriores a que existiera. Por sí solo no significa nada —la mayoría
 * coincide con la plantilla y no hay nada que proteger—; lo que cuenta es esto
 * MÁS que se desvíe, y eso lo junta `isProtected`.
 */
export const isUndecided = (client) => {
  const marca = client?.preferences?.protocolException;
  return !marca || typeof marca.on !== 'boolean';
};

/**
 * A quién le falta la plantilla y ADEMÁS quiere recibirla.
 *
 * Es lo que enciende «Poner al día» y lo que decide a quién se le escribe. Las
 * excepciones caen aquí y no en el botón, para que el recuento del texto y la
 * lista a la que se escribe no puedan discrepar.
 */
export const needsTemplate = (template, intakeTemplate, client) =>
  !isProtected(template, intakeTemplate, client) && clientDrifts(template, intakeTemplate, client);

/**
 * A quién SALTA «poner al día», y por los dos motivos que existen.
 *
 * Se calcula aparte de `needsTemplate` porque la pantalla tiene que poder
 * NOMBRARLOS: un botón que se salta clientes sin decir cuáles es un botón del
 * que no te fías. Las dos funciones tienen que dar respuestas complementarias
 * sobre quien se desvía, y por eso la condición se escribe una sola vez.
 */
export const isProtected = (template, intakeTemplate, client) =>
  isException(client) ||
  (isUndecided(client) && clientDrifts(template, intakeTemplate, client));

/**
 * Con qué preferencias nace un cliente recién dado de alta: tu forma de trabajar.
 *
 * ══ Por qué el alta siembra en vez de esperar a «Poner al día» ══════════════
 *
 * `create_client` (0032) inserta con una lista cerrada de columnas y
 * `preferences` no está en ella —a propósito: es lo que impide que el navegador
 * cuele un `team_id`—, así que el cliente nacía con la columna vacía. Y vacía
 * significa el protocolo POR DEFECTO, no el tuyo.
 *
 * El resultado era que dar de alta a alguien lo metía en el acto en la lista de
 * atrasados: la pantalla de Protocolo decía «Marta se ha quedado atrás» treinta
 * segundos después de crearla, y había que acordarse de pulsar un botón para
 * arreglar algo que nunca debió estar roto. Con el botón apuntando ya solo a
 * quien de verdad se quedó atrás (ver `isException`), ese ruido se notaba el
 * doble.
 *
 * ── `null` cuando no hay nada que sembrar ───────────────────────────────────
 * Sin plantilla guardada, la del entrenador ES la de serie —que es justo lo que
 * la columna vacía ya produce—, así que una escritura más por cada alta no
 * compraría nada.
 *
 * ── Y del alta, solo la definición ──────────────────────────────────────────
 * Qué pasos hay, no lo hecho ni los enlaces: son de cada cliente, y uno recién
 * creado no tiene ninguno. Mismo criterio que `intakeTemplateToPreferences`.
 *
 * Nace SIN marca de excepción, que es lo correcto: acaba de recibir la plantilla
 * y tiene que seguir recibiendo lo que venga después.
 */
export const newClientPreferences = (coachPrefs) => {
  const protocolo = templateFrom(coachPrefs);
  const alta = intakeTemplateFrom(coachPrefs);
  /*
    El cuestionario del alta, SOLO si el entrenador lo ha tocado.

    Se copia porque el cliente no puede leer el perfil de su entrenador
    (`profiles` solo deja ver la fila propia, 0002), así que su portal no tendría
    de dónde sacar las preguntas. Pero copiar el de serie a quien no ha
    configurado nada sería escribir en su ficha para no decir nada nuevo:
    `clientIntakeForm` ya cae en el formulario por defecto cuando no encuentra
    copia, y el resultado es idéntico sin ocupar la columna.
  */
  const formulario = coachPrefs?.intakeForm ? coachIntakeForm(coachPrefs) : null;
  if (!protocolo && !alta && !formulario) return null;

  return {
    ...(protocolo ? { protocol: protocolo } : {}),
    ...(alta ? { intake: intakeTemplateToPreferences(alta) } : {}),
    ...(formulario ? { intakeForm: formulario } : {}),
  };
};
