/**
 * Lo que sale de aquí hacia el servidor: qué se usa, y qué se rompe.
 *
 * ══ Por qué las dos cosas comparten este archivo ════════════════════════════
 *
 * Empezó siendo solo lo primero. Cuando la migración 0052 añadió el registro de
 * fallos, había dos caminos: un archivo nuevo con su cola, su temporizador, su
 * interruptor de apagado y su enganche al cierre de la pestaña —copiados de
 * aquí— o una segunda corriente por el mismo tubo.
 *
 * Es el mismo tubo. Las dos corrientes se acumulan, se sueltan cada pocos
 * segundos, no se reintentan y no pueden retrasar nada de lo que hace el
 * usuario. Duplicar todo eso para cambiar el nombre de la tabla habría dejado
 * dos temporizadores compitiendo y dos sitios donde arreglar el mismo fallo.
 *
 * Lo que NO comparten es la regla de quién se mide, que es lo único donde las
 * dos difieren de verdad — ver abajo.
 *
 * ══ Qué NO es esto ══════════════════════════════════════════════════════════
 *
 * No es seguimiento de personas. No hay identificador de navegador, ni cookie,
 * ni huella, ni nada que sobreviva a cerrar sesión. Lo único que va es el id de
 * quien tiene la sesión abierta —que ya está en esa sesión— y el nombre de lo
 * que ha pasado.
 *
 * ══ El USO solo se mide en el panel; los FALLOS, en los dos lados ═══════════
 *
 * Quien abre el portal es la persona de la que esta aplicación guarda su peso,
 * sus pliegues y fotos de su cuerpo. Medir además su comportamiento sería usar
 * como sujeto de análisis a quien ya es sujeto de los datos, así que `track` no
 * apunta nada desde `/mi/`. La instrumentación de uso es del producto que se
 * VENDE, y eso es el panel del entrenador.
 *
 * Un fallo es otra cosa. No dice qué hizo esa persona: dice que el software se
 * rompió mientras lo intentaba. Enterarse de que el portal lleva una semana sin
 * dejar subir fotos protege al cliente; no enterarse no le protege de nada. Por
 * eso los fallos sí viajan desde los dos lados, y la fila lleva `rol` para poder
 * distinguirlos.
 *
 * ══ Las reglas, que además las impone Postgres ══════════════════════════════
 *
 * La migración 0045 obliga a que el nombre del evento sea un identificador corto
 * en minúsculas y a que las propiedades quepan en 500 bytes. La 0052 va más
 * lejos con los fallos: rechaza la fila si el mensaje contiene un correo o un
 * identificador. Son CHECK, no convenciones — y las de abajo son la primera de
 * las dos capas, no la única.
 *
 * En `props` van CATEGORÍAS y TRAMOS —`{ seccion: 'rutina' }`,
 * `{ clientes: '10-29' }`—, nunca valores. «Cuántos clientes tiene» en tramos
 * responde a la pregunta de producto igual de bien y no describe a nadie.
 *
 * ══ Por qué no rompe nunca nada ═════════════════════════════════════════════
 *
 * Esto es accesorio y la aplicación tiene que funcionar igual sin ello. Los
 * fallos se tragan a propósito —es el único sitio del proyecto donde eso es
 * correcto, y por eso está escrito—; si las migraciones no están aplicadas, si
 * no hay red o si la política rechaza la fila, no se entera nadie y no se
 * reintenta.
 *
 * Nunca se espera a que termine: nada de aquí devuelve una promesa que alguien
 * deba `await`ear. Apuntar que alguien ha abierto una pantalla no puede retrasar
 * que la pantalla se abra.
 */

import { CLIENT_SECTIONS, COACH_CLIENT, RESET_PATH, SETTINGS_SECTIONS, rutasDe } from '@/routes';

import { currentActor } from './actor';
import { onIssue } from './diagnostics';
import { supabase } from './supabaseClient';

/*
  La identidad se declara en `lib/actor.js` porque la comparten dos. Se reexporta
  desde aquí para que quien ya llamaba a `identify` desde el contexto no tenga
  que enterarse de la mudanza.
*/
export { forgetActor, identify } from './actor';

/* Deja de intentarlo en cuanto queda claro que no va a poder. Sin esto, una
   instalación sin las migraciones aplicadas haría una petición fallida por cada
   pantalla que abriera su usuario durante toda la sesión. Es por tabla: que
   falte la 0052 no puede apagar la medición de uso, ni al revés. */
const apagado = { product_events: false, app_errors: false };

/*
  ══ Se manda en lotes ══════════════════════════════════════════════════════

  Una petición por pantalla abierta serían decenas por sesión para algo que a
  nadie le urge. Se acumulan y se sueltan cada pocos segundos, o de golpe cuando
  la pestaña se esconde —que en móvil es la única señal fiable de que se va—.
*/
const colas = { product_events: [], app_errors: [] };
let temporizador = null;
const ESPERA_MS = 5000;
const TOPE = 25;

const enviarTabla = async (tabla) => {
  const cola = colas[tabla];
  if (apagado[tabla] || cola.length === 0) return;

  const lote = cola.splice(0, cola.length);
  try {
    const { error } = await supabase.from(tabla).insert(lote);
    /*
      Si la tabla no existe, su migración no está aplicada: se apaga y no se
      vuelve a intentar en toda la sesión. Cualquier otro fallo —red, política,
      un CHECK que rechaza la fila— se ignora sin apagar: puede ser pasajero, y
      un CHECK que rechaza es exactamente lo que tiene que pasar cuando algo se
      cuela.
    */
    if (error && /does not exist|schema cache/i.test(error.message || '')) apagado[tabla] = true;
  } catch {
    /* Sin red. No es un problema: esto es accesorio y el lote se pierde a
       propósito. Reintentar mediciones competiría por la red con los guardados,
       que es lo que de verdad importa. */
  }
};

const enviar = () => {
  clearTimeout(temporizador);
  temporizador = null;
  enviarTabla('product_events');
  enviarTabla('app_errors');
};

const programar = (tabla) => {
  if (colas[tabla].length >= TOPE) {
    enviar();
    return;
  }
  if (temporizador) return;
  temporizador = setTimeout(enviar, ESPERA_MS);
};

/**
 * Apunta algo que ha pasado.
 *
 * @param {string} name  identificador corto en minúsculas (ver la 0045).
 * @param {object} [props] categorías y tramos. Nunca valores ni texto libre.
 */
export const track = (name, props = {}) => {
  const { userId, teamId, role } = currentActor();
  /* Solo el panel. La razón, en la cabecera del archivo. */
  if (apagado.product_events || role !== 'coach' || !userId) return;
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(name)) return;

  colas.product_events.push({ actor: userId, team_id: teamId, name, props });
  programar('product_events');
};

/** Suelta lo pendiente ya. Se engancha al cierre de la pestaña. */
export const flushEvents = () => {
  if (colas.product_events.length > 0 || colas.app_errors.length > 0) enviar();
};

/**
 * Tramos, para que un recuento no describa a nadie.
 *
 * «Tiene 28 clientes» es un dato que, cruzado con poco más, señala a un
 * entrenador concreto. «Tiene entre 10 y 29» contesta la misma pregunta de
 * producto —¿en qué tamaño de cartera se abandona?— sin señalar a nadie.
 */
export const bucket = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 'desconocido';
  if (x === 0) return '0';
  if (x < 3) return '1-2';
  if (x < 10) return '3-9';
  if (x < 30) return '10-29';
  return '30+';
};

/* ==========================================================================
   Los fallos
   ========================================================================== */

/*
  ══ La ruta, sin nadie dentro ══════════════════════════════════════════════

  Una ruta real lleva el identificador de un cliente (`/c/8f3a…/rutina`), y en
  el peor caso —una URL escrita a mano— puede llevar cualquier cosa. Guardarla a
  pelo metería a personas concretas en una tabla de diagnóstico.

  Se resuelve como en `pantallaDe` (`App.jsx`) y por la misma razón: la salida se
  CONSTRUYE a partir de una lista blanca, no se sanea la entrada. Lo que no está
  en la lista sale como `otra`. Saneando siempre queda el caso que no se previó;
  construyendo, lo que no se previó simplemente no existe.

  Las listas salen de la tabla de rutas y no de una copia escrita a mano, porque
  una copia a mano se queda vieja en silencio — ya pasó una vez con la prueba de
  privacidad al fundir «Fotos» y «Check-ins» en «Revisión».
*/
/* `rutasDe` viene de `routes.jsx` y no está copiada aquí. Lo estuvo, y era
   justo el fallo que este comentario dice que se quiere evitar: cuando una
   sección gana un segundo nivel —la analítica bajo «Resumen», el calendario
   bajo «Perfil», las fotos bajo «Revisiones»— ese nivel dejaría de contarse
   como sección de cliente sin que nada avisara. */
const SEC_CLIENTE = new Set(COACH_CLIENT.flatMap(rutasDe));
const SEC_PORTAL = new Set(CLIENT_SECTIONS.flatMap(rutasDe));
const SEC_AJUSTES = new Set(SETTINGS_SECTIONS.map((s) => s.path));

/* Las de primer nivel. Las dos legales están escritas porque `/:documento` es un
   comodín en la raíz: cualquier palabra encaja ahí, así que la lista blanca es
   la única forma de no acabar guardando lo que teclee alguien. */
const RAIZ = new Set([
  'hoy',
  'clientes',
  'cartera',
  'privacidad',
  'condiciones',
  RESET_PATH.replace(/^\//, ''),
]);

/**
 * La ruta donde pasó el fallo, con los identificadores fuera.
 *
 * `/c/8f3a…/rutina` → `/c/:id/rutina` · `/mi/dieta` → `/mi/dieta`
 * `/r/<token>` → `/r/:token` · cualquier otra cosa → `/otra`
 *
 * La salida siempre cumple el CHECK de la 0052 (`^/[a-z0-9/:_-]{0,60}$`); si no
 * lo cumpliera, la fila se rechazaría en el servidor y esto dejaría de registrar
 * en silencio, que es el peor de los fallos posibles en algo que existe para
 * detectar fallos.
 */
export const rutaDe = (pathname = '') => {
  const deCliente = /^\/c\/[^/]+\/(.+?)\/?$/.exec(pathname)?.[1];
  if (deCliente) return SEC_CLIENTE.has(deCliente) ? `/c/:id/${deCliente}` : '/c/:id/otra';

  const delPortal = /^\/mi\/(.+?)\/?$/.exec(pathname)?.[1];
  if (delPortal) return SEC_PORTAL.has(delPortal) ? `/mi/${delPortal}` : '/mi/otra';

  const deAjustes = /^\/ajustes\/([^/]+)/.exec(pathname)?.[1];
  if (deAjustes) return SEC_AJUSTES.has(deAjustes) ? `/ajustes/${deAjustes}` : '/ajustes/otra';

  /* Las dos que se abren SIN sesión. El token es la credencial: nunca se guarda,
     ni recortado — un trozo de credencial en una tabla sigue siendo material que
     no tiene por qué estar ahí. */
  if (/^\/r\//.test(pathname)) return '/r/:token';
  if (/^\/invitacion\//.test(pathname)) return '/invitacion/:token';

  const raiz = pathname.replace(/^\//, '').split('/')[0];
  if (raiz === '') return '/';
  return RAIZ.has(raiz) ? `/${raiz}` : '/otra';
};

/*
  ══ El mensaje, sin datos de nadie ═════════════════════════════════════════

  Aquí no vale la lista blanca: el texto lo escribe Postgres y no se puede
  construir desde cero sin perder justo lo que hace útil el registro. Así que
  esta es la capa que SANEA, y la 0052 es la que RECHAZA lo que se le escape.
  Dos capas, y ninguna se fía de la otra.

  Un mensaje real de los que hay que desactivar:

    duplicate key value violates unique constraint "clients_email_key"
    DETAIL:  Key (email)=(ana@correo.com) already exists.
*/
const MAX_MENSAJE = 300;

export const saneaMensaje = (texto = '') =>
  String(texto)
    /* Solo la primera línea. El `DETAIL` de Postgres es donde van los valores, y
       lo que explica el fallo está siempre en la primera. */
    .split('\n')[0]
    /* Lo que Postgres pone entre `=(…)`: los valores de la fila que chocó. */
    .replace(/=\([^)]*\)/g, '=(…)')
    /* Correos. Van antes que nada más porque un `@` hace que la base rechace la
       fila entera, y perder el registro por un correo sería perderlo siempre. */
    .replace(/[^\s(),;:"']+@[^\s(),;:"']+/g, ':correo')
    /* Identificadores. Un `client_id` suelto en un mensaje ata la fila a una
       persona, que es exactamente lo que la tabla promete no hacer. */
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MENSAJE);

/*
  ══ Por qué NO se manda lo que falla al mandar esto ════════════════════════

  `lib/supabaseClient.js` apunta un fallo por CADA petición que no sale bien, y
  eso incluye las de estas dos tablas. Sin este filtro, un rechazo al insertar un
  fallo generaría otro fallo, que se encolaría, que volvería a fallar: un bucle
  que crece solo y que además taparía los fallos de verdad.
*/
const ES_TELEMETRIA = /product_events|app_errors/;

/**
 * Convierte un fallo del registro en memoria en una fila de `app_errors`.
 *
 * Devuelve `null` cuando no hay que mandarlo, que es más veces de las que
 * parece: sin sesión no se puede insertar —la política exige que el actor sea
 * uno mismo— y sin mensaje no hay nada que contar.
 */
const filaDeFallo = (fallo) => {
  const { userId, teamId, role } = currentActor();
  if (!userId || (role !== 'coach' && role !== 'client')) return null;
  if (ES_TELEMETRIA.test(fallo?.message || '')) return null;

  const message = saneaMensaje(fallo?.message);
  if (!message) return null;

  return {
    actor: userId,
    team_id: teamId,
    rol: role,
    source: /^[a-z][a-z0-9_]{1,20}$/.test(fallo.source || '') ? fallo.source : 'otro',
    ruta: rutaDe(fallo.path || ''),
    /* El código de Postgres (`42501` es RLS, `23505` clave duplicada) agrupa
       mucho mejor que el mensaje: no cambia de idioma ni de redacción entre
       versiones. Lo adjunta `supabaseClient` cuando el servidor lo manda. */
    code: /^[A-Za-z0-9_.-]{1,24}$/.test(fallo.code || '') ? fallo.code : null,
    veces: 1,
  };
};

/*
  Se engancha al registro en memoria en vez de que `recordIssue` llame aquí, y
  eso es lo que evita un import circular: `supabaseClient` ya importa
  `diagnostics` para apuntar los fallos del `fetch`, así que si `diagnostics`
  importara de vuelta el cliente se cerraría el círculo. Con el enganche, las
  flechas van todas en el mismo sentido.
*/
/* Qué cuenta como «el mismo fallo». El mensaje ya viene saneado y recortado, así
   que dos fallos con la misma clave son indistinguibles para cualquier pregunta
   que se le vaya a hacer a la tabla. */
const claveDe = (f) => `${f.source}|${f.ruta}|${f.code}|${f.message}`;

onIssue((fallo) => {
  if (apagado.app_errors) return;
  const fila = filaDeFallo(fallo);
  if (!fila) return;

  /*
    Los repetidos SUBEN EL CONTADOR, no llenan la cola. Un fallo en bucle —un
    reintento de guardado, un error en cada render— generaría cientos de filas
    idénticas: ninguna diría nada que no dijera la primera, y entre todas
    convertirían la tabla de diagnóstico en el siguiente problema.

    El tope de 1000 es el del CHECK de la 0052. Por encima de mil repeticiones la
    cifra exacta ya no cambia ninguna decisión.
  */
  const ya = colas.app_errors.find((f) => claveDe(f) === claveDe(fila));
  if (ya) {
    ya.veces = Math.min(1000, ya.veces + 1);
    return;
  }

  colas.app_errors.push(fila);
  programar('app_errors');
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushEvents();
  });
}
