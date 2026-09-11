import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Dumbbell,
  Layers,
  Megaphone,
  Pause,
  Play,
  Plus,
  Scale,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
  Tag,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { Nube } from '@/components/ui/EstadoDeRed';
import { Pliegue } from '@/components/ui/Pliegue';
import { traeALaVista } from '@/lib/motion';
import { PORTFOLIO_FILTERS, TAG_LIMITS, buildPortfolio } from '@/domain/portfolio';
import { contestadasPorCliente, pendientesPorCliente } from '@/domain/envios';
import { semanaDeAhora } from '@/domain/week';
import { memberName } from '@/domain/team';
import { clientProtocol } from '@/domain/protocol';
import { COACH_CLIENT, PROTOCOL_HOME, clientPath, sectionsFor } from '@/routes';
import { localeNumber, shortDate, todayISO } from '@/lib/dates';
import { Avatar, tonoDe } from '@/components/ui/Avatar';
import { EmptyState, Notice, Panel, SectionTitle } from '@/components/ui/primitives';
/* Un bloque sin nada que enseñar se dice con `TarjetaVacia` en todo el producto;
   aquí era una frase gris dentro de un panel por lo demás vacío. */
import { TarjetaVacia } from '@/components/dashboard/Tarjeta';
import { useToast } from '@/components/ui/ToastProvider';
import { useMarcaDeslizante } from '@/components/ui/carril';
import { MandoDeOrden, ThOrden, ordenar, useOrden } from '@/components/ui/tabla';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { SelectorEtiquetas } from './SelectorEtiquetas';
import { ClientSettingsSheet } from './ClientSettings';
import { ArchivedClients } from './ArchivedClients';
import { NewClientForm } from './NewClientForm';

/*
  El asistente de mandar, PEREZOSO — el mismo trato que las capas de
  `CoachLayout`. La cartera va en el chunk de arranque y el diálogo se abre en
  una de cada veinte visitas: cargarlo siempre metería en el arranque el
  constructor de envíos y el dominio de formularios entero para que casi nadie
  lo use. Se descarga al pulsar «Mandar algo», que es cuando importa.
*/
const MandarAlgo = lazy(() =>
  import('./MandarAlgo').then((m) => ({ default: m.MandarAlgo }))
);
import { inviteMessage, useInvite } from './useInvite';

/**
 * Los pesajes recientes de una persona, ordenados: los últimos tres meses como
 * números pelados. De ellos la fila solo usa el último —la chispa que dibujaba
 * los doce se retiró de la tabla—, pero se leen en serie porque el histórico no
 * llega ordenado y el «último» es el último POR FECHA, no el último guardado.
 */
const serieDePeso = (anthro) =>
  (anthro?.history || [])
    .filter((h) => h.date && Number.isFinite(Number(h.weight)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12)
    .map((h) => Number(h.weight));

/** El último peso que se le conoce: la media de esta semana si existe, y si no
    el último pesaje de la serie. */
const pesoDe = (row, serie) => row.checkIn?.average ?? (serie.length ? serie[serie.length - 1] : null);

/*
  El icono de cada pregunta de la cartera. Es cromo con oficio: en una fila de
  seis chips de texto, el ojo tenía que LEER para encontrar «Por revisar»; con
  el glifo delante, lo reconoce. El mapa vive aquí y no en el dominio porque
  los iconos son de la pantalla, no del criterio.
*/
const ICONO_FILTRO = {
  attention: CircleAlert,
  inactive: Dumbbell,
  review: ClipboardCheck,
  checkin: Scale,
  payment: Wallet,
  paused: Pause,
  ok: CircleCheck,
  all: Users,
};

/*
  Las dos hojas que se le escriben a un cliente. Salen del MISMO sitio que su
  carril de secciones (`COACH_CLIENT`), así que el rótulo y el icono de
  «Entreno» son los mismos en la cartera y dentro de la ficha: si mañana la
  dieta cambia de nombre, cambia en los dos a la vez. Filtrarlas por el
  protocolo de cada uno es cosa de `sectionsFor`, que ya sabe hacerlo.
*/
const LLEVA = COACH_CLIENT.filter((s) => s.service === 'training' || s.service === 'nutrition');

/**
 * El estado de una persona: un punto de semáforo y una frase en voz normal.
 *
 * ══ Por qué esto es una COLUMNA y no una línea debajo del nombre ════════════
 *
 * Debajo del nombre había una frase gris que encadenaba tres cosas —el
 * veredicto de la semana, lo que le falta y quién la lleva— separadas por
 * puntos, y al lado un punto ámbar que decía «esto no puede esperar». Sumado a
 * los chips de etiqueta, la cifra de peso y el botón de invitar, cada fila
 * hablaba con siete voces tipográficas distintas: la pantalla se leía como una
 * lista de avisos, no como una cartera.
 *
 * ══ Y por qué el COLOR está en el punto y no en la frase ════════════════════
 *
 * La primera versión de esta columna escribía la frase con la tinta del
 * semáforo, que es como el producto dice sus veredictos (`.veredicto`). En una
 * ficha, donde hay UN veredicto, funciona. En una lista de trece, no: la
 * cartera de verdad tiene ocho filas con algo pendiente, así que la columna
 * salía siendo ocho renglones rojos y ámbar seguidos. El dueño lo comparó con
 * la lista de Coachway —una pastilla verde por fila y nada más— y la palabra
 * fue «más limpia».
 *
 * El punto dice lo mismo con una centésima de la tinta: en vertical se lee de
 * un vistazo cuántos hay en rojo, sin que el color se coma la frase. Y como el
 * texto vuelve a gris, la columna deja de competir con el nombre.
 *
 * ── El orden en que se decide qué se dice ───────────────────────────────────
 * Lo GRAVE manda sobre el progreso: «Sin acceso a su portal» hay que resolverlo
 * hoy, y mientras no se resuelva ninguna otra cifra de la ficha significa nada.
 * Debajo de eso viene el veredicto de la semana —«En rumbo», «Estancado»—, que
 * es lo que se quiere saber de quien va bien, y por debajo las carencias leves.
 * «Al día» solo se dice cuando de verdad no hay nada, y lleva punto verde: es
 * la única buena noticia de la columna y merece verse.
 *
 * `rango` es para ordenar por esta columna: lo urgente primero, la pausa al
 * final. Sale de aquí y no de la tabla porque es el MISMO criterio que decide
 * qué frase se enseña — con dos, se podría ordenar por una gravedad que la
 * fila no está diciendo.
 */
const TONOS_VEREDICTO = new Set(['good', 'warn', 'bad', 'info']);
const RANGO = { bad: 0, warn: 1, info: 2, good: 3, null: 4 };

const estadoDe = (row) => {
  const con = (text, tone) => ({ text, tone, rango: RANGO[tone ?? 'null'] });

  /* La pausa va al final de cualquier orden: con quien has parado tú no hay
     nada que hacer hasta su vuelta. */
  if (row.paused) {
    return {
      ...con(row.paused.until ? `En pausa hasta el ${shortDate(row.paused.until)}` : 'En pausa', null),
      rango: 5,
    };
  }
  const grave = row.alerts.find((a) => a.severity === 'alta');
  if (grave) return con(grave.label, 'bad');
  const media = row.alerts.find((a) => a.severity === 'media');
  if (media) return con(media.label, 'warn');
  if (row.headline?.text) {
    return con(row.headline.text, TONOS_VEREDICTO.has(row.headline.tone) ? row.headline.tone : null);
  }
  if (row.alerts.length > 0) return con(row.alerts[0].label, null);
  return con('Al día', 'good');
};

/**
 * Una persona de la cartera: quién es, cómo va, cómo la tienes clasificada y su
 * señal de vida.
 *
 * ══ Por qué es una fila de libro y no una frase ═════════════════════════════
 *
 * Hubo una versión con columnas fijas y fracasó: contra una cartera de verdad
 * —media cartera recién dada de alta— las columnas salían llenas de rayas y de
 * casillas grises que se leían como un esqueleto de carga. La lección quedó
 * escrita: **la densidad solo es una virtud si el dato existe**. La respuesta
 * de entonces fue retirar las columnas y dejar una frase.
 *
 * Pero la frase tenía el defecto contrario: el producto GUARDA la serie de
 * pesos, la semana del bloque y el último entreno de cada persona, y la
 * pantalla que se llama «Clientes» no enseñaba nada de eso.
 *
 * La síntesis respeta la lección sin pagar su precio, con dos reglas:
 *
 *   1. LA COLUMNA EXISTE SI LA CARTERA PUEDE LLENARLA. Si nadie tiene un
 *      programa, la columna de semana no se dibuja; si nadie se pesa, no hay
 *      columna de peso. Una cartera nueva ve una lista limpia, y las columnas
 *      van apareciendo conforme la cartera vive.
 *   2. LA CELDA VACÍA CALLA. Quien no tiene el dato no enseña una raya ni una
 *      casilla gris: enseña nada.
 *
 * ══ Una voz por fila ════════════════════════════════════════════════════════
 *
 * El nombre es lo único que sube de tamaño; el estado es lo único que lleva
 * color; todo lo demás —semana, señal, peso— es el mismo gris al mismo cuerpo,
 * alineado a la izquierda con su cabecera. Aquí vivió una chispa de 96 px con
 * la serie de pesos: una gráfica dentro de una celda no se lee, se nota, y lo
 * que aportaba de más era exactamente el desorden. La serie entera está a un
 * clic, en la ficha, que es donde se mira de verdad.
 *
 * ── La fila entera abre al cliente ──────────────────────────────────────────
 * El clic va en la fila (`<tr>`) y el teclado en el nombre, que es un botón de
 * verdad: así no hay botones anidados y las celdas de gesto —la marca, las
 * etiquetas, el menú— cortan la propagación para no abrir la ficha sin querer.
 */
const FilaCliente = ({
  row,
  estado,
  peso,
  semana,
  trainer,
  columnas,
  servicios,
  vocabulario,
  acciones,
  onOpen,
  onAbrirSeccion,
  onPonerEtiqueta,
  onQuitarEtiqueta,
  marcado,
  onMarcar,
}) => {
  const { client } = row;
  const dias = row.sinceTraining;
  const tags = client.tags || [];
  const detener = (e) => e.stopPropagation();

  return (
    <tr onClick={onOpen}>
      {/* La marca de selección. Su celda corta la propagación: marcar a alguien
          para avisarle no es querer entrar en su ficha. */}
      {onMarcar && (
        <td className="p-marca" onClick={detener}>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={marcado}
              onChange={onMarcar}
              aria-label={`Seleccionar a ${client.name}`}
            />
          </label>
        </td>
      )}

      <td>
        {/* El flex va en un envoltorio y no en el `td`: una celda con
            `display: flex` deja de ser celda y rompe el reparto de la tabla. */}
        <span className="p-persona">
          <Avatar name={client.name} src={client.avatar} size="md" className="p-cara" />
          <span className="p-who">
            <span className="p-name">
              <button
                type="button"
                className="p-abrir"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                aria-label={`Abrir la ficha de ${client.name}`}
              >
                {client.name}
              </button>
            </span>
            {/* El entrenador responsable solo aparece si hay equipo: en un
                equipo de uno, escribir su propio nombre en cada fila es ruido. */}
            {trainer !== null && (
              <span className="p-sub">{trainer ? memberName(trainer) : 'Sin asignar'}</span>
            )}
          </span>
        </span>
      </td>

      <td className="p-estado">
        <span className="p-senal" data-tono={estado.tone || 'neutro'}>
          <span className="p-punto" aria-hidden="true" />
          <span className="p-senal-texto">{estado.text}</span>
        </span>
      </td>

      {/* Las etiquetas, JUNTO a la persona y editables aquí mismo. La celda
          entera es el disparador del desplegable —con las puestas dentro, o el
          hueco que invita si no hay ninguna— porque el «+» que solo asomaba al
          pasar el ratón no se encuentra: quien no pasa por encima no sabe que
          las etiquetas existen. Filtrar por una se hace arriba, en el carril:
          en la fila se CLASIFICA, en el carril se BUSCA, y un mismo chip que
          hiciera las dos cosas no diría cuál está haciendo. */}
      <td className="p-etiq" onClick={detener}>
        <SelectorEtiquetas
          vocabulario={vocabulario}
          activas={tags}
          tope={TAG_LIMITS.max}
          onAlternar={(tag) =>
            tags.includes(tag) ? onQuitarEtiqueta(tag) : onPonerEtiqueta(tag)
          }
          onCrear={onPonerEtiqueta}
          clase="p-etiq-boton"
          ariaLabel={`Etiquetas de ${client.name}`}
          contenido={
            tags.length > 0 ? (
              <span className="p-tags">
                {tags.map((t) => (
                  <span key={t} className="p-tag" data-tono={tonoDe(t)}>
                    {t}
                  </span>
                ))}
              </span>
            ) : (
              <span className="p-etiq-hueco">Etiquetar</span>
            )
          }
        />
      </td>

      {columnas.semana && (
        <td className="p-celda p-semana">{semana > 0 ? `S${semana}` : null}</td>
      )}

      {/* La señal de vida. Sin tinta de aviso: el juicio —«12 días sin
          entrenar»— lo da la columna de estado, y decirlo dos veces a un palmo
          de distancia es lo que convertía la fila en una pancarta. El semáforo
          juzga; la columna solo mide. */}
      {columnas.entreno && (
        <td className="p-celda p-entreno">
          {dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : dias > 0 ? `hace ${dias} d` : null}
        </td>
      )}

      {columnas.peso && (
        <td className="p-celda p-peso">
          {peso !== null && peso !== undefined
            ? `${localeNumber(peso, { maximumFractionDigits: 1 })} kg`
            : null}
        </td>
      )}

      {/* ── LO QUE LE LLEVAS, y la puerta a cada cosa ────────────────────────
          La columna «Plans» de Coachway dicha con nuestro vocabulario: los
          servicios que tiene encendidos en su protocolo —«Qué llevas», el
          primer apartado del editor— y, de paso, el atajo a la hoja de cada
          uno. Es la unión con el protocolo hecha DATO: se ve de un vistazo a
          quién le llevas solo la dieta, y quien no tiene un servicio no enseña
          su icono apagado, que sería prometer una puerta que no existe.

          Van como enlaces de icono y no como texto porque son dos por fila en
          trece filas: dos palabras repetidas veintiséis veces es una columna
          de ruido; dos glifos son un patrón que se reconoce sin leer. */}
      <td className="p-lleva" onClick={detener}>
        <span className="p-lleva-iconos">
          {servicios.map((s) => (
            <button
              key={s.path}
              type="button"
              className="btn btn-icon p-lleva-boton"
              title={`${s.label} de ${client.name}`}
              aria-label={`Abrir ${s.label.toLowerCase()} de ${client.name}`}
              onClick={() => onAbrirSeccion(s.path)}
            >
              <s.icon size={15} />
            </button>
          ))}
        </span>
      </td>

      {/* ── El menú de la fila: lo que antes eran tres viajes ────────────────
          Aquí hubo un botón azul de «Invitar» —una acción primaria repetida en
          media cartera, compitiendo con la única que debería serlo— y una rueda
          que abría el protocolo. Ahora es un «···»: el mismo de toda la
          aplicación, con las cuatro cosas que se le hacen a una persona sin
          entrar en ella. Un menú no es «esconder»: es dejar de gritar cuatro
          verbos por fila cuando la fila entera ya es la puerta. */}
      <td className="p-accion" onClick={detener}>
        <MenuAcciones items={acciones} ariaLabel={`Más acciones de ${client.name}`} />
      </td>
    </tr>
  );
};

/**
 * Las acciones sobre los seleccionados.
 *
 * Aquí solo va lo que tiene sentido hacerle a VARIOS a la vez: avisar («esta
 * semana no paso consulta»), etiquetar y pausar. Todo lo demás es de la
 * persona y vive en su ficha — la barra no es un menú contextual, es la
 * respuesta a «tengo que decirles algo a estos cinco».
 *
 * Mandar y avisar abren el MISMO asistente —con el «qué» ya contestado en el
 * segundo caso—; etiquetar y pausar, que son un campo y una fecha, se despliegan
 * aquí mismo.
 *
 * ── Por qué el aviso perdió su hoja ───────────────────────────────────────
 * Tenía la suya, con su campo de texto y su botón, y era la tercera forma
 * distinta de hacerle llegar algo a alguien. Tres gestos para una sola pregunta.
 * Lo que no se ha unificado es dónde cae: un aviso sigue siendo una novedad y no
 * un pendiente (ver `carril` en `domain/envios.js`).
 */
const AccionesEnLote = ({ filas, onLimpiar, onMandar, onAviso, onEtiquetar, onPausar, onReanudar }) => {
  const [modo, setModo] = useState(null);
  const [texto, setTexto] = useState('');
  const [hasta, setHasta] = useState('');

  const n = filas.length;
  /* «Reanudar» solo cuando TODOS los marcados están en pausa: con una mezcla,
     el verbo que aplica a todos es pausar (a los ya pausados les cambia la
     vuelta, que es lo que se espera al re-pausar). */
  const todosEnPausa = filas.every((r) => r.paused);

  const cerrar = () => {
    setModo(null);
    setTexto('');
    setHasta('');
  };

  /*
    ══ CUÁNTO SE LLEVA ESTE MOSTRADOR DEL PIE ═════════════════════════════════

    El pie de la pantalla lo comparten dos cosas: este mostrador, centrado, y la
    mano del portapapeles, a la derecha (`.pp-pie`, ver `ui/Portapapeles`). Los
    dos estaban fijos a la misma altura y con el mismo `z-index`, así que se
    pisaban por debajo de 1 444 px de ventana — marcar clientes con una hoja
    copiada es una tarde normal, no un caso raro.

    La ley es «un mostrador a la vez»: la mano se apoya ENCIMA. Y para apoyarse
    necesita saber cuánto ocupa esto, que no es un número: el mostrador crece al
    desplegar «Etiquetar» o «Pausar» y encoge al cerrarlos. Así que se mide y se
    publica sobre el `<html>`, como `--cliente-cab-h` en `CoachLayout`. El aire
    que los separa va dentro del valor —es un desplazamiento, no una medida—,
    para que sin mostrador la variable pueda no existir y quien la use caiga a
    cero sin arrastrar un hueco de la nada.
  */
  const mostrador = useRef(null);
  useEffect(() => {
    const raiz = document.documentElement;
    const caja = mostrador.current;
    if (!caja) return undefined;
    const medir = () =>
      raiz.style.setProperty('--lote-apoyo', `calc(${Math.round(caja.offsetHeight)}px + var(--s3))`);
    medir();
    if (typeof ResizeObserver === 'undefined') return () => raiz.style.removeProperty('--lote-apoyo');
    const ojo = new ResizeObserver(medir);
    ojo.observe(caja);
    return () => {
      ojo.disconnect();
      raiz.style.removeProperty('--lote-apoyo');
    };
  }, []);

  return (
    <div
      className="p-lote"
      ref={mostrador}
      role="region"
      aria-label="Acciones sobre los clientes seleccionados"
    >
      <span className="n">{n === 1 ? '1 seleccionado' : `${n} seleccionados`}</span>

      {modo === null && (
        <div className="row gap-2 wrap">
          {/*
            ── «Mandar algo» es el primario, y por qué ──────────────────────
            Su audiencia por defecto se llama «A los que marqué» y el único
            sitio donde se marca gente es esta tabla: el diálogo llevaba meses
            esperando este botón, montado solo en las dos pantallas del Taller.
            Va delante del aviso porque pedir algo —un formulario, un vídeo, una
            tarea— es lo que se hace todas las semanas; avisar, de vez en cuando.
          */}
          <button type="button" className="btn btn-primary btn-sm" onClick={onMandar}>
            <Send size={15} /> Mandar algo
          </button>
          {/* El aviso abre su hoja lateral: un mensaje se escribe con sitio,
              no en un campo incrustado en una barra. */}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAviso}>
            <Megaphone size={15} /> Enviar aviso
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModo('tag')}>
            <Tag size={15} /> Etiquetar
          </button>
          {todosEnPausa ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onReanudar}>
              <Play size={15} /> Reanudar
            </button>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModo('pausa')}>
              <Pause size={15} /> Pausar
            </button>
          )}
          <button
            type="button"
            className="btn btn-icon"
            onClick={onLimpiar}
            aria-label="Quitar la selección"
            title="Quitar la selección"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {modo === 'tag' && (
        <form
          className="row gap-2 wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (!texto.trim()) return;
            onEtiquetar(texto);
            cerrar();
          }}
        >
          <input
            className="input input-sm"
            style={{ width: 180 }}
            value={texto}
            maxLength={TAG_LIMITS.len}
            autoFocus
            placeholder="Ej: Presencial"
            aria-label="Etiqueta para los seleccionados"
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!texto.trim()}>
            {n === 1 ? 'Ponérsela' : `Ponérsela a ${n}`}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={cerrar}>
            Cancelar
          </button>
        </form>
      )}

      {modo === 'pausa' && (
        <form
          className="row gap-2 wrap"
          onSubmit={(e) => {
            e.preventDefault();
            onPausar(hasta || null);
            cerrar();
          }}
        >
          <input
            type="date"
            className="input input-sm"
            value={hasta}
            min={todayISO()}
            autoFocus
            aria-label="Fecha de vuelta"
            onChange={(e) => setHasta(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm">
            {hasta ? `Pausar hasta el ${shortDate(hasta)}` : 'Pausar sin fecha'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={cerrar}>
            Cancelar
          </button>
        </form>
      )}
    </div>
  );
};

/**
 * Clientes: la única pantalla que habla de toda la cartera.
 *
 * ══ Por qué esto era DOS pantallas y ya no ══════════════════════════════════
 *
 * Había «Cartera» —este tablero— y «Clientes» —el alta, invitar, archivar y los
 * datos—. Dos entradas del menú principal que listaban a las mismas personas y
 * hacían cosas distintas al pulsarlas: en una entrabas al cliente, en la otra se
 * desplegaba administración.
 *
 * Eso no era una molestia estética. Un entrenador nuevo crea su primer cliente en
 * «Clientes», que es donde está el botón de alta; pulsa sobre él esperando entrar;
 * y lo que se abre es un panel de exportar datos. La pregunta que llegó a soporte
 * fue «¿dónde hago la rutina?» — y la respuesta era «en la OTRA pantalla que
 * también lista clientes».
 *
 * Ahora hay una: se da de alta aquí, se ve el estado aquí, y el clic entra en la
 * persona. Todo lo de un cliente —incluida su ficha administrativa— cuelga de
 * `/c/:id/…`, que es donde ya vivían su rutina y su nutrición.
 *
 * ══ Y por qué aquí ya no hay tareas ════════════════════════════════════════
 *
 * Hubo un tablero de cuatro columnas, y después una bandeja de tareas. Las dos
 * contestaban «¿qué hago ahora?» — que es la pregunta de «Hoy», la pantalla con
 * la que se abre el día, y no la de esta.
 *
 * Tenerlas en los dos sitios obligaba a mirar los dos por si acaso, y encima no
 * coincidían: «Hoy» calculaba su propia bandeja con tres tipos de aviso y aquí
 * había siete tareas. Ahora el reparto vive en `domain/portfolio.js`, lo enseña
 * «Hoy» a través de `TaskInbox`, y esto es lo que su nombre dice: tus clientes,
 * en orden de urgencia, con lo que le pasa a cada uno al lado.
 */
export const ClientPortfolio = () => {
  const {
    clients,
    training,
    anthropometry,
    progressPhotos,
    checkIns,
    equipmentCounts,
    envioRows,
    checkInsActivos,
    addClient,
    updateClient,
    setClientPaused,
    setClientArchived,
    archivedClients,
    team,
    teamMembers,
  } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  /* La marca deslizante de las pestañas de tramo: el mismo conmutador que el
     carril del cliente y el del portal. */
  const carrilTramos = useMarcaDeslizante();

  const [trainer, setTrainer] = useState('all');
  const [search, setSearch] = useState('');
  /* Qué tramo de la cartera se mira. 'all' es la lista de siempre; el resto son
     los predicados de `PORTFOLIO_FILTERS` — el criterio vive en el dominio, y
     la cifra del chip sale del MISMO predicado que filtra (ver su cabecera). */
  const [filtro, setFiltro] = useState('all');
  /* Y las etiquetas por las que se mira, si hay alguna. Eje aparte del filtro
     de estado: «los de pérdida de grasa por revisar» son las dos preguntas a la
     vez.

     ── Por qué son VARIAS y por qué suman ────────────────────────────────────
     Era una sola, y con una sola no se puede preguntar «los presenciales de
     competición»: elegir la segunda soltaba la primera. Ahora cada etiqueta que
     se marca ACOTA la anterior (y, no o), que es lo que hace un cajón de
     clasificación — con «o», marcar dos siempre devuelve más gente que marcar
     una, y entonces el gesto de afinar la lista la ensancha. */
  const [tagsFiltro, setTagsFiltro] = useState([]);
  const [alta, setAlta] = useState(false);
  /* El que se acaba de crear, para poder seguir con él sin ir a buscarlo. */
  const [recien, setRecien] = useState(null);
  /* Los marcados para una acción en lote: avisar, etiquetar, pausar. Ids y no
     filas — las filas se recalculan y la marca tiene que sobrevivirles. */
  const [sel, setSel] = useState(() => new Set());
  /* Las dos capas de la cartera: el protocolo de una persona y la hoja del
     aviso, con sus destinatarios. */
  const [ajustes, setAjustes] = useState(null);
  /* Los ids a los que se les va a mandar algo. Ids y no filas por lo mismo que
     `sel`: el diálogo resuelve la gente por su cuenta contra `clients`. */
  const [mandando, setMandando] = useState(null);

  const today = todayISO();

  /* Cuántas cosas de las que les mandaste tienen sin hacer. Contadas en su
     dominio y no aquí: la regla de qué está pendiente es la misma que usan su
     portal y su ficha (ver `pendientesPorCliente`). */
  const mandadoCounts = useMemo(() => pendientesPorCliente(envioRows, today), [envioRows, today]);
  /* Y cuántas respuestas suyas te faltan por leer (0108). Sin fecha: una
     respuesta lo es el día que llega. */
  const contestadoCounts = useMemo(() => contestadasPorCliente(envioRows), [envioRows]);
  const rows = useMemo(
    () => buildPortfolio({ clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts, mandadoCounts, contestadoCounts }, today),
    [clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts, mandadoCounts, contestadoCounts, today]
  );

  /*
    ══ LOS TRAMOS: el estado de la relación son PESTAÑAS, no una columna ═══════

    La primera versión puso el estado como columna, y salía «Activo» catorce
    veces: una chapa que dice lo mismo en todas las filas no distingue ninguna.
    La lista de Coachway lo resuelve arriba —Active / Pending / Paused /
    Ended— y esa es la forma correcta: el estado es DÓNDE ESTÁS mirando, no un
    dato de cada fila. De paso, los archivados dejan de ser un panel colgado al
    fondo de la página: son el último tramo.

    Las pestañas sin nadie no se pintan (la regla de los chips a cero);
    «Activos» existe siempre porque es la casa.
  */
  const [tramo, setTramo] = useState('activos');
  const tramos = useMemo(() => {
    const t = { activos: [], pendientes: [], pausa: [] };
    for (const r of rows) {
      if (r.paused) t.pausa.push(r);
      else if (r.alerts.some((a) => a.id === 'not_started')) t.pendientes.push(r);
      else t.activos.push(r);
    }
    return t;
  }, [rows]);
  /* Si el tramo abierto se queda sin gente (se reanuda al último pausado), se
     vuelve a casa en vez de enseñar una lista vacía con su pestaña muerta. */
  const tramoVivo =
    tramo === 'archivo'
      ? archivedClients.length > 0
        ? tramo
        : 'activos'
      : tramos[tramo]?.length > 0 || tramo === 'activos'
        ? tramo
        : 'activos';
  const delTramo = useMemo(
    () => (tramoVivo === 'archivo' ? [] : tramos[tramoVivo]),
    [tramoVivo, tramos]
  );

  /* El eje de entrenador solo existe si hay equipo con más de una persona: con un
     entrenador único, un filtro de una sola opción es ruido. */
  const showTrainers = Boolean(team) && teamMembers.length > 1;
  const memberById = useMemo(() => new Map(teamMembers.map((m) => [m.profileId, m])), [teamMembers]);

  /*
    ══ Los filtros, con su cifra ANTES del clic ═══════════════════════════════
    La cifra y el filtro salen del mismo predicado (`PORTFOLIO_FILTERS`), así
    que no pueden discrepar. Solo se pintan los que tienen a alguien: un chip a
    cero es una promesa vacía — y una cartera recién estrenada ve la lista
    limpia de siempre, sin fila de filtros que no filtran nada.
  */
  const filtros = useMemo(
    () =>
      PORTFOLIO_FILTERS.map((f) => ({ ...f, count: delTramo.filter(f.test).length })).filter(
        (f) => f.id === 'all' || f.count > 0
      ),
    [delTramo]
  );

  /* Las etiquetas que existen en el TRAMO abierto, con su cuenta. El
     vocabulario es del entrenador (columna `tags`, 0093): aquí solo se
     recogen. */
  const etiquetas = useMemo(() => {
    const cuenta = new Map();
    for (const row of delTramo) {
      for (const tag of row.client.tags || []) cuenta.set(tag, (cuenta.get(tag) || 0) + 1);
    }
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [delTramo]);

  /* Y el vocabulario ENTERO, con la cuenta de toda la cartera: es lo que se
     ofrece al etiquetar a alguien. Va sobre `rows` y no sobre el tramo porque
     al clasificar se quiere la lista completa —«Presencial» existe aunque hoy
     no la lleve nadie de los activos—, mientras que el carril de filtros solo
     puede ofrecer lo que de verdad hay delante. */
  const vocabulario = useMemo(() => {
    const cuenta = new Map();
    for (const row of rows) {
      for (const tag of row.client.tags || []) cuenta.set(tag, (cuenta.get(tag) || 0) + 1);
    }
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);

  const filtradas = useMemo(() => {
    const term = search.trim().toLowerCase();
    const pasa = PORTFOLIO_FILTERS.find((f) => f.id === filtro)?.test || (() => true);
    return delTramo.filter((row) => {
      if (showTrainers && trainer !== 'all') {
        const mine = trainer === 'none' ? !row.client.assignedTo : row.client.assignedTo === trainer;
        if (!mine) return false;
      }
      if (!pasa(row)) return false;
      if (tagsFiltro.length > 0) {
        const suyas = row.client.tags || [];
        if (!tagsFiltro.every((t) => suyas.includes(t))) return false;
      }
      if (!term) return true;
      return (
        row.client.name.toLowerCase().includes(term) ||
        (row.client.email || '').toLowerCase().includes(term)
      );
    });
  }, [delTramo, showTrainers, trainer, search, filtro, tagsFiltro]);

  /* Si hay algún eje puesto. Lo usa el vacío: «ningún cliente coincide» sin la
     forma de deshacerlo es un callejón — sobre todo con un filtro que se quedó
     puesto de la visita anterior y ya no se recuerda. */
  const hayFiltro =
    search.trim() !== '' ||
    filtro !== 'all' ||
    tagsFiltro.length > 0 ||
    (showTrainers && trainer !== 'all');
  const limpiarFiltros = () => {
    setSearch('');
    setFiltro('all');
    setTagsFiltro([]);
    setTrainer('all');
  };

  /* La serie de pesos de cada uno, calculada una vez por render y no una vez
     por fila: la usan la cifra de la celda, el orden por peso y la decisión de
     si la columna existe. Vive antes del retorno de la cartera vacía porque un
     hook no puede ser condicional. */
  const series = useMemo(
    () => new Map(filtradas.map((r) => [r.client.id, serieDePeso(anthropometry[r.client.id])])),
    [filtradas, anthropometry]
  );

  /* La semana de cada uno, LA MISMA que pinta el riel de la barra lateral: la
     de la relación (`semanaDeAhora`) y, si no hay fecha de alta que la dé, la
     del programa. Calcularla de otra forma aquí pondría dos números distintos
     a diez centímetros — que es justo lo que pasó, y esta línea es la cura. */
  const semanaDe = (row) =>
    semanaDeAhora({ startDate: row.client.startDate, today }) || row.weekNumber || null;

  /* El estado de cada fila, una vez: lo pinta la celda y lo ordena la cabecera,
     y con dos cálculos se podría ordenar por una gravedad distinta de la que la
     fila está diciendo. */
  const estados = useMemo(
    () => new Map(filtradas.map((r) => [r.client.id, estadoDe(r)])),
    [filtradas]
  );

  /*
    ══ ORDENAR LA CARTERA ══════════════════════════════════════════════════════

    Se pulsa la cabecera, como en cualquier tabla del producto (`ui/tabla.jsx`,
    con su `aria-sort` y su botón de verdad para el teclado). La lista de
    Coachway lo tiene en un selector aparte; aquí va en la propia columna, que
    es donde se mira cuando surge la pregunta.

    ── El orden por defecto NO es alfabético ─────────────────────────────────
    Sin pulsar nada manda el del dominio: urgencia primero (`buildPortfolio` los
    devuelve así). Es la respuesta a «¿por quién empiezo hoy?», que es la
    pregunta con la que se abre esta pantalla. Ordenar es hacer OTRA pregunta
    —«quién lleva más sin entrenar», «a quién le queda menos de bloque»—, no
    sustituir la primera: por eso `useOrden` nace sin campo y se puede volver.
  */
  const orden = useOrden(null);
  const visible = useMemo(
    () =>
      ordenar(filtradas, orden, {
        nombre: (r) => r.client.name,
        estado: (r) => estados.get(r.client.id)?.rango,
        semana: (r) => semanaDe(r),
        entreno: (r) => r.sinceTraining,
        peso: (r) => pesoDe(r, series.get(r.client.id) || []),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtradas, orden.campo, orden.sentido, estados, series, today]
  );

  /* Abrir un cliente es NAVEGAR, no cambiar de pestaña: queda en el historial, el
     botón atrás vuelve a la cartera y el enlace se puede compartir. */
  const open = (clientId) => navigate(clientPath(clientId, 'resumen'));

  /*
    ══ La selección y sus acciones ═════════════════════════════════════════════
    Las acciones aplican a los marcados QUE SE VEN: si después de marcar se
    cambia el filtro, actuar sobre gente oculta sería actuar a ciegas. Con un
    solo cliente no hay lote posible y la columna de marcas no se dibuja.
  */
  const seleccionable = rows.length > 1;
  const elegidos = useMemo(() => visible.filter((r) => sel.has(r.client.id)), [visible, sel]);
  const limpiar = () => setSel(new Set());
  const marcar = (id) =>
    setSel((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });


  /* Poner UNA etiqueta a UNA persona, con el acotado del dominio: sin
     repetidas (da igual la caja) y sin pasar del tope. Lo usan la celda y el
     lote. Devuelve si la puso, para que el lote cuente. */
  const ponerEtiqueta = (client, cruda) => {
    const nueva = cruda.trim().slice(0, TAG_LIMITS.len);
    if (!nueva) return false;
    const tags = client.tags || [];
    if (tags.some((t) => t.toLowerCase() === nueva.toLowerCase())) return false;
    if (tags.length >= TAG_LIMITS.max) return false;
    updateClient(client.id, { tags: [...tags, nueva] });
    return true;
  };

  /* Y quitarla. Guarda al momento y sin confirmación: descartar una etiqueta es
     una decisión hecha, no un borrador — y volver a ponerla son dos clics. */
  const quitarEtiqueta = (client, tag) =>
    updateClient(client.id, { tags: (client.tags || []).filter((t) => t !== tag) });

  const etiquetarLote = (cruda) => {
    let puestas = 0;
    for (const r of elegidos) if (ponerEtiqueta(r.client, cruda)) puestas += 1;
    toast({
      text:
        puestas === 0
          ? `Ya la tenían.`
          : `«${cruda.trim().slice(0, TAG_LIMITS.len)}» puesta a ${puestas === 1 ? '1 cliente' : `${puestas} clientes`}.`,
    });
    limpiar();
  };

  /* Pausar desde aquí es el gesto de agosto: media cartera de vacaciones con la
     misma fecha de vuelta. El de una sola persona sigue también en su ficha. */
  const pausarLote = (hasta) => {
    for (const r of elegidos) setClientPaused(r.client.id, true, { until: hasta || null });
    toast({
      text: `${elegidos.length === 1 ? `${elegidos[0].client.name}, en pausa` : `${elegidos.length} en pausa`}${
        hasta ? ` hasta el ${shortDate(hasta)}` : ''
      }.`,
    });
    limpiar();
  };

  const reanudarLote = () => {
    for (const r of elegidos) setClientPaused(r.client.id, false);
    toast({
      text:
        elegidos.length === 1
          ? `${elegidos[0].client.name} vuelve a contar.`
          : `${elegidos.length} clientes vuelven a contar.`,
    });
    limpiar();
  };


  /* La lógica de invitar vive en `useInvite`: la comparten esta pantalla y la
     ficha del cliente, y las tres cosas que hay que hacer bien —pedir el token,
     copiarlo y tener plan si el portapapeles falla— son las mismas en las dos. */
  const { result: invite, busy: invitando, send: invitar } = useInvite();

  /*
    ══ LO QUE SE LE HACE A UNA PERSONA SIN ENTRAR EN ELLA ══════════════════════

    El «···» de cada fila. Aquí hubo un botón azul de «Invitar» —repetido en
    media cartera, compitiendo con la única acción primaria de la pantalla— y
    una rueda que abría el protocolo; el resto de gestos corrientes de un
    cliente exigían un viaje: programarle era entrar en su ficha, pausarle era
    entrar en su ficha, archivarle era bajar al panel del fondo, y afinarle el
    protocolo eran tres pasos por Ajustes.

    Las cinco caben en un menú, y el menú es el mismo que usa el resto del
    producto. Cada una hace algo DISTINTO de las demás puertas de la fila: la
    fila entra en la persona, la casilla la marca para el lote y esto la
    administra.

    Pausar y el protocolo abren la MISMA hoja porque son la misma decisión de
    aplicación —qué se le pide a esta persona y desde cuándo—, y la pausa
    necesita una fecha que no cabe en un ítem de menú.
  */
  const accionesDe = (row) => {
    const { client } = row;
    const sinAcceso = row.alerts.some((a) => a.id === 'no_account');
    return [
      /* El acceso va primero y solo a quien le falta: es la alerta que explica
         todas las demás — sin cuenta enlazada no va a registrar nada nunca. */
      sinAcceso && {
        label: invitando ? 'Generando el enlace…' : 'Copiar su enlace de acceso',
        icon: Send,
        run: () => invitar(client),
      },
      { label: 'Programarle la rutina', icon: Layers, run: () => navigate(clientPath(client.id, 'rutina')) },
      { label: 'Su protocolo…', icon: Settings2, run: () => setAjustes(client.id) },
      null,
      row.paused
        ? {
            label: 'Reanudar',
            icon: Play,
            run: () => {
              setClientPaused(client.id, false);
              toast({ text: `${client.name} vuelve a contar.` });
            },
          }
        : { label: 'Pausar…', icon: Pause, run: () => setAjustes(client.id) },
      {
        label: 'Archivar',
        icon: Archive,
        danger: true,
        /* Sin «¿seguro?», como en el resto del producto: archivar no borra nada
           y se deshace desde la pestaña «Archivados». */
        run: () => {
          setClientArchived(client.id, true);
          toast({ text: `${client.name} archivado. Sigue entero en «Archivados».` });
        },
      },
    ];
  };

  /*
    ══ Dar de alta e invitar son el mismo gesto ═══════════════════════════════

    Eran dos viajes. Se creaba al cliente, el formulario se cerraba y no pasaba
    nada más: para invitarle había que encontrarlo en la lista, entrar, llegar
    hasta «Ficha» —la última del carril de siete— y bajar a «Acceso y baja». Seis
    pasos para lo que la propia bienvenida enseña como los pasos 1 y 3.

    Y es un camino que no se puede saltar: hasta que no le llega el enlace, el
    cliente no puede entrar, así que la mitad de la aplicación se queda sin usar
    sin que nada avise.

    Ahora el alta deja aquí mismo lo que viene después, con los dos botones
    puestos. Sigue estando en su ficha para quien vuelva más tarde.
  */
  const crear = async (datos) => {
    const res = await addClient(datos);
    if (res?.ok) setRecien(res.client);
    return res;
  };

  /* El aviso de la invitación aparece arriba; sin esto, quien la pide desde la
     parte de abajo de una lista larga no llega a verlo nunca. */
  const noticeRef = useRef(null);
  useEffect(() => {
    if (invite) traeALaVista(noticeRef.current, { block: 'center', behavior: 'smooth' });
  }, [invite]);

  /* Sin clientes no hay tablero que enseñar, pero sí hay algo que hacer — y el
     botón para hacerlo tiene que estar aquí. Antes esta pantalla se limitaba a
     decir que estaba vacía y mandaba a buscar el alta a otro sitio. */
  if (clients.length === 0) {
    return (
      <div className="stack">
        {alta && <NewClientForm onCreate={crear} onCancel={() => setAlta(false)} />}
        {!alta && (
          <EmptyState
            icon={UserPlus}
            title="Empieza dando de alta a tu primer cliente"
            message="En cuanto exista podrás programarle la rutina, su plan nutricional y seguir su evolución. Aquí verás lo que le falta cada semana."
            action={
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setAlta(true)}>
                <Plus size={15} /> Nuevo cliente
              </button>
            }
          />
        )}
        <ArchivedClients />
      </div>
    );
  }

  /* Si ningún cliente tiene un check-in cerrado de verdad, «responder check-ins»
     está aproximando, y hay que decirlo en lugar de fingir precisión.

     ── Pero solo cuando de verdad hay una avería ────────────────────────────
     La condición se cumple en TODA cuenta que aún no ha recibido su primer
     check-in, es decir, todas las nuevas — así que el aviso azul era lo primero
     que veía cada entrenador el primer día, para siempre, contando una
     imprecisión que no puede corregir y que no le pide nada. Un aviso que no se
     puede cerrar ni resolver deja de ser un aviso.

     Se queda el caso en que la entrega no está activa (la tabla falta de
     verdad), que sí es una avería y sí tiene remedio: escribirnos. */
  const approximate = visible.length > 0 && checkInsActivos === false && visible.every((r) => !r.review.exact);

  /* Qué columnas puede llenar ESTA cartera (la regla 1 de `FilaCliente`): las
     que nadie puede llenar no se dibujan, y una cartera recién estrenada ve la
     lista limpia de siempre. Se decide sobre lo VISIBLE: filtrar por un
     entrenador cuyos clientes aún no arrancaron limpia también las columnas. */
  const columnas = {
    semana: visible.some((r) => semanaDe(r) > 0),
    /* La condición era «dos pesajes o uno», porque con dos había chispa que
       dibujar aunque no hubiera cifra. Sin chispa, lo que llena la columna es
       la cifra y nada más. */
    peso: visible.some((r) => pesoDe(r, series.get(r.client.id) || []) != null),
    entreno: visible.some((r) => r.sinceTraining !== null),
  };

  /* Por qué se puede ordenar, dicho en la barra (`MandoDeOrden`).
     Son las MISMAS columnas y el mismo estado que la cabecera —lo que se elige
     aquí enciende su flecha allí—, con dos diferencias que son la razón de que
     esto exista: se ve sin apuntar con el ratón, y sigue estando cuando la
     columna se retira al estrecharse.

     La regla 1 de `FilaCliente` manda igual que en la tabla: se ofrece ordenar
     por lo que la cartera puede llenar. `Peso` con nadie pesado devolvería la
     misma lista y se leería como un mando roto.

     Cada sentido se nombra por lo que hace con ESTAS filas. «Descendente» dice
     cómo está implementado; «los que más llevan sin entrenar» dice qué vas a
     ver, que es lo que se está preguntando.

     ── Y por qué dos de ellos no se llaman como su columna ──────────────────
     Una cabecera nombra una COLUMNA y esto nombra un ORDEN, y la chapa los lee
     en voz alta: «Por cliente» no es lo que se está haciendo —se ordena por su
     nombre, no por él— y «Por entrenó» directamente no es español. Las otras
     tres sí coinciden, y coinciden porque ahí la palabra vale para las dos
     cosas. */
  const camposDeOrden = [
    { id: 'nombre', label: 'Nombre', sentidos: { asc: 'A → Z', desc: 'Z → A' } },
    {
      id: 'estado',
      label: 'Estado',
      /* `estadoDe` ordena por `rango`, y ahí el 0 es lo grave: ascendente es lo
         urgente primero, con la pausa siempre al final. */
      sentidos: { asc: 'lo urgente primero', desc: 'lo tranquilo primero' },
    },
    columnas.semana && {
      id: 'semana',
      label: 'Semana',
      num: true,
      sentidos: { asc: 'los que empiezan', desc: 'los más avanzados' },
    },
    columnas.entreno && {
      id: 'entreno',
      label: 'Último entreno',
      num: true,
      sentidos: { asc: 'los que acaban de entrenar', desc: 'los que más llevan sin entrenar' },
    },
    columnas.peso && {
      id: 'peso',
      label: 'Peso',
      num: true,
      sentidos: { asc: 'de menos a más kilos', desc: 'de más a menos kilos' },
    },
  ].filter(Boolean);

  return (
    /*
      ══ UNA HOJA, NO CUATRO COSAS PUESTAS UNA DEBAJO DE OTRA ═══════════════════

      Esto eran cuatro objetos sueltos flotando sobre la mesa: una banda de
      cabecera con su filete, un carril de chips en el aire, otro carril de
      etiquetas, y por fin la tabla dentro de su tarjeta. Cada uno con su propio
      aire alrededor y ninguno alineado con los demás — el veredicto del dueño
      fue exacto: «parece como si fueses metiendo cosas poco a poco».

      Y no era una impresión: son piezas que se añadieron una a una, cada una
      resolviendo lo suyo. El resultado no es una pantalla mal dibujada, es una
      pantalla sin dibujar.

      Ahora es UN objeto con bandas, que es como está montada la lista de
      Coachway: el nombre y los tramos arriba, las herramientas debajo, la tabla
      al pie, todo con el mismo sangrado. Se lee como una hoja de registro —que
      es lo que es— en vez de como un tablón.

      ── Y la hoja empieza donde empiezan todas ────────────────────────────────
      Segunda vuelta (7 sep): la hoja estaba bien montada por dentro y mal
      colocada por fuera. Su cabecera era una banda más de la pantalla, mientras
      que la del cliente es una CINTA del chasis —al canto de la hoja, con el
      raíl posado sobre el filete—, así que el titular saltaba de sitio al
      entrar en una persona y al volver. Ahora las dos son la misma pieza (ver
      la cinta, más abajo) y lo único que cambia al navegar es lo que dice.

      ── Y los controles bajan de talla ─────────────────────────────────────────
      El buscador y «Nuevo cliente» iban a tamaño de portada (40 px de alto, tipo
      base) contra una tabla que habla en `fs-sm`: los dos gritaban más que el
      título de la pantalla. En la barra de una lista, los controles son del
      tamaño de la lista.
    */
    <div className="stack cascada">
      <div className="cartera">
        {/* ══ LA CINTA: la misma que la del cliente ═══════════════════════════

            Esta cabecera era una banda propia, con su sangrado dentro de la
            columna de contenido y su título en otro peso. Al saltar de la lista
            a una persona, el titular cambiaba de sitio y de cuerpo: «están en
            distinta posición que resumen» (dueño, 7 sep).

            Ahora es la misma pieza que la cabecera del expediente
            (`.cliente-cab`, con la que comparte reglas en `chasis.css`): papel
            al canto de la hoja, identidad arriba —el nombre de la pantalla en
            el hueco donde estará el nombre de la persona— y el raíl posado
            sobre el filete, donde estarán sus secciones. Ir y volver deja de
            mover nada.

            Y el alta sube aquí: una pantalla tiene UNA acción primaria y su
            sitio es al lado de su nombre, igual que «Revisar semana» en la del
            cliente. «Tu protocolo» la acompaña como verbo de texto —es cómo
            trabajas, no una herramienta de la lista—, con el mismo tratamiento
            que «Ver como» en el expediente. */}
        <header className="cartera-cab">
          <div className="cartera-cab-in">
            {/* ── UNA sola línea: dónde estás, qué tramo miras y los verbos ──
                Los tramos vivían en su propio raíl debajo, y eso costaba una
                banda entera de altura para no decir nada más: la línea del
                titular era «Clientes» a la izquierda y los dos verbos a mil
                píxeles, con nada en medio. El raíl conserva su anatomía —posado
                sobre el filete, con la marca azul mordiéndolo—, que es lo que
                lo hace legible como navegación; lo único que cambia es que
                ahora ocupa el hueco que había.

                La misma anatomía la monta `BandaTaller`, así que la cartera y
                las cuatro listas del Taller siguen arrancando igual. La cinta
                del CLIENTE no cambia: allí el raíl son cinco DESTINOS a los que
                se va, no tramos de la lista que ya estás mirando. */}
            <div className="cartera-cab-linea">
              {/* El ancho, en cabeza y del lado por el que crece la hoja. Ver
                  `ui/Pliegue`. */}
              <Pliegue />
              <h1 className="cartera-cab-titulo">Clientes</h1>
              {/* La nube va con el título en las tres cintas de la casa, no en
                  la esquina de los verbos. Ver `ui/EstadoDeRed`. */}
              <Nube />

              <nav
                ref={carrilTramos}
                className="tabs tramos cartera-cab-tabs"
                role="tablist"
                aria-label="Tramos de la cartera"
              >
                <button
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={tramoVivo === 'activos'}
                  onClick={() => setTramo('activos')}
                >
                  Activos <span className="chip-count">{tramos.activos.length}</span>
                </button>
                {tramos.pendientes.length > 0 && (
                  <button
                    type="button"
                    role="tab"
                    className="tab"
                    aria-selected={tramoVivo === 'pendientes'}
                    onClick={() => setTramo('pendientes')}
                  >
                    Pendientes <span className="chip-count">{tramos.pendientes.length}</span>
                  </button>
                )}
                {tramos.pausa.length > 0 && (
                  <button
                    type="button"
                    role="tab"
                    className="tab"
                    aria-selected={tramoVivo === 'pausa'}
                    onClick={() => setTramo('pausa')}
                  >
                    En pausa <span className="chip-count">{tramos.pausa.length}</span>
                  </button>
                )}
                {archivedClients.length > 0 && (
                  <button
                    type="button"
                    role="tab"
                    className="tab"
                    aria-selected={tramoVivo === 'archivo'}
                    onClick={() => setTramo('archivo')}
                  >
                    Archivados <span className="chip-count">{archivedClients.length}</span>
                  </button>
                )}
                <span className="tabs-marca" aria-hidden="true" />
              </nav>

              <div className="cartera-cab-acciones">
                <button
                  type="button"
                  className="cab-accion"
                  title="Lo que se le pide a todos: módulos, check-in, alta y avisos"
                  onClick={() => navigate(PROTOCOL_HOME)}
                >
                  <SlidersHorizontal size={15} aria-hidden="true" />
                  <span>Tu protocolo</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setAlta((v) => !v)}
                >
                  <Plus size={15} /> Nuevo cliente
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* ══ EL CUERPO: todo lo demás, en la columna de la cinta ═════════════
            La barra, los avisos, la tabla y el pie sangran EXACTAMENTE lo que
            sangra el nombre de la pantalla: es la regla de la hoja —todas las
            bandas arrancan en la misma vertical— y, ahora que la cinta llega al
            canto, la que hace que la tabla no se lea como una pieza pegada. */}
        <div className="cartera-cuerpo">
          {/* ── Con qué se mira la lista ──────────────────────────────────────
              Buscar a la izquierda y las preguntas de la cartera a continuación,
              con su cifra: «¿a quién tengo que escribir hoy?» se contesta leyendo
              esta línea, sin abrir nada. A la derecha, el eje de etiquetas.

              Aquí estaba también «Nuevo cliente», y eran dos cosas distintas en
              la misma línea: con qué se mira la lista y qué se le hace a la
              cartera. El alta se fue a la cinta, con el nombre de la pantalla.

              Los chips solo salen con dos o más clientes —con uno, la lista ES la
              respuesta— y solo los que tienen a alguien dentro: un chip a cero es
              una promesa vacía. */}
          <div className="cartera-barra">
            {tramoVivo !== 'archivo' && (
              <>
                <div className="searchbox">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
                    className="input input-sm"
                    placeholder="Buscar cliente…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Buscar cliente"
                  />
                </div>

                {delTramo.length > 1 && filtros.length > 2 && (
                  <div className="rail" role="group" aria-label="Filtrar por estado">
                    {filtros.map((f) => {
                      const Icono = ICONO_FILTRO[f.id];
                      return (
                        <button
                          key={f.id}
                          type="button"
                          className="chip"
                          aria-pressed={filtro === f.id}
                          onClick={() => setFiltro(f.id)}
                        >
                          {Icono && <Icono size={13} aria-hidden="true" />}
                          {f.label}
                          <span className="chip-count">{f.count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            <div className="cartera-barra-fin">
              {/* ── Por qué se ordena ────────────────────────────────────────
                  Va ANTES que el eje de etiquetas y no después: esto no filtra
                  —no esconde a nadie—, así que se lee primero lo que cambia el
                  orden de la lista y después lo que cambia quién sale en ella.

                  Y va en chapa callada, sin encenderse en azul como se enciende
                  «Etiquetas» con un filtro puesto: el azul de la casa dice «hay
                  algo acotado». Ordenar no acota nada, y pintarlo igual haría
                  buscar un filtro que no existe. Lo que dice por qué está
                  ordenada es su propio rótulo.

                  Con un solo cliente no se dibuja: la lista ES la respuesta. */}
              {tramoVivo !== 'archivo' && delTramo.length > 1 && (
                <MandoDeOrden orden={orden} campos={camposDeOrden} defecto="Urgencia" />
              )}

              {/* La etiqueta se pregunta de vez en cuando y su lista crece sin
                  techo, así que se pliega en un selector —el mismo de las filas,
                  con los mismos discos de color— en vez de ocupar un carril
                  entero. Dice cuáles están puestas, y con varias dice cuántas: el
                  disco de una sola se reconoce, siete discos en un chip no.

                  No se cierra al elegir (`cierraAlElegir`): acotar por dos
                  etiquetas seguidas es un gesto, no dos. */}
              {tramoVivo !== 'archivo' && etiquetas.length > 0 && (
                <SelectorEtiquetas
                  vocabulario={etiquetas}
                  activas={tagsFiltro}
                  cierraAlElegir={false}
                  onAlternar={(tag) =>
                    setTagsFiltro((v) => (v.includes(tag) ? v.filter((t) => t !== tag) : [...v, tag]))
                  }
                  clase={`chip p-filtro-etiq${tagsFiltro.length > 0 ? ' is-on' : ''}`}
                  alineado="derecha"
                  ariaLabel="Filtrar por etiqueta"
                  contenido={
                    tagsFiltro.length === 1 ? (
                      <>
                        <span
                          className="tag-disco"
                          data-tono={tonoDe(tagsFiltro[0])}
                          aria-hidden="true"
                        />
                        {tagsFiltro[0]}
                      </>
                    ) : tagsFiltro.length > 1 ? (
                      <>
                        <Tag size={13} aria-hidden="true" />
                        {tagsFiltro.length} etiquetas
                      </>
                    ) : (
                      <>
                        <Tag size={13} aria-hidden="true" />
                        Etiquetas
                      </>
                    )
                  }
                />
              )}
            </div>
          </div>

          {/* ── El eje de equipo, cuando lo hay ───────────────────────────────
              Banda propia y no un grupo más de la barra: con cinco entrenadores,
              meterlo en la línea de los chips la parte en dos renglones y deja de
              leerse cuál filtra qué. */}
          {tramoVivo !== 'archivo' && showTrainers && (
            <div className="cartera-barra">
              <div className="rail" role="group" aria-label="Filtrar por entrenador">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={trainer === 'all'}
                  onClick={() => setTrainer('all')}
                >
                  Todo el equipo
                </button>
                {teamMembers
                  .filter((m) => m.role !== 'viewer')
                  .map((member) => (
                    <button
                      key={member.profileId}
                      type="button"
                      className="chip"
                      aria-pressed={trainer === member.profileId}
                      onClick={() => setTrainer(member.profileId)}
                    >
                      {memberName(member)}
                      <span className="chip-count">
                        {rows.filter((r) => r.client.assignedTo === member.profileId).length}
                      </span>
                    </button>
                  ))}
                {rows.some((r) => !r.client.assignedTo) && (
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={trainer === 'none'}
                    onClick={() => setTrainer('none')}
                  >
                    Sin asignar
                    <span className="chip-count">
                      {rows.filter((r) => !r.client.assignedTo).length}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Lo que se dice antes de la lista ──────────────────────────────
              El alta, los siguientes pasos del recién creado y los avisos, en una
              banda de la hoja y no en tarjetas sueltas encima: son cosas de ESTA
              lista, y flotando por delante rompían el objeto en pedazos otra vez.

              El aviso de la invitación se trae la vista (`noticeRef`): quien la
              pide desde el pie de una lista larga no vería nada, y el síntoma que
              reporta es «le doy y no hace nada» aunque el mensaje esté escrito
              dos pantallas más arriba. */}
          {(alta || recien || invite || approximate) && (
            <div className="cartera-avisos">
              {alta && <NewClientForm plain onCreate={crear} onCancel={() => setAlta(false)} />}

              {recien && (
                <Panel plain className="col gap-3">
                  <div className="row between wrap gap-2">
                    <SectionTitle icon={UserPlus}>{recien.name} ya está en tu cartera</SectionTitle>
                    <button
                      type="button"
                      className="btn btn-icon"
                      onClick={() => setRecien(null)}
                      aria-label="Ocultar los siguientes pasos"
                      title="Ocultar"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  <p className="t-sm t-secondary">
                    Mándale su enlace de acceso —hasta que no lo tenga no puede entrar ni apuntar
                    nada— y prográmale la primera semana.
                  </p>

                  <div className="row gap-2 wrap">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={invitando}
                      onClick={() => invitar(recien)}
                    >
                      <Send size={15} /> {invitando ? 'Generando…' : 'Copiar su enlace de acceso'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(clientPath(recien.id, 'rutina'))}
                    >
                      <Layers size={15} /> Programarle la rutina
                    </button>
                  </div>
                </Panel>
              )}

              {invite && (
                <div ref={noticeRef}>
                  {invite.ok ? (
                    <Notice tone={invite.copied ? 'success' : 'info'}>{inviteMessage(invite)}</Notice>
                  ) : (
                    <Notice tone="error">{invite.error}</Notice>
                  )}
                </div>
              )}

              {/* Se dice que la cifra es aproximada, y solo si es verdad se dice
                  POR QUÉ: la frase de «la entrega no está activa» solo sale cuando
                  la tabla de verdad falta (`checkInsActivos === false`), no cada
                  vez que una cuenta nueva aún no ha recibido su primer check-in. */}
              {approximate && (
                <Notice tone="info">
                  «Por revisar» se está deduciendo de los pesajes y las fotos de cada semana, así que
                  es una aproximación. La entrega de check-ins todavía no está activa en tu cuenta;
                  escríbenos desde Ajustes → Ayuda y la activamos.
                </Notice>
              )}
            </div>
          )}

          {tramoVivo === 'archivo' && (
            <div className="cartera-avisos">
              <ArchivedClients plain />
            </div>
          )}

          {/* LA PLANTILLA: la cartera como libro de registro. Una tabla de verdad
              —cabecera troquelada, filetes, numerales tabulares— porque esto ES
              una tabla: la señal de vida de cada persona en columnas que solo
              existen si la cartera puede llenarlas (el porqué, en `FilaCliente`).

              Aquí hubo un tablero de cuatro columnas, y después una bandeja de
              tareas. Las dos contestaban «¿qué hago ahora?», que es la pregunta de
              «Hoy» —la pantalla con la que se abre el día— y no la de esta. Ahora
              las tareas viven en «Hoy» y esto es lo que su nombre dice: tus
              clientes, en orden de urgencia, con lo que le pasa a cada uno al
              lado. Se busca a alguien y se entra. */}
          {tramoVivo !== 'archivo' && visible.length > 0 && (
            <div className="plantilla">
              <table>
                <thead>
                  <tr>
                    {seleccionable && (
                      <th scope="col" className="p-marca">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={visible.length > 0 && visible.every((r) => sel.has(r.client.id))}
                            onChange={() =>
                              setSel(
                                visible.every((r) => sel.has(r.client.id))
                                  ? new Set()
                                  : new Set(visible.map((r) => r.client.id))
                              )
                            }
                            aria-label="Seleccionar a todos los visibles"
                          />
                        </label>
                      </th>
                    )}
                    {/* Las columnas de DATO ordenan; las de gesto —etiquetas, lo
                        que lleva, el menú— no: no hay pregunta que se conteste
                        ordenando por un botón. */}
                    <ThOrden orden={orden} campo="nombre" clase="p-quien">
                      Cliente
                    </ThOrden>
                    <ThOrden orden={orden} campo="estado" clase="p-estado">
                      Estado
                    </ThOrden>
                    <th scope="col" className="p-etiq">
                      Etiquetas
                    </th>
                    {columnas.semana && (
                      <ThOrden orden={orden} campo="semana" num clase="p-semana">
                        Semana
                      </ThOrden>
                    )}
                    {columnas.entreno && (
                      <ThOrden orden={orden} campo="entreno" num clase="p-entreno">
                        Entrenó
                      </ThOrden>
                    )}
                    {columnas.peso && (
                      <ThOrden orden={orden} campo="peso" num clase="p-peso">
                        Peso
                      </ThOrden>
                    )}
                    <th scope="col" className="p-lleva">
                      Lleva
                    </th>
                    <th scope="col" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <FilaCliente
                      key={row.client.id}
                      row={row}
                      estado={estados.get(row.client.id)}
                      peso={pesoDe(row, series.get(row.client.id) || [])}
                      semana={semanaDe(row)}
                      columnas={columnas}
                      servicios={sectionsFor(LLEVA, clientProtocol(row.client.preferences))}
                      vocabulario={vocabulario}
                      acciones={accionesDe(row)}
                      marcado={sel.has(row.client.id)}
                      onMarcar={seleccionable ? () => marcar(row.client.id) : null}
                      onAbrirSeccion={(seccion) => navigate(clientPath(row.client.id, seccion))}
                      onPonerEtiqueta={(texto) => {
                        if (ponerEtiqueta(row.client, texto)) {
                          toast({
                            text: `«${texto.trim().slice(0, TAG_LIMITS.len)}» puesta a ${row.client.name}.`,
                          });
                        }
                      }}
                      onQuitarEtiqueta={(tag) => quitarEtiqueta(row.client, tag)}
                      trainer={showTrainers ? memberById.get(row.client.assignedTo) : null}
                      onOpen={() => open(row.client.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Un vacío con la salida puesta: lo que deja a nadie en la lista es
              una combinación de ejes —un chip, una etiqueta, media palabra en el
              buscador—, y desandarla uno a uno es adivinar cuál sobra. */}
          {tramoVivo !== 'archivo' && visible.length === 0 && (
            <div className="cartera-vacio">
              <TarjetaVacia>
                {hayFiltro ? (
                  <>
                    Ningún cliente coincide con lo que estás mirando.{' '}
                    <button type="button" className="link" onClick={limpiarFiltros}>
                      Quitar los filtros
                    </button>
                  </>
                ) : (
                  'Ningún cliente en este tramo.'
                )}
              </TarjetaVacia>
            </div>
          )}

          {/* ── El pie: cuántos estás viendo ──────────────────────────────────
              La línea «Viewing 2 of 2» de Coachway. Hace dos cosas: cierra la
              hoja por abajo —la tabla terminaba en el aire, y una lista sin pie
              parece cortada— y contesta la pregunta que deja cualquier filtro:
              «¿esto es toda mi cartera o solo un trozo?». Por eso solo dice la
              fracción cuando de verdad hay un trozo. */}
          {tramoVivo !== 'archivo' && delTramo.length > 0 && (
            <div className="cartera-pie">
              {visible.length === delTramo.length
                ? `${delTramo.length} ${delTramo.length === 1 ? 'cliente' : 'clientes'}`
                : `${visible.length} de ${delTramo.length} clientes`}
            </div>
          )}
        </div>
      </div>

      {/* La barra del lote flota al pie de la VISTA, así que vive fuera de la
          hoja: es una respuesta al gesto de marcar, no una banda de la lista.
          Solo existe mientras hay alguien marcado. */}
      {elegidos.length > 0 && (
        <AccionesEnLote
          filas={elegidos}
          onLimpiar={limpiar}
          onMandar={() => setMandando({ ids: elegidos.map((r) => r.client.id), que: 'form' })}
          onAviso={() => setMandando({ ids: elegidos.map((r) => r.client.id), que: 'aviso' })}
          onEtiquetar={etiquetarLote}
          onPausar={pausarLote}
          onReanudar={reanudarLote}
        />
      )}

      {/* Las capas de la cartera: lo que se manda y el protocolo de una
          persona. Van al final del árbol pero se pintan encima (Modal); cerrar
          devuelve a la lista tal cual estaba. */}
      {/* El asistente de mandar, con el «a quién» ya contestado por el gesto de
          marcar. Al cerrarlo la selección se deshace: lo mandado ya está, y
          dejar la marca puesta invita a mandarlo dos veces. */}
      {mandando && (
        <Suspense fallback={null}>
          <MandarAlgo
            preseleccion={mandando.ids}
            queInicial={mandando.que}
            onCerrar={() => {
              setMandando(null);
              limpiar();
            }}
          />
        </Suspense>
      )}
      <ClientSettingsSheet
        client={rows.find((r) => r.client.id === ajustes)?.client || null}
        open={Boolean(ajustes)}
        onClose={() => setAjustes(null)}
      />
    </div>
  );
};
