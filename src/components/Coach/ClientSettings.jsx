import { Suspense, lazy, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, X } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { TAG_LIMITS, pauseOf } from '@/domain/portfolio';
import { loQueLeHasMandado } from '@/domain/acciones';
import { tipoById } from '@/domain/envios';
import { columnasDe, respuestaLegible } from '@/domain/formulario';
import { clientIntake, intakeToPreferences, removeCustomStep } from '@/domain/intake';
import { protocoloDeCliente } from '@/domain/protocolos';
import { clientPath } from '@/routes';
import { shortDate, todayISO } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/primitives';

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
 * Así que dice de qué protocolo sale, y lleva a su pestaña «Protocolo», donde
 * se lee entero. Era una hoja que se abría encima, y cada pantalla tenía que
 * cerrar lo que tuviera delante antes de abrirla; desde que es una página, el
 * pie va solo.
 */
export const PieDeProtocolo = ({ client }) => {
  const { coachPrefs } = useApp();
  const navigate = useNavigate();
  if (!client) return null;

  const suyo = protocoloDeCliente(coachPrefs, client);

  return (
    <p className="t-2xs t-tertiary">
      Solo para {client.name?.split(' ')[0] || 'este cliente'}, de su protocolo «{suyo?.name}».{' '}
      <button
        type="button"
        className="cab-accion"
        onClick={() => navigate(clientPath(client.id, 'protocolo'))}
      >
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
export const LoQueLeHasMandado = ({ client, variante = 'seccion' }) => {
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

      {variante === 'tarjeta' && lista.length === 0 ? (
        /* El vacío del dibujo (98:86): una invitación y no un hueco. Dice qué
           es un envío suelto antes de ofrecerlo, porque es la palabra que
           nadie trae aprendida. */
        <div className="envio-vacio">
          <span className="envio-vacio-ico" aria-hidden="true">
            <Send size={20} />
          </span>
          <p className="envio-vacio-tit">No le has mandado nada suelto</p>
          <p className="envio-vacio-dice">
            Un envío es lo que le pides a {nombre} sin cambiarle el protocolo: un cuestionario de
            sueño, un vídeo o un encargo rápido. Le aparece entre sus pendientes.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setMandando(true)}>
            Mandarle algo suelto
          </button>
        </div>
      ) : (
        <div className="row gap-2 wrap">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMandando(true)}>
            <Send size={15} /> Mandarle algo
          </button>
          <span className="t-xs t-tertiary">
            Le aparece entre sus pendientes. No le toca el protocolo.
          </span>
        </div>
      )}

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
  if (variante === 'tarjeta') {
    return <div className={lista.length > 0 ? 'proto-caja col gap-3' : ''}>{cuerpo}</div>;
  }

  if (variante === 'bloque') {
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
