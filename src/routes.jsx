import {
  CalendarCheck,
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
  Salad,
  Home,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';

import { isServiceOn } from '@/domain/protocol';

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
 *   2. **Del cliente** (solo dentro de `/c/:id/…`): sus cinco pestañas planas
 *      —Resumen · Entreno · Dieta · Revisiones · Perfil—. Ver `COACH_CLIENT`.
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
/*
  ── Y por qué ahora son tres ────────────────────────────────────────────────
  «Calendario» era una sección DE un cliente, y por tanto la pregunta con la que
  un entrenador abre un calendario —«¿qué tengo esta semana?»— no la contestaba
  nadie: había veinte calendarios y ninguna agenda. Entrar en veinte fichas para
  sumar de memoria quién entrega el martes no es una tarea que la aplicación
  pueda dejar fuera.

  No repite a las otras dos, que es la prueba que tuvieron que pasar «Cartera» y
  «Clientes» antes de fusionarse: «Hoy» cuenta lo que HA PASADO, «Clientes» lo
  que FALTA, y «Calendario» lo que VIENE. Ninguna de las tres contesta la de otra.

  El calendario de un cliente concreto sigue en su carril, con lo suyo: es donde
  se le pone su pauta y se le mueve una fecha.
*/
/*
  ── Y por qué ahora son cuatro ──────────────────────────────────────────────
  «Ingresos» pasa la misma prueba que tuvo que pasar «Calendario»: contesta una
  pregunta que no contestaba ninguna de las otras. «Hoy» cuenta lo que HA PASADO,
  «Clientes» lo que FALTA, «Calendario» lo que VIENE e «Ingresos» CUÁNTO.

  Los datos estaban todos dentro —la tarifa en la ficha de cada cliente, el
  vencimiento en la bandeja, el histórico en `client_payments` desde la migración
  0010— y no había ni una pantalla donde se sumaran. «¿Cuánto voy a ingresar este
  mes?» obligaba a entrar cliente por cliente, que es la hoja de cálculo aparte
  que este producto vino a sustituir.

  ── El conflicto con `docs/producto.md`, dicho en voz alta ──────────────────
  Ese documento va en dirección contraria: su §4.1 REDUCE secciones. Pero lo que
  reduce es el nivel 2 —las seis secciones de un cliente, que se solapaban entre
  sí— y sobre el nivel 1 dice literalmente que «Hoy» y «Clientes» se quedan como
  están. El criterio que aplica no es «menos entradas»: es que cada entrada
  conteste algo que no conteste otra. Ésta lo hace.

  Lo que NO se hace es meterla en Ajustes, que era la alternativa barata: allí va
  lo que se configura una vez y no se toca a diario, y esto se mira cada semana.

  ── Y por qué va DELANTE de «Calendario» ────────────────────────────────────
  Porque este carril se ordena por cuántas veces se abre, no por la importancia
  que uno le atribuye a cada cosa — es el mismo criterio con el que «Hoy» va
  antes que «Clientes».

  El calendario es la sección con menos uso de las cuatro; `docs/producto.md`
  §8.3 llega a preguntarse en voz alta si retirarla. «¿Quién me debe?» y «¿cuánto
  llevo este mes?» se preguntan cada semana, y «¿qué tengo el jueves?» bastante
  menos — sobre todo desde que lo de HOY ya sale en «Hoy», que es lo que la
  agenda contestaba a diario y ahora contesta la primera pantalla.

  Esa es la razón de que el reorden venga junto con los eventos en «Hoy» y no
  suelto: al calendario se le ha quitado la mitad de su tráfico diario, así que
  su sitio ya no es el tercero.
*/
export const COACH_PRIMARY = [
  { path: '/hoy', label: 'Inicio', icon: Home },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/ingresos', label: 'Cobros', icon: Wallet },
  /*
    Se llamaba «Calendario», igual que el calendario de UN cliente, y son dos
    cosas: aquí se mira la semana entera de la cartera y allí se le pone la pauta
    a una persona. Dos entradas con el mismo nombre a dos clics una de otra es de
    donde sale «esto marea».

    «Agenda» es la palabra que ya usaba el razonamiento de esta entrada cuando se
    añadió: «había veinte calendarios y ninguna agenda». Era el nombre correcto
    desde el principio.
  */
  { path: '/calendario', label: 'Agenda', icon: CalendarDays },
];

/** Nivel 2: las secciones de UN cliente. Cuelgan de `/c/:clientId/`. */
export const COACH_CLIENT = [
  /*
    ══ «Su semana» va la primera, y es nueva ═════════════════════════════════

    Es lo que la portada vende —«la semana se cierra»— y era lo único que no
    tenía pantalla: mirar lo que le pusiste, lo que ha hecho, lo que ha entregado
    y contestarle cruzaba CUATRO secciones de este mismo carril, cada una con su
    propio selector de semana.

    Va delante de todas porque el orden del carril es el del trabajo y esto es lo
    que se hace más veces: programar se toca cada varias semanas, revisar es cada
    lunes con todo el mundo.

    Cuando esto se escribió, las demás secciones seguían sueltas porque
    reagruparlas «de verdad» se daba por un paso caro. Ya están agrupadas, y no
    lo era: ver el bloque de arriba.
  */
  /*
    ══ Y se llama «Revisión», que es lo que se pulsa ══════════════════════════

    Se llamaba «Su semana», y debajo había OTRA entrada llamada «Revisión» que
    era el formulario de pesajes y el estudio de fotos. Dos nombres compitiendo,
    y el gesto natural —«voy a revisar a Javier» → pulsar «Revisión»— aterrizaba
    en el sitio equivocado: en dónde se METEN los datos, no en dónde se decide.

    Ahora es UNA sección con tres niveles, igual que «Progreso» tiene resumen y
    análisis: la revisión (aquí), su check-in y sus fotos. Se baja a los dos de
    archivo desde el bloque de la revisión que enseña ese dato —los pesajes desde
    «Cómo va», el estudio desde «Su cuerpo»— y se vuelve por el carril de chips
    que ellos sí llevan (`review/ReviewRail.jsx`). `also` es lo que mantiene esta
    entrada marcada mientras estás en cualquiera de los dos.

    ── Ninguna URL se mueve ────────────────────────────────────────────────────
    `/c/:id/semana`, `/c/:id/revision` y `/c/:id/revision/fotos` siguen donde
    estaban: esto es una etiqueta y una agrupación, no la fase 5 de
    `docs/producto.md` —que además mueve las rutas y duplica para siempre la
    tabla de redirecciones—. El documento nombra esta sección «Su semana»; se
    queda el nombre que el entrenador busca de verdad, que es el otro.
  */
  /*
    ══════════════════════════════════════════════════════════════════════════
    LAS SECCIONES DE UN CLIENTE SON SUS HORIZONTES DE TIEMPO, NO SUS TABLAS
    ══════════════════════════════════════════════════════════════════════════

    Eran seis: Revisión · Progreso · Rutina · Nutrición · Calendario · Ficha. Que
    es, casi exactamente, la lista de tablas de la base de datos —`workout_data`,
    `nutrition_plans`, `anthropometry`, `calendar`, `clients`—, y por tanto un
    menú dibujado desde el modelo de datos y no desde el trabajo.

    El precio lo pagaba la única tarea que este producto hace mejor que una hoja
    de cálculo: cerrar la semana de alguien cruzaba CUATRO de las seis, cada una
    con su cabecera y su vocabulario. Dos entrenadores lo dijeron con las mismas
    palabras sin haber hablado entre ellos: «zonas que se interconectan y
    marean».

    Ahora la pregunta que ordena el menú no es «¿qué tipo de dato quiero tocar?»
    sino «¿de cuándo estamos hablando?», que es la que un entrenador se hace de
    verdad:

      Revisiones  esta semana    qué le puse, qué hizo, qué me entregó, qué le digo
      Entreno     este bloque    qué le tengo montado y qué le cambio
      Dieta       este bloque    qué come
      Resumen     estos meses    ¿esto está funcionando?
      Perfil      siempre        quién es, qué paga, sus fechas

    (Los nombres de esta tabla son los de agosto de 2026; el razonamiento de
    abajo es anterior y habla de «Plan», que fue una agrupación que se probó y
    se deshizo: Entreno y Dieta son pestañas propias.)

    ── Y NO se ha movido ni una URL ───────────────────────────────────────────
    `docs/producto.md` §4.3 daba esto por imposible sin pagarlo: proponía mover
    `/rutina` a `/plan`, `/nutricion` a `/plan/dieta`, `/calendario` a `/ficha`…
    y con ello duplicar para siempre la tabla de redirecciones, porque esos
    enlaces están pegados en conversaciones de WhatsApp. Ese coste es la razón
    por la que la fase llevaba meses sin empezarse.

    No hacía falta. Una sección con DOS NIVELES ya existía en el producto
    —«Progreso» es `resumen` + `analitica`, «Revisión» es `semana` + su archivo—
    y se resuelve con una ruta de layout sin `path` que solo aporta un carril de
    chips. Agrupar es una decisión de NAVEGACIÓN; las rutas se quedan donde
    están, los marcadores siguen valiendo y volver atrás es borrar cuatro
    líneas de este archivo.

    Lo que cuesta de verdad —partir la rutina entre «la semana activa» y «el
    bloque entero»— es trabajo de dominio y no de menú, y no hace falta para
    esto: dentro de «Plan» están las dos cosas, como estaban.
    ══════════════════════════════════════════════════════════════════════════
  */
  /*
    «Progreso» era dos entradas —Resumen y Analítica— y las dos contestan la misma
    pregunta con distinto detalle. Eso obligaba a elegir cuál abrir antes de saber
    qué se quería mirar. Ahora es una sección con dos niveles: se entra por el
    resumen y se pasa al análisis desde dentro (`analytics/ProgressLayout.jsx`).
    La ruta `/analitica` sigue existiendo, así que los enlaces guardados valen.
  */
  /*
    ── Rutina y Dieta, y por qué NO se agrupan ────────────────────────────────
    Hubo una versión que las metió dentro de una sección llamada «Plan», con el
    argumento de que son el mismo horizonte —lo que se cambia cada varias
    semanas— y el mismo gesto. El argumento es cierto y la conclusión estaba
    mal: **son las dos cosas que un entrenador AJUSTA de cada cliente**, o sea
    su trabajo. Todo lo demás de este carril es mirar o administrar.

    Lo que se ajusta no se esconde detrás de un chip. Agrupar es para lo que se
    consulta —dos profundidades de la misma lectura, un archivo, unas fechas—,
    no para el oficio.

    Y se llama «Dieta» y no «Nutrición» porque es la palabra que usan el
    entrenador y el cliente: su portal lleva «Mi dieta» desde el primer día.
  */
  /*
    ══ El orden y los nombres, tal como los busca el entrenador (ago 2026) ═══
    Resumen · Entreno · Dieta · Revisiones · Perfil. Cinco pestañas planas y
    NINGÚN carril debajo: lo que cuelga de una sección se abre desde su contenido
    (la analítica desde la cifra, las fotos desde el bloque del cuerpo, el
    calendario desde el perfil) y vuelve con una miga, no con otra fila de chips.
    Un nombre por concepto, el mismo en los dos portales.
  */
  { path: 'resumen', label: 'Resumen', icon: Gauge, also: ['analitica'] },
  { path: 'rutina', label: 'Entreno', icon: Layers, service: 'training' },
  { path: 'nutricion', label: 'Dieta', icon: Salad, service: 'nutrition' },
  {
    path: 'semana',
    label: 'Revisiones',
    short: 'Revisiones',
    icon: CalendarCheck,
    also: ['revision', 'revision/fotos', 'revision/estudio'],
  },
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
  /*
    ── `service`: las dos secciones que pueden no existir ────────────────────
    Un entrenador puede llevarle a alguien solo el entrenamiento o solo la
    nutrición (ver `domain/protocol.js`). La sección que no le llevas no se pinta
    aquí ni en su portal, y su ruta manda al resumen. Sin marca no hay filtro: lo
    que no lleva `service` existe siempre.
  */
  /*
    La ficha va la última del carril a propósito. Sus datos, su acceso al portal,
    archivarle y exportar lo suyo son cosas de cuando alguien ENTRA o SALE; las
    tres de delante son con las que se trabaja cada semana. Pero está en el mismo
    carril que ellas porque habla del mismo cliente, y tenerla fuera —que es de
    donde viene— obligaba a salirse de la persona para tocar sus datos.

    ── Y se lleva dentro el calendario ────────────────────────────────────────
    Era una sección propia y es la de menos uso de las seis: `docs/producto.md`
    §8.3 llega a preguntarse en voz alta si retirarla. No hace falta retirarla —
    su sitio es éste. Las fechas de alguien son de la misma naturaleza que su
    tarifa y su antigüedad: datos que se ponen una vez y se consultan, no
    trabajo de la semana. Y la pregunta diaria que un calendario contesta —«¿qué
    tengo hoy?»— ya la contesta «Hoy», que es por donde se entra.
  */
  { path: 'ficha', label: 'Perfil', icon: FileText, also: ['calendario'] },
];

/**
 * Nivel 3: ajustes.
 *
 * Aquí va lo que se configura una vez y no se toca a diario. Sacarlo del nivel
 * primario es lo que permite que ese tenga tres entradas: el equipo y las
 * integraciones no son sitios donde trabajar, son sitios donde dejar algo puesto.
 */
/*
  ── `group` es el rótulo de su tanda en la lista de Ajustes ──────────────────
  Siete apartados planos se leían de corrido, y no son del mismo asunto: dos
  hablan del servicio que das, dos de lo que la aplicación tiene conectado y dos
  de tu propia cuenta. El rótulo nombra la tanda; los apartados consecutivos con
  el mismo `group` se pintan juntos (ver `SettingsLayout`). Es presentación:
  las rutas no cambian, solo el orden y la lectura de la lista.
*/
export const SETTINGS_SECTIONS = [
  {
    path: 'protocolo',
    label: 'Protocolo',
    icon: ClipboardList,
    hint: 'Qué le pides a tus clientes y qué ve cada uno',
    group: 'Tu asesoría',
  },
  {
    path: 'equipo',
    label: 'Equipo',
    icon: UsersRound,
    hint: 'Entrenadores, roles y reparto de clientes',
    group: 'Tu asesoría',
  },
  {
    path: 'integraciones',
    label: 'Integraciones',
    icon: Plug,
    hint: 'Conecta Notion, Stripe y lo que venga',
    group: 'Conexiones',
  },
  {
    path: 'copia',
    label: 'Copia de seguridad',
    icon: HardDriveDownload,
    hint: 'Llévate todo lo que guarda la aplicación',
    group: 'Conexiones',
  },
  /*
    ── «Apariencia» sale de la lista, y su ruta se queda ──────────────────────
    Era una de las siete secciones de Ajustes —con su entrada, su rótulo de
    grupo y su pantalla— para UN ajuste: claro u oscuro. Y ese mismo ajuste ya
    estaba, con el mismo efecto y a un clic de distancia, en el menú de la
    cuenta, que es donde lo pone cualquier aplicación y donde se busca.

    Dos sitios para lo mismo no es generosidad: es una pregunta más («¿cuál de
    los dos uso?») y una sección de siete que no dice nada nuevo. Se queda el que
    está donde se mira.

    La RUTA sigue viva —`/ajustes/apariencia` responde igual, con su pantalla y
    su vista previa de los dos temas— porque puede estar en un marcador y porque
    la pantalla explica la elección mejor que un conmutador. Lo que desaparece es
    su entrada en la lista.
  */
  /*
    Se llamaba «Plan», y en este producto un plan es lo que le montas a un
    cliente: su rutina y su dieta. La palabra más cargada del oficio estaba
    ocupada por la pantalla de facturación, que se abre una vez al mes. La suya
    es «Suscripción», que además es la que dice de qué va sin abrirla.
  */
  {
    path: 'plan',
    label: 'Suscripción',
    icon: CreditCard,
    hint: 'Cuántos clientes llevas y hasta dónde llega',
    group: 'Tu cuenta',
  },
  /*
    Ayuda va la última y dentro de Ajustes, no en el nivel primario.

    No porque importe poco —es lo que evita que alguien atascado se vaya— sino
    porque se busca cuando hace falta y no se visita a diario. El nivel primario
    son tres entradas a propósito (Hoy, Cartera, Clientes) y meter aquí una cuarta
    que se usa una vez al mes le quitaría sitio a las que se usan cada día.

    Sin `group`: no es un apartado de configuración, es la puerta de socorro. En
    la lista va como pie, separada por su filete — la misma gramática que el pie
    de la barra lateral.
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
  { path: 'rutina', label: 'Mi rutina', short: 'Rutina', icon: Layers, service: 'training' },
  { path: 'dieta', label: 'Mi dieta', short: 'Dieta', icon: Salad, service: 'nutrition' },
  /*
    «Mi evolución» era dos secciones —«Mis check-ins» y «Mis fotos»— y para el
    cliente son el mismo gesto de la semana: pesarse y hacerse las fotos, en las
    mismas condiciones y el mismo día. Tenerlas separadas hacía que fueran dos
    tareas que se recuerdan por separado, y la segunda se olvidaba.

    Además había DOS botones de subir foto en dos sitios distintos, lo que
    obligaba a preguntarse cuál era el bueno. Ahora se sube donde toca hacerlo.
  */
  { path: 'evolucion', label: 'Mi revisión', short: 'Revisión', icon: Ruler, also: ['evolucion/fotos'] },
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
 * Las secciones que existen para ESTE cliente.
 *
 * Filtra por `service`, así que sirve igual para el carril del entrenador y para
 * las pestañas del portal: las dos listas marcan sus secciones con el mismo
 * nombre de servicio y el filtro es uno solo. Un cliente al que no le llevas
 * dieta no tiene «Dieta» ni «Mi dieta».
 */
export const sectionsFor = (sections, protocol) =>
  sections.filter((s) => !s.service || isServiceOn(protocol, s.service));

/**
 * La sección que se está mirando, tal cual, con sus niveles.
 *
 * Devuelve `revision/fotos` y no solo `revision`: desde que una sección puede
 * tener dos niveles, quedarse con el primer tramo perdía el segundo, y cambiar de
 * cliente estando en las fotos te devolvía a su check-in.
 */
const seccionDe = (pathname, prefijo) =>
  new RegExp(`^${prefijo}/(.+)$`).exec(pathname)?.[1]?.replace(/\/$/, '') || null;

/**
 * Todas las rutas que pertenecen a una sección: la suya y sus niveles.
 *
 * Se exporta porque `lib/analytics.js` tenía esta misma función copiada para
 * saber qué ruta es una sección de cliente y cuál del portal. Dos copias de la
 * regla significan que añadir un nivel —el calendario dentro de «Ficha»— arregla
 * la navegación y deja la analítica contando mal, sin que nada avise.
 */
export const rutasDe = (seccion) => [seccion.path, ...(seccion.also || [])];

/**
 * Mantiene la sección al cambiar de cliente.
 *
 * Si estás mirando la nutrición de Marta y cambias a Luis, quieres la nutrición de
 * Luis, no su resumen. Sin esto, cada cambio de cliente te devolvía al inicio.
 *
 * ── Y sin sección que mantener, su semana ───────────────────────────────────
 * Caía en el resumen, y eso contradecía al índice de la ruta —`/c/:id` lleva a
 * `semana` desde que se entra por lo que se viene a hacer—. Dos entradas por
 * defecto distintas para la misma pregunta: pulsar a alguien en la barra
 * aterrizaba en un sitio y escribir su URL a pelo en otro. Ahora es una.
 *
 * `protocol` es el DEL DESTINO, y por eso es un parámetro y no algo que se lea
 * aquí: si a Luis no le llevas dieta, su nutrición no existe y se cae a su
 * semana en vez de aterrizar en una ruta que va a rebotar. Sin él se comporta como
 * siempre, que es lo que hace falta donde no hay cliente que consultar.
 */
export const sameSectionFor = (pathname, clientId, protocol = null) => {
  const section = seccionDe(pathname, '/c/[^/]+');
  const disponibles = protocol ? sectionsFor(COACH_CLIENT, protocol) : COACH_CLIENT;
  const known = disponibles.some((s) => rutasDe(s).includes(section));
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
  /* El estudio no tiene equivalente en el portal: el cliente no compara,
     entrega. Su pareja es su archivo de fotos, que es lo más cercano a lo que
     estabas mirando. */
  ['revision/estudio', 'evolucion/fotos'],
  ['calendario', 'calendario'],
  /*
    «Su semana» ⇄ «Mi evolución». Son los dos lados del mismo gesto: donde el
    entrenador lee la semana y contesta es donde el cliente la entrega.

    Va la ÚLTIMA a propósito. `coachViewOf` busca por la sección del cliente y se
    queda con el primer par, así que `evolucion` sigue devolviendo `revision` —el
    camino de vuelta no cambia— y lo único que añade esta línea es la ida.
  */
  ['semana', 'evolucion'],
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
