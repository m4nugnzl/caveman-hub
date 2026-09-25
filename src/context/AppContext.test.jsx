import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Que el proveedor monta, y que el corte en tres contextos está entero.
 *
 * ══ Por qué esta prueba existe ══════════════════════════════════════════════
 *
 * `AppContext` se partió en tres —sesión, datos y acciones— para que escribir un
 * kilo dejara de repintar la aplicación entera. Es un cambio mecánico sobre
 * ciento cuarenta y nueve claves, y el modo de fallar es callado: una clave que
 * se cae por el camino no rompe el build ni el lint, aparece como `undefined` en
 * la pantalla que la usara.
 *
 * ══ Por qué `renderToString` y no un renderizador de verdad ═════════════════
 *
 * Porque no hacen falta ni jsdom ni una librería de pruebas de componentes —dos
 * dependencias nuevas— para lo que aquí se quiere comprobar: que el árbol de
 * proveedores MONTA, que los cuatro ganchos resuelven y que el reparto de claves
 * está completo. `react-dom` ya está en el proyecto.
 *
 * Tiene además una propiedad útil: en el render de servidor los `useEffect` no
 * corren, así que el proveedor se monta SIN tocar la red. Lo que se prueba es la
 * estructura, que es justo lo que el corte podía haber roto.
 */

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

const { AppProvider, useActions, useApp, useData, useSession } = await import('./AppContext');

/** Lo que la sonda ve, sacado del render. */
let visto = null;

const Sonda = () => {
  visto = {
    app: useApp(),
    acciones: useActions(),
    sesion: useSession(),
    datos: useData(),
  };
  return null;
};

const montar = () =>
  renderToString(
    <AppProvider>
      <Sonda />
    </AppProvider>
  );

beforeEach(() => {
  visto = null;
});

describe('AppProvider', () => {
  it('monta sin reventar y los cuatro ganchos resuelven', () => {
    expect(() => montar()).not.toThrow();
    expect(visto.app).toBeTruthy();
    expect(visto.acciones).toBeTruthy();
    expect(visto.sesion).toBeTruthy();
    expect(visto.datos).toBeTruthy();
  });

  it('los ganchos fuera del proveedor lo dicen en vez de dar `undefined`', () => {
    const Suelto = () => {
      useActions();
      return null;
    };
    expect(() => renderToString(<Suelto />)).toThrow(/AppProvider/);
  });

  /*
    El reparto tiene que ser una PARTICIÓN: sin solapes y sin pérdidas. Un solape
    significaría que dos contextos declaran la misma clave y gana el último del
    `useApp()`, que es un error que no se ve hasta que los dos valores difieren.
  */
  it('los tres contextos no comparten ninguna clave', () => {
    montar();
    const { sesion, datos, acciones } = visto;
    const solapes = [
      ...Object.keys(sesion).filter((k) => k in datos || k in acciones),
      ...Object.keys(datos).filter((k) => k in acciones),
    ];
    expect(solapes).toEqual([]);
  });

  it('`useApp` sigue devolviendo la suma exacta de los tres', () => {
    montar();
    const { app, sesion, datos, acciones } = visto;
    const suma =
      Object.keys(sesion).length + Object.keys(datos).length + Object.keys(acciones).length;
    expect(Object.keys(app).length).toBe(suma);
    for (const clave of [...Object.keys(sesion), ...Object.keys(datos), ...Object.keys(acciones)]) {
      expect(app).toHaveProperty(clave);
    }
  });

  /*
    El número exacto es a propósito. Si alguien añade una acción y se olvida de
    declararla, esto no salta —y no debería—; pero si alguien MUEVE una clave de
    sitio o la pierde al refactorizar, el recuento cambia y hay que mirarlo.
    Actualizar el número es una línea y obliga a pasar por aquí.
  */
  it('el reparto conserva las 293 claves', () => {
    montar();
    // 195 desde «Quién eres» en el alta del cliente (0091): `saveClientIdentity`,
    // el segundo camino por el que el CLIENTE escribe en su ficha. Va aparte de
    // `saveClientProfile` porque no escribe el jsonb: escribe `birth_date` y
    // `height_cm`, que son columnas tipadas con sus topes.
    // Antes 194, desde el aviso de «ya puedes empezar» en Hoy: `equipmentCounts`, una
    // cifra por cliente. El detalle sigue siendo del cliente abierto; para saber
    // quién ha terminado su alta basta con si tiene fotos o no.
    // Antes 193, desde el salto al portal por una pantalla concreta: `openClientView` y
    // `takeViewTarget`. Cambiar de modo NO navega —lo traduce el comodín de
    // App.jsx— así que el destino se deja dicho y lo lee quien decide de verdad.
    // Antes 191, desde el cuestionario de alta (0080): `saveClientProfile`, el único
    // camino por el que el CLIENTE escribe en su ficha — pasa por una función
    // de la base porque la 0002 le deja `clients` en solo lectura.
    // Antes 190, desde la maquinaria del gimnasio (0079): el estado `equipment` y sus
    // tres acciones. Sin `resolveEquipment`: una máquina no se cura, se quita.
    // Antes 186, desde los condicionantes (0077): el estado `conditions` y sus cuatro
    // acciones —`addCondition`, `updateCondition`, `resolveCondition` y
    // `removeCondition`—. Resolver y borrar son dos y no una a propósito: una
    // lesión curada se conserva con su fecha y solo se borra lo que se apuntó mal.
    // Antes 181, al poner `ensureNutrition` en la fachada: existía en el proveedor y se
    // le pasaba a `useWorkout`, pero nunca se expuso, así que la pantalla de
    // nutrición lo pedía y recibía `undefined`.
    // Antes 180, desde las excepciones del protocolo: `saveClientException`, el guardado
    // por cliente que además deja la marca de «a este no le pongas la plantilla
    // encima». Antes 179, desde las equivalencias de alimentos: `swapFood`, que sustituye un
    // alimento por su equivalente en su sitio, y `setFoodEquivalences`, la
    // excepción por alimento a lo que el módulo del protocolo decide en general.
    // Antes 177, desde «traer un plan de fuera»: `importDiet`, que escribe la
    // dieta entera de una vez, e `importRoutine`, que decide contra qué semana
    // cae una rutina importada desde una pantalla que no está mirando ninguna.
    // Antes 175, desde «pegar una rutina»: `addExercises` e `importDays`, las dos
    // escrituras en bloque que necesita traer una hoja de fuera sin mandar una
    // petición por ejercicio.
    // Antes 173, desde las bifurcaciones del roadmap (0073): `setPhaseFork` y
    // `chooseFork`. Antes 171, desde el calendario suscribible del cliente
    // (0071): `loadCalendarFeed`, `createCalendarFeed` y `revokeCalendarFeed`.
    // Y antes 168, desde `applyProtocolToClient` — «Aplicar a todos» dejó de
    // escribir a ciegas por la cola y pasó a esperar cada respuesta para
    // contarla.
    // Antes 194, desde la carpeta compartida en Drive (0082): seis acciones, y la
    // cuenta se explica sola si se lee quién llama a cada una. Del entrenador son
    // `driveAuthorize` (el viaje a Google), `runDrive` (montar la carpeta y
    // comprobar el permiso) y `setClientFolder` (si el cliente puede subir y qué
    // le pides). Las otras tres —`loadClientFolder`, `driveFiles` y `driveUpload`—
    // las llaman los DOS: el entrenador desde la ficha y el cliente desde su
    // portal, y por eso se autorizan por la carpeta y no por la integración, que
    // él no puede ni ver.
    //
    // Fueron siete un rato: había un `loadClientFolders` en plural para pintar la
    // cartera entera en Ajustes → Integraciones. Esa lista se retiró —gestionar
    // clientes desde Ajustes es el segundo sitio que la ficha existe para evitar—
    // y con ella se fue su consulta.
    //
    // Y 201 desde la salida de emergencia del acceso (0083): `reissueAccess`, que
    // suelta la ficha de la cuenta que la tenía y devuelve un enlace de invitación
    // nuevo. Es una acción y no dos porque el canje ya existía desde la 0015: lo
    // único que faltaba era poder SOLTAR una ficha ya enlazada, que es lo que
    // dejaba a un cliente sin contraseña fuera para siempre.
    //
    // Y 204 desde `profileName`: TU nombre, el de `profiles.full_name`. Se
    // cargaba con el resto del perfil y se tiraba, así que el pie de la barra
    // lateral —donde ahora vive tu identidad y, dentro de ella, tus ajustes—
    // solo podía enseñar las iniciales de tu correo.
    //
    // Y 205 desde `setExerciseSetCount`: cuántas series tiene un ejercicio, en
    // UNA escritura. Existe por la vista «Bloque», donde un cambio de «4 → 6»
    // llega a todas las semanas del bloque a la vez: con los dos slots de uno
    // en uno, esa edición mandaría una escritura del programa entero por cada
    // serie y cada semana. Mismo motivo que `addExercises` al lado de
    // `addExercise`.
    //
    // Y 206 desde `logBlockChange`: la bitácora del bloque. Tocar el volumen de
    // una semana suelta NO parte el bloque —eso se decide a mano— pero tiene
    // que dejar rastro, o tres semanas después nadie sabe si el pico de la S3
    // fue una decisión o un despiste. Va dentro del propio bloque
    // (`block.log`), así que no hay columna ni migración nuevas.
    //
    // Y 207 desde `updateProfileName`. `profiles.full_name` se leía en cinco
    // sitios y no se escribía en ninguno: quien no lo tuviera relleno de antes
    // veía «Buenos días, m4nugnzl@gmail.com» cada mañana sin ninguna forma de
    // arreglarlo desde dentro. Vive en el menú de cuenta, que es donde se busca
    // el nombre de uno y donde además se estaba viendo el problema.
    //
    // Y 208 desde `deleteBlock`: abrir un bloque se podía y deshacerlo no, así
    // que un «+ bloque» de más se quedaba para siempre en la cinta. Quita el
    // corte, no el entreno —sus semanas pasan al bloque de al lado—, y por eso
    // no se resuelve con el borrado de semanas que ya había.
    //
    // Y 209 desde `applyRescaledMeals`: escribir el menú que la vista previa
    // del reescalado acaba de enseñar (el cálculo es de `rescaleMeals`, en el
    // dominio). Es también el camino del «Deshacer»: volver a escribir el menú
    // anterior.
    //
    // Y 229 desde EL PLAN DEL BLOQUE: veinte puertas de una vez, porque el plan
    // deja de vivir copiado en cada microciclo y pasa a vivir en su bloque
    // (`domain/blocks`, `domain/blocksMigration`). Son tres familias:
    //
    //   · el plan del bloque — `setBlockPlan` y las altas, bajas, cambios de
    //     series y de objetivo de sus hojas y sus ejercicios;
    //   · lo que se toca desde la hoja — `updatePlanExercise`,
    //     `removePlanExercise` y `addPlanExercise`, que escriben donde ese
    //     ejercicio VIVE, casi siempre el bloque, porque un ajuste se hace
    //     para quedarse;
    //   · las excepciones — `addOverride`, `dropOverride`, `promoteOverride` y
    //     las dos de «solo este microciclo», para lo puntual.
    //
    // Y `migratePlanToBlock`, que sube el plan de un cliente sin cambiar nada
    // más. No hace falta llamarla a mano: toda escritura del plan migra antes.
    //
    // A cambio se han ido del editor ocho puertas del modelo viejo —el reparto
    // del plan a las semanas por entrenar— aunque siguen existiendo en el
    // contexto mientras las use el portal.
    //
    // Y 230 desde `startBlockWithPlan`: abrir un bloque con su plan YA dentro.
    // `startBlock` lo creaba con las hojas vacías —«se rellenan de nuevo»— y te
    // dejaba componerlo dentro del primer microciclo, así que el momento en el
    // que un bloque se define no existía en ninguna pantalla. Ahora se define
    // entero y de una vez (el compositor).
    //
    // Y 231 desde `setOverrideSpan`: alargar o acortar un cambio del bloque.
    // Los cambios llevan desde cuándo y hasta cuándo valen, así que probar un
    // ejercicio «unas semanas» es un dato y no tres copias — y dejarlo dos
    // microciclos más no obliga a reescribir nada.
    //
    // Y 232 desde `saveClientIdentity`: la edad y la altura que el cliente
    // escribe en su alta. Van a columnas de `clients` y no al jsonb del perfil,
    // así que no podían entrar por `saveClientProfile`.
    //
    // Y 233 desde `setClientPaused` (0093): apartar a alguien una temporada
    // —lesión, vacaciones— sin archivarle. La regla de qué silencia vive en
    // domain/portfolio.js; aquí solo entra la acción.
    //
    // Y 234 desde `setBlockExerciseGrammar`: la gramática de serie —superserie,
    // bajada, descanso— es plan y va al bloque. AMRAP y «por tiempo» no
    // necesitan puerta: ya viven en el objetivo escrito y se interpretan
    // (`targetKind`).
    //
    // Y 235 desde `setBlockTraits`: las características del bloque —a qué
    // juega, cuánto se prevé que dure, qué se persigue—. La duración ya se
    // pedía al crearlo y se tiraba; ahora se guarda, se lee y se puede
    // corregir después. La regla vive en `blockTraits` (domain/blocks.js).
    //
    // Y 236 desde `saveExerciseSheet`: la capa del ENTRENADOR en un ejercicio
    // —su vídeo, su clave, sus alternativas (0098)—. Va aparte de
    // `upsertLibraryExercise` porque no respeta la protección del catálogo: el
    // press banca del catálogo tiene que poder llevar tu vídeo, y lo que se
    // escribe es una fila tuya, no el dato de referencia.
    //
    // Y 243 desde LO MANDADO (0099, generalizado en 0105): dos de estado
    // —`envioRows`, `enviosReady`— y cinco acciones —`reloadEnvios`,
    // `mandarAccion`, `dejarDePedir`, `quitarPedido`, `marcarAccion`—. Son siete
    // y no menos porque el gancho lo usan los DOS lados: el entrenador manda y
    // el cliente entrega, y quien decide qué filas ve cada uno es RLS.
    //
    // Y 245 desde la ficha que llega al cliente (0100): `sheetOf` —la ficha de
    // un ejercicio por nombre, que es lo que pregunta el renglón para saber si
    // pinta marca— y `saveFoodSheet` —tu nota en un alimento—. Son las dos
    // mitades del mismo movimiento: lo que el entrenador escribe en su
    // biblioteca tiene que poder leerse donde se usa.
    //
    // `sheetOf` es una FUNCIÓN y viaja por `DataContext`, que es la excepción
    // que ya justificaba `saveStatus`: no hace nada, lee, y se llama durante el
    // render.
    //
    // Y 246 desde los PLATOS: `addFoodsToOption` mete VARIAS entradas ya
    // construidas de una vez. No es un capricho sobre `addFoodToOption`: esa
    // construye la entrada por dentro, así que quien llama no sabe qué ids han
    // salido — y poner un plato necesita saberlo para poder ofrecer cuadrarlo
    // al objetivo de la comida justo después.
    //
    // Y 248 desde `deleteLibraryFood` y `deleteLibraryExercise`: las dos
    // primeras puertas de la biblioteca que NO escriben. Las cuatro anteriores
    // dan de alta y corrigen, así que una biblioteca solo podía crecer — y el
    // camino de crecimiento de `foods` ES la duplicación, porque los macros de
    // una marca obligan a un nombre nuevo. Son dos y no una porque son dos
    // tablas con dos listas locales que refrescar; el filtro de «solo lo tuyo»
    // sí es uno solo, dentro del gancho.
    //
    // Y 250 desde `editLibraryExercise` y `editLibraryFood`: la corrección por
    // ID, que es la única puerta por la que el NOMBRE de una entrada puede
    // cambiar. Las de siempre identifican por nombre, así que renombrar por
    // ellas creaba una fila nueva en vez de corregir la que hay — o sea, el
    // duplicado que la Librería existe para limpiar. Dos otra vez y por lo
    // mismo: dos tablas con dos listas locales que refrescar.
    //
    // Y 251 desde `marcarVisto` (0108): dar por LEÍDO lo que te han contestado.
    // Es la pareja de `marcarAccion` y no la misma puerta, porque son dos lados
    // distintos — el cliente contesta por RPC porque no puede escribir en la
    // tabla; el entrenador marca con un `update` normal, que ya puede hacer—.
    // Sin ella, «te han contestado» sería cierto para siempre y su cola de la
    // bandeja no se podría vaciar nunca.
    //
    // Y 253 desde el modo sin conexión: `enEspera` —cuántos guardados esperan a
    // que vuelva la red— y `copiaLocal` —de cuándo son los datos que se están
    // mirando, o `null` si vienen del servidor—. Los dos son estado del
    // TRANSPORTE y no del cliente, y los dos existen porque la nube de la
    // esquina (`ui/EstadoDeRed`) tiene que poder decir la verdad: cuánto queda
    // por mandar y de qué momento es lo que hay en pantalla. Ver
    // `lib/instantanea` y `lib/conexion`.
    //
    // Y 255 desde el PORTAPAPELES: `appendMicrocycleWithDays` y `appendMeal`.
    // Las dos son la mitad de arriba de un verbo que ya existía y que sabía
    // hacer las dos cosas de una vez: `cloneMicrocycle` leía un microciclo del
    // cliente y lo escribía a continuación, y `duplicateMeal` hacía lo propio
    // con una comida. Servían para duplicar en el sitio y para nada más, porque
    // origen y destino se decidían en la misma llamada. Partidas, lo de abajo
    // —dónde cae, con qué fecha, con qué ids— vale igual venga de donde venga:
    // de este cliente, del portapapeles o de otra persona. Los verbos viejos
    // siguen, y ahora son una línea sobre estos. Ver `lib/portapapeles`.
    // Y 261 desde LOS DÍAS DE LA DIETA (0111): `addDietDay`, `duplicateDietDay`,
    // `renameDietDay`, `moveDietDay`, `removeDietDay`, `setDietWeekDay` y
    // `repartirPorElEntreno`, a cambio de `setHasDayVariants` — siete verbos
    // donde había un interruptor. Y no es que se hayan partido: `setHasDayVariants`
    // solo sabía contar hasta dos, porque el esquema solo sabía contar hasta
    // dos. Añadir un tercer día, renombrarlo o repartir la semana no eran
    // llamadas que faltaran, eran cosas que no se podían hacer.
    //
    // Y 262 desde el DESHACER del pegado: `removeMealsById`. Pegar un menú son
    // seis comidas al final de la lista, y el «Deshacer» del aviso tiene que
    // poder quitar EXACTAMENTE esas seis seis segundos después, cuando ya se
    // pueden haber movido: `removeMeal` va por posición y no sirve para eso.
    //
    // Y 263 desde que LAS OPCIONES SE NOMBRAN: `renameMealOption`. «Opción 1»
    // dice dónde está la alternativa en una lista, no qué es — y lo lee el
    // cliente, que es quien tiene que elegir una. El nombre es opcional y vive
    // en el propio menú, así que no hay columna nueva. Ver `optionName`.
    //
    // Y 265 desde PONER UNA PIEZA EN VARIOS: `conditionsOfMany` y
    // `addDietDayWithMeals`. Los dos existen porque repartir es escribir en el
    // plan de N personas de golpe: hay que poder decir a quién NO se le puede
    // poner —y eso es una lectura en bloque de los condicionantes, no la del
    // cliente abierto— y hay que poder añadirle un día con su menú en UNA
    // escritura, porque entre `addDietDay` y `setDayMeals` el día existe vacío
    // en la dieta de alguien. Ver `domain/reparto`.
    //
    // Y 266 desde MANDAR LA DIETA ENTERA: `replaceDiet`. Es el único verbo de
    // nutrición que BORRA —una dieta no tiene lista de planes, así que lo que
    // se pisa no queda en ninguna parte— y por eso está solo, lo llama un solo
    // sitio, y ese sitio desmarca todas las filas de fábrica y dice por persona
    // qué pierde. Ver `replaceDietDays`.
    // Y 272 desde EL CAJÓN (0112): `cajon`, `hayCajon` y los tres verbos de
    // guardar, renombrar y tirar, más `cabeEnCajon`. Su relato lo tiene que
    // escribir quien las puso —falta G-04, que es cuando `/plantillas` deja de
    // leer de `preferences`—; aquí se deja dicho de dónde vienen para que el
    // salto no parezca de nadie. Ver `docs/replanteamiento-lo-guardado.md`.
    //
    // Y 273 desde que TUS GRUPOS LLEGAN AL CLIENTE: `gruposEquiv`. Es la otra
    // mitad de una cosa que el entrenador ya tenía —los suyos viven en
    // `coachPrefs`, que es donde los escribe—: esto es lo que le LLEGA a una
    // persona por la función `equiv_groups()` (0113), porque un cliente no
    // puede leer las preferencias de su entrenador. La misma pareja que
    // `exerciseLibrary` y `sheetOf`, y por el mismo motivo. Ver
    // `useEquivGroups`.
    //
    // Y 275 desde que UNA PIEZA CAE ENCIMA DE OTRA (la tanda 3 del
    // portapapeles): `setBlockSheetExercises` y `setMealOptions`. Los dos son
    // el mismo movimiento en las dos mitades de la aplicación —pegar una hoja
    // sobre un día que ya existe, y una comida dentro de otra como
    // alternativa—, y los dos escriben una LISTA entera de una vez. No son un
    // atajo de los verbos de uno en uno: con aquéllos, un gesto serían N bajas
    // y M altas, la pantalla parpadearía por los pasos intermedios y el
    // «Deshacer» tendría que rehacerlos al revés y en orden. Escribiendo la
    // lista, el inverso es la lista de antes. Ver `docs/estudio-portapapeles.md`.
    //
    // Y 274 desde que el PLATO es una forma del portapapeles (0114): se retira
    // `copyOptionToVariant`, que llevaba una alternativa a la comida que se
    // llamara igual en otro día. Era el único camino que tenía una ración para
    // salir de su comida, y el peor de los dos: elegía el destino por su cuenta,
    // solo llegaba a los días de la misma persona y no pasaba por la mano. Lo
    // sustituyen `copiarPlato` y `pegarPlato`, que no son acciones del contexto
    // sino la mecánica de siempre —`setMealOptions` y `addFoodsToOption`—.
    //
    // Y 280 desde que hay cosas que PASAN SOLAS (0116, tanda 2 del protocolo).
    // Seis, y son tres parejas de dato y verbo:
    //
    //   · `automatizaciones` + `automatizacionesReady` — las reglas del
    //     protocolo. La segunda no es un lujo: sin ella, el carril de un
    //     protocolo que todavía está cargando enseña «aquí no le pasa nada
    //     solo», que es una mentira que dura un segundo y hace dudar del resto.
    //     Mismo par que `envioRows` / `enviosReady`, y por el mismo motivo.
    //   · `corridas` — el libro de a quién le ha corrido qué. Es una CACHÉ y no
    //     la verdad: quien impide el doble disparo es el índice único de la
    //     base. Está en el reparto porque el repaso la lee para no pedir lo que
    //     ya sabe hecho.
    //   · `guardarAutomatizacion`, `quitarAutomatizacion` y
    //     `correrAutomatizaciones`. La tercera es el motor 1 entero —calcular
    //     qué filas tendrían que existir ya y escribirlas— y es acción del
    //     contexto y no de la pantalla porque la llaman dos sitios que no se
    //     conocen: el arranque, y cada vez que se guarda un paso.
    //
    // Ver `useAutomatizaciones` y `docs/protocolo-y-automatizaciones-v1.md` §8.
    //
    // Y 283 desde que el PLAN SE PUEDE DESHACER: `deshacerPlan`, `rehacerPlan`
    // y `pasosDelPlan`. Los dos verbos van a la fachada; el dato va al reparto
    // de datos y no con ellos porque la pantalla enseña el mando SOLO cuando
    // hay algo que deshacer, y detrás de la fachada estable —que nunca cambia
    // de identidad a propósito— no se enteraría de que la pila ha cambiado.
    // Es el mismo motivo por el que `saveStatus` tampoco está con las acciones.
    //
    // Las fotos NO salen del contexto: lo único que se reparte es cuántos
    // pasos hay a cada lado. Nadie fuera tiene nada que hacer con un programa
    // entero, y sacarlas invitaría a pintar con ellas. Ver `useWorkout` y la
    // ley en `domain/deshacer`.
    //
    // Y 284 desde que el aviso de lo no guardado sale del chasis: se va
    // `hasUnsavedChanges` —que era `saving || error || pending` y encendía una
    // chapa al TECLEAR— y entran `fallosAlGuardar`, que cuenta solo lo que el
    // servidor ha rechazado, y `reintentarLoFallido`, su verbo. Neto: una más.
    // Lo pinta la franja de `ui/EstadoDeRed`, no la esquina de la cuenta.
    //
    // Y 287 desde que LA SESIÓN TIENE PRINCIPIO Y FIN (0119, tanda 2 del móvil):
    // `closeSession` estampa el fin —lo que permite decir «te ha costado 52 min»
    // y lo que la saca de «la dejaste a medias»—, `discardSession` borra la que
    // se dejó a medias y `logExerciseNote` guarda lo que el cliente dice de UN
    // ejercicio. Las tres son acciones del cliente sobre una sesión que ya
    // existe, así que las tres van por función de la base y no por `UPDATE`.
    //
    // Y 290 desde que EL REPARTO SIGUE AL OBJETIVO: `toggleMealFijo` pone y
    // quita el candado de una comida —la que no se mueve cuando cambian las
    // kcal del día—. Es del reparto y no del ajuste: se decide una vez en la
    // mesa y vale para todos los ajustes que vengan. Ver `repartoAlObjetivo`.
    //
    // Y 291 desde EL BORRADOR DEL CUESTIONARIO (0121, teléfono del 18 sep):
    // `saveCheckInAnswers` guarda las respuestas de la semana sin entregarla,
    // porque en el teléfono la revisión se hace por pasos sueltos y se entrega
    // al final con un botón aparte.
    //
    // Y 292 desde EL ESQUEMA DE SERIES: `setBlockExerciseScheme` escribe la
    // pauta de un ejercicio del bloque cuando sus series no piden lo mismo
    // («1 × 12, 3 × 6-8»). No es `setBlockExerciseSets` con otro argumento:
    // aquellas dos dicen cuántas series hay y qué piden TODAS, y esta dice
    // cómo se reparten. Ver `setsDesdeTramos`.
    //
    // Y 293 desde QUITAR UNA COLUMNA DE LA HOJA: `updatePlanExercises` escribe
    // varios ejercicios del plan en un solo paso —el «×» del rótulo «kg» vacía
    // el peso de toda la hoja con un único «Deshacer»—. Es `updatePlanExercise`
    // para una lista, cada ejercicio donde vive. Ver `updatePlanExercisesIn`.
    //
    // Y 295 desde RENOMBRAR UN EJERCICIO SIN QUITARLO: `renameBlockExercise`
    // (la rejilla del bloque, por nombre) y `renamePlanExercise` (la hoja de un
    // microciclo, por id, donde el ejercicio vive). Conservan el objeto entero
    // y arrastran las excepciones de su hoja. Ver `renameBlockExerciseIn`.
    //
    // Y 296 desde DUPLICAR UNA HOJA EN UNA ESCRITURA: `duplicateBlockSheet`.
    // Antes eran `addBlockSheet` y un `addBlockExercise` por ejercicio, y la
    // copia perdía por el camino las notas, la indicación y el calentamiento.
    // Ver `duplicateBlockSessionIn`.
    //
    // Y 300 desde EL PLAN APUNTA A UNA FECHA (0122): el dato `anchors` —los
    // eventos a los que apunta su plan— y sus tres acciones: `saveAnchor`
    // (fijarlo o moverlo), `removeAnchor` (quitar la marca, no el evento) y
    // `shiftFuturePhases`, que mueve las fases que aún no han empezado SOLO
    // cuando el entrenador marca la casilla. Ver `docs/eje-temporal.md`.
    //
    // Y 304 desde EL ROADMAP SEMANA A SEMANA (0123, 0124): los datos `hechos`
    // —competiciones, vacaciones, refeeds y diet breaks del plan— y
    // `dietVersions` —la pauta fechada—, y dos acciones: `igualar` y
    // `quitarReplanteo`. Ver `docs/roadmap-replanteo.md`.
    //
    // Y 305 desde EL LADO DE LAS LATERALES ANTIGUAS: `declararLadoAntiguo`
    // escribe, de una vez por cliente, el lado de las fotos que se subieron
    // cuando había una sola lateral. Ver `lateralesAntiguas`.
    //
    // Y 306 desde que EL MICROCICLO SE GUARDA EN EL BLOQUE (F2b):
    // `cambiarCicloDelBloque` lleva el tipo y el patrón de la ficha al bloque
    // abierto, que ya no los lee de la ficha.
    //
    // Y 305 con EL MICROCICLO COMO SECUENCIA (F2c): se van `updateWeeklySplit`
    // («Cae el …» escribía `weekly_split`) y `cambiarCicloDelBloque` (el tipo
    // en los ajustes), y entra `ponerMicrocicloDelBloque`, que escribe la
    // secuencia entera de un bloque.
    //
    // Y 307 con LAS SERIES QUE NO SE GUARDARON: `seriesNoGuardadas` son las que
    // el servidor rechazó (su hoja se renombró o se quitó con el teléfono
    // abierto), apuntadas en el navegador para que no desaparezcan, y
    // `leerSeriesNoGuardadas` las cuenta al entrenador (0132), que las lee en la
    // tarjeta del entreno de su Revisión.
    //
    // Y 312 con LOS BLOQUES EN BORRADOR (0133): `anadirBorradorDelBloque`,
    // `cambiarBorradorDelBloque` (rellenarlo, sin empezarlo),
    // `quitarBorradorDelBloque` y `devolverBorradorDelBloque` (su Deshacer), y
    // `empezarBorradorDelBloque`, que lo pasa a bloque con su id.
    //
    // Y 313 con LA LENTE DE ENTRENO: `ponerReferenciasDelBloque` guarda qué
    // ejercicios quiere seguir el entrenador en cada bloque. Es la misma forma
    // —`{ ejercicioId?, nombre }`— que ya llevaban los borradores.
    //
    // Y 315 con LAS REVISIONES PASADAS (0134): `filaDeRevision` crea la fila de
    // una semana sin entregarla —el cierre de quien no entregó— y
    // `reabrirRevision` le abre al cliente una pasada hasta una fecha.
    //
    // Y 317 con dos del 23 sep: `marcarExcepcionVista` («Es intencionado» en la
    // marca de una excepción) y `cambiarFechaDeSesion`, el mini calendario del
    // día de una sesión que comparten entrenador y cliente (0135).
    //
    // Y 320 con EL CREADOR DEL PLAN: `estirarFase` (el arrastre del final de
    // una fase, que empuja las de detrás; 0136) y `anadirHecho`/`quitarHecho`,
    // los hechos del plan puestos desde su barra.
    //
    // Y 326 con ATRASAR LAS SESIONES (0138): los datos `sessionPlans` y
    // `sessionDelays`, y sus cuatro acciones —`atrasarSesiones` y
    // `deshacerAtraso` del cliente, `verAtrasos` del entrenador y
    // `reloadPlanDeSesiones`—. Ver `domain/planDeSesiones`.
    //
    // Y 328 con LAS TEMPORADAS de la lista de bloques: `ponerTemporada` (la
    // `folder` de una lista de bloques y previstos) y `moverBorradorDelBloque`.
    // Ver `domain/temporadas`.
    //
    // Y 330 con LAS INTERVENCIONES (0143): el dato `notasDeIntervencion` (el
    // motivo, la valoración y las ventanas de cada una) y `guardarIntervencion`.
    // Ver `domain/intervenciones`.
    expect(Object.keys(visto.app).length).toBe(330);
  });

  /*
    ══ Lo que las pantallas piden TIENE que existir ═══════════════════════════

    Esta prueba nació de un fallo que costó una tarde: la pantalla de nutrición
    pedía `ensureNutrition` —que existe en el proveedor, pero se le pasaba a
    `useWorkout` y nunca se puso en la fachada—, así que llegaba `undefined`.
    Nada falla al arrancar: el desestructurado de una clave que no está no es un
    error en JavaScript. Fallaba al PULSAR, dentro de un `async`, así que el
    error se lo tragaba una promesa sin dueño y lo único que se veía era que la
    dieta importada no se guardaba.

    Ni el linter ni el compilador ven eso, y el recuento de claves tampoco: la
    fachada estaba completa, lo que faltaba era una clave concreta. Así que se
    comprueba lo único que lo habría cazado — que todo lo que alguien pide con
    `useApp()` está de verdad ahí—.
  */
  it('todo lo que alguna pantalla desestructura de `useApp()` existe', () => {
    montar();

    const pedidas = new Map();
    const mirar = (dir) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) {
          mirar(ruta);
          continue;
        }
        if (!/\.jsx?$/.test(entrada.name) || /\.test\./.test(entrada.name)) continue;

        const codigo = readFileSync(ruta, 'utf8');
        /* Sin llaves dentro: así el desestructurado no se puede comer al de
           arriba —`const { open } = useOtraCosa()` seguido de este—. */
        for (const m of codigo.matchAll(/const\s*{([^{}]*)}\s*=\s*useApp\(\)/g)) {
          const nombres = m[1]
            /* Los comentarios de dentro del desestructurado no son claves. */
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, '')
            .split(',')
            .map((n) => n.split(':')[0].trim())
            .filter(Boolean);
          for (const nombre of nombres) if (!pedidas.has(nombre)) pedidas.set(nombre, ruta);
        }
      }
    };
    mirar(new URL('../', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'));

    const ausentes = [...pedidas]
      .filter(([nombre]) => !(nombre in visto.app))
      .map(([nombre, ruta]) => `${nombre} (${ruta.split(/[\\/]/).slice(-2).join('/')})`);

    expect(pedidas.size).toBeGreaterThan(50);
    expect(ausentes).toEqual([]);
  });

  it('toda acción es una función', () => {
    montar();
    const noSonFuncion = Object.entries(visto.acciones)
      .filter(([, v]) => typeof v !== 'function')
      .map(([k]) => k);
    expect(noSonFuncion).toEqual([]);
  });

  /*
    La fachada se congela para que nadie le cuelgue nada en caliente: un
    `actions.loQueSea = …` desde un componente se perdería en el siguiente
    montaje y sería imposible de encontrar.
  */
  it('la fachada de acciones está congelada', () => {
    montar();
    expect(Object.isFrozen(visto.acciones)).toBe(true);
  });

  /*
    `saveStatus` es una función pero NO es una acción: no hace nada, LEE el estado
    de guardado y se llama durante el render. Detrás de la fachada estable, un
    componente no se enteraría de que un guardado ha fallado — que es justo lo que
    la cola de guardado existe para evitar. Tiene que vivir con los datos.
  */
  it('`saveStatus` va con los datos, no con las acciones', () => {
    montar();
    expect(visto.datos).toHaveProperty('saveStatus');
    expect(visto.acciones).not.toHaveProperty('saveStatus');
    expect(visto.datos.saveStatus('workout', 'quien-sea')).toEqual({
      status: 'idle',
      error: null,
    });
  });

  it('arranca cargando y sin sesión', () => {
    montar();
    expect(visto.sesion.loading).toBe(true);
    expect(visto.sesion.session).toBeNull();
  });
});
