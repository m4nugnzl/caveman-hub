# La sesión manda — el portal del cliente, construido

**Encargo** (15 sep 2026): rediseñar el HUB del cliente en el teléfono y en el
escritorio sobre el prototipo aprobado, con la excepción del dueño (§4).

Prototipo: https://claude.ai/artifact/LcoR6hjnuwG5bjhPSXdDTh

Dos decisiones del dueño antes de construir:

- **Es todo del cliente.** «El hub del entrenador» del encargo era un lapsus.
- **El escritorio, tal cual el prototipo**, aunque choque con dos decisiones
  anteriores: la cinta de arriba del PC (14 sep) y que entrenando se quite la
  navegación.

---

## 0. De dónde se parte

El plan se escribió en la rama `claude/sharp-fermi-ig7fum` sobre
`Client/ClientRoutine.jsx`, que en `master` está borrado: el portal se rehízo en
`Client/movil/` y `Client/pc/`. No se trajo nada de la rama. Se construyó sobre
`master`, y dos cosas del terreno pesaron:

- **La fontanería del modo entreno existía y nadie la llamaba**:
  `empezarDescanso`, `pararDescanso` e `irAEjercicio`, en
  `context/SesionEnCurso`, desde la tanda 2 del móvil (11 sep).
- **El cierre de la sesión se había perdido.** El portal de antes preguntaba
  `SessionFeedback` en un modal al terminar; la reconstrucción del 14 sep dejó
  el componente sin montar en el cliente. El protocolo pedía las preguntas y
  nadie las hacía.

## 1. La tesis

El cliente no entra a consultar cinco secciones: entra a hacer una sesión y a
saber si va bien. El portal tiene tres estados y los tres tienen ahora su
pantalla:

| | Qué contesta | Dónde |
|---|---|---|
| Antes de entrenar | ¿qué me toca ahora? | la portada del teléfono |
| Entrenando | ¿dónde iba y qué apunto? | el modo entreno, el descanso y el cierre |
| Repasando | ¿cómo voy? | el puesto del escritorio |

## 2. Lo construido

### Teléfono · 1 · La portada (`movil/PantallaHoy`, datos en `ClientStart`)

- **El héroe del gesto del día**, nunca vacío: «Empezar sesión» (directo a
  `/mi/rutina/sesion`, no a la lista de días), «Seguir la sesión» si la dejó a
  medias, «Pésate y sube tus fotos» en descanso con la semana por entregar, o
  «Descansas». Debajo, «La última vez: 4.640 kg en 52 min», de la última sesión
  cerrada de ese día.
- **La tira de la semana** (`hoy.tiraDeLaSemana`): hecho, hoy, lo que toca y los
  descansos del reparto. Se calla con ciclo rotativo o sin reparto, igual que
  `sesionDeHoy`.
- **«Tu entrenador te ha contestado»**, con la primera línea de su respuesta.
- **Mi progreso**: el peso con su cambio, «desde mayo» (el mes del primer
  pesaje; «desde el inicio» partía la tarjeta en dos líneas) y por dónde va del
  bloque. Debajo, «Esta semana: 2 de 3 pesajes · tus fotos, pendientes».
- Se quedan el registro (sesiones · kg · semanas), «De tu entrenador» y «Te han
  pedido». Sale la lista de tres ejercicios de la tarjeta: el héroe ya lleva a
  la sesión y el carril de dentro los nombra todos.

### Teléfono · 2 · El modo entreno (`movil/PantallaSesion`)

- **Moverse**: el carril de ejercicios con su nombre (✓ los terminados, el tuyo
  encendido), deslizar el cuerpo cambia de ejercicio, y el pie tiene
  «Siguiente ›». Cada ejercicio recuerda qué serie tenía abierta.
- **Rellenar**: la serie viva alzada, con − y + por campo y el número en medio,
  que sigue siendo un campo. El primer toque en vacío pone lo de la vez anterior
  en esa serie (`sesion.pasoDelCampo`). «= Igual» y «Hecha».
- **Corregir**: una serie hecha es un botón con sus valores y «corregir»; al
  tocarla se reabre igual que estaba y su botón dice «Listo». Reabrir para
  corregir no arranca otro descanso.
- **Todo hecho**: «Hecho · Remo con barra · Ir ›», una puerta que se pulsa. La
  pantalla nunca salta sola al siguiente.
- **El pie**: lo guardado (con «Sin conexión · se enviará» y «Reintentar»), la
  cuenta de series y «Siguiente ›» o «Terminar ›».
- **RIR** solo con el módulo encendido; `previousSetsBefore` guarda ahora el RIR
  de la vez anterior.

### Teléfono · 3 · El descanso (`movil/Descanso`)

Solo con pauta (§4). Toma la pantalla: el anillo de brasa que se vacía, «Descanso
· pautado 1:30», **Después** (la serie que toca, su objetivo y la última vez),
«+30 s» (`sumarDescanso`, nuevo en el contexto), «Saltar» y **«Volver a la
hoja»**, que la tapa sin pararla para corregir algo con la cuenta corriendo; la
cifra se queda en la cabecera y se toca para volver.

Arranca al pulsar «Hecha» o «= Igual». En el monitor, que no tiene «Hecha»,
arranca cuando las repeticiones de una serie pasan a tener algo.

### Teléfono y monitor · 4 · El cierre (`CierreDeLaSesion`)

«Terminar» ya no cierra en seco: abre el cierre, si hay algo apuntado. Tonelaje
(o las series, si no hay carga), series · minutos · récords, un récord por
ejercicio con lo que mejoró (`sesion.recordsDeLaSesion`), **las preguntas del
protocolo** (`SessionFeedback`, que vuelve a preguntarse), la nota de la sesión
si el módulo está, «Terminar la sesión» y lo hecho por ejercicio. Se puede volver
a la sesión.

### Escritorio · El carril (`pc/CarrilDelPortal`) y el puesto (`pc/PantallaSesion`)

- **El carril sustituye a la cinta en todo el portal del PC.** Tu nombre y lo que
  te lleva tu entrenador, las secciones con `.side-link` (la misma pieza que la
  barra del entrenador), lo que te espera contado en «Mi inicio», y abajo
  «Dónde estás» (bloque, semana x de y y su riel) y «Esta semana». Se queda
  también entrenando, como en el prototipo. `CintaDelPortal` se borró.
- **El puesto**: la sesión en el centro con la tabla SERIE · OBJ · KG · REPS ·
  (RIR) · LA ÚLTIMA VEZ (que se pulsa para copiarla), y a la derecha **«Contra
  qué te mides»** del ejercicio en el que tienes el foco: sus cuatro últimas
  veces serie a serie con la más fuerte marcada, su tonelaje en una línea y
  «Cómo lo llevas» con las escalas de la última sesión que las tenga.
  (`sesion.contraQueTeMides`). Por debajo de 1.200 px el costado baja.

### Piezas compartidas

- `Client/sesion.js` — las cuentas: el paso del −/+, la serie que toca, los
  récords, lo hecho por ejercicio y contra qué te mides. Con sus pruebas.
- `Client/useDondeEstas.js` — bloque, semana y entrega, que calculaba
  `ClientStart` y ahora comparte con el carril.

## 3. En qué se aparta del prototipo, y por qué

- **Sin reloj de sesión** (el «12:04» de la cabecera). Lo retiró el dueño el 11
  sep —«es un poco estresante»—; la duración se dice en el cierre. En su sitio
  va «Terminar», que es la salida.
- **Sin descanso «sin pauta»** (§4).
- **«Terminar la sesión» y no «Mandar a tu entrenador».** Todo se guarda según
  se escribe; al pulsar no viaja nada, se cierra la sesión.
- **El cambio de peso no se pinta en verde.** En el prototipo «▼0,4» iba en
  verde; bajar no es bueno para quien gana masa, y el verde es del semáforo.
- **La barra del pulgar no cambia**: el prototipo dibujaba la de hace dos
  semanas; manda la de ahora (Hoy · Entreno · Comer · Tú).

## 4. La excepción del dueño

> «Un sistema cómodo de pasar de un ejercicio a otro, moverse e interactuar para
> rellenar, que incluso si te confundes puedas darle otra vez y corregir. El
> tema del temporizador […] depende de si los entrenadores pautan o no
> descanso.»

**Moverse y corregir es lo primero**: el carril con nombres, deslizar, el pie,
las series cerradas que se reabren y la pantalla que no salta sola.

**Sin pauta, el temporizador no aparece.** Confirmado al preguntarle con las dos
lecturas delante. Un número corriendo en la pantalla del gimnasio se lee como
que hay que volver a la barra, y esa instrucción no la ha dado nadie. La regla
vive en un solo sitio, la guarda de `empezarDescanso`. Consecuencia: el dueño no
pauta descansos, así que en sus clientes el descanso no se ve.

## 5. Lo que no entra

- **Los avisos push** (fuera por decisión del dueño): service worker, tabla de
  suscripciones con RLS, función de envío y claves VAPID que solo puede generar
  él.
- **Rediseñar las demás pantallas del PC para el carril.** «Hoy», «Mi dieta»,
  «Mi rutina», «Revisión», «Progreso» y «Tú» se montan al lado del carril sin
  cambios; se miró el puesto, no cada una de ellas con datos reales.
- **La fontanería que sigue suelta**: `irAEjercicio`, `objetivo`,
  `objetivoAtendido`, `pedirRemate` y `cerrarRemate` no los usa nadie.

## 6. Estado

**Construido el 15 sep en `master`, sin commitear**, sobre un árbol que ya traía
mucho sin commitear. Casi todos los ficheros tocados estaban sin seguimiento,
así que `git diff` no los enseña.

Validación: `lint` y `types` limpios; `verify` sin fallos; `vite build` pasa;
**2.718 pruebas pasan** (34 nuevas: `sesion.test.js` y
`movil/PantallaSesion.test.jsx`). Las cinco escenas —portada, modo entreno,
descanso, cierre y puesto— se miraron renderizadas con el CSS real en las dos
pieles, con un arnés de `vite-node` + Vite + Edge que se borró.

Tres avisos:

- **Fallan 2 pruebas ajenas**, `foodEquivCatalogo` (el catálogo de
  equivalencias), igual que antes de empezar.
- **`npm run build` entero no se ha corrido**: su `prerender` pide Supabase.
- **Otra sesión escribía a la vez en el mismo árbol** (`RepartoComparado`,
  `NutritionModule`, `IntakeQuestions`). No se tocó nada suyo.
