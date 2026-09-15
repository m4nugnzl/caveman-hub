import { Camera, Check, MessageSquare, Ruler, Scale, Send } from 'lucide-react';

import { PERIMETER_LABELS, foldsSum, reverseChronological } from '@/domain/anthropometry';
import { ANGLES } from '@/domain/photos';
import { asksBlock } from '@/domain/protocol';
import { localeNumber, shortDate } from '@/lib/dates';

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
}) => (
  <div className="pasos-entrega col gap-3">
    {/* El rótulo va fuera de la superficie, como en cualquier grupo del portal. */}
    {/* «Tu entrega» y no «lo que has entregado»: mandada la semana, estos
        renglones siguen contando las dos caras —el peso que está y las fotos que
        no—, así que un rótulo que solo nombre lo hecho describe mal su propia
        lista. Lo que hay debajo es el estado de su entrega, entera. */}
    <span className="grupo-filas-rotulo">
      {yaEntregada ? 'Tu entrega' : 'Lo que te falta para entregar'}
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
          {!hecho && verbo && (
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
 * @param protocol  El protocolo ya resuelto (`clientProtocol`).
 * @param resumen   `weeklyCheckIn(...)` de esta semana.
 * @param history   Su antropometría, para la última toma de medidas.
 * @param fotos     Los ángulos que ya tiene esta semana (un `Set`).
 * @param preguntas Las del cuestionario (`checkinQuestions`).
 * @param sinPeso   Con el peso oculto, el paso del peso no existe. Ver `Oculto`.
 */
export const pasosDeLaEntrega = ({
  protocol,
  resumen,
  history = [],
  fotos = new Set(),
  preguntas = [],
  sinPeso = false,
}) => {
  /* Los mismos guardianes que usa `ReviewWizard` para decidir sus pasos. Leer
     `protocol.checkin.perimeters` a mano aquí sería una segunda lectura del
     mismo ajuste, y el día que cambie el formato solo se enteraría una. */
  const pidePerimetros = asksBlock(protocol, 'perimeters');
  const pideFolds = asksBlock(protocol, 'folds');
  const pideFotos = protocol?.askPhotos !== false;

  /* La última toma con algo medido. `reverseChronological` ya ordena, así que el
     primero que tenga medidas es el bueno: recorrer el historial entero para
     quedarse con el último sería la misma cuenta al revés. */
  const ultimaMedida = reverseChronological(history).find(
    (h) => foldsSum(h.folds) > 0 || Object.values(h.perimeters || {}).some((v) => Number(v) > 0)
  );

  const faltan = ANGLES.filter((a) => !fotos.has(a.id));

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
      estado: ultimaMedida
        ? `${resumenDeMedidas(ultimaMedida)} · tomadas el ${shortDate(ultimaMedida.date)}`
        : 'Sin tomar todavía',
    },
    pideFotos && {
      id: 'fotos',
      icono: Camera,
      titulo: 'Tus fotos',
      hecho: faltan.length === 0,
      verbo: faltan.length === ANGLES.length ? 'Hacerlas' : 'Subirla',
      estado:
        faltan.length === 0
          ? `Las ${ANGLES.length}, hechas`
          : `Llevas ${ANGLES.length - faltan.length} de ${ANGLES.length} · te falta${
              faltan.length === 1 ? '' : 'n'
            } ${faltan.map((a) => `la de ${a.label.toLowerCase()}`).join(' y ')}`,
    },
    preguntas.length > 0 && {
      id: 'cuestionario',
      icono: MessageSquare,
      titulo: 'Cómo lo has llevado',
      /* Sin forma de saber si ya las contestó esta semana sin releer el check-in
         entero, se da por pendiente: es el único paso que no cuesta nada rehacer
         y el que su entrenador más echa en falta. */
      hecho: false,
      verbo: 'Responder',
      estado: `${preguntas.length} ${preguntas.length === 1 ? 'pregunta' : 'preguntas'} de tu entrenador`,
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

  const suma = foldsSum(log.folds);
  if (suma > 0) trozos.push(`pliegues ${localeNumber(suma, { maximumFractionDigits: 0 })} mm`);

  return trozos.join(' · ') || 'tomadas';
};
