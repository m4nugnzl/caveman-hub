import { useEffect, useState } from 'react';
import { Cloud, CloudOff, CloudUpload } from 'lucide-react';

import { useActions, useData } from '@/context/AppContext';
import { useConexion } from '@/lib/conexion';
import { useVersionNueva } from '@/lib/version';
import { Notice } from '@/components/ui/primitives';
import { dayMonthMaybeYear, timeOfDay } from '@/lib/dates';

/**
 * EL ESTADO DE LA RED, en dos piezas y ninguna en la barra lateral.
 *
 * ══ El reparto ════════════════════════════════════════════════════════════
 *
 * Fue una sola —una nube en el pie de la barra— y hoy son dos, repartidas como
 * la cobertura y el aviso de un móvil:
 *
 *   · `Nube`        — el ESTADO, un signo pegado al título de la pantalla.
 *                     Siempre a la vista, también cuando todo va; muda mientras
 *                     todo va, con su palabra cuando no.
 *   · `EstadoDeRed` — la EXPLICACIÓN, y solo cuando hay algo que explicar.
 *
 * Las dos existen porque un aviso que solo aparece cuando falla no se ha visto
 * NUNCA antes de la primera vez que hace falta; y porque un estado permanente
 * que habla todo el rato se deja de leer a los dos días. El signo se queda, la
 * frase va y viene. El recorrido entero —cuatro sitios y dos formas— está en el
 * comentario de `Nube`.
 */

/**
 * LA NUBE: el signo, al lado del título, y callada mientras todo va.
 *
 * ══ Cuatro sitios y dos formas hasta acertar ════════════════════════════════
 *
 * Empezó como una nube pequeña en el pie de la barra lateral. De allí la
 * echaron —«no me gusta que esté en la barra lateral»— y en la mudanza se
 * convirtió en la franja de aquí abajo, que solo sale al fallar algo; entonces
 * faltó el icono —«¿dónde está la nube? debería verse»—. Volvió a la esquina de
 * los verbos como icono pelado y no se entendía —«está un poco escondida»—, así
 * que se vistió de CHAPA con su palabra. Y la chapa tampoco: «el icono de la
 * nube no termina de convencerme, se le debería dar una vuelta o recolocarlo;
 * en el caso de Efort es así» —y en Efort es un signo pequeño y mudo pegado al
 * nombre—.
 *
 * Las cuatro quejas dicen lo mismo visto por sus cuatro caras: el signo tiene
 * que verse SIEMPRE, no tiene que hacer ruido cuando no pasa nada, y no puede
 * competir con lo que sí es del cliente. «Conectado» escrito en una chapa, en
 * la esquina donde están el cobro y los verbos, es la forma más ruidosa posible
 * del hecho menos noticiable del día: dos palabras permanentes que ya se leyó
 * todo el mundo la primera semana.
 *
 * ── Dónde: pegada al título ────────────────────────────────────────────────
 * Al lado del nombre del cliente o de la pantalla, no en la esquina de las
 * acciones. Es el sitio de Efort y es el de Google Docs —el título y, detrás,
 * si esto está guardado—: lo que dice la nube es de qué se fía lo que estás
 * mirando, así que va con lo que estás mirando y no con lo que puedes hacer.
 *
 * ── Y cómo: lo dice, y luego se recoge ─────────────────────────────────────
 * Como la cobertura de un móvil, que son unas barras mudas hasta el día que se
 * cae y entonces sale la palabra. Y como el móvil, la palabra no se queda.
 *
 *   · CONECTADA — un signo pequeño en tinta terciaria. Sin caja y sin palabra:
 *     la única frase que tiene que decir «todo va» es no decir ninguna. Se ve
 *     siempre, que es lo que hace que se aprenda qué aspecto tiene «bien»: un
 *     aviso que solo existe cuando falla no se ha visto NUNCA antes de la
 *     primera vez que hace falta, y esa primera vez —en un sótano y con trabajo
 *     a medias— es el peor momento para estrenar un dibujo nuevo.
 *   · RECIÉN CAÍDA — chapa entera (`.badge`, la pieza con la que esta cinta ya
 *     dice «Renueva el 10 nov»), con su relleno y su palabra. Seis segundos: los
 *     que hacen falta para que te enteres sin buscarlo.
 *   · YA ASUMIDA — la nube tachada sola, sin caja, pero en TINTA PLENA. Porque
 *     una nube tachada suelta podría ser cualquier cosa el primer día, pero no
 *     después de habértelo dicho con todas las letras hace un momento: el dibujo
 *     ya está aprendido y la palabra pasa a ser ruido —«sin conexión, sin
 *     conexión, sin conexión» durante toda la hora que estés en el sótano—. La
 *     palabra sigue en el `title` y en el lector de pantalla, que son los dos
 *     sitios donde no estorba, y vuelve entera la próxima vez que se caiga: cada
 *     corte es una noticia nueva.
 *   · ENVIANDO — chapa con su palabra mientras dure, que dura un instante.
 *
 * Lo que separa «conectada» de «ya asumida» no es la caja ni la palabra, es el
 * PESO de la tinta: terciaria contra plena. El mismo recurso con el que la barra
 * marca el destino activo.
 *
 * El porqué de que aquí no haya ámbar ni rojo, en `controles.css`: por la ley
 * del color de la casa el semáforo JUZGA, y quedarse sin cobertura no es un
 * suspenso que ponerle a nadie. Lo que cambia es el PESO.
 *
 * ── Y la franja no dice lo mismo ───────────────────────────────────────────
 * La nube es el ESTADO; la franja de abajo es la EXPLICACIÓN, y solo cuando hay
 * algo que explicar: qué pasa, que puedes seguir trabajando y cuánto queda por
 * mandar.
 */
/*
  Que la explicación de la franja ya se leyó. En la SESIÓN de la pestaña y no en
  el estado de React —la franja se monta en tres sitios y se desmonta al navegar,
  así que un `useState` suelto la traería de vuelta en cada pantalla— y no en
  `localStorage` —quien vuelve mañana al gimnasio con el móvil en la mano merece
  que se lo recuerden una vez—.
*/
const CLAVE_EXPLICACION = 'red:explicacion-leida';

const seLeyoLaExplicacion = () => {
  try {
    return sessionStorage.getItem(CLAVE_EXPLICACION) === '1';
  } catch {
    /* Sin almacenamiento, la explicación sale siempre: es el lado seguro. */
    return false;
  }
};

/** «hoy a las 13:42» si es de hoy, «8 sep, 21:10» si no. */
const cuando = (at) => {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const esDeHoy = d.toDateString() === new Date().toDateString();
  return esDeHoy ? `hoy a las ${timeOfDay(d)}` : dayMonthMaybeYear(d, { conHora: true });
};

/* Lo que tarda la chapa en recogerse. Seis segundos: menos no da tiempo a que
   levantes la vista de lo que estabas escribiendo, y más ya es una chapa que se
   queda. */
const ANUNCIO_MS = 6000;

/*
  Lo que se le da a una carga con red antes de dar la copia por ATASCADA.

  Con red, estar sobre la copia casi siempre es un instante: la carga tardó más
  de la cuenta (`ESPERA_DE_CARGA`, 3,5 s), se abrió con la foto para no dejar la
  pantalla en blanco, y la carga de verdad llega detrás y la sustituye. Contarlo
  en ese hueco es un cartel que aparece y se va solo en cada arranque lento —
  ruido sobre algo que ya se está arreglando, y encima con una frase que no dice
  nada que se pueda hacer.

  Doce segundos es bastante más de lo que tarda cualquier carga que vaya a
  llegar. Si a los doce segundos la copia sigue puesta, ya no es un arranque
  lento: es una carga que no ha vuelto, y entonces sí hay algo que decir y algo
  que hacer.
*/
const ESPERA_DE_LA_COPIA = 12000;

/* Que ESTE corte ya se anunció, fuera de React a propósito: la nube se monta al
   lado del título de cada pantalla, así que se desmonta y se vuelve a montar al
   navegar. En estado del componente, el cartel reaparecería en cada pantalla
   que abrieras durante el corte, que es justo lo que se está quitando. Se
   rearma al volver la señal. */
let anuncioHecho = false;

export const Nube = () => {
  const enLinea = useConexion();
  const { enEspera, copiaLocal } = useData();
  const [anunciando, setAnunciando] = useState(false);

  /*
    El corte se anuncia una vez por corte. Al volver la señal se rearma, porque
    la siguiente caída vuelve a ser noticia; mientras dure, la nube tachada sola
    basta. Montarse ya sin red cuenta como caída: quien abre la aplicación en el
    sótano tiene que enterarse igual.
  */
  useEffect(() => {
    if (enLinea) {
      anuncioHecho = false;
      setAnunciando(false);
      return undefined;
    }
    if (anuncioHecho) return undefined;
    setAnunciando(true);
    const reloj = setTimeout(() => {
      anuncioHecho = true;
      setAnunciando(false);
    }, ANUNCIO_MS);
    return () => clearTimeout(reloj);
  }, [enLinea]);

  const copia = copiaLocal ? ` Estás viendo tu copia, de ${cuando(copiaLocal.at)}.` : '';
  const cola = enEspera > 0 ? ` ${enEspera} ${enEspera === 1 ? 'cambio espera' : 'cambios esperan'}.` : '';

  /*
    «Conectado» y no «Todo guardado»: lo que esta pieza sabe es si hay línea con
    el servidor y qué queda en la cola, no si el formulario que tienes delante
    está confirmado —de eso habla el indicador de cada pantalla
    (`SaveIndicator`)—. Prometer «guardado» sobre algo que no se mira sería
    mentir justo en la esquina que existe para dar confianza.

    Y de lo RECHAZADO habla la franja de aquí abajo, que en ese caso sale sobre
    el contenido: un signo mudo pegado al título no basta para algo que hay que
    volver a mandar a mano.

    `texto` sale a la pantalla solo cuando pasa algo; conectada, la palabra vive
    en el título y en el lector de pantalla, que son los dos sitios donde no
    estorba.
  */
  const { Icono, estado, texto, dice } = !enLinea
    ? {
        Icono: CloudOff,
        estado: 'is-fuera',
        /* La palabra, solo mientras es noticia. Después, la nube tachada sola:
           ver el comentario de arriba. */
        texto: anunciando ? 'Sin conexión' : '',
        dice: 'Sin conexión: lo que escribas se guarda aquí y se envía solo al recuperar la señal.',
      }
    : enEspera > 0
      ? {
          Icono: CloudUpload,
          estado: 'is-mandando',
          texto: 'Enviando…',
          dice: 'Enviando lo que quedaba pendiente.',
        }
      : { Icono: Cloud, estado: 'is-bien', texto: '', dice: 'Conectado. Todo lo tuyo está guardado.' };

  /* La chapa la trae la PALABRA, no el estado: recogida, la nube tachada es un
     signo pelado como el de «conectado», y lo que las separa es la tinta. */
  const clase = `${texto ? 'badge ' : ''}nube ${estado}`;

  return (
    <span className={clase} role="status" title={`${dice}${cola}${copia}`}>
      <Icono size={texto ? 13 : 15} aria-hidden="true" />
      {texto}
      {/* La frase larga, para quien no ve el signo. Callada es lo ÚNICO que
          dice qué es esto, así que aquí no es un matiz: es el rótulo. */}
      <span className="sr-only">{texto ? '. ' : ''}{dice}</span>
    </span>
  );
};


/**
 * LA FRANJA: qué pasa, y qué puedes hacer mientras tanto.
 *
 * ══ La franja NO repite el titular ═════════════════════════════════════════
 *
 * Decía «Sin conexión. Puedes seguir trabajando: …» a dos dedos de una chapa
 * que ya dice «Sin conexión», y el dueño lo vio al primer vistazo: las mismas
 * dos palabras dos veces en la misma pantalla, una de ellas en una franja del
 * ancho del contenido. La nube pone el TITULAR y no lo pone nadie más; aquí
 * empieza directamente por lo que la nube no cabe a decir —que puedes seguir
 * trabajando— y por las cifras.
 *
 * Y la explicación se puede QUITAR. Es una frase que enseña algo: se lee una
 * vez y a la tercera es mobiliario (la ley del reposo). La equis la retira para
 * el resto de la sesión —no hasta que vuelva la señal: en un sótano se pierde y
 * se recupera diez veces en una hora, y una frase ya leída no puede volver diez
 * veces—. Lo que NO se puede quitar es lo que tiene consecuencias: la cola y la
 * copia se quedan, sin equis. Retirada la explicación y sin nada pendiente, la
 * franja desaparece entera y queda solo la nube, que es lo que el dueño pedía.
 *
 * ══ Cuándo habla ═══════════════════════════════════════════════════════════
 *
 *   · VERSIÓN NUEVA    — se ha publicado otra y esta ya no guarda el programa
 *                        (`lib/version`). Va antes que todo: los rechazos que
 *                        vengan después son suyos, y lo que los arregla es
 *                        recargar, no reintentar.
 *   · NO SE GUARDÓ     — hay red y el servidor ha rechazado algo. Va la primera
 *                        porque es lo único de esta franja que no se arregla
 *                        solo, y es la única que trae un verbo: «Reintentar».
 *   · SIN CONEXIÓN     — dice lo que de verdad hace falta saber: que se puede
 *                        seguir trabajando. Una vez, y con equis.
 *   · MANDANDO         — hay red y quedaba cola. Dura un instante y ya no dice
 *                        «Enviando» —eso es la nube—: dice CUÁNTO, que es lo
 *                        único que la chapa no cabe a contar.
 *   · SOBRE UNA COPIA  — los datos que se miran son de la última vez que hubo
 *                        red (ver `lib/instantanea`). SIN RED nunca puede
 *                        faltar: sobre datos de ayer se programa una semana
 *                        entera sin enterarse. Tampoco en el móvil, donde antes
 *                        se caía.
 *                        CON RED se calla durante `ESPERA_DE_LA_COPIA`, porque
 *                        ahí la copia es el hueco de un arranque lento y la
 *                        carga de verdad viene detrás: anunciarlo era un cartel
 *                        que salía y se iba solo, diciendo además la única cosa
 *                        que no hace falta contar —que se arregla sola—. Si
 *                        sigue puesta pasado ese rato, la carga no ha vuelto: ya
 *                        no es contexto, es una avería, y sale con su verbo.
 *   · CONECTADA Y AL DÍA — nada. Ni un píxel: para eso está la nube.
 *
 * ── Dónde se monta ─────────────────────────────────────────────────────────
 * Dos veces a propósito: `CoachLayout` la mete DENTRO de la columna de
 * contenido —montada por encima del chasis empujaba la barra lateral entera
 * hacia abajo— y `App` la pone en el portal y el móvil, donde la página empieza
 * justo debajo de la cabecera. Es la misma pieza y el mismo sitio que el aviso
 * del plan (`PlanNotice`), que ya resolvió esta discusión en esta casa: «una
 * franja permanente se deja de ver a los dos días».
 *
 * ── El tono ────────────────────────────────────────────────────────────────
 * `info` y no `warn`: por la ley del color de la casa, el semáforo JUZGA, y
 * quedarse sin cobertura no es un suspenso que ponerle a nadie. El signo sí es
 * la nube —lo que se reconoce sin leer—, que es para lo que `Notice` acepta uno
 * propio.
 */
export const EstadoDeRed = () => {
  const enLinea = useConexion();
  const { enEspera, fallosAlGuardar, copiaLocal } = useData();
  const { reintentarLoFallido } = useActions();
  const versionNueva = useVersionNueva();
  const [explicacionLeida, setExplicacionLeida] = useState(seLeyoLaExplicacion);

  /*
    Si la copia lleva puesta, CON RED, más de lo que tarda cualquier carga que
    vaya a llegar. Ver `ESPERA_DE_LA_COPIA`. El reloj se rearma con cada copia
    nueva y se apaga en cuanto la carga la sustituye (`copiaLocal` a `null`), así
    que un arranque lento no llega a enseñar nada.
  */
  const [copiaAtascada, setCopiaAtascada] = useState(false);

  useEffect(() => {
    setCopiaAtascada(false);
    if (!copiaLocal || !enLinea) return undefined;
    const reloj = setTimeout(() => setCopiaAtascada(true), ESPERA_DE_LA_COPIA);
    return () => clearTimeout(reloj);
  }, [copiaLocal, enLinea]);

  const retirarExplicacion = () => {
    setExplicacionLeida(true);
    try {
      sessionStorage.setItem(CLAVE_EXPLICACION, '1');
    } catch (e) {
      /* Modo privado o almacenamiento bloqueado: la equis sigue funcionando, lo
         único que se pierde es que lo recuerde al cambiar de pantalla. */
      console.warn('No se pudo recordar que el aviso de red ya se había leído:', e);
    }
  };

  /*
    ══ LO RECHAZADO VA PRIMERO, y por qué vive aquí ═══════════════════════════

    Este caso era una chapa ámbar —«Cambios sin confirmar»— en la esquina de
    `HeaderActions`, que en el escritorio del entrenador cae en el PIE DE LA
    BARRA, donde nadie la puso: `CoachLayout` monta esa pieza entera para
    reaprovechar la campana y la cuenta, y la chapa viajó de polizón. Tenía dos
    averías además de la de sitio. Miraba `hasUnsavedChanges`, que incluye
    `saving`, y la cola emite `saving` desde la primera pulsación: se encendía al
    TECLEAR, no al fallar, y un aviso de «puedes perder trabajo» que sale cuando
    no pasa nada deja de leerse a los dos días. Y era ámbar en el chasis, que por
    la ley del color de la casa es un suspenso, cuando lo que hay es una avería
    del sistema.

    Aquí dice lo que hay que saber —qué pasó y qué hacer— en la pieza que ya
    existe para explicar, en la columna de contenido y en las tres monturas. Va
    por delante de la falta de red porque es lo único de esta franja que NO se
    arregla solo: sin cobertura se envía al volver la señal, pero un guardado que
    el servidor ya ha mirado y ha rechazado se queda ahí hasta que alguien lo
    mande otra vez.

    Sin red no se dice: ahí no hay rechazo, hay espera, y eso ya lo cuenta la
    rama de abajo con su cifra. Ver `lib/dbErrors`.
  */
  if (versionNueva) {
    return (
      <div className="layout" style={{ paddingBottom: 0 }}>
        <Notice
          tone="info"
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
              Recargar
            </button>
          }
        >
          Hay una versión nueva.{' '}
          <span className="solo-escritorio">Lo que cambies en un programa se guarda al recargar.</span>
        </Notice>
      </div>
    );
  }

  if (enLinea && fallosAlGuardar.total > 0) {
    return (
      <div className="layout" style={{ paddingBottom: 0 }}>
        <Notice
          tone="error"
          action={
            <button type="button" className="btn btn-danger btn-sm" onClick={reintentarLoFallido}>
              Reintentar
            </button>
          }
        >
          {/* Con la misma palabra que la pantalla de debajo: si todo son
              series, «serie» —una por serie, no por campo—. Ver `contarFallos`. */}
          {fallosAlGuardar.otros === 0
            ? fallosAlGuardar.series === 1
              ? 'Una serie no se ha guardado.'
              : `${fallosAlGuardar.series} series no se han guardado.`
            : fallosAlGuardar.total === 1
              ? 'Un cambio no se ha guardado.'
              : `${fallosAlGuardar.total} cambios no se han guardado.`}{' '}
          {/* El detalle del error lo lleva el indicador de la pantalla donde se
              escribió (`SaveIndicator`): aquí no se sabe cuál de las claves era
              ni de qué hablaba, y un mensaje de Postgres suelto en una franja
              global no le dice nada a nadie. */}
          <span className="solo-escritorio">
            Sigue aquí: vuelve a mandarlo o abre la pantalla donde lo escribiste.
          </span>
        </Notice>
      </div>
    );
  }

  /* La copia solo se cuenta cuando cambia algo para quien mira: sin red siempre,
     y con red únicamente si la carga no ha vuelto. Ver `ESPERA_DE_LA_COPIA`. */
  const hablaDeLaCopia = Boolean(copiaLocal) && (!enLinea || copiaAtascada);

  if (enLinea && enEspera === 0 && !hablaDeLaCopia) return null;

  /* LA EXPLICACIÓN: lo único que la nube no cabe a decir, y lo único que se
     puede retirar. Sin el «Sin conexión» del principio, que ya está escrito a
     dos dedos de aquí, en la chapa. */
  const explicacion =
    !enLinea && !explicacionLeida
      ? {
          largo: 'Puedes seguir trabajando: lo que escribas se guarda aquí y se envía solo al recuperar la señal.',
          corto: 'Lo que escribas se envía solo al volver la señal.',
        }
      : null;

  /* LA CIFRA. Sin red, la pregunta de quien acaba de perder la señal es «¿cuánto
     llevo sin guardar?»; con red, lo que hay es una cuenta atrás. Y decía «a que
     vuelva la red» en los dos casos, también mientras se estaba enviando. */
  const cola =
    enEspera === 0
      ? ''
      : !enLinea
        ? `${enEspera} ${enEspera === 1 ? 'cambio espera' : 'cambios esperan'} a que vuelva la red.`
        : `${enEspera === 1 ? 'Un cambio se está enviando' : `${enEspera} cambios se están enviando`}.`;

  /*
    Y de qué fecha es lo que se está mirando, si no es de ahora. Va detrás: sin
    red es contexto —no alarma— pero no se calla, tampoco en el móvil, donde
    antes se quedaba fuera del renglón corto.

    Con red ya no es contexto: si ha llegado hasta aquí, la carga no ha vuelto.
    Decía «Se pondrá al día sola», que es a la vez lo único que no hace falta
    contar y, justo en este caso, lo único que no es verdad.
  */
  const copia = !hablaDeLaCopia
    ? ''
    : enLinea
      ? `No hemos podido traer tus datos: estás viendo tu copia, de ${cuando(copiaLocal.at)}.`
      : `Estás viendo tu copia, de ${cuando(copiaLocal.at)}.`;
  const copiaCorta = !hablaDeLaCopia
    ? ''
    : enLinea
      ? `Sin actualizar: tu copia, de ${cuando(copiaLocal.at)}.`
      : `Tu copia, de ${cuando(copiaLocal.at)}.`;

  const largo = [explicacion?.largo, cola, copia].filter(Boolean).join(' ');
  const corto = [explicacion?.corto, cola, copiaCorta].filter(Boolean).join(' ');

  /* Retirada la explicación y sin nada que contar, no queda franja: la nube se
     basta. */
  if (!largo) return null;

  const icono = !enLinea ? CloudOff : enEspera > 0 ? CloudUpload : Cloud;

  return (
    /*
      El mismo envoltorio que `PlanNotice`: la franja entra en la columna de
      contenido, no encima de ella. Dos avisos a la vez se apilan y ninguno
      pierde su sitio.
    */
    <div className="layout" style={{ paddingBottom: 0 }}>
      <Notice
        tone="info"
        icon={icono}
        onClose={explicacion ? retirarExplicacion : undefined}
        /*
          El verbo, solo en el caso que no se arregla solo. Recargar y no «volver
          a intentar la carga»: lo que hay que rehacer es el arranque entero
          —sesión, cartera y los tres bloques—, y esa secuencia vive en el efecto
          de montaje de `AppContext`. Un botón que llamara a media carga dejaría
          media aplicación vieja y media nueva, que es peor que la copia entera.
        */
        action={
          hablaDeLaCopia && enLinea ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => window.location.reload()}
            >
              Recargar
            </button>
          ) : undefined
        }
      >
        {/* La versión corta existe porque esta frase sale también en el móvil,
            donde la larga se envuelve en cuatro renglones sobre el trabajo. */}
        <span className="solo-escritorio">{largo}</span>
        <span className="solo-movil">{corto}</span>
      </Notice>
    </div>
  );
};
