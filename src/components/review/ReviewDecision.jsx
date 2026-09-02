import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ChevronUp,
  Link2,
  Pencil,
  RotateCcw,
  Trash2,
  Video,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { planSnapshot, snapshotChanges, structureChanges } from '@/domain/reviews';
import { dayMonthMaybeYear } from '@/lib/dates';
import { clientPath } from '@/routes';
import { BotonAccion, Notice } from '@/components/ui/primitives';
import { PlanChanges } from './PlanChanges';
import { ReviewTake } from './ReviewTake';
import { SIN_CAMBIOS, useCloseReview } from './useCloseReview';

const mmss = (total) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

/**
 * Las tres formas de contestar, como iconos acoplados al canto del campo.
 *
 * En iconos y no en un carril de tres palabras porque el carril compartía
 * renglón con el campo y los dos son elásticos: al aparecer el campo del enlace,
 * el carril se recortaba y «Enlace» quedaba medio tapado — justo el botón que
 * acababas de pulsar. Un icono mide lo que mide y no hay nada que repartir.
 *
 * Escribir va primero porque es lo que se hace casi siempre; las otras dos son
 * alternativas, no iguales.
 */
const MODOS = [
  { id: 'texto', label: 'Escribir', icon: Pencil },
  { id: 'grabar', label: 'Grabar un vídeo', icon: Video },
  { id: 'enlace', label: 'Pegar un enlace', icon: Link2 },
];

/**
 * EL CIERRE: la barra acoplada abajo con la que se termina una revisión.
 *
 * ══ Por qué es una barra y no una columna al lado ═══════════════════════════
 *
 * Estaba en una columna pegajosa de 368 px a la derecha del documento, y hacía
 * dos daños a la vez:
 *
 *   · **Le robaba el ancho a lo que hay que mirar.** Un cuarto de la pantalla
 *     para un formulario, y las fotos y las cifras apretadas en lo que quedaba.
 *   · **Partía el ojo en dos.** Se leía a la izquierda, se decidía a la derecha,
 *     y se volvía a la izquierda a comprobar. Una revisión se lee de arriba
 *     abajo; lo que se hace con ella va al final, no al lado.
 *
 * Acoplada abajo, la revisión ocupa la pantalla entera y el cierre está siempre
 * a un gesto de distancia sin tapar nada. Es donde toda la informática lleva
 * cuarenta años poniendo la acción de una página.
 *
 * ══ Las TRES formas de contestar, y ninguna obligatoria ════════════════════
 *
 *   · **Escribir** — dos frases, que es lo que se hace casi siempre.
 *   · **Grabar** — compartes esta pantalla y le recorres la semana señalando lo
 *     que le cambias, con tu cara en una esquina. Se sube al cerrar, no al
 *     parar: subir el archivo y luego no cerrar dejaría un vídeo huérfano
 *     ocupando cuota para siempre. Ver `ReviewTake` y
 *     `useCloseReview.closeWithRecording`.
 *   · **Enlace** — lo ya grabado en YouTube oculto o en Loom. Una revisión de
 *     veinte minutos son cientos de megas que se siguen pagando todos los meses;
 *     ahí fuera cuesta cero y el cliente la ve incrustada igual.
 *
 * Y **el botón cierra la semana con lo que haya, incluido nada.** Las tres son
 * caminos, no peajes: la caja vacía es una respuesta legítima —«sin cambios,
 * seguimos igual»— y la barra lo dice antes de que pulses.
 *
 * ── Un solo botón, nunca apagado ────────────────────────────────────────────
 * Había tres, turnándose según el estado —«Nada, seguimos igual» solo si el diff
 * estaba vacío; «Contestar y pasar a…» apagado mientras no escribieras; «Enviar
 * sin explicación» solo si había cambios Y la caja estaba vacía— así que el
 * principal cambiaba de sitio, de nombre y de existencia mientras trabajabas.
 * Eran tres RESULTADOS disfrazados de tres controles. Ahora el control es uno y
 * lo que cambia es el ACUSE de debajo, que dice qué se va a guardar.
 *
 * ── Por qué cada modo guarda lo suyo ───────────────────────────────────────
 * El texto, el enlace y la grabación viven en tres estados distintos: cambiar de
 * idea sobre CÓMO contestar no puede borrar lo que ya habías escrito.
 */

/**
 * @param client       El cliente que se revisa.
 * @param pendiente    Su entrega esperando respuesta, o null.
 * @param base         La foto del plan de su última revisión cerrada. Es contra
 *                     lo que se mide el cambio; sin ella no hay diff posible.
 * @param cargandoBase Mientras el historial no ha llegado no se afirma nada: con
 *                     `base` a null esto diría «no hay con qué comparar» un
 *                     instante antes de contradecirse.
 * @param siguiente    El próximo cliente de la pasada, o null. Es lo que
 *                     convierte esto en una tarea con final.
 * @param cerrada      La entrega de ESTA semana, si ya está contestada. Cuando
 *                     la hay, la barra no pregunta nada: dice cuándo se cerró y
 *                     qué le llegó, y ofrece reabrir. Una revisión cerrada está
 *                     cerrada; seguir enseñando «Cerrar la semana» encima hacía
 *                     que la pantalla pareciera trabajo pendiente para siempre.
 * @param aviso        Lo que hay que saber ANTES de pulsar, cuando la semana que
 *                     se cierra no es la que la pasada está pidiendo. Manda sobre
 *                     el acuse: es la diferencia entre «no ha pasado nada» y una
 *                     decisión tomada a sabiendas.
 * @param onClosed     Para releer el historial: la revisión recién cerrada pasa a
 *                     ser la nueva base y el diff tiene que volver a cero.
 */
export const ReviewDecision = ({
  client,
  pendiente,
  weekStart,
  hayQueRevisar = false,
  base,
  cerrada = null,
  cargandoBase = false,
  siguiente = null,
  restantes = null,
  aviso = null,
  onClosed = () => {},
}) => {
  const { nutrition, workoutData, unreviewCheckIn } = useApp();
  const { close, closeWithVideo, closeWithRecording } = useCloseReview();
  const navigate = useNavigate();

  const [grabando, setGrabando] = useState(false); // el diálogo del grabador
  /* Si el detalle del diff está desplegado. Cerrado por defecto: en una barra
     acoplada al canto de abajo, seis renglones de cambios crecen hacia arriba y
     tapan justo lo que hay que estar mirando para decidir. */
  const [verCambios, setVerCambios] = useState(false);
  const [grabacion, setGrabacion] = useState(null); // { blob, mimeType, seconds }
  const [modo, setModo] = useState('texto'); // 'texto' | 'grabar' | 'enlace'
  /* Uno por modo, y no una caja compartida: cambiar de idea sobre CÓMO
     contestar no puede borrar lo que ya habías escrito. */
  const [texto, setTexto] = useState('');
  const [enlace, setEnlace] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const nombre = client.name.split(' ')[0];

  /*
    El plan tal y como está AHORA MISMO. Se recalcula a cada guardado de los
    controles de la tarjeta de nutrición, que es lo que hace que el recuento de
    cambios suba SOLO mientras ajustas, sin que esta barra sepa nada de quién lo
    tocó: los dos leen el mismo plan del contexto.
  */
  const plan = nutrition[client.id];
  const ahora = useMemo(
    () => planSnapshot({ nutrition: plan, program: workoutData[client.id] }),
    [plan, workoutData, client.id]
  );

  const cambios = useMemo(() => snapshotChanges(base, ahora), [base, ahora]);
  const estructura = useMemo(() => structureChanges(base, ahora), [base, ahora]);
  const hayCambios = cambios.length > 0 || estructura.length > 0;
  /* Cuántas cosas le has movido. Es lo único del diff que se ve SIEMPRE: el
     detalle se despliega, pero cerrar una semana creyendo que no le has tocado
     nada cuando le has bajado los hidratos no puede pasar. */
  const cuantos = cambios.length + estructura.length;

  /* Lo que de verdad se va a mandar. Elegir «Enlace» y no pegar nada, o «Grabar»
     y no grabar, NO son errores: son no haber contestado, que es un final
     legítimo. Sin esto, cerrar con el enlace vacío reventaría con un «esa
     dirección no vale» delante de alguien que no quería mandar ningún vídeo. */
  const conEnlace = modo === 'enlace' && enlace.trim() !== '';
  const conGrabacion = modo === 'grabar' && Boolean(grabacion);

  const cambiarModo = (v) => {
    setModo(v);
    setError(null);
  };

  /**
   * Cerrar su semana. Los tres caminos pasan por `useCloseReview`, que es el
   * único sitio del producto que cierra una revisión.
   *
   * Al terminar, o se salta al siguiente de la pasada o se recarga aquí. Saltar
   * es lo que hace que revisar a cuatro personas sea UNA tarea y no cuatro.
   */
  const cerrar = async () => {
    if (!hayQueRevisar || enviando) return;

    /*
      `checkInId` puede venir VACÍO, y es el caso que hay que sostener: la cola da
      por lista una semana con pesajes y foto aunque el cliente no llegara a darle
      a «entregar», y entonces no hay fila en `check_ins`. `useCloseReview` la crea
      y la marca revisada en el mismo gesto — si has mirado su semana, esa semana
      existe, la haya entregado él o no.
    */
    const comun = {
      clientId: client.id,
      name: client.name,
      checkInId: pendiente?.id || null,
      weekStart: pendiente?.weekStart || weekStart,
      /* El acuse cuenta la bandeja vaciarse; quién queda lo sabe la pantalla. */
      restantes,
    };

    setEnviando(true);
    setError(null);

    /*
      ══ Y aquí es donde contestar deja de ser obligatorio ══════════════════

      Sin nada escrito no se bloquea: se guarda lo que de verdad ha pasado. Sin
      cambios y sin respuesta, la semana se cierra como «seguimos igual» —que es
      información: dentro de tres meses permite contestar «llevas nueve semanas
      sin tocarle nada»—. Con cambios y sin respuesta, la nota va a `null` y el
      histórico dice «sin comentario», que es la verdad: escribir «seguimos
      igual» encima de una bajada de hidratos sería inventarse un historial.
    */
    const res = conEnlace
      ? await closeWithVideo({ ...comun, url: enlace.trim() })
      : conGrabacion
        ? await closeWithRecording({
            ...comun,
            blob: grabacion.blob,
            mimeType: grabacion.mimeType,
          })
        : await close({ ...comun, notes: texto.trim() || (hayCambios ? null : SIN_CAMBIOS) });

    setEnviando(false);
    if (res?.ok === false) {
      setError(res.error);
      return;
    }

    setTexto('');
    setEnlace('');
    setGrabacion(null);
    setModo('texto');
    setVerCambios(false);
    onClosed();

    if (siguiente) navigate(clientPath(siguiente.client.id, 'semana'));
  };

  /*
    Sin NADA de esa semana —ni un pesaje, ni una foto, ni entrega— no hay decisión
    que tomar, y una barra que pregunta «¿qué le cambias?» delante de una semana
    vacía es la clase de caja hueca que enseña a saltarse la pantalla. La barra
    sigue estando —moverla de sitio según el caso sería peor— pero solo dice por
    qué no hay nada que hacer.

    Ojo con la línea anterior: NO basta con que falte la entrega. Muchas semanas
    el cliente se pesa y sube sus fotos y se le olvida darle a «entregar», y esa
    semana sí se revisa —la cola la da por lista— así que aquí también.
  */
  if (!hayQueRevisar) {
    return (
      <section className="cierre is-vacio" aria-label="Nada que cerrar">
        <p className="t-sm t-secondary">
          <span className="t-strong">Nada que cerrar.</span> Esta semana {nombre} no ha registrado
          nada: ni pesajes, ni fotos, ni entrega.
        </p>
        <p className="t-xs t-tertiary">
          Si es la semana en curso es lo normal. Si ya pasó, lo más probable es que todavía no tenga
          acceso a su portal — se le da desde su ficha.
        </p>
      </section>
    );
  }

  /*
    ══ Y SI YA ESTÁ CERRADA, la barra no pregunta: informa ════════════════════

    Seguía enseñando «¿qué le cambias?» y «Cerrar la semana» después de haber
    contestado, así que la pantalla parecía trabajo pendiente para siempre y
    volver a pulsar reescribía encima sin decirlo.

    Una revisión cerrada está cerrada. Lo que queda es VERLA —cuándo se cerró y
    qué le llegó— y poder reabrirla si te has equivocado, que es un gesto raro y
    por eso va en voz baja a la derecha. Corregir la nota o enlazar el vídeo se
    hace en el histórico, que es donde está esa revisión.
  */
  if (cerrada) {
    return (
      <section className="cierre is-cerrada" aria-label={`La semana de ${nombre} está cerrada`}>
        <Check size={16} className="cierre-visto" aria-hidden="true" />
        <div className="cierre-dicho">
          <p className="t-sm">
            <span className="t-strong">Semana cerrada</span>
            {cerrada.reviewedAt && ` el ${dayMonthMaybeYear(cerrada.reviewedAt)}`}.
          </p>
          {cerrada.coachNotes ? (
            <p className="cierre-nota">«{cerrada.coachNotes}»</p>
          ) : (
            <p className="t-xs t-tertiary">Le llegaron los cambios, sin comentario.</p>
          )}
        </div>

        <button
          type="button"
          className="btn btn-plain btn-sm"
          disabled={enviando}
          onClick={async () => {
            setEnviando(true);
            await unreviewCheckIn(cerrada.id);
            setEnviando(false);
            onClosed();
          }}
        >
          <RotateCcw size={14} /> Reabrir
        </button>
      </section>
    );
  }

  /*
    ══ EL ACUSE: qué se va a guardar cuando pulses ════════════════════════════

    Esta línea es la que permite que haya un solo botón, y por eso dice también
    lo que NO se va a mandar: elegir «Grabar» y no grabar cierra la semana sin
    respuesta, y hay que enterarse antes de pulsar, no después.
  */
  const acuse = conEnlace
    ? 'Se le manda el vídeo enlazado.'
    : conGrabacion
      ? `Se sube tu grabación de ${mmss(grabacion.seconds)} y se la manda.`
      : modo === 'grabar'
        ? 'Sin grabar todavía: se cerrará sin respuesta.'
        : modo === 'enlace'
          ? 'Sin enlace todavía: se cerrará sin respuesta.'
          : texto.trim()
            ? hayCambios
              ? 'Le llegan los cambios y tu mensaje.'
              : 'Le llega tu mensaje.'
            : hayCambios
              ? 'Le llegan los cambios, sin comentario.'
              : 'Se guardará como «seguimos igual».';

  return (
    <>
      {/*
        ══ LA BARRA DE CIERRE, acoplada abajo ═════════════════════════════════

        UNA FILA: qué le cambias · qué le dices · cerrar. En el orden en que se
        piensa, y a la derecha del todo un botón que nunca está apagado con una
        línea debajo diciendo exactamente qué se va a guardar.

        ── Por qué es una fila y antes eran dos mitades altas ────────────────
        Porque esto está ACOPLADO al canto de abajo: cada píxel que mide se lo
        quita a la revisión que hay que estar mirando para decidir. Medía ciento
        ochenta —dos rótulos en versalita, la línea de las cifras de hoy, seis
        fichas de diff, un carril de tres modos, una caja de dos renglones y el
        botón— o sea un cuarto de una pantalla de portátil tapado por el
        formulario, permanentemente.

        Lo que sobraba era casi todo:

          · **Las cifras de hoy** («Ahora: 2 300 kcal · 140 P · …») ya están en
            la tarjeta «Su plan esta semana», tres centímetros más arriba. Aquí
            se quedan dentro del detalle, que es donde hacen falta: al lado de lo
            que estás a punto de cambiarles.
          · **Las fichas del diff.** Seis píldoras con tachados en rojo y cifras
            en verde envolviendo a dos líneas es mucho ruido para un acuse de
            recibo. Ahora el recuento va en un botón —«3 cambios»— y la lista
            entera se despliega cuando se pide, con la misma forma de siempre
            (`PlanChanges`), que se lee mucho mejor que en píldoras.
          · **Los dos rótulos.** «Le cambias» y «Le dices · opcional» nombran lo
            que ya se ve: un botón de dieta y una caja de escribir.

        Lo que NO se pliega es la caja de escribir: contestar dos frases es lo
        que se hace casi siempre, y esconderla tras un clic pondría un peaje
        justo en el gesto más frecuente de la pantalla.
      */}
      <section className="cierre" aria-label={`Cerrar la semana de ${nombre}`}>
        {/*
          El detalle de lo que le cambias, cuando se pide. Va ARRIBA de la fila y
          no debajo: la barra crece hacia el contenido, así que abrir el detalle
          nunca mueve el botón de cerrar de donde estaba.
        */}
        {verCambios && (
          <div className="cierre-detalle">
            <PlanChanges
              changes={cambios}
              structure={estructura}
              empty={<p className="t-xs t-tertiary">Su plan sigue igual.</p>}
            />
          </div>
        )}

        <div className="cierre-fila">
          {/* ── 1 · LO QUE LE HAS CAMBIADO ───────────────────────────────
              Solo el acuse de recibo: el recuento siempre, el detalle a un
              toque. Los botones de ir a tocarle la dieta y el entreno estaban
              aquí y se han ido a las tarjetas que enseñan esa dieta y ese
              entreno — que es donde se busca la acción, al lado de lo que
              modifica. Repetirlos en la barra era pedir dos veces lo mismo y
              ensanchar la única zona que no tiene por qué crecer. */}
          <div className="cierre-cambios">
            {/* Mientras el historial no ha llegado no se dice nada: `base` es
                nula y afirmar «no le has tocado nada» sería mentir medio
                segundo. */}
            {!cargandoBase &&
              (!base ? (
                <span className="cierre-nada">Primera revisión con seguimiento</span>
              ) : cuantos === 0 ? (
                <span className="cierre-nada">Su plan sigue igual</span>
              ) : (
                <button
                  type="button"
                  className="cierre-resumen"
                  aria-expanded={verCambios}
                  onClick={() => setVerCambios((v) => !v)}
                >
                  <span className="n">{cuantos}</span>
                  {cuantos === 1 ? 'cambio en su plan' : 'cambios en su plan'}
                  <ChevronUp size={14} className="chevron" aria-hidden="true" />
                </button>
              ))}
          </div>

          {/* ── 2 · LE DICES: un COMPOSITOR ──────────────────────────────

              Las tres formas de contestar eran un carril segmentado
              —«Escribir · Grabar · Enlace»— delante del campo, y compartían
              renglón con él. Dos problemas:

                · **Se comían el campo, o el campo se los comía.** Los dos son
                  elásticos en la misma fila, así que al aparecer el campo del
                  enlace el carril se recortaba y «Enlace» quedaba medio tapado —
                  justo el botón que acabas de pulsar.
                · **Pesan lo mismo los tres, y no lo son.** Escribir dos frases
                  es lo que se hace casi siempre; grabar y pegar un enlace son
                  alternativas.

              Ahora es un compositor, la forma que tiene cualquier caja de
              mensaje: el campo ocupa todo el ancho y los tres modos son iconos
              acoplados a su canto derecho, de ancho fijo. El modo no compite con
              el campo porque no está en su fila: está DENTRO de su caja. */}
          <div className="cierre-dices">
            <div className="compositor">
              <div className="compositor-campo">
                {modo === 'texto' && (
                  /* Una sola fila que crece al escribir: dos filas fijas gastan
                     alto permanentemente para un texto que la mitad de las veces
                     no se escribe. Ver `.compositor-campo`. */
                  <textarea
                    className="cierre-campo"
                    rows={1}
                    value={texto}
                    aria-label={`Lo que le dices a ${nombre}`}
                    placeholder={
                      hayCambios
                        ? 'Explícale por qué le cambias esto.'
                        : 'Lo que le dirías de esta semana.'
                    }
                    onChange={(e) => setTexto(e.target.value)}
                  />
                )}

                {modo === 'enlace' && (
                  /* Para lo ya grabado fuera. Una revisión de veinte minutos
                     ocupa cientos de megas y hay que seguir pagándola todos los
                     meses; en YouTube oculto o en Loom cuesta cero y el cliente
                     la ve incrustada en su portal igual. */
                  <input
                    className="cierre-campo"
                    value={enlace}
                    aria-label="Enlace al vídeo de la revisión"
                    placeholder="Pega el enlace de YouTube o de Loom"
                    onChange={(e) => {
                      setEnlace(e.target.value);
                      setError(null);
                    }}
                  />
                )}

                {modo === 'grabar' &&
                  (grabacion ? (
                    /* Lo grabado, esperando. No se ha subido: se sube al cerrar,
                       para que no queden vídeos huérfanos de revisiones que nunca
                       se cerraron. */
                    <div className="cierre-clip">
                      <span>
                        <Video size={14} className="icon-inline" /> Grabación lista ·{' '}
                        <span className="tnum">{mmss(grabacion.seconds)}</span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-plain btn-sm"
                        onClick={() => setGrabacion(null)}
                      >
                        <Trash2 size={14} /> Descartar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="cierre-grabar"
                      onClick={() => setGrabando(true)}
                    >
                      <Video size={15} /> Grabar la explicación
                    </button>
                  ))}
              </div>

              <div className="compositor-modos" role="group" aria-label="Cómo le contestas">
                {MODOS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="compositor-modo"
                    aria-pressed={modo === m.id}
                    aria-label={m.label}
                    title={m.label}
                    onClick={() => cambiarModo(m.id)}
                  >
                    <m.icon size={15} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/*
            ══ EL ACUSE: qué se va a guardar cuando pulses ═══════════════════

            Es lo que permite que haya un solo botón. Antes había tres —«Nada,
            seguimos igual», «Contestar y pasar a…» y «Enviar sin explicación»— y
            cada uno aparecía y desaparecía según el estado, así que el principal
            cambiaba de sitio, de nombre y de existencia mientras trabajabas.
            Tres RESULTADOS disfrazados de tres controles.

            Va en la MISMA fila y justo antes del botón, que es lo que se lee de
            camino a pulsarlo. Tuvo su propio renglón debajo del compositor, y eso
            costaba veintiún píxeles de barra acoplada para una frase de cuatro
            palabras: en dos líneas se hace más grande, no más claro.
          */}
          {/* El aviso manda sobre el acuse: cuando lo que se cierra no es lo que
              la pasada está pidiendo, saber eso importa más que saber si va con
              comentario o sin él. */}
          <p className={`cierre-acuse${aviso ? ' is-aviso' : ''}`} aria-live="polite">
            {aviso || acuse}
          </p>

          {/* ── 3 · CERRAR ───────────────────────────────────────────────
              Un botón, siempre el mismo, siempre en el mismo sitio y nunca
              apagado. Del alto exacto del compositor, porque son los dos extremos
              de la misma fila. Sin icono de visto: un visto es «esto ya está
              hecho» y aquí lo que se hace es PASAR — se cierra la semana y se va
              al siguiente cliente de la pasada. La flecha lo dice y además
              anticipa el salto. */}
          {/* El rótulo no cambia mientras trabaja: pasaba de «Cerrar y pasar a
              Marta →» a «Guardando…», o sea que el botón se encogía a la mitad
              justo al soltarlo y volvía a crecer al acabar. Ahora el giro y el
              tic van en el hueco de la flecha, que ya estaba ahí. Ver
              `BotonAccion`. */}
          <BotonAccion
            className="btn btn-primary cierre-cerrar"
            icon={ArrowRight}
            alFinal
            disabled={enviando}
            onClick={cerrar}
          >
            {siguiente
              ? `Cerrar y pasar a ${siguiente.client.name.split(' ')[0]}`
              : 'Cerrar la semana'}
          </BotonAccion>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
      </section>

      {/* Grabar es una tarea que se lleva la pantalla entera: estás a punto de
          hablarle a alguien. En una barra de 140 px no cabe, y fingir que sí
          sería una vista previa del tamaño de un sello. Ver `ReviewTake`. */}
      {grabando && (
        <ReviewTake
          nombre={nombre}
          onReady={setGrabacion}
          onClose={() => setGrabando(false)}
        />
      )}
    </>
  );
};
