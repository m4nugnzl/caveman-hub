import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  HardDriveDownload,
  Gauge,
  Layers,
  LifeBuoy,
  Plug,
  Ruler,
  Palette,
  Salad,
  Sunrise,
  Users,
  UsersRound,
} from 'lucide-react';

/**
 * Las rutas de la aplicación, en un solo sitio.
 *
 * ── Por qué hay rutas de verdad ─────────────────────────────────────────────
 * Hasta ahora todo vivía en `localhost/`: la pestaña activa era un `useState`, y
 * eso tenía cuatro consecuencias que se notan en el uso diario:
 *
 *   · Recargar la página te devolvía al principio y perdías dónde estabas.
 *   · El botón atrás del navegador salía de la aplicación entera.
 *   · No se podía compartir ni guardar en marcadores «la rutina de Marta».
 *   · Y en el móvil, el gesto de volver atrás cerraba la app.
 *
 * ── Por qué la navegación tiene DOS niveles ─────────────────────────────────
 * Con todo en una sola barra había once pestañas seguidas, mezclando cosas que no
 * están al mismo nivel: «Cartera» habla de todos los clientes, «Rutina» de uno, y
 * «Integraciones» no habla de clientes en absoluto. Once opciones planas obligan a
 * leerlas todas cada vez, y en el móvil se salen de la pantalla.
 *
 * Ahora hay tres planos, y dos de ellos nunca coinciden:
 *
 *   1. **Primario** (siempre visible): Cartera · Clientes · Ajustes. Tres.
 *   2. **Del cliente** (solo dentro de `/c/:id/…`): sus siete secciones, con su
 *      nombre delante para que se vea de quién estás hablando.
 *   3. **De ajustes** (solo dentro de `/ajustes/…`): equipo, integraciones y lo
 *      que venga.
 *
 * Así en pantalla nunca hay más de diez opciones y todas pertenecen al mismo
 * plano.
 *
 * ── El cliente activo vive en la URL ────────────────────────────────────────
 * `/c/:clientId/rutina` es la fuente de verdad de con quién trabajas. El contexto
 * sigue guardando `selectedClientId` porque medio proyecto lo lee, pero **sigue** a
 * la ruta, no manda sobre ella. Dos fuentes de verdad para lo mismo es de donde
 * salen los bugs de «selección rancia».
 */

/**
 * Nivel 1: lo que está siempre visible. Dos entradas y ni una más.
 *
 * ── Por qué «Hoy» va primero ────────────────────────────────────────────────
 * Porque es la primera pregunta de la mañana. «Clientes» contesta «¿en qué estado
 * está cada uno?» —un corte transversal, ordenado por gravedad— y eso es lo que
 * se necesita cuando ya sabes que hay algo que atender. Pero antes de eso está
 * «¿qué ha pasado desde ayer?», y esa no la contestaba nadie: los entrenos, los
 * pesajes y las fotos tenían fecha desde el principio y solo se podían ver
 * entrando cliente a cliente.
 *
 * Las dos son necesarias y ninguna repite a la otra: «Hoy» cuenta lo que HA
 * OCURRIDO, «Clientes» lo que FALTA.
 *
 * ── Por qué eran tres y ahora son dos ───────────────────────────────────────
 * Había «Cartera» y «Clientes»: dos entradas que listaban a las mismas personas.
 * En una el clic entraba al cliente; en la otra desplegaba administración. Un
 * entrenador daba de alta a alguien en «Clientes», pulsaba sobre él esperando
 * entrar, y se encontraba un panel de exportar datos — de ahí la pregunta «¿dónde
 * hago la rutina?». Ahora hay una lista, el clic entra, y la administración de
 * cada cliente es una sección suya más (`/c/:id/ficha`).
 */
export const COACH_PRIMARY = [
  { path: '/hoy', label: 'Hoy', icon: Sunrise },
  { path: '/clientes', label: 'Clientes', icon: Users },
];

/** Nivel 2: las secciones de UN cliente. Cuelgan de `/c/:clientId/`. */
export const COACH_CLIENT = [
  /*
    «Progreso» era dos entradas —Resumen y Analítica— y las dos contestan la misma
    pregunta con distinto detalle. Eso obligaba a elegir cuál abrir antes de saber
    qué se quería mirar. Ahora es una sección con dos niveles: se entra por el
    resumen y se pasa al análisis desde dentro (`analytics/ProgressLayout.jsx`).
    La ruta `/analitica` sigue existiendo, así que los enlaces guardados valen.
  */
  { path: 'resumen', label: 'Progreso', icon: Gauge, also: ['analitica'] },
  /*
    «Revisión» era dos entradas —Fotos y Check-ins— y las dos son la misma tarea:
    mirar lo que ha subido esta semana y contestarle. Estaban separadas porque son
    dos tablas distintas, que es dibujar el menú desde el modelo de datos.

    La prueba de que el corte estaba mal es que hubo que inventar un MODO
    (`ReviewSession`) con barra flotante para poder terminar la tarea cruzando de
    una sección a otra. Ver `components/review/ReviewLayout.jsx`.
  */
  /*
    ── Y por qué va DESPUÉS de rutina y nutrición ────────────────────────────
    Porque el orden del carril es el del trabajo, y programar viene antes de
    revisar: no se puede revisar una semana que no se ha programado. Revisión
    iba delante por ser lo más frecuente, pero la frecuencia no es el orden —
    para eso está «Hoy», que es por donde se entra a revisar de verdad.
  */
  { path: 'rutina', label: 'Rutina', icon: Layers },
  { path: 'nutricion', label: 'Nutrición', icon: Salad },
  { path: 'revision', label: 'Revisión', icon: Ruler, also: ['revision/fotos'] },
  { path: 'calendario', label: 'Calendario', icon: CalendarDays },
  /*
    La ficha va la última del carril a propósito. Sus datos, su acceso al portal,
    archivarle y exportar lo suyo son cosas de cuando alguien ENTRA o SALE; las
    seis de delante son con las que se trabaja cada semana. Pero está en el mismo
    carril que ellas porque habla del mismo cliente, y tenerla fuera —que es de
    donde viene— obligaba a salirse de la persona para tocar sus datos.
  */
  { path: 'ficha', label: 'Ficha', icon: FileText },
];

/**
 * Nivel 3: ajustes.
 *
 * Aquí va lo que se configura una vez y no se toca a diario. Sacarlo del nivel
 * primario es lo que permite que ese tenga tres entradas: el equipo y las
 * integraciones no son sitios donde trabajar, son sitios donde dejar algo puesto.
 */
export const SETTINGS_SECTIONS = [
  {
    path: 'protocolo',
    label: 'Protocolo',
    icon: ClipboardList,
    hint: 'Qué le pides a tus clientes y qué ve cada uno',
  },
  { path: 'apariencia', label: 'Apariencia', icon: Palette, hint: 'Tema claro u oscuro' },
  {
    path: 'integraciones',
    label: 'Integraciones',
    icon: Plug,
    hint: 'Conecta Notion, Stripe y lo que venga',
  },
  {
    path: 'copia',
    label: 'Copia de seguridad',
    icon: HardDriveDownload,
    hint: 'Llévate todo lo que guarda la aplicación',
  },
  {
    path: 'equipo',
    label: 'Equipo',
    icon: UsersRound,
    hint: 'Entrenadores, roles y reparto de clientes',
  },
  {
    path: 'plan',
    label: 'Plan',
    icon: CreditCard,
    hint: 'Tu suscripción y hasta dónde llega',
  },
  /*
    Ayuda va la última y dentro de Ajustes, no en el nivel primario.

    No porque importe poco —es lo que evita que alguien atascado se vaya— sino
    porque se busca cuando hace falta y no se visita a diario. El nivel primario
    son tres entradas a propósito (Hoy, Cartera, Clientes) y meter aquí una cuarta
    que se usa una vez al mes le quitaría sitio a las que se usan cada día.
  */
  {
    path: 'ayuda',
    label: 'Ayuda',
    icon: LifeBuoy,
    hint: 'Escríbenos y sigue tus conversaciones',
  },
];

/**
 * Secciones del portal del cliente. Cuelgan de `/mi/`.
 *
 * ── El orden es el del USO, no el de la aplicación ──────────────────────────
 * Estaban en el mismo orden que las del entrenador, con «Analítica» en segundo
 * lugar. Eso tiene sentido para quien programa —mira el progreso y luego toca la
 * rutina— y ninguno para quien entrena: un cliente abre esto en el gimnasio para
 * apuntar lo que acaba de levantar, para mirar qué le toca comer y para meter su
 * pesaje. La analítica y el calendario los abre de vez en cuando.
 *
 * Ese orden pasó a importar de verdad cuando el móvil dejó de navegar con un
 * carril que se arrastra y pasó a tener barra inferior: ahora las CUATRO PRIMERAS
 * son las que se ven siempre, y el resto queda detrás de «Más». La lista deja de
 * ser una enumeración y es una decisión de producto.
 *
 * `short` es la etiqueta de la barra inferior. «Mis check-ins» no cabe en un
 * destino de 78 px, y abreviar en el componente significaría cortar por caracteres
 * y acabar con «Mis che…».
 */
export const CLIENT_SECTIONS = [
  /*
    «Hoy» va la primera porque es la única que contesta la pregunta con la que se
    abre la aplicación: ¿hay algo para mí y qué me toca? Las demás son sitios
    donde se consulta algo que ya se sabe que existe.
  */
  /*
    ══ El inicio es SU PROGRESO ═══════════════════════════════════════════════

    Era «Hoy» —una sección propia para los avisos— y «Mi progreso» iba quinto,
    detrás de la rutina y de la dieta. Estaba al revés: el progreso es la razón
    por la que un cliente paga, y «Hoy» era una pantalla que la mayoría de los
    días no tenía nada que decir.

    Ahora el inicio son sus cifras y sus gráficos, con lo que ha cambiado
    condensado arriba y en la campana de la cabecera. Ver `ClientStart`.
  */
  { path: 'inicio', label: 'Mi progreso', short: 'Progreso', icon: Gauge, also: ['analitica'] },
  { path: 'rutina', label: 'Mi rutina', short: 'Rutina', icon: Layers },
  { path: 'dieta', label: 'Mi dieta', short: 'Dieta', icon: Salad },
  /*
    «Mi evolución» era dos secciones —«Mis check-ins» y «Mis fotos»— y para el
    cliente son el mismo gesto de la semana: pesarse y hacerse las fotos, en las
    mismas condiciones y el mismo día. Tenerlas separadas hacía que fueran dos
    tareas que se recuerdan por separado, y la segunda se olvidaba.

    Además había DOS botones de subir foto en dos sitios distintos, lo que
    obligaba a preguntarse cuál era el bueno. Ahora se sube donde toca hacerlo.
  */
  { path: 'evolucion', label: 'Mi evolución', short: 'Evolución', icon: Ruler, also: ['evolucion/fotos'] },
  { path: 'calendario', label: 'Mi calendario', short: 'Calendario', icon: CalendarDays },
];

/**
 * Elegir contraseña nueva. Se llega desde el enlace del correo, así que es una de
 * las rutas que existen SIN sesión previa, como `/r/` y `/invitacion/`.
 *
 * Está aquí y no escrita a mano en cada sitio porque la usan tres: el formulario
 * que pide el enlace (para componer el `redirectTo`), el mapa de rutas y la propia
 * pantalla. Y sobre todo porque **esta ruta tiene que estar dada de alta en
 * Supabase** (Authentication → URL Configuration → Redirect URLs): si el texto de
 * un sitio deja de coincidir con el del otro, el enlace del correo devuelve al
 * usuario a la portada sin ningún error visible.
 */
export const RESET_PATH = '/nueva-contrasena';

export const COACH_HOME = '/hoy';
export const CLIENT_HOME = '/mi/inicio';
export const SETTINGS_HOME = '/ajustes/protocolo';

/** Ruta de una sección de un cliente. Nadie construye estas cadenas a mano. */
export const clientPath = (clientId, section = 'resumen') => `/c/${clientId}/${section}`;

/**
 * La sección que se está mirando, tal cual, con sus niveles.
 *
 * Devuelve `revision/fotos` y no solo `revision`: desde que una sección puede
 * tener dos niveles, quedarse con el primer tramo perdía el segundo, y cambiar de
 * cliente estando en las fotos te devolvía a su check-in.
 */
const seccionDe = (pathname, prefijo) =>
  new RegExp(`^${prefijo}/(.+)$`).exec(pathname)?.[1]?.replace(/\/$/, '') || null;

/** Todas las rutas que pertenecen a una sección: la suya y sus niveles. */
const rutasDe = (seccion) => [seccion.path, ...(seccion.also || [])];

/**
 * Mantiene la sección al cambiar de cliente.
 *
 * Si estás mirando la nutrición de Marta y cambias a Luis, quieres la nutrición de
 * Luis, no su resumen. Sin esto, cada cambio de cliente te devolvía al inicio.
 */
export const sameSectionFor = (pathname, clientId) => {
  const section = seccionDe(pathname, '/c/[^/]+');
  const known = COACH_CLIENT.some((s) => rutasDe(s).includes(section));
  return clientPath(clientId, known ? section : 'resumen');
};

/**
 * ¿Está el usuario dentro de esta sección?
 *
 * ══ Por qué no vale el `NavLink` a secas ═══════════════════════════════════
 *
 * `NavLink` marca por prefijo de URL, y desde que una sección tiene dos niveles
 * eso deja de bastar: «Progreso» apunta a `resumen`, pero `analitica` es hermana
 * suya y no empieza por `resumen`. El resultado era que al bajar al análisis —o a
 * las fotos de una revisión— **ninguna pestaña quedaba marcada**, y la aplicación
 * parecía haberse salido de sí misma.
 *
 * Los niveles de cada sección se declaran arriba en `also`, al lado de la propia
 * sección, para que añadir uno obligue a verlos todos.
 */
export const isSectionActive = (pathname, seccion, prefijo) => {
  const actual = seccionDe(pathname, prefijo);
  return actual !== null && rutasDe(seccion).includes(actual);
};

/* ==========================================================================
   Las dos vistas de la misma pantalla
   --------------------------------------------------------------------------
   Un entrenador que mira la dieta de Marta y pulsa «ver como lo ve mi cliente»
   quiere ver ESA dieta desde el otro lado. Lo que pasaba era que aterrizaba en
   el inicio del portal, y al volver, en «Hoy»: dos saltos al principio en una
   comprobación que dura diez segundos, y encima perdiendo de vista lo que
   estaba mirando.

   La causa es que los dos árboles de rutas no comparten ni una sola URL, así
   que al cambiar de vista la ruta actual no existe en el árbol nuevo y cae en
   el comodín. Nombrar las secciones igual en los dos no era opción: `/mi/dieta`
   se le enseña al cliente y `/c/<id>/nutricion` es de trabajo interno.

   Así que la equivalencia se declara, aquí, al lado de las dos listas que
   relaciona. Es la única forma de que renombrar una sección obligue a mirar la
   otra.

   Las secciones sin pareja —«Ficha» del lado del entrenador— caen en el inicio
   del otro portal: no hay nada equivalente que enseñar, y es mejor un inicio
   honesto que aterrizar en una sección que no es la que se estaba mirando.
   ========================================================================== */

/** Pares [sección del entrenador, sección del cliente]. */
const EQUIVALENTES = [
  ['resumen', 'inicio'],
  ['analitica', 'analitica'],
  ['rutina', 'rutina'],
  ['nutricion', 'dieta'],
  ['revision', 'evolucion'],
  ['revision/fotos', 'evolucion/fotos'],
  ['calendario', 'calendario'],
];

/** La misma sección, vista desde el portal del cliente. */
export const clientViewOf = (pathname) => {
  const section = seccionDe(pathname, '/c/[^/]+');
  const par = EQUIVALENTES.find(([coach]) => coach === section);
  return par ? `/mi/${par[1]}` : CLIENT_HOME;
};

/**
 * La misma sección, vista desde el panel del entrenador.
 *
 * Hace falta el cliente porque su portal no lo lleva en la URL: `/mi/dieta` es
 * «mi dieta» y solo el contexto sabe de quién se estaba mirando. Sin cliente
 * —un entrenador que aún no ha entrado en ninguno— no hay ruta que componer.
 */
export const coachViewOf = (pathname, clientId) => {
  if (!clientId) return COACH_HOME;
  const section = seccionDe(pathname, '/mi');
  const par = EQUIVALENTES.find(([, cliente]) => cliente === section);
  return par ? clientPath(clientId, par[0]) : COACH_HOME;
};
