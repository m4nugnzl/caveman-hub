# Caveman Hub

Aplicación de gestión de entrenamiento personal: programación de rutinas,
nutrición, antropometría y seguimiento de la evolución física con fotos.

Dos roles sobre la misma base de datos:

- **Entrenador** — da de alta clientes, les programa microciclos, define su plan
  nutricional, registra sus mediciones y monta comparativas de sus fotos.
- **Cliente** — consulta su rutina y registra lo que levanta, ve su dieta, anota
  su peso semanal y **sube sus fotos de progreso**, que le llegan al entrenador.

## Stack

| Pieza | Tecnología |
|---|---|
| Build y dev server | Vite 5 |
| Interfaz | React 18 (JSX, sin TypeScript por ahora) |
| Iconos | lucide-react |
| Backend | Supabase — Postgres + Auth + Storage |
| Estilos | CSS propio con tokens y utilidades (`src/index.css`) |
| Lint | ESLint 9 (flat config) + react-hooks |

No hay framework de servidor: es una SPA que habla directamente con Supabase, y
la autorización la aplican las políticas de **Row Level Security** de la base de
datos.

## Arrancar el proyecto

```bash
npm install
cp .env.example .env      # rellena con los datos de tu proyecto Supabase
npm run dev               # http://localhost:3000
```

Las variables van en `.env` (Supabase Dashboard → *Settings* → *API*):

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

La `anon key` es segura de exponer en el cliente: toda la autorización real vive
en RLS. **Nunca** pongas aquí la `service_role key`.

Necesitas además el esquema de base de datos y un bucket privado llamado
`client-media`. Ver **[`supabase/README.md`](supabase/README.md)** — incluye la
estructura que la aplicación espera y cómo exportar el esquema real.

### Comandos

```bash
npm run dev       # servidor de desarrollo
npm run build     # build de producción en dist/
npm run preview   # sirve el build para comprobarlo
npm run lint      # ESLint sobre todo el proyecto
npm run types     # comprueba el contrato de los JSONB (solo archivos con @ts-check)
npm run verify    # comprueba que no hay clases ni tokens CSS sin definir
npm run test      # tests del dominio
npm run test:db   # tests contra una base de datos (ver abajo) — NO entra en check
npm run check     # todo lo anterior + build de producción
npm run backup    # copia de seguridad completa (filas, cuentas y fotos)
npm run restore   # y devolverla a una base vacía — ensayado, ver docs/copias.md
npm run radiografia  # informe de uso, salud, seguridad y negocio (docs/observabilidad.md)
npm run demo      # siembra una cuenta de demostración con cartera (ver abajo)
npm run demo:limpiar
```

`demo` da de alta un entrenador con seis clientes, diez semanas de programa,
treinta pesajes, dieta y fotos **en el proyecto de usar y tirar de `.env.test`**,
con la misma guarda que `test:db`: si esa URL coincide con la de la aplicación,
no corre. Sirve para ver la aplicación llena —que es la única forma de juzgar
una pantalla nueva— y para sacar las capturas de la portada
(`public/capturas/`). Las credenciales las imprime al terminar.

Para abrir la aplicación contra esos datos, un `.env.demo` con la URL y la
`anon key` del proyecto de pruebas y `npx vite --mode demo`.

`backup` no es parte de `check`: corre contra la base de datos real y necesita la
`service_role key` en `.env.backup`. Ver **[`docs/copias.md`](docs/copias.md)**.

`radiografia` tampoco, y usa esa misma clave. Genera en `informes/` un HTML
autocontenido con lo que la aplicación no puede enseñar desde dentro: qué
pantallas se abren y cuáles no, qué campos se rellenan de verdad, qué se rompe y
a cuánta gente, y el estado real de RLS y los permisos leído del catálogo de
Postgres. Ver **[`docs/observabilidad.md`](docs/observabilidad.md)**.

## Rutas

La URL es el estado de la navegación, no un `useState`. Eso es lo que permite
recargar sin perder el sitio, usar el botón atrás y compartir un enlace a la
pantalla concreta de un cliente.

| Ruta | Qué es |
|---|---|
| `/` | La portada pública: qué es esto, para quién y cuánto cuesta. Solo sin sesión |
| `/entrar` | Acceso y alta. Con `?alta=1` abre directamente el registro |
| `/hoy` | La jornada: qué ha pasado en la cartera y qué espera respuesta (entrada del entrenador) |
| `/clientes` | La cartera: alta, estado de cada uno y entrada a la persona |
| `/ajustes/…` | Lo que se configura una vez: protocolo, equipo, integraciones, plan, copia y ayuda |
| `/c/:clientId/semana` | **Su semana**: lo que hizo, lo que entregó y tu respuesta. Es por donde se entra a un cliente |
| `/c/:clientId/resumen` · `analitica` | **Progreso**: el resumen y la revisión a fondo |
| `/c/:clientId/revision` · `revision/fotos` | **Revisión**: su check-in y sus fotos. Una tarea, una sección |
| `/c/:clientId/rutina` · `nutricion` · `calendario` · `ficha` | Sus demás secciones |
| `/mi/hoy` · `rutina` · `dieta` · `evolucion` · `evolucion/fotos` · `panel` · `analitica` · `calendario` | Portal del cliente |

El cliente activo lo manda la ruta: `/c/:clientId/...` sincroniza
`selectedClientId` en el contexto, nunca al revés. Las secciones se declaran una
sola vez en **`src/routes.jsx`**, de donde salen tanto las pestañas como las
rutas.

Las rutas retiradas siguen vivas y redirigen —`/cartera`, `/c/:id/fotos`,
`/c/:id/checkins`, `/mi/fotos`, `/mi/checkins`—: están en marcadores y en enlaces
compartidos por WhatsApp.

La navegación tiene **dos niveles**: arriba solo dos entradas (Hoy y Clientes), y
el segundo nivel aparece únicamente cuando estás dentro de algo —las secciones de
un cliente, o las de ajustes—, nunca los dos a la vez. Antes esto eran once
pestañas seguidas mezclando planos distintos. La configuración cuelga del avatar,
que es donde la busca todo el mundo.

**«Su semana» es la sección donde se cierra el bucle.** Mirar lo que le
programaste a alguien, lo que ha hecho con ello, lo que ha entregado y
contestarle cruzaba **cuatro** secciones —Rutina, Revisión, Nutrición y
Progreso—, cada una con su propio selector de semana y ninguna sabiendo en qué
semana estaba la de al lado. Es el mismo argumento que fusionó «Fotos» y
«Check-ins» un piso más abajo, aplicado donde de verdad dolía: la única tarea que
la portada llama «el producto» era la única sin pantalla. Sale entera de
`domain/week.js`, que reúne lo que ya calculaban `training.js`, `analytics.js` y
`anthropometry.js` — no hay ni una consulta nueva. El razonamiento completo, en
[`docs/producto.md`](docs/producto.md).

**Las secciones se llaman como el TRABAJO, no como la tabla.** «Fotos» y
«Check-ins» eran dos entradas y son la misma tarea —mirar lo que ha subido esta
semana y contestarle—, así que ahora son una: **Revisión**, con dos niveles. La
prueba de que el corte anterior estaba mal es que hubo que inventar un *modo*
(`ReviewSession`, con barra flotante) para poder terminar la tarea cruzando de una
sección a otra. Del lado del cliente pasa lo mismo y por el mismo motivo:
pesarse y hacerse las fotos es un solo gesto de la semana, y ahora es **Mi
evolución**. De paso desaparece la segunda puerta para subir fotos.

**«Hoy» y «Clientes» no se repiten.** «Clientes» contesta *en qué estado está cada
uno* —en orden de urgencia—; «Hoy» contesta *qué ha pasado desde ayer*: un hilo
cronológico de entrenos, pesajes, fotos y check-ins de toda la cartera, más una
bandeja con lo que espera respuesta del entrenador. Los dos salen de los datos que
ya se cargan al arrancar, sin una consulta más.

**La marca de «estás aquí» no la decide el prefijo de la URL.** Desde que una
sección tiene dos niveles, `NavLink` se queda corto: `analitica` no empieza por
`resumen`, así que bajar al segundo nivel dejaba el carril entero sin marcar. Los
niveles de cada sección se declaran en `also` (`routes.jsx`) y los tres sitios que
navegan —carril, pestañas y barra inferior— preguntan a `isSectionActive`.

### Ir a cualquier sitio: `⌘K` / `Ctrl+K`

La paleta de comandos busca clientes, secciones y acciones. Tiene **dos niveles**,
igual que la navegación: escribes el nombre de un cliente, pulsas `Tab` y a partir
de ahí la lista son sus siete secciones. Sin eso serían ciento cuarenta entradas
en una sola lista. El filtro ignora tildes y mayúsculas.

### Móvil

Por debajo de 760 px las pestañas de arriba se sustituyen por una **barra
inferior** —donde llega el pulgar—, con las cuatro secciones más usadas y una hoja
para el resto, respetando el área segura del iPhone. Las secciones del portal del
cliente están ordenadas por uso (rutina, dieta, check-in), no por simetría con el
panel del entrenador: quien lo abre está en el gimnasio y con una mano.

Ninguna pantalla se desplaza en horizontal ni recorta contenido a 320, 390, 768,
1024 o 1280 px. Cuidado con `minmax(300px, 1fr)` al añadir rejillas: `body` lleva
`overflow-x: hidden`, así que lo que desborda no se puede alcanzar, desaparece.
Usa `minmax(min(300px, 100%), 1fr)`.

### Programar y registrar son dos formas distintas

No dos tamaños de pantalla. El entrenador **programa**: recorre ejercicios
comparando estructuras y añade o quita piezas, así que cada serie es una tarjeta
autónoma en un carril. El cliente **registra**: escribe doce números seguidos de
un mismo ejercicio, así que las series son una **tabla** con las etiquetas
(`kg · reps · rir`) una sola vez arriba. Compartir la forma obligaba a repetir
esas tres etiquetas en cada serie, que apiladas en un móvil eran cuatro veces por
ejercicio.

Por eso `/mi/rutina` tampoco pinta ya el microciclo entero. Hay una **tira con las
sesiones de la semana** —qué toca cada día, si es hoy, cuántas series llevas— que
es a la vez la estructura y la navegación, y debajo **una sola sesión abierta**,
la de hoy si hoy toca. Los descansos no son píldoras: son una línea de texto,
porque no llevan a ninguna parte.

> ⚠️ **Al desplegar**: una aplicación de una sola página con rutas necesita que el
> servidor devuelva `index.html` para cualquier ruta. Si no, entrar directo en
> `/c/abc/rutina` da un 404 y la aplicación no arranca. Ya están incluidos
> En el despliegue actual —**Cloudflare Workers**— lo resuelve `not_found_handling`
> en `wrangler.jsonc`. Con Netlify o Cloudflare Pages sería un `public/_redirects`;
> con Nginx o Apache, una regla a mano. Ver [`docs/despliegue.md`](docs/despliegue.md).

## Estructura

```
src/
├── main.jsx                  ErrorBoundary → ConfirmProvider → AppProvider → App
├── App.jsx                   mapa de rutas: Login, panel del coach y portal del cliente
├── routes.jsx                secciones y rutas, declaradas una sola vez
├── index.css                 tokens, primitivas (.btn, .input, .panel…) y responsive
│
├── domain/                   REGLAS DE NEGOCIO — funciones puras, sin React
│   ├── today.js              el hilo de actividad de la cartera y la bandeja
│   ├── portfolio.js          estado y alertas de cada cliente, columnas del tablero
│   ├── training.js           volumen efectivo, tonelaje, MEV/MRV, microciclos
│   ├── anthropometry.js      % graso por pliegues, promedios, series temporales
│   ├── nutrition.js          macros, kcal por alimento/opción/día
│   ├── photos.js             semanas, rutas de Storage, agrupación, ángulos
│   └── photoLayout.js        geometría del montaje de fotos
│
├── lib/                      infraestructura
│   ├── supabaseClient.js
│   ├── mappers.js            frontera snake_case ↔ camelCase
│   ├── saveQueue.js          cola de guardado con debounce y estado
│   ├── useMirroredState.js   estado con espejo sincrónico (ver el archivo)
│   ├── ids.js, num.js, useClickOutside.js
│
├── context/AppContext.jsx    estado global, carga y persistencia
│
└── components/
    ├── ui/                   primitivas compartidas (Panel, Modal, charts…)
    │   ├── CommandPalette.jsx  ⌘K: buscar clientes, secciones y acciones
    │   └── BottomNav.jsx       navegación inferior del móvil
    ├── photos/               diálogo de subida, usado por coach y cliente
    ├── Coach/
    │   ├── Today.jsx         «Hoy»: la regla, el hilo y la bandeja
    │   ├── Workout/          editor de rutina, en piezas
    │   ├── Nutrition/        editor de comidas
    │   └── PhotoStudio/      comparador y editor de fotos
    └── Client/               portal del cliente, una vista por pestaña
```

La separación importante es **`domain/` no sabe que existe React**. Todo lo que
es una regla de negocio (qué cuenta como serie efectiva, cómo se calcula el %
graso, cómo se encaja una foto en un hueco) son funciones puras que se pueden
razonar y testear sin montar un componente.

## Modelo de datos

Híbrido relacional + JSONB. Las entidades con identidad propia son tablas; los
árboles profundos van en columnas `jsonb`, una fila por cliente:

```
microcycles[] → { id, weekNumber, sessionNumber, date, days[] }
                                                  → { dayName, exercises[] }
                                                        → { id, name, muscle, sets[] }
                                                              → { kg, reps, rir, targetReps }
```

Detalle completo de tablas y columnas en [`supabase/README.md`](supabase/README.md).

### Cómo se guardan los cambios

Toda mutación es optimista: primero se actualiza la interfaz, después se
persiste. Tres garantías, implementadas en `src/lib/saveQueue.js`:

1. **Una sola petición en vuelo por clave.** Si llegan más cambios mientras se
   guarda, se retiene el último y se reenvía al terminar. Sin esto, una respuesta
   antigua puede llegar después de una nueva y pisar el cambio reciente.
2. **Debounce en los campos de texto.** Escribir `102.5` en un campo de kg
   lanzaba cinco escrituras, y cada una reserializaba el programa completo. Los
   cambios estructurales (añadir, borrar, reordenar) sí se envían al instante.
3. **Los fallos se ven.** El estado de guardado es `saving` / `saved` / `error`
   con botón de reintento. La interfaz nunca dice «Guardado» sobre una escritura
   que falló.

## Fotos de progreso

El circuito completo:

1. El cliente sube una foto desde **Mis fotos**, indicando semana y ángulo
   (frontal / lateral / espalda).
2. Se guarda en el bucket privado `client-media`, en
   `<clientId>/photos/week-<n>/…`. Las carpetas por semana son reales.
3. Al entrenador le aparece en **Fotos & Evolución**, agrupada por semana.

En el **Photo Studio** el entrenador puede:

- Comparar en tres composiciones: **antes/después**, **rejilla** de varias
  semanas, y **deslizador** superpuesto.
- **Encuadrar** cada foto (zoom, desplazamiento, rotación, espejo) para que dos
  fotos de semanas distintas queden a la misma escala y altura. Sin esto la
  comparación engaña: dos fotos a distinta distancia sugieren un cambio que no
  existe.
- **Ajustar** brillo, contraste y saturación para compensar diferencias de luz.
- **Anotar** con guías horizontales, líneas, flechas y texto.
- **Exportar** a PNG en proporción automática, 1:1, 4:5, 9:16 o 16:9.

Los ajustes son **no destructivos**: son parámetros de renderizado del montaje.
El archivo original en Storage no se modifica nunca.

## Decisiones y deuda técnica conocida

Cosas que están así a propósito, y por qué:

- **Tipado solo en la frontera.** El contrato de los JSONB está declarado en
  `src/types.d.ts` y se comprueba con `npm run types` (dentro de `npm run check`),
  pero **solo en los archivos que lo piden** con `// @ts-check` en su primera
  línea: hoy `lib/mappers.js` y `domain/sessions.js`. El resto del proyecto sigue
  siendo JavaScript sin comprobar. Se amplía archivo a archivo, sin migración.

  Existe porque el contrato ya se rompió una vez: `targetReps` pasó de estar en el
  ejercicio a estar en cada serie, una vista siguió leyendo el sitio antiguo, y no
  falló nada — el objetivo dejó de aparecer, en silencio.
- **Tests del dominio, y dos capas más.** `npm test` cubre `domain/` —las reglas
  que duelen si se rompen— y desde hace poco también el proveedor de contexto
  (que monta de verdad con `renderToString`, sin jsdom) y la instrumentación.

  Aparte va **`npm run test:db`**, que ejercita lo que nunca tuvo red: las
  políticas de RLS y las funciones `SECURITY DEFINER`. Ahí es donde vivieron los
  dos fallos más caros del proyecto —las series escritas en dos sitios, y
  `gen_random_bytes` fuera del `search_path`, que dejó **imposible crear un
  enlace de revisión** durante meses sin que nada lo dijera—.

  No entra en `check` a propósito: necesita un proyecto de Supabase de usar y
  tirar (`.env.test`, ver `supabase/tests/harness.js`) y `check` tiene que poder
  correr sin red en una máquina recién clonada. Sin credenciales, `test:db` se
  salta las suites en vez de fallar. Lleva una guarda que se niega a correr si
  apunta al mismo proyecto que la aplicación: crea y borra cuentas.

  Los componentes de pantalla siguen sin tener pruebas.

- **Instrumentación propia, no de terceros** (migración 0045). `lib/analytics.js`
  apunta uso —qué pantallas se abren, quién llega a invitar a su primer cliente—
  en una tabla de Supabase. No se usa una herramienta de las de siempre por dos
  razones: la CSP limita `connect-src` a Supabase, y esto guarda datos del
  artículo 9, así que mandar el comportamiento a un tercero sería una cesión que
  habría que declarar y consentir.

  Tres reglas que la sostienen: el nombre del evento tiene que ser un
  identificador corto —lo impone un CHECK, así que un nombre o un correo no
  pasan—, en las propiedades van tramos y no cifras (`bucket`), y **no hay
  `client_id`**. Al cliente final no se le instrumenta: quien es el sujeto de los
  datos no va a ser además el sujeto de la medición.
- **Tres contextos, no uno.** Era uno solo con 154 claves, y se rehacía en cuanto
  cambiaba cualquiera de ellas: escribir un carácter en un campo de kilos volvía
  a pintar los 44 componentes que llaman a `useApp()`, incluidos el menú de
  cuenta y el panel de soporte, que no leen ninguno de los datos que habían
  cambiado. El problema no era que se pintaran de más, era que estaban
  **suscritos a más de lo que leen**.

  Ahora se parte por frecuencia de cambio: `useSession()` (quién eres),
  `useData()` (la cartera y sus bloques) y `useActions()` (las 120 funciones,
  detrás de una fachada de identidad fija que **no cambia nunca**). `useApp()`
  sigue existiendo y devolviéndolo todo junto, así que el corte entró sin tocar
  ningún componente; lo que se gana está en bajar cada pantalla al gancho que de
  verdad necesita, y eso va archivo a archivo.

  `saveStatus` vive con los DATOS aunque sea una función: no hace nada, lee el
  estado de guardado durante el render. Detrás de la fachada estable, un
  componente no se enteraría de que un guardado ha fallado.

  Sigue en pie que esto mezcla caché de servidor con estado de interfaz: una
  librería de datos (TanStack Query) daría revalidación, reintentos y rollback
  automáticos.
- **Escritura concurrente: detectada, no fusionada.** Ya no se pierde trabajo en
  silencio —ver abajo— pero la resolución la decide una persona: quedarse con la
  versión del servidor o imponer la suya. Fusionar de verdad exige separar el
  **plan** (del coach) del **registro de ejecución** (del cliente) en tablas
  distintas.
- **Carga inicial completa.** Al entrar se traen los BLOQUES de todos los
  clientes —rutina, antropometría y nutrición— porque la cartera y «Hoy» son
  transversales y los necesitan para deducir el estado de cada uno. Las fotos ya
  no se firman al arrancar, pero las filas sí se traen. Con doscientos clientes
  hará falta un resumen calculado en el servidor.
- **Un solo idioma, y es una decisión, no un olvido.** Todo está en castellano y
  embebido en el JSX: `<html lang="es">` y unas 44.000 líneas sin una capa de
  traducción. **Decidido en agosto de 2026: más idiomas SÍ, pero no ahora.**

  Lo que eso significa en la práctica, para que «a futuro» no se vuelva «nunca»:
  no hay que montar `i18n` hoy —una migración a medias, con dos patrones
  conviviendo, es peor que ninguna—, pero **conviene no repartir más la lógica de
  idioma**. Las cadenas se extraen mecánicamente el día que haga falta; lo que
  encarece de verdad es tener `toLocaleDateString('es-ES', …)` y decisiones de
  formato esparcidas por los componentes.

  El paso barato y pendiente, cuando se toque el tema: centralizar el formateo de
  fechas y números en `lib/dates.js`, que ya existe para eso. Extraer las cadenas
  puede esperar sin coste creciente; el formateo disperso, no.

- **Vulnerabilidad de `esbuild` (moderada, solo desarrollo).** Afecta al dev
  server de Vite 5, no al build de producción (`npm audit --omit=dev` da 0).
  Resolverla exige subir a Vite 6/7, que es un cambio con rupturas.

## Guardado: qué garantiza y qué no

Toda mutación es optimista. Además de la cola (`lib/saveQueue.js`), hay dos
candados que conviene conocer antes de tocar el guardado:

- **Nadie pisa a nadie.** Cada bloque se escribe solo si su `updated_at` sigue
  siendo el que leímos (`upsertClientRow`). Si otra pestaña o el cliente han
  escrito en medio, la escritura se **rechaza** y aparece un aviso con dos
  salidas: quedarse con la versión del servidor o imponer la propia. Antes
  `updated_at` se escribía y nadie lo comparaba: ganaba el último y el otro no se
  enteraba.
- **El cliente escribe por operaciones, no por filas.** No tiene UPDATE sobre
  `workout_data`: anota series con `log_session_set` y contesta con
  `log_session_feedback` (migraciones 0014 y 0016). La fila lleva su programa
  entero en un jsonb, y RLS filtra filas y no columnas.

## Datos personales

La aplicación guarda fotos corporales, peso, pliegues y perímetros: categoría
especial del RGPD. En **Clientes**, cada ficha tiene «Datos personales» con:

- **Exportación** — un JSON con todo lo que se guarda de esa persona, incluidos
  enlaces firmados a sus fotos (caducan a los 7 días; el propio archivo lo dice).
- **Borrado completo** — sus archivos del bucket, sus bloques, sus check-ins, su
  calendario y su ficha. Pide escribir el nombre: es la única acción de la
  aplicación sin deshacer ni papelera. Si algo queda sin borrar, se dice cuál.

Lo que **sigue faltando** para cumplir del todo: registrar el **consentimiento**
(quién ve sus fotos y para qué) y una copia de seguridad propia.

## El protocolo — el entrenador diseña su app

Lo que se le pide a un cliente no lo decide el producto: lo decide su entrenador.
En **Ajustes → Protocolo** se encienden los módulos y se eligen las preguntas, y
lo que esté apagado no existe — ni al programar ni al entrenar.

Detrás hay una sola idea, y es la que evita que esto sean cinco funciones sueltas:

- **Una pregunta con respuesta numérica ya es una serie temporal.** Por eso el
  feedback de sesión no tiene analítica propia: cada escala entra en el mismo
  catálogo de widgets y gráficos que el peso o el tonelaje (`domain/preferences.js`),
  y se configura, ordena y esconde por el mismo sitio.
- **El resto es contenido que baja del entrenador**: su nota en una sesión y el
  calentamiento con sus vídeos.

| Qué | Dónde vive | Migración |
|---|---|---|
| Configuración del protocolo | `clients.preferences.protocol` (tope 8 KB) | No |
| Calentamiento y movilidad | `workout_data.mobility_drills` | No — la columna existía sin usar |
| Nota del entrenador | `session.coachNote` | No |
| Cuaderno del cliente y feedback | `session.clientNote` / `session.feedback` | **0016** para que el cliente pueda escribirlos |

La plantilla del entrenador se guarda en su navegador (`lib/protocolTemplate.js`)
y se propaga con «Aplicar a todos»; lo que está en la base de datos es el
protocolo ya aplicado a cada cliente. Se puede perder la plantilla, nunca lo que
tus clientes tienen puesto.

## Lenguaje visual — «Hierro y tiza»

Todo el color, la tipografía y la forma viven en **`src/styles/tokens.css`**, con
el razonamiento entero. Lo mínimo para no romperlo:

- **El cromo no tiene color. El color es del dato.** El acento es *tiza*: casi
  blanco sobre hierro, casi negro sobre papel. Un botón primario es el máximo
  contraste posible contra su fondo, no un color de marca. A cambio, el círculo
  cromático entero queda libre para lo que de verdad necesita distinguirse: nueve
  grupos musculares, tres macros, cinco series en un mismo gráfico.
- **La paleta de datos sale de los discos** — rojo 25, azul 20, amarillo 15,
  verde 10 —, que un entrenador lee sin traducirlos.
- **Dos tierras, ninguna es la inversa de la otra.** *Papel* (claro) se apoya en
  la sombra; *hierro* (oscuro) en el canto, porque una sombra sobre grafito no se
  ve. Toda superficie lleva borde (`--edge`) en los dos temas.
- **La firma es la regla**: marcas de graduación de una cinta métrica. Solo
  aparecen donde de verdad se mide algo — el canto de la cabecera y la escala de
  catorce días de «Hoy» —. Un adorno que solo sale cuando significa algo deja de
  ser adorno.
- **La etiqueta troquelada** (versalita, peso 700, `--tracking-stencil`) es lo que
  ordena la pantalla ahora que el cromo no puede usar color para hacerlo.
- **El color de una métrica se decide UNA vez**, en `domain/metrics.js`. Ninguna
  pantalla elige el color de una cifra: lo pide por el identificador de lo que
  está enseñando. Antes lo elegía cada una, y por eso el peso era de tres colores
  distintos según dónde se mirara y la adherencia de tres en el mismo archivo.
  Una métrica sin serie temporal —un recuento de fotos, «4 de 3 pesajes»— **no
  lleva color**: va en tinta plena.

### La gramática de una pantalla

**Toda pantalla de ruta se abre con `PageHead`**, sin excepciones: título, una
línea de contexto y como mucho UNA acción primaria. Antes solo lo hacían tres de
veinticuatro y el resto entraba directamente en barras de herramientas y
selectores, que es lo que hacía que cambiar de sección se sintiera como cambiar
de aplicación.

Cuatro niveles y ni uno más. Están en `components/ui/primitives.jsx` y el porqué
de cada uno, en [`docs/producto.md`](docs/producto.md) §5.

| Pieza | Etiqueta | Qué nombra | Cuántas por pantalla |
|---|---|---|---|
| `PageHead` | `h1` | cómo se llama esta pantalla | exactamente 1 |
| `GroupHead` | `h2`, en troquelada | de qué va esta tanda de bloques | 0, 1 o 2 |
| `Panel title` | troquelada | qué es este bloque | las que hagan falta |
| `SectionTitle` | `h3` | una pieza dentro de un bloque | ídem |

Y tres reglas que se revisan en el diff: una tarjeta **nunca** navega (si lleva a
otro sitio es un chip, una pestaña o un enlace), una fila de métricas tiene **dos
o cuatro** tarjetas —nunca tres, que deja un hueco que se lee como un error de
carga— y un `<h2>` **no va suelto** fuera de un bloque.

`npm run verify` falla si una clase o un token no existen, y avisa si aparece un
color literal fuera de las excepciones declaradas.

## Convenciones

- Los estilos van en **clases CSS** (`src/index.css`). El `style` inline se
  reserva para valores dinámicos de verdad (un ancho calculado, el color de un
  dato). Nada de simular `:hover` con handlers de JavaScript.
- Los números que teclea el usuario se guardan como texto y se convierten con
  `toNum` de `src/lib/num.js`, que devuelve `null` para «sin dato» — `Number('')`
  es `0` y confundir ambos falseaba los cálculos de volumen.
- Los identificadores de entidades dentro de JSONB se crean con `newId()`
  (`crypto.randomUUID`), nunca con `Date.now()`.
- Toda acción destructiva pasa por `useConfirm()`.
- Importaciones con el alias `@/` en lugar de cadenas `../../..`.
