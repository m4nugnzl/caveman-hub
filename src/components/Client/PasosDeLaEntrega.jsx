import { Camera, Check, MessageSquare, Ruler, Scale, Send } from 'lucide-react';

import { PERIMETER_LABELS, foldsSum, pliegesDe, ultimaMedidaDe } from '@/domain/anthropometry';
import { entregaDelPeriodo } from '@/domain/calendar';
import { ANGLES, angulosDelPeriodo } from '@/domain/photos';
import { asksBlock } from '@/domain/protocol';
import { localeNumber, shortDate } from '@/lib/dates';
import { enumeraEs } from '@/lib/texto';

/**
 * LO QUE TE FALTA PARA ENTREGAR: la semana en cuatro renglones, cada uno con su
 * propio verbo.
 *
 * ══ Qué sustituye, y por qué ═══════════════════════════════════════════════
 *
 * Una barra de cuatro tiras y una frase debajo diciendo lo que faltaba. Para
 * saber qué te falta había que LEER la frase y contar las tiras, y para arreglar
 * una sola cosa —te falta la foto de espalda— había que entrar al asistente y
 * pasar por el peso y las medidas que ya estaban bien.
 *
 * Cuatro renglones con su marca lo dicen sin leer. Y cada uno lleva su verbo, así
 * que el asistente se abre POR ese paso: arreglar una cosa cuesta un toque, no
 * cuatro pantallas. Ver `docs/portal-dos-aparatos.html`, «Apuntar el peso eran
 * tres puertas».
 *
 * ── Es la misma pieza en el teléfono y en el PC ────────────────────────────
 * A propósito: es la única pantalla del portal donde el dueño pidió lo mismo en
 * los dos aparatos —*«mis revisiones desde el ordenador debería ser más
 * sencillo»*— y lo que hacía falta allí era exactamente esto. Lo que cambia
 * entre los dos es el ancho, y eso lo lleva `.pasos-entrega` en CSS.
 *
 * ── El paso que no existe no se pinta ──────────────────────────────────────
 * Ni apagado ni con un «no aplica». La lista de pasos la decide el protocolo de
 * esta persona igual que en `ReviewWizard`, y quien no tenga medidas pedidas ve
 * tres renglones, no cuatro con uno tachado. Un paso que no se puede rellenar
 * solo sirve para hacer la tarea más larga.
 *
 * ── Y sigue puesta después de entregar ────────────────────────────────────
 * Con la semana mandada este bloque desaparecía entero, así que quien se daba
 * cuenta de que había subido la foto que no era no tenía por dónde arreglarlo.
 * Ahora se queda con el verbo cambiado hasta que su entrenador la revisa: mismos
 * renglones, «Volver a entregar» abajo. El rótulo cambia con él — «lo que te
 * falta» sobre algo ya mandado no describe nada.
 *
 * @param pasos      `[{ id, titulo, estado, hecho, verbo }]`, ya decididos por la
 *   pantalla: es ella quien tiene el protocolo, el historial y las fotos.
 * @param onPaso     Abrir el asistente por ese paso (`id`).
 * @param onEntregar Mandarla.
 * @param enviando   Mientras viaja.
 * @param yaEntregada  Si esta semana ya está mandada y esperando respuesta.
 * @param entregadaEl  Cuándo la mandó, para poder decirlo.
 */
export const PasosDeLaEntrega = ({
  pasos,
  onPaso,
  onEntregar,
  enviando = false,
  yaEntregada = false,
  entregadaEl = null,
  cerrada = false,
}) => (
  <div className="pasos-entrega col gap-3">
    {/* El rótulo va fuera de la superficie, como en cualquier grupo del portal. */}
    {/* «Tu entrega» y no «lo que has entregado»: mandada la semana, estos
        renglones siguen contando las dos caras —el peso que está y las fotos que
        no—, así que un rótulo que solo nombre lo hecho describe mal su propia
        lista. Lo que hay debajo es el estado de su entrega, entera. */}
    <span className="grupo-filas-rotulo">
      {yaEntregada || cerrada ? 'Tu entrega' : 'Lo que te falta para entregar'}
    </span>

    <div className="list">
      {pasos.map(({ id, icono: Icono, titulo, estado, hecho, verbo }) => (
        <div key={id} className={`list-row paso-entrega${hecho ? ' es-hecho' : ''}`}>
          {/*
            LA MARCA. Un disco con el tick cuando está, y el dibujo del paso
            cuando falta — no un círculo vacío. El dibujo dice DE QUÉ es el
            renglón, que es lo que hace que la lista se recorra sin leerla; el
            tick dice que ya no hay nada que hacer ahí.

            El verde es el único de la pantalla y está en su sitio: el semáforo
            juzga, y aquí hay algo que juzgar —hecho o no—. Ver `la ley del
            color`.
          */}
          <span className={`list-icon paso-marca${hecho ? ' es-hecho' : ''}`} aria-hidden="true">
            {hecho ? <Check size={15} /> : <Icono size={15} />}
          </span>

          <span className="list-row-label">
            <span className="title">{titulo}</span>
            {estado && <span className="sub">{estado}</span>}
          </span>

          {/* El verbo solo mientras falte. Hecho, un botón «Corregir» al lado de
              un tick invita a tocar lo que ya está bien. Se corrige desde el
              propio asistente al entregar, que es cuando se repasa. */}
          {!hecho && verbo && !cerrada && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPaso(id)}>
              {verbo}
            </button>
          )}
        </div>
      ))}
    </div>

    {/*
      EL VERBO DE LA PANTALLA. Se puede pulsar con pasos sin hacer, a propósito:
      un botón apagado hasta tener los tres pesajes deja fuera la semana que se ha
      ido de viaje, que es justo la que hay que contar. Quien mira al otro lado es
      una persona, no una validación.
    */}
    {/*
      Entregada, el verbo baja de tono: deja de ser primario y deja de ser
      grande. Es la ley del reposo — la decisión de la semana ya está tomada, y
      un botón azul a tamaño completo diciendo «Volver a entregar» convertiría
      una salida de emergencia en la acción principal de la pantalla.
    */}
    {/*
      REVISADA, SIN VERBO. Reentregar contra una fila ya contestada no vuelve a
      la cola de su entrenador: el botón mandaba algo que nadie iba a ver, y con
      un paso sin marcar parecía reclamar que faltaba algo. Lo que queda es
      decir que está cerrada.
    */}
    {cerrada ? (
      <span className="t-xs t-tertiary">Tu entrenador ya la ha revisado.</span>
    ) : (
    <div className="decide-verbo col gap-2">
      <button
        type="button"
        className={`btn ${yaEntregada ? 'btn-secondary' : 'btn-primary btn-lg'}`}
        onClick={onEntregar}
        disabled={enviando}
      >
        <Send size={15} /> {yaEntregada ? 'Volver a entregar' : 'Entregar mi semana'}
      </button>
      <span className="t-xs t-tertiary">
        {yaEntregada
          ? `${entregadaEl ? `La mandaste el ${shortDate(entregadaEl)}. ` : ''}Tu entrenador la está mirando; puedes corregirla hasta que la revise.`
          : /* «Cuando estén, se la mandas y te contesta» decía lo que el botón
               que tiene encima ya dice, y dejaba la línea en dos renglones. Lo
               único que esta frase aporta —y que no dice nadie más— es la
               ventana de gracia. Ver `ventana-de-gracia-de-la-entrega`. */
            'No hace falta que sea el domingo exacto.'}
      </span>
    </div>
    )}
  </div>
);

/**
 * Los cuatro pasos de ESTA persona, con su estado escrito.
 *
 * Vive aquí y no en la pantalla porque la revisión se entrega desde dos sitios
 * —el destino «Revisión» y, mientras haya una a medias, la portada— y el estado
 * de cada paso tiene que decir lo mismo en los dos. Escrito dos veces, el día que
 * cambie la cuenta de pesajes solo cambiaría en uno.
 *
 * ══ LA VENTANA LA PONE ESTA FUNCIÓN, no quien la llama ════════════════════
 *
 * Recibía ya masticado lo que había que contar —el `Set` de ángulos, las
 * respuestas del periodo— y cada llamador lo calculaba por su cuenta. Los dos lo
 * calculaban distinto y los dos lo calculaban mal: la portada contaba las fotos
 * del cliente SIN filtrar por semana, y la revisión las contaba contra la semana
 * de hoy en vez de contra la del periodo. Las medidas no las filtraba nadie.
 *
 * El resultado es el aviso que trae esto: un cliente leyendo «3 de 4
 * completadas» de una revisión en la que no había subido nada. Así que lo que
 * entra ahora es el material en crudo y la ventana, y el recorte se hace una
 * vez y en un sitio — que es lo que esta función vino a ser desde el principio.
 *
 * @param protocol  El protocolo ya resuelto (`clientProtocol`).
 * @param resumen   `weeklyCheckIn(...)` del periodo que se entrega.
 * @param history   Su antropometría, en crudo.
 * @param photos    Sus fotos de progreso, en crudo (ya filtradas por cliente).
 * @param startDate Su alta, para poder fechar una foto por semana de programa.
 * @param desde     El lunes del periodo que se entrega.
 * @param semanas   Cuántas semanas naturales abarca ese periodo.
 * @param preguntas Las del cuestionario (`checkinQuestions`).
 * @param entrega   La fila de `check_ins` que se tenga cargada, sin filtrar.
 * @param sinPeso   Con el peso oculto, el paso del peso no existe. Ver `Oculto`.
 */
export const pasosDeLaEntrega = ({
  protocol,
  resumen,
  history = [],
  photos = [],
  startDate = null,
  desde = null,
  semanas = 1,
  preguntas = [],
  entrega = null,
  sinPeso = false,
}) => {
  /* Los mismos guardianes que usa `ReviewWizard` para decidir sus pasos. Leer
     `protocol.checkin.perimeters` a mano aquí sería una segunda lectura del
     mismo ajuste, y el día que cambie el formato solo se enteraría una. */
  const pidePerimetros = asksBlock(protocol, 'perimeters');
  const pideFolds = asksBlock(protocol, 'folds');
  const pideFotos = protocol?.askPhotos !== false;

  /* La última toma con algo medido DE ESTE PERIODO. La misma ventana que la de
     los pesajes, y la misma que el guardián que deja entregar: si las dos
     cuentas no coinciden, la lista dice «hecho» y el botón manda a tomarlas. */
  const ultimaMedida = ultimaMedidaDe(history, { desde, semanas });

  const fotos = angulosDelPeriodo(photos, { startDate, desde, semanas });
  const faltan = ANGLES.filter((a) => !fotos.has(a.id));

  /* Y las respuestas, las de la fila de ESTE periodo. Las de la semana pasada no
     contestan la de ahora, y las de una posterior tampoco. */
  const deEste = entregaDelPeriodo(entrega, desde, semanas);
  const entregada = Boolean(deEste?.submittedAt);
  const contestadas = Object.values(deEste?.answers || {}).some((v) => String(v ?? '').trim() !== '');

  return [
    !sinPeso && {
      id: 'peso',
      icono: Scale,
      titulo: 'Tu peso',
      hecho: resumen.asked ? resumen.complete : resumen.count > 0,
      /*
        ── SIN VERBO desde el 13 de septiembre ────────────────────────────────
        Llevaba «Apuntar», y el verbo abría el asistente por el paso del peso:
        cuatro pantallas para escribir cuatro caracteres. Ahora la casilla está
        justo encima de esta lista, a la vista (`PesoDeHoy`), así que un botón
        aquí sería la segunda puerta a lo mismo — el error que este bloque vino
        a corregir la primera vez, cuando apuntar el peso estaba en tres sitios
        de la misma pantalla.

        El renglón se queda: sigue diciendo cuántos pesajes te pide, cuántos
        llevas y la media, que es lo que la casilla de arriba no cuenta.
      */
      verbo: null,
      estado: resumen.asked
        ? `Te pide ${resumen.target} ${resumen.target === 1 ? 'pesaje' : 'pesajes'} y llevas ${resumen.count}${
            resumen.average !== null
              ? ` · de media ${localeNumber(resumen.average, { maximumFractionDigits: 1 })} kg`
              : ''
          }`
        : resumen.count > 0
          ? `${resumen.count} ${resumen.count === 1 ? 'pesaje' : 'pesajes'} esta semana${
              resumen.average !== null
                ? ` · de media ${localeNumber(resumen.average, { maximumFractionDigits: 1 })} kg`
                : ''
            }`
          : 'Todavía no te has pesado esta semana',
    },
    (pidePerimetros || pideFolds) && {
      id: 'medidas',
      icono: Ruler,
      titulo: 'Tus medidas',
      hecho: Boolean(ultimaMedida),
      verbo: 'Tomarlas',
      /* «Sin tomar todavía» decía «nunca», y quien se midió hace tres semanas lo
         leía como que se había perdido lo suyo. Lo que falta es la toma de ESTA
         revisión, y así es como se dice. */
      estado: ultimaMedida
        ? `${resumenDeMedidas(ultimaMedida)} · tomadas el ${shortDate(ultimaMedida.date)}`
        : semanas > 1
          ? 'Sin tomar en este periodo'
          : 'Sin tomar esta semana',
    },
    pideFotos && {
      id: 'fotos',
      icono: Camera,
      titulo: 'Tus fotos',
      hecho: faltan.length === 0,
      verbo:
        faltan.length === ANGLES.length ? 'Hacerlas' : faltan.length === 1 ? 'Subirla' : 'Subirlas',
      /* Con cuatro ángulos la enumeración ya no cabía en un `join(' y ')`: «la de
         frontal y la de lateral izquierdo y la de espalda» son tres conjunciones
         seguidas. `enumeraEs` pone las comas y deja la «y» para la última. */
      estado:
        faltan.length === 0
          ? `Las ${ANGLES.length}, hechas`
          : `Llevas ${ANGLES.length - faltan.length} de ${ANGLES.length} · te falta${
              faltan.length === 1 ? '' : 'n'
            } ${enumeraEs(faltan.map((a) => `la de ${a.label.toLowerCase()}`))}`,
    },
    preguntas.length > 0 && {
      id: 'cuestionario',
      icono: MessageSquare,
      titulo: 'Cómo lo has llevado',
      /*
        HECHO SI LA ENTREGA DE ESTE PERIODO TRAE RESPUESTAS. Iba fijo a `false`
        («sin forma de saber si ya las contestó») y la forma estaba: las
        respuestas viajan con la propia entrega (`answers`, migración 0060). El
        precio era un cliente que lo había mandado todo leyendo «te falta cómo
        lo has llevado» y un «Volver a entregar» que parecía pedírselo — el
        aviso del 18 de septiembre.
      */
      hecho: contestadas,
      verbo: 'Responder',
      /* Desde la 0121 las respuestas pueden estar guardadas SIN entregar (el
         borrador del teléfono): el renglón dice cuál de las dos es. */
      estado: contestadas
        ? entregada
          ? 'Contestado en tu entrega'
          : 'Contestado · se manda al entregar'
        : `${preguntas.length} ${preguntas.length === 1 ? 'pregunta' : 'preguntas'} de tu entrenador`,
    },
  ].filter(Boolean);
};

/**
 * «Pecho 102 · Ombligo 79,5 · pliegues 48 mm»: lo MEDIDO, no lo que se pide.
 *
 * Tres perímetros y la suma de pliegues, y no los nueve: el renglón dice que las
 * medidas están y de cuándo son. Quien quiera las nueve abre la báscula, que es
 * la pantalla donde se toman. Ver `ClientCheckInsRoute`.
 */
const resumenDeMedidas = (log) => {
  const trozos = Object.entries(log.perimeters || {})
    .filter(([, v]) => Number(v) > 0)
    .slice(0, 3)
    .map(([k, v]) => `${PERIMETER_LABELS[k] || k} ${localeNumber(Number(v), { maximumFractionDigits: 1 })}`);

  /* Por `pliegesDe` y no por `log.folds`: lo guardado se llama `skinFolds`, y
     leyendo la clave del formulario esta línea se comía los pliegues enteros.
     Ver `pliegesDe`. */
  const suma = foldsSum(pliegesDe(log));
  if (suma > 0) trozos.push(`pliegues ${localeNumber(suma, { maximumFractionDigits: 0 })} mm`);

  return trozos.join(' · ') || 'tomadas';
};
