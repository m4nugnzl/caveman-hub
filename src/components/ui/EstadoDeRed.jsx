import { Cloud, CloudOff, CloudUpload } from 'lucide-react';

import { useActions, useData } from '@/context/AppContext';
import { useConexion } from '@/lib/conexion';
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
 * ── Y cómo: crece cuando tiene algo que decir ──────────────────────────────
 * Como la cobertura de un móvil, que son unas barras mudas hasta el día que se
 * cae y entonces sale la palabra.
 *
 *   · CONECTADA — un signo pequeño en tinta terciaria. Sin caja y sin palabra:
 *     la única frase que tiene que decir «todo va» es no decir ninguna. Se ve
 *     siempre, que es lo que hace que se aprenda qué aspecto tiene «bien»: un
 *     aviso que solo existe cuando falla no se ha visto NUNCA antes de la
 *     primera vez que hace falta, y esa primera vez —en un sótano y con trabajo
 *     a medias— es el peor momento para estrenar un dibujo nuevo.
 *   · SIN CONEXIÓN o ENVIANDO — chapa entera (`.badge`, la pieza con la que
 *     esta cinta ya dice «Renueva el 10 nov»), con su relleno y su palabra. Una
 *     nube tachada suelta podría ser cualquier cosa; con la palabra al lado no.
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
/** «hoy a las 13:42» si es de hoy, «8 sep, 21:10» si no. */
const cuando = (at) => {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const esDeHoy = d.toDateString() === new Date().toDateString();
  return esDeHoy ? `hoy a las ${timeOfDay(d)}` : dayMonthMaybeYear(d, { conHora: true });
};

export const Nube = () => {
  const enLinea = useConexion();
  const { enEspera, copiaLocal } = useData();

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
  const { Icono, clase, texto, dice } = !enLinea
    ? {
        Icono: CloudOff,
        clase: 'badge nube is-fuera',
        texto: 'Sin conexión',
        dice: 'Sin conexión: lo que escribas se guarda aquí y se envía solo al recuperar la señal.',
      }
    : enEspera > 0
      ? {
          Icono: CloudUpload,
          clase: 'badge nube is-mandando',
          texto: 'Enviando…',
          dice: 'Enviando lo que quedaba pendiente.',
        }
      : { Icono: Cloud, clase: 'nube is-bien', texto: '', dice: 'Conectado. Todo lo tuyo está guardado.' };

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
 * ══ Cuándo habla ═══════════════════════════════════════════════════════════
 *
 *   · NO SE GUARDÓ     — hay red y el servidor ha rechazado algo. Va la primera
 *                        porque es lo único de esta franja que no se arregla
 *                        solo, y es la única que trae un verbo: «Reintentar».
 *   · SIN CONEXIÓN     — y dice lo que de verdad hace falta saber: que se puede
 *                        seguir trabajando. Con la cifra de lo que espera, que
 *                        es lo único que puede preocupar a alguien.
 *   · MANDANDO         — hay red y quedaba cola. Dura un instante y existe para
 *                        que quien acaba de recuperar la señal VEA que se está
 *                        enviando en vez de tener que fiarse.
 *   · SOBRE UNA COPIA  — los datos que se miran son de la última vez que hubo
 *                        red (ver `lib/instantanea`). Nunca puede faltar: sobre
 *                        datos de ayer se programa una semana entera sin
 *                        enterarse.
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
  if (enLinea && fallosAlGuardar > 0) {
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
          {fallosAlGuardar === 1
            ? 'Un cambio no se ha guardado.'
            : `${fallosAlGuardar} cambios no se han guardado.`}{' '}
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

  if (enLinea && enEspera === 0 && !copiaLocal) return null;

  /* Lo que espera a que vuelva la red. Se dice con su cifra porque la pregunta
     de quien acaba de perder la señal es «¿cuánto llevo sin guardar?». */
  const cola =
    enEspera > 0
      ? `${enEspera} ${enEspera === 1 ? 'cambio espera' : 'cambios esperan'} a que vuelva la red.`
      : '';

  /* Y de qué fecha es lo que se está mirando, si no es de ahora. Va detrás: es
     contexto, no alarma — pero no se calla. */
  const copia = copiaLocal ? `Estás viendo tu copia, de ${cuando(copiaLocal.at)}.` : '';

  const { icono, texto, corto } = !enLinea
    ? {
        icono: CloudOff,
        texto: 'Sin conexión. Puedes seguir trabajando: lo que escribas se guarda aquí y se envía solo al recuperar la señal.',
        corto: 'Sin conexión. Lo que escribas se envía solo al volver la señal.',
      }
    : enEspera > 0
      ? {
          icono: CloudUpload,
          texto: 'Enviando lo que quedaba pendiente.',
          corto: 'Enviando lo pendiente.',
        }
      : {
          icono: Cloud,
          texto: 'Ya hay conexión. Esto es lo último que se descargó; se pondrá al día solo.',
          corto: 'Esto es lo último que se descargó.',
        };

  return (
    /*
      El mismo envoltorio que `PlanNotice`: la franja entra en la columna de
      contenido, no encima de ella. Dos avisos a la vez se apilan y ninguno
      pierde su sitio.
    */
    <div className="layout" style={{ paddingBottom: 0 }}>
      <Notice tone="info" icon={icono}>
        {/* La versión corta existe porque esta frase sale también en el móvil,
            donde la larga se envuelve en cuatro renglones sobre el trabajo. */}
        <span className="solo-escritorio">{[texto, cola, copia].filter(Boolean).join(' ')}</span>
        <span className="solo-movil">{[corto, cola].filter(Boolean).join(' ')}</span>
      </Notice>
    </div>
  );
};
