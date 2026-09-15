import { Suspense, lazy, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Send, SlidersHorizontal, X } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { TAG_LIMITS, pauseOf } from '@/domain/portfolio';
import { loQueLeHasMandado } from '@/domain/acciones';
import { tipoById } from '@/domain/envios';
import { columnasDe, respuestaLegible } from '@/domain/formulario';
import { clientIntake, intakeToPreferences, removeCustomStep } from '@/domain/intake';
import { coachProtocolos, protocoloDeCliente } from '@/domain/protocolos';
import { necesitaSuPlan, parchePara, protegidoDeSuPlan } from '@/lib/protocolTemplate';
import { ServicesSection } from '@/components/Coach/Settings/Protocol/ServicesSection';
import {
  CHECKIN_QUESTIONS,
  SESSION_QUESTIONS,
  activeQuestions,
  checkinQuestions,
  clientProtocol,
  isModuleOn,
} from '@/domain/protocol';
import { PROTOCOL_HOME } from '@/routes';
import { shortDate, todayISO } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { Notice, Panel } from '@/components/ui/primitives';
import { AlertsSection } from '@/components/Coach/Settings/Protocol/AlertsSection';
import { VisibilitySection } from '@/components/Coach/Settings/Protocol/VisibilitySection';
import { ModulesSection } from '@/components/Coach/Settings/Protocol/ModulesSection';
import { CheckinBlocksSection } from '@/components/Coach/Settings/Protocol/CheckinBlocksSection';
import { QuestionEditor } from '@/components/Coach/Settings/Protocol/QuestionEditor';

/**
 * El protocolo de UNA persona, sin salir de la cartera.
 *
 * ══ Por qué existe esta hoja, y qué NO es ═══════════════════════════════════
 *
 * No es un resumen de la ficha — hubo una versión que enseñaba pausa y
 * etiquetas, y el dueño la señaló: «los ajustes y darle clic al cliente hacen
 * prácticamente lo mismo». Tenía razón: lo que la cartera necesita a mano no
 * es lo que ya está a un clic, sino lo que estaba a TRES — el protocolo del
 * cliente vivía en Ajustes → Protocolo → elegirlo en un selector.
 *
 * La referencia es el panel «Client settings» de Coachway (sus «App settings»:
 * qué ve y qué se le pide a este cliente), montado con nuestras piezas: los
 * MISMOS bloques que usa Ajustes → Protocolo, con el mismo guardado de
 * excepción, así que no hay dos editores que puedan divergir. La pausa se
 * queda porque es la otra decisión que se toma mirando la cartera, y su fecha
 * necesita un sitio donde escribirse.
 *
 * ══ Y por qué ahora está PARTIDA EN DOS ════════════════════════════════════
 *
 * Era una columna de once secciones seguidas, todas con el mismo peso, y dentro
 * había dos naturalezas distintas que nadie separaba:
 *
 *   · **Cómo es su app** — un ESTADO. Qué le llevas, qué piezas ve, qué cifras
 *     no le vuelven. Se configura, es una copia suya, y no le cambia nada a
 *     nadie hasta que se lo pongas al día.
 *   · **Qué le pasa** — HECHOS en el tiempo. Qué se le pide cada semana, qué se
 *     le pregunta al entrenar, cuándo su silencio te parece raro, qué le has
 *     mandado suelto.
 *
 * Ese corte es el que arregla la queja de origen —«el protocolo es una
 * automatización pobre»—: la mitad de abajo es lo que se va a automatizar, y
 * hasta que exista el carril se lee aquí como lo que ya es. Las dos mitades
 * además se PROPAGAN distinto, y ésa es la razón de fondo por la que están
 * separadas y no es una incoherencia (ver `docs/protocolo-y-automatizaciones-v1.md`).
 *
 * `mandado` la abre sin «Lo que le has mandado» para quien ya lo tiene delante:
 * la ficha lo enseña en su cuerpo, y la misma lista dos veces en una pantalla
 * es la lista que nadie sabe cuál de las dos manda.
 */
export const ClientSettingsSheet = ({ client, open, onClose, mandado = true }) => {
  const { coachPrefs, saveClientException, applyProtocolToClient } = useApp();
  const navigate = useNavigate();
  const [cambiando, setCambiando] = useState(false);

  if (!client) return null;
  const protocol = clientProtocol(client.preferences);
  const guardar = (next) => saveClientException(client.id, { protocol: next });
  const nombre = client.name?.split(' ')[0] || client.name;
  const preguntas = activeQuestions(protocol);
  const preguntasCheckin = checkinQuestions(protocol);

  const protocolos = coachProtocolos(coachPrefs);
  const suyo = protocoloDeCliente(coachPrefs, client);
  const atrasado = necesitaSuPlan(coachPrefs, client);
  const excepcion = protegidoDeSuPlan(coachPrefs, client);

  /*
    Cambiarle el protocolo APLICA en el mismo gesto, no solo apunta.

    Apuntar sin escribir deja al cliente «sin decidir y desviado», que
    `isProtected` protege a propósito — o sea, se quedaría con lo de antes y
    «Poner al día» ni lo miraría. Un selector que no cambia nada es peor que no
    tener selector, así que aquí las dos cosas van juntas.
  */
  const cambiarProtocolo = async (id) => {
    setCambiando(true);
    const conNuevo = { ...client, preferences: { ...client.preferences, protocolId: id } };
    await applyProtocolToClient(client.id, parchePara(coachPrefs, conNuevo));
    setCambiando(false);
  };

  const ponerAlDia = async () => {
    setCambiando(true);
    await applyProtocolToClient(client.id, parchePara(coachPrefs, client));
    setCambiando(false);
  };

  /* Ventana CENTRADA y grande, no hoja lateral: la lateral se leía como «he
     abierto al cliente» —otra página más— y el dueño la señaló. Y ENTERO: la
     primera versión cortaba con un «el resto, en Ajustes», que es mandar de
     viaje justo a quien venía a ahorrárselo. Aquí están las mismas secciones
     que el editor de Ajustes (módulos, check-in, sesión, avisos), con el
     mismo guardado de excepción; en Ajustes quedan la plantilla, los presets
     y el alta, que no son de UNA persona. */
  return (
    <Modal open={open} title={`El protocolo de ${nombre}`} onClose={onClose} size="lg">
      <div className="col gap-5">
        {/* Y el camino de vuelta a la plantilla. Esto edita la EXCEPCIÓN de una
            persona, y la pregunta que sigue a «esto lo hago distinto con
            Nicolás» es casi siempre «¿y qué tengo puesto para todos?». Sin la
            puerta, la respuesta estaba a tres pasos por Ajustes. */}
        <div className="row between wrap gap-3">
          <span className="t-sm t-secondary">
            Su aplicación, afinada para {nombre}: lo que cambies aquí vale solo para {nombre} y no lo
            pisa la plantilla.
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              onClose();
              navigate(PROTOCOL_HOME);
            }}
          >
            <SlidersHorizontal size={15} /> Ver los protocolos
          </button>
        </div>

        {/*
          ══ CUÁL LLEVA PUESTO ═════════════════════════════════════════════
          Desde que los protocolos son varios y con nombre, la primera pregunta
          de esta hoja es cuál lleva esta persona. Y es donde se le cambia:
          antes eso no se podía hacer en ninguna pantalla.
        */}
        <section className="col gap-2">
          <span className="section-label">Su protocolo</span>
          <div className="row between wrap gap-3">
            <select
              className="select"
              style={{ maxWidth: 260 }}
              value={suyo?.id || ''}
              disabled={cambiando}
              aria-label={`Protocolo de ${nombre}`}
              onChange={(e) => cambiarProtocolo(e.target.value)}
            >
              {protocolos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {atrasado && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={cambiando}
                onClick={ponerAlDia}
              >
                <RotateCcw size={15} /> Ponerle al día
              </button>
            )}
          </div>
          <span className="t-xs t-tertiary">
            {excepcion
              ? `${nombre} es una excepción: lo que le has montado a mano no se lo pisa ningún protocolo.`
              : atrasado
                ? `Se ha quedado atrás: su protocolo cambió después de aplicárselo.`
                : `Lleva «${suyo?.name}» tal cual está.`}{' '}
            Cambiar de protocolo se lo aplica al momento.
          </span>
        </section>

        {/*
          ══ LAS DOS MITADES ═══════════════════════════════════════════════

          Aire y un filete entre ellas, como el cuerpo de la ficha: lo que
          separa aquí no es una caja, es que se está hablando de otra cosa.
        */}
        <div className="hoja-protocolo">
          <Panel
            desnudo
            rango="bloque"
            title="Cómo es su app"
            sub={`Un estado: lo que ${nombre} tiene delante al abrirla. Es una copia suya, y cambiarla no le toca nada a nadie más.`}
          >
            <div className="col gap-5">
              {/* Qué le llevas: entrenamiento, nutrición o las dos. Es lo que le
                  has VENDIDO, así que se decide aquí y ninguna plantilla lo pisa
                  (`NOT_COMPARED_KEYS`). Vivía solo en la pantalla de protocolos. */}
              <ServicesSection protocol={protocol} onSave={guardar} title="Qué le llevas" />

              {/* Qué piezas tiene encendidas: el mismo bloque que en Protocolos. */}
              <ModulesSection protocol={protocol} onSave={guardar} />

              {/* Y qué cifras no le vuelven a él en su portal (A4). Va aquí, con
                  el resto de lo que solo vale para esta persona, y no en la
                  plantilla. Estaba al final de todo, detrás de las preguntas y
                  los avisos, y es de esta mitad: es qué ve. */}
              <VisibilitySection client={client} protocol={protocol} onSave={guardar} />
            </div>
          </Panel>

          <Panel
            desnudo
            rango="bloque"
            title="Qué le pasa"
            sub="Hechos en el tiempo: lo que se le pide, lo que se le pregunta y cuándo te avisa su silencio. Es la mitad que se automatiza."
          >
            <div className="col gap-5">
              {/* Su check-in semanal: lo que se le mide y lo que se le pregunta. */}
              <CheckinBlocksSection protocol={protocol} onSave={guardar} />

              {/* Aquí hubo un «De dónde recortas al ajustar» y se retiró: la
                  ventana del reajuste ya lo pregunta con el menú delante, y
                  recuerda lo que elijas para esta persona. Ver `EditarObjetivo`. */}
              <QuestionEditor
                title="Qué le preguntas al cerrar la semana"
                intro="Es lo que la báscula no mide: si ha podido seguir el plan, si ha pasado hambre, si le siguen quedando ganas."
                notice={
                  preguntasCheckin.length === 0 ? (
                    <Notice tone="info">
                      Sin ninguna pregunta puesta no hay cuestionario: su revisión termina en las
                      fotos. Añade las que quieras y aparecerá el paso.
                    </Notice>
                  ) : null
                }
                protocol={protocol}
                list="checkinQuestions"
                catalogo={CHECKIN_QUESTIONS}
                questions={preguntasCheckin}
                onSave={guardar}
                emptyText="Todavía no le preguntas nada al cerrar la semana."
                addPlaceholder="Cómo has llevado las comidas fuera"
              />

              {/* Y su sesión: lo que se le pregunta al terminar de entrenar. */}
              <QuestionEditor
                title="Qué le preguntas al terminar de entrenar"
                notice={
                  !isModuleOn(protocol, 'sessionFeedback') && (
                    <Notice tone="info">
                      El módulo de feedback está apagado, así que estas preguntas no se le harán.
                      Enciéndelo en «Cómo es su app» para que aparezcan.
                    </Notice>
                  )
                }
                protocol={protocol}
                list="questions"
                catalogo={SESSION_QUESTIONS}
                questions={preguntas}
                onSave={guardar}
                emptyText="No hay ninguna pregunta activa."
                addPlaceholder="Molestia en el hombro"
              />

              {/* Su vara de aviso (A3): cuándo su silencio te parece raro. */}
              <AlertsSection client={client} protocol={protocol} onSave={guardar} />

              {/* Lo que se le manda a ÉL y a nadie más, fuera de su protocolo.
                  Es de esta mitad —es algo que le pasó, con su fecha— y no de la
                  otra, donde estaba metido entre dos listas de interruptores. */}
              {mandado && <LoQueLeHasMandado client={client} />}
            </div>
          </Panel>
        </div>

        <section className="col gap-2">
          <span className="section-label">Pausa</span>
          <PauseRow client={client} />
        </section>
      </div>
    </Modal>
  );
};

/**
 * DE DÓNDE VIENE ESTE INTERRUPTOR: el pie de las bocas a mano.
 *
 * ══ El defecto que arregla ═════════════════════════════════════════════════
 *
 * Hay interruptores del protocolo repartidos por las pantallas donde se echan en
 * falta —las equivalencias en la dieta, los módulos de entreno en los ajustes
 * del programa— y están bien puestos: nadie va a una pantalla de ajustes a
 * buscar una casilla que no sabe que existe.
 *
 * Lo que fallaba es que no decían nada de sí mismos. Tocarlos declara una
 * EXCEPCIÓN sobre esa persona —se guardan por `saveClientException`, así que el
 * siguiente «poner al día» deja de pasarles por encima— y eso no se leía en
 * ninguna parte; el pie decía «en Ajustes → Protocolo», que además ya no es
 * donde está. Un interruptor que declara una excepción sin decirlo se arregla
 * con una línea de texto, no quitándolo.
 *
 * Así que dice de qué protocolo sale, y abre la hoja donde se lee entero. El
 * `onAbrir` lo resuelve quien lo monta: desde un diálogo o un panel flotante, la
 * hoja no puede abrirse ENCIMA —hay que cerrar lo de delante primero—, y quién
 * está delante solo lo sabe la pantalla.
 */
export const PieDeProtocolo = ({ client, onAbrir }) => {
  const { coachPrefs } = useApp();
  if (!client) return null;

  const suyo = protocoloDeCliente(coachPrefs, client);

  return (
    <p className="t-2xs t-tertiary">
      Solo para {client.name?.split(' ')[0] || 'este cliente'}, de su protocolo «{suyo?.name}».{' '}
      <button type="button" className="cab-accion" onClick={onAbrir}>
        Verlo entero
      </button>
    </p>
  );
};

/*
  El asistente se carga PEREZOSO, igual que desde la cartera: los ajustes son
  parte del arranque del panel e importarlo a secas metería el dominio de
  formularios entero en el índice.
*/
const MandarAlgo = lazy(() =>
  import('@/components/Coach/MandarAlgo').then((m) => ({ default: m.MandarAlgo }))
);

/**
 * LO QUE LE HAS MANDADO: lo suelto, para una persona concreta.
 *
 * ══ Lo que había aquí, y por qué se ha ido ═════════════════════════════════
 *
 * Un campo de texto y un campo de enlace que escribían un paso propio en el
 * ALTA de ese cliente. Funcionaba, y traía tres cosas detrás que nadie
 * relacionaba con haberle mandado un vídeo:
 *
 *   · Se guardaba por `saveClientException`, así que mandarle algo lo marcaba
 *     como excepción de protocolo y el siguiente «poner al día» se lo saltaba
 *     para siempre. Esta pantalla llegaba a decirlo en voz baja, como si fuera
 *     una propiedad del gesto y no una consecuencia de dónde se guardaba.
 *   · Le reabría el alta: su portal lo pintaba en «lo que te falta para
 *     empezar», con su barra de progreso, meses después de haber empezado.
 *   · Y lo que se le PEDÍA no lo veía: un paso propio nace del lado del
 *     entrenador (`stepOwner`), y el portal solo pinta los del cliente. El
 *     ejemplo que sugería el propio campo era «mándame el vídeo de tu
 *     sentadilla».
 *
 * Ahora se manda con el mismo diálogo que desde la cartera —tres pasos, y con
 * esta persona ya elegida— y cae en `client_actions` (0105), que es lo que le
 * da fecha, estado y sitio. Su protocolo no se toca.
 *
 * ── Y aquí se lee lo de las dos épocas ────────────────────────────────────
 * `loQueLeHasMandado` junta lo nuevo con los pasos propios que ya tenía puestos
 * (ver su docblock): lo escrito no se migra, la costura la cose la lectura.
 */
export const LoQueLeHasMandado = ({ client, bloque = false }) => {
  const { envioRows, quitarPedido, saveClientException, marcarVisto } = useApp();
  const [mandando, setMandando] = useState(false);
  /* Cuál está abierta para leer sus respuestas. Un id y no la fila: la lista se
     rehace en cuanto la marca de leído vuelve de la base. */
  const [leyendo, setLeyendo] = useState(null);

  const intake = clientIntake(client.preferences);
  const filas = (envioRows || []).filter((f) => f.client_id === client.id);
  const lista = loQueLeHasMandado({ intake, filas });
  const nombre = client.name?.split(' ')[0] || client.name;

  const abierta = lista.find((i) => i.id === leyendo) || null;

  /* Abrir lo contestado ES leerlo: la marca se pone aquí y la cola «Leer lo que
     te han contestado» se vacía sola, igual que al abrir el envío entero en el
     Taller. No hay un botón aparte para darlo por visto. */
  const leer = (item) => {
    setLeyendo(item.id);
    if (item.sinLeer) marcarVisto([item.id]);
  };

  const quitar = (item) => {
    if (item.de === 'accion') return quitarPedido(item.id);
    /* Lo viejo sigue en sus preferencias, así que quitarlo sigue siendo una
       excepción declarada — como cualquier otro cambio sobre esa persona. */
    return saveClientException(client.id, {
      intake: intakeToPreferences(removeCustomStep(intake, item.id)),
    });
  };

  const cuerpo = (
    <>
      {lista.length > 0 && (
        <ul className="proto-list">
          {lista.map((item) => (
            <li className="proto-q" key={item.id}>
              <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
                <span className="t-sm" style={{ fontWeight: 600 }}>
                  {item.title}
                </span>
                <span className="ask-hint t-2xs t-tertiary">
                  {tipoById(item.tipo).verbo}
                  {item.cuando ? ` · ${shortDate(item.cuando.slice(0, 10))}` : ''}
                  {item.hecha ? ` · ${tipoById(item.tipo).uno.toLowerCase()}` : ' · pendiente'}
                  {item.contestadaEl ? ` el ${shortDate(item.contestadaEl.slice(0, 10))}` : ''}
                </span>
              </span>
              {/* Solo lo que trae algo que leer: un vídeo abierto y un encargo
                  marcado no devuelven nada (ver `sinLeer` en `domain/envios.js`). */}
              {item.tipo === 'form' && item.hecha && (
                <button
                  type="button"
                  className={`btn btn-sm ${item.sinLeer ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => leer(item)}
                >
                  {item.sinLeer ? 'Leer lo que contestó' : 'Ver respuestas'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-icon btn-icon-danger"
                aria-label={`Quitar ${item.title}`}
                onClick={() => quitar(item)}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="row gap-2 wrap">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMandando(true)}>
          <Send size={15} /> Mandarle algo
        </button>
        <span className="t-xs t-tertiary">
          Le aparece entre sus pendientes. No le toca el protocolo.
        </span>
      </div>

      {mandando && (
        <Suspense fallback={null}>
          {/* Con `preseleccion` el asistente se salta el «a quién» y enseña la
              respuesta que se ha dado por él: son dos pasos, no tres. */}
          <MandarAlgo
            preseleccion={[client.id]}
            onCerrar={() => setMandando(false)}
            key={`mandar-${nombre}`}
          />
        </Suspense>
      )}

      {/*
        ══ Lo que contestó, aquí y no en el Taller ═══════════════════════════

        La tabla del envío enseña a las cinco personas a la vez, una columna por
        pregunta: es la vista de «qué me han dicho todos». Cuando lo que se
        pregunta es «¿qué me ha dicho ÉL?» —que es lo que trae la bandeja— esa
        tabla obliga a ir al Taller, encontrar el envío y buscar su fila.

        Un enunciado y su respuesta, en el mismo `<dl>` que el repaso de «Mandar
        algo»: es la misma forma —rótulo y valor— y no hace falta cromo nuevo.
      */}
      <Modal
        open={Boolean(abierta)}
        title={abierta?.title || 'Lo que contestó'}
        onClose={() => setLeyendo(null)}
      >
        {abierta && <Respuestas item={abierta} />}
      </Modal>
    </>
  );

  /*
    Dos sitios lo enseñan y cada uno tiene su gramática: en la hoja de la cartera
    es una sección más entre rótulos pequeños, y en la ficha es un bloque de la
    hoja, con su titular. Es lo mismo que ya pasa con `PauseRow` y `TagsRow`:
    una sola implementación, dos marcos. Lo que NO se hace es colar un rótulo
    pequeño entre los titulares de la ficha.
  */
  if (bloque) {
    return (
      <Panel desnudo rango="bloque" title="Lo que le has mandado">
        <div className="col gap-3">{cuerpo}</div>
      </Panel>
    );
  }

  return (
    <section className="col gap-2">
      <span className="section-label">Lo que le has mandado</span>
      {cuerpo}
    </section>
  );
};

/**
 * Las respuestas de una persona a un formulario suelto.
 *
 * El esquema viaja congelado en la fila (ver `filasDeEnvio`), así que se lee con
 * las preguntas que se le hicieron el día que se mandó y no con las que el
 * formulario tenga hoy. Sin eso, renombrar una pregunta cambiaría lo que alguien
 * contestó el mes pasado.
 */
const Respuestas = ({ item }) => {
  const columnas = columnasDe(item.elementos);

  if (columnas.length === 0) {
    return <p className="t-sm t-secondary">Este envío no llevaba preguntas.</p>;
  }

  return (
    <div className="col gap-3">
      <p className="t-xs t-tertiary">
        Contestado el {shortDate(String(item.contestadaEl).slice(0, 10))}, con las preguntas que
        llevaba el día que se lo mandaste.
      </p>
      <dl className="repaso">
        {columnas.map((c) => {
          const elem = item.elementos.find((e) => e.id === c.id);
          return (
            <div className="repaso-fila" key={c.id}>
              <dt className="repaso-k">{c.rot}</dt>
              <dd className="repaso-v">{respuestaLegible(elem, (item.respuestas || {})[c.id])}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
};

/**
 * Apartar a un cliente una temporada, sin terminar con él.
 *
 * Es el estado del lesionado y del que se va un mes: sigue en la cartera y en
 * tu plan, pero mientras dura no genera ni una alerta — a quien le has dicho
 * que pare no se le reprocha parar (la regla vive en `domain/portfolio.js`).
 *
 * La fecha de vuelta es opcional y no despausa sola: al pasar, la pausa VENCE
 * —las alertas vuelven a contar y la cartera avisa— y reanudar sigue siendo un
 * gesto de aquí. Sin «¿seguro?», como archivar: se deshace en un clic.
 *
 * Vivió en la ficha («Acceso y baja») y ahora lo comparten la ficha y la hoja
 * de ajustes de la cartera: una sola implementación del mismo gesto.
 */
export const PauseRow = ({ client }) => {
  const { setClientPaused } = useApp();
  /* La fecha propuesta al abrir el gesto. Nace vacía: «sin fecha» es una pausa
     válida (una baja que no se sabe cuánto dura). */
  const [eligiendo, setEligiendo] = useState(false);
  const [hasta, setHasta] = useState('');

  const pausa = pauseOf(client, todayISO());
  const enPausa = client.status === 'paused';

  if (enPausa) {
    return (
      <div className="card-inset col gap-2">
        <div className="row between wrap gap-2 t-sm">
          <span className="t-secondary">
            {pausa?.expired
              ? `Su pausa venció el ${shortDate(pausa.until)}: sus avisos vuelven a contar.`
              : pausa?.until
                ? `En pausa hasta el ${shortDate(pausa.until)}. Sin alertas hasta que vuelva.`
                : 'En pausa, sin fecha de vuelta. Sin alertas hasta que le reanudes.'}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setClientPaused(client.id, false)}
          >
            Reanudar
          </button>
        </div>
        {/* Ampliar es la salida natural de una pausa vencida: la lesión duró
            más. El mismo control que al pausar, con la fecha de hoy de suelo. */}
        <div className="row gap-2 wrap t-sm">
          <input
            type="date"
            className="input input-sm"
            value={hasta}
            min={todayISO()}
            aria-label="Nueva fecha de vuelta"
            onChange={(e) => setHasta(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!hasta}
            onClick={() => setClientPaused(client.id, true, { until: hasta })}
          >
            Cambiar la vuelta
          </button>
        </div>
      </div>
    );
  }

  if (!eligiendo) {
    return (
      <div className="row between wrap gap-2 t-sm">
        <span className="t-xs t-tertiary">
          ¿Lesión, vacaciones? Pausarle lo aparta sin terminar: sin alertas hasta su vuelta, y todo
          lo suyo sigue donde está.
        </span>
        <button type="button" className="cab-accion is-puerta" onClick={() => setEligiendo(true)}>
          Pausar
        </button>
      </div>
    );
  }

  return (
    <div className="card-inset col gap-2">
      <span className="t-sm t-secondary">¿Hasta cuándo? Sin fecha también vale.</span>
      <div className="row gap-2 wrap">
        <input
          type="date"
          className="input input-sm"
          value={hasta}
          min={todayISO()}
          autoFocus
          aria-label="Fecha de vuelta"
          onChange={(e) => setHasta(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setClientPaused(client.id, true, { until: hasta || null })}
        >
          {hasta ? `Pausar hasta el ${shortDate(hasta)}` : 'Pausar sin fecha'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEligiendo(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
};

/**
 * Las etiquetas de esta persona: cómo la clasifica su entrenador.
 *
 * «Pérdida de grasa», «Presencial», «Competidor»… No son un catálogo de la
 * aplicación: son su vocabulario, y por eso el alta es un campo de texto y no
 * una lista cerrada. La cartera las recoge tal cual para filtrar (0093). El
 * acotado —cortas, pocas, sin repetidas— viene del dominio (`TAG_LIMITS`).
 *
 * Guardan al momento, sin botón: quitar una etiqueta es una decisión hecha, no
 * un borrador que se confirma.
 */
export const TagsRow = ({ client, onSave }) => {
  const [texto, setTexto] = useState('');
  const tags = client.tags || [];

  const añadir = () => {
    const nueva = texto.trim().slice(0, TAG_LIMITS.len);
    setTexto('');
    if (!nueva) return;
    if (tags.some((t) => t.toLowerCase() === nueva.toLowerCase())) return;
    if (tags.length >= TAG_LIMITS.max) return;
    onSave([...tags, nueva]);
  };

  return (
    <div className="col gap-2">
      <span className="section-label">Etiquetas</span>
      <div className="row gap-2 wrap">
        {tags.map((tag) => (
          <span key={tag} className="chip" style={{ cursor: 'default' }}>
            {tag}
            <button
              type="button"
              className="btn btn-icon btn-icon-compact"
              aria-label={`Quitar la etiqueta ${tag}`}
              onClick={() => onSave(tags.filter((t) => t !== tag))}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        {tags.length < TAG_LIMITS.max && (
          <form
            className="row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              añadir();
            }}
          >
            <input
              className="input input-sm"
              style={{ width: 160 }}
              value={texto}
              maxLength={TAG_LIMITS.len}
              placeholder={tags.length === 0 ? 'Ej: Pérdida de grasa' : 'Otra…'}
              aria-label="Etiqueta nueva"
              onChange={(e) => setTexto(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={!texto.trim()}>
              Añadir
            </button>
          </form>
        )}
      </div>
      <span className="t-xs t-tertiary">
        Tu clasificación, con tus palabras. En «Clientes» filtran la cartera.
      </span>
    </div>
  );
};
