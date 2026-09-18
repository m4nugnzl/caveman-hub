# Por tu cuenta — la app del cliente como producto propio

**18 de septiembre de 2026.** Estudio. Nada de esto está construido.

Encargo del dueño, resumido: *la mayor tarea ahora es la visión del cliente. Hoy el
cliente depende del entrenador, y es normal, pero en el futuro no ha de ser así: la
app tiene que valer por sí misma, para que cualquier persona la use para sí, en web
y en móvil. Replantear el concepto de la app del cliente para tener una app funcional
en sí misma, mirando lo que hacen otras apps y lo que ofrece la nuestra a los dos
lados.*

Escrito contra el código de `master` (migraciones 0000–0120) y contra los documentos
vivos. Todo lo que se cita de código lleva su fichero; todo lo que se cita de otras
apps es conocimiento general del mercado a mediados de 2026, **no medido**, y se
dice dónde conviene comprobarlo antes de decidir.

---

## 0. De dónde se parte: lo que ya está escrito, y dónde se contradice

Este estudio no arranca de cero. Tres documentos ya decidieron partes de esto, y dos
de ellos se contradicen. Hay que ponerlo delante antes de proponer nada.

| Documento | Fecha | Qué decidió | Estado |
|---|---|---|---|
| [`estudio-la-app-del-cliente.md`](estudio-la-app-del-cliente.md) | 13–14 sep | **La frase:** «no es el complemento del panel del entrenador; es una app de entrenamiento que vale por sí sola, a la que además se le puede enganchar un entrenador». Las tres leyes: *el sujeto eres tú*, *toda pantalla tiene pasado*, *lo que hay que hacer cabe en la primera pantalla* | El teléfono, construido. Su pregunta 1 —«¿la app sin entrenador se construye ya, o solo se deja de estorbar?»— se contestó «dejar de estorbar ahora; **el alta libre, cuando toque por hoja de ruta**» |
| [`monetizacion.md`](monetizacion.md) §7.6 | agosto | «Cobrarle al cliente final. No. Rompe la propuesta —"tu entrenador te da la app"—. **El único hueco real, alguien sin entrenador, es otro producto y no un plan de este**» | En producción |
| [`la-sesion-manda.md`](la-sesion-manda.md) y [`estudio-cajas.md`](estudio-cajas.md) | 14–15 sep | El portal en los dos aparatos: los cuatro destinos (Hoy · Entreno · Comer · Tú), la sesión como modo, el puesto del monitor | Construido |

**El encargo de hoy es el «cuando toque» del primero.** Y no contradice al segundo
si se lee con cuidado: la §7.6 decide *quién paga dentro de los planes del
entrenador* (el cliente, nunca), y llama a lo de hoy «otro producto». Este estudio
propone exactamente eso: **otro producto, con su puerta y su precio, montado sobre la
misma aplicación.** Lo que sí hay que enmendar de la §7.6 es la frase «y el cliente
final no elige la herramienta»: quien entra por su cuenta, sí la elige. Se enmienda
en §7 de este documento.

Hay una cuarta pieza escrita que este estudio roza y que hay que decidir a
conciencia: **la ley «la app no receta»** (`referencias/coachway/05-lecciones.md`,
`replanteamiento-protocolo-y-automatizaciones.md`). Está pensada para proteger el
criterio del entrenador. Cuando no hay entrenador, ¿de quién es el criterio? Va en
§4.3 y es la pregunta 4 de §8.

Y una ausencia: **la marca no está definida en ningún sitio.** «Caveman» se usa y no
se explica. Mientras la app fue «lo que tu entrenador te da», no hacía falta. Una app
que alguien se descarga por su cuenta necesita decir qué es en una frase, y esa
frase hoy no existe. Es la pregunta 8 de §8.

---

## 1. La frase

> **Caveman es tu cuaderno de entreno. Con entrenador, la pauta la escribe él. Sin
> entrenador, la escribes tú. El registro es tuyo en los dos casos.**

De aquí sale todo lo demás:

- **Una app, dos modos, un cuaderno.** «Con entrenador» y «Por tu cuenta» no son dos
  productos ni dos apps: son los mismos cuatro destinos con **otra persona
  escribiendo la pauta**. Lo que el cliente hace hoy —apuntar lo que levanta, seguir
  la dieta, pesarse, hacerse las fotos, contestar— es lo mismo en los dos.
- **El cuaderno es de la persona, no de la relación.** Hoy la ficha del cliente
  nace del entrenador y muere con él. Tiene que nacer de la persona y sobrevivir a
  cualquier entrenador que pase por ella. Es lo que `estudio-la-app-del-cliente.md`
  ya dijo —«el plan caduca; el registro no»— llevado al modelo de datos.
- **Engancharse y desengancharse es un gesto, no una migración.** La persona que
  lleva seis meses por su cuenta contrata a alguien, y el entrenador se encuentra
  seis meses de historial delante. Se acaba el contrato y la persona sigue con su
  cuaderno, con la última pauta congelada dentro. Hoy ninguna plataforma de
  entrenadores hace esto (§2), y es la única ventaja que este producto puede tener
  sobre un logbook de consumo por un lado y sobre una plataforma de coaching por
  otro: **está en los dos lados de la puerta.**

---

## 2. Lo que hacen las otras apps

Hay dos familias, y casi nadie cruza de una a otra.

### 2.1 Las apps que una persona se baja por su cuenta

| App | Qué es | Quién escribe el plan | Cómo se paga | ¿Entrenador? |
|---|---|---|---|---|
| **Hevy** | Logbook de fuerza, con rutinas propias y feed social | Tú, o copias una rutina de otro | Gratis con límites (rutinas, gráficas) · Pro ~3–4 €/mes anual | **Sí, desde 2024: Hevy Coach.** El entrenador se engancha a la cuenta que la persona ya tenía |
| **Strong** | Logbook de fuerza, sobrio | Tú | Gratis con límites · Pro ~5 €/mes | No |
| **Fitbod** | El algoritmo escribe cada sesión según lo que hiciste | La app | ~13 $/mes | No |
| **Juggernaut AI · RP Hypertrophy** | Programas de un método concreto, autorregulados | El método, con tus respuestas | ~30–35 $/mes | No (el método es el entrenador) |
| **Boostcamp** | Programas gratis publicados por entrenadores + logbook | Un entrenador, en abierto, pero no *tu* entrenador | Gratis · Pro | Publican, no acompañan |
| **MacroFactor** | Dieta: objetivo de kcal que se recalcula con tu peso y lo que apuntas | La app, a partir de tus datos | ~12 $/mes | No |
| **MyFitnessPal · Yazio** | Diario de comida con base de alimentos enorme | Tú, contra un objetivo que fijas o te calculan | Gratis · Premium ~10–20 $/mes | No |

*Precios aproximados, de memoria, a mediados de 2026. Comprobar los cuatro que
importen antes de fijar una tarifa (§7).*

Lo que tienen en común las que duran: **el registro es el producto.** El plan es
una plantilla que se cambia; las gráficas, los récords y el historial por ejercicio
son lo que hace que no te vayas. Y todas abren en *hoy*: la sesión que toca, el
día de comida que toca.

### 2.2 Las plataformas de entrenadores con app de cliente

TrueCoach, Trainerize, Everfit, Coachway, Efort, Harbiz, ProCoach, Repfy. Todas
iguales en lo que importa aquí:

- **El cliente entra por invitación, o no entra.** Sin entrenador la app es una
  pantalla de «pide a tu coach que te invite». Es exactamente lo que
  `estudio-la-app-del-cliente.md` diagnosticó en la nuestra: «quita el entrenador y
  no queda app: quedan cuatro pantallas explicando a quién esperan».
- **Paga el entrenador.** El cliente no ve planes ni precios. Nuestra
  `monetizacion.md` §7.4 dice lo mismo, a propósito.
- **Cuando se acaba la relación, se acaba el acceso**, y los datos se quedan en la
  cuenta del entrenador. Ningún cliente se lleva su cuaderno.

### 2.3 Quién ha cruzado, y por dónde

Solo un caso claro: **Hevy**, y lo hizo *desde el consumo hacia el coaching*. Primero
millones de personas apuntando sus series por su cuenta; después una capa de
entrenador que se engancha a cuentas que ya existían. El resultado es lo que este
estudio quiere y que ninguna plataforma de entrenadores tiene: el entrenador entra
en un cuaderno con historia, y cuando sale, el cuaderno sigue.

Nadie lo ha hecho *desde el coaching hacia el consumo*, que es nuestro camino. Es
más difícil por una razón concreta: la plataforma de coaching tiene el modelo de
datos atado al entrenador (§3), y hay que darle la vuelta sin romper lo que ya
cobra. Y tiene una ventaja que Hevy no tiene: **guardamos la pauta al lado del
registro** («pedido → hecho, a dos carriles», `estudio-la-app-del-cliente.md`). Un
logbook de consumo no sabe lo que te pidieron; nosotros sí, tanto si lo pidió un
entrenador como si lo escribiste tú hace tres semanas.

### 2.4 Lo que una persona sola necesita y hoy no tenemos

Contado contra el mapa del código (§3):

1. **Escribir su propia pauta** de entreno: elegir un programa, cambiar un
   ejercicio, subir el peso objetivo. Hoy el cliente no tiene UPDATE sobre su plan.
2. **Fijar su propio objetivo** de kcal, macros y pasos. Hoy `nutrition_plans` solo
   se lee.
3. **Un sitio de donde partir**: un programa hecho o su Excel de siempre. Lo
   segundo ya existe (`domain/routineSheet.js`, «Traer un plan»); lo primero, no.
4. **Una semana con final aunque nadie la lea**: el check-in existe, pero tiene
   destinatario. Sin entrenador, ¿quién cierra la semana?
5. **Una puerta**: registrarse sin invitación y entrar en una app que ya funciona.
6. **Un escaparate**: la tienda, el aviso, la báscula que sube el peso sola. Todo
   lo que un entrenador hace hoy a mano por WhatsApp.

Lo que una persona sola **no** necesita y las apps de consumo meten para retener:
feed social, rachas, confeti, insignias. Va contra la voz de la casa («sin
reproches», «el móvil ejecuta») y no se copia. El único «récord» que entra es el
que ya está decidido: sesiones, kilos movidos, semanas seguidas.

---

## 3. Diagnóstico: de qué depende hoy el cliente, con el código delante

No es una opinión sobre pantallas: son cinco dependencias, cada una en un sitio
concreto.

### 3.1 La identidad: un cliente solo nace de un entrenador

- `profiles.role` es una columna con un valor, `'coach'` por defecto
  (`supabase/migrations/0000_base_schema.sql:35-42`). `AppContext` la lee y elige
  **el árbol de rutas entero** (`src/context/AppContext.jsx:967-970`,
  `src/App.jsx:490`): o el panel o el portal, nunca las dos cosas.
- `clients.coach_id` es `NOT NULL` (`0000_base_schema.sql:46`). **Una ficha sin
  entrenador no puede existir.**
- El único camino para ser cliente es canjear una invitación
  (`claim_client_invite`, `0084_…sql:118-197`), que **convierte** la cuenta:
  `UPDATE profiles SET role = 'client'` (`0084:191`). La propia migración lo dice
  en su cabecera: «un entrenador no puede ser además cliente de otro entrenador
  […] las dos cosas a la vez no existen hoy» (`0084:70-75`).
- Y la 0084 rechaza a propósito a quien tenga pinta de entrenador: si el enlace lo
  generaste tú, si tienes clientes, si estás en el equipo de otro
  (`0084:136-154`). Hoy ni siquiera se puede ser cliente de uno mismo por el
  camino de la invitación.

**Lo que sí existe:** cualquiera se registra y nace entrenador con cartera vacía
(`ensure_my_team`, plan Gratis sin plazo). Existe el usuario sin clientes. **No
existe el usuario sin entrenador.**

### 3.2 Los datos: qué escribe el cliente y qué no

| Lo suyo | ¿Escribe? | Dónde manda |
|---|---|---|
| Sus series, su nota, el cierre de sesión | **Sí** | `log_session_set` y compañía (0014, 0119), por operaciones, nunca la fila |
| Su peso, perímetros y pliegues | **Sí** | `anthro_client_insert/update` (0002) |
| Sus fotos | Sube, **no borra** | `photos_client_insert`; el DELETE es del entrenador (0002, 0007) |
| Su check-in, sus formularios, su alta, su gimnasio, su calendario | **Sí** | 0009, 0079, 0080, 0105 |
| **Su plan de entreno** (días, ejercicios, objetivo) | **No** | Se le retiró el UPDATE en 0014; `targetReps` prohibido a propósito: «es el objetivo que pone el entrenador, o sea plan» |
| **Su dieta y su objetivo** (kcal, macros, pasos) | **No** | `nutrition_plans`: solo `nutrition_client_read` (0002:126-134) |
| **Su protocolo** (qué piezas tiene encendidas) | **No** | `clients.preferences.protocol`, del entrenador |
| Borrar sus datos | **No** | `ClientPrivacy.jsx:221`: «pídeselo a tu entrenador» |

La línea que parte la tabla es la que este estudio quiere mover: **el cliente
escribe el registro y solo el registro.** Todo lo que es pauta es del entrenador.

### 3.3 El sentido: el protocolo decide qué app tiene el cliente, y es del entrenador

Este es el hallazgo que más pesa y el menos visible. Las secciones del portal no
son fijas: `clientHomeFor(protocolo)` (`src/routes.jsx:818`) elige la primera
pantalla según los servicios encendidos, y `ConServicio` (`src/App.jsx:296-305`)
expulsa de Entreno o de Comer si el servicio está apagado. El README lo dice como
ley: «lo que esté apagado no existe — ni al programar ni al entrenar».

Un cliente sin entrenador **no tiene protocolo**, y sin protocolo no tiene app. Para
que exista el modo «por tu cuenta» tiene que existir **un protocolo de la casa**:
los dos servicios encendidos, el check-in semanal con las preguntas por defecto
del catálogo, el alta corta. No es una pantalla nueva: es un valor por defecto
donde hoy hay un `null`.

Y la voz: el entrenador sigue siendo el sujeto gramatical de **70 cadenas** del
portal («De tu entrenador», «La verá tu entrenador», «Tu entrenador no ha
programado ejercicios en este día», `HojaDelCliente.jsx:179`). La tanda 2 de
`estudio-la-app-del-cliente.md` —la voz— sigue abierta, y sin ella el modo por tu
cuenta habla de alguien que no está.

### 3.4 El bucle: la semana tiene destinatario

La portada pública vende «la semana se cierra»: el cliente entrega, el entrenador
contesta. `check_ins` tiene `coach_notes`, `reviewed_at`, y la cola «Sin leer» del
entrenador (0108). **Sin entrenador la entrega no llega a ningún sitio**, y la
versión D de `estudio-portal-y-entrenador.md` ya lo advirtió: «sin contrato
semanal, esta versión no tiene dónde poner nada».

Lo que sí existe es la **lectura** de esa semana: `domain/week.js` (programado
contra ejecutado contra entregado), `domain/reading.js` (las cuatro preguntas y el
veredicto), `domain/reviews.js`. Es puro, no sabe de roles, y hoy solo lo mira el
entrenador. Cerrar la semana contigo mismo es enseñarte esa lectura a ti.

### 3.5 La distribución: por WhatsApp y a mano

- El cliente llega por un enlace que el entrenador copia y pega en WhatsApp
  (`producto.md` §3, `monetizacion.md` 4.3). No hay correo transaccional.
- La app es una **PWA** instalable y bien hecha: manifiesto con atajos a
  `/mi/rutina` y `/mi/evolucion`, service worker con precaché, cola sin conexión
  (`lib/saveQueue.js`, `lib/sesionOffline.js`), pantalla despierta entre series
  (`lib/usePantallaDespierta.js`). **No está en ninguna tienda, no manda avisos,
  no lee la báscula ni los pasos del teléfono.** Los pasos se pautan y nadie los
  rellena solo.
- Nada de esto estorba a un cliente de entrenador: su entrenador le manda el
  enlace y le dice «instálala». Estorba a la persona que tiene que **encontrar** la
  app sola.

### 3.6 El negocio: el cliente no paga y no puede ver que hay un plan

`monetizacion.md` §7.4: «Nada del lado del cliente. El cliente no ha contratado nada
y no puede notar en qué plan está su entrenador». La única cuota que le toca —el
almacenamiento— se le dice como «no queda espacio, díselo a tu entrenador». Todo
correcto para el cliente de un entrenador, y todo inservible para quien entra
solo: no tiene a quién decírselo.

---

## 4. El concepto: una app, dos modos, un cuaderno

### 4.1 Los dos modos

| | Con entrenador (hoy) | Por tu cuenta (nuevo) |
|---|---|---|
| **Hoy** | Lo que toca, el peso, lo que te han pedido, lo que te contestó | Lo que toca, el peso, lo que te toca entregar **a ti** (pésate, fotos, cierra la semana) |
| **Entreno** | El bloque, en sesión, el cajón de ejercicios | Lo mismo, **y el bloque se edita**: cambiar un ejercicio, subir el objetivo, montar el siguiente |
| **Comer** | El día que toca, las equivalencias, las notas | El objetivo que fijaste tú, con la calculadora a mano; el menú, si lo escribes |
| **Tú** | Peso, medidas, fotos, tus entregas, tu cuenta, tu entrenador | Lo mismo, sin entrenador; **y la puerta para enganchar uno** |
| **La semana** | La entregas y te la contestan | La cierras tú y te la lee la app: lo que pediste contra lo que hiciste |
| **El protocolo** | El de tu entrenador | El de la casa, con lo que enciendas tú |

Lo que no cambia es más que lo que cambia: los cuatro destinos, la sesión como
modo, el descanso, el cierre, el puesto del monitor, las hojas, el cajón, la ficha
del ejercicio, la báscula, el asistente del check-in, las fotos, el consentimiento.
**El modo por tu cuenta no es una app nueva: es el portal con el lápiz
desbloqueado y sin nadie al otro lado.**

### 4.2 El cuaderno es de la persona

Hoy la unidad es la *ficha* (`clients`), que pertenece a un entrenador y a la que
se le cuelga una cuenta si el cliente entra. La propuesta invierte quién sostiene a
quién:

- **La fila `clients` pasa a ser el cuaderno de una persona.** Le pertenece a
  `client_profile_id`. Puede tener entrenador (`coach_id`, `team_id`) o no tenerlo.
- **Una persona tiene un cuaderno**, para siempre. Los entrenadores pasan por él.
- **Lo que hay dentro tiene autor.** El plan de entreno y el objetivo de dieta
  llevan quién los escribió —el equipo del entrenador, o tú—. Es la ley «el sujeto
  eres tú» llevada al dato: la app dice «1750 kcal desde el 2 de julio», y si hace
  falta, de quién.

De esto salen las dos transiciones, que son lo que ninguna otra app tiene:

**Engancharse.** Dos caminos, los dos con consentimiento:
- El entrenador manda su enlace de siempre. Si quien lo abre ya tiene cuaderno, el
  enlace **no convierte la cuenta**: engancha el cuaderno a la cartera del
  entrenador. El protocolo del entrenador sustituye al de la casa; el historial
  anterior se ve, porque la persona lo consintió al aceptar (art. 9: fotos, peso,
  pliegues; hoy `record_my_consent` ya archiva la versión del texto).
- La persona lo pide desde «Tú»: *Tengo entrenador* → un código que le da al
  entrenador, o su correo. Es la invitación al revés, y no existe hoy.

**Desengancharse.** El entrenador archiva, o la persona se va desde «Tú»:
- El cuaderno se queda con la persona. `coach_id` y `team_id` se vacían.
- **La última pauta se congela dentro del cuaderno** con su autor y su fecha
  («Bloque 3 · de Javier · hasta el 12 de octubre») y pasa a ser editable por la
  persona. No se le quita lo que estaba usando.
- Lo que es del negocio del entrenador —sus cobros, sus notas privadas, sus
  eventos con `privada`— se queda en el entrenador. Lo que es del cuerpo de la
  persona se va con ella. Esta frontera **hay que revisarla con criterio legal**
  (quién es responsable del tratamiento de qué), y no se decide aquí.

### 4.3 Las tres piezas nuevas del modo por tu cuenta

**a) Mi pauta.** Escribir el propio bloque **sin la mesa del entrenador**.
`WorkoutLogEditor.jsx` son 3.156 líneas pensadas para programar a veinte personas
desde un monitor; no es lo que una persona sola necesita en el teléfono. Lo que
necesita cabe en tres gestos, y los tres se apoyan en lo que hay:

| Gesto | Con qué se hace |
|---|---|
| **Partir de algo**: un programa de la casa, tu bloque anterior, tu Excel | `domain/blocks.js` (copiar un bloque), `domain/routineSheet.js` (pegar desde Excel, ya existe), y un **catálogo de programas** nuevo, corto, firmado |
| **Cambiar una cosa**: un ejercicio por otro, el objetivo de una serie | La ficha del ejercicio que ya sube como hoja, con el lápiz; `catalog_exercises` (239) como biblioteca |
| **Montar el siguiente**: cuando el bloque acaba | `continue_program` ya existe como RPC; falta que lo pueda pedir la persona |

**b) Mi objetivo.** Kcal, macros y pasos, fijados por uno mismo. La calculadora
existe en `domain/nutrition.js` (es lo que el entrenador usa para cuadrar). Se le
enseña a la persona **como herramienta que elige**, con su estimación dicha como
estimación. El menú cerrado es opcional: una persona sola suele vivir de un
objetivo y, como mucho, de tres comidas fijas. Aquí choca la ley «la app no
receta», y la lectura que propongo es esta: la ley protege **el criterio del que
lleva a alguien**. Cuando nadie lleva a nadie, el criterio es de la persona, y una
calculadora que ella abre no es una receta: es una regla. Lo que sigue prohibido es
que la app **proponga** cambiar algo sin que se lo pidan, en cualquiera de los dos
modos. Es la pregunta 4 de §8.

**c) Mi semana.** El domingo, la app te pide lo mismo que hoy pide el entrenador
—pésate, fotos, contesta— y **te lo lee**: la lectura de `domain/week.js` y
`domain/reading.js` que hoy solo ve él. Lo que pediste contra lo que hiciste, el
ritmo del peso contra el objetivo, el veredicto. Sin consejo: la casa no receta. Es
la pantalla «Su semana» del entrenador (`producto.md` §6) girada hacia la persona, y
no necesita una consulta nueva.

### 4.4 Lo que no cambia, y es la mayor parte

- Los cuatro destinos y todo lo construido en `Client/movil/` y `Client/pc/`.
- `domain/` entero: los 70 módulos no saben de roles (`domain/training.js:1-4` lo
  dice literalmente). Este estudio no toca ni una regla de negocio.
- **RLS como única frontera.** Se amplía, no se salta.
- El panel del entrenador, su taller, su cartera, sus planes y sus precios.
- La ley del color, la voz, las hojas, «hierro y tiza».

---

## 5. Cómo se sostiene en el modelo

Tres formas de darle la vuelta a §3.1, y una recomendación.

### A · «Equipo de uno»: la persona es entrenadora de sí misma

Se le crea una ficha con `coach_id = client_profile_id = auth.uid()`. Las
funciones `is_me()` e `is_my_client()` no se excluyen: las dos darían verdadero y
las políticas funcionarían tal cual. `domain/` no se toca. El plan se escribiría
por los caminos del entrenador.

Lo que falla: el rol sigue siendo binario y el árbol de rutas entero cuelga de él;
los tres `RAISE EXCEPTION` de la 0084 existen precisamente para impedir este
estado, y la propia migración lo lista como **anomalía a detectar**
(`WHERE c.coach_id = c.client_profile_id`, `0084:239`); la ficha contaría contra el
cupo de tres clientes gratis del propio equipo; y engancharse a un entrenador
después sería **traspasar la ficha entre equipos**, que `modelo-de-equipo.md` dejó
fuera a propósito. Es barato de empezar y caro de deshacer.

### B · «El cuaderno»: la ficha puede no tener entrenador

`clients.coach_id` y `team_id` pasan a admitir `NULL`. La persona es dueña por
`client_profile_id`. Engancharse es rellenar las dos columnas; desengancharse,
vaciarlas. Lo que hay que añadir: políticas de escritura sobre el plan y la dieta
**cuando `coach_id IS NULL`** (o dos RPC, `save_my_plan` y `set_my_targets`, con la
misma guarda), el protocolo de la casa por defecto, y que el trigger de límite de
clientes ignore las filas sin equipo.

Lo que cuesta: hay **24 migraciones** con políticas o funciones que asumen
`coach_id` con valor. Cada una hay que leerla. `supabase/tests/autorizacion.test.js`
y la radiografía (`rls|…` en `informes/estado.json`) son la red que ya existe para
no romper nada en silencio.

### C · B, y el rol deja de ser una columna — **recomendada**

B en el dato, más una cosa en la aplicación: **`viewMode` deja de salir de
`profiles.role` y sale de lo que la cuenta tiene**. Tienes cuaderno → el portal.
Tienes clientes → el panel. Tienes las dos cosas → el conmutador que ya existe como
`PreviewBar` (`src/App.jsx:408`), esta vez de verdad. Con eso, un entrenador puede
llevar su propio cuaderno —hoy no puede— y una persona por su cuenta puede
convertirse en entrenadora sin perder nada.

`profiles.role` no se borra: se deja de leer para elegir el árbol y se conserva como
lo que es, una etiqueta. Las cuentas que ya existen no cambian ni una fila: sus
fichas siguen con `coach_id`, su rol sigue diciendo lo que decía. Solo las filas
nuevas nacen sin entrenador.

**Por qué C y no A:** porque A construye el estado que la 0084 llama anomalía y
porque «engancharse» sería un traspaso entre equipos. **Por qué C y no solo B:**
porque con el rol binario, un entrenador con cuaderno propio seguiría sin poder
existir, y es el primer usuario por su cuenta que este producto va a tener: los
propios entrenadores.

### Lo que C toca, en una lista

| Pieza | Qué cambia |
|---|---|
| `clients` | `coach_id`, `team_id` a `NULL`; comprobación de que si uno es nulo el otro también |
| RLS | Escritura del plan y la dieta por el dueño **solo sin entrenador**; revisar las 24 migraciones que asumen `coach_id`; storage: el cliente **borra** sus fotos sin entrenador (hoy no puede, 0007) |
| RPC | `crear_mi_cuaderno()` (sin invitación), `engancharse(código)`, `desengancharse()`; `claim_client_invite` deja de convertir la cuenta cuando ya hay cuaderno |
| `AppContext` | `viewMode` derivado de lo que hay, no de `role`; carga del cuaderno propio |
| `domain/protocol.js` | `protocoloDeLaCasa()`: el valor por defecto cuando no hay entrenador |
| Límites | El trigger `enforce_client_limit` no cuenta filas sin equipo; la cuota de disco es por persona cuando no hay equipo |
| Privacidad | Consentimiento con dos textos: «nadie ve tus datos» / «tu entrenador X los ve»; **borrar sin pedirlo a nadie** |

---

## 6. Móvil: la PWA hoy, la tienda cuando haya producto

Tres opciones, y la decisión depende de en qué fase se esté.

| | PWA (hoy) | Envoltorio nativo (Capacitor) | App nativa nueva |
|---|---|---|---|
| Código | El que hay | El que hay, dentro de dos cáscaras (iOS, Android) | Otra interfaz, dos veces; `domain/` se reutilizaría porque es JS puro |
| Tienda | No | Sí | Sí |
| Avisos | Web Push; en iOS solo con la app instalada en el inicio | Push nativo | Push nativo |
| Salud (pasos, peso de la báscula) | No | Sí, con plugins de HealthKit y Health Connect | Sí |
| Coste | 0 | Una dependencia nueva, dos cuentas de desarrollador, revisión de Apple, mantenimiento de dos builds | Meses |
| Cuándo | Ahora y siempre: es la web | Cuando exista el modo por tu cuenta | Nunca, con lo que hay |

**Recomendación: PWA hasta que el modo por tu cuenta exista; Capacitor después,
como fase propia (§9, fase 5).** El motivo es de tienda y no de técnica: una app
en la App Store a la que **no se puede entrar sin que un entrenador te invite** es
una reseña de una estrella esperando a escribirse. Se publica cuando cualquiera
que la baje pueda usarla en el primer minuto.

Capacitor sería **la única dependencia nueva de todo este estudio**, y hay que
justificarla como pide `CLAUDE.md` §2: no hay nada en el proyecto que ponga una web
en una tienda ni que lea HealthKit; y la alternativa —reescribir— tira el portal
que se acaba de construir dos veces. Lo que **no** cambia con la cáscara: ni una
pantalla, ni una ruta, ni el service worker.

Dos cosas del móvil que este estudio deja apuntadas y no decide:

- **Los avisos.** El dueño los dejó fuera (`la-sesion-manda.md` §5). Para el cliente
  de un entrenador, el entrenador es el aviso. Para la persona sola, **el domingo
  nadie le dice que cierre la semana**. Es la única pieza de retención que una app
  por tu cuenta no puede no tener, y conviene reabrir la decisión cuando llegue la
  fase 3.
- **La báscula y los pasos.** Se pautan pasos y nadie los rellena. Con HealthKit y
  Health Connect entran solos, y el peso de una báscula conectada también. Es lo
  que MacroFactor hace con la dieta y lo que aquí haría que «Mi semana» se
  escribiera casi sola.

---

## 7. Negocio: dos puertas, dos precios, una regla

### 7.1 Lo que no cambia

La tarifa del entrenador (`monetizacion.md` §7.3) se queda como está, y con ella
su regla: **el cliente de un entrenador no paga, no ve planes y no nota en cuál
está su entrenador.** Nada de lo que sigue puede tocar eso.

### 7.2 La otra puerta

«Otro producto y no un plan de este», dice la §7.6. Este es el otro producto:

| | Por tu cuenta · Gratis | Por tu cuenta · Plus |
|---|---|---|
| El cuaderno entero: sesiones, peso, medidas, fotos, semana | Sí, **sin límite ni plazo** | Sí |
| Tu pauta: escribirla, partir de un programa, traer tu Excel | Sí | Sí |
| Tu objetivo de dieta con la calculadora | Sí | Sí |
| El menú cerrado con equivalencias | — | Sí |
| El progreso a fondo (las siete tarjetas del resumen, el histórico por ejercicio a dos carriles) | Lo último; el historial completo, no | Sí |
| Fotos: comparador y almacenamiento | Cuota corta | Cuota larga |
| Engancharte a un entrenador | **Siempre, en los dos** | |

Precio: el mercado de logbooks está en **3–5 €/mes** y el de dieta adaptativa en
**10–13 $/mes** (§2.1, sin comprobar). Este producto junta las dos cosas y añade lo
que ninguna tiene (la pauta al lado del registro, el entrenador enganchable).
Sitúo la conversación entre **4 y 7 €/mes, o 40–60 €/año**, y **no propongo una
cifra**: hay que comprobar cuatro precios y decidir con la portada delante. Es la
pregunta 6 de §8.

### 7.3 La regla que evita que las dos puertas se peleen

**Nada de lo que la persona escribió se cierra nunca.** Leer, exportar y borrar,
gratis y para siempre, en los dos modos. Es la regla que `monetizacion.md` §3.4 ya
tiene para el entrenador, extendida a la persona. Lo que Plus vende es lectura a
fondo y comodidad, no el acceso a lo tuyo.

Y la transición honesta: el cliente de un entrenador tiene todo lo de Plus porque
**su entrenador se lo da** (lo paga en su plan). Si se desengancha, pasa a Gratis, y
se le dice tal cual: «Tu entrenador te daba el progreso a fondo. Sigue tuyo todo lo
que apuntaste». No se le quita nada que escribiera él.

### 7.4 Lo que la segunda puerta le da a la primera

- **Un canal de entrada para entrenadores** que hoy no existe: la persona que
  lleva meses por su cuenta y quiere que alguien la lleve. «Busca entrenador» es una
  fase futura y **no entra en este estudio**; pero es la primera vez que la
  plataforma podría traerle clientes a un entrenador en vez de solo alojárselos.
- **Los entrenadores como primeros usuarios por su cuenta.** Todos entrenan. Hoy no
  pueden apuntar lo suyo en su propia app (§3.1). Con C de §5, sí, desde el
  primer día y sin abrir la puerta al público.
- **El miedo del entrenador**, dicho para poder contestarlo: «mis clientes se irán a
  por su cuenta». Ya pueden irse a Hevy hoy, y cuando lo hacen se llevan cero. Aquí
  se llevan su cuaderno **y una puerta para volver**.

### 7.5 Lo que cuesta y no es código

Soporte a personas sueltas (hoy el soporte es a entrenadores, `support_tickets`);
las comisiones de tienda si el pago pasa por ella (15–30 %) frente a Stripe en la
web; la revisión de Apple; la responsabilidad del tratamiento cuando no hay
entrenador (§4.2). Ninguno bloquea; todos hay que tenerlos en la cuenta antes de la
fase 6.

---

## 8. Lo que este estudio no decide: las preguntas del dueño

1. **¿Se abre la puerta pública, o solo se prepara el modelo?** *Recomiendo:* las
   fases 1 y 2 sin puerta —el modelo y el lápiz—, probadas por los propios
   entrenadores con su cuaderno. La puerta, en la fase 3, cuando se haya usado un
   ciclo de semanas de verdad. Es la misma prudencia que `producto.md` §7 aplicó a
   la fase 5.
2. **¿De dónde parte una persona sola: de la hoja en blanco, de su Excel, o de un
   catálogo de programas de la casa?** *Recomiendo:* los tres, y el catálogo
   **corto y firmado**: seis u ocho programas escritos por una persona con nombre,
   no generados. Así «la app no receta» se sostiene: quien receta es el autor del
   programa.
3. **¿La dieta por tu cuenta es objetivo y calculadora, o también menú cerrado?**
   *Recomiendo:* objetivo en Gratis, menú en Plus. Una persona sola vive del
   número.
4. **¿Se enmienda «la app no receta»?** La lectura de §4.3: la ley protege el
   criterio de quien lleva a alguien; sin nadie que lleve, la calculadora es una
   herramienta y no una receta; lo que sigue prohibido es proponer sin que se
   pida. *Recomiendo:* escribirla así en `README.md`, al lado de la ley original.
5. **¿Tiendas? ¿Cuándo?** *Recomiendo:* sí, con Capacitor, y solo cuando el modo
   por tu cuenta funcione en la web (fase 5).
6. **¿Precio de Plus?** No lo fijo. Comprobar Hevy Pro, Strong Pro, MacroFactor y
   Fitbod hoy, y decidir con la portada delante.
7. **¿Qué se lleva la persona al desengancharse?** *Recomiendo:* su cuaderno entero
   y la última pauta congelada con autor y fecha. Lo del negocio del entrenador se
   queda con él. Con revisión legal de la frontera.
8. **¿Qué es «Caveman» en una frase para alguien que no tiene entrenador?** No
   está escrito. Sin esa frase no hay portada de la segunda puerta ni ficha de
   tienda. Propongo la de §1 como punto de partida y no como respuesta.

---

## 9. Orden de trabajo

Con la regla de siempre: nada entra sin `npm run check` en verde, cada fase se
puede parar sin dejar la aplicación a medias, y **una tanda no puede dejar el
producto por debajo de donde estaba**. Las fases son independientes en el
sentido de que cada una vale por sí sola; el orden importa porque cada una es el
suelo de la siguiente.

| # | Fase | Qué incluye | Qué no toca | Cómo se sabe que está |
|---|---|---|---|---|
| 0 | **La voz** | La tanda 2 de `estudio-la-app-del-cliente.md`: las 70 cadenas donde el entrenador es el sujeto, revisadas una a una; el vacío dice el hecho, no a quién espera | Nada del modelo | `grep -i "tu entrenador" src/components/Client` baja a las que hablan de un entrenador **que existe** |
| 1 | **El cuaderno** | §5-C: `coach_id`/`team_id` a `NULL`, el rol derivado, el protocolo de la casa, las políticas nuevas, `crear_mi_cuaderno()`. Sin puerta pública: se entra desde la cuenta de entrenador (**su propio cuaderno**) | El portal, `domain/`, los planes | `test:db` con los casos «sin entrenador escribe su plan / con entrenador no»; la radiografía sin críticos nuevos; los entrenadores apuntando lo suyo |
| 2 | **El lápiz** | Mi pauta (partir de algo, cambiar una cosa, montar el siguiente) y Mi objetivo (la calculadora como herramienta), **en el portal**, con las piezas de `domain/blocks`, `routineSheet`, `nutrition` | La mesa del entrenador | Un entrenador monta su propio bloque desde el teléfono sin abrir el panel |
| 3 | **La puerta y la semana** | Alta libre en `/entrar` («Por tu cuenta»), el alta corta sin invitación, Mi semana (la lectura de `week.js` girada a la persona), el consentimiento con su segundo texto | — | Una persona ajena al proyecto se registra, apunta una sesión y cierra una semana sin ayuda |
| 4 | **Engancharse y desengancharse** | El enlace del entrenador que engancha en vez de convertir; «Tengo entrenador» desde Tú; archivar deja el cuaderno con la pauta congelada | — | Ida y vuelta completa con una cuenta real, sin perder una fila |
| 5 | **El aparato** | Capacitor, las dos tiendas, push (reabrir la decisión), HealthKit y Health Connect para pasos y peso | Ni una pantalla | La app en las dos tiendas; los pasos entran solos |
| 6 | **Cobrar** | Plus: el `plan_limits` de la persona, Stripe en la web, la pasarela de tienda si hace falta; la regla de §7.3 en la base, no en React | La tarifa del entrenador | Primer cobro a una persona sin entrenador |

Lo que hay que **medir** desde la fase 1, en la radiografía y no en una hoja aparte:
cuadernos sin entrenador, sesiones apuntadas sin entrenador, semanas cerradas
contigo mismo, retención a cuatro semanas, enganches (cuaderno → entrenador) y
desenganches. Con quince clientes de entrenador y dos de portal en agosto, la
primera cifra que importa es la más simple: **cuántos entrenadores apuntan lo
suyo** cuando la fase 1 se lo permita.

---

## 10. Riesgos, dichos antes de empezar

- **Dos públicos en una app se separan solos.** Cada pantalla que se construya
  «para el modo por tu cuenta» es una deriva. La guarda es la de §4.1: los mismos
  cuatro destinos, y lo único que cambia es quién escribe.
- **RLS es la única frontera y se va a ampliar.** Veinticuatro migraciones asumen
  un entrenador. La fase 1 es sobre todo leerlas. Un `NULL` que se cuele en una
  política de escritura es un cliente escribiendo el plan de otro.
- **La propuesta del entrenador se puede diluir.** «Tu entrenador te da la app» y
  «una app que te bajas» son dos frases, y la portada solo puede llevar una arriba.
  Hay que decidir cuál, y que la otra sea la segunda puerta.
- **Es una persona haciendo todo esto.** La fase 5 añade dos tiendas y dos builds;
  la 6, soporte a desconocidos. Ninguna de las dos se empieza sin que la 3 haya
  traído gente.
- **La tentación de la fase 7.** Marketplace de entrenadores, chat, feed, retos.
  Ninguno está aquí y ninguno entra por la puerta de atrás de «ya que estamos».

---

## 11. En una tabla, lo que este estudio pide y lo que deja

| Pide | Deja |
|---|---|
| Que la ficha sea el cuaderno de la persona y pueda no tener entrenador | Los planes y precios del entrenador |
| Que el rol salga de lo que la cuenta tiene, no de una columna | `profiles.role` como etiqueta |
| El lápiz en el portal: pauta y objetivo | La mesa del entrenador |
| La semana que se cierra contigo | La semana que se entrega al entrenador |
| Una segunda puerta con su Gratis y su Plus | La regla «el cliente del entrenador no paga ni ve planes» |
| La tienda, cuando se pueda entrar sin invitación | La PWA, que es la app |
| Una frase de marca | «Hierro y tiza», la voz, las leyes de la casa |
