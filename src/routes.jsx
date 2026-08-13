import {
  CalendarDays,
  Camera,
  ClipboardList,
  CreditCard,
  HardDriveDownload,
  Gauge,
  Layers,
  LayoutGrid,
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
 * Nivel 1: lo que está siempre visible. Tres entradas y ni una más.
 *
 * ── Por qué «Hoy» va primero, y por delante de la cartera ───────────────────
 * Porque es la primera pregunta de la mañana. La cartera contesta «¿en qué estado
 * está cada cliente?» —un corte transversal, ordenado por gravedad— y eso es lo
 * que se necesita cuando ya sabes que hay algo que atender. Pero antes de eso
 * está «¿qué ha pasado desde ayer?», y esa no la contestaba nadie: los entrenos,
 * los pesajes y las fotos tenían fecha desde el principio y solo se podían ver
 * entrando cliente a cliente.
 *
 * Las dos son necesarias y ninguna repite a la otra: «Hoy» cuenta lo que HA
 * OCURRIDO, la cartera lo que FALTA.
 */
export const COACH_PRIMARY = [
  { path: '/hoy', label: 'Hoy', icon: Sunrise },
  { path: '/cartera', label: 'Cartera', icon: LayoutGrid },
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
  { path: 'resumen', label: 'Progreso', icon: Gauge },
  { path: 'rutina', label: 'Rutina', icon: Layers },
  { path: 'nutricion', label: 'Nutrición', icon: Salad },
  { path: 'fotos', label: 'Fotos', icon: Camera },
  { path: 'checkins', label: 'Check-ins', icon: Ruler },
  { path: 'calendario', label: 'Calendario', icon: CalendarDays },
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
  { path: 'panel', label: 'Mi progreso', short: 'Progreso', icon: Gauge },
  { path: 'rutina', label: 'Mi rutina', short: 'Rutina', icon: Layers },
  { path: 'dieta', label: 'Mi dieta', short: 'Dieta', icon: Salad },
  { path: 'checkins', label: 'Mis check-ins', short: 'Check-in', icon: Ruler },
  { path: 'fotos', label: 'Mis fotos', short: 'Fotos', icon: Camera },
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
export const CLIENT_HOME = '/mi/panel';
export const SETTINGS_HOME = '/ajustes/protocolo';

/** Ruta de una sección de un cliente. Nadie construye estas cadenas a mano. */
export const clientPath = (clientId, section = 'resumen') => `/c/${clientId}/${section}`;

/**
 * Mantiene la sección al cambiar de cliente.
 *
 * Si estás mirando la nutrición de Marta y cambias a Luis, quieres la nutrición de
 * Luis, no su resumen. Sin esto, cada cambio de cliente te devolvía al inicio.
 */
export const sameSectionFor = (pathname, clientId) => {
  const match = /^\/c\/[^/]+\/([^/]+)/.exec(pathname);
  const section = match?.[1];
  const known = COACH_CLIENT.some((s) => s.path === section);
  return clientPath(clientId, known ? section : 'resumen');
};
