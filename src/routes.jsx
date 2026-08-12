import {
  CalendarDays,
  Camera,
  Gauge,
  Layers,
  LayoutGrid,
  Plug,
  Ruler,
  Palette,
  Salad,
  TrendingUp,
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

/** Nivel 1: lo que está siempre visible. Tres entradas y ni una más. */
export const COACH_PRIMARY = [
  { path: '/cartera', label: 'Cartera', icon: LayoutGrid },
  { path: '/clientes', label: 'Clientes', icon: Users },
];

/** Nivel 2: las secciones de UN cliente. Cuelgan de `/c/:clientId/`. */
export const COACH_CLIENT = [
  { path: 'resumen', label: 'Resumen', icon: Gauge },
  { path: 'analitica', label: 'Analítica', icon: TrendingUp },
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
  { path: 'apariencia', label: 'Apariencia', icon: Palette, hint: 'Tema claro u oscuro' },
  {
    path: 'integraciones',
    label: 'Integraciones',
    icon: Plug,
    hint: 'Conecta Notion, Stripe y lo que venga',
  },
  {
    path: 'equipo',
    label: 'Equipo',
    icon: UsersRound,
    hint: 'Entrenadores, roles y reparto de clientes',
  },
];

/** Secciones del portal del cliente. Cuelgan de `/mi/`. */
export const CLIENT_SECTIONS = [
  { path: 'panel', label: 'Mi panel', icon: Gauge },
  { path: 'analitica', label: 'Analítica', icon: TrendingUp },
  { path: 'rutina', label: 'Mi rutina', icon: Layers },
  { path: 'dieta', label: 'Mi dieta', icon: Salad },
  { path: 'fotos', label: 'Mis fotos', icon: Camera },
  { path: 'checkins', label: 'Mis check-ins', icon: Ruler },
  { path: 'calendario', label: 'Mi calendario', icon: CalendarDays },
];

export const COACH_HOME = '/cartera';
export const CLIENT_HOME = '/mi/panel';
export const SETTINGS_HOME = '/ajustes/apariencia';

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
